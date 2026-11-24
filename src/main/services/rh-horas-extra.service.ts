/**
 * @file rh-horas-extra.service.ts
 * @description Gestão de horas extra do módulo de RH (Fase 6: RH-602).
 *
 * Responsabilidades:
 *  - CRUD de horas extra com isolamento por empresa;
 *  - aprovação/rejeição de horas extra;
 *  - marcação/desmarcação de processamento;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhHoraExtra,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhHoraExtraSchema,
  atualizarRhHoraExtraSchema,
  rhHorasExtraListarInputSchema,
  rhHoraExtraAprovarSchema,
  type CriarRhHoraExtraInput,
  type AtualizarRhHoraExtraInput,
  type RhHorasExtraListarInput,
  type RhHoraExtraAprovarInput,
} from '../validators/rh.validator';

export class RhHorasExtraService {
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
    input: RhHorasExtraListarInput,
  ): Promise<{ total: number; items: RhHoraExtra[] }> {
    const filtros = rhHorasExtraListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhHoraExtraWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.tipo && { tipo: filtros.tipo }),
      ...(filtros.estado && { estado: filtros.estado }),
      ...(filtros.dataInicio && { data: { gte: filtros.dataInicio } }),
      ...(filtros.dataFim && { data: { lte: filtros.dataFim } }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhHoraExtra.count({ where }),
      this.prisma.rhHoraExtra.findMany({
        where,
        orderBy: { data: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obter(id: string, empresaId: string | null): Promise<RhHoraExtra | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhHoraExtra.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
    });
  }

  async criar(empresaId: string | null, input: CriarRhHoraExtraInput, usuarioId: string): Promise<RhHoraExtra> {
    const dados = criarRhHoraExtraSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarFuncionarioEmpresa(dados.funcionarioId, empresa);

    const created = await this.prisma.rhHoraExtra.create({
      data: {
        funcionarioId: dados.funcionarioId,
        data: new Date(dados.data),
        horas: new Prisma.Decimal(dados.horas),
        tipo: dados.tipo,
        percentagem: new Prisma.Decimal(dados.percentagem),
        estado: dados.estado,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhHoraExtra',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Hora extra criada para funcionário ${dados.funcionarioId} (${dados.tipo})`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizar(empresaId: string | null, input: AtualizarRhHoraExtraInput, usuarioId: string): Promise<RhHoraExtra> {
    const dados = atualizarRhHoraExtraSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Hora extra não encontrada.');

    if (updateData.funcionarioId) await this.validarFuncionarioEmpresa(updateData.funcionarioId, empresa);

    const data: Prisma.RhHoraExtraUpdateInput = {};
    if (updateData.funcionarioId) data.funcionario = { connect: { id: updateData.funcionarioId } };
    if (updateData.data) data.data = new Date(updateData.data);
    if (updateData.horas !== undefined) data.horas = new Prisma.Decimal(updateData.horas);
    if (updateData.tipo) data.tipo = updateData.tipo;
    if (updateData.percentagem !== undefined) data.percentagem = new Prisma.Decimal(updateData.percentagem);
    if (updateData.estado) data.estado = updateData.estado;

    const updated = await this.prisma.rhHoraExtra.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhHoraExtra',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Hora extra ${id} actualizada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async aprovar(empresaId: string | null, input: RhHoraExtraAprovarInput, usuarioId: string): Promise<RhHoraExtra> {
    const dados = rhHoraExtraAprovarSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(dados.id, empresa);
    if (!existing) throw new Error('Hora extra não encontrada.');

    const updated = await this.prisma.rhHoraExtra.update({
      where: { id: dados.id },
      data: {
        estado: dados.estado,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhHoraExtra',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Hora extra ${dados.id} ${dados.estado.toLowerCase()}`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async inativar(id: string, empresaId: string | null, usuarioId: string): Promise<RhHoraExtra> {
    const empresa = this.exigirEmpresa(empresaId);
    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Hora extra não encontrada.');

    const updated = await this.prisma.rhHoraExtra.update({
      where: { id },
      data: { estado: 'CANCELADO' },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhHoraExtra',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Hora extra ${id} cancelada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async marcarProcessada(ids: string[], empresaId: string | null, dataProcessamento: Date): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.prisma.rhHoraExtra.updateMany({
      where: { id: { in: ids }, funcionario: { empresaId: empresa } },
      data: { processadaEm: dataProcessamento },
    });
  }

  async desmarcarProcessada(ids: string[], empresaId: string | null): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);
    await this.prisma.rhHoraExtra.updateMany({
      where: { id: { in: ids }, funcionario: { empresaId: empresa } },
      data: { processadaEm: null },
    });
  }

  private async validarFuncionarioEmpresa(funcionarioId: string, empresaId: string): Promise<void> {
    const f = await this.prisma.rhFuncionario.findFirst({ where: { id: funcionarioId, empresaId }, select: { id: true } });
    if (!f) throw new Error('Funcionário não pertence a esta empresa.');
  }
}

export const rhHorasExtraService = new RhHorasExtraService();