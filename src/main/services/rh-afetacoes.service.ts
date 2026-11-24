/**
 * @file rh-afetacoes.service.ts
 * @description Gestão de afetações de custo do módulo de RH (Fase 6: RH-605).
 *
 * Responsabilidades:
 *  - CRUD de afetações com isolamento por empresa;
 *  - Validação de soma = 100% por funcionário/vigência;
 *  - Histórico de alterações;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhAfetacao,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhAfetacaoSchema,
  atualizarRhAfetacaoSchema,
  rhAfetacoesListarInputSchema,
  type CriarRhAfetacaoInput,
  type AtualizarRhAfetacaoInput,
  type RhAfetacoesListarInput,
} from '../validators/rh.validator';

export class RhAfetacoesService {
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

  async listar(
    empresaId: string | null,
    input: RhAfetacoesListarInput,
  ): Promise<{ total: number; items: (RhAfetacao & { centroCusto: { id: string; codigo: string; designacao: string } | null })[] }> {
    const filtros = rhAfetacoesListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhAfetacaoWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.centroCustoId && { centroCustoId: filtros.centroCustoId }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhAfetacao.count({ where }),
      this.prisma.rhAfetacao.findMany({
        where,
        include: {
          centroCusto: { select: { id: true, codigo: true, designacao: true } },
        },
        orderBy: { dataInicio: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obter(id: string, empresaId: string | null): Promise<(RhAfetacao & { centroCusto: { id: string; codigo: string; designacao: string } | null }) | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhAfetacao.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
      include: { centroCusto: { select: { id: true, codigo: true, designacao: true } } },
    });
  }

  async criar(empresaId: string | null, input: CriarRhAfetacaoInput, usuarioId: string): Promise<RhAfetacao> {
    const dados = criarRhAfetacaoSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarFuncionarioEmpresa(dados.funcionarioId, empresa);
    if (dados.centroCustoId) await this.validarCentroCustoEmpresa(dados.centroCustoId, empresa);

    // Validar soma das percentagens para a vigência
    await this.validarSomaPercentagens(dados.funcionarioId, dados.dataInicio, dados.dataFim ?? null, dados.percentagem, undefined);

    const created = await this.prisma.rhAfetacao.create({
      data: {
        funcionarioId: dados.funcionarioId,
        centroCustoId: dados.centroCustoId,
        percentagem: new Prisma.Decimal(dados.percentagem),
        dataInicio: new Date(dados.dataInicio),
        dataFim: dados.dataFim ? new Date(dados.dataFim) : null,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhAfetacao',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Afectação criada para funcionário ${dados.funcionarioId} (${dados.percentagem}%)`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizar(empresaId: string | null, input: AtualizarRhAfetacaoInput, usuarioId: string): Promise<RhAfetacao> {
    const dados = atualizarRhAfetacaoSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Afectação não encontrada.');

    if (updateData.funcionarioId) await this.validarFuncionarioEmpresa(updateData.funcionarioId, empresa);
    if (updateData.centroCustoId) await this.validarCentroCustoEmpresa(updateData.centroCustoId, empresa);

    const data: Prisma.RhAfetacaoUpdateInput = {};
    if (updateData.funcionarioId) data.funcionario = { connect: { id: updateData.funcionarioId } };
    if (updateData.centroCustoId !== undefined) data.centroCusto = updateData.centroCustoId ? { connect: { id: updateData.centroCustoId } } : { disconnect: true };
    if (updateData.percentagem !== undefined) data.percentagem = new Prisma.Decimal(updateData.percentagem);
    if (updateData.dataInicio) data.dataInicio = new Date(updateData.dataInicio);
    if (updateData.dataFim !== undefined) data.dataFim = updateData.dataFim ? new Date(updateData.dataFim) : null;

    // Validar soma das percentagens para a vigência
    const dataInicio = updateData.dataInicio ?? existing.dataInicio;
    const dataFim = updateData.dataFim !== undefined ? updateData.dataFim : existing.dataFim;
    const percentagem = updateData.percentagem ?? Number(existing.percentagem);
    const funcionarioId = updateData.funcionarioId ?? existing.funcionarioId;

    await this.validarSomaPercentagens(funcionarioId, dataInicio, dataFim, percentagem, id);

    const updated = await this.prisma.rhAfetacao.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhAfetacao',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Afectação ${id} actualizada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async remover(id: string, empresaId: string | null, usuarioId: string): Promise<RhAfetacao> {
    const empresa = this.exigirEmpresa(empresaId);
    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Afectação não encontrada.');

    const deleted = await this.prisma.rhAfetacao.delete({ where: { id } });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'eliminar',
      entidade: 'RhAfetacao',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Afectação ${id} eliminada`,
      dadosAnteriores: existing,
    });

    return deleted;
  }

  async obterSomaPercentagens(funcionarioId: string, dataInicio: Date | string, dataFim: Date | string | null, excluirId?: string): Promise<number> {
    const inicio = new Date(dataInicio);
    const fim = dataFim ? new Date(dataFim) : new Date('9999-12-31');

    const where: Prisma.RhAfetacaoWhereInput = {
      funcionarioId,
      dataInicio: { lte: fim },
      dataFim: { gte: inicio },
      ...(excluirId && { id: { not: excluirId } }),
    };

    const result = await this.prisma.rhAfetacao.aggregate({
      where,
      _sum: { percentagem: true },
    });

    return Number(result._sum.percentagem ?? 0);
  }

  private async validarSomaPercentagens(
    funcionarioId: string,
    dataInicio: Date | string,
    dataFim: Date | string | null,
    novaPercentagem: number,
    excluirId?: string,
  ): Promise<void> {
    const somaAtual = await this.obterSomaPercentagens(funcionarioId, dataInicio, dataFim, excluirId);
    const somaTotal = somaAtual + novaPercentagem;

    if (somaTotal > 100) {
      throw new Error(`A soma das percentagens de afetação excede 100% (atual: ${somaAtual.toFixed(2)}%, nova: ${novaPercentagem.toFixed(2)}%).`);
    }
  }

  private async validarFuncionarioEmpresa(funcionarioId: string, empresaId: string): Promise<void> {
    const f = await this.prisma.rhFuncionario.findFirst({ where: { id: funcionarioId, empresaId }, select: { id: true } });
    if (!f) throw new Error('Funcionário não pertence a esta empresa.');
  }

  private async validarCentroCustoEmpresa(centroCustoId: string, empresaId: string): Promise<void> {
    const c = await this.prisma.centroCusto.findFirst({ where: { id: centroCustoId, empresaId }, select: { id: true } });
    if (!c) throw new Error('Centro de custo não pertence a esta empresa.');
  }
}

export const rhAfetacoesService = new RhAfetacoesService();