/**
 * Testes unitários para retroactivos e câmbio (RH-311)
 */
import { describe, expect, it } from 'vitest';
import {
  calcularRetroactivo,
  converterCambio,
} from '../../../main/services/rh/calculo/calculadoras/retroactivos';

describe('Retroactivos', () => {
  it('calcula a diferença mensal vezes os meses', () => {
    const res = calcularRetroactivo({
      valorOriginal: '100000',
      valorCorrigido: '120000',
      meses: '3',
    });
    expect(res.diferencaMensal.toFixed(2)).toBe('20000.00');
    expect(res.diferencaTotal.toFixed(2)).toBe('60000.00');
    expect(res.valorConvertido.toFixed(2)).toBe('60000.00');
  });

  it('converte para a moeda base com taxa de câmbio', () => {
    const res = calcularRetroactivo({
      valorOriginal: '0',
      valorCorrigido: '100',
      meses: '2',
      moedaEstrangeira: true,
      taxaCambio: '900',
    });
    expect(res.diferencaTotal.toFixed(2)).toBe('200.00');
    expect(res.valorConvertido.toFixed(2)).toBe('180000.00');
  });

  it('converterCambio ignora taxas inválidas', () => {
    expect(converterCambio('1000', '0').toFixed(2)).toBe('1000.00');
    expect(converterCambio('1000', '5').toFixed(2)).toBe('5000.00');
  });
});
