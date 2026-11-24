import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { RhProcessamentoExecucaoService } from './rh-processamento-execucao.service';
import type { AuditService } from './audit.service';
import type { RhProcessamentoLoaderService } from './rh-processamento-loader.service';
import { FinancasIndisponivelError, RhBusinessRuleError, RhConflictError } from '../utils/rh-errors';
import { PARAMETROS_PROCESSAMENTO_DEFAULT } from './rh-processamento-entrada';

function criarDadosBase(overrides: Record<string, unknown> = {}) {
  const funcionario = {
    id: 'f1',
    codigo: '001',
    nome: 'Ana Silva',
    dataAdmissao: new Date('2024-01-01'),
    dataCessacao: null,
    estado: 'ATIVO',
    iban: 'AO06000000000000000000000',
    rubricasFixas: [],
    contratos: [],
  };
  const contrato = {
    id: 'c1',
    funcionarioId: 'f1',
    estado: 'ATIVO',
    salarioBase: new Prisma.Decimal(100000),
    moeda: 'AOA',
    cargaHorariaSemanal: new Prisma.Decimal(40),
    alteracoesSalariais: [],
  };
  return {
    funcionarios: [
      { funcionario, contrato, elegibilidade: { podeProcessar: true, restricoes: [] } },
    ],
    alteracoesMensais: new Map(),
    ausencias: new Map(),
    horasExtra: new Map(),
    dividas: new Map(),
    ferias: new Map(),
    configuracao: { id: 'cfg', empresaId: 'emp-1', serieRecibo: 'RV', baseDiasMes: 30 },
    tabelaIrt: { id: 't1', escaloes: [] },
    periodo: {
      id: 'per-1',
      empresaId: 'emp-1',
      ano: 2026,
      mes: 1,
      codigo: 'P01',
      mesNumero: 1,
      estado: 'ABERTO',
    },
    elegibilidade: { elegiveis: ['f1'], restricoes: [], detalhes: [] },
    dataLimiteFaltasHE: new Date('2026-01-31'),
    dataProcessamento: new Date('2026-01-31'),
    baseDiasMes: 30,
    ...overrides,
  };
}

function criarMock(dados = criarDadosBase()) {
  const prisma = {
    rhProcessamento: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    rhProcessamentoItem: { create: vi.fn() },
    rhAlteracaoMensal: { update: vi.fn() },
    rhPrestacaoDivida: { update: vi.fn() },
    rhProcessoDivida: { findUnique: vi.fn(), update: vi.fn() },
    rhAusencia: { update: vi.fn() },
    rhHoraExtra: { update: vi.fn() },
    rhRecibo: { create: vi.fn() },
    rhPagamento: { create: vi.fn() },
    rhSequencia: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[])
  );

  prisma.rhProcessamento.findFirst.mockResolvedValue(null);
  prisma.rhProcessamento.count.mockResolvedValue(0);
  prisma.rhProcessamento.create.mockResolvedValue({ id: 'proc-1', sequencia: 1 });
  prisma.rhProcessamentoItem.create.mockResolvedValue({ id: 'item-1' });
  prisma.rhRecibo.create.mockResolvedValue({ id: 'rec-1', serie: 'RV', numero: 1 });
  prisma.rhPagamento.create.mockResolvedValue({ id: 'pag-1' });
  prisma.rhSequencia.upsert.mockResolvedValue({ chave: 'RECIBO:RV:2026', ultimo: 1 });

  const loader = { carregar: vi.fn(async () => dados) };
  const gateway = {
    criarLancamentoContabil: vi.fn(async () => ({ id: 'lanc-1' })),
    estornarLancamento: vi.fn(),
    criarMovimentoTesouraria: vi.fn(),
    estornarMovimento: vi.fn(),
  };
  const audit = { registarOperacao: vi.fn(async () => 'log-1') };

  return { prisma, loader, gateway, audit };
}

function criarService(mock: ReturnType<typeof criarMock>) {
  return new RhProcessamentoExecucaoService(
    mock.prisma as unknown as PrismaClient,
    mock.audit as unknown as AuditService,
    mock.gateway,
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
    dataLimiteFaltasHE: '2026-01-31',
    dataProcessamento: '2026-01-31',
    funcionarioId: 'f1',
    ...overrides,
  };
}

