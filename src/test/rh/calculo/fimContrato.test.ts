/**
 * Testes unitários para Fim de Contrato (RH-310)
 */
import { describe, expect, it } from 'vitest';
import { calcularFimContrato } from '../../../main/services/rh/calculo/calculadoras/fimContrato';
import { entradaBase } from './fixtures';

describe('Fim de Contrato', () => {
  it('apura o saldo de salário com INSS e IRT', () => {
    const res = calcularFimContrato(entradaBase({ tipo: 'FIM_CONTRATO' }));
    expect(res.totais.remuneracoes.toFixed(2)).toBe('100000.00');
    // INSS 3% = 3000; IRT base 97000 → 3000 + (97000-70000)*10% = 5700
    expect(res.inss.inssTrabalhador.toFixed(2)).toBe('3000.00');
    expect(res.irt.valor.toFixed(2)).toBe('5700.00');
    expect(res.totais.liquido.toFixed(2)).toBe('91300.00');
  });

  it('acresce férias não gozadas', () => {
    const res = calcularFimContrato(
      entradaBase({
        tipo: 'FIM_CONTRATO',
        ferias: { diasDireito: '0', diasGozadosOuMarcados: '0', diasNaoGozados: '10' },
      }),
    );
    // 100000 + (100000/30*10 = 33333.33) = 133333.33
    expect(res.totais.remuneracoes.toFixed(2)).toBe('133333.33');
    expect(res.itens.some((i) => i.codigo === 'FERIAS_NAO_GOZADAS')).toBe(true);
  });

  it('indemnização é isenta de INSS/IRT', () => {
    const semInd = calcularFimContrato(entradaBase({ tipo: 'FIM_CONTRATO' }));
    const comInd = calcularFimContrato(
      entradaBase({ tipo: 'FIM_CONTRATO', indemnizacao: '50000' }),
    );
    expect(comInd.inss.inssTrabalhador.toFixed(2)).toBe(semInd.inss.inssTrabalhador.toFixed(2));
    expect(comInd.irt.valor.toFixed(2)).toBe(semInd.irt.valor.toFixed(2));
    expect(comInd.avisos.some((a) => a.includes('Indemnização'))).toBe(true);
  });
});
