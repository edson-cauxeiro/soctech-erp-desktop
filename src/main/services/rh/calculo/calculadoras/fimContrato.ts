/**
 * @file fimContrato.ts
 * @description Fim de Contrato (RH-310): saldo de salário, férias não gozadas,
 * subsídios proporcionais, indemnização e descontos. Puro.
 */

import { d, percentOf, round2 } from '../engine/decimal';
import { BASE_DIAS_MES, calcularProporcional, valorDiario } from '../engine/calendario';
import type { EntradaCalculo, ItemCalculado, ResultadoCalculo } from '../engine/types';
import { calcularEncargos, criarItem, fecharResultado } from './comum';
import { calcularPrestacoes } from './dividas';

export function calcularFimContrato(input: EntradaCalculo): ResultadoCalculo {
  const itens: ItemCalculado[] = [];
  const avisos: string[] = [];
  const erros: string[] = [];

  const salarioBase = d(input.contrato.salarioBase);
  const baseDiasMes = input.periodo.baseDiasMes ?? BASE_DIAS_MES;

  // 1. Saldo de salário proporcional aos dias processados.
  const diasProcessados = d(input.periodo.diasProcessados);
  if (salarioBase.greaterThan(0) && diasProcessados.greaterThan(0)) {
    const saldo = calcularProporcional(salarioBase, diasProcessados, baseDiasMes);
    if (saldo.greaterThan(0)) {
      itens.push(
        criarItem({
          codigo: 'SALDO',
          descricao: 'Saldo de Salário',
          tipo: 'REMUNERACAO',
          origem: 'CALCULADO',
          valorTotal: saldo,
          incideIRT: true,
          incideINSS: true,
        }),
      );
    }
  }

  // 2. Férias não gozadas (remuneração dos dias não gozados).
  const diasNaoGozados = d(input.ferias?.diasNaoGozados ?? 0);
  if (salarioBase.greaterThan(0) && diasNaoGozados.greaterThan(0)) {
    const valor = round2(valorDiario(salarioBase, baseDiasMes).times(diasNaoGozados));
    itens.push(
      criarItem({
        codigo: 'FERIAS_NAO_GOZADAS',
        descricao: 'Férias não gozadas',
        tipo: 'REMUNERACAO',
        origem: 'CALCULADO',
        quantidade: diasNaoGozados,
        valorUnitario: valorDiario(salarioBase, baseDiasMes),
        valorTotal: valor,
        incideIRT: true,
        incideINSS: true,
      }),
    );
  }

  // 3. Subsídio de Férias proporcional (dias gozados/marcados).
  const cfgFerias = input.config.subsidios.ferias;
  const diasGozados = d(input.ferias?.diasGozadosOuMarcados ?? 0);
  const diasDireito = d(input.ferias?.diasDireito ?? 0);
  if (salarioBase.greaterThan(0) && diasGozados.greaterThan(0)) {
    let valor = percentOf(salarioBase, cfgFerias.percentual);
    if (diasDireito.greaterThan(0) && diasGozados.lessThan(diasDireito)) {
      valor = valor.times(diasGozados).dividedBy(diasDireito);
    }
    valor = round2(valor);
    if (valor.greaterThan(0)) {
      itens.push(
        criarItem({
          codigo: 'SUB_FERIAS',
          descricao: 'Subsídio de Férias',
          tipo: 'REMUNERACAO',
          origem: 'CALCULADO',
          valorTotal: valor,
          incideIRT: cfgFerias.sujeitoIRT,
          incideINSS: cfgFerias.sujeitoINSS,
        }),
      );
    }
  }

  // 4. Indemnização (valor fornecido), tipicamente isenta de INSS.
  const indemnizacao = d(input.indemnizacao ?? 0);
  if (indemnizacao.greaterThan(0)) {
    itens.push(
      criarItem({
        codigo: 'INDEMNIZACAO',
        descricao: 'Indemnização',
        tipo: 'REMUNERACAO',
        origem: 'CALCULADO',
        valorTotal: indemnizacao,
        incideIRT: false,
        incideINSS: false,
        observacao: 'Indemnização isenta de INSS.',
      }),
    );
    avisos.push('Indemnização registada como isenta de INSS/IRT — confirmar enquadramento legal.');
  }

  const encargos = calcularEncargos(itens, {
    inss: input.config.inss,
    irt: input.config.irt,
  });

  // 5. Dívidas e penhoras.
  const prestacoes = calcularPrestacoes(input.prestacoesDivida ?? [], {
    limiteGlobal: input.config.limitePenhora,
  });
  if (prestacoes.valorTotalDesconto.greaterThan(0)) {
    for (const item of prestacoes.itens) {
      if (item.valorDescontado.lessThanOrEqualTo(0)) continue;
      encargos.itens.push(
        criarItem({
          codigo: 'DIVIDA',
          descricao: `Desconto ${item.tipo.toLowerCase()}`,
          tipo: 'DESCONTO',
          origem: 'DIVIDA',
          valorTotal: item.valorDescontado,
        }),
      );
    }
    avisos.push(...prestacoes.avisos);
    const descontos = round2(
      encargos.itens
        .filter((i) => i.tipo === 'DESCONTO')
        .reduce((acc, i) => acc.plus(i.valorTotal), d(0)),
    );
    encargos.totais.descontos = descontos;
    encargos.totais.liquido = round2(encargos.totais.remuneracoes.minus(descontos));
  }

  return fecharResultado('FIM_CONTRATO', encargos, avisos, erros);
}
