/**
 * @file types.ts
 * @description Tipos do motor de cálculo RH. Motor puro, determinístico
 * (`calcular(input): ResultadoCalculo`). Toda a aritmética monetária usa
 * `Decimal` (ver `engine/decimal.ts`).
 */

import type { Decimal, MoneyInput } from './decimal';

export type TipoProcessamento =
  | 'VENCIMENTO'
  | 'SUBSIDIO_FERIAS'
  | 'SUBSIDIO_NATAL'
  | 'EXTRAORDINARIO'
  | 'FIM_CONTRATO';

export type OrigemItem =
  | 'RECORRENTE'
  | 'ALTERACAO_MENSAL'
  | 'AUSENCIA'
  | 'HORA_EXTRA'
  | 'DIVIDA'
  | 'RETROATIVO'
  | 'MANUAL'
  | 'SISTEMA'
  | 'CALCULADO';

/** Natureza contabilística da rubrica. */
export type TipoRubrica = 'REMUNERACAO' | 'DESCONTO' | 'ENCARGO_PATRONAL';

export type FormaCalculoRubrica =
  | 'VALOR_FIXO'
  | 'PERCENTAGEM_SALARIO'
  | 'VALOR_X_QUANTIDADE'
  | 'SISTEMA';

/** Rubrica aplicável a um processamento (recorrente ou alteração mensal). */
export interface RubricaAplicavel {
  rubricaId: string;
  codigo: string;
  descricao: string;
  tipo: TipoRubrica;
  formaCalculo?: FormaCalculoRubrica;
  /** Valor fixo (quando aplicável). */
  valor?: MoneyInput;
  /** Percentagem sobre o salário base (ex.: 10 = 10%). */
  percentagem?: MoneyInput;
  /** Quantidade (para VALOR_X_QUANTIDADE). */
  quantidade?: MoneyInput;
  incideIRT: boolean;
  incideINSS: boolean;
  /** Parte isenta de IRT (ex.: subsídio de alimentação até X). */
  limiteIsencaoIRT?: MoneyInput;
  /** Parte isenta de INSS. */
  limiteIsencaoINSS?: MoneyInput;
}

export interface AusenciaPeriodo {
  tipoAusenciaId: string;
  /** Número de dias de ausência no período. */
  dias: MoneyInput;
  /** Desconta a remuneração base? */
  descontarRemuneracao: boolean;
  /** Desconta o subsídio de alimentação? */
  descontarSubsidioAlimentacao?: boolean;
  /** Valor diário do subsídio de alimentação (para cálculo do desconto). */
  subsidioAlimentacaoDiario?: MoneyInput;
  /** A ausência conta para efeitos de subsídios (férias/natal)? */
  incideParaSubsidios?: boolean;
}

export type TipoHoraExtra = 'DIURNA_UTIL' | 'NOTURNA' | 'DESCANSO_FERIADO';

export interface HoraExtraPeriodo {
  tipoHoraExtra: TipoHoraExtra;
  horas: MoneyInput;
  /** Percentagem de acréscimo (ex.: 50 = +50%). */
  percentual: MoneyInput;
  remunerar: boolean;
  incideIRT?: boolean;
  incideINSS?: boolean;
}

export type TipoDivida = 'ADIANTAMENTO' | 'EMPRESTIMO' | 'PENHORA' | 'OUTRO';

export interface PrestacaoPeriodo {
  processoDividaId: string;
  valorPrestacao: MoneyInput;
  tipo: TipoDivida;
  /** Limite legal máximo de penhora (por prestação). */
  limitePenhora?: MoneyInput;
}

/** Ajuste manual introduzido pelo utilizador antes de confirmar o processamento. */
export interface AjusteManual {
  rubricaId?: string;
  codigo?: string;
  descricao: string;
  tipo: TipoRubrica;
  valor: MoneyInput;
  quantidade?: MoneyInput;
  incideIRT?: boolean;
  incideINSS?: boolean;
}

export interface EscalaoIRT {
  id: string;
  limiteInferior: MoneyInput;
  /** `null` = sem limite superior (último escalão). */
  limiteSuperior: MoneyInput | null;
  /** Parcela fixa a somar. */
  parcelaFixa: MoneyInput;
  /** Taxa marginal (ex.: 10 = 10%). */
  taxa: MoneyInput;
  /** Valor da base a partir do qual se aplica a taxa (limite isento do escalão). */
  excesso: MoneyInput;
}

