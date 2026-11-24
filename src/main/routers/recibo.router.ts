/**
 * @file recibo.router.ts
 * @description Registo de canais IPC para Recibos de Venda (RC).
 */

import { ipcMain } from 'electron';
import { reciboController } from '../controllers/recibo.controller';

export function registerReciboRouter(): void {
  ipcMain.handle('recibos:list', async (_, filters) => {
    return reciboController.list(filters);
  });

  ipcMain.handle('recibos:get', async (_, id: string) => {
    return reciboController.get(id);
  });

  ipcMain.handle('recibos:criar', async (_, data) => {
    return reciboController.criar(data);
  });

  ipcMain.handle('recibos:imputarFaturas', async (_, id: string, imputacoes) => {
    return reciboController.imputarFaturas(id, imputacoes);
  });

  ipcMain.handle('recibos:anular', async (_, id: string, motivo: string) => {
    return reciboController.anular(id, motivo);
  });

  ipcMain.handle('recibos:getDocumentoImprimivel', async (_, id: string) => {
    return reciboController.getDocumentoImprimivel(id);
  });
}
