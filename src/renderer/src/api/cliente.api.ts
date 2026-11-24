/**
 * @file cliente.api.ts
 * @description Cliente de API tipado para Clientes (RF02) via Electron IPC.
 */

import { ClienteDto, IpcResponse, PaginatedResult } from '../@types/electron';

export interface ClienteFiltersPayload {
  search?: string;
  tipo?: string;
  estado?: string;
  skip?: number;
  take?: number;
}

export const clienteApi = {
  async list(filters?: ClienteFiltersPayload): Promise<IpcResponse<PaginatedResult<ClienteDto>>> {
    if (typeof window !== 'undefined' && window.api?.clientes?.list) {
      return window.api.clientes.list(filters);
    }
    return {
      success: true,
      data: { items: [], total: 0 },
    };
  },

  async get(id: string): Promise<IpcResponse<ClienteDto>> {
    if (typeof window !== 'undefined' && window.api?.clientes?.get) {
      return window.api.clientes.get(id);
    }
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Cliente não encontrado.' },
    };
  },

  async create(payload: Partial<ClienteDto>): Promise<IpcResponse<ClienteDto>> {
    if (typeof window !== 'undefined' && window.api?.clientes?.create) {
      return window.api.clientes.create(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },

  async update(id: string, payload: Partial<ClienteDto>): Promise<IpcResponse<ClienteDto>> {
    if (typeof window !== 'undefined' && window.api?.clientes?.update) {
      return window.api.clientes.update(id, payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },

  async delete(id: string): Promise<IpcResponse<{ deleted: boolean; inativado?: boolean; message: string }>> {
    if (typeof window !== 'undefined' && window.api?.clientes?.delete) {
      return window.api.clientes.delete(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'IPC API não disponível.' },
    };
  },
};
