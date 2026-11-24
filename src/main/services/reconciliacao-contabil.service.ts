/**
 * @file reconciliacao-contabil.service.ts
 * @description Reconciliação de contas bancárias com a contabilidade.
 *
 * A reconciliação liga linhas de lançamento (`LinhaLancamentoContabil`) a
 * movimentos de tesouraria (`MovimentoTesouraria`) da mesma conta bancária.
 * O saldo contabilístico de uma conta com `contaContabilId` deve igualar o
 * saldo do extrato (soma dos movimentos confirmados) ± itens em trânsito.
 *
 * Regras:
 *  - Só contas bancárias com `contaContabilId` podem ser reconciliadas.
 *  - Um movimento de tesouraria só pode ser ligado a uma linha de lançamento.
 *  - A conciliação/desconciliação é atómica e audita a operação.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError, NotFoundError, ValidationError } from '../utils/errors';

export interface LinhaContabilParaReconciliar {
  id: string;
  lancamentoId: string;
  numeroLinha: number;
  contaId: string;
  contaCodigo: string;
  contaDesignacao: string;
  debito: string;
  credito: string;
  dataContabilistica: Date | string;
  descricao?: string | null;
  conciliadoEm?: Date | string | null;
  movimentoTesourariaId?: string | null;
  lancamentoNumero?: number | null;
  lancamentoDescricao: string;
}

export interface MovimentoTesourariaParaReconciliar {
  id: string;
  numero: string;
  data: Date | string;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  valor: string;
  descricao?: string | null;
  conciliado: boolean;
  dataConciliacao?: Date | string | null;
  observacaoExtrato?: string | null;
  contaBancariaId: string;
  contaBancariaCodigo: string;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
}

export interface SugestaoReconciliacao {
  linha: LinhaContabilParaReconciliar;
  movimento: MovimentoTesourariaParaReconciliar;
  diferencaDias: number;
  valorExato: boolean;
}

export interface ResumoReconciliacao {
  contaBancaria: {
    id: string;
    codigo: string;
    designacao: string;
    saldoAtual: string;
  };
  contaContabil: {
    id: string;
    codigo: string;
    designacao: string;
    saldoContabilistico: string;
  };
  itensEmTransito: {
    soNoExtrato: MovimentoTesourariaParaReconciliar[];
    soNaContabilidade: LinhaContabilParaReconciliar[];
  };
  diferenca: string; // saldoContabilistico - saldoExtrato
}

export class ReconciliacaoContabilService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ─── Leitura ──────────────────────────────────────────────────────────────

  /**
   * Lista todas as contas bancárias activas da empresa.
   *
   * Contas sem `contaContabilId` também são devolvidas para que apareçam no
   * seleccionador; o resumo recusa essas contas com uma regra de negócio clara.
   */
  async listarContasBancariasParaReconciliar(empresaId: string) {
    if (!empresaId?.trim()) throw new ValidationError('A empresa é obrigatória.');

    return this.prisma.contaBancaria.findMany({
      where: { empresaId, ativo: true },
      select: {
        id: true,
        codigo: true,
        designacao: true,
        tipo: true,
        saldoAtual: true,
        contaContabilId: true,
        contaContabil: {
          select: { id: true, codigo: true, designacao: true, natureza: true },
        },
      },
      orderBy: { codigo: 'asc' },
    });
  }

  /**
   * Obtém o resumo de reconciliação para uma conta bancária.
   */
  async obterResumo(contaBancariaId: string, empresaId: string): Promise<ResumoReconciliacao> {
    const contaBancaria = await this.prisma.contaBancaria.findFirst({
      where: { id: contaBancariaId, empresaId },
      select: {
        id: true,
        codigo: true,
        designacao: true,
        saldoAtual: true,
        contaContabilId: true,
        contaContabil: {
          select: { id: true, codigo: true, designacao: true, natureza: true },
        },
      },
    });
    if (!contaBancaria) throw new NotFoundError('Conta bancária não encontrada.');
    if (!contaBancaria.contaContabilId) {
      throw new BusinessRuleError('Esta conta bancária não tem conta contabilística associada.');
    }

    // Saldo contabilístico = soma das linhas da conta contabilística (validados)
    const linhasAgregadas = await this.prisma.linhaLancamentoContabil.aggregate({
      where: {
        contaId: contaBancaria.contaContabilId,
        lancamento: { estado: 'validado' },
      },
      _sum: { debito: true, credito: true },
    });

    const natureza = contaBancaria.contaContabil?.natureza ?? 'devedora';
    const totalDebito = new Prisma.Decimal(linhasAgregadas._sum.debito ?? 0);
    const totalCredito = new Prisma.Decimal(linhasAgregadas._sum.credito ?? 0);
    const saldoContabilistico = natureza === 'devedora'
      ? totalDebito.minus(totalCredito)
      : totalCredito.minus(totalDebito);

    // Movimentos só no extrato (não conciliados, confirmados)
    const soNoExtrato = await this.prisma.movimentoTesouraria.findMany({
      where: {
        OR: [
          { contaOrigemId: contaBancariaId },
          { contaDestinoId: contaBancariaId },
        ],
        conciliado: false,
        estado: 'confirmado',
      },
      select: {
        id: true, numero: true, data: true, tipo: true, valor: true,
        descricao: true, conciliado: true, dataConciliacao: true,
        observacaoExtrato: true, contaOrigemId: true, contaDestinoId: true,
        entidadeTipo: true, entidadeId: true,
      },
      orderBy: { data: 'asc' },
    });

    // Linhas só na contabilidade (não ligadas a movimento)
    const soNaContabilidade = await this.prisma.linhaLancamentoContabil.findMany({
      where: {
        contaId: contaBancaria.contaContabilId,
        movimentoTesourariaId: null,
        lancamento: { estado: 'validado' },
      },
      include: {
        lancamento: { select: { id: true, numero: true, dataContabilistica: true, descricao: true } },
        conta: { select: { id: true, codigo: true, designacao: true } },
      },
      orderBy: { lancamento: { dataContabilistica: 'asc' } },
    });

    const extratoFormatado = soNoExtrato.map((m) => this.formatarMovimento(m, contaBancariaId));
    const contabilidadeFormatada = soNaContabilidade.map((l) => this.formatarLinha(l));

    const saldoExtrato = new Prisma.Decimal(contaBancaria.saldoAtual.toString());
    const diferenca = saldoContabilistico.minus(saldoExtrato);

    return {
      contaBancaria: {
        id: contaBancaria.id,
        codigo: contaBancaria.codigo,
        designacao: contaBancaria.designacao,
        saldoAtual: saldoExtrato.toFixed(4),
      },
      contaContabil: {
        id: contaBancaria.contaContabil!.id,
        codigo: contaBancaria.contaContabil!.codigo,
        designacao: contaBancaria.contaContabil!.designacao,
        saldoContabilistico: saldoContabilistico.toFixed(4),
      },
      itensEmTransito: {
        soNoExtrato: extratoFormatado,
        soNaContabilidade: contabilidadeFormatada,
      },
      diferenca: diferenca.toFixed(4),
    };
  }

  /**
   * Sugere pares (linha, movimento) por valor e data (± dias).
   */
  async sugerirPares(
    contaBancariaId: string,
    empresaId: string,
    opcoes: { janelaDias?: number } = {}
  ): Promise<SugestaoReconciliacao[]> {
    const { janelaDias = 5 } = opcoes;

    const resumo = await this.obterResumo(contaBancariaId, empresaId);

    const sugestoes: SugestaoReconciliacao[] = [];

    for (const linha of resumo.itensEmTransito.soNaContabilidade) {
      const dataLinha = new Date(linha.dataContabilistica);
      const valorLinha = Number(linha.debito) > 0 ? Number(linha.debito) : Number(linha.credito);

      for (const movimento of resumo.itensEmTransito.soNoExtrato) {
        const dataMov = new Date(movimento.data);
        const valorMov = Number(movimento.valor);
        const diferencaDias = Math.abs(
          Math.round((dataLinha.getTime() - dataMov.getTime()) / (1000 * 60 * 60 * 24))
        );

        if (diferencaDias <= janelaDias && Math.abs(valorLinha - valorMov) < 0.005) {
          sugestoes.push({
            linha,
            movimento,
            diferencaDias,
            valorExato: Math.abs(valorLinha - valorMov) < 0.0005,
          });
        }
      }
    }

    // Ordenar: valor exato primeiro, depois menor diferença de dias
    return sugestoes.sort((a, b) => {
      if (a.valorExato !== b.valorExato) return b.valorExato ? -1 : 1;
      return a.diferencaDias - b.diferencaDias;
    });
  }

  // ─── Escrita ──────────────────────────────────────────────────────────────

  /**
   * Concilia um conjunto de pares (linhaId, movimentoId).
   * Cria/atualiza a ligação bidireccional e actualiza `conciliadoEm`/`dataConciliacao`.
   */
  async conciliar(
    pares: Array<{ linhaId: string; movimentoId: string }>,
    utilizadorId: string,
    empresaId: string
  ): Promise<{ conciliados: number }> {
    if (!pares.length) throw new ValidationError('Nenhum par para conciliar.');

    return this.prisma.$transaction(async (tx) => {
      let conciliados = 0;

      for (const { linhaId, movimentoId } of pares) {
        const linha = await tx.linhaLancamentoContabil.findUnique({
          where: { id: linhaId },
          include: {
            lancamento: { select: { empresaId: true } },
            conta: { select: { id: true } },
          },
        });
        if (!linha) throw new NotFoundError(`Linha de lançamento ${linhaId} não encontrada.`);
        if (linha.lancamento.empresaId !== empresaId) {
          throw new BusinessRuleError('A linha não pertence à empresa.');
        }
        if (linha.movimentoTesourariaId) {
          throw new BusinessRuleError(`A linha ${linhaId} já está conciliada.`);
        }

        const movimento = await tx.movimentoTesouraria.findUnique({
          where: { id: movimentoId },
          select: { id: true, empresaId: true, conciliado: true, contaOrigemId: true, contaDestinoId: true, numero: true },
        });
        if (!movimento) throw new NotFoundError(`Movimento ${movimentoId} não encontrado.`);
        if (movimento.empresaId !== empresaId) {
          throw new BusinessRuleError('O movimento não pertence à empresa.');
        }
        if (movimento.conciliado) {
          throw new BusinessRuleError(`O movimento ${movimentoId} já está conciliado.`);
        }

        // Verificar que a conta bancária do movimento corresponde à conta contabilística da linha
        const contaBancaria = await tx.contaBancaria.findFirst({
          where: {
            OR: [
              ...(movimento.contaOrigemId ? [{ id: movimento.contaOrigemId }] : []),
              ...(movimento.contaDestinoId ? [{ id: movimento.contaDestinoId }] : []),
            ],
            contaContabilId: linha.contaId,
          },
          select: { id: true },
        });
        if (!contaBancaria) {
          throw new BusinessRuleError(
            'O movimento não pertence à conta bancária ligada à conta contabilística da linha.'
          );
        }

        const agora = new Date();

        await tx.linhaLancamentoContabil.update({
          where: { id: linhaId },
          data: { movimentoTesourariaId: movimentoId, conciliadoEm: agora },
        });

        await tx.movimentoTesouraria.update({
          where: { id: movimentoId },
          data: { conciliado: true, dataConciliacao: agora },
        });

        await tx.auditLog.create({
          data: {
            empresaId,
            utilizadorId,
            acao: 'conciliar',
            severidade: 'info',
            entidade: 'LinhaLancamentoContabil',
            entidadeId: linhaId,
            modulo: 'contabilidade',
            descricao: `Linha ${linha.numeroLinha} conciliada com movimento ${movimento.numero}.`,
            dadosNovos: JSON.stringify({ movimentoTesourariaId: movimentoId }),
          },
        });

        conciliados++;
      }

      return { conciliados };
    });
  }

  /**
   * Desconcilia um conjunto de linhas (remove a ligação).
   */
  async desconciliar(linhaIds: string[], utilizadorId: string, empresaId: string): Promise<{ desconciliados: number }> {
    if (!linhaIds.length) throw new ValidationError('Nenhuma linha para desconciliar.');

    return this.prisma.$transaction(async (tx) => {
      let desconciliados = 0;

      for (const linhaId of linhaIds) {
        const linha = await tx.linhaLancamentoContabil.findUnique({
          where: { id: linhaId },
          include: {
            lancamento: { select: { empresaId: true } },
          },
        });
        if (!linha) throw new NotFoundError(`Linha ${linhaId} não encontrada.`);
        if (linha.lancamento.empresaId !== empresaId) {
          throw new BusinessRuleError('A linha não pertence à empresa.');
        }
        if (!linha.movimentoTesourariaId) continue; // já não está conciliada

        const movimentoId = linha.movimentoTesourariaId;

        await tx.linhaLancamentoContabil.update({
          where: { id: linhaId },
          data: { movimentoTesourariaId: null, conciliadoEm: null },
        });

        await tx.movimentoTesouraria.update({
          where: { id: movimentoId },
          data: { conciliado: false, dataConciliacao: null },
        });

        await tx.auditLog.create({
          data: {
            empresaId,
            utilizadorId,
            acao: 'desconciliar',
            severidade: 'aviso',
            entidade: 'LinhaLancamentoContabil',
            entidadeId: linhaId,
            modulo: 'contabilidade',
            descricao: `Linha ${linha.numeroLinha} desconciliada do movimento ${movimentoId}.`,
            dadosAnteriores: JSON.stringify({ movimentoTesourariaId: movimentoId }),
          },
        });

        desconciliados++;
      }

      return { desconciliados };
    });
  }

  /**
   * Gera um lançamento contabilístico a partir de um movimento sem correspondência
   * (ex.: comissões bancárias, juros). Usa a regra de mapeamento `BANK_FEE` ou similar.
   */
  async gerarLancamentoDeMovimento(
    movimentoId: string,
    contaContabilId: string,
    utilizadorId: string,
    empresaId: string
  ): Promise<{ lancamentoId: string }> {
    const movimento = await this.prisma.movimentoTesouraria.findFirst({
      where: { id: movimentoId, empresaId },
      select: {
        id: true, numero: true, data: true, tipo: true, valor: true,
        descricao: true, contaOrigemId: true, contaDestinoId: true, conciliado: true,
      },
    });
    if (!movimento) throw new NotFoundError('Movimento não encontrado.');
    if (movimento.conciliado) throw new BusinessRuleError('O movimento já está conciliado.');

    const contaContabil = await this.prisma.contaContabil.findFirst({
      where: { id: contaContabilId, empresaId },
      select: { id: true, codigo: true, aceitaMovimento: true },
    });
    if (!contaContabil) throw new NotFoundError('Conta contabilística não encontrada.');
    if (!contaContabil.aceitaMovimento) {
      throw new BusinessRuleError('A conta contabilística não aceita movimento.');
    }

    // Verificar que a conta pertence à mesma conta bancária
    const contaBancaria = await this.prisma.contaBancaria.findFirst({
      where: {
        OR: [
          ...(movimento.contaOrigemId ? [{ id: movimento.contaOrigemId }] : []),
          ...(movimento.contaDestinoId ? [{ id: movimento.contaDestinoId }] : []),
        ],
        contaContabilId: contaContabil.id,
      },
      select: { id: true, codigo: true },
    });
    if (!contaBancaria) {
      throw new BusinessRuleError('O movimento não pertence à conta bancária desta conta contabilística.');
    }

    const periodo = await this.prisma.periodoContabil.findFirst({
      where: {
        dataInicio: { lte: movimento.data },
        dataFim: { gte: movimento.data },
        exercicio: { empresaId },
      },
      select: { id: true, exercicioId: true, estado: true, numero: true },
      orderBy: { dataInicio: 'desc' },
    });
    if (!periodo) throw new BusinessRuleError('Não existe período aberto para a data do movimento.');
    if (periodo.estado !== 'aberto') {
      throw new BusinessRuleError(`O período ${periodo.numero} está ${periodo.estado}.`);
    }

    const exercicio = await this.prisma.exercicioFiscal.findUnique({
      where: { id: periodo.exercicioId },
      select: { estado: true, ano: true },
    });
    if (!exercicio || exercicio.estado !== 'aberto') {
      throw new BusinessRuleError('O exercício não está aberto.');
    }

    const diario = await this.prisma.diarioContabil.findFirst({
      where: { empresaId, tipo: 'ajustamento', activo: true },
      select: { id: true, codigo: true },
    });
    if (!diario) throw new BusinessRuleError('Não existe diário de ajustamento activo.');

    const contrapartida = await this.resolverContrapartidaBanco(movimento, empresaId);

    const lancamento = await this.prisma.lancamentoContabil.create({
      data: {
        empresaId,
        diarioId: diario.id,
        exercicioId: periodo.exercicioId,
        periodoId: periodo.id,
        dataContabilistica: movimento.data,
        dataDocumento: movimento.data,
        descricao: movimento.descricao || `Lançamento automático de ${movimento.tipo} - ${movimento.numero}`,
        origem: 'integracao',
        moduloOrigem: 'tesouraria',
        tipoOrigem: 'movimento',
        origemId: movimento.id,
        criadoPorId: utilizadorId,
        totalDebito: movimento.tipo === 'saida' || movimento.tipo === 'ajuste' ? new Prisma.Decimal(movimento.valor) : new Prisma.Decimal(0),
        totalCredito: movimento.tipo === 'entrada' || movimento.tipo === 'ajuste' ? new Prisma.Decimal(movimento.valor) : new Prisma.Decimal(0),
        linhas: {
          create: [
            {
              numeroLinha: 1,
              contaId: contaContabil.id,
              debito: movimento.tipo === 'saida' || movimento.tipo === 'ajuste' ? new Prisma.Decimal(movimento.valor) : new Prisma.Decimal(0),
              credito: movimento.tipo === 'entrada' || movimento.tipo === 'ajuste' ? new Prisma.Decimal(movimento.valor) : new Prisma.Decimal(0),
              descricao: movimento.descricao,
            },
            {
              numeroLinha: 2,
              contaId: contrapartida.id,
              debito: movimento.tipo === 'entrada' || movimento.tipo === 'ajuste' ? new Prisma.Decimal(movimento.valor) : new Prisma.Decimal(0),
              credito: movimento.tipo === 'saida' || movimento.tipo === 'ajuste' ? new Prisma.Decimal(movimento.valor) : new Prisma.Decimal(0),
              descricao: movimento.descricao,
            },
          ],
        },
      },
      select: { id: true },
    });

    // Validar o lançamento criado
    await this.validarLancamentoCriado(lancamento.id, utilizadorId);

    // Conciliar o movimento com a linha criada
    await this.prisma.movimentoTesouraria.update({
      where: { id: movimentoId },
      data: { conciliado: true, dataConciliacao: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        empresaId,
        utilizadorId,
        acao: 'criar',
        severidade: 'info',
        entidade: 'LancamentoContabil',
        entidadeId: lancamento.id,
        modulo: 'contabilidade',
        descricao: `Lançamento automático criado do movimento ${movimento.numero}.`,
        dadosNovos: JSON.stringify({ movimentoId, tipo: movimento.tipo, valor: movimento.valor }),
      },
    });

    return { lancamentoId: lancamento.id };
  }

  // ─── Interno ──────────────────────────────────────────────────────────────

  private formatarMovimento(
    m: any,
    contaBancariaId: string
  ): MovimentoTesourariaParaReconciliar {
    return {
      id: m.id,
      numero: m.numero,
      data: m.data,
      tipo: m.tipo,
      valor: m.valor.toFixed(4),
      descricao: m.descricao,
      conciliado: m.conciliado,
      dataConciliacao: m.dataConciliacao,
      observacaoExtrato: m.observacaoExtrato,
      contaBancariaId,
      contaBancariaCodigo: '',
      entidadeTipo: m.entidadeTipo,
      entidadeId: m.entidadeId,
    };
  }

  private formatarLinha(l: any): LinhaContabilParaReconciliar {
    return {
      id: l.id,
      lancamentoId: l.lancamentoId,
      numeroLinha: l.numeroLinha,
      contaId: l.contaId,
      contaCodigo: l.conta.codigo,
      contaDesignacao: l.conta.designacao,
      debito: l.debito.toFixed(4),
      credito: l.credito.toFixed(4),
      dataContabilistica: l.lancamento.dataContabilistica,
      descricao: l.descricao,
      conciliadoEm: l.conciliadoEm,
      movimentoTesourariaId: l.movimentoTesourariaId,
      lancamentoNumero: l.lancamento.numero,
      lancamentoDescricao: l.lancamento.descricao,
    };
  }

  private async resolverContrapartidaBanco(
    movimento: { tipo: string; contaOrigemId?: string | null; contaDestinoId?: string | null },
    empresaId: string
  ): Promise<{ id: string }> {
    // Para movimentos de entrada/saida/ajuste numa conta bancária, a contrapartida
    // é a conta contabilística da *outra* conta bancária envolvida (se transferência)
    // ou uma conta de custos/proveitos (se comissão/juros).
    // Aqui simplificamos: se for transferência, usa a outra conta; senão usa
    // uma conta de "Comissões bancárias" (chave mapeada) ou cria/usa conta 622.
    if (movimento.tipo === 'transferencia' && movimento.contaOrigemId && movimento.contaDestinoId) {
      const outraContaId = movimento.contaOrigemId; // a contrapartida é a origem
      const conta = await this.prisma.contaBancaria.findUnique({
        where: { id: outraContaId },
        select: { contaContabilId: true },
      });
      if (conta?.contaContabilId) return { id: conta.contaContabilId };
    }

    // Fallback: procura mapeamento BANK_FEE ou cria/usa conta 622/722
    const mapeamento = await this.prisma.mapeamentoConta.findFirst({
      where: { empresaId, chave: 'BANK_FEE' },
      select: { contaId: true },
    });
    if (mapeamento) return { id: mapeamento.contaId };

    // Procura conta 622 (Serviços bancários) ou 722 (Juros e rendimentos similares)
    const codigoFallback = movimento.tipo === 'entrada' ? '722' : '622';
    const contaFallback = await this.prisma.contaContabil.findFirst({
      where: { empresaId, codigo: { startsWith: codigoFallback }, aceitaMovimento: true },
      select: { id: true },
    });
    if (contaFallback) return { id: contaFallback.id };

    throw new BusinessRuleError(
      'Não foi possível resolver a conta de contrapartida. Configure o mapeamento BANK_FEE ou a conta 622/722.'
    );
  }

  private async validarLancamentoCriado(lancamentoId: string, utilizadorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const lancamento = await tx.lancamentoContabil.findUnique({
        where: { id: lancamentoId },
        include: {
          linhas: { include: { conta: true } },
          periodo: true,
          exercicio: true,
          diario: true,
        },
      });
      if (!lancamento) throw new NotFoundError('Lançamento não encontrado.');

      if (lancamento.periodo.estado !== 'aberto' || lancamento.exercicio.estado !== 'aberto') {
        throw new BusinessRuleError('Período ou exercício não aberto.');
      }

      let totalDebito = new Prisma.Decimal(0);
      let totalCredito = new Prisma.Decimal(0);
      for (const linha of lancamento.linhas) {
        if (!linha.conta.activa || !linha.conta.aceitaMovimento) {
          throw new BusinessRuleError(`Conta ${linha.conta.codigo} não aceita movimento.`);
        }
        totalDebito = totalDebito.plus(linha.debito);
        totalCredito = totalCredito.plus(linha.credito);
      }

      if (!totalDebito.equals(totalCredito) || totalDebito.isZero()) {
        throw new BusinessRuleError('Lançamento gerado não está equilibrado.');
      }

      const { sequenciaDiarioService } = await import('./sequencia-diario.service');
      const numero = await sequenciaDiarioService.proximoNumero(
        lancamento.diarioId,
        lancamento.exercicioId,
        tx
      );

      await tx.lancamentoContabil.update({
        where: { id: lancamentoId },
        data: {
          numero,
          estado: 'validado',
          validadoPorId: utilizadorId,
          validadoEm: new Date(),
          totalDebito,
          totalCredito,
        },
      });

      await tx.auditLog.create({
        data: {
          empresaId: lancamento.empresaId,
          utilizadorId,
          acao: 'validar',
          severidade: 'info',
          entidade: 'LancamentoContabil',
          entidadeId: lancamentoId,
          modulo: 'contabilidade',
          descricao: `Lançamento automático ${numero} validado.`,
          dadosNovos: JSON.stringify({ estado: 'validado', numero }),
        },
      });
    });
  }
}

export const reconciliacaoContabilService = new ReconciliacaoContabilService();