/**
 * @file guia-entrega.validator.ts
 * @description Validadores Zod para Guia de Entrega (GR) no DoraERP.
 */

import { z } from 'zod';

export const linhaGuiaEntregaInputSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).min(1, 'Selecione um artigo.'),
  quantidade: z.coerce
    .number({ invalid_type_error: 'Quantidade deve ser um número.' })
    .positive('A quantidade deve ser superior a zero.'),
  lote: z.string().trim().max(50).optional().nullable(),
  validade: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional().nullable()),
});

export const criarGuiaEntregaSchema = z.object({
  empresaId: z.string({ required_error: 'A empresa é obrigatória.' }).min(1, 'Indique a empresa.'),
  serie: z.string({ required_error: 'A série é obrigatória.' }).trim().min(1, 'Indique a série.'),
  data: z.preprocess(
    (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()),
    z.date()
  ),
  clienteId: z.string({ required_error: 'O cliente é obrigatório.' }).min(1, 'Selecione o cliente.'),
  armazemExpedicaoId: z.string({ required_error: 'Armazém de expedição é obrigatório.' }).min(1),
  proformaOrigemId: z.string().trim().optional().nullable(),
  encomendaOrigem: z.string().trim().max(100).optional().nullable(),
  localEntrega: z.string().trim().max(255).optional().nullable(),
  transportador: z.string().trim().max(150).optional().nullable(),
  observacoes: z.string().trim().max(500).optional().nullable(),
  linhas: z.array(linhaGuiaEntregaInputSchema).min(1, 'Adicione pelo menos um item à guia de entrega.'),
});

export const confirmarGuiaEntregaSchema = z.object({
  id: z.string().min(1, 'ID da guia de entrega é obrigatório.'),
});

export const faturarGuiaEntregaSchema = z.object({
  id: z.string().min(1, 'ID da guia de entrega é obrigatório.'),
  serie: z.string().min(1, 'Série da fatura é obrigatória.'),
});

export const anularGuiaEntregaSchema = z.object({
  id: z.string().min(1, 'ID da guia de entrega é obrigatório.'),
  motivo: z.string().trim().min(3, 'Indique um motivo com pelo menos 3 caracteres.'),
});

export const guiaEntregaFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  clienteId: z.string().trim().optional(),
  estado: z.enum(['rascunho', 'confirmada', 'faturada', 'anulada']).optional(),
  search: z.string().trim().optional(),
  dataInicio: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  dataFim: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CriarGuiaEntregaInput = z.infer<typeof criarGuiaEntregaSchema>;
export type LinhaGuiaEntregaInput = z.infer<typeof linhaGuiaEntregaInputSchema>;
export type ConfirmarGuiaEntregaInput = z.infer<typeof confirmarGuiaEntregaSchema>;
export type FaturarGuiaEntregaInput = z.infer<typeof faturarGuiaEntregaSchema>;
export type AnularGuiaEntregaInput = z.infer<typeof anularGuiaEntregaSchema>;
export type GuiaEntregaFilters = z.infer<typeof guiaEntregaFiltersSchema>;
