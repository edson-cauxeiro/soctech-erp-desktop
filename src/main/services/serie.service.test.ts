import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SerieService } from './serie.service';
import { ValidationError } from '../utils/errors';

describe('SerieService', () => {
  let mockPrisma: any;
  let service: SerieService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn(),
      },
      serieDocumento: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new SerieService(mockPrisma);
  });

  it('deve listar as séries de documentos', async () => {
    mockPrisma.serieDocumento.findMany.mockResolvedValue([
      { id: 'sr-1', codigo: '2026', empresaId: 'emp-1', tipoDocumento: 'FT' },
    ]);

    const res = await service.listSeries('emp-1', 'FT');
    expect(res).toHaveLength(1);
    expect(res[0].codigo).toBe('2026');
  });

  it('deve lançar ValidationError se campos obrigatórios faltarem ao criar série', async () => {
    await expect(
      service.createSerie({
        codigo: '',
        descricao: '',
        empresaId: '',
        dataInicio: '',
        dataFim: '',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('deve criar uma nova série com lançamento inicial 0', async () => {
    mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1', nome: 'Empresa Teste' });
    mockPrisma.serieDocumento.findFirst.mockResolvedValue(null);
    mockPrisma.serieDocumento.create.mockResolvedValue({
      id: 'sr-new',
      codigo: '2026',
      descricao: 'Série Geral',
      empresaId: 'emp-1',
      tipoDocumento: 'FT',
      ultimoLancamento: 0,
      estado: 'ativo',
    });

    const res = await service.createSerie({
      codigo: '2026',
      descricao: 'Série Geral',
      empresaId: 'emp-1',
      tipoDocumento: 'FT',
      modulos: ['vendas', 'financas'],
      dataInicio: '2026-01-01',
      dataFim: '2026-12-31',
    });

    expect(res.id).toBe('sr-new');
    expect(res.ultimoLancamento).toBe(0);
    expect(mockPrisma.serieDocumento.create).toHaveBeenCalled();
  });

  it('não deve permitir eliminar série se já houver lançamentos', async () => {
    mockPrisma.serieDocumento.findUnique.mockResolvedValue({
      id: 'sr-1',
      codigo: '2026',
      ultimoLancamento: 5,
    });

    await expect(service.deleteSerie('sr-1')).rejects.toThrow(ValidationError);
  });
});
