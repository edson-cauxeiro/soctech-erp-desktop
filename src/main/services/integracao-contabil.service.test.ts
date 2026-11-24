import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { IntegracaoContabilService } from './integracao-contabil.service';
import { MotorContabilizacaoService } from './motor-contabilizacao.service';
import { BusinessRuleError } from '../utils/errors';

const DADOS_FATURA = {
  total: 115,
  net: 100,
  tax: 15,
  base: 100,
  taxPorTaxa: { '14': 15 },
  dataContabilistica: '2026-01-15',
};

const PARAMETROS_FATURA = {
  empresaId: 'emp-1',
  faturaId: 'fat-1',
  numeroFatura: 'FT-1',
  dados: DADOS_FATURA,
  utilizadorId: 'user-1',
};

const ERRO_PENDENTE = {
  id: 'erro-1',
  empresaId: 'emp-1',
  moduloOrigem: 'vendas',
  tipoOrigem: 'fatura',
  origemId: 'fat-1',
  origem: 'integracao',
  detalhes: JSON.stringify({ dados: DADOS_FATURA }),
  resolvido: false,
};

describe('IntegracaoContabilService', () => {
  let prisma: any;
  let motor: any;
  let lancamentoService: any;
  let service: IntegracaoContabilService;

  beforeEach(() => {
    prisma = {
      lancamentoContabil: { findFirst: vi.fn(async () => null) },
      erroIntegracaoContabil: {
        findUnique: vi.fn(async () => ({ ...ERRO_PENDENTE })),
        update: vi.fn(async () => ({ id: 'erro-1' })),
      },
    };
    motor = {
      gerar: vi.fn(async () => ({
        pendente: false,
        lancamentoId: 'lanc-1',
        numero: 1,
        mensagem: 'Lançamento contabilizado e validado.',
      })),
      prisma,
    };
    lancamentoService = {
      estornar: vi.fn(async () => ({ estorno: { id: 'lanc-2', numero: 2 } })),
      prisma,
    };
    service = new IntegracaoContabilService(motor as never, lancamentoService as never);
  });

  it('a mesma fatura chamada duas vezes não duplica o lançamento', async () => {
    motor.gerar
      .mockResolvedValueOnce({
        pendente: false,
        lancamentoId: 'lanc-1',
        numero: 1,
        mensagem: 'Lançamento contabilizado e validado.',
      })
      .mockResolvedValueOnce({
        pendente: false,
        lancamentoId: 'lanc-1',
        numero: 1,
        mensagem: 'Lançamento já existia (idempotência).',
      });

    const primeiro = await service.contabilizarFaturaVenda(PARAMETROS_FATURA);
    const segundo = await service.contabilizarFaturaVenda(PARAMETROS_FATURA);

    expect(primeiro.sucesso).toBe(true);
    expect(segundo.sucesso).toBe(true);
    expect(segundo.lancamentoId).toBe(primeiro.lancamentoId);
    expect(segundo.mensagem).toContain('idempotência');
    expect(motor.gerar).toHaveBeenCalledTimes(2);
    expect(motor.gerar).toHaveBeenCalledWith({
      empresaId: 'emp-1',
      moduloOrigem: 'vendas',
      tipoOrigem: 'fatura',
      origemId: 'fat-1',
      dados: expect.objectContaining({
        total: 115,
        net: 100,
        tax: 15,
        descricao: 'Fatura FT-1',
      }),
      utilizadorId: 'user-1',
    });
  });

  it('anulação encontra o lançamento original e chama estornar', async () => {
    prisma.lancamentoContabil.findFirst.mockResolvedValue({
      id: 'lanc-1',
      numero: 1,
      estado: 'validado',
    });

    const resultado = await service.estornarFaturaVenda({
      empresaId: 'emp-1',
      faturaId: 'fat-1',
      numeroFatura: 'FT-1',
      dataEstorno: '2026-01-20',
      utilizadorId: 'user-1',
    });

    expect(prisma.lancamentoContabil.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        empresaId: 'emp-1',
        moduloOrigem: 'vendas',
        tipoOrigem: 'fatura',
        origemId: 'fat-1',
        origem: 'integracao',
      }),
      select: { id: true, numero: true, estado: true },
    });
    expect(lancamentoService.estornar).toHaveBeenCalledWith('lanc-1', {
      dataContabilistica: '2026-01-20',
      descricao: 'Estorno de fatura FT-1',
      utilizadorId: 'user-1',
    });
    expect(resultado).toEqual(
      expect.objectContaining({
        sucesso: true,
        pendente: false,
        lancamentoId: 'lanc-2',
        numero: 2,
      })
    );
  });

  it('anulação sem lançamento original não estorna nem devolve pendente', async () => {
    prisma.lancamentoContabil.findFirst.mockResolvedValue(null);

    const resultado = await service.estornarFaturaVenda({
      empresaId: 'emp-1',
      faturaId: 'fat-1',
      numeroFatura: 'FT-1',
      dataEstorno: '2026-01-20',
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.pendente).toBe(false);
    expect(lancamentoService.estornar).not.toHaveBeenCalled();
  });

  it('falha do motor é capturada e devolvida como pendente ao módulo de origem', async () => {
    motor.gerar.mockRejectedValue(new Error('motor indisponível'));

    const resultado = await service.contabilizarFaturaVenda(PARAMETROS_FATURA);

    expect(resultado.sucesso).toBe(false);
    expect(resultado.pendente).toBe(true);
    expect(resultado.mensagem).toContain('motor indisponível');
  });

  it('reprocessa apenas erros não resolvidos e marca como resolvido quando o motor tem sucesso', async () => {
    const resultado = await service.reprocessarErro('erro-1', 'user-1', 'emp-1');

    expect(prisma.erroIntegracaoContabil.findUnique).toHaveBeenCalledWith({
      where: { id: 'erro-1', empresaId: 'emp-1' },
      select: expect.any(Object),
    });
    expect(resultado.sucesso).toBe(true);
    expect(resultado.pendente).toBe(false);
    expect(motor.gerar).toHaveBeenCalledWith({
      empresaId: 'emp-1',
      moduloOrigem: 'vendas',
      tipoOrigem: 'fatura',
      origemId: 'fat-1',
      dados: DADOS_FATURA,
      utilizadorId: 'user-1',
    });
    expect(prisma.erroIntegracaoContabil.update).toHaveBeenCalledWith({
      where: { id: 'erro-1' },
      data: expect.objectContaining({ resolvido: true, resolvidoPorId: 'user-1' }),
    });
  });

  it('erro já resolvido não é reprocessado', async () => {
    prisma.erroIntegracaoContabil.findUnique.mockResolvedValue({
      ...ERRO_PENDENTE,
      resolvido: true,
    });

    await expect(service.reprocessarErro('erro-1', 'user-1')).rejects.toThrow(BusinessRuleError);
    expect(motor.gerar).not.toHaveBeenCalled();
    expect(prisma.erroIntegracaoContabil.update).not.toHaveBeenCalled();
  });

  it('erro que continua pendente no motor não é marcado como resolvido', async () => {
    motor.gerar.mockResolvedValue({
      pendente: true,
      codigoErro: 'REGRA_NAO_ENCONTRADA',
      mensagem: 'Sem regra activa.',
    });

    const resultado = await service.reprocessarErro('erro-1');

    expect(resultado.sucesso).toBe(false);
    expect(resultado.pendente).toBe(true);
    expect(prisma.erroIntegracaoContabil.update).not.toHaveBeenCalled();
  });

  it('não reprocessa um erro de outra empresa', async () => {
    prisma.erroIntegracaoContabil.findUnique.mockResolvedValue(null);

    await expect(
      service.reprocessarErro('erro-1', 'user-1', 'emp-outra')
    ).rejects.toThrow(BusinessRuleError);
    expect(prisma.erroIntegracaoContabil.findUnique).toHaveBeenCalledWith({
      where: { id: 'erro-1', empresaId: 'emp-outra' },
      select: expect.any(Object),
    });
    expect(motor.gerar).not.toHaveBeenCalled();
  });

  it('reprocessa uma pendência real gravada pelo motor com os dados originais', async () => {
    let regra: any = null;
    const errosGravados: any[] = [];
    const prismaReal: any = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaReal)),
      lancamentoContabil: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'lanc-real' })),
        findUnique: vi.fn(async () => ({
          id: 'lanc-real',
          empresaId: 'emp-1',
          diarioId: 'diario-1',
          exercicioId: 'ex-1',
          periodo: { estado: 'aberto' },
          exercicio: { estado: 'aberto' },
          diario: { id: 'diario-1', codigo: 'VD' },
          linhas: [
            {
              conta: { codigo: '112', empresaId: 'emp-1', activa: true, aceitaMovimento: true },
              debito: new Prisma.Decimal(115),
              credito: new Prisma.Decimal(0),
            },
            {
              conta: { codigo: '711', empresaId: 'emp-1', activa: true, aceitaMovimento: true },
              debito: new Prisma.Decimal(0),
              credito: new Prisma.Decimal(115),
            },
          ],
        })),
        update: vi.fn(async () => ({ id: 'lanc-real', numero: 1 })),
      },
      regraContabilizacao: { findFirst: vi.fn(async () => regra) },
      periodoContabil: {
        findFirst: vi.fn(async () => ({
          id: 'per-1',
          exercicioId: 'ex-1',
          estado: 'aberto',
          numero: 1,
        })),
      },
      exercicioFiscal: {
        findUnique: vi.fn(async () => ({ id: 'ex-1', estado: 'aberto', ano: '2026' })),
      },
      mapeamentoConta: { findFirst: vi.fn(async () => ({ contaId: 'conta-1' })) },
      contaContabil: {
        findUnique: vi.fn(async () => ({
          id: 'conta-1',
          empresaId: 'emp-1',
          codigo: '112',
          activa: true,
          aceitaMovimento: true,
          exigeCentroCusto: false,
          exigeEntidade: false,
        })),
      },
      erroIntegracaoContabil: {
        create: vi.fn(async ({ data }: any) => {
          const linha = { id: `erro-${errosGravados.length + 1}`, ...data, resolvido: false };
          errosGravados.push(linha);
          return linha;
        }),
        findUnique: vi.fn(async ({ where }: any) =>
          errosGravados.find((e) => Object.entries(where).every(([k, v]) => e[k] === v)) ?? null
        ),
        update: vi.fn(async ({ where, data }: any) => {
          const linha = errosGravados.find((e) => e.id === where.id)!;
          Object.assign(linha, data);
          return linha;
        }),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const motorReal = new MotorContabilizacaoService(
      prismaReal as never,
      { proximoNumero: vi.fn(async () => 1) } as never
    );
    const parametros = {
      empresaId: 'emp-1',
      moduloOrigem: 'vendas',
      tipoOrigem: 'fatura',
      origemId: 'fat-real',
      dados: {
        total: 115,
        net: 100,
        tax: 15,
        taxPorTaxa: { '14': 15 },
        dataContabilistica: new Date('2026-01-15'),
      },
    };

    // 1. O motor falha (sem regra) e grava a pendência com os dados originais.
    const pendente = await motorReal.gerar(parametros);
    expect(pendente.pendente).toBe(true);
    expect(errosGravados).toHaveLength(1);
    const detalhes = JSON.parse(errosGravados[0].detalhes);
    expect(detalhes.dados).toMatchObject({
      total: 115,
      net: 100,
      tax: 15,
      taxPorTaxa: { '14': 15 },
      dataContabilistica: '2026-01-15T00:00:00.000Z',
    });

    // 2. Depois de corrigida a regra, o mesmo erro é reprocessado com sucesso.
    regra = {
      id: 'regra-1',
      empresaId: 'emp-1',
      diarioId: 'diario-1',
      linhas: [
        {
          id: 'rl-1',
          numeroLinha: 1,
          lado: 'debito',
          chaveConta: 'CLIENTES',
          expressaoValor: 'TOTAL',
          taxaImposto: null,
        },
        {
          id: 'rl-2',
          numeroLinha: 2,
          lado: 'credito',
          chaveConta: 'VENDAS',
          expressaoValor: 'NET',
          taxaImposto: null,
        },
        {
          id: 'rl-3',
          numeroLinha: 3,
          lado: 'credito',
          chaveConta: 'IVA',
          expressaoValor: 'TAX:14',
          taxaImposto: '14',
        },
      ],
    };
    const serviceReal = new IntegracaoContabilService(
      motorReal,
      { estornar: vi.fn() } as never
    );
    const gerarSpy = vi.spyOn(motorReal, 'gerar');
    const resultado = await serviceReal.reprocessarErro(
      errosGravados[0].id,
      'user-1',
      'emp-1'
    );

    expect(resultado.sucesso).toBe(true);
    expect(gerarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        empresaId: 'emp-1',
        origemId: 'fat-real',
        dados: expect.objectContaining({
          total: 115,
          dataContabilistica: '2026-01-15T00:00:00.000Z',
        }),
      })
    );
    expect(errosGravados[0].resolvido).toBe(true);
    expect(errosGravados[0].resolvidoPorId).toBe('user-1');
  });
});
