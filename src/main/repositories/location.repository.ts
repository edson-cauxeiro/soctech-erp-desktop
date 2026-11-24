/**
 * @file location.repository.ts
 * @description Acesso a dados da estrutura física de armazéns (EPIC 2, TASK-014).
 *
 * Cobre as três tabelas da hierarquia — `armazens_areas`, `armazens_zonas` e
 * `armazens_localizacoes` — porque o service necesita descer do armazém à
 * localização e subir na árvore, e nenhuma das três se consulta isoladamente.
 *
 * `getTree` devolve a árvore já montada. Materializá-la aqui, e não no service,
 * evita que cada consumidor implemente a sua própria travessia e diverga.
 */

import { Prisma, type PrismaClient, type ArmazemArea, type ArmazemZona, type ArmazemLocalizacao } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';

type Cliente = Prisma.TransactionClient | PrismaClient;

/** Nó de localização já com os filhos imediatamente abaixo. */
export interface NoLocalizacao extends ArmazemLocalizacao {
  filhos: NoLocalizacao[];
}

/** Nó da árvore com as três tabelas encadeadas. */
export interface ArvoreLocalizacoes {
  area: ArmazemArea;
  zonas: Array<ArmazemZona & { localizacoes: NoLocalizacao[] }>;
}

export type DadosArea = Omit<Prisma.ArmazemAreaUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt'>;
export type DadosZona = Omit<Prisma.ArmazemZonaUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt'>;
export type DadosLocalizacao = Omit<
  Prisma.ArmazemLocalizacaoUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface FiltrosLocalizacao {
  zonaId?: string;
  parentId?: string | null;
  isPickable?: boolean;
  isPutaway?: boolean;
  apenasAtivas?: boolean;
  /** Ignora as localizações bloqueadas, independentemente de `ativo`. */
  apenasDisponiveis?: boolean;
  search?: string;
}

export interface FiltrosLocalizacaoDisponivel extends FiltrosLocalizacao {
  artigoId?: string;
  armazemId?: string;
  /** Capacidade livre a desconsiderar, por localização. */
  quantidadeAEntregar?: Prisma.Decimal | number;
}

