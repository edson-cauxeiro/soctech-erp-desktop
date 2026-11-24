/**
 * @file recibo.controller.ts
 * @description Controlador IPC para Recibos de Venda (RC) com RBAC.
 */

import { reciboService, ReciboService } from '../services/recibo.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class ReciboController {
  private reciboService: ReciboService;
  private auth: AuthService;

  constructor(svc: ReciboService = reciboService, auth: AuthService = authService) {
    this.reciboService = svc;
    this.auth = auth;
  }

  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.reciboService.list(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar recibos de venda.');
    }
  }

  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.reciboService.get(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter recibo de venda.');
    }
  }

  async criar(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.reciboService.criar(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar recibo de venda.');
    }
  }

  async imputarFaturas(id: string, imputacoes: Array<{ faturaId: string; valorImputado: number }>): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.reciboService.imputarFaturas(id, imputacoes);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao imputar faturas ao recibo.');
    }
  }

  async anular(id: string, motivo: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.reciboService.anular(id, motivo);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao anular recibo de venda.');
    }
  }

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.reciboService.getDocumentoImprimivel(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter modelo de impressão do recibo.');
    }
  }
}

export const reciboController = new ReciboController();
