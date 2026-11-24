/**
 * @file picking.service.ts
 * @description Serviço de picking – EPIC 3, TASK-021 + TASK-042.
 *
 * Responsável por listar as posições de stock elegíveis para picking,
 * respetando a disponibilidade (quantidade – quantidadeReservada > 0) e
 * opcionalmente filtrando por artigo ou armazém. A ordem é definida por
 * `RegraPicking` (estrategia: fifo, fefo, lifo, mais_proximo, manual).
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';

/** Saldo servevel de uma posição: total menos o que já está reservado. */
function disponivel(quantidade: Prisma.Decimal, reservada: Prisma.Decimal): number {
  return quantidade.minus(reservada).toNumber();
}

export class PickingService {
  private readonly prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Listar posições de stock elegíveis para picking.
   *
   * - `apenasDisponivel = true` (padrão) → só posições com
   *   `quantidade - quantidadeReservada > 0`.
   * - Filtros opcionais por `artigoId` e `armazemId`.
   * - Ordem definida pela `RegraPicking` aplicável (fifo, fefo, lifo, mais_proximo, manual).
   */
  async listarElegiveis(raw: { artigoId?: string; armazemId?: string }): Promise<{
    id: string;
    artigoCodigo: string;
    armazemCodigo: string;
    localizacaoCodigo: string;
    disponivel: number;
  }[]> {
    const { artigoId, armazemId } = raw;

    // 1. Buscar posições com os filtros de artigo/armazém.
    const where: Prisma.EstoqueWhereInput = {};

    if (artigoId) where.artigoId = artigoId;
    if (armazemId) where.armazemId = armazemId;

    // 2. Buscar posições no prisma com dados necessários para ordenação.
    const posicoes = await this.prisma.estoque.findMany({
      where,
      select: {
        id: true,
        artigo: { select: { codigo: true } },
        armazem: { select: { codigo: true, id: true } },
        localizacao: { select: { codigo: true, id: true } },
        quantidade: true,
        quantidadeReservada: true,
        lote: { select: { dataValidade: true } },
        createdAt: true,
      },
    });

    // 3. Filtrar apenas as que têm saldo disponível
    const elegiveis = posicoes.filter((p) => disponivel(p.quantidade, p.quantidadeReservada) > 0);

    // 4. Determinar a regra de picking aplicável
    const armazemIds = [...new Set(elegiveis.map((p) => p.armazem?.id).filter(Boolean) as string[])];
    const regras = await this.obterRegrasPicking(armazemIds);

    // 4. Mapear para saída
    const resultado = elegiveis.map((p) => ({
      id: p.id,
      artigoCodigo: p.artigo?.codigo ?? 'desconhecido',
      armazemCodigo: p.armazem?.codigo ?? 'desconhecido',
      localizacaoCodigo: p.localizacao?.codigo ?? 'desconhecido',
      disponivel: disponivel(p.quantidade, p.quantidadeReservada),
      _dataValidade: p.lote?.dataValidade ? new Date(p.lote.dataValidade) : null,
      _dataMovimento: p.createdAt ? new Date(p.createdAt) : null,
      _armazemId: p.armazem?.id ?? null,
    }));

    // 5. Ordenar conforme a regra de picking aplicável
    this.ordenarPorRegra(resultado, regras);

    // 6. Retornar apenas campos públicos
    return resultado.map(({ _dataValidade, _dataMovimento, _armazemId, ...r }) => r);
  }

  /**
   * Obtém as regras de picking ativas para os armazéns indicados,
   * ordenadas por prioridade (menor primeiro).
   */
  private async obterRegrasPicking(armazemIds: string[]): Promise<{
    armazemId: string;
    estrategia: 'fifo' | 'fefo' | 'lifo' | 'mais_proximo' | 'manual';
    respeitarValidade: boolean;
  }[]> {
    const regras = await this.prisma.regraPicking.findMany({
      where: {
        armazemId: { in: armazemIds },
        ativo: true,
      },
      orderBy: { prioridade: 'asc' },
      select: {
        armazemId: true,
        estrategia: true,
        respeitarValidade: true,
      },
    });

    return regras as any;
  }

