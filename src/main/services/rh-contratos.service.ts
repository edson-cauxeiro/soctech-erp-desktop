/**
 * @file rh-contratos.service.ts
 * @description Gestão contratual do módulo de RH (Fase 2: RH-204).
 *
 * Responsabilidades:
 *  - um único contrato activo por funcionário, com histórico completo;
 *  - cessação com motivo (encerra o contrato e actualiza o estado do funcionário);
 *  - alterações salariais com data de efeito (histórico auditável);
 *  - `salarioNaData(funcionarioId, data)` — salário vigente numa data, aplicando
 *    as alterações salariais cujo efeito já ocorreu;
 *  - isolamento por empresa (ADR-009) e auditoria append-only.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import { sanitizarRespostaSemSalarios } from '../utils/sanitize';
import {
  criarRhContratoSchema,
  atualizarRhContratoSchema,
  cessarRhContratoSchema,
  criarRhAlteracaoSalarialSchema,
  type CriarRhContratoData,
  type AtualizarRhContratoData,
  type CessarRhContratoData,
  type CriarRhAlteracaoSalarialData,
} from '../validators/rh.validator';
import { RhNotFoundError, RhConflictError, RhBusinessRuleError } from '../utils/rh-errors';

const INCLUDE_CONTRATO = {
  funcionario: { select: { id: true, codigo: true, nome: true } },
  alteracoesSalariais: { orderBy: { dataEfeito: 'desc' } },
} satisfies Prisma.RhContratoInclude;

export type RhContratoDetalhe = Prisma.RhContratoGetPayload<{ include: typeof INCLUDE_CONTRATO }>;

/** Contrato (ou parte dele) suficiente para resolver o salário numa data. */
export interface ContratoFinanceiro {
  salarioBase: number | { toNumber(): number };
  alteracoesSalariais: {
    dataEfeito: Date;
    salarioNovo: number | { toNumber(): number };
  }[];
}

export interface SalarioNaDataResultado {
  funcionarioId: string;
  data: Date;
  contratoId: string | null;
  salario: number | null;
  moeda: string | null;
}

function paraNumero(valor: number | { toNumber(): number }): number {
  return typeof valor === 'number' ? valor : valor.toNumber();
}

/**
 * Resolve o salário de um contrato numa data: parte do `salarioBase` e aplica a
 * alteração salarial mais recente cujo `dataEfeito` não seja posterior à data.
 */
export function resolverSalarioContrato(contrato: ContratoFinanceiro, data: Date): number {
  const aplicavel = contrato.alteracoesSalariais
    .filter((alteracao) => alteracao.dataEfeito.getTime() <= data.getTime())
    .sort((a, b) => b.dataEfeito.getTime() - a.dataEfeito.getTime())[0];
  return aplicavel ? paraNumero(aplicavel.salarioNovo) : paraNumero(contrato.salarioBase);
}

export class RhContratosService {
  private prisma: PrismaClient;
  private audit: AuditService;

