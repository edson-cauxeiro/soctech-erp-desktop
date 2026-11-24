/**
 * @file lancamento-contabil.validator.ts
 * @description Validadores Zod dos lançamentos em partidas dobradas.
 *
 * O rascunho pode estar desequilibrado — é isso que permite guardar trabalho a
 * meio. O equilíbrio é exigido na validação (`postEntry`), juntamente com
 * período aberto, contas folha e numeração. A validação de linha é feita já
 * aqui para que um valor negativo ou uma linha com os dois lados nunca chegue
 * ao serviço.
 */

import { z } from 'zod';

const ESTADOS_LANCAMENTO = ['rascunho', 'validado', 'estornado'] as const;

const ORIGENS_LANCAMENTO = [
  'manual',
  'integracao',
  'abertura',
  'fecho',
  'ajustamento',
  'liquidacao',
  'estorno',
] as const;

const TIPOS_ENTIDADE = ['cliente', 'fornecedor', 'funcionario', 'outro'] as const;

const dataSchema = z.preprocess(
  (arg) => {
    if (arg instanceof Date) return arg;
    if (typeof arg === 'string' && arg.trim() !== '') return new Date(arg);
    return undefined;
  },
  z.date({ invalid_type_error: 'Data inválida.' })
);

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

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === null ? undefined : v));

/**
 * Dinheiro em string decimal, sem sinal e com no máximo 4 casas. A precisão
 * real é `Decimal(18,4)`; aceitar notação científica ou negativos aqui evita
 * que o erro só apareça na constraint da base de dados.
 */
const valorMonetario = z
  .union([z.string(), z.number()], {
    errorMap: () => ({ message: 'Valor monetário inválido.' }),
  })
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine(
    (v) => /^\d+(\.\d{1,4})?$/.test(v),
    'Valor inválido: use apenas dígitos, até 4 casas decimais e nunca negativos.'
  );

const valorMonetarioOpcional = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? undefined : v),
  valorMonetario.optional()
);

const linhaLancamentoSchema = z
  .object({
    contaId: idObrigatorio('A conta'),
    debito: valorMonetario.default('0'),
    credito: valorMonetario.default('0'),
    descricao: textoOpcional(200),
    centroCustoId: idOpcional,
    entidadeTipo: z
      .enum(TIPOS_ENTIDADE, { errorMap: () => ({ message: 'Tipo de entidade inválido.' }) })
      .optional()
      .nullable(),
    entidadeId: idOpcional,
    codigoImposto: textoOpcional(20),
    baseImposto: valorMonetarioOpcional,
    dataVencimento: dataOpcional,
  })
  .superRefine((linha, ctx) => {
    const debito = Number(linha.debito);
    const credito = Number(linha.credito);

    if (debito <= 0 && credito <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cada linha deve ter um débito ou um crédito positivo.',
        path: ['debito'],
      });
      return;
    }

    if (debito > 0 && credito > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Uma linha não pode ter débito e crédito ao mesmo tempo.',
        path: ['credito'],
      });
    }
  });

const linhasSchema = z
  .array(linhaLancamentoSchema)
  .min(2, 'O lançamento deve ter pelo menos duas linhas.');

const camposOrigem = {
  origem: z
    .enum(ORIGENS_LANCAMENTO, { errorMap: () => ({ message: 'Origem do lançamento inválida.' }) })
    .default('manual'),
  moduloOrigem: textoOpcional(40),
  tipoOrigem: textoOpcional(40),
  origemId: textoOpcional(80),
};

const camposOrigemActualizacao = {
  origem: z
    .enum(ORIGENS_LANCAMENTO, { errorMap: () => ({ message: 'Origem do lançamento inválida.' }) })
    .optional(),
  moduloOrigem: textoOpcional(40),
  tipoOrigem: textoOpcional(40),
  origemId: textoOpcional(80),
};

export const criarLancamentoSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  diarioId: idObrigatorio('O diário'),
  dataContabilistica: dataSchema,
  dataDocumento: dataOpcional,
  descricao: z
    .string({ required_error: 'A descrição é obrigatória.' })
    .trim()
    .min(2, 'A descrição deve ter pelo menos 2 caracteres.')
    .max(200, 'A descrição não pode exceder 200 caracteres.'),
  ...camposOrigem,
  linhas: linhasSchema,
});

export const atualizarLancamentoSchema = z.object({
  diarioId: idObrigatorio('O diário').optional(),
  dataContabilistica: dataSchema.optional(),
  dataDocumento: dataOpcional,
  descricao: z.string().trim().min(2).max(200).optional(),
  ...camposOrigemActualizacao,
  linhas: linhasSchema.optional(),
});

export const validarLancamentoSchema = z.object({
  lancamentoId: idObrigatorio('O lançamento'),
});

export const estornarLancamentoSchema = z.object({
  dataContabilistica: dataSchema,
  descricao: z.string().trim().min(2).max(200).optional(),
  utilizadorId: z.string().trim().optional(),
});

export const lancamentoFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  exercicioId: z.string().trim().optional(),
  periodoId: z.string().trim().optional(),
  diarioId: z.string().trim().optional(),
  estado: z.enum(ESTADOS_LANCAMENTO).optional(),
  contaId: z.string().trim().optional(),
  entidadeTipo: z.enum(TIPOS_ENTIDADE).optional(),
  entidadeId: z.string().trim().optional(),
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type CriarLancamentoInput = z.infer<typeof criarLancamentoSchema>;
export type AtualizarLancamentoInput = z.infer<typeof atualizarLancamentoSchema>;
export type ValidarLancamentoInput = z.infer<typeof validarLancamentoSchema>;
export type EstornarLancamentoInput = z.infer<typeof estornarLancamentoSchema>;
export type LancamentoFilters = z.infer<typeof lancamentoFiltersSchema>;
export type LinhaLancamentoInput = z.infer<typeof linhaLancamentoSchema>;
