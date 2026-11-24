/**
 * @file vendas.router.ts
 * @description Registo de canais IPC para Vendas e Faturação (RF03 / RF06).
 */

import { vendasController } from '../controllers/vendas.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerVendasRouter(): void {
  const handle = handleLicenciado('vendas');
  handle('vendas:listFaturas', async (_, filters) => {
    return vendasController.listFaturas(filters);
  });

  handle('vendas:getFatura', async (_, id: string) => {
    return vendasController.getFatura(id);
  });

  handle('vendas:emitirFatura', async (_, data) => {
    return vendasController.emitirFatura(data);
  });

  handle('vendas:anularFatura', async (_, id: string, motivo: string) => {
    return vendasController.anularFatura(id, motivo);
  });

  handle('vendas:getDocumentoImprimivel', async (_, id: string) => {
    return vendasController.getDocumentoImprimivel(id);
  });
}
