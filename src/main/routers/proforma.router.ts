/**
 * @file proforma.router.ts
 * @description Registo de canais IPC para Proforma de Venda (FP).
 */

import { proformaController } from '../controllers/proforma.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerProformaRouter(): void {
  const handle = handleLicenciado('vendas');
  handle('proformas:list', async (_, filters) => {
    return proformaController.list(filters);
  });

  handle('proformas:get', async (_, id: string) => {
    return proformaController.get(id);
  });

  handle('proformas:criar', async (_, data) => {
    return proformaController.criar(data);
  });

  handle('proformas:emitir', async (_, id: string) => {
    return proformaController.emitir(id);
  });

  handle('proformas:converterParaFatura', async (_, id: string, payload: { serie: string; armazemExpedicaoId?: string | null }) => {
    return proformaController.converterParaFatura(id, payload);
  });

  handle('proformas:converterParaGuia', async (_, id: string, payload: { serie: string; armazemExpedicaoId: string; localEntrega?: string | null; transportador?: string | null }) => {
    return proformaController.converterParaGuia(id, payload);
  });

  handle('proformas:anular', async (_, id: string, motivo: string) => {
    return proformaController.anular(id, motivo);
  });

  handle('proformas:getDocumentoImprimivel', async (_, id: string) => {
    return proformaController.getDocumentoImprimivel(id);
  });
}
