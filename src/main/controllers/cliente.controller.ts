/**
 * @file cliente.controller.ts
 * @description Controlador IPC para o módulo de Clientes (RF02).
 */

import { clienteService, ClienteService } from '../services/cliente.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission } from '../middlewares/rbac.middleware';

export class ClienteController {
  private clienteService: ClienteService;
  private auth: AuthService;

  constructor(svc: ClienteService = clienteService, auth: AuthService = authService) {
    this.clienteService = svc;
    this.auth = auth;
  }

  /**
   * Lista clientes com filtros.
   */
  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'read'],
        ['comercial', 'read'],
      ]);

      const result = await this.clienteService.listClientes(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar clientes.');
    }
  }

  /**
   * Obtém os detalhes de um cliente por ID.
   */
  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'read'],
        ['comercial', 'read'],
      ]);

      const result = await this.clienteService.getCliente(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter cliente.');
    }
  }

  /**
   * Cria um novo cliente.
   */
  async create(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'write'],
        ['comercial', 'write'],
      ]);

      const result = await this.clienteService.createCliente(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar cliente.');
    }
  }

  /**
   * Atualiza um cliente existente.
   */
  async update(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'write'],
        ['comercial', 'write'],
      ]);

      const result = await this.clienteService.updateCliente(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao atualizar cliente.');
    }
  }

  /**
   * Remove ou inativa um cliente.
   */
  async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'delete'],
        ['vendas', 'write'],
      ]);

      const result = await this.clienteService.deleteCliente(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao remover cliente.');
    }
  }
}

export const clienteController = new ClienteController();
