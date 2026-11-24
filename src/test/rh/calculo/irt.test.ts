/**
 * Testes unitários para IRT por escalão (RH-303)
 */
import { describe, expect, it } from 'vitest';
import {
  calcularIRT,
  calcularIRTIncremental,
  selecionarEscalao,
} from '../../../main/services/rh/calculo/calculadoras/irt';
import type { EscalaoIRT } from '../../../main/services/rh/calculo/engine/types';

const ESCALONAMENTO: EscalaoIRT[] = [
  { id: 'e1', limiteInferior: '0', limiteSuperior: '100000', parcelaFixa: '0', taxa: '0', excesso: '0' },
  { id: 'e2', limiteInferior: '100001', limiteSuperior: '200000', parcelaFixa: '5000', taxa: '10', excesso: '100000' },
  { id: 'e3', limiteInferior: '200001', limiteSuperior: null, parcelaFixa: '15000', taxa: '15', excesso: '200000' },
];

describe('IRT por escalão', () => {
  it('base 0 devolve zero', () => {
    const res = calcularIRT({ base: '0', escalonamento: ESCALONAMENTO });
    expect(res.valor.toFixed(2)).toBe('0.00');
    expect(res.escalaoId).toBeNull();
  });

  it('primeiro escalão (isento) devolve 0', () => {
    const res = calcularIRT({ base: '50000', escalonamento: ESCALONAMENTO });
    expect(res.valor.toFixed(2)).toBe('0.00');
    expect(res.escalaoId).toBe('e1');
  });

  it('segundo escalão — limite inferior', () => {
    const res = calcularIRT({ base: '100001', escalonamento: ESCALONAMENTO });
    expect(res.valor.toFixed(2)).toBe('5000.10');
  });

  it('segundo escalão — limite superior', () => {
    const res = calcularIRT({ base: '200000', escalonamento: ESCALONAMENTO });
    expect(res.valor.toFixed(2)).toBe('15000.00');
  });

  it('terceiro escalão', () => {
    const res = calcularIRT({ base: '300000', escalonamento: ESCALONAMENTO });
    // 15000 + (300000 - 200000) * 15% = 30000
    expect(res.valor.toFixed(2)).toBe('30000.00');
    expect(res.escalaoId).toBe('e3');
  });

  it('base acima de todos aplica o último escalão', () => {
    const res = calcularIRT({ base: '500000', escalonamento: ESCALONAMENTO });
    expect(res.escalaoId).toBe('e3');
    expect(res.valor.toFixed(2)).toBe('60000.00');
  });

  it('seleciona escalão por intervalo', () => {
    expect(selecionarEscalao('150000', ESCALONAMENTO)?.id).toBe('e2');
    expect(selecionarEscalao('250000', ESCALONAMENTO)?.id).toBe('e3');
  });

  it('IRT incremental abate o já retido', () => {
    const total = calcularIRT({ base: '300000', escalonamento: ESCALONAMENTO });
    const inc = calcularIRTIncremental('300000', total.valor, ESCALONAMENTO);
    expect(inc.valor.toFixed(2)).toBe('0.00');

    const inc2 = calcularIRTIncremental('300000', '10000', ESCALONAMENTO);
    expect(inc2.valor.toFixed(2)).toBe('20000.00');
  });
});
