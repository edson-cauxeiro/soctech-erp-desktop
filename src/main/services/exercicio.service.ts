/**
 * @file exercicio.service.ts
 * @description Serviço para gestão dos anos de exercício fiscal por empresa no DoraERP.
 */

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { ValidationError, NotFoundError } from '../utils/errors';
import { gerarPeriodosContabeis } from './periodo-contabil.service';

export interface ExercicioInput {
  ano: string;
  empresaId: string;
  modulos?: string[] | string;
  dataInicio: string | Date;
  dataFim: string | Date;
  estado?: 'aberto' | 'emFecho' | 'fechado';
}

export class ExercicioService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista todos os exercícios fiscais, opcionalmente filtrados por empresa.
   */
  async listExercicios(empresaId?: string) {
    const where = empresaId ? { empresaId } : {};
    return this.prisma.exercicioFiscal.findMany({
      where,
      orderBy: [{ ano: 'desc' }, { createdAt: 'desc' }],
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
   * Obtém um exercício fiscal por ID.
   */
  async getExercicioById(id: string) {
    return this.prisma.exercicioFiscal.findUnique({
      where: { id },
      include: {
        empresa: true,
        periodos: { orderBy: { numero: 'asc' } },
      },
    });
  }

  /**
   * Cria um novo ano de exercício fiscal.
   */
  async createExercicio(data: ExercicioInput) {
    if (!data.ano || !data.empresaId || !data.dataInicio || !data.dataFim) {
      throw new ValidationError('Ano de Exercício, Empresa e Período (datas) são obrigatórios.');
    }

    // Verifica se a empresa existe
    const empresa = await this.prisma.empresaConfig.findUnique({
      where: { id: data.empresaId },
    });
    if (!empresa) {
      throw new NotFoundError('Empresa selecionada não foi encontrada.');
    }

    // Verifica unicidade de ano para a empresa
    const existing = await this.prisma.exercicioFiscal.findUnique({
      where: {
        empresaId_ano: {
          empresaId: data.empresaId,
          ano: String(data.ano),
        },
      },
    });

    if (existing) {
      throw new ValidationError(
        `Já existe um exercício fiscal com o ano ${data.ano} para a empresa ${empresa.nome}.`
      );
    }

    const modulosJson = Array.isArray(data.modulos)
      ? JSON.stringify(data.modulos)
      : typeof data.modulos === 'string'
      ? data.modulos
      : '[]';

    // Os períodos nascem com o exercício, na mesma transacção. Um exercício
    // sem períodos é um exercício que não pode receber lançamentos; criá-los
    // depois seria uma janela em que o utilizador vê o ano mas não o consegue
    // usar. O gerador valida as datas e trata do ano bissexto.
    const periodos = gerarPeriodosContabeis(data.dataInicio, data.dataFim);

    return this.prisma.exercicioFiscal.create({
      data: {
        ano: String(data.ano),
        empresaId: data.empresaId,
        modulosJson,
        dataInicio: new Date(data.dataInicio),
        dataFim: new Date(data.dataFim),
        estado: data.estado || 'aberto',
        periodos: {
          create: periodos.map((p) => ({
            numero: p.numero,
            dataInicio: p.dataInicio,
            dataFim: p.dataFim,
            estado: 'aberto',
          })),
        },
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
        periodos: { orderBy: { numero: 'asc' } },
      },
    });
  }

  /**
   * Elimina um exercício fiscal.
   */
  async deleteExercicio(id: string) {
    const existing = await this.prisma.exercicioFiscal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Exercício fiscal não encontrado.');
    }

    return this.prisma.exercicioFiscal.delete({
      where: { id },
    });
  }
}

export const exercicioService = new ExercicioService();
