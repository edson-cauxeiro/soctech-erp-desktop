/**
 * @file compras.api.ts
 * @description Cliente de API tipado para Compras (RF05) via Electron IPC.
 */

import {
  EncomendaCompraDto,
  GuiaRecepcaoDto,
  FaturaCompraDto,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface ComprasFiltersPayload {
  fornecedorId?: string;
  estado?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export const comprasApi = {
  // Encomendas
  async listEncomendas(filters?: ComprasFiltersPayload): Promise<IpcResponse<PaginatedResult<EncomendaCompraDto>>> {
    if (typeof window !== 'undefined' && window.api?.compras?.listEncomendas) {
      return window.api.compras.listEncomendas(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async getEncomenda(id: string): Promise<IpcResponse<EncomendaCompraDto>> {
    if (typeof window !== 'undefined' && window.api?.compras?.getEncomenda) {
      return window.api.compras.getEncomenda(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Encomenda não encontrada.' },
    };
  },

  async createEncomenda(payload: Partial<EncomendaCompraDto>): Promise<IpcResponse<EncomendaCompraDto>> {
    if (typeof window !== 'undefined' && window.api?.compras?.createEncomenda) {
      return window.api.compras.createEncomenda(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  // Guias de Receção
  async listGuias(filters?: ComprasFiltersPayload): Promise<IpcResponse<PaginatedResult<GuiaRecepcaoDto>>> {
    if (typeof window !== 'undefined' && window.api?.compras?.listGuias) {
      return window.api.compras.listGuias(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async getGuia(id: string): Promise<IpcResponse<GuiaRecepcaoDto>> {
    if (typeof window !== 'undefined' && window.api?.compras?.getGuia) {
      return window.api.compras.getGuia(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Guia de receção não encontrada.' },
    };
  },

  async createGuia(payload: Partial<GuiaRecepcaoDto>): Promise<IpcResponse<GuiaRecepcaoDto>> {
    if (typeof window !== 'undefined' && window.api?.compras?.createGuia) {
      return window.api.compras.createGuia(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  // Faturas de Fornecedor
  async listFaturas(filters?: ComprasFiltersPayload): Promise<IpcResponse<PaginatedResult<FaturaCompraDto>>> {
    if (typeof window !== 'undefined' && window.api?.compras?.listFaturas) {
      return window.api.compras.listFaturas(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async getFatura(id: string): Promise<IpcResponse<FaturaCompraDto>> {
    if (typeof window !== 'undefined' && window.api?.compras?.getFatura) {
      return window.api.compras.getFatura(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Fatura não encontrada.' },
    };
  },

  async createFatura(payload: Partial<FaturaCompraDto>): Promise<IpcResponse<FaturaCompraDto>> {
    if (typeof window !== 'undefined' && window.api?.compras?.createFatura) {
      return window.api.compras.createFatura(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },
};
