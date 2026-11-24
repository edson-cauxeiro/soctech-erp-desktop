/**
 * @file rbac.middleware.ts
 * @description Middleware e utilitários para controlo de acesso baseado em perfis (RBAC - RNF03).
 */

import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import {
  ACOES_RBAC,
  MODULOS_RBAC,
  permissoesConcedem,
  type AcaoRbac,
  type ModuloRbac,
} from '../constants/permissions.constants';

export type ModuleName = ModuloRbac;
export type ActionType = AcaoRbac;

/**
 * Um `ModuleName`, mas aceitando também módulos que ainda não existem em
 * `ModuloRbac`.
 *
 * Escrever `ModuleName | string` seria o mesmo tipo — o `string` engole a
 * união — mas além de redundante perdia-se a autocompleção dos módulos
 * conhecidos, que é a utilidade real de nomear o tipo. O `& {}` impede o
 * `string` de absorver os literais, mantendo-os sugeridos pelo editor sem
 * proibir módulos futuros.
 */
type ModuleNameOuDesconhecido = ModuleName | (string & {});

export interface UserSession {
  id: string;
  login: string;
  nomeCompleto: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  permissoes: Record<string, string[] | boolean>;
  armazemDefaultId?: string | null;
  empresaConfigId?: string | null;
  empresaNome?: string | null;
  empresaNif?: string | null;
  /** `true` quando a sessão tem permissão `rh.salarios.ver` (ou é admin). */
  podeVerSalarios?: boolean;
}

/** Catálogo exportado para consumidores que precisam dos valores em runtime. */
export { MODULOS_RBAC, ACOES_RBAC };

/**
 * Verifica se uma sessão de utilizador possui permissão para um determinado módulo e acção.
 * Sem sessão autenticada, o acesso é sempre negado.
 * @param session - Sessão actual do utilizador.
 * @param modulo - Nome do módulo.
 * @param acao - Acção desejada (read, write, delete, approve, admin).
 * @returns boolean indicando se o acesso é permitido.
 */
export function hasPermission(
  session: UserSession | null | undefined,
  modulo: ModuleNameOuDesconhecido,
  acao: ActionType = 'read'
): boolean {
  if (!session) return false;

  // Super-admin ou perfil 'Administrador' possui acesso total.
  if (
    session.perfilNome === 'Administrador' ||
    permissoesConcedem(session.permissoes, '*', acao)
  ) {
    return true;
  }

  return permissoesConcedem(session.permissoes, modulo, acao);
}

/**
 * Verifica se a sessão possui pelo menos uma das permissões indicadas.
 * Útil quando uma funcionalidade é acessível por mais de um módulo (ex.: clientes
 * é tanto de Vendas como de Comercial).
 * @param session - Sessão actual do utilizador.
 * @param requisitos - Lista de pares `[modulo, acao]`.
 */
export function hasAnyPermission(
  session: UserSession | null | undefined,
  requisitos: Array<[ModuleNameOuDesconhecido, ActionType?]>
): boolean {
  if (!session) return false;

  return requisitos.some(([modulo, acao]) => hasPermission(session, modulo, acao ?? 'read'));
}

/**
 * Exige uma das permissões indicadas, lançando UnauthorizedError ou ForbiddenError.
 * A verificação é sempre executada: a ausência de sessão é tratada como falha,
 * nunca como autorização implícita.
 * @param session - Sessão do utilizador.
 * @param requisitos - Lista de pares `[modulo, acao]` alternativos entre si.
 */
export function requireAnyPermission(
  session: UserSession | null | undefined,
  requisitos: Array<[ModuleNameOuDesconhecido, ActionType?]>
): void {
  if (!session) {
    throw new UnauthorizedError('Sessão expirada ou não autenticada.');
  }

  if (!hasAnyPermission(session, requisitos)) {
    const descricao = requisitos
      .map(([modulo, acao = 'read']) => `'${acao}' em '${modulo}'`)
      .join(' ou ');
    throw new ForbiddenError(`Permissão insuficiente. Requer acesso a ${descricao}.`);
  }
}

/**
 * Exige permissão específica, lançando UnauthorizedError ou ForbiddenError se inválido.
 * @param session - Sessão do utilizador.
 * @param modulo - Nome do módulo.
 * @param acao - Acção exigida.
 */
export function requirePermission(
  session: UserSession | null | undefined,
  modulo: ModuleNameOuDesconhecido,
  acao: ActionType = 'read'
): void {
  if (!session) {
    throw new UnauthorizedError('Sessão expirada ou não autenticada.');
  }

  if (!hasPermission(session, modulo, acao)) {
    throw new ForbiddenError(
      `Permissão insuficiente para executar '${acao}' no módulo '${modulo}'.`
    );
  }
}
