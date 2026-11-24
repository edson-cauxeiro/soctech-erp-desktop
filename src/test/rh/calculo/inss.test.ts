/**
 * Testes unitários para INSS (RH-302)
 */
import { describe, expect, it } from 'vitest';
import { baseIncideInss, calcularINSS } from '../../../main/services/rh/calculo/calculadoras/inss';

describe('Cálculo INSS', () => {
  it('calcula trabalhador e patronal (3% / 8%)', () => {
    const res = calcularINSS({ base: '100000', taxaTrabalhador: '3', taxaPatronal: '8' });
    expect(res.baseCalculo.toFixed(2)).toBe('100000.00');
    expect(res.inssTrabalhador.toFixed(2)).toBe('3000.00');
    expect(res.inssPatronal.toFixed(2)).toBe('8000.00');
  });

  it('aplica limite máximo de incidência', () => {
    const res = calcularINSS({
      base: '200000',
      taxaTrabalhador: '3',
      taxaPatronal: '8',
      limiteMaximo: '100000',
    });
    expect(res.baseCalculo.toFixed(2)).toBe('100000.00');
    expect(res.inssTrabalhador.toFixed(2)).toBe('3000.00');
  });

  it('base negativa ou zero não contribui', () => {
    const res = calcularINSS({ base: '-5000', taxaTrabalhador: '3', taxaPatronal: '8' });
    expect(res.baseCalculo.toFixed(2)).toBe('0.00');
    expect(res.inssTrabalhador.toFixed(2)).toBe('0.00');
    expect(baseIncideInss('-5000').toFixed(2)).toBe('0.00');
  });
});
