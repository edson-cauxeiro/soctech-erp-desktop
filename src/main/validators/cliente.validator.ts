/**
 * @file cliente.validator.ts
 * @description Validadores Zod para o cadastro e gestão de Clientes (RF02).
 * Implementa RN02.1 (Validação de NIF PT/AO) e RN02.2 (Limite de Crédito).
 */

import { z } from 'zod';
import { TipoEntidade, EstadoCliente, RegimeIvaEntidade } from '@prisma/client';
import { validateNif } from '../utils/nif-validator';

export const createClienteSchema = z
  .object({
    codigo: z
      .string({ required_error: 'O código do cliente é obrigatório.' })
      .trim()
      .min(1, 'O código do cliente não pode estar vazio.')
      .max(50, 'O código deve ter no máximo 50 caracteres.'),
    nome: z
      .string({ required_error: 'O nome do cliente é obrigatório.' })
      .trim()
      .min(2, 'O nome deve ter pelo menos 2 caracteres.')
      .max(150, 'O nome deve ter no máximo 150 caracteres.'),
    nif: z
      .string({ required_error: 'O NIF é obrigatório.' })
      .trim()
      .min(3, 'NIF inválido.')
      .max(30, 'O NIF deve ter no máximo 30 caracteres.'),
    tipo: z.nativeEnum(TipoEntidade, {
      errorMap: () => ({ message: 'Tipo de entidade inválido (particular ou empresa).' }),
    }),
    endereco: z
      .string({ required_error: 'O endereço é obrigatório.' })
      .trim()
      .min(2, 'O endereço deve ter pelo menos 2 caracteres.')
      .max(255),
    codigoPostal: z.string().trim().max(20).optional().nullable(),
    cidade: z.string().trim().max(100).optional().nullable(),
    pais: z.string().trim().default('Angola'),
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
    metodoPagamento: z.string().trim().max(100).optional().nullable(),
    limiteCredito: z.coerce
      .number({ invalid_type_error: 'Limite de crédito deve ser um número.' })
      .min(0, 'O limite de crédito não pode ser negativo.')
      .default(0),
    descontoPadrao: z.coerce
      .number()
      .min(0, 'O desconto não pode ser negativo.')
      .max(100, 'O desconto não pode exceder 100%.')
      .default(0),
    moeda: z.string().trim().default('AOA'),
    vendedor: z.string().trim().max(100).optional().nullable(),
    estado: z.nativeEnum(EstadoCliente).default(EstadoCliente.ativo),
    regimeIva: z.nativeEnum(RegimeIvaEntidade).default(RegimeIvaEntidade.geral),
    retencaoFonte: z.coerce
      .number()
      .min(0)
      .max(100)
      .default(0)
      .optional()
      .nullable(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      // RN02.1: Validação de NIF de acordo com o país
      return validateNif(data.nif, data.pais);
    },
    {
      message: 'Número de Identificação Fiscal (NIF) inválido para o país selecionado.',
      path: ['nif'],
    }
  );

export const updateClienteSchema = z
  .object({
    codigo: z.string().trim().min(1).max(50).optional(),
    nome: z.string().trim().min(2).max(150).optional(),
    nif: z.string().trim().min(3).max(30).optional(),
    tipo: z.nativeEnum(TipoEntidade).optional(),
    endereco: z.string().trim().min(2).max(255).optional(),
    codigoPostal: z.string().trim().max(20).optional().nullable(),
    cidade: z.string().trim().max(100).optional().nullable(),
    pais: z.string().trim().optional(),
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
    metodoPagamento: z.string().trim().max(100).optional().nullable(),
    limiteCredito: z.coerce.number().min(0).optional(),
    descontoPadrao: z.coerce.number().min(0).max(100).optional(),
    moeda: z.string().trim().optional(),
    vendedor: z.string().trim().max(100).optional().nullable(),
    estado: z.nativeEnum(EstadoCliente).optional(),
    regimeIva: z.nativeEnum(RegimeIvaEntidade).optional(),
    retencaoFonte: z.coerce.number().min(0).max(100).optional().nullable(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.nif) {
        return validateNif(data.nif, data.pais || 'AO');
      }
      return true;
    },
    {
      message: 'Número de Identificação Fiscal (NIF) inválido para o país selecionado.',
      path: ['nif'],
    }
  );

export const clienteFiltersSchema = z.object({
  search: z.string().trim().optional(),
  tipo: z.nativeEnum(TipoEntidade).optional(),
  estado: z.nativeEnum(EstadoCliente).optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CreateClienteInput = z.infer<typeof createClienteSchema>;
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;
export type ClienteFilters = z.infer<typeof clienteFiltersSchema>;
