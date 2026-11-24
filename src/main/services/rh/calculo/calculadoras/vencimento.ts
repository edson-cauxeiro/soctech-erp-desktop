/**
 * @file vencimento.ts
 * @description Cálculo de Vencimento (RH-304): salário base proporcional,
 * rubricas recorrentes/variáveis, faltas, horas extra, dívidas, retroactivos,
 * ajustes manuais, INSS e IRT. Puro.
 */

import { d, round2 } from '../engine/decimal';
import { BASE_DIAS_MES, calcularProporcional } from '../engine/calendario';
import type { EntradaCalculo, ItemCalculado, ResultadoCalculo } from '../engine/types';
import { calcularEncargos, criarItem, criarItemRubrica, fecharResultado } from './comum';
import {
  calcularDescontoFaltas,
  calcularDescontoSubsidioAlimentacao,
  calcularHorasExtra,
} from './extras';
import { calcularPrestacoes } from './dividas';

export function calcularVencimento(input: EntradaCalculo): ResultadoCalculo {
  const itens: ItemCalculado[] = [];
  const avisos: string[] = [];
  const erros: string[] = [];

  const salarioBase = d(input.contrato.salarioBase);
  const baseDiasMes = input.periodo.baseDiasMes ?? BASE_DIAS_MES;
  const diasProcessados = d(input.periodo.diasProcessados);

  // 1. Salário base (proporcional se o mês não for completo).
  if (salarioBase.greaterThan(0)) {
    const proporcional =
      diasProcessados.greaterThan(0) && diasProcessados.lessThan(d(baseDiasMes))
        ? calcularProporcional(salarioBase, diasProcessados, baseDiasMes)
        : round2(salarioBase);
    if (proporcional.greaterThan(0)) {
      itens.push(
        criarItem({
          codigo: 'SB',
          descricao: 'Salário Base',
          tipo: 'REMUNERACAO',
          origem: 'RECORRENTE',
          valorTotal: proporcional,
          incideIRT: true,
          incideINSS: true,
          baseIncidencia: proporcional,
        }),
      );
    }
  }

  // 2. Rubricas recorrentes.
  for (const r of input.rubricasRecorrentes ?? []) {
    const item = criarItemRubrica(r, salarioBase, 'RECORRENTE');
    if (item) itens.push(item);
  }

  // 3. Alterações mensais.
  for (const r of input.alteracoesMensais ?? []) {
    const item = criarItemRubrica(r, salarioBase, 'ALTERACAO_MENSAL');
    if (item) itens.push(item);
  }

  // 4. Horas extra.
  const he = calcularHorasExtra(salarioBase, input.contrato.cargaHorariaSemanal, input.horasExtra ?? []);
  he.itens.forEach((i) => {
    itens.push(
      criarItem({
        codigo: 'HE',
        descricao: `Horas Extra (${i.tipo})`,
        tipo: 'REMUNERACAO',
        origem: 'HORA_EXTRA',
        quantidade: i.horas,
        valorUnitario: i.valorHora,
        valorTotal: i.valorTotal,
        incideIRT: true,
        incideINSS: true,
      }),
    );
  });

  // 5. Ausências → descontos por faltas e subsídio de alimentação.
  for (const aus of input.ausencias ?? []) {
    if (aus.descontarRemuneracao) {
      const desconto = calcularDescontoFaltas(salarioBase, aus.dias, baseDiasMes);
      if (desconto.greaterThan(0)) {
        itens.push(
          criarItem({
            codigo: 'FALTA',
            descricao: 'Faltas',
            tipo: 'DESCONTO',
            origem: 'AUSENCIA',
            valorTotal: desconto,
          }),
        );
      }
    }
    if (aus.descontarSubsidioAlimentacao && aus.subsidioAlimentacaoDiario !== undefined) {
      const desconto = calcularDescontoSubsidioAlimentacao(aus.subsidioAlimentacaoDiario, aus.dias);
      if (desconto.greaterThan(0)) {
        itens.push(
          criarItem({
            codigo: 'FALTASA',
            descricao: 'Desconto Subsídio de Alimentação',
            tipo: 'DESCONTO',
            origem: 'AUSENCIA',
            valorTotal: desconto,
          }),
        );
      }
    }
  }

  // 6. Retroactivos.
  for (const ret of input.retroativos ?? []) {
    const valor = round2(ret.valor);
    if (valor.greaterThan(0)) {
      itens.push(
        criarItem({
          rubricaId: ret.rubricaId,
          codigo: 'RETRO',
          descricao: ret.descricao,
          tipo: 'REMUNERACAO',
          origem: 'RETROATIVO',
          valorTotal: valor,
          incideIRT: ret.incideIRT ?? true,
          incideINSS: ret.incideINSS ?? true,
        }),
      );
    }
  }

  // 7. Ajustes manuais.
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

  // 8. Encargos (INSS + IRT) sobre as remunerações já apuradas.
  const encargos = calcularEncargos(itens, {
    inss: input.config.inss,
    irt: input.config.irt,
  });

  // 9. Dívidas e penhoras (descontos após INSS/IRT).
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
    // Recalcula totais com os descontos de dívidas.
    const descontos = round2(
      encargos.itens
        .filter((i) => i.tipo === 'DESCONTO')
        .reduce((acc, i) => acc.plus(i.valorTotal), d(0)),
    );
    encargos.totais.descontos = descontos;
    encargos.totais.liquido = round2(encargos.totais.remuneracoes.minus(descontos));
  }

  return fecharResultado('VENCIMENTO', encargos, avisos, erros);
}
