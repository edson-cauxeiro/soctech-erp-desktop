/**
 * @file recibo.validator.ts
 * @description Validadores Zod para Recibos de Venda (RC) e Imputações no DoraERP.
 */

import { z } from 'zod';

export const imputacaoReciboInputSchema = z.object({
  faturaId: z.string({ required_error: 'ID da fatura é obrigatório.' }).min(1),
  valorImputado: z.coerce
    .number({ invalid_type_error: 'Valor imputado deve ser numérico.' })
    .positive('O valor imputado deve ser maior que zero.'),
});

export const criarReciboSchema = z.object({
  empresaId: z.string({ required_error: 'A empresa é obrigatória.' }).min(1, 'Indique a empresa.'),
  serie: z.string({ required_error: 'A série do recibo é obrigatória.' }).trim().min(1, 'Indique a série.'),
  data: z.preprocess(
    (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()),
    z.date()
  ),
  clienteId: z.string({ required_error: 'O cliente é obrigatório.' }).min(1, 'Selecione o cliente.'),
  meioPagamento: z.enum(['numerario', 'transferencia', 'cheque', 'multicaixa'], {
    errorMap: () => ({ message: 'Meio de pagamento inválido.' }),
  }),
  valorRecebido: z.coerce
    .number({ invalid_type_error: 'Valor recebido deve ser numérico.' })
    .positive('O valor recebido deve ser maior que zero.'),
  /// Texto livre legado de recibos já impressos. Substituído por
  /// `contaBancariaId`, que é obrigatório em recibos novos.
  contaBancaria: z.string().trim().max(100).optional().nullable(),
  /// Conta que recebe o dinheiro. Obrigatória: um recibo sem conta não entra
  /// na tesouraria e o estado de pago da fatura não bate certo com o caixa.
  contaBancariaId: z.string().trim().min(1, 'Selecione a conta que recebe o pagamento.'),
  retencaoFonte: z.coerce.number().min(0).max(100).default(0).optional(),
  observacoes: z.string().trim().max(500).optional().nullable(),
  imputacoes: z.array(imputacaoReciboInputSchema).optional().default([]),
});

export const imputarReciboSchema = z.object({
  id: z.string().min(1, 'ID do recibo é obrigatório.'),
  imputacoes: z.array(imputacaoReciboInputSchema).min(1, 'Indique pelo menos uma fatura para imputar.'),
});

export const anularReciboSchema = z.object({
  id: z.string().min(1, 'ID do recibo é obrigatório.'),
  motivo: z.string().trim().min(3, 'Indique um motivo com pelo menos 3 caracteres.'),
});

export const reciboFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  clienteId: z.string().trim().optional(),
  estadoDocumento: z.enum(['emitido', 'anulado']).optional(),
  search: z.string().trim().optional(),
  dataInicio: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  dataFim: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CriarReciboInput = z.infer<typeof criarReciboSchema>;
export type ImputacaoReciboInput = z.infer<typeof imputacaoReciboInputSchema>;
export type ImputarReciboInput = z.infer<typeof imputarReciboSchema>;
export type AnularReciboInput = z.infer<typeof anularReciboSchema>;
export type ReciboFilters = z.infer<typeof reciboFiltersSchema>;
