import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { MotorContabilizacaoService } from './motor-contabilizacao.service';
import { CODIGOS_ERRO_MOTOR } from '../constants/contabilidade.constants';

const REGRA = {
  id: 'regra-1',
  empresaId: 'emp-1',
  moduloOrigem: 'vendas',
  tipoOrigem: 'fatura',
  diarioId: 'diario-1',
  activa: true,
  linhas: [
    {
      id: 'rl-1',
      numeroLinha: 1,
      lado: 'debito',
      chaveConta: 'CUSTOMER_ACCOUNT',
      expressaoValor: 'TOTAL',
      taxaImposto: null,
    },
    {
      id: 'rl-2',
      numeroLinha: 2,
      lado: 'credito',
      chaveConta: 'SALES_ACCOUNT',
      expressaoValor: 'NET',
      taxaImposto: null,
    },
    {
      id: 'rl-3',
      numeroLinha: 3,
      lado: 'credito',
      chaveConta: 'VAT_OUTPUT',
      expressaoValor: 'TAX:14',
      taxaImposto: '14',
    },
  ],
};

const MAPEAMENTOS: Record<string, { id: string; codigo: string; empresaId: string }> = {
  CUSTOMER_ACCOUNT: { id: 'conta-cliente', codigo: '112', empresaId: 'emp-1' },
  SALES_ACCOUNT: { id: 'conta-vendas', codigo: '711', empresaId: 'emp-1' },
  VAT_OUTPUT: { id: 'conta-iva', codigo: '311', empresaId: 'emp-1' },
};

const DADOS = {
  total: 115,
  net: 100,
  tax: 15,
  taxPorTaxa: { '14': 15 },
  dataContabilistica: '2026-01-15',
  dataDocumento: '2026-01-14',
  descricao: 'Fatura FT-1',
};

const PARAMETROS = {
  empresaId: 'emp-1',
  moduloOrigem: 'vendas',
  tipoOrigem: 'fatura',
  origemId: 'fat-1',
  dados: DADOS,
  utilizadorId: 'user-1',
};

function criarPrismaMock(): any {
  const prisma: any = {
    $transaction: vi.fn(async (fn: (tx: unknown, options?: unknown) => unknown, options?: unknown) =>
      fn(prisma, options)
    ),
    lancamentoContabil: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'lanc-1' })),
      findUnique: vi.fn(),
      update: vi.fn(async () => ({ id: 'lanc-1', numero: 7 })),
    },
    regraContabilizacao: {
      findFirst: vi.fn(async () => structuredClone(REGRA)),
    },
    periodoContabil: {
      findFirst: vi.fn(async () => ({
        id: 'per-1',
        exercicioId: 'ex-1',
        numero: 1,
        estado: 'aberto',
      })),
    },
    exercicioFiscal: {
      findUnique: vi.fn(async () => ({ id: 'ex-1', estado: 'aberto', ano: '2026' })),
    },
    mapeamentoConta: {
      findFirst: vi.fn(async ({ where }: any) => {
        const conta = MAPEAMENTOS[where.chave];
        return conta ? { contaId: conta.id } : null;
      }),
    },
    contaContabil: {
      findUnique: vi.fn(async ({ where }: any) => {
        const conta = Object.values(MAPEAMENTOS).find((c) => c.id === where.id);
        return conta
          ? {
              id: conta.id,
              empresaId: conta.empresaId,
              codigo: conta.codigo,
              activa: true,
              aceitaMovimento: true,
              exigeCentroCusto: false,
              exigeEntidade: false,
            }
          : null;
      }),
    },
    erroIntegracaoContabil: {
      create: vi.fn(async () => ({ id: 'erro-1' })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };

  // Devolve o lançamento criado para a etapa de validação dentro da transação.
  prisma.lancamentoContabil.findUnique.mockResolvedValue({
    id: 'lanc-1',
    empresaId: 'emp-1',
    diarioId: 'diario-1',
    exercicioId: 'ex-1',
    periodoId: 'per-1',
    moduloOrigem: 'vendas',
    tipoOrigem: 'fatura',
    origemId: 'fat-1',
    periodo: { id: 'per-1', estado: 'aberto' },
    exercicio: { id: 'ex-1', estado: 'aberto' },
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
        credito: new Prisma.Decimal(100),
      },
      {
        conta: { codigo: '311', empresaId: 'emp-1', activa: true, aceitaMovimento: true },
        debito: new Prisma.Decimal(0),
        credito: new Prisma.Decimal(15),
      },
    ],
  });

  return prisma;
}

function detalhesDoErro(prisma: any): Record<string, any> {
  const data = prisma.erroIntegracaoContabil.create.mock.calls[0][0].data;
  return typeof data.detalhes === 'string' ? JSON.parse(data.detalhes) : data.detalhes;
}

