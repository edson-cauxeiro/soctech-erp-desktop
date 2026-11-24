/**
 * @file regra-stock.router.ts
 * @description Registo de canais IPC para Regras de Picking e Putaway (RF06).
 */

import { regraStockController } from '../controllers/regra-stock.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerRegraStockRouter(): void {
  const handle = handleLicenciado('estoque');
  // ── RegraPicking ──────────────────────────────────────────────────────────
  handle('regra:picking:create', async (_, payload) => {
    return regraStockController.createRegraPicking(payload);
  });

  handle('regra:picking:update', async (_, id: string, payload) => {
    return regraStockController.updateRegraPicking(id, payload);
  });

  handle('regra:picking:delete', async (_, id: string) => {
    return regraStockController.deleteRegraPicking(id);
  });

  handle('regra:picking:list', async (_, filters) => {
    return regraStockController.listRegrasPicking(filters);
  });

  // ── RegraPutaway ──────────────────────────────────────────────────────────
  handle('regra:putaway:create', async (_, payload) => {
    return regraStockController.createRegraPutaway(payload);
  });

  handle('regra:putaway:update', async (_, id: string, payload) => {
    return regraStockController.updateRegraPutaway(id, payload);
  });

  handle('regra:putaway:delete', async (_, id: string) => {
    return regraStockController.deleteRegraPutaway(id);
  });

  handle('regra:putaway:list', async (_, filters) => {
    return regraStockController.listRegrasPutaway(filters);
  });
}