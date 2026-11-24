/**
 * @file perfil.service.ts
 * @description Serviço de gestão de perfis de acesso e da matriz de permissões (RNF03).
 */

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  atualizarPerfilSchema,
  criarPerfilSchema,
} from '../validators/utilizador.validator';
import { normalizarPermissoes } from '../constants/permissions.constants';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';

/** Perfis de sistema que não podem ser eliminados nem esvaziados de permissões. */
const PERFIS_PROTEGIDOS = ['Administrador'] as const;

const perfilSelect = {
  id: true,
  nome: true,
  descricao: true,
  permissoesJson: true,
  sistema: true,
  _count: { select: { utilizadores: true } },
} as const;

export interface PerfilAcessoListagem {
  id: string;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  permissoes: Record<string, string[] | boolean>;
  totalUtilizadores: number;
}

export class PerfilService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista todos os perfis de acesso com as permissões já deserializadas e normalizadas.
   */
  async listar(): Promise<PerfilAcessoListagem[]> {
    const perfis = await this.prisma.perfilAcesso.findMany({
      select: perfilSelect,
      orderBy: [{ sistema: 'desc' }, { nome: 'asc' }],
    });

    return perfis.map((perfil) => ({
      id: perfil.id,
      nome: perfil.nome,
      descricao: perfil.descricao,
      sistema: perfil.sistema,
      permissoes: this.deserializar(perfil.permissoesJson),
      totalUtilizadores: perfil._count.utilizadores,
    }));
  }

  /**
   * Obtém um perfil de acesso pelo identificador.
   */
  async obter(id: string): Promise<PerfilAcessoListagem> {
    const perfil = await this.prisma.perfilAcesso.findUnique({
      where: { id },
      select: perfilSelect,
    });

    if (!perfil) {
      throw new NotFoundError('Perfil de acesso não encontrado.');
    }

    return {
      id: perfil.id,
      nome: perfil.nome,
      descricao: perfil.descricao,
      sistema: perfil.sistema,
      permissoes: this.deserializar(perfil.permissoesJson),
      totalUtilizadores: perfil._count.utilizadores,
    };
  }

  /**
   * Cria um perfil de acesso com a matriz de permissões indicada.
   * @param rawInput - Nome, descrição e permissões.
   */
  async criar(rawInput: unknown): Promise<PerfilAcessoListagem> {
    const validation = criarPerfilSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new ValidationError('Dados do perfil inválidos.', validation.error.format());
    }

    const data = validation.data;

    const existente = await this.prisma.perfilAcesso.findUnique({
      where: { nome: data.nome },
      select: { id: true },
    });

    if (existente) {
      throw new ConflictError(`Já existe um perfil com o nome '${data.nome}'.`);
    }

    const criado = await this.prisma.perfilAcesso.create({
      data: {
        nome: data.nome,
        descricao: data.descricao ?? null,
        permissoesJson: JSON.stringify(normalizarPermissoes(data.permissoes)),
        sistema: false,
      },
      select: perfilSelect,
    });

    return {
      id: criado.id,
      nome: criado.nome,
      descricao: criado.descricao,
      sistema: criado.sistema,
      permissoes: this.deserializar(criado.permissoesJson),
      totalUtilizadores: 0,
    };
  }

  /**
   * Actualiza um perfil de acesso.
   * Perfis de sistema mantêm sempre acesso total, evitando o bloqueio total do sistema.
   * @param id - Identificador do perfil.
   * @param rawInput - Campos a actualizar.
   */
  async atualizar(id: string, rawInput: unknown): Promise<PerfilAcessoListagem> {
    const validation = atualizarPerfilSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new ValidationError('Dados de actualização inválidos.', validation.error.format());
    }

    const data = validation.data;
    const actual = await this.obter(id);

    if (data.nome && data.nome !== actual.nome) {
      const existente = await this.prisma.perfilAcesso.findUnique({
        where: { nome: data.nome },
        select: { id: true },
      });

      if (existente) {
        throw new ConflictError(`Já existe um perfil com o nome '${data.nome}'.`);
      }
    }

    const manterAcessoTotal = this.eProtegido(actual.nome);
    const permissoes = data.permissoes
      ? normalizarPermissoes(data.permissoes)
      : actual.permissoes;

    if (manterAcessoTotal) {
      permissoes['*'] = true;
    } else if (Object.keys(permissoes).length === 0) {
      throw new BusinessRuleError('O perfil deve ter pelo menos um módulo autorizado.');
    }

    const actualizado = await this.prisma.perfilAcesso.update({
      where: { id },
      data: {
        ...(data.nome ? { nome: data.nome } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao ?? null } : {}),
        ...(data.permissoes || manterAcessoTotal
          ? { permissoesJson: JSON.stringify(permissoes) }
          : {}),
      },
      select: perfilSelect,
    });

    return {
      id: actualizado.id,
      nome: actualizado.nome,
      descricao: actualizado.descricao,
      sistema: actualizado.sistema,
      permissoes: this.deserializar(actualizado.permissoesJson),
      totalUtilizadores: actualizado._count.utilizadores,
    };
  }

  /**
   * Elimina um perfil de acesso.
   * Perfis de sistema e perfis ainda atribuídos a utilizadores não podem ser eliminados.
   * @param id - Identificador do perfil.
   */
  async eliminar(id: string): Promise<{ id: string }> {
    const perfil = await this.obter(id);

    if (perfil.sistema || this.eProtegido(perfil.nome)) {
      throw new BusinessRuleError(
        `O perfil '${perfil.nome}' é de sistema e não pode ser eliminado.`
      );
    }

    if (perfil.totalUtilizadores > 0) {
      throw new BusinessRuleError(
        `O perfil '${perfil.nome}' tem ${perfil.totalUtilizadores} utilizador(es) associado(s). Reatribua-os antes de eliminar.`
      );
    }

    await this.prisma.perfilAcesso.delete({ where: { id } });

    return { id };
  }

  /**
   * Copia as permissões de um perfil para outro.
   * Útil para criar variantes de um perfil sem repetir a matriz.
   */
  async duplicar(id: string, novoNome: string): Promise<PerfilAcessoListagem> {
    const perfil = await this.obter(id);

    return this.criar({
      nome: novoNome,
      descricao: `Cópia do perfil '${perfil.nome}'`,
      permissoes: perfil.permissoes,
    });
  }

  private eProtegido(nome: string): boolean {
    return (PERFIS_PROTEGIDOS as readonly string[]).includes(nome);
  }

  private deserializar(permissoesJson: string): Record<string, string[] | boolean> {
    try {
      return normalizarPermissoes(JSON.parse(permissoesJson || '{}'));
    } catch {
      return {};
    }
  }
}

export const perfilService = new PerfilService();
