/**
 * @file apuramento-resultados.service.ts
 * @description Apuramento e encerramento de resultados do exercício.
 *
 * A sequência segue o PGC angolano:
 *   6/7 → 81/82/84 → 83 → 85 → 88
 *   86 (imposto) → 88
 *
 * As contas de resultado são resolvidas por `MapeamentoConta`; não há códigos
 * de conta escritos no código. O apuramento só pode correr depois de todos os
 * períodos estarem fechados e cria um único lançamento de fecho equilibrado,
 * deixando as classes 6, 7 e 8 a zero (excepto 88, que transporta o resultado).
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

type ClasseResultado = 'operating' | 'financial' | 'nonOperating';

interface ContaSaldo {
  contaId: string;
  codigo: string;
  designacao: string;
  classe: number;
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
  /** Débito − crédito. Positivo = saldo devedor. */
  saldo: Prisma.Decimal;
}

interface ResumoResultados {
  proveitos: string;
  custos: string;
  resultadoOperacional: string;
  resultadoFinanceiro: string;
  resultadoNaoCorrente: string;
  resultadoAntesImpostos: string;
  imposto: string;
  resultadoLiquido: string;
}

export interface PrevisaoResultados {
  exercicioId: string;
  ano: string;
  periodosAbertos: number[];
  podeExecutar: boolean;
  bloqueios: string[];
  resumo: ResumoResultados;
  detalhes: {
    proveitos: Array<{ contaId: string; codigo: string; designacao: string; valor: string; classe: ClasseResultado }>;
    custos: Array<{ contaId: string; codigo: string; designacao: string; valor: string; classe: ClasseResultado }>;
    imposto: Array<{ contaId: string; codigo: string; designacao: string; valor: string }>;
  };
}

interface LinhaFecho {
  numeroLinha: number;
  contaId: string;
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
  descricao: string;
}

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function dinheiro(valor: Prisma.Decimal): string {
  return valor.toFixed(4);
}

