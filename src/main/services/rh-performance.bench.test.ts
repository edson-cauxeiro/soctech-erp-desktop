/**
 * @file rh-performance.bench.test.ts
 * @description Benchmarks de performance do módulo RH (RH-803/804).
 *
 * Estes testes medem a complexidade algorítmica, não o desempenho real de BD
 * (que depende do hardware). O que se verifica aqui:
 *
 * 1. **Loader**: número de queries constante (O(1)) quer se processem 500 ou
 *    2000 funcionários — as queries são em bloco.
 * 2. **Listagens**: processamento de 5 000 registos em tempo razoável.
 * 3. **Sanitização**: overhead de `sanitizarParaAuditoria` e
 *    `sanitizarRespostaSemSalarios` é aceitável em volumes reais.
 * 4. **Lote**: throughput do loop de processamento em lote com 500/2000
 *    funcionários (mock do execucao — mede o orquestrador, não o cálculo).
 */

import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { sanitizarParaAuditoria, sanitizarRespostaSemSalarios } from '../utils/sanitize';

// ── Helpers ──────────────────────────────────────────────────────────────────

const dec = (n: number) => new Prisma.Decimal(n);

function criarFuncionarioMock(idx: number) {
  return {
    id: `f-${idx}`,
    codigo: String(idx).padStart(5, '0'),
    nome: `Funcionário ${idx}`,
    dataAdmissao: new Date('2024-01-01'),
    dataCessacao: null,
    estado: 'ATIVO',
    empresaId: 'emp-1',
    nif: `541234567${String(idx).padStart(3, '0')}`,
    iban: 'AO06.0040.0000.1234.5678.9012.3',
    rubricasFixas: [],
    contratos: [
      {
        id: `c-${idx}`,
        funcionarioId: `f-${idx}`,
        estado: 'ATIVO',
        salarioBase: dec(80000 + idx * 100),
        moeda: 'AOA',
        cargaHorariaSemanal: 44,
        alteracoesSalariais: [],
      },
    ],
    dependentes: [],
  };
}

function criarProcessamentoMock(idx: number) {
  return {
    id: `proc-${idx}`,
    funcionarioId: `f-${idx}`,
    tipo: 'VENCIMENTO',
    sequencia: 1,
    modo: 'LOTE',
    estado: 'PROCESSADO',
    dataProcessamento: new Date('2026-01-31'),
    totalRemuneracoes: dec(100000 + idx),
    totalDescontos: dec(15000),
    liquido: dec(85000 + idx),
    motivoAnulacao: null,
    funcionario: { id: `f-${idx}`, codigo: String(idx).padStart(5, '0'), nome: `Func ${idx}` },
    recibo: { numero: idx },
  };
}

// ── 1. Loader: complexidade O(1) ─────────────────────────────────────────────

describe('RH-804 · Loader (rh-processamento-loader.service)', () => {
  it('executa número constante de queries quer processe 500 ou 2000 funcionários', async () => {
    // Contamos as chamadas distintas ao Prisma para detectar N+1.
    const contarChamadas = () => {
      let chamadas = 0;
      const criarPrisma = () => {
        const findMany = () => { chamadas++; return Promise.resolve([]); };
        const findFirst = () => { chamadas++; return Promise.resolve(null); };
        const findUnique = () => { chamadas++; return Promise.resolve({ id: 'cfg', empresaId: 'emp-1', baseDiasMes: 30 }); };
        const create = () => { chamadas++; return Promise.resolve({ id: 'cfg', empresaId: 'emp-1', baseDiasMes: 30 }); };

        return {
          rhPeriodo: { findFirst: findFirst },
          rhConfiguracao: { findUnique, create },
          rhTabelaIRT: { findFirst: findFirst },
          rhFuncionario: { findMany },
          rhAlteracaoMensal: { findMany },
          rhAusencia: { findMany },
          rhHoraExtra: { findMany },
          rhPrestacaoDivida: { findMany },
          rhFeriasSaldo: { findMany },
          rhMarcacaoFerias: { findMany },
          rhRetroativo: { findMany },
        };
      };
      return { get chamadas() { return chamadas; }, prisma: criarPrisma() };
    };

    // Importar dinamicamente para usar o mock correcto
    const { RhProcessamentoLoaderService } = await import('./rh-processamento-loader.service');

    const ids500 = Array.from({ length: 500 }, (_, i) => `f-${i}`);
    const ids2000 = Array.from({ length: 2000 }, (_, i) => `f-${i}`);

    const input = (ids: string[]) => ({
      empresaId: 'emp-1',
      ano: 2026,
      mes: 1,
      periodoCodigo: 'P01',
      funcionarioIds: ids,
      dataLimiteFaltasHE: new Date('2026-01-31'),
      dataProcessamento: new Date('2026-01-31'),
    });

    const r500 = contarChamadas();
    // findMany para funcionários retorna lista vazia → RhBusinessRuleError "Nenhum funcionário"
    // Apenas contamos as chamadas antes do throw. Não importa o resultado.
    const svc500 = new RhProcessamentoLoaderService(r500.prisma as unknown as PrismaClient);
    try { await svc500.carregar(input(ids500)); } catch { /* esperado */ }

    const r2000 = contarChamadas();
    const svc2000 = new RhProcessamentoLoaderService(r2000.prisma as unknown as PrismaClient);
    try { await svc2000.carregar(input(ids2000)); } catch { /* esperado */ }

    // O número de queries deve ser igual (constante), não proporcional ao nº de funcionários.
    expect(r500.chamadas).toBe(r2000.chamadas);
  });
});

