/**
 * @file serie.api.ts
 * @description Cliente de API tipado para Gestão de Séries por empresa e tipo de documento via window.api (Electron IPC).
 */

import { SerieDocumentoDto, TipoSerieDocumento, IpcResponse } from '../@types/electron';

export interface CreateSeriePayload {
  codigo: string;
  descricao: string;
  empresaId: string;
  tipoDocumento?: TipoSerieDocumento;
  modulos?: string[];
  dataInicio: string;
  dataFim: string;
  ultimoLancamento?: number;
  estado?: 'ativo' | 'inativo';
}

export const serieApi = {
  /**
   * Lista todas as séries de documentos, opcionalmente filtradas por empresa e tipo de documento.
   */
  async list(empresaId?: string, tipoDocumento?: TipoSerieDocumento): Promise<IpcResponse<SerieDocumentoDto[]>> {
    if (typeof window !== 'undefined' && window.api?.serie?.list) {
      return window.api.serie.list(empresaId, tipoDocumento);
    }
    return {
      success: true,
      data: [],
    };
  },

  /**
   * Cria uma nova série de documentos.
   */
  async create(data: CreateSeriePayload): Promise<IpcResponse<SerieDocumentoDto>> {
    if (typeof window !== 'undefined' && window.api?.serie?.create) {
      return window.api.serie.create(data);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  /**
   * Elimina uma série de documentos.
   */
  async delete(id: string): Promise<IpcResponse<SerieDocumentoDto>> {
    if (typeof window !== 'undefined' && window.api?.serie?.delete) {
      return window.api.serie.delete(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },
};
