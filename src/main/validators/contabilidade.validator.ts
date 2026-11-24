/**
 * @file contabilidade.validator.ts
 * @description Validadores Zod da Contabilidade Geral: plano de contas,
 * diários, períodos, mapeamentos e seed.
 *
 * Regras transversais:
 *  - O `codigo` da conta é a chave funcional (SAF-T, relatórios) e por isso é
 *    imutável depois de criado. A classe deriva do primeiro dígito e o nível
 *    do comprimento, para não haver dois números a dizer coisas diferentes.
 *  - Só contas folha (`aceitaMovimento`) podem ser usadas em lançamentos e
 *    mapeamentos; a regra é imposta no serviço, mas o schema já impede valores
 *    que não façam sentido.
 *  - Nada aqui aceita valores negativos: não há quantidades nem dinheiro neste
 *    módulo, mas a regra mantém-se para os campos numéricos que vierem a ser
 *    acrescentados.
 */

import { z } from 'zod';

const TIPOS_CONTA = [
  'activo',
  'passivo',
  'capitalProprio',
  'proveito',
  'custo',
  'resultado',
  'memo',
] as const;

const NATUREZAS_CONTA = ['devedora', 'credora'] as const;

const TIPOS_DIARIO = [
  'vendas',
  'compras',
  'caixa',
  'banco',
  'geral',
  'ajustamento',
  'abertura',
  'liquidacao',
  'salarios',
  'imobilizado',
] as const;

const ESTADOS_PERIODO = ['aberto', 'fechado', 'bloqueado'] as const;

const dataSchema = z.preprocess(
  (arg) => {
    if (arg instanceof Date) return arg;
    if (typeof arg === 'string' && arg.trim() !== '') return new Date(arg);
    return undefined;
  },
  z.date({ invalid_type_error: 'Data inválida.' })
);

const idObrigatorio = (campo: string) =>
  z.string({ required_error: `${campo} é obrigatório.` }).trim().min(1, `${campo} é obrigatório.`);

const idOpcional = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === '' || v === null ? undefined : v));

const booleanoOpcional = z
  .preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    return v;
  }, z.boolean().optional())
  .optional();

/** Código PGC: começa na classe 1–8 e usa só dígitos. */
const codigoConta = z
  .string({ required_error: 'O código da conta é obrigatório.' })
  .trim()
  .regex(
    /^[1-8][0-9]{0,9}$/,
    'O código deve começar por 1–8 e conter apenas dígitos (máx. 10).'
  );

const codigoDiario = z
  .string({ required_error: 'O código do diário é obrigatório.' })
  .trim()
  .min(2, 'O código do diário deve ter pelo menos 2 caracteres.')
  .max(6, 'O código do diário não pode exceder 6 caracteres.')
  .regex(/^[A-Za-z0-9]+$/, 'O código do diário só pode conter letras e números.')
  .transform((v) => v.toUpperCase());

const chaveMapeamento = z
  .string({ required_error: 'A chave do mapeamento é obrigatória.' })
  .trim()
  .min(3, 'A chave deve ter pelo menos 3 caracteres.')
  .max(40, 'A chave não pode exceder 40 caracteres.')
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'A chave só pode conter letras, números e underscores.')
  .transform((v) => v.toUpperCase());

// =============================================================================
// Plano de contas
// =============================================================================

export const criarContaContabilSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  codigo: codigoConta,
  designacao: z
    .string({ required_error: 'A designação é obrigatória.' })
    .trim()
    .min(2, 'A designação deve ter pelo menos 2 caracteres.')
    .max(120, 'A designação não pode exceder 120 caracteres.'),
  /** Vazio = derivar automaticamente pelo prefixo do código. */
  contaPaiId: idOpcional,
  tipo: z.enum(TIPOS_CONTA, {
    errorMap: () => ({ message: 'Tipo de conta inválido.' }),
  }),
  natureza: z.enum(NATUREZAS_CONTA, {
    errorMap: () => ({ message: 'Natureza da conta inválida.' }),
  }),
  aceitaMovimento: z.boolean().default(false),
  exigeCentroCusto: z.boolean().default(false),
  exigeEntidade: z.boolean().default(false),
  activa: z.boolean().default(true),
});

/**
 * O `codigo` não entra: mudá-lo partiria mapeamentos, extractos e histórico.
 * Quem precisa de outro código cria outra conta e desactiva a antiga.
 */
