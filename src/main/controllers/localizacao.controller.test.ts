/**
 * @file localizacao.controller.test.ts
 * @description Testes de autorização e de envelope IPC do controlador de
 * localizações (RF07, TASK-027/028).
 *
 * A estrutura do armazém passou a ter canais de escrita novos (`criarArea` e
 * `criarZona`) para a UI "Estrutura do Armazém". A vista é aberta a leitura de
 * `estoque`, `vendas` ou `compras` (a cascata de filtros de stock partilha-a),
 * mas **escrever estrutura é `estoque: write`** — e todos os canais de escrita
 * do grupo têm de exigir a mesma permissão, individualmente.
 *
 * Há três classes de bug que estes testes fixam:
 * 1. Um perfil com leitura de estoque a criar ou destruir endereços.
 * 2. Um canal de escrita a devolver sucesso com uma validação reprovada
 *    (o `responder` tem de embrulhar `ZodError` em `VALIDATION_ERROR`).
 * 3. Um canal a embrulhar a resposta do serviço em `ok()` duas vezes.
 */

import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { LocalizacaoController } from './localizacao.controller';
import { ForbiddenError, ValidationError } from '../utils/errors';
import type { IpcResponse } from '../utils/ipc-response';
import type { UserSession } from '../middlewares/rbac.middleware';

function codigoDe(resposta: IpcResponse<unknown>): string | undefined {
  return resposta.success ? undefined : resposta.error.code;
}

function sessao(sobreposicoes: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Armazém',
    permissoes: { estoque: ['read', 'write'] },
    empresaConfigId: 'empresa_1',
    ...sobreposicoes,
  };
}

/**
 * Serviço cujos métodos falham se forem chamados: serve para provar que o
 * erro de autorização acontece **antes** do acesso a dados.
 */
function servicoProibido() {
  const falhar = (nome: string) =>
    vi.fn(async () => {
      throw new Error(`${nome} não devia ter sido chamado`);
    });
  return {
    listarLocalizacoes: falhar('listarLocalizacoes'),
    obterPorId: falhar('obterPorId'),
    listarAreas: falhar('listarAreas'),
    listarZonas: falhar('listarZonas'),
    obterArvore: falhar('obterArvore'),
    criarArea: falhar('criarArea'),
    criarZona: falhar('criarZona'),
    criarLocalizacao: falhar('criarLocalizacao'),
    actualizarLocalizacao: falhar('actualizarLocalizacao'),
    desactivarLocalizacao: falhar('desactivarLocalizacao'),
    mostrarCapacidade: falhar('mostrarCapacidade'),
    mostrarEstado: falhar('mostrarEstado'),
  };
}

function criarController(sessaoActual: UserSession | null) {
  const servico = servicoProibido();
  const auth = { getCurrentSession: () => sessaoActual };
  const controller = new LocalizacaoController(servico as never, auth as never);
  return { controller, servico };
}

describe('LocalizacaoController — leitura da estrutura', () => {
  it('deixa ler a estrutura com `estoque: read`', async () => {
    const servico = {
      ...servicoProibido(),
      obterArvore: vi.fn(async () => [{ area: { id: 'area_1' }, zonas: [] }]),
    };
    const controller = new LocalizacaoController(servico as never, {
      getCurrentSession: () => sessao(),
    } as never);

    const resposta = await controller.tree('armazem_1');

    expect(resposta.success).toBe(true);
    expect(servico.obterArvore).toHaveBeenCalledWith('armazem_1');
  });

  it('deixa ler a estrutura com `vendas: read` (filtros de stock partilhados)', async () => {
    const servico = {
      ...servicoProibido(),
      obterArvore: vi.fn(async () => []),
    };
    const controller = new LocalizacaoController(servico as never, {
      getCurrentSession: () => sessao({ permissoes: { vendas: ['read'] } }),
    } as never);

    const resposta = await controller.tree('armazem_1');

    expect(resposta.success).toBe(true);
    expect(servico.obterArvore).toHaveBeenCalled();
  });

  it('recusa ler sem qualquer permissão de stock', async () => {
    const { controller, servico } = criarController(
      sessao({ permissoes: { contabilidade: ['read'] } }),
    );

    const resposta = await controller.tree('armazem_1');

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('FORBIDDEN');
    expect(servico.obterArvore).not.toHaveBeenCalled();
  });

  it('recusa ler sem sessão', async () => {
    const { controller, servico } = criarController(null);

    const resposta = await controller.tree('armazem_1');

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('UNAUTHORIZED');
    expect(servico.obterArvore).not.toHaveBeenCalled();
  });
});

