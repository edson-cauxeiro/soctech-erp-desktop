/**
 * @file demonstracoes.service.ts
 * @description Demonstrações financeiras configuráveis (Balanço, DR, Fluxos
 * de Caixa e Alterações no Capital Próprio).
 *
 * Nenhuma conta está escrita neste ficheiro. Cada demonstração é uma
 * `EstruturaRelatorio` com linhas e contas associadas; o serviço limita-se a
 * somar os movimentos validados das contas mapeadas e a agregar as linhas.
 * Isto permite que o plano de contas mude sem recompilar o ERP.
 */

import {
  OperacaoLinhaRelatorio,
  Prisma,
  PrismaClient,
  TipoEstruturaRelatorio,
  TipoLinhaRelatorio,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface ContaEstruturaDto {
  contaId: string;
  codigo: string;
  designacao: string;
  classe: number;
  tipo: string;
  natureza: string;
  sinal: number;
}

export interface LinhaEstruturaDto {
  id: string;
  codigo: string;
  designacao: string;
  parentCodigo: string | null;
  ordem: number;
  nivel: number;
  tipo: TipoLinhaRelatorio;
  operacao: OperacaoLinhaRelatorio;
  sinal: number;
  contas: ContaEstruturaDto[];
}

export interface EstruturaRelatorioDto {
  id: string;
  empresaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoEstruturaRelatorio;
  activa: boolean;
  linhas: LinhaEstruturaDto[];
}

export interface LinhaDemonstracaoDto {
  linhaId: string;
  codigo: string;
  designacao: string;
  nivel: number;
  tipo: TipoLinhaRelatorio;
  sinal: number;
  valor: string;
  valorInicial?: string;
  valorPeriodo?: string;
  valorFinal?: string;
  filhos: LinhaDemonstracaoDto[];
}

export interface DemonstracaoDto {
  estruturaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoEstruturaRelatorio;
  dataInicio: string;
  dataFim: string;
  linhas: LinhaDemonstracaoDto[];
  totais: Record<string, string>;
  avisos: string[];
}

export interface EstruturaRelatorioInput {
  id?: string;
  codigo: string;
  designacao: string;
  tipo: TipoEstruturaRelatorio;
  activa?: boolean;
  linhas: Array<{
    codigo: string;
    designacao: string;
    parentCodigo?: string | null;
    ordem?: number;
    nivel?: number;
    tipo?: TipoLinhaRelatorio;
    operacao?: OperacaoLinhaRelatorio;
    sinal?: number;
    contas?: Array<{ contaId: string; sinal?: number }>;
  }>;
}

interface SaldoConta {
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
}

type MapaSaldos = Map<string, SaldoConta>;

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function dinheiro(valor: Prisma.Decimal): string {
  return valor.toFixed(4);
}

function operacao(saldo: SaldoConta | undefined, tipo: OperacaoLinhaRelatorio): Prisma.Decimal {
  if (!saldo) return zero();
  switch (tipo) {
    case 'debito':
      return saldo.debito;
    case 'credito':
      return saldo.credito;
    case 'creditoMenosDebito':
      return saldo.credito.minus(saldo.debito);
    case 'saldo':
    default:
      return saldo.debito.minus(saldo.credito);
  }
}

function somarMapa(mapa: MapaSaldos, contaId: string): SaldoConta {
  return mapa.get(contaId) ?? { debito: zero(), credito: zero() };
}

function dataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export class DemonstracoesService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ─── Estruturas ───────────────────────────────────────────────────────────

  async listarEstruturas(empresaId: string, tipo?: TipoEstruturaRelatorio) {
    if (!empresaId) throw new ValidationError('A empresa é obrigatória.');
    return this.prisma.estruturaRelatorio.findMany({
      where: { empresaId, ...(tipo ? { tipo } : {}) },
      orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      include: { linhas: { orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] } },
    });
  }

  async obterEstrutura(id: string): Promise<EstruturaRelatorioDto> {
    const estrutura = await this.prisma.estruturaRelatorio.findUnique({
      where: { id },
      include: {
        linhas: {
          orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }],
          include: {
            contas: {
              include: {
                conta: {
                  select: {
                    id: true,
                    codigo: true,
                    designacao: true,
                    classe: true,
                    tipo: true,
                    natureza: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!estrutura) throw new NotFoundError('Estrutura de relatório não encontrada.');

    const porId = new Map(estrutura.linhas.map((l) => [l.id, l.codigo]));
    return {
      id: estrutura.id,
      empresaId: estrutura.empresaId,
      codigo: estrutura.codigo,
      designacao: estrutura.designacao,
      tipo: estrutura.tipo,
      activa: estrutura.activa,
      linhas: estrutura.linhas.map((linha) => ({
        id: linha.id,
        codigo: linha.codigo,
        designacao: linha.designacao,
        parentCodigo: linha.parentId ? porId.get(linha.parentId) ?? null : null,
        ordem: linha.ordem,
        nivel: linha.nivel,
        tipo: linha.tipo,
        operacao: linha.operacao,
        sinal: linha.sinal,
        contas: linha.contas.map((c) => ({
          contaId: c.conta.id,
          codigo: c.conta.codigo,
          designacao: c.conta.designacao,
          classe: c.conta.classe,
          tipo: c.conta.tipo,
          natureza: c.conta.natureza,
          sinal: c.sinal,
        })),
      })),
    };
  }

  /**
   * Substitui a estrutura completa numa transacção. A UI edita a árvore toda e
   * grava de uma vez; apagar e recriar as linhas evita ter de calcular diffs e
   * mantém o código simples. As associações de contas caem por cascata.
   */
  async guardarEstrutura(empresaId: string, input: EstruturaRelatorioInput): Promise<EstruturaRelatorioDto> {
    if (!empresaId) throw new ValidationError('A empresa é obrigatória.');
    if (!input.codigo?.trim()) throw new ValidationError('O código da estrutura é obrigatório.');
    if (!input.designacao?.trim()) throw new ValidationError('A designação da estrutura é obrigatória.');
    if (!Array.isArray(input.linhas) || input.linhas.length === 0) {
      throw new ValidationError('A estrutura tem de ter pelo menos uma linha.');
    }

    const codigos = new Set<string>();
    const pais = new Set<string>();
    for (const linha of input.linhas) {
      if (!linha.codigo?.trim()) throw new ValidationError('Todas as linhas precisam de código.');
      if (codigos.has(linha.codigo)) {
        throw new ValidationError(`Código de linha duplicado: ${linha.codigo}.`);
      }
      codigos.add(linha.codigo);
      if (linha.parentCodigo) pais.add(linha.parentCodigo);
    }
    for (const pai of pais) {
      if (!codigos.has(pai)) {
        throw new ValidationError(`A linha-pai "${pai}" não existe na estrutura.`);
      }
    }
    const comContas = new Set(
      input.linhas.filter((l) => (l.contas?.length ?? 0) > 0).map((l) => l.codigo)
    );
    for (const filho of input.linhas) {
      if (filho.parentCodigo && comContas.has(filho.parentCodigo)) {
        throw new ValidationError(
          `A linha "${filho.parentCodigo}" tem contas associadas e não pode ter filhas.`
        );
      }
    }

    const contaIds = [
      ...new Set(input.linhas.flatMap((l) => (l.contas ?? []).map((c) => c.contaId))),
    ];
    if (contaIds.length > 0) {
      const contas = await this.prisma.contaContabil.findMany({
        where: { empresaId, id: { in: contaIds } },
        select: { id: true },
      });
      const existentes = new Set(contas.map((c) => c.id));
      const emFalta = contaIds.filter((id) => !existentes.has(id));
      if (emFalta.length > 0) {
        throw new ValidationError(`Contas inexistentes nesta empresa: ${emFalta.join(', ')}.`);
      }
    }

    const estruturaId = await this.prisma.$transaction(async (tx) => {
      let id = input.id;
      if (id) {
        const existente = await tx.estruturaRelatorio.findFirst({
          where: { id, empresaId },
          select: { id: true },
        });
        if (!existente) throw new NotFoundError('Estrutura de relatório não encontrada.');
        await tx.estruturaRelatorio.update({
          where: { id },
          data: {
            codigo: input.codigo.trim(),
            designacao: input.designacao.trim(),
            tipo: input.tipo,
            activa: input.activa ?? true,
          },
        });
        await tx.linhaEstruturaRelatorio.deleteMany({ where: { estruturaId: id } });
      } else {
        const criada = await tx.estruturaRelatorio.create({
          data: {
            empresaId,
            codigo: input.codigo.trim(),
            designacao: input.designacao.trim(),
            tipo: input.tipo,
            activa: input.activa ?? true,
          },
          select: { id: true },
        });
        id = criada.id;
      }

      const porCodigo = new Map<string, string>();
      const ordenadas = [...input.linhas].sort(
        (a, b) => (a.nivel ?? 1) - (b.nivel ?? 1) || (a.ordem ?? 0) - (b.ordem ?? 0)
      );

      for (const linha of ordenadas) {
        const criada = await tx.linhaEstruturaRelatorio.create({
          data: {
            estruturaId: id,
            codigo: linha.codigo.trim(),
            designacao: linha.designacao.trim(),
            parentId: null,
            ordem: linha.ordem ?? 0,
            nivel: linha.nivel ?? 1,
            tipo: linha.tipo ?? 'subtotal',
            operacao: linha.operacao ?? 'saldo',
            sinal: linha.sinal ?? 1,
          },
          select: { id: true },
        });
        porCodigo.set(linha.codigo, criada.id);
      }

      for (const linha of ordenadas) {
        if (!linha.parentCodigo) continue;
        const linhaId = porCodigo.get(linha.codigo)!;
        const paiId = porCodigo.get(linha.parentCodigo)!;
        await tx.linhaEstruturaRelatorio.update({
          where: { id: linhaId },
          data: { parentId: paiId },
        });
      }

      for (const linha of ordenadas) {
        if (!linha.contas || linha.contas.length === 0) continue;
        const linhaId = porCodigo.get(linha.codigo)!;
        await tx.contaEstruturaRelatorio.createMany({
          data: linha.contas.map((conta) => ({
            linhaId,
            contaId: conta.contaId,
            sinal: conta.sinal ?? 1,
          })),
          skipDuplicates: true,
        });
      }

      return id;
    });

    return this.obterEstrutura(estruturaId);
  }

  async removerEstrutura(empresaId: string, id: string): Promise<void> {
    const existente = await this.prisma.estruturaRelatorio.findFirst({
      where: { id, empresaId },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Estrutura de relatório não encontrada.');
    await this.prisma.estruturaRelatorio.delete({ where: { id } });
  }

  // ─── Geração ──────────────────────────────────────────────────────────────

  async gerar(estruturaId: string, dataInicio: Date | string, dataFim: Date | string): Promise<DemonstracaoDto> {
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new ValidationError('As datas da demonstração são inválidas.');
    }
    if (fim < inicio) {
      throw new ValidationError('A data de fim não pode ser anterior à de início.');
    }

    const estrutura = await this.prisma.estruturaRelatorio.findUnique({
      where: { id: estruturaId },
      include: {
        linhas: {
          orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }],
          include: {
            contas: { include: { conta: { select: { id: true, codigo: true } } } },
          },
        },
      },
    });
    if (!estrutura) throw new NotFoundError('Estrutura de relatório não encontrada.');
    if (estrutura.linhas.length === 0) {
      throw new ValidationError('A estrutura não tem linhas configuradas.');
    }

    const contaIds = [
      ...new Set(estrutura.linhas.flatMap((l) => l.contas.map((c) => c.contaId))),
    ];

    const acumulado = estrutura.tipo === 'balanco';
    const saldosPeriodo = await this.carregarSaldos(estrutura.empresaId, contaIds, inicio, fim, acumulado);
    const saldosAbertura =
      estrutura.tipo === 'alteracoesCapitalProprio'
        ? await this.carregarSaldos(estrutura.empresaId, contaIds, inicio, fim, false, true)
        : null;

    const avisos: string[] = [];
    if (contaIds.length === 0) {
      avisos.push('A estrutura não tem contas associadas. Todos os valores serão zero.');
    }

    const porId = new Map(estrutura.linhas.map((l) => [l.id, l]));
    const calculadas = new Map<string, LinhaDemonstracaoDto>();
    const emCalculo = new Set<string>();

    const calcular = (linhaId: string): LinhaDemonstracaoDto => {
      const existente = calculadas.get(linhaId);
      if (existente) return existente;
      if (emCalculo.has(linhaId)) {
        throw new ValidationError('A estrutura tem um ciclo na hierarquia de linhas.');
      }
      emCalculo.add(linhaId);

      const linha = porId.get(linhaId);
      if (!linha) throw new ValidationError('Linha da estrutura não encontrada.');

      let valor = zero();
      let valorInicial: Prisma.Decimal | undefined;
      let valorPeriodo: Prisma.Decimal | undefined;

      if (linha.contas.length > 0) {
        for (const associacao of linha.contas) {
          const saldo = somarMapa(saldosPeriodo, associacao.contaId);
          valor = valor.plus(
            operacao(saldo, linha.operacao).times(associacao.sinal).times(linha.sinal)
          );
          if (saldosAbertura) {
            const saldoAbertura = somarMapa(saldosAbertura, associacao.contaId);
            const inicial = operacao(saldoAbertura, linha.operacao)
              .times(associacao.sinal)
              .times(linha.sinal);
            valorInicial = (valorInicial ?? zero()).plus(inicial);
            valorPeriodo = (valorPeriodo ?? zero()).plus(
              operacao(saldo, linha.operacao).times(associacao.sinal).times(linha.sinal)
            );
          }
        }
      } else {
        const filhas = estrutura.linhas
          .filter((l) => l.parentId === linhaId)
          .sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
        for (const filha of filhas) {
          const calculada = calcular(filha.id);
          valor = valor.plus(calculada.valorFinal ?? calculada.valor);
          if (saldosAbertura) {
            valorInicial = (valorInicial ?? zero()).plus(calculada.valorInicial ?? zero());
            valorPeriodo = (valorPeriodo ?? zero()).plus(calculada.valorPeriodo ?? zero());
          }
        }
        valor = valor.times(linha.sinal);
      }

      const resultado: LinhaDemonstracaoDto = {
        linhaId: linha.id,
        codigo: linha.codigo,
        designacao: linha.designacao,
        nivel: linha.nivel,
        tipo: linha.tipo,
        sinal: linha.sinal,
        valor: dinheiro(valor),
        filhos: estrutura.linhas
          .filter((l) => l.parentId === linhaId)
          .sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo))
          .map((filha) => calcular(filha.id)),
      };

      if (saldosAbertura) {
        const inicial = valorInicial ?? zero();
        const periodo = valorPeriodo ?? zero();
        resultado.valorInicial = dinheiro(inicial);
        resultado.valorPeriodo = dinheiro(periodo);
        resultado.valorFinal = dinheiro(inicial.plus(periodo));
      }

      emCalculo.delete(linhaId);
      calculadas.set(linhaId, resultado);
      return resultado;
    };

    const topo = estrutura.linhas
      .filter((l) => !l.parentId)
      .sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
    const linhas = topo.map((l) => calcular(l.id));

    const totais: Record<string, string> = {};
    for (const linha of linhas) {
      totais[linha.codigo] = linha.valorFinal ?? linha.valor;
    }

    if (estrutura.tipo === 'balanco') {
      const ativo = linhas
        .filter((l) => l.tipo === 'activo')
        .reduce((soma, l) => soma.plus(new Prisma.Decimal(l.valor)), zero());
      const passivo = linhas
        .filter((l) => l.tipo === 'passivo')
        .reduce((soma, l) => soma.plus(new Prisma.Decimal(l.valor)), zero());
      const capital = linhas
        .filter((l) => l.tipo === 'capitalProprio')
        .reduce((soma, l) => soma.plus(new Prisma.Decimal(l.valor)), zero());
      totais.ATIVO = dinheiro(ativo);
      totais.PASSIVO = dinheiro(passivo);
      totais.CAPITAL_PROPRIO = dinheiro(capital);
      totais.TOTAL_PASSIVO_CAPITAL = dinheiro(passivo.plus(capital));
      if (!ativo.equals(passivo.plus(capital))) {
        avisos.push(
          `O balanço não está equilibrado: activo ${dinheiro(ativo)} vs passivo + capital próprio ${dinheiro(
            passivo.plus(capital)
          )}.`
        );
      }
    }

    const contasComMovimento = await this.contasComMovimento(
      estrutura.empresaId,
      inicio,
      fim,
      acumulado
    );
    const mapeadas = new Set(contaIds);
    const semMapeamento = contasComMovimento.filter((c) => !mapeadas.has(c.id));
    if (semMapeamento.length > 0) {
      avisos.push(
        `${semMapeamento.length} conta(s) com movimento não estão associadas a esta estrutura: ${semMapeamento
          .slice(0, 10)
          .map((c) => c.codigo)
          .join(', ')}${semMapeamento.length > 10 ? '…' : ''}.`
      );
    }

    return {
      estruturaId: estrutura.id,
      codigo: estrutura.codigo,
      designacao: estrutura.designacao,
      tipo: estrutura.tipo,
      dataInicio: dataIso(inicio),
      dataFim: dataIso(fim),
      linhas,
      totais,
      avisos,
    };
  }

  private async carregarSaldos(
    empresaId: string,
    contaIds: string[],
    dataInicio: Date,
    dataFim: Date,
    acumulado: boolean,
    antesDoPeriodo = false
  ): Promise<MapaSaldos> {
    const mapa: MapaSaldos = new Map();
    if (contaIds.length === 0) return mapa;

    const dataWhere = antesDoPeriodo
      ? { lt: dataInicio }
      : acumulado
        ? { lte: dataFim }
        : { gte: dataInicio, lte: dataFim };

    const agregados = await this.prisma.linhaLancamentoContabil.groupBy({
      by: ['contaId'],
      where: {
        contaId: { in: contaIds },
        lancamento: {
          empresaId,
          estado: 'validado',
          dataContabilistica: dataWhere,
        },
      },
      _sum: { debito: true, credito: true },
    });

    for (const agregado of agregados) {
      mapa.set(agregado.contaId, {
        debito: agregado._sum.debito ?? zero(),
        credito: agregado._sum.credito ?? zero(),
      });
    }
    return mapa;
  }

  private async contasComMovimento(
    empresaId: string,
    dataInicio: Date,
    dataFim: Date,
    acumulado: boolean
  ): Promise<Array<{ id: string; codigo: string }>> {
    const dataWhere = acumulado ? { lte: dataFim } : { gte: dataInicio, lte: dataFim };
    const agregados = await this.prisma.linhaLancamentoContabil.groupBy({
      by: ['contaId'],
      where: {
        lancamento: { empresaId, estado: 'validado', dataContabilistica: dataWhere },
      },
    });
    if (agregados.length === 0) return [];
    return this.prisma.contaContabil.findMany({
      where: { empresaId, id: { in: agregados.map((a) => a.contaId) } },
      select: { id: true, codigo: true },
      orderBy: { codigo: 'asc' },
    });
  }
}

export const demonstracoesService = new DemonstracoesService();
