/**
 * @file warehouse.repository.ts
 * @description Acesso a dados de armazéns (EPIC 2, TASK-013).
 *
 * Camada fina: apenas persiste e lê. Não valida e não decide nada — a validação
 * Zod corre dentro do service, como em `stock.service.ts:232`.
 *
 * Todas as operações aceitam uma transacção opcional em último argumento, para
 * que um service possa compor várias chamadas dentro do mesmo
 * `$transaction` sem perder a atomicidade.
 */

import {
  type Prisma,
  type PrismaClient,
  type Armazem,
  type TipoArmazem,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';

/** Cliente Prisma ou o cliente já isolado dentro de uma transacção. */
type Cliente = Prisma.TransactionClient | PrismaClient;

/** Filtros de `findAll`, todos opcionais. */
export interface FiltrosArmazem {
  ativo?: boolean;
  empresaId?: string;
  tipo?: TipoArmazem;
  isDefaultVendas?: boolean;
  isDefaultCompras?: boolean;
  search?: string;
  skip?: number;
  take?: number;
  /** Aceita uma lista para ordenação por várias colunas, como a de `listArmazens`. */
  orderBy?:
    | Prisma.ArmazemOrderByWithRelationInput
    | Prisma.ArmazemOrderByWithRelationInput[];
}

export type DadosArmazem = Omit<
  Prisma.ArmazemUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
>;

export type DadosActualizacaoArmazem = Prisma.ArmazemUncheckedUpdateInput;

export class ArmazemRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /** Sem `tx`, usa o cliente global. */
  private cliente(tx?: Prisma.TransactionClient): Cliente {
    return tx ?? this.prisma;
  }

  async create(dados: DadosArmazem, tx?: Prisma.TransactionClient): Promise<Armazem> {
    return this.cliente(tx).armazem.create({ data: dados });
  }

  async update(
    id: string,
    dados: DadosActualizacaoArmazem,
    tx?: Prisma.TransactionClient
  ): Promise<Armazem> {
    return this.cliente(tx).armazem.update({ where: { id }, data: dados });
  }

  /** `null` quando não existe — a decisão de erro é do service. */
  async findById(id: string, tx?: Prisma.TransactionClient): Promise<Armazem | null> {
    return this.cliente(tx).armazem.findUnique({ where: { id } });
  }

  async findByCodigo(
    codigo: string,
    tx?: Prisma.TransactionClient
  ): Promise<Armazem | null> {
    // `findUnique({ codigo })` deixou de ser válido quando o `@unique` global
    // do código foi largado (a única restrição é a composta por empresa,
    // inutilizável para `empresa_id IS NULL`). `findFirst` preserva a semântica.
    return this.cliente(tx).armazem.findFirst({ where: { codigo } });
  }

  async findAll(
    filtros: FiltrosArmazem = {},
    tx?: Prisma.TransactionClient
  ): Promise<Armazem[]> {
    return this.cliente(tx).armazem.findMany({
      where: this.filtrosWhere(filtros),
      skip: filtros.skip,
      take: filtros.take,
      orderBy: filtros.orderBy ?? { codigo: 'asc' },
    });
  }

  async count(
    filtros: FiltrosArmazem = {},
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    return this.cliente(tx).armazem.count({
      // O mesmo `where` de `findAll`: se `count` contar apenas o activo e a
      // lista incluir a pesquisa, a paginação anuncia um total que não
      // corresponde à página devolvida.
      where: this.filtrosWhere(filtros),
    });
  }

  /**
   * Traduz os filtros de alto nível para a cláusula `where`.
   *
   * `skip`, `take` e `orderBy` não entram: não são predicados.
   */
  private filtrosWhere(filtros: FiltrosArmazem): Prisma.ArmazemWhereInput {
    // Prefixo `_` porque a regra de no-unused-vars só os ignora assim: aqui
    // quer-se descartar a paginação para ficar só com os predicados.
    const { skip: _skip, take: _take, orderBy: _orderBy, ...resto } = filtros;
    return {
      ...(resto.ativo === undefined ? {} : { ativo: resto.ativo }),
      ...(resto.empresaId === undefined ? {} : { empresaId: resto.empresaId }),
      ...(resto.tipo === undefined ? {} : { tipo: resto.tipo }),
      ...(resto.isDefaultVendas === undefined
        ? {}
        : { isDefaultVendas: resto.isDefaultVendas }),
      ...(resto.isDefaultCompras === undefined
        ? {}
        : { isDefaultCompras: resto.isDefaultCompras }),
      ...(resto.search
        ? {
            OR: [
              { codigo: { contains: resto.search, mode: 'insensitive' } },
              { designacao: { contains: resto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /**
   * Desactiva em vez de apagar.
   *
   * Sete tabelas referenciam `armazens`, e `estoques` faz cascade a partir das
   * localizações. Um `DELETE` apagaria posição de stock e histórico de
   * movimentos que interessa conservar.
   */
  async deactivate(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<Armazem> {
    return this.cliente(tx).armazem.update({ where: { id }, data: { ativo: false } });
  }

  /**
   * Desactiva vários de uma vez. Usado pelo service para resolver o armazém
   * padrão de vendas/compras sem uma chamada por armazém.
   */
  async deactivateMany(
    ids: string[],
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const { count } = await this.cliente(tx).armazem.updateMany({
      where: { id: { in: ids } },
      data: { ativo: false },
    });
    return count;
  }

  /**
   * Escolhe um armazém activo; devolve `null` se não houver.
   *
   * Um filtro em vez de só `empresaId`, porque o service também precisa do
   * armazém marcado como padrão de vendas ou de compras, e ir montar um
   * `where` à mão no service era reintroduzir a camada de acesso a dados.
   */
  async findFirstAtivo(
    filtros: FiltrosArmazem = {},
    tx?: Prisma.TransactionClient
  ): Promise<Armazem | null> {
    return this.cliente(tx).armazem.findFirst({
      where: { ...this.filtrosWhere(filtros), ativo: true },
      orderBy: { codigo: 'asc' },
    });
  }
}

export const armazemRepository = new ArmazemRepository();
