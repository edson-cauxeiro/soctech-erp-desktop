/**
 * @file stock.api.ts
 * @description Cliente de API tipado para Movimentos de Stock e Inventário (RF06) via Electron IPC.
 */

import {
  MovimentoStockDto,
  InventarioContagemDto,
  AlertaStockDto,
  IpcResponse,
  PaginatedResult,
  ResumoEstadoStockDto,
} from '../@types/electron';

export interface StockFiltersPayload {
  artigoId?: string;
  armazemId?: string;
  tipo?: string;
  search?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface StockEstadoFiltersPayload {
  apenasAlertas?: boolean;
  search?: string;
  situacao?: 'normal' | 'stock_baixo' | 'rutura' | 'proximo_caducar' | 'caducado';
  skip?: number;
  take?: number;
}

export const stockApi = {
  async listMovimentos(filters?: StockFiltersPayload): Promise<IpcResponse<PaginatedResult<MovimentoStockDto>>> {
    if (typeof window !== 'undefined' && window.api?.stock?.listMovimentos) {
      return window.api.stock.listMovimentos(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async getArtigoArmazem(artigoId: string, armazemId: string): Promise<IpcResponse<number>> {
    if (typeof window !== 'undefined' && window.api?.stock?.getArtigoArmazem) {
      return window.api.stock.getArtigoArmazem(artigoId, armazemId);
    }
    return { success: true, data: 0 };
  },

  async getTotalArtigo(artigoId: string): Promise<IpcResponse<number>> {
    if (typeof window !== 'undefined' && window.api?.stock?.getTotalArtigo) {
      return window.api.stock.getTotalArtigo(artigoId);
    }
    return { success: true, data: 0 };
  },

  async createMovimento(payload: Partial<MovimentoStockDto>): Promise<IpcResponse<MovimentoStockDto>> {
    if (typeof window !== 'undefined' && window.api?.stock?.createMovimento) {
      return window.api.stock.createMovimento(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async transferencia(payload: {
    artigoId: string;
    quantidade: number;
    armazemOrigemId: string;
    armazemDestinoId: string;
    lote?: string | null;
    documentoOrigem?: string;
  }): Promise<IpcResponse<MovimentoStockDto>> {
    if (typeof window !== 'undefined' && window.api?.stock?.transferencia) {
      return window.api.stock.transferencia(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async baixaVenda(payload: {
    armazemId?: string | null;
    documentoOrigem: string;
    linhas: Array<{ artigoId: string; quantidade: number; precoUnitario?: number }>;
  }): Promise<IpcResponse<MovimentoStockDto[]>> {
    if (typeof window !== 'undefined' && window.api?.stock?.baixaVenda) {
      return window.api.stock.baixaVenda(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async listInventarios(): Promise<IpcResponse<InventarioContagemDto[]>> {
    if (typeof window !== 'undefined' && window.api?.stock?.listInventarios) {
      return window.api.stock.listInventarios();
    }
    return {
      success: true,
      data: [],
    };
  },

  async criarInventario(payload: {
    numero?: string;
    data: string | Date;
    armazemId: string;
    responsavel?: string;
    observacoes?: string;
    linhas: Array<{ artigoId: string; qtdContada: number; lote?: string }>;
  }): Promise<IpcResponse<InventarioContagemDto>> {
    if (typeof window !== 'undefined' && window.api?.stock?.criarInventario) {
      return window.api.stock.criarInventario(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async fecharInventario(id: string): Promise<IpcResponse<InventarioContagemDto>> {
    if (typeof window !== 'undefined' && window.api?.stock?.fecharInventario) {
      return window.api.stock.fecharInventario(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async getEstadoStock(
    filters?: StockEstadoFiltersPayload,
  ): Promise<IpcResponse<PaginatedResult<AlertaStockDto> & { resumo: ResumoEstadoStockDto }>> {
    if (typeof window !== 'undefined' && window.api?.stock?.getEstadoStock) {
      return window.api.stock.getEstadoStock(filters);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },
};
