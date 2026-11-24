/**
 * @file contabilidade.controller.integracao.test.ts
 * @description Isolamento por empresa no IPC de integração contabilística,
 * regras de contabilização e mapeamentos de contas.
 */

import { describe, it, expect, vi } from 'vitest';
import type { UserSession } from '../middlewares/rbac.middleware';
import { ContabilidadeController } from './contabilidade.controller';

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn() },
  BrowserWindow: { fromWebContents: () => ({ id: 1 }) },
  ipcMain: { handle: () => undefined },
}));

const EMPRESA = 'empresa_1';
const OUTRA_EMPRESA = 'empresa_2';

type SessionOverrides = Partial<UserSession>;

function sessao(overrides: SessionOverrides = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: { financas: ['read', 'write', 'delete'] },
    empresaConfigId: EMPRESA,
    ...overrides,
  };
}

function criarController(
  opcoes: {
    sessao?: SessionOverrides;
    regraEmpresaId?: string;
    mapeamentoEmpresaId?: string;
    seed?: { semearTudo: ReturnType<typeof vi.fn> };
  } = {}
) {
  const regra = {
    id: 'regra-1',
    empresaId: opcoes.regraEmpresaId ?? EMPRESA,
    codigo: 'VENDA_FATURA',
  };
  const regrasPrisma = {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => regra),
    create: vi.fn(async () => regra),
    update: vi.fn(async () => regra),
    delete: vi.fn(async () => regra),
  };
  const errosPrisma = {
    findMany: vi.fn(async () => []),
  };
  const motor = {
    prisma: {
      regraContabilizacao: regrasPrisma,
      erroIntegracaoContabil: errosPrisma,
    },
  };
  const integracao = {
    reprocessarErro: vi.fn(async () => ({
      sucesso: true,
      pendente: false,
      mensagem: 'Reprocessado.',
    })),
  };
  const mapeamentos = {
    list: vi.fn(async () => ({ items: [], total: 0 })),
    get: vi.fn(async () => ({ id: 'map-1', empresaId: opcoes.mapeamentoEmpresaId ?? EMPRESA })),
    guardar: vi.fn(async () => ({ id: 'map-1' })),
    remover: vi.fn(async () => undefined),
  };
  const seed = opcoes.seed ?? { semearTudo: vi.fn(async () => ({ criadas: 0 })) };
  const auth = { getCurrentSession: vi.fn(() => sessao(opcoes.sessao)) };
  const auditoria = { registar: vi.fn(async () => undefined) };

  const controller = new ContabilidadeController(
    {} as any, // contas
    {} as any, // diarios
    {} as any, // periodos
    mapeamentos as any,
    seed as any,
    {} as any, // exercicios
    {} as any, // lancamentos
    {} as any, // reconciliacao
    motor as any,
    integracao as any,
    {} as any, // relatorios
    {} as any, // fecho
    {} as any, // apuramento
    {} as any, // apuramentoResultados
    {} as any, // fechoAnual
    {} as any, // demonstracoes
    auth as any,
    auditoria as any
  );

  return { controller, regrasPrisma, errosPrisma, motor, integracao, mapeamentos, seed };
}

