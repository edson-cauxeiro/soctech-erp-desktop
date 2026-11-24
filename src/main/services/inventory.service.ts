/**
 * @file inventory.service.ts
 * @description Consultas de saldo de stock por posição (EPIC 3, TASK-024/029).
 *
 * `estoques` é o saldo materializado (decisão D2): é daqui que se lê quanto
 * existe e onde, nunca da soma de `movimentos_stock`. Este serviço não escreve
 * — entradas, saídas, transferências e ajustes passam por `stock.service.ts`,
 * que os transacciona com o livro-razão.
 */

import { PrismaClient, Prisma, EstadoEstoque } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  EstoqueRepository,
  LinhaStockPorLocalizacao,
} from '../repositories/inventory.repository';
import {
  consultarStockSchema,
  type ConsultarStockInput,
} from '../validators/inventory.validator';

/** Linha devolvida ao renderer: a árvore achatada em colunas de nível. */
export interface StockPorLocalizacaoDto {
  id: string;
  estado: EstadoEstoque;
  quantidade: Prisma.Decimal;
  quantidadeReservada: Prisma.Decimal;
  /** `quantidade - quantidadeReservada`, calculado no processo principal. */
  disponivel: Prisma.Decimal;
  custoUnitario: Prisma.Decimal;
  valorTotal: Prisma.Decimal;
  artigo: { id: string; codigo: string; descricao: string; unidade: string };
  armazem: { id: string; codigo: string; designacao: string };
  lote: { id: string; numeroLote: string; dataValidade: Date | null } | null;
  localizacao: { id: string; codigo: string; designacao: string | null; bloqueada: boolean } | null;
  zona: { id: string; codigo: string; designacao: string } | null;
  area: { id: string; codigo: string; designacao: string } | null;
}

export class InventoryService {
  private estoqueRepo: EstoqueRepository;

  constructor(prismaClient: PrismaClient = defaultPrisma, estoqueRepo?: EstoqueRepository) {
    this.estoqueRepo = estoqueRepo ?? new EstoqueRepository(prismaClient);
  }

  /**
   * Saldo servevel de um artigo: total menos reservado, somado sobre todas as
   * posições — e sobre todas as localizações quando não há armazém indicado.
   */
  async consultarSaldo(artigoId: string, armazemId?: string): Promise<Prisma.Decimal> {
    return this.estoqueRepo.availableQuantity({ artigoId, armazemId });
  }

  /**
   * Stock por localização com os filtros da TASK-029 e paginação.
   *
   * Devolve `{ items, total, skip, take }` de uma vez: o total é lido na mesma
   * ronda que a página, e remeter o `skip`/`take` evita que a UI tenha de
   * adivinhar qual página está a ver quando os filtros mudam.
   */
  async listarStock(rawInput: unknown): Promise<{
    items: StockPorLocalizacaoDto[];
    total: number;
    skip: number;
    take: number;
  }> {
    const filtros: ConsultarStockInput = consultarStockSchema.parse(rawInput ?? {});

    const { items, total } = await this.estoqueRepo.listarPorLocalizacao(filtros, {
      skip: filtros.skip,
      take: filtros.take,
    });

    return {
      items: items.map(paraDto),
      total,
      skip: filtros.skip,
      take: filtros.take,
    };
  }
}

/**
 * Achata `localizacao → zona → área` para a linha da tabela.
 *
 * Um stock sem endereço (decisão D4) mantém `localizacao`, `zona` e `area` a
 * `null` em vez de os inventar: a linha aparece com o armazém certo e os
 * níveis físicos por preencher, que é o estado real da posição.
 */
function paraDto(linha: LinhaStockPorLocalizacao): StockPorLocalizacaoDto {
  const localizacao = linha.localizacao;
  const zona = localizacao?.zona ?? null;
  const area = zona?.area ?? null;

  return {
    id: linha.id,
    estado: linha.estado,
    quantidade: linha.quantidade,
    quantidadeReservada: linha.quantidadeReservada,
    disponivel: linha.quantidade.minus(linha.quantidadeReservada),
    custoUnitario: linha.custoUnitario,
    valorTotal: linha.quantidade.times(linha.custoUnitario),
    artigo: linha.artigo,
    armazem: linha.armazem,
    lote: linha.lote,
    localizacao: localizacao
      ? {
          id: localizacao.id,
          codigo: localizacao.codigo,
          designacao: localizacao.designacao,
          bloqueada: localizacao.bloqueada,
        }
      : null,
    zona: zona ? { id: zona.id, codigo: zona.codigo, designacao: zona.designacao } : null,
    area: area ? { id: area.id, codigo: area.codigo, designacao: area.designacao } : null,
  };
}

export const inventoryService = new InventoryService();
