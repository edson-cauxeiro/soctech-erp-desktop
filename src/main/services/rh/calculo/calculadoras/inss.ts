/**
 * @file inss.ts
 * @description Segurança Social (INSS): contribuição do trabalhador e do
 * empregador (RH-302). Puro. Ilegalmente, em Angola: 3% trabalhador / 8% patronal.
 */

import { d, minMoney, percentOf, round2, type MoneyInput } from '../engine/decimal';
import type { InssCalculado } from '../engine/types';

export interface EntradaINSS {
  base: MoneyInput;
  taxaTrabalhador: MoneyInput;
  taxaPatronal: MoneyInput;
  /** Base máxima de incidência, se aplicável. */
  limiteMaximo?: MoneyInput;
}

/** Calcula a base de incidência efectiva (limitada ao máximo, se definido). */
export function baseIncideInss(base: MoneyInput, limiteMaximo?: MoneyInput): ReturnType<typeof d> {
  const b = d(base);
  if (b.lessThanOrEqualTo(0)) return d(0);
  if (limiteMaximo !== undefined && limiteMaximo !== null) {
    const limite = d(limiteMaximo);
    if (limite.greaterThan(0)) return minMoney(b, limite);
  }
  return b;
}

/** Calcula contribuições INSS (trabalhador + patronal). */
export function calcularINSS(input: EntradaINSS): InssCalculado {
  const baseCalculo = baseIncideInss(input.base, input.limiteMaximo);
  return {
    baseCalculo: round2(baseCalculo),
    inssTrabalhador: round2(percentOf(baseCalculo, input.taxaTrabalhador)),
    inssPatronal: round2(percentOf(baseCalculo, input.taxaPatronal)),
  };
}
