/**
 * @file rh.validator.ts
 * @description Validadores Zod base do módulo de Recursos Humanos.
 *
 * Apenas os contratos partilhados da Fase 0 (ficheiros de identificação, datas,
 * paginação, filtros e a operação de processamento de salários). Os validadores
 * específicos de cada entidade serão adicionados nas fases respectivas.
 */

import { z } from 'zod';

const TOLERANCIA = 0.0001;

/**
 * Identificador de referência (chave estrangeira) — valida apenas presença.
 *
 * Os IDs do módulo são gerados pelo Prisma com `cuid()`, pelo que as validações
 * com `rhRefId()` rejeitavam sempre os registos reais.
 */
const rhRefId = (mensagem = 'Identificador inválido.') =>
  z.string({ required_error: mensagem }).trim().min(1, mensagem);

/** Identificador obrigatório (cuid). */
export const rhIdSchema = z
  .string({ required_error: 'O identificador é obrigatório.' })
  .trim()
  .min(1, 'O identificador é obrigatório.');

export const rhIdOpcionalSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullish();

/** Datas chegam do renderer como `YYYY-MM-DD`; normalizamos para `Date`. */
export const rhDataSchema = z.preprocess(
  (arg) => {
    if (arg instanceof Date) return arg;
    if (typeof arg === 'string' && arg.trim() !== '') return new Date(arg);
    return undefined;
  },
  z.date({ invalid_type_error: 'Data inválida.' })
);

export const rhDataOpcionalSchema = z.preprocess(
  (arg) => {
    if (arg === undefined || arg === null || arg === '') return undefined;
    if (arg instanceof Date) return arg;
    return new Date(arg as string);
  },
  z.date({ invalid_type_error: 'Data inválida.' }).optional()
);

/** Números decimais não negativos (quantidades/valores). */
export const rhNumeroNaoNegativoSchema = z.coerce
  .number({ invalid_type_error: 'O valor deve ser numérico.' })
  .min(0, 'O valor não pode ser negativo.')
  .max(1_000_000_000, 'Valor acima do limite suportado.');

export const rhPaginacaoSchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(500).default(50),
});

// =============================================================================
// Enums de apoio
// =============================================================================

export const RH_TIPOS_PROCESSAMENTO = [
  'VENCIMENTO',
  'SUBSIDIO_FERIAS',
  'SUBSIDIO_NATAL',
  'EXTRAORDINARIO',
  'FIM_CONTRATO',
] as const;

export const rhTipoProcessamentoSchema = z.enum(RH_TIPOS_PROCESSAMENTO, {
  errorMap: () => ({ message: 'Tipo de processamento inválido.' }),
});

export const rhModoProcessamentoSchema = z.enum(['INDIVIDUAL', 'LOTE'], {
  errorMap: () => ({ message: 'Modo de processamento inválido.' }),
});

export const rhOperacaoProcessamentoSchema = z
  .enum(['PROCESSAR', 'ANULAR'])
  .default('PROCESSAR');

export const rhEstadoFuncionarioSchema = z.enum([
  'ATIVO',
  'SUSPENSO',
  'INATIVO',
  'CESSADO',
]);

/** Código de período mensal no formato `P01`..`P12`. */
export const rhPeriodoCodigoSchema = z
  .string()
  .trim()
  .regex(/^P(0[1-9]|1[0-2])$/, 'Período inválido (formato esperado: P01..P12).');

// =============================================================================
// Filtros
// =============================================================================

