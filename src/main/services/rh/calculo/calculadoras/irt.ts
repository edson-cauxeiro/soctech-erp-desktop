/**
 * @file irt.ts
 * @description IRT (Imposto sobre os Rendimentos do Trabalho) por escalão (RH-303).
 * Puro. `IRT = parcelaFixa + (base − excesso) × taxa`.
 */

import { d, round2, type MoneyInput } from '../engine/decimal';
import type { EscalaoIRT, IRTCalculado } from '../engine/types';

export interface EntradaIRT {
  base: MoneyInput;
  escalonamento: EscalaoIRT[];
}

const ZERO: IRTCalculado = {
  escalaoId: null,
  taxa: 0,
  parcelaFixa: d(0),
  excesso: d(0),
  base: d(0),
  valor: d(0),
};

/** Aplica um escalão a uma base, devolvendo o IRT do escalão. */
function aplicarEscalao(base: MoneyInput, escalao: EscalaoIRT): IRTCalculado {
  const b = d(base);
  const excesso = d(escalao.excesso);
  const parcelaFixa = d(escalao.parcelaFixa);
  const taxa = d(escalao.taxa);
  const tributavel = b.minus(excesso);
  const valor = parcelaFixa.plus(tributavel.times(taxa).dividedBy(100));
  return {
    escalaoId: escalao.id,
    taxa: taxa.toNumber(),
    parcelaFixa,
    excesso,
    base: b,
    valor: round2(valor.isNegative() ? 0 : valor),
  };
}

/**
 * Determina o escalão aplicável: o escalão cujo intervalo engloba a base;
 * caso a base exceda todos os limites superiores, aplica o último escalão.
 */
export function selecionarEscalao(base: MoneyInput, escalonamento: EscalaoIRT[]): EscalaoIRT | null {
  if (escalonamento.length === 0) return null;
  const b = d(base);
  const ordenado = [...escalonamento].sort((a, c) => d(a.limiteInferior).comparedTo(d(c.limiteInferior)));

  for (const esc of ordenado) {
    const inf = d(esc.limiteInferior);
    const sup = esc.limiteSuperior === null || esc.limiteSuperior === undefined ? null : d(esc.limiteSuperior);
    if (b.lessThan(inf)) continue;
    if (sup !== null && b.greaterThan(sup)) continue;
    return esc;
  }

  // Base acima de todos os intervalos → último escalão (o de maior limite inferior).
  return ordenado[ordenado.length - 1] ?? null;
}

/** Calcula IRT para uma base. Base ≤ 0 devolve zero. */
export function calcularIRT(input: EntradaIRT): IRTCalculado {
  const base = d(input.base);
  if (base.lessThanOrEqualTo(0)) return { ...ZERO, base };
  const escalao = selecionarEscalao(base, input.escalonamento);
  if (!escalao) return { ...ZERO, base };
  return aplicarEscalao(base, escalao);
}

/**
 * Calcula IRT sobre a base total e devolve também o IRT já retido anteriormente,
 * para o caso de tributação incremental (ex.: extraordinário que acumula).
 */
export function calcularIRTIncremental(
  baseTotal: MoneyInput,
  irtJaRetido: MoneyInput,
  escalonamento: EscalaoIRT[],
): IRTCalculado {
  const total = calcularIRT({ base: baseTotal, escalonamento });
  const incremento = d(total.valor).minus(d(irtJaRetido));
  return {
    ...total,
    valor: round2(incremento.isNegative() ? 0 : incremento),
  };
}
