/**
 * @file extras.ts
 * @description Assiduidade: faltas (descontos) e horas extra (RH-305). Puro.
 */

import { d, percentOf, round2, sumRound2, type MoneyInput } from '../engine/decimal';
import { valorHoraMensal, valorDiario, BASE_DIAS_MES } from '../engine/calendario';
import type { HoraExtraPeriodo } from '../engine/types';

/**
 * Desconto por faltas. `dias` são os dias de ausência que descontam remuneração.
 * Usa o valor diário (base 30) por omissão.
 */
export function calcularDescontoFaltas(
  salarioBase: MoneyInput,
  dias: MoneyInput,
  baseDiasMes: MoneyInput = BASE_DIAS_MES,
): ReturnType<typeof d> {
  const nd = d(dias);
  if (nd.lessThanOrEqualTo(0)) return d(0);
  return round2(valorDiario(salarioBase, baseDiasMes).times(nd));
}

/** Desconto do subsídio de alimentação por dias de ausência. */
export function calcularDescontoSubsidioAlimentacao(
  valorDiarioSubsidio: MoneyInput,
  dias: MoneyInput,
): ReturnType<typeof d> {
  const nd = d(dias);
  if (nd.lessThanOrEqualTo(0)) return d(0);
  return round2(d(valorDiarioSubsidio).times(nd));
}

export interface ResultadoHorasExtra {
  valorTotal: ReturnType<typeof d>;
  itens: Array<{
    tipo: HoraExtraPeriodo['tipoHoraExtra'];
    horas: ReturnType<typeof d>;
    valorHora: ReturnType<typeof d>;
    valorTotal: ReturnType<typeof d>;
    percentual: ReturnType<typeof d>;
  }>;
}

/**
 * Calcula horas extra por tipo/percentagem. Valor-hora derivado da carga
 * horária semanal (horas mensais = semanal × 52 / 12).
 */
export function calcularHorasExtra(
  salarioBase: MoneyInput,
  cargaHorariaSemanal: MoneyInput,
  horasExtra: HoraExtraPeriodo[],
): ResultadoHorasExtra {
  const baseHora = valorHoraMensal(salarioBase, cargaHorariaSemanal);
  const itens: ResultadoHorasExtra['itens'] = [];

  for (const he of horasExtra) {
    const horas = d(he.horas);
    if (!he.remunerar || horas.lessThanOrEqualTo(0)) continue;
    const percentual = d(he.percentual);
    const valorHoraBruto = baseHora.plus(percentOf(baseHora, percentual));
    itens.push({
      tipo: he.tipoHoraExtra,
      horas,
      valorHora: round2(valorHoraBruto),
      valorTotal: round2(valorHoraBruto.times(horas)),
      percentual,
    });
  }

  return {
    valorTotal: sumRound2(itens.map((i) => i.valorTotal)),
    itens,
  };
}
