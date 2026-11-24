/**
 * @file auth.service.ts
 * @description Serviço de autenticação, hashing de senhas com bcryptjs e controlo de sessão desktop.
 */

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { LoginInput, loginSchema, CreateUserInput, createUserSchema } from '../validators/auth.validator';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { UserSession } from '../middlewares/rbac.middleware';
import { UtilizadorService, utilizadorService as defaultUtilizadorService } from './utilizador.service';

export class AuthService {
  private prisma: PrismaClient;
  private currentSession: UserSession | null = null;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    private utilizadorSvc: UtilizadorService = defaultUtilizadorService
  ) {
    this.prisma = prismaClient;
  }

  /**
   * Gera o hash seguro de uma senha em texto puro usando bcryptjs.
   * @param password - Senha em texto simples.
   * @returns Hash bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /**
   * Compara uma senha em texto simples com um hash bcrypt.
   * @param password - Senha em texto simples.
   * @param hash - Hash bcrypt armazenado.
   * @returns boolean indicando se a senha corresponde.
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Autentica um utilizador com credenciais (login e senha) e cria a sessão local.
   * @param input - Credenciais de login.
   * @returns Sessão do utilizador autenticado com perfil e permissões.
   */
  async login(input: LoginInput): Promise<UserSession> {
    const validation = loginSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError('Dados de login inválidos.', validation.error.format());
    }

    const { login, password } = validation.data;

    const user = await this.prisma.utilizador.findUnique({
      where: { login },
      include: {
        perfil: true,
        empresaConfig: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Credenciais inválidas. Utilizador ou senha incorretos.');
    }

    if (user.estado !== 'ativo') {
      throw new UnauthorizedError('Conta inativa ou bloqueada. Contacte o administrador.');
    }

    const isPasswordValid = await this.comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Credenciais inválidas. Utilizador ou senha incorretos.');
    }

    let permissoes: Record<string, string[] | boolean> = {};
    try {
      permissoes = JSON.parse(user.perfil.permissoesJson || '{}');
    } catch {
      permissoes = {};
    }

    // A empresa é obrigatória no modelo: o utilizador autenticado pertence sempre a uma empresa.
    const empresa = user.empresaConfig;

    const session: UserSession = {
      id: user.id,
      login: user.login,
      nomeCompleto: user.nomeCompleto,
      email: user.email,
      perfilId: user.perfilId,
      perfilNome: user.perfil.nome,
      permissoes,
      armazemDefaultId: user.armazemDefaultId,
      empresaConfigId: empresa?.id || user.empresaConfigId,
      empresaNome: empresa?.nome || null,
      empresaNif: empresa?.nif || null,
    };

    this.currentSession = session;

    // Regista o acesso para auditoria. Uma falha aqui não deve impedir o login.
    try {
      await this.prisma.utilizador.update({
        where: { id: user.id },
        data: { ultimoAcessoEm: new Date() },
      });
    } catch {
      // Ignorado propositadamente: o login é válido mesmo sem registo de auditoria.
    }

    return session;
  }

  /**
   * Encerra a sessão ativa do utilizador no processo Main.
   */
  async logout(): Promise<void> {
    this.currentSession = null;
  }

  /**
   * Retorna a sessão ativa atual ou null se não houver utilizador logado.
   */
  getCurrentSession(): UserSession | null {
    return this.currentSession;
  }

  /**
   * Define manualmente a sessão ativa (útil para testes ou recuperação de estado).
   */
  setSession(session: UserSession | null): void {
    this.currentSession = session;
  }

  /**
   * Cria um novo utilizador no sistema com senha hasheada.
   * Mantido para retro-compatibilidade: a gestão de utilizadores vive agora em
   * `UtilizadorService`, que valida empresa, perfil, armazém e unicidade.
   * @param input - Dados do novo utilizador.
   */
  async createUser(input: CreateUserInput): Promise<{ id: string; login: string }> {
    const validation = createUserSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError('Dados do utilizador inválidos.', validation.error.format());
    }

    if (!validation.data.empresaConfigId) {
      throw new ValidationError('A empresa é obrigatória.', {
        empresaConfigId: ['A empresa é obrigatória.'],
      });
    }

    const criado = await this.utilizadorSvc.criar(validation.data);

    return { id: criado.id, login: criado.login };
  }
}

export const authService = new AuthService();
