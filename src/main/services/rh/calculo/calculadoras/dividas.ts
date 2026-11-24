/**
 * @file dividas.ts
 * @description Dívidas e penhoras: prestações a descontar no período (RH-306).
 * Puro. Aplica o limite legal de penhora por prestação e o remanescente.
 */

import { d, minMoney, round2, sumRound2, type MoneyInput } from '../engine/decimal';
import type { PrestacaoPeriodo } from '../engine/types';

export interface ResultadoDividaItem {
  processoDividaId: string;
  tipo: PrestacaoPeriodo['tipo'];
  valorPedido: ReturnType<typeof d>;
  valorDescontado: ReturnType<typeof d>;
  limitado: boolean;
}

export interface ResultadoDividas {
  valorTotalDesconto: ReturnType<typeof d>;
  itens: ResultadoDividaItem[];
  avisos: string[];
}

/**
 * Calcula as prestações a descontar. `disponivelLiquido` (opcional) limita o
 * total a descontar (após INSS/IRT), tipicamente por regra de rendimento
 * disponível.
 */
export function calcularPrestacoes(
  prestacoes: PrestacaoPeriodo[],
  opts: { limiteGlobal?: MoneyInput } = {},
): ResultadoDividas {
  const itens: ResultadoDividaItem[] = [];
  const avisos: string[] = [];

  for (const p of prestacoes) {
    const pedido = d(p.valorPrestacao);
    if (pedido.lessThanOrEqualTo(0)) continue;

    let descontado = pedido;
    let limitado = false;

    if (p.limitePenhora !== undefined && p.limitePenhora !== null) {
      const limite = d(p.limitePenhora);
      if (limite.greaterThan(0) && descontado.greaterThan(limite)) {
        descontado = limite;
        limitado = true;
        avisos.push(`Prestação de ${p.tipo.toLowerCase()} limitada ao máximo de penhora permitido.`);
      }
    }

    itens.push({
      processoDividaId: p.processoDividaId,
      tipo: p.tipo,
      valorPedido: round2(pedido),
      valorDescontado: round2(descontado),
      limitado,
    });
  }

  let total = sumRound2(itens.map((i) => i.valorDescontado));

  if (opts.limiteGlobal !== undefined && opts.limiteGlobal !== null) {
    const limite = d(opts.limiteGlobal);
    if (limite.greaterThan(0) && total.greaterThan(limite)) {
      total = round2(minMoney(total, limite));
      avisos.push('Total de descontos de dívidas limitado ao rendimento disponível.');
    }
  }

  return { valorTotalDesconto: total, itens, avisos };
}
