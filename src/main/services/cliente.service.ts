/**
 * @file cliente.service.ts
 * @description Serviço de regras de negócio para Clientes (RF02).
 * Implementa RN02.1 (Validação NIF) e RN02.2 (Limite de Crédito).
 */

import { PrismaClient, Cliente, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  createClienteSchema,
  updateClienteSchema,
  clienteFiltersSchema,
  CreateClienteInput,
  UpdateClienteInput,
  ClienteFilters,
} from '../validators/cliente.validator';
import { ConflictError, NotFoundError } from '../utils/errors';

export class ClienteService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista clientes com base em filtros de pesquisa, tipo, estado e paginação.
   */
  async listClientes(filters?: unknown): Promise<{ items: Cliente[]; total: number }> {
    const validatedFilters: ClienteFilters = filters
      ? clienteFiltersSchema.parse(filters)
      : { skip: 0, take: 100 };

    const where: Prisma.ClienteWhereInput = {};

    if (validatedFilters.search) {
      const search = validatedFilters.search;
      where.OR = [
        { codigo: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
        { nif: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { telefone: { contains: search, mode: 'insensitive' } },
        { cidade: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (validatedFilters.tipo) {
      where.tipo = validatedFilters.tipo;
    }

    if (validatedFilters.estado) {
      where.estado = validatedFilters.estado;
    }

    const [items, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: validatedFilters.skip,
        take: validatedFilters.take,
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Obtém um cliente pelo seu ID.
   */
  async getCliente(id: string): Promise<Cliente> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
    });

    if (!cliente) {
      throw new NotFoundError(`Cliente com ID '${id}' não encontrado.`);
    }

    return cliente;
  }

  /**
   * Obtém um cliente pelo seu código.
   */
  async getClienteByCodigo(codigo: string): Promise<Cliente | null> {
    return this.prisma.cliente.findUnique({
      where: { codigo },
    });
  }

  /**
   * Cria um novo cliente com validação de unicidade de código e NIF.
   */
  async createCliente(rawInput: unknown): Promise<Cliente> {
    const data: CreateClienteInput = createClienteSchema.parse(rawInput);

    const existingCode = await this.prisma.cliente.findUnique({
      where: { codigo: data.codigo },
    });
    if (existingCode) {
      throw new ConflictError(`Já existe um cliente registado com o código '${data.codigo}'.`);
    }

    return this.prisma.cliente.create({
      data: {
        codigo: data.codigo,
        nome: data.nome,
        nif: data.nif,
        tipo: data.tipo,
        endereco: data.endereco,
        codigoPostal: data.codigoPostal ?? null,
        cidade: data.cidade ?? null,
        pais: data.pais,
        telefone: data.telefone ?? null,
        email: data.email || null,
        condPagamento: data.condPagamento ?? null,
        metodoPagamento: data.metodoPagamento ?? null,
        limiteCredito: data.limiteCredito,
        descontoPadrao: data.descontoPadrao,
        moeda: data.moeda,
        vendedor: data.vendedor ?? null,
        estado: data.estado,
        regimeIva: data.regimeIva,
        retencaoFonte: data.retencaoFonte ?? 0,
        observacoes: data.observacoes ?? null,
      },
    });
  }

  /**
   * Atualiza um cliente existente.
   */
  async updateCliente(id: string, rawInput: unknown): Promise<Cliente> {
    const data: UpdateClienteInput = updateClienteSchema.parse(rawInput);

    const existing = await this.prisma.cliente.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundError(`Cliente com ID '${id}' não encontrado.`);
    }

    if (data.codigo && data.codigo !== existing.codigo) {
      const codeInUse = await this.prisma.cliente.findUnique({
        where: { codigo: data.codigo },
      });
      if (codeInUse) {
        throw new ConflictError(`Já existe um cliente registado com o código '${data.codigo}'.`);
      }
    }

    return this.prisma.cliente.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.nif !== undefined && { nif: data.nif }),
        ...(data.tipo !== undefined && { tipo: data.tipo }),
        ...(data.endereco !== undefined && { endereco: data.endereco }),
        ...(data.codigoPostal !== undefined && { codigoPostal: data.codigoPostal }),
        ...(data.cidade !== undefined && { cidade: data.cidade }),
        ...(data.pais !== undefined && { pais: data.pais }),
        ...(data.telefone !== undefined && { telefone: data.telefone }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.condPagamento !== undefined && { condPagamento: data.condPagamento }),
        ...(data.metodoPagamento !== undefined && { metodoPagamento: data.metodoPagamento }),
        ...(data.limiteCredito !== undefined && { limiteCredito: data.limiteCredito }),
        ...(data.descontoPadrao !== undefined && { descontoPadrao: data.descontoPadrao }),
        ...(data.moeda !== undefined && { moeda: data.moeda }),
        ...(data.vendedor !== undefined && { vendedor: data.vendedor }),
        ...(data.estado !== undefined && { estado: data.estado }),
        ...(data.regimeIva !== undefined && { regimeIva: data.regimeIva }),
        ...(data.retencaoFonte !== undefined && { retencaoFonte: data.retencaoFonte ?? 0 }),
        ...(data.observacoes !== undefined && { observacoes: data.observacoes }),
      },
    });
  }

  /**
   * Remove um cliente ou inativa-o se já possuir documentos fiscais emitidos.
   */
  async deleteCliente(id: string): Promise<{ deleted: boolean; inativado?: boolean; message: string }> {
    const existing = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            faturasVenda: true,
            recibosVenda: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError(`Cliente com ID '${id}' não encontrado.`);
    }

    const hasInvoices =
      (existing._count?.faturasVenda ?? 0) > 0 ||
      (existing._count?.recibosVenda ?? 0) > 0;

    if (hasInvoices) {
      // RNF02: Não remover cliente com histórico fiscal para preservar auditoria SAF-T
      await this.prisma.cliente.update({
        where: { id },
        data: { estado: 'inativo' },
      });
      return {
        deleted: false,
        inativado: true,
        message: 'O cliente possui faturas ou recibos emitidos e foi marcado como inativo.',
      };
    }

    await this.prisma.cliente.delete({ where: { id } });
    return {
      deleted: true,
      message: 'Cliente removido com sucesso.',
    };
  }
}

export const clienteService = new ClienteService();
