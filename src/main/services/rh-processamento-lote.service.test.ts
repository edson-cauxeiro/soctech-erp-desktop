import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { RhProcessamentoLoteService, type ProgressoLote } from './rh-processamento-lote.service';
import type { AuditService } from './audit.service';
import type { RhProcessamentoLoaderService } from './rh-processamento-loader.service';
import type { RhProcessamentoExecucaoService } from './rh-processamento-execucao.service';
import { RhBusinessRuleError, RhConflictError } from '../utils/rh-errors';
import { PARAMETROS_PROCESSAMENTO_DEFAULT } from './rh-processamento-entrada';

function criarDadosBase(overrides: Record<string, unknown> = {}) {
  const funcionario = (id: string, codigo: string, nome: string) => ({
    funcionario: {
      id,
      codigo,
      nome,
      dataAdmissao: new Date('2024-01-01'),
      dataCessacao: null,
      estado: 'ATIVO',
      rubricasFixas: [],
      contratos: [],
    },
    contrato: {
      id: `c-${id}`,
      funcionarioId: id,
      estado: 'ATIVO',
      salarioBase: new Prisma.Decimal(100000),
      moeda: 'AOA',
      cargaHorariaSemanal: new Prisma.Decimal(40),
      alteracoesSalariais: [],
    },
    elegibilidade: { podeProcessar: true, restricoes: [] },
  });

  return {
    funcionarios: [funcionario('f1', '001', 'Ana'), funcionario('f2', '002', 'Bruno')],
    alteracoesMensais: new Map(),
    ausencias: new Map(),
    horasExtra: new Map(),
    dividas: new Map(),
    ferias: new Map(),
    configuracao: { id: 'cfg', empresaId: 'emp-1', serieRecibo: 'RV', baseDiasMes: 30 },
    tabelaIrt: { id: 't1', escaloes: [] },
    periodo: { id: 'per-1', empresaId: 'emp-1', ano: 2026, mes: 1, codigo: 'P01', estado: 'ABERTO' },
    elegibilidade: { elegiveis: ['f1', 'f2'], restricoes: [], detalhes: [] },
    dataLimiteFaltasHE: new Date('2026-01-31'),
    dataProcessamento: new Date('2026-01-31'),
    baseDiasMes: 30,
    ...overrides,
  };
}

function criarMock(dados = criarDadosBase()) {
  const prisma = {
    rhLoteProcessamento: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  };
  prisma.rhLoteProcessamento.create.mockResolvedValue({ id: 'lote-1' });
  prisma.rhLoteProcessamento.update.mockResolvedValue({ id: 'lote-1' });
  prisma.rhLoteProcessamento.findMany.mockResolvedValue([]);

  const loader = { carregar: vi.fn(async () => dados) };
  const execucao = { executarFuncionario: vi.fn() };
  const audit = { registarOperacao: vi.fn(async () => 'log-1') };

  return { prisma, loader, execucao, audit };
}

function criarService(mock: ReturnType<typeof criarMock>) {
  return new RhProcessamentoLoteService(
    mock.prisma as unknown as PrismaClient,
    mock.audit as unknown as AuditService,
    mock.execucao as unknown as RhProcessamentoExecucaoService,
    mock.loader as unknown as RhProcessamentoLoaderService,
    async () => PARAMETROS_PROCESSAMENTO_DEFAULT
  );
}

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: 'emp-1',
    utilizadorId: 'u1',
    ano: 2026,
    mes: 1,
    periodoCodigo: 'P01',
    tipoProcessamento: 'VENCIMENTO',
    funcionarioIds: ['f1', 'f2'],
    dataLimiteFaltasHE: '2026-01-31',
    dataProcessamento: '2026-01-31',
    ...overrides,
  };
}

