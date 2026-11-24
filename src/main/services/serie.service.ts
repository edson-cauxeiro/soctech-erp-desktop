/**
 * @file serie.service.ts
 * @description Serviço para gestão de séries de documentos por empresa, tipo de documento e módulo no DoraERP.
 */

import { PrismaClient, TipoSerieDocumento } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { ValidationError, NotFoundError } from '../utils/errors';

export interface SerieInput {
  codigo: string;
  descricao: string;
  empresaId: string;
  tipoDocumento?: TipoSerieDocumento;
  modulos?: string[] | string;
  dataInicio: string | Date;
  dataFim: string | Date;
  ultimoLancamento?: number;
  estado?: 'ativo' | 'inativo';
}

export class SerieService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista todas as séries, opcionalmente filtradas por empresa e tipo de documento.
   */
  async listSeries(empresaId?: string, tipoDocumento?: TipoSerieDocumento) {
    const where: any = {};
    if (empresaId) where.empresaId = empresaId;
    if (tipoDocumento) where.tipoDocumento = tipoDocumento;

    return this.prisma.serieDocumento.findMany({
      where,
      orderBy: [{ codigo: 'asc' }, { createdAt: 'desc' }],
      include: {
        empresa: {
          select: {
            id: true,
            nome: true,
            nif: true,
            identificador: true,
          },
        },
      },
    });
  }

  /**
   * Obtém uma série por ID.
   */
  async getSerieById(id: string) {
    return this.prisma.serieDocumento.findUnique({
      where: { id },
      include: {
        empresa: true,
      },
    });
  }

  /**
   * Cria uma nova série de documentos.
   */
  async createSerie(data: SerieInput) {
    if (!data.codigo || !data.descricao || !data.empresaId || !data.dataInicio || !data.dataFim) {
      throw new ValidationError(
        'Série, Descrição, Empresa associada, Data de Início e Data Final são obrigatórios.'
      );
    }

    const tipoDoc = data.tipoDocumento || 'FT';

    // Verifica se a empresa existe
    const empresa = await this.prisma.empresaConfig.findUnique({
      where: { id: data.empresaId },
    });
    if (!empresa) {
      throw new NotFoundError('Empresa selecionada não foi encontrada.');
    }

    // Verifica unicidade de código da série para a empresa e tipo de documento
    const existing = await this.prisma.serieDocumento.findFirst({
      where: {
        empresaId: data.empresaId,
        tipoDocumento: tipoDoc,
        codigo: data.codigo.trim(),
      },
    });

    if (existing) {
      throw new ValidationError(
        `Já existe uma série "${data.codigo}" do tipo ${tipoDoc} para a empresa ${empresa.nome}.`
      );
    }

    const modulosJson = Array.isArray(data.modulos)
      ? JSON.stringify(data.modulos)
      : typeof data.modulos === 'string'
      ? data.modulos
      : '[]';

    return this.prisma.serieDocumento.create({
      data: {
        codigo: data.codigo.trim(),
        descricao: data.descricao.trim(),
        empresaId: data.empresaId,
        tipoDocumento: tipoDoc,
        modulosJson,
        dataInicio: new Date(data.dataInicio),
        dataFim: new Date(data.dataFim),
        ultimoLancamento: 0, // Default 0 não editável
        estado: data.estado || 'ativo',
      },
      include: {
        empresa: {
          select: {
            id: true,
            nome: true,
            nif: true,
            identificador: true,
          },
        },
      },
    });
  }

  /**
   * Elimina uma série de documentos.
   */
  async deleteSerie(id: string) {
    const existing = await this.prisma.serieDocumento.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Série não encontrada.');
    }

    // Valida se a série já teve lançamentos
    if (existing.ultimoLancamento > 0) {
      throw new ValidationError(
        'Não é possível eliminar uma série que já possui documentos emitidos ou lançamentos.'
      );
    }

    return this.prisma.serieDocumento.delete({
      where: { id },
    });
  }
}

export const serieService = new SerieService();
