/**
 * @file useAuth.ts
 * @description Hook e store Zustand para gestão do estado de autenticação e sessão.
 */

import { create } from 'zustand';
import { authApi, LoginCredentials } from '../api/auth.api';
import { UserSessionDto } from '../@types/electron';

interface AuthState {
  user: UserSessionDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  hasPermission: (modulo: string, acao?: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials: LoginCredentials): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(credentials);
      if (response.success) {
        set({
          user: response.data,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: response.error.message,
        });
        return false;
      }
    } catch (err) {
      const msg = (err as Error)?.message || 'Erro inesperado na autenticação.';
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: msg,
      });
      return false;
    }
  },

  logout: async (): Promise<void> => {
    set({ isLoading: true });
    try {
      await authApi.logout();
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  checkSession: async (): Promise<void> => {
    set({ isLoading: true });
    try {
      const response = await authApi.me();
      if (response.success && response.data) {
        set({
          user: response.data,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  hasPermission: (modulo: string, acao = 'read'): boolean => {
    const { user } = get();
    if (!user) return false;

    if (
      user.perfilNome === 'Administrador' ||
      user.permissoes['*'] === true ||
      (Array.isArray(user.permissoes['*']) && user.permissoes['*'].includes('*'))
    ) {
      return true;
    }

    const modulePerms = user.permissoes[modulo];
    if (!modulePerms) return false;
    if (modulePerms === true) return true;
    if (Array.isArray(modulePerms)) {
      return modulePerms.includes('*') || modulePerms.includes(acao);
    }

    return false;
  },
}));
