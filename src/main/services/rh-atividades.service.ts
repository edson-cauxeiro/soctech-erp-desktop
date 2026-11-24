/**
 * @file rh-atividades.service.ts
 * @description Gestão de atividades de independentes do módulo de RH (Fase 7: RH-702).
 *
 * Responsabilidades:
 *  - CRUD de atividades com isolamento por empresa;
 *  - Validação de sobreposição de datas;
 *  - Filtro por independente e centro de custo;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhAtividade,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhAtividadeSchema,
  atualizarRhAtividadeSchema,
  rhAtividadesListarInputSchema,
  type CriarRhAtividadeInput,
  type AtualizarRhAtividadeInput,
  type RhAtividadesListarInput,
} from '../validators/rh.validator';

export class RhAtividadesService {
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
    input: RhAtividadesListarInput,
  ): Promise<{ total: number; items: (RhAtividade & { independente: { id: string; codigo: string; nome: string }; centroCusto: { id: string; codigo: string; designacao: string } | null })[] }> {
    const filtros = rhAtividadesListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhAtividadeWhereInput = {
      independente: { empresaId: empresa },
      ...(filtros.independenteId && { independenteId: filtros.independenteId }),
      ...(filtros.centroCustoId && { centroCustoId: filtros.centroCustoId }),
      ...(filtros.ativa !== undefined && { ativa: filtros.ativa }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhAtividade.count({ where }),
      this.prisma.rhAtividade.findMany({
        where,
        include: {
          independente: { select: { id: true, codigo: true, nome: true } },
          centroCusto: { select: { id: true, codigo: true, designacao: true } },
        },
        orderBy: { dataInicio: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obter(id: string, empresaId: string | null): Promise<(RhAtividade & { independente: { id: string; codigo: string; nome: string }; centroCusto: { id: string; codigo: string; designacao: string } | null }) | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhAtividade.findFirst({
      where: { id, independente: { empresaId: empresa } },
      include: {
        independente: { select: { id: true, codigo: true, nome: true } },
        centroCusto: { select: { id: true, codigo: true, designacao: true } },
      },
    });
  }

  async criar(empresaId: string | null, input: CriarRhAtividadeInput, usuarioId: string): Promise<RhAtividade> {
    const dados = criarRhAtividadeSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarIndependenteEmpresa(dados.independenteId, empresa);
    if (dados.centroCustoId) await this.validarCentroCustoEmpresa(dados.centroCustoId, empresa);

    // Verificar sobreposição com outras atividades do mesmo independente
    const sobreposicao = await this.prisma.rhAtividade.findFirst({
      where: {
        independenteId: dados.independenteId,
        ativa: true,
        dataInicio: { lte: new Date(dados.dataFim ?? new Date('9999-12-31')) },
        dataFim: { gte: new Date(dados.dataInicio) },
      },
    });
    if (sobreposicao) {
      throw new Error('Já existe uma atividade ativa sobreposta neste período para este independente.');
    }

    const created = await this.prisma.rhAtividade.create({
      data: {
        independenteId: dados.independenteId,
        descricao: dados.descricao,
        valorFixo: dados.valorFixo !== undefined ? new Prisma.Decimal(dados.valorFixo) : null,
        valorHora: dados.valorHora !== undefined ? new Prisma.Decimal(dados.valorHora) : null,
        centroCustoId: dados.centroCustoId ?? null,
        dataInicio: new Date(dados.dataInicio),
        dataFim: dados.dataFim ? new Date(dados.dataFim) : null,
        ativa: dados.ativa ?? true,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhAtividade',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Atividade criada para independente ${dados.independenteId} (${dados.descricao})`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizar(empresaId: string | null, input: AtualizarRhAtividadeInput, usuarioId: string): Promise<RhAtividade> {
    const dados = atualizarRhAtividadeSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Atividade não encontrada.');

    if (updateData.independenteId) await this.validarIndependenteEmpresa(updateData.independenteId, empresa);
    if (updateData.centroCustoId) await this.validarCentroCustoEmpresa(updateData.centroCustoId, empresa);

    const data: Prisma.RhAtividadeUpdateInput = {};
    if (updateData.independenteId) data.independente = { connect: { id: updateData.independenteId } };
    if (updateData.descricao) data.descricao = updateData.descricao;
    if (updateData.valorFixo !== undefined) data.valorFixo = updateData.valorFixo !== null ? new Prisma.Decimal(updateData.valorFixo) : null;
    if (updateData.valorHora !== undefined) data.valorHora = updateData.valorHora !== null ? new Prisma.Decimal(updateData.valorHora) : null;
    if (updateData.centroCustoId !== undefined) data.centroCusto = updateData.centroCustoId ? { connect: { id: updateData.centroCustoId } } : { disconnect: true };
    if (updateData.dataInicio) data.dataInicio = new Date(updateData.dataInicio);
    if (updateData.dataFim !== undefined) data.dataFim = updateData.dataFim ? new Date(updateData.dataFim) : null;
    if (updateData.ativa !== undefined) data.ativa = updateData.ativa;

    // Verificar sobreposição se estiver a alterar datas
    if (updateData.dataInicio || updateData.dataFim) {
      const dataInicio = updateData.dataInicio ? new Date(updateData.dataInicio) : existing.dataInicio;
      const dataFim = updateData.dataFim !== undefined ? (updateData.dataFim ? new Date(updateData.dataFim) : null) : existing.dataFim;
      
      const sobreposicao = await this.prisma.rhAtividade.findFirst({
        where: {
          independenteId: updateData.independenteId ?? existing.independenteId,
          ativa: true,
          id: { not: existing.id },
          dataInicio: { lte: dataFim ?? new Date('9999-12-31') },
          dataFim: { gte: dataInicio },
        },
      });
      if (sobreposicao) {
        throw new Error('Já existe uma atividade ativa sobreposta neste período para este independente.');
      }
    }

    const updated = await this.prisma.rhAtividade.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhAtividade',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Atividade ${id} actualizada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async inativar(id: string, empresaId: string | null, usuarioId: string): Promise<RhAtividade> {
    const empresa = this.exigirEmpresa(empresaId);
    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Atividade não encontrada.');

    const updated = await this.prisma.rhAtividade.update({
      where: { id },
      data: { ativa: false },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhAtividade',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Atividade ${id} inativada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  private async validarIndependenteEmpresa(independenteId: string, empresaId: string): Promise<void> {
    const i = await this.prisma.rhIndependente.findFirst({ where: { id: independenteId, empresaId }, select: { id: true } });
    if (!i) throw new Error('Independente não pertence a esta empresa.');
  }

  private async validarCentroCustoEmpresa(centroCustoId: string, empresaId: string): Promise<void> {
    const c = await this.prisma.centroCusto.findFirst({ where: { id: centroCustoId, empresaId }, select: { id: true } });
    if (!c) throw new Error('Centro de custo não pertence a esta empresa.');
  }
}

export const rhAtividadesService = new RhAtividadesService();