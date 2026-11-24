/**
 * @file armazem.controller.ts
 * @description Controlador IPC para o módulo de Armazéns (RF06).
 */

import { armazemService, ArmazemService } from '../services/armazem.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission, requirePermission } from '../middlewares/rbac.middleware';

export class ArmazemController {
  private armazemService: ArmazemService;
  private auth: AuthService;

  constructor(svc: ArmazemService = armazemService, auth: AuthService = authService) {
    this.armazemService = svc;
    this.auth = auth;
  }

  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['estoque', 'read'],
        ['vendas', 'read'],
        ['compras', 'read'],
      ]);

      const result = await this.armazemService.listArmazens(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar armazéns.');
    }
  }

  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'read');

      const result = await this.armazemService.getArmazem(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter armazém.');
    }
  }

  async getDefaultVendas(): Promise<IpcResponse<unknown>> {
    try {
      const result = await this.armazemService.getDefaultVendasArmazem();
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter armazém padrão de vendas.');
    }
  }

  async getDefaultCompras(): Promise<IpcResponse<unknown>> {
    try {
      const result = await this.armazemService.getDefaultComprasArmazem();
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter armazém padrão de compras.');
    }
  }

  async getStock(armazemId: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'read');

      const result = await this.armazemService.getStockByArmazem(armazemId);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter stock do armazém.');
    }
  }

  async create(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.armazemService.createArmazem(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar armazém.');
    }
  }

  async update(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.armazemService.updateArmazem(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao atualizar armazém.');
    }
  }

async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.armazemService.deleteArmazem(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao remover armazém.');
    }
  }

  async deactivate(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.armazemService.deleteArmazem(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao desativar armazém.');
    }
  }
}

export const armazemController = new ArmazemController();
