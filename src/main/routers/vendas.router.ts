/**
 * @file vendas.router.ts
 * @description Registo de canais IPC para Vendas e Faturação (RF03 / RF06).
 */

import { ipcMain } from 'electron';
import { vendasController } from '../controllers/vendas.controller';

export function registerVendasRouter(): void {
  ipcMain.handle('vendas:listFaturas', async (_, filters) => {
    return vendasController.listFaturas(filters);
  });

  ipcMain.handle('vendas:getFatura', async (_, id: string) => {
    return vendasController.getFatura(id);
  });

  ipcMain.handle('vendas:emitirFatura', async (_, data) => {
    return vendasController.emitirFatura(data);
  });

  ipcMain.handle('vendas:anularFatura', async (_, id: string, motivo: string) => {
    return vendasController.anularFatura(id, motivo);
  });

  ipcMain.handle('vendas:getDocumentoImprimivel', async (_, id: string) => {
    return vendasController.getDocumentoImprimivel(id);
  });
}
