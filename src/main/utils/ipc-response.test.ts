import { describe, it, expect } from 'vitest';
import { ok, err, IpcSuccess, IpcError } from './ipc-response';

describe('IPC Response Utils', () => {
  it('deve formatar uma resposta de sucesso corretamente com ok()', () => {
    const data = { id: '123', name: 'Teste' };
    const response: IpcSuccess<typeof data> = ok(data);

    expect(response.success).toBe(true);
    expect(response.data).toEqual(data);
  });

  it('deve formatar uma resposta de erro corretamente com err() sem details', () => {
    const response: IpcError = err('NOT_FOUND', 'Registo não encontrado');

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('NOT_FOUND');
    expect(response.error.message).toBe('Registo não encontrado');
    expect(response.error.details).toBeUndefined();
  });

  it('deve formatar uma resposta de erro com details adicionais', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const response: IpcError = err('VALIDATION_ERROR', 'Erro de validação', details);

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('VALIDATION_ERROR');
    expect(response.error.message).toBe('Erro de validação');
    expect(response.error.details).toEqual(details);
  });
});
