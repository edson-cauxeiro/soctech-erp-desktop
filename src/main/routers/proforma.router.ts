/**
 * @file proforma.router.ts
 * @description Registo de canais IPC para Proforma de Venda (FP).
 */

import { ipcMain } from 'electron';
import { proformaController } from '../controllers/proforma.controller';

export function registerProformaRouter(): void {
  ipcMain.handle('proformas:list', async (_, filters) => {
    return proformaController.list(filters);
  });

  ipcMain.handle('proformas:get', async (_, id: string) => {
    return proformaController.get(id);
  });

  ipcMain.handle('proformas:criar', async (_, data) => {
    return proformaController.criar(data);
  });

  ipcMain.handle('proformas:emitir', async (_, id: string) => {
    return proformaController.emitir(id);
  });

  ipcMain.handle('proformas:converterParaFatura', async (_, id: string, payload: { serie: string; armazemExpedicaoId?: string | null }) => {
    return proformaController.converterParaFatura(id, payload);
  });

  ipcMain.handle('proformas:converterParaGuia', async (_, id: string, payload: { serie: string; armazemExpedicaoId: string; localEntrega?: string | null; transportador?: string | null }) => {
    return proformaController.converterParaGuia(id, payload);
  });

  ipcMain.handle('proformas:anular', async (_, id: string, motivo: string) => {
    return proformaController.anular(id, motivo);
  });

  ipcMain.handle('proformas:getDocumentoImprimivel', async (_, id: string) => {
    return proformaController.getDocumentoImprimivel(id);
  });
}
