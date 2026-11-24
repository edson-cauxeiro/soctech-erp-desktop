/**
 * Testes unitários para decimal.ts (RH-301)
 */
import { describe, expect, it } from 'vitest';
import {
  d,
  isPositive,
  isZero,
  maxMoney,
  minMoney,
  percentOf,
  round2,
  sum,
  sumRound2,
  toMoneyString,
  toNumber,
} from '../../../main/services/rh/calculo/engine/decimal';

describe('Decimal helpers — aritmética monetária', () => {
  it('round2 com HALF_UP em strings exactas', () => {
    expect(round2('1.005').toFixed(2)).toBe('1.01');
    expect(round2('1.004').toFixed(2)).toBe('1.00');
    expect(round2('2.675').toFixed(2)).toBe('2.68');
    expect(round2('10.235').toFixed(2)).toBe('10.24');
  });

  it('não sofre com erros de vírgula flutuante', () => {
    expect(sum(['0.1', '0.2']).toFixed(2)).toBe('0.30');
    expect(sumRound2(['0.1', '0.2']).toFixed(2)).toBe('0.30');
  });

  it('trata nulos como zero', () => {
    expect(d(null).toFixed(2)).toBe('0.00');
    expect(d(undefined).toFixed(2)).toBe('0.00');
    expect(toNumber(undefined)).toBe(0);
  });

  it('sum acumula com precisão total', () => {
    expect(sum(['10.333', '10.333']).toFixed(3)).toBe('20.666');
    expect(sumRound2(['10.333', '10.333']).toFixed(2)).toBe('20.67');
  });

  it('helpers de comparação e min/max', () => {
    expect(isZero('0.00')).toBe(true);
    expect(isPositive('0.01')).toBe(true);
    expect(maxMoney('10', '20').toNumber()).toBe(20);
    expect(minMoney('10', '20').toNumber()).toBe(10);
    expect(percentOf('1000', '3').toNumber()).toBe(30);
  });

  it('serializa como string decimal com 2 casas', () => {
    expect(toMoneyString('1234.5')).toBe('1234.50');
  });
});
