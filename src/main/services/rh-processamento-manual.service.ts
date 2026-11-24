/**
 * @file rh-processamento-manual.service.ts
 * @description Ajustes manuais ao processamento (RH-408, RF-PRO-03).
 *
 * Os ajustes são introduzidos **antes de confirmar** o processamento e seguem
 * pelo mesmo builder determinístico do motor (`construirEntradaCalculo`), pelo
 * que a simulação (RH-404) e a execução (RH-405) produzem o mesmo resultado.
 * Os itens gerados pelo motor ficam marcados com `origem = MANUAL` e o
 * cabeçalho persistido fica com `manual = true` (ver `04-modelo-de-dados.md`).
 *
 * Este service apenas normaliza os ajustes validados (Zod) para a forma
 * consumida pelo motor e indica se houve ajustes; a persistência e a auditoria
 * ficam a cargo de `RhProcessamentoExecucaoService`.
 */

import type { AjusteManual } from './rh/calculo/engine/types';
import type { AjusteManualInput } from '../validators/rh.validator';

export class RhProcessamentoManualService {
  /**
   * Normaliza os ajustes validados para a forma consumida pelo motor,
   * descartando valores não positivos (o motor ignora-os). Devolve `undefined`
   * quando não há ajustes a aplicar.
   */
  normalizar(ajustes?: readonly AjusteManualInput[] | null): AjusteManual[] | undefined {
    if (!ajustes || ajustes.length === 0) return undefined;

    const normalizados: AjusteManual[] = [];
    for (const ajuste of ajustes) {
      const valor = Number(ajuste.valor);
      if (!Number.isFinite(valor) || valor <= 0) continue;
      normalizados.push({
        rubricaId: ajuste.rubricaId,
        codigo: ajuste.codigo,
        descricao: ajuste.descricao,
        tipo: ajuste.tipo,
        valor,
        quantidade: ajuste.quantidade,
        incideIRT: ajuste.incideIRT,
        incideINSS: ajuste.incideINSS,
      });
    }

    return normalizados.length > 0 ? normalizados : undefined;
  }

  /** `true` quando existem ajustes manuais a aplicar (marca `manual`). */
  houveAjustes(ajustes?: readonly AjusteManualInput[] | null): boolean {
    return this.normalizar(ajustes) !== undefined;
  }
}

export const rhProcessamentoManualService = new RhProcessamentoManualService();
