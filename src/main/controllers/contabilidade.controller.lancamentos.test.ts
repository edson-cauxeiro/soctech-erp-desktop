/**
 * @file contabilidade.controller.lancamentos.test.ts
 * @description Garante que o bloqueio de período fechado é aplicado no IPC dos
 * lançamentos contabilísticos, não apenas no serviço.
 */

import { describe, it, expect, vi } from 'vitest';
import { BusinessRuleError } from '../utils/errors';
import type { UserSession } from '../middlewares/rbac.middleware';
import type { IpcResponse } from '../utils/ipc-response';
import { ContabilidadeController } from './contabilidade.controller';

const EMPRESA = 'empresa_1';

function sessao(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: { financas: ['read', 'write'] },
    empresaConfigId: EMPRESA,
    ...overrides,
  };
}

function erroDe(resposta: IpcResponse<unknown>) {
  return resposta.success ? undefined : resposta.error;
}

function criarController(sessaoActual: UserSession | null, lancamentosOverrides: Record<string, unknown> = {}) {
  const fechado = new BusinessRuleError('Não é possível escrever num período fechado.');
  const lancamentos = {
    listar: vi.fn(async () => []),
    obter: vi.fn(async () => null),
    criar: vi.fn(async () => { throw fechado; }),
    atualizar: vi.fn(async () => { throw fechado; }),
    validar: vi.fn(async () => { throw fechado; }),
    estornar: vi.fn(async () => { throw fechado; }),
    remover: vi.fn(async () => undefined),
    ...lancamentosOverrides,
  };
  const auth = { getCurrentSession: vi.fn(() => sessaoActual) };
  const audit = { registar: vi.fn(async () => undefined) };
  const controller = new ContabilidadeController(
    {} as any, // contas
    {} as any, // diarios
    {} as any, // periodos
    {} as any, // mapeamentos
    {} as any, // seed
    {} as any, // exercicios
    lancamentos as any,
    {} as any, // reconciliacao
    {} as any, // motor
    {} as any, // integracao
    {} as any, // relatorios
    {} as any, // fecho
    {} as any, // apuramento
    {} as any, // apuramentoResultados
    {} as any, // fechoAnual
    {} as any, // demonstracoes
    auth as any,
    audit as any,
  );
  return { controller, lancamentos };
}

describe('ContabilidadeController — lançamentos em período fechado', () => {
  it('recusa criar lançamento via IPC', async () => {
    const { controller, lancamentos } = criarController(sessao());
    const resposta = await controller.criarLancamento({ descricao: 'teste' });

    expect(resposta.success).toBe(false);
    expect(erroDe(resposta)?.code).toBe('BUSINESS_RULE_ERROR');
    expect(lancamentos.criar).toHaveBeenCalledOnce();
  });

  it('recusa actualizar lançamento via IPC', async () => {
    const { controller, lancamentos } = criarController(sessao());
    const resposta = await controller.atualizarLancamento('lanc-1', { descricao: 'teste' });

    expect(resposta.success).toBe(false);
    expect(erroDe(resposta)?.code).toBe('BUSINESS_RULE_ERROR');
    expect(lancamentos.atualizar).toHaveBeenCalledOnce();
  });

  it('recusa validar lançamento via IPC', async () => {
    const { controller, lancamentos } = criarController(sessao());
    const resposta = await controller.validarLancamento('lanc-1');

    expect(resposta.success).toBe(false);
    expect(erroDe(resposta)?.code).toBe('BUSINESS_RULE_ERROR');
    expect(lancamentos.validar).toHaveBeenCalledOnce();
  });

  it('recusa estornar lançamento via IPC', async () => {
    const { controller, lancamentos } = criarController(sessao());
    const resposta = await controller.estornarLancamento('lanc-1', { dataContabilistica: '2026-01-20' });

    expect(resposta.success).toBe(false);
    expect(erroDe(resposta)?.code).toBe('BUSINESS_RULE_ERROR');
    expect(lancamentos.estornar).toHaveBeenCalledOnce();
  });
});
