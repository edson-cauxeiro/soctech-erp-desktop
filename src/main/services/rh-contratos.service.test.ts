import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { RhContratosService, resolverSalarioContrato } from './rh-contratos.service';
import type { AuditService } from './audit.service';
import { RhBusinessRuleError, RhConflictError, RhNotFoundError } from '../utils/rh-errors';

const dec = (n: number) => ({
  toNumber: () => n,
  toString: () => String(n),
  valueOf: () => n,
});

function criarMock() {
  const prisma = {
    rhFuncionario: { findFirst: vi.fn(), update: vi.fn() },
    rhContrato: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    rhAlteracaoSalarial: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[])
  );
  return prisma;
}

describe('resolverSalarioContrato (RH-204)', () => {
  const contrato = {
    salarioBase: dec(100),
    alteracoesSalariais: [
      { dataEfeito: new Date('2026-03-01'), salarioNovo: dec(150) },
      { dataEfeito: new Date('2026-06-01'), salarioNovo: dec(180) },
    ],
  };

  it('usa o salário base antes da primeira alteração', () => {
    expect(resolverSalarioContrato(contrato, new Date('2026-02-28'))).toBe(100);
  });

  it('aplica a alteração efectiva no próprio dia', () => {
    expect(resolverSalarioContrato(contrato, new Date('2026-03-01'))).toBe(150);
  });

  it('aplica a alteração mais recente não posterior à data', () => {
    expect(resolverSalarioContrato(contrato, new Date('2026-07-15'))).toBe(180);
  });
});

