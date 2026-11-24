import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApuramentoResultadosService } from './apuramento-resultados.service';
import { BusinessRuleError } from '../utils/errors';

vi.mock('./sequencia-diario.service', () => ({
  sequenciaDiarioService: {
    proximoNumero: vi.fn(async () => 1),
  },
}));

function decimal(valor: number | string): Prisma.Decimal {
  return new Prisma.Decimal(valor);
}

function exercicio(periodos: Array<{ numero: number; estado: string }>) {
  return {
    id: 'ex-1',
    ano: '2026',
    empresaId: 'emp-1',
    estado: 'aberto',
    dataInicio: new Date('2026-01-01'),
    dataFim: new Date('2026-12-31'),
    periodos,
  };
}

describe('ApuramentoResultadosService', () => {
  let mockPrisma: any;
  let service: ApuramentoResultadosService;

  beforeEach(() => {
    mockPrisma = {
      exercicioFiscal: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      execucaoFecho: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      linhaLancamentoContabil: {
        groupBy: vi.fn(),
      },
      contaContabil: {
        findMany: vi.fn(),
      },
      mapeamentoConta: {
        findMany: vi.fn(),
      },
      diarioContabil: {
        findFirst: vi.fn(),
      },
      lancamentoContabil: {
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    };
    service = new ApuramentoResultadosService(mockPrisma);
  });

  function prepararSaldos() {
    mockPrisma.linhaLancamentoContabil.groupBy.mockResolvedValue([
      { contaId: 'c611', _sum: { debito: decimal(0), credito: decimal(1000) } },
      { contaId: 'c711', _sum: { debito: decimal(600), credito: decimal(0) } },
    ]);
    mockPrisma.contaContabil.findMany.mockResolvedValue([
      { id: 'c611', codigo: '611', designacao: 'Vendas', classe: 6 },
      { id: 'c711', codigo: '711', designacao: 'Custo das vendas', classe: 7 },
    ]);
  }

  function prepararMapeamentos() {
    mockPrisma.mapeamentoConta.findMany.mockResolvedValue([
      { chave: 'RESULT_TAX', contaId: 'c86' },
      { chave: 'RESULT_OPERATING', contaId: 'c81' },
      { chave: 'RESULT_FINANCIAL', contaId: 'c82' },
      { chave: 'RESULT_CURRENT', contaId: 'c83' },
      { chave: 'RESULT_NON_OPERATING', contaId: 'c84' },
      { chave: 'RESULT_BEFORE_TAX', contaId: 'c85' },
      { chave: 'RESULT_NET', contaId: 'c88' },
    ]);
  }

  it('calcula o resumo e permite executar quando todos os períodos estão fechados', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(exercicio([
      { numero: 1, estado: 'fechado' },
      { numero: 2, estado: 'fechado' },
    ]));
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue(null);
    prepararSaldos();
    mockPrisma.mapeamentoConta.findMany.mockResolvedValue([{ chave: 'RESULT_TAX', contaId: 'c86' }]);

    const previsao = await service.previsao('ex-1', 'emp-1');

    expect(previsao.resumo.proveitos).toBe('1000.0000');
    expect(previsao.resumo.custos).toBe('600.0000');
    expect(previsao.resumo.resultadoOperacional).toBe('400.0000');
    expect(previsao.resumo.resultadoAntesImpostos).toBe('400.0000');
    expect(previsao.resumo.imposto).toBe('0.0000');
    expect(previsao.resumo.resultadoLiquido).toBe('400.0000');
    expect(previsao.podeExecutar).toBe(true);
    expect(previsao.bloqueios).toHaveLength(0);
  });

  it('bloqueia quando existe um período em aberto', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(exercicio([
      { numero: 1, estado: 'fechado' },
      { numero: 2, estado: 'aberto' },
    ]));
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue(null);
    prepararSaldos();
    mockPrisma.mapeamentoConta.findMany.mockResolvedValue([{ chave: 'RESULT_TAX', contaId: 'c86' }]);

    const previsao = await service.previsao('ex-1', 'emp-1');

    expect(previsao.podeExecutar).toBe(false);
    expect(previsao.periodosAbertos).toEqual([2]);
    expect(previsao.bloqueios.join(' ')).toContain('períodos em aberto');
  });

  it('recusa executar com períodos em aberto', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(exercicio([
      { numero: 1, estado: 'aberto' },
    ]));
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue(null);
    prepararSaldos();
    mockPrisma.mapeamentoConta.findMany.mockResolvedValue([{ chave: 'RESULT_TAX', contaId: 'c86' }]);

    await expect(service.executar('ex-1', 'user-1', 'emp-1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('cria um lançamento equilibrado que encerra as classes 6 e 7 e deixa o resultado em 88', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(exercicio([
      { numero: 1, estado: 'fechado' },
    ]));
    mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({
      ...exercicio([{ numero: 1, estado: 'fechado' }]),
      periodos: [{
        id: 'per-1',
        numero: 1,
        dataFim: new Date('2026-01-31'),
        estado: 'fechado',
      }],
    });
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue(null);
    mockPrisma.execucaoFecho.create.mockResolvedValue({ id: 'exec-1' });
    prepararSaldos();
    prepararMapeamentos();
    mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-ap', tipo: 'ajustamento' });
    mockPrisma.lancamentoContabil.create.mockResolvedValue({ id: 'lanc-1' });
    mockPrisma.lancamentoContabil.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const resultado = await service.executar('ex-1', 'user-1', 'emp-1');

    expect(resultado).toEqual({
      execucaoId: 'exec-1',
      lancamentoId: 'lanc-1',
      resumo: expect.objectContaining({ resultadoLiquido: '400.0000' }),
    });

    const chamada = mockPrisma.lancamentoContabil.create.mock.calls[0][0];
    const linhas = chamada.data.linhas.create as Array<{
      contaId: string;
      debito: Prisma.Decimal;
      credito: Prisma.Decimal;
    }>;
    const totalDebito = linhas.reduce((soma, l) => soma.plus(l.debito), decimal(0));
    const totalCredito = linhas.reduce((soma, l) => soma.plus(l.credito), decimal(0));
    expect(totalDebito.equals(totalCredito)).toBe(true);

    // 88 recebe o resultado líquido por crédito.
    const linha88 = linhas.filter((l) => l.contaId === 'c88');
    const credito88 = linha88.reduce((soma, l) => soma.plus(l.credito), decimal(0));
    const debito88 = linha88.reduce((soma, l) => soma.plus(l.debito), decimal(0));
    expect(credito88.minus(debito88).toFixed(4)).toBe('400.0000');

    expect(mockPrisma.lancamentoContabil.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'validado' }) })
    );
  });
});
