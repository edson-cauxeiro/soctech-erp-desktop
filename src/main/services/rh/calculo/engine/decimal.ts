/**
 * @file decimal.ts
 * @description Utilitários de aritmética monetária do motor de cálculo RH.
 *
 * Regra do projecto (AGENTS §5.1 / ADR-006): nunca usar `number` em aritmética
 * monetária. Todo o cálculo usa `Decimal` e o arredondamento é feito a 2 casas
 * (half-up) **apenas no fim de cada rubrica**. Este módulo é puro (sem Prisma,
 * Electron ou React).
 */

import Decimal from 'decimal.js';

// Precisão interna alta; o arredondamento para 2 casas é explícito.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Valor monetário do motor. */
export type Money = Decimal;

/** Entrada aceite pelas funções do motor (Decimal, string decimal ou number). */
export type MoneyInput = Decimal | string | number | null | undefined;

/** Constrói um `Decimal` a partir de qualquer entrada aceite, tratando nulos. */
export function d(value: MoneyInput): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  const decimal = new Decimal(value);
  return decimal.isFinite() ? decimal : new Decimal(0);
}

/** Arredonda para `places` casas decimais com HALF_UP. */
export function roundN(value: MoneyInput, places = 2): Decimal {
  return d(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

/** Arredonda para 2 casas decimais (padrão monetário) com HALF_UP. */
export function round2(value: MoneyInput): Decimal {
  return roundN(value, 2);
}

/** Soma valores mantendo precisão total (sem arredondamento intermédio). */
export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.plus(d(value)), new Decimal(0));
}

/** Soma valores e arredonda o resultado a 2 casas. */
export function sumRound2(values: MoneyInput[]): Decimal {
  return round2(sum(values));
}

/** Converte para `number` (apenas para fronteiras de apresentação/IPC). */
export function toNumber(value: MoneyInput): number {
  return d(value).toNumber();
}

/** Serializa como string decimal (formato usado nos DTOs — AGENTS §5.1). */
export function toMoneyString(value: MoneyInput): string {
  return d(value).toFixed(2);
}

/** Indica se o valor é zero. */
export function isZero(value: MoneyInput): boolean {
  return d(value).isZero();
}

/** Indica se o valor é estritamente positivo. */
export function isPositive(value: MoneyInput): boolean {
  return d(value).greaterThan(0);
}

/** Máximo entre dois valores monetários. */
export function maxMoney(a: MoneyInput, b: MoneyInput): Decimal {
  const da = d(a);
  const db = d(b);
  return da.greaterThanOrEqualTo(db) ? da : db;
}

/** Mínimo entre dois valores monetários. */
export function minMoney(a: MoneyInput, b: MoneyInput): Decimal {
  const da = d(a);
  const db = d(b);
  return da.lessThanOrEqualTo(db) ? da : db;
}

/** Aplica uma percentagem (ex.: 15 = 15%). */
export function percentOf(base: MoneyInput, percent: MoneyInput): Decimal {
  return d(base).times(d(percent)).dividedBy(100);
}
