/**
 * @file utilizador.service.ts
 * @description Serviço de gestão de utilizadores: CRUD, hashing de senhas e invariantes de segurança.
 */

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  atualizarUtilizadorSchema,
  criarUtilizadorSchema,
  listarUtilizadoresSchema,
  alterarSenhaSchema,
  reporSenhaSchema,
} from '../validators/utilizador.validator';
import { normalizarPermissoes } from '../constants/permissions.constants';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';

const PERFIL_ADMINISTRADOR = 'Administrador';

/** Projecção devolvida ao renderer: nunca inclui o hash da senha. */
const utilizadorSelect = {
  id: true,
  login: true,
  nomeCompleto: true,
  email: true,
  telefone: true,
  estado: true,
  perfilId: true,
  armazemDefaultId: true,
  empresaConfigId: true,
  ultimoAcessoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  perfil: { select: { id: true, nome: true, sistema: true } },
  empresaConfig: { select: { id: true, nome: true, nif: true } },
  armazemPadrao: { select: { id: true, codigo: true, designacao: true } },
} as const;

export type UtilizadorListagem = Awaited<ReturnType<UtilizadorService['listar']>>;

export class UtilizadorService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Lista utilizadores da empresa, com filtros e paginação.
   * @param rawFilters - Filtros recebidos do renderer (validados aqui).
   */
  async listar(rawFilters?: unknown) {
    const validation = listarUtilizadoresSchema.safeParse(rawFilters ?? {});
    if (!validation.success) {
      throw new ValidationError('Filtros de utilizadores inválidos.', validation.error.format());
    }

    const { search, perfilId, estado, empresaConfigId, take, skip } = validation.data;

    const where = {
      ...(empresaConfigId ? { empresaConfigId } : {}),
      ...(perfilId ? { perfilId } : {}),
      ...(estado ? { estado } : {}),
      ...(search
        ? {
            OR: [
              { login: { contains: search, mode: 'insensitive' as const } },
              { nomeCompleto: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.utilizador.count({ where }),
      this.prisma.utilizador.findMany({
        where,
        select: utilizadorSelect,
        orderBy: [{ estado: 'asc' }, { nomeCompleto: 'asc' }],
        take,
        skip,
      }),
    ]);

    return { items, total };
  }

  /**
   * Obtém um utilizador pelo identificador.
   */
  async obter(id: string) {
    const utilizador = await this.prisma.utilizador.findUnique({
      where: { id },
      select: utilizadorSelect,
    });

    if (!utilizador) {
      throw new NotFoundError('Utilizador não encontrado.');
    }

    return utilizador;
  }

  /**
   * Cria um utilizador com senha hasheada.
   * @param rawInput - Dados do novo utilizador.
   */
  async criar(rawInput: unknown) {
    const validation = criarUtilizadorSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new ValidationError('Dados do utilizador inválidos.', validation.error.format());
    }

    const data = validation.data;

    await this.garantirPerfilExiste(data.perfilId);
    await this.garantirEmpresaExiste(data.empresaConfigId);
    await this.garantirArmazemValido(data.armazemDefaultId ?? null);
    await this.garantirLoginEmailLivres(data.login, data.email);

    const passwordHash = await bcrypt.hash(data.password, 10);

    const utilizador = await this.prisma.utilizador.create({
      data: {
        login: data.login,
        nomeCompleto: data.nomeCompleto,
        email: data.email,
        passwordHash,
        perfilId: data.perfilId,
        empresaConfigId: data.empresaConfigId,
        armazemDefaultId: data.armazemDefaultId ?? null,
        telefone: data.telefone ?? null,
        estado: data.estado,
      },
      select: utilizadorSelect,
    });

    return utilizador;
  }

  /**
   * Actualiza um utilizador. A senha só é alterada quando é enviada.
   * @param id - Identificador do utilizador.
   * @param rawInput - Campos a actualizar.
   */
  async atualizar(id: string, rawInput: unknown) {
    const validation = atualizarUtilizadorSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new ValidationError('Dados de actualização inválidos.', validation.error.format());
    }

    const data = validation.data;
    const actual = await this.obter(id);

    if (data.perfilId) {
      await this.garantirPerfilExiste(data.perfilId);
    }
    if (data.empresaConfigId) {
      await this.garantirEmpresaExiste(data.empresaConfigId);
    }
    if (data.armazemDefaultId !== undefined) {
      await this.garantirArmazemValido(data.armazemDefaultId);
    }
    if (data.login || data.email) {
      await this.garantirLoginEmailLivres(data.login, data.email, id);
    }

    // Impede que o sistema fique sem nenhum administrador activo.
    if (data.estado === 'inativo' || (data.perfilId && data.perfilId !== actual.perfilId)) {
      await this.garantirAdministradorActivo(id, data.perfilId, data.estado);
    }

    const utilizador = await this.prisma.utilizador.update({
      where: { id },
      data: {
        ...(data.login ? { login: data.login } : {}),
        ...(data.nomeCompleto ? { nomeCompleto: data.nomeCompleto } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
        ...(data.perfilId ? { perfilId: data.perfilId } : {}),
        ...(data.empresaConfigId ? { empresaConfigId: data.empresaConfigId } : {}),
        ...(data.armazemDefaultId !== undefined ? { armazemDefaultId: data.armazemDefaultId } : {}),
        ...(data.telefone !== undefined ? { telefone: data.telefone ?? null } : {}),
        ...(data.estado ? { estado: data.estado } : {}),
      },
      select: utilizadorSelect,
    });

    return utilizador;
  }

  /**
   * Elimina um utilizador, excepto se for o último administrador activo.
   * @param id - Identificador do utilizador.
   */
  async eliminar(id: string): Promise<{ id: string }> {
    const utilizador = await this.obter(id);

    await this.garantirPodeEliminar(id, utilizador.perfil.nome, utilizador.estado);

    await this.prisma.utilizador.delete({ where: { id } });

    return { id };
  }

  /**
   * Altera a senha de um utilizador, validando a senha atual.
   * @param id - Identificador do utilizador.
   * @param rawInput - Senha atual e nova senha.
   */
  async alterarSenha(id: string, rawInput: unknown) {
    const validation = alterarSenhaSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new ValidationError('Dados de alteração inválidos.', validation.error.format());
    }

    const { senhaAtual, novaSenha } = validation.data;

    const user = await this.prisma.utilizador.findUnique({
      where: { id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundError('Utilizador não encontrado.');
    }

    const senhaValida = await bcrypt.compare(senhaAtual, user.passwordHash);
    if (!senhaValida) {
      throw new ForbiddenError('A senha atual está incorrecta.');
    }

    if (senhaAtual === novaSenha) {
      throw new BusinessRuleError('A nova senha deve ser diferente da senha actual.');
    }

    const passwordHash = await bcrypt.hash(novaSenha, 10);
    await this.prisma.utilizador.update({ where: { id }, data: { passwordHash } });

    return { id, actualizadoEm: new Date() };
  }

  /**
   * Regista o momento do último acesso, usado para auditoria.
   */
  async registarAcesso(id: string): Promise<void> {
    await this.prisma.utilizador.update({
      where: { id },
      data: { ultimoAcessoEm: new Date() },
    });
  }

  /**
   * Repõe a senha de um utilizador sem exigir a senha atual.
   * Operação exclusiva de administração (validada no controlador).
   * @param id - Identificador do utilizador.
   * @param rawInput - Nova senha.
   */
  async reporSenha(id: string, rawInput: unknown): Promise<{ id: string; actualizadoEm: Date }> {
    const validation = reporSenhaSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new ValidationError('Dados de reposição inválidos.', validation.error.format());
    }

    const user = await this.prisma.utilizador.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError('Utilizador não encontrado.');
    }

    const passwordHash = await bcrypt.hash(validation.data.novaSenha, 10);
    await this.prisma.utilizador.update({ where: { id }, data: { passwordHash } });

    return { id, actualizadoEm: new Date() };
  }

  // ---------------------------------------------------------------- invariantes

  private async garantirPerfilExiste(perfilId: string): Promise<void> {
    const perfil = await this.prisma.perfilAcesso.findUnique({
      where: { id: perfilId },
      select: { id: true },
    });

    if (!perfil) {
      throw new NotFoundError('Perfil de acesso não encontrado.');
    }
  }

  private async garantirEmpresaExiste(empresaConfigId: string): Promise<void> {
    const empresa = await this.prisma.empresaConfig.findUnique({
      where: { id: empresaConfigId },
      select: { id: true },
    });

    if (!empresa) {
      throw new NotFoundError('Empresa não encontrada.');
    }
  }

  private async garantirArmazemValido(armazemId: string | null): Promise<void> {
    if (!armazemId) return;

    const armazem = await this.prisma.armazem.findUnique({
      where: { id: armazemId },
      select: { id: true, ativo: true },
    });

    if (!armazem) {
      throw new NotFoundError('Armazém por defeito não encontrado.');
    }

    if (!armazem.ativo) {
      throw new BusinessRuleError('O armazém por defeito seleccionado está inactivo.');
    }
  }

  private async garantirLoginEmailLivres(
    login: string | undefined,
    email: string | undefined,
    ignorarId?: string
  ): Promise<void> {
    if (login) {
      const existente = await this.prisma.utilizador.findUnique({
        where: { login },
        select: { id: true, login: true },
      });

      if (existente && existente.id !== ignorarId) {
        throw new ConflictError(`O login '${login}' já se encontra registado.`);
      }
    }

    if (email) {
      const existente = await this.prisma.utilizador.findUnique({
        where: { email },
        select: { id: true, email: true },
      });

      if (existente && existente.id !== ignorarId) {
        throw new ConflictError(`O email '${email}' já se encontra registado.`);
      }
    }
  }

  /**
   * Garante que, após a alteração, existe pelo menos um administrador activo
   * na empresa. Sem esta salvaguarda, é possível bloquear o sistema inteiro.
   */
  private async garantirAdministradorActivo(
    id: string,
    novoPerfilId: string | undefined,
    novoEstado: string | undefined
  ): Promise<void> {
    if (novoEstado && novoEstado !== 'ativo') {
      await this.garantirPodeEliminar(id, await this.nomePerfil(novoPerfilId), novoEstado);
      return;
    }

    if (!novoPerfilId) {
      return;
    }

    const nomePerfil = await this.nomePerfil(novoPerfilId);
    if (nomePerfil !== PERFIL_ADMINISTRADOR) {
      await this.garantirPodeEliminar(id, nomePerfil, undefined);
    }
  }

  private async nomePerfil(perfilId: string | undefined): Promise<string | undefined> {
    if (!perfilId) return undefined;

    const perfil = await this.prisma.perfilAcesso.findUnique({
      where: { id: perfilId },
      select: { nome: true },
    });

    return perfil?.nome;
  }

  /**
   * Impede a remoção do último administrador activo da empresa.
   */
  private async garantirPodeEliminar(
    id: string,
    perfilNome: string | undefined,
    estado: string | undefined
  ): Promise<void> {
    if (perfilNome !== PERFIL_ADMINISTRADOR || estado !== 'ativo') {
      return;
    }

    const { empresaConfigId } = await this.obter(id);

    const administradoresActivos = await this.prisma.utilizador.count({
      where: {
        empresaConfigId,
        estado: 'ativo',
        perfil: { nome: PERFIL_ADMINISTRADOR },
      },
    });

    if (administradoresActivos <= 1) {
      throw new BusinessRuleError(
        'Não é possível desactivar ou eliminar o último administrador activo da empresa.'
      );
    }
  }

  /** Expõe as permissões normalizadas de um perfil, usado pelos testes e pela UI. */
  async permissoesDoPerfil(perfilId: string): Promise<Record<string, string[] | boolean>> {
    const perfil = await this.prisma.perfilAcesso.findUnique({
      where: { id: perfilId },
      select: { permissoesJson: true },
    });

    if (!perfil) {
      throw new NotFoundError('Perfil de acesso não encontrado.');
    }

    try {
      return normalizarPermissoes(JSON.parse(perfil.permissoesJson || '{}'));
    } catch {
      return {};
    }
  }
}

export const utilizadorService = new UtilizadorService();