  constructor(prismaClient: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.prisma = prismaClient;
    this.audit = audit;
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) {
      throw new RhBusinessRuleError('A sessão não está associada a uma empresa.');
    }
    return empresaId;
  }

  private async exigirFuncionario(
    funcionarioId: string,
    empresaId: string
  ): Promise<{ id: string }> {
    const funcionario = await this.prisma.rhFuncionario.findFirst({
      where: { id: funcionarioId, empresaId },
      select: { id: true },
    });
    if (!funcionario) throw new RhNotFoundError('Funcionário não encontrado.');
    return funcionario;
  }

  // ── Leitura ──────────────────────────────────────────────────────────────

  public async listarPorFuncionario(
    funcionarioId: string,
    empresaId: string | null,
    podeVerSalarios: boolean = false
  ): Promise<RhContratoDetalhe[]> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.exigirFuncionario(funcionarioId, empresa);
    const contratos = await this.prisma.rhContrato.findMany({
      where: { funcionarioId },
      orderBy: { dataInicio: 'desc' },
      include: INCLUDE_CONTRATO,
    });

    if (!podeVerSalarios) {
      return contratos.map((c) => sanitizarRespostaSemSalarios(c, false)) as unknown as RhContratoDetalhe[];
    }
    return contratos;
  }

  public async obterContrato(
    id: string,
    empresaId: string | null,
    podeVerSalarios: boolean = false
  ): Promise<RhContratoDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const contrato = await this.prisma.rhContrato.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
      include: INCLUDE_CONTRATO,
    });
    if (!contrato) throw new RhNotFoundError('Contrato não encontrado.');

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(contrato, false) as unknown as RhContratoDetalhe;
    }
    return contrato;
  }

  // ── Contratos ────────────────────────────────────────────────────────────

  public async criarContrato(
    funcionarioId: string,
    input: CriarRhContratoData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhContratoDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhContratoSchema.parse(input);
    await this.exigirFuncionario(funcionarioId, empresa);

    const ativo = await this.prisma.rhContrato.findFirst({
      where: { funcionarioId, estado: 'ATIVO' },
      select: { id: true },
    });
    if (ativo) {
      throw new RhConflictError(
        'O funcionário já possui um contrato ativo. Cesse o contrato atual antes de criar um novo.'
      );
    }

    const criado = await this.prisma.rhContrato.create({
      data: {
        funcionarioId,
        tipo: dados.tipo,
        estado: 'ATIVO',
        dataInicio: dados.dataInicio,
        dataFim: dados.dataFim ?? null,
        salarioBase: dados.salarioBase,
        moeda: dados.moeda,
        cargaHorariaSemanal: dados.cargaHorariaSemanal,
        categoria: dados.categoria ?? null,
        observacoes: dados.observacoes ?? null,
      },
      include: INCLUDE_CONTRATO,
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'criar',
      entidade: 'RhContrato',
      entidadeId: criado.id,
      modulo: 'rh',
      descricao: `Contrato ${criado.tipo} de ${criado.funcionario.nome} criado.`,
      dadosNovos: criado,
    });

    return criado;
  }

  public async atualizarContrato(
    id: string,
    input: AtualizarRhContratoData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhContratoDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhContratoSchema.parse(input);
    const anterior = await this.obterContrato(id, empresa, true);

    if (
      anterior.estado === 'ENCERRADO' &&
      (dados.tipo !== undefined ||
        dados.salarioBase !== undefined ||
        dados.dataInicio !== undefined ||
        dados.dataFim !== undefined)
    ) {
      throw new RhBusinessRuleError('Um contrato encerrado não pode ser reaberto nem alterado.');
    }

    const atualizado = await this.prisma.rhContrato.update({
      where: { id },
      data: {
        ...(dados.tipo !== undefined ? { tipo: dados.tipo } : {}),
        ...(dados.categoria !== undefined ? { categoria: dados.categoria ?? null } : {}),
        ...(dados.salarioBase !== undefined ? { salarioBase: dados.salarioBase } : {}),
        ...(dados.moeda !== undefined ? { moeda: dados.moeda } : {}),
        ...(dados.cargaHorariaSemanal !== undefined
          ? { cargaHorariaSemanal: dados.cargaHorariaSemanal }
          : {}),
        ...(dados.dataInicio !== undefined ? { dataInicio: dados.dataInicio } : {}),
        ...(dados.dataFim !== undefined ? { dataFim: dados.dataFim ?? null } : {}),
        ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes ?? null } : {}),
      },
      include: INCLUDE_CONTRATO,
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhContrato',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Contrato de ${atualizado.funcionario.nome} atualizado.`,
      dadosAnteriores: anterior,
      dadosNovos: atualizado,
    });

    return atualizado;
  }

  /**
   * Cessa o contrato com motivo e, se não restar qualquer outro contrato activo,
   * marca o funcionário como cessado na data indicada.
   */
  public async cessarContrato(
    id: string,
    input: CessarRhContratoData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhContratoDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = cessarRhContratoSchema.parse(input);
    const contrato = await this.obterContrato(id, empresa, true);

    if (contrato.estado === 'ENCERRADO') {
      throw new RhBusinessRuleError('O contrato já se encontra encerrado.');
    }
    if (dados.dataCessacao < contrato.dataInicio) {
      throw new RhBusinessRuleError('A data de cessação não pode ser anterior ao início do contrato.');
    }

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const encerrado = await tx.rhContrato.update({
        where: { id },
        data: {
          estado: 'ENCERRADO',
          motivoCessacao: dados.motivo,
          dataCessacao: dados.dataCessacao,
          observacoes: dados.observacoes ?? contrato.observacoes,
        },
        include: INCLUDE_CONTRATO,
      });

      const outroAtivo = await tx.rhContrato.findFirst({
        where: { funcionarioId: contrato.funcionarioId, estado: 'ATIVO', id: { not: id } },
        select: { id: true },
      });
      if (!outroAtivo) {
        await tx.rhFuncionario.update({
          where: { id: contrato.funcionarioId },
          data: { estado: 'CESSADO', dataCessacao: dados.dataCessacao },
        });
      }
      return encerrado;
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhContrato',
      entidadeId: id,
      modulo: 'rh',
      severidade: 'aviso',
      descricao: `Contrato de ${atualizado.funcionario.nome} cessado (${dados.motivo}).`,
      dadosAnteriores: { estado: contrato.estado, dataCessacao: contrato.dataCessacao },
      dadosNovos: {
        estado: atualizado.estado,
        motivoCessacao: atualizado.motivoCessacao,
        dataCessacao: atualizado.dataCessacao,
      },
    });

    return atualizado;
  }

  // ── Alterações salariais ─────────────────────────────────────────────────

  public async registarAlteracaoSalarial(
    input: CriarRhAlteracaoSalarialData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<Prisma.RhAlteracaoSalarialGetPayload<object>> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhAlteracaoSalarialSchema.parse(input);
    const contrato = await this.obterContrato(dados.contratoId, empresa, true);

    if (contrato.estado === 'ENCERRADO') {
      throw new RhBusinessRuleError('Não é possível alterar o salário de um contrato encerrado.');
    }
    if (dados.dataEfeito < contrato.dataInicio) {
      throw new RhBusinessRuleError('A data de efeito não pode ser anterior ao início do contrato.');
    }

    const duplicado = await this.prisma.rhAlteracaoSalarial.findFirst({
      where: { contratoId: contrato.id, dataEfeito: dados.dataEfeito },
      select: { id: true },
    });
    if (duplicado) {
      throw new RhConflictError('Já existe uma alteração salarial com esta data de efeito.');
    }

    const diaAnterior = new Date(dados.dataEfeito);
    diaAnterior.setUTCDate(diaAnterior.getUTCDate() - 1);
    const salarioAnterior = resolverSalarioContrato(contrato, diaAnterior);

    const criado = await this.prisma.rhAlteracaoSalarial.create({
      data: {
        contratoId: contrato.id,
        dataEfeito: dados.dataEfeito,
        salarioAnterior,
        salarioNovo: dados.salarioNovo,
        motivo: dados.motivo ?? null,
        criadoPorId: utilizadorId,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'criar',
      entidade: 'RhAlteracaoSalarial',
      entidadeId: criado.id,
      modulo: 'rh',
      descricao: `Alteração salarial de ${contrato.funcionario.nome} registada.`,
      dadosNovos: criado,
    });

    return criado;
  }

  // ── Consulta por data ────────────────────────────────────────────────────

  /**
   * Devolve o salário vigente de um funcionário numa data, aplicando as
   * alterações salariais já efectivas. Devolve `salario: null` quando nenhum
   * contrato abrange a data.
   * Respeita a permissão `rh.salarios.ver` — se false, devolve salario null.
   */
  public async salarioNaData(
    funcionarioId: string,
    data: Date,
    empresaId: string | null,
    podeVerSalarios: boolean = false
  ): Promise<SalarioNaDataResultado> {
    if (!podeVerSalarios) {
      return { funcionarioId, data, contratoId: null, salario: null, moeda: null };
    }

    const empresa = this.exigirEmpresa(empresaId);
    await this.exigirFuncionario(funcionarioId, empresa);

    const contratos = await this.prisma.rhContrato.findMany({
      where: { funcionarioId, dataInicio: { lte: data } },
      orderBy: { dataInicio: 'desc' },
      include: {
        alteracoesSalariais: {
          where: { dataEfeito: { lte: data } },
          orderBy: { dataEfeito: 'desc' },
        },
      },
    });

    const contrato = contratos.find(
      (registro) => !registro.dataFim || registro.dataFim.getTime() >= data.getTime()
    );

    if (!contrato) {
      return { funcionarioId, data, contratoId: null, salario: null, moeda: null };
    }

    return {
      funcionarioId,
      data,
      contratoId: contrato.id,
      salario: resolverSalarioContrato(contrato, data),
      moeda: contrato.moeda,
    };
  }
}

export const rhContratosService = new RhContratosService();
