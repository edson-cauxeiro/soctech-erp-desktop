/**
 * @file rh-ferias.service.ts
 * @description Gestão de férias do módulo de RH (Fase 6: RH-603).
 *
 * Responsabilidades:
 *  - Saldos de férias: listar, atualizar (dias direito, transitados, marcados, gozados);
 *  - Marcações de férias: CRUD, aprovação/rejeição, cancelamento;
 *  - marcação/desmarcação de processamento de subsídio;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhFeriasSaldo,
  RhMarcacaoFerias,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  rhFeriasSaldosListarInputSchema,
  rhFeriasSaldoAtualizarSchema,
  criarRhMarcacaoFeriasSchema,
  atualizarRhMarcacaoFeriasSchema,
  rhMarcacoesFeriasListarInputSchema,
  rhMarcacaoFeriasAprovarSchema,
  type RhFeriasSaldosListarInput,
  type RhFeriasSaldoAtualizarInput,
  type CriarRhMarcacaoFeriasInput,
  type AtualizarRhMarcacaoFeriasInput,
  type RhMarcacoesFeriasListarInput,
  type RhMarcacaoFeriasAprovarInput,
} from '../validators/rh.validator';

export class RhFeriasService {
  constructor(
    private readonly prisma: typeof defaultPrisma = defaultPrisma,
    private readonly audit: AuditService = auditService,
  ) {}

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) {
      throw new Error('A sessão não está associada a uma empresa.');
    }
    return empresaId;
  }

  // ── Saldos de Férias ────────────────────────────────────────────────────────

  async listarSaldos(
    empresaId: string | null,
    input: RhFeriasSaldosListarInput,
  ): Promise<{ total: number; items: RhFeriasSaldo[] }> {
    const filtros = rhFeriasSaldosListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhFeriasSaldoWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.ano && { ano: filtros.ano }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhFeriasSaldo.count({ where }),
      this.prisma.rhFeriasSaldo.findMany({
        where,
        orderBy: { ano: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obterSaldo(id: string, empresaId: string | null): Promise<RhFeriasSaldo | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhFeriasSaldo.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
    });
  }

  async atualizarSaldo(empresaId: string | null, input: RhFeriasSaldoAtualizarInput, usuarioId: string): Promise<RhFeriasSaldo> {
    const dados = rhFeriasSaldoAtualizarSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterSaldo(id, empresa);
    if (!existing) throw new Error('Saldo de férias não encontrado.');

    const data: Prisma.RhFeriasSaldoUpdateInput = {};
    if (updateData.diasDireito !== undefined) data.diasDireito = new Prisma.Decimal(updateData.diasDireito);
    if (updateData.diasTransitados !== undefined) data.diasTransitados = new Prisma.Decimal(updateData.diasTransitados);
    if (updateData.diasMarcados !== undefined) data.diasMarcados = new Prisma.Decimal(updateData.diasMarcados);
    if (updateData.diasGozados !== undefined) data.diasGozados = new Prisma.Decimal(updateData.diasGozados);
    if (updateData.subsidioFeriasProcessado !== undefined) data.subsidioFeriasProcessado = updateData.subsidioFeriasProcessado;

    const updated = await this.prisma.rhFeriasSaldo.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhFeriasSaldo',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Saldo de férias ${id} actualizado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  // ── Marcações de Férias ─────────────────────────────────────────────────────

  async listarMarcacoes(
    empresaId: string | null,
    input: RhMarcacoesFeriasListarInput,
  ): Promise<{ total: number; items: RhMarcacaoFerias[] }> {
    const filtros = rhMarcacoesFeriasListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhMarcacaoFeriasWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.ano && { ano: filtros.ano }),
      ...(filtros.estado && { estado: filtros.estado }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhMarcacaoFerias.count({ where }),
      this.prisma.rhMarcacaoFerias.findMany({
        where,
        orderBy: { dataInicio: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obterMarcacao(id: string, empresaId: string | null): Promise<RhMarcacaoFerias | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhMarcacaoFerias.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
    });
  }

  async criarMarcacao(empresaId: string | null, input: CriarRhMarcacaoFeriasInput, usuarioId: string): Promise<RhMarcacaoFerias> {
    const dados = criarRhMarcacaoFeriasSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarFuncionarioEmpresa(dados.funcionarioId, empresa);

    // Verificar sobreposição com outras marcações do mesmo funcionário/ano
    const sobreposicao = await this.prisma.rhMarcacaoFerias.findFirst({
      where: {
        funcionarioId: dados.funcionarioId,
        ano: dados.ano,
        estado: { in: ['PLANEADA', 'APROVADA', 'GOZADA'] },
        dataInicio: { lte: new Date(dados.dataFim) },
        dataFim: { gte: new Date(dados.dataInicio) },
      },
    });
    if (sobreposicao) {
      throw new Error('Já existe uma marcação de férias sobreposta neste período.');
    }

    const created = await this.prisma.rhMarcacaoFerias.create({
      data: {
        funcionarioId: dados.funcionarioId,
        ano: dados.ano,
        dataInicio: new Date(dados.dataInicio),
        dataFim: new Date(dados.dataFim),
        dias: new Prisma.Decimal(dados.dias),
        estado: dados.estado,
        observacao: dados.observacao ?? null,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhMarcacaoFerias',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Marcação de férias criada para funcionário ${dados.funcionarioId} (${dados.dias} dias)`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizarMarcacao(empresaId: string | null, input: AtualizarRhMarcacaoFeriasInput, usuarioId: string): Promise<RhMarcacaoFerias> {
    const dados = atualizarRhMarcacaoFeriasSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterMarcacao(id, empresa);
    if (!existing) throw new Error('Marcação de férias não encontrada.');

    if (updateData.funcionarioId) await this.validarFuncionarioEmpresa(updateData.funcionarioId, empresa);

    const data: Prisma.RhMarcacaoFeriasUpdateInput = {};
    if (updateData.funcionarioId) data.funcionario = { connect: { id: updateData.funcionarioId } };
    if (updateData.ano !== undefined) data.ano = updateData.ano;
    if (updateData.dataInicio) data.dataInicio = new Date(updateData.dataInicio);
    if (updateData.dataFim) data.dataFim = new Date(updateData.dataFim);
    if (updateData.dias !== undefined) data.dias = new Prisma.Decimal(updateData.dias);
    if (updateData.estado) data.estado = updateData.estado;
    if (updateData.aprovadoPorId !== undefined) data.aprovadoPorId = updateData.aprovadoPorId;
    if (updateData.subsidioProcessamentoId !== undefined) data.subsidioProcessamentoId = updateData.subsidioProcessamentoId;
    if (updateData.observacao !== undefined) data.observacao = updateData.observacao;

    const updated = await this.prisma.rhMarcacaoFerias.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhMarcacaoFerias',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Marcação de férias ${id} actualizada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async aprovarMarcacao(empresaId: string | null, input: RhMarcacaoFeriasAprovarInput, usuarioId: string): Promise<RhMarcacaoFerias> {
    const dados = rhMarcacaoFeriasAprovarSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterMarcacao(dados.id, empresa);
    if (!existing) throw new Error('Marcação de férias não encontrada.');

    const updated = await this.prisma.rhMarcacaoFerias.update({
      where: { id: dados.id },
      data: {
        estado: dados.estado,
        aprovadoPorId: dados.aprovadoPorId,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhMarcacaoFerias',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Marcação de férias ${dados.id} ${dados.estado.toLowerCase()} (aprovado por ${dados.aprovadoPorId})`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async inativarMarcacao(id: string, empresaId: string | null, usuarioId: string): Promise<RhMarcacaoFerias> {
    const empresa = this.exigirEmpresa(empresaId);
    const existing = await this.obterMarcacao(id, empresa);
    if (!existing) throw new Error('Marcação de férias não encontrada.');

    const updated = await this.prisma.rhMarcacaoFerias.update({
      where: { id },
      data: { estado: 'CANCELADA' },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhMarcacaoFerias',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Marcação de férias ${id} cancelada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async marcarSubsidioProcessado(ids: string[], empresaId: string | null, processamentoId: string): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.prisma.rhMarcacaoFerias.updateMany({
      where: { id: { in: ids }, funcionario: { empresaId: empresa } },
      data: { subsidioProcessamentoId: processamentoId },
    });
  }

  async desmarcarSubsidioProcessado(ids: string[], empresaId: string | null): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.prisma.rhMarcacaoFerias.updateMany({
      where: { id: { in: ids }, funcionario: { empresaId: empresa } },
      data: { subsidioProcessamentoId: null },
    });
  }

  private async validarFuncionarioEmpresa(funcionarioId: string, empresaId: string): Promise<void> {
    const f = await this.prisma.rhFuncionario.findFirst({ where: { id: funcionarioId, empresaId }, select: { id: true } });
    if (!f) throw new Error('Funcionário não pertence a esta empresa.');
  }
}

export const rhFeriasService = new RhFeriasService();