/**
 * @file guia-entrega.router.ts
 * @description Registo de canais IPC para Guia de Entrega (GR).
 */

import { guiaEntregaController } from '../controllers/guia-entrega.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerGuiaEntregaRouter(): void {
  const handle = handleLicenciado('vendas');
  handle('guiasEntrega:list', async (_, filters) => {
    return guiaEntregaController.list(filters);
  });

  handle('guiasEntrega:get', async (_, id: string) => {
    return guiaEntregaController.get(id);
  });

  handle('guiasEntrega:criar', async (_, data) => {
    return guiaEntregaController.criar(data);
  });

  handle('guiasEntrega:confirmar', async (_, id: string) => {
    return guiaEntregaController.confirmar(id);
  });

  handle('guiasEntrega:faturar', async (_, id: string, payload: { serie: string }) => {
    return guiaEntregaController.faturar(id, payload);
  });

  handle('guiasEntrega:anular', async (_, id: string, motivo: string) => {
    return guiaEntregaController.anular(id, motivo);
  });

  handle('guiasEntrega:getDocumentoImprimivel', async (_, id: string) => {
    return guiaEntregaController.getDocumentoImprimivel(id);
  });
}
