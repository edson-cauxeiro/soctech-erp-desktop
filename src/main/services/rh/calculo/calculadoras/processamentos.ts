/**
 * @file processamentos.ts
 * @description Calculadoras de processamento de subsídios e remuneração
 * extraordinária, compostas sobre os itens + encargos. Puro.
 */

import { round2 } from '../engine/decimal';
import type { EntradaCalculo, ItemCalculado, ResultadoCalculo } from '../engine/types';
import { calcularEncargos, criarItem, criarItemRubrica, fecharResultado } from './comum';
import { calcularSubsidioNatal } from './subsidioNatal';
import { calcularSubsidioFerias } from './subsidioFerias';

/** Subsídio de Natal (RH-307) como processamento. */
export function calcularProcessamentoSubsidioNatal(input: EntradaCalculo): ResultadoCalculo {
  const cfg = input.config.subsidios.natal;
  const res = calcularSubsidioNatal({
    salarioBase: input.contrato.salarioBase,
    percentual: cfg.percentual,
  });

  const itens: ItemCalculado[] = [];
  const avisos: string[] = [];
  if (res.valorAPagar.greaterThan(0)) {
    itens.push(
      criarItem({
        codigo: 'SUBNATAL',
        descricao: 'Subsídio de Natal',
        tipo: 'REMUNERACAO',
        origem: 'CALCULADO',
        valorTotal: res.valorAPagar,
        incideIRT: cfg.sujeitoIRT,
        incideINSS: cfg.sujeitoINSS,
      }),
    );
  } else {
    avisos.push('Subsídio de Natal a pagar é zero (já liquidado por duodécimos ou sem salário base).');
  }

  const encargos = calcularEncargos(itens, {
    inss: cfg.sujeitoINSS ? input.config.inss : undefined,
    irt: cfg.sujeitoIRT ? input.config.irt : undefined,
  });
  return fecharResultado('SUBSIDIO_NATAL', encargos, avisos);
}

/** Subsídio de Férias (RH-308) como processamento. */
export function calcularProcessamentoSubsidioFerias(input: EntradaCalculo): ResultadoCalculo {
  const cfg = input.config.subsidios.ferias;
  const res = calcularSubsidioFerias({
    salarioBase: input.contrato.salarioBase,
    percentual: cfg.percentual,
    diasGozadosOuMarcados: input.ferias?.diasGozadosOuMarcados ?? 0,
    diasDireito: input.ferias?.diasDireito,
  });

  const itens: ItemCalculado[] = [];
  const avisos: string[] = [];
  if (res.valorBruto.greaterThan(0)) {
    itens.push(
      criarItem({
        codigo: 'SUBFERIAS',
        descricao: 'Subsídio de Férias',
        tipo: 'REMUNERACAO',
        origem: 'CALCULADO',
        quantidade: res.diasConsiderados,
        valorTotal: res.valorBruto,
        incideIRT: cfg.sujeitoIRT,
        incideINSS: cfg.sujeitoINSS,
      }),
    );
  } else {
    avisos.push('Sem dias gozados/marcados — subsídio de férias não apurado.');
  }

  const encargos = calcularEncargos(itens, {
    inss: cfg.sujeitoINSS ? input.config.inss : undefined,
    irt: cfg.sujeitoIRT ? input.config.irt : undefined,
  });
  return fecharResultado('SUBSIDIO_FERIAS', encargos, avisos);
}

/** Remuneração Extraordinária (RH-309) como processamento. */
export function calcularProcessamentoExtraordinario(input: EntradaCalculo): ResultadoCalculo {
  const itens: ItemCalculado[] = [];
  for (const r of input.rubricasRecorrentes ?? []) {
    const item = criarItemRubrica(r, input.contrato.salarioBase, 'RECORRENTE');
    if (item) itens.push(item);
  }
  for (const r of input.alteracoesMensais ?? []) {
    const item = criarItemRubrica(r, input.contrato.salarioBase, 'ALTERACAO_MENSAL');
    if (item) itens.push(item);
  }
  for (const aj of input.ajustesManuais ?? []) {
    const valor = round2(aj.valor);
    if (valor.lessThanOrEqualTo(0)) continue;
    itens.push(
      criarItem({
        rubricaId: aj.rubricaId,
        codigo: aj.codigo,
        descricao: aj.descricao,
        tipo: aj.tipo,
        origem: 'MANUAL',
        quantidade: aj.quantidade,
        valorTotal: valor,
        incideIRT: aj.incideIRT ?? aj.tipo === 'REMUNERACAO',
        incideINSS: aj.incideINSS ?? aj.tipo === 'REMUNERACAO',
      }),
    );
  }

  const encargos = calcularEncargos(itens, {
    inss: input.config.inss,
    irt: input.config.irt,
  });

  return fecharResultado('EXTRAORDINARIO', encargos);
}
