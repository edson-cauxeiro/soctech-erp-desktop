import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from './errors';

describe('App Errors Hierarchy', () => {
  it('deve instanciar AppError com valores padrão', () => {
    const error = new AppError('Erro base');
    expect(error.message).toBe('Erro base');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('AppError');
  });

  it('deve instanciar ValidationError com status 400', () => {
    const details = { campo: 'login' };
    const error = new ValidationError('Campo obrigatório', details);
    expect(error.message).toBe('Campo obrigatório');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
    expect(error.name).toBe('ValidationError');
  });

  it('deve instanciar UnauthorizedError com status 401', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Não autorizado. Faça login para continuar.');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.statusCode).toBe(401);
  });

  it('deve instanciar ForbiddenError com status 403', () => {
    const error = new ForbiddenError('Acesso proibido');
    expect(error.message).toBe('Acesso proibido');
    expect(error.code).toBe('FORBIDDEN');
    expect(error.statusCode).toBe(403);
  });

  it('deve instanciar NotFoundError com status 404', () => {
    const error = new NotFoundError('Artigo não encontrado');
    expect(error.message).toBe('Artigo não encontrado');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
  });

  it('deve instanciar ConflictError com status 409', () => {
    const error = new ConflictError('Registo duplicado');
    expect(error.message).toBe('Registo duplicado');
    expect(error.code).toBe('CONFLICT');
    expect(error.statusCode).toBe(409);
  });
});
