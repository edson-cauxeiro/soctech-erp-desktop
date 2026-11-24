import type { ModuloRbac, AcaoRbac } from "@/config/permissions";

export type ModuleKey =
  | "inicio"
  | "vendas"
  | "financas"
  | "compras"
  | "estoque"
  | "comercial"
  | "rh"
  | "relatorios"
  | "fiscal"
  | "configuracoes";

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  path: string;
  /** Módulo RBAC e acção mínima exigidos para aceder (leitura por defeito). */
  modulo: ModuloRbac;
  acao: AcaoRbac;
  /** Quando `false`, o módulo não entra no menu principal (acesso por botão de engrenagem). */
  nav?: boolean;
}

export const MODULES: ModuleDefinition[] = [
  { key: "vendas", label: "Vendas", path: "/vendas", modulo: "vendas", acao: "read" },
  { key: "financas", label: "Finanças", path: "/financas", modulo: "financas", acao: "read" },
  { key: "compras", label: "Compras", path: "/compras", modulo: "compras", acao: "read" },
  { key: "estoque", label: "Stock", path: "/estoque", modulo: "estoque", acao: "read" },
  { key: "comercial", label: "Comercial", path: "/comercial", modulo: "comercial", acao: "read" },
  { key: "rh", label: "Recursos Humanos", path: "/rh", modulo: "rh", acao: "read" },
  { key: "relatorios", label: "Relatórios", path: "/relatorios", modulo: "relatorios", acao: "read" },
  { key: "fiscal", label: "Fiscal", path: "/fiscal", modulo: "fiscal", acao: "read" },
  { key: "configuracoes", label: "Configurações", path: "/configuracoes", modulo: "configuracoes", acao: "admin", nav: false },
];

export function getModuleLabel(key: ModuleKey): string {
  return MODULES.find((module) => module.key === key)?.label ?? key;
}

export function getModulePath(key: ModuleKey): string {
  return MODULES.find((module) => module.key === key)?.path ?? `/${key}`;
}

/** Devolve a definição de módulo RBAC para um `ModuleKey` (ou `null` se não existir). */
export function getModuleRequirement(key: ModuleKey): { modulo: ModuloRbac; acao: AcaoRbac } | null {
  return MODULES.find((module) => module.key === key) ?? null;
}
