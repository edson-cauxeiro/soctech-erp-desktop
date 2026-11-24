/**
 * @file license-validator.service.ts
 * @description Validação pura de um documento de licença: estrutura,
 * assinatura, produto, datas, módulos, limites e instalação.
 *
 * Não acede à base de dados nem à interface. A persistência e a substituição
 * da licença ocorrem apenas depois de `valid: true`.
 */

import { canonicalize } from '../../../shared/licensing/canonical';
import { LICENSING_MESSAGES } from '../../../shared/licensing/messages';
import {
  LICENSE_PRODUCT_ID,
  licenseEnvelopeSchema,
  licensePayloadKeySchema,
  licensePayloadSchema,
  type LicensePayload,
} from '../../../shared/licensing/schemas';
import type { LicenseStatus } from '../../../shared/licensing/types';
import { verifyLicenseSignature } from './crypto.service';
import type { LicensePublicKey } from './public-keys';

/** Tolerância para relógios ligeiramente desalinhados na data de início. */
export const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export type LicenseValidationResult =
  | { valid: true; payload: LicensePayload; canonicalPayload: string }
  | { valid: false; status: LicenseStatus; message: string };

export interface ValidateLicenseOptions {
  /** Data de referência; injectável para testes. */
  now?: Date;
  /** Identificador estável da instalação actual. */
  currentInstallationId?: string | null;
  /** Conjunto de chaves confiadas; por omissão as incorporadas no cliente. */
  publicKeys?: readonly LicensePublicKey[];
}

function invalid(status: LicenseStatus): LicenseValidationResult {
  return { valid: false, status, message: LICENSING_MESSAGES[status] };
}

/**
 * Valida um documento lido do ficheiro de licença.
 * A assinatura é verificada sobre os bytes canónicos do payload original,
 * antes de qualquer reconstrução pelo Zod.
 */
export function validateLicenseDocument(
  raw: unknown,
  options: ValidateLicenseOptions = {}
): LicenseValidationResult {
  const envelope = licenseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return invalid('INVALID_FORMAT');
  }

  const keyId = licensePayloadKeySchema.safeParse(envelope.data.payload);
  if (!keyId.success) {
    return invalid('INVALID_FORMAT');
  }

  const canonicalPayload = canonicalize(envelope.data.payload);
  const signature = verifyLicenseSignature(
    canonicalPayload,
    envelope.data.signature,
    keyId.data.keyId,
    options.publicKeys
  );
  if (!signature.knownKey) {
    return invalid('UNKNOWN_KEY');
  }
  if (!signature.valid) {
    return invalid('INVALID_SIGNATURE');
  }

  const payload = licensePayloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return invalid('INVALID_FORMAT');
  }

  if (payload.data.productId !== LICENSE_PRODUCT_ID) {
    return invalid('PRODUCT_MISMATCH');
  }

  const now = (options.now ?? new Date()).getTime();
  if (now + CLOCK_TOLERANCE_MS < Date.parse(payload.data.notBefore)) {
    return invalid('NOT_YET_VALID');
  }
  if (payload.data.expiresAt && now > Date.parse(payload.data.expiresAt)) {
    return invalid('EXPIRED');
  }

  const { bindingMode, installationId } = payload.data.installation;
  if (bindingMode === 'installation' && installationId !== options.currentInstallationId) {
    return invalid('INSTALLATION_MISMATCH');
  }

  return { valid: true, payload: payload.data, canonicalPayload };
}
