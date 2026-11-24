import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { RelatoriosContabilidadeService } from './relatorios-contabilidade.service';

function decimal(valor: number | string): Prisma.Decimal {
  return new Prisma.Decimal(valor);
}

describe('RelatoriosContabilidadeService', () => {
  let mockPrisma: any;
  let service: RelatoriosContabilidadeService;

  beforeEach(() => {
    mockPrisma = {
      linhaLancamentoContabil: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        aggregate: vi.fn(),
      },
      contaContabil: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      lancamentoContabil: {
        findMany: vi.fn(),
      },
    };
    service = new RelatoriosContabilidadeService(mockPrisma);
  });

  it('balancete agrega apenas linhas de lançamentos validados', async () => {
    mockPrisma.linhaLancamentoContabil.groupBy.mockResolvedValue([
      { contaId: 'c1', _sum: { debito: decimal(1250), credito: decimal(1250) }, _count: { id: 2 } },
    ]);
    mockPrisma.contaContabil.findMany.mockResolvedValue([
      { id: 'c1', codigo: '11.1', designacao: 'Caixa', nivel: 3, classe: 1, natureza: 'devedora' },
    ]);

    const resultado = await service.balancete({
      empresaId: 'emp-1', apenasFolhas: true, page: 1, pageSize: 100, incluirSaldoZero: false, acumulado: false,
    });

    expect(mockPrisma.linhaLancamentoContabil.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lancamento: expect.objectContaining({ estado: 'validado', empresaId: 'emp-1' }),
        }),
      })
    );
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]).toMatchObject({ contaId: 'c1', codigo: '11.1', debito: '1250.0000', credito: '1250.0000' });
    expect(resultado.totais.debito).toBe(resultado.totais.credito);
  });

  it('balancete nunca inclui linhas de rascunho no filtro', async () => {
    mockPrisma.linhaLancamentoContabil.groupBy.mockResolvedValue([]);
    mockPrisma.contaContabil.findMany.mockResolvedValue([]);

    await service.balancete({
      empresaId: 'emp-1', periodoId: 'p-1', apenasFolhas: true, page: 1, pageSize: 100, incluirSaldoZero: false, acumulado: false,
    });

    const where = mockPrisma.linhaLancamentoContabil.groupBy.mock.calls[0][0].where;
    expect(where.lancamento.estado).toBe('validado');
    expect(where.lancamento.periodoId).toBe('p-1');
  });

  it('razão devolve saldo transitado, linhas e saldo final coerente com as linhas', async () => {
    mockPrisma.contaContabil.findFirst.mockResolvedValue({
      id: 'c1', codigo: '11.1', designacao: 'Caixa', natureza: 'devedora',
    });
    mockPrisma.linhaLancamentoContabil.findMany.mockResolvedValue([
      {
        id: 'l1', numeroLinha: 1, debito: decimal(100), credito: decimal(0),
        lancamento: {
          id: 'lan-1', numero: 1,
          dataContabilistica: new Date('2026-03-10'), descricao: 'Entrada de caixa',
        },
      },
      {
        id: 'l2', numeroLinha: 1, debito: decimal(0), credito: decimal(40),
        lancamento: {
          id: 'lan-2', numero: 2,
          dataContabilistica: new Date('2026-03-11'), descricao: 'Saída de caixa',
        },
      },
    ]);
    mockPrisma.linhaLancamentoContabil.aggregate.mockResolvedValue({
      _sum: { debito: decimal(200), credito: decimal(50) },
    });
    mockPrisma.contaContabil.findUnique.mockResolvedValue({ natureza: 'devedora' });

    const resultado = await service.razao({ empresaId: 'emp-1', contaId: 'c1', page: 1, pageSize: 100 });

    expect(resultado.conta.saldoTransitado).toBe('150.0000');
    expect(resultado.items).toHaveLength(2);
    expect(resultado.items[0].saldoCorrente).toBe('250.0000');
    expect(resultado.items[1].saldoCorrente).toBe('210.0000');
    expect(resultado.saldoFinal).toBe('210.0000');
    expect(resultado.saldoFinal).toBe(resultado.items[resultado.items.length - 1].saldoCorrente);
  });

  it('diários pede a ordenação por diário e número e totaliza débitos e créditos', async () => {
    // O serviço confia na ordenação do banco; o mock devolve a ordem que o
    // `orderBy` abaixo deve produzir, e a asserção verifica que a é preservada.
    mockPrisma.lancamentoContabil.findMany.mockResolvedValue([
      {
        id: 'lan-1', numero: 1, dataContabilistica: new Date('2026-03-01'), dataDocumento: null,
        descricao: 'Primeiro', estado: 'validado', origem: 'manual',
        totalDebito: decimal(100), totalCredito: decimal(100),
        diario: { codigo: 'VD', designacao: 'Diário de vendas' },
        criadoPor: { nomeCompleto: 'Operador' },
      },
      {
        id: 'lan-2', numero: 2, dataContabilistica: new Date('2026-03-02'), dataDocumento: null,
        descricao: 'Segundo', estado: 'validado', origem: 'manual',
        totalDebito: decimal(300), totalCredito: decimal(300),
        diario: { codigo: 'VD', designacao: 'Diário de vendas' },
        criadoPor: { nomeCompleto: 'Operador' },
      },
    ]);

    const resultado = await service.diarios({ empresaId: 'emp-1', page: 1, pageSize: 100 });

    expect(mockPrisma.lancamentoContabil.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ diario: { codigo: 'asc' } }, { numero: 'asc' }] })
    );
    expect(resultado.items.map((i) => i.numero)).toEqual([1, 2]);
    expect(resultado.totais).toEqual({ debito: '400.0000', credito: '400.0000' });
  });

  it('conta corrente calcula antiguidade apenas para saldos positivos com vencimento', async () => {
    const vencimento = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    mockPrisma.linhaLancamentoContabil.findMany.mockResolvedValue([
      {
        id: 'l1', numeroLinha: 1,
        dataContabilistica: new Date('2026-03-01'),
        debito: decimal(500), credito: decimal(0),
        entidadeTipo: 'cliente', entidadeId: 'cli-1',
        dataVencimento: vencimento,
        lancamento: {
          id: 'lan-1', numero: 1,
          dataContabilistica: new Date('2026-03-01'), descricao: 'Factura',
        },
        conta: { id: 'c1', codigo: '11.2', natureza: 'devedora' },
      },
    ]);

    const resultado = await service.contaCorrente({
      empresaId: 'emp-1', entidadeTipo: 'cliente', entidadeId: 'cli-1', page: 1, pageSize: 100, incluirAntiguidade: true,
    });

    expect(resultado.saldoFinal).toBe('500.0000');
    expect(resultado.antiguidade).toBeDefined();
    expect(resultado.antiguidade?.ate30).toBe('500.0000');
    expect(resultado.antiguidade?.ate60).toBe('0.0000');
    expect(resultado.antiguidade?.ate90).toBe('0.0000');
    expect(resultado.antiguidade?.mais90).toBe('0.0000');
  });
});
