/**
 * @file currency.ts
 * @description Utilitário centralizado de moedas para o DoraERP.
 * Define AOA (Kwanza Angolano) como moeda padrão do sistema,
 * fornece formatação e conversão de moedas.
 */

// ─── Moeda e localidade padrão do sistema ────────────────────────────────────
export const DEFAULT_CURRENCY = 'AOA';
export const DEFAULT_LOCALE   = 'pt-AO';
export const DEFAULT_COUNTRY  = 'AO';

// ─── Meta-informação das moedas suportadas ────────────────────────────────────
export interface CurrencyMeta {
  code:     string;
  symbol:   string;
  name:     string;
  locale:   string;
  decimals: number;
  flag:     string;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  AOA: { code: 'AOA', symbol: 'Kz', name: 'Kwanza Angolano',   locale: 'pt-AO', decimals: 2, flag: '🇦🇴' },
  EUR: { code: 'EUR', symbol: '€',  name: 'Euro',              locale: 'pt-PT', decimals: 2, flag: '🇪🇺' },
  USD: { code: 'USD', symbol: '$',  name: 'Dólar Americano',   locale: 'en-US', decimals: 2, flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£',  name: 'Libra Esterlina',   locale: 'en-GB', decimals: 2, flag: '🇬🇧' },
  CNY: { code: 'CNY', symbol: '¥',  name: 'Yuan Chinês',       locale: 'zh-CN', decimals: 2, flag: '🇨🇳' },
};

// ─── Taxas de câmbio (AOA como base = 1) ─────────────────────────────────────
// Valores de referência — actualizar conforme necessário ou integrar API externa.
export interface ExchangeRates {
  [from: string]: { [to: string]: number };
}

export const EXCHANGE_RATES: ExchangeRates = {
  AOA: { AOA: 1,       EUR: 0.00103, USD: 0.00113, GBP: 0.00088, CNY: 0.00822 },
  EUR: { AOA: 971.84,  EUR: 1,       USD: 1.096,   GBP: 0.855,   CNY: 7.976  },
  USD: { AOA: 886.77,  EUR: 0.912,   USD: 1,       GBP: 0.780,   CNY: 7.278  },
  GBP: { AOA: 1136.82, EUR: 1.170,   USD: 1.282,   GBP: 1,       CNY: 9.335  },
  CNY: { AOA: 121.77,  EUR: 0.125,   USD: 0.137,   GBP: 0.107,   CNY: 1      },
};

/**
 * Actualiza as taxas de câmbio em tempo de execução.
 * @example updateExchangeRates({ AOA: { EUR: 0.00105 } })
 */
export function updateExchangeRates(rates: Partial<ExchangeRates>): void {
  for (const [from, targets] of Object.entries(rates)) {
    EXCHANGE_RATES[from] = { ...(EXCHANGE_RATES[from] ?? {}), ...targets };
  }
}

// ─── Formatação ───────────────────────────────────────────────────────────────

/**
 * Formata um valor numérico como moeda localizada.
 * @param value    Valor a formatar
 * @param currency Código ISO da moeda (ex: 'AOA', 'EUR'). Padrão: AOA
 * @param locale   Localidade BCP 47. Omitir para usar o locale da moeda.
 * @returns String formatada (ex: "1 250,00 Kz" ou "€ 1.250,00")
 */
export function formatCurrency(
  value: number,
  currency: string = DEFAULT_CURRENCY,
  locale?: string,
): string {
  const meta   = CURRENCIES[currency];
  const loc    = locale ?? meta?.locale ?? DEFAULT_LOCALE;
  const digits = meta?.decimals ?? 2;
  try {
    return new Intl.NumberFormat(loc, {
      style:                 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    // Fallback caso o browser não suporte a moeda
    const sym = meta?.symbol ?? currency;
    return `${sym} ${value.toFixed(digits)}`;
  }
}

/**
 * Formata apenas o número sem o símbolo de moeda.
 */
export function formatNumber(value: number, currency: string = DEFAULT_CURRENCY): string {
  const meta   = CURRENCIES[currency];
  const loc    = meta?.locale ?? DEFAULT_LOCALE;
  const digits = meta?.decimals ?? 2;
  return new Intl.NumberFormat(loc, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Formata um valor para escrita num campo de texto: número agrupado, sem
 * símbolo de moeda (que a etiqueta do campo já diz).
 *
 * `Intl` usa espaço não separável em `pt-AO`, que é o que se quer ver
 * enquanto se escreve — mas é por isso que o parsing não pode confiar num
 * simples `replace(/\s/g, '')`: precisa de apanhar o U+00A0 também.
 */
export function formatCurrencyInput(value: number, currency: string = DEFAULT_CURRENCY): string {
  if (!Number.isFinite(value)) return '';
  const meta = CURRENCIES[currency];
  return new Intl.NumberFormat(meta?.locale ?? DEFAULT_LOCALE, {
    minimumFractionDigits: meta?.decimals ?? 2,
    maximumFractionDigits: meta?.decimals ?? 2,
  }).format(value);
}

/**
 * Lê o que a pessoa escreveu e devolve o número que ela quis dizer.
 *
 * Aceita o que uma pessoa escreve a sério em Angola e em Portugal:
 * "1 250,50", "1.250,50", "1250.50", "1250,5", "1250". Separador e símbolo
 * de moeda são ignorados; o que está a seguir ao último separador com uma
 * ou duas casas é a parte decimal, o resto é separador de milhares.
 *
 * Um valor irreconhecível devolve 0 em vez de NaN: um NaN a meio de um
 * formulário de IVA propaga-se para o total da fatura.
 */
export function parseCurrencyInput(raw: string): number {
  if (!raw) return 0;

  // Fica só o que pode significar algarismo. Cobre o espaço normal e o não
  // separável (U+00A0 e U+202F, que o Intl pode produzir).
  let limpo = raw.replace(/[^\d,.-]/g, '');
  const negativo = limpo.startsWith('-');
  limpo = limpo.replace(/-/g, '');
  if (!limpo) return 0;

  const virgula = limpo.lastIndexOf(',');
  const ponto = limpo.lastIndexOf('.');
  let normalizado: string;

  if (virgula >= 0 && ponto >= 0) {
    // Ambos presentes: o último a aparecer é o decimal. "1.250,50" e
    // "1,250.50" dão ambas 1250.50.
    const decimal = Math.max(virgula, ponto);
    normalizado = `${limpo.slice(0, decimal).replace(/[.,]/g, '')}.${limpo.slice(decimal + 1)}`;
  } else {
    const separador = Math.max(virgula, ponto);
    if (separador < 0) {
      normalizado = limpo;
    } else {
      const casas = limpo.length - separador - 1;
      // "1250,50" -> decimal. "1.250" -> separador de milhares.
      normalizado =
        casas > 0 && casas <= 2
          ? `${limpo.slice(0, separador).replace(/[.,]/g, '')}.${limpo.slice(separador + 1)}`
          : limpo.replace(/[.,]/g, '');
    }
  }

  const numero = Number.parseFloat(normalizado);
  if (!Number.isFinite(numero)) return 0;
  return negativo ? -numero : numero;
}

/**
 * Devolve o símbolo da moeda (ex: 'Kz', '€', '$').
 */
export function getCurrencySymbol(currency: string = DEFAULT_CURRENCY): string {
  return CURRENCIES[currency]?.symbol ?? currency;
}

// ─── Conversão ────────────────────────────────────────────────────────────────

/**
 * Converte um valor de uma moeda para outra usando as taxas internas.
 * @param value Valor a converter
 * @param from  Moeda de origem  (ex: 'EUR')
 * @param to    Moeda de destino (ex: 'AOA')
 * @param rates Taxas personalizadas (opcional; usa EXCHANGE_RATES por omissão)
 * @returns Valor convertido, arredondado à precisão da moeda de destino
 *
 * @example
 * convertCurrency(100, 'EUR', 'AOA') // → 97184.00
 * convertCurrency(1000, 'AOA', 'EUR') // → 1.03
 */
export function convertCurrency(
  value: number,
  from:  string,
  to:    string,
  rates: ExchangeRates = EXCHANGE_RATES,
): number {
  if (from === to) return value;
  const rate = rates[from]?.[to];
  if (rate === undefined) {
    console.warn(`[currency] Taxa de câmbio não encontrada: ${from} → ${to}`);
    return value;
  }
  const decimals = CURRENCIES[to]?.decimals ?? 2;
  return parseFloat((value * rate).toFixed(decimals));
}

/**
 * Converte e formata directamente como string de moeda.
 */
export function convertAndFormat(
  value: number,
  from:  string,
  to:    string,
  rates?: ExchangeRates,
): string {
  return formatCurrency(convertCurrency(value, from, to, rates), to);
}

// ─── Lista de moedas para selects ─────────────────────────────────────────────
export const CURRENCY_OPTIONS = Object.values(CURRENCIES).map((c) => ({
  value: c.code,
  label: `${c.flag}  ${c.code} — ${c.name} (${c.symbol})`,
}));