export interface ConfigSubsidios {
  natal: {
    percentual: MoneyInput;
    sujeitoIRT: boolean;
    sujeitoINSS: boolean;
  };
  ferias: {
    percentual: MoneyInput;
    sujeitoIRT: boolean;
    sujeitoINSS: boolean;
  };
}

export interface ConfiguracaoInss {
  taxaTrabalhador: MoneyInput;
  taxaPatronal: MoneyInput;
  /** Base máxima de incidência, se aplicável. */
  limiteMaximo?: MoneyInput;
}

export interface FeriasInfo {
  /** Dias de direito no período. */
  diasDireito: MoneyInput;
  /** Dias gozados ou marcados no período. */
  diasGozadosOuMarcados: MoneyInput;
  /** Dias não gozados (para fim de contrato / subsídio de férias). */
  diasNaoGozados: MoneyInput;
}

/** Entrada determinística do motor. */
export interface EntradaCalculo {
  funcionario: {
    id: string;
    dataAdmissao: Date;
    dataCessacao?: Date | null;
  };
  contrato: {
    salarioBase: MoneyInput;
    moeda: string;
    cargaHorariaSemanal: MoneyInput;
  };
  periodo: {
    ano: number;
    mes: number;
    /** Dias efectivamente processados (para proporcionais). */
    diasProcessados: MoneyInput;
    /** Base de dias do mês (prática angolana: 30). */
    baseDiasMes: MoneyInput;
  };
  tipo: TipoProcessamento;
  /** Taxa de câmbio para converter valores em moeda estrangeira para a moeda base. */
  taxaCambio?: MoneyInput;
  rubricasRecorrentes?: RubricaAplicavel[];
  alteracoesMensais?: RubricaAplicavel[];
  ausencias?: AusenciaPeriodo[];
  horasExtra?: HoraExtraPeriodo[];
  prestacoesDivida?: PrestacaoPeriodo[];
  retroativos?: Array<{ rubricaId?: string; descricao: string; valor: MoneyInput; incideIRT?: boolean; incideINSS?: boolean }>;
  ferias?: FeriasInfo;
  /** Valor da indemnização (fim de contrato), quando aplicável. */
  indemnizacao?: MoneyInput;
  ajustesManuais?: AjusteManual[];
  config: {
    inss: ConfiguracaoInss;
    irt: EscalaoIRT[];
    subsidios: ConfigSubsidios;
    limitePenhora: MoneyInput;
  };
}

export interface ItemCalculado {
  rubricaId?: string;
  codigo?: string;
  descricao: string;
  tipo: TipoRubrica;
  origem: OrigemItem;
  quantidade: Decimal;
  valorUnitario: Decimal;
  valorTotal: Decimal;
  incideIRT: boolean;
  incideINSS: boolean;
  /** Base de incidência genérica (usada para IRT e INSS se não houver override). */
  baseIncidencia?: Decimal;
  /** Base de incidência específica para IRT (isenções parciais). */
  baseIncidenciaIrt?: Decimal;
  /** Base de incidência específica para INSS (isenções parciais). */
  baseIncidenciaInss?: Decimal;
  observacao?: string;
}

export interface IRTCalculado {
  escalaoId: string | null;
  taxa: number;
  parcelaFixa: Decimal;
  excesso: Decimal;
  base: Decimal;
  valor: Decimal;
}

export interface InssCalculado {
  baseCalculo: Decimal;
  inssTrabalhador: Decimal;
  inssPatronal: Decimal;
}

export interface BasesCalculadas {
  inss: Decimal;
  irt: Decimal;
  remuneracoes: Decimal;
  remuneracoesTributaveis: Decimal;
}

export interface TotaisCalculados {
  remuneracoes: Decimal;
  descontos: Decimal;
  encargos: Decimal;
  /** Valor líquido a pagar ao trabalhador. */
  liquido: Decimal;
}

export interface ResultadoCalculo {
  tipo: TipoProcessamento;
  itens: ItemCalculado[];
  totais: TotaisCalculados;
  bases: BasesCalculadas;
  inss: InssCalculado;
  irt: IRTCalculado;
  avisos: string[];
  erros: string[];
}
