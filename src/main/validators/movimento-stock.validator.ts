/**
 * @file movimento-stock.validator.ts
 * @description Validadores das operações de stock (EPIC 3, TASK-019).
 *
 * A quantidade é sempre positiva. O sinal vem de `armazemOrigemId` e
 * `armazemDestinoId`, e é isso que o `CASE` de `verificar_stock.sql` avalia.
 * Um validador que aceitasse negativos autorizaria o dobro do erro: uma saída
 * de 5 gravada como -5 fecharia o `estoques` duas vezes.
 */

import { z } from 'zod';

const quantidadePositiva = z
  .coerce
  .number({ invalid_type_error: 'A quantidade tem de ser um número.' })
  .positive('A quantidade tem de ser maior que zero.');

/**
 * Ajustes aceitam negativo de propósito: um inventário pode dar menos do que o
 * sistema diz. O sinal é aplicado pelo service, que grava a diferença no lado
 * certo.
 */
const quantidadeComSinal = z.coerce
  .number({ invalid_type_error: 'A quantidade tem de ser um número.' })
  .refine((valor) => valor !== 0, 'A diferença de um ajuste não pode ser zero.');

const loteOpcional = {
  lote: z.string().trim().min(1).optional().nullable(),
  loteId: z.string().trim().min(1).optional().nullable(),
};

const documento = {
  documentoOrigem: z.string({ required_error: 'O documento de origem é obrigatório.' }).trim().min(1),
  documentoTipo: z.string().trim().min(1).optional().nullable(),
  documentoId: z.string().trim().min(1).optional().nullable(),
};

/** Entrada de mercadoria: aumenta o stock do armazém de destino. */
export const entradaStockSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
  armazemDestinoId: z.string({ required_error: 'O armazém de destino é obrigatório.' }).trim().min(1),
  quantidade: quantidadePositiva,
  custoUnitario: z.coerce.number().min(0).optional(),
  localizacaoDestinoId: z.string().trim().min(1).optional().nullable(),
  data: z.coerce.date().optional(),
  criadoPorId: z.string().trim().min(1).optional().nullable(),
  numero: z.string().trim().min(1).optional(),
  ...loteOpcional,
  ...documento,
});

/** Saída de mercadoria: diminui o stock do armazém de origem. */
export const saidaStockSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
  armazemOrigemId: z.string({ required_error: 'O armazém de origem é obrigatório.' }).trim().min(1),
  quantidade: quantidadePositiva,
  localizacaoOrigemId: z.string().trim().min(1).optional().nullable(),
  data: z.coerce.date().optional(),
  criadoPorId: z.string().trim().min(1).optional().nullable(),
  numero: z.string().trim().min(1).optional(),
  ...loteOpcional,
  ...documento,
});

/**
 * Transferência entre armazéns.
 *
 * Exige origens e destino diferentes, e-o-stock não pode desaparecer: o total
 * do artigo é neutro, mas a posição de origem tem de ter saldo para o que sai.
 */
export const transferenciaStockSchema = z
  .object({
    artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
    armazemOrigemId: z.string({ required_error: 'O armazém de origem é obrigatório.' }).trim().min(1),
    armazemDestinoId: z.string({ required_error: 'O armazém de destino é obrigatório.' }).trim().min(1),
    quantidade: quantidadePositiva,
    localizacaoOrigemId: z.string().trim().min(1).optional().nullable(),
    localizacaoDestinoId: z.string().trim().min(1).optional().nullable(),
    custoUnitario: z.coerce.number().min(0).optional(),
    data: z.coerce.date().optional(),
    criadoPorId: z.string().trim().min(1).optional().nullable(),
    numero: z.string().trim().min(1).optional(),
    ...loteOpcional,
    ...documento,
  })
  .refine((dados) => dados.armazemOrigemId !== dados.armazemDestinoId, {
    message: 'O armazém de origem e o de destino têm de ser diferentes.',
    path: ['armazemDestinoId'],
  });

/**
 * Ajuste de inventário. Aceita diferença com sinal: positiva entra, negativa sai.
 */
export const ajusteStockSchema = z
  .object({
    artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
    armazemId: z.string({ required_error: 'O armazém é obrigatório.' }).trim().min(1),
    /** Diferença apurada: positiva credita, negativa debita. */
    diferenca: quantidadeComSinal,
    localizacaoId: z.string().trim().min(1).optional().nullable(),
    custoUnitario: z.coerce.number().min(0).optional(),
    data: z.coerce.date().optional(),
    criadoPorId: z.string().trim().min(1).optional().nullable(),
    numero: z.string().trim().min(1).optional(),
    ...loteOpcional,
    ...documento,
  });

/** Devolução: uma saída que volta a entrar. */
export const devolucaoStockSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
  armazemId: z.string({ required_error: 'O armazém é obrigatório.' }).trim().min(1),
  quantidade: quantidadePositiva,
  localizacaoId: z.string().trim().min(1).optional().nullable(),
  custoUnitario: z.coerce.number().min(0).optional(),
  data: z.coerce.date().optional(),
  criadoPorId: z.string().trim().min(1).optional().nullable(),
  numero: z.string().trim().min(1).optional(),
  ...loteOpcional,
  ...documento,
});

/** Reserva de stock para um documento, sem o mover. */
export const reservaStockSchema = z.object({
  artigoId: z.string().trim().min(1),
  armazemId: z.string().trim().min(1),
  quantidade: quantidadePositiva,
  localizacaoId: z.string().trim().min(1).optional().nullable(),
  loteId: z.string().trim().min(1).optional().nullable(),
});

export const filtrosMovimentoSchema = z.object({
  artigoId: z.string().trim().min(1).optional(),
  armazemId: z.string().trim().min(1).optional(),
  loteId: z.string().trim().min(1).optional(),
  tipo: z
    .enum([
      'entrada',
      'saida',
      'transferencia',
      'ajuste',
      'consumo_producao',
      'devolucao',
    ])
    .optional(),
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  search: z.string().trim().optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type EntradaStockInput = z.infer<typeof entradaStockSchema>;
export type SaidaStockInput = z.infer<typeof saidaStockSchema>;
export type TransferenciaStockInput = z.infer<typeof transferenciaStockSchema>;
export type AjusteStockInput = z.infer<typeof ajusteStockSchema>;
export type DevolucaoStockInput = z.infer<typeof devolucaoStockSchema>;
export type ReservaStockInput = z.infer<typeof reservaStockSchema>;
export type FiltrosMovimentoInput = z.infer<typeof filtrosMovimentoSchema>;
