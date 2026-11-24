/**
 * @file sanitize.ts
 * @description Utilitários de sanitização para PII e dados sensíveis (RH-803).
 *
 * Remove ou mascara campos sensíveis antes de:
 *  - gravar em auditoria (logs sem PII)
 *  - devolver em APIs (respeita `podeVerSalarios`)
 */

/** Chaves que contêm dados sensíveis (salários, valores monetários). */
const CAMPOS_SENSIVEIS = new Set([
  // Salários e remunerações
  'salarioBase',
  'salarioAnterior',
  'salarioNovo',
  'valor',
  'valorUnitario',
  'totalRemuneracoes',
  'totalDescontos',
  'liquido',
  'totalEncargos',
  'baseINSS',
  'baseIRT',
  'inssTrabalhador',
  'inssPatronal',
  'irt',
  'parcelaFixa',
  'excesso',
  'taxa',
  'rendimentoDe',
  'rendimentoAte',
  // Bases de cálculo
  'diasDireito',
  'diasTransitados',
  'diasMarcados',
  'diasGozados',
  'dias',
  'horas',
  'percentagem',
  'valorPrestacao',
  'valorTotal',
  'saldo',
  'valorDescontado',
  'taxaRetencao',
  'taxaCambio',
  'valorFixo',
  'valorHora',
  // Identificadores pessoais
  'nif',
  'iban',
  'banco',
  'contaBancaria',
  'morada',
  'telefone',
  'email',
  'documentoNumero',
  'numeroProcesso',
  'numeroFiscal',
  'niss',
  // Recibos e pagamentos
  'numero',
  'serie',
  'referencia',
  'observacao',
  'motivo',
  'justificativoPath',
  'descricao',
  'credor',
]);

/** Chaves que são PII (identificadores pessoais diretos). */
const CAMPOS_PII = new Set([
  'nif',
  'iban',
  'morada',
  'telefone',
  'email',
  'documentoNumero',
  'numeroFiscal',
  'niss',
  'banco',
  'contaBancaria',
  'numeroProcesso',
]);

/** Chaves que são valores monetários/salariais. */
const CAMPOS_MONETARIOS = new Set([
  'salarioBase',
  'salarioAnterior',
  'salarioNovo',
  'valor',
  'valorUnitario',
  'totalRemuneracoes',
  'totalDescontos',
  'liquido',
  'totalEncargos',
  'baseINSS',
  'baseIRT',
  'inssTrabalhador',
  'inssPatronal',
  'irt',
  'parcelaFixa',
  'excesso',
  'taxa',
  'rendimentoDe',
  'rendimentoAte',
  'diasDireito',
  'diasTransitados',
  'diasMarcados',
  'diasGozados',
  'dias',
  'horas',
  'percentagem',
  'valorPrestacao',
  'valorTotal',
  'saldo',
  'valorDescontado',
  'taxaRetencao',
  'taxaCambio',
  'valorFixo',
  'valorHora',
]);

/**
 * Verifica se uma chave deve ser mascarada (contém dado sensível).
 * Case-insensitive para cobrir variações de camelCase/PascalCase.
 */
function ehSensivel(chave: string): boolean {
  const lower = chave.toLowerCase();
  return CAMPOS_SENSIVEIS.has(lower) || CAMPOS_SENSIVEIS.has(chave);
}

/**
 * Verifica se uma chave é PII direta.
 */
function ehPII(chave: string): boolean {
  const lower = chave.toLowerCase();
  return CAMPOS_PII.has(lower) || CAMPOS_PII.has(chave);
}

/**
 * Verifica se uma chave é valor monetário/salarial.
 */
function ehMonetario(chave: string): boolean {
  const lower = chave.toLowerCase();
  return CAMPOS_MONETARIOS.has(lower) || CAMPOS_MONETARIOS.has(chave);
}

/**
 * Sanitiza um objeto para auditoria: remove PII, mascara valores monetários.
 * Mantém a estrutura para integridade do hash, mas substitui valores.
 */
export function sanitizarParaAuditoria(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizarParaAuditoria);

  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    if (ehPII(chave)) {
      // PII direta: remove completamente do log
      continue;
    }
    if (ehMonetario(chave)) {
      // Valores monetários: mascara com ***
      resultado[chave] = '***MASKED***';
    } else if (ehSensivel(chave)) {
      // Outros sensíveis: mascara
      resultado[chave] = '***MASKED***';
    } else if (typeof valor === 'object' && valor !== null) {
      // Recursivo para objetos aninhados
      resultado[chave] = sanitizarParaAuditoria(valor);
    } else {
      resultado[chave] = valor;
    }
  }
  return resultado;
}

/**
 * Sanitiza resposta da API para utilizador sem `rh.salarios.ver`.
 * Remove campos monetários e PII, mantém estrutura restante.
 * Usa `unknown` como tipo de entrada/saída para compatibilidade com qualquer tipo de objeto.
 */
export function sanitizarRespostaSemSalarios(
  obj: unknown,
  podeVerSalarios: boolean
): unknown {
  if (podeVerSalarios) return obj;
  if (!obj || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map((v) => sanitizarRespostaSemSalarios(v, false));

  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    if (ehMonetario(chave) || ehPII(chave)) {
      continue;
    }
    if (typeof valor === 'object' && valor !== null) {
      resultado[chave] = sanitizarRespostaSemSalarios(valor, false);
    } else {
      resultado[chave] = valor;
    }
  }
  return resultado;
}

/**
 * Sanitiza lista de itens (array de objetos).
 */
export function sanitizarListaSemSalarios(
  items: unknown,
  podeVerSalarios: boolean
): unknown {
  if (podeVerSalarios) return items;
  if (!Array.isArray(items)) return items;
  return items.map((item) => sanitizarRespostaSemSalarios(item, false));
}

/**
 * Wrapper para Prisma select: retorna select condicional baseado em permissão.
 * Use quando quiser evitar buscar campos sensíveis do banco.
 */
export function selectSemSalarios<T extends Record<string, boolean | object>>(
  baseSelect: T,
  podeVerSalarios: boolean
): T {
  if (podeVerSalarios) return baseSelect;

  const resultado: Record<string, boolean | object> = {};
  for (const [chave, valor] of Object.entries(baseSelect)) {
    if (ehMonetario(chave) || ehPII(chave)) {
      continue; // não inclui no select
    }
    if (typeof valor === 'object' && valor !== null) {
      // Recursivo para selects aninhados
      resultado[chave] = selectSemSalarios(
        valor as Record<string, boolean | object>,
        false
      );
    } else {
      resultado[chave] = valor;
    }
  }
  return resultado as T;
}