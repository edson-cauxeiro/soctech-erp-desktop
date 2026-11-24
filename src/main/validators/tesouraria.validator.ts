/**
 * @file tesouraria.validator.ts
 * @description Validadores Zod da Tesouraria: contas bancárias, movimentos de
 * dinheiro, sessões de caixa e reconciliação.
 *
 * Regras transversais impostas aqui (FIN-01/FIN-02 da Sprint 5):
 *  - `valor` é sempre positivo; a direcção do dinheiro vem de `tipo`, nunca
 *    do sinal. Isto elimina a classe de bugs "pagamento com valor negativo".
 *  - `contaOrigemId` é obrigatória em tudo o que sai de dinheiro e proibida em
 *    tudo o que não sai. A mesma conta não pode ser origem e destino.
 *  - Campos monetários nunca são negativos.
 */

import { z } from 'zod';

const TOLERANCIA = 0.0001;

/** Datas chegam do renderer como `YYYY-MM-DD`; normalizamos para `Date`. */
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
    return new Date(arg as string);
  },
  z.date({ invalid_type_error: 'Data inválida.' }).optional()
);

const idObrigatorio = (campo: string) =>
  z.string({ required_error: `${campo} é obrigatório.` }).trim().min(1, `${campo} é obrigatório.`);

const idOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

/** Valores monetários: sempre positivos quando representam dinheiro a mover. */
const valorMovimento = z.coerce
  .number({ invalid_type_error: 'O valor deve ser numérico.' })
  .positive('O valor deve ser maior que zero.');

/** Quantidades de contagem (arqueação) não negativas. */
const valorNaoNegativo = z.coerce
  .number({ invalid_type_error: 'O valor deve ser numérico.' })
  .min(0, 'O valor não pode ser negativo.')
  .max(1_000_000_000, 'Valor acima do limite suportado.');

// =============================================================================
// Contas Bancárias
// =============================================================================

export const criarContaBancariaSchema = z
  .object({
    empresaId: idObrigatorio('A empresa'),
    codigo: z
      .string({ required_error: 'O código é obrigatório.' })
      .trim()
      .min(1, 'O código é obrigatório.')
      .max(20, 'O código não pode exceder 20 caracteres.')
      .transform((v) => v.toUpperCase()),
    designacao: z
      .string({ required_error: 'A designação é obrigatória.' })
      .trim()
      .min(2, 'A designação deve ter pelo menos 2 caracteres.')
      .max(120),
    tipo: z.enum(['banco', 'caixa'], {
      errorMap: () => ({ message: 'Tipo de conta inválido.' }),
    }),
    contaContabilId: idOpcional,
    nomeBanco: z.string().trim().max(120).optional().nullable(),
    iban: z.string().trim().max(34).optional().nullable(),
    swiftBic: z.string().trim().max(11).optional().nullable(),
    saldoInicial: z.coerce.number().min(0, 'O saldo inicial não pode ser negativo.').default(0).optional(),
    moeda: z.string().trim().length(3, 'A moeda deve ter 3 letras (ex.: AOA).').optional(),
    observacoes: z.string().trim().max(500).optional().nullable(),
    ativo: z.boolean().default(true).optional(),
  })
  .refine((v) => v.tipo === 'caixa' || Boolean(v.iban), {
    message: 'Contas bancárias exigem IBAN. Só contas do tipo caixa podem ficar sem IBAN.',
    path: ['iban'],
  });

export const atualizarContaBancariaSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  designacao: z.string().trim().min(2, 'A designação deve ter pelo menos 2 caracteres.').max(120).optional(),
  tipo: z.enum(['banco', 'caixa'], { errorMap: () => ({ message: 'Tipo de conta inválido.' }) }).optional(),
  contaContabilId: idOpcional,
  nomeBanco: z.string().trim().max(120).optional().nullable(),
  iban: z.string().trim().max(34).optional().nullable(),
  swiftBic: z.string().trim().max(11).optional().nullable(),
  observacoes: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
});

export const contaBancariaFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  tipo: z.enum(['banco', 'caixa']).optional(),
  apenasAtivas: z.coerce.boolean().default(true).optional(),
  search: z.string().trim().optional(),
});

export const contasContabeisDisponiveisSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  contaBancariaId: z.string().trim().min(1).optional(),
});

// =============================================================================
// Movimentos de Tesouraria
// =============================================================================

/**
 * `estorno` não entra aqui de propósito: o movimento inverso é sempre gerado
 * pelo serviço a partir do original, para que ninguém possa estornar um estorno
 * ou inverter contas à mão.
 */
export const TIPO_MOVIMENTO_TESOURARIA = ['entrada', 'saida', 'transferencia', 'ajuste'] as const;

export const TIPO_DOCUMENTO_TESOURARIA = [
  'manual',
  'recibo_venda',
  'fatura_venda',
  'fatura_compra',
  'guia_recepcao',
] as const;