describe('RhContratosService (RH-204)', () => {
  let prisma: ReturnType<typeof criarMock>;
  let audit: { registarOperacao: ReturnType<typeof vi.fn> };
  let service: RhContratosService;

  beforeEach(() => {
    prisma = criarMock();
    audit = { registarOperacao: vi.fn(async () => 'log-1') };
    service = new RhContratosService(
      prisma as unknown as PrismaClient,
      audit as unknown as AuditService
    );
    prisma.rhFuncionario.findFirst.mockResolvedValue({ id: 'f1' });
  });

  it('recusa criar um segundo contrato ativo', async () => {
    prisma.rhContrato.findFirst.mockResolvedValue({ id: 'c-existente' });

    await expect(
      service.criarContrato(
        'f1',
        { tipo: 'PRAZO_INDETERMINADO', salarioBase: 1000, dataInicio: '2026-01-01' },
        'emp-1',
        'u1'
      )
    ).rejects.toBeInstanceOf(RhConflictError);
  });

  it('cria o contrato ativo e audita', async () => {
    prisma.rhContrato.findFirst.mockResolvedValue(null);
    prisma.rhContrato.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 'c1',
      ...data,
      funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
    }));

    const criado = await service.criarContrato(
      'f1',
      { tipo: 'PRAZO_INDETERMINADO', salarioBase: 1000, dataInicio: '2026-01-01' },
      'emp-1',
      'u1'
    );

    expect(criado.id).toBe('c1');
    expect(prisma.rhContrato.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ funcionarioId: 'f1', estado: 'ATIVO', salarioBase: 1000 }),
      })
    );
    expect(audit.registarOperacao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'criar', entidade: 'RhContrato', modulo: 'rh' })
    );
  });

  it('cessa o contrato e marca o funcionário como cessado', async () => {
    prisma.rhContrato.findFirst
      .mockResolvedValueOnce({
        id: 'c1',
        funcionarioId: 'f1',
        estado: 'ATIVO',
        dataInicio: new Date('2026-01-01'),
        dataCessacao: null,
        observacoes: null,
        funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
        alteracoesSalariais: [],
      })
      .mockResolvedValueOnce(null);
    prisma.rhContrato.update.mockResolvedValue({
      id: 'c1',
      estado: 'ENCERRADO',
      motivoCessacao: 'DEMISSAO',
      dataCessacao: new Date('2026-05-31'),
      funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
    });
    prisma.rhFuncionario.update.mockResolvedValue({ id: 'f1', estado: 'CESSADO' });

    const resultado = await service.cessarContrato(
      'c1',
      { motivo: 'DEMISSAO', dataCessacao: '2026-05-31' },
      'emp-1',
      'u1'
    );

    expect(resultado.estado).toBe('ENCERRADO');
    expect(prisma.rhFuncionario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f1' },
        data: expect.objectContaining({ estado: 'CESSADO' }),
      })
    );
  });

  it('recusa cessar um contrato já encerrado', async () => {
    prisma.rhContrato.findFirst.mockResolvedValue({
      id: 'c1',
      funcionarioId: 'f1',
      estado: 'ENCERRADO',
      dataInicio: new Date('2026-01-01'),
      funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
      alteracoesSalariais: [],
    });

    await expect(
      service.cessarContrato('c1', { motivo: 'DEMISSAO', dataCessacao: '2026-05-31' }, 'emp-1', 'u1')
    ).rejects.toBeInstanceOf(RhBusinessRuleError);
  });

  it('regista alteração salarial com o salário anterior vigente', async () => {
    prisma.rhContrato.findFirst.mockResolvedValue({
      id: 'c1',
      funcionarioId: 'f1',
      estado: 'ATIVO',
      dataInicio: new Date('2026-01-01'),
      salarioBase: dec(1000),
      observacoes: null,
      funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
      alteracoesSalariais: [{ dataEfeito: new Date('2026-03-01'), salarioNovo: dec(1200) }],
    });
    prisma.rhAlteracaoSalarial.findFirst.mockResolvedValue(null);
    prisma.rhAlteracaoSalarial.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 'a1',
      ...data,
    }));

    const criado = await service.registarAlteracaoSalarial(
      { contratoId: 'c1', dataEfeito: '2026-07-01', salarioNovo: 1400 },
      'emp-1',
      'u1'
    );

    expect(criado.salarioAnterior).toBe(1200);
    expect(prisma.rhAlteracaoSalarial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ salarioAnterior: 1200, salarioNovo: 1400 }),
      })
    );
  });

  it('recusa alteração salarial com data de efeito duplicada', async () => {
    prisma.rhContrato.findFirst.mockResolvedValue({
      id: 'c1',
      funcionarioId: 'f1',
      estado: 'ATIVO',
      dataInicio: new Date('2026-01-01'),
      salarioBase: dec(1000),
      funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
      alteracoesSalariais: [],
    });
    prisma.rhAlteracaoSalarial.findFirst.mockResolvedValue({ id: 'a-existente' });

    await expect(
      service.registarAlteracaoSalarial(
        { contratoId: 'c1', dataEfeito: '2026-07-01', salarioNovo: 1400 },
        'emp-1',
        'u1'
      )
    ).rejects.toBeInstanceOf(RhConflictError);
  });

  it('salarioNaData devolve o salário do contrato que cobre a data', async () => {
    prisma.rhContrato.findMany.mockResolvedValue([
      {
        id: 'c1',
        dataInicio: new Date('2026-01-01'),
        dataFim: null,
        moeda: 'AOA',
        salarioBase: dec(1000),
        alteracoesSalariais: [{ dataEfeito: new Date('2026-03-01'), salarioNovo: dec(1200) }],
      },
    ]);

    const resultado = await service.salarioNaData('f1', new Date('2026-06-30'), 'emp-1', true);

    expect(resultado.contratoId).toBe('c1');
    expect(resultado.salario).toBe(1200);
    expect(resultado.moeda).toBe('AOA');
  });

  it('salarioNaData devolve salario nulo quando nenhum contrato cobre a data', async () => {
    prisma.rhContrato.findMany.mockResolvedValue([]);

    const resultado = await service.salarioNaData('f1', new Date('2025-01-01'), 'emp-1');

    expect(resultado.salario).toBeNull();
    expect(resultado.contratoId).toBeNull();
  });

  it('lança erro quando o funcionário não existe', async () => {
    prisma.rhFuncionario.findFirst.mockResolvedValue(null);

    await expect(service.listarPorFuncionario('inexistente', 'emp-1')).rejects.toBeInstanceOf(
      RhNotFoundError
    );
  });
});
