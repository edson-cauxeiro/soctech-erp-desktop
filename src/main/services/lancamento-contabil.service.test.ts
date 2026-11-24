import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LancamentoContabilService } from './lancamento-contabil.service';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

function lancamentoBase(overrides: Record<string, unknown> = {}) {
  const PrismaDecimal = require('@prisma/client').Prisma.Decimal;
  return {
    id: 'lanc-1',
    empresaId: 'emp-1',
    diarioId: 'diario-1',
    exercicioId: 'ex-1',
    periodoId: 'per-1',
    numero: null,
    dataContabilistica: new Date('2026-01-15'),
    dataDocumento: null,
    descricao: 'Lançamento teste',
    estado: 'rascunho',
    origem: 'manual',
    moduloOrigem: null,
    tipoOrigem: null,
    origemId: null,
    execucaoFechoId: null,
    estornoDeId: null,
    moeda: 'AOA',
    taxaCambio: new PrismaDecimal('1.000000'),
    totalDebito: new PrismaDecimal('100.0000'),
    totalCredito: new PrismaDecimal('100.0000'),
    criadoPorId: 'user-1',
    validadoPorId: null,
    validadoEm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    diario: { id: 'diario-1', codigo: 'VD', designacao: 'Vendas' },
    periodo: { id: 'per-1', numero: 1, dataInicio: new Date('2026-01-01'), dataFim: new Date('2026-01-31'), estado: 'aberto' },
    exercicio: { id: 'ex-1', ano: '2026', estado: 'aberto' },
    criadoPor: { id: 'user-1', nomeCompleto: 'Utilizador Teste' },
    validadoPor: null,
    linhas: [
      {
        id: 'linha-1',
        lancamentoId: 'lanc-1',
        numeroLinha: 1,
        contaId: 'conta-1',
        debito: new PrismaDecimal('100.0000'),
        credito: new PrismaDecimal('0.0000'),
        descricao: 'Linha 1',
        centroCustoId: null,
        entidadeTipo: null,
        entidadeId: null,
        codigoImposto: null,
        baseImposto: null,
        dataVencimento: null,
        conciliadoEm: null,
        movimentoTesourariaId: null,
        conta: { id: 'conta-1', codigo: '611', designacao: 'Vendas', aceitaMovimento: true, exigeCentroCusto: false, exigeEntidade: false },
        centroCusto: null,
      },
      {
        id: 'linha-2',
        lancamentoId: 'lanc-1',
        numeroLinha: 2,
        contaId: 'conta-2',
        debito: new PrismaDecimal('0.0000'),
        credito: new PrismaDecimal('100.0000'),
        descricao: 'Linha 2',
        centroCustoId: null,
        entidadeTipo: null,
        entidadeId: null,
        codigoImposto: null,
        baseImposto: null,
        dataVencimento: null,
        conciliadoEm: null,
        movimentoTesourariaId: null,
        conta: { id: 'conta-2', codigo: '3421', designacao: 'IVA dedutível', aceitaMovimento: true, exigeCentroCusto: false, exigeEntidade: false },
        centroCusto: null,
      },
    ],
    estornoDe: null,
    estornadoPor: null,
    _count: { linhas: 2 },
    ...overrides,
  };
}

