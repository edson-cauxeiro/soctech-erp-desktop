/**
 * @file rh-auditoria.service.ts
 * @description Consultas especializadas de auditoria para o módulo de RH (Fase 8: RH-802).
 *
 * Fornece listagens paginadas por cursor filtradas por entidades RH (funcionário,
 * processamento, entidade específica) com ordenação cronológica decrescente.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  rhAuditoriaListarInputSchema,
  rhAuditoriaPorFuncionarioInputSchema,
  rhAuditoriaPorProcessamentoInputSchema,
  type RhAuditoriaListarInput,
  type RhAuditoriaPorFuncionarioInput,
  type RhAuditoriaPorProcessamentoInput,
} from '../validators/rh.validator';

/** Entidades RH conhecidas para filtro rápido na UI. */
export const ENTIDADES_RH = [
  'RhFuncionario',
  'RhContrato',
  'RhAlteracaoMensal',
  'RhAlteracaoSalarial',
  'RhPeriodo',
  'RhLoteProcessamento',
  'RhProcessamento',
  'RhProcessamentoItem',
  'RhRecibo',
  'RhPagamento',
  'RhOrdemPagamento',
  'RhAusencia',
  'RhHoraExtra',
  'RhFeriasSaldo',
  'RhMarcacaoFerias',
  'RhAfetacao',
  'RhProcessoDivida',
  'RhPrestacaoDivida',
  'RhRetroativo',
  'RhIndependente',
  'RhAtividade',
  'RhProcessamentoHonorario',
  'RhPagamentoHonorario',
] as const;

export type EntidadeRh = (typeof ENTIDADES_RH)[number];

export interface RhAuditLogDto {
  id: string;
  empresaId: string;
  utilizadorId: string | null;
  utilizadorLogin: string | null;
  utilizadorNome: string | null;
  acao: string;
  severidade: string;
  entidade: string;
  entidadeId: string | null;
  modulo: string;
  descricao: string;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
  enderecoIp: string | null;
  agenteUtilizador: string | null;
  integridade: string | null;
  dataHora: Date;
  arquivado: boolean;
}

export interface RhAuditoriaPaginaDto {
  registos: RhAuditLogDto[];
  proximoCursor: string | null;
  total: number;
}

