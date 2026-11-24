import { ElectronAPI } from '@electron-toolkit/preload';

export interface UserSessionDto {
  id: string;
  login: string;
  nomeCompleto: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  permissoes: Record<string, string[] | boolean>;
  armazemDefaultId?: string | null;
  empresaConfigId?: string | null;
}

export interface IpcSuccess<T> {
  success: true;
  data: T;
}

export interface IpcError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type IpcResponse<T> = IpcSuccess<T> | IpcError;

export interface ErpApi {
  auth: {
    login: (credentials: {
      login?: string;
      password?: string;
      utilizador?: string;
      senha?: string;
    }) => Promise<IpcResponse<UserSessionDto>>;
    logout: () => Promise<IpcResponse<{ success: boolean }>>;
    me: () => Promise<IpcResponse<UserSessionDto | null>>;
  };
  dbConfig: {
    ler: () => Promise<
      IpcResponse<{
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
        appSecret: string;
      }>
    >;
    guardar: (data: unknown) => Promise<IpcResponse<{ message: string }>>;
    testar: (
      data: unknown,
    ) => Promise<IpcResponse<{ ok: boolean; ms?: number; error?: string }>>;
  };
  utilizadores: {
    list: (filters?: unknown) => Promise<IpcResponse<unknown>>;
    get: (id: string) => Promise<IpcResponse<unknown>>;
    create: (data: unknown) => Promise<IpcResponse<unknown>>;
    update: (id: string, data: unknown) => Promise<IpcResponse<unknown>>;
    delete: (id: string) => Promise<IpcResponse<unknown>>;
    changePassword: (id: string, data: unknown) => Promise<IpcResponse<unknown>>;
    resetPassword: (id: string, data: unknown) => Promise<IpcResponse<unknown>>;
  };
  perfis: {
    list: () => Promise<IpcResponse<unknown>>;
    get: (id: string) => Promise<IpcResponse<unknown>>;
    create: (data: unknown) => Promise<IpcResponse<unknown>>;
    update: (id: string, data: unknown) => Promise<IpcResponse<unknown>>;
    delete: (id: string) => Promise<IpcResponse<unknown>>;
    duplicate: (id: string, novoNome: string) => Promise<IpcResponse<unknown>>;
  };
  localizacoes: {
    list: (filters?: unknown) => Promise<IpcResponse<unknown>>;
    get: (id: string) => Promise<IpcResponse<unknown>>;
    areas: (armazemId: string) => Promise<IpcResponse<unknown>>;
    criarArea: (data: unknown) => Promise<IpcResponse<unknown>>;
    criarZona: (data: unknown) => Promise<IpcResponse<unknown>>;
    zonas: (areaId: string) => Promise<IpcResponse<unknown>>;
    tree: (armazemId: string) => Promise<IpcResponse<unknown>>;
    create: (data: unknown) => Promise<IpcResponse<unknown>>;
    update: (id: string, data: unknown) => Promise<IpcResponse<unknown>>;
    delete: (id: string) => Promise<IpcResponse<unknown>>;
    mostrarCapacidade: (id: string) => Promise<IpcResponse<unknown>>;
    mostrarEstado: (id: string) => Promise<IpcResponse<unknown>>;
  };
  inventory: {
    consultarSaldo: (data: unknown) => Promise<IpcResponse<unknown>>;
    consultarStock: (filters?: unknown) => Promise<IpcResponse<unknown>>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: ErpApi;
  }
}
