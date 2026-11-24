/**
 * @file engine.ts
 * @description Orquestrador do motor de cálculo RH. Função determinística
 * `calcular(input): ResultadoCalculo`. Puro.
 */

import type { EntradaCalculo, ResultadoCalculo } from '../engine/types';
export type { EntradaCalculo, ResultadoCalculo } from '../engine/types';
import { calcularVencimento } from './vencimento';
import { calcularFimContrato } from './fimContrato';
import {
  calcularProcessamentoExtraordinario,
  calcularProcessamentoSubsidioFerias,
  calcularProcessamentoSubsidioNatal,
} from './processamentos';

export function calcular(input: EntradaCalculo): ResultadoCalculo {
  switch (input.tipo) {
    case 'VENCIMENTO':
      return calcularVencimento(input);
    case 'FIM_CONTRATO':
      return calcularFimContrato(input);
    case 'SUBSIDIO_NATAL':
      return calcularProcessamentoSubsidioNatal(input);
    case 'SUBSIDIO_FERIAS':
      return calcularProcessamentoSubsidioFerias(input);
    case 'EXTRAORDINARIO':
      return calcularProcessamentoExtraordinario(input);
    default:
      return calcularVencimento(input);
  }
}
