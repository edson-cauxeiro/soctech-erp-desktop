import QRCode from 'qrcode';
import { ValidationError } from './errors';

const AGT_BASE_URL = 'https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe';

export function buildAgtVerificationUrl(nifEmissor: string, numeroDocumento: string): string {
  if (!nifEmissor || nifEmissor.trim() === '') {
    throw new ValidationError('NIF do emissor é obrigatório para gerar o URL de verificação AGT.');
  }
  if (!numeroDocumento || numeroDocumento.trim() === '') {
    throw new ValidationError('Número do documento é obrigatório para gerar o URL de verificação AGT.');
  }

  const params = new URLSearchParams();
  params.set('emissor', nifEmissor.trim());
  params.set('document', numeroDocumento.trim());

  return `${AGT_BASE_URL}?${params.toString()}`;
}

export async function generateAgtQrDataUrl(urlOrPayload: string): Promise<string> {
  if (!urlOrPayload || urlOrPayload.trim() === '') {
    throw new ValidationError('Conteúdo do QR Code não pode ser vazio.');
  }

  try {
    return await QRCode.toDataURL(urlOrPayload, {
      width: 350,
      margin: 2,
      errorCorrectionLevel: 'M',
      version: 4,
    });
  } catch {
    // Fallback sem versão fixa caso o conteúdo exceda a versão 4
    return await QRCode.toDataURL(urlOrPayload, {
      width: 350,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }
}
