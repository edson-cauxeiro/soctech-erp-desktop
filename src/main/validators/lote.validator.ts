/**
 * @file lote.validator.ts
 * @description Validadores Zod para a gestão de lotes (TASK-041).
 *
 * As datas entram como texto do formulário e saem como `Date` (ou `null`). O
 * `null` distingue "sem data declarada" de "data inválida": esta última é
 * recusada, porque um lote com validade inventada envenena o FEFO.
 */

import { z } from 'zod';

const dataOpcional = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((valor, ctx) => {
    if (valor === null || valor === undefined || valor === '') return null;
    if (valor instanceof Date) {
      if (Number.isNaN(valor.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data inválida.' });
        return z.NEVER;
      }
      return valor;
    }
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Data inválida: '${valor}'.` });
      return z.NEVER;
    }
    return data;
  });

const precoCusto = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((valor, ctx) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = Number(valor);
    if (Number.isNaN(numero)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Preço de custo inválido.' });
      return z.NEVER;
    }
    if (numero < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O preço de custo não pode ser negativo.' });
      return z.NEVER;
    }
    return numero;
  });

export const criarLoteSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
  numeroLote: z
    .string({ required_error: 'O número de lote é obrigatório.' })
    .trim()
    .min(1, 'O número de lote é obrigatório.')
    .max(60, 'O número de lote não pode exceder 60 caracteres.'),
  dataFabrico: dataOpcional,
  dataValidade: dataOpcional,
  fornecedorId: z.string().trim().min(1).optional().nullable(),
  precoCusto,
  observacoes: z.string().trim().max(500).optional().nullable(),
});

export const actualizarLoteSchema = z.object({
  numeroLote: z.string().trim().min(1, 'O número de lote é obrigatório.').max(60).optional(),
  dataFabrico: dataOpcional,
  dataValidade: dataOpcional,
  fornecedorId: z.string().trim().min(1).optional().nullable(),
  precoCusto,
  observacoes: z.string().trim().max(500).optional().nullable(),
});

export const filtrosLoteSchema = z.object({
  artigoId: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  /** Filtro por relação com a validade actual. */
  estadoValidade: z
    .enum(['valido', 'proximo_caducar', 'caducado', 'sem_validade'])
    .optional(),
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

export type CriarLoteInput = z.infer<typeof criarLoteSchema>;
export type ActualizarLoteInput = z.infer<typeof actualizarLoteSchema>;
export type FiltrosLoteInput = z.infer<typeof filtrosLoteSchema>;