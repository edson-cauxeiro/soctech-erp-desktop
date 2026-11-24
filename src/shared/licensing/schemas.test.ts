import { describe, it, expect } from 'vitest';
import { licenseEnvelopeSchema, licensePayloadSchema } from './schemas';

const payload = {
  schemaVersion: 1,
  licenseId: 'LIC-2026-000001',
  productId: 'ERP_DESKTOP',
  customer: { name: 'Empresa Exemplo, Lda.', taxNumber: '000000000' },
  issuedAt: '2026-11-01T10:00:00.000Z',
  notBefore: '2026-11-01T10:00:00.000Z',
  expiresAt: null,
  modules: [
    { key: 'vendas', enabled: true },
    { key: 'estoque', enabled: true },
  ],
  limits: { maxUsers: null, maxDevices: 1 },
  installation: { bindingMode: 'installation', installationId: 'inst-123' },
  keyId: 'vendor-ed25519-2026-01',
};

describe('licensePayloadSchema', () => {
  it('aceita uma licença perpétua válida', () => {
    expect(licensePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('rejeita schemaVersion desconhecido', () => {
    expect(licensePayloadSchema.safeParse({ ...payload, schemaVersion: 2 }).success).toBe(false);
  });

  it('rejeita módulos desconhecidos e duplicados', () => {
    expect(licensePayloadSchema.safeParse({ ...payload, modules: [{ key: 'SALES', enabled: true }] }).success).toBe(false);
    expect(
      licensePayloadSchema.safeParse({
        ...payload,
        modules: [
          { key: 'vendas', enabled: true },
          { key: 'vendas', enabled: false },
        ],
      }).success
    ).toBe(false);
  });

  it('rejeita datas incoerentes', () => {
    expect(licensePayloadSchema.safeParse({ ...payload, notBefore: '2026-10-31T10:00:00.000Z' }).success).toBe(false);
    expect(licensePayloadSchema.safeParse({ ...payload, expiresAt: '2026-11-01T10:00:00.000Z' }).success).toBe(false);
  });

  it('exige coerência entre bindingMode e installationId', () => {
    expect(
      licensePayloadSchema.safeParse({
        ...payload,
        installation: { bindingMode: 'installation', installationId: null },
      }).success
    ).toBe(false);
    expect(
      licensePayloadSchema.safeParse({
        ...payload,
        installation: { bindingMode: 'none', installationId: 'inst-123' },
      }).success
    ).toBe(false);
  });

  it('rejeita campos críticos desconhecidos', () => {
    expect(licensePayloadSchema.safeParse({ ...payload, CamposExtra: 'x' }).success).toBe(false);
  });
});

describe('licenseEnvelopeSchema', () => {
  it('aceita envelope com payload e assinatura base64', () => {
    expect(licenseEnvelopeSchema.safeParse({ payload, signature: 'QUJDRA==' }).success).toBe(true);
  });

  it('rejeita assinatura inválida ou campos extra', () => {
    expect(licenseEnvelopeSchema.safeParse({ payload, signature: '***' }).success).toBe(false);
    expect(licenseEnvelopeSchema.safeParse({ payload, signature: 'QUJDRA==', extra: 1 }).success).toBe(false);
  });
});
