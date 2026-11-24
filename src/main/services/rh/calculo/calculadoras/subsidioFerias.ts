/**
 * @file subsidioFerias.ts
 * @description Subsídio de Férias (RH-308). Puro. Percentagem do salário base
 * (padrão 100%), proporcional aos dias gozados/marcados face aos dias de direito.
 */

import { d, percentOf, round2, type MoneyInput } from '../engine/decimal';

export interface EntradaSubsidioFerias {
  salarioBase: MoneyInput;
  /** Percentagem do salário base (padrão 100%). */
  percentual: MoneyInput;
  /** Dias já gozados ou marcados no período. */
  diasGozadosOuMarcados: MoneyInput;
  /** Dias de direito no período (para proporcionar). */
  diasDireito?: MoneyInput;
}

export interface ResultadoSubsidioFerias {
  baseCalculo: ReturnType<typeof d>;
  diasConsiderados: ReturnType<typeof d>;
  valorBruto: ReturnType<typeof d>;
}

export function calcularSubsidioFerias(input: EntradaSubsidioFerias): ResultadoSubsidioFerias {
  const salarioBase = d(input.salarioBase);
  const dias = d(input.diasGozadosOuMarcados);
  if (salarioBase.lessThanOrEqualTo(0) || dias.lessThanOrEqualTo(0)) {
    return { baseCalculo: d(0), diasConsiderados: d(0), valorBruto: d(0) };
  }

  let valor = percentOf(salarioBase, input.percentual);
  const diasDireito = input.diasDireito !== undefined ? d(input.diasDireito) : d(0);
  if (diasDireito.greaterThan(0) && dias.lessThan(diasDireito)) {
    valor = valor.times(dias).dividedBy(diasDireito);
  }

  return {
    baseCalculo: round2(salarioBase),
    diasConsiderados: dias,
    valorBruto: round2(valor),
  };
}
