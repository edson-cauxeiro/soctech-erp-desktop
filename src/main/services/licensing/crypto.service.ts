/**
 * @file crypto.service.ts
 * @description Verificação Ed25519 de licenças no processo Main.
 * A chave privada nunca entra neste processo nem no bundle do cliente.
 */

import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { LICENSE_PUBLIC_KEYS, type LicensePublicKey } from './public-keys';

export interface SignatureVerificationResult {
  /** O `keyId` existe no conjunto de chaves confiadas. */
  knownKey: boolean;
  /** A assinatura corresponde aos bytes canónicos do payload. */
  valid: boolean;
}

/**
 * Verifica a assinatura de um payload canónico com a chave pública indicada
 * pelo `keyId`. Erros de codificação da chave ou da assinatura são tratados
 * como assinatura inválida, nunca como excepção para a interface.
 */
export function verifyLicenseSignature(
  canonicalPayload: string,
  signatureBase64: string,
  keyId: string,
  publicKeys: readonly LicensePublicKey[] = LICENSE_PUBLIC_KEYS
): SignatureVerificationResult {
  const entry = publicKeys.find((candidate) => candidate.keyId === keyId);
  if (!entry) {
    return { knownKey: false, valid: false };
  }

  try {
    const publicKey: KeyObject = createPublicKey(entry.publicKeyPem);
    const signature = Buffer.from(signatureBase64, 'base64');
    const valid = verify(null, Buffer.from(canonicalPayload, 'utf8'), publicKey, signature);
    return { knownKey: true, valid };
  } catch {
    return { knownKey: true, valid: false };
  }
}
