/**
 * @file compras.router.ts
 * @description Registo de canais IPC para Compras, Encomendas, Guias de Receção e Faturas de Fornecedor (RF05).
 */

import { comprasController } from '../controllers/compras.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerComprasRouter(): void {
  const handle = handleLicenciado('compras');
  // Encomendas
  handle('compras:listEncomendas', async (_, filters) => {
    return comprasController.listEncomendas(filters);
  });

  handle('compras:getEncomenda', async (_, id: string) => {
    return comprasController.getEncomenda(id);
  });

  handle('compras:createEncomenda', async (_, data) => {
    return comprasController.createEncomenda(data);
  });

  // Guias de Receção
  handle('compras:listGuias', async (_, filters) => {
    return comprasController.listGuias(filters);
  });

  handle('compras:getGuia', async (_, id: string) => {
    return comprasController.getGuia(id);
  });

  handle('compras:createGuia', async (_, data) => {
    return comprasController.createGuia(data);
  });

  // Faturas de Fornecedor
  handle('compras:listFaturas', async (_, filters) => {
    return comprasController.listFaturas(filters);
  });

  handle('compras:getFatura', async (_, id: string) => {
    return comprasController.getFatura(id);
  });

  handle('compras:createFatura', async (_, data) => {
    return comprasController.createFatura(data);
  });
}
