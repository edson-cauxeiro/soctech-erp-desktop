/**
 * @file relatorios-contabilidade.service.ts
 * @description Relatórios contabilísticos derivados exclusivamente de linhas validadas.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  balanceteFiltersSchema,
  razaoFiltersSchema,
  diariosFiltersSchema,
  contaCorrenteFiltersSchema,
  BalanceteFilters,
  RazaoFilters,
  DiariosFilters,
  ContaCorrenteFilters,
} from '../validators/relatorios.validator';
import { NotFoundError } from '../utils/errors';

function decimalParaString(valor: Prisma.Decimal): string {
  return valor.toFixed(4);
}

class RelatoriosContabilidadeService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  async balancete(filters: BalanceteFilters): Promise<{
    items: Array<{
      contaId: string;
      codigo: string;
      designacao: string;
      nivel: number;
      classe: number;
      natureza: string;
      debito: string;
      credito: string;
      saldo: string;
      linhas: number;
    }>;
    totais: { debito: string; credito: string; saldo: string };
  }> {
    const f = balanceteFiltersSchema.parse(filters);

    const wherePeriodo: Prisma.LinhaLancamentoContabilWhereInput = {
      lancamento: {
        estado: 'validado',
        empresaId: f.empresaId,
        ...(f.exercicioId ? { exercicioId: f.exercicioId } : {}),
        ...(f.periodoId ? { periodoId: f.periodoId } : {}),
        ...(f.diarioId ? { diarioId: f.diarioId } : {}),
        ...(f.dataInicio || f.dataFim
          ? {
              dataContabilistica: {
                ...(f.dataInicio ? { gte: f.dataInicio } : {}),
                ...(f.dataFim ? { lte: f.dataFim } : {}),
              },
            }
          : {}),
      },
    };

    const linhasAgregadas = await this.prisma.linhaLancamentoContabil.groupBy({
      by: ['contaId'],
      where: wherePeriodo,
      _sum: { debito: true, credito: true },
      _count: { id: true },
    });

    const contaIds = linhasAgregadas.map((l) => l.contaId);
    const contas = await this.prisma.contaContabil.findMany({
      where: { id: { in: contaIds } },
      select: { id: true, codigo: true, designacao: true, nivel: true, classe: true, natureza: true },
    });
    const contasMap = new Map(contas.map((c) => [c.id, c]));

    const items: Array<{
      contaId: string;
      codigo: string;
      designacao: string;
      nivel: number;
      classe: number;
      natureza: string;
      debito: string;
      credito: string;
      saldo: string;
      linhas: number;
    }> = [];

    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);

    for (const agg of linhasAgregadas) {
      const conta = contasMap.get(agg.contaId);
      if (!conta) continue;

      const debito = new Prisma.Decimal(agg._sum.debito ?? 0);
      const credito = new Prisma.Decimal(agg._sum.credito ?? 0);

      const saldo = conta.natureza === 'devedora'
        ? debito.minus(credito)
        : credito.minus(debito);

      if (!f.incluirSaldoZero && saldo.isZero() && debito.isZero() && credito.isZero()) continue;

      items.push({
        contaId: conta.id,
        codigo: conta.codigo,
        designacao: conta.designacao,
        nivel: conta.nivel,
        classe: conta.classe,
        natureza: conta.natureza,
        debito: decimalParaString(debito),
        credito: decimalParaString(credito),
        saldo: decimalParaString(saldo),
        linhas: agg._count.id,
      });

      totalDebito = totalDebito.plus(debito);
      totalCredito = totalCredito.plus(credito);
    }

    items.sort((a, b) => a.codigo.localeCompare(b.codigo));

    if (f.acumulado && f.exercicioId) {
      await this.agregarPais(f.empresaId, items, f.exercicioId, wherePeriodo);
    }

    return {
      items,
      totais: {
        debito: decimalParaString(totalDebito),
        credito: decimalParaString(totalCredito),
        saldo: decimalParaString(totalDebito.minus(totalCredito)),
      },
    };
  }

  async razao(filters: RazaoFilters): Promise<{
    conta: { id: string; codigo: string; designacao: string; natureza: string; saldoTransitado: string };
    items: Array<{
      id: string;
      numeroLinha: number;
      dataContabilistica: string | Date;
      numeroLancamento: number | null;
      descricaoLancamento: string;
      debito: string;
      credito: string;
      saldoCorrente: string;
      contaCodigo: string;
      contaDesignacao: string;
    }>;
    saldoFinal: string;
  }> {
    const f = razaoFiltersSchema.parse(filters);

    const conta = await this.prisma.contaContabil.findFirst({
      where: { id: f.contaId, empresaId: f.empresaId },
      select: { id: true, codigo: true, designacao: true, natureza: true },
    });
    if (!conta) throw new NotFoundError('Conta não encontrada.');

    const wherePeriodo: Prisma.LinhaLancamentoContabilWhereInput = {
      contaId: f.contaId,
      lancamento: {
        estado: 'validado',
        ...(f.exercicioId ? { exercicioId: f.exercicioId } : {}),
        ...(f.periodoId ? { periodoId: f.periodoId } : {}),
        ...(f.dataInicio || f.dataFim
          ? {
              dataContabilistica: {
                ...(f.dataInicio ? { gte: f.dataInicio } : {}),
                ...(f.dataFim ? { lte: f.dataFim } : {}),
              },
            }
          : {}),
      },
    };

    const linhas = await this.prisma.linhaLancamentoContabil.findMany({
      where: wherePeriodo,
      include: {
        lancamento: {
          select: {
            id: true,
            numero: true,
            dataContabilistica: true,
            descricao: true,
          },
        },
      },
      orderBy: [{ lancamento: { dataContabilistica: 'asc' } }, { numeroLinha: 'asc' }],
    });

    const saldoTransitado = await this.calcularSaldoTransitado(f.contaId, f.empresaId, f.dataInicio, f.exercicioId);

    let saldoCorrente = new Prisma.Decimal(saldoTransitado);
    const items: Array<{
      id: string;
      numeroLinha: number;
      dataContabilistica: string | Date;
      numeroLancamento: number | null;
      descricaoLancamento: string;
      debito: string;
      credito: string;
      saldoCorrente: string;
      contaCodigo: string;
      contaDesignacao: string;
    }> = [];

    for (const linha of linhas) {
      const debito = new Prisma.Decimal(linha.debito.toString());
      const credito = new Prisma.Decimal(linha.credito.toString());

      saldoCorrente = conta.natureza === 'devedora'
        ? saldoCorrente.plus(debito).minus(credito)
        : saldoCorrente.plus(credito).minus(debito);

      items.push({
        id: linha.id,
        numeroLinha: linha.numeroLinha,
        dataContabilistica: linha.lancamento.dataContabilistica,
        numeroLancamento: linha.lancamento.numero,
        descricaoLancamento: linha.lancamento.descricao,
        debito: decimalParaString(debito),
        credito: decimalParaString(credito),
        saldoCorrente: decimalParaString(saldoCorrente),
        contaCodigo: conta.codigo,
        contaDesignacao: conta.designacao,
      });
    }

    return {
      conta: {
        id: conta.id,
        codigo: conta.codigo,
        designacao: conta.designacao,
        natureza: conta.natureza,
        saldoTransitado: decimalParaString(new Prisma.Decimal(saldoTransitado)),
      },
      items,
      saldoFinal: decimalParaString(saldoCorrente),
    };
  }

  async diarios(filters: DiariosFilters): Promise<{
    items: Array<{
      id: string;
      numero: number | null;
      dataContabilistica: string | Date;
      dataDocumento: string | Date | null;
      descricao: string;
      estado: string;
      origem: string;
      totalDebito: string;
      totalCredito: string;
      diarioCodigo: string;
      diarioDesignacao: string;
      criadoPor: string;
    }>;
    totais: { debito: string; credito: string };
  }> {
    const f = diariosFiltersSchema.parse(filters);

    const where: Prisma.LancamentoContabilWhereInput = {
      estado: 'validado',
      empresaId: f.empresaId,
      ...(f.exercicioId ? { exercicioId: f.exercicioId } : {}),
      ...(f.periodoId ? { periodoId: f.periodoId } : {}),
      ...(f.diarioId ? { diarioId: f.diarioId } : {}),
      ...(f.dataInicio || f.dataFim
        ? {
            dataContabilistica: {
              ...(f.dataInicio ? { gte: f.dataInicio } : {}),
              ...(f.dataFim ? { lte: f.dataFim } : {}),
            },
          }
        : {}),
    };

    const lancamentos = await this.prisma.lancamentoContabil.findMany({
      where,
      include: {
        diario: { select: { codigo: true, designacao: true } },
        criadoPor: { select: { nomeCompleto: true } },
      },
      orderBy: [{ diario: { codigo: 'asc' } }, { numero: 'asc' }],
    });

    const items: Array<{
      id: string;
      numero: number | null;
      dataContabilistica: string | Date;
      dataDocumento: string | Date | null;
      descricao: string;
      estado: string;
      origem: string;
      totalDebito: string;
      totalCredito: string;
      diarioCodigo: string;
      diarioDesignacao: string;
      criadoPor: string;
    }> = [];
    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);

    for (const l of lancamentos) {
      const debito = new Prisma.Decimal(l.totalDebito.toString());
      const credito = new Prisma.Decimal(l.totalCredito.toString());
      totalDebito = totalDebito.plus(debito);
      totalCredito = totalCredito.plus(credito);

      items.push({
        id: l.id,
        numero: l.numero,
        dataContabilistica: l.dataContabilistica,
        dataDocumento: l.dataDocumento,
        descricao: l.descricao,
        estado: l.estado,
        origem: l.origem,
        totalDebito: decimalParaString(debito),
        totalCredito: decimalParaString(credito),
        diarioCodigo: l.diario.codigo,
        diarioDesignacao: l.diario.designacao,
        criadoPor: l.criadoPor.nomeCompleto,
      });
    }

    return {
      items,
      totais: {
        debito: decimalParaString(totalDebito),
        credito: decimalParaString(totalCredito),
      },
    };
  }

  async contaCorrente(filters: ContaCorrenteFilters): Promise<{
    entidade: { tipo: string; id: string };
    items: Array<{
      id: string;
      numeroLinha: number;
      dataContabilistica: string | Date;
      numeroLancamento: number | null;
      descricaoLancamento: string;
      debito: string;
      credito: string;
      saldoCorrente: string;
      entidadeTipo?: string | null;
      entidadeId?: string | null;
      dataVencimento?: string | Date | null;
    }>;
    saldoFinal: string;
    antiguidade?: { ate30: string; ate60: string; ate90: string; mais90: string };
  }> {
    const f = contaCorrenteFiltersSchema.parse(filters);

    const where: Prisma.LinhaLancamentoContabilWhereInput = {
      entidadeTipo: f.entidadeTipo,
      entidadeId: f.entidadeId,
      lancamento: {
        estado: 'validado',
        empresaId: f.empresaId,
        ...(f.exercicioId ? { exercicioId: f.exercicioId } : {}),
        ...(f.periodoId ? { periodoId: f.periodoId } : {}),
        ...(f.dataInicio || f.dataFim
          ? {
              dataContabilistica: {
                ...(f.dataInicio ? { gte: f.dataInicio } : {}),
                ...(f.dataFim ? { lte: f.dataFim } : {}),
              },
            }
          : {}),
      },
    };

    const linhas = await this.prisma.linhaLancamentoContabil.findMany({
      where,
      include: {
        lancamento: {
          select: {
            id: true,
            numero: true,
            dataContabilistica: true,
            descricao: true,
          },
        },
        conta: { select: { id: true, codigo: true, natureza: true } },
      },
      orderBy: [{ lancamento: { dataContabilistica: 'asc' } }, { numeroLinha: 'asc' }],
    });

    let saldoCorrente = new Prisma.Decimal(0);
    const items: Array<{
      id: string;
      numeroLinha: number;
      dataContabilistica: string | Date;
      numeroLancamento: number | null;
      descricaoLancamento: string;
      debito: string;
      credito: string;
      saldoCorrente: string;
      entidadeTipo?: string | null;
      entidadeId?: string | null;
      dataVencimento?: string | Date | null;
    }> = [];

    for (const linha of linhas) {
      const debito = new Prisma.Decimal(linha.debito.toString());
      const credito = new Prisma.Decimal(linha.credito.toString());

      saldoCorrente = saldoCorrente.plus(debito).minus(credito);

      items.push({
        id: linha.id,
        numeroLinha: linha.numeroLinha,
        dataContabilistica: linha.lancamento.dataContabilistica,
        numeroLancamento: linha.lancamento.numero,
        descricaoLancamento: linha.lancamento.descricao,
        debito: decimalParaString(debito),
        credito: decimalParaString(credito),
        saldoCorrente: decimalParaString(saldoCorrente),
        entidadeTipo: linha.entidadeTipo,
        entidadeId: linha.entidadeId,
        dataVencimento: linha.dataVencimento,
      });
    }

    let antiguidade;
    if (f.incluirAntiguidade) {
      const buckets = { ate30: new Prisma.Decimal(0), ate60: new Prisma.Decimal(0), ate90: new Prisma.Decimal(0), mais90: new Prisma.Decimal(0) };
      for (const item of items) {
        if (!item.dataVencimento) continue;
        const saldoNum = parseFloat(item.saldoCorrente);
        if (saldoNum <= 0) continue;
        const venc = new Date(item.dataVencimento);
        const diff = Math.floor((new Date().getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
        const valor = Math.abs(saldoNum);
        if (diff <= 30) buckets.ate30 = new Prisma.Decimal(buckets.ate30.toNumber() + valor);
        else if (diff <= 60) buckets.ate60 = new Prisma.Decimal(buckets.ate60.toNumber() + valor);
        else if (diff <= 90) buckets.ate90 = new Prisma.Decimal(buckets.ate90.toNumber() + valor);
        else buckets.mais90 = new Prisma.Decimal(buckets.mais90.toNumber() + valor);
      }
      antiguidade = {
        ate30: buckets.ate30.toFixed(4),
        ate60: buckets.ate60.toFixed(4),
        ate90: buckets.ate90.toFixed(4),
        mais90: buckets.mais90.toFixed(4),
      };
    }

    return {
      entidade: { tipo: f.entidadeTipo, id: f.entidadeId },
      items,
      saldoFinal: saldoCorrente.toFixed(4),
      antiguidade,
    };
  }

  private async calcularSaldoTransitado(
    contaId: string,
    empresaId: string,
    dataInicio?: Date,
    exercicioId?: string
  ): Promise<number> {
    const where: Prisma.LinhaLancamentoContabilWhereInput = {
      contaId,
      lancamento: {
        estado: 'validado',
        empresaId,
        ...(exercicioId ? { exercicioId } : {}),
        ...(dataInicio ? { dataContabilistica: { lt: dataInicio } } : {}),
      },
    };

    const agg = await this.prisma.linhaLancamentoContabil.aggregate({
      where,
      _sum: { debito: true, credito: true },
    });

    const conta = await this.prisma.contaContabil.findUnique({
      where: { id: contaId },
      select: { natureza: true },
    });
    if (!conta) return 0;

    const debito = new Prisma.Decimal(agg._sum.debito ?? 0);
    const credito = new Prisma.Decimal(agg._sum.credito ?? 0);

    return conta.natureza === 'devedora'
      ? debito.minus(credito).toNumber()
      : credito.minus(debito).toNumber();
  }

  private async agregarPais(
    empresaId: string,
    items: Array<{ codigo: string; debito: string; credito: string; saldo: string }>,
    _exercicioId: string,
    _wherePeriodo: Prisma.LinhaLancamentoContabilWhereInput
  ): Promise<void> {
    const todasContas = await this.prisma.contaContabil.findMany({
      where: { empresaId },
      select: { id: true, codigo: true, contaPaiId: true, nivel: true, classe: true, natureza: true },
    });
    const contasMap = new Map(todasContas.map((c) => [c.codigo, c]));

    for (const item of items) {
      const conta = contasMap.get(item.codigo);
      if (!conta) continue;

      let codigoPai = conta.contaPaiId ? contasMap.get(conta.contaPaiId!)?.codigo : null;
      let debito = new Prisma.Decimal(item.debito);
      let credito = new Prisma.Decimal(item.credito);

      while (codigoPai && contasMap.has(codigoPai)) {
        const pai = contasMap.get(codigoPai)!;
        let itemPai = items.find((i) => i.codigo === codigoPai) as { codigo: string; debito: string; credito: string; saldo: string; designacao: string; nivel: number; classe: number; natureza: string; linhas: number } | undefined;
        if (!itemPai) {
          itemPai = {
            codigo: pai.codigo,
            designacao: '',
            nivel: pai.nivel,
            classe: pai.classe,
            natureza: pai.natureza,
            debito: '0',
            credito: '0',
            saldo: '0',
            linhas: 0,
          };
          items.push(itemPai);
        }
        // itemPai is now guaranteed to be defined
        itemPai.debito = (new Prisma.Decimal(itemPai.debito).plus(debito)).toFixed(4);
        itemPai.credito = (new Prisma.Decimal(itemPai.credito).plus(credito)).toFixed(4);
        itemPai.saldo = pai.natureza === 'devedora'
          ? (new Prisma.Decimal(itemPai.debito).minus(new Prisma.Decimal(itemPai.credito))).toFixed(4)
          : (new Prisma.Decimal(itemPai.credito).minus(new Prisma.Decimal(itemPai.debito))).toFixed(4);

        debito = new Prisma.Decimal(itemPai.debito);
        credito = new Prisma.Decimal(itemPai.credito);
        codigoPai = pai.contaPaiId ? contasMap.get(pai.contaPaiId!)?.codigo : null;
      }
    }
  }
}

const relatoriosContabilidadeService = new RelatoriosContabilidadeService();

export {
  decimalParaString,
  RelatoriosContabilidadeService,
  relatoriosContabilidadeService,
};