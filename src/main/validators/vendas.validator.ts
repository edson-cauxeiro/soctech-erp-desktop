/**
 * @file vendas.validator.ts
 * @description Validadores Zod para Faturação e Vendas com séries atómicas e origens fiscais (FT/FR/NC).
 */

import { z } from 'zod';

export const linhaFaturaVendaInputSchema = z.object({
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

export const emitirFaturaVendaSchema = z
  .object({
    empresaId: z.string({ required_error: 'A empresa é obrigatória.' }).min(1, 'Indique a empresa.'),
    serie: z.string({ required_error: 'A série do documento é obrigatória.' }).trim().min(1, 'Indique a série.'),
    tipo: z.enum(['fatura', 'fatura_recibo', 'nota_credito', 'nota_debito'], {
      errorMap: () => ({ message: 'Tipo de documento de venda inválido.' }),
    }).default('fatura'),
    dataEmissao: z.preprocess(
      (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()),
      z.date()
    ),
    dataVencimento: z.preprocess(
      (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : undefined),
      z.date().optional()
    ),
    clienteId: z.string({ required_error: 'O cliente é obrigatório.' }).min(1, 'Selecione o cliente.'),
    armazemExpedicaoId: z.string().trim().optional().nullable(),
    encomendaOrigem: z.string().trim().max(100).optional().nullable(),
    faturaOrigemId: z.string().trim().optional().nullable(),
    guiaEntregaOrigemId: z.string().trim().optional().nullable(),
    proformaOrigemId: z.string().trim().optional().nullable(),
    motivoNotaCredito: z.string().trim().max(500).optional().nullable(),
    motivoIsencao: z.string().trim().max(150).optional().nullable(),
    estadoPagamento: z.enum(['pago', 'pendente', 'parcial', 'vencido']).default('pendente'),
    /// Liquidação de uma Fatura-Recibo. Uma FR afirma que o cliente já pagou,
    /// logo o meio e a conta são obrigatórios: sem eles a fatura diria "paga"
    /// sem que dinheiro nenhum tivesse entrado na tesouraria.
    meioPagamento: z
      .enum(['numerario', 'transferencia', 'cheque', 'multicaixa'], {
        errorMap: () => ({ message: 'Meio de pagamento inválido.' }),
      })
      .optional()
      .nullable(),
    contaBancariaId: z.string().trim().optional().nullable(),
    dataPagamento: z.preprocess(
      (arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : undefined),
      z.date().optional()
    ),
    atcud: z.string().trim().max(50).optional().nullable(),
    linhas: z.array(linhaFaturaVendaInputSchema).min(1, 'Adicione pelo menos um artigo à fatura.'),
  })
  .refine(
    (data) => {
      if (data.tipo === 'nota_credito') {
        return !!data.faturaOrigemId && data.faturaOrigemId.trim() !== '';
      }
      return true;
    },
    {
      message: 'A fatura de origem é obrigatória para emitir uma Nota de Crédito.',
      path: ['faturaOrigemId'],
    }
  )
  .refine(
    (data) => {
      if (data.tipo === 'fatura_recibo') {
        return !!data.meioPagamento && !!data.contaBancariaId;
      }
      return true;
    },
    {
      message:
        'Uma Fatura-Recibo exige meio de pagamento e conta de crédito: o dinheiro tem de entrar na tesouraria.',
      path: ['meioPagamento'],
    }
  )
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

export const anularFaturaSchema = z.object({
  id: z.string().min(1, 'ID da fatura é obrigatório.'),
  motivo: z.string().trim().min(3, 'Indique um motivo com pelo menos 3 caracteres.'),
});

export const vendasFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  clienteId: z.string().trim().optional(),
  tipo: z.enum(['fatura', 'fatura_recibo', 'nota_credito', 'nota_debito']).optional(),
  estadoDocumento: z.enum(['emitido', 'anulado']).optional(),
  estadoPagamento: z.enum(['pago', 'pendente', 'parcial', 'vencido']).optional(),
  search: z.string().trim().optional(),
  dataInicio: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  dataFim: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type EmitirFaturaVendaInput = z.infer<typeof emitirFaturaVendaSchema>;
export type LinhaFaturaVendaInput = z.infer<typeof linhaFaturaVendaInputSchema>;
export type AnularFaturaInput = z.infer<typeof anularFaturaSchema>;
export type VendasFilters = z.infer<typeof vendasFiltersSchema>;