export class RhAuditoriaService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
  ) {}

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) {
      throw new Error('A sessão não está associada a uma empresa.');
    }
    return empresaId;
  }

  /**
   * Lista log de auditoria com filtros genéricos (paginação por cursor).
   */
  async listar(
    empresaId: string | null,
    input: RhAuditoriaListarInput,
  ): Promise<RhAuditoriaPaginaDto> {
    const filtros = rhAuditoriaListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.AuditLogWhereInput = {
      empresaId: empresa,
      arquivado: filtros.incluirArquivados ? undefined : false,
      ...(filtros.entidade && { entidade: filtros.entidade }),
      ...(filtros.entidadeId && { entidadeId: filtros.entidadeId }),
      ...(filtros.utilizadorId && { utilizadorId: filtros.utilizadorId }),
      ...(filtros.acao && { acao: filtros.acao }),
      ...(filtros.severidade && { severidade: filtros.severidade }),
      ...(filtros.desde || filtros.ate
        ? {
            dataHora: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.ate ? { lte: filtros.ate } : {}),
            },
          }
        : {}),
    };

    if (filtros.cursor) {
      const [dataIso, id] = filtros.cursor.split('|');
      const data = new Date(dataIso);
      if (!Number.isNaN(data.getTime()) && id) {
        where.AND = [
          {
            OR: [
              { dataHora: { lt: data } },
              { dataHora: data, id: { lt: id } },
            ],
          },
        ];
      }
    }

    const limite = Math.min(filtros.limite ?? 50, 500);

    const [linhas, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
        take: limite + 1,
        include: {
          utilizador: { select: { login: true, nomeCompleto: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;
    const ultimo = pagina[pagina.length - 1];

    return {
      registos: pagina.map((l) => ({
        id: l.id,
        empresaId: l.empresaId,
        utilizadorId: l.utilizadorId,
        utilizadorLogin: l.utilizador?.login ?? null,
        utilizadorNome: l.utilizador?.nomeCompleto ?? null,
        acao: l.acao,
        severidade: l.severidade,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        modulo: l.modulo,
        descricao: l.descricao,
        dadosAnteriores: l.dadosAnteriores ? JSON.parse(l.dadosAnteriores) : null,
        dadosNovos: l.dadosNovos ? JSON.parse(l.dadosNovos) : null,
        enderecoIp: l.enderecoIp,
        agenteUtilizador: l.agenteUtilizador,
        integridade: l.integridade,
        dataHora: l.dataHora,
        arquivado: l.arquivado,
      })),
      proximoCursor: temMais && ultimo ? `${ultimo.dataHora.toISOString()}|${ultimo.id}` : null,
      total,
    };
  }

  /**
   * Lista auditoria filtrada por funcionário (todas as entidades ligadas ao funcionário).
   * Usa entidadeId quando a entidade tem relação direta, caso contrário filtra por descrição.
   */
  async listarPorFuncionario(
    empresaId: string | null,
    input: RhAuditoriaPorFuncionarioInput,
  ): Promise<RhAuditoriaPaginaDto> {
    const filtros = rhAuditoriaPorFuncionarioInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    // Entidades que têm entidadeId = funcionarioId
    const entidadesComFuncionarioId = [
      'RhFuncionario',
      'RhContrato',
      'RhAlteracaoMensal',
      'RhAlteracaoSalarial',
      'RhAusencia',
      'RhHoraExtra',
      'RhFeriasSaldo',
      'RhMarcacaoFerias',
      'RhAfetacao',
      'RhProcessoDivida',
      'RhPrestacaoDivida',
      'RhRetroativo',
      'RhRecibo',
      'RhPagamento',
      'RhProcessamento',
      'RhProcessamentoItem',
    ];

    const where: Prisma.AuditLogWhereInput = {
      empresaId: empresa,
      arquivado: filtros.incluirArquivados ? undefined : false,
      entidade: { in: entidadesComFuncionarioId },
      entidadeId: filtros.funcionarioId,
      ...(filtros.acao && { acao: filtros.acao }),
      ...(filtros.severidade && { severidade: filtros.severidade }),
      ...(filtros.desde || filtros.ate
        ? {
            dataHora: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.ate ? { lte: filtros.ate } : {}),
            },
          }
        : {}),
    };

    if (filtros.cursor) {
      const [dataIso, id] = filtros.cursor.split('|');
      const data = new Date(dataIso);
      if (!Number.isNaN(data.getTime()) && id) {
        where.AND = [
          {
            OR: [
              { dataHora: { lt: data } },
              { dataHora: data, id: { lt: id } },
            ],
          },
        ];
      }
    }

    const limite = Math.min(filtros.limite ?? 50, 500);

    const [linhas, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
        take: limite + 1,
        include: { utilizador: { select: { login: true, nomeCompleto: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;
    const ultimo = pagina[pagina.length - 1];

    return {
      registos: pagina.map((l) => ({
        id: l.id,
        empresaId: l.empresaId,
        utilizadorId: l.utilizadorId,
        utilizadorLogin: l.utilizador?.login ?? null,
        utilizadorNome: l.utilizador?.nomeCompleto ?? null,
        acao: l.acao,
        severidade: l.severidade,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        modulo: l.modulo,
        descricao: l.descricao,
        dadosAnteriores: l.dadosAnteriores ? JSON.parse(l.dadosAnteriores) : null,
        dadosNovos: l.dadosNovos ? JSON.parse(l.dadosNovos) : null,
        enderecoIp: l.enderecoIp,
        agenteUtilizador: l.agenteUtilizador,
        integridade: l.integridade,
        dataHora: l.dataHora,
        arquivado: l.arquivado,
      })),
      proximoCursor: temMais && ultimo ? `${ultimo.dataHora.toISOString()}|${ultimo.id}` : null,
      total,
    };
  }

  /**
   * Lista auditoria filtrada por processamento (RhProcessamento e itens relacionados).
   */
  async listarPorProcessamento(
    empresaId: string | null,
    input: RhAuditoriaPorProcessamentoInput,
  ): Promise<RhAuditoriaPaginaDto> {
    const filtros = rhAuditoriaPorProcessamentoInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.AuditLogWhereInput = {
      empresaId: empresa,
      arquivado: filtros.incluirArquivados ? undefined : false,
      entidade: { in: ['RhProcessamento', 'RhProcessamentoItem', 'RhRecibo', 'RhPagamento', 'RhLoteProcessamento'] },
      entidadeId: filtros.processamentoId,
      ...(filtros.acao && { acao: filtros.acao }),
      ...(filtros.severidade && { severidade: filtros.severidade }),
      ...(filtros.desde || filtros.ate
        ? {
            dataHora: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.ate ? { lte: filtros.ate } : {}),
            },
          }
        : {}),
    };

    if (filtros.cursor) {
      const [dataIso, id] = filtros.cursor.split('|');
      const data = new Date(dataIso);
      if (!Number.isNaN(data.getTime()) && id) {
        where.AND = [
          {
            OR: [
              { dataHora: { lt: data } },
              { dataHora: data, id: { lt: id } },
            ],
          },
        ];
      }
    }

    const limite = Math.min(filtros.limite ?? 50, 500);

    const [linhas, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
        take: limite + 1,
        include: { utilizador: { select: { login: true, nomeCompleto: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;
    const ultimo = pagina[pagina.length - 1];

    return {
      registos: pagina.map((l) => ({
        id: l.id,
        empresaId: l.empresaId,
        utilizadorId: l.utilizadorId,
        utilizadorLogin: l.utilizador?.login ?? null,
        utilizadorNome: l.utilizador?.nomeCompleto ?? null,
        acao: l.acao,
        severidade: l.severidade,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        modulo: l.modulo,
        descricao: l.descricao,
        dadosAnteriores: l.dadosAnteriores ? JSON.parse(l.dadosAnteriores) : null,
        dadosNovos: l.dadosNovos ? JSON.parse(l.dadosNovos) : null,
        enderecoIp: l.enderecoIp,
        agenteUtilizador: l.agenteUtilizador,
        integridade: l.integridade,
        dataHora: l.dataHora,
        arquivado: l.arquivado,
      })),
      proximoCursor: temMais && ultimo ? `${ultimo.dataHora.toISOString()}|${ultimo.id}` : null,
      total,
    };
  }
}

export const rhAuditoriaService = new RhAuditoriaService();