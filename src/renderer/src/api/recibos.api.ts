/**
 * @file recibos.api.ts
 * @description Cliente de API tipado para Recibos de Venda (RC) e Imputações.
 */

import {
  ReciboVendaDto,
  DocumentoPrintDto,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface ReciboFiltersPayload {
  empresaId?: string;
  clienteId?: string;
  estadoDocumento?: string;
  search?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface CriarReciboPayload {
  empresaId: string;
  serie: string;
  data?: string | Date;
  clienteId: string;
  meioPagamento: 'numerario' | 'transferencia' | 'cheque' | 'multicaixa';
  valorRecebido: number;
  /// Conta que recebe o dinheiro. Obrigatória: um recibo sem conta não entra
  /// na tesouraria e o estado de pago da fatura não bate certo com o caixa.
  contaBancariaId: string;
  /// Texto livre legado, mantido apenas para compatibilidade.
  contaBancaria?: string | null;
  retencaoFonte?: number;
  observacoes?: string | null;
  imputacoes?: Array<{ faturaId: string; valorImputado: number }>;
}

export const recibosApi = {
  async list(filters?: ReciboFiltersPayload): Promise<IpcResponse<PaginatedResult<ReciboVendaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.recibos?.list === 'function') {
      return window.api.recibos.list(filters);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de recibos não disponível.' } };
  },

  async get(id: string): Promise<IpcResponse<ReciboVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.recibos?.get === 'function') {
      return window.api.recibos.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de recibos não disponível.' } };
  },

  async criar(payload: CriarReciboPayload): Promise<IpcResponse<ReciboVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.recibos?.criar === 'function') {
      return window.api.recibos.criar(payload);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de recibos não disponível.' } };
  },

  async imputarFaturas(id: string, imputacoes: Array<{ faturaId: string; valorImputado: number }>): Promise<IpcResponse<ReciboVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.recibos?.imputarFaturas === 'function') {
      return window.api.recibos.imputarFaturas(id, imputacoes);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de recibos não disponível.' } };
  },

  async anular(id: string, motivo: string): Promise<IpcResponse<ReciboVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.recibos?.anular === 'function') {
      return window.api.recibos.anular(id, motivo);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de recibos não disponível.' } };
  },

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<DocumentoPrintDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.recibos?.getDocumentoImprimivel === 'function') {
      return window.api.recibos.getDocumentoImprimivel(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API de recibos não disponível.' } };
  },
};