  /**
   * Ordena o resultado conforme a primeira regra que se aplica a cada armazém.
   * A regra mais prioritária (prioridade menor) vence.
   */
  private ordenarPorRegra(
    resultado: {
      disponivel: number;
      localizacaoCodigo: string;
      _dataValidade: Date | null;
      _dataMovimento: Date | null;
      _armazemId: string | null;
    }[],
    regras: { armazemId: string; estrategia: 'fifo' | 'fefo' | 'lifo' | 'mais_proximo' | 'manual'; respeitarValidade: boolean }[]
  ): void {
    resultado.sort((a, b) => {
      // Obter regra aplicável ao armazém de cada item
      const regraA = a._armazemId ? regras.find((r) => r.armazemId === a._armazemId) : null;
      const regraB = b._armazemId ? regras.find((r) => r.armazemId === b._armazemId) : null;

      // Se não há regra, usa FIFO como padrão
      const estrategiaA = regraA?.estrategia ?? 'fifo';
      const estrategiaB = regraB?.estrategia ?? 'fifo';
      const respeitarValidadeA = regraA?.respeitarValidade ?? true;
      const respeitarValidadeB = regraB?.respeitarValidade ?? true;

      // Se estratégias diferentes, não podemos comparar diretamente — ordena por armazém primeiro
      if (estrategiaA !== estrategiaB) {
        const armazemOrderA = a._armazemId ?? '';
        const armazemOrderB = b._armazemId ?? '';
        return armazemOrderA.localeCompare(armazemOrderB);
      }

      const estrategia = estrategiaA;

      switch (estrategia) {
        case 'fefo': {
          // FEFO: validade mais próxima primeiro (apenas se respeitarValidade)
          if (respeitarValidadeA && respeitarValidadeB) {
            const valA = a._dataValidade?.getTime() ?? Infinity;
            const valB = b._dataValidade?.getTime() ?? Infinity;
            if (valA !== valB) return valA - valB;
          }
          // Fallback FIFO
          const dataA = a._dataMovimento?.getTime() ?? Infinity;
          const dataB = b._dataMovimento?.getTime() ?? Infinity;
          if (dataA !== dataB) return dataA - dataB;
          return a.localizacaoCodigo.localeCompare(b.localizacaoCodigo);
        }
        case 'lifo': {
          // LIFO: mais recente primeiro
          const dataA = a._dataMovimento?.getTime() ?? 0;
          const dataB = b._dataMovimento?.getTime() ?? 0;
          if (dataA !== dataB) return dataB - dataA;
          return a.localizacaoCodigo.localeCompare(b.localizacaoCodigo);
        }
        case 'mais_proximo': {
          // Mais próximo: por código de localização (proxy para proximidade física)
          const locA = a.localizacaoCodigo;
          const locB = b.localizacaoCodigo;
          if (locA !== locB) return locA.localeCompare(locB);
          return 0;
        }
        case 'manual': {
          // Manual: não ordena automaticamente, mantém ordem de disponibilidade
          if (a.disponivel !== b.disponivel) return b.disponivel - a.disponivel;
          return a.localizacaoCodigo.localeCompare(b.localizacaoCodigo);
        }
        case 'fifo':
        default: {
          // FIFO: mais antigo primeiro (por data do movimento)
          const dataA = a._dataMovimento?.getTime() ?? Infinity;
          const dataB = b._dataMovimento?.getTime() ?? Infinity;
          if (dataA !== dataB) return dataA - dataB;
          return a.localizacaoCodigo.localeCompare(b.localizacaoCodigo);
        }
      }
    });
  }
}

export const pickingService = new PickingService();