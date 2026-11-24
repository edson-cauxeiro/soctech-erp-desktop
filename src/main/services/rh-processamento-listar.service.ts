/**
 * @file rh-processamento-listar.service.ts
 * @description Listagem de processamentos de um período (RH-412).
 *
 * Suporta o ecrã de anulação: devolve os processamentos efectuados no período
 * (funcionário + tipo + estado + valores) para o utilizador seleccionar o que
 * anular. A leitura é isolada por empresa (ADR-009) e o período é resolvido por
 * `(empresaId, código, ano)` — se não existir, devolve lista vazia (o ecrã
 * interpreta "sem processamentos").
 *
 * O guio da anulação continua a ser `rh-processamento-anular.service` (RH-407):
 * este serviço apenas lê; não altera estado.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { RhBusinessRuleError } from '../utils/rh-errors';
import { sanitizarRespostaSemSalarios } from '../utils/sanitize';

export interface ListarProcessamentosInput {
  empresaId: string | null;
  ano: number;
  mes: number;
  periodoCodigo: string;
  estado?: 'PROCESSADO' | 'ANULADO';
  funcionarioIds?: string[];
  /** Se true, inclui valores salariais. Requer permissão `rh.salarios.ver`. */
  podeVerSalarios?: boolean;
}

export interface ProcessamentoResumo {
  id: string;
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  tipo: string;
  sequencia: number;
  modo: string;
  estado: 'PROCESSADO' | 'ANULADO';
  periodoCodigo: string;
  ano: number;
  mes: number;
  dataProcessamento: Date;
  totalRemuneracoes: string;
  totalDescontos: string;
  liquido: string;
  reciboNumero: number | null;
  jaAnulado: boolean;
  motivoAnulacao: string | null;
}

export class RhProcessamentoListarService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async listar(input: ListarProcessamentosInput): Promise<ProcessamentoResumo[]> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const podeVerSalarios = input.podeVerSalarios ?? false;

    const periodo = await this.prisma.rhPeriodo.findFirst({
      where: { empresaId, codigo: input.periodoCodigo, ano: input.ano },
      select: { id: true, codigo: true, ano: true, mes: true },
    });
    if (!periodo) return [];

    const processamentos = await this.prisma.rhProcessamento.findMany({
      where: {
        periodoId: periodo.id,
        ...(input.estado ? { estado: input.estado } : {}),
        ...(input.funcionarioIds?.length ? { funcionarioId: { in: input.funcionarioIds } } : {}),
      },
      include: {
        funcionario: { select: { id: true, codigo: true, nome: true } },
        recibo: { select: { numero: true } },
      },
      orderBy: [{ funcionario: { codigo: 'asc' } }, { tipo: 'asc' }, { sequencia: 'asc' }],
    });

    return processamentos.map((p) => {
      const resumo: ProcessamentoResumo = {
        id: p.id,
        funcionarioId: p.funcionario.id,
        codigo: p.funcionario.codigo,
        nome: p.funcionario.nome,
        tipo: p.tipo,
        sequencia: p.sequencia,
        modo: p.modo,
        estado: p.estado === 'ANULADO' ? 'ANULADO' : 'PROCESSADO',
        periodoCodigo: periodo.codigo,
        ano: periodo.ano,
        mes: periodo.mes,
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
    });
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhProcessamentoListarService = new RhProcessamentoListarService();