describe('ContabilidadeController — isolamento dos erros de integração', () => {
  it('força a empresa da sessão no where e ignora empresaId do chamador', async () => {
    const { controller, errosPrisma } = criarController();

    const resposta = await controller.listarErrosIntegracao({
      empresaId: OUTRA_EMPRESA,
      codigoErro: 'REGRA_NAO_ENCONTRADA',
    });

    expect(resposta.success).toBe(true);
    expect(errosPrisma.findMany).toHaveBeenCalledWith({
      where: { empresaId: EMPRESA, codigoErro: 'REGRA_NAO_ENCONTRADA' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('recusa listar erros sem empresa na sessão, mesmo com empresaId externo', async () => {
    const { controller, errosPrisma } = criarController({ sessao: { empresaConfigId: undefined } });

    const resposta = await controller.listarErrosIntegracao({ empresaId: EMPRESA });

    expect(resposta.success).toBe(false);
    if (resposta.success) throw new Error('Sem empresa na sessão a listagem devia falhar');
    expect(resposta.error.code).toBe('VALIDATION_ERROR');
    expect(errosPrisma.findMany).not.toHaveBeenCalled();
  });

  it('passa a empresa e o utilizador da sessão ao reprocessamento', async () => {
    const { controller, integracao } = criarController();

    const resposta = await controller.reprocessarErro('erro-1');

    expect(resposta.success).toBe(true);
    expect(integracao.reprocessarErro).toHaveBeenCalledWith('erro-1', 'util_1', EMPRESA);
  });
});

describe('ContabilidadeController — isolamento das regras de contabilização', () => {
  it('força a empresa da sessão ao listar regras', async () => {
    const { controller, regrasPrisma } = criarController();

    await controller.listarRegras({ empresaId: OUTRA_EMPRESA });

    expect(regrasPrisma.findMany).toHaveBeenCalledWith({
      where: { empresaId: EMPRESA },
      orderBy: { codigo: 'asc' },
    });
  });

  it('força a empresa da sessão ao criar regra', async () => {
    const { controller, regrasPrisma } = criarController();

    await controller.criarRegra({ empresaId: OUTRA_EMPRESA, codigo: 'VENDA_FATURA' });

    expect(regrasPrisma.create).toHaveBeenCalledWith({
      data: { empresaId: EMPRESA, codigo: 'VENDA_FATURA' },
    });
  });

  it('força a empresa da sessão ao actualizar regra', async () => {
    const { controller, regrasPrisma } = criarController();

    await controller.atualizarRegra('regra-1', { empresaId: OUTRA_EMPRESA, activa: false });

    expect(regrasPrisma.update).toHaveBeenCalledWith({
      where: { id: 'regra-1' },
      data: { empresaId: EMPRESA, activa: false },
    });
  });

  it('recusa obter, actualizar e remover regra de outra empresa', async () => {
    const { controller, regrasPrisma } = criarController({ regraEmpresaId: OUTRA_EMPRESA });

    const obtida = await controller.obterRegra('regra-1');
    const actualizada = await controller.atualizarRegra('regra-1', { activa: false });
    const removida = await controller.removerRegra('regra-1');

    for (const resposta of [obtida, actualizada, removida]) {
      expect(resposta.success).toBe(false);
      if (resposta.success) throw new Error('A regra de outra empresa não devia ser acessível');
      expect(resposta.error.code).toBe('FORBIDDEN');
    }
    expect(regrasPrisma.update).not.toHaveBeenCalled();
    expect(regrasPrisma.delete).not.toHaveBeenCalled();
  });
});

describe('ContabilidadeController — isolamento dos mapeamentos', () => {
  it('força a empresa da sessão ao listar e guardar mapeamentos', async () => {
    const { controller, mapeamentos } = criarController();

    await controller.listarMapeamentos({ empresaId: OUTRA_EMPRESA });
    await controller.guardarMapeamento({
      empresaId: OUTRA_EMPRESA,
      chave: 'CLIENTES',
      contaId: 'conta-1',
    });

    expect(mapeamentos.list).toHaveBeenCalledWith({ empresaId: EMPRESA });
    expect(mapeamentos.guardar).toHaveBeenCalledWith({
      empresaId: EMPRESA,
      chave: 'CLIENTES',
      contaId: 'conta-1',
    });
  });

  it('recusa obter e remover mapeamento de outra empresa', async () => {
    const { controller, mapeamentos } = criarController({ mapeamentoEmpresaId: OUTRA_EMPRESA });

    const obtido = await controller.obterMapeamento('map-1');
    const removido = await controller.removerMapeamento('map-1');

    for (const resposta of [obtido, removido]) {
      expect(resposta.success).toBe(false);
      if (resposta.success) throw new Error('O mapeamento de outra empresa não devia ser acessível');
      expect(resposta.error.code).toBe('FORBIDDEN');
    }
    expect(mapeamentos.remover).not.toHaveBeenCalled();
  });
});
