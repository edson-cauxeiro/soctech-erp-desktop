import { Prisma, TipoSerieDocumento } from '@prisma/client';
import { BusinessRuleError } from '../utils/errors';

const prefixes: Record<TipoSerieDocumento, string> = {
  FT: 'FT',
  FR: 'FR',
  NC: 'NC',
  ND: 'ND',
  FP: 'FP',
  GR: 'GR',
  RC: 'RC',
  TS: 'TS',
  SC: 'SC',
};

export class DocumentoNumeroService {
  async reservarNumero(
    tx: Prisma.TransactionClient,
    tipo: TipoSerieDocumento,
    serie: string,
    empresaId: string,
  ): Promise<string> {
    const updated = await tx.serieDocumento.updateMany({
      where: { empresaId, codigo: serie, tipoDocumento: tipo, estado: 'ativo' },
      data: { ultimoLancamento: { increment: 1 } },
    });

    if (updated.count !== 1) {
      throw new BusinessRuleError(`Série ativa '${serie}' para ${tipo} não encontrada.`);
    }

    const reserved = await tx.serieDocumento.findFirstOrThrow({
      where: { empresaId, codigo: serie, tipoDocumento: tipo, estado: 'ativo' },
      select: { ultimoLancamento: true },
    });

    return `${prefixes[tipo]} ${serie}/${String(reserved.ultimoLancamento).padStart(4, '0')}`;
  }
}

export const documentoNumeroService = new DocumentoNumeroService();
