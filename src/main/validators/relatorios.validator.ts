/**
 * @file relatorios.validator.ts
 * @description Validadores Zod dos relatórios contabilísticos.
 */

import { z } from 'zod';

const TIPOS_ENTIDADE = ['cliente', 'fornecedor', 'funcionario', 'outro'] as const;

const dataOpcional = z.preprocess(
  (arg) => {
    if (arg === undefined || arg === null || arg === '') return undefined;
    if (arg instanceof Date) return arg;
    if (typeof arg === 'string') return new Date(arg);
    return arg;
  },
  z.date({ invalid_type_error: 'Data inválida.' }).optional()
);

const idObrigatorio = (campo: string) =>
  z.string({ required_error: `${campo} é obrigatório.` }).trim().min(1, `${campo} é obrigatório.`);

const idOpcional = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === null ? undefined : v));

export const balanceteFiltersSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  exercicioId: idOpcional,
  periodoId: idOpcional,
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  diarioId: idOpcional,
  classe: z.coerce.number().int().min(1).max(8).optional(),
  apenasFolhas: z.boolean().default(true),
  incluirSaldoZero: z.boolean().default(false),
  acumulado: z.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export const razaoFiltersSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  contaId: idObrigatorio('A conta'),
  exercicioId: idOpcional,
  periodoId: idOpcional,
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export const diariosFiltersSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  exercicioId: idOpcional,
  periodoId: idOpcional,
  diarioId: idOpcional,
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export const contaCorrenteFiltersSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  entidadeTipo: z.enum(TIPOS_ENTIDADE, { errorMap: () => ({ message: 'Tipo de entidade inválido.' }) }),
  entidadeId: idObrigatorio('A entidade'),
  exercicioId: idOpcional,
  periodoId: idOpcional,
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  incluirAntiguidade: z.boolean().default(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export type BalanceteFilters = z.infer<typeof balanceteFiltersSchema>;
export type RazaoFilters = z.infer<typeof razaoFiltersSchema>;
export type DiariosFilters = z.infer<typeof diariosFiltersSchema>;
export type ContaCorrenteFilters = z.infer<typeof contaCorrenteFiltersSchema>;