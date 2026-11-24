/**
 * @file rh-processamento-historico.service.ts
 * @description Histórico de processamentos efectuados e visão detalhada (RH-414).
 *
 * Suporta o ecrã "Processamentos" (RF-PRO-07) — listagem filtrável por
 * funcionário/período/tipo/estado com paginação — e a visão detalhada
 * (RF-PRO-06) — cabeçalho, bases de incidência, escalão de IRT aplicado, itens
 * por rubrica (cópia imutável gravada na execução) e recibo.
 *
 * Só leitura; isolado por empresa (ADR-009) através da relação com `RhPeriodo`.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { RhBusinessRuleError } from '../utils/rh-errors';
import type { ProcessamentoResumo } from './rh-processamento-listar.service';
import { sanitizarRespostaSemSalarios } from '../utils/sanitize';

export interface HistoricoProcessamentosInput {
  empresaId: string | null;
  ano?: number;
  mes?: number;
  periodoCodigo?: string;
  tipo?: string;
  estado?: 'PROCESSADO' | 'ANULADO';
  funcionarioId?: string;
  search?: string;
  skip?: number;
  take?: number;
  /** Se true, inclui valores salariais. Requer permissão `rh.salarios.ver`. */
  podeVerSalarios?: boolean;
}

export interface HistoricoProcessamentosPagina {
  total: number;
  items: ProcessamentoResumo[];
}

export interface DetalharProcessamentoInput {
  empresaId: string | null;
  id: string;
  /** Se true, inclui valores salariais. Requer permissão `rh.salarios.ver`. */
  podeVerSalarios?: boolean;
}

export interface ProcessamentoItemDetalhe {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  origem: string;
  quantidade: string | null;
  valorUnitario: string | null;
  valor: string;
  moeda: string;
  taxaCambio: string | null;
  incideIRT: boolean;
  incideINSS: boolean;
  ordem: number;
  referenciaId: string | null;
}

export interface ProcessamentoEscalaoDetalhe {
  ordem: number;
  rendimentoDe: string;
  rendimentoAte: string | null;
  parcelaFixa: string;
  taxa: string;
  excessoDe: string;
}

export interface ProcessamentoReciboDetalhe {
  id: string;
  serie: string;
  ano: number;
  numero: number;
  estado: string;
  emitidoEm: Date;
}

export interface ProcessamentoDetalhe extends ProcessamentoResumo {
  manual: boolean;
  contratoId: string | null;
  diasProcessados: number;
  dataLimiteFaltasHE: Date | null;
  moeda: string;
  taxaCambio: string | null;
  totalEncargos: string;
  baseINSS: string;
  baseIRT: string;
  inssTrabalhador: string;
  inssPatronal: string;
  irt: string;
  escalao: ProcessamentoEscalaoDetalhe | null;
  recibo: ProcessamentoReciboDetalhe | null;
  itens: ProcessamentoItemDetalhe[];
  avisos: string[];
  anuladoEm: Date | null;
  motivoAnulacao: string | null;
  lancamentoContabilId: string | null;
  parametros: Record<string, unknown> | null;
}

