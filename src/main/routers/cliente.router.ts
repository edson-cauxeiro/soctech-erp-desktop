/**
 * @file cliente.router.ts
 * @description Registo dos handlers IPC do módulo de Clientes no Main Process.
 */

import { clienteController } from '../controllers/cliente.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerClienteRouter(): void {
  const handle = handleLicenciado(['vendas', 'comercial']);
  handle('clientes:list', async (_event, filters?: unknown) => {
    return clienteController.list(filters);
  });

  handle('clientes:get', async (_event, id: string) => {
    return clienteController.get(id);
  });

  handle('clientes:create', async (_event, payload: unknown) => {
    return clienteController.create(payload);
  });

  handle('clientes:update', async (_event, id: string, payload: unknown) => {
    return clienteController.update(id, payload);
  });

  handle('clientes:delete', async (_event, id: string) => {
    return clienteController.delete(id);
  });
}
