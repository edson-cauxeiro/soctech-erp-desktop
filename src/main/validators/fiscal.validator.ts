/**
 * @file fiscal.validator.ts
 * @description Validadores Zod do módulo Fiscal (SPRINT 5).
 *
 * As entradas que chegam do renderer não são fiáveis: um `ano` fora de
 * plausibilidade gera um período sem sentido e um ficheiro vazio que parece
 * válido. Por isso o período é validado aqui, não no serviço.
 *
 * Regras transversais:
 *  - O período é sempre um intervalo fechado dentro de um ano civil.
 *  - `mes` em `null`, `0` ou ausente significa o ano inteiro — é assim que a
 *    UI comunica "quero o ano", e não com uma flag extra.
 *  - O software fiscal tem de estar completo: uma assinatura gerada com
 *    chave de segurança vazia não é uma assinatura.
 */

import { z } from 'zod';
import { ValidationError } from '../utils/errors';

const ANO_MINIMO = 2000;
const ANO_MAXIMO = 2100;

/** `YYYY-MM-DD` opcional, como vem do renderer. */
const dataOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data tem de estar em AAAA-MM-DD.')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data inexistente no calendário.')
  .optional()
  .or(z.literal('').transform(() => undefined));

const idObrigatorio = (campo: string) =>
  z.string({ required_error: `${campo} é obrigatório.` }).trim().min(1, `${campo} é obrigatório.`);

// =============================================================================
// Período
// =============================================================================

/**
 * `mes` ausente, `null` ou `0` significam "o ano inteiro".
 *
 * Um valor fora de 1..12 é preservado em vez de cair para `null`: assim o
 * `refine` abaixo rejeita `13` como erro de digitação, em vez de o
 * interpretar silenciosamente como pedido do ano inteiro.
 */
const mesOpcional = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((valor) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  });

/**
 * Base do período, sem a validação de gama.
 *
 * Fica separado porque `.refine()` devolve um `ZodEffects`, que não aceita
 * `.extend()` — e `fiscalAgtSchema` precisa de acrescentar campos ao mesmo
 * período.
 */
const fiscalPeriodoBase = z.object({
  empresaId: idObrigatorio('Empresa'),
  ano: z.coerce
    .number({ invalid_type_error: 'Ano tem de ser um número.' })
    .int('Ano tem de ser um número inteiro.')
    .min(ANO_MINIMO, `Ano tem de ser no mínimo ${ANO_MINIMO}.`)
    .max(ANO_MAXIMO, `Ano tem de ser no máximo ${ANO_MAXIMO}.`),
  mes: mesOpcional,
  incluirAnulados: z.boolean().optional().default(false),
});

export const fiscalPeriodoSchema = fiscalPeriodoBase.refine(
  (d) => d.mes === null || (d.mes >= 1 && d.mes <= 12),
  { message: 'Mês tem de ser 1 a 12.', path: ['mes'] },
);

export type FiscalPeriodo = z.infer<typeof fiscalPeriodoSchema>;

// =============================================================================
// Validação de ficheiro
// =============================================================================

export const fiscalValidarSchema = z.object({
  empresaId: idObrigatorio('Empresa'),
  ano: z.coerce
    .number()
    .int()
    .min(ANO_MINIMO)
    .max(ANO_MAXIMO),
  mes: mesOpcional,
});

export type FiscalValidarParams = z.infer<typeof fiscalValidarSchema>;

// =============================================================================
// Conformidade AGT
// =============================================================================

/** Software que assina o ficheiro. Tudo obrigatório: falta um campo e a
 * assinatura sai diferente, sem qualquer aviso. */
export const softwareAgtSchema = z.object({
  nome: z.string().trim().min(1, 'Nome do software é obrigatório.').max(64),
  versao: z.string().trim().min(1, 'Versão do software é obrigatória.').max(32),
  chaveSeguranca: z
    .string()
    .trim()
    .min(1, 'A chave de segurança é obrigatória: sem ela a assinatura não é válida.')
    .max(128),
  certificado: z.string().trim().min(1, 'Número de série do certificado é obrigatório.').max(64),
});

