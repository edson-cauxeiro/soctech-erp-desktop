/**
 * @file diario-contabil.service.ts
 * @description CRUD dos diários contabilísticos (VD, CP, CX, BC, OD, AB, AP, LG).
 *
 * O código do diário é a chave que aparece no SAF-T e no extracto de
 * lançamentos; por isso é normalizado para maiúsculas e não muda depois de
 * criado. Um diário com sequências já emitidas não pode ser eliminado, para não
 * abrir buracos na numeração.
 */

import { PrismaClient, Prisma, DiarioContabil } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarDiarioContabilSchema,
  atualizarDiarioContabilSchema,
  diarioContabilFiltersSchema,
  CriarDiarioContabilInput,
  AtualizarDiarioContabilInput,
  DiarioContabilFilters,
} from '../validators/contabilidade.validator';
import { ConflictError, NotFoundError } from '../utils/errors';

export class DiarioContabilService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  async list(filters?: unknown): Promise<{ items: DiarioContabil[]; total: number }> {
    const f: DiarioContabilFilters = filters ? diarioContabilFiltersSchema.parse(filters) : {};

    const where: Prisma.DiarioContabilWhereInput = {};
    if (f.empresaId) where.empresaId = f.empresaId;
    if (f.tipo) where.tipo = f.tipo;
    if (f.activo !== undefined) where.activo = f.activo;
    if (f.search) {
      where.OR = [
        { codigo: { contains: f.search, mode: 'insensitive' } },
        { designacao: { contains: f.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.diarioContabil.findMany({
        where,
        orderBy: { codigo: 'asc' },
        include: { _count: { select: { sequencias: true } } },
      }),
      this.prisma.diarioContabil.count({ where }),
    ]);

    return { items, total };
  }

  async get(id: string) {
    const diario = await this.prisma.diarioContabil.findUnique({
      where: { id },
      include: {
        sequencias: {
          include: { exercicio: { select: { id: true, ano: true, estado: true } } },
          orderBy: { exercicio: { ano: 'desc' } },
        },
      },
    });
    if (!diario) throw new NotFoundError(`Diário contabilístico '${id}' não encontrado.`);
    return diario;
  }

  private async exigirEmpresa(empresaId: string): Promise<void> {
    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundError('Empresa não encontrada.');
  }

  async criar(rawInput: unknown): Promise<DiarioContabil> {
    const input: CriarDiarioContabilInput = criarDiarioContabilSchema.parse(rawInput);
    await this.exigirEmpresa(input.empresaId);

    const duplicado = await this.prisma.diarioContabil.findUnique({
      where: { empresaId_codigo: { empresaId: input.empresaId, codigo: input.codigo } },
      select: { id: true },
    });
    if (duplicado) {
      throw new ConflictError(`Já existe um diário com o código "${input.codigo}".`);
    }

    return this.prisma.diarioContabil.create({
      data: {
        empresaId: input.empresaId,
        codigo: input.codigo,
        designacao: input.designacao.trim(),
        tipo: input.tipo,
        activo: input.activo,
      },
    });
  }

  async atualizar(id: string, rawInput: unknown): Promise<DiarioContabil> {
    const input: AtualizarDiarioContabilInput = atualizarDiarioContabilSchema.parse(rawInput);

    const existente = await this.prisma.diarioContabil.findUnique({ where: { id } });
    if (!existente) throw new NotFoundError(`Diário contabilístico '${id}' não encontrado.`);

    const data: Prisma.DiarioContabilUpdateInput = {};
    if (input.designacao !== undefined) data.designacao = input.designacao.trim();
    if (input.tipo !== undefined) data.tipo = input.tipo;
    if (input.activo !== undefined) data.activo = input.activo;

    return this.prisma.diarioContabil.update({ where: { id }, data });
  }

  async remover(id: string): Promise<void> {
    const existente = await this.prisma.diarioContabil.findUnique({
      where: { id },
      include: { _count: { select: { sequencias: true } } },
    });
    if (!existente) throw new NotFoundError(`Diário contabilístico '${id}' não encontrado.`);

    if (existente._count.sequencias > 0) {
      throw new ConflictError(
        'Não é possível eliminar um diário que já tem numeração emitida. Desactive-o em vez de o apagar.'
      );
    }

    await this.prisma.diarioContabil.delete({ where: { id } });
  }
}

export const diarioContabilService = new DiarioContabilService();
