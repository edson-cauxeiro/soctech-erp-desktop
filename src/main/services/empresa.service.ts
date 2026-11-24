/**
 * @file empresa.service.ts
 * @description Serviço para consulta, criação, atualização e remoção de empresas no DoraERP.
 */

import { PrismaClient, Pais, RegimeIva } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { ValidationError, NotFoundError } from '../utils/errors';

export interface EmpresaInput {
  id?: string;
  identificador?: string | null;
  nome: string;
  nif: string;
  endereco?: string | null;
  pais: Pais;
  cae?: string | null;
  regimeIva: RegimeIva;
  regimeIvaTipo?: string | null;
  motivoIsencao?: string | null;
  moedaBase?: string;
  moedaAlternativa?: string | null;
  modulos?: string[] | string;
  mesInicial?: string | Date | null;
  mesFinal?: string | Date | null;
  anoFiscalInicio?: string | Date | null;
  anoFiscalFim?: string | Date | null;
  serieDefault?: string | null;
  dadosBancarios?: string | null;
  telefone?: string | null;
  email?: string | null;
  logotipoUrl?: string | null;
  /** Quantos dias antes da validade de um lote se dispara o alerta de caducidade. */
  diasAlertaValidade?: number | null;
}

export class EmpresaService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista todas as empresas cadastradas no sistema.
   */
  async listEmpresas() {
    const empresas = await this.prisma.empresaConfig.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        exercicios: true,
        series: true,
      },
    });
    return empresas;
  }

  /**
   * Obtém a configuração ativa da empresa ou uma empresa por ID.
   */
  async getEmpresa(id?: string) {
    if (id) {
      const empresa = await this.prisma.empresaConfig.findUnique({
        where: { id },
        include: {
          exercicios: true,
          series: true,
        },
      });
      return empresa;
    }
    const empresa = await this.prisma.empresaConfig.findFirst({
      include: {
        exercicios: true,
        series: true,
      },
    });
    return empresa;
  }

  /**
   * Cria uma nova empresa.
   */
  async createEmpresa(data: EmpresaInput) {
    if (!data.nome || !data.nif) {
      throw new ValidationError('Nome e NIF são campos obrigatórios para criar uma empresa.');
    }

    const existingNif = await this.prisma.empresaConfig.findUnique({
      where: { nif: data.nif },
    });
    if (existingNif) {
      throw new ValidationError(`Já existe uma empresa cadastrada com o NIF ${data.nif}.`);
    }

    if (data.identificador) {
      const existingIdentificador = await this.prisma.empresaConfig.findUnique({
        where: { identificador: data.identificador },
      });
      if (existingIdentificador) {
        throw new ValidationError(`Já existe uma empresa com o identificador "${data.identificador}".`);
      }
    }

    const modulosJson = Array.isArray(data.modulos)
      ? JSON.stringify(data.modulos)
      : typeof data.modulos === 'string'
      ? data.modulos
      : '[]';

    const inicio = data.anoFiscalInicio
      ? new Date(data.anoFiscalInicio)
      : data.mesInicial
      ? new Date(data.mesInicial)
      : new Date(new Date().getFullYear(), 0, 1);

    const fim = data.anoFiscalFim
      ? new Date(data.anoFiscalFim)
      : data.mesFinal
      ? new Date(data.mesFinal)
      : new Date(new Date().getFullYear(), 11, 31);

    const mesInicioDate = data.mesInicial ? new Date(data.mesInicial) : inicio;
    const mesFimDate = data.mesFinal ? new Date(data.mesFinal) : fim;

    return this.prisma.empresaConfig.create({
      data: {
        identificador: data.identificador || null,
        nome: data.nome,
        nif: data.nif,
        endereco: data.endereco || '',
        pais: data.pais || 'AO',
        cae: data.cae || null,
        regimeIva: data.regimeIva || 'geral',
        regimeIvaTipo: data.regimeIvaTipo || 'normal_mensal',
        motivoIsencao: data.motivoIsencao || null,
        moedaBase: data.moedaBase || 'AOA',
        moedaAlternativa: data.moedaAlternativa || null,
        modulosJson,
        mesInicial: mesInicioDate,
        mesFinal: mesFimDate,
        anoFiscalInicio: inicio,
        anoFiscalFim: fim,
        serieDefault: data.serieDefault || null,
        dadosBancarios: data.dadosBancarios || null,
        telefone: data.telefone || null,
        email: data.email || null,
        logotipoUrl: data.logotipoUrl || null,
        diasAlertaValidade: data.diasAlertaValidade ?? 90,
      },
    });
  }

  /**
   * Atualiza uma empresa existente.
   */
  async updateEmpresa(id: string, data: EmpresaInput) {
    if (!id) {
      throw new ValidationError('ID da empresa é obrigatório para atualização.');
    }

    const existing = await this.prisma.empresaConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Empresa não encontrada.');
    }

    if (data.nif && data.nif !== existing.nif) {
      const existingNif = await this.prisma.empresaConfig.findUnique({
        where: { nif: data.nif },
      });
      if (existingNif && existingNif.id !== id) {
        throw new ValidationError(`Já existe outra empresa cadastrada com o NIF ${data.nif}.`);
      }
    }

    if (data.identificador && data.identificador !== existing.identificador) {
      const existingIdentificador = await this.prisma.empresaConfig.findUnique({
        where: { identificador: data.identificador },
      });
      if (existingIdentificador && existingIdentificador.id !== id) {
        throw new ValidationError(`Já existe outra empresa com o identificador "${data.identificador}".`);
      }
    }

    const modulosJson = Array.isArray(data.modulos)
      ? JSON.stringify(data.modulos)
      : typeof data.modulos === 'string'
      ? data.modulos
      : existing.modulosJson;

    const inicio = data.anoFiscalInicio
      ? new Date(data.anoFiscalInicio)
      : data.mesInicial
      ? new Date(data.mesInicial)
      : existing.anoFiscalInicio;

    const fim = data.anoFiscalFim
      ? new Date(data.anoFiscalFim)
      : data.mesFinal
      ? new Date(data.mesFinal)
      : existing.anoFiscalFim;

    const mesInicioDate = data.mesInicial ? new Date(data.mesInicial) : data.anoFiscalInicio ? new Date(data.anoFiscalInicio) : existing.mesInicial;
    const mesFimDate = data.mesFinal ? new Date(data.mesFinal) : data.anoFiscalFim ? new Date(data.anoFiscalFim) : existing.mesFinal;

    return this.prisma.empresaConfig.update({
      where: { id },
      data: {
        identificador: data.identificador !== undefined ? data.identificador : existing.identificador,
        nome: data.nome ?? existing.nome,
        nif: data.nif ?? existing.nif,
        endereco: data.endereco ?? existing.endereco,
        pais: data.pais ?? existing.pais,
        cae: data.cae !== undefined ? data.cae : existing.cae,
        regimeIva: data.regimeIva ?? existing.regimeIva,
        regimeIvaTipo: data.regimeIvaTipo !== undefined ? data.regimeIvaTipo : existing.regimeIvaTipo,
        motivoIsencao: data.motivoIsencao !== undefined ? data.motivoIsencao : existing.motivoIsencao,
        moedaBase: data.moedaBase ?? existing.moedaBase,
        moedaAlternativa: data.moedaAlternativa !== undefined ? data.moedaAlternativa : existing.moedaAlternativa,
        modulosJson,
        mesInicial: mesInicioDate,
        mesFinal: mesFimDate,
        anoFiscalInicio: inicio,
        anoFiscalFim: fim,
        serieDefault: data.serieDefault !== undefined ? data.serieDefault : existing.serieDefault,
        dadosBancarios: data.dadosBancarios !== undefined ? data.dadosBancarios : existing.dadosBancarios,
        telefone: data.telefone !== undefined ? data.telefone : existing.telefone,
        email: data.email !== undefined ? data.email : existing.email,
        logotipoUrl: data.logotipoUrl !== undefined ? data.logotipoUrl : existing.logotipoUrl,
        diasAlertaValidade:
          data.diasAlertaValidade !== undefined
            ? data.diasAlertaValidade
            : existing.diasAlertaValidade,
      },
    });
  }

  /**
   * Elimina uma empresa.
   */
  async deleteEmpresa(id: string) {
    const existing = await this.prisma.empresaConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Empresa não encontrada.');
    }

    return this.prisma.empresaConfig.delete({
      where: { id },
    });
  }

  /**
   * Guarda ou atualiza as configurações da empresa padrão (compatibilidade).
   */
  async saveEmpresa(data: EmpresaInput) {
    if (!data.nome || !data.nif) {
      throw new ValidationError('Nome e NIF são campos obrigatórios.');
    }

    const existing = await this.prisma.empresaConfig.findFirst();
    if (existing) {
      return this.updateEmpresa(existing.id, data);
    } else {
      return this.createEmpresa(data);
    }
  }
}

export const empresaService = new EmpresaService();
