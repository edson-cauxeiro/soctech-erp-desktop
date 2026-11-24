/**
 * @file regra-stock.router.ts
 * @description Registo de canais IPC para Regras de Picking e Putaway (RF06).
 */

import { ipcMain } from 'electron';
import { regraStockController } from '../controllers/regra-stock.controller';

export function registerRegraStockRouter(): void {
  // ── RegraPicking ──────────────────────────────────────────────────────────
  ipcMain.handle('regra:picking:create', async (_, payload) => {
    return regraStockController.createRegraPicking(payload);
  });

  ipcMain.handle('regra:picking:update', async (_, id: string, payload) => {
    return regraStockController.updateRegraPicking(id, payload);
  });

  ipcMain.handle('regra:picking:delete', async (_, id: string) => {
    return regraStockController.deleteRegraPicking(id);
  });

  ipcMain.handle('regra:picking:list', async (_, filters) => {
    return regraStockController.listRegrasPicking(filters);
  });

  // ── RegraPutaway ──────────────────────────────────────────────────────────
  ipcMain.handle('regra:putaway:create', async (_, payload) => {
    return regraStockController.createRegraPutaway(payload);
  });

  ipcMain.handle('regra:putaway:update', async (_, id: string, payload) => {
    return regraStockController.updateRegraPutaway(id, payload);
  });

  ipcMain.handle('regra:putaway:delete', async (_, id: string) => {
    return regraStockController.deleteRegraPutaway(id);
  });

  ipcMain.handle('regra:putaway:list', async (_, filters) => {
    return regraStockController.listRegrasPutaway(filters);
  });
}