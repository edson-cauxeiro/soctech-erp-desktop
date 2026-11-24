/**
 * @file fornecedor.router.ts
 * @description Registo dos handlers IPC do módulo de Fornecedores no Main Process.
 */

import { ipcMain } from 'electron';
import { fornecedorController } from '../controllers/fornecedor.controller';

export function registerFornecedorRouter(): void {
  ipcMain.handle('fornecedores:list', async (_event, filters?: unknown) => {
    return fornecedorController.list(filters);
  });

  ipcMain.handle('fornecedores:get', async (_event, id: string) => {
    return fornecedorController.get(id);
  });

  ipcMain.handle('fornecedores:create', async (_event, payload: unknown) => {
    return fornecedorController.create(payload);
  });

  ipcMain.handle('fornecedores:update', async (_event, id: string, payload: unknown) => {
    return fornecedorController.update(id, payload);
  });

  ipcMain.handle('fornecedores:delete', async (_event, id: string) => {
    return fornecedorController.delete(id);
  });
}
