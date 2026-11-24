import { describe, it, expect } from 'vitest';
import {
  RhError,
  RhNotFoundError,
  RhConflictError,
  FinancasIndisponivelError,
  RH_ERROR_CODES,
} from './rh-errors';
import { AppError } from './errors';

describe('rh-errors', () => {
  it('mapeia os códigos para o status HTTP correto', () => {
    expect(new RhNotFoundError().statusCode).toBe(404);
    expect(new RhConflictError('duplicado').statusCode).toBe(409);
    expect(new FinancasIndisponivelError().statusCode).toBe(503);
  });

  it('expõe códigos estáveis e é instância de AppError', () => {
    const erro = new RhError(RH_ERROR_CODES.PERIODO_FECHADO, 'Período fechado.');
    expect(erro).toBeInstanceOf(AppError);
    expect(erro.code).toBe('RH_PERIODO_FECHADO');
    expect(erro.statusCode).toBe(422);
  });

  it('preserva detalhes adicionais', () => {
    const detalhes = { operacao: 'processar', ano: 2026 };
    const erro = new RhError(RH_ERROR_CODES.JA_PROCESSADO, 'Já processado.', detalhes);
    expect(erro.details).toEqual(detalhes);
  });
});
