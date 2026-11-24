/**
 * @file config.router.ts
 * @description Registo dos handlers IPC da configuração técnica da base de dados.
 */

import { ipcMain } from 'electron';
import { configController } from '../controllers/config.controller';

/**
 * Regista os canais IPC de leitura, gravação e teste da configuração.
 */
export function registerConfigRouter(): void {
  ipcMain.handle('config:ler', async () => {
    return configController.ler();
  });

  ipcMain.handle('config:guardar', async (_event, payload) => {
    return configController.guardar(payload);
  });

  ipcMain.handle('config:testar', async (_event, payload) => {
    return configController.testar(payload);
  });
}
