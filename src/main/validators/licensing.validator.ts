/**
 * @file licensing.validator.ts
 * @description Contratos Zod dos canais IPC de licenciamento.
 */

import { z } from 'zod';
import { LICENSE_FILE_MAX_BYTES } from '../../shared/licensing/file';

export const licensingPingSchema = z.object({}).strict();

export const licensingModuleSchema = z
  .object({ modulo: z.string().trim().min(1) })
  .strict();

/** Conteúdo devolvido pelo diálogo; o tamanho impede payloads absurdos no IPC. */
export const licensingConteudoSchema = z
  .object({
    conteudo: z.string().min(1).max(LICENSE_FILE_MAX_BYTES),
  })
  .strict();

export const licensingEventosSchema = z
  .object({
    limite: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
