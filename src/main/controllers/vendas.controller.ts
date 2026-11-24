/**
 * @file vendas.controller.ts
 * @description Controlador IPC para Vendas e Faturação Fiscal (FT/FR/NC/ND) com RBAC e modelo de impressão.
 */

import { vendasService, VendasService } from '../services/vendas.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class VendasController {
  private vendasService: VendasService;
  private auth: AuthService;

  constructor(svc: VendasService = vendasService, auth: AuthService = authService) {
    this.vendasService = svc;
    this.auth = auth;
  }

  async listFaturas(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');

      const result = await this.vendasService.listFaturas(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar faturas de venda.');
    }
  }

  async getFatura(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');

      const result = await this.vendasService.getFatura(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter fatura de venda.');
    }
  }

  async emitirFatura(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');

      const result = await this.vendasService.emitirFatura(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao emitir fatura de venda.');
    }
  }

  async anularFatura(id: string, motivo: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'write');

      const result = await this.vendasService.anularFatura(id, motivo);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao anular fatura de venda.');
    }
  }

  async getDocumentoImprimivel(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'vendas', 'read');

      const result = await this.vendasService.getDocumentoImprimivel(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter modelo de impressão da fatura.');
    }
  }
}

export const vendasController = new VendasController();
