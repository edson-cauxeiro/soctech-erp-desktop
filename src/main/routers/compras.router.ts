/**
 * @file compras.router.ts
 * @description Registo de canais IPC para Compras, Encomendas, Guias de Receção e Faturas de Fornecedor (RF05).
 */

import { ipcMain } from 'electron';
import { comprasController } from '../controllers/compras.controller';

export function registerComprasRouter(): void {
  // Encomendas
  ipcMain.handle('compras:listEncomendas', async (_, filters) => {
    return comprasController.listEncomendas(filters);
  });

  ipcMain.handle('compras:getEncomenda', async (_, id: string) => {
    return comprasController.getEncomenda(id);
  });

  ipcMain.handle('compras:createEncomenda', async (_, data) => {
    return comprasController.createEncomenda(data);
  });

  // Guias de Receção
  ipcMain.handle('compras:listGuias', async (_, filters) => {
    return comprasController.listGuias(filters);
  });

  ipcMain.handle('compras:getGuia', async (_, id: string) => {
    return comprasController.getGuia(id);
  });

  ipcMain.handle('compras:createGuia', async (_, data) => {
    return comprasController.createGuia(data);
  });

  // Faturas de Fornecedor
  ipcMain.handle('compras:listFaturas', async (_, filters) => {
    return comprasController.listFaturas(filters);
  });

  ipcMain.handle('compras:getFatura', async (_, id: string) => {
    return comprasController.getFatura(id);
  });

  ipcMain.handle('compras:createFatura', async (_, data) => {
    return comprasController.createFatura(data);
  });
}
