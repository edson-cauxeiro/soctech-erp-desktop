/**
 * @file rh-alteracoes-mensais.service.ts
 * @description Service para gestão de Alterações Mensais (RH-401).
 *
 * Responsabilidades:
 *  - CRUD de alterações mensais (prémios, comissões, descontos pontuais)
 *  - Isolamento por empresa (ADR-009)
 *  - Estados: PENDENTE → APLICADA → ANULADA (APLICADA fica bloqueada)
 *  - Copiar do mês anterior
 *  - Auditoria de cada escrita
 */

import type {
  Prisma,
  PrismaClient,
  RhAlteracaoMensal,
  RhEstadoAlteracao,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhAlteracaoMensalSchema,
  atualizarRhAlteracaoMensalSchema,
  copiarAlteracoesMesAnteriorSchema,
  type CriarRhAlteracaoMensalData,
  type AtualizarRhAlteracaoMensalData,
  type CopiarAlteracoesMesAnteriorInput,
} from '../validators/rh.validator';
import { RhNotFoundError, RhBusinessRuleError } from '../utils/rh-errors';

export class RhAlteracoesMensaisService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService,
  ) {}

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }

  /**
   * Lista alterações mensais de um funcionário num período, com filtros opcionais.
   */
  async listar(
    input: {
      funcionarioId: string;
      ano: number;
      mes: number;
      estado?: RhEstadoAlteracao;
      skip?: number;
      take?: number;
    },
    empresaId: string | null,
  ): Promise<{ dados: RhAlteracaoMensal[]; total: number }> {
    const eid = this.exigirEmpresa(empresaId);
    const where: Prisma.RhAlteracaoMensalWhereInput = {
      funcionario: { empresaId: eid },
      funcionarioId: input.funcionarioId,
      ano: input.ano,
      mes: input.mes,
      ...(input.estado ? { estado: input.estado } : {}),
    };

    const [dados, total] = await this.prisma.$transaction([
      this.prisma.rhAlteracaoMensal.findMany({
        where,
        include: { rubrica: true },
        orderBy: { createdAt: 'asc' },
        skip: input.skip ?? 0,
        take: input.take ?? 50,
      }),
      this.prisma.rhAlteracaoMensal.count({ where }),
    ]);

    return { dados, total };
  }

  /**
   * Obtém uma alteração mensal por ID, garantindo isolamento por empresa.
   */
  async obter(id: string, empresaId: string | null): Promise<RhAlteracaoMensal> {
    const eid = this.exigirEmpresa(empresaId);
    const alteracao = await this.prisma.rhAlteracaoMensal.findFirst({
      where: { id, funcionario: { empresaId: eid } },
      include: { rubrica: true, funcionario: true },
    });
    if (!alteracao) throw new RhNotFoundError('Alteração mensal não encontrada.');
    return alteracao;
  }

  /**
   * Cria uma alteração mensal (estado inicial: PENDENTE).
   */
  async criar(
    input: CriarRhAlteracaoMensalData,
    empresaId: string | null,
    utilizadorId: string,
  ): Promise<RhAlteracaoMensal> {
    const eid = this.exigirEmpresa(empresaId);
    const dados = criarRhAlteracaoMensalSchema.parse(input);

    // Verifica se o funcionário pertence à empresa
    await this.exigirFuncionario(dados.funcionarioId, eid);

    // Verifica se a rubrica existe e está activa
    const rubrica = await this.prisma.rhRubrica.findUnique({
      where: { id: dados.rubricaId },
    });
    if (!rubrica || !rubrica.ativo) {
      throw new RhBusinessRuleError('Rubrica inexistente ou inactiva.');
    }

    // Verifica duplicidade: mesma funcionário, ano, mês, rubrica
    const existente = await this.prisma.rhAlteracaoMensal.findFirst({
      where: {
        funcionarioId: dados.funcionarioId,
        ano: dados.ano,
        mes: dados.mes,
        rubricaId: dados.rubricaId,
      },
    });
    if (existente) {
      throw new RhBusinessRuleError(
        'Já existe uma alteração para este funcionário/mês/rubrica.',
      );
    }

    const alteracao = await this.prisma.rhAlteracaoMensal.create({
      data: {
        ...dados,
        valor: dados.valor,
        quantidade: dados.quantidade ?? null,
        criadoPorId: utilizadorId,
        estado: 'PENDENTE',
      },
      include: { rubrica: true },
    });

    await this.audit.registar({
      utilizadorId,
      acao: 'criar',
      entidade: 'RhAlteracaoMensal',
      entidadeId: alteracao.id,
      empresaId: eid,
      modulo: 'rh',
      descricao: 'Criação de alteração mensal',
      dadosNovos: alteracao,
    });

    return alteracao;
  }

  /**
   * Atualiza uma alteração mensal (apenas se PENDENTE).
   */
  async atualizar(
    id: string,
    input: AtualizarRhAlteracaoMensalData,
    empresaId: string | null,
    utilizadorId: string,
  ): Promise<RhAlteracaoMensal> {
    const eid = this.exigirEmpresa(empresaId);
    const atual = await this.obter(id, eid);

    if (atual.estado !== 'PENDENTE') {
      throw new RhBusinessRuleError(
        'Só é possível editar alterações em estado PENDENTE.',
      );
    }

    const dados = atualizarRhAlteracaoMensalSchema.parse(input);

    // Se muda rubrica, valida
    if (dados.rubricaId && dados.rubricaId !== atual.rubricaId) {
      const rubrica = await this.prisma.rhRubrica.findUnique({
        where: { id: dados.rubricaId },
      });
      if (!rubrica || !rubrica.ativo) {
        throw new RhBusinessRuleError('Rubrica inexistente ou inactiva.');
      }
      // Verifica duplicidade com a nova rubrica
      const ano = dados.ano ?? atual.ano;
      const mes = dados.mes ?? atual.mes;
      const funcionarioId = atual.funcionarioId;
      const duplicado = await this.prisma.rhAlteracaoMensal.findFirst({
        where: {
          funcionarioId,
          ano,
          mes,
          rubricaId: dados.rubricaId,
          id: { not: id },
        },
      });
      if (duplicado) {
        throw new RhBusinessRuleError(
          'Já existe uma alteração para este funcionário/mês/rubrica.',
        );
      }
    }

    const alteracao = await this.prisma.rhAlteracaoMensal.update({
      where: { id },
      data: {
        ...dados,
        valor: dados.valor ?? atual.valor,
        quantidade: dados.quantidade !== undefined ? dados.quantidade : atual.quantidade,
      },
      include: { rubrica: true },
    });

    await this.audit.registar({
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhAlteracaoMensal',
      entidadeId: alteracao.id,
      empresaId: eid,
      modulo: 'rh',
      descricao: 'Atualização de alteração mensal',
      dadosAnteriores: atual,
      dadosNovos: alteracao,
    });

    return alteracao;
  }

  /**
   * Anula uma alteração mensal (PENDENTE → ANULADA).
   */
  async anular(
    id: string,
    empresaId: string | null,
    utilizadorId: string,
    motivo?: string,
  ): Promise<RhAlteracaoMensal> {
    const eid = this.exigirEmpresa(empresaId);
    const atual = await this.obter(id, eid);

    if (atual.estado === 'ANULADA') {
      throw new RhBusinessRuleError('Alteração já se encontra anulada.');
    }
    if (atual.estado === 'APLICADA') {
      throw new RhBusinessRuleError(
        'Não é possível anular uma alteração já aplicada; anule o processamento primeiro.',
      );
    }

    const alteracao = await this.prisma.rhAlteracaoMensal.update({
      where: { id },
      data: { estado: 'ANULADA', observacao: motivo ?? atual.observacao },
      include: { rubrica: true },
    });

    await this.audit.registar({
      utilizadorId,
      acao: 'anular',
      entidade: 'RhAlteracaoMensal',
      entidadeId: alteracao.id,
      empresaId: eid,
      modulo: 'rh',
      descricao: 'Anulação de alteração mensal',
      dadosAnteriores: { estado: atual.estado, observacao: atual.observacao },
      dadosNovos: { estado: 'ANULADA', observacao: motivo ?? atual.observacao },
    });

    return alteracao;
  }

  /**
   * Copia alterações mensais de um mês para outro (RH-401: copiar do mês anterior).
   * Só copia alterações PENDENTES; cria novas com estado PENDENTE.
   */
  async copiarMesAnterior(
    input: CopiarAlteracoesMesAnteriorInput,
    empresaId: string | null,
    utilizadorId: string,
  ): Promise<{ criadas: number; ignoradas: number }> {
    const eid = this.exigirEmpresa(empresaId);
    const { funcionarioId, anoOrigem, mesOrigem, anoDestino, mesDestino } =
      copiarAlteracoesMesAnteriorSchema.parse(input);

    await this.exigirFuncionario(funcionarioId, eid);

    // Verifica se já existem alterações no mês destino para este funcionário
    const existentes = await this.prisma.rhAlteracaoMensal.findMany({
      where: { funcionarioId, ano: anoDestino, mes: mesDestino },
      select: { rubricaId: true },
    });
    const rubricasExistentes = new Set(existentes.map((e) => e.rubricaId));

    const origem = await this.prisma.rhAlteracaoMensal.findMany({
      where: {
        funcionarioId,
        ano: anoOrigem,
        mes: mesOrigem,
        estado: 'PENDENTE',
      },
    });

    let criadas = 0;
    let ignoradas = 0;

    for (const a of origem) {
      if (rubricasExistentes.has(a.rubricaId)) {
        ignoradas++;
        continue;
      }
      await this.prisma.rhAlteracaoMensal.create({
        data: {
          funcionarioId,
          ano: anoDestino,
          mes: mesDestino,
          rubricaId: a.rubricaId,
          quantidade: a.quantidade,
          valor: a.valor,
          moeda: a.moeda,
          extraordinaria: a.extraordinaria,
          observacao: a.observacao,
          criadoPorId: utilizadorId,
          estado: 'PENDENTE',
        },
      });
      criadas++;
    }

    if (criadas > 0) {
      await this.audit.registar({
        utilizadorId,
        acao: 'criar',
        entidade: 'RhAlteracaoMensal',
        entidadeId: funcionarioId,
        empresaId: eid,
        modulo: 'rh',
        descricao: 'Cópia de alterações mensais do mês anterior',
        dadosNovos: { anoOrigem, mesOrigem, anoDestino, mesDestino, criadas, ignoradas },
      });
    }

    return { criadas, ignoradas };
  }

  /**
   * Marca alterações como APLICADA (chamado pelo processamento após confirmar).
   * Usado internamente pelo serviço de processamento.
   */
