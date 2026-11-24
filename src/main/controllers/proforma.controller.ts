/**
 * @file proforma.controller.ts
 * @description Controlador IPC para Proforma de Venda (FP) com RBAC.
 */

import { proformaService, ProformaService } from '../services/proforma.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class ProformaController {
  private proformaService: ProformaService;
  private auth: AuthService;

  constructor(svc: ProformaService = proformaService, auth: AuthService = authService) {
    this.proformaService = svc;
    this.auth = auth;
  }

  async list(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.proformaService.list(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar proformas.');
    }
  }

  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.proformaService.get(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter proforma.');
    }
  }

  async criar(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.proformaService.criar(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar proforma.');
    }
  }

  async emitir(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.proformaService.emitir(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao emitir proforma.');
    }
  }

  async converterParaFatura(id: string, payload: { serie: string; armazemExpedicaoId?: string | null }): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.proformaService.converterParaFatura(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao converter proforma em fatura.');
    }
  }

  async converterParaGuia(id: string, payload: { serie: string; armazemExpedicaoId: string; localEntrega?: string | null; transportador?: string | null }): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.proformaService.converterParaGuia(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao converter proforma em guia.');
    }
  }

  async anular(id: string, motivo: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');
      const result = await this.proformaService.anular(id, motivo);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao anular proforma.');
    }
  }

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');
      const result = await this.proformaService.getDocumentoImprimivel(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter modelo de impressão da proforma.');
    }
  }
}

export const proformaController = new ProformaController();
