/**
 * @file tesouraria.saldo.ts
 * @description Regra única de saldo da tesouraria, partilhada por todos os
 * serviços que precisam de somar movimentos.
 *
 * Existe uma única verdade sobre quando um mexe no saldo de uma conta: o
 * movimento credita a conta de destino e debita a conta de origem. O `tipo`
 * apenas decide que lado o serviço preenche ao criar o movimento; depois de
 * criado, é o lado nomeado que conta.
 *
 *     saldo = saldoInicial + Σ(créditos em contaDestinoId) − Σ(débitos em contaOrigemId)
 *
 * Se esta regra viver em dois sítios, o saldo de uma conta e a arqueação da sua
 * sessão de caixa divergem no primeiro ajuste. Por isso vive aqui e é
 * importada pelos dois.
 */

/** Um movimento tal como é devolvido pelas queries de agregação de saldo. */
export interface LadoMovimento {
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  valor: number | string;
  contaOrigemId: string | null;
  contaDestinoId: string | null;
}

/** O movimento credita a conta de destino. */
export function credita(movimento: Pick<LadoMovimento, 'contaDestinoId'>): boolean {
  return movimento.contaDestinoId !== null;
}

/** O movimento debita a conta de origem. */
export function debita(movimento: Pick<LadoMovimento, 'contaOrigemId'>): boolean {
  return movimento.contaOrigemId !== null;
}

/** Uma transferência toca duas contas; os restantes tipos tocam uma. */
export function tocaDuasContas(movimento: Pick<LadoMovimento, 'tipo'>): boolean {
  return movimento.tipo === 'transferencia';
}

/** Arredonda para 4 casas, a precisão das colunas DECIMAL(18,4). */
export function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}
