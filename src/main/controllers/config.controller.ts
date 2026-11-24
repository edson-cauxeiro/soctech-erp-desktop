/**
 * @file config.controller.ts
 * @description Controlador IPC para a configuração técnica da base de dados.
 */

import { z } from 'zod';
import { lerConfig, guardarConfig, testarConexao } from '../services/config.service';
import { reconnectPrisma } from '../database/prisma';
import { ok, err } from '../utils/ipc-response';
import type { IpcResponse } from '../utils/ipc-response';
import { AppError } from '../utils/errors';

export const dbConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  appSecret: z.string().min(8),
});

export class ConfigController {
  /**
   * Devolve os valores actuais do `.env`.
   */
  ler(): IpcResponse<z.infer<typeof dbConfigSchema>> {
    try {
      return ok(lerConfig());
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('CONFIG_READ_ERROR', (error as Error)?.message || 'Erro ao ler a configuração.');
    }
  }

  /**
   * Grava os novos valores no `.env` e reconecta o Prisma.
   */
  async guardar(payload: unknown): Promise<IpcResponse<{ message: string }>> {
    const result = dbConfigSchema.safeParse(payload);
    if (!result.success) {
      return err('VALIDATION_ERROR', result.error.message);
    }

    try {
      guardarConfig(result.data);
      await reconnectPrisma();
      return ok({ message: 'Configuração guardada e Prisma reconectado.' });
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('CONFIG_SAVE_ERROR', (error as Error)?.message || 'Erro ao guardar a configuração.');
    }
  }

  /**
   * Testa uma ligação com os parâmetros fornecidos, sem gravar.
   */
  async testar(
    payload: unknown,
  ): Promise<IpcResponse<{ ok: boolean; ms?: number; error?: string }>> {
    const result = dbConfigSchema.safeParse(payload);
    if (!result.success) {
      return err('VALIDATION_ERROR', result.error.message);
    }

    const testResult = await testarConexao(result.data);
    return ok(testResult);
  }
}

export const configController = new ConfigController();
