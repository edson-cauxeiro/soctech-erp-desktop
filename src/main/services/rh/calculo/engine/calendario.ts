/**
 * @file calendario.ts
 * @description Funções de calendário do motor de cálculo RH (puras).
 */

import { d, round2, type Decimal, type MoneyInput } from './decimal';

/** Base de dias usada pela prática salarial angolana. */
export const BASE_DIAS_MES = 30;

/** Número de dias de um mês civil. */
export function diasMesCivil(ano: number, mes: number): number {
  // mes: 1..12 → o dia 0 do mês seguinte é o último dia deste mês.
  return new Date(ano, mes, 0).getDate();
}

/** Valor proporcional aos dias processados (regra de três simples). */
export function calcularProporcional(
  valorMensal: MoneyInput,
  diasProcessados: MoneyInput,
  baseDiasMes: MoneyInput = BASE_DIAS_MES,
): Decimal {
  const base = d(baseDiasMes);
  if (base.isZero()) return d(0);
  return round2(d(valorMensal).times(d(diasProcessados)).dividedBy(base));
}

/** Valor diário (valor mensal / base de dias). */
export function valorDiario(valorMensal: MoneyInput, baseDiasMes: MoneyInput = BASE_DIAS_MES): Decimal {
  const base = d(baseDiasMes);
  if (base.isZero()) return d(0);
  return d(valorMensal).dividedBy(base);
}

/** Valor-hora com base em horas mensais (carga horária semanal × 52 / 12). */
export function valorHoraMensal(
  salarioMensal: MoneyInput,
  cargaHorariaSemanal: MoneyInput,
): Decimal {
  const horasSemana = d(cargaHorariaSemanal);
  if (horasSemana.isZero()) return d(0);
  const horasMes = horasSemana.times(52).dividedBy(12);
  return d(salarioMensal).dividedBy(horasMes);
}

/** Número de meses completos entre duas datas (para proporcionais anuais). */
export function mesesCompletos(de: Date, ate: Date): number {
  let meses = (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth());
  if (ate.getDate() < de.getDate()) meses -= 1;
  return Math.max(0, meses);
}
