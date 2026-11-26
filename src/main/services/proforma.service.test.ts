import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProformaService } from './proforma.service';

describe('ProformaService', () => {
  let mockPrisma: any;
  let mockDocNumeroService: any;
  let mockVendasService: any;
  let mockGuiaService: any;
  let service: ProformaService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817', moedaBase: 'AOA' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817', moedaBase: 'AOA' }),
      },
      cliente: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cli-1', nome: 'Cliente 1', nif: '123456789' }),
      },
      artigo: {
        findUnique: vi.fn().mockResolvedValue({ id: 'art-1', codigo: 'A1', descricao: 'Item 1', unidade: 'UN', tipo: 'produto_acabado' }),
      },
      proformaVenda: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      contaBancaria: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockDocNumeroService = {
      reservarNumero: vi.fn().mockResolvedValue('FP 2026/0001'),
    };

    mockVendasService = {
      emitirFatura: vi.fn().mockResolvedValue({ id: 'ft-1', numero: 'FT 2026/0001' }),
    };

    mockGuiaService = {
      criar: vi.fn().mockResolvedValue({ id: 'gr-1', numero: 'GR 2026/0001' }),
    };

    service = new ProformaService(mockPrisma, mockDocNumeroService, mockVendasService, mockGuiaService);
  });

  it('cria uma proforma em rascunho com cálculos sem tocar em stock', async () => {
    mockPrisma.proformaVenda.create.mockResolvedValue({
      id: 'fp-1',
      numero: 'FP 2026/0001',
      estado: 'rascunho',
      totalLiquido: 114,
    });

    const res = await service.criar({
      empresaId: 'emp-1',
      serie: '2026',
      clienteId: 'cli-1',
      linhas: [
        {
          artigoId: 'art-1',
          quantidade: 1,
          precoUnitario: 100,
          taxaIva: 14,
        },
      ],
    });

    expect(res.id).toBe('fp-1');
    expect(mockDocNumeroService.reservarNumero).toHaveBeenCalledWith(expect.anything(), 'FP', '2026', 'emp-1');
  });

  it('inclui aviso de alteração de preços no documento imprimível', async () => {
    mockPrisma.proformaVenda.findUnique.mockResolvedValue({
      id: 'fp-1',
      numero: 'FP 2026/0001',
      serie: '2026',
      dataEmissao: new Date('2026-11-26'),
      dataValidade: new Date('2026-12-31'),
      estado: 'emitida',
      empresaId: 'emp-1',
      clienteNome: 'Cliente 1',
      clienteNif: '123456789',
      clienteEndereco: 'Rua A',
      cliente: { pais: null },
      linhas: [
        {
          artigoId: 'art-1',
          quantidade: 1,
          precoUnitario: 100,
          taxaIva: 14,
        },
      ],
    });

    const doc = await service.getDocumentoImprimivel('fp-1');

    expect(doc.observacoes).toContain('Válida até:');
    expect(doc.observacoes).toContain(
      'Os Preços dos Artigos Poderá Sofrer Alterações Conforme o Cambio do Dia.!'
    );
  });

  it('converte proforma emitida em fatura delegando para VendasService', async () => {
    mockPrisma.proformaVenda.findUnique.mockResolvedValue({
      id: 'fp-1',
      numero: 'FP 2026/0001',
      empresaId: 'emp-1',
      clienteId: 'cli-1',
      estado: 'emitida',
      linhas: [
        {
          artigoId: 'art-1',
          quantidade: 1,
          precoUnitario: 100,
          desconto: 0,
          taxaIva: 14,
        },
      ],
    });

    await service.converterParaFatura('fp-1', { serie: '2026' });

    expect(mockVendasService.emitirFatura).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'emp-1',
        serie: '2026',
        proformaOrigemId: 'fp-1',
      })
    );
  });
});
