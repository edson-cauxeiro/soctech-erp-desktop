/**
 * @file periodo-contabil.service.ts
 * @description Períodos contabilísticos mensais de um exercício.
 *
 * O gerador trabalha em UTC e em meses de calendário. É isso que faz fevereiro
 * de 2024 terminar a 29 e fevereiro de 2023 a 28 sem casos especiais. Um
 * exercício que comece a meio do mês vê o primeiro período começar nesse dia,
 * para nunca haver movimentos antes da abertura.
 */

import { PrismaClient, Prisma, PeriodoContabil } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarPeriodoContabilSchema,
  periodoContabilFiltersSchema,
  alterarEstadoPeriodoSchema,
  CriarPeriodoContabilInput,
  PeriodoContabilFilters,
  AlterarEstadoPeriodoInput,
} from '../validators/contabilidade.validator';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';

export interface PeriodoGerado {
  numero: number;
  dataInicio: Date;
  dataFim: Date;
}

function semHora(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

/**
 * Gera até 12 períodos mensais entre `dataInicio` e `dataFim`.
 *
 * O limite de 12 é intencional: o PGC trabalha com doze meses. Um exercício
 * mais curto devolve menos períodos (não inventa meses fora do intervalo); um
 * exercício mais longo é truncado aos primeiros doze, e o período 13 fica
 * reservado a ajustes de fecho criados manualmente.
 */
export function gerarPeriodosContabeis(
  dataInicio: Date | string,
  dataFim: Date | string
): PeriodoGerado[] {
  const inicio = semHora(new Date(dataInicio));
  const fim = semHora(new Date(dataFim));

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new ValidationError('As datas do exercício são inválidas.');
  }
  if (fim < inicio) {
    throw new ValidationError('A data de fim do exercício não pode ser anterior à de início.');
  }

  const ano = inicio.getUTCFullYear();
  const mesInicial = inicio.getUTCMonth();
  const periodos: PeriodoGerado[] = [];

  for (let i = 0; i < 12; i++) {
    const primeiroDia = new Date(Date.UTC(ano, mesInicial + i, 1));
    const ultimoDia = new Date(Date.UTC(ano, mesInicial + i + 1, 0));
    const dataInicioPeriodo = primeiroDia < inicio ? inicio : primeiroDia;
    const dataFimPeriodo = ultimoDia > fim ? fim : ultimoDia;

    if (dataInicioPeriodo > dataFimPeriodo) continue;

    periodos.push({
      numero: i + 1,
      dataInicio: dataInicioPeriodo,
      dataFim: dataFimPeriodo,
    });
  }

  return periodos;
}