export type SoftwareAgtInput = z.infer<typeof softwareAgtSchema>;

export const fiscalAgtSchema = fiscalPeriodoBase
  .extend({
    software: softwareAgtSchema,
    nomeFicheiro: z.string().trim().min(1).max(128).optional(),
  })
  // A mesma gama de mês: `fiscalAgtSchema` não passa por
  // `fiscalPeriodoSchema`, então a validação de gama tem de ser repetida.
  .refine((d) => d.mes === null || (d.mes >= 1 && d.mes <= 12), {
    message: 'Mês tem de ser 1 a 12.',
    path: ['mes'],
  });

export type FiscalAgtParams = z.infer<typeof fiscalAgtSchema>;

export const respostaAgtSchema = z
  .object({
    submissaoId: idObrigatorio('Submissão'),
    estado: z.enum(['rascunho', 'assinado', 'submetido', 'aceite', 'rejeitado'], {
      invalid_type_error: 'Estado de submissão inválido.',
    }),
    respostaAgt: z.string().trim().min(1, 'A resposta da AGT é obrigatória.').max(16_000),
    hashRecebido: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, 'Hash tem de ser um SHA-256 hexadecimal de 64 caracteres.'),
  })
  .refine((d) => d.estado !== 'rascunho', {
    message: 'A resposta da AGT só se regista a partir do estado "assinado".',
    path: ['estado'],
  });

export type RespostaAgtParams = z.infer<typeof respostaAgtSchema>;

// =============================================================================
// Auditoria
// =============================================================================

export const fiscalAuditoriaSchema = z.object({
  empresaId: idObrigatorio('Empresa'),
  entidade: z.string().trim().min(1).max(64).optional(),
  entidadeId: z.string().trim().max(64).optional(),
  utilizadorId: z.string().trim().max(64).optional(),
  acao: z
    .enum([
      'criar', 'actualizar', 'eliminar', 'exportar', 'validar', 'imprimir', 'login', 'logout',
      'anular', 'submeter', 'estornar', 'fechar', 'reabrir', 'pagar', 'apurar', 'conciliar', 'desconciliar',
    ])
    .optional(),
  severidade: z.enum(['info', 'aviso', 'critico']).optional(),
  modulo: z.string().trim().min(1).max(40).optional(),
  desde: dataOpcional,
  ate: dataOpcional,
  cursor: z.string().trim().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(500).optional().default(50),
  incluirArquivados: z.coerce.boolean().optional(),
});

export type FiscalAuditoriaFiltros = z.infer<typeof fiscalAuditoriaSchema>;

export const verificarIntegridadeSchema = z.object({
  empresaId: idObrigatorio('Empresa'),
  desde: dataOpcional,
  ate: dataOpcional,
  limite: z.coerce.number().int().min(1).max(5000).optional().default(1000),
});

export type VerificarIntegridadeParams = z.infer<typeof verificarIntegridadeSchema>;

export const listarSubmissoesSchema = z.object({
  empresaId: idObrigatorio('Empresa'),
  estado: z.enum(['rascunho', 'assinado', 'submetido', 'aceite', 'rejeitado']).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type ListarSubmissoesParams = z.infer<typeof listarSubmissoesSchema>;

// =============================================================================
// Helper
// =============================================================================

/**
 * Valida e devolve os dados tipados, ou lança `ValidationError` com a
 * mensagem do primeiro problema.
 *
 * Os controllers usam isto em vez de `safeParse` para não repetirem o
 * `if (!result.success)` em cada rota; a excepção é apanhada pelo `com()` do
 * controller e convertida em resposta IPC de erro.
 */
export function validar<T extends z.ZodTypeAny>(schema: T, dados: unknown): z.infer<T> {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    const primeiro = resultado.error.issues[0];
    const caminho = primeiro?.path.join('.');
    throw new ValidationError(caminho ? `${primeiro.message} (em ${caminho})` : (primeiro?.message ?? 'Dados inválidos.'));
  }
  return resultado.data;
}