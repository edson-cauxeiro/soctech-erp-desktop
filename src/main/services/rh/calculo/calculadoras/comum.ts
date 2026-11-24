/**
 * @file comum.ts
 * @description Helpers partilhados pelas calculadoras: criação de itens,
 * cálculo de bases, INSS, IRT e totais. Puro.
 */

import { d, minMoney, percentOf, round2, sum, type MoneyInput } from '../engine/decimal';
import { calcularINSS } from './inss';
import { calcularIRT } from './irt';
import type {
  BasesCalculadas,
  ConfiguracaoInss,
  EscalaoIRT,
  ItemCalculado,
  IRTCalculado,
  InssCalculado,
  OrigemItem,
  ResultadoCalculo,
  RubricaAplicavel,
  TipoProcessamento,
  TipoRubrica,
  TotaisCalculados,
} from '../engine/types';

export interface ItemInput {
  rubricaId?: string;
  codigo?: string;
  descricao: string;
  tipo: TipoRubrica;
  origem: OrigemItem;
  quantidade?: MoneyInput;
  valorUnitario?: MoneyInput;
  valorTotal: MoneyInput;
  incideIRT?: boolean;
  incideINSS?: boolean;
  baseIncidencia?: MoneyInput;
  baseIncidenciaIrt?: MoneyInput;
  baseIncidenciaInss?: MoneyInput;
  observacao?: string;
}

/** Constrói um item calculado com valores arredondados a 2 casas. */
export function criarItem(input: ItemInput): ItemCalculado {
  const total = round2(input.valorTotal);
  const quantidade = d(input.quantidade ?? 1);
  const unitario = input.valorUnitario !== undefined ? round2(input.valorUnitario) : total;
  const opcional = (v?: MoneyInput) => (v !== undefined ? round2(v) : undefined);
  return {
    rubricaId: input.rubricaId,
    codigo: input.codigo,
    descricao: input.descricao,
    tipo: input.tipo,
    origem: input.origem,
    quantidade,
    valorUnitario: unitario,
    valorTotal: total,
    incideIRT: input.incideIRT ?? false,
    incideINSS: input.incideINSS ?? false,
    baseIncidencia: opcional(input.baseIncidencia),
    baseIncidenciaIrt: opcional(input.baseIncidenciaIrt),
    baseIncidenciaInss: opcional(input.baseIncidenciaInss),
    observacao: input.observacao,
  };
}

/** Valor bruto de uma rubrica conforme a sua forma de cálculo. */
export function valorRubrica(r: RubricaAplicavel, salarioBase: MoneyInput): ReturnType<typeof d> {
  switch (r.formaCalculo) {
    case 'PERCENTAGEM_SALARIO':
      return round2(percentOf(salarioBase, r.percentagem ?? 0));
    case 'VALOR_X_QUANTIDADE':
      return round2(d(r.valor ?? 0).times(d(r.quantidade ?? 1)));
    case 'VALOR_FIXO':
    case 'SISTEMA':
    default:
      if (r.valor !== undefined && r.valor !== null) return round2(r.valor);
      if (r.percentagem !== undefined && r.percentagem !== null) {
        return round2(percentOf(salarioBase, r.percentagem));
      }
      return d(0);
  }
}

/**
 * Constrói um item a partir de uma rubrica aplicável, aplicando as isenções
 * parciais (limites) à base de incidência do IRT e/ou INSS.
 */
export function criarItemRubrica(
  r: RubricaAplicavel,
  salarioBase: MoneyInput,
  origem: OrigemItem,
): ItemCalculado | null {
  const total = valorRubrica(r, salarioBase);
  if (total.lessThanOrEqualTo(0)) return null;

  const baseIrt =
    r.incideIRT && r.limiteIsencaoIRT !== undefined && r.limiteIsencaoIRT !== null
      ? minMoney(total, r.limiteIsencaoIRT)
      : undefined;
  const baseInss =
    r.incideINSS && r.limiteIsencaoINSS !== undefined && r.limiteIsencaoINSS !== null
      ? minMoney(total, r.limiteIsencaoINSS)
      : undefined;

  return criarItem({
    rubricaId: r.rubricaId,
    codigo: r.codigo,
    descricao: r.descricao,
    tipo: r.tipo,
    origem,
    valorTotal: total,
    incideIRT: r.incideIRT,
    incideINSS: r.incideINSS,
    baseIncidencia: total,
    baseIncidenciaIrt: baseIrt,
    baseIncidenciaInss: baseInss,
  });
}

