/**
 * @file lote.api.ts
 * @description Cliente de API tipado para a gestão de lotes e validades (TASK-041).
 */

import { IpcResponse, LoteDto, PaginatedResult } from '../@types/electron';

export interface LoteFiltrosPayload {
  artigoId?: string;
  search?: string;
  estadoValidade?: 'valido' | 'proximo_caducar' | 'caducado' | 'sem_validade';
  skip?: number;
  take?: number;
}

export interface CriarLotePayload {
  artigoId: string;
  numeroLote: string;
  dataFabrico?: string | Date | null;
  dataValidade?: string | Date | null;
  fornecedorId?: string | null;
  precoCusto?: number | string | null;
  observacoes?: string | null;
}

export const loteApi = {
  async list(filters?: LoteFiltrosPayload): Promise<IpcResponse<PaginatedResult<LoteDto>>> {
    if (typeof window !== 'undefined' && window.api?.lotes?.list) {
      return window.api.lotes.list(filters);
    }
    return { success: true, data: { items: [], total: 0 } };
  },

  async get(id: string): Promise<IpcResponse<LoteDto>> {
    if (typeof window !== 'undefined' && window.api?.lotes?.get) {
      return window.api.lotes.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async create(data: CriarLotePayload): Promise<IpcResponse<LoteDto>> {
    if (typeof window !== 'undefined' && window.api?.lotes?.create) {
      return window.api.lotes.create(data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async update(id: string, data: Partial<LoteDto>): Promise<IpcResponse<LoteDto>> {
    if (typeof window !== 'undefined' && window.api?.lotes?.update) {
      return window.api.lotes.update(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async delete(id: string): Promise<IpcResponse<{ id: string }>> {
    if (typeof window !== 'undefined' && window.api?.lotes?.delete) {
      return window.api.lotes.delete(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },
};