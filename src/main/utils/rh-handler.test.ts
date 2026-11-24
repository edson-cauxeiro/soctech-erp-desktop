import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { rhHandler } from './rh-handler';
import type { AuthService } from '../services/auth.service';
import type { UserSession } from '../middlewares/rbac.middleware';
import { RhError, RH_ERROR_CODES } from './rh-errors';

function criarSessao(permissoes: Record<string, string[] | boolean>, perfilNome = 'Operador'): UserSession {
  return {
    id: 'user-1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.local',
    perfilId: 'perfil-1',
    perfilNome,
    permissoes,
    empresaConfigId: 'emp-1',
  };
}

function authFake(session: UserSession | null): AuthService {
  return { getCurrentSession: () => session } as unknown as AuthService;
}

const semPermissoes = {};

describe('rhHandler', () => {
  it('devolve UNAUTHORIZED quando não há sessão', async () => {
    const handler = rhHandler(z.object({}), { modulo: 'rh' }, async () => 'ok', authFake(null));
    const resposta = await handler({});
    expect(resposta.success).toBe(false);
    if (!resposta.success) expect(resposta.error.code).toBe('UNAUTHORIZED');
  });

  it('devolve FORBIDDEN quando falta permissão coarse', async () => {
    const handler = rhHandler(
      z.object({}),
      { modulo: 'rh', acao: 'write' },
      async () => 'ok',
      authFake(criarSessao(semPermissoes))
    );
    const resposta = await handler({});
    expect(resposta.success).toBe(false);
    if (!resposta.success) expect(resposta.error.code).toBe('FORBIDDEN');
  });

  it('autoriza com permissão coarse', async () => {
    const handler = rhHandler(
      z.object({}),
      { modulo: 'rh', acao: 'read' },
      async () => 'ok',
      authFake(criarSessao({ rh: ['read'] }))
    );
    const resposta = await handler({});
    expect(resposta).toEqual({ success: true, data: 'ok' });
  });

  it('autoriza por chave fine-grained', async () => {
    const handler = rhHandler(
      z.object({}),
      { chave: 'rh.salarios.ver' },
      async () => 'segredo',
      authFake(criarSessao({ 'rh.salarios': ['ver'] }))
    );
    const resposta = await handler({});
    expect(resposta).toEqual({ success: true, data: 'segredo' });
  });

  it('devolve VALIDATION_ERROR para payload inválido', async () => {
    const handler = rhHandler(
      z.object({ nome: z.string().min(2) }),
      { modulo: 'rh' },
      async () => 'ok',
      authFake(criarSessao({ rh: ['read'] }))
    );
    const resposta = await handler({ nome: '' });
    expect(resposta.success).toBe(false);
    if (!resposta.success) expect(resposta.error.code).toBe('VALIDATION_ERROR');
  });

  it('executa o handler com input validado e contexto', async () => {
    const handler = rhHandler(
      z.object({ nome: z.string() }),
      { modulo: 'rh' },
      async (input, ctx) => ({
        nome: input.nome,
        utilizadorId: ctx.utilizadorId,
        empresaId: ctx.empresaId,
        podeVerSalarios: ctx.podeVerSalarios,
      }),
      authFake(criarSessao({ rh: ['read'], 'rh.salarios': ['ver'] }))
    );

    const resposta = await handler({ nome: 'Ana' });
    expect(resposta).toEqual({
      success: true,
      data: {
        nome: 'Ana',
        utilizadorId: 'user-1',
        empresaId: 'emp-1',
        podeVerSalarios: true,
      },
    });
  });

  it('mapeia RhError para o código de negócio estável', async () => {
    const handler = rhHandler(
      z.object({}),
      { modulo: 'rh' },
      async () => {
        throw new RhError(RH_ERROR_CODES.PERIODO_FECHADO, 'Período fechado.');
      },
      authFake(criarSessao({ rh: ['read'] }))
    );

    const resposta = await handler({});
    expect(resposta.success).toBe(false);
    if (!resposta.success) expect(resposta.error.code).toBe('RH_PERIODO_FECHADO');
  });

  it('exige o perfil Administrador para todas as permissões via wildcard', async () => {
    const handler = rhHandler(
      z.object({}),
      { chave: 'rh.salarios.ver' },
      async () => 'ok',
      authFake(criarSessao(semPermissoes, 'Administrador'))
    );
    const resposta = await handler({});
    expect(resposta).toEqual({ success: true, data: 'ok' });
  });

  it('usa o payload do segundo argumento quando invocado pelo ipcMain', async () => {
    const handler = rhHandler(
      z.object({ nome: z.string() }),
      { modulo: 'rh' },
      async (input) => input.nome,
      authFake(criarSessao({ rh: ['read'] }))
    );

    // ipcMain.handle invoca (event, payload).
    const evento = { sender: {}, frameId: 1 };
    const resposta = await handler(evento, { nome: 'Ana' });
    expect(resposta).toEqual({ success: true, data: 'Ana' });
  });

  it('tolera eventos sem payload, validando um objeto vazio', async () => {
    const handler = rhHandler(
      z.object({ nome: z.string().optional() }),
      { modulo: 'rh' },
      async (input) => input.nome ?? null,
      authFake(criarSessao({ rh: ['read'] }))
    );

    const resposta = await handler({ sender: {}, frameId: 1 });
    expect(resposta).toEqual({ success: true, data: null });
  });
});
