/**
 * @file artigo.router.ts
 * @description Registo dos handlers IPC do módulo de Artigos no Main Process.
 */

import { artigoController } from '../controllers/artigo.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerArtigoRouter(): void {
  const handle = handleLicenciado(['vendas', 'estoque', 'comercial']);
  handle('artigos:list', async (_event, filters?: unknown) => {
    return artigoController.list(filters);
  });

  handle('artigos:get', async (_event, id: string) => {
    return artigoController.get(id);
  });

  handle('artigos:create', async (_event, payload: unknown) => {
    return artigoController.create(payload);
  });

  handle('artigos:update', async (_event, id: string, payload: unknown) => {
    return artigoController.update(id, payload);
  });

  handle('artigos:delete', async (_event, id: string) => {
    return artigoController.delete(id);
  });
}
