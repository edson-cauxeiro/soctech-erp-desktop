/**
 * @file rh-pagamentos.service.ts
 * @description Serviço de ordens de pagamento e gestão de pagamentos (RH-504).
 *
 * Funcionalidades:
 * - Criar ordem de pagamento (agrupa pagamentos pendentes por banco/forma)
 * - Gerar ficheiro de transferência bancária (formato padrão)
 * - Confirmar pagamento (PENDENTE -> PAGO/PARCIAL) com movimento de tesouraria
 * - Estornar pagamento (ESTORNADO) com movimento inverso
 * - Listar ordens e pagamentos com filtros
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { RhNotFoundError, RhBusinessRuleError } from '../utils/rh-errors';
import {
  FinancasGateway,
  financasGateway as defaultGateway,
} from './rh-financas-gateway';

export interface OrdemPagamentoResumoDto {
  id: string;
  numero: number;
  banco: string | null;
  formaPagamento: string;
  estado: string;
  totalValor: Prisma.Decimal;
  pagamentosCount: number;
  createdAt: Date;
  ficheiroPath: string | null;
}

export interface OrdemPagamentoDetalheDto extends OrdemPagamentoResumoDto {
  pagamentos: {
    id: string;
    funcionario: { id: string; codigo: string; nome: string };
    formaPagamento: string;
    valor: Prisma.Decimal;
    valorPago: Prisma.Decimal;
    estado: string;
    dataPagamento: Date | null;
    referencia: string | null;
  }[];
}

export interface PagamentosPaginaDto {
  total: number;
  items: {
    id: string;
    processamentoId: string;
    funcionario: { id: string; codigo: string; nome: string };
    formaPagamento: string;
    valor: Prisma.Decimal;
    valorPago: Prisma.Decimal;
    estado: string;
    dataPagamento: Date | null;
    referencia: string | null;
    ordemId: string | null;
    processamento: {
      id: string;
      tipo: string;
      sequencia: number;
      periodo: { codigo: string; ano: number };
    };
  }[];
}

export interface OrdemPagamentoInput {
  empresaId?: string | null;
  periodoId?: string | null;
  banco?: string;
  formaPagamento: 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
  pagamentoIds: string[];
}

export interface ConfirmarPagamentoInput {
  empresaId?: string | null;
  pagamentoId: string;
  valorPago: number | Prisma.Decimal;
  dataPagamento: Date;
  referencia?: string;
  contaBancariaId?: string | null;
  utilizadorId?: string | null;
}

export interface EstornarPagamentoInput {
  empresaId?: string | null;
  pagamentoId: string;
  motivo: string;
  utilizadorId?: string | null;
}

export interface ListarOrdensInput {
  empresaId?: string | null;
  estado?: 'ABERTA' | 'ENVIADA' | 'CONCLUIDA' | 'CANCELADA';
  skip?: number;
  take?: number;
}

export interface ListarPagamentosInput {
  empresaId?: string | null;
  funcionarioId?: string | null;
  estado?: 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'ESTORNADO' | 'CANCELADO';
  formaPagamento?: 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
  ordemId?: string | null;
  skip?: number;
  take?: number;
}

export class RhPagamentosService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly gateway: FinancasGateway = defaultGateway
  ) {}

  /**
   * Cria uma ordem de pagamento agrupando pagamentos pendentes.
   * Agrupa por banco + forma de pagamento.
   */
  async criarOrdem(input: OrdemPagamentoInput): Promise<OrdemPagamentoResumoDto> {
    const empresaId = this.exigirEmpresa(input.empresaId);

    // Busca pagamentos pendentes seleccionados
    const pagamentos = await this.prisma.rhPagamento.findMany({
      where: {
        id: { in: input.pagamentoIds },
        processamento: { periodo: { empresaId } },
        estado: { in: ['PENDENTE', 'PARCIAL'] },
      },
      include: {
        processamento: { include: { periodo: true } },
        funcionario: { select: { id: true, codigo: true, nome: true } },
      },
    });

    if (pagamentos.length === 0) {
      throw new RhBusinessRuleError('Nenhum pagamento pendente encontrado para os IDs indicados.');
    }

    // Verifica se todos têm a mesma forma de pagamento
    const formas = new Set(pagamentos.map((p) => p.formaPagamento));
    if (formas.size > 1) {
      throw new RhBusinessRuleError('Todos os pagamentos devem ter a mesma forma de pagamento.');
    }
    if (formas.has('TRANSFERENCIA') && !input.banco) {
      throw new RhBusinessRuleError('Banco é obrigatório para transferências.');
    }

    // Verifica se algum já está numa ordem
    const jaEmOrdem = pagamentos.filter((p) => p.ordemId);
    if (jaEmOrdem.length > 0) {
      throw new RhBusinessRuleError('Alguns pagamentos já pertencem a uma ordem de pagamento.');
    }

    // Calcula total
    const totalValor = pagamentos.reduce(
      (acc, p) => acc.plus(new Prisma.Decimal(p.valor).minus(p.valorPago)),
      new Prisma.Decimal(0)
    );

    // Obtém próximo número de ordem
    const ultimaOrdem = await this.prisma.rhOrdemPagamento.findFirst({
      where: { empresaId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const proximoNumero = (ultimaOrdem?.numero ?? 0) + 1;

    // Cria a ordem e associa os pagamentos numa transação
    const ordem = await this.prisma.$transaction(async (tx) => {
      const ordem = await tx.rhOrdemPagamento.create({
        data: {
          empresaId,
          numero: proximoNumero,
          periodoId: input.periodoId ?? null,
          banco: input.banco ?? null,
          formaPagamento: input.formaPagamento,
          estado: 'ABERTA',
          totalValor,
          criadoPorId: input.empresaId ? 'system' : undefined, // TODO: passar utilizadorId
        },
      });

      // Associa pagamentos à ordem
      await tx.rhPagamento.updateMany({
        where: { id: { in: input.pagamentoIds } },
        data: { ordemId: ordem.id },
      });

      return ordem;
    });

    return this.formatarOrdemResumo(ordem, pagamentos.length);
  }

  /**
   * Gera ficheiro de transferência bancária para uma ordem.
   * Formato padrão (ex.: CSV com cabeçalho bancário).
   */
  async gerarFicheiroTransferencia(ordemId: string, empresaId?: string | null): Promise<string> {
    const emp = this.exigirEmpresa(empresaId);
    const ordem = await this.prisma.rhOrdemPagamento.findFirst({
      where: { id: ordemId, empresaId: emp },
      include: {
        pagamentos: {
          include: {
            funcionario: { select: { id: true, codigo: true, nome: true, iban: true } },
          },
        },
      },
    });

    if (!ordem) throw new RhNotFoundError('Ordem de pagamento não encontrada.');
    if (ordem.formaPagamento !== 'TRANSFERENCIA') {
      throw new RhBusinessRuleError('Ficheiro de transferência só disponível para forma TRANSFERENCIA.');
    }
    if (ordem.estado === 'CANCELADA') {
      throw new RhBusinessRuleError('Ordem cancelada não permite gerar ficheiro.');
    }

    const linhas: string[] = [];

    // Cabeçalho padrão (exemplo genérico)
    linhas.push('TIPO;BANCO_ORIGEM;CONTA_ORIGEM;DATA;VALOR_TOTAL;QUANTIDADE');
    linhas.push(
      `ORDEM;${ordem.banco || ''};;;${new Date().toISOString().split('T')[0]};${Number(ordem.totalValor).toFixed(2).replace('.', ',')};${ordem.pagamentos.length}`
    );

    // Detalhe por pagamento
    linhas.push('TIPO;IBAN_DESTINO;NOME_DESTINATARIO;VALOR;REFERENCIA;DESCRICAO');
    for (const p of ordem.pagamentos) {
      const valorPendente = Number(p.valor).toFixed(2).replace('.', ',');
      const ref = p.referencia || `PROC-${p.processamentoId?.slice(-8)}`;
      linhas.push(
        `PAG;${p.funcionario.iban || ''};${p.funcionario.nome};${valorPendente};${ref};Processamento ${p.id?.slice(-8)}`
      );
    }

    const conteudo = linhas.join('\r\n');

    // Guarda path do ficheiro (simulado — em produção gravaria em storage)
    const ficheiroPath = `ordens-pagamento/${ordemId}_${Date.now()}.csv`;
    await this.prisma.rhOrdemPagamento.update({
      where: { id: ordemId },
      data: { ficheiroPath, estado: 'ENVIADA' },
    });

    return conteudo;
  }

  /**
   * Confirma pagamento de um pagamento individual (PENDENTE/PARCIAL -> PAGO/PARCIAL).
   * Cria movimento de tesouraria via Finanças (best-effort).
   */
  async confirmarPagamento(input: ConfirmarPagamentoInput): Promise<void> {
    const emp = this.exigirEmpresa(input.empresaId);

    const pagamento = await this.prisma.rhPagamento.findFirst({
      where: { id: input.pagamentoId, processamento: { periodo: { empresaId: emp } } },
      include: { processamento: true },
    });

    if (!pagamento) throw new RhNotFoundError('Pagamento não encontrado.');
    if (pagamento.estado === 'PAGO') throw new RhBusinessRuleError('Pagamento já está pago.');
    if (pagamento.estado === 'ESTORNADO' || pagamento.estado === 'CANCELADO') {
      throw new RhBusinessRuleError('Pagamento não pode ser confirmado no estado actual.');
    }

    const valorPendente = new Prisma.Decimal(pagamento.valor).minus(pagamento.valorPago);
    const valorAPagar = new Prisma.Decimal(input.valorPago);

    if (valorAPagar.greaterThan(valorPendente)) {
      throw new RhBusinessRuleError('Valor a pagar excede o valor pendente.');
    }

    const novoValorPago = new Prisma.Decimal(pagamento.valorPago).plus(valorAPagar);
    const novoEstado = novoValorPago.greaterThanOrEqualTo(pagamento.valor) ? 'PAGO' : 'PARCIAL';

    await this.prisma.rhPagamento.update({
      where: { id: input.pagamentoId },
      data: {
        valorPago: novoValorPago,
        estado: novoEstado,
        dataPagamento: input.dataPagamento,
        referencia: input.referencia ?? null,
      },
    });

    // Integração depois do commit da actualização do pagamento. Best-effort:
    // uma falha financeira nunca desfaz o pagamento confirmado.
    try {
      const contaBancariaId = await this.resolverContaBancaria(
        emp,
        pagamento.formaPagamento,
        input.contaBancariaId
      );
      if (contaBancariaId) {
        await this.gateway.criarMovimentoTesouraria({
          empresaId: emp,
          data: input.dataPagamento,
          tipo: 'saida',
          contaBancariaId,
          valor: new Prisma.Decimal(input.valorPago).toFixed(2),
          descricao: `Pagamento RH ${pagamento.processamento.tipo} — ${input.referencia || input.pagamentoId}`.slice(0, 240),
          origemTipo: 'RH_PAGAMENTO',
          origemId: input.pagamentoId,
          utilizadorId: input.utilizadorId ?? undefined,
        });
      }
    } catch (erro) {
      console.warn('[pagamentos] Falha ao criar movimento de tesouraria para pagamento', input.pagamentoId, erro);
    }

    // Se ordem associada, verifica se todos pagos -> CONCLUIDA
    if (pagamento.ordemId) {
      const ordem = await this.prisma.rhOrdemPagamento.findUnique({
        where: { id: pagamento.ordemId },
        include: { pagamentos: true },
      });
      if (ordem && ordem.pagamentos.every((p) => p.estado === 'PAGO')) {
        await this.prisma.rhOrdemPagamento.update({
          where: { id: ordem.id },
          data: { estado: 'CONCLUIDA' },
        });
      }
    }
  }

  /**
   * Estorna um pagamento (PAGO/PARCIAL -> ESTORNADO).
   * Cria movimento inverso em tesouraria (best-effort).
   */
  async estornarPagamento(input: EstornarPagamentoInput): Promise<void> {
    const emp = this.exigirEmpresa(input.empresaId);

    const pagamento = await this.prisma.rhPagamento.findFirst({
      where: { id: input.pagamentoId, processamento: { periodo: { empresaId: emp } } },
    });

    if (!pagamento) throw new RhNotFoundError('Pagamento não encontrado.');
    if (!['PAGO', 'PARCIAL'].includes(pagamento.estado)) {
      throw new RhBusinessRuleError('Apenas pagamentos PAGO ou PARCIAL podem ser estornados.');
    }
    if (!input.motivo || input.motivo.trim().length < 3) {
      throw new RhBusinessRuleError('Motivo do estorno é obrigatório (mínimo 3 caracteres).');
    }

    await this.prisma.rhPagamento.update({
      where: { id: input.pagamentoId },
      data: {
        estado: 'ESTORNADO',
        estornadoEm: new Date(),
        motivoEstorno: input.motivo.trim(),
      },
    });

    // Estorno financeiro depois do commit. Se não houver movimento ligado ao
    // pagamento (integração anterior falhou), não há nada a estornar.
    try {
      const movimento = await this.prisma.movimentoTesouraria.findFirst({
        where: {
          empresaId: emp,
          documentoTipo: 'manual',
          documentoId: input.pagamentoId,
          estado: 'confirmado',
          movimentoEstornoId: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (movimento) {
        await this.gateway.estornarMovimento(
          movimento.id,
          input.motivo.trim(),
          input.utilizadorId ?? undefined
        );
      }
    } catch (erro) {
      console.warn('[pagamentos] Falha ao estornar movimento de tesouraria para pagamento', input.pagamentoId, erro);
    }

    // Se ordem associada, verifica estado
    if (pagamento.ordemId) {
      const ordem = await this.prisma.rhOrdemPagamento.findUnique({
        where: { id: pagamento.ordemId },
        include: { pagamentos: true },
      });
      if (ordem && ordem.estado !== 'CANCELADA') {
        const todosEstornados = ordem.pagamentos.every((p) => p.estado === 'ESTORNADO');
        if (todosEstornados) {
          await this.prisma.rhOrdemPagamento.update({
            where: { id: ordem.id },
            data: { estado: 'CANCELADA' },
          });
        }
      }
    }
  }

  /**
   * Lista ordens de pagamento com paginação.
   */
  async listarOrdens(input: ListarOrdensInput): Promise<{ total: number; items: OrdemPagamentoResumoDto[] }> {
    const emp = this.exigirEmpresa(input.empresaId);
    const where: any = { empresaId: emp };
    if (input.estado) where.estado = input.estado;

    const [total, items] = await Promise.all([
      this.prisma.rhOrdemPagamento.count({ where }),
      this.prisma.rhOrdemPagamento.findMany({
        where,
        include: { _count: { select: { pagamentos: true } } },
        orderBy: { createdAt: 'desc' },
        skip: input.skip ?? 0,
        take: input.take ?? 25,
      }),
    ]);

    return {
      total,
      items: items.map((o) => ({
        id: o.id,
        numero: o.numero,
        banco: o.banco,
        formaPagamento: o.formaPagamento,
        estado: o.estado,
        totalValor: o.totalValor,
        pagamentosCount: o._count.pagamentos,
        createdAt: o.createdAt,
        ficheiroPath: o.ficheiroPath,
      })),
    };
  }

  /**
   * Obtém detalhe de uma ordem com os pagamentos.
   */
  async obterOrdem(ordemId: string, empresaId?: string | null): Promise<OrdemPagamentoDetalheDto> {
    const emp = this.exigirEmpresa(empresaId);
    const ordem = await this.prisma.rhOrdemPagamento.findFirst({
      where: { id: ordemId, empresaId: emp },
      include: {
        pagamentos: {
          include: {
            funcionario: { select: { id: true, codigo: true, nome: true } },
          },
        },
      },
    });

    if (!ordem) throw new RhNotFoundError('Ordem de pagamento não encontrada.');

    return {
      id: ordem.id,
      numero: ordem.numero,
      banco: ordem.banco,
      formaPagamento: ordem.formaPagamento,
      estado: ordem.estado,
      totalValor: ordem.totalValor,
      pagamentosCount: ordem.pagamentos.length,
      createdAt: ordem.createdAt,
      ficheiroPath: ordem.ficheiroPath,
      pagamentos: ordem.pagamentos.map((p) => ({
        id: p.id,
        funcionario: { id: p.funcionario.id, codigo: p.funcionario.codigo, nome: p.funcionario.nome },
        formaPagamento: p.formaPagamento,
        valor: p.valor,
        valorPago: p.valorPago,
        estado: p.estado,
        dataPagamento: p.dataPagamento,
        referencia: p.referencia,
      })),
    };
  }

  /**
   * Lista pagamentos com filtros.
   */
  async listarPagamentos(input: ListarPagamentosInput): Promise<PagamentosPaginaDto> {
    const emp = this.exigirEmpresa(input.empresaId);
    const where: any = { processamento: { periodo: { empresaId: emp } } };
    if (input.funcionarioId) where.funcionarioId = input.funcionarioId;
    if (input.estado) where.estado = input.estado;
    if (input.formaPagamento) where.formaPagamento = input.formaPagamento;
    if (input.ordemId) where.ordemId = input.ordemId;

    const [total, items] = await Promise.all([
      this.prisma.rhPagamento.count({ where }),
      this.prisma.rhPagamento.findMany({
        where,
        include: {
          processamento: { include: { periodo: { select: { codigo: true, ano: true } } } },
          funcionario: { select: { id: true, codigo: true, nome: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: input.skip ?? 0,
        take: input.take ?? 25,
      }),
    ]);

    return {
      total,
      items: items.map((p) => ({
        id: p.id,
        processamentoId: p.processamentoId,
        funcionario: { id: p.funcionario.id, codigo: p.funcionario.codigo, nome: p.funcionario.nome },
        formaPagamento: p.formaPagamento,
        valor: p.valor,
        valorPago: p.valorPago,
        estado: p.estado,
        dataPagamento: p.dataPagamento,
        referencia: p.referencia,
        ordemId: p.ordemId,
        processamento: {
          id: p.processamento.id,
          tipo: p.processamento.tipo,
          sequencia: p.processamento.sequencia,
          periodo: { codigo: p.processamento.periodo.codigo, ano: p.processamento.periodo.ano },
        },
      })),
    };
  }

  private formatarOrdemResumo(ordem: any, pagamentosCount: number): OrdemPagamentoResumoDto {
    return {
      id: ordem.id,
      numero: ordem.numero,
      banco: ordem.banco,
      formaPagamento: ordem.formaPagamento,
      estado: ordem.estado,
      totalValor: ordem.totalValor,
      pagamentosCount,
      createdAt: ordem.createdAt,
      ficheiroPath: ordem.ficheiroPath,
    };
  }

  private async resolverContaBancaria(
    empresaId: string,
    formaPagamento: string,
    contaBancariaId?: string | null
  ): Promise<string | undefined> {
    if (contaBancariaId) return contaBancariaId;

    const tipo = formaPagamento === 'NUMERARIO' ? ('caixa' as const) : ('banco' as const);
    const conta = await this.prisma.contaBancaria.findFirst({
      where: { empresaId, ativo: true, tipo },
      orderBy: { codigo: 'asc' },
      select: { id: true },
    });
    return conta?.id;
  }

  private exigirEmpresa(empresaId: string | null | undefined): string {
    if (!empresaId) throw new Error('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhPagamentosService = new RhPagamentosService();