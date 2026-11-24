/**
 * @file cliente.router.ts
 * @description Registo dos handlers IPC do módulo de Clientes no Main Process.
 */

import { ipcMain } from 'electron';
import { clienteController } from '../controllers/cliente.controller';

export function registerClienteRouter(): void {
  ipcMain.handle('clientes:list', async (_event, filters?: unknown) => {
    return clienteController.list(filters);
  });

  ipcMain.handle('clientes:get', async (_event, id: string) => {
    return clienteController.get(id);
  });

  ipcMain.handle('clientes:create', async (_event, payload: unknown) => {
    return clienteController.create(payload);
  });

  ipcMain.handle('clientes:update', async (_event, id: string, payload: unknown) => {
    return clienteController.update(id, payload);
  });

  ipcMain.handle('clientes:delete', async (_event, id: string) => {
    return clienteController.delete(id);
  });
}
