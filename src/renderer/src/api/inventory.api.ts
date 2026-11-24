/**
 * @file inventory.api.ts
 * @description Cliente de API tipado para as consultas de stock (EPIC 3, TASK-024/029).
 *
 * Todos os métodos devolvem o `IpcResponse` tal como vem do processo principal:
 * quem chama decide entre `data` e `error`, em vez de aqui se lançar exceções
 * que a UI teria de apanhar no mesmo sítio de qualquer maneira.
 */

import type {
  FiltrosStockLocalizacao,
  IpcResponse,
  StockLocalizacaoDto,
} from '../@types/electron';

export interface ResultadoStockLocalizacao {
  items: StockLocalizacaoDto[];
  total: number;
  skip: number;
  take: number;
}

export const inventoryApi = {
  async consultarSaldo(dados: {
    artigoId: string;
    armazemId?: string;
  }): Promise<IpcResponse<{ disponivel: number }>> {
    if (typeof window !== 'undefined' && window.api?.inventory?.consultarSaldo) {
      return window.api.inventory.consultarSaldo(dados);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },

  async consultarStock(
    filtros?: FiltrosStockLocalizacao
  ): Promise<IpcResponse<ResultadoStockLocalizacao>> {
    if (typeof window !== 'undefined' && window.api?.inventory?.consultarStock) {
      return window.api.inventory.consultarStock(filtros);
    }
    return {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'API não disponível.' },
    };
  },
};
