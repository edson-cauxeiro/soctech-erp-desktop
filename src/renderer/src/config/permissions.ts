/**
 * @file permissions.ts
 * @description Catálogo de módulos e acções do RBAC (RNF03) no renderer.
 * Espelha `src/main/constants/permissions.constants.ts` para manter a matriz de
 * permissões, o menu e a validação alinhados com o processo Main.
 */

export type ModuloRbac =
  | 'vendas'
  | 'compras'
  | 'estoque'
  | 'comercial'
  | 'financas'
  | 'fiscal'
  | 'rh'
  | 'configuracoes'
  | 'relatorios';

export type AcaoRbac = 'read' | 'write' | 'delete' | 'approve' | 'admin';

export interface ModuloInfo {
  key: ModuloRbac;
  label: string;
}

export interface AcaoInfo {
  key: AcaoRbac;
  label: string;
}

export const MODULOS: ModuloInfo[] = [
  { key: 'vendas', label: 'Vendas' },
  { key: 'compras', label: 'Compras' },
  { key: 'estoque', label: 'Stock' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'financas', label: 'Finanças' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'rh', label: 'Recursos Humanos' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'relatorios', label: 'Relatórios' },
];

export const ACOES: AcaoInfo[] = [
  { key: 'read', label: 'Consultar' },
  { key: 'write', label: 'Criar / Editar' },
  { key: 'delete', label: 'Eliminar' },
  { key: 'approve', label: 'Aprovar' },
  { key: 'admin', label: 'Administrar' },
];

export const ACOES_KEYS: AcaoRbac[] = ACOES.map((a) => a.key);

/** Devolve a descrição de uma acção. */
export function labelAcao(acao: AcaoRbac): string {
  return ACOES.find((a) => a.key === acao)?.label ?? acao;
}

/** Devolve a descrição de um módulo. */
export function labelModulo(modulo: ModuloRbac): string {
  return MODULOS.find((m) => m.key === modulo)?.label ?? modulo;
}

/** Verifica se um conjunto de permissões concede uma acção sobre um módulo. */
export function concedemPermissoes(
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
