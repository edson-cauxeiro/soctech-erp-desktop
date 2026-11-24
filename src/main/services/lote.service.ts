/**
 * @file lote.service.ts
 * @description Regras de negócio da gestão de lotes e validades (EPIC 8, TASK-041).
 *
 * Um lote é a unidade que dá rastreabilidade e validade ao stock: é por ele
 * que o FEFO decide o que sai primeiro e é a `dataValidade` que dispara o
 * alerta de caducidade. Este serviço trata do CRUD, garante que o número de
 * lote não colide dentro do artigo e que um lote com stock não é apagado.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarLoteSchema,
  actualizarLoteSchema,
  filtrosLoteSchema,
  CriarLoteInput,
  ActualizarLoteInput,
  FiltrosLoteInput,
} from '../validators/lote.validator';
import { NotFoundError, ConflictError, BusinessRuleError } from '../utils/errors';

const DIAS_ALERTA_DEFAULT = 90;

export interface LoteComRelacoes {
  id: string;
  artigoId: string;
  numeroLote: string;
  dataFabrico: Date | null;
  dataValidade: Date | null;
  fornecedorId: string | null;
  precoCusto: Prisma.Decimal | null;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LoteService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /** Antecedência do alerta de caducidade, lida da configuração da empresa. */
  private async obterDiasAlertaValidade(): Promise<number> {
    const config = await this.prisma.empresaConfig.findFirst({
      select: { diasAlertaValidade: true },
    });
    return config?.diasAlertaValidade ?? DIAS_ALERTA_DEFAULT;
  }

  /** Data limite a partir da qual um lote é considerado "a caducar". */
  private limiteAlerta(diasAlerta: number): Date {
    const limite = new Date();
    limite.setDate(limite.getDate() + diasAlerta);
    return limite;
  }

  /** Lista lotes com filtros de artigo, pesquisa e estado de validade. */
  async listar(rawFiltros?: unknown): Promise<{
    items: unknown[];
    total: number;
    skip: number;
    take: number;
  }> {
    const filtros: FiltrosLoteInput = filtrosLoteSchema.parse(rawFiltros ?? {});

    const where: Prisma.LoteWhereInput = {};

    if (filtros.artigoId) {
      where.artigoId = filtros.artigoId;
    }

    if (filtros.search) {
      where.OR = [
        { numeroLote: { contains: filtros.search, mode: 'insensitive' } },
        { artigo: { codigo: { contains: filtros.search, mode: 'insensitive' } } },
        { artigo: { descricao: { contains: filtros.search, mode: 'insensitive' } } },
      ];
    }

    if (filtros.estadoValidade) {
      const agora = new Date();
      const limite = this.limiteAlerta(await this.obterDiasAlertaValidade());
      switch (filtros.estadoValidade) {
        case 'sem_validade':
          where.dataValidade = null;
          break;
        case 'caducado':
          where.dataValidade = { lt: agora };
          break;
        case 'proximo_caducar':
          where.dataValidade = { gte: agora, lte: limite };
          break;
        case 'valido':
          where.OR = [
            { dataValidade: null },
            { dataValidade: { gt: limite } },
          ];
          break;
      }
    }

    const skip = filtros.skip ?? 0;
    const take = filtros.take ?? 50;

    const [items, total] = await Promise.all([
      this.prisma.lote.findMany({
        where,
        include: {
          artigo: {
            select: { id: true, codigo: true, descricao: true, unidade: true },
          },
          fornecedor: { select: { id: true, nome: true } },
        },
        orderBy: [{ dataValidade: 'asc' }, { numeroLote: 'asc' }],
        skip,
        take,
      }),
      this.prisma.lote.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  /** Um lote, com artigo e fornecedor carregados. */
  async obterPorId(id: string) {
    const lote = await this.prisma.lote.findUnique({
      where: { id },
      include: {
        artigo: {
          select: { id: true, codigo: true, descricao: true, unidade: true },
        },
        fornecedor: { select: { id: true, nome: true } },
      },
    });
    if (!lote) {
      throw new NotFoundError(`Lote com ID '${id}' não encontrado.`);
    }
    return lote;
  }

  /** Cria um lote, garantindo artigo existente e número único dentro dele. */
  async criar(rawInput: unknown) {
    const data: CriarLoteInput = criarLoteSchema.parse(rawInput);

    const artigo = await this.prisma.artigo.findUnique({
      where: { id: data.artigoId },
      select: { id: true, codigo: true },
    });
    if (!artigo) {
      throw new NotFoundError(`Artigo com ID '${data.artigoId}' não encontrado.`);
    }

    if (data.fornecedorId) {
      const fornecedor = await this.prisma.fornecedor.findUnique({
        where: { id: data.fornecedorId },
        select: { id: true },
      });
      if (!fornecedor) {
        throw new NotFoundError(`Fornecedor com ID '${data.fornecedorId}' não encontrado.`);
      }
    }

    const existente = await this.prisma.lote.findUnique({
      where: {
        artigoId_numeroLote: { artigoId: data.artigoId, numeroLote: data.numeroLote },
      },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictError(
        `O artigo '${artigo.codigo}' já tem o lote '${data.numeroLote}'.`
      );
    }

    return this.prisma.lote.create({
      data: {
        artigoId: data.artigoId,
        numeroLote: data.numeroLote,
        dataFabrico: data.dataFabrico ?? null,
        dataValidade: data.dataValidade ?? null,
        fornecedorId: data.fornecedorId ?? null,
        precoCusto: data.precoCusto === null ? null : new Prisma.Decimal(data.precoCusto),
        observacoes: data.observacoes ?? null,
      },
    });
  }

  /** Actualiza os dados editáveis de um lote. `artigoId` é imutável. */
  async actualizar(id: string, rawInput: unknown) {
    const data: ActualizarLoteInput = actualizarLoteSchema.parse(rawInput);

    const lote = await this.prisma.lote.findUnique({ where: { id } });
    if (!lote) {
      throw new NotFoundError(`Lote com ID '${id}' não encontrado.`);
    }

    if (data.numeroLote && data.numeroLote !== lote.numeroLote) {
      const existente = await this.prisma.lote.findUnique({
        where: {
          artigoId_numeroLote: {
            artigoId: lote.artigoId,
            numeroLote: data.numeroLote,
          },
        },
        select: { id: true },
      });
      if (existente && existente.id !== id) {
        throw new ConflictError(
          `Já existe o lote '${data.numeroLote}' para este artigo.`
        );
      }
    }

    if (data.fornecedorId) {
      const fornecedor = await this.prisma.fornecedor.findUnique({
        where: { id: data.fornecedorId },
        select: { id: true },
      });
      if (!fornecedor) {
        throw new NotFoundError(`Fornecedor com ID '${data.fornecedorId}' não encontrado.`);
      }
    }

    return this.prisma.lote.update({
      where: { id },
      data: {
        ...(data.numeroLote !== undefined && { numeroLote: data.numeroLote }),
        ...(data.dataFabrico !== undefined && { dataFabrico: data.dataFabrico }),
        ...(data.dataValidade !== undefined && { dataValidade: data.dataValidade }),
        ...(data.fornecedorId !== undefined && { fornecedorId: data.fornecedorId }),
        ...(data.precoCusto !== undefined && {
          precoCusto: data.precoCusto === null ? null : new Prisma.Decimal(data.precoCusto),
        }),
        ...(data.observacoes !== undefined && { observacoes: data.observacoes }),
      },
    });
  }

  /**
   * Elimina um lote.
   *
   * Recusa-se a apagar um lote com saldo (`estoques`) a apontar para ele: o
   * stock desapareceria sem um movimento que o justificasse. Um lote já sem
   * stock pode ser apagado — os movimentos históricos ficam com `loteId` nulo
   * (`onDelete: SetNull`).
   */
  async remover(id: string): Promise<{ id: string }> {
    const lote = await this.prisma.lote.findUnique({
      where: { id },
      select: { id: true, numeroLote: true },
    });
    if (!lote) {
      throw new NotFoundError(`Lote com ID '${id}' não encontrado.`);
    }

    const comStock = await this.prisma.estoque.count({ where: { loteId: id } });
    if (comStock > 0) {
      throw new BusinessRuleError(
        `O lote '${lote.numeroLote}' tem ${comStock} posição(ões) de stock. Esvazie-o primeiro.`
      );
    }

    await this.prisma.lote.delete({ where: { id } });
    return { id };
  }
}

export const loteService = new LoteService();