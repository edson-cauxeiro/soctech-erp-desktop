/**
 * @file fornecedor.controller.ts
 * @description Controlador IPC para o módulo de Fornecedores (RF05).
 */

import { fornecedorService, FornecedorService } from '../services/fornecedor.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class FornecedorController {
  private fornecedorService: FornecedorService;
  private auth: AuthService;

  constructor(svc: FornecedorService = fornecedorService, auth: AuthService = authService) {
    this.fornecedorService = svc;
    this.auth = auth;
  }

  /**
   * Lista fornecedores com filtros.
   */
  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.fornecedorService.listFornecedores(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar fornecedores.');
    }
  }

  /**
   * Obtém os detalhes de um fornecedor por ID.
   */
  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.fornecedorService.getFornecedor(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter fornecedor.');
    }
  }

  /**
   * Cria um novo fornecedor.
   */
  async create(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'write');

      const result = await this.fornecedorService.createFornecedor(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar fornecedor.');
    }
  }

  /**
   * Atualiza um fornecedor existente.
   */
  async update(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'write');

      const result = await this.fornecedorService.updateFornecedor(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao atualizar fornecedor.');
    }
  }

  /**
   * Remove um fornecedor.
   */
  async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'write');

      const result = await this.fornecedorService.deleteFornecedor(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao remover fornecedor.');
    }
  }
}

export const fornecedorController = new FornecedorController();
