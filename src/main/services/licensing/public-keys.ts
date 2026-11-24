/**
 * @file public-keys.ts
 * @description Chaves públicas Ed25519 confiadas pela aplicação.
 *
 * A chave privada correspondente fica fora do repositório e do instalador
 * (utilitário do fornecedor). Várias chaves podem coexistir durante uma
 * rotação: o `keyId` do payload selecciona a chave de verificação.
 */

export interface LicensePublicKey {
  keyId: string;
  publicKeyPem: string;
}

export const LICENSE_PUBLIC_KEYS: readonly LicensePublicKey[] = [
  {
    keyId: 'vendor-ed25519-2026-01',
    publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+hYxRwHrFHgL1lwZDt03e1eZYywff1nbARfdfJVTnRY=
-----END PUBLIC KEY-----
`,
  },
] as const;

/** Devolve a chave pública registada para um `keyId`, ou `undefined`. */
export function findLicensePublicKey(keyId: string): LicensePublicKey | undefined {
  return LICENSE_PUBLIC_KEYS.find((entry) => entry.keyId === keyId);
}
