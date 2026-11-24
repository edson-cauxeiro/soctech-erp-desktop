/**
 * @file guia-entrega.router.ts
 * @description Registo de canais IPC para Guia de Entrega (GR).
 */

import { ipcMain } from 'electron';
import { guiaEntregaController } from '../controllers/guia-entrega.controller';

export function registerGuiaEntregaRouter(): void {
  ipcMain.handle('guiasEntrega:list', async (_, filters) => {
    return guiaEntregaController.list(filters);
  });

  ipcMain.handle('guiasEntrega:get', async (_, id: string) => {
    return guiaEntregaController.get(id);
  });

  ipcMain.handle('guiasEntrega:criar', async (_, data) => {
    return guiaEntregaController.criar(data);
  });

  ipcMain.handle('guiasEntrega:confirmar', async (_, id: string) => {
    return guiaEntregaController.confirmar(id);
  });

  ipcMain.handle('guiasEntrega:faturar', async (_, id: string, payload: { serie: string }) => {
    return guiaEntregaController.faturar(id, payload);
  });

  ipcMain.handle('guiasEntrega:anular', async (_, id: string, motivo: string) => {
    return guiaEntregaController.anular(id, motivo);
  });

  ipcMain.handle('guiasEntrega:getDocumentoImprimivel', async (_, id: string) => {
    return guiaEntregaController.getDocumentoImprimivel(id);
  });
}
