/**
 * @file conta-contabil.service.ts
 * @description CRUD e árvore do plano de contas (PGC Angola).
 *
 * Duas invariantes que o serviço protege:
 *  1. Uma conta com filhas nunca aceita movimento. Ao criar a primeira filha,
 *     o pai é automaticamente convertido em conta de agregação.
 *  2. Uma conta com filhas, conta bancária associada ou mapeamento não pode
 *     ser eliminada. Apagar o pai deixaria filhos órfãos e apagar uma conta
 *     mapeada só rebentaria no próximo fecho.
 */

import { PrismaClient, Prisma, ContaContabil } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarContaContabilSchema,
  atualizarContaContabilSchema,
  contaContabilFiltersSchema,
  CriarContaContabilInput,
  AtualizarContaContabilInput,
  ContaContabilFilters,
} from '../validators/contabilidade.validator';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';

export type ContaContabilComFilhas = ContaContabil & {
  filhas: ContaContabilComFilhas[];
};

export interface ContaContabilListaItem extends ContaContabil {
  pai?: { id: string; codigo: string; designacao: string } | null;
  _count?: { filhas: number };
}

export class ContaContabilService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /** Valida o código e devolve a classe/nível derivados. */
  static validarCodigo(codigo: string): { classe: number; nivel: number } {
    if (!/^[1-8][0-9]{0,9}$/.test(codigo)) {
      throw new ValidationError(
        'O código da conta deve começar por 1–8 e conter apenas dígitos (máx. 10).'
      );
    }
    return { classe: Number(codigo[0]), nivel: codigo.length };
  }

  async list(filters?: unknown): Promise<{ items: ContaContabilListaItem[]; total: number }> {
    const f: ContaContabilFilters = filters ? contaContabilFiltersSchema.parse(filters) : {};

    const where: Prisma.ContaContabilWhereInput = {};
    if (f.empresaId) where.empresaId = f.empresaId;
    if (f.classe) where.classe = f.classe;
    if (f.tipo) where.tipo = f.tipo;
    if (f.activa !== undefined) where.activa = f.activa;
    if (f.apenasFolhas) where.aceitaMovimento = true;
    else if (f.aceitaMovimento !== undefined) where.aceitaMovimento = f.aceitaMovimento;
    if (f.search) {
      const s = f.search;
      where.OR = [
        { codigo: { contains: s, mode: 'insensitive' } },
        { designacao: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contaContabil.findMany({
        where,
        orderBy: { codigo: 'asc' },
        include: {
          pai: { select: { id: true, codigo: true, designacao: true } },
          _count: { select: { filhas: true } },
        },
      }),
      this.prisma.contaContabil.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Devolve a árvore completa da empresa. A lista já vem ordenada por código,
   * por isso os filhos de cada nó ficam na ordem em que aparecem no plano.
   */
  async arvore(empresaId: string): Promise<ContaContabilComFilhas[]> {
    if (!empresaId) throw new ValidationError('A empresa é obrigatória.');

    const contas = await this.prisma.contaContabil.findMany({
      where: { empresaId },
      orderBy: { codigo: 'asc' },
    });

    const porId = new Map<string, ContaContabilComFilhas>();
    for (const conta of contas) {
      porId.set(conta.id, { ...conta, filhas: [] });
    }

    const raizes: ContaContabilComFilhas[] = [];
    for (const conta of contas) {
      const no = porId.get(conta.id)!;
      if (conta.contaPaiId && porId.has(conta.contaPaiId)) {
        porId.get(conta.contaPaiId)!.filhas.push(no);
      } else {
        raizes.push(no);
      }
    }

    return raizes;
  }

  async get(id: string) {
    const conta = await this.prisma.contaContabil.findUnique({
      where: { id },
      include: {
        pai: { select: { id: true, codigo: true, designacao: true } },
        filhas: { select: { id: true, codigo: true, designacao: true }, orderBy: { codigo: 'asc' } },
        contaBancaria: { select: { id: true, codigo: true, designacao: true } },
        mapeamentos: { select: { id: true, chave: true } },
      },
    });
    if (!conta) throw new NotFoundError(`Conta contabilística '${id}' não encontrada.`);
    return conta;
  }

  private async exigirEmpresa(empresaId: string): Promise<void> {
    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundError('Empresa não encontrada.');
  }

  /**
   * Resolve o pai. Com `contaPaiId` explícito, valida que é da mesma empresa e
   * que o código é um prefixo. Sem ele, procura o prefixo mais longo existente
   * — é o que permite criar "3111" e cair automaticamente em "311".
   */
  private async resolverPai(
    empresaId: string,
    codigo: string,
    contaPaiId?: string | null,
    idAtual?: string
  ): Promise<{ id: string; codigo: string; aceitaMovimento: boolean } | null> {
    if (contaPaiId) {
      const pai = await this.prisma.contaContabil.findUnique({
        where: { id: contaPaiId },
        select: { id: true, codigo: true, aceitaMovimento: true, empresaId: true },
      });
      if (!pai || pai.empresaId !== empresaId) {
        throw new NotFoundError('A conta pai indicada não existe nesta empresa.');
      }
      if (pai.id === idAtual) {
        throw new ValidationError('Uma conta não pode ser pai de si própria.');
      }
      if (!codigo.startsWith(pai.codigo) || codigo === pai.codigo) {
        throw new ValidationError(
          `O código "${codigo}" não é descendente do pai "${pai.codigo}".`
        );
      }
      return pai;
    }

    const prefixos: string[] = [];
    for (let i = codigo.length - 1; i >= 1; i--) {
      prefixos.push(codigo.slice(0, i));
    }
    if (prefixos.length === 0) return null;

    const candidatos = await this.prisma.contaContabil.findMany({
      where: { empresaId, codigo: { in: prefixos } },
      select: { id: true, codigo: true, aceitaMovimento: true },
    });
    const porCodigo = new Map(candidatos.map((c) => [c.codigo, c]));
    for (const prefixo of prefixos) {
      const pai = porCodigo.get(prefixo);
      if (pai) return pai;
    }
    return null;
  }

  async criar(rawInput: unknown): Promise<ContaContabil> {
    const input: CriarContaContabilInput = criarContaContabilSchema.parse(rawInput);
    await this.exigirEmpresa(input.empresaId);

    const codigo = input.codigo.trim();
    const { classe, nivel } = ContaContabilService.validarCodigo(codigo);

    const duplicada = await this.prisma.contaContabil.findUnique({
      where: { empresaId_codigo: { empresaId: input.empresaId, codigo } },
      select: { id: true },
    });
    if (duplicada) {
      throw new ConflictError(
        `Já existe uma conta com o código "${codigo}" nesta empresa.`
      );
    }

    const pai = await this.resolverPai(input.empresaId, codigo, input.contaPaiId);

    return this.prisma.$transaction(async (tx) => {
      if (pai?.aceitaMovimento) {
        await tx.contaContabil.update({
          where: { id: pai.id },
          data: { aceitaMovimento: false },
        });
      }

      return tx.contaContabil.create({
        data: {
          empresaId: input.empresaId,
          codigo,
          designacao: input.designacao.trim(),
          contaPaiId: pai?.id ?? null,
          nivel,
          classe,
          tipo: input.tipo,
          natureza: input.natureza,
          aceitaMovimento: input.aceitaMovimento,
          exigeCentroCusto: input.exigeCentroCusto,
          exigeEntidade: input.exigeEntidade,
          activa: input.activa,
        },
        include: {
          pai: { select: { id: true, codigo: true, designacao: true } },
        },
      });
    });
  }

  async atualizar(id: string, rawInput: unknown): Promise<ContaContabil> {
    const input: AtualizarContaContabilInput = atualizarContaContabilSchema.parse(rawInput);

    const existente = await this.prisma.contaContabil.findUnique({
      where: { id },
      include: { _count: { select: { filhas: true } } },
    });
    if (!existente) throw new NotFoundError(`Conta contabilística '${id}' não encontrada.`);

    if (input.aceitaMovimento === true && existente._count.filhas > 0) {
      throw new BusinessRuleError(
        'Uma conta com contas filhas não pode aceitar movimento. Use uma conta folha.'
      );
    }

    let pai: { id: string; codigo: string; aceitaMovimento: boolean } | null = null;
    if (input.contaPaiId !== undefined) {
      pai = await this.resolverPai(existente.empresaId, existente.codigo, input.contaPaiId, id);
    }

    const data: Prisma.ContaContabilUpdateInput = {};
    if (input.designacao !== undefined) data.designacao = input.designacao.trim();
    if (input.tipo !== undefined) data.tipo = input.tipo;
    if (input.natureza !== undefined) data.natureza = input.natureza;
    if (input.aceitaMovimento !== undefined) data.aceitaMovimento = input.aceitaMovimento;
    if (input.exigeCentroCusto !== undefined) data.exigeCentroCusto = input.exigeCentroCusto;
    if (input.exigeEntidade !== undefined) data.exigeEntidade = input.exigeEntidade;
    if (input.activa !== undefined) data.activa = input.activa;
    if (input.contaPaiId !== undefined) {
      data.pai = pai ? { connect: { id: pai.id } } : { disconnect: true };
    }

    return this.prisma.$transaction(async (tx) => {
      if (pai?.aceitaMovimento) {
        await tx.contaContabil.update({
          where: { id: pai.id },
          data: { aceitaMovimento: false },
        });
      }

      return tx.contaContabil.update({
        where: { id },
        data,
        include: {
          pai: { select: { id: true, codigo: true, designacao: true } },
        },
      });
    });
  }

  async remover(id: string): Promise<void> {
    const existente = await this.prisma.contaContabil.findUnique({
      where: { id },
      include: {
        contaBancaria: { select: { id: true, codigo: true } },
        _count: { select: { filhas: true, mapeamentos: true, linhasLancamento: true } },
      },
    });
    if (!existente) throw new NotFoundError(`Conta contabilística '${id}' não encontrada.`);

    if (existente._count.filhas > 0) {
      throw new ConflictError(
        'Não é possível eliminar uma conta com contas filhas. Elimine ou mova primeiro as filhas.'
      );
    }
    if (existente.contaBancaria) {
      throw new ConflictError(
        `A conta está associada à conta bancária "${existente.contaBancaria.codigo}". Remova essa associação primeiro.`
      );
    }
    if (existente._count.mapeamentos > 0) {
      throw new ConflictError(
        'A conta está a ser usada por um ou mais mapeamentos. Altere ou remova os mapeamentos primeiro.'
      );
    }
    if (existente._count.linhasLancamento > 0) {
      throw new ConflictError(
        'A conta já tem linhas de lançamento e não pode ser eliminada. Desactive-a em vez disso.'
      );
    }

    await this.prisma.contaContabil.delete({ where: { id } });
  }
}

export const contaContabilService = new ContaContabilService();
