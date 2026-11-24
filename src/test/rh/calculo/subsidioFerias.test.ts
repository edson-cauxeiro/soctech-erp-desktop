/**
 * Testes unitários para Subsídio de Férias (RH-308)
 */
import { describe, expect, it } from 'vitest';
import { calcularSubsidioFerias } from '../../../main/services/rh/calculo/calculadoras/subsidioFerias';

describe('Subsídio de Férias', () => {
  it('100% do salário base quando goza todos os dias de direito', () => {
    const res = calcularSubsidioFerias({
      salarioBase: '90000',
      diasGozadosOuMarcados: '22',
      diasDireito: '22',
      percentual: '100',
    });
    expect(res.valorBruto.toFixed(2)).toBe('90000.00');
  });

  it('proporcional aos dias gozados face ao direito', () => {
    const res = calcularSubsidioFerias({
      salarioBase: '90000',
      diasGozadosOuMarcados: '11',
      diasDireito: '22',
      percentual: '100',
    });
    expect(res.valorBruto.toFixed(2)).toBe('45000.00');
  });

  it('sem dias de direito usa a percentagem integral', () => {
    const res = calcularSubsidioFerias({
      salarioBase: '90000',
      diasGozadosOuMarcados: '15',
      percentual: '50',
    });
    expect(res.valorBruto.toFixed(2)).toBe('45000.00');
  });

  it('sem dias gozados devolve zero', () => {
    const res = calcularSubsidioFerias({
      salarioBase: '90000',
      diasGozadosOuMarcados: '0',
      percentual: '100',
    });
    expect(res.valorBruto.toFixed(2)).toBe('0.00');
  });
});
