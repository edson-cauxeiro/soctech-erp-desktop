/**
 * @file stock.controller.test.ts
 * @description Testes de auditoria e contexto do controlador de stock.
 *
 * Duas propriedades que o caminho legado não tinha e não deviam regredir:
 *
 *  1. **O autor vem da sessão, nunca do payload.** Um renderer comprometido
 *     podia enviar `criadoPorId` no corpo do pedido; o controller tem de o
 *     ignorar e usar a sessão.
 *  2. **Toda operação de escrita audita depois de ter sucesso** — e só depois,
 *     para uma falha de stock não gravar um movimento que não existe.
 *
 * Os serviços são injectados (serviço de stock, auth e audit), sem tocar na
 * base de dados.
 */

import { describe, it, expect, vi } from 'vitest';
import { StockController } from './stock.controller';
import type { UserSession } from '../middlewares/rbac.middleware';

function sessao(sobreposicoes: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_stock',
    login: 'carla.santos',
    nomeCompleto: 'Carla Santos',
    email: 'carla@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Armazém',
    permissoes: { estoque: ['read', 'write'] },
    empresaConfigId: 'empresa_1',
    ...sobreposicoes,
  };
}

function criarController(sessaoActual: UserSession | null) {
  const stockService = {
    createMovimento: vi.fn(async (_input: unknown, _contexto: unknown) => ({
      numero: 'MV/0001',
      tipo: 'entrada',
      artigoId: 'art_1',
      quantidade: 10,
      armazemOrigemId: null,
      armazemDestinoId: 'arm_1',
      documentoOrigem: 'COMPRA/001',
    })),
    transferenciaStock: vi.fn(async (_input: unknown, _contexto: unknown) => ({
      numero: 'MV/0002',
      tipo: 'transferencia',
      artigoId: 'art_1',
      quantidade: 5,
      armazemOrigemId: 'arm_1',
      armazemDestinoId: 'arm_2',
      documentoOrigem: 'TRANSFERÊNCIA',
    })),
    processarBaixaVenda: vi.fn(async () => [
      {
        numero: 'MV/0003',
        tipo: 'saida',
        artigoId: 'art_1',
        quantidade: 2,
        armazemOrigemId: 'arm_1',
        armazemDestinoId: null,
        documentoOrigem: 'FAT/0001',
      },
    ]),
    criarInventario: vi.fn(async () => ({
      numero: 'INV/0001',
      armazemId: 'arm_1',
      estado: 'aberto',
    })),
    fecharInventario: vi.fn(async (_id: string, _contexto: unknown) => ({
      numero: 'INV/0001',
      estado: 'fechado',
    })),
    getEstadoStock: vi.fn(async () => ({ items: [], total: 0 })),
  };
  const auth = { getCurrentSession: vi.fn(() => sessaoActual) };
  const audit = { registar: vi.fn(async () => {}) };

  const controller = new StockController(stockService as never, auth as never, audit as never);
  return { controller, stockService, auth, audit };
}

describe('StockController.createMovimento', () => {
  it('passa o autor da sessão ao serviço, ignorando o payload', async () => {
    const actual = sessao();
    const { controller, stockService } = criarController(actual);

    const resposta = await controller.createMovimento({
      criadoPorId: 'util_malandro',
      artigoId: 'art_1',
      quantidade: 10,
      tipo: 'entrada',
      armazemDestinoId: 'arm_1',
      documentoOrigem: 'COMPRA/001',
    });

    expect(resposta.success).toBe(true);
    expect(stockService.createMovimento).toHaveBeenCalledTimes(1);
    const [payload, contexto] = stockService.createMovimento.mock.calls[0];
    expect(contexto).toEqual({ criadoPorId: actual.id });
    expect((payload as Record<string, unknown>).criadoPorId).toBe('util_malandro');
  });

  it('audita o movimento depois de criado', async () => {
    const actual = sessao();
    const { controller, audit } = criarController(actual);

    await controller.createMovimento({
      artigoId: 'art_1',
      quantidade: 10,
      tipo: 'entrada',
      armazemDestinoId: 'arm_1',
      documentoOrigem: 'COMPRA/001',
    });

    expect(audit.registar).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'criar',
        entidade: 'MovimentoStock',
        entidadeId: 'MV/0001',
        modulo: 'estoque',
        empresaId: actual.empresaConfigId,
        utilizadorId: actual.id,
      }),
    );
  });

  it('não audita quando a operação falha', async () => {
    const actual = sessao();
    const { controller, stockService, audit } = criarController(actual);
    stockService.createMovimento.mockRejectedValueOnce(new Error('stock insuficiente'));

    const resposta = await controller.createMovimento({});

    expect(resposta.success).toBe(false);
    expect(audit.registar).not.toHaveBeenCalled();
  });

  it('sem sessão, recusa por FORBIDDEN e nem chega ao serviço', async () => {
    const { controller, audit } = criarController(null);

    const resposta = await controller.createMovimento({});

    expect(resposta.success).toBe(false);
    expect(audit.registar).not.toHaveBeenCalled();
  });
});

describe('StockController.transferencia', () => {
  it('audita a transferência com o autor da sessão', async () => {
    const actual = sessao();
    const { controller, stockService, audit } = criarController(actual);

    const resposta = await controller.transferencia({
      artigoId: 'art_1',
      quantidade: 5,
      armazemOrigemId: 'arm_1',
      armazemDestinoId: 'arm_2',
    });

    expect(resposta.success).toBe(true);
    expect(stockService.transferenciaStock.mock.calls[0][1]).toEqual({ criadoPorId: actual.id });
    expect(audit.registar).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'criar', entidade: 'MovimentoStock', entidadeId: 'MV/0002' }),
    );
  });
});

describe('StockController.baixaVenda', () => {
  it('audita cada movimento gerado pela baixa de venda', async () => {
    const actual = sessao();
    const { controller, audit } = criarController(actual);

    const resposta = await controller.baixaVenda({
      documentoOrigem: 'FAT/0001',
      linhas: [{ artigoId: 'art_1', quantidade: 2 }],
    });

    expect(resposta.success).toBe(true);
    expect(audit.registar).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledWith(
      expect.objectContaining({ entidadeId: 'MV/0003', modulo: 'estoque', empresaId: actual.empresaConfigId }),
    );
  });
});

describe('StockController.fecharInventario', () => {
  it('passa o autor ao serviço e audita o fecho', async () => {
    const actual = sessao();
    const { controller, stockService, audit } = criarController(actual);

    const resposta = await controller.fecharInventario('inv_1');

    expect(resposta.success).toBe(true);
    expect(stockService.fecharInventario).toHaveBeenCalledWith('inv_1', { criadoPorId: actual.id });
    expect(audit.registar).toHaveBeenCalledTimes(1);
    expect(audit.registar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'submeter',
        entidade: 'InventarioContagem',
        entidadeId: 'INV/0001',
        dadosNovos: { estado: 'fechado' },
      }),
    );
  });
});
describe('StockController.getEstadoStock', () => {
  it('passa a empresa da sessão ao serviço', async () => {
    const actual = sessao();
    const { controller, stockService } = criarController(actual);

    const resposta = await controller.getEstadoStock({ search: 'ART-0001' });

    expect(resposta.success).toBe(true);
    expect(stockService.getEstadoStock).toHaveBeenCalledWith({ search: 'ART-0001' }, actual.empresaConfigId);
  });
});
