import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registrar: vi.fn(),
  exigir: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.registrar },
}));

vi.mock('../middlewares/licensing.middleware', () => ({
  requireAnyLicensedModule: mocks.exigir,
}));

import { handleLicenciado } from './licensed-handler';
import { ModuleNotLicensedError } from './licensing-errors';
import { ok } from './ipc-response';

type Listener = (evento: unknown, ...argumentos: unknown[]) => unknown;

function ultimoListener(): Listener {
  const chamada = mocks.registrar.mock.calls.at(-1);
  if (!chamada) throw new Error('nenhum listener registado');
  return chamada[1] as Listener;
}

describe('handleLicenciado — bloqueio antes do controller', () => {
  beforeEach(() => {
    mocks.registrar.mockClear();
    mocks.exigir.mockReset();
  });

  it('recusa uma chamada IPC directa sem licença e não executa a operação', async () => {
    mocks.exigir.mockRejectedValueOnce(
      new ModuleNotLicensedError('vendas', 'MODULE_NOT_LICENSED')
    );
    const operacao = vi.fn().mockResolvedValue(ok({ emitida: true }));

    handleLicenciado('vendas')('vendas:emitirFatura', operacao);
    const resposta = await ultimoListener()({}, { clienteId: 'c1' });

    expect(resposta).toMatchObject({
      success: false,
      error: { code: 'MODULE_NOT_LICENSED' },
    });
    expect(operacao).not.toHaveBeenCalled();
    expect(mocks.exigir).toHaveBeenCalledWith(['vendas']);
  });

  it('executa a operação quando a licença cobre o módulo', async () => {
    mocks.exigir.mockResolvedValueOnce(undefined);
    const operacao = vi.fn().mockResolvedValue(ok({ emitida: true }));

    handleLicenciado(['estoque', 'vendas'])('artigos:list', operacao);
    const resposta = await ultimoListener()({}, { filtro: 'x' });

    expect(resposta).toEqual(ok({ emitida: true }));
    expect(operacao).toHaveBeenCalledWith({}, { filtro: 'x' });
    expect(mocks.exigir).toHaveBeenCalledWith(['estoque', 'vendas']);
  });
});
