/**
 * @file guia-entrega.controller.ts
 * @description Controlador IPC para Guia de Entrega (GR) com RBAC.
 */

import { guiaEntregaService, GuiaEntregaService } from '../services/guia-entrega.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class GuiaEntregaController {
  private guiaService: GuiaEntregaService;
  private auth: AuthService;

  constructor(svc: GuiaEntregaService = guiaEntregaService, auth: AuthService = authService) {
    this.guiaService = svc;
    this.auth = auth;
  }

  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.guiaService.listar(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar guias de entrega.');
    }
  }

  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.guiaService.obter(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter guia de entrega.');
    }
  }

  async criar(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.guiaService.criar(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar guia de entrega.');
    }
  }

  async confirmar(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.guiaService.confirmar(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao confirmar guia de entrega.');
    }
  }

  async faturar(id: string, payload: { serie: string }): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.guiaService.faturar(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao faturar guia de entrega.');
    }
  }

  async anular(id: string, motivo: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.guiaService.anular(id, motivo);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao anular guia de entrega.');
    }
  }

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.guiaService.getDocumentoImprimivel(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter modelo de impressão da guia.');
    }
  }
}

export const guiaEntregaController = new GuiaEntregaController();
