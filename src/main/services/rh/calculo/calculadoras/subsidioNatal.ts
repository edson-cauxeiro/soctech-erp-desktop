/**
 * @file subsidioNatal.ts
 * @description Subsídio de Natal (RH-307). Puro. Percentagem do salário base,
 * proporcional ao tempo de serviço no ano e abatendo duodécimos já pagos.
 */

import { d, percentOf, round2, type MoneyInput } from '../engine/decimal';

export interface EntradaSubsidioNatal {
  salarioBase: MoneyInput;
  /** Percentagem do salário base (padrão 50%). */
  percentual: MoneyInput;
  /** Meses de serviço no ano (0..12). */
  mesesNoAno?: MoneyInput;
  /** Meses considerados para o ano completo (padrão 12). */
  mesesTotaisAno?: MoneyInput;
  /** Valor de duodécimos já pagos ao longo do ano (a abater). */
  duodecimosJaPagos?: MoneyInput;
}

export interface ResultadoSubsidioNatal {
  baseCalculo: ReturnType<typeof d>;
  valorBruto: ReturnType<typeof d>;
  duodecimosJaPagos: ReturnType<typeof d>;
  valorAPagar: ReturnType<typeof d>;
}

export function calcularSubsidioNatal(input: EntradaSubsidioNatal): ResultadoSubsidioNatal {
  const salarioBase = d(input.salarioBase);
  if (salarioBase.lessThanOrEqualTo(0)) {
    return {
      baseCalculo: d(0),
      valorBruto: d(0),
      duodecimosJaPagos: d(0),
      valorAPagar: d(0),
    };
  }

  const mesesTotais = input.mesesTotaisAno !== undefined ? d(input.mesesTotaisAno) : d(12);
  const mesesNoAno = input.mesesNoAno !== undefined ? d(input.mesesNoAno) : mesesTotais;

  let valor = percentOf(salarioBase, input.percentual);
  if (mesesTotais.greaterThan(0) && mesesNoAno.lessThan(mesesTotais)) {
    valor = valor.times(mesesNoAno).dividedBy(mesesTotais);
  }
  valor = round2(valor);

  const duodecimos = round2(input.duodecimosJaPagos ?? 0);
  const aPagar = round2(valor.minus(duodecimos));

  return {
    baseCalculo: round2(salarioBase),
    valorBruto: valor,
    duodecimosJaPagos: duodecimos,
    valorAPagar: aPagar.isNegative() ? d(0) : aPagar,
  };
}
