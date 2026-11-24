/**
 * @file perfil.router.ts
 * @description Registo dos handlers IPC de gestão de perfis de acesso e permissões.
 */

import { ipcMain } from 'electron';
import { perfilController } from '../controllers/perfil.controller';

export function registerPerfilRouter(): void {
  ipcMain.handle('perfis:list', async () => {
    return perfilController.list();
  });

  ipcMain.handle('perfis:get', async (_event, id) => {
    return perfilController.get(id);
  });

  ipcMain.handle('perfis:create', async (_event, data) => {
    return perfilController.create(data);
  });

  ipcMain.handle('perfis:update', async (_event, id, data) => {
    return perfilController.update(id, data);
  });

  ipcMain.handle('perfis:delete', async (_event, id) => {
    return perfilController.remove(id);
  });

  ipcMain.handle('perfis:duplicate', async (_event, id, novoNome) => {
    return perfilController.duplicate(id, novoNome);
  });
}
