/**
 * @file lote.router.ts
 * @description Registo de canais IPC para a gestão de lotes e validades (TASK-041).
 *
 * Router fino: valida só o argumento posicional (o ID) e delega no controller,
 * que trata sessão, permissões e Zod. O `handle` de `lotes:list` aceita os
 * filtros como objecto; os restantes passam o payload tal qual.
 */

import { loteController } from '../controllers/lote.controller';

function falha(erro: unknown) {
  return {
    success: false as const,
    error: {
      code: 'INTERNAL_ERROR',
      message: (erro as Error)?.message || 'Erro inesperado no processo principal.',
    },
  };
}

function idObrigatorio(id: unknown): string | null {
  if (typeof id !== 'string' || id.trim() === '') return null;
  return id;
}

import { handleLicenciado } from '../utils/licensed-handler';

export function registerLoteRouter(): void {
  const handle = handleLicenciado('estoque');
  /** Lotes com filtros de artigo, pesquisa e estado de validade. */
  handle('lotes:list', async (_event, rawFiltros) => {
    try {
      return await loteController.list(rawFiltros);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Um lote por ID. */
  handle('lotes:get', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID do lote é obrigatório.' } };
      return await loteController.get(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Criar lote. O payload é validado pelo Zod dentro do service. */
  handle('lotes:create', async (_event, raw) => {
    try {
      return await loteController.create(raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Actualizar lote (artigo é imutável). */
  handle('lotes:update', async (_event, id, raw) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID do lote é obrigatório.' } };
      return await loteController.update(valido, raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Eliminar lote sem stock. */
  handle('lotes:delete', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID do lote é obrigatório.' } };
      return await loteController.delete(valido);
    } catch (erro) {
      return falha(erro);
    }
  });
}