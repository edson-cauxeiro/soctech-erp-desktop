/**
 * @file countries.ts
 * @description Lista de países utilizados no DoraERP.
 * Angola (AO) é o país padrão do sistema.
 */

export interface Country {
  /** Código ISO 3166-1 alpha-2 */
  value: string;
  /** Nome completo do país */
  label: string;
  /** Emoji da bandeira */
  flag: string;
  /** Moeda padrão do país */
  currency: string;
}

// ─── País padrão ─────────────────────────────────────────────────────────────
export const DEFAULT_COUNTRY_CODE  = 'AO';
export const DEFAULT_COUNTRY_LABEL = 'Angola';

// ─── Lista de países ──────────────────────────────────────────────────────────
export const COUNTRIES: Country[] = [
  { value: 'AO', label: 'Angola',              flag: '🇦🇴', currency: 'AOA' },
  { value: 'PT', label: 'Portugal',            flag: '🇵🇹', currency: 'EUR' },
  { value: 'BR', label: 'Brasil',              flag: '🇧🇷', currency: 'BRL' },
  { value: 'CV', label: 'Cabo Verde',          flag: '🇨🇻', currency: 'CVE' },
  { value: 'MZ', label: 'Moçambique',          flag: '🇲🇿', currency: 'MZN' },
  { value: 'ST', label: 'São Tomé e Príncipe', flag: '🇸🇹', currency: 'STN' },
  { value: 'GW', label: 'Guiné-Bissau',        flag: '🇬🇼', currency: 'XOF' },
  { value: 'GQ', label: 'Guiné Equatorial',    flag: '🇬🇶', currency: 'XAF' },
  { value: 'US', label: 'Estados Unidos',      flag: '🇺🇸', currency: 'USD' },
  { value: 'GB', label: 'Reino Unido',         flag: '🇬🇧', currency: 'GBP' },
  { value: 'CN', label: 'China',               flag: '🇨🇳', currency: 'CNY' },
  { value: 'ZA', label: 'África do Sul',       flag: '🇿🇦', currency: 'ZAR' },
  { value: 'NG', label: 'Nigéria',             flag: '🇳🇬', currency: 'NGN' },
  { value: 'CD', label: 'RD Congo',            flag: '🇨🇩', currency: 'CDF' },
  { value: 'outro', label: 'Outro País',       flag: '🌍', currency: '' },
];

/** Opções formatadas para uso em SearchSelect/SelectField */
export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({
  value: c.value,
  label: `${c.flag} ${c.label}`,
}));

/** Devolve o objecto Country pelo código (case-insensitive). */
export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.value.toUpperCase() === code.toUpperCase());
}

/** Devolve o label formatado de um país pelo código. */
export function getCountryLabel(code: string): string {
  const c = getCountry(code);
  return c ? `${c.flag} ${c.label}` : code;
}
