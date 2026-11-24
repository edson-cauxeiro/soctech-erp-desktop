/**
 * @file compras.validator.ts
 * @description Validadores Zod para Compras: Encomendas, Guias de Receção e Faturas de Fornecedor (RF05).
 */

import { z } from 'zod';
import { EstadoEncomendaCompra, ConformidadeRecepcao, EstadoPagamento } from '@prisma/client';

export const linhaEncomendaCompraSchema = z.object({
  artigoId: z.string().min(1, 'Artigo é obrigatório.'),
  quantidade: z.coerce.number().positive('Quantidade deve ser superior a zero.'),
  precoAcordado: z.coerce.number().min(0, 'Preço deve ser positivo ou zero.'),
  taxaIva: z.coerce.number().min(0).max(100).default(23),
});

export const createEncomendaCompraSchema = z.object({
  numero: z.string().trim().max(50).optional(),
  data: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()), z.date()),
  fornecedorId: z.string({ required_error: 'Fornecedor é obrigatório.' }).min(1, 'Selecione o fornecedor.'),
  dataRecepcao: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional().nullable()),
  armazemDestinoId: z.string().trim().optional().nullable(),
  estado: z.nativeEnum(EstadoEncomendaCompra).default(EstadoEncomendaCompra.aberta).optional(),
  observacoes: z.string().max(1000).optional().nullable(),
  linhas: z.array(linhaEncomendaCompraSchema).min(1, 'Adicione pelo menos um artigo à encomenda.'),
});

export const updateEncomendaCompraSchema = z.object({
  dataRecepcao: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional().nullable()),
  armazemDestinoId: z.string().trim().optional().nullable(),
  estado: z.nativeEnum(EstadoEncomendaCompra).optional(),
  observacoes: z.string().max(1000).optional().nullable(),
  linhas: z.array(linhaEncomendaCompraSchema).optional(),
});

export const linhaGuiaRecepcaoSchema = z.object({
  artigoId: z.string().min(1, 'Artigo é obrigatório.'),
  quantidade: z.coerce.number().positive('Quantidade deve ser superior a zero.'),
  precoCusto: z.coerce.number().min(0).default(0).optional(),
  lote: z.string().trim().max(100).optional().nullable(),
  validade: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional().nullable()),
});

export const createGuiaRecepcaoSchema = z.object({
  numero: z.string().trim().max(50).optional(),
  data: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()), z.date()),
  fornecedorId: z.string().trim().optional().nullable(),
  encomendaId: z.string().trim().optional().nullable(),
  armazemDestinoId: z.string({ required_error: 'Armazém de destino é obrigatório.' }).min(1, 'Selecione o armazém.'),
  conformidade: z.nativeEnum(ConformidadeRecepcao).default(ConformidadeRecepcao.conforme).optional(),
  observacoes: z.string().max(1000).optional().nullable(),
  linhas: z.array(linhaGuiaRecepcaoSchema).min(1, 'Adicione pelo menos um artigo rececionado.'),
});

export const linhaFaturaCompraSchema = z.object({
  artigoId: z.string().min(1, 'Artigo é obrigatório.'),
  quantidade: z.coerce.number().positive('Quantidade deve ser superior a zero.'),
  precoUnitario: z.coerce.number().min(0, 'Preço deve ser positivo.'),
  taxaIva: z.coerce.number().min(0).max(100).default(23),
});

export const createFaturaCompraSchema = z.object({
  empresaId: z.string().trim().optional(),
  numeroInterno: z.string().trim().max(50).optional(),
  numeroFornecedor: z.string({ required_error: 'Nº de fatura do fornecedor é obrigatório.' }).trim().min(1, 'Indique o nº da fatura.'),
  dataEmissao: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()), z.date()),
  dataVencimento: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()), z.date()),
  fornecedorId: z.string({ required_error: 'Fornecedor é obrigatório.' }).min(1, 'Selecione o fornecedor.'),
  guiaRecepcaoId: z.string().trim().optional().nullable(),
  estadoPagamento: z.nativeEnum(EstadoPagamento).default(EstadoPagamento.pendente).optional(),
  retencaoFonte: z.coerce.number().min(0).default(0).optional(),
  linhas: z.array(linhaFaturaCompraSchema).min(1, 'Adicione pelo menos um item à fatura.'),
});

export const comprasFiltersSchema = z.object({
  fornecedorId: z.string().trim().optional(),
  estado: z.string().trim().optional(),
  search: z.string().trim().optional(),
  dataInicio: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  dataFim: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CreateEncomendaCompraInput = z.infer<typeof createEncomendaCompraSchema>;
export type UpdateEncomendaCompraInput = z.infer<typeof updateEncomendaCompraSchema>;
export type CreateGuiaRecepcaoInput = z.infer<typeof createGuiaRecepcaoSchema>;
export type CreateFaturaCompraInput = z.infer<typeof createFaturaCompraSchema>;
export type ComprasFilters = z.infer<typeof comprasFiltersSchema>;
