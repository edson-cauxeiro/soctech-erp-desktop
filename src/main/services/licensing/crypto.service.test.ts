import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '../../../shared/licensing/canonical';
import { verifyLicenseSignature } from './crypto.service';
import type { LicensePublicKey } from './public-keys';

function createTestKey(keyId: string): {
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

function signPayload(privateKey: ReturnType<typeof createTestKey>['privateKey'], payload: unknown): string {
  return sign(null, Buffer.from(canonicalize(payload), 'utf8'), privateKey).toString('base64');
}

describe('verifyLicenseSignature', () => {
  it('aceita assinatura Ed25519 válida sobre bytes canónicos', () => {
    const key = createTestKey('test-key-1');
    const payload = { b: 2, a: { d: 4, c: 3 } };
    const signature = signPayload(key.privateKey, payload);

    expect(verifyLicenseSignature(canonicalize(payload), signature, key.entry.keyId, [key.entry])).toEqual({
      knownKey: true,
      valid: true,
    });
  });

  it('rejeita payload adulterado com assinatura original', () => {
    const key = createTestKey('test-key-2');
    const payload = { a: 1, b: 'original' };
    const signature = signPayload(key.privateKey, payload);
    const tampered = canonicalize({ b: 'alterado', a: 1 });

    expect(verifyLicenseSignature(tampered, signature, key.entry.keyId, [key.entry])).toEqual({
      knownKey: true,
      valid: false,
    });
  });

  it('identifica keyId desconhecido', () => {
    const key = createTestKey('test-key-3');
    const payload = { a: 1 };
    const signature = signPayload(key.privateKey, payload);

    expect(verifyLicenseSignature(canonicalize(payload), signature, 'outra-chave', [key.entry])).toEqual({
      knownKey: false,
      valid: false,
    });
  });

  it('não lança excepção para chave pública malformada', () => {
    const payload = { a: 1 };
    const signature = Buffer.from(canonicalize(payload)).toString('base64');

    expect(
      verifyLicenseSignature(canonicalize(payload), signature, 'chave-invalida', [
        { keyId: 'chave-invalida', publicKeyPem: 'não é um PEM' },
      ])
    ).toEqual({ knownKey: true, valid: false });
  });
});
