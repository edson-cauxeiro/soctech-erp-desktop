/**
 * @file licensing-errors.ts
 * @description Erro tipado do domínio de licenciamento.
 */

import { AppError } from './errors';
import { LICENSING_MESSAGES } from '../../shared/licensing/messages';
import type {
  LicenseStatus,
  LicensingModuleKey,
  ModuleAccessReason,
} from '../../shared/licensing/types';

/** Erro de licenciamento com estado derivado e mensagem não técnica. */
export class LicensingError extends AppError {
  public readonly status: LicenseStatus;

  constructor(status: LicenseStatus, details?: unknown) {
    super(LICENSING_MESSAGES[status], `LICENSE_${status}`, 422, details);
    this.name = 'LicensingError';
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Operação de um módulo comercial sem direito de licença. Não apaga nem
 * bloqueia dados: apenas impede a execução da operação protegida.
 */
export class ModuleNotLicensedError extends AppError {
  public readonly modulo: LicensingModuleKey;
  public readonly reason: ModuleAccessReason;

  constructor(modulo: LicensingModuleKey, reason: ModuleAccessReason) {
    super(LICENSING_MESSAGES[reason], 'MODULE_NOT_LICENSED', 403, { modulo, reason });
    this.name = 'ModuleNotLicensedError';
    this.modulo = modulo;
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
