/**
 * @file fornecedor.service.ts
 * @description Serviço de regras de negócio para Fornecedores (RF05).
 */

import { PrismaClient, Fornecedor, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  createFornecedorSchema,
  updateFornecedorSchema,
  fornecedorFiltersSchema,
  CreateFornecedorInput,
  UpdateFornecedorInput,
  FornecedorFilters,
} from '../validators/fornecedor.validator';
import { ConflictError, NotFoundError } from '../utils/errors';

export class FornecedorService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista fornecedores com base em filtros de pesquisa, estado e paginação.
   */
  async listFornecedores(filters?: unknown): Promise<{ items: Fornecedor[]; total: number }> {
    const validatedFilters: FornecedorFilters = filters
      ? fornecedorFiltersSchema.parse(filters)
      : { skip: 0, take: 100 };

    const where: Prisma.FornecedorWhereInput = {};

    if (validatedFilters.search) {
      const search = validatedFilters.search;
      where.OR = [
        { codigo: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
        { nif: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { telefone: { contains: search, mode: 'insensitive' } },
        { iban: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (validatedFilters.estado) {
      where.estado = validatedFilters.estado;
    }

    const [items, total] = await Promise.all([
      this.prisma.fornecedor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: validatedFilters.skip,
        take: validatedFilters.take,
      }),
      this.prisma.fornecedor.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Obtém um fornecedor pelo seu ID.
   */
  async getFornecedor(id: string): Promise<Fornecedor> {
    const fornecedor = await this.prisma.fornecedor.findUnique({
      where: { id },
    });

    if (!fornecedor) {
      throw new NotFoundError(`Fornecedor com ID '${id}' não encontrado.`);
    }

    return fornecedor;
  }

  /**
   * Cria um novo fornecedor.
   */
  async createFornecedor(rawInput: unknown): Promise<Fornecedor> {
    const data: CreateFornecedorInput = createFornecedorSchema.parse(rawInput);

    const existingCode = await this.prisma.fornecedor.findUnique({
      where: { codigo: data.codigo },
    });
    if (existingCode) {
      throw new ConflictError(`Já existe um fornecedor registado com o código '${data.codigo}'.`);
    }

    return this.prisma.fornecedor.create({
      data: {
        codigo: data.codigo,
        nome: data.nome,
        nif: data.nif,
        endereco: data.endereco,
        telefone: data.telefone ?? null,
        email: data.email || null,
        condPagamento: data.condPagamento ?? null,
        iban: data.iban ?? null,
        prazoEntregaDias: data.prazoEntregaDias,
        estado: data.estado,
        retencaoFonte: data.retencaoFonte ?? 0,
      },
    });
  }

  /**
   * Atualiza um fornecedor existente.
   */
  async updateFornecedor(id: string, rawInput: unknown): Promise<Fornecedor> {
    const data: UpdateFornecedorInput = updateFornecedorSchema.parse(rawInput);

    const existing = await this.prisma.fornecedor.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundError(`Fornecedor com ID '${id}' não encontrado.`);
    }

    if (data.codigo && data.codigo !== existing.codigo) {
      const codeInUse = await this.prisma.fornecedor.findUnique({
        where: { codigo: data.codigo },
      });
      if (codeInUse) {
        throw new ConflictError(`Já existe um fornecedor registado com o código '${data.codigo}'.`);
      }
    }

    return this.prisma.fornecedor.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.nif !== undefined && { nif: data.nif }),
        ...(data.endereco !== undefined && { endereco: data.endereco }),
        ...(data.telefone !== undefined && { telefone: data.telefone }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.condPagamento !== undefined && { condPagamento: data.condPagamento }),
        ...(data.iban !== undefined && { iban: data.iban }),
        ...(data.prazoEntregaDias !== undefined && { prazoEntregaDias: data.prazoEntregaDias }),
        ...(data.estado !== undefined && { estado: data.estado }),
        ...(data.retencaoFonte !== undefined && { retencaoFonte: data.retencaoFonte ?? 0 }),
      },
    });
  }

  /**
   * Remove um fornecedor.
   */
  async deleteFornecedor(id: string): Promise<{ deleted: boolean; message: string }> {
    const existing = await this.prisma.fornecedor.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Fornecedor com ID '${id}' não encontrado.`);
    }

    await this.prisma.fornecedor.delete({ where: { id } });
    return {
      deleted: true,
      message: 'Fornecedor removido com sucesso.',
    };
  }
}

export const fornecedorService = new FornecedorService();
