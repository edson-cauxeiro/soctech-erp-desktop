/**
 * @file auth.controller.test.ts
 * @description Testes de auditoria do controlador de autenticação.
 *
 * O login e o logout são acções de auditoria por si: provam quem entrou, quando
 * e de onde. Este teste garante duas propriedades que não eram cobertas:
 *
 *  1. **Quem** entra fica no log — o `utilizadorId`/`entidadeId` é o id da
 *     sessão, não um valor inventado pelo cliente.
 *  2. **Falhas não auditam.** Um login que não acontece não devia gravá-lo como
 *     se tivesse acontecido (ou interferir com a resposta: o log é best-effort).
 *
 * Os serviços são injectados, sem tocar na base de dados.
 */

import { describe, it, expect, vi } from 'vitest';
import { AuthController } from './auth.controller';
import type { UserSession } from '../middlewares/rbac.middleware';

function sessao(sobreposicoes: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: {},
    empresaConfigId: 'empresa_1',
    ...sobreposicoes,
  };
}

function criarController(sessaoActual: UserSession | null, credenciaisInvalidas = false) {
  const service = {
    login: vi.fn(async () => {
      if (credenciaisInvalidas) throw new Error('Credenciais inválidas');
      return sessaoActual;
    }),
    logout: vi.fn(async () => {}),
    getCurrentSession: vi.fn(() => sessaoActual),
  };
  const audit = { registar: vi.fn(async () => {}) };

  const controller = new AuthController(service as never, audit as never);
  return { controller, service, audit };
}

describe('AuthController.login', () => {
  it('audita o início de sessão com a identidade da sessão', async () => {
    const actual = sessao();
    const { controller, audit } = criarController(actual);

    const resposta = await controller.login({ login: 'ana.marques', password: 'x' });

    expect(resposta.success).toBe(true);
    expect(audit.registar).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'login',
        entidade: 'Utilizador',
        entidadeId: actual.id,
        modulo: 'auth',
        empresaId: actual.empresaConfigId,
        utilizadorId: actual.id,
        severidade: 'info',
      }),
    );
  });

  it('audita antes de devolver a sessão (o log existe mesmo que o cliente falhe depois)', async () => {
    const actual = sessao();
    const { controller, service, audit } = criarController(actual);

    const resposta = await controller.login({ utilizador: 'ana.marques', senha: 'x' });

    // Suporta também o par login/senha alternativo.
    expect(service.login).toHaveBeenCalledWith({ login: 'ana.marques', password: 'x' });
    expect(resposta.success).toBe(true);
    expect(audit.registar).toHaveBeenCalledTimes(1);
  });

  it('não audita um login que falhou', async () => {
    const { controller, audit, service } = criarController(null, true);

    const resposta = await controller.login({ login: 'ana', password: 'errada' });

    expect(resposta.success).toBe(false);
    expect(service.login).toHaveBeenCalledTimes(1);
    expect(audit.registar).not.toHaveBeenCalled();
  });

  it('rejeita payload que não é objecto sem chamar o serviço', async () => {
    const { controller, service, audit } = criarController(sessao());

    const resposta = await controller.login(null);

    expect(resposta.success).toBe(false);
    expect(service.login).not.toHaveBeenCalled();
    expect(audit.registar).not.toHaveBeenCalled();
  });
});

describe('AuthController.logout', () => {
  it('audita o fim de sessão com a identidade capturada antes de destruir a sessão', async () => {
    const actual = sessao();
    const { controller, audit, service } = criarController(actual);

    const resposta = await controller.logout();

    expect(resposta.success).toBe(true);
    // A sessão tem de ser lida antes de ser destruída.
    expect(service.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'logout',
        entidade: 'Utilizador',
        entidadeId: actual.id,
        modulo: 'auth',
        empresaId: actual.empresaConfigId,
        utilizadorId: actual.id,
        severidade: 'info',
      }),
    );
  });

  it('não audita se não havia sessão, mas o logout continua a ter sucesso', async () => {
    const { controller, audit, service } = criarController(null);

    const resposta = await controller.logout();

    expect(resposta.success).toBe(true);
    expect(service.logout).toHaveBeenCalledTimes(1);
    expect(audit.registar).not.toHaveBeenCalled();
  });
});