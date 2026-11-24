/**
 * @file mapeamento-conta.service.ts
 * @description Mapeamentos simbólicos entre o motor de contabilização e as
 * contas concretas do plano.
 *
 * A chave (`IVA_LIQUIDADO`, `CLIENTES`, `RESULTADO_LIQUIDO`...) é o contrato
 * estável. A conta é configuração por empresa. Trocar de conta não obriga a
 * mexer no código que gera lançamentos, e uma empresa pode usar um plano
 * diferente sem partir as outras.
 */

import { PrismaClient, MapeamentoConta } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  guardarMapeamentoContaSchema,
  mapeamentoContaFiltersSchema,
  GuardarMapeamentoContaInput,
  MapeamentoContaFilters,
} from '../validators/contabilidade.validator';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface MapeamentoContaComConta extends MapeamentoConta {
  conta: { id: string; codigo: string; designacao: string; aceitaMovimento: boolean };
}

export class MapeamentoContaService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  async list(filters?: unknown): Promise<{ items: MapeamentoContaComConta[]; total: number }> {
    const f: MapeamentoContaFilters = filters ? mapeamentoContaFiltersSchema.parse(filters) : {};

    const where = f.empresaId ? { empresaId: f.empresaId } : {};

    const [items, total] = await Promise.all([
      this.prisma.mapeamentoConta.findMany({
        where,
        orderBy: { chave: 'asc' },
        include: {
          conta: {
            select: { id: true, codigo: true, designacao: true, aceitaMovimento: true },
          },
        },
      }),
      this.prisma.mapeamentoConta.count({ where }),
    ]);

    return { items, total };
  }

  async get(id: string) {
    const mapeamento = await this.prisma.mapeamentoConta.findUnique({
      where: { id },
      include: { conta: true, empresa: { select: { id: true, nome: true } } },
    });
    if (!mapeamento) throw new NotFoundError(`Mapeamento '${id}' não encontrado.`);
    return mapeamento;
  }

  /**
   * Cria ou actualiza a conta de uma chave. A conta tem de ser da mesma empresa
   * e aceitar movimento: mapear para uma conta de agregação produziria
   * lançamentos que o próprio plano recusa.
   */
  async guardar(rawInput: unknown): Promise<MapeamentoContaComConta> {
    const input: GuardarMapeamentoContaInput = guardarMapeamentoContaSchema.parse(rawInput);

    const conta = await this.prisma.contaContabil.findUnique({
      where: { id: input.contaId },
      select: { id: true, empresaId: true, codigo: true, aceitaMovimento: true, activa: true },
    });
    if (!conta) throw new NotFoundError('A conta indicada não existe.');
    if (conta.empresaId !== input.empresaId) {
      throw new ValidationError('A conta indicada pertence a outra empresa.');
    }
    if (!conta.activa) {
      throw new ValidationError(`A conta ${conta.codigo} está inactiva.`);
    }
    if (!conta.aceitaMovimento) {
      throw new ValidationError(
        `A conta ${conta.codigo} não aceita movimento. Escolha uma conta folha.`
      );
    }

    return this.prisma.mapeamentoConta.upsert({
      where: { empresaId_chave: { empresaId: input.empresaId, chave: input.chave } },
      update: { contaId: input.contaId },
      create: {
        empresaId: input.empresaId,
        chave: input.chave,
        contaId: input.contaId,
      },
      include: {
        conta: {
          select: { id: true, codigo: true, designacao: true, aceitaMovimento: true },
        },
      },
    });
  }

  async remover(id: string): Promise<void> {
    const existente = await this.prisma.mapeamentoConta.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError(`Mapeamento '${id}' não encontrado.`);
    await this.prisma.mapeamentoConta.delete({ where: { id } });
  }
}

export const mapeamentoContaService = new MapeamentoContaService();
