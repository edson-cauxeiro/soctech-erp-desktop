/**
 * @file perfil.controller.ts
 * @description Controlador IPC para a gestão de perfis de acesso e matriz de permissões (RNF03).
 */

import { perfilService, PerfilService } from '../services/perfil.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission } from '../middlewares/rbac.middleware';
import { ACESSO_PERFIS_ADMIN } from '../constants/permissions.constants';

export class PerfilController {
  private perfilService: PerfilService;
  private auth: AuthService;

  constructor(svc: PerfilService = perfilService, auth: AuthService = authService) {
    this.perfilService = svc;
    this.auth = auth;
  }

  private exigirAdmin(): void {
    requireAnyPermission(this.auth.getCurrentSession(), [
      [ACESSO_PERFIS_ADMIN.modulo, ACESSO_PERFIS_ADMIN.acao],
    ]);
  }

  async list(): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.perfilService.listar());
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao listar perfis de acesso.');
    }
  }

  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.perfilService.obter(id));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao obter perfil de acesso.');
    }
  }

  async create(data: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.perfilService.criar(data));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao criar perfil de acesso.');
    }
  }

  async update(id: string, data: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.perfilService.atualizar(id, data));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao actualizar perfil de acesso.');
    }
  }

  async remove(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.perfilService.eliminar(id));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao eliminar perfil de acesso.');
    }
  }

  async duplicate(id: string, novoNome: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirAdmin();
      return ok(await this.perfilService.duplicar(id, novoNome));
    } catch (error) {
      return this.traduzirErro(error, 'Erro ao duplicar perfil de acesso.');
    }
  }

  private traduzirErro(error: unknown, mensagemGenerica: string): IpcResponse<unknown> {
    if (error instanceof AppError) {
      return err(error.code, error.message, error.details);
    }
    return err('INTERNAL_ERROR', (error as Error)?.message || mensagemGenerica);
  }
}

export const perfilController = new PerfilController();
