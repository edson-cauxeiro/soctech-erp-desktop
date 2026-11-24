/**
 * @file ValidadeBadge.tsx
 * @description Badge do estado de validade de um lote (TASK-041).
 */

import { CalendarClock } from "lucide-react";
import {
  calcularEstadoValidade,
  CLASSE_ESTADO_VALIDADE,
  ETIQUETA_ESTADO_VALIDADE,
} from "../../utils/validade";

export function ValidadeBadge({
  dataValidade,
  diasAlerta,
  comIcone = true,
}: {
  dataValidade: string | Date | null | undefined;
  diasAlerta?: number;
  comIcone?: boolean;
}) {
  const estado = calcularEstadoValidade(dataValidade, diasAlerta);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${CLASSE_ESTADO_VALIDADE[estado]}`}
    >
      {comIcone && <CalendarClock className="w-3.5 h-3.5" />}
      {ETIQUETA_ESTADO_VALIDADE[estado]}
    </span>
  );
}