describe('RhProcessamentoExecucaoService (RH-405)', () => {
  let mock: ReturnType<typeof criarMock>;

  beforeEach(() => {
    mock = criarMock();
  });

  it('processa um funcionário e devolve recibo/pagamento', async () => {
    const service = criarService(mock);

    const res = await service.processarIndividual(inputBase());

    expect(res.sucesso).toBe(true);
    expect(res.processamentoId).toBe('proc-1');
    expect(res.numeroRecibo).toBe(1);
    expect(res.serieRecibo).toBe('RV');
    expect(res.pagamentoId).toBe('pag-1');
    // Salário base 100000, INSS 3% (3000), sem IRT → líquido 97000.
    expect(res.liquido).toBe('97000.00');
    expect(res.totalDescontos).toBe('3000.00');
    expect(mock.prisma.rhProcessamento.create).toHaveBeenCalledTimes(1);
    expect(mock.prisma.rhRecibo.create).toHaveBeenCalledTimes(1);
    expect(mock.prisma.rhPagamento.create).toHaveBeenCalledTimes(1);
    expect(mock.audit.registarOperacao).toHaveBeenCalledTimes(1);
  });

  it('recusa reprocessar sem forcarReprocessamento (unicidade)', async () => {
    mock.prisma.rhProcessamento.findFirst.mockResolvedValue({ id: 'proc-existente' });
    const service = criarService(mock);

    await expect(service.processarIndividual(inputBase())).rejects.toBeInstanceOf(RhConflictError);
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('permite reprocessar com forcarReprocessamento incrementando a sequência', async () => {
    mock.prisma.rhProcessamento.findFirst.mockResolvedValue({ id: 'proc-existente' });
    mock.prisma.rhProcessamento.count.mockResolvedValue(1);
    mock.prisma.rhProcessamento.create.mockResolvedValue({ id: 'proc-2', sequencia: 2 });
    const service = criarService(mock);

    const res = await service.processarIndividual(inputBase({ forcarReprocessamento: true }));

    expect(res.processamentoId).toBe('proc-2');
    expect(res.sequencia).toBe(2);
  });

  it('faz rollback (propaga o erro) quando uma escrita dentro da transacção falha', async () => {
    mock.prisma.rhProcessamentoItem.create.mockRejectedValue(new Error('falha ao gravar item'));
    const service = criarService(mock);

    await expect(service.processarIndividual(inputBase())).rejects.toThrow('falha ao gravar item');
    // O recibo só é criado depois dos itens → nunca chega a ser escrito.
    expect(mock.prisma.rhRecibo.create).not.toHaveBeenCalled();
    expect(mock.audit.registarOperacao).not.toHaveBeenCalled();
  });

  it('recusa período não aberto', async () => {
    mock = criarMock(criarDadosBase({ periodo: { id: 'per-1', ano: 2026, mes: 1, codigo: 'P01', estado: 'FECHADO' } }));
    const service = criarService(mock);

    await expect(service.processarIndividual(inputBase())).rejects.toBeInstanceOf(RhBusinessRuleError);
  });

  it('recusa funcionário não elegível', async () => {
    mock = criarMock(criarDadosBase({ funcionarios: [] }));
    const service = criarService(mock);

    await expect(service.processarIndividual(inputBase())).rejects.toBeInstanceOf(RhBusinessRuleError);
  });

  it('sucede com aviso quando o gateway de Finanças está indisponível', async () => {
    mock.gateway.criarLancamentoContabil.mockRejectedValue(
      new FinancasIndisponivelError('integração indisponível')
    );
    const service = criarService(mock);

    const res = await service.processarIndividual(inputBase());

    expect(res.sucesso).toBe(true);
    expect(res.lancamentoContabilId).toBeUndefined();
    expect(res.avisos.some((a) => a.includes('Lançamento contabilístico'))).toBe(true);
  });

  it('aplica ajustes manuais: item MANUAL e cabeçalho manual=true (RH-408)', async () => {
    const service = criarService(mock);

    const res = await service.processarIndividual(
      inputBase({
        ajustesManuais: [{ descricao: 'Prémio anual', tipo: 'REMUNERACAO', valor: 5000 }],
      })
    );

    expect(res.sucesso).toBe(true);

    const cabecalho = (
      mock.prisma.rhProcessamento.create.mock.calls[0][0] as { data: { manual: boolean } }
    ).data;
    expect(cabecalho.manual).toBe(true);

    const itens = mock.prisma.rhProcessamentoItem.create.mock.calls.map(
      (c) => (c[0] as { data: { origem: string; descricao: string } }).data
    );
    const manual = itens.find((i) => i.origem === 'MANUAL');
    expect(manual?.descricao).toBe('Prémio anual');
  });

  it('não marca manual quando não há ajustes (RH-408)', async () => {
    const service = criarService(mock);

    await service.processarIndividual(inputBase());

    const cabecalho = (
      mock.prisma.rhProcessamento.create.mock.calls[0][0] as { data: { manual: boolean } }
    ).data;
    expect(cabecalho.manual).toBe(false);
  });
});
