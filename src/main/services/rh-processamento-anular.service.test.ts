import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { RhProcessamentoAnularService } from './rh-processamento-anular.service';
import type { AuditService } from './audit.service';
import { FinancasIndisponivelError, RhBusinessRuleError } from '../utils/rh-errors';

function processamentoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proc-1',
    funcionarioId: 'f1',
    tipo: 'VENCIMENTO',
    estado: 'PROCESSADO',
    dataProcessamento: new Date('2026-01-31'),
    snapshot: { lancamentoContabilId: 'lanc-1' },
    itens: [{ id: 'item-1' }, { id: 'item-2' }],
    recibo: { id: 'rec-1', estado: 'EMITIDO' },
    pagamentos: [{ id: 'pag-1', estado: 'PENDENTE', valorPago: new Prisma.Decimal(0) }],
    periodo: { id: 'per-1', ano: 2026, mes: 1, estado: 'ABERTO' },
    funcionario: { id: 'f1', codigo: '001', nome: 'Ana' },
    ...overrides,
  };
}

function criarMock(processamentos = [processamentoBase()]) {
  const prisma = {
    rhProcessamento: { findMany: vi.fn(), update: vi.fn() },
    rhRecibo: { update: vi.fn() },
    rhPagamento: { update: vi.fn() },
    rhAlteracaoMensal: { updateMany: vi.fn() },
    rhPrestacaoDivida: { findMany: vi.fn(), update: vi.fn() },
    rhProcessoDivida: { update: vi.fn() },
    rhAusencia: { updateMany: vi.fn() },
    rhHoraExtra: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[])
  );
  prisma.rhProcessamento.findMany.mockResolvedValue(processamentos);
  prisma.rhProcessamento.update.mockResolvedValue({});
  prisma.rhRecibo.update.mockResolvedValue({});
  prisma.rhPagamento.update.mockResolvedValue({});
  prisma.rhAlteracaoMensal.updateMany.mockResolvedValue({ count: 1 });
  prisma.rhPrestacaoDivida.findMany.mockResolvedValue([
    {
      id: 'prest-1',
      processoId: 'pd-1',
      valorDescontado: new Prisma.Decimal(5000),
      processo: { id: 'pd-1', saldo: new Prisma.Decimal(0), estado: 'LIQUIDADA' },
    },
  ]);
  prisma.rhPrestacaoDivida.update.mockResolvedValue({});
  prisma.rhProcessoDivida.update.mockResolvedValue({});
  prisma.rhAusencia.updateMany.mockResolvedValue({ count: 1 });
  prisma.rhHoraExtra.updateMany.mockResolvedValue({ count: 1 });

  const audit = { registarOperacao: vi.fn(async () => 'log-1') };
  const gateway = {
    criarLancamentoContabil: vi.fn(),
    estornarLancamento: vi.fn(async () => undefined),
    criarMovimentoTesouraria: vi.fn(),
    estornarMovimento: vi.fn(),
  };

  return { prisma, audit, gateway };
}

function criarService(mock: ReturnType<typeof criarMock>) {
  return new RhProcessamentoAnularService(
    mock.prisma as unknown as PrismaClient,
    mock.audit as unknown as AuditService,
    mock.gateway
  );
}

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: 'emp-1',
    utilizadorId: 'u1',
    processamentoIds: ['proc-1'],
    motivo: 'Rectificação de valores.',
    ...overrides,
  };
}

