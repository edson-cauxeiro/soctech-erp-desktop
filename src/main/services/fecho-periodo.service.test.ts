import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { FechoPeriodoService } from './fecho-periodo.service';

const PERIODO = {
  id: 'p-1',
  exercicioId: 'e-1',
  numero: 3,
  estado: 'aberto',
  dataInicio: new Date('2026-03-01'),
  dataFim: new Date('2026-03-31'),
  exercicio: { id: 'e-1', estado: 'aberto', empresaId: 'emp-1', ano: '2026' },
};

describe('FechoPeriodoService', () => {
  let mockPrisma: any;
  let service: FechoPeriodoService;
  let periodo: typeof PERIODO;

  beforeEach(() => {
    periodo = structuredClone(PERIODO) as typeof periodo;
    mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
      periodoContabil: {
        findUnique: vi.fn(async () => periodo),
        findUniqueOrThrow: vi.fn(async () => periodo),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(periodo, data);
          return periodo;
        }),
      },
      erroIntegracaoContabil: { count: vi.fn(async () => 0) },
      contaBancaria: { count: vi.fn(async () => 0) },
      lancamentoContabil: { count: vi.fn(async () => 0) },
      apuramentoImposto: { findFirst: vi.fn(async () => ({ estado: 'executado' })) },
      linhaLancamentoContabil: {
        aggregate: vi.fn(async () => ({
          _sum: { debito: new Prisma.Decimal(1000), credito: new Prisma.Decimal(1000) },
        })),
      },
      execucaoFecho: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'exec-1', ...data })),
      },
      auditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'audit-1', ...data })) },
    };
    service = new FechoPeriodoService(mockPrisma);
  });

  it('previsão devolve o checklist completo e permite fechar quando não há bloqueios', async () => {
    const previsao = await service.previsao('p-1');

    expect(previsao.podeFechar).toBe(true);
    expect(previsao.bloqueios).toEqual([]);
    expect(previsao.passos.map((p) => p.codigo)).toEqual([
      'periodo_aberto',
      'exercicio_aberto',
      'integracoes',
      'reconciliacao',
      'rascunhos',
      'regularizacoes',
      'iva',
      'balancete',
    ]);
    expect(previsao.passos.every((p) => p.estado === 'ok')).toBe(true);
  });

  it('previsão bloqueia o fecho quando há rascunhos e balancete desequilibrado', async () => {
    mockPrisma.lancamentoContabil.count.mockImplementation(async ({ where }: any) =>
      where.estado === 'rascunho' ? 2 : 0
    );
    mockPrisma.linhaLancamentoContabil.aggregate.mockResolvedValue({
      _sum: { debito: new Prisma.Decimal(1000), credito: new Prisma.Decimal(900) },
    });

    const previsao = await service.previsao('p-1');

    expect(previsao.podeFechar).toBe(false);
    expect(previsao.bloqueios).toContain('Existem lançamentos em rascunho não validados.');
    expect(previsao.bloqueios).toContain('Balancete não equilibrado.');
  });

  it('executar cria a execução, fecha o período e regista auditoria', async () => {
    const resultado = await service.executar('p-1', 'user-1');

    expect(resultado).toEqual({ execucaoId: 'exec-1' });
    expect(mockPrisma.execucaoFecho.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'fechoMensal', estado: 'executado', periodoId: 'p-1' }),
      })
    );
    expect(mockPrisma.periodoContabil.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'fechado', fechadoPorId: 'user-1' }) })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'fechar', entidade: 'PeriodoContabil' }) })
    );
  });

  it('executar é idempotente: um período já fechado não cria outra execução', async () => {
    await service.executar('p-1', 'user-1');
    expect(mockPrisma.execucaoFecho.create).toHaveBeenCalledTimes(1);

    await expect(service.executar('p-1', 'user-1')).rejects.toThrow(/Não é possível fechar/);
    expect(mockPrisma.execucaoFecho.create).toHaveBeenCalledTimes(1);
  });

  it('reabrir exige motivo, cria execução revertida e regista auditoria', async () => {
    await expect(service.reabrir('p-1', 'user-1', '   ')).rejects.toThrow(/motivo.*obrigatório/i);
    expect(mockPrisma.execucaoFecho.create).not.toHaveBeenCalled();

    periodo.estado = 'fechado';
    await service.reabrir('p-1', 'user-1', 'Correção de imputação');

    expect(mockPrisma.execucaoFecho.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'revertido' }) })
    );
    expect(mockPrisma.periodoContabil.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'aberto', fechadoEm: null }) })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'reabrir' }) })
    );
  });

  it('reabrir recusa períodos abertos', async () => {
    await expect(service.reabrir('p-1', 'user-1', 'Motivo')).rejects.toThrow(/Só períodos fechados/);
  });
});