export class PeriodoContabilService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Cria os períodos em falta para um exercício. É idempotente e preenche
   * buracos: se uma execução anterior falhou a meio, a seguinte completa o que
   * falta sem duplicar os números já criados.
   */
  async criarPeriodosDoExercicio(exercicioId: string): Promise<PeriodoContabil[]> {
    const exercicio = await this.prisma.exercicioFiscal.findUnique({
      where: { id: exercicioId },
      select: { id: true, dataInicio: true, dataFim: true },
    });
    if (!exercicio) throw new NotFoundError('Exercício fiscal não encontrado.');

    const gerados = gerarPeriodosContabeis(exercicio.dataInicio, exercicio.dataFim);

    const existentes = await this.prisma.periodoContabil.findMany({
      where: { exercicioId },
      select: { numero: true },
    });
    const numeros = new Set(existentes.map((p) => p.numero));
    const faltam = gerados.filter((p) => !numeros.has(p.numero));

    if (faltam.length > 0) {
      await this.prisma.periodoContabil.createMany({
        data: faltam.map((p) => ({
          exercicioId,
          numero: p.numero,
          dataInicio: p.dataInicio,
          dataFim: p.dataFim,
          estado: 'aberto',
        })),
        skipDuplicates: true,
      });
    }

    return this.prisma.periodoContabil.findMany({
      where: { exercicioId },
      orderBy: { numero: 'asc' },
    });
  }

  async list(filters?: unknown): Promise<{ items: PeriodoContabil[]; total: number }> {
    const f: PeriodoContabilFilters = filters ? periodoContabilFiltersSchema.parse(filters) : {};

    const where: Prisma.PeriodoContabilWhereInput = {};
    if (f.exercicioId) where.exercicioId = f.exercicioId;
    if (f.estado) where.estado = f.estado;
    if (f.empresaId) where.exercicio = { empresaId: f.empresaId };

    const [items, total] = await Promise.all([
      this.prisma.periodoContabil.findMany({
        where,
        orderBy: [{ exercicio: { ano: 'desc' } }, { numero: 'asc' }],
        include: {
          exercicio: {
            select: { id: true, ano: true, dataInicio: true, dataFim: true, estado: true, empresaId: true },
          },
          fechadoPor: { select: { id: true, nomeCompleto: true, login: true } },
        },
      }),
      this.prisma.periodoContabil.count({ where }),
    ]);

    return { items, total };
  }

  async get(id: string) {
    const periodo = await this.prisma.periodoContabil.findUnique({
      where: { id },
      include: {
        exercicio: { select: { id: true, ano: true, dataInicio: true, dataFim: true, estado: true, empresaId: true } },
        fechadoPor: { select: { id: true, nomeCompleto: true, login: true } },
      },
    });
    if (!periodo) throw new NotFoundError(`Período contabilístico '${id}' não encontrado.`);
    return periodo;
  }

  async criar(rawInput: unknown): Promise<PeriodoContabil> {
    const input: CriarPeriodoContabilInput = criarPeriodoContabilSchema.parse(rawInput);

    const exercicio = await this.prisma.exercicioFiscal.findUnique({
      where: { id: input.exercicioId },
      select: { id: true, dataInicio: true, dataFim: true },
    });
    if (!exercicio) throw new NotFoundError('Exercício fiscal não encontrado.');

    if (input.dataInicio < exercicio.dataInicio || input.dataFim > exercicio.dataFim) {
      throw new ValidationError('O período tem de estar contido no exercício fiscal.');
    }

    const duplicado = await this.prisma.periodoContabil.findUnique({
      where: { exercicioId_numero: { exercicioId: input.exercicioId, numero: input.numero } },
      select: { id: true },
    });
    if (duplicado) {
      throw new ConflictError(`O período ${input.numero} já existe neste exercício.`);
    }

    return this.prisma.periodoContabil.create({
      data: {
        exercicioId: input.exercicioId,
        numero: input.numero,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        estado: 'aberto',
      },
    });
  }

  /**
   * Transições permitidas:
   *   aberto  → fechado | bloqueado
   *   fechado → aberto   | bloqueado
   *   bloqueado → aberto (só por quem tem permissão de escrita)
   *
   * `bloqueado` é mais forte do que `fechado`: nem uma reabertura normal o
   * move directamente para fechado. O objectivo é impedir que um fecho
   * definitivo seja desfeito por engano.
   */
  async alterarEstado(id: string, rawInput: unknown): Promise<PeriodoContabil> {
    const input: AlterarEstadoPeriodoInput = alterarEstadoPeriodoSchema.parse(rawInput);

    const periodo = await this.prisma.periodoContabil.findUnique({ where: { id } });
    if (!periodo) throw new NotFoundError(`Período contabilístico '${id}' não encontrado.`);

    if (periodo.estado === input.estado) return periodo;

    const permitido =
      (periodo.estado === 'aberto' && (input.estado === 'fechado' || input.estado === 'bloqueado')) ||
      (periodo.estado === 'fechado' && (input.estado === 'aberto' || input.estado === 'bloqueado')) ||
      (periodo.estado === 'bloqueado' && input.estado === 'aberto');

    if (!permitido) {
      throw new BusinessRuleError(
        `Não é possível passar o período de "${periodo.estado}" para "${input.estado}".`
      );
    }

    const estaAberto = input.estado === 'aberto';

    return this.prisma.periodoContabil.update({
      where: { id },
      data: {
        estado: input.estado,
        fechadoEm: estaAberto ? null : new Date(),
        fechadoPorId: estaAberto ? null : (input.utilizadorId ?? null),
      },
    });
  }

  async fechar(id: string, utilizadorId?: string): Promise<PeriodoContabil> {
    return this.alterarEstado(id, { estado: 'fechado', utilizadorId });
  }

  async reabrir(id: string, utilizadorId?: string): Promise<PeriodoContabil> {
    return this.alterarEstado(id, { estado: 'aberto', utilizadorId });
  }

  async bloquear(id: string, utilizadorId?: string): Promise<PeriodoContabil> {
    return this.alterarEstado(id, { estado: 'bloqueado', utilizadorId });
  }
}

export const periodoContabilService = new PeriodoContabilService();
