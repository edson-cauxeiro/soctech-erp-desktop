/**
 * @file rh-retroativos.service.ts
 * @description Gestão de retroactivos do módulo de RH (Fase 6: RH-608).
 *
 * Responsabilidades:
 *  - CRUD de retroactivos com isolamento por empresa;
 *  - Aplicação de retroactivos (integração com processamento);
 *  - Anulação de retroactivos;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhRetroativo,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhRetroativoSchema,
  atualizarRhRetroativoSchema,
  rhRetroativosListarInputSchema,
  type CriarRhRetroativoInput,
  type AtualizarRhRetroativoInput,
  type RhRetroativosListarInput,
} from '../validators/rh.validator';

export class RhRetroativosService {
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
    input: RhRetroativosListarInput,
  ): Promise<{ total: number; items: (RhRetroativo & { funcionario: { id: string; codigo: string; nome: string }; rubrica: { id: string; codigo: string; descricao: string } })[] }> {
    const filtros = rhRetroativosListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhRetroativoWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.rubricaId && { rubricaId: filtros.rubricaId }),
      ...(filtros.anoOrigem && { anoOrigem: filtros.anoOrigem }),
      ...(filtros.mesOrigem && { mesOrigem: filtros.mesOrigem }),
      ...(filtros.anoAplicacao && { anoAplicacao: filtros.anoAplicacao }),
      ...(filtros.mesAplicacao && { mesAplicacao: filtros.mesAplicacao }),
      ...(filtros.estado && { estado: filtros.estado }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhRetroativo.count({ where }),
      this.prisma.rhRetroativo.findMany({
        where,
        include: {
          funcionario: { select: { id: true, codigo: true, nome: true } },
          rubrica: { select: { id: true, codigo: true, descricao: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obter(id: string, empresaId: string | null): Promise<(RhRetroativo & { funcionario: { id: string; codigo: string; nome: string }; rubrica: { id: string; codigo: string; descricao: string } }) | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhRetroativo.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
      include: {
        funcionario: { select: { id: true, codigo: true, nome: true } },
        rubrica: { select: { id: true, codigo: true, descricao: true } },
      },
    });
  }

  async criar(empresaId: string | null, input: CriarRhRetroativoInput, usuarioId: string): Promise<RhRetroativo> {
    const dados = criarRhRetroativoSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarFuncionarioEmpresa(dados.funcionarioId, empresa);
    await this.validarRubricaEmpresa(dados.rubricaId, empresa);

    const created = await this.prisma.rhRetroativo.create({
      data: {
        funcionarioId: dados.funcionarioId,
        rubricaId: dados.rubricaId,
        anoOrigem: dados.anoOrigem,
        mesOrigem: dados.mesOrigem,
        anoAplicacao: dados.anoAplicacao,
        mesAplicacao: dados.mesAplicacao,
        valor: new Prisma.Decimal(dados.valor),
        motivo: dados.motivo ?? null,
        estado: dados.estado,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhRetroativo',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Retroactivo criado para funcionário ${dados.funcionarioId} (${dados.valor} ${dados.anoOrigem}/${dados.mesOrigem})`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizar(empresaId: string | null, input: AtualizarRhRetroativoInput, usuarioId: string): Promise<RhRetroativo> {
    const dados = atualizarRhRetroativoSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Retroactivo não encontrado.');

    if (updateData.funcionarioId) await this.validarFuncionarioEmpresa(updateData.funcionarioId, empresa);
    if (updateData.rubricaId) await this.validarRubricaEmpresa(updateData.rubricaId, empresa);

    const data: Prisma.RhRetroativoUpdateInput = {};
    if (updateData.funcionarioId) data.funcionario = { connect: { id: updateData.funcionarioId } };
    if (updateData.rubricaId) data.rubrica = { connect: { id: updateData.rubricaId } };
    if (updateData.anoOrigem !== undefined) data.anoOrigem = updateData.anoOrigem;
    if (updateData.mesOrigem !== undefined) data.mesOrigem = updateData.mesOrigem;
    if (updateData.anoAplicacao !== undefined) data.anoAplicacao = updateData.anoAplicacao;
    if (updateData.mesAplicacao !== undefined) data.mesAplicacao = updateData.mesAplicacao;
    if (updateData.valor !== undefined) data.valor = new Prisma.Decimal(updateData.valor);
    if (updateData.motivo !== undefined) data.motivo = updateData.motivo;
    if (updateData.estado) data.estado = updateData.estado;

    const updated = await this.prisma.rhRetroativo.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhRetroativo',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Retroactivo ${id} actualizado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async aplicar(empresaId: string | null, input: { id: string }, usuarioId: string): Promise<RhRetroativo> {
    const dados = { id: input.id };
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(dados.id, empresa);
    if (!existing) throw new Error('Retroactivo não encontrado.');

    if (existing.estado !== 'PENDENTE') {
      throw new Error('Só é possível aplicar retroactivos pendentes.');
    }

    const updated = await this.prisma.rhRetroativo.update({
      where: { id: dados.id },
      data: {
        estado: 'APLICADO',
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhRetroativo',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Retroactivo ${dados.id} aplicado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async anular(empresaId: string | null, input: { id: string; motivo: string }, usuarioId: string): Promise<RhRetroativo> {
    const dados = { id: input.id, motivo: input.motivo };
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(dados.id, empresa);
    if (!existing) throw new Error('Retroactivo não encontrado.');

    if (existing.estado === 'ANULADO') {
      throw new Error('Retroactivo já anulado.');
    }

    if (existing.estado === 'APLICADO') {
      throw new Error('Não é possível anular um retroactivo já aplicado.');
    }

    const updated = await this.prisma.rhRetroativo.update({
      where: { id: dados.id },
      data: {
        estado: 'ANULADO',
        motivo: (existing.motivo ?? '') + '\n[ANULADO] ' + dados.motivo,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhRetroativo',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Retroactivo ${dados.id} anulado (${dados.motivo})`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  private async validarFuncionarioEmpresa(funcionarioId: string, empresaId: string): Promise<void> {
    const f = await this.prisma.rhFuncionario.findFirst({ where: { id: funcionarioId, empresaId }, select: { id: true } });
    if (!f) throw new Error('Funcionário não pertence a esta empresa.');
  }

  private async validarRubricaEmpresa(rubricaId: string, empresaId: string): Promise<void> {
    const r = await this.prisma.rhRubrica.findFirst({ where: { id: rubricaId, empresaId }, select: { id: true } });
    if (!r) throw new Error('Rubrica não pertence a esta empresa.');
  }
}

export const rhRetroativosService = new RhRetroativosService();