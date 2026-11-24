/**
 * Fixtures partilhadas para os testes do motor de cálculo RH.
 */
import type { EntradaCalculo, EscalaoIRT } from '../../../main/services/rh/calculo/engine/types';

export const ESCALOES_IRT: EscalaoIRT[] = [
  { id: 'i1', limiteInferior: '0', limiteSuperior: '70000', parcelaFixa: '0', taxa: '0', excesso: '0' },
  { id: 'i2', limiteInferior: '70001', limiteSuperior: '100000', parcelaFixa: '3000', taxa: '10', excesso: '70000' },
  { id: 'i3', limiteInferior: '100001', limiteSuperior: '200000', parcelaFixa: '6000', taxa: '13', excesso: '100000' },
  { id: 'i4', limiteInferior: '200001', limiteSuperior: '300000', parcelaFixa: '19000', taxa: '16', excesso: '200000' },
  { id: 'i5', limiteInferior: '300001', limiteSuperior: null, parcelaFixa: '35000', taxa: '17', excesso: '300000' },
];

export function entradaBase(overrides: Partial<EntradaCalculo> = {}): EntradaCalculo {
  return {
    funcionario: { id: 'f1', dataAdmissao: new Date('2026-01-01') },
    contrato: { salarioBase: '100000', moeda: 'AOA', cargaHorariaSemanal: '40' },
    periodo: { ano: 2026, mes: 1, diasProcessados: '30', baseDiasMes: '30' },
    tipo: 'VENCIMENTO',
    rubricasRecorrentes: [],
    alteracoesMensais: [],
    ausencias: [],
    horasExtra: [],
    prestacoesDivida: [],
    config: {
      inss: { taxaTrabalhador: '3', taxaPatronal: '8' },
      irt: ESCALOES_IRT,
      subsidios: {
        natal: { percentual: '100', sujeitoIRT: true, sujeitoINSS: true },
        ferias: { percentual: '100', sujeitoIRT: true, sujeitoINSS: true },
      },
      limitePenhora: '0',
    },
    ...overrides,
  };
}
