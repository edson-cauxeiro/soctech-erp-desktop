/**
 * @file vendas.api.ts
 * @description Cliente de API tipado para Vendas e Faturação Fiscal (FT/FR/NC/ND) via Electron IPC.
 */

import {
  FaturaVendaDto,
  DocumentoPrintDto,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface VendasFiltersPayload {
  empresaId?: string;
  clienteId?: string;
  tipo?: string;
  estadoDocumento?: string;
  estadoPagamento?: string;
  search?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface EmitirFaturaPayload {
  empresaId: string;
  serie: string;
  tipo?: 'fatura' | 'fatura_recibo' | 'nota_credito' | 'nota_debito';
  dataEmissao?: string | Date;
  dataVencimento?: string | Date;
  clienteId: string;
  armazemExpedicaoId?: string | null;
  encomendaOrigem?: string | null;
  faturaOrigemId?: string | null;
  guiaEntregaOrigemId?: string | null;
  proformaOrigemId?: string | null;
  motivoNotaCredito?: string | null;
  motivoIsencao?: string | null;
  estadoPagamento?: 'pago' | 'pendente' | 'parcial' | 'vencido';
  /// Obrigatórios quando `tipo = 'fatura_recibo'`: a fatura afirma que o
  /// dinheiro já entrou, logo a conta tem de ser real e o meio de pagamento
  /// tem de bater certo com a arqueação da caixa.
  meioPagamento?: 'numerario' | 'transferencia' | 'cheque' | 'multicaixa' | null;
  contaBancariaId?: string | null;
  dataPagamento?: string | Date;
  linhas: Array<{
    artigoId: string;
    quantidade: number;
    precoUnitario: number;
    desconto?: number;
    taxaIva: number;
    motivoIsencao?: string | null;
  }>;
}

export const vendasApi = {
  async listFaturas(filters?: VendasFiltersPayload): Promise<IpcResponse<PaginatedResult<FaturaVendaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.vendas?.listFaturas === 'function') {
      return window.api.vendas.listFaturas(filters);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API de vendas não disponível.' },
    };
  },

  async getFatura(id: string): Promise<IpcResponse<FaturaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.vendas?.getFatura === 'function') {
      return window.api.vendas.getFatura(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API de vendas não disponível.' },
    };
  },

  async emitirFatura(payload: EmitirFaturaPayload): Promise<IpcResponse<FaturaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.vendas?.emitirFatura === 'function') {
      return window.api.vendas.emitirFatura(payload);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API de vendas não disponível.' },
    };
  },

  async anularFatura(id: string, motivo: string): Promise<IpcResponse<FaturaVendaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.vendas?.anularFatura === 'function') {
      return window.api.vendas.anularFatura(id, motivo);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API de vendas não disponível.' },
    };
  },

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<DocumentoPrintDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.vendas?.getDocumentoImprimivel === 'function') {
      return window.api.vendas.getDocumentoImprimivel(id);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API de impressão não disponível.' },
    };
  },
};
