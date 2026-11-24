/**
 * @file rh-processamento-entrada.ts
 * @description Constrói a `EntradaCalculo` (motor puro, Fase 3) a partir dos
 * dados do loader (RH-403) e dos parâmetros fiscais vigentes.
 *
 * Este mapeamento é partilhado por `simular`/`preparar` (RH-404) e por
 * `processar` (RH-405), garantindo que a simulação e a execução produzem
 * exactamente o mesmo resultado para a mesma entrada (idempotência).
 *
 * Regras:
 * - Nunca usar `number` em aritmética monetária: os valores Prisma são
 *   convertidos para string e passados ao motor como `MoneyInput`.
 * - Parâmetros fiscais por vigência (`RhParametroFiscal`), nunca hard-coded.
 * - Puro excepto as leituras de parâmetros (injectáveis para testes).
 */

import type {
  RhAlteracaoMensal,
  RhAusencia,
  RhEscalaoIRT,
  RhHoraExtra,
  RhPrestacaoDivida,
  RhRubrica,
  RhTipoAusencia,
} from '@prisma/client';
import type {
  AjusteManual,
  EntradaCalculo,
  EscalaoIRT,
  HoraExtraPeriodo,
  PrestacaoPeriodo,
  RubricaAplicavel,
} from './rh/calculo/engine/types';
import { d } from './rh/calculo/engine/decimal';
import type { DadosProcessamento, FuncionarioDados } from './rh-processamento-loader.service';
import { rhConfiguracaoService } from './rh-configuracao.service';
import { RH_ERROR_CODES } from '../utils/rh-errors';

/** Parâmetros fiscais/configuração necessários ao motor. */
export interface ParametrosProcessamento {
  inssTrabalhador: number;
  inssPatronal: number;
  pctSubsidioNatal: number;
  pctSubsidioFerias: number;
  limitePenhoraPct: number;
  baseDiasMes: number;
}

/** Valores por omissão usados quando um parâmetro não tem versão vigente. */
export const PARAMETROS_PROCESSAMENTO_DEFAULT: ParametrosProcessamento = {
  inssTrabalhador: 3,
  inssPatronal: 8,
  pctSubsidioNatal: 100,
  pctSubsidioFerias: 100,
  limitePenhoraPct: 0,
  baseDiasMes: 30,
};

/** Fonte de parâmetros fiscais (injectável; por omissão o serviço real). */
export interface FonteParametros {
  obterParametro<T = unknown>(chave: string, data: Date, empresaId: string | null): Promise<T>;
}

/** Converte um valor Prisma/desconhecido para string (para o motor). */
function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  const v = value as { toString?: () => string };
  return typeof v.toString === 'function' ? v.toString() : undefined;
}

/** Lê um parâmetro com fallback quando não existe versão vigente. */
async function parametroComDefault(
  fonte: FonteParametros,
  chave: string,
  data: Date,
  empresaId: string | null,
  fallback: number,
): Promise<number> {
  try {
    const valor = await fonte.obterParametro<unknown>(chave, data, empresaId);
    const n = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(n) ? n : fallback;
  } catch (e) {
    if ((e as { code?: string })?.code === RH_ERROR_CODES.NAO_ENCONTRADO) return fallback;
    throw e;
  }
}

/** Carrega os parâmetros fiscais vigentes na data, com valores por omissão. */
export async function carregarParametrosProcessamento(
  empresaId: string,
  data: Date,
  fonte: FonteParametros = rhConfiguracaoService,
): Promise<ParametrosProcessamento> {
  const [inssTrabalhador, inssPatronal, pctSubsidioNatal, pctSubsidioFerias, limitePenhoraPct, baseDiasMes] =
    await Promise.all([
      parametroComDefault(fonte, 'INSS_TRAB', data, empresaId, PARAMETROS_PROCESSAMENTO_DEFAULT.inssTrabalhador),
      parametroComDefault(fonte, 'INSS_PATRONAL', data, empresaId, PARAMETROS_PROCESSAMENTO_DEFAULT.inssPatronal),
      parametroComDefault(fonte, 'PCT_SUBS_NATAL', data, empresaId, PARAMETROS_PROCESSAMENTO_DEFAULT.pctSubsidioNatal),
      parametroComDefault(fonte, 'PCT_SUBS_FERIAS', data, empresaId, PARAMETROS_PROCESSAMENTO_DEFAULT.pctSubsidioFerias),
      parametroComDefault(fonte, 'LIMITE_PENHORA_PCT', data, empresaId, PARAMETROS_PROCESSAMENTO_DEFAULT.limitePenhoraPct),
      parametroComDefault(fonte, 'BASE_DIAS_MES', data, empresaId, PARAMETROS_PROCESSAMENTO_DEFAULT.baseDiasMes),
    ]);

  return { inssTrabalhador, inssPatronal, pctSubsidioNatal, pctSubsidioFerias, limitePenhoraPct, baseDiasMes };
}

