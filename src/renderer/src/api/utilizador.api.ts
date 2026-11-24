/**
 * @file utilizador.api.ts
 * @description Cliente de API tipado para a gestão de utilizadores (RNF03) via Electron IPC.
 */

import {
  UtilizadorDto,
  UtilizadorCriarInput,
  UtilizadorAtualizarInput,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

export interface UtilizadorFiltrosPayload {
  search?: string;
  perfilId?: string;
  estado?: 'ativo' | 'inativo';
  empresaConfigId?: string;
  take?: number;
  skip?: number;
}

export const utilizadorApi = {
  async list(filters?: UtilizadorFiltrosPayload): Promise<IpcResponse<PaginatedResult<UtilizadorDto>>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.list) {
      return window.api.utilizadores.list(filters);
    }
    return { success: true, data: { items: [], total: 0 } };
  },

  async get(id: string): Promise<IpcResponse<UtilizadorDto>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.get) {
      return window.api.utilizadores.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Utilizador não encontrado.' } };
  },

  async create(data: UtilizadorCriarInput): Promise<IpcResponse<UtilizadorDto>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.create) {
      return window.api.utilizadores.create(data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível criar o utilizador.' } };
  },

  async update(id: string, data: UtilizadorAtualizarInput): Promise<IpcResponse<UtilizadorDto>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.update) {
      return window.api.utilizadores.update(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível actualizar o utilizador.' } };
  },

  async remove(id: string): Promise<IpcResponse<{ id: string }>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.delete) {
      return window.api.utilizadores.delete(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível eliminar o utilizador.' } };
  },

  async changePassword(id: string, data: { senhaAtual: string; novaSenha: string }): Promise<IpcResponse<{ id: string; actualizadoEm: string | Date }>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.changePassword) {
      return window.api.utilizadores.changePassword(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível alterar a senha.' } };
  },

  async resetPassword(id: string, data: { novaSenha: string }): Promise<IpcResponse<{ id: string; actualizadoEm: string | Date }>> {
    if (typeof window !== 'undefined' && window.api?.utilizadores?.resetPassword) {
      return window.api.utilizadores.resetPassword(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível repor a senha.' } };
  },
};
