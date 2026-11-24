/**
 * @file fecho-anual.service.ts
 * @description Fecho anual: encerramento do exercício e abertura do seguinte.
 *
 * A sequência é rígida e não pode ser saltada:
 *   1. Todos os períodos do exercício fechados (fecho mensal).
 *   2. Apuramento de resultados executado.
 *   3. Encerramento: exercício `fechado` e períodos `bloqueado`.
 *   4. Abertura do exercício N+1 com os saldos das classes 1–5.
 *
 * O encerramento guarda no `ExecucaoFecho.detalhes` o estado anterior dos
 * períodos, para que a reabertura possa repor exactamente o que existia antes.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError, NotFoundError, ValidationError } from '../utils/errors';
import { gerarPeriodosContabeis } from './periodo-contabil.service';

export interface PassoFechoAnual {
  codigo: string;
  descricao: string;
  estado: 'ok' | 'pendente' | 'erro';
  detalhes?: string;
}

export interface PrevisaoFechoAnual {
  exercicioId: string;
  ano: string;
  passos: PassoFechoAnual[];
  podeEncerrar: boolean;
  podeAbrir: boolean;
  bloqueios: string[];
  proximoExercicio: { id: string; ano: string } | null;
}

interface PeriodoSnapshot {
  id: string;
  estado: 'aberto' | 'fechado' | 'bloqueado';
}

interface LinhaAbertura {
  contaId: string;
  entidadeTipo: 'cliente' | 'fornecedor' | 'funcionario' | 'outro' | null;
  entidadeId: string | null;
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
}

type LancamentoAbertura = Prisma.LancamentoContabilGetPayload<{ include: { linhas: true } }>;

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function somarAno(data: Date): Date {
  const resultado = new Date(data);
  resultado.setUTCFullYear(resultado.getUTCFullYear() + 1);
  return resultado;
}

function dinheiro(valor: Prisma.Decimal): string {
  return valor.toFixed(4);
}

export class FechoAnualService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ─── Previsão ────────────────────────────────────────────────────────────

  async previsao(exercicioId: string, empresaId?: string): Promise<PrevisaoFechoAnual> {
    const exercicio = await this.prisma.exercicioFiscal.findFirst({
      where: { id: exercicioId, ...(empresaId ? { empresaId } : {}) },
      include: {
        periodos: { orderBy: { numero: 'asc' }, select: { numero: true, estado: true } },
      },
    });
    if (!exercicio) throw new NotFoundError('Exercício fiscal não encontrado.');

    const passos: PassoFechoAnual[] = [];
    const bloqueios: string[] = [];

    // 1. Períodos fechados.
    const abertos = exercicio.periodos.filter((p) => p.estado === 'aberto').map((p) => p.numero);
    if (exercicio.periodos.length === 0) {
      passos.push({ codigo: 'periodos', descricao: 'Períodos do exercício', estado: 'erro', detalhes: 'Sem períodos.' });
      bloqueios.push('O exercício não tem períodos contabilísticos.');
    } else if (abertos.length > 0) {
      passos.push({ codigo: 'periodos', descricao: 'Períodos fechados', estado: 'pendente', detalhes: `Em aberto: ${abertos.join(', ')}.` });
      bloqueios.push(`Existem períodos em aberto: ${abertos.join(', ')}.`);
    } else {
      passos.push({ codigo: 'periodos', descricao: 'Períodos fechados', estado: 'ok' });
    }

    // 2. Apuramento de resultados.
    const resultados = await this.prisma.execucaoFecho.findFirst({
      where: { exercicioId, tipo: 'apuramentoResultados', estado: 'executado' },
      select: { id: true },
    });
    if (resultados) {
      passos.push({ codigo: 'resultados', descricao: 'Apuramento de resultados', estado: 'ok' });
    } else {
      passos.push({ codigo: 'resultados', descricao: 'Apuramento de resultados', estado: 'pendente', detalhes: 'Ainda não executado.' });
      bloqueios.push('O apuramento de resultados ainda não foi executado.');
    }

    // 3. Encerramento.
    const encerrado = exercicio.estado === 'fechado';
    if (encerrado) {
      passos.push({ codigo: 'encerramento', descricao: 'Exercício encerrado', estado: 'ok' });
    } else {
      passos.push({ codigo: 'encerramento', descricao: 'Exercício encerrado', estado: 'pendente', detalhes: `Estado: ${exercicio.estado}.` });
    }

    // 4. Abertura do exercício seguinte.
    const proximoAno = String(Number(exercicio.ano) + 1);
    const proximo = await this.prisma.exercicioFiscal.findUnique({
      where: { empresaId_ano: { empresaId: exercicio.empresaId, ano: proximoAno } },
      select: { id: true, ano: true },
    });
    const abertura = proximo
      ? await this.prisma.lancamentoContabil.findFirst({
          where: { empresaId: exercicio.empresaId, exercicioId: proximo.id, origem: 'abertura', estado: 'validado' },
          select: { id: true },
        })
      : null;

    if (abertura) {
      passos.push({ codigo: 'abertura', descricao: 'Abertura do exercício seguinte', estado: 'ok' });
    } else {
      passos.push({
        codigo: 'abertura',
        descricao: 'Abertura do exercício seguinte',
        estado: 'pendente',
        detalhes: proximo ? `Exercício ${proximo.ano} sem lançamento de abertura.` : `Exercício ${proximoAno} ainda não existe.`,
      });
    }

    const podeEncerrar = !encerrado && abertos.length === 0 && !!resultados && exercicio.periodos.length > 0;
    const podeAbrir = encerrado && !abertura;

    if (!encerrado) {
      bloqueios.push('O exercício ainda não está encerrado.');
    }

    return {
      exercicioId,
      ano: exercicio.ano,
      passos,
      podeEncerrar,
      podeAbrir,
      bloqueios,
      proximoExercicio: proximo,
    };
  }

  // ─── Encerramento ────────────────────────────────────────────────────────

  async encerrar(
    exercicioId: string,
    utilizadorId: string,
    empresaId?: string
  ): Promise<{ execucaoId: string }> {
    const previsao = await this.previsao(exercicioId, empresaId);
    if (!previsao.podeEncerrar) {
      throw new BusinessRuleError(`Não é possível encerrar: ${previsao.bloqueios.join(' ')}`);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const exercicio = await tx.exercicioFiscal.findUniqueOrThrow({
          where: { id: exercicioId },
          include: { periodos: { orderBy: { numero: 'asc' }, select: { id: true, numero: true, estado: true } } },
        });

        const rascunhos = await tx.lancamentoContabil.count({
          where: { exercicioId, estado: 'rascunho' },
        });
        if (rascunhos > 0) {
          throw new BusinessRuleError(`Existem ${rascunhos} lançamento(s) em rascunho no exercício.`);
        }

        const ultimoPeriodo = exercicio.periodos[exercicio.periodos.length - 1];
        if (!ultimoPeriodo) throw new BusinessRuleError('O exercício não tem períodos contabilísticos.');

        const snapshot: PeriodoSnapshot[] = exercicio.periodos.map((p) => ({ id: p.id, estado: p.estado }));

        const execucao = await tx.execucaoFecho.create({
          data: {
            empresaId: exercicio.empresaId,
            periodoId: ultimoPeriodo.id,
            exercicioId,
            tipo: 'fechoAnual',
            estado: 'executado',
            iniciadoPorId: utilizadorId,
            concluidoEm: new Date(),
            detalhes: JSON.stringify({ periodosAnteriores: snapshot, resumo: previsao.passos }),
          },
        });

        await tx.exercicioFiscal.update({
          where: { id: exercicioId },
          data: { estado: 'fechado', fechadoEm: new Date(), fechadoPorId: utilizadorId },
        });

        await tx.periodoContabil.updateMany({
          where: { exercicioId },
          data: { estado: 'bloqueado', fechadoEm: new Date(), fechadoPorId: utilizadorId },
        });

        await tx.auditLog.create({
          data: {
            empresaId: exercicio.empresaId,
            utilizadorId,
            acao: 'fechar',
            severidade: 'info',
            entidade: 'ExercicioFiscal',
            entidadeId: exercicioId,
            modulo: 'contabilidade',
            descricao: `Exercício ${exercicio.ano} encerrado.`,
            dadosAnteriores: JSON.stringify({ estado: 'aberto' }),
            dadosNovos: JSON.stringify({ estado: 'fechado', execucaoId: execucao.id }),
          },
        });

        return { execucaoId: execucao.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  // ─── Abertura do exercício seguinte ──────────────────────────────────────

  async abrirExercicioSeguinte(
    exercicioId: string,
    utilizadorId: string,
    empresaId?: string
  ): Promise<{ exercicioId: string; lancamentoId: string }> {
    const previsao = await this.previsao(exercicioId, empresaId);
    if (!previsao.podeAbrir) {
      throw new BusinessRuleError(
        previsao.passos.find((p) => p.codigo === 'encerramento')?.estado !== 'ok'
          ? 'O exercício tem de estar encerrado antes da abertura do seguinte.'
          : 'A abertura do exercício seguinte já foi executada.'
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const exercicio = await tx.exercicioFiscal.findUniqueOrThrow({
          where: { id: exercicioId },
          include: { periodos: { orderBy: { numero: 'asc' } } },
        });
        if (exercicio.estado !== 'fechado') {
          throw new BusinessRuleError('O exercício tem de estar encerrado antes da abertura do seguinte.');
        }

        const proximoAno = String(Number(exercicio.ano) + 1);
        let proximo = await tx.exercicioFiscal.findUnique({
          where: { empresaId_ano: { empresaId: exercicio.empresaId, ano: proximoAno } },
          include: { periodos: { orderBy: { numero: 'asc' } } },
        });

        if (!proximo) {
          const inicio = somarAno(exercicio.dataInicio);
          const fim = somarAno(exercicio.dataFim);
          const gerados = gerarPeriodosContabeis(inicio, fim);
          proximo = await tx.exercicioFiscal.create({
            data: {
              ano: proximoAno,
              empresaId: exercicio.empresaId,
              dataInicio: inicio,
              dataFim: fim,
              estado: 'aberto',
              periodos: {
                create: gerados.map((p) => ({
                  numero: p.numero,
                  dataInicio: p.dataInicio,
                  dataFim: p.dataFim,
                  estado: 'aberto',
                })),
              },
            },
            include: { periodos: { orderBy: { numero: 'asc' } } },
          });
        } else if (proximo.periodos.length === 0) {
          const gerados = gerarPeriodosContabeis(proximo.dataInicio, proximo.dataFim);
          await tx.periodoContabil.createMany({
            data: gerados.map((p) => ({
              exercicioId: proximo!.id,
              numero: p.numero,
              dataInicio: p.dataInicio,
              dataFim: p.dataFim,
              estado: 'aberto',
            })),
          });
          proximo = await tx.exercicioFiscal.findUniqueOrThrow({
            where: { id: proximo.id },
            include: { periodos: { orderBy: { numero: 'asc' } } },
          });
        }

        const jaExiste = await tx.lancamentoContabil.findFirst({
          where: { empresaId: exercicio.empresaId, exercicioId: proximo.id, origem: 'abertura' },
          select: { id: true },
        });
        if (jaExiste) {
          throw new BusinessRuleError('Já existe um lançamento de abertura para o exercício seguinte.');
        }

        const primeiroPeriodo = proximo.periodos[0];
        if (!primeiroPeriodo) throw new BusinessRuleError('O exercício seguinte não tem períodos contabilísticos.');

        const diario = await tx.diarioContabil.findFirst({
          where: { empresaId: exercicio.empresaId, tipo: 'abertura', activo: true },
          orderBy: { codigo: 'asc' },
        });
        if (!diario) {
          throw new BusinessRuleError('Não existe diário de abertura activo para a empresa.');
        }

        const linhas = await this.calcularSaldosAbertura(tx, exercicio.empresaId, exercicioId);
        if (linhas.length === 0) {
          throw new BusinessRuleError('Não há saldos de abertura a transportar.');
        }

        const totalDebito = linhas.reduce((soma, l) => soma.plus(l.debito), zero());
        const totalCredito = linhas.reduce((soma, l) => soma.plus(l.credito), zero());
        if (!totalDebito.equals(totalCredito)) {
          throw new BusinessRuleError(
            `Os saldos de abertura não estão equilibrados (débito ${dinheiro(totalDebito)} vs crédito ${dinheiro(totalCredito)}).`
          );
        }

        const execucao = await tx.execucaoFecho.create({
          data: {
            empresaId: exercicio.empresaId,
            periodoId: primeiroPeriodo.id,
            exercicioId: proximo.id,
            tipo: 'aberturaExercicioSeguinte',
            estado: 'executado',
            iniciadoPorId: utilizadorId,
            concluidoEm: new Date(),
            detalhes: JSON.stringify({
              exercicioOrigemId: exercicioId,
              exercicioOrigemAno: exercicio.ano,
              totalDebito: dinheiro(totalDebito),
              totalCredito: dinheiro(totalCredito),
              linhas: linhas.length,
            }),
          },
        });

        const lancamento = await tx.lancamentoContabil.create({
          data: {
            empresaId: exercicio.empresaId,
            diarioId: diario.id,
            exercicioId: proximo.id,
            periodoId: primeiroPeriodo.id,
            dataContabilistica: proximo.dataInicio,
            dataDocumento: proximo.dataInicio,
            descricao: `Abertura do exercício ${proximo.ano}`,
            origem: 'abertura',
            moduloOrigem: 'fecho-anual',
            tipoOrigem: 'exercicio',
            origemId: exercicioId,
            execucaoFechoId: execucao.id,
            criadoPorId: utilizadorId,
            totalDebito,
            totalCredito,
            linhas: {
              create: linhas.map((l, indice) => ({
                numeroLinha: indice + 1,
                contaId: l.contaId,
                debito: l.debito,
                credito: l.credito,
                entidadeTipo: l.entidadeTipo,
                entidadeId: l.entidadeId,
                descricao: `Saldo de abertura ${proximo!.ano}`,
              })),
            },
          },
          select: { id: true },
        });

        const { sequenciaDiarioService } = await import('./sequencia-diario.service');
        const numero = await sequenciaDiarioService.proximoNumero(diario.id, proximo.id, tx);
        await tx.lancamentoContabil.update({
          where: { id: lancamento.id },
          data: { numero, estado: 'validado', validadoPorId: utilizadorId, validadoEm: new Date() },
        });

        await tx.auditLog.create({
          data: {
            empresaId: exercicio.empresaId,
            utilizadorId,
            acao: 'criar',
            severidade: 'info',
            entidade: 'ExercicioFiscal',
            entidadeId: proximo.id,
            modulo: 'contabilidade',
            descricao: `Exercício ${proximo.ano} aberto com os saldos de ${exercicio.ano}.`,
            dadosNovos: JSON.stringify({ exercicioOrigemId: exercicioId, lancamentoId: lancamento.id }),
          },
        });

        return { exercicioId: proximo.id, lancamentoId: lancamento.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  private async calcularSaldosAbertura(
    tx: Prisma.TransactionClient,
    empresaId: string,
    exercicioId: string
  ): Promise<LinhaAbertura[]> {
    const agregados = await tx.linhaLancamentoContabil.groupBy({
      by: ['contaId', 'entidadeTipo', 'entidadeId'],
      where: {
        lancamento: { empresaId, exercicioId, estado: 'validado' },
        conta: { classe: { in: [1, 2, 3, 4, 5] } },
      },
      _sum: { debito: true, credito: true },
    });

    const linhas: LinhaAbertura[] = [];
    for (const agregado of agregados) {
      const debito = agregado._sum.debito ?? zero();
      const credito = agregado._sum.credito ?? zero();
      const saldo = debito.minus(credito);
      if (saldo.isZero()) continue;
      linhas.push({
        contaId: agregado.contaId,
        entidadeTipo: agregado.entidadeTipo,
        entidadeId: agregado.entidadeId,
        debito: saldo.gt(0) ? saldo : zero(),
        credito: saldo.lt(0) ? saldo.abs() : zero(),
      });
    }
    return linhas;
  }

  // ─── Reabertura ──────────────────────────────────────────────────────────

  async reabrir(
    exercicioId: string,
    utilizadorId: string,
    motivo: string,
    empresaId?: string
  ): Promise<void> {
    if (!motivo?.trim()) throw new ValidationError('O motivo da reabertura é obrigatório.');

    await this.prisma.$transaction(
      async (tx) => {
        const exercicio = await tx.exercicioFiscal.findFirst({
          where: { id: exercicioId, ...(empresaId ? { empresaId } : {}) },
          include: { periodos: { orderBy: { numero: 'asc' } } },
        });
        if (!exercicio) throw new NotFoundError('Exercício fiscal não encontrado.');
        if (exercicio.estado !== 'fechado') {
          throw new BusinessRuleError('Só exercícios encerrados podem ser reabertos.');
        }

        const execucaoFecho = await tx.execucaoFecho.findFirst({
          where: { exercicioId, tipo: 'fechoAnual', estado: 'executado' },
          orderBy: { iniciadoEm: 'desc' },
        });
        if (!execucaoFecho) {
          throw new BusinessRuleError('Não existe execução de fecho anual para reverter.');
        }

        const proximoAno = String(Number(exercicio.ano) + 1);
        const proximo = await tx.exercicioFiscal.findUnique({
          where: { empresaId_ano: { empresaId: exercicio.empresaId, ano: proximoAno } },
          include: { periodos: { orderBy: { numero: 'asc' } } },
        });

        let abertura: LancamentoAbertura | null = null;

        if (proximo) {
          const outros = await tx.lancamentoContabil.count({
            where: {
              empresaId: exercicio.empresaId,
              exercicioId: proximo.id,
              origem: { notIn: ['abertura', 'estorno'] },
            },
          });
          if (outros > 0) {
            throw new BusinessRuleError(
              'O exercício seguinte já tem lançamentos além da abertura e não pode ser revertido.'
            );
          }

          const rascunhos = await tx.lancamentoContabil.count({
            where: { empresaId: exercicio.empresaId, exercicioId: proximo.id, estado: 'rascunho' },
          });
          if (rascunhos > 0) {
            throw new BusinessRuleError('O exercício seguinte tem lançamentos em rascunho.');
          }

          abertura = await tx.lancamentoContabil.findFirst({
            where: { empresaId: exercicio.empresaId, exercicioId: proximo.id, origem: 'abertura' },
            include: { linhas: true },
          });
        }

        // Reverter a abertura: estornar o lançamento e marcar a execução.
        if (abertura && proximo) {
          if (abertura.estado === 'validado') {
            const diario = await tx.diarioContabil.findUniqueOrThrow({ where: { id: abertura.diarioId } });
            const estorno = await tx.lancamentoContabil.create({
              data: {
                empresaId: abertura.empresaId,
                diarioId: abertura.diarioId,
                exercicioId: abertura.exercicioId,
                periodoId: abertura.periodoId,
                dataContabilistica: abertura.dataContabilistica,
                descricao: `Estorno da abertura do exercício ${proximo.ano}`,
                origem: 'estorno',
                moduloOrigem: 'fecho-anual',
                tipoOrigem: 'exercicio',
                origemId: exercicioId,
                estornoDeId: abertura.id,
                criadoPorId: utilizadorId,
                totalDebito: abertura.totalCredito,
                totalCredito: abertura.totalDebito,
                linhas: {
                  create: abertura.linhas.map((l) => ({
                    numeroLinha: l.numeroLinha,
                    contaId: l.contaId,
                    debito: l.credito,
                    credito: l.debito,
                    entidadeTipo: l.entidadeTipo,
                    entidadeId: l.entidadeId,
                    descricao: `Estorno - ${l.descricao ?? 'abertura'}`,
                  })),
                },
              },
              select: { id: true },
            });

            const { sequenciaDiarioService } = await import('./sequencia-diario.service');
            const numero = await sequenciaDiarioService.proximoNumero(diario.id, abertura.exercicioId, tx);
            await tx.lancamentoContabil.update({
              where: { id: estorno.id },
              data: { numero, estado: 'validado', validadoPorId: utilizadorId, validadoEm: new Date() },
            });

            await tx.lancamentoContabil.update({
              where: { id: abertura.id },
              data: { estado: 'estornado' },
            });
          }

          await tx.execucaoFecho.updateMany({
            where: { exercicioId: proximo.id, tipo: 'aberturaExercicioSeguinte', estado: 'executado' },
            data: { estado: 'revertido' },
          });
        }

        await tx.execucaoFecho.update({
          where: { id: execucaoFecho.id },
          data: { estado: 'revertido' },
        });

        // Repor o estado anterior dos períodos, a partir do snapshot guardado.
        let snapshot: PeriodoSnapshot[] = [];
        try {
          const detalhes = execucaoFecho.detalhes ? JSON.parse(execucaoFecho.detalhes) : null;
          if (Array.isArray(detalhes?.periodosAnteriores)) {
            snapshot = detalhes.periodosAnteriores as PeriodoSnapshot[];
          }
        } catch {
          snapshot = [];
        }

        if (snapshot.length > 0) {
          for (const periodo of snapshot) {
            await tx.periodoContabil.update({
              where: { id: periodo.id },
              data: { estado: periodo.estado, fechadoEm: null, fechadoPorId: null },
            });
          }
        } else {
          // Sem snapshot, reabre apenas o último período.
          const ultimo = exercicio.periodos[exercicio.periodos.length - 1];
          if (ultimo) {
            await tx.periodoContabil.update({
              where: { id: ultimo.id },
              data: { estado: 'aberto', fechadoEm: null, fechadoPorId: null },
            });
          }
        }

        await tx.exercicioFiscal.update({
          where: { id: exercicioId },
          data: { estado: 'aberto', fechadoEm: null, fechadoPorId: null },
        });

        await tx.auditLog.create({
          data: {
            empresaId: exercicio.empresaId,
            utilizadorId,
            acao: 'reabrir',
            severidade: 'aviso',
            entidade: 'ExercicioFiscal',
            entidadeId: exercicioId,
            modulo: 'contabilidade',
            descricao: `Exercício ${exercicio.ano} reaberto: ${motivo}.`,
            dadosAnteriores: JSON.stringify({ estado: 'fechado', execucaoId: execucaoFecho.id }),
            dadosNovos: JSON.stringify({ estado: 'aberto', motivo, aberturaEstornadaId: abertura?.id ?? null }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
}

export const fechoAnualService = new FechoAnualService();
