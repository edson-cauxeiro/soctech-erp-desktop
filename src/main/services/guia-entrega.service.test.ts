import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuiaEntregaService } from './guia-entrega.service';
import { BusinessRuleError } from '../utils/errors';

describe('GuiaEntregaService', () => {
  let mockPrisma: any;
  let mockStockService: any;
  let mockDocNumeroService: any;
  let mockMovimentoStockService: any;
  let mockVendasService: any;
  let service: GuiaEntregaService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817' }),
      },
      cliente: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cli-1', nome: 'Cliente 1', nif: '123456789' }),
      },
      armazem: {
        findUnique: vi.fn().mockResolvedValue({ id: 'arm-1', codigo: 'ARM-01', designacao: 'Geral' }),
      },
      artigo: {
        findUnique: vi.fn().mockResolvedValue({ id: 'art-1', codigo: 'A1', descricao: 'Item 1', unidade: 'UN', tipo: 'produto_acabado', controloLote: false }),
        findMany: vi.fn().mockResolvedValue([{ id: 'art-1', codigo: 'A1', descricao: 'Item 1', unidade: 'UN', tipo: 'produto_acabado', controloLote: false }]),
      },
      guiaEntrega: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      movimentoStock: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockStockService = {
      getStockArtigoArmazem: vi.fn().mockResolvedValue(20),
    };

    mockDocNumeroService = {
      reservarNumero: vi.fn().mockResolvedValue('GR 2026/0001'),
    };

    mockMovimentoStockService = {
      createMovimentoInTransaction: vi.fn().mockResolvedValue({ id: 'mov-1' }),
    };

    mockVendasService = {
      emitirFatura: vi.fn().mockResolvedValue({ id: 'ft-1', numero: 'FT 2026/0001' }),
    };

    service = new GuiaEntregaService(mockPrisma, mockStockService, mockMovimentoStockService, mockDocNumeroService, mockVendasService);
  });

  it('confirma uma guia criando uma saída de stock por linha física', async () => {
    mockPrisma.guiaEntrega.findUnique.mockResolvedValue({
      id: 'gr-1',
      numero: 'GR 2026/0001',
      estado: 'rascunho',
      armazemExpedicaoId: 'arm-1',
      linhas: [
        {
          artigoId: 'art-1',
          quantidade: 5,
          artigo: { id: 'art-1', codigo: 'A1', tipo: 'produto_acabado', controloLote: false },
        },
      ],
    });

    mockPrisma.guiaEntrega.update.mockResolvedValue({ id: 'gr-1', estado: 'confirmada' });

    await service.confirmar('gr-1');

    expect(mockMovimentoStockService.createMovimentoInTransaction).toHaveBeenCalledTimes(1);
    expect(mockMovimentoStockService.createMovimentoInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tipo: 'saida',
        documentoOrigem: 'GR 2026/0001',
        quantidade: 5,
      })
    );
  });

  it('rejeita confirmação se artigo com controlo de lote não tiver lote informado', async () => {
    mockPrisma.guiaEntrega.findUnique.mockResolvedValue({
      id: 'gr-1',
      numero: 'GR 2026/0001',
      estado: 'rascunho',
      armazemExpedicaoId: 'arm-1',
      linhas: [
        {
          artigoId: 'art-1',
          quantidade: 5,
          lote: null,
          artigo: { id: 'art-1', codigo: 'A1', tipo: 'produto_acabado', controloLote: true },
        },
      ],
    });

    await expect(service.confirmar('gr-1')).rejects.toThrow(BusinessRuleError);
  });

  it('fatura uma guia confirmada delegando para VendasService', async () => {
    mockPrisma.guiaEntrega.findUnique.mockResolvedValue({
      id: 'gr-1',
      empresaId: 'emp-1',
      clienteId: 'cli-1',
      estado: 'confirmada',
      linhas: [
        {
          artigoId: 'art-1',
          quantidade: 5,
          artigo: { id: 'art-1', precoVenda: 10, taxaIva: 14 },
        },
      ],
    });

    await service.faturar('gr-1', { serie: '2026' });

    expect(mockVendasService.emitirFatura).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'emp-1',
        serie: '2026',
        guiaEntregaOrigemId: 'gr-1',
      })
    );
  });
});
