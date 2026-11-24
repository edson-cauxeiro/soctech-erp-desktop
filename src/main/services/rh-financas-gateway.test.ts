import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RhFinancasGateway,
  type CriarLancamentoContabilParams,
  type CriarMovimentoTesourariaParams,
} from './rh-financas-gateway';
import { RH_ERROR_CODES } from '../utils/rh-errors';

const lancamento: CriarLancamentoContabilParams = {
  empresaId: 'emp-1',
  data: new Date('2026-01-31'),
  descricao: 'Processamento salários',
  origemTipo: 'RH_PROCESSAMENTO',
  origemId: 'proc-1',
  utilizadorId: 'u-1',
  linhas: [
    {
      conta: 'RH_DESPESA_REMUNERACOES',
      descricao: 'Remunerações',
      debito: '100000.00',
    },
    {
      conta: 'RH_LIQUIDO_PAGAR',
      descricao: 'Líquido a pagar',
      credito: '100000.00',
    },
  ],
};

const movimento: CriarMovimentoTesourariaParams = {
  empresaId: 'emp-1',
  data: new Date('2026-01-31'),
  tipo: 'saida',
  contaBancariaId: 'conta-1',
  valor: '100000.00',
  descricao: 'Pagamento salários',
  origemTipo: 'RH_PAGAMENTO',
  origemId: 'pag-1',
  utilizadorId: 'u-1',
};

describe('RhFinancasGateway', () => {
  let prisma: any;
  let lancamentos: any;
  let tesouraria: any;
  let gateway: RhFinancasGateway;

  beforeEach(() => {
    prisma = {
      diarioContabil: {
        findFirst: vi.fn().mockResolvedValue({ id: 'diario-1' }),
      },
      mapeamentoConta: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.chave === 'PAYROLL_EXPENSE'
            ? { conta: { id: 'conta-contabil-731', activa: true, aceitaMovimento: true } }
            : null
        ),
      },
      contaContabil: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.codigo === '331'
            ? { id: 'conta-contabil-331', activa: true, aceitaMovimento: true }
            : null
        ),
      },
      movimentoTesouraria: {
        update: vi.fn().mockResolvedValue({ id: 'mov-1' }),
      },
    };

    lancamentos = {
      criar: vi.fn().mockResolvedValue({ id: 'lanc-1' }),
      validar: vi.fn().mockResolvedValue({ id: 'lanc-1' }),
      estornar: vi.fn().mockResolvedValue({ estorno: { id: 'estorno-1' } }),
      remover: vi.fn().mockResolvedValue(undefined),
    };

    tesouraria = {
      criar: vi.fn().mockResolvedValue({ id: 'mov-1' }),
      estornar: vi.fn().mockResolvedValue({ id: 'mov-2' }),
    };

    gateway = new RhFinancasGateway(prisma, lancamentos, tesouraria);
  });

  it('cria e valida lançamento resolvendo aliases e códigos PGC', async () => {
    const resultado = await gateway.criarLancamentoContabil(lancamento);

    expect(resultado).toEqual({ id: 'lanc-1' });
    expect(prisma.diarioContabil.findFirst).toHaveBeenCalledWith({
      where: { empresaId: 'emp-1', activo: true, tipo: 'salarios' },
      select: { id: true },
    });
    expect(lancamentos.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        moduloOrigem: 'rh',
        tipoOrigem: 'rh_processamento',
        origemId: 'proc-1',
        origem: 'integracao',
        linhas: [
          expect.objectContaining({ contaId: 'conta-contabil-731', debito: '100000.00', credito: '0' }),
          expect.objectContaining({ contaId: 'conta-contabil-331', debito: '0', credito: '100000.00' }),
        ],
      }),
      'u-1'
    );
    expect(lancamentos.validar).toHaveBeenCalledWith('lanc-1', 'u-1');
    expect(lancamentos.remover).not.toHaveBeenCalled();
  });

  it('remove o rascunho se a validação falhar', async () => {
    lancamentos.validar.mockRejectedValue(new Error('Período fechado.'));

    await expect(gateway.criarLancamentoContabil(lancamento)).rejects.toThrow('Período fechado.');
    expect(lancamentos.remover).toHaveBeenCalledWith('lanc-1');
  });

  it('só usa RH_FINANCAS_INDISPONIVEL quando não existe diário activo', async () => {
    prisma.diarioContabil.findFirst.mockResolvedValue(null);

    await expect(gateway.criarLancamentoContabil(lancamento)).rejects.toMatchObject({
      code: RH_ERROR_CODES.FINANCAS_INDISPONIVEL,
      statusCode: 503,
    });
    expect(lancamentos.criar).not.toHaveBeenCalled();
  });

  it('falha com erro de validação (não indisponibilidade) se a conta não existir', async () => {
    prisma.mapeamentoConta.findFirst.mockResolvedValue(null);
    prisma.contaContabil.findFirst.mockResolvedValue(null);

    await expect(gateway.criarLancamentoContabil(lancamento)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    expect(lancamentos.criar).not.toHaveBeenCalled();
  });

  it('cria movimento de tesouraria e liga o documento de origem', async () => {
    const resultado = await gateway.criarMovimentoTesouraria(movimento);

    expect(resultado).toEqual({ id: 'mov-1' });
    expect(tesouraria.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'emp-1',
        tipo: 'saida',
        contaOrigemId: 'conta-1',
        contaDestinoId: undefined,
        valor: '100000.00',
      })
    );
    expect(prisma.movimentoTesouraria.update).toHaveBeenCalledWith({
      where: { id: 'mov-1' },
      data: {
        documentoTipo: 'manual',
        documentoId: 'pag-1',
        documentoNumero: 'RH_PAGAMENTO',
      },
    });
  });

  it('estorna lançamentos e movimentos através dos serviços reais', async () => {
    await gateway.estornarLancamento('lanc-1', 'Rectificação', 'u-1');
    await gateway.estornarMovimento('mov-1', 'Rectificação', 'u-1');

    expect(lancamentos.estornar).toHaveBeenCalledWith(
      'lanc-1',
      expect.objectContaining({
        descricao: 'Estorno RH: Rectificação',
        utilizadorId: 'u-1',
      })
    );
    expect(tesouraria.estornar).toHaveBeenCalledWith('mov-1', {
      motivo: 'Rectificação',
      utilizadorId: 'u-1',
    });
  });
});
