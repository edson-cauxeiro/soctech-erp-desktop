/**
 * Testes unitários para faltas e horas extra (RH-305)
 */
import { describe, expect, it } from 'vitest';
import {
  calcularDescontoFaltas,
  calcularDescontoSubsidioAlimentacao,
  calcularHorasExtra,
} from '../../../main/services/rh/calculo/calculadoras/extras';

describe('Faltas', () => {
  it('desconta pela base diária (30 dias)', () => {
    expect(calcularDescontoFaltas('90000', '3', '30').toFixed(2)).toBe('9000.00');
    expect(calcularDescontoFaltas('90000', '0', '30').toFixed(2)).toBe('0.00');
  });

  it('desconta subsídio de alimentação por dias', () => {
    expect(calcularDescontoSubsidioAlimentacao('500', '2').toFixed(2)).toBe('1000.00');
  });
});

describe('Horas extra', () => {
  it('acresce a percentagem ao valor-hora', () => {
    const res = calcularHorasExtra('90000', '40', [
      { tipoHoraExtra: 'DIURNA_UTIL', horas: '2', percentual: '50', remunerar: true },
    ]);
    // valor/hora base = 90000 / (40*52/12) = 519.2308 → +50% = 778.8462 → *2 = 1557.69
    expect(res.valorTotal.toFixed(2)).toBe('1557.69');
    expect(res.itens).toHaveLength(1);
  });

  it('ignora horas não remuneradas', () => {
    const res = calcularHorasExtra('90000', '40', [
      { tipoHoraExtra: 'NOTURNA', horas: '3', percentual: '50', remunerar: false },
    ]);
    expect(res.valorTotal.toFixed(2)).toBe('0.00');
    expect(res.itens).toHaveLength(0);
  });
});
