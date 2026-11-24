/**
 * @file regra-stock.validator.ts
 * @description Validadores Zod para Regras de Picking e Putaway (RF06).
 */

import { z } from 'zod';
import { EstrategiaPicking } from '@prisma/client';

export const regraPickingSchema = z
  .object({
    armazemId: z.string({ required_error: 'Armazém é obrigatório.' }).min(1, 'Selecione o armazém.'),
    classeArmazenamentoId: z.string().trim().optional().nullable(),
    zonaId: z.string().trim().optional().nullable(),
    estrategia: z.nativeEnum(EstrategiaPicking, {
      errorMap: () => ({ message: 'Estratégia de picking inválida.' }),
    }).default('fifo'),
    prioridade: z.coerce.number().int().min(1).max(1000).default(100),
    respeitarValidade: z.coerce.boolean().default(true),
    ativo: z.coerce.boolean().default(true),
  })
  .refine(
    (data) => data.classeArmazenamentoId || data.zonaId,
    {
      message: 'Deve especificar classe de armazenamento ou zona.',
      path: ['classeArmazenamentoId'],
    }
  );

export const regraPickingPartialSchema = z
  .object({
    armazemId: z.string().trim().min(1).optional(),
    classeArmazenamentoId: z.string().trim().optional().nullable(),
    zonaId: z.string().trim().optional().nullable(),
    estrategia: z.nativeEnum(EstrategiaPicking).optional(),
    prioridade: z.coerce.number().int().min(1).max(1000).optional(),
    respeitarValidade: z.coerce.boolean().optional(),
    ativo: z.coerce.boolean().optional(),
  })
  .refine(
    (data) => data.classeArmazenamentoId || data.zonaId,
    {
      message: 'Deve especificar classe de armazenamento ou zona.',
      path: ['classeArmazenamentoId'],
    }
  );

const regraPutawayBaseSchema = z
  .object({
    armazemId: z.string({ required_error: 'Armazém é obrigatório.' }).min(1, 'Selecione o armazém.'),
    classeArmazenamentoId: z.string().trim().optional().nullable(),
    zonaId: z.string().trim().optional().nullable(),
    prioridade: z.coerce.number().int().min(1).max(1000).default(100),
    capacidadeMinima: z.coerce.number().min(0).default(0).optional().nullable(),
    capacidadeMaxima: z.coerce.number().min(1).default(100).optional().nullable(),
    permitirMixProdutos: z.coerce.boolean().default(false),
    permitirMixLotes: z.coerce.boolean().default(false),
    ativo: z.coerce.boolean().default(true),
  })
  .refine(
    (data) => data.classeArmazenamentoId || data.zonaId,
    {
      message: 'Deve especificar classe de armazenamento ou zona.',
      path: ['classeArmazenamentoId'],
    }
  );

export const regraPutawaySchema = regraPutawayBaseSchema;

export const regraPutawayPartialSchema = z
  .object({
    armazemId: z.string().trim().min(1).optional(),
    classeArmazenamentoId: z.string().trim().optional().nullable(),
    zonaId: z.string().trim().optional().nullable(),
    prioridade: z.coerce.number().int().min(1).max(1000).optional(),
    capacidadeMinima: z.coerce.number().min(0).optional().nullable(),
    capacidadeMaxima: z.coerce.number().min(1).optional().nullable(),
    permitirMixProdutos: z.coerce.boolean().optional(),
    permitirMixLotes: z.coerce.boolean().optional(),
    ativo: z.coerce.boolean().optional(),
  })
  .refine(
    (data) => data.classeArmazenamentoId || data.zonaId,
    {
      message: 'Deve especificar classe de armazenamento ou zona.',
      path: ['classeArmazenamentoId'],
    }
  );

export const regraPickingFiltersSchema = z.object({
  armazemId: z.string().trim().optional(),
  classeArmazenamentoId: z.string().trim().optional(),
  zonaId: z.string().trim().optional(),
  ativo: z.coerce.boolean().optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export const regraPutawayFiltersSchema = z.object({
  armazemId: z.string().trim().optional(),
  classeArmazenamentoId: z.string().trim().optional(),
  zonaId: z.string().trim().optional(),
  ativo: z.coerce.boolean().optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type RegraPickingInput = z.infer<typeof regraPickingSchema>;
export type UpdateRegraPickingInput = z.infer<typeof regraPickingPartialSchema>;
export type RegraPutawayInput = z.infer<typeof regraPutawaySchema>;
export type UpdateRegraPutawayInput = z.infer<typeof regraPutawayPartialSchema>;
export type RegraPickingFilters = z.infer<typeof regraPickingFiltersSchema>;
export type RegraPutawayFilters = z.infer<typeof regraPutawayFiltersSchema>;