describe('RhProcessamentoAnularService (RH-407)', () => {
  let mock: ReturnType<typeof criarMock>;

  beforeEach(() => {
    mock = criarMock();
  });

  it('anula e reverte todos os efeitos do processamento', async () => {
    const service = criarService(mock);

    const res = await service.anular(inputBase());

    expect(res.total).toBe(1);
    expect(res.sucesso).toBe(1);
    expect(res.erros).toBe(0);
    const d = res.detalhes[0];
    expect(d.sucesso).toBe(true);
    expect(d.reciboAnulado).toBe(true);
    expect(d.pagamentosCancelados).toBe(1);
    expect(d.alteracoesRepostas).toBe(1);
    expect(d.prestacoesRepostas).toBe(1);
    expect(d.lancamentoEstornado).toBe(true);

    expect(mock.prisma.rhProcessamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'ANULADO', motivoAnulacao: 'Rectificação de valores.' }),
      })
    );
    expect(mock.prisma.rhRecibo.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'ANULADO' }) })
    );
    expect(mock.prisma.rhPagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'CANCELADO' } })
    );
    expect(mock.prisma.rhAlteracaoMensal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'PENDENTE', processamentoItemId: null } })
    );
    expect(mock.prisma.rhPrestacaoDivida.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'PENDENTE', processamentoItemId: null }),
      })
    );
    // Saldo reposto (0 + 5000) e processo reactivado.
    const processoUpdate = mock.prisma.rhProcessoDivida.update.mock.calls[0][0];
    expect(new Prisma.Decimal(processoUpdate.data.saldo).toNumber()).toBe(5000);
    expect(processoUpdate.data.estado).toBe('ATIVA');
    expect(mock.prisma.rhAusencia.updateMany).toHaveBeenCalledTimes(1);
    expect(mock.prisma.rhHoraExtra.updateMany).toHaveBeenCalledTimes(1);
    expect(mock.gateway.estornarLancamento).toHaveBeenCalledWith(
      'lanc-1',
      'Rectificação de valores.',
      'u1'
    );
    expect(mock.audit.registarOperacao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'anular', entidadeId: 'proc-1' })
    );
  });

  it('bloqueia quando existe pagamento efectuado', async () => {
    mock = criarMock([
      processamentoBase({
        pagamentos: [{ id: 'pag-1', estado: 'PAGO', valorPago: new Prisma.Decimal(97000) }],
      }),
    ]);
    const service = criarService(mock);

    const res = await service.anular(inputBase());

    expect(res.sucesso).toBe(0);
    expect(res.erros).toBe(1);
    expect(res.detalhes[0].erro).toContain('pagamento efectuado');
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
    expect(mock.gateway.estornarLancamento).not.toHaveBeenCalled();
  });

  it('bloqueia quando o período está fechado', async () => {
    mock = criarMock([
      processamentoBase({ periodo: { id: 'per-1', ano: 2026, mes: 1, estado: 'FECHADO' } }),
    ]);
    const service = criarService(mock);

    const res = await service.anular(inputBase());

    expect(res.erros).toBe(1);
    expect(res.detalhes[0].erro).toContain('Período fechado');
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloqueia quando o processamento já está anulado', async () => {
    mock = criarMock([processamentoBase({ estado: 'ANULADO' })]);
    const service = criarService(mock);

    const res = await service.anular(inputBase());

    expect(res.erros).toBe(1);
    expect(res.detalhes[0].erro).toContain('já se encontra anulado');
  });

  it('assinala erro quando o processamento não existe', async () => {
    mock = criarMock([]);
    const service = criarService(mock);

    const res = await service.anular(inputBase({ processamentoIds: ['inexistente'] }));

    expect(res.total).toBe(1);
    expect(res.erros).toBe(1);
    expect(res.detalhes[0].erro).toContain('não encontrado');
  });

  it('exige motivo', async () => {
    const service = criarService(mock);

    await expect(service.anular(inputBase({ motivo: '   ' }))).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
  });

  it('exige pelo menos um processamento', async () => {
    const service = criarService(mock);

    await expect(service.anular(inputBase({ processamentoIds: [] }))).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
  });

  it('isola falhas: um processamento bloqueado não impede o outro', async () => {
    mock = criarMock([
      processamentoBase({ id: 'proc-1' }),
      processamentoBase({
        id: 'proc-2',
        pagamentos: [{ id: 'pag-2', estado: 'PARCIAL', valorPago: new Prisma.Decimal(10) }],
      }),
    ]);
    const service = criarService(mock);

    const res = await service.anular(inputBase({ processamentoIds: ['proc-1', 'proc-2'] }));

    expect(res.total).toBe(2);
    expect(res.sucesso).toBe(1);
    expect(res.erros).toBe(1);
    expect(res.detalhes[0].sucesso).toBe(true);
    expect(res.detalhes[1].sucesso).toBe(false);
  });

  it('sucede com aviso quando o estorno contabilístico está indisponível', async () => {
    mock.gateway.estornarLancamento.mockRejectedValue(
      new FinancasIndisponivelError('integração indisponível')
    );
    const service = criarService(mock);

    const res = await service.anular(inputBase());

    expect(res.sucesso).toBe(1);
    expect(res.detalhes[0].lancamentoEstornado).toBe(false);
    expect(res.detalhes[0].avisos?.some((a) => a.includes('Estorno contabilístico'))).toBe(true);
  });
});
