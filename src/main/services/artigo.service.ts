/**
 * @file artigo.service.ts
 * @description Serviço de regras de negócio para Artigos (Master Data 360° - RF01).
 * Implementa RN01.1 (Unicidade SKU/EAN), RN01.2 (Regras de Serviço) e RN01.4.
 */

import { PrismaClient, Artigo, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  createArtigoSchema,
  updateArtigoSchema,
  artigoFiltersSchema,
  CreateArtigoInput,
  UpdateArtigoInput,
  ArtigoFilters,
} from '../validators/artigo.validator';
import { ConflictError, NotFoundError } from '../utils/errors';

export class ArtigoService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista artigos com base em filtros de pesquisa, tipo, estado e paginação.
   */
  async listArtigos(filters?: unknown): Promise<{ items: Artigo[]; total: number }> {
    const validatedFilters: ArtigoFilters = filters
      ? artigoFiltersSchema.parse(filters)
      : { skip: 0, take: 100 };

    const where: Prisma.ArtigoWhereInput = {};

    if (validatedFilters.search) {
      const search = validatedFilters.search;
      where.OR = [
        { codigo: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
        { codigoBarras: { contains: search, mode: 'insensitive' } },
        { familia: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (validatedFilters.tipo) {
      where.tipo = validatedFilters.tipo;
    }

    if (validatedFilters.estado) {
      where.estado = validatedFilters.estado;
    }

    if (validatedFilters.familia) {
      where.familia = validatedFilters.familia;
    }

    const [items, total] = await Promise.all([
      this.prisma.artigo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: validatedFilters.skip,
        take: validatedFilters.take,
      }),
      this.prisma.artigo.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Obtém um artigo pelo seu ID.
   */
  async getArtigo(id: string): Promise<Artigo> {
    const artigo = await this.prisma.artigo.findUnique({
      where: { id },
    });

    if (!artigo) {
      throw new NotFoundError(`Artigo com ID '${id}' não encontrado.`);
    }

    return artigo;
  }

  /**
   * Obtém um artigo pelo seu código SKU.
   */
  async getArtigoByCodigo(codigo: string): Promise<Artigo | null> {
    return this.prisma.artigo.findUnique({
      where: { codigo },
    });
  }

  /**
   * Cria um novo artigo garantindo unicidade de SKU/EAN e regras de serviço.
   */
  async createArtigo(rawInput: unknown): Promise<Artigo> {
    const data: CreateArtigoInput = createArtigoSchema.parse(rawInput);

    // RN01.1: Unicidade global de SKU
    const existingSku = await this.prisma.artigo.findUnique({
      where: { codigo: data.codigo },
    });
    if (existingSku) {
      throw new ConflictError(`Já existe um artigo registado com o código SKU '${data.codigo}'.`);
    }

    // RN01.1: Unicidade global de Código de Barras (EAN) quando preenchido
    if (data.codigoBarras) {
      const existingEan = await this.prisma.artigo.findUnique({
        where: { codigoBarras: data.codigoBarras },
      });
      if (existingEan) {
        throw new ConflictError(
          `Já existe um artigo registado com o código de barras '${data.codigoBarras}'.`
        );
      }
    }

    return this.prisma.artigo.create({
      data: {
        codigo: data.codigo,
        descricao: data.descricao,
        tipo: data.tipo,
        unidade: data.unidade,
        familia: data.familia ?? null,
        codigoBarras: data.codigoBarras ?? null,
        estado: data.estado,
        precoVenda: data.precoVenda,
        taxaIva: data.taxaIva,
        fatorConversao: data.fatorConversao ?? 1.0,
        stockMinimo: data.stockMinimo ?? 0,
        stockMaximo: data.stockMaximo ?? 0,
        pontoEncomenda: data.pontoEncomenda ?? 0,
        controloLote: data.controloLote ?? false,
        armazemPadraoId: data.armazemPadraoId ?? null,
        precoCustoMedio: data.precoCustoMedio ?? 0,
        bom: data.bom ?? null,
        observacoes: data.observacoes ?? null,
      },
    });
  }

  /**
   * Atualiza um artigo existente.
   */
  async updateArtigo(id: string, rawInput: unknown): Promise<Artigo> {
    const data: UpdateArtigoInput = updateArtigoSchema.parse(rawInput);

    const existing = await this.prisma.artigo.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundError(`Artigo com ID '${id}' não encontrado.`);
    }

    // Se alterou SKU, verificar se o novo já existe
    if (data.codigo && data.codigo !== existing.codigo) {
      const skuInUse = await this.prisma.artigo.findUnique({
        where: { codigo: data.codigo },
      });
      if (skuInUse) {
        throw new ConflictError(`Já existe um artigo registado com o código SKU '${data.codigo}'.`);
      }
    }

    // Se alterou EAN, verificar se o novo já existe
    if (data.codigoBarras && data.codigoBarras !== existing.codigoBarras) {
      const eanInUse = await this.prisma.artigo.findUnique({
        where: { codigoBarras: data.codigoBarras },
      });
      if (eanInUse) {
        throw new ConflictError(
          `Já existe um artigo registado com o código de barras '${data.codigoBarras}'.`
        );
      }
    }

    return this.prisma.artigo.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.descricao !== undefined && { descricao: data.descricao }),
        ...(data.tipo !== undefined && { tipo: data.tipo }),
        ...(data.unidade !== undefined && { unidade: data.unidade }),
        ...(data.familia !== undefined && { familia: data.familia }),
        ...(data.codigoBarras !== undefined && { codigoBarras: data.codigoBarras }),
        ...(data.estado !== undefined && { estado: data.estado }),
        ...(data.precoVenda !== undefined && { precoVenda: data.precoVenda }),
        ...(data.taxaIva !== undefined && { taxaIva: data.taxaIva }),
        ...(data.fatorConversao !== undefined && { fatorConversao: data.fatorConversao ?? 1.0 }),
        ...(data.stockMinimo !== undefined && { stockMinimo: data.stockMinimo ?? 0 }),
        ...(data.stockMaximo !== undefined && { stockMaximo: data.stockMaximo ?? 0 }),
        ...(data.pontoEncomenda !== undefined && { pontoEncomenda: data.pontoEncomenda ?? 0 }),
        ...(data.controloLote !== undefined && { controloLote: data.controloLote }),
        ...(data.armazemPadraoId !== undefined && { armazemPadraoId: data.armazemPadraoId }),
        ...(data.precoCustoMedio !== undefined && { precoCustoMedio: data.precoCustoMedio ?? 0 }),
        ...(data.bom !== undefined && { bom: data.bom }),
        ...(data.observacoes !== undefined && { observacoes: data.observacoes }),
      },
    });
  }

  /**
   * Remove um artigo ou inativa-o se já possuir histórico de transações.
   */
  async deleteArtigo(id: string): Promise<{ deleted: boolean; inativado?: boolean; message: string }> {
    const existing = await this.prisma.artigo.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            linhasFaturaVenda: true,
            movimentosStock: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError(`Artigo com ID '${id}' não encontrado.`);
    }

    const hasHistory =
      (existing._count?.linhasFaturaVenda ?? 0) > 0 ||
      (existing._count?.movimentosStock ?? 0) > 0;

    if (hasHistory) {
      // RNF02: Integridade fiscal - inativa o artigo em vez de remover
      await this.prisma.artigo.update({
        where: { id },
        data: { estado: 'inativo' },
      });
      return {
        deleted: false,
        inativado: true,
        message: 'O artigo possui movimentos históricos fiscais/estoque e foi marcado como inativo.',
      };
    }

    await this.prisma.artigo.delete({ where: { id } });
    return {
      deleted: true,
      message: 'Artigo removido com sucesso.',
    };
  }
}

export const artigoService = new ArtigoService();
