/**
 * Testes unitários para Remuneração Extraordinária (RH-309)
 */
import { describe, expect, it } from 'vitest';
import { calcularExtraordinario } from '../../../main/services/rh/calculo/calculadoras/remuneracaoExtraordinaria';
import { ESCALOES_IRT } from './fixtures';

describe('Remuneração Extraordinária', () => {
  it('valor zero devolve tudo zero', () => {
    const res = calcularExtraordinario({ valor: '0', acumulaIRT: false, escalonamento: ESCALOES_IRT });
    expect(res.valorBruto.toFixed(2)).toBe('0.00');
    expect(res.irt.valor.toFixed(2)).toBe('0.00');
  });

  it('tributação isolada aplica o escalão sobre o valor', () => {
    const res = calcularExtraordinario({ valor: '150000', acumulaIRT: false, escalonamento: ESCALOES_IRT });
    expect(res.baseIRT.toFixed(2)).toBe('150000.00');
    expect(res.irt.valor.toFixed(2)).toBe('12500.00');
  });

  it('acumula com o vencimento (IRT incremental)', () => {
    const res = calcularExtraordinario({
      valor: '50000',
      acumulaIRT: true,
      baseIRTVencimento: '100000',
      irtVencimento: '0',
      escalonamento: ESCALOES_IRT,
    });
    expect(res.baseIRT.toFixed(2)).toBe('150000.00');
    expect(res.irt.valor.toFixed(2)).toBe('12500.00');
  });

  it('abate o IRT já retido no vencimento', () => {
    const res = calcularExtraordinario({
      valor: '50000',
      acumulaIRT: true,
      baseIRTVencimento: '100000',
      irtVencimento: '5000',
      escalonamento: ESCALOES_IRT,
    });
    expect(res.irt.valor.toFixed(2)).toBe('7500.00');
  });
});