describe('RhProcessamentoLoteService (RH-406)', () => {
  let mock: ReturnType<typeof criarMock>;

  beforeEach(() => {
    mock = criarMock();
    mock.execucao.executarFuncionario.mockResolvedValue({
      sucesso: true,
      processamentoId: 'proc-x',
      liquido: '97000.00',
    });
  });

  it('processa vários funcionários e agrega totais do lote', async () => {
    const service = criarService(mock);

    const res = await service.processarLote(inputBase());

    expect(res.loteId).toBe('lote-1');
    expect(res.totalFuncionarios).toBe(2);
    expect(res.totalSucesso).toBe(2);
    expect(res.totalErros).toBe(0);
    expect(res.totalLiquido).toBe('194000.00');
    expect(res.detalhes).toHaveLength(2);
    expect(mock.execucao.executarFuncionario).toHaveBeenCalledTimes(2);
    expect(mock.prisma.rhLoteProcessamento.create).toHaveBeenCalledTimes(1);
    expect(mock.prisma.rhLoteProcessamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'CONCLUIDO', totalSucesso: 2 }) })
    );
    expect(mock.audit.registarOperacao).toHaveBeenCalledTimes(1);
  });

  it('uma falha por funcionário não impede os restantes', async () => {
    mock.execucao.executarFuncionario
      .mockResolvedValueOnce({ sucesso: true, processamentoId: 'proc-f1', liquido: '97000.00' })
      .mockRejectedValueOnce(new RhBusinessRuleError('Funcionário sem contrato activo.'));
    const service = criarService(mock);

    const res = await service.processarLote(inputBase());

    expect(res.totalSucesso).toBe(1);
    expect(res.totalErros).toBe(1);
    expect(res.totalLiquido).toBe('97000.00');
    expect(res.relatorioErros).toHaveLength(1);
    expect(res.relatorioErros[0]).toMatchObject({ funcionarioId: 'f2', codigo: '002', nome: 'Bruno' });
    expect(mock.prisma.rhLoteProcessamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'CONCLUIDO_COM_ERROS', totalErros: 1 }) })
    );
  });

  it('emite progresso por cada funcionário', async () => {
    const service = criarService(mock);
    const eventos: ProgressoLote[] = [];

    await service.processarLote(inputBase(), (p) => eventos.push(p));

    expect(eventos).toEqual([
      { total: 2, feitos: 1, funcionarioId: 'f1', estado: 'SUCESSO' },
      { total: 2, feitos: 2, funcionarioId: 'f2', estado: 'SUCESSO' },
    ]);
  });

  it('recusa quando já existe um lote em execução para o mesmo período/tipo', async () => {
    mock.prisma.rhLoteProcessamento.findMany.mockResolvedValue([
      { id: 'lote-existente', tipos: ['VENCIMENTO'] },
    ]);
    const service = criarService(mock);

    await expect(service.processarLote(inputBase())).rejects.toBeInstanceOf(RhConflictError);
    expect(mock.prisma.rhLoteProcessamento.create).not.toHaveBeenCalled();
    expect(mock.execucao.executarFuncionario).not.toHaveBeenCalled();
  });

  it('permite lote de outro tipo enquanto um diferente está em execução', async () => {
    mock.prisma.rhLoteProcessamento.findMany.mockResolvedValue([
      { id: 'lote-existente', tipos: ['SUBSIDIO_NATAL'] },
    ]);
    const service = criarService(mock);

    const res = await service.processarLote(inputBase());

    expect(res.totalSucesso).toBe(2);
  });

  it('recusa processar FIM_CONTRATO em lote', async () => {
    const service = criarService(mock);

    await expect(
      service.processarLote(inputBase({ tipoProcessamento: 'FIM_CONTRATO' }))
    ).rejects.toBeInstanceOf(RhBusinessRuleError);
    expect(mock.prisma.rhLoteProcessamento.create).not.toHaveBeenCalled();
  });

  it('recusa quando não há funcionários selecionados', async () => {
    const service = criarService(mock);

    await expect(service.processarLote(inputBase({ funcionarioIds: [] }))).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
  });

  it('recusa período não aberto', async () => {
    mock = criarMock(
      criarDadosBase({
        periodo: { id: 'per-1', empresaId: 'emp-1', ano: 2026, mes: 1, codigo: 'P01', estado: 'FECHADO' },
      })
    );
    mock.execucao.executarFuncionario.mockResolvedValue({ sucesso: true, liquido: '0' });
    const service = criarService(mock);

    await expect(service.processarLote(inputBase())).rejects.toBeInstanceOf(RhBusinessRuleError);
    expect(mock.prisma.rhLoteProcessamento.create).not.toHaveBeenCalled();
  });
});
