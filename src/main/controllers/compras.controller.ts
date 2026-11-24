/**
 * @file compras.controller.ts
 * @description Controlador IPC para Compras, Encomendas, Guias de Receção e Faturas de Fornecedor (RF05).
 */

import { comprasService, ComprasService } from '../services/compras.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class ComprasController {
  private comprasService: ComprasService;
  private auth: AuthService;

  constructor(svc: ComprasService = comprasService, auth: AuthService = authService) {
    this.comprasService = svc;
    this.auth = auth;
  }

  // Encomendas
  async listEncomendas(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.comprasService.listEncomendas(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar encomendas de compra.');
    }
  }

  async getEncomenda(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.comprasService.getEncomenda(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter encomenda de compra.');
    }
  }

  async createEncomenda(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'write');

      const result = await this.comprasService.createEncomenda(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar encomenda de compra.');
    }
  }

  // Guias de Receção
  async listGuias(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.comprasService.listGuias(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar guias de receção.');
    }
  }

  async getGuia(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.comprasService.getGuia(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter guia de receção.');
    }
  }

  async createGuia(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'write');

      const result = await this.comprasService.createGuiaRecepcao(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar guia de receção.');
    }
  }

  // Faturas de Fornecedor
  async listFaturas(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.comprasService.listFaturas(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar faturas de fornecedor.');
    }
  }

  async getFatura(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'read');

      const result = await this.comprasService.getFatura(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter fatura de fornecedor.');
    }
  }

  async createFatura(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'compras', 'write');

      const result = await this.comprasService.createFaturaCompra({
        ...(payload as Record<string, unknown>),
        empresaId: session?.empresaConfigId,
      });
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar fatura de fornecedor.');
    }
  }
}

export const comprasController = new ComprasController();
