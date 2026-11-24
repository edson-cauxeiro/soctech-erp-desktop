/**
 * @file saft.service.test.ts
 * @description Testes do motor de geração com foco na contabilidade geral.
 *
 * O Prisma é substituído por um duplo: o que importa aqui é a query que o
 * serviço faz (empresa, período e estados) e o que chega ao XML, não a
 * ligação à base de dados.
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SaftService } from './saft.service';

/** Empresa mínima para `carregarContexto`. */
const empresa = {
  id: 'emp-1',
  nome: 'Empresa Teste',
  nif: '501442600',
  identificador: '501442600',
  endereco: 'Lisboa',
  pais: 'PT',
  email: null,
  regimeIva: 'geral',
  moedaBase: 'EUR',
};

/** Lançamento publicado com duas linhas em partidas dobradas. */
const lancamento = (overrides: Record<string, unknown> = {}) => ({
  id: 'l1',
  numero: 12,
  dataContabilistica: new Date(2026, 2, 10),
  descricao: 'Venda de Março',
  estado: 'validado',
  createdAt: new Date(2026, 2, 10, 9, 0, 0),
  validadoEm: new Date(2026, 2, 10, 10, 30, 0),
  diario: { codigo: 'VD', designacao: 'Diário de Vendas' },
  linhas: [
    { numeroLinha: 1, debito: 100, credito: 0, conta: { codigo: '1010', designacao: 'Caixa' } },
    { numeroLinha: 2, debito: 0, credito: 100, conta: { codigo: '4010', designacao: 'Vendas' } },
  ],
  ...overrides,
});

/** Duplo do Prisma com as três consultas que o serviço usa. */
function prismaFake(lancamentos: unknown[] = [], faturas: unknown[] = []) {
  const lancamentoFindMany = vi.fn().mockResolvedValue(lancamentos);
  const faturaFindMany = vi.fn().mockResolvedValue(faturas);
  const prisma = {
    empresaConfig: { findUnique: vi.fn().mockResolvedValue(empresa) },
    faturaVenda: { findMany: faturaFindMany },
    lancamentoContabil: { findMany: lancamentoFindMany },
  };
  return { prisma: prisma as unknown as PrismaClient, lancamentoFindMany, faturaFindMany };
}

