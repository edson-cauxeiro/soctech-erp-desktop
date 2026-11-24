/**
 * @file modules.ts
 * @description Catálogo central e único dos módulos licenciáveis do ERP.
 *
 * A UI de licenciamento e os serviços do Main consomem exactamente esta
 * lista. Não existe catálogo de módulos na base de dados: `modulosJson` das
 * empresas é uma selecção de interface não assinada e nunca uma autoridade
 * de direitos.
 */

import type { EssentialCapability, LicensingModuleKey } from './types';

/** Definição comercial de um módulo licenciável. */
export interface LicensingModuleDefinition {
  /** Chave estável, igual à chave RBAC correspondente. */
  key: LicensingModuleKey;
  /** Nome apresentado na interface, em português. */
  label: string;
  /** Módulos licenciáveis dos quais este depende. Vazio na versão 1. */
  dependencies: readonly LicensingModuleKey[];
  /**
   * `true` quando a função não pode ser bloqueada por ausência de licença.
   * Aplica-se a `configuracoes`: sem acesso às configurações o administrador
   * não conseguiria importar a própria licença. O RBAC continua a ser exigido.
   */
  alwaysAvailable: boolean;
}

/** Catálogo dos 9 módulos RBAC existentes, sem módulos inventados. */
export const LICENSING_MODULES: readonly LicensingModuleDefinition[] = [
  { key: 'vendas', label: 'Vendas', dependencies: [], alwaysAvailable: false },
  { key: 'compras', label: 'Compras', dependencies: [], alwaysAvailable: false },
  { key: 'estoque', label: 'Stock', dependencies: [], alwaysAvailable: false },
  { key: 'comercial', label: 'Comercial', dependencies: [], alwaysAvailable: false },
  { key: 'financas', label: 'Finanças', dependencies: [], alwaysAvailable: false },
  { key: 'fiscal', label: 'Fiscal', dependencies: [], alwaysAvailable: false },
  { key: 'rh', label: 'Recursos Humanos', dependencies: [], alwaysAvailable: false },
  { key: 'configuracoes', label: 'Configurações', dependencies: [], alwaysAvailable: true },
  { key: 'relatorios', label: 'Relatórios', dependencies: [], alwaysAvailable: false },
] as const;

/** Chaves dos módulos licenciáveis, pela ordem do catálogo. */
export const LICENSING_MODULE_KEYS: readonly LicensingModuleKey[] =
  LICENSING_MODULES.map((module) => module.key);

/**
 * Funcionalidades essenciais, distinctas dos módulos comerciais.
 * Nenhuma delas sofre verificação de licença na Fase 7.
 */
export const ESSENTIAL_CAPABILITIES: readonly EssentialCapability[] = [
  'login',
  'inicio',
  'configuracoes',
  'licenciamento',
  'backup',
  'export',
] as const;

/** Verifica se uma chave pertence ao catálogo de módulos licenciáveis. */
export function isLicensingModule(key: string): key is LicensingModuleKey {
  return LICENSING_MODULES.some((module) => module.key === key);
}

/** Devolve a definição de um módulo ou `null` quando a chave é desconhecida. */
export function getLicensingModule(key: string): LicensingModuleDefinition | null {
  return LICENSING_MODULES.find((module) => module.key === key) ?? null;
}

/** Devolve o nome apresentado de um módulo, ou a própria chave se desconhecido. */
export function getLicensingModuleLabel(key: string): string {
  return getLicensingModule(key)?.label ?? key;
}

/** Devolve as dependências declaradas de um módulo. */
export function getLicensingModuleDependencies(key: LicensingModuleKey): readonly LicensingModuleKey[] {
  return getLicensingModule(key)?.dependencies ?? [];
}

/** Indica se o módulo deve permanecer acessível mesmo sem licença. */
export function isAlwaysAvailableModule(key: LicensingModuleKey): boolean {
  return getLicensingModule(key)?.alwaysAvailable ?? false;
}