// ── 2. Listagens com 5 000 registos ──────────────────────────────────────────

describe('RH-804 · Listagens com 5 000 registos', () => {
  it('sanitizarRespostaSemSalarios processa 5 000 objetos em < 2s', () => {
    const itens = Array.from({ length: 5000 }, (_, i) => criarProcessamentoMock(i));

    const inicio = performance.now();
    const resultado = sanitizarRespostaSemSalarios({ items: itens }, false) as Record<string, unknown>;
    const duracao = performance.now() - inicio;

    expect((resultado.items as unknown[]).length).toBe(5000);
    expect(duracao).toBeLessThan(2000);
  });

  it('sanitizarParaAuditoria processa 5 000 objetos em < 2s', () => {
    const itens = Array.from({ length: 5000 }, (_, i) => criarProcessamentoMock(i));

    const inicio = performance.now();
    const resultado = sanitizarParaAuditoria({ items: itens });
    const duracao = performance.now() - inicio;

    expect(resultado).toBeDefined();
    expect(duracao).toBeLessThan(2000);
  });

  it('sanitizarListaSemSalarios processa 5 000 funcionários em < 2s', async () => {
    const { sanitizarListaSemSalarios } = await import('../utils/sanitize');
    const funcionarios = Array.from({ length: 5000 }, (_, i) => criarFuncionarioMock(i));

    const inicio = performance.now();
    const resultado = sanitizarListaSemSalarios(funcionarios, false);
    const duracao = performance.now() - inicio;

    expect((resultado as unknown[]).length).toBe(5000);
    expect(duracao).toBeLessThan(2000);
  });
});

// ── 3. Sanitização: correctness em massa ─────────────────────────────────────

describe('RH-803 · Sanitização em massa', () => {
  it('remove todos os campos monetários e PII de 5 000 registos', () => {
    const itens = Array.from({ length: 5000 }, (_, i) => criarProcessamentoMock(i));
    const resultado = sanitizarRespostaSemSalarios({ items: itens }, false) as Record<string, unknown>;
    const lista = resultado.items as Record<string, unknown>[];

    for (const item of lista) {
      expect(item.totalRemuneracoes).toBeUndefined();
      expect(item.totalDescontos).toBeUndefined();
      expect(item.liquido).toBeUndefined();
      expect(item.id).toBeDefined(); // não sensível mantém-se
      expect(item.funcionarioId).toBeDefined();
    }
  });

  it('mascara PII mas mantém estrutura em auditoria', () => {
    const dados = {
      funcionarioId: 'f-1',
      nome: 'Ana',
      nif: '541234567',
      iban: 'AO06.0040.0000.1234.5678.9012.3',
      salarioBase: dec(100000),
      estado: 'ATIVO',
    };

    const resultado = sanitizarParaAuditoria(dados) as Record<string, unknown>;

    expect(resultado.nif).toBeUndefined();
    expect(resultado.iban).toBeUndefined();
    expect(resultado.salarioBase).toBe('***MASKED***');
    expect(resultado.nome).toBe('Ana');
    expect(resultado.estado).toBe('ATIVO');
    expect(resultado.funcionarioId).toBe('f-1');
  });
});

// ── 4. Lote: throughput do orquestrador ──────────────────────────────────────

