import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { DemonstracoesService } from './demonstracoes.service';
import { NotFoundError, ValidationError } from '../utils/errors';

function decimal(valor: number | string): Prisma.Decimal {
  return new Prisma.Decimal(valor);
}

function saldo(contaId: string, debito: number | string, credito: number | string) {
  return { contaId, _sum: { debito: decimal(debito), credito: decimal(credito) } };
}

function linha(overrides: Record<string, unknown> = {}) {
  return {
    id: 'linha-1',
    estruturaId: 'estrutura-1',
    codigo: 'L1',
    designacao: 'Linha 1',
    parentId: null,
    ordem: 1,
    nivel: 1,
    tipo: 'subtotal',
    operacao: 'saldo',
    sinal: 1,
    contas: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
}

function associacao(contaId: string, sinal = 1, codigo = contaId, linhaId = 'linha-1') {
  return {
    linhaId,
    contaId,
    sinal,
    conta: {
      id: contaId,
      codigo,
      designacao: `Conta ${codigo}`,
      classe: 1,
      tipo: 'activo',
      natureza: 'devedora',
    },
  };
}

function estrutura(linhas: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'estrutura-1',
    empresaId: 'emp-1',
    codigo: 'BAL',
    designacao: 'Balanço',
    tipo: 'balanco',
    activa: true,
    linhas,
    ...overrides,
  };
}