export interface OpcoesEncargos {
  inss?: ConfiguracaoInss;
  irt?: EscalaoIRT[];
  /** Se `false`, não gera linhas de desconto INSS/IRT (ex.: subsídios isentos). */
  calcularInss?: boolean;
  calcularIrt?: boolean;
}

export interface ResultadoEncargos {
  itens: ItemCalculado[];
  totais: TotaisCalculados;
  bases: BasesCalculadas;
  inss: InssCalculado;
  irt: IRTCalculado;
}

/**
 * A partir dos itens de remuneração/desconto/encargo já apurados, calcula as
 * bases, acrescenta as linhas de INSS e IRT e fecha os totais.
 */
export function calcularEncargos(itens: ItemCalculado[], opts: OpcoesEncargos): ResultadoEncargos {
  const baseInssDe = (i: ItemCalculado) => i.baseIncidenciaInss ?? i.baseIncidencia ?? i.valorTotal;
  const baseIrtDe = (i: ItemCalculado) => i.baseIncidenciaIrt ?? i.baseIncidencia ?? i.valorTotal;
  const baseInss = round2(
    sum(itens.filter((i) => i.tipo === 'REMUNERACAO' && i.incideINSS).map(baseInssDe)),
  );
  const baseIrtPura = round2(
    sum(itens.filter((i) => i.tipo === 'REMUNERACAO' && i.incideIRT).map(baseIrtDe)),
  );

  const inss = opts.inss
    ? calcularINSS({
        base: baseInss,
        taxaTrabalhador: opts.inss.taxaTrabalhador,
        taxaPatronal: opts.inss.taxaPatronal,
        limiteMaximo: opts.inss.limiteMaximo,
      })
    : { baseCalculo: d(0), inssTrabalhador: d(0), inssPatronal: d(0) };

  const baseIrt = baseIrtPura.minus(inss.inssTrabalhador);
  const baseIrtEfetiva = baseIrt.isNegative() ? d(0) : round2(baseIrt);

  if (opts.calcularInss !== false && inss.inssTrabalhador.greaterThan(0)) {
    itens.push(
      criarItem({
        codigo: 'INSS',
        descricao: 'INSS Trabalhador',
        tipo: 'DESCONTO',
        origem: 'SISTEMA',
        valorTotal: inss.inssTrabalhador,
      }),
    );
  }

  const irt =
    opts.calcularIrt === false || !opts.irt
      ? { escalaoId: null, taxa: 0, parcelaFixa: d(0), excesso: d(0), base: baseIrtEfetiva, valor: d(0) }
      : calcularIRT({ base: baseIrtEfetiva, escalonamento: opts.irt });

  if (irt.valor.greaterThan(0)) {
    itens.push(
      criarItem({
        codigo: 'IRT',
        descricao: 'IRT',
        tipo: 'DESCONTO',
        origem: 'SISTEMA',
        valorTotal: irt.valor,
        observacao: irt.escalaoId ? `Escalão ${irt.escalaoId}` : undefined,
      }),
    );
  }

  const remuneracoes = round2(
    sum(itens.filter((i) => i.tipo === 'REMUNERACAO').map((i) => i.valorTotal)),
  );
  const descontos = round2(sum(itens.filter((i) => i.tipo === 'DESCONTO').map((i) => i.valorTotal)));
  const encargos = round2(sum(itens.filter((i) => i.tipo === 'ENCARGO_PATRONAL').map((i) => i.valorTotal)));
  const liquido = round2(remuneracoes.minus(descontos));

  return {
    itens,
    totais: { remuneracoes, descontos, encargos, liquido },
    bases: {
      inss: inss.baseCalculo,
      irt: baseIrtEfetiva,
      remuneracoes,
      remuneracoesTributaveis: baseIrtPura,
    },
    inss,
    irt,
  };
}

/** Empacota o resultado final, acrescentando avisos/erros comuns. */
export function fecharResultado(
  tipo: TipoProcessamento,
  r: ResultadoEncargos,
  avisos: string[] = [],
  erros: string[] = [],
): ResultadoCalculo {
  if (r.totais.liquido.isNegative()) {
    erros.push('Valor líquido calculado negativo.');
  }
  return {
    tipo,
    itens: r.itens,
    totais: r.totais,
    bases: r.bases,
    inss: r.inss,
    irt: r.irt,
    avisos: [...avisos],
    erros,
  };
}
