/**
 * @file auth.router.ts
 * @description Registo dos handlers IPC de autenticação no Main Process do Electron.
 */

import { ipcMain } from 'electron';
import { authController } from '../controllers/auth.controller';

/**
 * Regista todos os canais IPC de autenticação.
 */
export function registerAuthRouter(): void {
  ipcMain.handle('auth:login', async (_event, payload) => {
    return authController.login(payload);
  });

  ipcMain.handle('auth:logout', async () => {
    return authController.logout();
  });

  ipcMain.handle('auth:me', async () => {
    return authController.me();
  });
}
