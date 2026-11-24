/**
 * @file rh-independentes.service.ts
 * @description Gestão de independentes do módulo de RH (Fase 7: RH-701).
 *
 * Responsabilidades:
 *  - CRUD de independentes com isolamento por empresa;
 *  - Validação de unicidade de código por empresa;
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhIndependente,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhIndependenteSchema,
  atualizarRhIndependenteSchema,
  rhIndependentesListarInputSchema,
  type CriarRhIndependenteInput,
  type AtualizarRhIndependenteInput,
  type RhIndependentesListarInput,
} from '../validators/rh.validator';

export class RhIndependentesService {
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
    input: RhIndependentesListarInput,
  ): Promise<{ total: number; items: RhIndependente[] }> {
    const filtros = rhIndependentesListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhIndependenteWhereInput = {
      empresaId: empresa,
      ...(filtros.codigo && { codigo: { contains: filtros.codigo, mode: 'insensitive' } }),
      ...(filtros.nome && { nome: { contains: filtros.nome, mode: 'insensitive' } }),
      ...(filtros.ativo !== undefined && { ativo: filtros.ativo }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhIndependente.count({ where }),
      this.prisma.rhIndependente.findMany({
        where,
        orderBy: { codigo: 'asc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obter(id: string, empresaId: string | null): Promise<RhIndependente | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhIndependente.findFirst({
      where: { id, empresaId: empresa },
    });
  }

  async criar(empresaId: string | null, input: CriarRhIndependenteInput, usuarioId: string): Promise<RhIndependente> {
    const dados = criarRhIndependenteSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    // Verificar se código já existe na empresa
    const existente = await this.prisma.rhIndependente.findFirst({
      where: { empresaId: empresa, codigo: dados.codigo },
    });
    if (existente) {
      throw new Error('Já existe um independente com este código nesta empresa.');
    }

    const created = await this.prisma.rhIndependente.create({
      data: {
        empresaId: empresa,
        codigo: dados.codigo,
        nome: dados.nome,
        nif: dados.nif ?? null,
        email: dados.email ?? null,
        telefone: dados.telefone ?? null,
        morada: dados.morada ?? null,
        banco: dados.banco ?? null,
        iban: dados.iban ?? null,
        taxaRetencao: dados.taxaRetencao !== undefined ? new Prisma.Decimal(dados.taxaRetencao) : null,
        ativo: dados.ativo ?? true,
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhIndependente',
      entidadeId: created.id,
      modulo: 'rh',
      descricao: `Independente ${dados.codigo} — ${dados.nome} criado`,
      dadosNovos: created,
    });

    return created;
  }

  async atualizar(empresaId: string | null, input: AtualizarRhIndependenteInput, usuarioId: string): Promise<RhIndependente> {
    const dados = atualizarRhIndependenteSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Independente não encontrado.');

    // Se está a alterar o código, verificar se já existe
    if (updateData.codigo && updateData.codigo !== existing.codigo) {
      const existente = await this.prisma.rhIndependente.findFirst({
        where: { empresaId: empresa, codigo: updateData.codigo, id: { not: id } },
      });
      if (existente) {
        throw new Error('Já existe um independente com este código nesta empresa.');
      }
    }

    const data: Prisma.RhIndependenteUpdateInput = {};
    if (updateData.codigo) data.codigo = updateData.codigo;
    if (updateData.nome) data.nome = updateData.nome;
    if (updateData.nif !== undefined) data.nif = updateData.nif;
    if (updateData.email !== undefined) data.email = updateData.email;
    if (updateData.telefone !== undefined) data.telefone = updateData.telefone;
    if (updateData.morada !== undefined) data.morada = updateData.morada;
    if (updateData.banco !== undefined) data.banco = updateData.banco;
    if (updateData.iban !== undefined) data.iban = updateData.iban;
    if (updateData.taxaRetencao !== undefined) data.taxaRetencao = updateData.taxaRetencao !== null ? new Prisma.Decimal(updateData.taxaRetencao) : null;
    if (updateData.ativo !== undefined) data.ativo = updateData.ativo;

    const updated = await this.prisma.rhIndependente.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhIndependente',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Independente ${id} actualizado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async inativar(id: string, empresaId: string | null, usuarioId: string): Promise<RhIndependente> {
    const empresa = this.exigirEmpresa(empresaId);
    const existing = await this.obter(id, empresa);
    if (!existing) throw new Error('Independente não encontrado.');

    const updated = await this.prisma.rhIndependente.update({
      where: { id },
      data: { ativo: false },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhIndependente',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Independente ${id} inativado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

}

export const rhIndependentesService = new RhIndependentesService();