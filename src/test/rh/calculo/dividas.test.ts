/**
 * Testes unitários para dívidas/penhoras (RH-306)
 */
import { describe, expect, it } from 'vitest';
import { calcularPrestacoes } from '../../../main/services/rh/calculo/calculadoras/dividas';

describe('Dívidas e penhoras', () => {
  it('soma prestações sem limite', () => {
    const res = calcularPrestacoes([
      { processoDividaId: 'd1', valorPrestacao: '1000', tipo: 'ADIANTAMENTO' },
      { processoDividaId: 'd2', valorPrestacao: '2000', tipo: 'EMPRESTIMO' },
    ]);
    expect(res.valorTotalDesconto.toFixed(2)).toBe('3000.00');
    expect(res.itens).toHaveLength(2);
  });

  it('aplica o limite de penhora por prestação', () => {
    const res = calcularPrestacoes([
      { processoDividaId: 'p1', valorPrestacao: '5000', tipo: 'PENHORA', limitePenhora: '1500' },
    ]);
    expect(res.valorTotalDesconto.toFixed(2)).toBe('1500.00');
    expect(res.itens[0].limitado).toBe(true);
    expect(res.avisos.length).toBeGreaterThan(0);
  });

  it('aplica limite global ao total', () => {
    const res = calcularPrestacoes(
      [
        { processoDividaId: 'd1', valorPrestacao: '4000', tipo: 'ADIANTAMENTO' },
        { processoDividaId: 'd2', valorPrestacao: '4000', tipo: 'EMPRESTIMO' },
      ],
      { limiteGlobal: '5000' },
    );
    expect(res.valorTotalDesconto.toFixed(2)).toBe('5000.00');
  });

  it('ignora prestações de valor zero ou negativo', () => {
    const res = calcularPrestacoes([
      { processoDividaId: 'd1', valorPrestacao: '0', tipo: 'OUTRO' },
      { processoDividaId: 'd2', valorPrestacao: '-100', tipo: 'OUTRO' },
    ]);
    expect(res.valorTotalDesconto.toFixed(2)).toBe('0.00');
  });
});
