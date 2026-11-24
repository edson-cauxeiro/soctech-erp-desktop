/**
 * @file auth.controller.ts
 * @description Controlador IPC para autenticação e gestão de sessão.
 */

import { authService, AuthService } from '../services/auth.service';
import { auditService, AuditService } from '../services/audit.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { UserSession } from '../middlewares/rbac.middleware';

export class AuthController {
  private service: AuthService;
  private audit: AuditService;

  constructor(service: AuthService = authService, audit: AuditService = auditService) {
    this.service = service;
    this.audit = audit;
  }

  /**
   * Trata o pedido de login IPC.
   * @param payload - Objeto com login e password.
   */
  async login(payload: unknown): Promise<IpcResponse<UserSession>> {
    try {
      if (!payload || typeof payload !== 'object') {
        return err('INVALID_PAYLOAD', 'Parâmetros de autenticação inválidos.');
      }

      const input = payload as { login?: string; password?: string; utilizador?: string; senha?: string };
      // Suporta tanto 'login'/'password' quanto 'utilizador'/'senha'
      const formattedInput = {
        login: input.login || input.utilizador || '',
        password: input.password || input.senha || '',
      };

      const session = await this.service.login(formattedInput);

      // O login é uma acção de auditoria em si: quem entrou, quando e de onde.
      // Best-effort — o AuditService nunca lança, para um log perdido não negar
      // o acesso a quem tem credenciais válidas.
      await this.audit.registar({
        acao: 'login',
        entidade: 'Utilizador',
        entidadeId: session.id,
        modulo: 'auth',
        empresaId: session.empresaConfigId ?? '',
        utilizadorId: session.id,
        severidade: 'info',
        descricao: `Início de sessão de ${session.perfilNome}`,
      });

      return ok(session);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro interno no processo de autenticação.');
    }
  }

  /**
   * Trata o pedido de logout IPC.
   */
  async logout(): Promise<IpcResponse<{ success: boolean }>> {
    try {
      // A sessão é capturada antes de ser destruída, para a auditoria ter
      // quem saiu. Best-effort, como no login.
      const sessao = this.service.getCurrentSession();
      await this.service.logout();

      if (sessao) {
        await this.audit.registar({
          acao: 'logout',
          entidade: 'Utilizador',
          entidadeId: sessao.id,
          modulo: 'auth',
          empresaId: sessao.empresaConfigId ?? '',
          utilizadorId: sessao.id,
          severidade: 'info',
          descricao: `Fim de sessão de ${sessao.perfilNome}`,
        });
      }

      return ok({ success: true });
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao efetuar logout.');
    }
  }

  /**
   * Retorna os dados do utilizador atualmente autenticado.
   */
  async me(): Promise<IpcResponse<UserSession | null>> {
    try {
      const session = this.service.getCurrentSession();
      return ok(session);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao recuperar utilizador atual.');
    }
  }
}

export const authController = new AuthController();
