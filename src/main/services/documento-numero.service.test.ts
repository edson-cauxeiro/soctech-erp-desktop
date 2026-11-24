import { describe, expect, it, vi } from 'vitest';
import { DocumentoNumeroService } from './documento-numero.service';

describe('DocumentoNumeroService', () => {
  it('increments the configured FT series atomically and formats its readable number', async () => {
    const tx = {
      serieDocumento: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ codigo: '2026', ultimoLancamento: 7 }),
      },
    } as any;

    await expect(new DocumentoNumeroService().reservarNumero(tx, 'FT', '2026', 'emp-1'))
      .resolves.toBe('FT 2026/0007');
    expect(tx.serieDocumento.updateMany).toHaveBeenCalledWith({
      where: { empresaId: 'emp-1', codigo: '2026', tipoDocumento: 'FT', estado: 'ativo' },
      data: { ultimoLancamento: { increment: 1 } },
    });
  });

  it('rejects an unavailable or inactive series', async () => {
    const tx = { serieDocumento: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } } as any;
    await expect(new DocumentoNumeroService().reservarNumero(tx, 'GR', '2026', 'emp-1'))
      .rejects.toThrow('Série ativa');
  });
});
