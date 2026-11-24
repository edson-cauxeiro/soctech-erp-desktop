/**
 * @file utilizador.router.ts
 * @description Registo dos handlers IPC de gestão de utilizadores.
 */

import { ipcMain } from 'electron';
import { utilizadorController } from '../controllers/utilizador.controller';

export function registerUtilizadorRouter(): void {
  ipcMain.handle('utilizadores:list', async (_event, filters) => {
    return utilizadorController.list(filters);
  });

  ipcMain.handle('utilizadores:get', async (_event, id) => {
    return utilizadorController.get(id);
  });

  ipcMain.handle('utilizadores:create', async (_event, data) => {
    return utilizadorController.create(data);
  });

  ipcMain.handle('utilizadores:update', async (_event, id, data) => {
    return utilizadorController.update(id, data);
  });

  ipcMain.handle('utilizadores:delete', async (_event, id) => {
    return utilizadorController.remove(id);
  });

  ipcMain.handle('utilizadores:changePassword', async (_event, id, data) => {
    return utilizadorController.changePassword(id, data);
  });

  ipcMain.handle('utilizadores:resetPassword', async (_event, id, data) => {
    return utilizadorController.resetPassword(id, data);
  });
}
