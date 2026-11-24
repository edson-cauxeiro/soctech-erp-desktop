/**
 * @file armazem.service.ts
 * @description Serviço de regras de negócio para Armazéns (RF06, TASK-017).
 *
 * Garante armazéns padrão (ARM-01 Geral para entradas e ARM-02 Vendas para saídas),
 * unicidade de códigos e validação de dados. A partir do EPIC 3 o acesso a dados
 * passa por `ArmazemRepository` e o saldo é lido de `estoques` (decisão D2), e não
 * recalculado a partir dos movimentos.
 */

import { PrismaClient, Armazem } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { ArmazemRepository } from '../repositories/warehouse.repository';
import { EstoqueRepository } from '../repositories/inventory.repository';
import { LocalizacaoRepository, ArvoreLocalizacoes } from '../repositories/location.repository';
import {
  createArmazemSchema,
  updateArmazemSchema,
  armazemFiltersSchema,
  CreateArmazemInput,
  UpdateArmazemInput,
  ArmazemFilters,
} from '../validators/armazem.validator';
import { ConflictError, NotFoundError, BusinessRuleError } from '../utils/errors';

export class ArmazemService {
  private prisma: PrismaClient;
  private repo: ArmazemRepository;
  private estoqueRepo: EstoqueRepository;
  private localizacaoRepo: LocalizacaoRepository;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    repo?: ArmazemRepository,
    estoqueRepo?: EstoqueRepository,
    localizacaoRepo?: LocalizacaoRepository
  ) {
    this.prisma = prismaClient;
    // Por omissão, os repositories ficam ligados ao mesmo `prisma`. Recebê-los
    // por argumento é o que permite injectar um duplo sem refazer o mock do
    // cliente inteiro.
    this.repo = repo ?? new ArmazemRepository(prismaClient);
    this.estoqueRepo = estoqueRepo ?? new EstoqueRepository(prismaClient);
    this.localizacaoRepo = localizacaoRepo ?? new LocalizacaoRepository(prismaClient);
  }

  /**
   * Resolve a empresa a que o armazém pertence.
   *
   * `@unique` global em `Armazem.codigo` continua a existir enquanto os
   * armazéns padrão não passarem a enviar `empresaId`; sem isto, dois armazéns
   * padrão criados por empresas diferentes colidiam no primeiro `upsert`.
   */
  private async resolverEmpresaPadrao(): Promise<string | null> {
    const empresa = await this.prisma.empresaConfig.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return empresa?.id ?? null;
  }

  /**
   * Garante a existência dos armazéns padrão no sistema:
   * - ARM-01: Geral (default para entradas de compras/materiais)
   * - ARM-02: Vendas (default para vendas e saídas de estoque)
   */
  async ensureDefaultArmazens(): Promise<void> {
    const empresaId = await this.resolverEmpresaPadrao();

    const defaultArmazens = [
      {
        codigo: 'ARM-01',
        designacao: 'Geral',
        empresaId,
        tipo: 'materia_prima' as const,
        localizacao: 'Edifício Principal - Setor de Armazenamento e Entradas',
        isDefaultCompras: true,
        isDefaultVendas: false,
        ativo: true,
      },
      {
        codigo: 'ARM-02',
        designacao: 'Vendas',
        empresaId,
        tipo: 'produto_acabado' as const,
        localizacao: 'Loja / Terminal de Vendas e Faturação',
        isDefaultCompras: false,
        isDefaultVendas: true,
        ativo: true,
      },
    ];

    for (const arm of defaultArmazens) {
      // O `@unique` global em `codigo` foi largado: `upsert` exige uma chave
      // única, e a composta (`empresaId, codigo`) trata NULL como distinto de
      // NULL — inútil para armazéns sem empresa. Recorre-se ao `findFirst`.
      const existente = await this.prisma.armazem.findFirst({
        where: { codigo: arm.codigo },
      });
      if (existente) {
        await this.prisma.armazem.update({
          where: { id: existente.id },
          data: {
            isDefaultCompras: arm.isDefaultCompras,
            isDefaultVendas: arm.isDefaultVendas,
          },
        });
      } else {
        await this.prisma.armazem.create({ data: arm });
      }
    }
  }

  /**
   * Lista todos os armazéns com filtros.
   */
  async listArmazens(filters?: unknown): Promise<{ items: Armazem[]; total: number }> {
    await this.ensureDefaultArmazens();

    const validatedFilters: ArmazemFilters = filters
      ? armazemFiltersSchema.parse(filters)
      : { skip: 0, take: 100 };

        const [items, total] = await Promise.all([
      this.repo.findAll({
        search: validatedFilters.search,
        tipo: validatedFilters.tipo,
        ativo: validatedFilters.ativo,
        orderBy: [
          { isDefaultVendas: 'desc' },
          { isDefaultCompras: 'desc' },
          { codigo: 'asc' },
        ],
        skip: validatedFilters.skip,
        take: validatedFilters.take,
      }),
      this.repo.count({
        search: validatedFilters.search,
        tipo: validatedFilters.tipo,
        ativo: validatedFilters.ativo,
      }),
    ]);

    return { items, total };
  }

  /**
   * Obtém armazém por ID.
   */
  async getArmazem(id: string): Promise<Armazem> {
    const armazem = await this.repo.findById(id);

    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${id}' não encontrado.`);
    }

    return armazem;
  }

  /**
   * Obtém o armazém padrão para Vendas (ARM-02 ou flag isDefaultVendas).
   */
  async getDefaultVendasArmazem(): Promise<Armazem> {
    await this.ensureDefaultArmazens();

    const armazem = await this.repo.findFirstAtivo({ isDefaultVendas: true });

    if (armazem) return armazem;

    const fallback = await this.repo.findByCodigo('ARM-02');

    if (fallback) return fallback;

    // Se nenhum encontrado, busca o primeiro armazém ativo
    const anyArmazem = await this.repo.findFirstAtivo();

    if (!anyArmazem) {
      throw new NotFoundError('Nenhum armazém ativo disponível no sistema.');
    }

    return anyArmazem;
  }

  /**
   * Obtém o armazém padrão para Compras/Entradas (ARM-01 ou flag isDefaultCompras).
   */
  async getDefaultComprasArmazem(): Promise<Armazem> {
    await this.ensureDefaultArmazens();

    const armazem = await this.repo.findFirstAtivo({ isDefaultCompras: true });

    if (armazem) return armazem;

    const fallback = await this.repo.findByCodigo('ARM-01');

    if (fallback) return fallback;

    const anyArmazem = await this.repo.findFirstAtivo({});

    if (!anyArmazem) {
      throw new NotFoundError('Nenhum armazém ativo disponível no sistema.');
    }

    return anyArmazem;
  }

  /**
   * Valida que a empresa existe, antes de gravar a referência.
   *
   * Sem esta verificação o `empresaId` aceito pelo validador acabava como FK
   * órfã quando o id não existia, e o erro só aparecia mais tarde, ao listar.
   */
  private async exigirEmpresa(empresaId: string): Promise<void> {
    const empresa = await this.prisma.empresaConfig.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });
    if (!empresa) {
      throw new NotFoundError(`Empresa com ID '${empresaId}' não encontrada.`);
    }
  }

  /**
   * Cria um novo armazém.
   */
  async createArmazem(rawInput: unknown): Promise<Armazem> {
    const data: CreateArmazemInput = createArmazemSchema.parse(rawInput);

    await this.exigirEmpresa(data.empresaId);

    // Unicidade por empresa, e não por código global: o `@@unique([empresaId,
    // codigo])` de M4 é o que vale, e o `@unique` global só se mantém como
    // rede de segurança até ao passo seguinte da migração.
    const existingCode = await this.prisma.armazem.findFirst({
      where: { codigo: data.codigo, empresaId: data.empresaId },
      select: { id: true },
    });
    if (existingCode) {
      throw new ConflictError(`Já existe um armazém registado com o código '${data.codigo}'.`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefaultVendas) {
        await tx.armazem.updateMany({
          where: { isDefaultVendas: true },
          data: { isDefaultVendas: false },
        });
      }

      if (data.isDefaultCompras) {
        await tx.armazem.updateMany({
          where: { isDefaultCompras: true },
          data: { isDefaultCompras: false },
        });
      }

      return this.repo.create(
        {
          codigo: data.codigo,
          designacao: data.designacao,
          empresaId: data.empresaId,
          descricao: data.descricao ?? null,
          tipo: data.tipo ?? null,
          localizacao: data.localizacao ?? null,
          isDefaultVendas: data.isDefaultVendas ?? false,
          isDefaultCompras: data.isDefaultCompras ?? false,
          ativo: data.ativo ?? true,
        },
        tx
      );
    });
  }

  /**
   * Atualiza um armazém existente.
   *
   * A empresa não é actualizável: mudá-la depois de haver stock e movimentos
   * associated deixaria o histórico associado passaria a pertencer a outra empresa.
   */
  async updateArmazem(id: string, rawInput: unknown): Promise<Armazem> {
    const data: UpdateArmazemInput = updateArmazemSchema.parse(rawInput);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Armazém com ID '${id}' não encontrado.`);
    }

    if (data.codigo && data.codigo !== existing.codigo) {
      const codeInUse = await this.prisma.armazem.findFirst({
        where: {
          codigo: data.codigo,
          empresaId: existing.empresaId,
          id: { not: id },
        },
        select: { id: true },
      });
      if (codeInUse) {
        throw new ConflictError(`Já existe um armazém registado com o código '${data.codigo}'.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefaultVendas) {
        await tx.armazem.updateMany({
          where: { isDefaultVendas: true, id: { not: id } },
          data: { isDefaultVendas: false },
        });
      }

      if (data.isDefaultCompras) {
        await tx.armazem.updateMany({
          where: { isDefaultCompras: true, id: { not: id } },
          data: { isDefaultCompras: false },
        });
      }

      return this.repo.update(
        id,
        {
          ...(data.codigo !== undefined && { codigo: data.codigo }),
          ...(data.designacao !== undefined && { designacao: data.designacao }),
          ...(data.descricao !== undefined && { descricao: data.descricao }),
          ...(data.tipo !== undefined && { tipo: data.tipo }),
          ...(data.localizacao !== undefined && { localizacao: data.localizacao }),
          ...(data.isDefaultVendas !== undefined && { isDefaultVendas: data.isDefaultVendas }),
          ...(data.isDefaultCompras !== undefined && { isDefaultCompras: data.isDefaultCompras }),
          ...(data.ativo !== undefined && { ativo: data.ativo }),
        },
        tx
      );
    });
  }

  /**
   * Desactiva um armazém.
   *
   * TASK-017 pede desactivar, e é o que se faz: `estoques`, `movimentos_stock`,
   * áreas, zonas e localizações apontam para o armazém. Um `DELETE` ou deixaria
   * linhas órfãs ou falharia no foreign key, e em ambos os casos perdia-se o
   * histórico. `ativo: false` esconde-o da operação corrente mantendo a
   * rastreabilidade.
   */
  async deactivateArmazem(id: string): Promise<Armazem> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Armazém com ID '${id}' não encontrado.`);
    }

    if (existing.codigo === 'ARM-01' || existing.codigo === 'ARM-02') {
      throw new BusinessRuleError(
        'Os armazéns padrão do sistema (ARM-01 e ARM-02) não podem ser desactivados.'
      );
    }

    return this.repo.deactivate(id);
  }

  /**
   * Remove um armazém, mas só quando não tem histórico; caso contrário
   * desactiva e explica porquê.
   *
   * Mantido porque a interface chama `deleteArmazem`. O caminho normal é
   * `deactivateArmazem`: a remoção física só faz sentido para um armazém
   * criado por engano e ainda vazio.
   */
  async deleteArmazem(id: string): Promise<{ deleted: boolean; inativado?: boolean; message: string }> {
    const existing = await this.prisma.armazem.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            movimentosOrigem: true,
            movimentosDestino: true,
            encomendasDestino: true,
            guiasRecepcao: true,
            inventarios: true,
            estoques: true,
            areas: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError(`Armazém com ID '${id}' não encontrado.`);
    }

    // Não permite apagar os armazéns do sistema ARM-01 ou ARM-02
    if (existing.codigo === 'ARM-01' || existing.codigo === 'ARM-02') {
      throw new BusinessRuleError('Os armazéns padrão do sistema (ARM-01 e ARM-02) não podem ser removidos.');
    }

    const contagens = existing._count ?? {};
    const hasHistory =
      (contagens.movimentosOrigem ?? 0) > 0 ||
      (contagens.movimentosDestino ?? 0) > 0 ||
      (contagens.encomendasDestino ?? 0) > 0 ||
      (contagens.guiasRecepcao ?? 0) > 0 ||
      (contagens.inventarios ?? 0) > 0 ||
      (contagens.estoques ?? 0) > 0 ||
      (contagens.areas ?? 0) > 0;

    if (hasHistory) {
      await this.repo.deactivate(id);
      return {
        deleted: false,
        inativado: true,
        message: 'O armazém possui histórico de movimentações e foi marcado como inativo.',
      };
    }

    await this.prisma.armazem.delete({ where: { id } });
    return {
      deleted: true,
      message: 'Armazém removido com sucesso.',
    };
  }

  /**
   * Estrutura do armazém: áreas → zonas → localizações, numa árvore.
   *
   * Existe para o canal `armazens:estrutura`, que devolve de uma só vez o que
   * `localizacoes:areas` + `localizacoes:zonas` + `localizacoes:list` dão em
   * três rondas — a leitura de referência de um armazém, não o filtro em
   * cascata, que continua a pedir nível a nível.
   */
  async listarEstrutura(armazemId: string): Promise<ArvoreLocalizacoes[]> {
    await this.getArmazem(armazemId);
    return this.localizacaoRepo.getTree(armazemId);
  }

  /**
   * Obtém o resumo de stock de todos os artigos para um armazém específico.
   *
   * Lê `estoques`, e não a soma de movimentos (decisão D2). Um armazém tem
   * uma linha por artigo e localização e lote; agregar movimentos aqui
   * duplicava a aritmética do `estoques` e reintroduzia a classe de bug que o
   * backfill já teve uma vez.
   */
  async getStockByArmazem(armazemId: string): Promise<{
    armazem: Armazem;
    artigos: Array<{
      artigoId: string;
      codigo: string;
      descricao: string;
      unidade: string;
      stockAtual: number;
      precoCustoMedio: number;
      valorTotal: number;
    }>;
    totalItens: number;
    valorTotalArmazem: number;
  }> {
    const armazem = await this.getArmazem(armazemId);

    // Só os artigos com saldo neste armazém. Um artigo sem posição não entra
    // na listagem: o painel mostra onde há mercadoria, não o catálogo inteiro.
    const posicoes = await this.estoqueRepo.findAllByArmazem(armazemId);

    const artigosStock = posicoes.map((posicao) => {
      const quantidade = Number(posicao.quantidade ?? 0);
      const pmp = Number(posicao.custoUnitario ?? 0);
      return {
        artigoId: posicao.artigoId,
        codigo: posicao.artigo.codigo,
        descricao: posicao.artigo.descricao,
        unidade: posicao.artigo.unidade,
        stockAtual: quantidade,
        precoCustoMedio: pmp,
        valorTotal: Number((quantidade * pmp).toFixed(2)),
      };
    });

    // `totalItens` conta artigos distintos, não posições. Um artigo em duas
    // prateleiras dá duas linhas em `artigos`, e contá-las como dois artigos
    // era o que a versão anterior evitava por listar um artigo por linha.
    const totalItens = new Set(
      artigosStock.filter((linha) => linha.stockAtual > 0).map((linha) => linha.artigoId)
    ).size;
    const valorTotalArmazem = artigosStock.reduce((acc, curr) => acc + curr.valorTotal, 0);

    return {
      armazem,
      artigos: artigosStock,
      totalItens,
      valorTotalArmazem: Number(valorTotalArmazem.toFixed(2)),
    };
  }
}

export const armazemService = new ArmazemService();
