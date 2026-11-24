import { describe, expect, it } from 'vitest';
import { buildAgtVerificationUrl, generateAgtQrDataUrl } from './agt-qr';

describe('AGT QR', () => {
  it('encodes a valid issuer NIF and document number in the AGT URL', () => {
    expect(buildAgtVerificationUrl('5417188817', 'FT 2026/0001')).toBe(
      'https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=5417188817&document=FT+2026%2F0001'
    );
  });

  it('rejects blank fiscal identifiers', () => {
    expect(() => buildAgtVerificationUrl('', 'FT 2026/0001')).toThrow('NIF');
  });

  it('returns a PNG data URL when content needs QR version fallback', async () => {
    await expect(generateAgtQrDataUrl(`https://example.test/${'x'.repeat(200)}`)).resolves.toMatch(/^data:image\/png;base64,/);
  });
});
