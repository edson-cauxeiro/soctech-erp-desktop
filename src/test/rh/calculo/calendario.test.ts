/**
 * Testes unitários para calendário (RH-301)
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_DIAS_MES,
  calcularProporcional,
  diasMesCivil,
  mesesCompletos,
  valorDiario,
  valorHoraMensal,
} from '../../../main/services/rh/calculo/engine/calendario';

describe('Calendário', () => {
  it('calcula proporcional por dias (base 30)', () => {
    expect(calcularProporcional(90000, 15, 30).toFixed(2)).toBe('45000.00');
    expect(calcularProporcional(90000, 30, 30).toFixed(2)).toBe('90000.00');
    expect(calcularProporcional(90000, 10, 30).toFixed(2)).toBe('30000.00');
  });

  it('base de dias padrão é 30', () => {
    expect(BASE_DIAS_MES).toBe(30);
  });

  it('dias do mês civil (ano bissexto)', () => {
    expect(diasMesCivil(2026, 2)).toBe(28);
    expect(diasMesCivil(2024, 2)).toBe(29);
    expect(diasMesCivil(2026, 1)).toBe(31);
  });

  it('valor diário', () => {
    expect(valorDiario(90000, 30).toFixed(2)).toBe('3000.00');
  });

  it('valor hora mensal a partir da carga semanal (40h)', () => {
    // horas mês = 40 * 52 / 12 = 173.333... → 90000 / 173.333 = 519.23
    expect(valorHoraMensal(90000, 40).toFixed(2)).toBe('519.23');
  });

  it('meses completos entre datas', () => {
    expect(mesesCompletos(new Date('2026-01-01'), new Date('2026-07-01'))).toBe(6);
    expect(mesesCompletos(new Date('2026-01-15'), new Date('2026-07-01'))).toBe(5);
  });
});
