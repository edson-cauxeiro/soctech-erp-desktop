/**
 * @file nif-validator.ts
 * @description Utilitário de validação de NIF/Identificação Fiscal para Portugal (PT) e Angola (AO).
 * Conformidade com RN02.1 da especificação técnica do DoraERP.
 */

/**
 * Valida o NIF de Portugal com base no algoritmo do Módulo 11.
 * - Deve conter exatamente 9 dígitos.
 * - Primeiro dígito deve pertencer aos prefixos aceites pela Autoridade Tributária.
 * - O 9º dígito é o dígito de controlo calculado.
 */
export function validateNifPT(nif: string): boolean {
  if (!nif) return false;

  const cleaned = nif.replace(/\s+/g, '').replace(/[.-]/g, '');

  if (!/^\d{9}$/.test(cleaned)) {
    return false;
  }

  // Prefixos válidos em Portugal:
  // 1, 2, 3: Pessoa Singular
  // 45: Pessoa Singular Não Residente
  // 5: Pessoa Coletiva (Empresa)
  // 6: Administração Pública
  // 70, 71, 72, 77, 78, 79: Herança indivisa, fundos de investimento, etc.
  // 8: Empresário em nome individual / outros especiais
  // 90, 91, 98, 99: Condomínios, pessoas coletivas irregulares ou não residentes
  const firstDigit = cleaned[0];
  const firstTwoDigits = cleaned.substring(0, 2);

  const validFirstDigits = ['1', '2', '3', '5', '6', '8'];
  const validTwoDigitsPrefix = ['45', '70', '71', '72', '77', '78', '79', '90', '91', '98', '99'];

  if (!validFirstDigits.includes(firstDigit) && !validTwoDigitsPrefix.includes(firstTwoDigits)) {
    return false;
  }

  // Cálculo do Checksum Módulo 11
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(cleaned[i], 10) * (9 - i);
  }

  const remainder = sum % 11;
  const expectedCheckDigit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;

  return parseInt(cleaned[8], 10) === expectedCheckDigit;
}

/**
 * Valida o NIF de Angola conforme padrões da AGT (Administração Geral Tributária):
 * 1. Pessoas Coletivas (Empresas) ou NIF Tributário: 10 dígitos numéricos (frequentemente iniciando com '5').
 * 2. Pessoas Singulares usando Bilhete de Identidade (BI): 9 dígitos + 2 letras + 3 dígitos (total 14 caracteres).
 */
export function validateNifAO(nif: string): boolean {
  if (!nif) return false;

  const cleaned = nif.replace(/\s+/g, '').replace(/[.-]/g, '').toUpperCase();

  // Formato 1: 10 dígitos numéricos (NIF de Empresa ou NIF fiscal individual atribuído)
  if (/^\d{10}$/.test(cleaned)) {
    return true;
  }

  // Formato 2: BI angolano (9 dígitos + 2 letras de província/registo + 3 dígitos)
  if (/^\d{9}[A-Z]{2}\d{3}$/.test(cleaned)) {
    return true;
  }

  return false;
}

/**
 * Valida o NIF de acordo com o país informado.
 * @param nif Número de identificação fiscal
 * @param pais País ('PT', 'AO', ou 'outro')
 */
export function validateNif(nif: string, pais: 'PT' | 'AO' | 'outro' | (string & {}) = 'PT'): boolean {
  if (!nif || typeof nif !== 'string') return false;

  const trimmed = nif.trim();
  if (!trimmed) return false;

  const normalizedCountry = pais.toUpperCase();

  if (normalizedCountry === 'PT' || normalizedCountry === 'PORTUGAL') {
    return validateNifPT(trimmed);
  }

  if (normalizedCountry === 'AO' || normalizedCountry === 'ANGOLA') {
    return validateNifAO(trimmed);
  }

  // Para outros países, validação genérica de não estar vazio e tamanho aceitável
  return /^[A-Z0-9-]{3,25}$/i.test(trimmed);
}
