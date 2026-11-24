/**
 * @file proforma.validator.ts
 * @description Validadores Zod para Proforma de Venda (FP) no DoraERP.
 */

import { z } from 'zod';

export const linhaProformaInputSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).min(1, 'Selecione um artigo.'),
  quantidade: z.coerce
    .number({ invalid_type_error: 'Quantidade deve ser um número.' })
    .positive('A quantidade deve ser superior a zero.'),
  precoUnitario: z.coerce
    .number({ invalid_type_error: 'Preço deve ser um número.' })
    .min(0, 'O preço unitário não pode ser negativo.'),
  desconto: z.coerce
    .number({ invalid_type_error: 'Desconto deve ser um número.' })
    .min(0, 'Desconto mínimo é 0%.')
    .max(100, 'Desconto máximo é 100%.')
    .default(0)
    .optional(),
  taxaIva: z.coerce
    .number({ invalid_type_error: 'Taxa de IVA deve ser um número.' })
    .min(0, 'Taxa de IVA mínima é 0%.')
    .max(100, 'Taxa de IVA máxima é 100%.')
    .default(14),
  motivoIsencao: z.string().trim().max(150).optional().nullable(),
});

export const criarProformaSchema = z
  .object({
    empresaId: z.string({ required_error: 'A empresa é obrigatória.' }).min(1, 'Indique a empresa.'),
    serie: z.string({ required_error: 'A série do documento é obrigatória.' }).trim().min(1, 'Indique a série.'),
    dataEmissao: z.preprocess(
      (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()),
      z.date()
    ),
    dataValidade: z.preprocess(
      (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : undefined),
      z.date().optional()
    ),
    clienteId: z.string({ required_error: 'O cliente é obrigatório.' }).min(1, 'Selecione o cliente.'),
    encomendaOrigem: z.string().trim().max(100).optional().nullable(),
    motivoIsencao: z.string().trim().max(150).optional().nullable(),
    linhas: z.array(linhaProformaInputSchema).min(1, 'Adicione pelo menos um item à proforma.'),
  })
  .refine(
    (data) => {
      const temIsento = data.linhas.some((l) => l.taxaIva === 0);
      if (temIsento && (!data.motivoIsencao || data.motivoIsencao.trim() === '')) {
        return false;
      }
      return true;
    },
    {
      message: 'O motivo de isenção de IVA é obrigatório quando existem itens com taxa de IVA igual a 0%.',
      path: ['motivoIsencao'],
    }
  );

export const emitirProformaSchema = z.object({
  id: z.string().min(1, 'ID da proforma é obrigatório.'),
});

export const converterParaFaturaSchema = z.object({
  id: z.string().min(1, 'ID da proforma é obrigatório.'),
  serie: z.string().min(1, 'Série da fatura é obrigatória.'),
  armazemExpedicaoId: z.string().trim().optional().nullable(),
});

export const converterParaGuiaSchema = z.object({
  id: z.string().min(1, 'ID da proforma é obrigatório.'),
  serie: z.string().min(1, 'Série da guia é obrigatória.'),
  armazemExpedicaoId: z.string({ required_error: 'Armazém de expedição é obrigatório.' }).min(1),
  localEntrega: z.string().trim().optional().nullable(),
  transportador: z.string().trim().optional().nullable(),
});

export const anularProformaSchema = z.object({
  id: z.string().min(1, 'ID da proforma é obrigatório.'),
  motivo: z.string().trim().min(3, 'Indique um motivo com pelo menos 3 caracteres.'),
});

export const proformaFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  clienteId: z.string().trim().optional(),
  estado: z.enum(['rascunho', 'emitida', 'convertida', 'anulada']).optional(),
  search: z.string().trim().optional(),
  dataInicio: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  dataFim: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CriarProformaInput = z.infer<typeof criarProformaSchema>;
export type LinhaProformaInput = z.infer<typeof linhaProformaInputSchema>;
export type EmitirProformaInput = z.infer<typeof emitirProformaSchema>;
export type ConverterParaFaturaInput = z.infer<typeof converterParaFaturaSchema>;
export type ConverterParaGuiaInput = z.infer<typeof converterParaGuiaSchema>;
export type AnularProformaInput = z.infer<typeof anularProformaSchema>;
export type ProformaFilters = z.infer<typeof proformaFiltersSchema>;
