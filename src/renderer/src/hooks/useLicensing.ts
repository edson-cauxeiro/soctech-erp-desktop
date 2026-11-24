/**
 * @file useLicensing.ts
 * @description Estado da licença no Renderer, usado apenas para apresentação.
 *
 * A decisão efectiva continua no Main. Se este IPC falhar, a navegação falha
 * aberta para não deixar a aplicação inutilizável — os handlers protegidos
 * continuam a verificar a licença por conta própria.
 */

import { create } from 'zustand';
import { licensingApi } from '../api/licensing.api';
import { isAlwaysAvailableModule, isLicensingModule } from '../../../shared/licensing/modules';
import type { LicenseStatusResult, LicensingModuleKey } from '../../../shared/licensing/types';

interface LicensingState {
  status: LicenseStatusResult | null;
  licensedModules: LicensingModuleKey[];
  carregado: boolean;
  carregando: boolean;
  indisponivel: boolean;
  carregar: () => Promise<void>;
  podeAcessarModulo: (modulo: string) => boolean;
}

export const useLicensing = create<LicensingState>((set, get) => ({
  status: null,
  licensedModules: [],
  carregado: false,
  carregando: false,
  indisponivel: false,

  carregar: async () => {
    if (get().carregando) return;
    set({ carregando: true });
    try {
      const resposta = await licensingApi.getStatus();
      if (resposta.success) {
        set({
          status: resposta.data,
          licensedModules: resposta.data.licensedModules,
          carregado: true,
          carregando: false,
          indisponivel: false,
        });
        return;
      }
    } catch {
      // A ausência de resposta não é uma licença válida: apenas impede que o
      // Renderer tome a decisão sozinho.
    }
    set({ carregado: true, carregando: false, indisponivel: true });
  },

  podeAcessarModulo: (modulo) => {
    const { indisponivel, status, licensedModules } = get();
    if (!isLicensingModule(modulo) || isAlwaysAvailableModule(modulo)) return true;
    if (indisponivel) return true;
    return status?.status === 'VALID' && licensedModules.includes(modulo);
  },
}));