export const atualizarContaContabilSchema = z.object({
  designacao: z.string().trim().min(2, 'A designação deve ter pelo menos 2 caracteres.').max(120).optional(),
  contaPaiId: idOpcional,
  tipo: z
    .enum(TIPOS_CONTA, { errorMap: () => ({ message: 'Tipo de conta inválido.' }) })
    .optional(),
  natureza: z
    .enum(NATUREZAS_CONTA, { errorMap: () => ({ message: 'Natureza da conta inválida.' }) })
    .optional(),
  aceitaMovimento: z.boolean().optional(),
  exigeCentroCusto: z.boolean().optional(),
  exigeEntidade: z.boolean().optional(),
  activa: z.boolean().optional(),
});

export const contaContabilFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  classe: z.coerce.number().int().min(1).max(8).optional(),
  tipo: z.enum(TIPOS_CONTA).optional(),
  activa: booleanoOpcional,
  aceitaMovimento: booleanoOpcional,
  search: z.string().trim().optional(),
  /** Quando `true`, devolve só contas que aceitam movimento (para selects). */
  apenasFolhas: booleanoOpcional,
});

// =============================================================================
// Diários
// =============================================================================

export const criarDiarioContabilSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  codigo: codigoDiario,
  designacao: z
    .string({ required_error: 'A designação é obrigatória.' })
    .trim()
    .min(2, 'A designação deve ter pelo menos 2 caracteres.')
    .max(120),
  tipo: z.enum(TIPOS_DIARIO, {
    errorMap: () => ({ message: 'Tipo de diário inválido.' }),
  }),
  activo: z.boolean().default(true),
});

export const atualizarDiarioContabilSchema = z.object({
  designacao: z.string().trim().min(2, 'A designação deve ter pelo menos 2 caracteres.').max(120).optional(),
  tipo: z
    .enum(TIPOS_DIARIO, { errorMap: () => ({ message: 'Tipo de diário inválido.' }) })
    .optional(),
  activo: z.boolean().optional(),
});

export const diarioContabilFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  tipo: z.enum(TIPOS_DIARIO).optional(),
  activo: booleanoOpcional,
  search: z.string().trim().optional(),
});

// =============================================================================
// Períodos contabilísticos
// =============================================================================

export const criarPeriodoContabilSchema = z
  .object({
    exercicioId: idObrigatorio('O exercício'),
    numero: z.coerce
      .number({ invalid_type_error: 'O número do período deve ser numérico.' })
      .int('O número do período deve ser inteiro.')
      .min(1, 'O número do período deve estar entre 1 e 13.')
      .max(13, 'O número do período deve estar entre 1 e 13.'),
    dataInicio: dataSchema,
    dataFim: dataSchema,
  })
  .refine((v) => v.dataFim >= v.dataInicio, {
    message: 'A data de fim não pode ser anterior à data de início.',
    path: ['dataFim'],
  });

export const periodoContabilFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  exercicioId: z.string().trim().optional(),
  estado: z.enum(ESTADOS_PERIODO).optional(),
});

export const alterarEstadoPeriodoSchema = z.object({
  estado: z.enum(ESTADOS_PERIODO, {
    errorMap: () => ({ message: 'Estado do período inválido.' }),
  }),
  utilizadorId: z.string().trim().optional(),
});

// =============================================================================
// Mapeamentos de contas
// =============================================================================

export const guardarMapeamentoContaSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  chave: chaveMapeamento,
  contaId: idObrigatorio('A conta'),
});

export const mapeamentoContaFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
});

// =============================================================================
// Seed
// =============================================================================

export const semearContabilidadeSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
});

export type CriarContaContabilInput = z.infer<typeof criarContaContabilSchema>;
export type AtualizarContaContabilInput = z.infer<typeof atualizarContaContabilSchema>;
export type ContaContabilFilters = z.infer<typeof contaContabilFiltersSchema>;
export type CriarDiarioContabilInput = z.infer<typeof criarDiarioContabilSchema>;
export type AtualizarDiarioContabilInput = z.infer<typeof atualizarDiarioContabilSchema>;
export type DiarioContabilFilters = z.infer<typeof diarioContabilFiltersSchema>;
export type CriarPeriodoContabilInput = z.infer<typeof criarPeriodoContabilSchema>;
export type PeriodoContabilFilters = z.infer<typeof periodoContabilFiltersSchema>;
export type AlterarEstadoPeriodoInput = z.infer<typeof alterarEstadoPeriodoSchema>;
export type GuardarMapeamentoContaInput = z.infer<typeof guardarMapeamentoContaSchema>;
export type MapeamentoContaFilters = z.infer<typeof mapeamentoContaFiltersSchema>;
export type SemearContabilidadeInput = z.infer<typeof semearContabilidadeSchema>;
