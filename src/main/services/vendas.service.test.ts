/**
 * @file vendas.service.test.ts
 * @description Testes unitários para VendasService: origens, séries atómicas, movimentações e modelo de impressão.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VendasService } from './vendas.service';
import { BusinessRuleError } from '../utils/errors';

describe('VendasService', () => {
  let mockPrisma: any;
  let mockArmazemService: any;
  let mockStockService: any;
  let mockDocNumeroService: any;
  let service: VendasService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817', pais: 'AO', moedaBase: 'AOA' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817', pais: 'AO', moedaBase: 'AOA' }),
      },
      faturaVenda: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
      },
      guiaEntrega: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      proformaVenda: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      cliente: {
        findUnique: vi.fn(),
      },
      contaBancaria: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      armazem: {
        findUnique: vi.fn(),
      },
      artigo: {
        findUnique: vi.fn(),
      },
      movimentoStock: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockArmazemService = {
      getDefaultVendasArmazem: vi.fn().mockResolvedValue({
        id: 'arm-02-id',
        codigo: 'ARM-02',
        designacao: 'Vendas',
        isDefaultVendas: true,
      }),
    };

    mockStockService = {
      getStockArtigoArmazem: vi.fn().mockResolvedValue(50),
    };

    mockDocNumeroService = {
      reservarNumero: vi.fn().mockResolvedValue('FT 2026/0001'),
    };

    const integracao = {
      contabilizarFaturaVenda: vi.fn().mockResolvedValue({ sucesso: true, pendente: false, mensagem: 'ok' }),
      estornarFaturaVenda: vi.fn().mockResolvedValue({ sucesso: true, pendente: false, mensagem: 'ok' }),
    };

    service = new VendasService(
      mockPrisma,
      mockArmazemService,
      mockStockService,
      mockDocNumeroService,
      integracao as any
    );
  });

  describe('emitirFatura', () => {
    const validClient = {
      id: 'cli-1',
      nome: 'Empresa Teste Lda',
      nif: '500123456',
      endereco: 'Rua Central, 10',
      cidade: 'Porto',
    };

    const validPhysicalArtigo = {
      id: 'art-1',
      codigo: 'PROD-001',
      descricao: 'Caderno A4',
      tipo: 'produto_acabado',
      unidade: 'UN',
      precoCustoMedio: 2.5,
    };

    const validServiceArtigo = {
      id: 'art-srv',
      codigo: 'SRV-001',
      descricao: 'Consultoria Técnica',
      tipo: 'servico',
      unidade: 'UN',
      precoCustoMedio: 0,
    };

    it('deve emitir fatura e dar baixa de stock no Armazém 02 (Vendas) por padrão', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(validClient);
      mockPrisma.armazem.findUnique.mockResolvedValue({
        id: 'arm-02-id',
        codigo: 'ARM-02',
        designacao: 'Vendas',
      });
      mockPrisma.artigo.findUnique.mockResolvedValue(validPhysicalArtigo);
      mockStockService.getStockArtigoArmazem.mockResolvedValue(20);

      mockPrisma.faturaVenda.create.mockResolvedValue({
        id: 'fat-1',
        numero: 'FT 2026/0001',
        totalLiquido: 12.3,
      });

      const res = await service.emitirFatura({
        empresaId: 'emp-1',
        serie: '2026',
        tipo: 'fatura',
        clienteId: 'cli-1',
        linhas: [
          {
            artigoId: 'art-1',
            quantidade: 2,
            precoUnitario: 5.0,
            taxaIva: 23,
          },
        ],
      });

      expect(mockDocNumeroService.reservarNumero).toHaveBeenCalledWith(expect.anything(), 'FT', '2026', 'emp-1');
      expect(mockArmazemService.getDefaultVendasArmazem).toHaveBeenCalled();
      expect(mockStockService.getStockArtigoArmazem).toHaveBeenCalledWith('art-1', 'arm-02-id');
      expect(mockPrisma.faturaVenda.create).toHaveBeenCalled();
      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'saida',
            artigoId: 'art-1',
            quantidade: 2,
            armazemOrigemId: 'arm-02-id',
          }),
        })
      );
      expect(res.id).toBe('fat-1');
    });

    it('não deve criar saídas de stock para uma fatura derivada de guia confirmada (GR→FT)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(validClient);
      mockPrisma.guiaEntrega.findUnique.mockResolvedValue({
        id: 'gr-1',
        estado: 'confirmada',
        clienteId: 'cli-1',
      });
      mockPrisma.artigo.findUnique.mockResolvedValue(validPhysicalArtigo);

      mockPrisma.faturaVenda.create.mockResolvedValue({
        id: 'fat-gr',
        numero: 'FT 2026/0002',
      });

      await service.emitirFatura({
        empresaId: 'emp-1',
        serie: '2026',
        tipo: 'fatura',
        clienteId: 'cli-1',
        guiaEntregaOrigemId: 'gr-1',
        linhas: [
          {
            artigoId: 'art-1',
            quantidade: 5,
            precoUnitario: 10,
            taxaIva: 14,
          },
        ],
      });

      expect(mockPrisma.movimentoStock.create).not.toHaveBeenCalled();
      expect(mockPrisma.guiaEntrega.update).toHaveBeenCalledWith({
        where: { id: 'gr-1' },
        data: { estado: 'faturada' },
      });
    });

    it('não deve gerar movimento de stock para nota de crédito (NC)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(validClient);
      mockPrisma.faturaVenda.findUnique.mockResolvedValue({
        id: 'ft-origem-1',
        numero: 'FT 2026/0001',
        estadoDocumento: 'emitido',
      });
      mockPrisma.artigo.findUnique.mockResolvedValue(validPhysicalArtigo);
      mockDocNumeroService.reservarNumero.mockResolvedValue('NC 2026/0001');

      mockPrisma.faturaVenda.create.mockResolvedValue({
        id: 'nc-1',
        numero: 'NC 2026/0001',
      });

      await service.emitirFatura({
        empresaId: 'emp-1',
        serie: '2026',
        tipo: 'nota_credito',
        clienteId: 'cli-1',
        faturaOrigemId: 'ft-origem-1',
        motivoNotaCredito: 'Retificação de quantidade',
        linhas: [
          {
            artigoId: 'art-1',
            quantidade: 1,
            precoUnitario: 10,
            taxaIva: 14,
          },
        ],
      });

      expect(mockDocNumeroService.reservarNumero).toHaveBeenCalledWith(expect.anything(), 'NC', '2026', 'emp-1');
      expect(mockPrisma.movimentoStock.create).not.toHaveBeenCalled();
    });

    it('deve bloquear a venda se o stock no armazém de vendas for insuficiente (RN06.1)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(validClient);
      mockPrisma.armazem.findUnique.mockResolvedValue({
        id: 'arm-02-id',
        codigo: 'ARM-02',
        designacao: 'Vendas',
      });
      mockPrisma.artigo.findUnique.mockResolvedValue(validPhysicalArtigo);
      mockStockService.getStockArtigoArmazem.mockResolvedValue(3);

      await expect(
        service.emitirFatura({
          empresaId: 'emp-1',
          serie: '2026',
          tipo: 'fatura',
          clienteId: 'cli-1',
          linhas: [
            {
              artigoId: 'art-1',
              quantidade: 10,
              precoUnitario: 5,
              taxaIva: 23,
            },
          ],
        })
      ).rejects.toThrow(BusinessRuleError);

      expect(mockPrisma.faturaVenda.create).not.toHaveBeenCalled();
      expect(mockPrisma.movimentoStock.create).not.toHaveBeenCalled();
    });

    it('não deve gerar movimento de saída para artigos do tipo serviço (RN01.2)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(validClient);
      mockPrisma.armazem.findUnique.mockResolvedValue({
        id: 'arm-02-id',
        codigo: 'ARM-02',
        designacao: 'Vendas',
      });
      mockPrisma.artigo.findUnique.mockResolvedValue(validServiceArtigo);

      mockPrisma.faturaVenda.create.mockResolvedValue({
        id: 'fat-srv',
        numero: 'FT 2026/0003',
      });

      await service.emitirFatura({
        empresaId: 'emp-1',
        serie: '2026',
        tipo: 'fatura',
        clienteId: 'cli-1',
        linhas: [
          {
            artigoId: 'art-srv',
            quantidade: 1,
            precoUnitario: 100,
            taxaIva: 23,
          },
        ],
      });

      expect(mockStockService.getStockArtigoArmazem).not.toHaveBeenCalled();
      expect(mockPrisma.faturaVenda.create).toHaveBeenCalled();
      expect(mockPrisma.movimentoStock.create).not.toHaveBeenCalled();
    });

    it('deve exigir motivo de isenção caso a taxa de IVA seja 0% (RN03.3)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(validClient);

      await expect(
        service.emitirFatura({
          empresaId: 'emp-1',
          serie: '2026',
          tipo: 'fatura',
          clienteId: 'cli-1',
          linhas: [
            {
              artigoId: 'art-1',
              quantidade: 1,
              precoUnitario: 50,
              taxaIva: 0,
            },
          ],
        })
      ).rejects.toThrow();
    });
  });

  describe('anularFatura', () => {
    it('deve anular uma fatura válida sem recibos imputados', async () => {
      mockPrisma.faturaVenda.findUnique.mockResolvedValue({
        id: 'fat-1',
        numero: 'FT 2026/0001',
        estadoDocumento: 'emitido',
        imputacoesRecibo: [],
        linhas: [],
      });
      mockPrisma.faturaVenda.update.mockResolvedValue({
        id: 'fat-1',
        estadoDocumento: 'anulado',
        motivoAnulacao: 'Erro de preenchimento',
      });

      const res = await service.anularFatura('fat-1', 'Erro de preenchimento');
      expect(res.estadoDocumento).toBe('anulado');
      expect(mockPrisma.faturaVenda.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fat-1' },
          data: expect.objectContaining({
            estadoDocumento: 'anulado',
            motivoAnulacao: 'Erro de preenchimento',
          }),
        })
      );
    });

    it('deve rejeitar anulação se fatura possuir recibos imputados', async () => {
      mockPrisma.faturaVenda.findUnique.mockResolvedValue({
        id: 'fat-1',
        numero: 'FT 2026/0001',
        estadoDocumento: 'emitido',
        imputacoesRecibo: [{ id: 'imp-1' }],
        linhas: [],
      });

      await expect(service.anularFatura('fat-1', 'Erro')).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('getDocumentoImprimivel', () => {
    it('deve retornar modelo de impressão com totais e QR AGT para empresa AO', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        {
          nomeBanco: 'BAI',
          designacao: 'Conta corrente principal',
          iban: 'AO06004000001234567890123',
          swiftBic: 'BAIXAO21',
        },
      ]);
      mockPrisma.faturaVenda.findUnique.mockResolvedValue({
        id: 'fat-1',
        empresaId: 'emp-1',
        numero: 'FT 2026/0001',
        serie: '2026',
        tipo: 'fatura',
        estadoDocumento: 'emitido',
        dataEmissao: new Date('2026-09-23'),
        dataVencimento: new Date('2026-10-23'),
        clienteNome: 'Cliente Teste',
        clienteNif: '999999999',
        clienteEndereco: 'Luanda',
        totalIliquido: 100,
        totalIva: 14,
        totalLiquido: 114,
        empresa: {
          id: 'emp-1',
          nome: 'Dora ERP Lda',
          nif: '5417188817',
          endereco: 'Luanda, Angola',
          pais: 'AO',
          moedaBase: 'AOA',
          logotipoUrl: 'https://exemplo.ao/logo.png',
        },
        linhas: [
          {
            artigoId: 'art-1',
            artigoCodigo: 'PROD-1',
            artigoDescricao: 'Item 1',
            artigoUnidade: 'UN',
            quantidade: 1,
            precoUnitario: 100,
            desconto: 0,
            taxaIva: 14,
            totalLinha: 114,
          },
        ],
        imputacoesRecibo: [],
      });

      const printDto = await service.getDocumentoImprimivel('fat-1');
      expect(printDto.tipoDocumento).toBe('FT');
      expect(printDto.emissor.logotipoUrl).toBe('https://exemplo.ao/logo.png');
      // Os dados bancários vêm da `ContaBancaria`, não de `dadosBancarios`.
      expect(printDto.contasBancarias).toHaveLength(1);
      expect(printDto.contasBancarias![0].banco).toBe('BAI');
      expect(printDto.contasBancarias![0].iban).toBe('AO06004000001234567890123');
      expect(mockPrisma.contaBancaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ empresaId: 'emp-1', ativo: true }),
        })
      );
      expect(printDto.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('deve imprimir só a conta liquidada quando é fatura-recibo', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({
        nomeBanco: 'BFA',
        designacao: 'Conta BFA',
        iban: 'AO06005500001234567890124',
        swiftBic: 'BFAZAO21',
      });
      mockPrisma.faturaVenda.findUnique.mockResolvedValue({
        id: 'fat-fr',
        empresaId: 'emp-1',
        contaBancariaId: 'cb-bfa',
        numero: 'FR 2026/0001',
        serie: '2026',
        tipo: 'fatura_recibo',
        estadoDocumento: 'emitido',
        dataEmissao: new Date('2026-09-23'),
        dataVencimento: new Date('2026-09-23'),
        clienteNome: 'Cliente Teste',
        clienteNif: '999999999',
        clienteEndereco: 'Luanda',
        totalIliquido: 100,
        totalIva: 14,
        totalLiquido: 114,
        empresa: {
          id: 'emp-1',
          nome: 'Dora ERP Lda',
          nif: '5417188817',
          endereco: 'Luanda, Angola',
          pais: 'AO',
          moedaBase: 'AOA',
        },
        linhas: [],
        imputacoesRecibo: [],
      });

      const printDto = await service.getDocumentoImprimivel('fat-fr');
      expect(printDto.contasBancarias).toHaveLength(1);
      expect(printDto.contasBancarias![0].banco).toBe('BFA');
      expect(mockPrisma.contaBancaria.findMany).not.toHaveBeenCalled();
    });
  });
});
