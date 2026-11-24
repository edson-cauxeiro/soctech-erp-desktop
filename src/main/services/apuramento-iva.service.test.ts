import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApuramentoIvaService } from './apuramento-iva.service';

vi.mock('./sequencia-diario.service', () => ({
  sequenciaDiarioService: {
    proximoNumero: vi.fn(async () => 7),
  },
}));

const PERIODO = {
  id: 'per-1',
  exercicioId: 'ex-1',
  numero: 2,
  estado: 'aberto',
  dataFim: new Date('2026-02-28'),
  exercicio: { id: 'ex-1', estado: 'aberto', empresaId: 'emp-1', ano: '2026' },
};

function decimal(valor: number | string): Prisma.Decimal {
  return new Prisma.Decimal(valor);
}

describe('ApuramentoIvaService', () => {
  let mockPrisma: any;
  let service: ApuramentoIvaService;
  let saldoAnterior: Prisma.Decimal | null;
  let apuramentoExistente: { id: string } | null;
  let liquidoOutput: { debito: number; credito: number };
  let liquidoInput: { debito: number; credito: number };

  beforeEach(() => {
    saldoAnterior = null;
    apuramentoExistente = null;
    liquidoOutput = { debito: 20, credito: 120 };
    liquidoInput = { debito: 40, credito: 0 };

    mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
      periodoContabil: { findUnique: vi.fn(async () => ({ ...PERIODO, exercicio: { ...PERIODO.exercicio } })) },
      apuramentoImposto: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.periodo ? (saldoAnterior === null ? null : { saldo: saldoAnterior }) : apuramentoExistente
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ap-1', ...data })),
        update: vi.fn(async () => ({})),
      },
      mapeamentoConta: {
        findMany: vi.fn(async ({ where }: any) => {
          const chaves: string[] = where.chave.in;
          if (chaves.length === 1) return [{ contaId: 'acc-in' }];
          if (chaves.length === 3) return [{ contaId: 'acc-out' }];
          return [
            { chave: 'VAT_OUTPUT', contaId: 'acc-out' },
            { chave: 'VAT_INPUT', contaId: 'acc-in' },
            { chave: 'VAT_PAYABLE', contaId: 'acc-pay' },
            { chave: 'VAT_RECOVERABLE', contaId: 'acc-rec' },
          ];
        }),
      },
      linhaLancamentoContabil: {
        groupBy: vi.fn(async ({ where }: any) => {
          const liquido = where.contaId.in.includes('acc-out') ? liquidoOutput : liquidoInput;
          return [{
            contaId: where.contaId.in[0],
            _sum: { debito: decimal(liquido.debito), credito: decimal(liquido.credito) },
          }];
        }),
      },
      contaContabil: {
        findMany: vi.fn(async ({ where }: any) => {
          const id = where.id.in[0];
          return id === 'acc-out'
            ? [{ id, codigo: '31.1', designacao: 'IVA liquidado' }]
            : [{ id, codigo: '31.2', designacao: 'IVA dedutível' }];
        }),
      },
      diarioContabil: { findFirst: vi.fn(async () => ({ id: 'diario-iva' })) },
      lancamentoContabil: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lanc-1', data })),
        update: vi.fn(async () => ({})),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    service = new ApuramentoIvaService(mockPrisma);
  });

  it('calcula liquidado, dedutível e saldo e usa apenas a chave canónica VAT_INPUT', async () => {
    const previsao = await service.previsao('per-1');

    expect(previsao.ivaLiquidado).toBe('100.0000');
    expect(previsao.ivaDedutivel).toBe('40.0000');
    expect(previsao.creditoTransitado).toBe('0.0000');
    expect(previsao.saldo).toBe('60.0000');
    expect(previsao.aPagar).toBe('60.0000');
    expect(previsao.aRecuperar).toBe('0.0000');

    const chamadas = mockPrisma.mapeamentoConta.findMany.mock.calls.map((c: any[]) => c[0].where.chave.in);
    expect(chamadas[1]).toEqual(['VAT_INPUT']);
    expect(chamadas.every((chaves: string[]) => !chaves.includes('VAT_DEDUCTIBLE'))).toBe(true);
  });

  it('transporta o crédito do período anterior quando o saldo era negativo', async () => {
    saldoAnterior = decimal(-25);

    const previsao = await service.previsao('per-1');

    expect(previsao.creditoTransitado).toBe('25.0000');
    expect(previsao.saldo).toBe('35.0000');
    expect(previsao.aPagar).toBe('35.0000');
  });

  it('recusa dois apuramentos para o mesmo período', async () => {
    apuramentoExistente = { id: 'ap-antigo' };

    await expect(service.executar('per-1', 'user-1')).rejects.toThrow(/Já existe apuramento de IVA/);
    expect(mockPrisma.apuramentoImposto.create).not.toHaveBeenCalled();
  });

  it('executar cria lançamento equilibrado e regista auditoria', async () => {
    const resultado = await service.executar('per-1', 'user-1');

    expect(resultado).toEqual({ apuramentoId: 'ap-1', lancamentoId: 'lanc-1' });
    const chamada = mockPrisma.lancamentoContabil.create.mock.calls[0][0].data;
    expect(chamada.totalDebito.toFixed(4)).toBe('100.0000');
    expect(chamada.totalCredito.toFixed(4)).toBe('100.0000');
    expect(chamada.linhas.create).toHaveLength(3);
    expect(chamada.linhas.create.map((l: any) => l.contaId)).toEqual(['acc-out', 'acc-in', 'acc-pay']);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'apurar', entidade: 'ApuramentoImposto' }) })
    );
  });
});
