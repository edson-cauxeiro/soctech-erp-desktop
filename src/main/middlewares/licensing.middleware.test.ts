import { describe, expect, it, vi } from 'vitest';
import { requireAnyLicensedModule, requireLicensedModule } from './licensing.middleware';
import { ModuleNotLicensedError } from '../utils/licensing-errors';
import type { ModuleAccessResult } from '../../shared/licensing/types';

function verificador(resultados: Record<string, ModuleAccessResult>) {
  return {
    checkModuleAccess: vi.fn(async (modulo: string): Promise<ModuleAccessResult> => {
      return resultados[modulo] ?? { allowed: false, reason: 'MODULE_NOT_LICENSED' };
    }),
  };
}

describe('guarda de licenciamento por módulo', () => {
  it('permite um módulo licenciado', async () => {
    const servico = verificador({ vendas: { allowed: true, reason: 'LICENSE_ACTIVE' } });
    await expect(requireLicensedModule('vendas', servico)).resolves.toBeUndefined();
    expect(servico.checkModuleAccess).toHaveBeenCalledWith('vendas');
  });

  it('recusa um módulo não licenciado com erro tipado', async () => {
    const servico = verificador({});
    await expect(requireLicensedModule('vendas', servico)).rejects.toMatchObject({
      name: 'ModuleNotLicensedError',
      code: 'MODULE_NOT_LICENSED',
      modulo: 'vendas',
    });
  });

  it('mantém o motivo da licença expirada na recusa', async () => {
    const servico = verificador({ fiscal: { allowed: false, reason: 'LICENSE_EXPIRED' } });
    await expect(requireLicensedModule('fiscal', servico)).rejects.toBeInstanceOf(ModuleNotLicensedError);
    await expect(requireLicensedModule('fiscal', servico)).rejects.toMatchObject({
      reason: 'LICENSE_EXPIRED',
      details: { modulo: 'fiscal', reason: 'LICENSE_EXPIRED' },
    });
  });

  it('aceita entidades partilhadas quando qualquer um dos módulos está licenciado', async () => {
    const servico = verificador({
      estoque: { allowed: false, reason: 'MODULE_NOT_LICENSED' },
      vendas: { allowed: true, reason: 'LICENSE_ACTIVE' },
    });
    await expect(
      requireAnyLicensedModule(['estoque', 'vendas'], servico)
    ).resolves.toBeUndefined();
  });

  it('recusa entidades partilhadas quando nenhum módulo está licenciado', async () => {
    const servico = verificador({});
    await expect(
      requireAnyLicensedModule(['estoque', 'vendas', 'compras'], servico)
    ).rejects.toBeInstanceOf(ModuleNotLicensedError);
    expect(servico.checkModuleAccess).toHaveBeenCalledTimes(3);
  });
});
