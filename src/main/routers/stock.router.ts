/**
 * @file stock.router.ts
 * @description Registo de canais IPC para Movimentação de Estoque, Transferências e Inventário (RF06).
 */

import { ipcMain } from 'electron';
import { stockController } from '../controllers/stock.controller';

export function registerStockRouter(): void {
  ipcMain.handle('stock:listMovimentos', async (_, filters) => {
    return stockController.listMovimentos(filters);
  });

  ipcMain.handle('stock:getArtigoArmazem', async (_, artigoId: string, armazemId: string) => {
    return stockController.getStockArtigoArmazem(artigoId, armazemId);
  });

  ipcMain.handle('stock:getTotalArtigo', async (_, artigoId: string) => {
    return stockController.getStockTotalArtigo(artigoId);
  });

  ipcMain.handle('stock:createMovimento', async (_, data) => {
    return stockController.createMovimento(data);
  });

  ipcMain.handle('stock:transferencia', async (_, data) => {
    return stockController.transferencia(data);
  });

  ipcMain.handle('stock:baixaVenda', async (_, data) => {
    return stockController.baixaVenda(data);
  });

  ipcMain.handle('stock:listInventarios', async (_, filters) => {
    return stockController.listInventarios(filters);
  });

  ipcMain.handle('stock:criarInventario', async (_, data) => {
    return stockController.criarInventario(data);
  });

  ipcMain.handle('stock:fecharInventario', async (_, id: string) => {
    return stockController.fecharInventario(id);
  });

  ipcMain.handle('stock:getEstadoStock', async (_event, filters?: unknown) => {
    return stockController.getEstadoStock(filters);
  });
}
