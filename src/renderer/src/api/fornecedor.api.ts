/**
 * @file fornecedor.api.ts
 * @description Cliente de API tipado para Fornecedores (RF05) via Electron IPC.
 */

import { FornecedorDto, IpcResponse, PaginatedResult } from '../@types/electron';

export interface FornecedorFiltersPayload {
  search?: string;
  estado?: string;
  skip?: number;
  take?: number;
}

export const fornecedorApi = {
  async list(filters?: FornecedorFiltersPayload): Promise<IpcResponse<PaginatedResult<FornecedorDto>>> {
    if (typeof window !== 'undefined' && window.api?.fornecedores?.list) {
      return window.api.fornecedores.list(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async get(id: string): Promise<IpcResponse<FornecedorDto>> {
    if (typeof window !== 'undefined' && window.api?.fornecedores?.get) {
      return window.api.fornecedores.get(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Fornecedor não encontrado.' },
    };
  },

  async create(payload: Partial<FornecedorDto>): Promise<IpcResponse<FornecedorDto>> {
    if (typeof window !== 'undefined' && window.api?.fornecedores?.create) {
      return window.api.fornecedores.create(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },

  async update(id: string, payload: Partial<FornecedorDto>): Promise<IpcResponse<FornecedorDto>> {
    if (typeof window !== 'undefined' && window.api?.fornecedores?.update) {
      return window.api.fornecedores.update(id, payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },

  async delete(id: string): Promise<IpcResponse<{ deleted: boolean; message: string }>> {
    if (typeof window !== 'undefined' && window.api?.fornecedores?.delete) {
      return window.api.fornecedores.delete(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },
};