describe('MotorContabilizacaoService', () => {
  let prisma: any;
  let sequencia: any;
  let service: MotorContabilizacaoService;

  beforeEach(() => {
    prisma = criarPrismaMock();
    sequencia = { proximoNumero: vi.fn(async () => 7) };
    service = new MotorContabilizacaoService(prisma as never, sequencia as never);
  });

  it('gera e valida um lançamento equilibrado quando regra, contas e período estão disponíveis', async () => {
    const resultado = await service.gerar(PARAMETROS);

    expect(resultado).toEqual({
      pendente: false,
      lancamentoId: 'lanc-1',
      numero: 7,
      mensagem: 'Lançamento contabilizado e validado.',
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    );

    const criacao = prisma.lancamentoContabil.create.mock.calls[0][0].data;
    expect(criacao).toEqual(
      expect.objectContaining({
        empresaId: 'emp-1',
        origem: 'integracao',
        moduloOrigem: 'vendas',
        tipoOrigem: 'fatura',
        origemId: 'fat-1',
        descricao: 'Fatura FT-1',
        diarioId: 'diario-1',
        periodoId: 'per-1',
        exercicioId: 'ex-1',
        criadoPorId: 'user-1',
      })
    );
    expect(String(criacao.totalDebito)).toBe('115');
    expect(String(criacao.totalCredito)).toBe('115');
    expect(criacao.totalDebito.equals(criacao.totalCredito)).toBe(true);
    expect(
      criacao.linhas.create.map((linha: any) => ({
        contaId: linha.contaId,
        debito: String(linha.debito),
        credito: String(linha.credito),
      }))
    ).toEqual([
      { contaId: 'conta-cliente', debito: '115', credito: '0' },
      { contaId: 'conta-vendas', debito: '0', credito: '100' },
      { contaId: 'conta-iva', debito: '0', credito: '15' },
    ]);

    expect(sequencia.proximoNumero).toHaveBeenCalledWith('diario-1', 'ex-1', prisma);
    expect(prisma.lancamentoContabil.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lanc-1' },
        data: expect.objectContaining({ numero: 7, estado: 'validado', validadoPorId: 'user-1' }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'validar', entidade: 'LancamentoContabil' }),
      })
    );
    expect(prisma.erroIntegracaoContabil.create).not.toHaveBeenCalled();
  });

  it('é idempotente: devolve o lançamento existente sem criar outro nem procurar regra', async () => {
    prisma.lancamentoContabil.findFirst.mockResolvedValue({ id: 'lanc-9', numero: 9 });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado).toEqual({
      pendente: false,
      lancamentoId: 'lanc-9',
      numero: 9,
      mensagem: 'Lançamento já existia (idempotência).',
    });
    expect(prisma.regraContabilizacao.findFirst).not.toHaveBeenCalled();
    expect(prisma.lancamentoContabil.create).not.toHaveBeenCalled();
    expect(sequencia.proximoNumero).not.toHaveBeenCalled();
  });

  it('devolve pendente e regista erro quando não há regra activa', async () => {
    prisma.regraContabilizacao.findFirst.mockResolvedValue(null);

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(resultado.codigoErro).toBe(CODIGOS_ERRO_MOTOR.REGRA_NAO_ENCONTRADA);
    expect(prisma.erroIntegracaoContabil.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        empresaId: 'emp-1',
        moduloOrigem: 'vendas',
        tipoOrigem: 'fatura',
        origemId: 'fat-1',
        origem: 'integracao',
        codigoErro: CODIGOS_ERRO_MOTOR.REGRA_NAO_ENCONTRADA,
      }),
    });
    expect(detalhesDoErro(prisma)).toMatchObject({
      empresaId: 'emp-1',
      moduloOrigem: 'vendas',
      tipoOrigem: 'fatura',
      dados: DADOS,
    });
    expect(prisma.lancamentoContabil.create).not.toHaveBeenCalled();
  });

  it('persiste a pendência antes de devolver: o create da transação é aguardado', async () => {
    const linhasGravadas: any[] = [];
    prisma.regraContabilizacao.findFirst.mockResolvedValue(null);
    prisma.erroIntegracaoContabil.create.mockImplementation(async ({ data }: any) => {
      // Simula uma escrita assíncrona real: sem `await` no gravarErro a linha
      // ainda não estaria na base quando `gerar` devolvesse o resultado.
      await new Promise((resolve) => setImmediate(resolve));
      linhasGravadas.push(data);
      return { id: 'erro-persistido' };
    });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(linhasGravadas).toHaveLength(1);
    expect(linhasGravadas[0]).toMatchObject({
      empresaId: 'emp-1',
      origemId: 'fat-1',
      codigoErro: CODIGOS_ERRO_MOTOR.REGRA_NAO_ENCONTRADA,
    });
    expect(JSON.parse(linhasGravadas[0].detalhes).dados).toEqual(DADOS);
  });

  it('grava os dados originais também no fallback de erro inesperado', async () => {
    prisma.regraContabilizacao.findFirst.mockRejectedValue(new Error('falha na base'));

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(resultado.codigoErro).toBe(CODIGOS_ERRO_MOTOR.DADOS_INSUFICIENTES);
    expect(detalhesDoErro(prisma)).toMatchObject({
      dados: DADOS,
      stack: expect.any(String),
    });
    expect(prisma.lancamentoContabil.create).not.toHaveBeenCalled();
  });

  it('devolve pendente e regista erro quando uma chave de conta não tem mapeamento', async () => {
    prisma.mapeamentoConta.findFirst.mockResolvedValue(null);

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(prisma.erroIntegracaoContabil.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        origem: 'integracao',
        codigoErro: CODIGOS_ERRO_MOTOR.DADOS_INSUFICIENTES,
        mensagem: expect.stringContaining('não mapeada'),
      }),
    });
    expect(detalhesDoErro(prisma).dados).toEqual(DADOS);
    expect(prisma.lancamentoContabil.create).not.toHaveBeenCalled();
  });

  it('devolve pendente com PERIODO_FECHADO sem criar lançamento', async () => {
    prisma.periodoContabil.findFirst.mockResolvedValue({
      id: 'per-1',
      exercicioId: 'ex-1',
      numero: 1,
      estado: 'fechado',
    });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(resultado.codigoErro).toBe(CODIGOS_ERRO_MOTOR.PERIODO_FECHADO);
    expect(prisma.erroIntegracaoContabil.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigoErro: CODIGOS_ERRO_MOTOR.PERIODO_FECHADO }),
    });
    expect(detalhesDoErro(prisma).dados).toEqual(DADOS);
    expect(prisma.exercicioFiscal.findUnique).not.toHaveBeenCalled();
    expect(prisma.lancamentoContabil.create).not.toHaveBeenCalled();
  });

  it('grava os dados originais quando o exercício está fechado', async () => {
    prisma.exercicioFiscal.findUnique.mockResolvedValue({
      id: 'ex-1',
      estado: 'fechado',
      ano: '2026',
    });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.codigoErro).toBe(CODIGOS_ERRO_MOTOR.EXERCICIO_FECHADO);
    expect(detalhesDoErro(prisma).dados).toEqual(DADOS);
  });

  it('grava os dados originais quando o lançamento fica desequilibrado', async () => {
    const dados = { ...DADOS, taxPorTaxa: { '14': 10 } };

    const resultado = await service.gerar({ ...PARAMETROS, dados });

    expect(resultado.codigoErro).toBe(CODIGOS_ERRO_MOTOR.LANCAMENTO_DESEQUILIBRADO);
    expect(detalhesDoErro(prisma).dados).toEqual(dados);
  });

  it('rejeita contas de outra empresa ao resolver as linhas da regra', async () => {
    prisma.contaContabil.findUnique.mockImplementation(async ({ where }: any) => {
      const conta = Object.values(MAPEAMENTOS).find((c) => c.id === where.id);
      if (!conta) return null;
      return {
        id: conta.id,
        empresaId: conta.id === 'conta-cliente' ? 'emp-2' : 'emp-1',
        codigo: conta.codigo,
        activa: true,
        aceitaMovimento: true,
        exigeCentroCusto: false,
        exigeEntidade: false,
      };
    });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    const gravacao = prisma.erroIntegracaoContabil.create.mock.calls[0][0].data;
    expect(gravacao.mensagem).toContain('pertence a outra empresa');
    expect(detalhesDoErro(prisma).dados).toEqual(DADOS);
    expect(prisma.lancamentoContabil.create).not.toHaveBeenCalled();
  });

  it('rejeita contas de outra empresa na validação final do lançamento', async () => {
    prisma.lancamentoContabil.findUnique.mockResolvedValue({
      id: 'lanc-1',
      empresaId: 'emp-1',
      diarioId: 'diario-1',
      exercicioId: 'ex-1',
      periodo: { id: 'per-1', estado: 'aberto' },
      exercicio: { id: 'ex-1', estado: 'aberto' },
      diario: { id: 'diario-1', codigo: 'VD' },
      linhas: [
        {
          conta: { codigo: '112', empresaId: 'emp-2', activa: true, aceitaMovimento: true },
          debito: new Prisma.Decimal(115),
          credito: new Prisma.Decimal(0),
        },
        {
          conta: { codigo: '711', empresaId: 'emp-1', activa: true, aceitaMovimento: true },
          debito: new Prisma.Decimal(0),
          credito: new Prisma.Decimal(115),
        },
      ],
    });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(prisma.erroIntegracaoContabil.create.mock.calls[0][0].data.mensagem).toContain(
      'pertence a outra empresa'
    );
    expect(prisma.lancamentoContabil.update).not.toHaveBeenCalled();
  });

  it('rejeita um lançamento criado para outra empresa na validação final', async () => {
    const lancamento = await prisma.lancamentoContabil.findUnique.getMockImplementation()();
    prisma.lancamentoContabil.findUnique.mockResolvedValue({ ...lancamento, empresaId: 'emp-2' });

    const resultado = await service.gerar(PARAMETROS);

    expect(resultado.pendente).toBe(true);
    expect(prisma.erroIntegracaoContabil.create.mock.calls[0][0].data.mensagem).toContain(
      'pertence a outra empresa'
    );
    expect(prisma.lancamentoContabil.update).not.toHaveBeenCalled();
  });
});
