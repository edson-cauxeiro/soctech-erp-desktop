/**
 * @file rh-configuracao.service.ts
 * @description Cadastros e parâmetros do módulo de RH (Fase 1: RH-106/RH-107).
 *
 * Reúne a configuração de base — departamentos, cargos, rubricas, tipos de
 * ausência, centros de custo, períodos, parâmetros fiscais, tabelas de IRT e a
 * configuração singleton — que alimenta o motor de processamento das fases
 * seguintes.
 *
 * Duas decisões transversais (ver `docs/rh-docs/DECISOES.md`, ADR-009):
 *  - tudo é isolado por `empresaId`;
 *  - parâmetros e tabelas de IRT são versionados por vigência e nunca
 *    sobrescritos: criar uma alteração gera nova linha com nova `vigenteDesde`.
 *
 * As leituras usadas pelo motor (`obterParametro`, `obterTabelaIRT`,
 * `obterConfiguracao`) passam por uma cache em memória com TTL e invalidação
 * explícita em cada escrita.
 */

import { Prisma } from '@prisma/client';
import type {
  PrismaClient,
  RhDepartamento,
  RhCargo,
  RhRubrica,
  RhTipoAusencia,
  CentroCusto,
  RhPeriodo,
  RhParametroFiscal,
  RhTabelaIRT,
  RhEscalaoIRT,
  RhConfiguracao,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarRhDepartamentoSchema,
  atualizarRhDepartamentoSchema,
  criarRhCargoSchema,
  atualizarRhCargoSchema,
  criarRhRubricaSchema,
  atualizarRhRubricaSchema,
  criarRhTipoAusenciaSchema,
  atualizarRhTipoAusenciaSchema,
  criarRhCentroCustoSchema,
  atualizarRhCentroCustoSchema,
  criarRhParametroSchema,
  criarRhTabelaIrtSchema,
  atualizarRhConfiguracaoSchema,
  type CriarRhDepartamentoInput,
  type AtualizarRhDepartamentoInput,
  type CriarRhCargoInput,
  type AtualizarRhCargoInput,
  type CriarRhRubricaInput,
  type AtualizarRhRubricaInput,
  type CriarRhTipoAusenciaInput,
  type AtualizarRhTipoAusenciaInput,
  type CriarRhCentroCustoInput,
  type AtualizarRhCentroCustoInput,
  type CriarRhParametroInput,
  type CriarRhTabelaIrtInput,
  type AtualizarRhConfiguracaoInput,
  type RhFiltroCadastroInput,
} from '../validators/rh.validator';
import { RhNotFoundError, RhConflictError, RhBusinessRuleError } from '../utils/rh-errors';
import { auditService, type AuditService } from './audit.service';
import { semearDepartamentosECargos } from './rh-referencia.service';

/** Registo de parâmetro fiscal já com o valor tipado. */
export interface ParametroResolvido<T = unknown> {
  id: string;
  chave: string;
  descricao: string | null;
  tipoValor: string;
  valor: T;
  vigenteDesde: Date;
  vigenteAte: Date | null;
}

/** Tabela de IRT aplicável numa data, com escalões ordenados. */
export interface TabelaIrtResolvida {
  id: string;
  descricao: string;
  vigenteDesde: Date;
  vigenteAte: Date | null;
  escaloes: RhEscalaoIRT[];
}

interface CacheEntrada {
  expira: number;
  valor: unknown;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

export class RhConfiguracaoService {
  private prisma: PrismaClient;
  private cache = new Map<string, CacheEntrada>();

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService
  ) {
    this.prisma = prismaClient;
  }

  // ── Cache ─────────────────────────────────────────────────────────────────

  /**
   * Descarrega a cache de configuração/parâmetros.
   * @param empresaId - Quando indicado, invalida apenas essa empresa.
   */
  public invalidarCache(empresaId?: string): void {
    if (!empresaId) {
      this.cache.clear();
      return;
    }
    const prefixo = `${empresaId}:`;
    for (const chave of this.cache.keys()) {
      if (chave.startsWith(prefixo)) this.cache.delete(chave);
    }
  }

  private async comCache<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
    const agora = Date.now();
    const entrada = this.cache.get(chave);
    if (entrada && entrada.expira > agora) return entrada.valor as T;

