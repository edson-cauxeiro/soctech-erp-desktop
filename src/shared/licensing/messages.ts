/**
 * @file messages.ts
 * @description Mensagens tipadas e traduzíveis para estados de licença.
 * Nunca incluir stack traces nem DETALHES criptográficos na interface.
 */

import type { LicenseStatus, ModuleAccessReason } from './types';

export const LICENSING_MESSAGES: Readonly<Record<LicenseStatus | ModuleAccessReason, string>> = {
  MISSING: 'Licença não instalada.',
  VALID: 'Licença válida.',
  NOT_YET_VALID: 'A licença ainda não está válida nesta data.',
  EXPIRED: 'A licença expirou. Contacte o fornecedor para obter uma nova licença.',
  INVALID_SIGNATURE: 'A assinatura da licença é inválida.',
  INVALID_FORMAT: 'O ficheiro de licença tem um formato inválido.',
  PRODUCT_MISMATCH: 'Esta licença não é válida para este produto.',
  INSTALLATION_MISMATCH: 'Esta licença está vinculada a outra instalação.',
  UNKNOWN_KEY: 'A chave de assinatura desta licença não é reconhecida.',
  LICENSE_ACTIVE: 'Módulo licenciado.',
  MODULE_NOT_LICENSED: 'Este módulo não está incluído na licença actual.',
  LICENSE_MISSING: 'Não existe uma licença instalada.',
  LICENSE_INVALID: 'A licença instalada não é válida.',
  LICENSE_NOT_YET_VALID: 'A licença ainda não está válida nesta data.',
  LICENSE_EXPIRED: 'A licença expirou.',
};
