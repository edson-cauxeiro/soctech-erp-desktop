/**
 * Testes unitários para Vencimento (RH-304)
 */
import { describe, expect, it } from 'vitest';
import { calcularVencimento } from '../../../main/services/rh/calculo/calculadoras/vencimento';
import { entradaBase } from './fixtures';

describe('Vencimento', () => {
  it('calcula salário base com INSS e IRT', () => {
    const res = calcularVencimento(entradaBase());
    expect(res.totais.remuneracoes.toFixed(2)).toBe('100000.00');
    expect(res.inss.inssTrabalhador.toFixed(2)).toBe('3000.00');
    expect(res.inss.inssPatronal.toFixed(2)).toBe('8000.00');
    expect(res.bases.irt.toFixed(2)).toBe('97000.00');
    expect(res.irt.valor.toFixed(2)).toBe('5700.00');
    expect(res.totais.descontos.toFixed(2)).toBe('8700.00');
    expect(res.totais.liquido.toFixed(2)).toBe('91300.00');
  });

  it('proporcionaliza por dias processados', () => {
    const res = calcularVencimento(
      entradaBase({ periodo: { ano: 2026, mes: 1, diasProcessados: '15', baseDiasMes: '30' } }),
    );
    expect(res.totais.remuneracoes.toFixed(2)).toBe('50000.00');
  });

  it('desconta faltas', () => {
    const res = calcularVencimento(
      entradaBase({
        ausencias: [
          { tipoAusenciaId: 'a1', dias: '3', descontarRemuneracao: true },
        ],
      }),
    );
    // Remunerações mantêm-se; a falta é um desconto de 100000/30*3 = 10000.
    expect(res.totais.remuneracoes.toFixed(2)).toBe('100000.00');
    const falta = res.itens.find((i) => i.codigo === 'FALTA');
    expect(falta?.valorTotal.toFixed(2)).toBe('10000.00');
    // 100000 - (INSS 3000 + IRT 5700 + falta 10000) = 81300
    expect(res.totais.liquido.toFixed(2)).toBe('81300.00');
  });

  it('acresce rubricas recorrentes e horas extra', () => {
    const res = calcularVencimento(
      entradaBase({
        rubricasRecorrentes: [
          {
            rubricaId: 'r1',
            codigo: 'SUBR',
            descricao: 'Subsídio de Refeição',
            tipo: 'REMUNERACAO',
            formaCalculo: 'VALOR_FIXO',
            valor: '25000',
            incideIRT: true,
            incideINSS: true,
          },
        ],
        horasExtra: [
          { tipoHoraExtra: 'DIURNA_UTIL', horas: '2', percentual: '50', remunerar: true },
        ],
      }),
    );
    expect(res.itens.some((i) => i.codigo === 'SUBR')).toBe(true);
    expect(res.itens.some((i) => i.codigo === 'HE')).toBe(true);
    expect(res.totais.remuneracoes.greaterThan(100000)).toBe(true);
  });

  it('aplica descontos de dívidas/penhoras depois dos encargos', () => {
    const res = calcularVencimento(
      entradaBase({
        prestacoesDivida: [
          { processoDividaId: 'd1', valorPrestacao: '5000', tipo: 'EMPRESTIMO' },
        ],
      }),
    );
    expect(res.itens.some((i) => i.tipo === 'DESCONTO' && i.origem === 'DIVIDA')).toBe(true);
    // 91300 - 5000 = 86300
    expect(res.totais.liquido.toFixed(2)).toBe('86300.00');
  });
});
