/**
 * @file fornecedor.validator.ts
 * @description Validadores Zod para o cadastro e gestão de Fornecedores (RF05).
 */

import { z } from 'zod';
import { EstadoFornecedor } from '@prisma/client';

export const createFornecedorSchema = z.object({
  codigo: z
    .string({ required_error: 'O código do fornecedor é obrigatório.' })
    .trim()
    .min(1, 'O código não pode estar vazio.')
    .max(50, 'O código deve ter no máximo 50 caracteres.'),
  nome: z
    .string({ required_error: 'A razão social ou nome é obrigatório.' })
    .trim()
    .min(2, 'O nome deve ter pelo menos 2 caracteres.')
    .max(150, 'O nome deve ter no máximo 150 caracteres.'),
  nif: z
    .string({ required_error: 'O NIF é obrigatório.' })
    .trim()
    .min(3, 'NIF inválido.')
    .max(30, 'O NIF deve ter no máximo 30 caracteres.'),
  endereco: z
    .string({ required_error: 'O endereço é obrigatório.' })
    .trim()
    .min(2, 'O endereço deve ter pelo menos 2 caracteres.')
    .max(255),
  telefone: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Email inválido.')
    .max(150)
    .optional()
    .nullable()
    .or(z.literal('')),
  condPagamento: z.string().trim().max(100).optional().nullable(),
  iban: z.string().trim().max(40).optional().nullable(),
  prazoEntregaDias: z.coerce
    .number({ invalid_type_error: 'Prazo de entrega deve ser um número de dias.' })
    .min(0, 'O prazo de entrega não pode ser negativo.')
    .default(0),
  estado: z.nativeEnum(EstadoFornecedor).default(EstadoFornecedor.ativo),
  retencaoFonte: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .optional()
    .nullable(),
});

export const updateFornecedorSchema = z.object({
  codigo: z.string().trim().min(1).max(50).optional(),
  nome: z.string().trim().min(2).max(150).optional(),
  nif: z.string().trim().min(3).max(30).optional(),
  endereco: z.string().trim().min(2).max(255).optional(),
  telefone: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Email inválido.')
    .max(150)
    .optional()
    .nullable()
    .or(z.literal('')),
  condPagamento: z.string().trim().max(100).optional().nullable(),
  iban: z.string().trim().max(40).optional().nullable(),
  prazoEntregaDias: z.coerce.number().min(0).optional(),
  estado: z.nativeEnum(EstadoFornecedor).optional(),
  retencaoFonte: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const fornecedorFiltersSchema = z.object({
  search: z.string().trim().optional(),
  estado: z.nativeEnum(EstadoFornecedor).optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CreateFornecedorInput = z.infer<typeof createFornecedorSchema>;
export type UpdateFornecedorInput = z.infer<typeof updateFornecedorSchema>;
export type FornecedorFilters = z.infer<typeof fornecedorFiltersSchema>;