export const criarMovimentoSchema = z
  .object({
    empresaId: idObrigatorio('A empresa'),
    data: dataSchema,
    tipo: z.enum(TIPO_MOVIMENTO_TESOURARIA, {
      errorMap: () => ({ message: 'Tipo de movimento inválido.' }),
    }),
    contaOrigemId: idOpcional,
    contaDestinoId: idOpcional,
    valor: valorMovimento,
    meioPagamento: z
      .string()
      .trim()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => v || null),
    descricao: z.string().trim().max(240).optional().nullable(),
    entidadeTipo: z.string().trim().max(60).optional().nullable(),
    entidadeId: z.string().trim().max(60).optional().nullable(),
    observacaoExtrato: z.string().trim().max(240).optional().nullable(),
    conciliado: z.boolean().default(false).optional(),
    dataConciliacao: dataOpcional,
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'entrada') {
      if (!v.contaDestinoId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contaDestinoId'],
          message: 'Uma entrada precisa da conta que recebe o dinheiro.',
        });
      }
      if (v.contaOrigemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contaOrigemId'],
          message: 'Uma entrada não pode ter conta de origem.',
        });
      }
    }

    if (v.tipo === 'saida') {
      if (!v.contaOrigemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contaOrigemId'],
          message: 'Uma saída precisa da conta de onde sai o dinheiro.',
        });
      }
      if (v.contaDestinoId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contaDestinoId'],
          message: 'Uma saída não pode ter conta de destino.',
        });
      }
    }

    if (v.tipo === 'transferencia') {
      if (!v.contaOrigemId || !v.contaDestinoId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contaOrigemId'],
          message: 'Uma transferência precisa de conta de origem e de destino.',
        });
      }
      if (v.contaOrigemId && v.contaOrigemId === v.contaDestinoId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contaDestinoId'],
          message: 'A conta de destino tem de ser diferente da conta de origem.',
        });
      }
    }

    if (v.tipo === 'ajuste' && !v.descricao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['descricao'],
        message: 'Um ajuste tem de ser justificado com uma descrição.',
      });
    }
  });

export const estornarMovimentoSchema = z.object({
  id: idObrigatorio('O movimento'),
  motivo: z.string().trim().min(3, 'Indique um motivo com pelo menos 3 caracteres.').max(240),
  utilizadorId: z.string().trim().optional(),
});

export const conciliacaoLoteSchema = z.object({
  empresaId: idObrigatorio('A empresa'),
  contaBancariaId: idObrigatorio('A conta bancária'),
  movimentosIds: z.array(idObrigatorio('Movimento')).min(1, 'Seleccione pelo menos um movimento.'),
  dataConciliacao: dataSchema,
  conciliado: z.boolean().default(true),
});

export const movimentoFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  contaId: z.string().trim().optional(),
  tipo: z.enum(TIPO_MOVIMENTO_TESOURARIA).optional(),
  estado: z.enum(['pendente', 'confirmado', 'estornado']).optional(),
  conciliado: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : v === 'true' || v === true), z.boolean())
    .optional(),
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  search: z.string().trim().optional(),
  skip: z.coerce.number().int().min(0).default(0).optional(),
  take: z.coerce.number().int().min(1).max(500).default(100).optional(),
});

// =============================================================================
// Sessões de Caixa
// =============================================================================

export const abrirSessaoCaixaSchema = z
  .object({
    empresaId: idObrigatorio('A empresa'),
    contaCaixaId: idObrigatorio('A conta de caixa'),
    dataAbertura: dataSchema,
    fundoInicial: valorNaoNegativo,
    utilizadorId: z.string().trim().optional(),
  })
  .refine((v) => v.fundoInicial >= 0, {
    message: 'O fundo inicial não pode ser negativo.',
    path: ['fundoInicial'],
  });

export const fecharSessaoCaixaSchema = z
  .object({
    id: idObrigatorio('A sessão'),
    totalNumerario: valorNaoNegativo,
    totalMulticaixa: valorNaoNegativo,
    totalTransferencia: valorNaoNegativo,
    observacoes: z.string().trim().max(500).optional().nullable(),
    utilizadorId: z.string().trim().optional(),
  })
  .refine((v) => v.totalNumerario + v.totalMulticaixa + v.totalTransferencia > 0, {
    message: 'Indique pelo menos um total de contagem superior a zero.',
    path: ['totalNumerario'],
  });

export const sessaoCaixaFiltersSchema = z.object({
  empresaId: z.string().trim().optional(),
  contaCaixaId: z.string().trim().optional(),
  estado: z.enum(['aberta', 'fechada']).optional(),
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
});

export const TOLERANCIA_CENTAVOS = TOLERANCIA;

export type CriarContaBancariaInput = z.infer<typeof criarContaBancariaSchema>;
export type AtualizarContaBancariaInput = z.infer<typeof atualizarContaBancariaSchema>;
export type ContaBancariaFilters = z.infer<typeof contaBancariaFiltersSchema>;
export type ContasContabeisDisponiveisInput = z.infer<typeof contasContabeisDisponiveisSchema>;
export type CriarMovimentoInput = z.infer<typeof criarMovimentoSchema>;
export type EstornarMovimentoInput = z.infer<typeof estornarMovimentoSchema>;
export type ConciliacaoLoteInput = z.infer<typeof conciliacaoLoteSchema>;
export type MovimentoFilters = z.infer<typeof movimentoFiltersSchema>;
export type AbrirSessaoCaixaInput = z.infer<typeof abrirSessaoCaixaSchema>;
export type FecharSessaoCaixaInput = z.infer<typeof fecharSessaoCaixaSchema>;
export type SessaoCaixaFilters = z.infer<typeof sessaoCaixaFiltersSchema>;
