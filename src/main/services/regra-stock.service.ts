/**
 * @file regra-stock.service.ts
 * @description Serviço de regras de Picking e Putaway (RF06).
 */

import { PrismaClient, RegraPicking, RegraPutaway } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  regraPickingSchema,
  regraPickingPartialSchema,
  regraPutawaySchema,
  regraPutawayPartialSchema,
  regraPickingFiltersSchema,
  regraPutawayFiltersSchema,
  RegraPickingInput,
  UpdateRegraPickingInput,
  RegraPutawayInput,
  UpdateRegraPutawayInput,
  RegraPickingFilters,
  RegraPutawayFilters,
} from '../validators/regra-stock.validator';
import { NotFoundError } from '../utils/errors';

export class RegraStockService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ── RegraPicking ──────────────────────────────────────────────────────────

  async createRegraPicking(rawInput: unknown): Promise<RegraPicking> {
    const data: RegraPickingInput = regraPickingSchema.parse(rawInput);

    // Verifica se armazém existe
    const armazem = await this.prisma.armazem.findUnique({ where: { id: data.armazemId } });
    if (!armazem) throw new NotFoundError(`Armazém '${data.armazemId}' não encontrado.`);

    // Se classe informada, verifica
    if (data.classeArmazenamentoId) {
      const classe = await this.prisma.classeArmazenamento.findUnique({
        where: { id: data.classeArmazenamentoId },
      });
      if (!classe) throw new NotFoundError(`Classe de armazenamento '${data.classeArmazenamentoId}' não encontrada.`);
    }

    // Se zona informada, verifica
    if (data.zonaId) {
      const zona = await this.prisma.armazemZona.findUnique({ where: { id: data.zonaId } });
      if (!zona) throw new NotFoundError(`Zona '${data.zonaId}' não encontrada.`);
    }

    return this.prisma.regraPicking.create({ data });
  }

  async updateRegraPicking(id: string, rawInput: unknown): Promise<RegraPicking> {
    const data: UpdateRegraPickingInput = regraPickingPartialSchema.parse(rawInput);

    const existente = await this.prisma.regraPicking.findUnique({ where: { id } });
    if (!existente) throw new NotFoundError(`Regra de picking '${id}' não encontrada.`);

    if (data.classeArmazenamentoId) {
      const classe = await this.prisma.classeArmazenamento.findUnique({
        where: { id: data.classeArmazenamentoId },
      });
      if (!classe) throw new NotFoundError(`Classe de armazenamento '${data.classeArmazenamentoId}' não encontrada.`);
    }

    if (data.zonaId) {
      const zona = await this.prisma.armazemZona.findUnique({ where: { id: data.zonaId } });
      if (!zona) throw new NotFoundError(`Zona '${data.zonaId}' não encontrada.`);
    }

    return this.prisma.regraPicking.update({ where: { id }, data });
  }

  async deleteRegraPicking(id: string): Promise<void> {
    const existente = await this.prisma.regraPicking.findUnique({ where: { id } });
    if (!existente) throw new NotFoundError(`Regra de picking '${id}' não encontrada.`);

    await this.prisma.regraPicking.delete({ where: { id } });
  }

  async listRegrasPicking(rawFilters?: unknown): Promise<{ items: RegraPicking[]; total: number }> {
    const filtros: RegraPickingFilters = rawFilters ? regraPickingFiltersSchema.parse(rawFilters) : { skip: 0, take: 100 };

    const where: any = {};
    if (filtros.armazemId) where.armazemId = filtros.armazemId;
    if (filtros.classeArmazenamentoId) where.classeArmazenamentoId = filtros.classeArmazenamentoId;
    if (filtros.zonaId) where.zonaId = filtros.zonaId;
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;

    const [items, total] = await Promise.all([
      this.prisma.regraPicking.findMany({
        where,
        skip: filtros.skip,
        take: filtros.take,
        orderBy: { prioridade: 'asc' },
        include: { armazem: true, classeArmazenamento: true, zona: true },
      }),
      this.prisma.regraPicking.count({ where }),
    ]);

    return { items, total };
  }

  // ── RegraPutaway ──────────────────────────────────────────────────────────

  async createRegraPutaway(rawInput: unknown): Promise<RegraPutaway> {
    const data: RegraPutawayInput = regraPutawaySchema.parse(rawInput);

    const armazem = await this.prisma.armazem.findUnique({ where: { id: data.armazemId } });
    if (!armazem) throw new NotFoundError(`Armazém '${data.armazemId}' não encontrado.`);

    if (data.classeArmazenamentoId) {
      const classe = await this.prisma.classeArmazenamento.findUnique({ where: { id: data.classeArmazenamentoId } });
      if (!classe) throw new NotFoundError(`Classe de armazenamento '${data.classeArmazenamentoId}' não encontrada.`);
    }

    if (data.zonaId) {
      const zona = await this.prisma.armazemZona.findUnique({ where: { id: data.zonaId } });
      if (!zona) throw new NotFoundError(`Zona '${data.zonaId}' não encontrada.`);
    }

    return this.prisma.regraPutaway.create({ data });
  }

  async updateRegraPutaway(id: string, rawInput: unknown): Promise<RegraPutaway> {
    const data: UpdateRegraPutawayInput = regraPutawayPartialSchema.parse(rawInput);

    const existente = await this.prisma.regraPutaway.findUnique({ where: { id } });
    if (!existente) throw new NotFoundError(`Regra de putaway '${id}' não encontrada.`);

    if (data.classeArmazenamentoId) {
      const classe = await this.prisma.classeArmazenamento.findUnique({ where: { id: data.classeArmazenamentoId } });
      if (!classe) throw new NotFoundError(`Classe de armazenamento '${data.classeArmazenamentoId}' não encontrada.`);
    }

    if (data.zonaId) {
      const zona = await this.prisma.armazemZona.findUnique({ where: { id: data.zonaId } });
      if (!zona) throw new NotFoundError(`Zona '${data.zonaId}' não encontrada.`);
    }

    return this.prisma.regraPutaway.update({ where: { id }, data });
  }

  async deleteRegraPutaway(id: string): Promise<void> {
    const existente = await this.prisma.regraPutaway.findUnique({ where: { id } });
    if (!existente) throw new NotFoundError(`Regra de putaway '${id}' não encontrada.`);

    await this.prisma.regraPutaway.delete({ where: { id } });
  }

  async listRegrasPutaway(rawFilters?: unknown): Promise<{ items: RegraPutaway[]; total: number }> {
    const filtros: RegraPutawayFilters = rawFilters ? regraPutawayFiltersSchema.parse(rawFilters) : { skip: 0, take: 100 };

    const where: any = {};
    if (filtros.armazemId) where.armazemId = filtros.armazemId;
    if (filtros.classeArmazenamentoId) where.classeArmazenamentoId = filtros.classeArmazenamentoId;
    if (filtros.zonaId) where.zonaId = filtros.zonaId;
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;

    const [items, total] = await Promise.all([
      this.prisma.regraPutaway.findMany({
        where,
        skip: filtros.skip,
        take: filtros.take,
        orderBy: { prioridade: 'asc' },
        include: { armazem: true, classeArmazenamento: true, zona: true },
      }),
      this.prisma.regraPutaway.count({ where }),
    ]);

    return { items, total };
  }
}

export const regraStockService = new RegraStockService();