/**
 * @file useLicensing.test.ts
 * @description Guardas visuais da licença no Renderer. A decisão real está no
 * Main; aqui só se testa o que o utilizador vê.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLicensing } from './useLicensing';
import type { LicenseStatus, LicenseStatusResult, LicensingModuleKey } from '../../../shared/licensing/types';

function estado(status: LicenseStatus, modulos: LicensingModuleKey[]): LicenseStatusResult {
  return {
    status,
    message: '',
    summary: null,
    installationId: null,
    installedAt: null,
    lastValidatedAt: null,
    licensedModules: modulos,
    modules: [],
  };
}

const reset = () =>
  useLicensing.setState({
    status: null,
    licensedModules: [],
    carregado: false,
    carregando: false,
    indisponivel: false,
  });

describe('useLicensing — acesso visual aos módulos', () => {
  beforeEach(reset);
  afterEach(() => {
    vi.unstubAllGlobals();
    reset();
  });

  it('não liberta módulos comerciais antes de ler a licença', () => {
    expect(useLicensing.getState().podeAcessarModulo('vendas')).toBe(false);
  });

  it('mantém Configurações acessível sem licença', () => {
    expect(useLicensing.getState().podeAcessarModulo('configuracoes')).toBe(true);
  });

  it('liberta apenas os módulos presentes numa licença válida', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      success: true,
      data: estado('VALID', ['vendas', 'estoque']),
    });
    vi.stubGlobal('window', { api: { licensing: { getStatus } } });

    await useLicensing.getState().carregar();

    expect(useLicensing.getState().podeAcessarModulo('vendas')).toBe(true);
    expect(useLicensing.getState().podeAcessarModulo('estoque')).toBe(true);
    expect(useLicensing.getState().podeAcessarModulo('fiscal')).toBe(false);
  });

  it('não liberta módulos com licença expirada', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      success: true,
      data: estado('EXPIRED', ['vendas']),
    });
    vi.stubGlobal('window', { api: { licensing: { getStatus } } });

    await useLicensing.getState().carregar();

    expect(useLicensing.getState().podeAcessarModulo('vendas')).toBe(false);
  });

  it('falha aberta no Renderer se o IPC não responder; o Main continua a exigir licença', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'UNAVAILABLE', message: 'indisponível' },
    });
    vi.stubGlobal('window', { api: { licensing: { getStatus } } });

    await useLicensing.getState().carregar();

    expect(useLicensing.getState().indisponivel).toBe(true);
    expect(useLicensing.getState().podeAcessarModulo('vendas')).toBe(true);
  });
});
