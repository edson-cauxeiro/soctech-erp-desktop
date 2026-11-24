/**
 * @file stock.router.ts
 * @description Registo de canais IPC para Movimentação de Estoque, Transferências e Inventário (RF06).
 */

import { stockController } from '../controllers/stock.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerStockRouter(): void {
  const handle = handleLicenciado('estoque');
  handle('stock:listMovimentos', async (_, filters) => {
    return stockController.listMovimentos(filters);
  });

  handle('stock:getArtigoArmazem', async (_, artigoId: string, armazemId: string) => {
    return stockController.getStockArtigoArmazem(artigoId, armazemId);
  });

  handle('stock:getTotalArtigo', async (_, artigoId: string) => {
    return stockController.getStockTotalArtigo(artigoId);
  });

  handle('stock:createMovimento', async (_, data) => {
    return stockController.createMovimento(data);
  });

  handle('stock:transferencia', async (_, data) => {
    return stockController.transferencia(data);
  });

  handle('stock:baixaVenda', async (_, data) => {
    return stockController.baixaVenda(data);
  });

  handle('stock:listInventarios', async (_, filters) => {
    return stockController.listInventarios(filters);
  });

  handle('stock:criarInventario', async (_, data) => {
    return stockController.criarInventario(data);
  });

  handle('stock:fecharInventario', async (_, id: string) => {
    return stockController.fecharInventario(id);
  });

  handle('stock:getEstadoStock', async (_event, filters?: unknown) => {
    return stockController.getEstadoStock(filters);
  });
}
