import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliacaoContabilService } from './reconciliacao-contabil.service';
import { BusinessRuleError } from '../utils/errors';

describe('ReconciliacaoContabilService', () => {
  let mockPrisma: any;
  let service: ReconciliacaoContabilService;

  beforeEach(() => {
    mockPrisma = {
      contaBancaria: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      movimentoTesouraria: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      linhaLancamentoContabil: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        aggregate: vi.fn(),
      },
      lancamentoContabil: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      contaContabil: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      diarioContabil: {
        findFirst: vi.fn(),
      },
      periodoContabil: {
        findFirst: vi.fn(),
      },
      exercicioFiscal: {
        findUnique: vi.fn(),
      },
      mapeamentoConta: {
        findFirst: vi.fn(),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    };
    service = new ReconciliacaoContabilService(mockPrisma);
  });

  describe('listarContasBancariasParaReconciliar', () => {
    it('devolve todas as contas activas, incluindo as sem conta contabilística', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        { id: 'cb-1', codigo: 'BC', designacao: 'Banco', tipo: 'banco', saldoAtual: 1000, contaContabilId: 'cc-1', contaContabil: { id: 'cc-1', codigo: '411', designacao: 'Banco', natureza: 'devedora' } },
        { id: 'cb-2', codigo: 'CX', designacao: 'Caixa', tipo: 'caixa', saldoAtual: 500, contaContabilId: null, contaContabil: null },
      ]);
      const res = await service.listarContasBancariasParaReconciliar('emp-1');
      expect(mockPrisma.contaBancaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { empresaId: 'emp-1', ativo: true } })
      );
      expect(res).toHaveLength(2);
      expect(res[0].contaContabilId).toBe('cc-1');
      expect(res[1].contaContabilId).toBeNull();
    });
  });

  describe('obterResumo', () => {
    it('calcula saldo contabilístico e lista itens em trânsito', async () => {
      const PrismaDecimal = require('@prisma/client').Prisma.Decimal;
      mockPrisma.contaBancaria.findFirst.mockResolvedValue({
        id: 'cb-1', codigo: 'BC', designacao: 'Banco', saldoAtual: new PrismaDecimal('1000.0000'),
        contaContabilId: 'cc-1',
        contaContabil: { id: 'cc-1', codigo: '411', designacao: 'Banco', natureza: 'devedora' },
      });
      mockPrisma.linhaLancamentoContabil.aggregate.mockResolvedValue({ _sum: { debito: new PrismaDecimal('500'), credito: new PrismaDecimal('200') } });
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { id: 'mt-1', numero: 'MT001', data: new Date('2026-01-15'), tipo: 'entrada', valor: new PrismaDecimal('300.0000'), descricao: 'Recebimento', conciliado: false, dataConciliacao: null, observacaoExtrato: null, contaOrigemId: null, contaDestinoId: 'cb-1', entidadeTipo: null, entidadeId: null },
      ]);
      mockPrisma.linhaLancamentoContabil.findMany.mockResolvedValue([
        { id: 'll-1', numeroLinha: 1, debito: new PrismaDecimal('500.0000'), credito: new PrismaDecimal('0.0000'), dataContabilistica: new Date('2026-01-15'), descricao: 'Linha 1', conciliadoEm: null, movimentoTesourariaId: null, lancamento: { id: 'l-1', numero: 1, dataContabilistica: new Date('2026-01-15'), descricao: 'Lançamento 1' }, conta: { id: 'cc-1', codigo: '411', designacao: 'Banco' } },
      ]);

      const res = await service.obterResumo('cb-1', 'emp-1');

      expect(res.contaBancaria.saldoAtual).toBe('1000.0000');
      // natureza devedora: débito - crédito = 500 - 200 = 300
      expect(res.contaContabil.saldoContabilistico).toBe('300.0000');
      expect(res.itensEmTransito.soNoExtrato).toHaveLength(1);
      expect(res.itensEmTransito.soNaContabilidade).toHaveLength(1);
    });

    it('rejeita conta sem contaContabilId', async () => {
      mockPrisma.contaBancaria.findFirst.mockResolvedValue({
        id: 'cb-1', codigo: 'BC', designacao: 'Banco', saldoAtual: '1000',
        contaContabilId: null,
        contaContabil: null,
      });
      await expect(service.obterResumo('cb-1', 'emp-1')).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('sugerirPares', () => {
    it('sugere pares por valor e data', async () => {
      // Mock obterResumo internamente
      vi.spyOn(service, 'obterResumo').mockResolvedValue({
        contaBancaria: { id: 'cb-1', codigo: 'BC', designacao: 'Banco', saldoAtual: '1000.0000' },
        contaContabil: { id: 'cc-1', codigo: '411', designacao: 'Banco', saldoContabilistico: '300.0000' },
        itensEmTransito: {
          soNoExtrato: [
            { id: 'mt-1', numero: 'MT001', data: new Date('2026-01-15'), tipo: 'entrada', valor: '300.0000', descricao: 'Recebimento', conciliado: false, dataConciliacao: null, observacaoExtrato: null, contaBancariaId: 'cb-1', contaBancariaCodigo: 'BC', entidadeTipo: null, entidadeId: null },
          ],
          soNaContabilidade: [
            { id: 'll-1', lancamentoId: 'l-1', numeroLinha: 1, contaId: 'cc-1', contaCodigo: '411', contaDesignacao: 'Banco', debito: '300.0000', credito: '0.0000', dataContabilistica: new Date('2026-01-15'), descricao: 'Linha 1', conciliadoEm: null, movimentoTesourariaId: null, lancamentoNumero: 1, lancamentoDescricao: 'Lançamento 1' },
          ],
        },
        diferenca: '0.0000',
      });

      const sugestoes = await service.sugerirPares('cb-1', 'emp-1', { janelaDias: 5 });

      expect(sugestoes).toHaveLength(1);
      expect(sugestoes[0].valorExato).toBe(true);
      expect(sugestoes[0].diferencaDias).toBe(0);
    });
  });

  describe('conciliar', () => {
    it('concilia par e cria audit log', async () => {
      mockPrisma.linhaLancamentoContabil.findUnique.mockResolvedValue({
        id: 'll-1', lancamento: { empresaId: 'emp-1' }, movimentoTesourariaId: null,
        numeroLinha: 1, conta: { id: 'cc-1' },
      });
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'mt-1', empresaId: 'emp-1', conciliado: false, contaOrigemId: null, contaDestinoId: 'cb-1',
      });
      mockPrisma.contaBancaria.findFirst.mockResolvedValue({ id: 'cb-1' });
      mockPrisma.linhaLancamentoContabil.update.mockResolvedValue({});
      mockPrisma.movimentoTesouraria.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const res = await service.conciliar([{ linhaId: 'll-1', movimentoId: 'mt-1' }], 'user-1', 'emp-1');

      expect(res.conciliados).toBe(1);
      expect(mockPrisma.linhaLancamentoContabil.update).toHaveBeenCalledWith({
        where: { id: 'll-1' },
        data: { movimentoTesourariaId: 'mt-1', conciliadoEm: expect.any(Date) },
      });
      expect(mockPrisma.movimentoTesouraria.update).toHaveBeenCalledWith({
        where: { id: 'mt-1' },
        data: { conciliado: true, dataConciliacao: expect.any(Date) },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('rejeita linha já conciliada', async () => {
      mockPrisma.linhaLancamentoContabil.findUnique.mockResolvedValue({
        id: 'll-1', lancamento: { empresaId: 'emp-1' }, movimentoTesourariaId: 'mt-1',
        numeroLinha: 1, conta: { id: 'cc-1' },
      });
      await expect(service.conciliar([{ linhaId: 'll-1', movimentoId: 'mt-1' }], 'user-1', 'emp-1'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejeita movimento de outra empresa', async () => {
      mockPrisma.linhaLancamentoContabil.findUnique.mockResolvedValue({
        id: 'll-1', lancamento: { empresaId: 'emp-1' }, movimentoTesourariaId: null,
        numeroLinha: 1, conta: { id: 'cc-1' },
      });
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'mt-1', empresaId: 'emp-2', conciliado: false, contaOrigemId: null, contaDestinoId: 'cb-1',
      });
      await expect(service.conciliar([{ linhaId: 'll-1', movimentoId: 'mt-1' }], 'user-1', 'emp-1'))
        .rejects.toThrow(BusinessRuleError);
    });
  });

  describe('desconciliar', () => {
    it('remove ligação e cria audit log', async () => {
      mockPrisma.linhaLancamentoContabil.findUnique.mockResolvedValue({
        id: 'll-1', lancamento: { empresaId: 'emp-1' }, movimentoTesourariaId: 'mt-1', numeroLinha: 1,
      });
      mockPrisma.linhaLancamentoContabil.update.mockResolvedValue({});
      mockPrisma.movimentoTesouraria.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const res = await service.desconciliar(['ll-1'], 'user-1', 'emp-1');

      expect(res.desconciliados).toBe(1);
      expect(mockPrisma.linhaLancamentoContabil.update).toHaveBeenCalledWith({
        where: { id: 'll-1' },
        data: { movimentoTesourariaId: null, conciliadoEm: null },
      });
    });

    it('ignora linha já não conciliada', async () => {
      mockPrisma.linhaLancamentoContabil.findUnique.mockResolvedValue({
        id: 'll-1', lancamento: { empresaId: 'emp-1' }, movimentoTesourariaId: null, numeroLinha: 1,
      });
      const res = await service.desconciliar(['ll-1'], 'user-1', 'emp-1');
      expect(res.desconciliados).toBe(0);
    });
  });

  describe('gerarLancamentoDeMovimento', () => {
    it('cria lançamento a partir de movimento', async () => {
      mockPrisma.movimentoTesouraria.findFirst.mockResolvedValue({
        id: 'mt-1', numero: 'MT001', data: new Date('2026-01-15'), tipo: 'entrada', valor: '100.0000',
        descricao: 'Juros', contaOrigemId: null, contaDestinoId: 'cb-1', conciliado: false,
      });
      mockPrisma.contaContabil.findFirst.mockResolvedValue({
        id: 'cc-1', codigo: '722', aceitaMovimento: true,
      });
      mockPrisma.contaBancaria.findFirst.mockResolvedValue({ id: 'cb-1', codigo: 'BC' });
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({
        id: 'per-1', exercicioId: 'ex-1', estado: 'aberto', numero: 1,
      });
      mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({ estado: 'aberto', ano: '2026' });
      mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-1', codigo: 'AP' });
      mockPrisma.mapeamentoConta.findFirst.mockResolvedValue(null);
      mockPrisma.contaContabil.findFirst.mockResolvedValueOnce({ id: 'cc-1', codigo: '722', aceitaMovimento: true })
        .mockResolvedValueOnce({ id: 'cc-2', codigo: '622', aceitaMovimento: true });
      mockPrisma.lancamentoContabil.create.mockResolvedValue({ id: 'l-1' });
      mockPrisma.movimentoTesouraria.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Mock validarLancamentoCriado internamente
      const serviceWithSpy = new ReconciliacaoContabilService(mockPrisma);
      vi.spyOn(serviceWithSpy as any, 'validarLancamentoCriado').mockResolvedValue(undefined);

      const res = await serviceWithSpy.gerarLancamentoDeMovimento('mt-1', 'cc-1', 'user-1', 'emp-1');

      expect(res.lancamentoId).toBe('l-1');
      expect(mockPrisma.lancamentoContabil.create).toHaveBeenCalled();
      expect(mockPrisma.movimentoTesouraria.update).toHaveBeenCalledWith({
        where: { id: 'mt-1' },
        data: { conciliado: true, dataConciliacao: expect.any(Date) },
      });
    });

    it('rejeita movimento já conciliado', async () => {
      mockPrisma.movimentoTesouraria.findFirst.mockResolvedValue({
        id: 'mt-1', conciliado: true,
      });
      await expect(service.gerarLancamentoDeMovimento('mt-1', 'cc-1', 'user-1', 'emp-1'))
        .rejects.toThrow(BusinessRuleError);
    });
  });
});