/**
 * @file inventory.repository.ts
 * @description Acesso a dados de saldo de stock (EPIC 2, TASK-015).
 *
 * `estoques` é o saldo materializado; `movimentos_stock` é o livro-razão. Este
 * repository só lê e escreve o saldo. A consistência de que o saldo reflecte os
 * movimentos é de `prisma/verificar_stock.sql` e da migration de backfill, não
 * deste ficheiro.
 */

import { Prisma, type PrismaClient, type Estoque, type EstadoEstoque } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError } from '../utils/errors';

type Cliente = Prisma.TransactionClient | PrismaClient;

/**
 * Identifica uma posição de stock.
 *
 * `localizacaoId` e `loteId` são opcionais (decisão D4: o stock legado fica a
 * nível de armazém). São normalizados para `null` porque o índice único é
 * `UNIQUE (artigo_id, armazem_id, COALESCE(localizacao_id,''), COALESCE(lote_id,''))`
 * — passar `undefined` e `null` não é a mesma coisa para o índice.
 */
export interface PosicaoStock {
  artigoId: string;
  armazemId: string;
  localizacaoId?: string | null;
  loteId?: string | null;
}

export interface FiltrosEstoque {
  artigoId?: string;
  armazemId?: string;
  localizacaoId?: string | null;
  loteId?: string | null;
  estado?: EstadoEstoque;
  /** Saldo estrictamente positivo. */
  apenasComSaldo?: boolean;
  /** Devolve também posições a zero, que `findAvailable` exclui. */
  incluirEsgotadas?: boolean;
  incluirBloqueadas?: boolean;
}

/**
 * Filtros da listagem por localização (TASK-029).
 *
 * Área e zona não existem em `estoques`: só chegam pela relação
 * `localizacao → zona → area`, pelo que o `where` as monta por aí em vez de
 * as denormalizar. `numeroLote` é texto e não chave porque o operador escreve
 * "L2026-014" num campo de pesquisa, não um id.
 */
export interface FiltrosStockPorLocalizacao {
  armazemId?: string;
  areaId?: string;
  zonaId?: string;
  localizacaoId?: string;
  artigoId?: string;
  loteId?: string;
  numeroLote?: string;
  estado?: EstadoEstoque;
  apenasComSaldo?: boolean;
}

export interface Paginacao {
  skip?: number;
  take?: number;
}

/** Projecção usada nas leituras, para não arrastar `artigo` e `armazem` à toa. */
/**
 * Leitura de uma posição de stock.
 *
 * Os escalares vêm explícitos, e não por omissão: `Estoque` tem mais de trinta
 * colunas, mas quem lê stock precisa do `id` para poder chamar `addQuantity` e
 * `reserve`, das duas quantidades para calcular o disponível, e das chaves da
 * posição para a identificar. Sem eles um `findByProduct` devolvia um objecto
 * com relações e nenhuma quantidade — que era o que acontecia.
 */
const SELECT_ESTOQUE = {
  id: true,
  artigoId: true,
  armazemId: true,
  localizacaoId: true,
  loteId: true,
  quantidade: true,
  quantidadeReservada: true,
  custoUnitario: true,
  createdAt: true,
  updatedAt: true,
  artigo: { select: { id: true, codigo: true, descricao: true, unidade: true } },
  armazem: { select: { id: true, codigo: true, designacao: true } },
  lote: {
    select: { id: true, numeroLote: true, dataValidade: true, dataFabrico: true },
  },
  localizacao: {
    select: { id: true, codigo: true, designacao: true, bloqueada: true, isPickable: true },
  },
} satisfies Prisma.EstoqueSelect;

export type EstoqueCompleto = Prisma.EstoqueGetPayload<{ select: typeof SELECT_ESTOQUE }>;

/**
 * Projecção da listagem por localização (TASK-029).
 *
 * Traz a árvore `localização → zona → área` na mesma leitura: a tabela mostra
 * os quatro níveis em colunas, e pedi-los um a um transformaria cada página de
 * 100 linhas em 300 consultas de relacao.
 */
const SELECT_STOCK_LOCALIZACAO = {
  id: true,
  artigoId: true,
  armazemId: true,
  localizacaoId: true,
  loteId: true,
  quantidade: true,
  quantidadeReservada: true,
  custoUnitario: true,
  estado: true,
  artigo: { select: { id: true, codigo: true, descricao: true, unidade: true } },
  armazem: { select: { id: true, codigo: true, designacao: true } },
  lote: { select: { id: true, numeroLote: true, dataValidade: true } },
  localizacao: {
    select: {
      id: true,
      codigo: true,
      designacao: true,
      bloqueada: true,
      isPickable: true,
      zona: {
        select: {
          id: true,
          codigo: true,
          designacao: true,
          area: { select: { id: true, codigo: true, designacao: true } },
        },
      },
    },
  },
} satisfies Prisma.EstoqueSelect;

