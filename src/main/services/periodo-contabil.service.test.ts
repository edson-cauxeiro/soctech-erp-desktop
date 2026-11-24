import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeriodoContabilService, gerarPeriodosContabeis } from './periodo-contabil.service';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

describe('gerarPeriodosContabeis', () => {
  it('gera 12 meses e respeita o ano bissexto', () => {
    const periodos = gerarPeriodosContabeis('2024-01-01', '2024-12-31');

    expect(periodos).toHaveLength(12);
    expect(periodos[0].numero).toBe(1);
    expect(iso(periodos[0].dataInicio)).toBe('2024-01-01');
    expect(iso(periodos[0].dataFim)).toBe('2024-01-31');
    expect(iso(periodos[1].dataFim)).toBe('2024-02-29');
    expect(iso(periodos[11].dataFim)).toBe('2024-12-31');
  });

  it('começa no dia real de abertura quando o exercício começa a meio do mês', () => {
    const periodos = gerarPeriodosContabeis('2026-01-15', '2026-12-31');

    expect(periodos).toHaveLength(12);
    expect(iso(periodos[0].dataInicio)).toBe('2026-01-15');
    expect(iso(periodos[0].dataFim)).toBe('2026-01-31');
  });

  it('trunca exercícios com mais de 12 meses', () => {
    const periodos = gerarPeriodosContabeis('2025-01-01', '2026-06-30');

    expect(periodos).toHaveLength(12);
    expect(iso(periodos[11].dataFim)).toBe('2025-12-31');
  });

  it('devolve menos períodos num exercício curto', () => {
    const periodos = gerarPeriodosContabeis('2026-01-01', '2026-03-31');
    expect(periodos).toHaveLength(3);
  });

  it('rejeita datas inválidas e intervalos invertidos', () => {
    expect(() => gerarPeriodosContabeis('data-invalida', '2026-12-31')).toThrow(ValidationError);
    expect(() => gerarPeriodosContabeis('2026-12-31', '2026-01-01')).toThrow(ValidationError);
  });
});

describe('PeriodoContabilService', () => {
  let mockPrisma: any;
  let service: PeriodoContabilService;

  beforeEach(() => {
    mockPrisma = {
      exercicioFiscal: {
        findUnique: vi.fn(),
      },
      periodoContabil: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new PeriodoContabilService(mockPrisma);
  });

  describe('criarPeriodosDoExercicio', () => {
    it('preenche apenas os períodos em falta', async () => {
      mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({
        id: 'ex-1',
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 11, 31)),
      });
      mockPrisma.periodoContabil.findMany
        .mockResolvedValueOnce([{ numero: 1 }])
        .mockResolvedValueOnce(
          Array.from({ length: 12 }, (_, i) => ({ id: `p-${i + 1}`, numero: i + 1 }))
        );
      mockPrisma.periodoContabil.createMany.mockResolvedValue({ count: 11 });

      const periodos = await service.criarPeriodosDoExercicio('ex-1');

      expect(mockPrisma.periodoContabil.createMany).toHaveBeenCalledTimes(1);
      const data = mockPrisma.periodoContabil.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(11);
      expect(data.map((p: { numero: number }) => p.numero)).toEqual([
        2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
      expect(periodos).toHaveLength(12);
    });

    it('é idempotente quando todos os períodos já existem', async () => {
      mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({
        id: 'ex-1',
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 11, 31)),
      });
      mockPrisma.periodoContabil.findMany
        .mockResolvedValueOnce(Array.from({ length: 12 }, (_, i) => ({ numero: i + 1 })))
        .mockResolvedValueOnce(Array.from({ length: 12 }, (_, i) => ({ numero: i + 1 })));

      await service.criarPeriodosDoExercicio('ex-1');

      expect(mockPrisma.periodoContabil.createMany).not.toHaveBeenCalled();
    });

    it('falha se o exercício não existir', async () => {
      mockPrisma.exercicioFiscal.findUnique.mockResolvedValue(null);

      await expect(service.criarPeriodosDoExercicio('inexistente')).rejects.toThrow(NotFoundError);
    });
  });

  describe('criar', () => {
    it('exige que o período esteja contido no exercício', async () => {
      mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({
        id: 'ex-1',
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 11, 31)),
      });

      await expect(
        service.criar({
          exercicioId: 'ex-1',
          numero: 13,
          dataInicio: '2027-01-01',
          dataFim: '2027-01-31',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejeita número de período duplicado', async () => {
      mockPrisma.exercicioFiscal.findUnique.mockResolvedValue({
        id: 'ex-1',
        dataInicio: new Date(Date.UTC(2026, 0, 1)),
        dataFim: new Date(Date.UTC(2026, 11, 31)),
      });
      mockPrisma.periodoContabil.findUnique.mockResolvedValue({ id: 'p-1' });

      await expect(
        service.criar({
          exercicioId: 'ex-1',
          numero: 1,
          dataInicio: '2026-01-01',
          dataFim: '2026-01-31',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('alterarEstado', () => {
    it('fecha um período aberto e regista autor', async () => {
      mockPrisma.periodoContabil.findUnique.mockResolvedValue({ id: 'p-1', estado: 'aberto' });
      mockPrisma.periodoContabil.update.mockResolvedValue({ id: 'p-1', estado: 'fechado' });

      await service.alterarEstado('p-1', { estado: 'fechado', utilizadorId: 'u-1' });

      expect(mockPrisma.periodoContabil.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: {
          estado: 'fechado',
          fechadoEm: expect.any(Date),
          fechadoPorId: 'u-1',
        },
      });
    });

    it('reabre um período fechado limpando os campos de fecho', async () => {
      mockPrisma.periodoContabil.findUnique.mockResolvedValue({ id: 'p-1', estado: 'fechado' });
      mockPrisma.periodoContabil.update.mockResolvedValue({ id: 'p-1', estado: 'aberto' });

      await service.alterarEstado('p-1', { estado: 'aberto' });

      expect(mockPrisma.periodoContabil.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { estado: 'aberto', fechadoEm: null, fechadoPorId: null },
      });
    });

    it('não permite passar de bloqueado directamente para fechado', async () => {
      mockPrisma.periodoContabil.findUnique.mockResolvedValue({ id: 'p-1', estado: 'bloqueado' });

      await expect(service.alterarEstado('p-1', { estado: 'fechado' })).rejects.toThrow(
        BusinessRuleError
      );
      expect(mockPrisma.periodoContabil.update).not.toHaveBeenCalled();
    });

    it('devolve o período sem update quando o estado é o mesmo', async () => {
      const periodo = { id: 'p-1', estado: 'aberto' };
      mockPrisma.periodoContabil.findUnique.mockResolvedValue(periodo);

      const res = await service.alterarEstado('p-1', { estado: 'aberto' });

      expect(res).toBe(periodo);
      expect(mockPrisma.periodoContabil.update).not.toHaveBeenCalled();
    });

    it('fechar/reabrir/bloquear delegam no estado correcto', async () => {
      const spy = vi.spyOn(service, 'alterarEstado').mockResolvedValue({ id: 'p-1' } as never);

      await service.fechar('p-1', 'u-1');
      await service.reabrir('p-1');
      await service.bloquear('p-1', 'u-2');

      expect(spy).toHaveBeenNthCalledWith(1, 'p-1', { estado: 'fechado', utilizadorId: 'u-1' });
      expect(spy).toHaveBeenNthCalledWith(2, 'p-1', { estado: 'aberto', utilizadorId: undefined });
      expect(spy).toHaveBeenNthCalledWith(3, 'p-1', { estado: 'bloqueado', utilizadorId: 'u-2' });
    });
  });
});
