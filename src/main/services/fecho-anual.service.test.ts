import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { FechoAnualService } from './fecho-anual.service';
import { BusinessRuleError, ValidationError } from '../utils/errors';

vi.mock('./sequencia-diario.service', () => ({
  sequenciaDiarioService: {
    proximoNumero: vi.fn(async () => 1),
  },
}));

function decimal(valor: number | string): Prisma.Decimal {
  return new Prisma.Decimal(valor);
}

function exercicio(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ex-2026',
    ano: '2026',
    empresaId: 'emp-1',
    estado: 'aberto',
    dataInicio: new Date('2026-01-01'),
    dataFim: new Date('2026-12-31'),
    periodos: [
      { id: 'per-1', numero: 1, estado: 'fechado', dataInicio: new Date('2026-01-01'), dataFim: new Date('2026-01-31') },
    ],
    ...overrides,
  };
}

describe('FechoAnualService', () => {
  let mockPrisma: any;
  let service: FechoAnualService;

  beforeEach(() => {
    mockPrisma = {
      exercicioFiscal: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      execucaoFecho: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      periodoContabil: {
        update: vi.fn(),
        updateMany: vi.fn(),
        createMany: vi.fn(),
      },
      lancamentoContabil: {
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      linhaLancamentoContabil: {
        groupBy: vi.fn(),
      },
      diarioContabil: {
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    };
    service = new FechoAnualService(mockPrisma);
  });

  it('mostra todos os passos concluídos quando o exercício está fechado e o seguinte já foi aberto', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(
      exercicio({
        estado: 'fechado',
        periodos: [{ id: 'per-1', numero: 1, estado: 'bloqueado' }],
      })
    );
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue({ id: 'exec-res' });
    mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({ id: 'ex-2027', ano: '2027' });
    mockPrisma.lancamentoContabil.findFirst.mockResolvedValue({ id: 'lanc-ab' });

    const previsao = await service.previsao('ex-2026', 'emp-1');

    expect(previsao.passos.every((p) => p.estado === 'ok')).toBe(true);
    expect(previsao.podeEncerrar).toBe(false);
    expect(previsao.podeAbrir).toBe(false);
    expect(previsao.proximoExercicio).toEqual({ id: 'ex-2027', ano: '2027' });
  });

  it('bloqueia o encerramento quando há períodos em aberto ou falta o apuramento', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(
      exercicio({ periodos: [{ id: 'per-1', numero: 1, estado: 'aberto' }] })
    );
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue(null);
    mockPrisma.exercicioFiscal.findUnique.mockResolvedValue(null);
    mockPrisma.lancamentoContabil.findFirst.mockResolvedValue(null);

    const previsao = await service.previsao('ex-2026', 'emp-1');

    expect(previsao.podeEncerrar).toBe(false);
    expect(previsao.bloqueios.join(' ')).toContain('períodos em aberto');
    expect(previsao.bloqueios.join(' ')).toContain('apuramento de resultados');
  });

  it('recusa encerrar sem o apuramento de resultados', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(exercicio());
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue(null);
    mockPrisma.exercicioFiscal.findUnique.mockResolvedValue(null);
    mockPrisma.lancamentoContabil.findFirst.mockResolvedValue(null);

    await expect(service.encerrar('ex-2026', 'user-1', 'emp-1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('exige motivo na reabertura', async () => {
    await expect(service.reabrir('ex-2026', 'user-1', '   ', 'emp-1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('abre o exercício seguinte com um lançamento equilibrado e preserva a entidade', async () => {
    const actual = exercicio({
      estado: 'fechado',
      periodos: [{ id: 'per-1', numero: 1, estado: 'bloqueado' }],
    });
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(actual);
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue({ id: 'exec-res' });
    // previsao: próximo ainda não existe.
    mockPrisma.exercicioFiscal.findUnique
      .mockResolvedValueOnce(null) // previsao
      .mockResolvedValueOnce(null); // dentro da transacção
    mockPrisma.lancamentoContabil.findFirst.mockResolvedValue(null);
    mockPrisma.exercicioFiscal.findUniqueOrThrow.mockResolvedValue(actual);
    mockPrisma.exercicioFiscal.create.mockResolvedValue({
      id: 'ex-2027',
      ano: '2027',
      empresaId: 'emp-1',
      dataInicio: new Date('2027-01-01'),
      dataFim: new Date('2027-12-31'),
      periodos: [{ id: 'per-2027-1', numero: 1 }],
    });
    mockPrisma.lancamentoContabil.count.mockResolvedValue(0);
    mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-ab' });
    mockPrisma.linhaLancamentoContabil.groupBy.mockResolvedValue([
      { contaId: 'c311', entidadeTipo: 'cliente', entidadeId: 'cli-1', _sum: { debito: decimal(500), credito: decimal(0) } },
      { contaId: 'c511', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(0), credito: decimal(500) } },
    ]);
    mockPrisma.execucaoFecho.create.mockResolvedValue({ id: 'exec-ab' });
    mockPrisma.lancamentoContabil.create.mockResolvedValue({ id: 'lanc-ab' });
    mockPrisma.lancamentoContabil.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const resultado = await service.abrirExercicioSeguinte('ex-2026', 'user-1', 'emp-1');

    expect(resultado).toEqual({ exercicioId: 'ex-2027', lancamentoId: 'lanc-ab' });
    const chamada = mockPrisma.lancamentoContabil.create.mock.calls[0][0];
    expect(chamada.data.exercicioId).toBe('ex-2027');
    expect(chamada.data.origem).toBe('abertura');
    expect(chamada.data.linhas.create).toHaveLength(2);
    expect(chamada.data.linhas.create[0]).toEqual(
      expect.objectContaining({ contaId: 'c311', entidadeTipo: 'cliente', entidadeId: 'cli-1' })
    );
    expect(chamada.data.totalDebito.toFixed(4)).toBe('500.0000');
    expect(chamada.data.totalCredito.toFixed(4)).toBe('500.0000');
  });

  function configurarAbertura() {
    const actual = exercicio({
      estado: 'fechado',
      periodos: [{ id: 'per-1', numero: 1, estado: 'bloqueado', dataInicio: new Date('2026-01-01'), dataFim: new Date('2026-01-31') }],
    });
    const proximo = {
      id: 'ex-2027',
      ano: '2027',
      empresaId: 'emp-1',
      dataInicio: new Date('2027-01-01'),
      dataFim: new Date('2027-12-31'),
      periodos: [{ id: 'per-2027-1', numero: 1 }],
    };
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(actual);
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue({ id: 'exec-res' });
    mockPrisma.exercicioFiscal.findUnique
      .mockResolvedValueOnce(null) // previsão
      .mockResolvedValueOnce(null); // transacção
    mockPrisma.lancamentoContabil.findFirst.mockResolvedValue(null);
    mockPrisma.exercicioFiscal.findUniqueOrThrow.mockResolvedValue(actual);
    mockPrisma.exercicioFiscal.create.mockResolvedValue(proximo);
    mockPrisma.lancamentoContabil.count.mockResolvedValue(0);
    mockPrisma.diarioContabil.findFirst.mockResolvedValue({ id: 'diario-ab' });
    mockPrisma.execucaoFecho.create.mockResolvedValue({ id: 'exec-ab' });
    mockPrisma.lancamentoContabil.create.mockResolvedValue({ id: 'lanc-ab' });
    mockPrisma.lancamentoContabil.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    return proximo;
  }

  it('transporta para 01/01 de N+1 os saldos das classes 1 a 5 de N', async () => {
    const proximo = configurarAbertura();
    mockPrisma.linhaLancamentoContabil.groupBy.mockResolvedValue([
      { contaId: 'c11', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(1000), credito: decimal(0) } },
      { contaId: 'c21', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(0), credito: decimal(1000) } },
    ]);

    await service.abrirExercicioSeguinte('ex-2026', 'user-1', 'emp-1');

    const consulta = mockPrisma.linhaLancamentoContabil.groupBy.mock.calls[0][0];
    expect(consulta.where.lancamento).toEqual({ empresaId: 'emp-1', exercicioId: 'ex-2026', estado: 'validado' });
    expect(consulta.where.conta.classe.in).toEqual([1, 2, 3, 4, 5]);

    const lancamento = mockPrisma.lancamentoContabil.create.mock.calls[0][0].data;
    expect(lancamento.dataContabilistica.toISOString()).toBe(proximo.dataInicio.toISOString());
    expect(lancamento.dataDocumento.toISOString()).toBe(proximo.dataInicio.toISOString());
    expect(lancamento.linhas.create).toHaveLength(2);
    expect(lancamento.totalDebito.toFixed(4)).toBe('1000.0000');
    expect(lancamento.totalCredito.toFixed(4)).toBe('1000.0000');
  });

  it('não transporta saldos das classes 6 e 7', async () => {
    configurarAbertura();
    mockPrisma.linhaLancamentoContabil.groupBy.mockResolvedValue([
      { contaId: 'c11', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(600), credito: decimal(0) } },
      { contaId: 'c61', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(900), credito: decimal(900) } },
      { contaId: 'c71', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(200), credito: decimal(200) } },
      { contaId: 'c21', entidadeTipo: null, entidadeId: null, _sum: { debito: decimal(0), credito: decimal(600) } },
    ]);

    await service.abrirExercicioSeguinte('ex-2026', 'user-1', 'emp-1');

    const lancamento = mockPrisma.lancamentoContabil.create.mock.calls[0][0].data;
    const contas = lancamento.linhas.create.map((l: { contaId: string }) => l.contaId);
    expect(contas).toEqual(['c11', 'c21']);
    expect(contas).not.toContain('c61');
    expect(contas).not.toContain('c71');
  });

  it('recusa reabrir N quando N+1 tem lançamentos além da abertura', async () => {
    mockPrisma.exercicioFiscal.findFirst.mockResolvedValue(
      exercicio({ estado: 'fechado', periodos: [{ id: 'per-1', numero: 1, estado: 'bloqueado' }] })
    );
    mockPrisma.execucaoFecho.findFirst.mockResolvedValue({ id: 'exec-anual' });
    mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({
      id: 'ex-2027', ano: '2027', empresaId: 'emp-1',
      periodos: [{ id: 'per-2027-1', numero: 1 }],
    });
    mockPrisma.lancamentoContabil.count.mockResolvedValue(1);

    await expect(service.reabrir('ex-2026', 'user-1', 'Correção', 'emp-1')).rejects.toThrow(
      /além da abertura e não pode ser revertido/
    );
    expect(mockPrisma.exercicioFiscal.update).not.toHaveBeenCalled();
    expect(mockPrisma.lancamentoContabil.create).not.toHaveBeenCalled();
  });
});
