/**
 * @file documentos.api.test.ts
 * @description Contrato dos clientes de API dos documentos fiscais.
 * Garante que, sem o preload do Electron, cada operação devolve uma falha estruturada
 * `UNAVAILABLE` em vez de rebentar, e que os grupos expostos existem.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { proformasApi } from './proformas.api';
import { guiasEntregaApi } from './guias-entrega.api';
import { recibosApi } from './recibos.api';
import { vendasApi } from './vendas.api';

const indisponivel = (api: string) => ({
  success: false,
  error: { code: 'UNAVAILABLE', message: `API de ${api} não disponível.` },
});

const PROFORMAS = indisponivel('proformas');
const GUIAS = indisponivel('guias de entrega');
const RECIBOS = indisponivel('recibos');
const VENDAS = indisponivel('vendas');

describe('documentos fiscais — fallback sem preload', () => {
  it('proformasApi devolve erro estruturado em vez de rebentar', async () => {
    await expect(proformasApi.list()).resolves.toEqual(PROFORMAS);
    await expect(proformasApi.get('qualquer')).resolves.toEqual(PROFORMAS);
    await expect(
      proformasApi.criar({ empresaId: 'e1', serie: 'FP2026', clienteId: 'c1', linhas: [] })
    ).resolves.toEqual(PROFORMAS);
    await expect(proformasApi.emitir('qualquer')).resolves.toEqual(PROFORMAS);
    await expect(proformasApi.anular('qualquer', 'motivo')).resolves.toEqual(PROFORMAS);
  });

  it('guiasEntregaApi devolve erro estruturado', async () => {
    await expect(guiasEntregaApi.list()).resolves.toEqual(GUIAS);
    await expect(guiasEntregaApi.get('qualquer')).resolves.toEqual(GUIAS);
    await expect(guiasEntregaApi.confirmar('qualquer')).resolves.toEqual(GUIAS);
    await expect(guiasEntregaApi.faturar('qualquer', { serie: 'FT 2026' })).resolves.toEqual(GUIAS);
  });

  it('recibosApi devolve erro estruturado', async () => {
    await expect(recibosApi.list()).resolves.toEqual(RECIBOS);
    await expect(recibosApi.get('qualquer')).resolves.toEqual(RECIBOS);
    await expect(recibosApi.anular('qualquer', 'motivo')).resolves.toEqual(RECIBOS);
    await expect(recibosApi.imputarFaturas('qualquer', [])).resolves.toEqual(RECIBOS);
  });

  it('vendasApi expõe o ciclo fiscal completo com o mesmo fallback', async () => {
    await expect(vendasApi.listFaturas()).resolves.toEqual(VENDAS);
    await expect(vendasApi.getFatura('qualquer')).resolves.toEqual(VENDAS);
    await expect(vendasApi.anularFatura('qualquer', 'motivo')).resolves.toEqual(VENDAS);
  });

  it('nenhum wrapper devolve uma lista vazia como se fosse sucesso', async () => {
    // Uma lista vazia com success: true esconderia um preload em falta ou um canal por
    // registar: o histórico apareceria vazio, sem qualquer erro visível.
    for (const res of [
      await proformasApi.list(),
      await guiasEntregaApi.list(),
      await recibosApi.list(),
      await vendasApi.listFaturas(),
    ]) {
      expect(res.success).toBe(false);
    }
  });
});

describe('documentos fiscais — encaminhamento para o preload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encaminha a chamada quando o grupo existe no preload', async () => {
    const listFaturas = vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0 } });
    vi.stubGlobal('window', { api: { vendas: { listFaturas } } });

    await vendasApi.listFaturas();

    expect(listFaturas).toHaveBeenCalledWith(undefined);
  });

  it('devolve UNAVAILABLE para o grupo que o preload não expõe', async () => {
    // Um grupo em falta é um erro de configuração do preload, não um histórico vazio.
    vi.stubGlobal('window', { api: { vendas: { listFaturas: vi.fn() } } });

    await expect(proformasApi.list()).resolves.toEqual(PROFORMAS);
    await expect(guiasEntregaApi.list()).resolves.toEqual(GUIAS);
    await expect(recibosApi.list()).resolves.toEqual(RECIBOS);
  });

  it('devolve UNAVAILAILABLE quando o método existe mas não é função', async () => {
    vi.stubGlobal('window', { api: { vendas: { listFaturas: 'não é função' } } });

    await expect(vendasApi.listFaturas()).resolves.toEqual(VENDAS);
  });
});