    const valor = await carregar();
    this.cache.set(chave, { valor, expira: agora + CACHE_TTL_MS });
    return valor;
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) {
      throw new RhBusinessRuleError('A sessão não está associada a uma empresa.');
    }
    return empresaId;
  }

  // ── Departamentos ────────────────────────────────────────────────────────

  public async listarDepartamentos(
    filtros: RhFiltroCadastroInput,
    empresaId: string | null
  ): Promise<{ total: number; items: RhDepartamento[] }> {
    const empresa = this.exigirEmpresa(empresaId);
    const where: Prisma.RhDepartamentoWhereInput = {
      empresaId: empresa,
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo } : {}),
      ...(filtros.search
        ? {
            OR: [
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { nome: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.rhDepartamento.count({ where }),
      this.prisma.rhDepartamento.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);
    return { total, items };
  }

  public criarDepartamento(
    input: CriarRhDepartamentoInput,
    empresaId: string | null
  ): Promise<RhDepartamento> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhDepartamentoSchema.parse(input);
    return this.criarUnico(
      () =>
        this.prisma.rhDepartamento.findFirst({
          where: { empresaId: empresa, codigo: dados.codigo },
          select: { id: true },
        }),
      `Já existe um departamento com o código '${dados.codigo}'.`,
      () => this.prisma.rhDepartamento.create({ data: { ...dados, empresaId: empresa } })
    );
  }

  public async atualizarDepartamento(
    id: string,
    input: AtualizarRhDepartamentoInput,
    empresaId: string | null
  ): Promise<RhDepartamento> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhDepartamentoSchema.parse(input);
    await this.obterDepartamento(id, empresa);
    if (dados.codigo) {
      const colide = await this.prisma.rhDepartamento.findFirst({
        where: { empresaId: empresa, codigo: dados.codigo, id: { not: id } },
        select: { id: true },
      });
      if (colide) throw new RhConflictError(`Já existe um departamento com o código '${dados.codigo}'.`);
    }
    return this.prisma.rhDepartamento.update({ where: { id }, data: dados });
  }

  public async inativarDepartamento(id: string, empresaId: string | null): Promise<RhDepartamento> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.obterDepartamento(id, empresa);
    return this.prisma.rhDepartamento.update({ where: { id }, data: { ativo: false } });
  }

  private async obterDepartamento(id: string, empresaId: string): Promise<RhDepartamento> {
    const registo = await this.prisma.rhDepartamento.findFirst({ where: { id, empresaId } });
    if (!registo) throw new RhNotFoundError('Departamento não encontrado.');
    return registo;
  }

  // ── Cargos ───────────────────────────────────────────────────────────────

  public async listarCargos(
    filtros: RhFiltroCadastroInput,
    empresaId: string | null
  ): Promise<{ total: number; items: RhCargo[] }> {
    const empresa = this.exigirEmpresa(empresaId);
    const where: Prisma.RhCargoWhereInput = {
      empresaId: empresa,
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo } : {}),
      ...(filtros.search
        ? {
            OR: [
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { nome: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.rhCargo.count({ where }),
      this.prisma.rhCargo.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);
    return { total, items };
  }

  public criarCargo(input: CriarRhCargoInput, empresaId: string | null): Promise<RhCargo> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhCargoSchema.parse(input);
    return this.criarUnico(
      () =>
        this.prisma.rhCargo.findFirst({
          where: { empresaId: empresa, codigo: dados.codigo },
          select: { id: true },
        }),
      `Já existe um cargo com o código '${dados.codigo}'.`,
      () => this.prisma.rhCargo.create({ data: { ...dados, empresaId: empresa } })
    );
  }

  public async atualizarCargo(
    id: string,
    input: AtualizarRhCargoInput,
    empresaId: string | null
  ): Promise<RhCargo> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhCargoSchema.parse(input);
    await this.obterCargo(id, empresa);
    if (dados.codigo) {
      const colide = await this.prisma.rhCargo.findFirst({
        where: { empresaId: empresa, codigo: dados.codigo, id: { not: id } },
        select: { id: true },
      });
      if (colide) throw new RhConflictError(`Já existe um cargo com o código '${dados.codigo}'.`);
    }
    return this.prisma.rhCargo.update({ where: { id }, data: dados });
  }

  public async inativarCargo(id: string, empresaId: string | null): Promise<RhCargo> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.obterCargo(id, empresa);
    return this.prisma.rhCargo.update({ where: { id }, data: { ativo: false } });
  }

  private async obterCargo(id: string, empresaId: string): Promise<RhCargo> {
    const registo = await this.prisma.rhCargo.findFirst({ where: { id, empresaId } });
    if (!registo) throw new RhNotFoundError('Cargo não encontrado.');
    return registo;
  }

  // ── Rubricas ─────────────────────────────────────────────────────────────

  public async listarRubricas(
    filtros: RhFiltroCadastroInput,
    empresaId: string | null
  ): Promise<{ total: number; items: RhRubrica[] }> {
    const empresa = this.exigirEmpresa(empresaId);
    const where: Prisma.RhRubricaWhereInput = {
      empresaId: empresa,
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo } : {}),
      ...(filtros.search
        ? {
            OR: [
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { descricao: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.rhRubrica.count({ where }),
      this.prisma.rhRubrica.findMany({
        where,
        orderBy: [{ sistema: 'desc' }, { ordemRecibo: 'asc' }, { descricao: 'asc' }],
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);
    return { total, items };
  }

  public async obterRubrica(id: string, empresaId: string | null): Promise<RhRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const registo = await this.prisma.rhRubrica.findFirst({ where: { id, empresaId: empresa } });
    if (!registo) throw new RhNotFoundError('Rubrica não encontrada.');
    return registo;
  }

  public async criarRubrica(
    input: CriarRhRubricaInput,
    empresaId: string | null
  ): Promise<RhRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhRubricaSchema.parse(input);
    const colide = await this.prisma.rhRubrica.findFirst({
      where: { empresaId: empresa, codigo: dados.codigo },
      select: { id: true },
    });
    if (colide) throw new RhConflictError(`Já existe uma rubrica com o código '${dados.codigo}'.`);
    this.validarValoresRubrica(dados.formaCalculo, dados.valorPadrao, dados.percentagem);
    this.invalidarCache(empresa);
    return this.prisma.rhRubrica.create({
      data: {
        empresaId: empresa,
        codigo: dados.codigo,
        descricao: dados.descricao,
        tipo: dados.tipo,
        natureza: dados.natureza,
        formaCalculo: dados.formaCalculo,
        valorPadrao: this.paraDecimal(dados.valorPadrao),
        percentagem: this.paraDecimal(dados.percentagem),
        incideIRT: dados.incideIRT,
        incideINSS: dados.incideINSS,
        limiteIsencaoIRT: this.paraDecimal(dados.limiteIsencaoIRT),
        limiteIsencaoINSS: this.paraDecimal(dados.limiteIsencaoINSS),
        ordemRecibo: dados.ordemRecibo,
        contaDebitoId: dados.contaDebitoId ?? null,
        contaCreditoId: dados.contaCreditoId ?? null,
        ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      },
    });
  }

  public async atualizarRubrica(
    id: string,
    input: AtualizarRhRubricaInput,
    empresaId: string | null
  ): Promise<RhRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhRubricaSchema.parse(input);
    const atual = await this.obterRubrica(id, empresa);

    if (atual.sistema && dados.codigo && dados.codigo !== atual.codigo) {
      throw new RhBusinessRuleError('O código de uma rubrica de sistema não pode ser alterado.');
    }
    if (dados.codigo) {
      const colide = await this.prisma.rhRubrica.findFirst({
        where: { empresaId: empresa, codigo: dados.codigo, id: { not: id } },
        select: { id: true },
      });
      if (colide) throw new RhConflictError(`Já existe uma rubrica com o código '${dados.codigo}'.`);
    }
    if (dados.formaCalculo || dados.valorPadrao !== undefined || dados.percentagem !== undefined) {
      this.validarValoresRubrica(
        dados.formaCalculo ?? atual.formaCalculo,
        dados.valorPadrao !== undefined ? dados.valorPadrao : atual.valorPadrao?.toNumber(),
        dados.percentagem !== undefined ? dados.percentagem : atual.percentagem?.toNumber()
      );
    }
    this.invalidarCache(empresa);
    return this.prisma.rhRubrica.update({
      where: { id },
      data: {
        ...(dados.codigo !== undefined ? { codigo: dados.codigo } : {}),
        ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
        ...(dados.tipo !== undefined ? { tipo: dados.tipo } : {}),
        ...(dados.natureza !== undefined ? { natureza: dados.natureza } : {}),
        ...(dados.formaCalculo !== undefined ? { formaCalculo: dados.formaCalculo } : {}),
        ...(dados.valorPadrao !== undefined ? { valorPadrao: this.paraDecimal(dados.valorPadrao) } : {}),
        ...(dados.percentagem !== undefined ? { percentagem: this.paraDecimal(dados.percentagem) } : {}),
        ...(dados.incideIRT !== undefined ? { incideIRT: dados.incideIRT } : {}),
        ...(dados.incideINSS !== undefined ? { incideINSS: dados.incideINSS } : {}),
        ...(dados.limiteIsencaoIRT !== undefined
          ? { limiteIsencaoIRT: this.paraDecimal(dados.limiteIsencaoIRT) }
          : {}),
        ...(dados.limiteIsencaoINSS !== undefined
          ? { limiteIsencaoINSS: this.paraDecimal(dados.limiteIsencaoINSS) }
          : {}),
        ...(dados.ordemRecibo !== undefined ? { ordemRecibo: dados.ordemRecibo } : {}),
        ...(dados.contaDebitoId !== undefined ? { contaDebitoId: dados.contaDebitoId ?? null } : {}),
        ...(dados.contaCreditoId !== undefined ? { contaCreditoId: dados.contaCreditoId ?? null } : {}),
        ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      },
    });
  }

  public async inativarRubrica(id: string, empresaId: string | null): Promise<RhRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const rubrica = await this.obterRubrica(id, empresa);
    if (rubrica.sistema) {
      throw new RhBusinessRuleError('Uma rubrica de sistema não pode ser inativada.');
    }
    this.invalidarCache(empresa);
    return this.prisma.rhRubrica.update({ where: { id }, data: { ativo: false } });
  }

  private validarValoresRubrica(
    formaCalculo: string,
    valorPadrao: number | null | undefined,
    percentagem: number | null | undefined
  ): void {
    if (formaCalculo === 'PERCENTAGEM_SALARIO' && (percentagem ?? null) === null) {
      throw new RhBusinessRuleError('Indique a percentagem para uma rubrica calculada em percentagem.');
    }
    if (
      (formaCalculo === 'VALOR_FIXO' || formaCalculo === 'VALOR_X_QUANTIDADE') &&
      (valorPadrao ?? null) === null
    ) {
      throw new RhBusinessRuleError('Indique o valor padrão para esta forma de cálculo.');
    }
  }

  // ── Tipos de ausência ────────────────────────────────────────────────────

  public async listarTiposAusencia(
    filtros: RhFiltroCadastroInput,
    empresaId: string | null
  ): Promise<{ total: number; items: RhTipoAusencia[] }> {
    const empresa = this.exigirEmpresa(empresaId);
    const where: Prisma.RhTipoAusenciaWhereInput = {
      empresaId: empresa,
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo } : {}),
      ...(filtros.search
        ? {
            OR: [
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { descricao: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.rhTipoAusencia.count({ where }),
      this.prisma.rhTipoAusencia.findMany({
        where,
        orderBy: { descricao: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);
    return { total, items };
  }

  public criarTipoAusencia(
    input: CriarRhTipoAusenciaInput,
    empresaId: string | null
  ): Promise<RhTipoAusencia> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhTipoAusenciaSchema.parse(input);
    return this.criarUnico(
      () =>
        this.prisma.rhTipoAusencia.findFirst({
          where: { empresaId: empresa, codigo: dados.codigo },
          select: { id: true },
        }),
      `Já existe um tipo de ausência com o código '${dados.codigo}'.`,
      () => this.prisma.rhTipoAusencia.create({ data: { ...dados, empresaId: empresa } })
    );
  }

  public async atualizarTipoAusencia(
    id: string,
    input: AtualizarRhTipoAusenciaInput,
    empresaId: string | null
  ): Promise<RhTipoAusencia> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhTipoAusenciaSchema.parse(input);
    await this.obterTipoAusencia(id, empresa);
    if (dados.codigo) {
      const colide = await this.prisma.rhTipoAusencia.findFirst({
        where: { empresaId: empresa, codigo: dados.codigo, id: { not: id } },
        select: { id: true },
      });
      if (colide) {
        throw new RhConflictError(`Já existe um tipo de ausência com o código '${dados.codigo}'.`);
      }
    }
    return this.prisma.rhTipoAusencia.update({ where: { id }, data: dados });
  }

  public async inativarTipoAusencia(id: string, empresaId: string | null): Promise<RhTipoAusencia> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.obterTipoAusencia(id, empresa);
    return this.prisma.rhTipoAusencia.update({ where: { id }, data: { ativo: false } });
  }

  private async obterTipoAusencia(id: string, empresaId: string): Promise<RhTipoAusencia> {
    const registo = await this.prisma.rhTipoAusencia.findFirst({ where: { id, empresaId } });
    if (!registo) throw new RhNotFoundError('Tipo de ausência não encontrado.');
    return registo;
  }

  // ── Centros de custo ─────────────────────────────────────────────────────

  public async listarCentrosCusto(
    filtros: RhFiltroCadastroInput,
    empresaId: string | null
  ): Promise<{ total: number; items: CentroCusto[] }> {
    const empresa = this.exigirEmpresa(empresaId);
    const where: Prisma.CentroCustoWhereInput = {
      empresaId: empresa,
      ...(filtros.ativo !== undefined ? { ativo: filtros.ativo } : {}),
      ...(filtros.search
        ? {
            OR: [
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { designacao: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.centroCusto.count({ where }),
      this.prisma.centroCusto.findMany({
        where,
        orderBy: { designacao: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);
    return { total, items };
  }

  public criarCentroCusto(
    input: CriarRhCentroCustoInput,
    empresaId: string | null
  ): Promise<CentroCusto> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhCentroCustoSchema.parse(input);
    return this.criarUnico(
      () =>
        this.prisma.centroCusto.findFirst({
          where: { empresaId: empresa, codigo: dados.codigo },
          select: { id: true },
        }),
      `Já existe um centro de custo com o código '${dados.codigo}'.`,
      () =>
        this.prisma.centroCusto.create({
          data: {
            empresaId: empresa,
            codigo: dados.codigo,
            designacao: dados.designacao,
            descricao: dados.descricao ?? null,
            ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
          },
        })
    );
  }

  public async atualizarCentroCusto(
    id: string,
    input: AtualizarRhCentroCustoInput,
    empresaId: string | null
  ): Promise<CentroCusto> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhCentroCustoSchema.parse(input);
    await this.obterCentroCusto(id, empresa);
    if (dados.codigo) {
      const colide = await this.prisma.centroCusto.findFirst({
        where: { empresaId: empresa, codigo: dados.codigo, id: { not: id } },
        select: { id: true },
      });
      if (colide) throw new RhConflictError(`Já existe um centro de custo com o código '${dados.codigo}'.`);
    }
    return this.prisma.centroCusto.update({
      where: { id },
      data: {
        ...(dados.codigo !== undefined ? { codigo: dados.codigo } : {}),
        ...(dados.designacao !== undefined ? { designacao: dados.designacao } : {}),
        ...(dados.descricao !== undefined ? { descricao: dados.descricao ?? null } : {}),
        ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      },
    });
  }

  public async inativarCentroCusto(id: string, empresaId: string | null): Promise<CentroCusto> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.obterCentroCusto(id, empresa);
    return this.prisma.centroCusto.update({ where: { id }, data: { ativo: false } });
  }

  private async obterCentroCusto(id: string, empresaId: string): Promise<CentroCusto> {
    const registo = await this.prisma.centroCusto.findFirst({ where: { id, empresaId } });
    if (!registo) throw new RhNotFoundError('Centro de custo não encontrado.');
    return registo;
  }

  // ── Parâmetros fiscais (RH-106) ──────────────────────────────────────────

  public async listarParametros(
    filtros: { chave?: string },
    empresaId: string | null
  ): Promise<RhParametroFiscal[]> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhParametroFiscal.findMany({
      where: { empresaId: empresa, ...(filtros.chave ? { chave: filtros.chave } : {}) },
      orderBy: [{ chave: 'asc' }, { vigenteDesde: 'desc' }],
    });
  }

  public async criarParametro(
    input: CriarRhParametroInput,
    empresaId: string | null
  ): Promise<RhParametroFiscal> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhParametroSchema.parse(input);

    const colide = await this.prisma.rhParametroFiscal.findFirst({
      where: {
        empresaId: empresa,
        chave: dados.chave,
        vigenteDesde: dados.vigenteDesde,
      },
      select: { id: true },
    });
    if (colide) {
      throw new RhConflictError(
        `Já existe uma versão do parâmetro '${dados.chave}' com a mesma data de vigência.`
      );
    }

    this.validarValorParametro(dados.tipoValor, dados.valor);

    const criado = await this.prisma.rhParametroFiscal.create({
      data: {
        empresaId: empresa,
        chave: dados.chave,
        valor: dados.valor,
        tipoValor: dados.tipoValor,
        descricao: dados.descricao ?? null,
        vigenteDesde: dados.vigenteDesde,
        vigenteAte: dados.vigenteAte ?? null,
      },
    });

    await this.encerrarVersoesAnteriores(empresa, dados.chave, dados.vigenteDesde);
    this.invalidarCache(empresa);
    return criado;
  }

  /**
   * Resolve o valor de um parâmetro para uma data (default: hoje).
   * @throws RhNotFoundError quando não há versão vigente.
   */
  public async obterParametro<T = unknown>(
    chave: string,
    data: Date,
    empresaId: string | null
  ): Promise<T> {
    const empresa = this.exigirEmpresa(empresaId);
    const versoes = await this.comCache(`${empresa}:parametros`, () =>
      this.prisma.rhParametroFiscal.findMany({
        where: { empresaId: empresa },
        orderBy: { vigenteDesde: 'desc' },
      })
    );
    const versao = versoes.find(
      (p) => p.chave === chave && this.vigenteEm(p, data)
    );
    if (!versao) throw new RhNotFoundError(`Parâmetro '${chave}' sem versão vigente.`);
    return this.tiparValorParametro(versao) as T;
  }

  /** Devolve a versão completa (metadados) do parâmetro vigente numa data. */
  public async obterParametroDetalhado(
    chave: string,
    data: Date,
    empresaId: string | null
  ): Promise<ParametroResolvido> {
    const empresa = this.exigirEmpresa(empresaId);
    const versoes = await this.comCache(`${empresa}:parametros`, () =>
      this.prisma.rhParametroFiscal.findMany({
        where: { empresaId: empresa },
        orderBy: { vigenteDesde: 'desc' },
      })
    );
    const versao = versoes.find((p) => p.chave === chave && this.vigenteEm(p, data));
    if (!versao) throw new RhNotFoundError(`Parâmetro '${chave}' sem versão vigente.`);
    return {
      id: versao.id,
      chave: versao.chave,
      descricao: versao.descricao,
      tipoValor: versao.tipoValor,
      valor: this.tiparValorParametro(versao),
      vigenteDesde: versao.vigenteDesde,
      vigenteAte: versao.vigenteAte,
    };
  }

  // ── Tabela de IRT (RH-106) ───────────────────────────────────────────────

  public async listarTabelasIrt(empresaId: string | null): Promise<RhTabelaIRT[]> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhTabelaIRT.findMany({
      where: { empresaId: empresa },
      orderBy: { vigenteDesde: 'desc' },
    });
  }

  public async obterTabelaIrt(id: string, empresaId: string | null): Promise<TabelaIrtResolvida> {
    const empresa = this.exigirEmpresa(empresaId);
    const tabela = await this.prisma.rhTabelaIRT.findFirst({
      where: { id, empresaId: empresa },
      include: { escaloes: { orderBy: { ordem: 'asc' } } },
    });
    if (!tabela) throw new RhNotFoundError('Tabela de IRT não encontrada.');
    return tabela;
  }

  public async criarTabelaIrt(
    input: CriarRhTabelaIrtInput,
    empresaId: string | null
  ): Promise<RhTabelaIRT> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhTabelaIrtSchema.parse(input);

    const criada = await this.prisma.rhTabelaIRT.create({
      data: {
        empresaId: empresa,
        descricao: dados.descricao,
        vigenteDesde: dados.vigenteDesde,
        vigenteAte: dados.vigenteAte ?? null,
        ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
        escaloes: {
          create: dados.escaloes.map((e) => ({
            ordem: e.ordem,
            rendimentoDe: new Prisma.Decimal(e.rendimentoDe),
            rendimentoAte: e.rendimentoAte !== null ? new Prisma.Decimal(e.rendimentoAte) : null,
            parcelaFixa: new Prisma.Decimal(e.parcelaFixa),
            taxa: new Prisma.Decimal(e.taxa),
            excessoDe: new Prisma.Decimal(e.excessoDe),
          })),
        },
      },
    });

    await this.encerrarVersoesAnteriores(empresa, null, dados.vigenteDesde);
    this.invalidarCache(empresa);
    return criada;
  }

  /**
   * Resolve a tabela de IRT aplicável numa data (default: hoje), com escalões.
   * @throws RhNotFoundError quando não há tabela vigente.
   */
  public async obterTabelaIRT(data: Date, empresaId: string | null): Promise<TabelaIrtResolvida> {
    const empresa = this.exigirEmpresa(empresaId);
    const tabelas = await this.comCache(`${empresa}:irt`, () =>
      this.prisma.rhTabelaIRT.findMany({
        where: { empresaId: empresa, ativo: true },
        include: { escaloes: { orderBy: { ordem: 'asc' } } },
        orderBy: { vigenteDesde: 'desc' },
      })
    );
    const tabela = tabelas.find((t) => this.vigenteEm(t, data));
    if (!tabela) throw new RhNotFoundError('Sem tabela de IRT vigente para a data indicada.');
    return tabela;
  }

  // ── Períodos ─────────────────────────────────────────────────────────────

  public async listarPeriodos(ano: number, empresaId: string | null): Promise<RhPeriodo[]> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhPeriodo.findMany({
      where: { empresaId: empresa, ano },
      orderBy: { mes: 'asc' },
    });
  }

  /** Gera `P01`..`P12` para o ano, ignorando os que já existem (idempotente). */
  public async gerarPeriodos(ano: number, empresaId: string | null): Promise<RhPeriodo[]> {
    const empresa = this.exigirEmpresa(empresaId);
    const existentes = await this.prisma.rhPeriodo.findMany({
      where: { empresaId: empresa, ano },
      select: { codigo: true },
    });
    const codigosExistentes = new Set(existentes.map((p) => p.codigo));

    const novos: Prisma.RhPeriodoCreateManyInput[] = [];
    for (let mes = 1; mes <= 12; mes += 1) {
      const codigo = `P${String(mes).padStart(2, '0')}`;
      if (codigosExistentes.has(codigo)) continue;
      novos.push({
        empresaId: empresa,
        ano,
        codigo,
        mes,
        descricao: this.descricaoMes(mes, ano),
        dataInicio: new Date(Date.UTC(ano, mes - 1, 1)),
        dataFim: new Date(Date.UTC(ano, mes, 0)),
      });
    }

    if (novos.length > 0) {
      await this.prisma.rhPeriodo.createMany({ data: novos });
    }
    return this.listarPeriodos(ano, empresa);
  }

  /**
   * Cria os dados de referência do RH que ainda faltam na empresa (RH-806):
   * departamentos e cargos padrão, mais os períodos do ano corrente.
   *
   * Idempotente — pode ser chamado a partir do assistente de migração tantas
   * vezes quantas forem necessárias; devolve só o que foi efectivamente criado.
   */
  public async semearReferencia(empresaId: string | null): Promise<{
    departamentosCriados: number;
    cargosCriados: number;
    periodosCriados: number;
  }> {
    const empresa = this.exigirEmpresa(empresaId);

    const referencia = await semearDepartamentosECargos(this.prisma, empresa);

    const ano = new Date().getFullYear();
    const antes = await this.prisma.rhPeriodo.count({ where: { empresaId: empresa, ano } });
    await this.gerarPeriodos(ano, empresa);
    const depois = await this.prisma.rhPeriodo.count({ where: { empresaId: empresa, ano } });

    return {
      departamentosCriados: referencia.departamentosCriados,
      cargosCriados: referencia.cargosCriados,
      periodosCriados: depois - antes,
    };
  }

  public async fecharPeriodo(
    id: string,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhPeriodo> {
    const empresa = this.exigirEmpresa(empresaId);
    const periodo = await this.prisma.rhPeriodo.findFirst({ where: { id, empresaId: empresa } });
    if (!periodo) throw new RhNotFoundError('Período não encontrado.');
    if (periodo.estado === 'FECHADO') {
      throw new RhBusinessRuleError('O período já se encontra fechado.');
    }
    const atualizado = await this.prisma.rhPeriodo.update({
      where: { id },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: utilizadorId },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhPeriodo',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Fecho do período ${periodo.codigo}/${periodo.ano}.`,
      severidade: 'info',
      dadosAnteriores: { estado: periodo.estado },
      dadosNovos: { estado: 'FECHADO' },
    });

    return atualizado;
  }

  public async reabrirPeriodo(
    id: string,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhPeriodo> {
    const empresa = this.exigirEmpresa(empresaId);
    const periodo = await this.prisma.rhPeriodo.findFirst({ where: { id, empresaId: empresa } });
    if (!periodo) throw new RhNotFoundError('Período não encontrado.');
    if (periodo.estado !== 'FECHADO') {
      throw new RhBusinessRuleError('Apenas períodos fechados podem ser reabertos.');
    }
    const atualizado = await this.prisma.rhPeriodo.update({
      where: { id },
      data: { estado: 'ABERTO', fechadoEm: null, fechadoPorId: null },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhPeriodo',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Reabertura do período ${periodo.codigo}/${periodo.ano}.`,
      severidade: 'aviso',
      dadosAnteriores: { estado: 'FECHADO', fechadoEm: periodo.fechadoEm, fechadoPorId: periodo.fechadoPorId },
      dadosNovos: { estado: 'ABERTO' },
    });

    return atualizado;
  }

  // ── Configuração singleton ───────────────────────────────────────────────

  public async obterConfiguracao(empresaId: string | null): Promise<RhConfiguracao> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.comCache(`${empresa}:configuracao`, async () => {
      const existente = await this.prisma.rhConfiguracao.findUnique({ where: { empresaId: empresa } });
      if (existente) return existente;
      return this.prisma.rhConfiguracao.create({ data: { empresaId: empresa } });
    });
  }

  public async atualizarConfiguracao(
    input: AtualizarRhConfiguracaoInput,
    empresaId: string | null
  ): Promise<RhConfiguracao> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhConfiguracaoSchema.parse(input);
    await this.obterConfiguracao(empresa);
    this.invalidarCache(empresa);
    return this.prisma.rhConfiguracao.update({
      where: { empresaId: empresa },
      data: {
        ...(dados.modoSubsidioNatalPadrao !== undefined
          ? { modoSubsidioNatalPadrao: dados.modoSubsidioNatalPadrao }
          : {}),
        ...(dados.mesSubsidioNatalPadrao !== undefined
          ? { mesSubsidioNatalPadrao: dados.mesSubsidioNatalPadrao }
          : {}),
        ...(dados.modoSubsidioFeriasPadrao !== undefined
          ? { modoSubsidioFeriasPadrao: dados.modoSubsidioFeriasPadrao }
          : {}),
        ...(dados.mesSubsidioFeriasPadrao !== undefined
          ? { mesSubsidioFeriasPadrao: dados.mesSubsidioFeriasPadrao ?? null }
          : {}),
        ...(dados.baseDiasMes !== undefined ? { baseDiasMes: dados.baseDiasMes } : {}),
        ...(dados.liquidoNegativoBloqueia !== undefined
          ? { liquidoNegativoBloqueia: dados.liquidoNegativoBloqueia }
          : {}),
        ...(dados.serieRecibo !== undefined ? { serieRecibo: dados.serieRecibo } : {}),
      },
    });
  }

  // ── Auxiliares internos ──────────────────────────────────────────────────

  private async criarUnico<T>(
    detetarColisao: () => Promise<{ id: string } | null>,
    mensagemConflito: string,
    criar: () => Promise<T>
  ): Promise<T> {
    const colisao = await detetarColisao();
    if (colisao) throw new RhConflictError(mensagemConflito);
    return criar();
  }

  private paraDecimal(valor: number | null | undefined): Prisma.Decimal | null {
    return valor === null || valor === undefined ? null : new Prisma.Decimal(valor);
  }

  /** `true` quando a data cai dentro da janela de vigência do registo. */
  private vigenteEm(
    registo: { vigenteDesde: Date; vigenteAte: Date | null },
    data: Date
  ): boolean {
    const referencia = this.apenasData(data);
    const desde = this.apenasData(registo.vigenteDesde);
    if (referencia < desde) return false;
    if (!registo.vigenteAte) return true;
    return referencia <= this.apenasData(registo.vigenteAte);
  }

  private apenasData(data: Date): number {
    return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  }

  private validarValorParametro(tipoValor: string, valor: string): void {
    switch (tipoValor) {
      case 'DECIMAL':
        if (!/^-?\d+(\.\d+)?$/.test(valor)) {
          throw new RhBusinessRuleError('O valor do parâmetro deve ser decimal.');
        }
        break;
      case 'INT':
        if (!/^-?\d+$/.test(valor)) {
          throw new RhBusinessRuleError('O valor do parâmetro deve ser inteiro.');
        }
        break;
      case 'BOOLEAN':
        if (!['true', 'false', '1', '0'].includes(valor)) {
          throw new RhBusinessRuleError("O valor do parâmetro deve ser 'true' ou 'false'.");
        }
        break;
      case 'JSON':
        try {
          JSON.parse(valor);
        } catch {
          throw new RhBusinessRuleError('O valor do parâmetro deve ser JSON válido.');
        }
        break;
      default:
        break;
    }
  }

  private tiparValorParametro(
    parametro: Pick<RhParametroFiscal, 'valor' | 'tipoValor'>
  ): unknown {
    switch (parametro.tipoValor) {
      case 'DECIMAL':
        return new Prisma.Decimal(parametro.valor);
      case 'INT':
        return Number.parseInt(parametro.valor, 10);
      case 'BOOLEAN':
        return parametro.valor === 'true' || parametro.valor === '1';
      case 'JSON':
        return JSON.parse(parametro.valor);
      default:
        return parametro.valor;
    }
  }

  /**
   * Fecha a vigência das versões anteriores de um parâmetro/tabela quando uma
   * nova versão é criada, mantendo o histórico coerente.
   */
  private async encerrarVersoesAnteriores(
    empresaId: string,
    chave: string | null,
    vigenteDesde: Date
  ): Promise<void> {
    const ate = new Date(vigenteDesde.getTime() - 86_400_000);
    if (chave) {
      await this.prisma.rhParametroFiscal.updateMany({
        where: {
          empresaId,
          chave,
          vigenteDesde: { lt: vigenteDesde },
          OR: [{ vigenteAte: null }, { vigenteAte: { gte: vigenteDesde } }],
        },
        data: { vigenteAte: ate },
      });
      return;
    }
    // Tabelas de IRT: fecha a anterior que ainda esteja aberta.
    await this.prisma.rhTabelaIRT.updateMany({
      where: {
        empresaId,
        vigenteDesde: { lt: vigenteDesde },
        OR: [{ vigenteAte: null }, { vigenteAte: { gte: vigenteDesde } }],
      },
      data: { vigenteAte: ate },
    });
  }

  private descricaoMes(mes: number, ano: number): string {
    const nomes = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    return `${nomes[mes - 1]} ${ano}`;
  }
}

export const rhConfiguracaoService = new RhConfiguracaoService();