function toStringOrNull(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

export class RhProcessamentoHistoricoService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async listar(input: HistoricoProcessamentosInput): Promise<HistoricoProcessamentosPagina> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const podeVerSalarios = input.podeVerSalarios ?? false;

    const where: Prisma.RhProcessamentoWhereInput = {
      periodo: {
        empresaId,
        ...(input.ano ? { ano: input.ano } : {}),
        ...(input.mes ? { mes: input.mes } : {}),
        ...(input.periodoCodigo ? { codigo: input.periodoCodigo } : {}),
      },
      ...(input.tipo ? { tipo: input.tipo as Prisma.RhProcessamentoWhereInput['tipo'] } : {}),
      ...(input.estado ? { estado: input.estado } : {}),
    };

    const funcionarioFiltro: Prisma.RhFuncionarioWhereInput = {};
    if (input.funcionarioId) funcionarioFiltro.id = input.funcionarioId;
    if (input.search) {
      funcionarioFiltro.OR = [
        { codigo: { contains: input.search, mode: 'insensitive' } },
        { nome: { contains: input.search, mode: 'insensitive' } },
      ];
    }
    if (Object.keys(funcionarioFiltro).length > 0) where.funcionario = funcionarioFiltro;

    const skip = input.skip ?? 0;
    const take = input.take ?? 50;

    const [total, processamentos] = await Promise.all([
      this.prisma.rhProcessamento.count({ where }),
      this.prisma.rhProcessamento.findMany({
        where,
        include: {
          funcionario: { select: { id: true, codigo: true, nome: true } },
          recibo: { select: { numero: true } },
          periodo: { select: { codigo: true, ano: true, mes: true } },
        },
        orderBy: [{ dataProcessamento: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
    ]);

    return {
      total,
      items: processamentos.map((p) => this.mapearResumo(p, podeVerSalarios)),
    };
  }

  async detalhar(input: DetalharProcessamentoInput): Promise<ProcessamentoDetalhe> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const podeVerSalarios = input.podeVerSalarios ?? false;

    const p = await this.prisma.rhProcessamento.findFirst({
      where: { id: input.id, periodo: { empresaId } },
      include: {
        funcionario: { select: { id: true, codigo: true, nome: true } },
        periodo: { select: { codigo: true, ano: true, mes: true } },
        recibo: true,
        itens: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!p) throw new RhBusinessRuleError('Processamento não encontrado.');

    const escalao = p.irtEscalaoId
      ? await this.prisma.rhEscalaoIRT.findUnique({
          where: { id: p.irtEscalaoId },
          select: {
            ordem: true,
            rendimentoDe: true,
            rendimentoAte: true,
            parcelaFixa: true,
            taxa: true,
            excessoDe: true,
          },
        })
      : null;

    const snapshot = (p.snapshot ?? null) as Record<string, unknown> | null;
    const parametros = (snapshot?.parametros ?? null) as Record<string, unknown> | null;
    const lancamentoContabilId =
      typeof snapshot?.lancamentoContabilId === 'string' ? snapshot.lancamentoContabilId : null;

    const avisos = Array.isArray(p.avisos) ? (p.avisos as string[]) : [];

    const detalhe: ProcessamentoDetalhe = {
      ...this.mapearResumo(p, podeVerSalarios),
      manual: p.manual,
      contratoId: p.contratoId,
      diasProcessados: p.diasProcessados,
      dataLimiteFaltasHE: p.dataLimiteFaltasHE,
      moeda: p.moeda,
      taxaCambio: toStringOrNull(p.taxaCambio),
      totalEncargos: p.totalEncargos.toString(),
      baseINSS: p.baseINSS.toString(),
      baseIRT: p.baseIRT.toString(),
      inssTrabalhador: p.inssTrabalhador.toString(),
      inssPatronal: p.inssPatronal.toString(),
      irt: p.irt.toString(),
      escalao: escalao
        ? {
            ordem: escalao.ordem,
            rendimentoDe: escalao.rendimentoDe.toString(),
            rendimentoAte: toStringOrNull(escalao.rendimentoAte),
            parcelaFixa: escalao.parcelaFixa.toString(),
            taxa: escalao.taxa.toString(),
            excessoDe: escalao.excessoDe.toString(),
          }
        : null,
      recibo: p.recibo
        ? {
            id: p.recibo.id,
            serie: p.recibo.serie,
            ano: p.recibo.ano,
            numero: p.recibo.numero,
            estado: p.recibo.estado,
            emitidoEm: p.recibo.emitidoEm,
          }
        : null,
      itens: p.itens.map((i) => ({
        id: i.id,
        codigo: i.codigo,
        descricao: i.descricao,
        tipo: i.tipo,
        origem: i.origem,
        quantidade: toStringOrNull(i.quantidade),
        valorUnitario: toStringOrNull(i.valorUnitario),
        valor: i.valor.toString(),
        moeda: i.moeda,
        taxaCambio: toStringOrNull(i.taxaCambio),
        incideIRT: i.incideIRT,
        incideINSS: i.incideINSS,
        ordem: i.ordem,
        referenciaId: i.referenciaId,
      })),
      avisos,
      anuladoEm: p.anuladoEm,
      motivoAnulacao: p.motivoAnulacao,
      lancamentoContabilId,
      parametros,
    };

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(detalhe, false) as unknown as ProcessamentoDetalhe;
    }
    return detalhe;
  }

  private mapearResumo(
    p: Prisma.RhProcessamentoGetPayload<{
      include: {
        funcionario: { select: { id: true; codigo: true; nome: true } };
        recibo: { select: { numero: true } };
        periodo: { select: { codigo: true; ano: true; mes: true } };
      };
    }>,
    podeVerSalarios: boolean
  ): ProcessamentoResumo {
    const resumo: ProcessamentoResumo = {
      id: p.id,
      funcionarioId: p.funcionario.id,
      codigo: p.funcionario.codigo,
      nome: p.funcionario.nome,
      tipo: p.tipo,
      sequencia: p.sequencia,
      modo: p.modo,
      estado: p.estado === 'ANULADO' ? 'ANULADO' : 'PROCESSADO',
      periodoCodigo: p.periodo.codigo,
      ano: p.periodo.ano,
      mes: p.periodo.mes,
      dataProcessamento: p.dataProcessamento,
      totalRemuneracoes: p.totalRemuneracoes.toString(),
      totalDescontos: p.totalDescontos.toString(),
      liquido: p.liquido.toString(),
      reciboNumero: p.recibo?.numero ?? null,
      jaAnulado: p.estado === 'ANULADO',
      motivoAnulacao: p.motivoAnulacao ?? null,
    };

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(resumo, false) as unknown as ProcessamentoResumo;
    }
    return resumo;
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhProcessamentoHistoricoService = new RhProcessamentoHistoricoService();
