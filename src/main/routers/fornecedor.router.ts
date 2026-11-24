/**
 * @file fornecedor.router.ts
 * @description Registo dos handlers IPC do módulo de Fornecedores no Main Process.
 */

import { fornecedorController } from '../controllers/fornecedor.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerFornecedorRouter(): void {
  const handle = handleLicenciado('compras');
  handle('fornecedores:list', async (_event, filters?: unknown) => {
    return fornecedorController.list(filters);
  });

  handle('fornecedores:get', async (_event, id: string) => {
    return fornecedorController.get(id);
  });

  handle('fornecedores:create', async (_event, payload: unknown) => {
    return fornecedorController.create(payload);
  });

  handle('fornecedores:update', async (_event, id: string, payload: unknown) => {
    return fornecedorController.update(id, payload);
  });

  handle('fornecedores:delete', async (_event, id: string) => {
    return fornecedorController.delete(id);
  });
}