/** Converte os escalões de IRT do Prisma para os do motor. */
export function mapearEscaloesIrt(escaloes: RhEscalaoIRT[] | undefined): EscalaoIRT[] {
  return (escaloes ?? []).map((e) => ({
    id: e.id,
    limiteInferior: str(e.rendimentoDe) ?? '0',
    limiteSuperior: e.rendimentoAte !== null && e.rendimentoAte !== undefined ? str(e.rendimentoAte) : null,
    parcelaFixa: str(e.parcelaFixa) ?? '0',
    taxa: str(e.taxa) ?? '0',
    excesso: str(e.excessoDe) ?? '0',
  }));
}

/** Mapeia uma `RhRubrica` + valor/percentagem para `RubricaAplicavel`. */
function rubricaAplicavel(
  rubrica: RhRubrica,
  valor: unknown,
  percentagem: unknown,
  quantidade?: unknown,
): RubricaAplicavel {
  const valorStr = str(valor ?? rubrica.valorPadrao);
  const pctStr = str(percentagem ?? rubrica.percentagem);
  const qtdStr = str(quantidade);
  return {
    rubricaId: rubrica.id,
    codigo: rubrica.codigo,
    descricao: rubrica.descricao,
    tipo: rubrica.tipo,
    formaCalculo: rubrica.formaCalculo,
    valor: valorStr,
    percentagem: pctStr,
    quantidade: qtdStr,
    incideIRT: rubrica.incideIRT,
    incideINSS: rubrica.incideINSS,
    limiteIsencaoIRT: str(rubrica.limiteIsencaoIRT),
    limiteIsencaoINSS: str(rubrica.limiteIsencaoINSS),
  };
}

/** Rubricas recorrentes atribuídas ao funcionário. */
function rubricasRecorrentes(fd: FuncionarioDados): RubricaAplicavel[] {
  return (fd.funcionario.rubricasFixas ?? []).map((r) =>
    rubricaAplicavel(r.rubrica, r.valor, r.percentagem),
  );
}

/** Alterações mensais pendentes do funcionário no período. */
function alteracoesMensais(
  alteracoes: (RhAlteracaoMensal & { rubrica: RhRubrica })[] | undefined,
): RubricaAplicavel[] {
  return (alteracoes ?? []).map((a) =>
    rubricaAplicavel(a.rubrica, a.valor, a.rubrica.percentagem, a.quantidade),
  );
}

/** Ausências aprovadas até à data limite. */
function ausenciasPeriodo(ausencias: (RhAusencia & { tipo: RhTipoAusencia })[] | undefined) {
  return (ausencias ?? []).map((a) => ({
    tipoAusenciaId: a.tipoId,
    dias: str(a.dias) ?? '0',
    descontarRemuneracao: a.tipo.descontaSalario,
    descontarSubsidioAlimentacao: a.tipo.descontaSubsidioAlimentacao,
  }));
}

/** Horas extra aprovadas até à data limite. */
function horasExtraPeriodo(horas: RhHoraExtra[] | undefined): HoraExtraPeriodo[] {
  return (horas ?? []).map((h) => ({
    tipoHoraExtra: h.tipo,
    horas: str(h.horas) ?? '0',
    percentual: str(h.percentagem) ?? '0',
    remunerar: true,
    incideIRT: true,
    incideINSS: true,
  }));
}

