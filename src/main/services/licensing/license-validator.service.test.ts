import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '../../../shared/licensing/canonical';
import { LICENSING_MESSAGES } from '../../../shared/licensing/messages';
import type { LicensePublicKey } from './public-keys';
import {
  CLOCK_TOLERANCE_MS,
  validateLicenseDocument,
  type ValidateLicenseOptions,
} from './license-validator.service';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const INSTALLATION_ID = 'instalacao-de-teste';
const KEY_ID = 'chave-de-teste';

function createKey(keyId: string): {
  entry: LicensePublicKey;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    entry: {
      keyId,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
    privateKey,
  };
}

const trustedKey = createKey(KEY_ID);
const untrustedKey = createKey('chave-desconhecida');

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

const basePayload: Record<string, unknown> = {
  schemaVersion: 1,
  licenseId: 'LIC-TESTE-0001',
  productId: 'ERP_DESKTOP',
  customer: { name: 'Empresa Exemplo, Lda.', taxNumber: '000000000' },
  issuedAt: iso(-DAY),
  notBefore: iso(-DAY),
  expiresAt: null,
  modules: [
    { key: 'vendas', enabled: true },
    { key: 'estoque', enabled: true },
  ],
  limits: { maxUsers: null, maxDevices: 1 },
  installation: { bindingMode: 'installation', installationId: INSTALLATION_ID },
  keyId: KEY_ID,
};

function payloadWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...JSON.parse(JSON.stringify(basePayload)), ...overrides } as Record<string, unknown>;
}

function signedEnvelope(
  payload: Record<string, unknown> = basePayload,
  key = trustedKey
): { payload: Record<string, unknown>; signature: string } {
  return {
    payload,
    signature: sign(null, Buffer.from(canonicalize(payload), 'utf8'), key.privateKey).toString('base64'),
  };
}

const options: ValidateLicenseOptions = {
  now: NOW,
  currentInstallationId: INSTALLATION_ID,
  publicKeys: [trustedKey.entry],
};

describe('validateLicenseDocument', () => {
  it('aceita licença perpétua válida e devolve os bytes canónicos assinados', () => {
    const envelope = signedEnvelope();

    const result = validateLicenseDocument(envelope, options);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.licenseId).toBe('LIC-TESTE-0001');
    expect(result.canonicalPayload).toBe(canonicalize(basePayload));
  });

  it('aceita licença com data de expiração futura', () => {
    const payload = payloadWith({ expiresAt: iso(DAY) });

    expect(validateLicenseDocument(signedEnvelope(payload), options).valid).toBe(true);
  });

  it('aceita licença não vinculada sem identificador de instalação', () => {
    const payload = payloadWith({
      installation: { bindingMode: 'none', installationId: null },
    });

    expect(
      validateLicenseDocument(signedEnvelope(payload), { ...options, currentInstallationId: undefined }).valid
    ).toBe(true);
  });

  it('rejeita payload adulterado após assinatura', () => {
    const envelope = signedEnvelope();
    const adulterado = payloadWith({ customer: { name: 'Outra Empresa', taxNumber: '000000000' } });

    const result = validateLicenseDocument({ ...envelope, payload: adulterado }, options);

    expect(result).toEqual({
      valid: false,
      status: 'INVALID_SIGNATURE',
      message: LICENSING_MESSAGES.INVALID_SIGNATURE,
    });
  });

  it('rejeita chave pública desconhecida', () => {
    const payload = payloadWith({ keyId: 'chave-desconhecida' });

    expect(validateLicenseDocument(signedEnvelope(payload, untrustedKey), options)).toMatchObject({
      valid: false,
      status: 'UNKNOWN_KEY',
    });
  });

  it('rejeita produto incompatível', () => {
    const payload = payloadWith({ productId: 'OUTRO_PRODUTO' });

    expect(validateLicenseDocument(signedEnvelope(payload), options)).toMatchObject({
      valid: false,
      status: 'PRODUCT_MISMATCH',
    });
  });

  it('rejeita licença com início no futuro', () => {
    const payload = payloadWith({ issuedAt: iso(60 * 60 * 1000), notBefore: iso(60 * 60 * 1000) });

    expect(validateLicenseDocument(signedEnvelope(payload), options)).toMatchObject({
      valid: false,
      status: 'NOT_YET_VALID',
    });
  });

  it('aceita pequena diferença de relógio dentro da tolerância', () => {
    const payload = payloadWith({ notBefore: iso(CLOCK_TOLERANCE_MS - 1000) });

    expect(validateLicenseDocument(signedEnvelope(payload), options).valid).toBe(true);
  });

  it('rejeita licença expirada', () => {
    const payload = payloadWith({ expiresAt: iso(-1000) });

    expect(validateLicenseDocument(signedEnvelope(payload), options)).toMatchObject({
      valid: false,
      status: 'EXPIRED',
    });
  });

  it('rejeita licença vinculada a outra instalação', () => {
    expect(
      validateLicenseDocument(signedEnvelope(), { ...options, currentInstallationId: 'outra-instalacao' })
    ).toMatchObject({ valid: false, status: 'INSTALLATION_MISMATCH' });
  });

  it('rejeita módulos duplicados ou desconhecidos mesmo com assinatura válida', () => {
    const duplicados = payloadWith({
      modules: [
        { key: 'vendas', enabled: true },
        { key: 'vendas', enabled: true },
      ],
    });
    const desconhecidos = payloadWith({ modules: [{ key: 'modulo-inexistente', enabled: true }] });

    expect(validateLicenseDocument(signedEnvelope(duplicados), options)).toMatchObject({
      valid: false,
      status: 'INVALID_FORMAT',
    });
    expect(validateLicenseDocument(signedEnvelope(desconhecidos), options)).toMatchObject({
      valid: false,
      status: 'INVALID_FORMAT',
    });
  });

  it('rejeita envelope malformado e payload sem keyId', () => {
    expect(validateLicenseDocument({ payload: basePayload }, options)).toMatchObject({
      valid: false,
      status: 'INVALID_FORMAT',
    });
    const semKeyId = payloadWith({ keyId: undefined });
    expect(validateLicenseDocument(signedEnvelope(semKeyId), options)).toMatchObject({
      valid: false,
      status: 'INVALID_FORMAT',
    });
  });
});