describe('LancamentoContabilService', () => {
  let mockPrisma: any;
  let service: LancamentoContabilService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: { findUnique: vi.fn() },
      diarioContabil: { findFirst: vi.fn() },
      periodoContabil: { findFirst: vi.fn() },
      contaContabil: { findMany: vi.fn() },
      centroCusto: { findMany: vi.fn() },
      sequenciaDiario: { findUnique: vi.fn() },
      lancamentoContabil: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      linhaLancamentoContabil: {
        deleteMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
      $queryRaw: vi.fn(async () => [{ ultimo_numero: 1 }]),
    };
    service = new LancamentoContabilService(mockPrisma);
  });

  describe('criar', () => {
    it('cria um lançamento em rascunho com totais calculados', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-1', activo: true, codigo: 'VD' });
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({ id: 'per-1', exercicioId: 'ex-1', estado: 'aberto' });
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'conta-1' },
        { id: 'conta-2' },
      ]);
      mockPrisma.lancamentoContabil.create.mockResolvedValue(lancamentoBase());

      const res = await service.criar({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento teste',
        linhas: [
          { contaId: 'conta-1', debito: '100', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100' },
        ],
      }, 'user-1');

      expect(res.totalDebito).toBe('100.0000');
      expect(res.totalCredito).toBe('100.0000');
      expect(res.estado).toBe('rascunho');
      expect(res.numero).toBeNull();
    });

    it('rejeita empresa inexistente', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue(null);

      await expect(service.criar({
        empresaId: 'inexistente',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '100', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100' },
        ],
      }, 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('rejeita diário inactivo', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-1', activo: false, codigo: 'VD' });

      await expect(service.criar({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '100', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100' },
        ],
      }, 'user-1')).rejects.toThrow(BusinessRuleError);
    });

    it('rejeita período fechado', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-1', activo: true, codigo: 'VD' });
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({ id: 'per-1', exercicioId: 'ex-1', estado: 'fechado' });

      await expect(
        service.criar({
          empresaId: 'emp-1',
          diarioId: 'diario-1',
          dataContabilistica: '2026-01-15',
          descricao: 'Lançamento teste',
          linhas: [
            { contaId: 'conta-1', debito: '100', credito: '0' },
            { contaId: 'conta-2', debito: '0', credito: '100' },
          ],
        }, 'user-1')
      ).rejects.toThrow(BusinessRuleError);
      expect(mockPrisma.lancamentoContabil.create).not.toHaveBeenCalled();
    });
  });

  describe('atualizar', () => {
    it('só permite alterar lançamentos em rascunho', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(
        lancamentoBase({ estado: 'validado' })
      );

      await expect(service.atualizar('lanc-1', { descricao: 'Novo' }, 'user-1'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('recalcula totais quando as linhas mudam', async () => {
      const base = lancamentoBase({ estado: 'rascunho' });
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(base);
      mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-1', activo: true, codigo: 'VD' });
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({ id: 'per-1', exercicioId: 'ex-1', estado: 'aberto' });
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'conta-3' },
        { id: 'conta-4' },
      ]);
      mockPrisma.lancamentoContabil.update.mockResolvedValue(
        lancamentoBase({
          totalDebito: new (require('@prisma/client').Prisma.Decimal)(200),
          totalCredito: new (require('@prisma/client').Prisma.Decimal)(200),
          linhas: [
            { ...base.linhas[0], debito: new (require('@prisma/client').Prisma.Decimal)(200) },
            { ...base.linhas[1], credito: new (require('@prisma/client').Prisma.Decimal)(200) },
          ],
        })
      );

      const res = await service.atualizar('lanc-1', {
        linhas: [
          { contaId: 'conta-3', debito: '200', credito: '0' },
          { contaId: 'conta-4', debito: '0', credito: '200' },
        ],
      }, 'user-1');

      expect(res.totalDebito).toBe('200.0000');
      expect(res.totalCredito).toBe('200.0000');
    });

    it('rejeita período fechado', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue({
        ...lancamentoBase(),
        dataContabilistica: new Date('2026-01-15'),
        linhas: undefined,
      });
      mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-1', activo: true, codigo: 'VD' });
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({ id: 'per-1', exercicioId: 'ex-1', estado: 'fechado' });

      await expect(
        service.atualizar('lanc-1', {
          empresaId: 'emp-1',
          diarioId: 'diario-1',
          dataContabilistica: '2026-01-15',
          descricao: 'Alteração',
        }, 'user-1')
      ).rejects.toThrow(BusinessRuleError);
      expect(mockPrisma.lancamentoContabil.update).not.toHaveBeenCalled();
    });
  });

  describe('validar', () => {
    it('rejeita lançamento desequilibrado', async () => {
      const PrismaDecimal = require('@prisma/client').Prisma.Decimal;
      const base = lancamentoBase({
        estado: 'rascunho',
        periodo: { ...lancamentoBase().periodo, estado: 'aberto' },
        exercicio: { ...lancamentoBase().exercicio, estado: 'aberto' },
        // Linhas desequilibradas: 100 débito vs 50 crédito
        linhas: [
          {
            ...lancamentoBase().linhas[0],
            debito: new PrismaDecimal('100.0000'),
            credito: new PrismaDecimal('0.0000'),
          },
          {
            ...lancamentoBase().linhas[1],
            debito: new PrismaDecimal('0.0000'),
            credito: new PrismaDecimal('50.0000'),
          },
        ],
      });
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(base);

      await expect(service.validar('lanc-1', 'user-1'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejeita período fechado', async () => {
      const base = lancamentoBase({
        periodo: { ...lancamentoBase().periodo, estado: 'fechado' },
        exercicio: { ...lancamentoBase().exercicio, estado: 'aberto' },
      });
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(base);

      await expect(service.validar('lanc-1', 'user-1'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejeita exercício em fecho', async () => {
      const base = lancamentoBase({
        periodo: { ...lancamentoBase().periodo, estado: 'aberto' },
        exercicio: { ...lancamentoBase().exercicio, estado: 'emFecho' },
      });
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(base);

      await expect(service.validar('lanc-1', 'user-1'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('atribui número e muda para validado', async () => {
      const base = lancamentoBase({ estado: 'rascunho' });
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(base);
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'conta-1', codigo: '611', activa: true, aceitaMovimento: true, exigeCentroCusto: false, exigeEntidade: false, empresaId: 'emp-1' },
        { id: 'conta-2', codigo: '3421', activa: true, aceitaMovimento: true, exigeCentroCusto: false, exigeEntidade: false, empresaId: 'emp-1' },
      ]);
      mockPrisma.lancamentoContabil.update.mockResolvedValue(
        lancamentoBase({ estado: 'validado', numero: 1, validadoPorId: 'user-1', validadoEm: new Date() })
      );
      mockPrisma.auditLog.create.mockResolvedValue({});

      const res = await service.validar('lanc-1', 'user-1');

      expect(res.estado).toBe('validado');
      expect(res.numero).toBe(1);
      expect(res.validadoPorId).toBe('user-1');
    });
  });

  describe('estornar', () => {
    it('cria lançamento invertido e marca original como estornado', async () => {
      const base = lancamentoBase({ estado: 'validado', numero: 1 });
      const estornoCriado = lancamentoBase({
        id: 'lanc-estorno',
        estado: 'rascunho',
        origem: 'estorno',
        estornoDeId: 'lanc-1',
        totalDebito: new (require('@prisma/client').Prisma.Decimal)(100),
        totalCredito: new (require('@prisma/client').Prisma.Decimal)(100),
        descricao: 'Estorno de Lançamento teste',
        periodo: { ...base.periodo, estado: 'aberto' },
        exercicio: { ...base.exercicio, estado: 'aberto' },
      });
      mockPrisma.lancamentoContabil.findUnique
        .mockResolvedValueOnce(base) // original
        .mockResolvedValueOnce(estornoCriado); // estorno para validar
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({ id: 'per-2', exercicioId: 'ex-1', estado: 'aberto' });
      mockPrisma.lancamentoContabil.create.mockResolvedValue(estornoCriado);
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'conta-1', codigo: '611', activa: true, aceitaMovimento: true, exigeCentroCusto: false, exigeEntidade: false, empresaId: 'emp-1' },
        { id: 'conta-2', codigo: '3421', activa: true, aceitaMovimento: true, exigeCentroCusto: false, exigeEntidade: false, empresaId: 'emp-1' },
      ]);
      const estornoValidado = lancamentoBase({
        id: 'lanc-estorno',
        estado: 'validado',
        numero: 2,
        origem: 'estorno',
        estornoDeId: 'lanc-1',
        totalDebito: new (require('@prisma/client').Prisma.Decimal)(100),
        totalCredito: new (require('@prisma/client').Prisma.Decimal)(100),
        validadoPorId: 'user-1',
        validadoEm: new Date(),
        periodo: { ...base.periodo, estado: 'aberto' },
        exercicio: { ...base.exercicio, estado: 'aberto' },
      });
      mockPrisma.lancamentoContabil.update
        .mockResolvedValueOnce(estornoValidado)
        .mockResolvedValueOnce(lancamentoBase({ estado: 'estornado' }));
      mockPrisma.auditLog.create.mockResolvedValue({});

      const res = await service.estornar('lanc-1', {
        dataContabilistica: '2026-01-20',
        utilizadorId: 'user-1',
      });

      expect(res.original.estado).toBe('estornado');
      expect(res.estorno.origem).toBe('estorno');
      expect(res.estorno.estornoDeId).toBe('lanc-1');
    });

    it('rejeita estorno de lançamento não validado', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(lancamentoBase({ estado: 'rascunho' }));

      await expect(service.estornar('lanc-1', {
        dataContabilistica: '2026-01-20',
        utilizadorId: 'user-1',
      })).rejects.toThrow(BusinessRuleError);
    });

    it('rejeita período fechado', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(lancamentoBase({ estado: 'validado' }));
      mockPrisma.periodoContabil.findFirst.mockResolvedValue({ id: 'per-2', exercicioId: 'ex-1', estado: 'fechado' });

      await expect(
        service.estornar('lanc-1', { dataContabilistica: '2026-01-20', utilizadorId: 'user-1' })
      ).rejects.toThrow(BusinessRuleError);
      expect(mockPrisma.lancamentoContabil.create).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('só remove lançamentos em rascunho', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(lancamentoBase({ estado: 'validado' }));

      await expect(service.remover('lanc-1')).rejects.toThrow(BusinessRuleError);
    });

    it('não remove rascunho de período fechado', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(
        lancamentoBase({
          estado: 'rascunho',
          periodo: { ...lancamentoBase().periodo, estado: 'fechado' },
        })
      );

      await expect(service.remover('lanc-1')).rejects.toThrow(BusinessRuleError);
      expect(mockPrisma.linhaLancamentoContabil.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.lancamentoContabil.delete).not.toHaveBeenCalled();
    });

    it('remove lançamento e suas linhas', async () => {
      mockPrisma.lancamentoContabil.findUnique.mockResolvedValue(lancamentoBase({ estado: 'rascunho' }));
      mockPrisma.linhaLancamentoContabil.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.lancamentoContabil.delete.mockResolvedValue({});

      await service.remover('lanc-1');

      expect(mockPrisma.linhaLancamentoContabil.deleteMany).toHaveBeenCalledWith({ where: { lancamentoId: 'lanc-1' } });
      expect(mockPrisma.lancamentoContabil.delete).toHaveBeenCalledWith({ where: { id: 'lanc-1' } });
    });
  });
});