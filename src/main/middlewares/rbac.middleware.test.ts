import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  requirePermission,
  UserSession,
} from './rbac.middleware';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

describe('RBAC Middleware & Permissions (RNF03)', () => {
  const adminSession: UserSession = {
    id: 'user-1',
    login: 'admin',
    nomeCompleto: 'Administrador',
    email: 'admin@doraerp.local',
    perfilId: 'p-1',
    perfilNome: 'Administrador',
    permissoes: { '*': true },
  };

  const operadorSession: UserSession = {
    id: 'user-2',
    login: 'operador',
    nomeCompleto: 'Operador Teste',
    email: 'operador@doraerp.local',
    perfilId: 'p-2',
    perfilNome: 'Operador',
    permissoes: {
      vendas: ['read', 'write'],
      compras: ['read'],
    },
  };

  it('deve conceder permissão total ao Administrador', () => {
    expect(hasPermission(adminSession, 'vendas', 'delete')).toBe(true);
    expect(hasPermission(adminSession, 'financas', 'approve')).toBe(true);
    expect(hasPermission(adminSession, 'configuracoes', 'admin')).toBe(true);
    expect(() => requirePermission(adminSession, 'fiscal', 'write')).not.toThrow();
  });

  it('deve validar permissões granulares do Operador corretamente', () => {
    expect(hasPermission(operadorSession, 'vendas', 'read')).toBe(true);
    expect(hasPermission(operadorSession, 'vendas', 'write')).toBe(true);
    expect(hasPermission(operadorSession, 'vendas', 'delete')).toBe(false);
    expect(hasPermission(operadorSession, 'financas', 'read')).toBe(false);
  });

  it('deve lançar ForbiddenError quando permissão for insuficiente', () => {
    expect(() => requirePermission(operadorSession, 'financas', 'write')).toThrow(
      ForbiddenError
    );
  });

  it('deve lançar UnauthorizedError quando sessão for nula', () => {
    expect(() => requirePermission(null, 'vendas', 'read')).toThrow(
      UnauthorizedError
    );
  });
});
