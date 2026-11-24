/**
 * @file proformas.api.ts
 * @description Cliente de API tipado para Proformas de Venda (FP).
 */

import {
  ProformaVendaDto,
  FaturaVendaDto,
  GuiaEntregaDto,
  DocumentoPrintDto,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface ProformaFiltersPayload {
  empresaId?: string;
  clienteId?: string;
  estado?: string;
  search?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface CriarProformaPayload {
  empresaId: string;
  serie: string;
  dataEmissao?: string | Date;
  dataValidade?: string | Date;
  clienteId: string;
  encomendaOrigem?: string | null;
  motivoIsencao?: string | null;
  linhas: Array<{
    artigoId: string;
    quantidade: number;
    precoUnitario: number;
    desconto?: number;
    taxaIva: number;
    motivoIsencao?: string | null;
  }>;
}

export const proformasApi = {
  async list(filters?: ProformaFiltersPayload): Promise<IpcResponse<PaginatedResult<ProformaVendaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.list === 'function') {
      return window.api.proformas.list(filters);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async get(id: string): Promise<IpcResponse<ProformaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.get === 'function') {
      return window.api.proformas.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async criar(payload: CriarProformaPayload): Promise<IpcResponse<ProformaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.criar === 'function') {
      return window.api.proformas.criar(payload);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async emitir(id: string): Promise<IpcResponse<ProformaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.emitir === 'function') {
      return window.api.proformas.emitir(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async converterParaFatura(id: string, payload: { serie: string; armazemExpedicaoId?: string | null }): Promise<IpcResponse<FaturaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.converterParaFatura === 'function') {
      return window.api.proformas.converterParaFatura(id, payload);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async converterParaGuia(id: string, payload: { serie: string; armazemExpedicaoId: string; localEntrega?: string | null; transportador?: string | null }): Promise<IpcResponse<GuiaEntregaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.converterParaGuia === 'function') {
      return window.api.proformas.converterParaGuia(id, payload);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async anular(id: string, motivo: string): Promise<IpcResponse<ProformaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.anular === 'function') {
      return window.api.proformas.anular(id, motivo);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<DocumentoPrintDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.proformas?.getDocumentoImprimivel === 'function') {
      return window.api.proformas.getDocumentoImprimivel(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de proformas não disponível.' } };
  },
};
