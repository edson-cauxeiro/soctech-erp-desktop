/**
 * @file fiscal.router.ts
 * @description Registo de canais IPC do módulo Fiscal.
 *
 * Os canais seguem `{modulo}:{entidade}:{acao}` de `.agents/workflows/03`.
 * `gerarSaft` e `validarSaft` são os dois canais que `03-ipc-patterns.md`
 * reserva para este módulo; os restantes seguem a mesma convenção.
 */

import { ipcMain } from 'electron';
import { fiscalController } from '../controllers/fiscal.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerFiscalRouter(): void {
  const handle = handleLicenciado('fiscal');
  // SAF-T
  handle('fiscal:saft:gerar', async (_, payload: unknown) => {
    return fiscalController.gerarSaft(payload);
  });

  handle('fiscal:saft:validar', async (_, payload: unknown) => {
    return fiscalController.validarSaft(payload);
  });

  // Conformidade AGT
  handle('fiscal:agt:gerar', async (_, payload: unknown) => {
    return fiscalController.gerarAgt(payload);
  });

  handle('fiscal:agt:resposta', async (_, payload: unknown) => {
    return fiscalController.registarRespostaAgt(payload);
  });

  handle('fiscal:agt:listar', async (_, payload: unknown) => {
    return fiscalController.listarSubmissoes(payload);
  });

  // Auditoria
  ipcMain.handle('fiscal:auditoria:listar', async (_, payload: unknown) => {
    return fiscalController.listarAuditoria(payload);
  });

  ipcMain.handle('fiscal:auditoria:integridade', async (_, payload: unknown) => {
    return fiscalController.verificarIntegridade(payload);
  });

  ipcMain.handle('fiscal:auditoria:resumo', async (_, payload: unknown) => {
    return fiscalController.resumoAuditoria(payload);
  });

  ipcMain.handle('fiscal:auditoria:arquivar', async (_, payload: unknown) => {
    return fiscalController.arquivarAuditoria(payload);
  });

  ipcMain.handle('fiscal:auditoria:desarquivar', async (_, payload: unknown) => {
    return fiscalController.desarquivarAuditoria(payload);
  });
}