async marcarComoAplicada(
    ids: string[],
    empresaId: string | null,
    processamentoItemIdMap: Map<string, string>,
    utilizadorId: string,
  ): Promise<void> {
    if (ids.length === 0) return;

    const eid = this.exigirEmpresa(empresaId);

    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const a = await tx.rhAlteracaoMensal.findFirst({
          where: { id, funcionario: { empresaId: eid } },
        });
        if (!a || a.estado !== 'PENDENTE') continue;

        const itemId = processamentoItemIdMap.get(id);
        await tx.rhAlteracaoMensal.update({
          where: { id },
          data: {
            estado: 'APLICADA',
            processamentoItemId: itemId ?? null,
          },
        });
      }
    });

    await this.audit.registar({
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhAlteracaoMensal',
      entidadeId: ids.join(','),
      empresaId: eid,
      modulo: 'rh',
      descricao: 'Marcação de alterações como aplicadas',
      dadosAnteriores: { estado: 'PENDENTE' },
      dadosNovos: { estado: 'APLICADA', processamentoItemIds: Object.fromEntries(processamentoItemIdMap) },
    });
  }

  /**
   * Reverte alterações de APLICADA para PENDENTE (anulação de processamento).
   */
  async reverterParaPendente(
    ids: string[],
    empresaId: string | null,
    utilizadorId: string,
  ): Promise<void> {
    if (ids.length === 0) return;

    const eid = this.exigirEmpresa(empresaId);

    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const a = await tx.rhAlteracaoMensal.findFirst({
          where: { id, funcionario: { empresaId: eid } },
        });
        if (!a || a.estado !== 'APLICADA') continue;

        await tx.rhAlteracaoMensal.update({
          where: { id },
          data: { estado: 'PENDENTE', processamentoItemId: null },
        });
      }
    });

    await this.audit.registar({
      utilizadorId,
      acao: 'actualizar',
      entidade: 'RhAlteracaoMensal',
      entidadeId: ids.join(','),
      empresaId: eid,
      modulo: 'rh',
      descricao: 'Reversão de alterações para pendente',
      dadosAnteriores: { estado: 'APLICADA' },
      dadosNovos: { estado: 'PENDENTE' },
    });
  }

  private async exigirFuncionario(
    funcionarioId: string,
    empresaId: string,
  ): Promise<void> {
    const f = await this.prisma.rhFuncionario.findUnique({
      where: { id: funcionarioId },
      select: { empresaId: true },
    });
    if (!f || f.empresaId !== empresaId) {
      throw new RhNotFoundError('Funcionário não encontrado nesta empresa.');
    }
  }
}

export const rhAlteracoesMensaisService = new RhAlteracoesMensaisService();