export type LinhaStockPorLocalizacao = Prisma.EstoqueGetPayload<{
  select: typeof SELECT_STOCK_LOCALIZACAO;
}>;

export type DadosEstoque = Omit<
  Prisma.EstoqueUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Distingue violação de índice único das restantes falhas do Prisma.
 *
 * `code` em vez de `instanceof`: os testes injectam objectos simples e não
 * instâncias reais de `PrismaClientKnownRequestError`, e o `instanceof` passaria
 * ao `catch` a tratar como erro desconhecido.
 */
function violacaoDeUnico(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: unknown }).code === 'P2002'
  );
}

export class EstoqueRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private cliente(tx?: Prisma.TransactionClient): Cliente {
    return tx ?? this.prisma;
  }

  /** Traduz `PosicaoStock` para a cláusula `where`, normalizando os nulos. */
  private posicaoWhere(posicao: PosicaoStock): Prisma.EstoqueWhereInput {
    return {
      artigoId: posicao.artigoId,
      armazemId: posicao.armazemId,
      localizacaoId: posicao.localizacaoId ?? null,
      loteId: posicao.loteId ?? null,
    };
  }

  async create(dados: DadosEstoque, tx?: Prisma.TransactionClient): Promise<Estoque> {
    return this.cliente(tx).estoque.create({ data: dados });
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<EstoqueCompleto | null> {
    return this.cliente(tx).estoque.findUnique({ where: { id }, select: SELECT_ESTOQUE });
  }

  /**
   * Posição exacta, pelo índice único.
   *
   * É a operação de que `reserve` e `release` partem: sem ela não há como saber
   * que `estoqueId` é o saldo certo.
   */
  async findByPosition(
    posicao: PosicaoStock,
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto | null> {
    return this.cliente(tx).estoque.findFirst({
      where: this.posicaoWhere(posicao),
      select: SELECT_ESTOQUE,
    });
  }

  /**
   * Cria a posição se não existir, e devolve a existente caso contrário.
   *
   * Não é um `upsert` porque `estoques_posicao_unica` é um índice sobre
   * `COALESCE(localizacao_id, '')`, e essa expressão não é expressável em
   * `@@unique`. O Prisma desconhece-o, logo não o aceita como chave de
   * `upsert` — só como índice para o PostgreSQL.
   *
   * A corrida entre o `findFirst` e o `create` é apanhada pelo índice: se outra
   * transacção criar a mesma posição entretanto, o `create` falha com P2002 e
   * aqui volta-se a ler a linha que ficou. Devolve a posição vencedora em vez de
   * propagar um erro que o service não espera.
   */
  async findOrCreateByPosition(
    posicao: PosicaoStock,
    defaults: Partial<DadosEstoque> = {},
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto> {
    const cliente = this.cliente(tx);
    const where = this.posicaoWhere(posicao);

    const existente = await cliente.estoque.findFirst({ where, select: SELECT_ESTOQUE });
    if (existente) return existente;

    try {
      return await cliente.estoque.create({
        data: {
          artigoId: posicao.artigoId,
          armazemId: posicao.armazemId,
          localizacaoId: posicao.localizacaoId ?? null,
          loteId: posicao.loteId ?? null,
          ...defaults,
        },
        select: SELECT_ESTOQUE,
      });
    } catch (erro) {
      if (violacaoDeUnico(erro)) {
        const criada = await cliente.estoque.findFirst({ where, select: SELECT_ESTOQUE });
        if (criada) return criada;
      }
      throw erro;
    }
  }

  async findByProduct(
    artigoId: string,
    filtros: Omit<FiltrosEstoque, 'artigoId'> = {},
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto[]> {
    return this.cliente(tx).estoque.findMany({
      where: { ...this.filtrosWhere(filtros), artigoId },
      select: SELECT_ESTOQUE,
      orderBy: [{ armazemId: 'asc' }, { localizacaoId: 'asc' }, { loteId: 'asc' }],
    });
  }

  /**
   * Todas as posições de um armazém, para o painel de stock por armazém.
   *
   * A chave da posição é artigo + localização + lote, pelo que um artigo com
   * stock em duas prateleiras aparece duas vezes. Quem chama tem de somar por
   * artigo; a ordem estável por localização e lote torna a agregação
   * determinística.
   */
  async findAllByArmazem(
    armazemId: string,
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto[]> {
    return this.cliente(tx).estoque.findMany({
      where: { armazemId },
      select: SELECT_ESTOQUE,
      orderBy: [{ artigoId: 'asc' }, { localizacaoId: 'asc' }, { loteId: 'asc' }],
    });
  }

  /**
   * Stock por localização, paginado (TASK-029).
   *
   * `findMany` e `count` correm em paralelo sobre o mesmo `where`: a paginação
   * sem total obriga a dois rondas, e o total calculado depois da página já
   * lida diverge sempre que uma posição mudar entretanto.
   *
   * A ordem começa no código do artigo e não no id: a tabela é lida por um
   * operador, e `cl00093` antes de `cl00012` é ruído, não ordenação.
   */
  async listarPorLocalizacao(
    filtros: FiltrosStockPorLocalizacao = {},
    paginacao: Paginacao = {},
    tx?: Prisma.TransactionClient
  ): Promise<{ items: LinhaStockPorLocalizacao[]; total: number }> {
    const where = this.whereStockPorLocalizacao(filtros);
    const { skip = 0, take = 100 } = paginacao;
    const cliente = this.cliente(tx);

    const [items, total] = await Promise.all([
      cliente.estoque.findMany({
        where,
        select: SELECT_STOCK_LOCALIZACAO,
        orderBy: [
          { artigo: { codigo: 'asc' } },
          { localizacaoId: { sort: 'asc', nulls: 'last' } },
          { loteId: { sort: 'asc', nulls: 'last' } },
        ],
        skip,
        take,
      }),
      cliente.estoque.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * `where` da listagem por localização.
   *
   * Área e zona entram como filtro de relação, nunca como coluna: `estoques`
   * não tem `areaId`, e inventá-lo aqui seria a segunda fonte de verdade que a
   * migration de backfill já teve uma vez.
   */
  private whereStockPorLocalizacao(filtros: FiltrosStockPorLocalizacao): Prisma.EstoqueWhereInput {
    const where: Prisma.EstoqueWhereInput = {};

    if (filtros.armazemId) where.armazemId = filtros.armazemId;
    if (filtros.artigoId) where.artigoId = filtros.artigoId;
    if (filtros.localizacaoId) where.localizacaoId = filtros.localizacaoId;
    if (filtros.loteId) where.loteId = filtros.loteId;
    if (filtros.estado) where.estado = filtros.estado;
    if (filtros.apenasComSaldo) where.quantidade = { gt: 0 };

    const localizacao: Prisma.ArmazemLocalizacaoWhereInput = {};
    if (filtros.zonaId) localizacao.zonaId = filtros.zonaId;
    if (filtros.areaId) localizacao.zona = { areaId: filtros.areaId };
    if (Object.keys(localizacao).length > 0) {
      // Posições sem localização (decisão D4) não passam por aqui: o filtro é
      // "stock dentro desta área", e stock de armazém sem endereço não está
      // dentro de nenhuma.
      where.localizacao = localizacao;
    }

    if (filtros.numeroLote) {
      where.lote = {
        numeroLote: { contains: filtros.numeroLote, mode: 'insensitive' },
      };
    }

    return where;
  }

  async findByLocation(
    localizacaoId: string,
    filtros: Omit<FiltrosEstoque, 'localizacaoId'> = {},
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto[]> {
    return this.cliente(tx).estoque.findMany({
      where: { ...this.filtrosWhere(filtros), localizacaoId },
      select: SELECT_ESTOQUE,
      orderBy: [{ artigoId: 'asc' }, { loteId: 'asc' }],
    });
  }

  async findByLot(
    loteId: string,
    filtros: Omit<FiltrosEstoque, 'loteId'> = {},
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto[]> {
    return this.cliente(tx).estoque.findMany({
      where: { ...this.filtrosWhere(filtros), loteId },
      select: SELECT_ESTOQUE,
      orderBy: [{ artigoId: 'asc' }, { armazemId: 'asc' }],
    });
  }

  /**
   * Saldo que pode ser servido: disponível, desbloqueado e com saldo.
   *
   * Exclui `quarentena` e `bloqueado` por estado, e localizações marcadas
   * `bloqueada` — um bloqueio operacional tira a posição de serviço mesmo que o
   * estado do stock seja `disponivel`.
   */
  async findAvailable(
    filtros: FiltrosEstoque & { apenasLocalizacoesPickable?: boolean } = {},
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto[]> {
    return this.cliente(tx).estoque.findMany({
      where: {
        ...this.filtrosWhere({ ...filtros, apenasComSaldo: true }),
        estado: filtros.estado ?? { in: ['disponivel', 'esgotado'] },
        OR: [{ localizacaoId: null }, { localizacao: { bloqueada: false } }],
      },
      select: SELECT_ESTOQUE,
      orderBy: [{ artigoId: 'asc' }, { armazemId: 'asc' }],
    });
  }

  /**
   * Saldo disponível de um artigo, já líquido da reserva.
   *
   * `quantidade - quantidadeReservada` feito em SQL: agregar em memória depois
   * de trazer as linhas obriga a aritmética da aplicação a reimplementar a
   * mesma subtração num ponto onde um erro de arredondamento passa despercebido.
   */
  async availableQuantity(
    filtro: PosicaoStock | { artigoId: string; armazemId?: string },
    tx?: Prisma.TransactionClient
  ): Promise<Prisma.Decimal> {
    const where: Prisma.EstoqueWhereInput =
      'armazemId' in filtro
        ? this.posicaoWhere(filtro as PosicaoStock)
        : { artigoId: filtro.artigoId, ...(filtro.armazemId ? { armazemId: filtro.armazemId } : {}) };

    const result = await this.cliente(tx).estoque.aggregate({
      where,
      _sum: { quantidade: true, quantidadeReservada: true },
    });

    return (result._sum.quantidade ?? new Prisma.Decimal(0)).minus(
      result._sum.quantidadeReservada ?? new Prisma.Decimal(0)
    );
  }

  /**
   * Positions of stock that belong to a given zone (filtered through the
   * `localizacao -> zona` relation). Used by putaway and picking.
   */
  async findByZone(
    zonaId: string,
    tx?: Prisma.TransactionClient
  ): Promise<EstoqueCompleto[]> {
    const cliente = this.cliente(tx);
    return cliente.estoque.findMany({
      where: { localizacao: { zonaId } },
      select: SELECT_ESTOQUE,
    });
  }

  /**
   * Soma movimento a uma posição. Usado pelas entradas e saídas.
   *
   * Não pode levar o saldo abaixo de zero: o CHECK `estoques_quantidade_nao_negativa`
   * rejeitaria a operação, mas deixaria a transacção abortada com um erro de
   * base em vez do `BusinessRuleError` que o service quer levantar.
   */
  async addQuantity(
    id: string,
    quantidade: Prisma.Decimal | number,
    custoUnitario?: Prisma.Decimal | number,
    tx?: Prisma.TransactionClient
  ): Promise<Estoque> {
    return this.cliente(tx).estoque.update({
      where: { id },
      data: {
        quantidade: { increment: new Prisma.Decimal(quantidade) },
        ...(custoUnitario === undefined
          ? {}
          : { custoUnitario: new Prisma.Decimal(custoUnitario) }),
        estado: 'disponivel',
      },
    });
  }

  /**
   * Reserva saldo numa posição.
   *
   * Atómica por construção: a verificação «há saldo disponível?» está na
   * cláusula `WHERE` do próprio `UPDATE`, e não numa leitura anterior. Um
   * `findById` seguido de `update` deixaria duas reservas concorrentes passar
   * as duas — é o modo clássico de sobre-alocar stock, e o CHECK
   * `estoques_reserva_valida` só apareceria depois, ao fazer abortar a segunda
   * transacção por inteiro.
   *
   * Levanta `BusinessRuleError` quando não há saldo, que é uma decisão de regra
   * de negócio e pertence ao service; aqui só se sinaliza que o `UPDATE` não
   * affectou nenhuma linha.
   */
  async reserve(
    id: string,
    quantidade: Prisma.Decimal | number,
    tx?: Prisma.TransactionClient
  ): Promise<Estoque> {
    const pedido = new Prisma.Decimal(quantidade);
    if (pedido.lessThanOrEqualTo(0)) {
      throw new BusinessRuleError('A quantidade a reservar tem de ser maior que zero.');
    }

    const { count } = await this.reservarSql(id, pedido, true, tx);

    if (count === 0) {
      throw new BusinessRuleError(
        'Não há saldo disponível suficiente na posição para reservar esta quantidade.'
      );
    }

    return this.findObrigatorio(id, tx);
  }

  /**
   * Libera uma reserva. Simétrico a `reserve`, com a mesma garantia atómica.
   *
   * A reserva não pode ficar negativa, daí o segundo `AND`: um `release` a mais
   * passaria o `GREATEST` e deixaria `quantidade_reservada` negativa, o que o
   * CHECK rejeitaria mas com um erro de base.
   */
  async release(
    id: string,
    quantidade: Prisma.Decimal | number,
    tx?: Prisma.TransactionClient
  ): Promise<Estoque> {
    const pedido = new Prisma.Decimal(quantidade);
    if (pedido.lessThanOrEqualTo(0)) {
      throw new BusinessRuleError('A quantidade a libertar tem de ser maior que zero.');
    }

    const { count } = await this.reservarSql(id, pedido, false, tx);

    if (count === 0) {
      throw new BusinessRuleError('Não há reserva suficiente nesta posição para libertar.');
    }

    return this.findObrigatorio(id, tx);
  }

  /**
   * O `UPDATE` condicional de `reserve`/`release`.
   *
   * Devolve `count` para o chamador decidir, em vez de lanzar: quem chama sabe
   * o que fazer quando não há saldo, e sabe que texto mostrar.
   */
  private async reservarSql(
    id: string,
    quantidade: Prisma.Decimal,
    reservar: boolean,
    tx?: Prisma.TransactionClient
  ): Promise<{ count: number }> {
    const cliente = this.cliente(tx);

    const resultado = await cliente.$queryRaw<Array<{ count: bigint }>>`
      UPDATE "estoques"
         SET "quantidade_reservada" = CASE
               WHEN ${reservar}
                 THEN "quantidade_reservada" + ${quantidade}
                 ELSE "quantidade_reservada" - ${quantidade}
             END,
             "updated_at" = NOW()
       WHERE "id" = ${id}
         AND (
           ${reservar ? Prisma.sql`"quantidade" - "quantidade_reservada" >= ${quantidade}` : Prisma.sql`"quantidade_reservada" >= ${quantidade}`}
         )
      RETURNING 1
    `;

    return { count: resultado.length };
  }

  /** Lê a posição depois de a alterar; `findUnique` pode devolver `null` se em paralelo tiver sido removida. */
  private async findObrigatorio(id: string, tx?: Prisma.TransactionClient): Promise<Estoque> {
    const estoque = await this.cliente(tx).estoque.findUnique({ where: { id } });
    if (!estoque) {
      throw new BusinessRuleError(`A posição de stock '${id}' deixou de existir.`);
    }
    return estoque;
  }

  /**
   * Saldo total de um artigo num armazém, somado a todas as posições.
   *
   * Substitui a `SUM` sobre `movimentos_stock` que `stock.service.ts` faz a cada
   * consulta, mas continua a somar posições — não substitui a auditoria de que
   * as posições e os movimentos concordam.
   */
  async totalByArtigo(
    artigoId: string,
    armazemId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<Prisma.Decimal> {
    const result = await this.cliente(tx).estoque.aggregate({
      where: { artigoId, ...(armazemId ? { armazemId } : {}) },
      _sum: { quantidade: true },
    });
    return result._sum.quantidade ?? new Prisma.Decimal(0);
  }

  /**
   * Quantidade actualmente armazenada numa localização, somando todas as
   * posições que lá estão — artigos e lotes diferentes contam todos.
   *
   * É a leitura que alimenta a tela de capacidade: sem ela, uma prateleira com
   * limite de 100 mostrava o limite e nada dissesse sobre estar cheia.
   */
  async totalByLocalizacao(
    localizacaoId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Prisma.Decimal> {
    const result = await this.cliente(tx).estoque.aggregate({
      where: { localizacaoId },
      _sum: { quantidade: true },
    });
    return result._sum.quantidade ?? new Prisma.Decimal(0);
  }

  private filtrosWhere(filtros: FiltrosEstoque): Prisma.EstoqueWhereInput {
    const where: Prisma.EstoqueWhereInput = {};

    if (filtros.artigoId !== undefined) where.artigoId = filtros.artigoId;
    if (filtros.armazemId !== undefined) where.armazemId = filtros.armazemId;
    if (filtros.localizacaoId !== undefined) where.localizacaoId = filtros.localizacaoId;
    if (filtros.loteId !== undefined) where.loteId = filtros.loteId;
    if (filtros.estado !== undefined) where.estado = filtros.estado;

    if (filtros.apenasComSaldo) {
      where.quantidade = { gt: 0 };
    }

    if (!filtros.incluirEsgotadas) {
      where.estado = where.estado ?? { not: 'esgotado' };
    }

    // `??`: um estado pedido explicitamente não é sobreposto pelas exclusões
    // implícitas. Sem isto, `estado: 'bloqueado'` era trocado por
    // `['disponivel','esgotado']` e o filtro devolvia exactamente o oposto.
    if (!filtros.incluirBloqueadas) {
      where.estado = where.estado ?? { in: ['disponivel', 'esgotado'] };
    }

    return where;
  }
}

export const estoqueRepository = new EstoqueRepository();
