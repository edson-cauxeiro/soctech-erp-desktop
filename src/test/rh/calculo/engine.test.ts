/**
 * Testes do orquestrador `calcular` do motor RH.
 */
import { describe, expect, it } from 'vitest';
import { calcular } from '../../../main/services/rh/calculo/calculadoras/engine';
import { entradaBase } from './fixtures';

describe('Orquestrador do motor', () => {
  it('despacha VENCIMENTO', () => {
    const res = calcular(entradaBase({ tipo: 'VENCIMENTO' }));
    expect(res.tipo).toBe('VENCIMENTO');
    expect(res.totais.liquido.toFixed(2)).toBe('91300.00');
  });

  it('despacha SUBSIDIO_NATAL', () => {
    const res = calcular(entradaBase({ tipo: 'SUBSIDIO_NATAL' }));
    expect(res.tipo).toBe('SUBSIDIO_NATAL');
    expect(res.totais.remuneracoes.toFixed(2)).toBe('100000.00');
  });

  it('despacha SUBSIDIO_FERIAS com dias gozados', () => {
    const res = calcular(
      entradaBase({
        tipo: 'SUBSIDIO_FERIAS',
        ferias: { diasDireito: '22', diasGozadosOuMarcados: '22', diasNaoGozados: '0' },
      }),
    );
    expect(res.tipo).toBe('SUBSIDIO_FERIAS');
    expect(res.totais.remuneracoes.toFixed(2)).toBe('100000.00');
  });

  it('despacha EXTRAORDINARIO', () => {
    const res = calcular(
      entradaBase({
        tipo: 'EXTRAORDINARIO',
        ajustesManuais: [
          { descricao: 'Prémio', tipo: 'REMUNERACAO', valor: '50000' },
        ],
      }),
    );
    expect(res.tipo).toBe('EXTRAORDINARIO');
    expect(res.totais.remuneracoes.toFixed(2)).toBe('50000.00');
  });

  it('despacha FIM_CONTRATO', () => {
    const res = calcular(entradaBase({ tipo: 'FIM_CONTRATO' }));
    expect(res.tipo).toBe('FIM_CONTRATO');
    expect(res.totais.remuneracoes.toFixed(2)).toBe('100000.00');
  });

  it('resultado é serializável (decimais em string)', () => {
    const res = calcular(entradaBase());
    for (const item of res.itens) {
      expect(typeof item.valorTotal.toFixed(2)).toBe('string');
    }
    expect(typeof res.totais.liquido.toFixed(2)).toBe('string');
  });
});
