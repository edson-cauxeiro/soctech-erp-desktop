/**
 * @file localizacao.router.ts
 * @description Registo de canais IPC para a estrutura de armazéns (RF07, TASK-023).
 *
 * Router fino: valida só o que é argumento posicional (o ID) e delega no
 * controller, que é quem trata sessão, permissões, Zod e a resposta. Todos os
 * `handle` ficam dentro de `registerLocalizacaoRouter` — fora da função o
 * registo acontecia no momento do import e um canal duplicado rebentava com
 * `second handler` no arranque.
 */

import { localizacaoController } from '../controllers/localizacao.controller';

/** Resposta padrão quando o handler escapa a invocação do controller. */
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

export function registerLocalizacaoRouter(): void {
  const handle = handleLicenciado('estoque');
  /** Localizações de uma zona (`zonaId` é obrigatório no schema de filtros). */
  handle('localizacoes:list', async (_event, rawFilters) => {
    try {
      return await localizacaoController.list(rawFilters);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Uma localização, com zona e área. */
  handle('localizacoes:get', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da localização é obrigatório.' } };
      return await localizacaoController.get(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Áreas de um armazém. */
  handle('localizacoes:areas', async (_event, armazemId) => {
    try {
      const valido = idObrigatorio(armazemId);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID do armazém é obrigatório.' } };
      return await localizacaoController.areas(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Zonas de uma área. */
  handle('localizacoes:zonas', async (_event, areaId) => {
    try {
      const valido = idObrigatorio(areaId);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da área é obrigatório.' } };
      return await localizacaoController.zonas(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Árvore `armazém → áreas → zonas → localizações`. */
  handle('localizacoes:tree', async (_event, armazemId) => {
    try {
      const valido = idObrigatorio(armazemId);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID do armazém é obrigatório.' } };
      return await localizacaoController.tree(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Criar área. O payload é validado pelo Zod dentro do service. */
  handle('localizacoes:criar-area', async (_event, raw) => {
    try {
      return await localizacaoController.criarArea(raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Criar zona numa área. */
  handle('localizacoes:criar-zona', async (_event, raw) => {
    try {
      return await localizacaoController.criarZona(raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Actualizar uma área (armazém é imutável). */
  handle('localizacoes:actualizar-area', async (_event, id, raw) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da área é obrigatório.' } };
      return await localizacaoController.actualizarArea(valido, raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Desactivar uma área. */
  handle('localizacoes:desactivar-area', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da área é obrigatório.' } };
      return await localizacaoController.desactivarArea(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Actualizar uma zona (área é imutável). */
  handle('localizacoes:actualizar-zona', async (_event, id, raw) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da zona é obrigatório.' } };
      return await localizacaoController.actualizarZona(valido, raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Desactivar uma zona. */
  handle('localizacoes:desactivar-zona', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da zona é obrigatório.' } };
      return await localizacaoController.desactivarZona(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Criar localização. O payload é validado pelo Zod dentro do service. */
  handle('localizacoes:create', async (_event, raw) => {
    try {
      return await localizacaoController.create(raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Actualizar localização. */
  handle('localizacoes:update', async (_event, id, raw) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da localização é obrigatório.' } };
      return await localizacaoController.update(valido, raw);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Desactivar localização. */
  handle('localizacoes:delete', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da localização é obrigatório.' } };
      return await localizacaoController.delete(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Capacidade declarada vs. quantidade armazenada. */
  handle('localizacoes:mostrar-capacidade', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da localização é obrigatório.' } };
      return await localizacaoController.mostrarCapacidade(valido);
    } catch (erro) {
      return falha(erro);
    }
  });

  /** Estado operacional da localização. */
  handle('localizacoes:mostrar-estado', async (_event, id) => {
    try {
      const valido = idObrigatorio(id);
      if (!valido) return { success: false as const, error: { code: 'INVALID_ID', message: 'ID da localização é obrigatório.' } };
      return await localizacaoController.mostrarEstado(valido);
    } catch (erro) {
      return falha(erro);
    }
  });
}
