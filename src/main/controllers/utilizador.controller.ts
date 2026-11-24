/**
 * @file utilizador.controller.ts
 * @description Controlador IPC para a gestão de utilizadores (RNF03).
 * Todas as operações exigem permissão de administração em Configurações.
 */

import { utilizadorService, UtilizadorService } from '../services/utilizador.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission } from '../middlewares/rbac.middleware';
import { ACESSO_CONFIGURACOES_ADMIN } from '../constants/permissions.constants';

export class UtilizadorController {
  private utilizadorService: UtilizadorService;
  private auth: AuthService;

  constructor(svc: UtilizadorService = utilizadorService, auth: AuthService = authService) {
    this.utilizadorService = svc;
    this.auth = auth;
  }

  /**
   * Garante permissão de administração de Configurações.
   * A verificação é incondicional: sem sessão o acesso é recusado.
   */
  private exigirAdmin(): void {
    requireAnyPermission(this.auth.getCurrentSession(), [
      [ACESSO_CONFIGURACOES_ADMIN.modulo, ACESSO_CONFIGURACOES_ADMIN.acao],
    ]);
  }

  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.utilizadorService.listar(filters));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao listar utilizadores.');
    }
  }

  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.utilizadorService.obter(id));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao obter utilizador.');
    }
  }

  async create(data: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.utilizadorService.criar(data));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao criar utilizador.');
    }
  }

  async update(id: string, data: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.utilizadorService.atualizar(id, data));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao actualizar utilizador.');
    }
  }

  async remove(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      const sessao = this.auth.getCurrentSession();
      if (sessao?.id === id) {
        return err('BUSINESS_RULE_ERROR', 'Não é possível eliminar o utilizador autenticado.');
      }
      return ok(await this.utilizadorService.eliminar(id));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao eliminar utilizador.');
    }
  }

  async changePassword(id: string, data: unknown): Promise<IpcResponse<unknown>> {
    try {
      const sessao = this.auth.getCurrentSession();
      // O próprio utilizador pode alterar a sua senha; um administrador pode alterar a de outros.
      const ehProprio = sessao?.id === id;
      if (!ehProprio) {
        this.exigirAdmin();
      }
      return ok(await this.utilizadorService.alterarSenha(id, data));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao alterar senha.');
    }
  }

  async resetPassword(id: string, data: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.utilizadorService.reporSenha(id, data));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao repor a senha.');
    }
  }

  private traduzirErro(error: unknown, mensagemGenerica: string): IpcResponse<unknown> {
    if (error instanceof AppError) {
      return err(error.code, error.message, error.details);
    }
    return err('INTERNAL_ERROR', (error as Error)?.message || mensagemGenerica);
  }
}

export const utilizadorController = new UtilizadorController();
