import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { RhProcessamentoListarService } from './rh-processamento-listar.service';
import { RhBusinessRuleError } from '../utils/rh-errors';

function processamento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proc-1',
    tipo: 'VENCIMENTO',
    sequencia: 1,
    modo: 'LOTE',
    estado: 'PROCESSADO',
    dataProcessamento: new Date('2026-01-31'),
    totalRemuneracoes: new Prisma.Decimal(150000),
    totalDescontos: new Prisma.Decimal(20000),
    liquido: new Prisma.Decimal(130000),
    motivoAnulacao: null,
    funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
    recibo: { numero: 42 },
    ...overrides,
  };
}

function criarMock(processamentos = [processamento()]) {
  const prisma = {
    rhPeriodo: { findFirst: vi.fn() },
    rhProcessamento: { findMany: vi.fn() },
  };
  prisma.rhPeriodo.findFirst.mockResolvedValue({
    id: 'per-1',
    codigo: 'P01',
    ano: 2026,
    mes: 1,
  });
  prisma.rhProcessamento.findMany.mockResolvedValue(processamentos);
  return { prisma };
}

function criarService(mock: ReturnType<typeof criarMock>) {
  return new RhProcessamentoListarService(mock.prisma as unknown as PrismaClient);
}

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: 'emp-1',
    ano: 2026,
    mes: 1,
    periodoCodigo: 'P01',
    podeVerSalarios: true,
    ...overrides,
  };
}

describe('RhProcessamentoListarService (RH-412)', () => {
  let mock: ReturnType<typeof criarMock>;

  beforeEach(() => {
    mock = criarMock();
  });

  it('devolve os processamentos do período com valores em string', async () => {
    const service = criarService(mock);

    const res = await service.listar(inputBase());

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: 'proc-1',
      funcionarioId: 'f1',
      codigo: '001',
      nome: 'Ana',
      tipo: 'VENCIMENTO',
      estado: 'PROCESSADO',
      periodoCodigo: 'P01',
      ano: 2026,
      mes: 1,
      totalRemuneracoes: '150000',
      totalDescontos: '20000',
      liquido: '130000',
      reciboNumero: 42,
      jaAnulado: false,
      motivoAnulacao: null,
    });
  });

  it('resolve o período por (empresa, código, ano)', async () => {
    const service = criarService(mock);

    await service.listar(inputBase());

    expect(mock.prisma.rhPeriodo.findFirst).toHaveBeenCalledWith({
      where: { empresaId: 'emp-1', codigo: 'P01', ano: 2026 },
      select: { id: true, codigo: true, ano: true, mes: true },
    });
    expect(mock.prisma.rhProcessamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ periodoId: 'per-1' }),
      })
    );
  });

  it('devolve lista vazia quando o período não existe', async () => {
    mock.prisma.rhPeriodo.findFirst.mockResolvedValue(null);
    const service = criarService(mock);

    const res = await service.listar(inputBase());

    expect(res).toEqual([]);
    expect(mock.prisma.rhProcessamento.findMany).not.toHaveBeenCalled();
  });

  it('aplica o filtro de estado quando indicado', async () => {
    const service = criarService(mock);

    await service.listar(inputBase({ estado: 'ANULADO' }));

    expect(mock.prisma.rhProcessamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'ANULADO' }),
      })
    );
  });

  it('aplica o filtro de funcionários quando indicado', async () => {
    const service = criarService(mock);

    await service.listar(inputBase({ funcionarioIds: ['f1', 'f2'] }));

    expect(mock.prisma.rhProcessamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ funcionarioId: { in: ['f1', 'f2'] } }),
      })
    );
  });

  it('marca os processamentos já anulados com motivo', async () => {
    mock.prisma.rhProcessamento.findMany.mockResolvedValue([
      processamento({ estado: 'ANULADO', motivoAnulacao: 'Rectificação.' }),
    ]);
    const service = criarService(mock);

    const res = await service.listar(inputBase());

    expect(res[0].estado).toBe('ANULADO');
    expect(res[0].jaAnulado).toBe(true);
    expect(res[0].motivoAnulacao).toBe('Rectificação.');
  });

  it('exige empresa na sessão', async () => {
    const service = criarService(mock);

    await expect(service.listar(inputBase({ empresaId: null }))).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
  });
});
