/**
 * @file retroactivos.ts
 * @description Retroactivos e conversão de moeda (RH-311). Puro. Lança no
 * período corrente as diferenças de períodos anteriores.
 */

import { d, round2, type MoneyInput } from '../engine/decimal';

export interface EntradaRetroactivo {
  /** Valor mensal antes da correcção. */
  valorOriginal: MoneyInput;
  /** Valor mensal após a correcção. */
  valorCorrigido: MoneyInput;
  /** Número de meses a que respeita a diferença. */
  meses: MoneyInput;
  /** Taxa de câmbio (aplicada quando o valor está em moeda estrangeira). */
  taxaCambio?: MoneyInput;
  moedaEstrangeira?: boolean;
}

export interface ResultadoRetroactivo {
  /** Diferença mensal (valorCorrigido − valorOriginal). */
  diferencaMensal: ReturnType<typeof d>;
  /** Diferença já multiplicada pelos meses. */
  diferencaTotal: ReturnType<typeof d>;
  /** Valor convertido para a moeda base, se aplicável. */
  valorConvertido: ReturnType<typeof d>;
}

export function calcularRetroactivo(input: EntradaRetroactivo): ResultadoRetroactivo {
  const diferencaMensal = round2(d(input.valorCorrigido).minus(d(input.valorOriginal)));
  const meses = d(input.meses);
  const diferencaTotal = round2(diferencaMensal.times(meses.isZero() ? 1 : meses));

  let valorConvertido = diferencaTotal;
  if (input.moedaEstrangeira && input.taxaCambio !== undefined) {
    const taxa = d(input.taxaCambio);
    if (taxa.greaterThan(0)) valorConvertido = round2(diferencaTotal.times(taxa));
  }

  return {
    diferencaMensal,
    diferencaTotal,
    valorConvertido,
  };
}

/** Converte um valor de moeda estrangeira para a moeda base. */
export function converterCambio(valor: MoneyInput, taxaCambio: MoneyInput): ReturnType<typeof d> {
  const taxa = d(taxaCambio);
  if (taxa.lessThanOrEqualTo(0)) return round2(valor);
  return round2(d(valor).times(taxa));
}