/** Prestações de dívida a descontar no período. */
function prestacoesPeriodo(prestacoes: RhPrestacaoDivida[] | undefined): PrestacaoPeriodo[] {
  return (prestacoes ?? []).map((p) => {
    const comProcesso = p as RhPrestacaoDivida & { processo?: { tipo?: string } };
    return {
      processoDividaId: p.processoId,
      valorPrestacao: str(p.valor) ?? '0',
      tipo: (comProcesso.processo?.tipo ?? 'OUTRO') as PrestacaoPeriodo['tipo'],
    };
  });
}

export interface ConstruirEntradaParams {
  loaderData: DadosProcessamento;
  funcionarioId: string;
  tipo: EntradaCalculo['tipo'];
  parametros: ParametrosProcessamento;
  /** Dias efectivamente processados (por omissão, a base de dias do mês). */
  diasProcessados?: number;
  /** Ajustes manuais (RH-408) já normalizados para o motor. */
  ajustesManuais?: AjusteManual[];
}

/**
 * Constrói a entrada determinística do motor para um funcionário e tipo.
 * @throws RhNotFoundError quando o funcionário não está nos dados carregados.
 */
export function construirEntradaCalculo(params: ConstruirEntradaParams): EntradaCalculo {
  const { loaderData, funcionarioId, tipo, parametros } = params;
  const fd = loaderData.funcionarios.find((f) => f.funcionario.id === funcionarioId);
  if (!fd) {
    throw new Error(`Funcionário ${funcionarioId} não encontrado nos dados de processamento.`);
  }

  const contrato = fd.contrato;
  const baseDiasMes = parametros.baseDiasMes || loaderData.baseDiasMes || 30;
  const diasProcessados = params.diasProcessados ?? baseDiasMes;

  const escaloes = mapearEscaloesIrt(
    (loaderData.tabelaIrt as { escaloes?: RhEscalaoIRT[] } | null)?.escaloes,
  );

  const ferias = loaderData.ferias.get(funcionarioId);

  return {
    funcionario: {
      id: fd.funcionario.id,
      dataAdmissao: new Date(fd.funcionario.dataAdmissao),
      dataCessacao: fd.funcionario.dataCessacao ? new Date(fd.funcionario.dataCessacao) : null,
    },
    contrato: {
      salarioBase: str(contrato?.salarioBase) ?? '0',
      moeda: contrato?.moeda ?? 'AOA',
      cargaHorariaSemanal: str(contrato?.cargaHorariaSemanal) ?? '40',
    },
    periodo: {
      ano: loaderData.periodo?.ano ?? new Date().getFullYear(),
      mes: loaderData.periodo?.mes ?? new Date().getMonth() + 1,
      diasProcessados: String(diasProcessados),
      baseDiasMes: String(baseDiasMes),
    },
    tipo,
    rubricasRecorrentes: rubricasRecorrentes(fd),
    alteracoesMensais: alteracoesMensais(loaderData.alteracoesMensais.get(funcionarioId)),
    ausencias: ausenciasPeriodo(loaderData.ausencias.get(funcionarioId)),
    horasExtra: horasExtraPeriodo(loaderData.horasExtra.get(funcionarioId)),
    prestacoesDivida: prestacoesPeriodo(loaderData.dividas.get(funcionarioId)),
    retroativos: [],
    ferias: ferias
      ? {
          diasDireito: String(ferias.diasDireito),
          diasGozadosOuMarcados: String(ferias.diasGozadosOuMarcados),
          diasNaoGozados: String(ferias.diasNaoGozados),
        }
      : undefined,
    ajustesManuais: params.ajustesManuais,
    config: {
      inss: {
        taxaTrabalhador: String(parametros.inssTrabalhador),
        taxaPatronal: String(parametros.inssPatronal),
      },
      irt: escaloes,
      subsidios: {
        natal: {
          percentual: String(parametros.pctSubsidioNatal),
          sujeitoIRT: true,
          sujeitoINSS: true,
        },
        ferias: {
          percentual: String(parametros.pctSubsidioFerias),
          sujeitoIRT: true,
          sujeitoINSS: true,
        },
      },
      // A percentagem legal de penhora é aplicada sobre o líquido; o motor
      // recebe o limite global em valor absoluto, pelo que 0 = sem limite.
      limitePenhora: '0',
    },
  };
}

/** Reexportação conveniente para consumidores do builder. */
export { d };
