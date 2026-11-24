/**
 * @file contabilidade.constants.ts
 * @description Constantes fechadas do motor de contabilização.
 *
 * Tudo aqui é declarativo: nada de `eval`, nada de expressões dinâmicas.
 * O motor usa apenas estas listas; a UI também exibe apenas estes valores
 * (via `SelectField` ou `SearchSelect`). Adicionar algo aqui requer
 * alterar o motor e os testes correspondentes.
 */

// ─── Chaves de conta (chaves simbólicas usadas nas regras) ──────────────────

/**
 * Lista fechada de chaves que uma regra pode referenciar.
 * Cada chave deve ter um `MapeamentoConta` correspondente na empresa.
 * O motor lança `ErroIntegracaoContabil` se a chave não estiver mapeada.
 */
export const CHAVES_CONTA = [
  // IVA
  'VAT_OUTPUT',        // IVA liquidado (débito nas vendas)
  'VAT_INPUT',         // IVA dedutível (crédito nas compras)
  'VAT_PAYABLE',       // IVA a pagar (liquidação)
  'VAT_RECOVERABLE',   // IVA a recuperar (reembolso)
  // Entidades
  'CUSTOMER_ACCOUNT',      // Clientes (conta corrente)
  'SUPPLIER_ACCOUNT',      // Fornecedores (conta corrente)
  // Negócio
  'SALES_ACCOUNT',         // Vendas (proveitos)
  'PURCHASE_ACCOUNT',      // Compras (custos/mercadorias)
  'BANK_ACCOUNT',          // Banco (caixa/banco)
  'CASH_ACCOUNT',          // Caixa (numerário)
  // Resultados
  'RESULT_OPERATING',      // Resultado operacional (81)
  'RESULT_FINANCIAL',      // Resultado financeiro (82)
  'RESULT_CURRENT',        // Resultado corrente (83)
  'RESULT_NON_OPERATING',  // Resultado não corrente (84)
  'RESULT_BEFORE_TAX',     // Resultado antes de impostos (85)
  'RESULT_TAX',            // Imposto sobre o resultado (86)
  'RESULT_ACTIVITIES',     // Resultado líquido das actividades (87)
  'RESULT_NET',            // Resultado líquido do exercício (88)
  'RETAINED_EARNINGS',     // Resultados transitados (reservas/lucros acumulados)
  // RH
  'PAYROLL_EXPENSE',           // Custo com pessoal
  'PAYROLL_PAYABLE',           // Salários a pagar
  'SOCIAL_SECURITY_PAYABLE',   // Segurança social a pagar
  'WITHHOLDING_PAYABLE',       // Retenções na fonte a pagar
] as const;

export type ChaveConta = typeof CHAVES_CONTA[number];

/** Verifica se uma string é uma chave de conta válida (type guard). */
export function isChaveConta(valor: string): valor is ChaveConta {
  return CHAVES_CONTA.includes(valor as ChaveConta);
}

// ─── Expressões de valor (o que a regra calcula) ───────────────────────────

/**
 * Lista fechada de expressões que uma linha de regra pode usar.
 * - `TOTAL`: total bruto do documento (com IVA)
 * - `NET`: total líquido (sem IVA)
 * - `TAX`: IVA total
 * - `TAX:<taxa>`: IVA de uma taxa específica (ex.: `TAX:14`, `TAX:23`)
 * - `BASE`: base tributável
 * - `DISCOUNT`: descontos
 * - `PAID`: valor já pago
 * - `OUTSTANDING`: valor em aberto (NET - PAID)
 *
 * O motor resolve cada expressão com base nos `dados` passados à chamada
 * `motor.gerar({ ... dados })`. Não há eval; é um `switch` puro.
 */
export const EXPRESSOES_VALOR = [
  'TOTAL',
  'NET',
  'TAX',
  'BASE',
  'DISCOUNT',
  'PAID',
  'OUTSTANDING',
] as const;

export type ExpressaoValor = typeof EXPRESSOES_VALOR[number];

/** Verifica se uma string é uma expressão de valor válida (type guard). */
export function isExpressaoValor(valor: string): valor is ExpressaoValor {
  return EXPRESSOES_VALOR.includes(valor as ExpressaoValor) || /^TAX:\d+(\.\d+)?$/.test(valor);
}

/** Extrai a taxa de uma expressão `TAX:<taxa>` ou devolve `null`. */
export function extrairTaxaDaExpressao(expressao: string): number | null {
  const m = expressao.match(/^TAX:(\d+(\.\d+)?)$/);
  return m ? Number(m[1]) : null;
}

// ─── Lados do lançamento ───────────────────────────────────────────────────

export const LADOS_LANCAMENTO = ['debito', 'credito'] as const;
export type LadoLancamento = typeof LADOS_LANCAMENTO[number];

export function isLadoLancamento(valor: string): valor is LadoLancamento {
  return LADOS_LANCAMENTO.includes(valor as LadoLancamento);
}

// ─── Códigos de erro padrão do motor ───────────────────────────────────────

export const CODIGOS_ERRO_MOTOR = {
  REGRA_NAO_ENCONTRADA: 'REGRA_NAO_ENCONTRADA',
  CHAVE_CONTA_NAO_MAPEADA: 'CHAVE_CONTA_NAO_MAPEADA',
  CONTA_NAO_ACEITA_MOVIMENTO: 'CONTA_NAO_ACEITA_MOVIMENTO',
  CONTA_INEXISTENTE: 'CONTA_INEXISTENTE',
  EXPRESSAO_INVALIDA: 'EXPRESSAO_INVALIDA',
  TAXA_NAO_SUPORTADA: 'TAXA_NAO_SUPORTADA',
  DADOS_INSUFICIENTES: 'DADOS_INSUFICIENTES',
  LANCAMENTO_DESEQUILIBRADO: 'LANCAMENTO_DESEQUILIBRADO',
  PERIODO_FECHADO: 'PERIODO_FECHADO',
  EXERCICIO_FECHADO: 'EXERCICIO_FECHADO',
} as const;

export type CodigoErroMotor = typeof CODIGOS_ERRO_MOTOR[keyof typeof CODIGOS_ERRO_MOTOR];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Todas as chaves de conta que começam por `VAT_`. */
export const CHAVES_VAT = CHAVES_CONTA.filter((k) => k.startsWith('VAT_'));

/** Chaves relacionadas com entidades (clientes/fornecedores). */
export const CHAVES_ENTIDADE = ['CUSTOMER_ACCOUNT', 'SUPPLIER_ACCOUNT'] as const;

/** Chaves de resultado (classes 8/resultados). */
export const CHAVES_RESULTADO = [
  'RESULT_OPERATING',
  'RESULT_FINANCIAL',
  'RESULT_NON_OPERATING',
  'RESULT_TAX',
  'RESULT_NET',
  'RETAINED_EARNINGS',
] as const;

/** Chaves de RH. */
export const CHAVES_RH = [
  'PAYROLL_EXPENSE',
  'PAYROLL_PAYABLE',
  'SOCIAL_SECURITY_PAYABLE',
  'WITHHOLDING_PAYABLE',
] as const;