describe('SaftService — contabilidade geral', () => {
  it('carrega apenas lançamentos validados/estornado do período da empresa', async () => {
    const { prisma, lancamentoFindMany } = prismaFake([
      lancamento(),
      lancamento({
        id: 'rascunho',
        numero: 13,
        estado: 'rascunho',
        linhas: [
          { numeroLinha: 1, debito: 999, credito: 0, conta: { codigo: '1010' } },
          { numeroLinha: 2, debito: 0, credito: 999, conta: { codigo: '4010' } },
        ],
      }),
    ]);

    const resultado = await new SaftService(prisma).gerar({ empresaId: 'emp-1', ano: 2026, mes: 3 });

    expect(lancamentoFindMany).toHaveBeenCalledTimes(1);
    const args = lancamentoFindMany.mock.calls[0][0];
    expect(args.where).toEqual({
      empresaId: 'emp-1',
      dataContabilistica: { gte: new Date(2026, 2, 1), lt: new Date(2026, 3, 1) },
      estado: { in: ['validado', 'estornado'] },
    });
    expect(args.include.diario).toBeDefined();
    expect(args.include.linhas.include.conta).toBeDefined();

    // Mesmo que um rascunho chegue até ao mapeador, não pode entrar no ficheiro.
    expect(resultado.xml).not.toContain('<TransactionID>13</TransactionID>');
    expect(resultado.estatisticas.lancamentos).toBe(1);
  });

  it('inclui registos do último dia do período com limites superiores exclusivos', async () => {
    const mes = prismaFake();
    const resultadoMensal = await new SaftService(mes.prisma).gerar({ empresaId: 'emp-1', ano: 2026, mes: 3 });

    const limiteFaturas = mes.faturaFindMany.mock.calls[0][0].where.dataEmissao;
    const limiteLancamentos = mes.lancamentoFindMany.mock.calls[0][0].where.dataContabilistica;
    expect(limiteFaturas).toEqual({ gte: new Date(2026, 2, 1), lt: new Date(2026, 3, 1) });
    expect(limiteLancamentos).toEqual(limiteFaturas);
    expect(resultadoMensal.xml).toContain('<DateStart>2026-03-01</DateStart>');
    expect(resultadoMensal.xml).toContain('<DateEnd>2026-03-31</DateEnd>');

    const ano = prismaFake();
    const resultadoAnual = await new SaftService(ano.prisma).gerar({ empresaId: 'emp-1', ano: 2026 });

    const limiteFaturasAno = ano.faturaFindMany.mock.calls[0][0].where.dataEmissao;
    const limiteLancamentosAno = ano.lancamentoFindMany.mock.calls[0][0].where.dataContabilistica;
    expect(limiteFaturasAno).toEqual({ gte: new Date(2026, 0, 1), lt: new Date(2027, 0, 1) });
    expect(limiteLancamentosAno).toEqual(limiteFaturasAno);
    expect(resultadoAnual.xml).toContain('<DateEnd>2026-12-31</DateEnd>');
  });

  it('passa os lançamentos ao documento e acrescenta contadores às estatísticas', async () => {
    const { prisma } = prismaFake([
      lancamento(),
      lancamento({
        id: 'l2',
        numero: 14,
        descricao: 'Recebimento',
        estado: 'estornado',
        diario: { codigo: 'CX', designacao: 'Diário de Caixa' },
        linhas: [
          { numeroLinha: 1, debito: 50, credito: 0, conta: { codigo: '1010' } },
          { numeroLinha: 2, debito: 0, credito: 50, conta: { codigo: '4010' } },
        ],
      }),
    ]);

    const resultado = await new SaftService(prisma).gerar({ empresaId: 'emp-1', ano: 2026, mes: 3 });

    expect(resultado.xml).toContain('<GeneralLedgerEntries>');
    expect(resultado.xml).toContain('<JournalID>CX</JournalID>');
    expect(resultado.xml).toContain('<JournalID>VD</JournalID>');
    expect(resultado.xml).toContain('<TransactionID>12</TransactionID>');
    expect(resultado.xml).toContain('<TransactionID>14</TransactionID>');
    expect(resultado.xml).toContain('<AccountID>1010</AccountID>');
    expect(resultado.xml).toContain('<TotalDebit>150.00</TotalDebit>');
    expect(resultado.xml).toContain('<TotalCredit>150.00</TotalCredit>');

    expect(resultado.estatisticas).toMatchObject({
      lancamentos: 2,
      linhasContabeis: 4,
      totalDebitoContabil: '150.00',
      totalCreditoContabil: '150.00',
    });
    expect(resultado.estatisticas.documentos).toBe(0);
    expect(resultado.validacao.valido).toBe(true);
  });

  it('valida uma nota de crédito com IVA de ponta a ponta', async () => {
    const notaCredito = {
      id: 'nc-1',
      numero: 'NC 2026/0001',
      tipo: 'nota_credito',
      dataEmissao: new Date(2026, 2, 15, 16, 45),
      createdAt: new Date(2026, 2, 15, 16, 45),
      atcud: 'ATCUD-NC-1',
      clienteNome: 'Cliente Exemplo',
      clienteNif: '501442600',
      estadoDocumento: 'emitido',
      estadoPagamento: 'pendente',
      totalIva: 23,
      totalLiquido: 123,
      cliente: {
        codigo: 'CLI-001',
        nome: 'Cliente Exemplo',
        nif: '501442600',
        endereco: 'Rua A',
        codigoPostal: '1000-001',
        cidade: 'Lisboa',
        pais: 'PT',
        email: '',
        telefone: '',
      },
      linhas: [
        {
          artigoId: 'a-1',
          artigoCodigo: 'ART-001',
          artigoDescricao: 'Café',
          artigoUnidade: 'un',
          quantidade: 1,
          precoUnitario: 100,
          desconto: 0,
          taxaIva: 23,
          motivoIsencao: null,
          totalLinha: 123,
        },
      ],
    };
    const { prisma } = prismaFake([], [notaCredito]);

    const resultado = await new SaftService(prisma).gerar({ empresaId: 'emp-1', ano: 2026, mes: 3 });

    expect(resultado.validacao.totalErros).toBe(0);
    expect(resultado.validacao.valido).toBe(true);
    expect(resultado.validacao.problemas.map((p) => p.codigo)).not.toContain('SAFT-083');
    expect(resultado.xml).toContain('<InvoiceNo>NC 2026/0001</InvoiceNo>');
    expect(resultado.xml).toContain('<CreditAmount>100.00</CreditAmount>');
    expect(resultado.xml).toContain('<TaxBase>100.00</TaxBase>');
    expect(resultado.xml).toContain('<TaxAmount>23.00</TaxAmount>');
    expect(resultado.xml).toContain('<TaxPayable>23.00</TaxPayable>');
    expect(resultado.xml).toContain('<TotalCredit>100.00</TotalCredit>');
  });

  it('omite o bloco e os contadores contabilísticos quando não há lançamentos', async () => {
    const { prisma } = prismaFake([]);

    const resultado = await new SaftService(prisma).gerar({ empresaId: 'emp-1', ano: 2026, mes: 3 });

    expect(resultado.xml).not.toContain('<GeneralLedgerEntries>');
    expect(Object.keys(resultado.estatisticas)).toEqual([
      'documentos',
      'clientes',
      'artigos',
      'taxas',
      'totalLiquido',
    ]);
  });
});
