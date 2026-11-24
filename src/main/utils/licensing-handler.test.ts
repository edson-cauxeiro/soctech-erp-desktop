/**
 * @file licensing-handler.test.ts
 * @description Garante que nenhum canal de licenciamento pode elevar
 * privilégios: sessão e RBAC são verificados no Main antes do handlers.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { licensingHandler } from './licensing-handler';
import type { AuthService } from '../services/auth.service';
import { LicensingError } from './licensing-errors';
import type { UserSession } from '../middlewares/rbac.middleware';

const baseSessao: UserSession = {
  id: 'util-1',
  login: 'admin',
  nomeCompleto: 'Administrador',
  email: 'admin@erp.local',
  perfilId: 'perfil-1',
  perfilNome: 'Administrador',
  permissoes: { '*': true },
  empresaConfigId: 'emp-1',
};

const schema = z.object({ modulo: z.string().min(1) }).strict();
const administracao = { modulo: 'configuracoes', acao: 'admin' } as const;

function authCom(sessao: UserSession | null): AuthService {
  return { getCurrentSession: vi.fn().mockReturnValue(sessao) } as unknown as AuthService;
}

describe('licensingHandler', () => {
  it('exige sessão autenticada', async () => {
    const handler = licensingHandler(schema, administracao, async () => ({ ok: true }), authCom(null));

    expect(await handler({}, { modulo: 'vendas' })).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('nega a operação sem permissão de administração', async () => {
    const sessao: UserSession = {
      ...baseSessao,
      perfilNome: 'Operador',
      permissoes: { configuracoes: ['read'] },
    };
    const handler = licensingHandler(schema, administracao, async () => ({ ok: true }), authCom(sessao));

    expect(await handler({ modulo: 'vendas' })).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('valida o payload com Zod mesmo quando vem de um evento IPC', async () => {
    const fn = vi.fn(async (input: { modulo: string }) => ({ modulo: input.modulo }));
    const handler = licensingHandler(schema, administracao, fn, authCom(baseSessao));
    const evento = { sender: {}, frameId: 1 };

    expect(await handler(evento, { modulo: 'estoque' })).toEqual({
      success: true,
      data: { modulo: 'estoque' },
    });
    expect(await handler(evento, { modulo: '' })).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('devolve erros de licenciamento com código e mensagem tipados', async () => {
    const handler = licensingHandler(schema, administracao, async () => {
      throw new LicensingError('INVALID_SIGNATURE');
    }, authCom(baseSessao));

    expect(await handler({ modulo: 'vendas' })).toMatchObject({
      success: false,
      error: { code: 'LICENSE_INVALID_SIGNATURE', message: 'A assinatura da licença é inválida.' },
    });
  });

  it('fornece empresa e utilizador da sessão ao handler', async () => {
    const handler = licensingHandler(schema, administracao, async (_input, ctx) => ctx, authCom(baseSessao));

    expect(await handler({ modulo: 'vendas' })).toMatchObject({
      success: true,
      data: { empresaId: 'emp-1', utilizadorId: 'util-1' },
    });
  });
});
