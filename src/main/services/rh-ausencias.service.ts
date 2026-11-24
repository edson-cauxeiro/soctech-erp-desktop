/**
 * @file rh-ausencias.service.ts
 * @description Gestão de ausências do módulo de RH (Fase 6: RH-601).
 *
 * Responsabilidades:
 *  - CRUD de ausências com isolamento por empresa;
 *  - aprovação/rejeição de ausências;
 *  - marcação/desmarcação de processamento;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhAusencia,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhAusenciaSchema,
  atualizarRhAusenciaSchema,
  rhAusenciasListarInputSchema,
  rhAusenciaAprovarSchema,
  type CriarRhAusenciaInput,
  type AtualizarRhAusenciaInput,
  type RhAusenciasListarInput,
  type RhAusenciaAprovarInput,
} from '../validators/rh.validator';

export class RhAusenciasService {
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
    input: RhAusenciasListarInput,
  ): Promise<{ total: number; items: (RhAusencia & { tipo: { id: string; codigo: string; descricao: string; justificada: boolean; descontaSalario: boolean; descontaSubsidioAlimentacao: boolean } })[] }> {
    const filtros = rhAusenciasListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhAusenciaWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.tipoId && { tipoId: filtros.tipoId }),
      ...(filtros.estado && { estado: filtros.estado }),
      ...(filtros.dataInicio && { dataInicio: { gte: filtros.dataInicio } }),
      ...(filtros.dataFim && { dataFim: { lte: filtros.dataFim } }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhAusencia.count({ where }),
      this.prisma.rhAusencia.findMany({
        where,
        include: {
          tipo: { select: { id: true, codigo: true, descricao: true, justificada: true, descontaSalario: true, descontaSubsidioAlimentacao: true } },
        },
        orderBy: { dataInicio: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obter(id: string, empresaId: string | null): Promise<(RhAusencia & { tipo: { id: string; codigo: string; descricao: string; justificada: boolean; descontaSalario: boolean; descontaSubsidioAlimentacao: boolean } }) | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhAusencia.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
      include: { tipo: { select: { id: true, codigo: true, descricao: true, justificada: true, descontaSalario: true, descontaSubsidioAlimentacao: true } } },
    });
  }

  async criar(empresaId: string | null, input: CriarRhAusenciaInput, usuarioId: string): Promise<RhAusencia> {
    const dados = criarRhAusenciaSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarFuncionarioEmpresa(dados.funcionarioId, empresa);
    await this.validarTipoAusenciaEmpresa(dados.tipoId, empresa);

    const created = await this.prisma.rhAusencia.create({
      data: {
        funcionarioId: dados.funcionarioId,
        tipoId: dados.tipoId,
        dataInicio: new Date(dados.dataInicio),
        dataFim: new Date(dados.dataFim),
        dias: new Prisma.Decimal(dados.dias),
        horas: dados.horas !== undefined && dados.horas !== null ? new Prisma.Decimal(dados.horas) : null,
        justificativoPath: dados.justificativoPath ?? null,
        observacao: dados.observacao ?? null,
        estado: dados.estado,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhAusencia',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Ausência criada para funcionário ${dados.funcionarioId} (tipo ${dados.tipoId})`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizar(empresaId: string | null, input: AtualizarRhAusenciaInput, usuarioId: string): Promise<RhAusencia> {
    const dados = atualizarRhAusenciaSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Ausência não encontrada.');

    if (updateData.funcionarioId) await this.validarFuncionarioEmpresa(updateData.funcionarioId, empresa);
    if (updateData.tipoId) await this.validarTipoAusenciaEmpresa(updateData.tipoId, empresa);

    const data: Prisma.RhAusenciaUpdateInput = {};
    if (updateData.funcionarioId) data.funcionario = { connect: { id: updateData.funcionarioId } };
    if (updateData.tipoId) data.tipo = { connect: { id: updateData.tipoId } };
    if (updateData.dataInicio) data.dataInicio = new Date(updateData.dataInicio);
    if (updateData.dataFim) data.dataFim = new Date(updateData.dataFim);
    if (updateData.dias !== undefined) data.dias = new Prisma.Decimal(updateData.dias);
    if (updateData.horas !== undefined) data.horas = updateData.horas !== null ? new Prisma.Decimal(updateData.horas) : null;
    if (updateData.justificativoPath !== undefined) data.justificativoPath = updateData.justificativoPath;
    if (updateData.observacao !== undefined) data.observacao = updateData.observacao;
    if (updateData.estado) data.estado = updateData.estado;

    const updated = await this.prisma.rhAusencia.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhAusencia',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Ausência ${id} actualizada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async aprovar(empresaId: string | null, input: RhAusenciaAprovarInput, usuarioId: string): Promise<RhAusencia> {
    const dados = rhAusenciaAprovarSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(dados.id, empresa);
    if (!existing) throw new Error('Ausência não encontrada.');

    const updated = await this.prisma.rhAusencia.update({
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
      entidade: 'RhAusencia',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Ausência ${dados.id} ${dados.estado.toLowerCase()} (aprovado por ${dados.aprovadoPorId})`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async inativar(id: string, empresaId: string | null, usuarioId: string): Promise<RhAusencia> {
    const empresa = this.exigirEmpresa(empresaId);
    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Ausência não encontrada.');

    const updated = await this.prisma.rhAusencia.update({
      where: { id },
      data: { estado: 'CANCELADO' },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhAusencia',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Ausência ${id} cancelada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async marcarProcessada(ids: string[], empresaId: string | null, dataProcessamento: Date): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.prisma.rhAusencia.updateMany({
      where: { id: { in: ids }, funcionario: { empresaId: empresa } },
      data: { processadaEm: dataProcessamento },
    });
  }

  async desmarcarProcessada(ids: string[], empresaId: string | null): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.prisma.rhAusencia.updateMany({
      where: { id: { in: ids }, funcionario: { empresaId: empresa } },
      data: { processadaEm: null },
    });
  }

  private async validarFuncionarioEmpresa(funcionarioId: string, empresaId: string): Promise<void> {
    const f = await this.prisma.rhFuncionario.findFirst({ where: { id: funcionarioId, empresaId }, select: { id: true } });
    if (!f) throw new Error('Funcionário não pertence a esta empresa.');
  }

  private async validarTipoAusenciaEmpresa(tipoId: string, empresaId: string): Promise<void> {
    const t = await this.prisma.rhTipoAusencia.findFirst({ where: { id: tipoId, empresaId }, select: { id: true } });
    if (!t) throw new Error('Tipo de ausência não pertence a esta empresa.');
  }
}

export const rhAusenciasService = new RhAusenciasService();