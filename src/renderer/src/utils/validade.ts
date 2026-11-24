/**
 * @file validade.ts
 * @description Cálculo do estado de validade de lotes (TASK-041).
 *
 * Espelha a regra aplicada no backend (`lote.service`): um lote sem data de
 * validade é "sem_validade"; um lote já ultrapassado é "caducado"; um lote cuja
 * validade cai dentro da antecedência configurada é "proximo_caducar"; os
 * restantes são "valido".
 */

import type { EstadoValidadeLote } from "../@types/electron";

export const DIAS_ALERTA_VALIDADE_PADRAO = 90;

export function calcularEstadoValidade(
  dataValidade: string | Date | null | undefined,
  diasAlerta: number = DIAS_ALERTA_VALIDADE_PADRAO
): EstadoValidadeLote {
  if (!dataValidade) return "sem_validade";
  const validade = new Date(dataValidade);
  if (Number.isNaN(validade.getTime())) return "sem_validade";

  const agora = new Date();
  if (validade.getTime() < agora.getTime()) return "caducado";

  const dias = diasAlerta > 0 ? diasAlerta : DIAS_ALERTA_VALIDADE_PADRAO;
  const limite = new Date();
  limite.setDate(limite.getDate() + dias);
  return validade.getTime() <= limite.getTime() ? "proximo_caducar" : "valido";
}

export const ETIQUETA_ESTADO_VALIDADE: Record<EstadoValidadeLote, string> = {
  valido: "Válido",
  proximo_caducar: "A caducar",
  caducado: "Caducado",
  sem_validade: "Sem validade",
};

/** Classes utilitárias do badge de validade, por estado. */
export const CLASSE_ESTADO_VALIDADE: Record<EstadoValidadeLote, string> = {
  valido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  proximo_caducar: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  caducado: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  sem_validade: "bg-muted text-muted-foreground",
};