describe('LocalizacaoController — escrita da estrutura', () => {
  it('cria uma área com `estoque: write`', async () => {
    const servico = {
      ...servicoProibido(),
      criarArea: vi.fn(async () => ({ id: 'area_nova', codigo: 'REC' })),
    };
    const controller = new LocalizacaoController(servico as never, {
      getCurrentSession: () => sessao(),
    } as never);

    const resposta = await controller.criarArea({ armazemId: 'armazem_1', codigo: 'REC' });

    expect(resposta.success).toBe(true);
    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(resposta.data).toMatchObject({ codigo: 'REC' });
  });

  it('recusa criar área com apenas leitura de estoque', async () => {
    const soLeitura = sessao({ permissoes: { estoque: ['read'] } });
    const { controller, servico } = criarController(soLeitura);

    const resposta = await controller.criarArea({ armazemId: 'armazem_1', codigo: 'REC' });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('FORBIDDEN');
    expect(servico.criarArea).not.toHaveBeenCalled();
  });

  it('recusa criar zona com apenas leitura de estoque', async () => {
    const soLeitura = sessao({ permissoes: { estoque: ['read'] } });
    const { controller, servico } = criarController(soLeitura);

    const resposta = await controller.criarZona({ areaId: 'area_1', codigo: 'PESADOS' });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('FORBIDDEN');
    expect(servico.criarZona).not.toHaveBeenCalled();
  });

  it('recusa criar área sem sessão', async () => {
    const { controller, servico } = criarController(null);

    const resposta = await controller.criarArea({ armazemId: 'armazem_1', codigo: 'REC' });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('UNAUTHORIZED');
    expect(servico.criarArea).not.toHaveBeenCalled();
  });

  it('desactiva (nunca apaga) uma localização com `estoque: write`', async () => {
    const servico = {
      ...servicoProibido(),
      desactivarLocalizacao: vi.fn(async () => ({ id: 'loc_1', ativo: false })),
    };
    const controller = new LocalizacaoController(servico as never, {
      getCurrentSession: () => sessao(),
    } as never);

    const resposta = await controller.delete('loc_1');

    expect(resposta.success).toBe(true);
    expect(servico.desactivarLocalizacao).toHaveBeenCalledWith('loc_1');
  });
});

describe('LocalizacaoController — envelope IPC e erros', () => {
  function controllerCom(overrides: Record<string, unknown> = {}) {
    const servico = { ...servicoProibido(), ...overrides } as never;
    return new LocalizacaoController(servico, {
      getCurrentSession: () => sessao(),
    } as never);
  }

  it('embrulha um ZodError como VALIDATION_ERROR', async () => {
    const controller = controllerCom({
      criarZona: vi.fn(async () => {
        throw new ZodError([{ code: 'custom', path: ['codigo'], message: 'Código é obrigatório.' }]);
      }),
    });

    const resposta = await controller.criarZona({ areaId: 'area_1' });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('VALIDATION_ERROR');
  });

  it('propaga o código de um AppError de negócio', async () => {
    const controller = controllerCom({
      obterPorId: vi.fn(async () => {
        throw new ValidationError('Dados de localização inválidos.');
      }),
    });

    const resposta = await controller.get('loc_1');

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('VALIDATION_ERROR');
  });

  it('propaga um ForbiddenError do serviço', async () => {
    const controller = controllerCom({
      desactivarLocalizacao: vi.fn(async () => {
        throw new ForbiddenError('Localização bloqueada.');
      }),
    });

    const resposta = await controller.delete('loc_1');

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('FORBIDDEN');
  });

  it('entrega a capacidade directamente em `data`', async () => {
    const controller = controllerCom({
      mostrarCapacidade: vi.fn(async () => ({
        id: 'loc_1',
        codigo: 'A1',
        capacidadeQuantidade: 100,
        quantidadeActual: 25,
      })),
    });

    const resposta = await controller.mostrarCapacidade('loc_1');

    expect(resposta.success).toBe(true);
    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(resposta.data).toMatchObject({ codigo: 'A1', quantidadeActual: 25 });
  });

  it('entrega o estado da localização sem envelope extra', async () => {
    const controller = controllerCom({
      mostrarEstado: vi.fn(async () => ({
        id: 'loc_1',
        codigo: 'A1',
        ativo: true,
        bloqueada: false,
        isPickable: true,
        isPutaway: false,
      })),
    });

    const resposta = await controller.mostrarEstado('loc_1');

    expect(resposta.success).toBe(true);
    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(resposta.data).toMatchObject({ isPickable: true });
  });
});