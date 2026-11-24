/**
 * @file licensing.api.ts
 * @description Cliente tipado das operações de licenciamento via window.api.
 */

import type {
  ImportLicenseResult,
  LicensePreviewResult,
  LicenseStatusResult,
  ModuleAccessResult,
} from '../../../shared/licensing/types';
import type { IpcResponse } from '../@types/electron';

export interface SelecaoLicencaDto {
  cancelado: boolean;
  nome?: string;
  conteudo?: string;
  previsualizacao?: LicensePreviewResult;
}

function indisponivel<T>(operacao: string): IpcResponse<T> {
  console.warn(`window.api.licensing.${operacao} não disponível neste ambiente.`);
  return {
    success: false,
    error: {
      code: 'UNAVAILABLE',
      message: 'O licenciamento só está disponível na aplicação desktop.',
    },
  };
}

export const licensingApi = {
  getStatus(): Promise<IpcResponse<LicenseStatusResult>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.getStatus) {
      return window.api.licensing.getStatus();
    }
    return Promise.resolve(indisponivel<LicenseStatusResult>('getStatus'));
  },

  getModules(): Promise<IpcResponse<string[]>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.getModules) {
      return window.api.licensing.getModules();
    }
    return Promise.resolve(indisponivel<string[]>('getModules'));
  },

  checkModule(modulo: string): Promise<IpcResponse<ModuleAccessResult>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.checkModule) {
      return window.api.licensing.checkModule(modulo);
    }
    return Promise.resolve(indisponivel<ModuleAccessResult>('checkModule'));
  },

  getEvents(limite = 50): Promise<IpcResponse<unknown>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.getEvents) {
      return window.api.licensing.getEvents(limite);
    }
    return Promise.resolve(indisponivel('getEvents'));
  },

  selectFile(): Promise<IpcResponse<SelecaoLicencaDto>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.selectFile) {
      return window.api.licensing.selectFile();
    }
    return Promise.resolve(indisponivel<SelecaoLicencaDto>('selectFile'));
  },

  import(conteudo: string): Promise<IpcResponse<ImportLicenseResult>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.import) {
      return window.api.licensing.import(conteudo);
    }
    return Promise.resolve(indisponivel<ImportLicenseResult>('import'));
  },

  remove(): Promise<IpcResponse<boolean>> {
    if (typeof window !== 'undefined' && window.api?.licensing?.remove) {
      return window.api.licensing.remove();
    }
    return Promise.resolve(indisponivel<boolean>('remove'));
  },
};
