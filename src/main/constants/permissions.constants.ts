/**
 * @file permissions.constants.ts
 * @description Fonte única de verdade sobre módulos e acções do RBAC (RNF03).
 * Partilhada entre o processo Main e o renderer para garantir que a matriz de
 * permissões, o menu e a validação usam exactamente o mesmo catálogo.
 */

import { extrairPermissoesRh } from './rh-permissions.constants';

/** Módulos do sistema subjectos a controlo de acesso. */
export const MODULOS_RBAC = [
  'vendas',
  'compras',
  'estoque',
  'comercial',
  'financas',
  'fiscal',
  'rh',
  'configuracoes',
  'relatorios',
] as const;

export type ModuloRbac = (typeof MODULOS_RBAC)[number];

/** Acções de controlo de acesso por módulo. */
export const ACOES_RBAC = ['read', 'write', 'delete', 'approve', 'admin'] as const;

export type AcaoRbac = (typeof ACOES_RBAC)[number];

/** Descrições apresentadas na matriz de permissões. */
export const ACOES_RBAC_LABELS: Record<AcaoRbac, string> = {
  read: 'Consultar',
  write: 'Criar/Editar',
  delete: 'Eliminar',
  approve: 'Aprovar',
  admin: 'Administrar',
};

/** Módulos e acções mínimos para gerir utilizadores e perfis. */
export const ACESSO_CONFIGURACOES_ADMIN = {
  modulo: 'configuracoes' as ModuloRbac,
  acao: 'admin' as AcaoRbac,
};

/** Módulos e acções mínimos para gerir apenas os perfis de acesso. */
export const ACESSO_PERFIS_ADMIN = {
  modulo: 'configuracoes' as ModuloRbac,
  acao: 'admin' as AcaoRbac,
};

/** Verifica se um bloco de permissões concede uma acção sobre um módulo. */
export function permissoesConcedem(
  permissoes: Record<string, string[] | boolean> | null | undefined,
  modulo: string,
  acao: string
): boolean {
  if (!permissoes) return false;

  if (permissoes['*'] === true) return true;
  if (Array.isArray(permissoes['*']) && permissoes['*'].includes('*')) return true;

  const modulePerms = permissoes[modulo];
  if (!modulePerms) return false;
  if (modulePerms === true) return true;

  if (Array.isArray(modulePerms)) {
    return modulePerms.includes('*') || modulePerms.includes(acao);
  }

  return false;
}

/** Constrói o objecto de permissões a persistir a partir de uma matriz. */
export function normalizarPermissoes(
  matriz: Record<string, string[] | boolean> | null | undefined
): Record<string, string[] | boolean> {
  if (!matriz) return {};

  const resultado: Record<string, string[] | boolean> = {};

  for (const modulo of MODULOS_RBAC) {
    const valor = matriz[modulo];

    if (valor === undefined || valor === null) continue;
    if (valor === true) {
      resultado[modulo] = true;
      continue;
    }
    if (!Array.isArray(valor)) continue;

    const acoes = valor.filter((acao) => ACOES_RBAC.includes(acao as AcaoRbac) || acao === '*');
    if (acoes.length > 0) {
      resultado[modulo] = acoes.includes('*') ? true : [...new Set(acoes)];
    }
  }

  // Preserva as chaves fine-grained do RH (ex.: `rh.funcionarios`), que não
  // pertencem a `MODULOS_RBAC` mas cujo valor tem de sobreviver à gravação do
  // perfil. Ver DECISOES.md (ADR-004).
  const permissoesRh = extrairPermissoesRh(matriz);
  for (const [chave, valor] of Object.entries(permissoesRh)) {
    resultado[chave] = valor;
  }

  return resultado;
}
