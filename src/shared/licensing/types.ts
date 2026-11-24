/**
 * @file types.ts
 * @description Tipos do domínio de licenciamento partilhados entre o processo
 * Main (decisão efectiva) e o Renderer (apresentação). Nenhum destes tipos
 * substitui o RBAC: licenciamento e permissões são verificações distintas.
 */

/**
 * Chaves estáveis dos módulos comerciais do ERP.
 *
 * Fonte: `MODULOS_RBAC` (`src/main/constants/permissions.constants.ts`).
 * Não inventar chaves novas; este catálogo acompanha os módulos reais.
 */
export type LicensingModuleKey =
  | 'vendas'
  | 'compras'
  | 'estoque'
  | 'comercial'
  | 'financas'
  | 'fiscal'
  | 'rh'
  | 'relatorios'
  | 'configuracoes';

/** Modo de vinculação da licença a uma instalação. */
export type InstallationBindingMode = 'none' | 'installation';

/**
 * Estados possíveis de uma licença.
 *
 * `VALID` é sempre derivado da revalidação do documento assinado e das
 * condições actuais — nunca é uma verdade persistida na base de dados.
 */
export type LicenseStatus =
  | 'MISSING'
  | 'VALID'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'INVALID_FORMAT'
  | 'PRODUCT_MISMATCH'
  | 'INSTALLATION_MISMATCH'
  | 'UNKNOWN_KEY';

/** Motivo devolvido com o resultado de uma verificação de acesso a módulo. */
export type ModuleAccessReason =
  | 'LICENSE_ACTIVE'
  | 'MODULE_NOT_LICENSED'
  | 'LICENSE_MISSING'
  | 'LICENSE_INVALID'
  | 'LICENSE_NOT_YET_VALID'
  | 'LICENSE_EXPIRED'
  | 'INSTALLATION_MISMATCH';

/** Resultado da verificação central de acesso a um módulo. */
export interface ModuleAccessResult {
  allowed: boolean;
  reason: ModuleAccessReason;
}

/**
 * Funcionalidades transversais que nunca podem ser bloqueadas por falta de
 * licença de um módulo comercial: autenticação, arranque, consola de
 * configuração (onde a licença é importada), cópias de segurança e exportação
 * dos dados do próprio utilizador.
 */
export type EssentialCapability =
  | 'login'
  | 'inicio'
  | 'configuracoes'
  | 'licenciamento'
  | 'backup'
  | 'export';

/** Resumo não sensível de um payload assinado, para apresentação na UI. */
export interface LicenseSummary {
  licenseId: string;
  productId: string;
  customerName: string;
  customerTaxNumber: string | null;
  issuedAt: string;
  notBefore: string;
  expiresAt: string | null;
  keyId: string;
  bindingMode: InstallationBindingMode;
  installationId: string | null;
  limits: {
    maxUsers: number | null;
    maxDevices: number | null;
  };
  modules: Array<{
    key: LicensingModuleKey;
    label: string;
    enabled: boolean;
  }>;
}

/** Um módulo do catálogo no contexto da licença actual. */
export interface LicensedModuleView {
  key: LicensingModuleKey;
  label: string;
  enabled: boolean;
  licensed: boolean;
  alwaysAvailable: boolean;
  dependencies: readonly LicensingModuleKey[];
}

/** Estado derivado no momento da consulta — nunca lido como verdade gravada. */
export interface LicenseStatusResult {
  status: LicenseStatus;
  message: string;
  summary: LicenseSummary | null;
  installationId: string | null;
  installedAt: string | null;
  lastValidatedAt: string | null;
  licensedModules: LicensingModuleKey[];
  modules: LicensedModuleView[];
}

/** Resultado de uma pré-visualização; não altera a licença instalada. */
export interface LicensePreviewResult {
  valid: boolean;
  status: LicenseStatus;
  message: string;
  summary: LicenseSummary | null;
}

export interface ImportLicenseResult extends LicensePreviewResult {
  installedAt: string | null;
}