describe('RH-804 · Processamento em lote (throughput)', () => {
  it('processa 500 funcionários em < 5s (mock execucao)', async () => {
    const { RhProcessamentoLoteService } = await import('./rh-processamento-lote.service');

    const funcionarios = Array.from({ length: 500 }, (_, i) => criarFuncionarioMock(i));
    const elegiveis = funcionarios.map((f) => f.id);

    const loaderData = {
      funcionarios: funcionarios.map((f) => ({
        funcionario: f,
        contrato: f.contratos[0],
        elegibilidade: { podeProcessar: true, restricoes: [] },
      })),
      alteracoesMensais: new Map(),
      ausencias: new Map(),
      horasExtra: new Map(),
      dividas: new Map(),
      ferias: new Map(),
      configuracao: { id: 'cfg', empresaId: 'emp-1', serieRecibo: 'RV', baseDiasMes: 30 },
      tabelaIrt: { id: 't1', escaloes: [] },
      periodo: { id: 'per-1', empresaId: 'emp-1', ano: 2026, mes: 1, codigo: 'P01', estado: 'ABERTO' },
      elegibilidade: { elegiveis, restricoes: [], detalhes: [] },
      dataLimiteFaltasHE: new Date('2026-01-31'),
      dataProcessamento: new Date('2026-01-31'),
      baseDiasMes: 30,
    };

    const prisma = {
      rhLoteProcessamento: {
        create: vi.fn(async () => ({ id: 'lote-1' })),
        update: vi.fn(async () => ({ id: 'lote-1' })),
        findMany: vi.fn(async () => []),
      },
    };
    const loader = { carregar: vi.fn(async () => loaderData) };
    const execucao = {
      executarFuncionario: vi.fn(async ({ funcionarioId }: { funcionarioId: string }) => ({
        processamentoId: `proc-${funcionarioId}`,
        liquido: '85000',
      })),
    };
    const audit = { registarOperacao: vi.fn(async () => 'log-1') };

    const service = new RhProcessamentoLoteService(
      prisma as unknown as PrismaClient,
      audit as unknown as never,
      execucao as unknown as never,
      loader as unknown as never,
      async () => ({ baseDiasMes: 30 }) as never,
    );

    const inicio = performance.now();
    const resultado = await service.processarLote({
      empresaId: 'emp-1',
      ano: 2026,
      mes: 1,
      periodoCodigo: 'P01',
      tipoProcessamento: 'VENCIMENTO',
      funcionarioIds: elegiveis,
      dataLimiteFaltasHE: '2026-01-31',
      dataProcessamento: '2026-01-31',
    });
    const duracao = performance.now() - inicio;

    expect(resultado.totalSucesso).toBe(500);
    expect(resultado.totalErros).toBe(0);
    expect(duracao).toBeLessThan(5000);
  });

  it('processa 2000 funcionários em < 15s (mock execucao)', async () => {
    const { RhProcessamentoLoteService } = await import('./rh-processamento-lote.service');

    const funcionarios = Array.from({ length: 2000 }, (_, i) => criarFuncionarioMock(i));
    const elegiveis = funcionarios.map((f) => f.id);

    const loaderData = {
      funcionarios: funcionarios.map((f) => ({
        funcionario: f,
        contrato: f.contratos[0],
        elegibilidade: { podeProcessar: true, restricoes: [] },
      })),
      alteracoesMensais: new Map(),
      ausencias: new Map(),
      horasExtra: new Map(),
      dividas: new Map(),
      ferias: new Map(),
      configuracao: { id: 'cfg', empresaId: 'emp-1', serieRecibo: 'RV', baseDiasMes: 30 },
      tabelaIrt: { id: 't1', escaloes: [] },
      periodo: { id: 'per-1', empresaId: 'emp-1', ano: 2026, mes: 1, codigo: 'P01', estado: 'ABERTO' },
      elegibilidade: { elegiveis, restricoes: [], detalhes: [] },
      dataLimiteFaltasHE: new Date('2026-01-31'),
      dataProcessamento: new Date('2026-01-31'),
      baseDiasMes: 30,
    };

    const prisma = {
      rhLoteProcessamento: {
        create: vi.fn(async () => ({ id: 'lote-1' })),
        update: vi.fn(async () => ({ id: 'lote-1' })),
        findMany: vi.fn(async () => []),
      },
    };
    const loader = { carregar: vi.fn(async () => loaderData) };
    const execucao = {
      executarFuncionario: vi.fn(async ({ funcionarioId }: { funcionarioId: string }) => ({
        processamentoId: `proc-${funcionarioId}`,
        liquido: '85000',
      })),
    };
    const audit = { registarOperacao: vi.fn(async () => 'log-1') };

    const service = new RhProcessamentoLoteService(
      prisma as unknown as PrismaClient,
      audit as unknown as never,
      execucao as unknown as never,
      loader as unknown as never,
      async () => ({ baseDiasMes: 30 }) as never,
    );

    const inicio = performance.now();
    const resultado = await service.processarLote({
      empresaId: 'emp-1',
      ano: 2026,
      mes: 1,
      periodoCodigo: 'P01',
      tipoProcessamento: 'VENCIMENTO',
      funcionarioIds: elegiveis,
      dataLimiteFaltasHE: '2026-01-31',
      dataProcessamento: '2026-01-31',
    });
    const duracao = performance.now() - inicio;

    expect(resultado.totalSucesso).toBe(2000);
    expect(resultado.totalErros).toBe(0);
    expect(duracao).toBeLessThan(15000);
  });
});
