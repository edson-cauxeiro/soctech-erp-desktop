import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { RhProcessamentoHistoricoService } from './rh-processamento-historico.service';
import { RhBusinessRuleError } from '../utils/rh-errors';

function processamento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proc-1',
    funcionarioId: 'f1',
    contratoId: 'ct-1',
    tipo: 'VENCIMENTO',
    sequencia: 1,
    modo: 'INDIVIDUAL',
    manual: false,
    estado: 'PROCESSADO',
    dataProcessamento: new Date('2026-01-31'),
    dataLimiteFaltasHE: new Date('2026-01-31'),
    diasProcessados: 30,
    moeda: 'AOA',
    taxaCambio: null,
    totalRemuneracoes: new Prisma.Decimal(150000),
    totalDescontos: new Prisma.Decimal(20000),
    totalEncargos: new Prisma.Decimal(12000),
    liquido: new Prisma.Decimal(130000),
    baseINSS: new Prisma.Decimal(150000),
    baseIRT: new Prisma.Decimal(145500),
    inssTrabalhador: new Prisma.Decimal(4500),
    inssPatronal: new Prisma.Decimal(12000),
    irt: new Prisma.Decimal(10000),
    irtEscalaoId: 'esc-1',
    snapshot: { parametros: { inssTrabalhador: 3 } },
    avisos: ['Aviso de teste'],
    anuladoEm: null,
    motivoAnulacao: null,
    createdAt: new Date('2026-01-31'),
    funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
    periodo: { codigo: 'P01', ano: 2026, mes: 1 },
    recibo: { numero: 42 },
    itens: [],
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    codigo: 'R001',
    descricao: 'Vencimento base',
    tipo: 'REMUNERACAO',
    origem: 'AUTOMATICO',
    quantidade: new Prisma.Decimal(1),
    valorUnitario: new Prisma.Decimal(150000),
    valor: new Prisma.Decimal(150000),
    moeda: 'AOA',
    taxaCambio: null,
    incideIRT: true,
    incideINSS: true,
    ordem: 1,
    referenciaId: null,
    ...overrides,
  };
}

function criarMock() {
  const prisma = {
    rhProcessamento: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    rhEscalaoIRT: { findUnique: vi.fn() },
  };
  prisma.rhProcessamento.count.mockResolvedValue(1);
  prisma.rhProcessamento.findMany.mockResolvedValue([processamento()]);
  prisma.rhProcessamento.findFirst.mockResolvedValue(processamento({ itens: [item()] }));
  prisma.rhEscalaoIRT.findUnique.mockResolvedValue({
    ordem: 2,
    rendimentoDe: new Prisma.Decimal(150000),
    rendimentoAte: new Prisma.Decimal(200000),
    parcelaFixa: new Prisma.Decimal(5000),
    taxa: new Prisma.Decimal(13),
    excessoDe: new Prisma.Decimal(150000),
  });
  return { prisma };
}

function criarService(mock: ReturnType<typeof criarMock>) {
  return new RhProcessamentoHistoricoService(mock.prisma as unknown as PrismaClient);
}

describe('RhProcessamentoHistoricoService (RH-414)', () => {
  let mock: ReturnType<typeof criarMock>;

  beforeEach(() => {
    mock = criarMock();
  });

  it('lista com total e itens mapeados em string', async () => {
    const service = criarService(mock);

    const res = await service.listar({ empresaId: 'emp-1', podeVerSalarios: true });

    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: 'proc-1',
      funcionarioId: 'f1',
      codigo: '001',
      nome: 'Ana',
      tipo: 'VENCIMENTO',
      periodoCodigo: 'P01',
      ano: 2026,
      mes: 1,
      totalRemuneracoes: '150000',
      liquido: '130000',
      reciboNumero: 42,
      jaAnulado: false,
    });
  });

  it('isola por empresa e aplica todos os filtros', async () => {
    const service = criarService(mock);

    await service.listar({
      empresaId: 'emp-1',
      ano: 2026,
      mes: 1,
      periodoCodigo: 'P01',
      tipo: 'VENCIMENTO',
      estado: 'ANULADO',
      funcionarioId: 'f1',
      search: 'ana',
      skip: 10,
      take: 20,
    });

    expect(mock.prisma.rhProcessamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          periodo: { empresaId: 'emp-1', ano: 2026, mes: 1, codigo: 'P01' },
          tipo: 'VENCIMENTO',
          estado: 'ANULADO',
          funcionario: {
            id: 'f1',
            OR: [
              { codigo: { contains: 'ana', mode: 'insensitive' } },
              { nome: { contains: 'ana', mode: 'insensitive' } },
            ],
          },
        },
        skip: 10,
        take: 20,
      })
    );
  });

  it('usa paginação por omissão', async () => {
    const service = criarService(mock);

    await service.listar({ empresaId: 'emp-1' });

    expect(mock.prisma.rhProcessamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 })
    );
  });

  it('detalha com itens, escalão, recibo e parâmetros do snapshot', async () => {
    const service = criarService(mock);

    const res = await service.detalhar({ empresaId: 'emp-1', id: 'proc-1', podeVerSalarios: true });

    expect(res.baseINSS).toBe('150000');
    expect(res.baseIRT).toBe('145500');
    expect(res.inssTrabalhador).toBe('4500');
    expect(res.irt).toBe('10000');
    expect(res.motivoAnulacao).toBeNull();
    expect(res.parametros).toEqual({ inssTrabalhador: 3 });
    expect(res.recibo).toMatchObject({ numero: 42 });
    expect(res.escalao).toMatchObject({ ordem: 2, taxa: '13' });
    expect(res.itens).toHaveLength(1);
    expect(res.itens[0]).toMatchObject({
      codigo: 'R001',
      descricao: 'Vencimento base',
      valor: '150000',
      incideIRT: true,
      incideINSS: true,
    });
  });

  it('resolve o escalão de IRT aplicado', async () => {
    const service = criarService(mock);

    await service.detalhar({ empresaId: 'emp-1', id: 'proc-1' });

    expect(mock.prisma.rhEscalaoIRT.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'esc-1' } })
    );
  });

  it('lança erro quando o processamento não existe', async () => {
    mock.prisma.rhProcessamento.findFirst.mockResolvedValue(null);
    const service = criarService(mock);

    await expect(
      service.detalhar({ empresaId: 'emp-1', id: 'proc-x' })
    ).rejects.toBeInstanceOf(RhBusinessRuleError);
  });

  it('exige empresa na sessão', async () => {
    const service = criarService(mock);

    await expect(service.listar({ empresaId: null })).rejects.toBeInstanceOf(RhBusinessRuleError);
    await expect(
      service.detalhar({ empresaId: null, id: 'proc-1' })
    ).rejects.toBeInstanceOf(RhBusinessRuleError);
  });
});
