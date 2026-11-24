/**
 * @file perfil.api.ts
 * @description Cliente de API tipado para a gestão de perfis de acesso e permissões (RNF03) via Electron IPC.
 */

import {
  PerfilAcessoDto,
  PerfilAcessoCriarInput,
  PermissoesRbac,
  IpcResponse,
} from '../@types/electron';

export const perfilApi = {
  async list(): Promise<IpcResponse<PerfilAcessoDto[]>> {
    if (typeof window !== 'undefined' && window.api?.perfis?.list) {
      return window.api.perfis.list();
    }
    return { success: true, data: [] };
  },

  async get(id: string): Promise<IpcResponse<PerfilAcessoDto>> {
    if (typeof window !== 'undefined' && window.api?.perfis?.get) {
      return window.api.perfis.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Perfil não encontrado.' } };
  },

  async create(data: PerfilAcessoCriarInput): Promise<IpcResponse<PerfilAcessoDto>> {
    if (typeof window !== 'undefined' && window.api?.perfis?.create) {
      return window.api.perfis.create(data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível criar o perfil.' } };
  },

  async update(
    id: string,
    data: { nome?: string; descricao?: string; permissoes?: PermissoesRbac }
  ): Promise<IpcResponse<PerfilAcessoDto>> {
    if (typeof window !== 'undefined' && window.api?.perfis?.update) {
      return window.api.perfis.update(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível actualizar o perfil.' } };
  },

  async remove(id: string): Promise<IpcResponse<{ id: string }>> {
    if (typeof window !== 'undefined' && window.api?.perfis?.delete) {
      return window.api.perfis.delete(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível eliminar o perfil.' } };
  },

  async duplicate(id: string, novoNome: string): Promise<IpcResponse<PerfilAcessoDto>> {
    if (typeof window !== 'undefined' && window.api?.perfis?.duplicate) {
      return window.api.perfis.duplicate(id, novoNome);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Não foi possível duplicar o perfil.' } };
  },
};
