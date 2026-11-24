/**
 * @file rh-funcionario.service.ts
 * @description Gestão de funcionários do módulo de RH (Fase 2: RH-201).
 *
 * Responsabilidades:
 *  - CRUD com isolamento por empresa (ADR-009);
 *  - geração do código sequencial por empresa via `RhSequencia`
 *    (`FUNCIONARIO:<empresaId>`, formato `001`, `002`, …);
 *  - **inactivação** em vez de eliminação — funcionários com histórico
 *    (contratos, processamentos, pagamentos) nunca são apagados fisicamente;
 *  - auditoria de cada escrita (`auditService`, append-only).
 */

import type {
  Prisma,
  PrismaClient,
  RhEstadoFuncionario,
  RhDependente,
  RhFuncionarioRubrica,
  RhFuncionarioDocumento,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import { sanitizarRespostaSemSalarios } from '../utils/sanitize';
import {
  criarRhFuncionarioSchema,
  atualizarRhFuncionarioSchema,
  criarRhDependenteSchema,
  atualizarRhDependenteSchema,
  criarRhFuncionarioRubricaSchema,
  atualizarRhFuncionarioRubricaSchema,
  criarRhFuncionarioDocumentoSchema,
  atualizarRhFuncionarioDocumentoSchema,
  type CriarRhFuncionarioInput,
  type AtualizarRhFuncionarioInput,
  type CriarRhFuncionarioData,
  type AtualizarRhFuncionarioData,
  type CriarRhDependenteData,
  type AtualizarRhDependenteData,
  type CriarRhFuncionarioRubricaData,
  type AtualizarRhFuncionarioRubricaData,
  type CriarRhFuncionarioDocumentoData,
  type AtualizarRhFuncionarioDocumentoData,
  type FiltroFuncionarioInput,
} from '../validators/rh.validator';
import { RhNotFoundError, RhBusinessRuleError } from '../utils/rh-errors';

const PREFIXO_SEQUENCIA = 'FUNCIONARIO';
const LARGURA_CODIGO = 3;

/**
 * Gera o próximo código sequencial de funcionário (`001`, `002`, …) por empresa.
 * Partilhado com a importação CSV (RH-208) para que os códigos de ambos os
 * caminhos partilhem a mesma sequência transaccional.
 */
export async function proximoCodigoFuncionario(
  tx: Prisma.TransactionClient,
  empresaId: string
): Promise<string> {
  const chave = `${PREFIXO_SEQUENCIA}:${empresaId}`;
  const sequencia = await tx.rhSequencia.upsert({
    where: { chave },
    create: { chave, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return String(sequencia.ultimo).padStart(LARGURA_CODIGO, '0');
}

/**
 * Mapeia a entrada validada de um funcionário para o `create` do Prisma.
 * Partilhado com a importação CSV (RH-208) para evitar divergências entre o
 * formulário e o ficheiro.
 */
export function paraCriarFuncionario(
  dados: CriarRhFuncionarioInput,
  empresaId: string,
  codigo: string
): Prisma.RhFuncionarioUncheckedCreateInput {
  return {
    empresaId,
    codigo,
    nome: dados.nome,
    documentoNumero: dados.documentoNumero ?? null,
    nif: dados.nif ?? null,
    niss: dados.niss ?? null,
    dataNascimento: dados.dataNascimento ?? null,
    genero: dados.genero ?? null,
    estadoCivil: dados.estadoCivil ?? null,
    nacionalidade: dados.nacionalidade ?? null,
    morada: dados.morada ?? null,
    telefone: dados.telefone ?? null,
    email: dados.email ?? null,
    fotoPath: dados.fotoPath ?? null,
    departamentoId: dados.departamentoId ?? null,
    cargoId: dados.cargoId ?? null,
    categoria: dados.categoria ?? null,
    dataAdmissao: dados.dataAdmissao,
    dataCessacao: dados.dataCessacao ?? null,
    ...(dados.estado ? { estado: dados.estado } : {}),
    formaPagamento: dados.formaPagamento,
    banco: dados.banco ?? null,
    iban: dados.iban ?? null,
    modoSubsidioNatal: dados.modoSubsidioNatal ?? null,
    modoSubsidioFerias: dados.modoSubsidioFerias ?? null,
    mesPagamentoSubsidioNatal: dados.mesPagamentoSubsidioNatal ?? null,
    mesPagamentoSubsidioFerias: dados.mesPagamentoSubsidioFerias ?? null,
  };
}

/** Linha resumida usada na lista de funcionários (RH-202). */
export interface RhFuncionarioListaItem {
  id: string;
  codigo: string;
  nome: string;
  nif: string | null;
  documentoNumero: string | null;
  telefone: string | null;
  email: string | null;
  estado: RhEstadoFuncionario;
  dataAdmissao: Date;
  departamento: { id: string; nome: string } | null;
  cargo: { id: string; nome: string } | null;
}

/** Funcionário com as relações da ficha (RH-203). */
export type RhFuncionarioDetalhe = Prisma.RhFuncionarioGetPayload<{
  include: {
    departamento: true;
    cargo: true;
    dependentes: true;
    documentos: true;
    rubricasFixas: true;
    contratos: true;
  };
}>;

const INCLUDE_DETALHE = {
  departamento: true,
  cargo: true,
  dependentes: { orderBy: { nome: 'asc' } },
  documentos: { orderBy: { createdAt: 'desc' } },
  rubricasFixas: {
    include: { rubrica: { select: { id: true, codigo: true, descricao: true, tipo: true } } },
    orderBy: { dataInicio: 'desc' },
  },
  contratos: {
    orderBy: { dataInicio: 'desc' },
    include: { alteracoesSalariais: { orderBy: { dataEfeito: 'desc' } } },
  },
} satisfies Prisma.RhFuncionarioInclude;

const SELECT_LISTA = {
  id: true,
  codigo: true,
  nome: true,
  nif: true,
  documentoNumero: true,
  telefone: true,
  email: true,
  estado: true,
  dataAdmissao: true,
  departamento: { select: { id: true, nome: true } },
  cargo: { select: { id: true, nome: true } },
} satisfies Prisma.RhFuncionarioSelect;

export class RhFuncionarioService {
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

  // ── Leitura ──────────────────────────────────────────────────────────────

  public async listar(
    filtros: FiltroFuncionarioInput,
    empresaId: string | null
  ): Promise<{ total: number; items: RhFuncionarioListaItem[] }> {
    const empresa = this.exigirEmpresa(empresaId);
    const where: Prisma.RhFuncionarioWhereInput = {
      empresaId: empresa,
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.departamentoId ? { departamentoId: filtros.departamentoId } : {}),
      ...(filtros.codigo ? { codigo: { contains: filtros.codigo, mode: 'insensitive' } } : {}),
      ...(filtros.nif ? { nif: { contains: filtros.nif, mode: 'insensitive' } } : {}),
      ...(filtros.search
        ? {
            OR: [
              { nome: { contains: filtros.search, mode: 'insensitive' } },
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { nif: { contains: filtros.search, mode: 'insensitive' } },
              { documentoNumero: { contains: filtros.search, mode: 'insensitive' } },
              { email: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.rhFuncionario.count({ where }),
      this.prisma.rhFuncionario.findMany({
        where,
        orderBy: { codigo: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
        select: SELECT_LISTA,
      }),
    ]);

    return { total, items };
  }

  public async obterDetalhe(
    id: string,
    empresaId: string | null,
    podeVerSalarios: boolean = false
  ): Promise<RhFuncionarioDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const registo = await this.prisma.rhFuncionario.findFirst({
      where: { id, empresaId: empresa },
      include: INCLUDE_DETALHE,
    });
    if (!registo) throw new RhNotFoundError('Funcionário não encontrado.');

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(registo, false) as RhFuncionarioDetalhe;
    }
    return registo;
  }

  // ── Escrita ──────────────────────────────────────────────────────────────

  public async criar(
    input: CriarRhFuncionarioData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhFuncionarioSchema.parse(input);
    await this.validarReferencias(dados, empresa);

    const criado = await this.prisma.$transaction(async (tx) => {
      const codigo = await this.proximoCodigo(tx, empresa);
      return tx.rhFuncionario.create({
        data: this.paraCriar(dados, empresa, codigo),
        include: INCLUDE_DETALHE,
      });
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'criar',
      entidade: 'RhFuncionario',
      entidadeId: criado.id,
      modulo: 'rh',
      descricao: `Funcionário ${criado.codigo} — ${criado.nome} criado.`,
      dadosNovos: criado,
    });

    return criado;
  }

  public async atualizar(
    id: string,
    input: AtualizarRhFuncionarioData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhFuncionarioSchema.parse(input);
    const anterior = await this.obterDetalhe(id, empresa);
    await this.validarReferencias(dados, empresa);

    const atualizado = await this.prisma.rhFuncionario.update({
      where: { id },
      data: this.paraAtualizar(dados),
      include: INCLUDE_DETALHE,
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhFuncionario',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Funcionário ${atualizado.codigo} — ${atualizado.nome} atualizado.`,
      dadosAnteriores: anterior,
      dadosNovos: atualizado,
    });

    return atualizado;
  }

  /**
   * Inactiva o funcionário (nunca remove). O registo e todo o histórico
   * (contratos, processamentos, pagamentos) permanecem intactos.
   */
  public async inativar(
    id: string,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioDetalhe> {
    const empresa = this.exigirEmpresa(empresaId);
    const anterior = await this.obterDetalhe(id, empresa);
    if (anterior.estado === 'INATIVO') {
      throw new RhBusinessRuleError('O funcionário já se encontra inativo.');
    }

    const atualizado = await this.prisma.rhFuncionario.update({
      where: { id },
      data: { estado: 'INATIVO' },
      include: INCLUDE_DETALHE,
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhFuncionario',
      entidadeId: id,
      modulo: 'rh',
      severidade: 'aviso',
      descricao: `Funcionário ${atualizado.codigo} — ${atualizado.nome} inativado.`,
      dadosAnteriores: { estado: anterior.estado },
      dadosNovos: { estado: atualizado.estado },
    });

    return atualizado;
  }

  // ── Dependentes (RH-203) ──────────────────────────────────────────────────

  public async criarDependente(
    funcionarioId: string,
    input: CriarRhDependenteData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhDependente> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhDependenteSchema.parse(input);
    await this.exigirFuncionario(funcionarioId, empresa);

    const criado = await this.prisma.rhDependente.create({
      data: {
        funcionarioId,
        nome: dados.nome,
        parentesco: dados.parentesco,
        dataNascimento: dados.dataNascimento ?? null,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'criar',
      entidade: 'RhDependente',
      entidadeId: criado.id,
      modulo: 'rh',
      descricao: `Dependente '${criado.nome}' adicionado ao funcionário.`,
      dadosNovos: criado,
    });

    return criado;
  }

  public async atualizarDependente(
    id: string,
    input: AtualizarRhDependenteData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhDependente> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhDependenteSchema.parse(input);
    const anterior = await this.dependenteDaEmpresa(id, empresa);

    const atualizado = await this.prisma.rhDependente.update({
      where: { id },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.parentesco !== undefined ? { parentesco: dados.parentesco } : {}),
        ...(dados.dataNascimento !== undefined
          ? { dataNascimento: dados.dataNascimento ?? null }
          : {}),
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhDependente',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Dependente '${atualizado.nome}' atualizado.`,
      dadosAnteriores: anterior,
      dadosNovos: atualizado,
    });

    return atualizado;
  }

  public async removerDependente(
    id: string,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<{ id: string }> {
    const empresa = this.exigirEmpresa(empresaId);
    const anterior = await this.dependenteDaEmpresa(id, empresa);

    await this.prisma.rhDependente.delete({ where: { id } });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'eliminar',
      entidade: 'RhDependente',
      entidadeId: id,
      modulo: 'rh',
      severidade: 'aviso',
      descricao: `Dependente '${anterior.nome}' removido.`,
      dadosAnteriores: anterior,
    });

    return { id };
  }

  // ── Rubricas fixas (RH-203/RH-206) ────────────────────────────────────────

  public async criarRubricaFixa(
    funcionarioId: string,
    input: CriarRhFuncionarioRubricaData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhFuncionarioRubricaSchema.parse(input);
    await this.exigirFuncionario(funcionarioId, empresa);
    await this.exigirRubrica(dados.rubricaId, empresa);

    const criado = await this.prisma.rhFuncionarioRubrica.create({
      data: {
        funcionarioId,
        rubricaId: dados.rubricaId,
        valor: dados.valor ?? null,
        percentagem: dados.percentagem ?? null,
        moeda: dados.moeda,
        dataInicio: dados.dataInicio,
        dataFim: dados.dataFim ?? null,
        ativo: dados.ativo,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'criar',
      entidade: 'RhFuncionarioRubrica',
      entidadeId: criado.id,
      modulo: 'rh',
      descricao: 'Rubrica fixa atribuída ao funcionário.',
      dadosNovos: criado,
    });

    return criado;
  }

  public async atualizarRubricaFixa(
    id: string,
    input: AtualizarRhFuncionarioRubricaData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhFuncionarioRubricaSchema.parse(input);
    const anterior = await this.rubricaFixaDaEmpresa(id, empresa);
    if (dados.rubricaId !== undefined) await this.exigirRubrica(dados.rubricaId, empresa);

    const atualizado = await this.prisma.rhFuncionarioRubrica.update({
      where: { id },
      data: {
        ...(dados.rubricaId !== undefined ? { rubricaId: dados.rubricaId } : {}),
        ...(dados.valor !== undefined ? { valor: dados.valor ?? null } : {}),
        ...(dados.percentagem !== undefined ? { percentagem: dados.percentagem ?? null } : {}),
        ...(dados.moeda !== undefined ? { moeda: dados.moeda } : {}),
        ...(dados.dataInicio !== undefined ? { dataInicio: dados.dataInicio } : {}),
        ...(dados.dataFim !== undefined ? { dataFim: dados.dataFim ?? null } : {}),
        ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhFuncionarioRubrica',
      entidadeId: id,
      modulo: 'rh',
      descricao: 'Rubrica fixa do funcionário atualizada.',
      dadosAnteriores: anterior,
      dadosNovos: atualizado,
    });

    return atualizado;
  }

  public async inativarRubricaFixa(
    id: string,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioRubrica> {
    const empresa = this.exigirEmpresa(empresaId);
    const anterior = await this.rubricaFixaDaEmpresa(id, empresa);
    if (!anterior.ativo) {
      throw new RhBusinessRuleError('A rubrica fixa já se encontra inactiva.');
    }

    const atualizado = await this.prisma.rhFuncionarioRubrica.update({
      where: { id },
      data: { ativo: false },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhFuncionarioRubrica',
      entidadeId: id,
      modulo: 'rh',
      severidade: 'aviso',
      descricao: 'Rubrica fixa do funcionário inactivada.',
      dadosAnteriores: { ativo: anterior.ativo },
      dadosNovos: { ativo: atualizado.ativo },
    });

    return atualizado;
  }

  // ── Documentos (RH-203) ───────────────────────────────────────────────────

  public async criarDocumento(
    funcionarioId: string,
    input: CriarRhFuncionarioDocumentoData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioDocumento> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = criarRhFuncionarioDocumentoSchema.parse(input);
    await this.exigirFuncionario(funcionarioId, empresa);

    const criado = await this.prisma.rhFuncionarioDocumento.create({
      data: {
        funcionarioId,
        tipo: dados.tipo,
        descricao: dados.descricao ?? null,
        caminho: dados.caminho,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'criar',
      entidade: 'RhFuncionarioDocumento',
      entidadeId: criado.id,
      modulo: 'rh',
      descricao: `Documento '${criado.tipo}' anexado ao funcionário.`,
      dadosNovos: criado,
    });

    return criado;
  }

  public async atualizarDocumento(
    id: string,
    input: AtualizarRhFuncionarioDocumentoData,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<RhFuncionarioDocumento> {
    const empresa = this.exigirEmpresa(empresaId);
    const dados = atualizarRhFuncionarioDocumentoSchema.parse(input);
    const anterior = await this.documentoDaEmpresa(id, empresa);

    const atualizado = await this.prisma.rhFuncionarioDocumento.update({
      where: { id },
      data: {
        ...(dados.tipo !== undefined ? { tipo: dados.tipo } : {}),
        ...(dados.descricao !== undefined ? { descricao: dados.descricao ?? null } : {}),
        ...(dados.caminho !== undefined ? { caminho: dados.caminho } : {}),
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhFuncionarioDocumento',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Documento '${atualizado.tipo}' atualizado.`,
      dadosAnteriores: anterior,
      dadosNovos: atualizado,
    });

    return atualizado;
  }

  public async removerDocumento(
    id: string,
    empresaId: string | null,
    utilizadorId: string
  ): Promise<{ id: string }> {
    const empresa = this.exigirEmpresa(empresaId);
    const anterior = await this.documentoDaEmpresa(id, empresa);

    await this.prisma.rhFuncionarioDocumento.delete({ where: { id } });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'eliminar',
      entidade: 'RhFuncionarioDocumento',
      entidadeId: id,
      modulo: 'rh',
      severidade: 'aviso',
      descricao: `Documento '${anterior.tipo}' removido.`,
      dadosAnteriores: anterior,
    });

    return { id };
  }

  // ── Auxiliares ───────────────────────────────────────────────────────────

  private async exigirFuncionario(id: string, empresaId: string): Promise<{ id: string }> {
    const funcionario = await this.prisma.rhFuncionario.findFirst({
      where: { id, empresaId },
      select: { id: true },
    });
    if (!funcionario) throw new RhNotFoundError('Funcionário não encontrado.');
    return funcionario;
  }

  private async exigirRubrica(rubricaId: string, empresaId: string): Promise<void> {
    const rubrica = await this.prisma.rhRubrica.findFirst({
      where: { id: rubricaId, empresaId },
      select: { id: true },
    });
    if (!rubrica) throw new RhBusinessRuleError('Rubrica inválida ou de outra empresa.');
  }

  private async dependenteDaEmpresa(
    id: string,
    empresaId: string
  ): Promise<RhDependente> {
    const registo = await this.prisma.rhDependente.findFirst({
      where: { id, funcionario: { empresaId } },
    });
    if (!registo) throw new RhNotFoundError('Dependente não encontrado.');
    return registo;
  }

  private async rubricaFixaDaEmpresa(
    id: string,
    empresaId: string
  ): Promise<RhFuncionarioRubrica> {
    const registo = await this.prisma.rhFuncionarioRubrica.findFirst({
      where: { id, funcionario: { empresaId } },
    });
    if (!registo) throw new RhNotFoundError('Rubrica fixa não encontrada.');
    return registo;
  }

  private async documentoDaEmpresa(
    id: string,
    empresaId: string
  ): Promise<RhFuncionarioDocumento> {
    const registo = await this.prisma.rhFuncionarioDocumento.findFirst({
      where: { id, funcionario: { empresaId } },
    });
    if (!registo) throw new RhNotFoundError('Documento não encontrado.');
    return registo;
  }

  /** Gera o próximo código sequencial (`001`, `002`, …) por empresa. */
  private async proximoCodigo(tx: Prisma.TransactionClient, empresaId: string): Promise<string> {
    return proximoCodigoFuncionario(tx, empresaId);
  }

  private async validarReferencias(
    dados: Partial<CriarRhFuncionarioInput>,
    empresaId: string
  ): Promise<void> {
    if (dados.departamentoId) {
      const departamento = await this.prisma.rhDepartamento.findFirst({
        where: { id: dados.departamentoId, empresaId },
        select: { id: true },
      });
      if (!departamento) throw new RhBusinessRuleError('Departamento inválido ou de outra empresa.');
    }
    if (dados.cargoId) {
      const cargo = await this.prisma.rhCargo.findFirst({
        where: { id: dados.cargoId, empresaId },
        select: { id: true },
      });
      if (!cargo) throw new RhBusinessRuleError('Cargo inválido ou de outra empresa.');
    }
  }

  private paraCriar(
    dados: CriarRhFuncionarioInput,
    empresaId: string,
    codigo: string
  ): Prisma.RhFuncionarioUncheckedCreateInput {
    return paraCriarFuncionario(dados, empresaId, codigo);
  }

  private paraAtualizar(
    dados: AtualizarRhFuncionarioInput
  ): Prisma.RhFuncionarioUncheckedUpdateInput {
    const data: Prisma.RhFuncionarioUncheckedUpdateInput = {};

    if (dados.nome !== undefined) data.nome = dados.nome;
    if (dados.documentoNumero !== undefined) data.documentoNumero = dados.documentoNumero ?? null;
    if (dados.nif !== undefined) data.nif = dados.nif ?? null;
    if (dados.niss !== undefined) data.niss = dados.niss ?? null;
    if (dados.dataNascimento !== undefined) data.dataNascimento = dados.dataNascimento ?? null;
    if (dados.genero !== undefined) data.genero = dados.genero ?? null;
    if (dados.estadoCivil !== undefined) data.estadoCivil = dados.estadoCivil ?? null;
    if (dados.nacionalidade !== undefined) data.nacionalidade = dados.nacionalidade ?? null;
    if (dados.morada !== undefined) data.morada = dados.morada ?? null;
    if (dados.telefone !== undefined) data.telefone = dados.telefone ?? null;
    if (dados.email !== undefined) data.email = dados.email ?? null;
    if (dados.fotoPath !== undefined) data.fotoPath = dados.fotoPath ?? null;
    if (dados.departamentoId !== undefined) data.departamentoId = dados.departamentoId ?? null;
    if (dados.cargoId !== undefined) data.cargoId = dados.cargoId ?? null;
    if (dados.categoria !== undefined) data.categoria = dados.categoria ?? null;
    if (dados.dataAdmissao !== undefined) data.dataAdmissao = dados.dataAdmissao;
    if (dados.dataCessacao !== undefined) data.dataCessacao = dados.dataCessacao ?? null;
    if (dados.estado !== undefined) data.estado = dados.estado;
    if (dados.formaPagamento !== undefined) data.formaPagamento = dados.formaPagamento;
    if (dados.banco !== undefined) data.banco = dados.banco ?? null;
    if (dados.iban !== undefined) data.iban = dados.iban ?? null;
    if (dados.modoSubsidioNatal !== undefined) data.modoSubsidioNatal = dados.modoSubsidioNatal ?? null;
    if (dados.modoSubsidioFerias !== undefined) data.modoSubsidioFerias = dados.modoSubsidioFerias ?? null;
    if (dados.mesPagamentoSubsidioNatal !== undefined) {
      data.mesPagamentoSubsidioNatal = dados.mesPagamentoSubsidioNatal ?? null;
    }
    if (dados.mesPagamentoSubsidioFerias !== undefined) {
      data.mesPagamentoSubsidioFerias = dados.mesPagamentoSubsidioFerias ?? null;
    }

    return data;
  }
}

export const rhFuncionarioService = new RhFuncionarioService();
