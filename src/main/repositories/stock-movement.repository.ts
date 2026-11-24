/**
 * @file stock-movement.repository.ts
 * @description Acesso a dados de movimentos de stock (EPIC 2, TASK-016).
 *
 * `movimentos_stock` é o livro-razão: uma linha por operação, com origem e
 * destino. Nada é apagado aqui. A tabela não foi partida em cabeçalho e linhas
 * (decisão D3 na auditoria) porque a linha plana já transporta tudo o que um
 * cabeçalho teria, e partir obrigaria a reescrever as agregações de
 * `stock.service.ts` sem ganho funcional.
 *
 * **A quantidade é sempre positiva.** O sinal de um movimento vem de estar em
 * `armazemDestinoId` (entra) ou em `armazemOrigemId` (sai), nunca do número. É o
 * que o `CASE` de `prisma/verificar_stock.sql` avalia e o que a migration de
 * backfill assumiu ao materializar `estoques`. Gravar uma saída já com valor
 * negativo faria esse `CASE` subtrair duas vezes, e o `estoques` deixaria de
 * fechar com o livro-razão.
 */

import {
  type Prisma,
  type PrismaClient,
  type TipoMovimentoStock,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';

type Cliente = Prisma.TransactionClient | PrismaClient;

export type DadosMovimento = Omit<
  Prisma.MovimentoStockUncheckedCreateInput,
  'id'
>;

export interface FiltrosMovimento {
  artigoId?: string;
  /**
   * Filtra por armazém em qualquer dos dois lados.
   *
   * Distinto de `armazemOrigemId`/`armazemDestinoId`, que são lados concretos. Um
   * ecrã de histórico de um armazém quer "movimentos que o envolveram", e não
   * "movimentos em que foi origem" nem "movimentos em que foi destino".
   */
  armazemId?: string;
  armazemOrigemId?: string;
  armazemDestinoId?: string;
  localizacaoOrigemId?: string;
  localizacaoDestinoId?: string;
  loteId?: string;
  tipo?: TipoMovimentoStock;
  criadoPorId?: string;
  documentoTipo?: string;
  documentoId?: string;
  /** Data inicial, inclusive. */
  desde?: Date;
  /** Data final, inclusive. */
  ate?: Date;
  search?: string;
  skip?: number;
  take?: number;
  orderBy?: Prisma.MovimentoStockOrderByWithRelationInput;
}

/**
 * Leitura de um movimento.
 *
 * Os escalares vêm explícitos: um movimento sem `quantidade`, `tipo` e `data` não
 * serve para mostrar um histórico nem para auditar um saldo. As relações entram
 * apenas com os campos usados para mostrar e filtrar, para não trazer o artigo
 * inteiro (`descricao` sobre tudo) em cada linha de uma listagem.
 */
const SELECT_MOVIMENTO = {
  id: true,
  numero: true,
  tipo: true,
  data: true,
  artigoId: true,
  quantidade: true,
  armazemOrigemId: true,
  armazemDestinoId: true,
  loteId: true,
  lote: true,
  localizacaoOrigemId: true,
  localizacaoDestinoId: true,
  documentoOrigem: true,
  documentoTipo: true,
  documentoId: true,
  criadoPorId: true,
  custoUnitario: true,
  artigo: { select: { id: true, codigo: true, descricao: true, unidade: true } },
  armazemOrigem: { select: { id: true, codigo: true, designacao: true } },
  armazemDestino: { select: { id: true, codigo: true, designacao: true } },
  loteNormalizado: {
    select: { id: true, numeroLote: true, dataValidade: true },
  },
  localizacaoOrigem: { select: { id: true, codigo: true } },
  localizacaoDestino: { select: { id: true, codigo: true } },
  criadoPor: { select: { id: true, login: true, nomeCompleto: true } },
} satisfies Prisma.MovimentoStockSelect;

export type MovimentoCompleto = Prisma.MovimentoStockGetPayload<{
  select: typeof SELECT_MOVIMENTO;
}>;

export class MovimentoStockRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private cliente(tx?: Prisma.TransactionClient): Cliente {
    return tx ?? this.prisma;
  }

  /**
   * Grava um movimento.
   *
   * Devolve a mesma projecção das leituras, e não a linha completa: quem cria
   * um movimento quer mostrá-lo de seguida, e a linha inteira traz `descricao`
   * do artigo e mais seis relações que o ecrã já tinha.
   */
  async create(
    dados: DadosMovimento,
    tx?: Prisma.TransactionClient
  ): Promise<MovimentoCompleto> {
    return this.cliente(tx).movimentoStock.create({
      data: dados,
      select: SELECT_MOVIMENTO,
    });
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<MovimentoCompleto | null> {
    return this.cliente(tx).movimentoStock.findUnique({
      where: { id },
      select: SELECT_MOVIMENTO,
    });
  }

  async findByNumero(
    numero: string,
    tx?: Prisma.TransactionClient
  ): Promise<MovimentoCompleto | null> {
    return this.cliente(tx).movimentoStock.findUnique({
      where: { numero },
      select: SELECT_MOVIMENTO,
    });
  }

  async findByProduct(
    artigoId: string,
    filtros: Omit<FiltrosMovimento, 'artigoId'> = {},
    tx?: Prisma.TransactionClient
  ): Promise<MovimentoCompleto[]> {
    return this.cliente(tx).movimentoStock.findMany({
      where: { ...this.filtrosWhere(filtros), artigoId },
      select: SELECT_MOVIMENTO,
      skip: filtros.skip,
      take: filtros.take,
      orderBy: filtros.orderBy ?? { data: 'desc' },
    });
  }

  async findByDateRange(
    desde: Date,
    ate: Date,
    filtros: Omit<FiltrosMovimento, 'desde' | 'ate'> = {},
    tx?: Prisma.TransactionClient
  ): Promise<MovimentoCompleto[]> {
    return this.cliente(tx).movimentoStock.findMany({
      where: { ...this.filtrosWhere(filtros), data: this.intervalo(desde, ate) },
      select: SELECT_MOVIMENTO,
      skip: filtros.skip,
      take: filtros.take,
      orderBy: filtros.orderBy ?? { data: 'desc' },
    });
  }

  /**
   * Lista movimentos com os mesmos filtros de `findByDateRange`.
   *
   * Existe para os serviços que precisam de uma listagem sem intervalo de datas
   * definido. `findByDateRange` obriga a `[desde, ate]`, e inventar datas
   * extremas para o tipo "todos os movimentos" é pior do que um método
   * separado: as datas que passariam a ser falsos valores de omissão.
   */
  async findMany(
    filtros: FiltrosMovimento = {},
    tx?: Prisma.TransactionClient
  ): Promise<MovimentoCompleto[]> {
    const { skip, take, orderBy, ...resto } = filtros;
    return this.cliente(tx).movimentoStock.findMany({
      where: this.filtrosWhere(resto),
      select: SELECT_MOVIMENTO,
      skip,
      take,
      orderBy: orderBy ?? { data: 'desc' },
    });
  }

  async count(
    filtros: FiltrosMovimento = {},
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    // Prefixo `_` porque a regra de no-unused-vars só os ignora assim: aqui
    // quer-se descartar a paginação para ficar só com os predicados.
    const { skip: _skip, take: _take, orderBy: _orderBy, ...resto } = filtros;
    return this.cliente(tx).movimentoStock.count({ where: this.filtrosWhere(resto) });
  }

  /**
   * O intervalo `data` que corresponde a `[desde, ate]`.
   *
   * `ate` com horas a zero devolveria tudo excepto o dia final, que é a forma
   * habitual de um filtro por datas devolver menos linhas do que o esperado.
   */
  private intervalo(desde: Date, ate: Date): Prisma.DateTimeFilter {
    const fim = new Date(ate);
    if (
      fim.getHours() === 0 &&
      fim.getMinutes() === 0 &&
      fim.getSeconds() === 0 &&
      fim.getMilliseconds() === 0
    ) {
      fim.setDate(fim.getDate() + 1);
      fim.setTime(fim.getTime() - 1);
    }

    return { gte: desde, lte: fim };
  }

  private filtrosWhere(filtros: FiltrosMovimento): Prisma.MovimentoStockWhereInput {
    const where: Prisma.MovimentoStockWhereInput = {};

    if (filtros.artigoId !== undefined) where.artigoId = filtros.artigoId;
    if (filtros.armazemOrigemId !== undefined)
      where.armazemOrigemId = filtros.armazemOrigemId;
    if (filtros.armazemDestinoId !== undefined)
      where.armazemDestinoId = filtros.armazemDestinoId;
    // O `OR` de "qualquer lado" tem de entrar em `AND`, e não em `where.OR`:
    // o `search` também escreve lá, e os dois separados levariam um a
    // substituir o outro.
    if (filtros.armazemId !== undefined) {
      where.AND = [
        ...(where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND]),
        { OR: [{ armazemOrigemId: filtros.armazemId }, { armazemDestinoId: filtros.armazemId }] },
      ];
    }
    if (filtros.localizacaoOrigemId !== undefined)
      where.localizacaoOrigemId = filtros.localizacaoOrigemId;
    if (filtros.localizacaoDestinoId !== undefined)
      where.localizacaoDestinoId = filtros.localizacaoDestinoId;
    if (filtros.loteId !== undefined) where.loteId = filtros.loteId;
    if (filtros.tipo !== undefined) where.tipo = filtros.tipo;
    if (filtros.criadoPorId !== undefined) where.criadoPorId = filtros.criadoPorId;
    if (filtros.documentoTipo !== undefined) where.documentoTipo = filtros.documentoTipo;
    if (filtros.documentoId !== undefined) where.documentoId = filtros.documentoId;

    if (filtros.desde !== undefined || filtros.ate !== undefined) {
      where.data = {};
      if (filtros.desde !== undefined) where.data.gte = filtros.desde;
      if (filtros.ate !== undefined) where.data.lte = filtros.ate;
    }

    if (filtros.search) {
      where.OR = [
        { numero: { contains: filtros.search, mode: 'insensitive' } },
        { documentoOrigem: { contains: filtros.search, mode: 'insensitive' } },
        { lote: { contains: filtros.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}

export const movimentoStockRepository = new MovimentoStockRepository();
