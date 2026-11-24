/**
 * @file artigo.router.ts
 * @description Registo dos handlers IPC do módulo de Artigos no Main Process.
 */

import { ipcMain } from 'electron';
import { artigoController } from '../controllers/artigo.controller';

export function registerArtigoRouter(): void {
  ipcMain.handle('artigos:list', async (_event, filters?: unknown) => {
    return artigoController.list(filters);
  });

  ipcMain.handle('artigos:get', async (_event, id: string) => {
    return artigoController.get(id);
  });

  ipcMain.handle('artigos:create', async (_event, payload: unknown) => {
    return artigoController.create(payload);
  });

  ipcMain.handle('artigos:update', async (_event, id: string, payload: unknown) => {
    return artigoController.update(id, payload);
  });

  ipcMain.handle('artigos:delete', async (_event, id: string) => {
    return artigoController.delete(id);
  });
}