export class ApuramentoResultadosService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ─── Leitura de saldos ───────────────────────────────────────────────────

  private async carregarSaldos(empresaId: string, exercicioId: string): Promise<ContaSaldo[]> {
    const agregados = await this.prisma.linhaLancamentoContabil.groupBy({
      by: ['contaId'],
      where: {
        lancamento: { empresaId, exercicioId, estado: 'validado' },
      },
      _sum: { debito: true, credito: true },
    });
    if (agregados.length === 0) return [];

    const contas = await this.prisma.contaContabil.findMany({
      where: { id: { in: agregados.map((a) => a.contaId) } },
      select: { id: true, codigo: true, designacao: true, classe: true },
    });
    const porId = new Map(contas.map((c) => [c.id, c]));

    const resultado: ContaSaldo[] = [];
    for (const agregado of agregados) {
      const conta = porId.get(agregado.contaId);
      if (!conta) continue;
      const debito = agregado._sum.debito ?? zero();
      const credito = agregado._sum.credito ?? zero();
      resultado.push({
        contaId: agregado.contaId,
        codigo: conta.codigo,
        designacao: conta.designacao,
        classe: conta.classe,
        debito,
        credito,
        saldo: debito.minus(credito),
      });
    }
    return resultado;
  }

  private classificar(codigo: string, classe: number): ClasseResultado {
    if (classe === 6) {
      if (codigo.startsWith('64')) return 'financial';
      if (codigo.startsWith('651') || codigo.startsWith('653')) return 'nonOperating';
      return 'operating';
    }
    if (classe === 7) {
      if (codigo.startsWith('75')) return 'financial';
      if (codigo.startsWith('761') || codigo.startsWith('763')) return 'nonOperating';
      return 'operating';
    }
    return 'operating';
  }

  private async resolverMapeamentos(
    empresaId: string,
    chaves: string[]
  ): Promise<Record<string, string>> {
    const mapeamentos = await this.prisma.mapeamentoConta.findMany({
      where: { empresaId, chave: { in: chaves } },
      select: { chave: true, contaId: true },
    });
    const porChave: Record<string, string> = {};
    for (const m of mapeamentos) porChave[m.chave] = m.contaId;

    const faltam = chaves.filter((c) => !porChave[c]);
    if (faltam.length > 0) {
      throw new BusinessRuleError(
        `Faltam mapeamentos de contas para o apuramento de resultados: ${faltam.join(', ')}.`
      );
    }
    return porChave;
  }

  // ─── Previsão ────────────────────────────────────────────────────────────

  async previsao(exercicioId: string, empresaId?: string): Promise<PrevisaoResultados> {
    const exercicio = await this.prisma.exercicioFiscal.findFirst({
      where: { id: exercicioId, ...(empresaId ? { empresaId } : {}) },
      include: { periodos: { orderBy: { numero: 'asc' }, select: { numero: true, estado: true } } },
    });
    if (!exercicio) throw new NotFoundError('Exercício fiscal não encontrado.');

    const periodosAbertos = exercicio.periodos
      .filter((p) => p.estado === 'aberto')
      .map((p) => p.numero);

    const execucao = await this.prisma.execucaoFecho.findFirst({
      where: { exercicioId, tipo: 'apuramentoResultados', estado: 'executado' },
      select: { id: true },
    });

    const saldos = await this.carregarSaldos(exercicio.empresaId, exercicioId);

    let proveitos = zero();
    let custos = zero();
    let operacional = zero();
    let financeiro = zero();
    let naoCorrente = zero();

    const detalhesProveitos: PrevisaoResultados['detalhes']['proveitos'] = [];
    const detalhesCustos: PrevisaoResultados['detalhes']['custos'] = [];

    for (const conta of saldos) {
      if (conta.classe === 6) {
        // Proveitos têm natureza credora: valor = crédito − débito.
        const valor = conta.credito.minus(conta.debito);
        const classe = this.classificar(conta.codigo, conta.classe);
        proveitos = proveitos.plus(valor);
        if (classe === 'financial') financeiro = financeiro.plus(valor);
        else if (classe === 'nonOperating') naoCorrente = naoCorrente.plus(valor);
        else operacional = operacional.plus(valor);
        if (!valor.isZero()) {
          detalhesProveitos.push({
            contaId: conta.contaId,
            codigo: conta.codigo,
            designacao: conta.designacao,
            valor: dinheiro(valor),
            classe,
          });
        }
      } else if (conta.classe === 7) {
        // Custos têm natureza devedora: valor = débito − crédito.
        const valor = conta.debito.minus(conta.credito);
        const classe = this.classificar(conta.codigo, conta.classe);
        custos = custos.plus(valor);
        if (classe === 'financial') financeiro = financeiro.minus(valor);
        else if (classe === 'nonOperating') naoCorrente = naoCorrente.minus(valor);
        else operacional = operacional.minus(valor);
        if (!valor.isZero()) {
          detalhesCustos.push({
            contaId: conta.contaId,
            codigo: conta.codigo,
            designacao: conta.designacao,
            valor: dinheiro(valor),
            classe,
          });
        }
      }
    }

    // Imposto: saldo da conta mapeada em RESULT_TAX (86), se já existir.
    const mapeamentos = await this.prisma.mapeamentoConta.findMany({
      where: { empresaId: exercicio.empresaId, chave: { in: ['RESULT_TAX'] } },
      select: { chave: true, contaId: true },
    });
    const contaImpostoId = mapeamentos.find((m) => m.chave === 'RESULT_TAX')?.contaId;
    const detalhesImposto: PrevisaoResultados['detalhes']['imposto'] = [];
    let imposto = zero();
    if (contaImpostoId) {
      const conta = saldos.find((s) => s.contaId === contaImpostoId);
      if (conta && !conta.saldo.isZero()) {
        imposto = conta.saldo;
        detalhesImposto.push({
          contaId: conta.contaId,
          codigo: conta.codigo,
          designacao: conta.designacao,
          valor: dinheiro(imposto),
        });
      }
    }

    const antesImpostos = operacional.plus(financeiro).plus(naoCorrente);
    const liquido = antesImpostos.minus(imposto);

    const bloqueios: string[] = [];
    if (exercicio.periodos.length === 0) {
      bloqueios.push('O exercício não tem períodos contabilísticos.');
    }
    if (periodosAbertos.length > 0) {
      bloqueios.push(`Existem períodos em aberto: ${periodosAbertos.join(', ')}.`);
    }
    if (execucao) {
      bloqueios.push('O apuramento de resultados já foi executado para este exercício.');
    }
    if (antesImpostos.isZero() && custos.isZero() && proveitos.isZero()) {
      bloqueios.push('Não há movimentos de proveitos ou custos no exercício.');
    }

    return {
      exercicioId,
      ano: exercicio.ano,
      periodosAbertos,
      podeExecutar: bloqueios.length === 0,
      bloqueios,
      resumo: {
        proveitos: dinheiro(proveitos),
        custos: dinheiro(custos),
        resultadoOperacional: dinheiro(operacional),
        resultadoFinanceiro: dinheiro(financeiro),
        resultadoNaoCorrente: dinheiro(naoCorrente),
        resultadoAntesImpostos: dinheiro(antesImpostos),
        imposto: dinheiro(imposto),
        resultadoLiquido: dinheiro(liquido),
      },
      detalhes: {
        proveitos: detalhesProveitos,
        custos: detalhesCustos,
        imposto: detalhesImposto,
      },
    };
  }

  // ─── Execução ────────────────────────────────────────────────────────────

  async executar(
    exercicioId: string,
    utilizadorId: string,
    empresaId?: string
  ): Promise<{ execucaoId: string; lancamentoId: string; resumo: ResumoResultados }> {
    const previsao = await this.previsao(exercicioId, empresaId);
    if (previsao.bloqueios.length > 0) {
      throw new BusinessRuleError(previsao.bloqueios.join(' '));
    }

    const exercicio = await this.prisma.exercicioFiscal.findUnique({
      where: { id: exercicioId },
      include: {
        periodos: { orderBy: { numero: 'desc' }, take: 1 },
      },
    });
    if (!exercicio) throw new NotFoundError('Exercício fiscal não encontrado.');
    const periodo = exercicio.periodos[0];
    if (!periodo) throw new BusinessRuleError('O exercício não tem períodos contabilísticos.');

    const chaves = [
      'RESULT_OPERATING',
      'RESULT_FINANCIAL',
      'RESULT_CURRENT',
      'RESULT_NON_OPERATING',
      'RESULT_BEFORE_TAX',
      'RESULT_TAX',
      'RESULT_NET',
    ];
    const mapeamentos = await this.resolverMapeamentos(exercicio.empresaId, chaves);

    const saldos = await this.carregarSaldos(exercicio.empresaId, exercicioId);
    const linhas = this.construirLinhas(saldos, mapeamentos);
    if (linhas.length === 0) {
      throw new BusinessRuleError('Não há saldos de resultados a encerrar.');
    }

    const totalDebito = linhas.reduce((soma, l) => soma.plus(l.debito), zero());
    const totalCredito = linhas.reduce((soma, l) => soma.plus(l.credito), zero());
    if (!totalDebito.equals(totalCredito)) {
      throw new BusinessRuleError(
        `O lançamento de apuramento não está equilibrado (débito ${dinheiro(totalDebito)} vs crédito ${dinheiro(totalCredito)}).`
      );
    }

    const diario = await this.prisma.diarioContabil.findFirst({
      where: { empresaId: exercicio.empresaId, tipo: 'ajustamento', activo: true },
      orderBy: { codigo: 'asc' },
    });
    if (!diario) {
      throw new BusinessRuleError('Não existe diário de ajustamentos activo para o apuramento de resultados.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const execucao = await tx.execucaoFecho.create({
          data: {
            empresaId: exercicio.empresaId,
            periodoId: periodo.id,
            exercicioId,
            tipo: 'apuramentoResultados',
            estado: 'executado',
            iniciadoPorId: utilizadorId,
            concluidoEm: new Date(),
            detalhes: JSON.stringify(previsao.resumo),
          },
        });

        const lancamento = await tx.lancamentoContabil.create({
          data: {
            empresaId: exercicio.empresaId,
            diarioId: diario.id,
            exercicioId,
            periodoId: periodo.id,
            dataContabilistica: periodo.dataFim,
            dataDocumento: periodo.dataFim,
            descricao: `Apuramento de resultados - Exercício ${exercicio.ano}`,
            origem: 'fecho',
            moduloOrigem: 'apuramento-resultados',
            tipoOrigem: 'exercicio',
            origemId: exercicioId,
            execucaoFechoId: execucao.id,
            criadoPorId: utilizadorId,
            totalDebito,
            totalCredito,
            linhas: {
              create: linhas.map((l) => ({
                numeroLinha: l.numeroLinha,
                contaId: l.contaId,
                debito: l.debito,
                credito: l.credito,
                descricao: l.descricao,
              })),
            },
          },
          select: { id: true },
        });

        const { sequenciaDiarioService } = await import('./sequencia-diario.service');
        const numero = await sequenciaDiarioService.proximoNumero(diario.id, exercicioId, tx);
        await tx.lancamentoContabil.update({
          where: { id: lancamento.id },
          data: {
            numero,
            estado: 'validado',
            validadoPorId: utilizadorId,
            validadoEm: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            empresaId: exercicio.empresaId,
            utilizadorId,
            acao: 'apurar',
            severidade: 'info',
            entidade: 'ExecucaoFecho',
            entidadeId: execucao.id,
            modulo: 'contabilidade',
            descricao: `Apuramento de resultados do exercício ${exercicio.ano} executado.`,
            dadosNovos: JSON.stringify(previsao.resumo),
          },
        });

        return { execucaoId: execucao.id, lancamentoId: lancamento.id, resumo: previsao.resumo };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  // ─── Construção das linhas ───────────────────────────────────────────────

  private construirLinhas(
    saldos: ContaSaldo[],
    mapeamentos: Record<string, string>
  ): LinhaFecho[] {
    const linhas: LinhaFecho[] = [];
    let numero = 1;

    const push = (contaId: string, debito: Prisma.Decimal, credito: Prisma.Decimal, descricao: string) => {
      if (debito.isZero() && credito.isZero()) return;
      linhas.push({ numeroLinha: numero++, contaId, debito, credito, descricao });
    };

    // Saldos acumulados dos resultados intermédios, na óptica crédito − débito.
    const acumulado: Record<string, Prisma.Decimal> = {
      RESULT_OPERATING: zero(),
      RESULT_FINANCIAL: zero(),
      RESULT_CURRENT: zero(),
      RESULT_NON_OPERATING: zero(),
      RESULT_BEFORE_TAX: zero(),
      RESULT_NET: zero(),
    };

    // 1. Encerrar proveitos (classe 6) e custos (classe 7) nas contas 81/82/84.
    for (const conta of saldos) {
      if (conta.classe !== 6 && conta.classe !== 7) continue;

      const classe = this.classificar(conta.codigo, conta.classe);
      const chaveDestino =
        classe === 'financial'
          ? 'RESULT_FINANCIAL'
          : classe === 'nonOperating'
            ? 'RESULT_NON_OPERATING'
            : 'RESULT_OPERATING';
      const destino = mapeamentos[chaveDestino];

      if (conta.classe === 6) {
        // Crédito − débito. Positivo: conta credora a encerrar por débito.
        const valor = conta.credito.minus(conta.debito);
        if (valor.gt(0)) {
          push(conta.contaId, valor, zero(), `Encerramento de proveito ${conta.codigo}`);
          push(destino, zero(), valor, `Proveito ${conta.codigo} para ${chaveDestino}`);
          acumulado[chaveDestino] = acumulado[chaveDestino].plus(valor);
        } else if (valor.lt(0)) {
          const absoluto = valor.abs();
          push(conta.contaId, zero(), absoluto, `Encerramento de conta redutora de proveito ${conta.codigo}`);
          push(destino, absoluto, zero(), `Conta redutora ${conta.codigo} contra ${chaveDestino}`);
          acumulado[chaveDestino] = acumulado[chaveDestino].minus(absoluto);
        }
      } else {
        // Débito − crédito. Positivo: conta devedora a encerrar por crédito.
        const valor = conta.debito.minus(conta.credito);
        if (valor.gt(0)) {
          push(conta.contaId, zero(), valor, `Encerramento de custo ${conta.codigo}`);
          push(destino, valor, zero(), `Custo ${conta.codigo} para ${chaveDestino}`);
          acumulado[chaveDestino] = acumulado[chaveDestino].minus(valor);
        } else if (valor.lt(0)) {
          const absoluto = valor.abs();
          push(conta.contaId, absoluto, zero(), `Encerramento de conta redutora de custo ${conta.codigo}`);
          push(destino, zero(), absoluto, `Conta redutora ${conta.codigo} contra ${chaveDestino}`);
          acumulado[chaveDestino] = acumulado[chaveDestino].plus(absoluto);
        }
      }
    }

    // 2. 81 e 82 → 83 (resultados correntes).
    for (const chave of ['RESULT_OPERATING', 'RESULT_FINANCIAL']) {
      const saldo = acumulado[chave];
      if (saldo.isZero()) continue;
      const origem = mapeamentos[chave];
      const destino = mapeamentos.RESULT_CURRENT;
      if (saldo.gt(0)) {
        push(origem, saldo, zero(), `Transferência de ${chave} para RESULT_CURRENT`);
        push(destino, zero(), saldo, `Resultado de ${chave}`);
        acumulado.RESULT_CURRENT = acumulado.RESULT_CURRENT.plus(saldo);
      } else {
        const absoluto = saldo.abs();
        push(origem, zero(), absoluto, `Transferência de ${chave} para RESULT_CURRENT`);
        push(destino, absoluto, zero(), `Resultado de ${chave}`);
        acumulado.RESULT_CURRENT = acumulado.RESULT_CURRENT.minus(absoluto);
      }
    }

    // 3. 83 e 84 → 85 (resultados antes de impostos).
    for (const chave of ['RESULT_CURRENT', 'RESULT_NON_OPERATING']) {
      const saldo = acumulado[chave];
      if (saldo.isZero()) continue;
      const origem = mapeamentos[chave];
      const destino = mapeamentos.RESULT_BEFORE_TAX;
      if (saldo.gt(0)) {
        push(origem, saldo, zero(), `Transferência de ${chave} para RESULT_BEFORE_TAX`);
        push(destino, zero(), saldo, `Resultado de ${chave}`);
        acumulado.RESULT_BEFORE_TAX = acumulado.RESULT_BEFORE_TAX.plus(saldo);
      } else {
        const absoluto = saldo.abs();
        push(origem, zero(), absoluto, `Transferência de ${chave} para RESULT_BEFORE_TAX`);
        push(destino, absoluto, zero(), `Resultado de ${chave}`);
        acumulado.RESULT_BEFORE_TAX = acumulado.RESULT_BEFORE_TAX.minus(absoluto);
      }
    }

    // 4. Imposto (86) → 88. A conta 86 é devedora: crédito para encerrar e
    //    débito em 88 (reduz o resultado líquido).
    const contaImposto = saldos.find((s) => s.contaId === mapeamentos.RESULT_TAX);
    if (contaImposto && !contaImposto.saldo.isZero()) {
      const destino = mapeamentos.RESULT_NET;
      if (contaImposto.saldo.gt(0)) {
        push(contaImposto.contaId, zero(), contaImposto.saldo, 'Encerramento do imposto sobre lucros');
        push(destino, contaImposto.saldo, zero(), 'Imposto sobre lucros');
        acumulado.RESULT_NET = acumulado.RESULT_NET.minus(contaImposto.saldo);
      } else {
        const absoluto = contaImposto.saldo.abs();
        push(contaImposto.contaId, absoluto, zero(), 'Encerramento do imposto sobre lucros');
        push(destino, zero(), absoluto, 'Imposto sobre lucros');
        acumulado.RESULT_NET = acumulado.RESULT_NET.plus(absoluto);
      }
    }

    // 5. 85 → 88 (resultado líquido do exercício).
    const saldo85 = acumulado.RESULT_BEFORE_TAX;
    if (!saldo85.isZero()) {
      const origem = mapeamentos.RESULT_BEFORE_TAX;
      const destino = mapeamentos.RESULT_NET;
      if (saldo85.gt(0)) {
        push(origem, saldo85, zero(), 'Transferência do resultado antes de impostos');
        push(destino, zero(), saldo85, 'Resultado líquido do exercício');
      } else {
        const absoluto = saldo85.abs();
        push(origem, zero(), absoluto, 'Transferência do resultado antes de impostos');
        push(destino, absoluto, zero(), 'Resultado líquido do exercício');
      }
    }

    return linhas;
  }
}

export const apuramentoResultadosService = new ApuramentoResultadosService();