export class LocalizacaoRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private cliente(tx?: Prisma.TransactionClient): Cliente {
    return tx ?? this.prisma;
  }

  // ── Áreas ───────────────────────────────────────────────────────────────

  async createArea(dados: DadosArea, tx?: Prisma.TransactionClient): Promise<ArmazemArea> {
    return this.cliente(tx).armazemArea.create({ data: dados });
  }

  async findAreaById(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemArea | null> {
    return this.cliente(tx).armazemArea.findUnique({ where: { id } });
  }

  async findAreasByArmazem(
    armazemId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemArea[]> {
    return this.cliente(tx).armazemArea.findMany({
      where: { armazemId },
      orderBy: { codigo: 'asc' },
    });
  }

  // ── Zonas ───────────────────────────────────────────────────────────────

  async createZona(dados: DadosZona, tx?: Prisma.TransactionClient): Promise<ArmazemZona> {
    return this.cliente(tx).armazemZona.create({ data: dados });
  }

  async findZonaById(id: string, tx?: Prisma.TransactionClient): Promise<ArmazemZona | null> {
    return this.cliente(tx).armazemZona.findUnique({
      where: { id },
      include: { area: true },
    });
  }

  async findZonasByArea(
    areaId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemZona[]> {
    return this.cliente(tx).armazemZona.findMany({
      where: { areaId },
      orderBy: { codigo: 'asc' },
    });
  }

  // ── Localizações ─────────────────────────────────────────────────────────

  async create(
    dados: DadosLocalizacao,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao> {
    return this.cliente(tx).armazemLocalizacao.create({ data: dados });
  }

  async update(
    id: string,
    dados: Prisma.ArmazemLocalizacaoUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao> {
    return this.cliente(tx).armazemLocalizacao.update({ where: { id }, data: dados });
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao | null> {
    return this.cliente(tx).armazemLocalizacao.findUnique({
      where: { id },
      include: { zona: { include: { area: true } } },
    });
  }

  async findByCodigo(
    zonaId: string,
    codigo: string,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao | null> {
    return this.cliente(tx).armazemLocalizacao.findUnique({
      where: { zonaId_codigo: { zonaId, codigo } },
    });
  }

  /**
   * Desactiva em vez de apagar.
   *
   * O `parentId` tem `onDelete: Cascade`, por isso apagar um nó com descendentes
   * levaria a localização junto e, por arrasto, ao `estoques` que aponta para
   * elas. Desactivar preserva o histórico.
   */
  async deactivate(id: string, tx?: Prisma.TransactionClient): Promise<ArmazemLocalizacao> {
    return this.cliente(tx).armazemLocalizacao.update({
      where: { id },
      data: { ativo: false },
    });
  }

  /**
   * Desactiva o nó e todos os descendentes.
   *
   * A travessia é feita aqui e não no service porque a descida sobre
   * `parentId` tem de usar a mesma transacção de quem a iniciou — caso contrário
   * se vê um estado intermédio em que o pai já está inactivo e os filhos ainda
   * não.
   */
  async deactivateSubtree(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const ids = await this.descendantIds(id, tx);
    const { count } = await this.cliente(tx).armazemLocalizacao.updateMany({
      where: { id: { in: ids } },
      data: { ativo: false },
    });
    return count;
  }

  /**
   * Ids do nó e de todos os descendentes, por níveis.
   *
   * Uma passagem só: a consulta traz cada nível já filtrado pelos ids do nível
   * anterior, o que evita o N+1 de um `findMany` por nó e o risco de um
   * `findMany` recursivo sem limite de profundidade sobre dados cíclicos.
   */
  private async descendantIds(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<string[]> {
    const cliente = this.cliente(tx);
    const recolhidos = new Set<string>([id]);
    let actuais: string[] = [id];

    while (actuais.length > 0) {
      const filhos = await cliente.armazemLocalizacao.findMany({
        where: { parentId: { in: actuais } },
        select: { id: true },
      });
      actuais = [];
      for (const filho of filhos) {
        if (!recolhidos.has(filho.id)) {
          recolhidos.add(filho.id);
          actuais.push(filho.id);
        }
      }
    }

    return [...recolhidos];
  }

  /** Filhos imediatos de um nó. `parentId: null` devolve as raízes da zona. */
  async getChildren(
    parentId: string | null,
    filtros: FiltrosLocalizacao = {},
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao[]> {
    return this.cliente(tx).armazemLocalizacao.findMany({
      where: {
        parentId: parentId ?? null,
        ...this.filtrosWhere(filtros),
      },
      orderBy: { codigo: 'asc' },
    });
  }

  async getDescendants(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao[]> {
    const ids = await this.descendantIds(id, tx);
    const descendentes = ids.filter((filho) => filho !== id);
    if (descendentes.length === 0) return [];
    return this.cliente(tx).armazemLocalizacao.findMany({
      where: { id: { in: descendentes } },
      orderBy: { codigo: 'asc' },
    });
  }

  /** Todos os nós de uma zona, chapado. Base para montar a árvore. */
  async findByZona(
    zonaId: string,
    filtros: FiltrosLocalizacao = {},
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao[]> {
    return this.cliente(tx).armazemLocalizacao.findMany({
      where: { zonaId, ...this.filtrosWhere(filtros) },
      orderBy: { codigo: 'asc' },
    });
  }

  /**
   * Árvore completa armazém → áreas → zonas → localizações.
   *
   * Traz todas as linhas das três tabelas e monta a hierarquia em memória. Para
   * o volume de um armazém é mais barato e mais simples do que as consultas
   * por nível; se um dia um armazém tiver milhares de localizações, passa a
   * valer a pena paginar por zona.
   */
  async getTree(
    armazemId: string,
    filtros: FiltrosLocalizacao = {},
    tx?: Prisma.TransactionClient
  ): Promise<ArvoreLocalizacoes[]> {
    const cliente = this.cliente(tx);

    const [areas, zonas, localizacoes] = await Promise.all([
      cliente.armazemArea.findMany({
        where: { armazemId },
        orderBy: { codigo: 'asc' },
      }),
      cliente.armazemZona.findMany({
        where: { area: { armazemId } },
        orderBy: { codigo: 'asc' },
      }),
      cliente.armazemLocalizacao.findMany({
        where: { zona: { area: { armazemId } }, ...this.filtrosWhere(filtros) },
        orderBy: { codigo: 'asc' },
      }),
    ]);

    const porZona = new Map<string, ArmazemLocalizacao[]>();
    for (const localizacao of localizacoes) {
      const lista = porZona.get(localizacao.zonaId);
      if (lista) lista.push(localizacao);
      else porZona.set(localizacao.zonaId, [localizacao]);
    }

    return areas.map((area) => ({
      area,
      zonas: zonas
        .filter((zona) => zona.areaId === area.id)
        .map((zona) => ({
          ...zona,
          localizacoes: this.montarArvore(porZona.get(zona.id) ?? []),
        })),
    }));
  }

  /**
   * Monta a recursão a partir da lista chapada.
   *
   * Protege contra ciclos: se `parentId` apontar para um id que já foi
   * construído, o nó é promovido a raiz em vez de se recurir indefinidamente.
   * O CHECK da base impede o auto-pai, mas não impede um ciclo de três nós.
   */
  private montarArvore(nos: ArmazemLocalizacao[]): NoLocalizacao[] {
    const porId = new Map<string, NoLocalizacao>();
    for (const no of nos) {
      porId.set(no.id, { ...no, filhos: [] });
    }

    const raizes: NoLocalizacao[] = [];
    for (const no of porId.values()) {
      const pai = no.parentId ? porId.get(no.parentId) : undefined;
      if (pai) pai.filhos.push(no);
      else raizes.push(no);
    }

    return raizes.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  /**
   * Localizações que aceitam um artigo agora.
   *
   * Filtra o que é elegível por picking ou putaway, o que não está bloqueado nem
   * inactivo, e o que ainda tem capacidade. Quando é dado `quantidadeAEntregar`,
   * a capacidade livre é comparada com o stock já presente na posição, para não
   * devolver uma localização que só comporta a parte que lá está.
   */
  async getAvailableLocations(
    filtros: FiltrosLocalizacaoDisponivel = {},
    tx?: Prisma.TransactionClient
  ): Promise<ArmazemLocalizacao[]> {
    const cliente = this.cliente(tx);
    const { quantidadeAEntregar, artigoId, armazemId, ...resto } = filtros;

    const candidatas = await cliente.armazemLocalizacao.findMany({
      where: {
        ...this.filtrosWhere({ ...resto, apenasDisponiveis: true }),
        ...(armazemId ? { zona: { area: { armazemId } } } : {}),
      },
      orderBy: { codigo: 'asc' },
    });

    if (quantidadeAEntregar === undefined || quantidadeAEntregar === null) {
      return candidatas;
    }

    const semCapacidadeDeclarada = candidatas.filter(
      (localizacao) =>
        localizacao.capacidadeQuantidade === null ||
        localizacao.capacidadePeso === null ||
        localizacao.capacidadeVolume === null
    );

    const comCapacidade = candidatas.filter(
      (localizacao) =>
        !semCapacidadeDeclarada.includes(localizacao)
    );

    if (comCapacidade.length === 0) return semCapacidadeDeclarada;

    const estoques = await cliente.estoque.findMany({
      where: {
        localizacaoId: { in: comCapacidade.map((localizacao) => localizacao.id) },
        ...(artigoId ? { artigoId } : {}),
      },
      select: { localizacaoId: true, quantidade: true },
    });

    const ocupado = new Map<string, Prisma.Decimal>();
    for (const estoque of estoques) {
      if (!estoque.localizacaoId) continue;
      const anterior = ocupado.get(estoque.localizacaoId) ?? new Prisma.Decimal(0);
      ocupado.set(
        estoque.localizacaoId,
        anterior.add(new Prisma.Decimal(estoque.quantidade))
      );
    }

    const entrega = new Prisma.Decimal(quantidadeAEntregar);
    const comEspaco = comCapacidade.filter((localizacao) => {
      const usado = ocupado.get(localizacao.id) ?? new Prisma.Decimal(0);
      // `new Prisma.Decimal(...)` e não o valor directo: o Prisma devolve
      // `Decimal`, mas a comparação tem de funcionar também com um número já
      // convertido, e um `number` não tem `.minus()`.
      const capacidade = new Prisma.Decimal(localizacao.capacidadeQuantidade!);
      return capacidade.minus(usado).greaterThanOrEqualTo(entrega);
    });

    // `null` em qualquer capacidade significa "sem limite declarado", pelo que
    // uma localização sem capacidade declarada nunca é excluída.
    return [...comEspaco, ...semCapacidadeDeclarada].sort((a, b) =>
      a.codigo.localeCompare(b.codigo)
    );
  }

  /** Traduz os filtros de alto nível para a cláusula `where`. */
  private filtrosWhere(filtros: FiltrosLocalizacao): Prisma.ArmazemLocalizacaoWhereInput {
    return {
      ...(filtros.zonaId === undefined ? {} : { zonaId: filtros.zonaId }),
      ...(filtros.parentId === undefined ? {} : { parentId: filtros.parentId }),
      ...(filtros.isPickable === undefined ? {} : { isPickable: filtros.isPickable }),
      ...(filtros.isPutaway === undefined ? {} : { isPutaway: filtros.isPutaway }),
      ...(filtros.apenasAtivas === undefined ? {} : { ativo: filtros.apenasAtivas }),
      ...(filtros.apenasDisponiveis ? { ativo: true, bloqueada: false } : {}),
      ...(filtros.search
        ? { codigo: { contains: filtros.search, mode: 'insensitive' as const } }
        : {}),
    };
  }
}

export const localizacaoRepository = new LocalizacaoRepository();
