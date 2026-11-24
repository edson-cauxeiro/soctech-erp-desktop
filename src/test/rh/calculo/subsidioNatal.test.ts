/**
 * Testes unitários para Subsídio de Natal (RH-307)
 */
import { describe, expect, it } from 'vitest';
import { calcularSubsidioNatal } from '../../../main/services/rh/calculo/calculadoras/subsidioNatal';

describe('Subsídio de Natal', () => {
  it('calcula 100% do salário base', () => {
    const res = calcularSubsidioNatal({ salarioBase: '100000', percentual: '100' });
    expect(res.valorBruto.toFixed(2)).toBe('100000.00');
    expect(res.valorAPagar.toFixed(2)).toBe('100000.00');
  });

  it('calcula 50% do salário base (padrão)', () => {
    const res = calcularSubsidioNatal({ salarioBase: '100000', percentual: '50' });
    expect(res.valorBruto.toFixed(2)).toBe('50000.00');
  });

  it('proporcional aos meses de serviço no ano', () => {
    const res = calcularSubsidioNatal({
      salarioBase: '120000',
      percentual: '100',
      mesesNoAno: '6',
      mesesTotaisAno: '12',
    });
    expect(res.valorBruto.toFixed(2)).toBe('60000.00');
  });

  it('abate duodécimos já pagos', () => {
    const res = calcularSubsidioNatal({
      salarioBase: '120000',
      percentual: '100',
      duodecimosJaPagos: '50000',
    });
    expect(res.valorBruto.toFixed(2)).toBe('120000.00');
    expect(res.valorAPagar.toFixed(2)).toBe('70000.00');
  });

  it('nunca devolve valor a pagar negativo', () => {
    const res = calcularSubsidioNatal({
      salarioBase: '100000',
      percentual: '100',
      duodecimosJaPagos: '150000',
    });
    expect(res.valorAPagar.toFixed(2)).toBe('0.00');
  });

  it('sem salário base devolve zero', () => {
    const res = calcularSubsidioNatal({ salarioBase: '0', percentual: '100' });
    expect(res.valorAPagar.toFixed(2)).toBe('0.00');
  });
});
