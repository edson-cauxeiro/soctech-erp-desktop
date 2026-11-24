import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReciboService } from './recibo.service';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

describe('ReciboService', () => {
  let mockPrisma: any;
  let mockDocNumeroService: any;
  let service: ReciboService;

  const contaBanco = { id: 'c-banco', codigo: 'BANC-01', designacao: 'Banco', tipo: 'banco', ativo: true, empresaId: 'emp-1' };
  const contaCaixa = { id: 'c-caixa', codigo: 'CAIXA', designacao: 'Caixa', tipo: 'caixa', ativo: true, empresaId: 'emp-1' };

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'Dora Lda', nif: '5417188817' }),
      },
      cliente: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cli-1', nome: 'Cliente 1', nif: '123456789' }),
      },
      contaBancaria: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'c-caixa') return Promise.resolve(contaCaixa);
          if (where.id === 'c-banco-inactiva') return Promise.resolve({ ...contaBanco, ativo: false });
          if (where.id === 'c-banco-emp2') {
            return Promise.resolve({ ...contaBanco, id: 'c-banco-emp2', empresaId: 'emp-2' });
          }
          return Promise.resolve(contaBanco);
        }),
      },
      sessaoCaixa: {
        findFirst: vi.fn().mockResolvedValue({ id: 's-1' }),
      },
      faturaVenda: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      reciboVenda: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      imputacaoRecibo: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      movimentoTesouraria: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'm-1' }),
        update: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockDocNumeroService = {
      reservarNumero: vi
        .fn()
        .mockImplementation((_tx, tipo) =>
          Promise.resolve(tipo === 'TS' ? 'TS TES/0001' : 'RC 2026/0001')
        ),
    };

    const integracao = {
      contabilizarReciboVenda: vi.fn().mockResolvedValue({ sucesso: true, pendente: false, mensagem: 'ok' }),
    };

    service = new ReciboService(mockPrisma, mockDocNumeroService, integracao as any);
  });

  it('cria recibo de adiantamento sem imputações', async () => {
    mockPrisma.reciboVenda.create.mockResolvedValue({
      id: 'rc-1',
      numero: 'RC 2026/0001',
      valorRecebido: 500,
    });

    const res = await service.criar({
      empresaId: 'emp-1',
      serie: '2026',
      clienteId: 'cli-1',
      meioPagamento: 'transferencia',
      valorRecebido: 500,
      contaBancariaId: 'c-banco',
    });

    expect(res.id).toBe('rc-1');
    expect(mockDocNumeroService.reservarNumero).toHaveBeenCalledWith(expect.anything(), 'RC', '2026', 'emp-1');
  });

  it('cria recibo com imputação e reconcilia estado da fatura para pago', async () => {
    mockPrisma.faturaVenda.findUnique
      .mockResolvedValueOnce({
        id: 'ft-1',
        numero: 'FT 2026/0001',
        clienteId: 'cli-1',
        estadoDocumento: 'emitido',
        totalLiquido: 100,
        imputacoesRecibo: [],
      })
      .mockResolvedValueOnce({
        id: 'ft-1',
        numero: 'FT 2026/0001',
        clienteId: 'cli-1',
        estadoDocumento: 'emitido',
        totalLiquido: 100,
        imputacoesRecibo: [{ valorImputado: 100 }],
      });

    mockPrisma.reciboVenda.create.mockResolvedValue({
      id: 'rc-1',
      numero: 'RC 2026/0001',
      valorRecebido: 100,
    });

    await service.criar({
      empresaId: 'emp-1',
      serie: '2026',
      clienteId: 'cli-1',
      meioPagamento: 'numerario',
      valorRecebido: 100,
      contaBancariaId: 'c-banco',
      imputacoes: [{ faturaId: 'ft-1', valorImputado: 100 }],
    });

    expect(mockPrisma.faturaVenda.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ft-1' },
        data: { estadoPagamento: 'pago' },
      })
    );
  });

  it('rejeita recibo se total imputado for superior ao valor recebido', async () => {
    await expect(
      service.criar({
        empresaId: 'emp-1',
        serie: '2026',
        clienteId: 'cli-1',
        meioPagamento: 'numerario',
        valorRecebido: 50,
        contaBancariaId: 'c-banco',
        imputacoes: [{ faturaId: 'ft-1', valorImputado: 100 }],
      })
    ).rejects.toThrow(BusinessRuleError);
  });

  describe('integração com a tesouraria', () => {
    it('exige uma conta bancária', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          serie: '2026',
          clienteId: 'cli-1',
          meioPagamento: 'transferencia',
          valorRecebido: 100,
        })
      ).rejects.toThrow();
    });

    it('cria o crédito na tesouraria na mesma transação', async () => {
      mockPrisma.reciboVenda.create.mockResolvedValue({
        id: 'rc-1',
        numero: 'RC 2026/0001',
        valorRecebido: 750,
      });

      await service.criar({
        empresaId: 'emp-1',
        serie: '2026',
        clienteId: 'cli-1',
        meioPagamento: 'transferencia',
        valorRecebido: 750,
        contaBancariaId: 'c-banco',
      });

      expect(mockPrisma.movimentoTesouraria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'entrada',
            contaOrigemId: null,
            contaDestinoId: 'c-banco',
            documentoTipo: 'recibo_venda',
            documentoId: 'rc-1',
            valor: 750,
          }),
        })
      );
    });

    it('rejeita numerário na caixa sem sessão aberta', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue(null);

      await expect(
        service.criar({
          empresaId: 'emp-1',
          serie: '2026',
          clienteId: 'cli-1',
          meioPagamento: 'numerario',
          valorRecebido: 100,
          contaBancariaId: 'c-caixa',
        })
      ).rejects.toThrow(/não tem sessão aberta/);
    });

    it('rejeita uma conta inactiva', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          serie: '2026',
          clienteId: 'cli-1',
          meioPagamento: 'transferencia',
          valorRecebido: 100,
          contaBancariaId: 'c-banco-inactiva',
        })
      ).rejects.toThrow(/inactiva/);
    });

    it('rejeita uma conta de outra empresa', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          serie: '2026',
          clienteId: 'cli-1',
          meioPagamento: 'transferencia',
          valorRecebido: 100,
          contaBancariaId: 'c-banco-emp2',
        })
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(mockPrisma.movimentoTesouraria.create).not.toHaveBeenCalled();
    });

    it('anular um recibo estorna o crédito na tesouraria', async () => {
      mockPrisma.reciboVenda.findUnique.mockResolvedValue({
        id: 'rc-1',
        numero: 'RC 2026/0001',
        empresaId: 'emp-1',
        valorRecebido: 750,
        estadoDocumento: 'emitido',
        imputacoes: [],
      });
      mockPrisma.movimentoTesouraria.findFirst.mockResolvedValue({
        id: 'm-1',
        numero: 'TS TES/0001',
        valor: 750,
        contaDestinoId: 'c-banco',
        sessaoCaixaId: null,
      });

      await service.anular('rc-1', 'Cliente desistiu');

      expect(mockPrisma.movimentoTesouraria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'saida',
            contaOrigemId: 'c-banco',
            valor: 750,
            movimentoEstornoId: 'm-1',
          }),
        })
      );
      expect(mockPrisma.movimentoTesouraria.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { estado: 'estornado', conciliado: false, dataConciliacao: null },
      });
    });

    it('anular sem movimento de tesouraria não falha', async () => {
      mockPrisma.reciboVenda.findUnique.mockResolvedValue({
        id: 'rc-1',
        numero: 'RC 2026/0001',
        empresaId: 'emp-1',
        valorRecebido: 750,
        estadoDocumento: 'emitido',
        imputacoes: [],
      });
      mockPrisma.movimentoTesouraria.findFirst.mockResolvedValue(null);

      await service.anular('rc-1', 'Erro de emissão');

      expect(mockPrisma.movimentoTesouraria.create).not.toHaveBeenCalled();
      expect(mockPrisma.reciboVenda.update).toHaveBeenCalled();
    });
  });
});
