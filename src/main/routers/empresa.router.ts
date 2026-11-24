/**
 * @file empresa.router.ts
 * @description Registo dos handlers IPC de Gestão de Empresas, Exercícios e Séries no Main Process.
 */

import { ipcMain } from 'electron';
import { empresaController } from '../controllers/empresa.controller';

/**
 * Regista todos os canais IPC de configuração de empresa, exercício fiscal e séries.
 */
export function registerEmpresaRouter(): void {
  // EMPRESA
  ipcMain.handle('empresa:list', async () => {
    return empresaController.list();
  });

  ipcMain.handle('empresa:get', async (_event, id?: string) => {
    return empresaController.get(id);
  });

  ipcMain.handle('empresa:create', async (_event, payload) => {
    return empresaController.create(payload);
  });

  ipcMain.handle('empresa:update', async (_event, id: string, payload: unknown) => {
    return empresaController.update(id, payload);
  });

  ipcMain.handle('empresa:delete', async (_event, id: string) => {
    return empresaController.delete(id);
  });

  ipcMain.handle('empresa:save', async (_event, payload) => {
    return empresaController.save(payload);
  });

  // EXERCÍCIO FISCAL
  ipcMain.handle('exercicio:list', async (_event, empresaId?: string) => {
    return empresaController.listExercicios(empresaId);
  });

  ipcMain.handle('exercicio:create', async (_event, payload) => {
    return empresaController.createExercicio(payload);
  });

  ipcMain.handle('exercicio:delete', async (_event, id: string) => {
    return empresaController.deleteExercicio(id);
  });

  // SÉRIES DE DOCUMENTOS
  ipcMain.handle('serie:list', async (_event, empresaId?: string, tipoDocumento?: any) => {
    return empresaController.listSeries(empresaId, tipoDocumento);
  });

  ipcMain.handle('serie:create', async (_event, payload) => {
    return empresaController.createSerie(payload);
  });

  ipcMain.handle('serie:delete', async (_event, id: string) => {
    return empresaController.deleteSerie(id);
  });
}

