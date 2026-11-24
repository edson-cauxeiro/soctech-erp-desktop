/**
 * @file guias-entrega.api.ts
 * @description Cliente de API tipado para Guia de Entrega (GR).
 */

import {
  GuiaEntregaDto,
  FaturaVendaDto,
  DocumentoPrintDto,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface GuiaEntregaFiltersPayload {
  empresaId?: string;
  clienteId?: string;
  estado?: string;
  search?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface CriarGuiaEntregaPayload {
  empresaId: string;
  serie: string;
  data?: string | Date;
  clienteId: string;
  armazemExpedicaoId: string;
  proformaOrigemId?: string | null;
  encomendaOrigem?: string | null;
  localEntrega?: string | null;
  transportador?: string | null;
  observacoes?: string | null;
  linhas: Array<{
    artigoId: string;
    quantidade: number;
    lote?: string | null;
  }>;
}

export const guiasEntregaApi = {
  async list(filters?: GuiaEntregaFiltersPayload): Promise<IpcResponse<PaginatedResult<GuiaEntregaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.list === 'function') {
      return window.api.guiasEntrega.list(filters);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },

  async get(id: string): Promise<IpcResponse<GuiaEntregaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.get === 'function') {
      return window.api.guiasEntrega.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },

  async criar(payload: CriarGuiaEntregaPayload): Promise<IpcResponse<GuiaEntregaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.criar === 'function') {
      return window.api.guiasEntrega.criar(payload);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },

  async confirmar(id: string): Promise<IpcResponse<GuiaEntregaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.confirmar === 'function') {
      return window.api.guiasEntrega.confirmar(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },

  async faturar(id: string, payload: { serie: string }): Promise<IpcResponse<FaturaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.faturar === 'function') {
      return window.api.guiasEntrega.faturar(id, payload);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },

  async anular(id: string, motivo: string): Promise<IpcResponse<GuiaEntregaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.anular === 'function') {
      return window.api.guiasEntrega.anular(id, motivo);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<DocumentoPrintDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.guiasEntrega?.getDocumentoImprimivel === 'function') {
      return window.api.guiasEntrega.getDocumentoImprimivel(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de guias de entrega não disponível.' } };
  },
};
