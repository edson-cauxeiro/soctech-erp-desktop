/**
 * @file remuneracaoExtraordinaria.ts
 * @description Remuneração Extraordinária (RH-309). Puro. Tributação conforme
 * parâmetro: pode acumular com o vencimento (IRT incremental) ou ser tributada
 * isoladamente.
 */

import { d, round2, type MoneyInput } from '../engine/decimal';
import { calcularIRT, calcularIRTIncremental } from './irt';
import type { EscalaoIRT, IRTCalculado } from '../engine/types';

export interface EntradaExtraordinario {
  valor: MoneyInput;
  /** `true` → IRT sobre (base do vencimento + valor); `false` → IRT isolado. */
  acumulaIRT: boolean;
  /** Base tributável do vencimento (obrigatória se `acumulaIRT`). */
  baseIRTVencimento?: MoneyInput;
  /** IRT já retido no vencimento (para o cálculo incremental). */
  irtVencimento?: MoneyInput;
  escalonamento: EscalaoIRT[];
}

export interface ResultadoExtraordinario {
  valorBruto: ReturnType<typeof d>;
  baseIRT: ReturnType<typeof d>;
  irt: IRTCalculado;
}

export function calcularExtraordinario(input: EntradaExtraordinario): ResultadoExtraordinario {
  const valorBruto = round2(input.valor);
  if (valorBruto.lessThanOrEqualTo(0)) {
    return {
      valorBruto: d(0),
      baseIRT: d(0),
      irt: calcularIRT({ base: 0, escalonamento: input.escalonamento }),
    };
  }

  if (input.acumulaIRT && input.baseIRTVencimento !== undefined) {
    const baseTotal = d(input.baseIRTVencimento).plus(valorBruto);
    const irt = calcularIRTIncremental(baseTotal, input.irtVencimento ?? 0, input.escalonamento);
    return { valorBruto, baseIRT: round2(baseTotal), irt };
  }

  const irt = calcularIRT({ base: valorBruto, escalonamento: input.escalonamento });
  return { valorBruto, baseIRT: valorBruto, irt };
}
