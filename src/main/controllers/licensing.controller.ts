/**
 * @file licensing.controller.ts
 * @description Operações IPC de licenciamento. O diálogo de ficheiro corre no
 * Main; o Renderer receive apenas o conteúdo e uma pré-visualização, nunca um
 * caminho de sistema nem acesso directo à BD.
 */

import { readFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import { licensingService } from '../services/licensing.service';
import { AppError } from '../utils/errors';
import type { LicensingContext } from '../utils/licensing-handler';
import type { LicensePreviewResult } from '../../shared/licensing/types';

export interface SelecaoLicenca {
  cancelado: boolean;
  nome?: string;
  conteudo?: string;
  previsualizacao?: LicensePreviewResult;
}

function contexto({ empresaId, utilizadorId }: LicensingContext) {
  return { empresaId, utilizadorId };
}

export const licensingController = {
  async getStatus() {
    return licensingService.obterEstado();
  },

  async getModules() {
    return licensingService.obterModulosLicenciados();
  },

  async checkModule({ modulo }: { modulo: string }) {
    return licensingService.checkModuleAccess(modulo);
  },

  /** Abre o diálogo nativo, valida o ficheiro e devolve conteúdo para confirmação. */
  async selectFile(): Promise<SelecaoLicenca> {
    const janela = BrowserWindow.getFocusedWindow();
    if (!janela) throw new AppError('Janela principal não encontrada.', 'WINDOW_NOT_FOUND', 500);

    const escolha = await dialog.showOpenDialog(janela, {
      title: 'Selecionar licença',
      properties: ['openFile'],
      filters: [{ name: 'Licenças ERP (*.erplic)', extensions: ['erplic'] }],
    });
    if (escolha.canceled || escolha.filePaths.length === 0) return { cancelado: true };

    const [caminho] = escolha.filePaths;
    const nome = caminho.split(/[\\/]/).pop() ?? caminho;
    const previsualizacao = await licensingService.previewLicenseFile(caminho);
    let conteudo: string;
    try {
      conteudo = await readFile(caminho, 'utf8');
    } catch {
      throw new AppError('Não foi possível ler o ficheiro de licença.', 'LICENSE_READ_ERROR', 500);
    }

    return { cancelado: false, nome, conteudo, previsualizacao };
  },

  async import({ conteudo }: { conteudo: string }, ctx: LicensingContext) {
    return licensingService.importLicenseContent(conteudo, contexto(ctx));
  },

  async remove(_input: Record<string, never>, ctx: LicensingContext) {
    return licensingService.removerLicenca(contexto(ctx));
  },

  async getEvents({ limite }: { limite: number }, ctx: LicensingContext) {
    if (!ctx.empresaId) return { registos: [], proximoCursor: null, total: 0 };
    return licensingService.listarEventos(ctx.empresaId, limite);
  },
};
