/**
 * @file inventory.router.ts
 * @description Registo de canais IPC das consultas de stock (EPIC 3, TASK-024/029).
 *
 * Router fino: o payload vai cru para o controller, que valida com Zod,
 * verifica permissões e devolve `IpcResponse`.
 */

import { ipcMain } from 'electron';
import { inventoryController } from '../controllers/inventory.controller';

export function registerInventoryRouter(): void {
  /** Saldo servevel de um artigo, opcionalmente limitado a um armazém. */
  ipcMain.handle('inventory:consultar-saldo', async (_event, raw) => {
    try {
      return await inventoryController.consultarSaldo(raw);
    } catch (erro) {
      return {
        success: false as const,
        error: {
          code: 'INTERNAL_ERROR',
          message: (erro as Error)?.message || 'Erro ao consultar o saldo.',
        },
      };
    }
  });

  /** Stock por localização, com os filtros da TASK-029 e paginação. */
  ipcMain.handle('inventory:consultar-stock', async (_event, raw) => {
    try {
      return await inventoryController.consultarStock(raw);
    } catch (erro) {
      return {
        success: false as const,
        error: {
          code: 'INTERNAL_ERROR',
          message: (erro as Error)?.message || 'Erro ao consultar o stock.',
        },
      };
    }
  });
}
