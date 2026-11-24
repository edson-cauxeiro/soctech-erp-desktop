/**
 * @file auth.api.ts
 * @description Cliente de API tipado para autenticação que comunica via window.api (Electron IPC).
 */

import { UserSessionDto, IpcResponse } from '../@types/electron';

export interface LoginCredentials {
  login?: string;
  password?: string;
  utilizador?: string;
  senha?: string;
}

let mockSession: UserSessionDto | null = null;

export const authApi = {
  /**
   * Efetua o login do utilizador.
   */
  async login(credentials: LoginCredentials): Promise<IpcResponse<UserSessionDto>> {
    if (typeof window !== 'undefined' && window.api?.auth?.login) {
      return window.api.auth.login(credentials);
    }

    // Fallback gracioso para ambiente de desenvolvimento isolado no browser
    console.warn('window.api.auth não disponível. A utilizar fallback mock.');
    const user = credentials.login || credentials.utilizador || '';
    const pass = credentials.password || credentials.senha || '';

    if ((user === 'admin' || user === 'ana.marques') && pass === 'senha123') {
      mockSession = {
        id: user === 'admin' ? 'mock-user-admin' : 'mock-user-ana',
        login: user,
        nomeCompleto: user === 'admin' ? 'Administrador do Sistema' : 'Ana Marques',
        email: `${user}@doraerp.local`,
        perfilId: user === 'admin' ? 'admin-profile' : 'vendedor-profile',
        perfilNome: user === 'admin' ? 'Administrador' : 'Vendedor',
        permissoes: user === 'admin' ? { '*': true } : { vendas: ['read', 'write'], comercial: ['read'] },
      };
      return {
        success: true,
        data: mockSession,
      };
    }

    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas. Utilizador ou senha incorretos.',
      },
    };
  },

  /**
   * Efetua o logout do utilizador.
   */
  async logout(): Promise<IpcResponse<{ success: boolean }>> {
    if (typeof window !== 'undefined' && window.api?.auth?.logout) {
      return window.api.auth.logout();
    }
    mockSession = null;
    return { success: true, data: { success: true } };
  },

  /**
   * Obtém a sessão do utilizador autenticado.
   */
  async me(): Promise<IpcResponse<UserSessionDto | null>> {
    if (typeof window !== 'undefined' && window.api?.auth?.me) {
      return window.api.auth.me();
    }
    return { success: true, data: mockSession };
  },
};
