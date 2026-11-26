/**
 * @file contabilidade.controller.relatorios.test.ts
 * @description Garante que os filtros dos relatórios são validados depois de
 * injectar a empresa da sessão e que erros de validação viram IpcResponse.
 */

import { describe, it, expect, vi } from 'vitest';
import type { UserSession } from '../middlewares/rbac.middleware';
import { ContabilidadeController } from './contabilidade.controller';

const EMPRESA = 'empresa_1';

function sessao(): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: { financas: ['read', 'write'] },
    empresaConfigId: EMPRESA,
  };
}

function criarController() {
  const relatorios = {
    balancete: vi.fn(async () => ({ linhas: [] })),
    razao: vi.fn(async () => ({ linhas: [] })),
    diarios: vi.fn(async () => ({ linhas: [] })),
    contaCorrente: vi.fn(async () => ({ linhas: [] })),
  };
  const auth = { getCurrentSession: vi.fn(() => sessao()) };
  const audit = { registar: vi.fn(async () => undefined) };
  const controller = new ContabilidadeController(
    {} as any, // contas
    {} as any, // diarios
    {} as any, // periodos
    {} as any, // mapeamentos
    {} as any, // seed
    {} as any, // exercicios
    {} as any, // lancamentos
    {} as any, // reconciliacao
    {} as any, // motor
    {} as any, // integracao
    relatorios as any, // relatorios
    {} as any, // fecho
    {} as any, // apuramento
    {} as any, // apuramentoResultados
    {} as any, // fechoAnual
    {} as any, // demonstracoes
    auth as any,
    audit as any,
  );
  return { controller, relatorios };
}

const casos = [
  {
    nome: 'balancete',
    filtros: {},
    servico: 'balancete',
    chamar: (controller: ContabilidadeController, filtros: unknown) => controller.balancete(filtros),
  },
  {
    nome: 'razão',
    filtros: { contaId: 'conta-1' },
    servico: 'razao',
    chamar: (controller: ContabilidadeController, filtros: unknown) => controller.razao(filtros),
  },
  {
    nome: 'diários',
    filtros: {},
    servico: 'diarios',
    chamar: (controller: ContabilidadeController, filtros: unknown) => controller.relatorioDiarios(filtros),
  },
  {
    nome: 'conta corrente',
    filtros: { entidadeTipo: 'cliente', entidadeId: 'cliente-1' },
    servico: 'contaCorrente',
    chamar: (controller: ContabilidadeController, filtros: unknown) => controller.contaCorrente(filtros),
  },
];

describe('ContabilidadeController — filtros de relatório', () => {
  it.each(casos)('gera $nome sem empresaId no filtro do renderer', async ({ filtros, servico, chamar }) => {
    const { controller, relatorios } = criarController();

    const res = await chamar(controller, filtros);

    expect(res.success).toBe(true);
    expect(relatorios[servico as keyof typeof relatorios]).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: EMPRESA })
    );
  });

  it('devolve VALIDATION_ERROR para filtros inválidos', async () => {
    const { controller } = criarController();

    const res = await controller.balancete({ classe: 99 });

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('VALIDATION_ERROR');
  });
});
