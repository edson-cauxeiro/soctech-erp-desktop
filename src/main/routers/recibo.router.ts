/**
 * @file recibo.router.ts
 * @description Registo de canais IPC para Recibos de Venda (RC).
 */

import { reciboController } from '../controllers/recibo.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerReciboRouter(): void {
  const handle = handleLicenciado('vendas');
  handle('recibos:list', async (_, filters) => {
    return reciboController.list(filters);
  });

  handle('recibos:get', async (_, id: string) => {
    return reciboController.get(id);
  });

  handle('recibos:criar', async (_, data) => {
    return reciboController.criar(data);
  });

  handle('recibos:imputarFaturas', async (_, id: string, imputacoes) => {
    return reciboController.imputarFaturas(id, imputacoes);
  });

  handle('recibos:anular', async (_, id: string, motivo: string) => {
    return reciboController.anular(id, motivo);
  });

  handle('recibos:getDocumentoImprimivel', async (_, id: string) => {
    return reciboController.getDocumentoImprimivel(id);
  });
}
