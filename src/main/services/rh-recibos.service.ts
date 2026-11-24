/**
 * @file rh-recibos-test.service.ts
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { RhNotFoundError } from '../utils/rh-errors';
import { rhRecibosPdfService } from './rh-recibos-pdf.service';
import { sanitizarRespostaSemSalarios } from '../utils/sanitize';

export interface RhReciboResumoDto {
  id: string;
  serie: string;
  ano: number;
  numero: number;
  estado: 'EMITIDO' | 'ANULADO';
  emitidoEm: Date;
  impressoes: number;
  anuladoEm: Date | null;
  processamento: {
    id: string;
    tipo: string;
    sequencia: number;
    modo: string;
    dataProcessamento: Date;
    liquido: Prisma.Decimal;
    funcionario: {
      id: string;
      codigo: string;
      nome: string;
    };
    periodo: {
      id: string;
      codigo: string;
      ano: number;
      mes: number;
    };
  };
}

export interface RhRecibosPaginaDto {
  total: number;
  items: RhReciboResumoDto[];
}

export class RhRecibosService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async listar(input: {
    empresaId?: string | null;
    funcionarioId?: string;
    ano?: number;
    mes?: number;
    periodoCodigo?: string;
    tipo?: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
    estado?: 'EMITIDO' | 'ANULADO';
    search?: string;
    skip?: number;
    take?: number;
    /** Se true, inclui valores salariais. Requer permissão `rh.salarios.ver`. */
    podeVerSalarios?: boolean;
  }): Promise<RhRecibosPaginaDto> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const podeVerSalarios = input.podeVerSalarios ?? false;

    const periodoWhere: any = { empresaId };
    if (input.ano) periodoWhere.ano = input.ano;
    if (input.mes) periodoWhere.mes = input.mes;
    if (input.periodoCodigo) periodoWhere.codigo = input.periodoCodigo;

    const where: any = {
      processamento: {
        periodo: periodoWhere,
      },
    };

    if (input.funcionarioId) {
      where.processamento.funcionarioId = input.funcionarioId;
    }
    if (input.tipo) {
      where.processamento.tipo = input.tipo;
    }
    if (input.search) {
      where.processamento.OR = [
        { funcionario: { codigo: { contains: input.search, mode: 'insensitive' } } },
        { funcionario: { nome: { contains: input.search, mode: 'insensitive' } } },
      ];
    }
    if (input.estado) {
      where.estado = input.estado;
    }

    const [total, items] = await Promise.all([
      this.prisma.rhRecibo.count({ where }),
      this.prisma.rhRecibo.findMany({
        where,
        include: {
          processamento: {
            include: {
              funcionario: { select: { id: true, codigo: true, nome: true } },
              periodo: { select: { id: true, codigo: true, ano: true, mes: true } },
            },
          },
        },
        orderBy: [{ emitidoEm: 'desc' }, { numero: 'desc' }],
        skip: input.skip ?? 0,
        take: input.take ?? 25,
      }),
    ]);

    const resultado = {
      total,
      items: items.map((r) => {
        const item = {
          id: r.id,
          serie: r.serie,
          ano: r.ano,
          numero: r.numero,
          estado: r.estado,
          emitidoEm: r.emitidoEm,
          impressoes: r.impressoes,
          anuladoEm: r.anuladoEm,
          processamento: {
            id: r.processamento.id,
            tipo: r.processamento.tipo,
            sequencia: r.processamento.sequencia,
            modo: r.processamento.modo,
            dataProcessamento: r.processamento.dataProcessamento,
            liquido: r.processamento.liquido,
            funcionario: {
              id: r.processamento.funcionario.id,
              codigo: r.processamento.funcionario.codigo,
              nome: r.processamento.funcionario.nome,
            },
            periodo: {
              id: r.processamento.periodo.id,
              codigo: r.processamento.periodo.codigo,
              ano: r.processamento.periodo.ano,
              mes: r.processamento.periodo.mes,
            },
          },
        };
        if (!podeVerSalarios) {
          return sanitizarRespostaSemSalarios(item, false) as unknown as RhReciboResumoDto;
        }
        return item;
      }),
    };
    return resultado;
  }

  async obter(id: string, empresaId?: string | null, podeVerSalarios: boolean = false): Promise<RhReciboResumoDto> {
    const emp = this.exigirEmpresa(empresaId);
    const recibo = await this.prisma.rhRecibo.findFirst({
      where: {
        id,
        processamento: { periodo: { empresaId: emp } },
      },
      include: {
        processamento: {
          include: {
            funcionario: { select: { id: true, codigo: true, nome: true } },
            periodo: { select: { id: true, codigo: true, ano: true, mes: true } },
          },
        },
      },
    });

    if (!recibo) {
      throw new RhNotFoundError('Recibo não encontrado.');
    }

    const item = {
      id: recibo.id,
      serie: recibo.serie,
      ano: recibo.ano,
      numero: recibo.numero,
      estado: recibo.estado,
      emitidoEm: recibo.emitidoEm,
      impressoes: recibo.impressoes,
      anuladoEm: recibo.anuladoEm,
      processamento: {
        id: recibo.processamento.id,
        tipo: recibo.processamento.tipo,
        sequencia: recibo.processamento.sequencia,
        modo: recibo.processamento.modo,
        dataProcessamento: recibo.processamento.dataProcessamento,
        liquido: recibo.processamento.liquido,
        funcionario: {
          id: recibo.processamento.funcionario.id,
          codigo: recibo.processamento.funcionario.codigo,
          nome: recibo.processamento.funcionario.nome,
        },
        periodo: {
          id: recibo.processamento.periodo.id,
          codigo: recibo.processamento.periodo.codigo,
          ano: recibo.processamento.periodo.ano,
          mes: recibo.processamento.periodo.mes,
        },
      },
    };

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(item, false) as unknown as RhReciboResumoDto;
    }
    return item;
  }

  async gerarPdf(reciboId: string): Promise<Buffer> {
    return rhRecibosPdfService.gerarPdf(reciboId);
  }

  async gerarPdfLote(reciboIds: string[]): Promise<Buffer[]> {
    return rhRecibosPdfService.gerarPdfLote(reciboIds);
  }

  async registarImpressao(reciboId: string): Promise<void> {
    await this.prisma.rhRecibo.update({
      where: { id: reciboId },
      data: { impressoes: { increment: 1 } },
    });
  }

  private exigirEmpresa(empresaId: string | null | undefined): string {
    if (!empresaId) throw new Error('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhRecibosService = new RhRecibosService();