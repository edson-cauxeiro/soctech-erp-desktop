/**
 * @file armazem.api.ts
 * @description Cliente de API tipado para Armazéns (RF06) via Electron IPC.
 */

import {
  ArmazemDto,
  ArmazemStockDetailDto,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface ArmazemFiltersPayload {
  search?: string;
  tipo?: string;
  ativo?: boolean;
  skip?: number;
  take?: number;
}

export const armazemApi = {
  async list(filters?: ArmazemFiltersPayload): Promise<IpcResponse<PaginatedResult<ArmazemDto>>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.list) {
      return window.api.armazens.list(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async get(id: string): Promise<IpcResponse<ArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.get) {
      return window.api.armazens.get(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Armazém não encontrado.' },
    };
  },

  async getDefaultVendas(): Promise<IpcResponse<ArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.getDefaultVendas) {
      return window.api.armazens.getDefaultVendas();
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async getDefaultCompras(): Promise<IpcResponse<ArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.getDefaultCompras) {
      return window.api.armazens.getDefaultCompras();
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async getStock(armazemId: string): Promise<IpcResponse<ArmazemStockDetailDto>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.getStock) {
      return window.api.armazens.getStock(armazemId);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async create(payload: Partial<ArmazemDto>): Promise<IpcResponse<ArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.create) {
      return window.api.armazens.create(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async update(id: string, payload: Partial<ArmazemDto>): Promise<IpcResponse<ArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.update) {
      return window.api.armazens.update(id, payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async delete(id: string): Promise<IpcResponse<{ deleted: boolean; inativado?: boolean; message: string }>> {
    if (typeof window !== 'undefined' && window.api?.armazens?.delete) {
      return window.api.armazens.delete(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },
};
