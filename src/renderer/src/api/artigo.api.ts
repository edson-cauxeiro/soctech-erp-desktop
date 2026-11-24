/**
 * @file artigo.api.ts
 * @description Cliente de API tipado para Artigos (Master Data 360°) via Electron IPC.
 */

import { ArtigoDto, IpcResponse, PaginatedResult } from '../@types/electron';

export interface ArtigoFiltersPayload {
  search?: string;
  tipo?: string;
  estado?: string;
  familia?: string;
  skip?: number;
  take?: number;
}

export const artigoApi = {
  async list(filters?: ArtigoFiltersPayload): Promise<IpcResponse<PaginatedResult<ArtigoDto>>> {
    if (typeof window !== 'undefined' && window.api?.artigos?.list) {
      return window.api.artigos.list(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async get(id: string): Promise<IpcResponse<ArtigoDto>> {
    if (typeof window !== 'undefined' && window.api?.artigos?.get) {
      return window.api.artigos.get(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Artigo não encontrado.' },
    };
  },

  async create(payload: Partial<ArtigoDto>): Promise<IpcResponse<ArtigoDto>> {
    if (typeof window !== 'undefined' && window.api?.artigos?.create) {
      return window.api.artigos.create(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },

  async update(id: string, payload: Partial<ArtigoDto>): Promise<IpcResponse<ArtigoDto>> {
    if (typeof window !== 'undefined' && window.api?.artigos?.update) {
      return window.api.artigos.update(id, payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },

  async delete(id: string): Promise<IpcResponse<{ deleted: boolean; inativado?: boolean; message: string }>> {
    if (typeof window !== 'undefined' && window.api?.artigos?.delete) {
      return window.api.artigos.delete(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },
};
