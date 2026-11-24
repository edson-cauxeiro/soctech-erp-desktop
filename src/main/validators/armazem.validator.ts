/**
 * @file armazem.validator.ts
 * @description Validadores Zod para a gestão de Armazéns (RF06).
 */

import { z } from 'zod';
import { TipoArmazem } from '@prisma/client';

export const createArmazemSchema = z.object({
  codigo: z
    .string({ required_error: 'O código do armazém é obrigatório.' })
    .trim()
    .min(1, 'O código do armazém não pode estar vazio.')
    .max(50, 'O código deve ter no máximo 50 caracteres.'),
  designacao: z
    .string({ required_error: 'A designação do armazém é obrigatória.' })
    .trim()
    .min(2, 'A designação deve ter pelo menos 2 caracteres.')
    .max(150, 'A designação deve ter no máximo 150 caracteres.'),
  /**
   * Obrigatório a partir do EPIC 3. Sem ele todos os armazéns criados pela app
   * ficavam com `empresa_id IS NULL`, e uma restrição composta trata NULL como
   * distinto de NULL: o mesmo `codigo` ficaria livre para quantas empresas. É a
   * condição que o comentário de `Armazem.codigo` no schema aponta para largar
   * o `@unique` global.
   */
  empresaId: z
    .string({ required_error: 'A empresa é obrigatória.' })
    .trim()
    .min(1, 'A empresa não pode ser vazia.'),
  descricao: z.string().trim().max(500).optional().nullable(),
  tipo: z
    .nativeEnum(TipoArmazem, {
      errorMap: () => ({ message: 'Tipo de armazém inválido.' }),
    })
    .optional()
    .nullable(),
  localizacao: z.string().trim().max(255).optional().nullable(),
  isDefaultVendas: z.boolean().default(false).optional(),
  isDefaultCompras: z.boolean().default(false).optional(),
  ativo: z.boolean().default(true).optional(),
});

export const updateArmazemSchema = z.object({
  codigo: z.string().trim().min(1).max(50).optional(),
  designacao: z.string().trim().min(2).max(150).optional(),
  descricao: z.string().trim().max(500).optional().nullable(),
  tipo: z.nativeEnum(TipoArmazem).optional().nullable(),
  localizacao: z.string().trim().max(255).optional().nullable(),
  isDefaultVendas: z.boolean().optional(),
  isDefaultCompras: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export const armazemFiltersSchema = z.object({
  search: z.string().trim().optional(),
  tipo: z.nativeEnum(TipoArmazem).optional(),
  ativo: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CreateArmazemInput = z.infer<typeof createArmazemSchema>;
export type UpdateArmazemInput = z.infer<typeof updateArmazemSchema>;
export type ArmazemFilters = z.infer<typeof armazemFiltersSchema>;