describe('DemonstracoesService', () => {
  let prismaMock: any;
  let service: DemonstracoesService;

  beforeEach(() => {
    prismaMock = {
      estruturaRelatorio: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      linhaEstruturaRelatorio: {
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      contaEstruturaRelatorio: {
        createMany: vi.fn(),
      },
      contaContabil: {
        findMany: vi.fn(),
      },
      linhaLancamentoContabil: {
        groupBy: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };

    prismaMock.estruturaRelatorio.findMany.mockResolvedValue([]);
    prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(null);
    prismaMock.estruturaRelatorio.findFirst.mockResolvedValue(null);
    prismaMock.contaContabil.findMany.mockResolvedValue([]);
    prismaMock.linhaLancamentoContabil.groupBy.mockResolvedValue([]);

    service = new DemonstracoesService(prismaMock as never);
  });

  describe('gerar', () => {
    it('constrói um balanço hierárquico a partir de saldos validados', async () => {
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(
        estrutura([
          linha({
            id: 'l-at', codigo: 'AT', designacao: 'Ativo', parentId: null,
            ordem: 1, nivel: 1, tipo: 'activo', operacao: 'saldo', sinal: 1,
          }),
          linha({
            id: 'l-caixa', codigo: 'CX', designacao: 'Caixa', parentId: 'l-at',
            ordem: 1, nivel: 2, tipo: 'activo', operacao: 'debito', sinal: 1,
            contas: [associacao('c-caixa', 1, '11', 'l-caixa')],
          }),
          linha({
            id: 'l-banco', codigo: 'BC', designacao: 'Banco', parentId: 'l-at',
            ordem: 2, nivel: 2, tipo: 'activo', operacao: 'creditoMenosDebito', sinal: 1,
            contas: [associacao('c-banco', 1, '12', 'l-banco')],
          }),
          linha({
            id: 'l-pas', codigo: 'PA', designacao: 'Passivo', parentId: null,
            ordem: 2, nivel: 1, tipo: 'passivo', operacao: 'saldo', sinal: 1,
          }),
          linha({
            id: 'l-forn', codigo: 'FO', designacao: 'Fornecedores', parentId: 'l-pas',
            ordem: 1, nivel: 2, tipo: 'passivo', operacao: 'credito', sinal: 1,
            contas: [associacao('c-forn', 1, '41', 'l-forn')],
          }),
          linha({
            id: 'l-cap', codigo: 'CP', designacao: 'Capital Próprio', parentId: null,
            ordem: 3, nivel: 1, tipo: 'capitalProprio', operacao: 'saldo', sinal: -1,
          }),
          linha({
            id: 'l-res', codigo: 'RE', designacao: 'Resultado', parentId: 'l-cap',
            ordem: 1, nivel: 2, tipo: 'capitalProprio', operacao: 'saldo', sinal: 1,
            contas: [associacao('c-res', 1, '59', 'l-res')],
          }),
        ])
      );
      prismaMock.linhaLancamentoContabil.groupBy.mockResolvedValueOnce([
        saldo('c-caixa', 1000, 100),
        saldo('c-banco', 200, 350),
        saldo('c-forn', 50, 300),
        saldo('c-res', 100, 950),
      ]);

      const resultado = await service.gerar('estrutura-1', '2026-01-01', '2026-12-31');

      expect(resultado).toMatchObject({
        estruturaId: 'estrutura-1',
        dataInicio: '2026-01-01',
        dataFim: '2026-12-31',
        codigo: 'BAL',
      });
      expect(resultado.linhas.map((l) => l.codigo)).toEqual(['AT', 'PA', 'CP']);

      const ativo = resultado.linhas[0];
      expect(ativo.valor).toBe('1150.0000');
      expect(ativo.filhos.map((f) => f.codigo)).toEqual(['CX', 'BC']);
      expect(ativo.filhos.map((f) => f.valor)).toEqual(['1000.0000', '150.0000']);
      expect(ativo.filhos[0]).toMatchObject({ nivel: 2, sinal: 1, filhos: [] });

      expect(resultado.linhas[1].valor).toBe('300.0000');
      expect(resultado.linhas[1].filhos[0].valor).toBe('300.0000');

      // O sinal -1 da linha-pai inverte o saldo devedor da filha (100 - 950).
      expect(resultado.linhas[2].valor).toBe('850.0000');
      expect(resultado.linhas[2].filhos[0].valor).toBe('-850.0000');

      expect(resultado.totais).toEqual({
        AT: '1150.0000',
        PA: '300.0000',
        CP: '850.0000',
        ATIVO: '1150.0000',
        PASSIVO: '300.0000',
        CAPITAL_PROPRIO: '850.0000',
        TOTAL_PASSIVO_CAPITAL: '1150.0000',
      });
      expect(resultado.avisos).toEqual([]);
    });

    it('devolve valorInicial, valorPeriodo e valorFinal para alterações no capital próprio', async () => {
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(
        estrutura(
          [
            linha({
              id: 'l-ini', codigo: 'CI', designacao: 'Capital inicial', parentId: null,
              ordem: 1, nivel: 1, tipo: 'capitalProprio', operacao: 'saldo', sinal: -1,
              contas: [associacao('c-ini', 1, '51', 'l-ini')],
            }),
            linha({
              id: 'l-luc', codigo: 'LP', designacao: 'Lucro do período', parentId: null,
              ordem: 2, nivel: 1, tipo: 'resultado', operacao: 'creditoMenosDebito', sinal: 1,
              contas: [associacao('c-luc', 1, '81', 'l-luc')],
            }),
          ],
          { tipo: 'alteracoesCapitalProprio', codigo: 'ACP', designacao: 'Alterações no capital próprio' }
        )
      );
      // 1º: saldos do período; 2º: saldos de abertura (antes do período); 3º: contas com movimento.
      prismaMock.linhaLancamentoContabil.groupBy
        .mockResolvedValueOnce([saldo('c-ini', 0, 100), saldo('c-luc', 100, 500)])
        .mockResolvedValueOnce([saldo('c-ini', 0, 1000)])
        .mockResolvedValueOnce([]);

      const resultado = await service.gerar('estrutura-1', '2026-01-01', '2026-12-31');

      expect(resultado.linhas[0]).toMatchObject({
        codigo: 'CI',
        valorInicial: '1000.0000',
        valorPeriodo: '100.0000',
        valorFinal: '1100.0000',
      });
      expect(resultado.linhas[1]).toMatchObject({
        codigo: 'LP',
        valorInicial: '0.0000',
        valorPeriodo: '400.0000',
        valorFinal: '400.0000',
      });
      expect(resultado.totais.CI).toBe('1100.0000');
      expect(resultado.totais.LP).toBe('400.0000');

      const chamadas = prismaMock.linhaLancamentoContabil.groupBy.mock.calls;
      expect(chamadas[0][0].where.lancamento.dataContabilistica).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-12-31'),
      });
      expect(chamadas[1][0].where.lancamento.dataContabilistica).toEqual({
        lt: new Date('2026-01-01'),
      });
      expect(chamadas[0][0].where.lancamento.estado).toBe('validado');
    });

    it('rejeita datas inválidas', async () => {
      await expect(service.gerar('estrutura-1', 'nao-e-data', '2026-12-31'))
        .rejects.toThrow(ValidationError);
      await expect(service.gerar('estrutura-1', '2026-01-01', 'nao-e-data'))
        .rejects.toThrow(ValidationError);
      expect(prismaMock.estruturaRelatorio.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita fim anterior ao início', async () => {
      await expect(service.gerar('estrutura-1', '2026-12-31', '2026-01-01'))
        .rejects.toThrow(ValidationError);
      expect(prismaMock.estruturaRelatorio.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita estrutura inexistente', async () => {
      await expect(service.gerar('estrutura-inexistente', '2026-01-01', '2026-12-31'))
        .rejects.toThrow(NotFoundError);
      expect(prismaMock.linhaLancamentoContabil.groupBy).not.toHaveBeenCalled();
    });

    it('rejeita estrutura sem linhas', async () => {
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(estrutura([]));

      await expect(service.gerar('estrutura-1', '2026-01-01', '2026-12-31'))
        .rejects.toThrow(ValidationError);
      expect(prismaMock.linhaLancamentoContabil.groupBy).not.toHaveBeenCalled();
    });

    it('rejeita ciclo na hierarquia de linhas', async () => {
      // A última entrada com o mesmo ID substitui a primeira no mapa interno,
      // fazendo a filha apontar para si própria e exercitando a guarda de ciclo.
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(
        estrutura([
          linha({ id: 'l-raiz', codigo: 'RAIZ', parentId: null, ordem: 1, nivel: 1 }),
          linha({ id: 'l-filha', codigo: 'F1', parentId: 'l-raiz', ordem: 1, nivel: 2 }),
          linha({ id: 'l-filha', codigo: 'F2', parentId: 'l-filha', ordem: 2, nivel: 3 }),
        ])
      );

      await expect(service.gerar('estrutura-1', '2026-01-01', '2026-12-31'))
        .rejects.toThrow(/ciclo na hierarquia/);
    });

    it('avisa quando a estrutura não tem contas associadas', async () => {
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(
        estrutura(
          [linha({ id: 'l-unica', codigo: 'UNICA', designacao: 'Sem contas', contas: [] })],
          { tipo: 'demonstracaoResultados', codigo: 'DR', designacao: 'Demonstração de resultados' }
        )
      );

      const resultado = await service.gerar('estrutura-1', '2026-01-01', '2026-12-31');

      expect(resultado.linhas[0].valor).toBe('0.0000');
      expect(resultado.avisos).toContain(
        'A estrutura não tem contas associadas. Todos os valores serão zero.'
      );
    });
  });

  describe('guardarEstrutura', () => {
    const inputValido = {
      codigo: 'BAL',
      designacao: 'Balanço',
      tipo: 'balanco' as const,
      activa: true,
      linhas: [
        {
          codigo: 'TOTAL', designacao: 'Total', ordem: 0, nivel: 1,
          tipo: 'subtotal' as const, operacao: 'saldo' as const, sinal: 1,
        },
        {
          codigo: 'CAIXA', designacao: 'Caixa', parentCodigo: 'TOTAL', ordem: 0, nivel: 2,
          tipo: 'activo' as const, operacao: 'debito' as const, sinal: 1,
          contas: [{ contaId: 'c-caixa', sinal: -1 }],
        },
      ],
    };

    it('rejeita códigos de linha duplicados', async () => {
      await expect(service.guardarEstrutura('emp-1', {
        ...inputValido,
        linhas: [
          { codigo: 'A', designacao: 'A' },
          { codigo: 'A', designacao: 'B' },
        ],
      })).rejects.toThrow(/duplicado/);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita linha-pai inexistente', async () => {
      await expect(service.guardarEstrutura('emp-1', {
        ...inputValido,
        linhas: [
          { codigo: 'A', designacao: 'A' },
          { codigo: 'B', designacao: 'B', parentCodigo: 'Z' },
        ],
      })).rejects.toThrow(/linha-pai "Z" não existe/);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita pai com contas e filhas', async () => {
      await expect(service.guardarEstrutura('emp-1', {
        ...inputValido,
        linhas: [
          { codigo: 'P', designacao: 'P', contas: [{ contaId: 'c-caixa' }] },
          { codigo: 'F', designacao: 'F', parentCodigo: 'P' },
        ],
      })).rejects.toThrow(/tem contas associadas e não pode ter filhas/);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita contas que não pertencem à empresa', async () => {
      prismaMock.contaContabil.findMany.mockResolvedValue([]);

      await expect(service.guardarEstrutura('emp-1', {
        ...inputValido,
        linhas: [{ codigo: 'A', designacao: 'A', contas: [{ contaId: 'c-outra' }] }],
      })).rejects.toThrow(/Contas inexistentes nesta empresa: c-outra/);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('cria linhas e associações numa única transação e devolve a estrutura mapeada', async () => {
      prismaMock.contaContabil.findMany.mockResolvedValue([{ id: 'c-caixa' }]);
      prismaMock.estruturaRelatorio.create.mockResolvedValue({ id: 'estrutura-criada' });
      prismaMock.linhaEstruturaRelatorio.create
        .mockResolvedValueOnce({ id: 'linha-pai-criada' })
        .mockResolvedValueOnce({ id: 'linha-filha-criada' });
      prismaMock.linhaEstruturaRelatorio.update.mockResolvedValue({});
      prismaMock.contaEstruturaRelatorio.createMany.mockResolvedValue({ count: 1 });
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(
        estrutura(
          [
            linha({
              id: 'linha-pai-criada', codigo: 'TOTAL', designacao: 'Total', parentId: null,
              ordem: 0, nivel: 1, tipo: 'subtotal', operacao: 'saldo', sinal: 1, contas: [],
            }),
            linha({
              id: 'linha-filha-criada', codigo: 'CAIXA', designacao: 'Caixa',
              parentId: 'linha-pai-criada', ordem: 0, nivel: 2,
              tipo: 'activo', operacao: 'debito', sinal: 1,
              contas: [associacao('c-caixa', -1, '11', 'linha-filha-criada')],
            }),
          ],
          { id: 'estrutura-criada', codigo: 'BAL', designacao: 'Balanço', activa: true }
        )
      );

      const resultado = await service.guardarEstrutura('emp-1', inputValido);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.estruturaRelatorio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            empresaId: 'emp-1', codigo: 'BAL', designacao: 'Balanço', tipo: 'balanco', activa: true,
          }),
        })
      );
      expect(prismaMock.linhaEstruturaRelatorio.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.linhaEstruturaRelatorio.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ codigo: 'TOTAL', parentId: null }) })
      );
      expect(prismaMock.linhaEstruturaRelatorio.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: expect.objectContaining({ codigo: 'CAIXA', parentId: null }) })
      );
      expect(prismaMock.linhaEstruturaRelatorio.update).toHaveBeenCalledWith({
        where: { id: 'linha-filha-criada' },
        data: { parentId: 'linha-pai-criada' },
      });
      expect(prismaMock.contaEstruturaRelatorio.createMany).toHaveBeenCalledWith({
        data: [{ linhaId: 'linha-filha-criada', contaId: 'c-caixa', sinal: -1 }],
        skipDuplicates: true,
      });
      expect(resultado).toMatchObject({
        id: 'estrutura-criada',
        empresaId: 'emp-1',
        codigo: 'BAL',
        linhas: [
          { codigo: 'TOTAL', parentCodigo: null, contas: [] },
          {
            codigo: 'CAIXA',
            parentCodigo: 'TOTAL',
            contas: [expect.objectContaining({ contaId: 'c-caixa', codigo: '11', sinal: -1 })],
          },
        ],
      });
    });

    it('não atualiza estrutura de outra empresa', async () => {
      prismaMock.contaContabil.findMany.mockResolvedValue([{ id: 'c-caixa' }]);
      prismaMock.estruturaRelatorio.findFirst.mockResolvedValue(null);

      await expect(service.guardarEstrutura('emp-1', {
        ...inputValido,
        id: 'estrutura-de-outra-empresa',
      })).rejects.toThrow(NotFoundError);

      expect(prismaMock.estruturaRelatorio.findFirst).toHaveBeenCalledWith({
        where: { id: 'estrutura-de-outra-empresa', empresaId: 'emp-1' },
        select: { id: true },
      });
      expect(prismaMock.estruturaRelatorio.update).not.toHaveBeenCalled();
      expect(prismaMock.linhaEstruturaRelatorio.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('estruturas', () => {
    it('lista estruturas da empresa, opcionalmente filtradas por tipo', async () => {
      const itens = [{ id: 'e1', linhas: [{ id: 'l1', codigo: 'ATIVO', ordem: 1 }] }];
      prismaMock.estruturaRelatorio.findMany.mockResolvedValue(itens);

      expect(await service.listarEstruturas('emp-1')).toEqual(itens);
      expect(await service.listarEstruturas('emp-1', 'balanco')).toEqual(itens);

      const esperado = {
        orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
        include: { linhas: { orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] } },
      };
      expect(prismaMock.estruturaRelatorio.findMany).toHaveBeenNthCalledWith(1, {
        where: { empresaId: 'emp-1' },
        ...esperado,
      });
      expect(prismaMock.estruturaRelatorio.findMany).toHaveBeenNthCalledWith(2, {
        where: { empresaId: 'emp-1', tipo: 'balanco' },
        ...esperado,
      });
    });

    it('exige empresa ao listar', async () => {
      await expect(service.listarEstruturas('')).rejects.toThrow(ValidationError);
      expect(prismaMock.estruturaRelatorio.findMany).not.toHaveBeenCalled();
    });

    it('obtém estrutura com parentCodigo e contas mapeados', async () => {
      prismaMock.estruturaRelatorio.findUnique.mockResolvedValue(
        estrutura([
          linha({
            id: 'l-pai', codigo: 'PAI', designacao: 'Pai', parentId: null,
            ordem: 1, nivel: 1, tipo: 'subtotal', operacao: 'saldo', sinal: 1, contas: [],
          }),
          linha({
            id: 'l-filha', codigo: 'FILHA', designacao: 'Filha', parentId: 'l-pai',
            ordem: 2, nivel: 2, tipo: 'activo', operacao: 'debito', sinal: 1,
            contas: [associacao('c-caixa', -1, '11', 'l-filha')],
          }),
        ])
      );

      const resultado = await service.obterEstrutura('estrutura-1');

      expect(resultado).toMatchObject({
        id: 'estrutura-1',
        empresaId: 'emp-1',
        linhas: [
          { codigo: 'PAI', parentCodigo: null, contas: [] },
          {
            codigo: 'FILHA',
            parentCodigo: 'PAI',
            contas: [{
              contaId: 'c-caixa', codigo: '11', designacao: 'Conta 11',
              classe: 1, tipo: 'activo', natureza: 'devedora', sinal: -1,
            }],
          },
        ],
      });
    });

    it('falha ao obter estrutura inexistente', async () => {
      await expect(service.obterEstrutura('estrutura-inexistente')).rejects.toThrow(NotFoundError);
    });

    it('remove estrutura da empresa', async () => {
      prismaMock.estruturaRelatorio.findFirst.mockResolvedValue({ id: 'estrutura-1' });
      prismaMock.estruturaRelatorio.delete.mockResolvedValue({});

      await service.removerEstrutura('emp-1', 'estrutura-1');

      expect(prismaMock.estruturaRelatorio.findFirst).toHaveBeenCalledWith({
        where: { id: 'estrutura-1', empresaId: 'emp-1' },
        select: { id: true },
      });
      expect(prismaMock.estruturaRelatorio.delete).toHaveBeenCalledWith({
        where: { id: 'estrutura-1' },
      });
    });

    it('não remove estrutura de outra empresa', async () => {
      prismaMock.estruturaRelatorio.findFirst.mockResolvedValue(null);

      await expect(service.removerEstrutura('emp-1', 'estrutura-de-outra-empresa'))
        .rejects.toThrow(NotFoundError);
      expect(prismaMock.estruturaRelatorio.delete).not.toHaveBeenCalled();
    });
  });
});
