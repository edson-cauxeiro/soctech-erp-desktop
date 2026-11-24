/**
 * @file armazem.router.ts
 * @description Registo de canais IPC para Armazéns (RF06/TP-EPIC3).
 *
 * Cada handler valida o payload com Zod (quando aplicável) antes de chamar o
 * controller, garantindo que dados inválidos nunca chegam à camada de serviço.
 * As respostas são automaticamente serializadas com `serializeIpcData` para
 * evitar problemas de tipos do Prisma no tráfego IPC entre o Main Process
 * e o Renderer.
 */

import { z } from 'zod';
import { ipcMain } from 'electron';
import { armazemController } from '../controllers/armazem.controller';
import { armazemService } from '../services/armazem.service';
import {
  createArmazemSchema,
  updateArmazemSchema,
} from '../validators/armazem.validator';

export function registerArmazemRouter(): void {
  /** Listar armazéns com filtros opcionais (search, tipo, ativo, paginação). */
  ipcMain.handle('armazens:list', async (_event, rawFilters) => {
    try {
      // Os filtros vêm raw do renderer; o controller trata a validação interna.
      return armazemController.list(rawFilters);
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.errors,
        }
      };
    }
  });

  /** Obter um armazém pelo ID. */
  ipcMain.handle('armazens:get', async (_event, id: string) => {
    try {
      if (!id || id.trim() === '') {
        return {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'ID do armazém é obrigatório.',
          }
        };
      }
      return armazemController.get(id);
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Criar um novo armazém. */
  ipcMain.handle('armazens:create', async (_event, rawData) => {
    try {
      const data: z.infer<typeof createArmazemSchema> = createArmazemSchema.parse(rawData);
      return armazemController.create(data);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados de criação de armazém inválidos.',
            details: error.errors,
          }
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Atualizar um armazém existente. */
  ipcMain.handle('armazens:update', async (_event, rawId: string, rawData: unknown) => {
    try {
      const id: string = rawId.trim();
      if (!id) {
        return {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'ID do armazém é obrigatório.',
          }
        };
      }
      // Partial do schema de criação para atualização
      const data: z.infer<typeof updateArmazemSchema> = updateArmazemSchema.parse(rawData);
      return armazemController.update(id, data);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados de atualização de armazém inválidos.',
            details: error.errors,
          }
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Remover (desativar) um armazém pelo ID. */
  ipcMain.handle('armazens:delete', async (_event, id: string) => {
    try {
      if (!id || id.trim() === '') {
        return {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'ID do armazém é obrigatório.',
          }
        };
      }
      return armazemController.delete(id);
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Desativar um armazém (definir como inativo). */
  ipcMain.handle('armazens:desativar', async (_event, id: string) => {
    try {
      if (!id || id.trim() === '') {
        return {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'ID do armazém é obrigatório.',
          }
        };
      }
      const result = await armazemController.deactivate(id);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Obter a estrutura de áreas e zones de um armazém. */
  ipcMain.handle('armazens:estrutura', async (_event, armazemId: string) => {
    try {
      const result = await armazemService.listarEstrutura(armazemId);
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });
}
