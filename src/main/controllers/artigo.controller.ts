/**
 * @file artigo.controller.ts
 * @description Controlador IPC para o módulo de Artigos (Master Data 360° - RF01).
 */

import { artigoService, ArtigoService } from '../services/artigo.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission } from '../middlewares/rbac.middleware';

export class ArtigoController {
  private artigoService: ArtigoService;
  private auth: AuthService;

  constructor(svc: ArtigoService = artigoService, auth: AuthService = authService) {
    this.artigoService = svc;
    this.auth = auth;
  }

  /**
   * Lista artigos com filtros.
   */
  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      // Permite leitura se tiver acesso a vendas, estoque ou comercial
      requireAnyPermission(session, [
        ['vendas', 'read'],
        ['estoque', 'read'],
        ['comercial', 'read'],
      ]);

      const result = await this.artigoService.listArtigos(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar artigos.');
    }
  }

  /**
   * Obtém os detalhes de um artigo por ID.
   */
  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'read'],
        ['estoque', 'read'],
      ]);

      const result = await this.artigoService.getArtigo(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter artigo.');
    }
  }

  /**
   * Cria um novo artigo.
   */
  async create(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'write'],
        ['estoque', 'write'],
      ]);

      const result = await this.artigoService.createArtigo(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar artigo.');
    }
  }

  /**
   * Atualiza um artigo existente.
   */
  async update(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'write'],
        ['estoque', 'write'],
      ]);

      const result = await this.artigoService.updateArtigo(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao atualizar artigo.');
    }
  }

  /**
   * Remove ou inativa um artigo.
   */
  async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'delete'],
        ['estoque', 'delete'],
        ['vendas', 'write'],
      ]);

      const result = await this.artigoService.deleteArtigo(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao remover artigo.');
    }
  }
}

export const artigoController = new ArtigoController();
