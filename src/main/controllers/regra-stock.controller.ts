/**
 * @file regra-stock.controller.ts
 * @description Controller IPC para Regras de Picking e Putaway (RF06).
 */

import { regraStockService } from '../services/regra-stock.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';

export const regraStockController = {
  // ── RegraPicking ──────────────────────────────────────────────────────────

  async createRegraPicking(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const result = await regraStockService.createRegraPicking(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao criar regra de picking.');
    }
  },

  async updateRegraPicking(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const result = await regraStockService.updateRegraPicking(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao actualizar regra de picking.');
    }
  },

  async deleteRegraPicking(id: string): Promise<IpcResponse<unknown>> {
    try {
      await regraStockService.deleteRegraPicking(id);
      return ok({ success: true });
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao eliminar regra de picking.');
    }
  },

  async listRegrasPicking(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const result = await regraStockService.listRegrasPicking(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao listar regras de picking.');
    }
  },

  // ── RegraPutaway ──────────────────────────────────────────────────────────

  async createRegraPutaway(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const result = await regraStockService.createRegraPutaway(payload);
      return ok(result);
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao criar regra de putaway.');
    }
  },

  async updateRegraPutaway(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const result = await regraStockService.updateRegraPutaway(id, payload);
      return ok(result);
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao actualizar regra de putaway.');
    }
  },

  async deleteRegraPutaway(id: string): Promise<IpcResponse<unknown>> {
    try {
      await regraStockService.deleteRegraPutaway(id);
      return ok({ success: true });
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao eliminar regra de putaway.');
    }
  },

  async listRegrasPutaway(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const result = await regraStockService.listRegrasPutaway(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof Error) {
        return err('VALIDATION_ERROR', error.message);
      }
      return err('INTERNAL_ERROR', 'Erro ao listar regras de putaway.');
    }
  },
};