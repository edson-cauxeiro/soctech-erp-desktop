/**
 * @file compras.service.test.ts
 * @description Testes unitários para ComprasService (RF05 & RN05.1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComprasService } from './compras.service';

describe('ComprasService', () => {
  let mockPrisma: any;
  let mockArmazemService: any;
  let mockStockService: any;
  let mockMovimentoStockService: any;
  let service: ComprasService;

  beforeEach(() => {
    mockPrisma = {
      encomendaCompra: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      linhaEncomendaCompra: {
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      guiaRecepcao: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      faturaCompra: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      fornecedor: {
        findUnique: vi.fn(),
      },
      armazem: {
        findUnique: vi.fn(),
      },
      artigo: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      movimentoStock: {
        create: vi.fn(),
      },
      lote: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'lote-1' }),
        update: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockArmazemService = {
      getDefaultComprasArmazem: vi.fn().mockResolvedValue({ id: 'arm-geral', codigo: 'ARM-01', designacao: 'Geral' }),
      getDefaultVendasArmazem: vi.fn().mockResolvedValue({ id: 'arm-vendas', codigo: 'ARM-02', designacao: 'Vendas' }),
    };

    mockStockService = {
      getStockTotalArtigo: vi.fn().mockResolvedValue(0),
    };

    mockMovimentoStockService = {
      createMovimentoInTransaction: vi.fn().mockResolvedValue({ id: 'mov-1' }),
    };

    const integracao = {
      contabilizarFaturaCompra: vi.fn().mockResolvedValue({ sucesso: true, pendente: false, mensagem: 'ok' }),
    };

    service = new ComprasService(
      mockPrisma,
      mockArmazemService,
      mockStockService,
      mockMovimentoStockService,
      integracao as any
    );
  });

  describe('createEncomenda', () => {
    it('deve criar uma encomenda de compra calculando totais de IVA e líquido', async () => {
      mockPrisma.fornecedor.findUnique.mockResolvedValue({
        id: 'forn-1',
        nome: 'Fornecedor Exemplo, Lda.',
      });

      mockPrisma.encomendaCompra.create.mockResolvedValue({
        id: 'enc-1',
        numero: 'EC-2026/0001',
        totalIliquido: 100,
        totalIva: 23,
        totalLiquido: 123,
      });

      const res = await service.createEncomenda({
        fornecedorId: 'forn-1',
        data: new Date(),
        linhas: [
          {
            artigoId: 'art-1',
            quantidade: 10,
            precoAcordado: 10,
            taxaIva: 23,
          },
        ],
      });

      expect(res.id).toBe('enc-1');
      expect(mockPrisma.encomendaCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalIliquido: 100,
            totalIva: 23,
            totalLiquido: 123,
          }),
        })
      );
    });
  });

  describe('createGuiaRecepcao & Entrada Física de Stock (RN05.1)', () => {
    it('deve criar a guia e dar entrada física no Armazém Geral por defeito', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({
        id: 'arm-geral',
        codigo: 'ARM-01',
        designacao: 'Geral',
      });

      mockPrisma.artigo.findMany.mockResolvedValue([
        {
          id: 'art-1',
          codigo: 'ART-01',
          tipo: 'produto_acabado',
          precoCustoMedio: 10,
        },
      ]);

      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-1',
        codigo: 'ART-01',
        tipo: 'produto_acabado',
        precoCustoMedio: 10,
        controloLote: false,
        classeArmazenamento: { exigeLote: false },
      });

      mockPrisma.guiaRecepcao.create.mockResolvedValue({
        id: 'guia-1',
        numero: 'GR-2026/0001',
        armazemDestinoId: 'arm-geral',
      });

      const res = await service.createGuiaRecepcao({
        fornecedorId: 'forn-1',
        armazemDestinoId: 'arm-geral',
        data: new Date(),
        linhas: [
          {
            artigoId: 'art-1',
            quantidade: 50,
            precoCusto: 12,
            lote: 'LT-2026-001',
          },
        ],
      });

      expect(res.id).toBe('guia-1');
      // Verifica se registou movimento de entrada física de stock (RN05.1)
      expect(mockMovimentoStockService.createMovimentoInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tipo: 'entrada',
          artigoId: 'art-1',
          quantidade: 50,
          armazemDestinoId: 'arm-geral',
          lote: 'LT-2026-001',
        })
      );
    });
  });
});