export const filtroFuncionarioSchema = rhPaginacaoSchema.extend({
  empresaId: z.string().trim().min(1).optional(),
  estado: rhEstadoFuncionarioSchema.optional(),
  departamentoId: z.string().trim().min(1).optional(),
  codigo: z.string().trim().min(1).optional(),
  nif: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

// =============================================================================
// Processamento de salários
// =============================================================================

export const RH_TIPOS_AJUSTE_MANUAL = [
  'REMUNERACAO',
  'DESCONTO',
  'ENCARGO_PATRONAL',
] as const;

export const rhTipoAjusteManualSchema = z.enum(RH_TIPOS_AJUSTE_MANUAL, {
  errorMap: () => ({ message: 'Tipo de rubrica do ajuste inválido.' }),
});

/**
 * Ajuste manual introduzido no processamento (RF-PRO-03). A forma espelha o
 * `AjusteManual` do motor de cálculo: o item resultante é gravado com
 * `origem = MANUAL`.
 */
export const ajusteManualSchema = z
  .object({
    rubricaId: rhIdSchema.optional(),
    codigo: z.string().trim().min(1).max(40).optional(),
    descricao: z
      .string({ required_error: 'A descrição do ajuste é obrigatória.' })
      .trim()
      .min(1, 'A descrição do ajuste é obrigatória.')
      .max(200, 'A descrição não pode exceder 200 caracteres.'),
    tipo: rhTipoAjusteManualSchema,
    valor: z.coerce
      .number({ invalid_type_error: 'O valor deve ser numérico.' })
      .positive('O valor do ajuste deve ser positivo.')
      .max(1_000_000_000, 'Valor acima do limite suportado.'),
    quantidade: rhNumeroNaoNegativoSchema.optional(),
    incideIRT: z.boolean().optional(),
    incideINSS: z.boolean().optional(),
  })
  .refine((ajuste) => Boolean(ajuste.rubricaId || ajuste.codigo), {
    message: 'Indique a rubrica (rubricaId) ou um código.',
    path: ['rubricaId'],
  });

export const processarSalariosSchema = z
  .object({
    operacao: rhOperacaoProcessamentoSchema,
    modo: rhModoProcessamentoSchema,
    tipos: z
      .array(rhTipoProcessamentoSchema)
      .min(1, 'Indique pelo menos um tipo de processamento.'),
    incluirFimContrato: z.boolean().default(false),
    ano: z.coerce.number().int().min(2000).max(2100),
    periodoCodigo: rhPeriodoCodigoSchema,
    mes: z.coerce.number().int().min(1).max(12),
    diasProcessados: z.coerce.number().int().min(0).max(31),
    dataProcessamento: rhDataSchema,
    dataLimiteFaltasHE: rhDataSchema,
    funcionarioIds: z
      .array(rhIdSchema)
      .min(1, 'Seleccione pelo menos um funcionário.'),
    ajustesManuais: z.array(ajusteManualSchema).optional(),
  })
  .refine((dados) => dados.modo !== 'INDIVIDUAL' || dados.funcionarioIds.length === 1, {
    message: 'O processamento individual exige exactamente um funcionário.',
    path: ['funcionarioIds'],
  })
  .refine(
    (dados) => !(dados.tipos.includes('FIM_CONTRATO') && !dados.incluirFimContrato),
    {
      message: 'O tipo FIM_CONTRATO exige a opção "incluir fim de contrato".',
      path: ['incluirFimContrato'],
    }
  );

export const anularProcessamentoSchema = z.object({
  processamentoIds: z
    .array(rhIdSchema)
    .min(1, 'Seleccione pelo menos um processamento para anular.'),
  motivo: z
    .string({ required_error: 'O motivo é obrigatório.' })
    .trim()
    .min(3, 'O motivo deve ter pelo menos 3 caracteres.')
    .max(240, 'O motivo não pode exceder 240 caracteres.'),
});

export const simularSalariosSchema = processarSalariosSchema;

// =============================================================================
// Tipos inferidos
// =============================================================================

export type FiltroFuncionarioInput = z.infer<typeof filtroFuncionarioSchema>;
export type AjusteManualInput = z.infer<typeof ajusteManualSchema>;
export type ProcessarSalariosInput = z.infer<typeof processarSalariosSchema>;
export type AnularProcessamentoInput = z.infer<typeof anularProcessamentoSchema>;

// =============================================================================
// RH-107 · Schemas de cadastros e parâmetros (Fase 1)
// =============================================================================

/** Número decimal opcional: `''`/`undefined` → `null`; strings numéricas → número. */
export const rhNumeroOpcionalSchema = z.preprocess(
  (arg) => (arg === '' || arg === undefined ? null : arg),
  z.coerce
    .number({ invalid_type_error: 'O valor deve ser numérico.' })
    .min(0, 'O valor não pode ser negativo.')
    .max(1_000_000_000, 'Valor acima do limite suportado.')
    .nullable()
);

/** Mês (1..12) opcional. */
export const rhMesOpcionalSchema = z.preprocess(
  (arg) => (arg === '' || arg === undefined ? null : arg),
  z.coerce.number().int().min(1, 'Mês inválido.').max(12, 'Mês inválido.').nullable()
);

/** Registo único por id. */
export const rhIdInputSchema = z.object({ id: rhIdSchema });

/** Filtro comum dos cadastros: paginação + pesquisa + estado. */
export const rhFiltroCadastroSchema = rhPaginacaoSchema.extend({
  search: z.string().trim().min(1).optional(),
  ativo: z.boolean().optional(),
});

// ── Enums de apoio aos cadastros ─────────────────────────────────────────────

export const RH_TIPOS_RUBRICA = ['REMUNERACAO', 'DESCONTO', 'ENCARGO_PATRONAL'] as const;
export const RH_NATUREZAS_RUBRICA = ['FIXA', 'VARIAVEL', 'EXTRAORDINARIA'] as const;
export const RH_FORMAS_CALCULO_RUBRICA = [
  'VALOR_FIXO',
  'PERCENTAGEM_SALARIO',
  'VALOR_X_QUANTIDADE',
  'SISTEMA',
] as const;
export const RH_TIPOS_VALOR_PARAMETRO = ['DECIMAL', 'INT', 'BOOLEAN', 'JSON', 'STRING'] as const;

export const rhTipoRubricaSchema = z.enum(RH_TIPOS_RUBRICA);
export const rhNaturezaRubricaSchema = z.enum(RH_NATUREZAS_RUBRICA);
export const rhFormaCalculoRubricaSchema = z.enum(RH_FORMAS_CALCULO_RUBRICA);

// ── Departamentos e cargos ───────────────────────────────────────────────────

export const criarRhDepartamentoSchema = z.object({
  codigo: z.string().trim().min(1, 'O código é obrigatório.').max(30),
  nome: z.string().trim().min(1, 'O nome é obrigatório.').max(120),
  ativo: z.boolean().optional(),
});
export const atualizarRhDepartamentoSchema = criarRhDepartamentoSchema.partial();

export const criarRhCargoSchema = z.object({
  codigo: z.string().trim().min(1, 'O código é obrigatório.').max(30),
  nome: z.string().trim().min(1, 'O nome é obrigatório.').max(120),
  ativo: z.boolean().optional(),
});
export const atualizarRhCargoSchema = criarRhCargoSchema.partial();

// ── Rubricas ─────────────────────────────────────────────────────────────────

export const criarRhRubricaSchema = z.object({
  codigo: z.string().trim().min(1, 'O código é obrigatório.').max(30),
  descricao: z.string().trim().min(1, 'A descrição é obrigatória.').max(160),
  tipo: rhTipoRubricaSchema,
  natureza: rhNaturezaRubricaSchema.default('FIXA'),
  formaCalculo: rhFormaCalculoRubricaSchema.default('VALOR_FIXO'),
  valorPadrao: rhNumeroOpcionalSchema.optional(),
  percentagem: rhNumeroOpcionalSchema.optional(),
  incideIRT: z.boolean().default(true),
  incideINSS: z.boolean().default(true),
  limiteIsencaoIRT: rhNumeroOpcionalSchema.optional(),
  limiteIsencaoINSS: rhNumeroOpcionalSchema.optional(),
  ordemRecibo: z.coerce.number().int().min(0).max(999).default(100),
  contaDebitoId: rhIdOpcionalSchema,
  contaCreditoId: rhIdOpcionalSchema,
  ativo: z.boolean().optional(),
});
export const atualizarRhRubricaSchema = criarRhRubricaSchema.partial();

// ── Tipos de ausência ────────────────────────────────────────────────────────

export const criarRhTipoAusenciaSchema = z.object({
  codigo: z.string().trim().min(1, 'O código é obrigatório.').max(30),
  descricao: z.string().trim().min(1, 'A descrição é obrigatória.').max(120),
  justificada: z.boolean().default(true),
  descontaSalario: z.boolean().default(false),
  descontaSubsidioAlimentacao: z.boolean().default(false),
  ativo: z.boolean().optional(),
});
export const atualizarRhTipoAusenciaSchema = criarRhTipoAusenciaSchema.partial();

// ── Ausências ────────────────────────────────────────────────────────────────

const baseCriarRhAusenciaSchema = z.object({
  funcionarioId: rhRefId('Funcionário inválido.'),
  tipoId: rhRefId('Tipo de ausência inválido.'),
  dataInicio: rhDataSchema,
  dataFim: rhDataSchema,
  dias: rhNumeroNaoNegativoSchema,
  horas: rhNumeroOpcionalSchema.nullish(),
  justificativoPath: z.string().max(500).nullish(),
  observacao: z.string().max(500).nullish(),
  estado: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO']).default('PENDENTE'),
});

export const criarRhAusenciaSchema = baseCriarRhAusenciaSchema.refine((d) => !d.dataFim || new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

export const atualizarRhAusenciaSchema = baseCriarRhAusenciaSchema.partial().extend({
  id: rhRefId(),
});

export const rhAusenciasListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  tipoId: rhRefId().optional(),
  estado: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO']).optional(),
  dataInicio: rhDataOpcionalSchema,
  dataFim: rhDataOpcionalSchema,
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhAusenciaAprovarSchema = z.object({
  id: rhRefId(),
  aprovadoPorId: rhRefId(),
  estado: z.enum(['APROVADO', 'REJEITADO']),
});

// ── Horas Extra ──────────────────────────────────────────────────────────────

export const criarRhHoraExtraSchema = z.object({
  funcionarioId: rhRefId('Funcionário inválido.'),
  data: rhDataSchema,
  horas: rhNumeroNaoNegativoSchema,
  tipo: z.enum(['DIURNA_UTIL', 'NOTURNA', 'DESCANSO_FERIADO']),
  percentagem: rhNumeroNaoNegativoSchema,
  estado: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO']).default('PENDENTE'),
});

export const atualizarRhHoraExtraSchema = criarRhHoraExtraSchema.partial().extend({
  id: rhRefId(),
});

export const rhHorasExtraListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  tipo: z.enum(['DIURNA_UTIL', 'NOTURNA', 'DESCANSO_FERIADO']).optional(),
  estado: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO']).optional(),
  dataInicio: rhDataOpcionalSchema,
  dataFim: rhDataOpcionalSchema,
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhHoraExtraAprovarSchema = z.object({
  id: rhRefId(),
  aprovadoPorId: rhRefId(),
  estado: z.enum(['APROVADO', 'REJEITADO']),
});

// ── Férias: Saldos ───────────────────────────────────────────────────────────

export const rhFeriasSaldosListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhFeriasSaldoAtualizarSchema = z.object({
  id: rhRefId(),
  diasDireito: z.coerce.number().min(0).optional(),
  diasTransitados: z.coerce.number().min(0).optional(),
  diasMarcados: z.coerce.number().min(0).optional(),
  diasGozados: z.coerce.number().min(0).optional(),
  subsidioFeriasProcessado: z.boolean().optional(),
});

// ── Férias: Marcações ────────────────────────────────────────────────────────

const baseCriarRhMarcacaoFeriasSchema = z.object({
  funcionarioId: rhRefId('Funcionário inválido.'),
  ano: z.coerce.number().int().min(2000).max(2100),
  dataInicio: rhDataSchema,
  dataFim: rhDataSchema,
  dias: rhNumeroNaoNegativoSchema,
  estado: z.enum(['PLANEADA', 'APROVADA', 'GOZADA', 'CANCELADA']).default('PLANEADA'),
  observacao: z.string().max(500).nullish(),
});

export const criarRhMarcacaoFeriasSchema = baseCriarRhMarcacaoFeriasSchema.refine((d) => !d.dataFim || new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

export const atualizarRhMarcacaoFeriasSchema = baseCriarRhMarcacaoFeriasSchema.partial().extend({
  id: rhRefId(),
  aprovadoPorId: rhRefId().nullish(),
  subsidioProcessamentoId: rhRefId().nullish(),
});

export const rhMarcacoesFeriasListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  estado: z.enum(['PLANEADA', 'APROVADA', 'GOZADA', 'CANCELADA']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhMarcacaoFeriasAprovarSchema = z.object({
  id: rhRefId(),
  aprovadoPorId: rhRefId(),
  estado: z.enum(['APROVADA', 'CANCELADA']),
});

// ── Afetações (RH-605) ────────────────────────────────────────────────────────

const baseCriarRhAfetacaoSchema = z.object({
  funcionarioId: rhRefId('Funcionário inválido.'),
  centroCustoId: rhRefId().nullable(),
  percentagem: rhNumeroNaoNegativoSchema,
  dataInicio: rhDataSchema,
  dataFim: rhDataOpcionalSchema,
});

export const criarRhAfetacaoSchema = baseCriarRhAfetacaoSchema.refine((d) => !d.dataFim || new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

export const atualizarRhAfetacaoSchema = baseCriarRhAfetacaoSchema.partial().extend({
  id: rhRefId(),
});

export const rhAfetacoesListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  centroCustoId: rhRefId().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

// ── Processos de Dívida/Penhora (RH-606) ────────────────────────────────────────

export const criarRhProcessoDividaSchema = z.object({
  funcionarioId: rhRefId('Funcionário inválido.'),
  tipo: z.enum(['ADIANTAMENTO', 'EMPRESTIMO', 'PENHORA', 'OUTRO']),
  descricao: z.string().max(500).nullish(),
  credor: z.string().max(240).nullish(),
  numeroProcesso: z.string().max(120).nullish(),
  valorTotal: z.coerce.number().positive('Valor total deve ser positivo.'),
  numeroPrestacoes: z.coerce.number().int().min(1, 'Número de prestações deve ser pelo menos 1.'),
  valorPrestacao: z.coerce.number().positive('Valor da prestação deve ser positivo.'),
  moeda: z.string().max(10).default('AOA'),
  dataInicio: rhDataSchema,
  respeitaLimitePenhora: z.boolean().default(false),
});

export const atualizarRhProcessoDividaSchema = criarRhProcessoDividaSchema.partial().extend({
  id: rhRefId(),
  estado: z.enum(['ATIVA', 'SUSPENSA', 'LIQUIDADA', 'CANCELADA']).optional(),
  respeitaLimitePenhora: z.boolean().optional(),
});

export const rhProcessosDividaListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  tipo: z.enum(['ADIANTAMENTO', 'EMPRESTIMO', 'PENHORA', 'OUTRO']).optional(),
  estado: z.enum(['ATIVA', 'SUSPENSA', 'LIQUIDADA', 'CANCELADA']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhProcessoDividaGerarPlanoSchema = z.object({
  id: rhRefId(),
});

export const rhProcessoDividaSuspenderSchema = z.object({
  id: rhRefId(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

export const rhProcessoDividaLiquidarSchema = z.object({
  id: rhRefId(),
});

// ── Prestações de Dívida (RH-606) ──────────────────────────────────────────────

export const rhPrestacoesDividaListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  processoId: rhRefId().optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  estado: z.enum(['PENDENTE', 'DESCONTADA', 'ANULADA', 'PERDOADA']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhPrestacaoDividaAtualizarSchema = z.object({
  id: rhRefId(),
  valorDescontado: z.coerce.number().min(0).optional(),
  estado: z.enum(['PENDENTE', 'DESCONTADA', 'ANULADA', 'PERDOADA']).optional(),
  processamentoItemId: rhRefId().nullish(),
});

export const rhPrestacaoDividaDescontarSchema = z.object({
  id: rhRefId(),
  valorDescontado: z.coerce.number().positive('Valor descontado deve ser positivo.'),
  processamentoItemId: rhRefId(),
});

export const rhPrestacaoDividaAnularSchema = z.object({
  id: rhRefId(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

export const rhPrestacaoDividaPerdoarSchema = z.object({
  id: rhRefId(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

// ── Retroactivos (RH-608) ───────────────────────────────────────────────────────

export const criarRhRetroativoSchema = z.object({
  funcionarioId: rhRefId('Funcionário inválido.'),
  rubricaId: rhRefId('Rubrica inválida.'),
  anoOrigem: z.coerce.number().int().min(2000).max(2100),
  mesOrigem: z.coerce.number().int().min(1).max(12),
  anoAplicacao: z.coerce.number().int().min(2000).max(2100),
  mesAplicacao: z.coerce.number().int().min(1).max(12),
  valor: z.coerce.number().positive('Valor deve ser positivo.'),
  motivo: z.string().max(500).nullish(),
  estado: z.enum(['PENDENTE', 'APLICADO', 'ANULADO']).default('PENDENTE'),
});

export const atualizarRhRetroativoSchema = criarRhRetroativoSchema.partial().extend({
  id: rhRefId(),
});

export const rhRetroativosListarInputSchema = z.object({
  funcionarioId: rhRefId().optional(),
  rubricaId: rhRefId().optional(),
  anoOrigem: z.coerce.number().int().min(2000).max(2100).optional(),
  mesOrigem: z.coerce.number().int().min(1).max(12).optional(),
  anoAplicacao: z.coerce.number().int().min(2000).max(2100).optional(),
  mesAplicacao: z.coerce.number().int().min(1).max(12).optional(),
  estado: z.enum(['PENDENTE', 'APLICADO', 'ANULADO']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhRetroativoAplicarSchema = z.object({
  id: rhRefId(),
});

export const rhRetroativoAnularSchema = z.object({
  id: rhRefId(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

// ── Independentes (RH-701) ────────────────────────────────────────────────────

export const criarRhIndependenteSchema = z.object({
  codigo: z.string().trim().min(1, 'O código é obrigatório.').max(30),
  nome: z.string().trim().min(1, 'O nome é obrigatório.').max(120),
  nif: z.string().trim().max(30).nullish(),
  email: z.string().email('Email inválido.').max(160).nullish(),
  telefone: z.string().max(30).nullish(),
  morada: z.string().max(240).nullish(),
  banco: z.string().max(120).nullish(),
  iban: z.string().max(40).nullish(),
  taxaRetencao: z.coerce.number().min(0).max(100).optional(),
  ativo: z.boolean().optional(),
});

export const atualizarRhIndependenteSchema = criarRhIndependenteSchema.partial().extend({
  id: rhRefId(),
});

export const rhIndependentesListarInputSchema = z.object({
  codigo: z.string().trim().min(1).optional(),
  nome: z.string().trim().min(1).optional(),
  ativo: z.boolean().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

// ── Atividades (RH-702) ──────────────────────────────────────────────────────

const baseCriarRhAtividadeSchema = z.object({
  independenteId: rhRefId('Independente inválido.'),
  descricao: z.string().trim().min(1, 'A descrição é obrigatória.').max(240),
  valorFixo: z.coerce.number().positive().optional(),
  valorHora: z.coerce.number().positive().optional(),
  centroCustoId: rhRefId().nullable().optional(),
  dataInicio: rhDataSchema,
  dataFim: rhDataOpcionalSchema,
  ativa: z.boolean().optional(),
});

export const criarRhAtividadeSchema = baseCriarRhAtividadeSchema.refine((d) => !d.dataFim || new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

export const atualizarRhAtividadeSchema = baseCriarRhAtividadeSchema.partial().extend({
  id: rhRefId(),
});

export const rhAtividadesListarInputSchema = z.object({
  independenteId: rhRefId().optional(),
  centroCustoId: rhRefId().optional(),
  ativa: z.boolean().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

// ── Centros de custo ─────────────────────────────────────────────────────────

export const criarRhCentroCustoSchema = z.object({
  codigo: z.string().trim().min(1, 'O código é obrigatório.').max(30),
  designacao: z.string().trim().min(1, 'A designação é obrigatória.').max(120),
  descricao: z.string().trim().max(240).nullish(),
  ativo: z.boolean().optional(),
});
export const atualizarRhCentroCustoSchema = criarRhCentroCustoSchema.partial();

// ── Parâmetros fiscais (com vigência) ────────────────────────────────────────

export const criarRhParametroSchema = z.object({
  chave: z
    .string()
    .trim()
    .min(1, 'A chave é obrigatória.')
    .max(60)
    .regex(/^[A-Z0-9_]+$/, 'A chave deve usar maiúsculas, dígitos e underscore.'),
  valor: z.string().trim().min(1, 'O valor é obrigatório.').max(500),
  tipoValor: z.enum(RH_TIPOS_VALOR_PARAMETRO).default('DECIMAL'),
  descricao: z.string().trim().max(200).nullish(),
  vigenteDesde: rhDataSchema,
  vigenteAte: rhDataOpcionalSchema,
});
export const rhListarParametrosSchema = z.object({
  chave: z.string().trim().min(1).optional(),
});

// ── Tabela de IRT (com escalões) ─────────────────────────────────────────────

export const rhEscalaoIrtSchema = z.object({
  ordem: z.coerce.number().int().min(1, 'A ordem é obrigatória.'),
  rendimentoDe: rhNumeroNaoNegativoSchema,
  rendimentoAte: rhNumeroOpcionalSchema,
  parcelaFixa: rhNumeroNaoNegativoSchema,
  taxa: z.coerce.number().min(0).max(100),
  excessoDe: rhNumeroNaoNegativoSchema,
});

export const criarRhTabelaIrtSchema = z
  .object({
    descricao: z.string().trim().min(1, 'A descrição é obrigatória.').max(120),
    vigenteDesde: rhDataSchema,
    vigenteAte: rhDataOpcionalSchema,
    ativo: z.boolean().optional(),
    escaloes: z
      .array(rhEscalaoIrtSchema)
      .min(1, 'Indique pelo menos um escalão.')
      .max(50),
  })
  .refine(
    (dados) => new Set(dados.escaloes.map((e) => e.ordem)).size === dados.escaloes.length,
    { message: 'A ordem dos escalões deve ser única.', path: ['escaloes'] }
  );

// ── Períodos ─────────────────────────────────────────────────────────────────

const rhAnoSchema = z.coerce.number().int().min(2000).max(2100);

export const gerarRhPeriodosSchema = z.object({ ano: rhAnoSchema });
export const rhListarPeriodosSchema = z.object({ ano: rhAnoSchema });

// ── Configuração ─────────────────────────────────────────────────────────────

export const atualizarRhConfiguracaoSchema = z.object({
  modoSubsidioNatalPadrao: z.enum(['PAGAMENTO_UNICO', 'DUODECIMOS']).optional(),
  mesSubsidioNatalPadrao: z.coerce.number().int().min(1).max(12).optional(),
  modoSubsidioFeriasPadrao: z.enum(['ANTES_GOZO', 'MES_FIXO', 'DUODECIMOS']).optional(),
  mesSubsidioFeriasPadrao: rhMesOpcionalSchema.optional(),
  baseDiasMes: z.coerce.number().int().min(1).max(31).optional(),
  liquidoNegativoBloqueia: z.boolean().optional(),
  serieRecibo: z.string().trim().min(1, 'A série é obrigatória.').max(10).optional(),
});

// =============================================================================
// RH-201 · Funcionários (Fase 2)
// =============================================================================

export const RH_GENEROS = ['MASCULINO', 'FEMININO', 'OUTRO'] as const;
export const RH_ESTADOS_CIVIS = [
  'SOLTEIRO',
  'CASADO',
  'DIVORCIADO',
  'VIUVO',
  'UNIAO_FACTO',
] as const;
export const RH_FORMAS_PAGAMENTO = ['TRANSFERENCIA', 'NUMERARIO', 'CHEQUE'] as const;
export const RH_MODOS_SUBSIDIO_NATAL = ['PAGAMENTO_UNICO', 'DUODECIMOS'] as const;
export const RH_MODOS_SUBSIDIO_FERIAS = ['ANTES_GOZO', 'MES_FIXO', 'DUODECIMOS'] as const;

export const rhGeneroSchema = z.enum(RH_GENEROS);
export const rhEstadoCivilSchema = z.enum(RH_ESTADOS_CIVIS);
export const rhFormaPagamentoSchema = z.enum(RH_FORMAS_PAGAMENTO);
export const rhModoSubsidioNatalSchema = z.enum(RH_MODOS_SUBSIDIO_NATAL);
export const rhModoSubsidioFeriasSchema = z.enum(RH_MODOS_SUBSIDIO_FERIAS);

/** Texto opcional: `''`/`undefined` → `null`; caso contrário, string trim. */
function rhTextoOpcional(max: number) {
  return z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(max).nullable()
  ).optional();
}

const rhEmailOpcionalSchema = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.string().trim().email('Email inválido.').max(160).nullable()
).optional();

export const criarRhFuncionarioSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome é obrigatório.').max(160),
    documentoNumero: rhTextoOpcional(60),
    nif: rhTextoOpcional(30),
    niss: rhTextoOpcional(30),
    dataNascimento: rhDataOpcionalSchema,
    genero: rhGeneroSchema.nullish(),
    estadoCivil: rhEstadoCivilSchema.nullish(),
    nacionalidade: rhTextoOpcional(60),
    morada: rhTextoOpcional(240),
    telefone: rhTextoOpcional(40),
    email: rhEmailOpcionalSchema,
    fotoPath: rhTextoOpcional(500),

    departamentoId: rhIdOpcionalSchema,
    cargoId: rhIdOpcionalSchema,
    categoria: rhTextoOpcional(60),

    dataAdmissao: rhDataSchema,
    dataCessacao: rhDataOpcionalSchema,
    estado: rhEstadoFuncionarioSchema.optional(),

    formaPagamento: rhFormaPagamentoSchema.default('TRANSFERENCIA'),
    banco: rhTextoOpcional(120),
    iban: rhTextoOpcional(40),

    modoSubsidioNatal: rhModoSubsidioNatalSchema.nullish(),
    modoSubsidioFerias: rhModoSubsidioFeriasSchema.nullish(),
    mesPagamentoSubsidioNatal: rhMesOpcionalSchema.optional(),
    mesPagamentoSubsidioFerias: rhMesOpcionalSchema.optional(),
  })
  .refine(
    (dados) => !dados.dataCessacao || dados.dataCessacao >= dados.dataAdmissao,
    {
      message: 'A data de cessação não pode ser anterior à data de admissão.',
      path: ['dataCessacao'],
    }
  );

export const atualizarRhFuncionarioSchema = criarRhFuncionarioSchema.innerType().partial();

// ── Tipos inferidos dos cadastros ────────────────────────────────────────────

export type CriarRhDepartamentoInput = z.infer<typeof criarRhDepartamentoSchema>;
export type AtualizarRhDepartamentoInput = z.infer<typeof atualizarRhDepartamentoSchema>;
export type CriarRhCargoInput = z.infer<typeof criarRhCargoSchema>;
export type AtualizarRhCargoInput = z.infer<typeof atualizarRhCargoSchema>;
export type CriarRhRubricaInput = z.infer<typeof criarRhRubricaSchema>;
export type AtualizarRhRubricaInput = z.infer<typeof atualizarRhRubricaSchema>;
export type CriarRhTipoAusenciaInput = z.infer<typeof criarRhTipoAusenciaSchema>;
export type AtualizarRhTipoAusenciaInput = z.infer<typeof atualizarRhTipoAusenciaSchema>;
export type CriarRhCentroCustoInput = z.infer<typeof criarRhCentroCustoSchema>;
export type AtualizarRhCentroCustoInput = z.infer<typeof atualizarRhCentroCustoSchema>;
export type CriarRhParametroInput = z.infer<typeof criarRhParametroSchema>;
export type CriarRhTabelaIrtInput = z.infer<typeof criarRhTabelaIrtSchema>;
export type AtualizarRhConfiguracaoInput = z.infer<typeof atualizarRhConfiguracaoSchema>;
export type RhFiltroCadastroInput = z.infer<typeof rhFiltroCadastroSchema>;
export type CriarRhFuncionarioInput = z.infer<typeof criarRhFuncionarioSchema>;
export type AtualizarRhFuncionarioInput = z.infer<typeof atualizarRhFuncionarioSchema>;
/** Dados aceites à entrada (antes da aplicação de defaults/preprocess). */
export type CriarRhFuncionarioData = z.input<typeof criarRhFuncionarioSchema>;
export type AtualizarRhFuncionarioData = z.input<typeof atualizarRhFuncionarioSchema>;

// =============================================================================
// RH-203/RH-204 · Contratos, alterações salariais e dados da ficha
// =============================================================================

export const RH_TIPOS_CONTRATO = [
  'PRAZO_INDETERMINADO',
  'PRAZO_CERTO',
  'EXPERIENCIA',
  'ESTAGIO',
  'TEMPO_PARCIAL',
  'OUTRO',
] as const;

export const RH_ESTADOS_CONTRATO = ['ATIVO', 'ENCERRADO', 'SUSPENSO'] as const;

export const RH_MOTIVOS_CESSACAO = [
  'TERMO',
  'DEMISSAO',
  'DESPEDIMENTO',
  'MUTUO_ACORDO',
  'REFORMA',
  'FALECIMENTO',
  'PERIODO_EXPERIENCIA',
  'OUTRO',
] as const;

export const rhTipoContratoSchema = z.enum(RH_TIPOS_CONTRATO);
export const rhEstadoContratoSchema = z.enum(RH_ESTADOS_CONTRATO);
export const rhMotivoCessacaoSchema = z.enum(RH_MOTIVOS_CESSACAO);

/** Salário estritamente positivo. */
export const rhSalarioSchema = z.coerce
  .number({ invalid_type_error: 'O salário deve ser numérico.' })
  .gt(0, 'O salário deve ser superior a zero.')
  .max(1_000_000_000, 'Salário acima do limite suportado.');

// ── Contratos ────────────────────────────────────────────────────────────────

export const rhContratoBaseSchema = z.object({
  tipo: rhTipoContratoSchema,
  categoria: rhTextoOpcional(60),
  salarioBase: rhSalarioSchema,
  moeda: z.string().trim().min(1, 'A moeda é obrigatória.').max(10).default('AOA'),
  cargaHorariaSemanal: z.coerce.number().int().min(1).max(80).default(44),
  dataInicio: rhDataSchema,
  dataFim: rhDataOpcionalSchema,
  observacoes: rhTextoOpcional(500),
});

export const criarRhContratoSchema = rhContratoBaseSchema.refine(
  (dados) => !dados.dataFim || dados.dataFim >= dados.dataInicio,
  { message: 'A data de fim não pode ser anterior à data de início.', path: ['dataFim'] }
);

export const atualizarRhContratoSchema = rhContratoBaseSchema.partial();

export const cessarRhContratoSchema = z.object({
  motivo: rhMotivoCessacaoSchema,
  dataCessacao: rhDataSchema,
  observacoes: rhTextoOpcional(500),
});

// ── Alterações salariais e consulta por data ─────────────────────────────────

export const criarRhAlteracaoSalarialSchema = z.object({
  contratoId: rhIdSchema,
  dataEfeito: rhDataSchema,
  salarioNovo: rhSalarioSchema,
  motivo: rhTextoOpcional(200),
});

export const rhSalarioNaDataSchema = z.object({
  funcionarioId: rhIdSchema,
  data: rhDataSchema,
});

// ── Dependentes ──────────────────────────────────────────────────────────────

export const rhDependenteBaseSchema = z.object({
  nome: z.string().trim().min(1, 'O nome é obrigatório.').max(160),
  parentesco: z.string().trim().min(1, 'O parentesco é obrigatório.').max(60),
  dataNascimento: rhDataOpcionalSchema,
});
export const criarRhDependenteSchema = rhDependenteBaseSchema;
export const atualizarRhDependenteSchema = rhDependenteBaseSchema.partial();

// ── Rubricas fixas do funcionário ────────────────────────────────────────────

export const rhFuncionarioRubricaBaseSchema = z.object({
  rubricaId: rhIdSchema,
  valor: rhNumeroOpcionalSchema.optional(),
  percentagem: rhNumeroOpcionalSchema.optional(),
  moeda: z.string().trim().min(1, 'A moeda é obrigatória.').max(10).default('AOA'),
  dataInicio: rhDataSchema,
  dataFim: rhDataOpcionalSchema,
  ativo: z.boolean().default(true),
});
export const criarRhFuncionarioRubricaSchema = rhFuncionarioRubricaBaseSchema;
export const atualizarRhFuncionarioRubricaSchema = rhFuncionarioRubricaBaseSchema.partial();

// ── Documentos do funcionário ────────────────────────────────────────────────

export const rhFuncionarioDocumentoBaseSchema = z.object({
  tipo: z.string().trim().min(1, 'O tipo é obrigatório.').max(60),
  descricao: rhTextoOpcional(240),
  caminho: z.string().trim().min(1, 'O caminho é obrigatório.').max(1000),
});
export const criarRhFuncionarioDocumentoSchema = rhFuncionarioDocumentoBaseSchema;
export const atualizarRhFuncionarioDocumentoSchema = rhFuncionarioDocumentoBaseSchema.partial();

// ── Tipos inferidos (Fase 2 — contratos e ficha) ─────────────────────────────

export type CriarRhContratoInput = z.infer<typeof criarRhContratoSchema>;
export type AtualizarRhContratoInput = z.infer<typeof atualizarRhContratoSchema>;
export type CessarRhContratoInput = z.infer<typeof cessarRhContratoSchema>;
export type CriarRhAlteracaoSalarialInput = z.infer<typeof criarRhAlteracaoSalarialSchema>;
export type RhSalarioNaDataInput = z.infer<typeof rhSalarioNaDataSchema>;
export type CriarRhDependenteInput = z.infer<typeof criarRhDependenteSchema>;
export type AtualizarRhDependenteInput = z.infer<typeof atualizarRhDependenteSchema>;
export type CriarRhFuncionarioRubricaInput = z.infer<typeof criarRhFuncionarioRubricaSchema>;
export type AtualizarRhFuncionarioRubricaInput = z.infer<
  typeof atualizarRhFuncionarioRubricaSchema
>;
export type CriarRhFuncionarioDocumentoInput = z.infer<
  typeof criarRhFuncionarioDocumentoSchema
>;
export type AtualizarRhFuncionarioDocumentoInput = z.infer<
  typeof atualizarRhFuncionarioDocumentoSchema
>;

/** Dados aceites à entrada (antes da aplicação de defaults/preprocess). */
export type CriarRhContratoData = z.input<typeof criarRhContratoSchema>;
export type AtualizarRhContratoData = z.input<typeof atualizarRhContratoSchema>;
export type CessarRhContratoData = z.input<typeof cessarRhContratoSchema>;
export type CriarRhAlteracaoSalarialData = z.input<typeof criarRhAlteracaoSalarialSchema>;
export type CriarRhDependenteData = z.input<typeof criarRhDependenteSchema>;
export type AtualizarRhDependenteData = z.input<typeof atualizarRhDependenteSchema>;
export type CriarRhFuncionarioRubricaData = z.input<typeof criarRhFuncionarioRubricaSchema>;
export type AtualizarRhFuncionarioRubricaData = z.input<
  typeof atualizarRhFuncionarioRubricaSchema
>;
export type CriarRhFuncionarioDocumentoData = z.input<typeof criarRhFuncionarioDocumentoSchema>;
export type AtualizarRhFuncionarioDocumentoData = z.input<
  typeof atualizarRhFuncionarioDocumentoSchema
>;

// =============================================================================
// RH-208 · Importação CSV de funcionários/contratos (Fase 2)
// =============================================================================

export const RH_ESTADOS_ALTERACAO = ['PENDENTE', 'APLICADA', 'ANULADA'] as const;
export const rhEstadoAlteracaoSchema = z.enum(RH_ESTADOS_ALTERACAO);

export const criarRhAlteracaoMensalSchema = z.object({
  funcionarioId: rhIdSchema,
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  rubricaId: rhIdSchema,
  quantidade: rhNumeroOpcionalSchema,
  valor: z.coerce.number({ invalid_type_error: 'O valor deve ser numérico.' }),
  moeda: z.string().trim().min(1, 'A moeda é obrigatória.').max(10).default('AOA'),
  extraordinaria: z.boolean().optional(),
  observacao: rhTextoOpcional(240),
});

export const atualizarRhAlteracaoMensalSchema = z.object({
  funcionarioId: rhIdSchema.optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  rubricaId: rhIdSchema.optional(),
  quantidade: rhNumeroOpcionalSchema,
  valor: z.coerce.number({ invalid_type_error: 'O valor deve ser numérico.' }).optional(),
  moeda: z.string().trim().min(1, 'A moeda é obrigatória.').max(10).optional(),
  extraordinaria: z.boolean().optional(),
  observacao: rhTextoOpcional(240),
});

export const copiarAlteracoesMesAnteriorSchema = z.object({
  funcionarioId: rhIdSchema,
  anoOrigem: z.coerce.number().int().min(2000).max(2100),
  mesOrigem: z.coerce.number().int().min(1).max(12),
  anoDestino: z.coerce.number().int().min(2000).max(2100),
  mesDestino: z.coerce.number().int().min(1).max(12),
});

// ── RH-404 · Service preparar/simular ────────────────────────────────────────

export const rhProcessarSalariosInputSchema = z.object({
  operacao: z.enum(['SIMULAR', 'PREPARAR', 'PROCESSAR', 'ANULAR']),
  modo: z.enum(['INDIVIDUAL', 'LOTE']),
  tipos: z.array(z.enum(['VENCIMENTO', 'SUBSIDIO_FERIAS', 'SUBSIDIO_NATAL', 'EXTRAORDINARIO', 'FIM_CONTRATO'])).min(1),
  incluirFimContrato: z.boolean().default(false),
  ano: z.coerce.number().int().min(2000).max(2100),
  periodoCodigo: z.string().trim().regex(/^P(0[1-9]|1[0-2])$/),
  mes: z.coerce.number().int().min(1).max(12),
  diasProcessados: z.coerce.number().int().min(0).max(31).optional(),
  dataProcessamento: rhDataSchema,
  dataLimiteFaltasHE: rhDataSchema,
  funcionarioIds: z.array(rhIdSchema).optional(),
  tipoProcessamento: rhTipoProcessamentoSchema.optional(),
  ajustesManuais: z.array(ajusteManualSchema).optional(),
});

export const rhSimularSalariosInputSchema = rhProcessarSalariosInputSchema.omit({ operacao: true });
export const rhPrepararSalariosInputSchema = rhProcessarSalariosInputSchema.omit({ operacao: true });

// ── RH-405 · Execução de processamento individual ────────────────────────────

export const rhProcessarIndividualInputSchema = z.object({
  empresaId: z.string().trim().min(1).optional(),
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  periodoCodigo: z.string().trim().regex(/^P(0[1-9]|1[0-2])$/, 'Período inválido (P01..P12).'),
  tipoProcessamento: rhTipoProcessamentoSchema,
  incluirFimContrato: z.boolean().default(false),
  diasProcessados: z.coerce.number().int().min(0).max(31).optional(),
  dataLimiteFaltasHE: rhDataSchema,
  dataProcessamento: rhDataSchema,
  funcionarioId: rhIdSchema,
  forcarReprocessamento: z.boolean().default(false),
  formaPagamento: rhFormaPagamentoSchema.optional(),
  contaBancariaId: z.string().trim().min(1).optional(),
  referenciaPagamento: z.string().trim().max(60).optional(),
  /** Ajustes manuais (RF-PRO-03) aplicados antes de confirmar o processamento. */
  ajustesManuais: z.array(ajusteManualSchema).optional(),
});

export type RhProcessarIndividualInput = z.infer<typeof rhProcessarIndividualInputSchema>;

// ── RH-406 · Execução de processamento em lote ───────────────────────────────

export const rhProcessarLoteInputSchema = z
  .object({
    empresaId: z.string().trim().min(1).optional(),
    ano: z.coerce.number().int().min(2000).max(2100),
    mes: z.coerce.number().int().min(1).max(12),
    periodoCodigo: z.string().trim().regex(/^P(0[1-9]|1[0-2])$/, 'Período inválido (P01..P12).'),
    tipoProcessamento: rhTipoProcessamentoSchema,
    incluirFimContrato: z.boolean().default(false),
    funcionarioIds: z.array(rhIdSchema).min(1, 'Selecione pelo menos um funcionário.'),
    dataLimiteFaltasHE: rhDataSchema,
    dataProcessamento: rhDataSchema,
    forcarReprocessamento: z.boolean().default(false),
    formaPagamento: rhFormaPagamentoSchema.optional(),
    contaBancariaId: z.string().trim().min(1).optional(),
    referenciaPagamento: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.tipoProcessamento !== 'FIM_CONTRATO', {
    message: 'Fim de contrato só pode ser processado individualmente.',
    path: ['tipoProcessamento'],
  });

export type RhProcessarLoteInput = z.infer<typeof rhProcessarLoteInputSchema>;

// ── RH-407 · Anulação de processamentos ───────────────────────────────────────

export const rhAnularProcessamentosInputSchema = z.object({
  empresaId: z.string().trim().min(1).optional(),
  processamentoIds: z.array(rhIdSchema).min(1, 'Selecione pelo menos um processamento.'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Indique o motivo da anulação (mínimo 3 caracteres).')
    .max(500, 'O motivo não pode exceder 500 caracteres.'),
});

export type RhAnularProcessamentosInput = z.infer<typeof rhAnularProcessamentosInputSchema>;

// ── RH-412 · Listagem de processamentos (para anulação) ───────────────────────

export const RH_ESTADOS_PROCESSAMENTO = ['PROCESSADO', 'ANULADO'] as const;
export const rhEstadoProcessamentoSchema = z.enum(RH_ESTADOS_PROCESSAMENTO);

export const rhProcessamentoListarInputSchema = z.object({
  empresaId: z.string().trim().min(1).optional(),
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  periodoCodigo: z.string().trim().regex(/^P(0[1-9]|1[0-2])$/, 'Período inválido (P01..P12).'),
  estado: rhEstadoProcessamentoSchema.optional(),
  funcionarioIds: z.array(rhIdSchema).optional(),
});

export type RhProcessamentoListarInput = z.infer<typeof rhProcessamentoListarInputSchema>;

// ── RH-414 · Histórico e visão detalhada de processamentos ────────────────────

export const rhProcessamentoHistoricoInputSchema = rhPaginacaoSchema.extend({
  empresaId: z.string().trim().min(1).optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  periodoCodigo: rhPeriodoCodigoSchema.optional(),
  tipo: rhTipoProcessamentoSchema.optional(),
  estado: rhEstadoProcessamentoSchema.optional(),
  funcionarioId: rhIdSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export type RhProcessamentoHistoricoInput = z.infer<typeof rhProcessamentoHistoricoInputSchema>;

export const rhProcessamentoDetalheInputSchema = z.object({
  empresaId: z.string().trim().min(1).optional(),
  id: rhIdSchema,
});

export type RhProcessamentoDetalheInput = z.infer<typeof rhProcessamentoDetalheInputSchema>;

// ── RH-403 · Loader de processamento ──────────────────────────────────────────

export const RH_TIPOS_PROCESSAMENTO_LOADER = [
  'VENCIMENTO',
  'SUBSIDIO_FERIAS',
  'SUBSIDIO_NATAL',
  'EXTRAORDINARIO',
  'FIM_CONTRATO',
] as const;
export const rhTipoProcessamentoLoaderSchema = z.enum(RH_TIPOS_PROCESSAMENTO_LOADER);

export const rhProcessamentoLoaderInputSchema = z.object({
  empresaId: z.string().trim().min(1).optional(),
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  periodoCodigo: z.string().trim().regex(/^P(0[1-9]|1[0-2])$/, 'Período inválido (P01..P12).'),
  funcionarioIds: z.array(rhIdSchema).optional(),
  incluirFimContrato: z.boolean().default(false),
  dataLimiteFaltasHE: rhDataSchema,
  dataProcessamento: rhDataSchema,
  tipoProcessamento: rhTipoProcessamentoLoaderSchema.optional(),
});

export const RH_TIPOS_IMPORTACAO = ['FUNCIONARIOS', 'CONTRATOS'] as const;
export const rhTipoImportacaoSchema = z.enum(RH_TIPOS_IMPORTACAO, {
  errorMap: () => ({ message: 'Tipo de importação inválido.' }),
});

/** Tamanho máximo do ficheiro CSV (5 MB) e número máximo de linhas de dados. */
export const maxConteudoImportacao = 5_000_000;
export const maxLinhasImportacao = 2_000;

export const rhImportacaoConteudoSchema = z.object({
  tipo: rhTipoImportacaoSchema,
  nome: z.string().trim().max(260).optional(),
  conteudo: z
    .string()
    .min(1, 'O ficheiro está vazio.')
    .max(maxConteudoImportacao, 'O ficheiro excede o tamanho máximo permitido (5 MB).'),
});

export const rhImportacaoPrevisualizarSchema = rhImportacaoConteudoSchema;

export const rhImportacaoImportarSchema = rhImportacaoConteudoSchema.extend({
  /** Quando `true`, as linhas inválidas são ignoradas e só as válidas importadas. */
  ignorarInvalidas: z.boolean().default(false),
});

// ── Recibos (RH-502/503) ───────────────────────────────────────────────────────

/** Filtros para listagem de recibos. */
export const rhRecibosListarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  funcionarioId: rhIdOpcionalSchema,
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  periodoCodigo: z.string().regex(/^P(0[1-9]|1[0-2])$/).optional(),
  tipo: z.enum(['VENCIMENTO', 'SUBSIDIO_FERIAS', 'SUBSIDIO_NATAL', 'EXTRAORDINARIO', 'FIM_CONTRATO']).optional(),
  estado: z.enum(['EMITIDO', 'ANULADO']).optional(),
  search: z.string().trim().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

/** Input para geração de PDF (individual ou lote). */
export const rhRecibosGerarPdfInputSchema = z.object({
  reciboIds: z.array(rhIdSchema).min(1, 'Indique pelo menos um recibo.'),
});

/** Input para ID de recibo. */
export const rhReciboIdInputSchema = z.object({
  id: rhIdSchema,
});

// ── Pagamentos (RH-504) ─────────────────────────────────────────────────────────

/** Filtros para listagem de ordens de pagamento. */
export const rhOrdensPagamentoListarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  estado: z.enum(['ABERTA', 'ENVIADA', 'CONCLUIDA', 'CANCELADA']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

/** Input para criar ordem de pagamento. */
export const rhOrdemPagamentoCriarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  periodoId: rhIdOpcionalSchema,
  banco: z.string().trim().optional(),
  formaPagamento: z.enum(['TRANSFERENCIA', 'NUMERARIO', 'CHEQUE']),
  pagamentoIds: z.array(rhIdSchema).min(1, 'Indique pelo menos um pagamento.'),
});

/** Input para ID de ordem. */
export const rhOrdemPagamentoIdInputSchema = z.object({
  id: rhIdSchema,
});

/** Input para gerar ficheiro de transferência. */
export const rhOrdemPagamentoGerarFicheiroInputSchema = z.object({
  id: rhIdSchema,
});

/** Filtros para listagem de pagamentos. */
export const rhPagamentosListarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  funcionarioId: rhIdOpcionalSchema,
  estado: z.enum(['PENDENTE', 'PARCIAL', 'PAGO', 'ESTORNADO', 'CANCELADO']).optional(),
  formaPagamento: z.enum(['TRANSFERENCIA', 'NUMERARIO', 'CHEQUE']).optional(),
  ordemId: rhIdOpcionalSchema,
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

/** Input para confirmar pagamento. */
export const rhPagamentoConfirmarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  pagamentoId: rhIdSchema,
  valorPago: z.coerce.number().positive('Valor deve ser positivo.'),
  dataPagamento: z.preprocess(
    (arg) => {
      if (arg instanceof Date) return arg;
      if (typeof arg === 'string' && arg.trim() !== '') return new Date(arg);
      return undefined;
    },
    z.date({ invalid_type_error: 'Data inválida.' })
  ),
  referencia: z.string().trim().optional(),
  contaBancariaId: rhIdOpcionalSchema,
});

export const rhPagamentoEstornarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  pagamentoId: rhIdSchema,
  motivo: z.string().trim().min(3, 'Motivo deve ter pelo menos 3 caracteres.'),
});

// ── Processamento de Honorários (RH-703) ───────────────────────────────────────

export const criarRhProcessamentoHonorarioSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  atividadesIds: z.array(rhIdSchema).min(1, 'Selecione pelo menos uma atividade.'),
  dataProcessamento: rhDataSchema,
});

export const atualizarRhProcessamentoHonorarioSchema = z.object({
  id: rhRefId(),
  valorBruto: z.coerce.number().positive().optional(),
  taxaRetencao: z.coerce.number().min(0).max(100).optional(),
  estado: z.enum(['PROCESSADO', 'ANULADO']).optional(),
});

export const rhProcessamentosHonorarioListarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  atividadeId: rhIdOpcionalSchema,
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  estado: z.enum(['PROCESSADO', 'ANULADO']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhProcessamentoHonorarioGerarInput = z.object({
  id: rhRefId(),
});

export const rhProcessamentoHonorarioAnularSchema = z.object({
  id: rhRefId(),
  motivo: z.string().trim().min(3, 'Motivo é obrigatório.').max(500),
});

// ── Pagamentos de Honorários (RH-704) ──────────────────────────────────────────

export const rhPagamentosHonorarioListarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  processamentoId: rhIdOpcionalSchema,
  estado: z.enum(['PENDENTE', 'PAGO', 'ANULADO']).optional(),
  formaPagamento: z.enum(['TRANSFERENCIA', 'NUMERARIO', 'CHEQUE']).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

export const rhPagamentoHonorarioConfirmarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  pagamentoId: rhIdSchema,
  valorPago: z.coerce.number().positive('Valor deve ser positivo.'),
  dataPagamento: z.preprocess(
    (arg) => {
      if (arg instanceof Date) return arg;
      if (typeof arg === 'string' && arg.trim() !== '') return new Date(arg);
      return undefined;
    },
    z.date({ invalid_type_error: 'Data inválida.' })
  ),
  referencia: z.string().trim().optional(),
});

export const rhPagamentoHonorarioEstornarInputSchema = z.object({
  empresaId: rhIdOpcionalSchema,
  pagamentoId: rhIdSchema,
  motivo: z.string().trim().min(3, 'Motivo é obrigatório.').max(500),
});

// ── Auditoria (RH-802) ──────────────────────────────────────────────────────────

/** Ações de auditoria aceites. */
const RH_ACOES_AUDITORIA = [
  'criar',
  'actualizar',
  'eliminar',
  'exportar',
  'validar',
  'imprimir',
  'login',
  'logout',
  'anular',
  'submeter',
] as const;

const rhAcaoAuditoriaSchema = z.enum(RH_ACOES_AUDITORIA);

/** Severidades de auditoria. */
const rhSeveridadeAuditoriaSchema = z.enum(['info', 'aviso', 'critico']);

/** Filtro genérico de auditoria (paginação por cursor). */
export const rhAuditoriaListarInputSchema = z.object({
  entidade: z.string().trim().min(1).optional(),
  entidadeId: z.string().trim().min(1).optional(),
  utilizadorId: z.string().trim().min(1).optional(),
  acao: rhAcaoAuditoriaSchema.optional(),
  severidade: rhSeveridadeAuditoriaSchema.optional(),
  desde: rhDataOpcionalSchema,
  ate: rhDataOpcionalSchema,
  limite: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
  incluirArquivados: z.boolean().default(false),
});

/** Filtro de auditoria por funcionário (todas as entidades ligadas). */
export const rhAuditoriaPorFuncionarioInputSchema = z.object({
  funcionarioId: z.string().trim().min(1),
  acao: rhAcaoAuditoriaSchema.optional(),
  severidade: rhSeveridadeAuditoriaSchema.optional(),
  desde: rhDataOpcionalSchema,
  ate: rhDataOpcionalSchema,
  limite: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
  incluirArquivados: z.boolean().default(false),
});

/** Filtro de auditoria por processamento (processamento + itens + recibo + pagamento). */
export const rhAuditoriaPorProcessamentoInputSchema = z.object({
  processamentoId: z.string().trim().min(1),
  acao: rhAcaoAuditoriaSchema.optional(),
  severidade: rhSeveridadeAuditoriaSchema.optional(),
  desde: rhDataOpcionalSchema,
  ate: rhDataOpcionalSchema,
  limite: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
  incluirArquivados: z.boolean().default(false),
});

// ── Tipos inferidos (RH-208) ─────────────────────────────────────────────────

export type RhTipoImportacaoInput = z.infer<typeof rhTipoImportacaoSchema>;
export type RhImportacaoConteudoInput = z.infer<typeof rhImportacaoConteudoSchema>;
export type RhImportacaoPrevisualizarInput = z.infer<typeof rhImportacaoPrevisualizarSchema>;
export type RhImportacaoImportarInput = z.infer<typeof rhImportacaoImportarSchema>;

export type CriarRhAlteracaoMensalInput = z.infer<typeof criarRhAlteracaoMensalSchema>;
export type AtualizarRhAlteracaoMensalInput = z.infer<typeof atualizarRhAlteracaoMensalSchema>;
export type RhProcessamentoLoaderInput = z.infer<typeof rhProcessamentoLoaderInputSchema>;
export type RhTipoProcessamentoLoaderInput = z.infer<typeof rhTipoProcessamentoLoaderSchema>;
export type CopiarAlteracoesMesAnteriorInput = z.infer<typeof copiarAlteracoesMesAnteriorSchema>;
export type CriarRhAlteracaoMensalData = z.input<typeof criarRhAlteracaoMensalSchema>;
export type AtualizarRhAlteracaoMensalData = z.input<typeof atualizarRhAlteracaoMensalSchema>;

export type RhProcessarSalariosInput = z.infer<typeof rhProcessarSalariosInputSchema>;
export type RhSimularSalariosInput = z.infer<typeof rhSimularSalariosInputSchema>;
export type RhPrepararSalariosInput = z.infer<typeof rhPrepararSalariosInputSchema>;
export type RhRecibosListarInput = z.infer<typeof rhRecibosListarInputSchema>;
export type RhRecibosGerarPdfInput = z.infer<typeof rhRecibosGerarPdfInputSchema>;
export type RhReciboIdInput = z.infer<typeof rhReciboIdInputSchema>;

// Pagamentos (RH-504)
export type RhOrdensPagamentoListarInput = z.infer<typeof rhOrdensPagamentoListarInputSchema>;
export type RhOrdemPagamentoCriarInput = z.infer<typeof rhOrdemPagamentoCriarInputSchema>;
export type RhOrdemPagamentoIdInput = z.infer<typeof rhOrdemPagamentoIdInputSchema>;
export type RhOrdemPagamentoGerarFicheiroInput = z.infer<typeof rhOrdemPagamentoGerarFicheiroInputSchema>;
export type RhPagamentosListarInput = z.infer<typeof rhPagamentosListarInputSchema>;
export type RhPagamentoConfirmarInput = z.infer<typeof rhPagamentoConfirmarInputSchema>;
export type RhPagamentoEstornarInput = z.infer<typeof rhPagamentoEstornarInputSchema>;

// Ausências (RH-601)
export type CriarRhAusenciaInput = z.infer<typeof criarRhAusenciaSchema>;
export type AtualizarRhAusenciaInput = z.infer<typeof atualizarRhAusenciaSchema>;
export type RhAusenciasListarInput = z.infer<typeof rhAusenciasListarInputSchema>;
export type RhAusenciaAprovarInput = z.infer<typeof rhAusenciaAprovarSchema>;

// Horas Extra (RH-602)
export type CriarRhHoraExtraInput = z.infer<typeof criarRhHoraExtraSchema>;
export type AtualizarRhHoraExtraInput = z.infer<typeof atualizarRhHoraExtraSchema>;
export type RhHorasExtraListarInput = z.infer<typeof rhHorasExtraListarInputSchema>;
export type RhHoraExtraAprovarInput = z.infer<typeof rhHoraExtraAprovarSchema>;

// Férias: Saldos (RH-603)
export type RhFeriasSaldosListarInput = z.infer<typeof rhFeriasSaldosListarInputSchema>;
export type RhFeriasSaldoAtualizarInput = z.infer<typeof rhFeriasSaldoAtualizarSchema>;

// Férias: Marcações (RH-603)
export type CriarRhMarcacaoFeriasInput = z.infer<typeof criarRhMarcacaoFeriasSchema>;
export type AtualizarRhMarcacaoFeriasInput = z.infer<typeof atualizarRhMarcacaoFeriasSchema>;
export type RhMarcacoesFeriasListarInput = z.infer<typeof rhMarcacoesFeriasListarInputSchema>;
export type RhMarcacaoFeriasAprovarInput = z.infer<typeof rhMarcacaoFeriasAprovarSchema>;

// Afetações (RH-605)
export type CriarRhAfetacaoInput = z.infer<typeof criarRhAfetacaoSchema>;
export type AtualizarRhAfetacaoInput = z.infer<typeof atualizarRhAfetacaoSchema>;
export type RhAfetacoesListarInput = z.infer<typeof rhAfetacoesListarInputSchema>;

// Processos de Dívida (RH-606)
export type CriarRhProcessoDividaInput = z.infer<typeof criarRhProcessoDividaSchema>;
export type AtualizarRhProcessoDividaInput = z.infer<typeof atualizarRhProcessoDividaSchema>;
export type RhProcessosDividaListarInput = z.infer<typeof rhProcessosDividaListarInputSchema>;
export type RhProcessoDividaGerarPlanoInput = z.infer<typeof rhProcessoDividaGerarPlanoSchema>;
export type RhProcessoDividaSuspenderInput = z.infer<typeof rhProcessoDividaSuspenderSchema>;
export type RhProcessoDividaLiquidarInput = z.infer<typeof rhProcessoDividaLiquidarSchema>;

// Prestações de Dívida (RH-606)
export type RhPrestacoesDividaListarInput = z.infer<typeof rhPrestacoesDividaListarInputSchema>;
export type RhPrestacaoDividaAtualizarInput = z.infer<typeof rhPrestacaoDividaAtualizarSchema>;
export type RhPrestacaoDividaDescontarInput = z.infer<typeof rhPrestacaoDividaDescontarSchema>;
export type RhPrestacaoDividaAnularInput = z.infer<typeof rhPrestacaoDividaAnularSchema>;
export type RhPrestacaoDividaPerdoarInput = z.infer<typeof rhPrestacaoDividaPerdoarSchema>;

// Retroactivos (RH-608)
export type CriarRhRetroativoInput = z.infer<typeof criarRhRetroativoSchema>;
export type AtualizarRhRetroativoInput = z.infer<typeof atualizarRhRetroativoSchema>;
export type RhRetroativosListarInput = z.infer<typeof rhRetroativosListarInputSchema>;
export type RhRetroativoAplicarInput = z.infer<typeof rhRetroativoAplicarSchema>;
export type RhRetroativoAnularInput = z.infer<typeof rhRetroativoAnularSchema>;

// Independentes (RH-701)
export type CriarRhIndependenteInput = z.infer<typeof criarRhIndependenteSchema>;
export type AtualizarRhIndependenteInput = z.infer<typeof atualizarRhIndependenteSchema>;
export type RhIndependentesListarInput = z.infer<typeof rhIndependentesListarInputSchema>;

// Atividades (RH-702)
export type CriarRhAtividadeInput = z.infer<typeof criarRhAtividadeSchema>;
export type AtualizarRhAtividadeInput = z.infer<typeof atualizarRhAtividadeSchema>;
export type RhAtividadesListarInput = z.infer<typeof rhAtividadesListarInputSchema>;

// Processamento de Honorários (RH-703)
export type CriarRhProcessamentoHonorarioInput = z.infer<typeof criarRhProcessamentoHonorarioSchema>;
export type AtualizarRhProcessamentoHonorarioInput = z.infer<typeof atualizarRhProcessamentoHonorarioSchema>;
export type RhProcessamentosHonorarioListarInput = z.infer<typeof rhProcessamentosHonorarioListarInputSchema>;
export type RhProcessamentoHonorarioGerarInput = z.infer<typeof rhProcessamentoHonorarioGerarInput>;
export type RhProcessamentoHonorarioAnularInput = z.infer<typeof rhProcessamentoHonorarioAnularSchema>;

// Pagamentos de Honorários (RH-704)
export type RhPagamentosHonorarioListarInput = z.infer<typeof rhPagamentosHonorarioListarInputSchema>;
export type RhPagamentoHonorarioConfirmarInput = z.infer<typeof rhPagamentoHonorarioConfirmarInputSchema>;
export type RhPagamentoHonorarioEstornarInput = z.infer<typeof rhPagamentoHonorarioEstornarInputSchema>;

// Auditoria (RH-802)
export type RhAuditoriaListarInput = z.infer<typeof rhAuditoriaListarInputSchema>;
export type RhAuditoriaPorFuncionarioInput = z.infer<typeof rhAuditoriaPorFuncionarioInputSchema>;
export type RhAuditoriaPorProcessamentoInput = z.infer<typeof rhAuditoriaPorProcessamentoInputSchema>;

export { TOLERANCIA };
