/**
 * @file rh-processamento.service.ts
 * @description Service de preparação e simulação de processamento (RH-404).
 *
 * Usa o loader (RH-403) para obter dados e o motor de cálculo (Fase 3)
 * para processar cada funcionário. A simulação não persiste na BD.
 *
 * Regras:
 * - `simular`: mesmo cálculo, sem persistir (RF-PRO-04)
 * - `preparar`: idem, mas devolve estrutura pronta para `processar` confirmar
 * - Isolamento por empresa (ADR-009)
 * - Idempotência: mesma entrada → mesmo resultado
 */

import {
  rhProcessamentoLoaderService,
  type DadosProcessamento,
} from './rh-processamento-loader.service';
import { calcular, type EntradaCalculo, type ResultadoCalculo } from './rh/calculo/calculadoras/engine';
import { d, round2 } from './rh/calculo/engine/decimal';
import {
  carregarParametrosProcessamento,
  construirEntradaCalculo,
  type ParametrosProcessamento,
} from './rh-processamento-entrada';
import { rhProcessamentoManualService } from './rh-processamento-manual.service';
import type { AjusteManualInput } from '../validators/rh.validator';
import { RhBusinessRuleError } from '../utils/rh-errors';

export interface SimulacaoInput {
  empresaId: string | null;
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  funcionarioIds?: string[];
  incluirFimContrato?: boolean;
  diasProcessados?: number;
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  tipoProcessamento?: string;
  /** Ajustes manuais (RF-PRO-03) aplicados na simulação (RH-408). */
  ajustesManuais?: AjusteManualInput[];
}

export interface FuncionarioResultado {
  funcionarioId: string;
  codigo: string;
  nome: string;
  sucesso: boolean;
  resultado?: ResultadoCalculo;
  /** Totais por funcionário já formatados (RH-413) — evita expor `Decimal` ao ecrã. */
  totais?: {
    remuneracoes: string;
    descontos: string;
    encargos: string;
    liquido: string;
  };
  erro?: string;
  avisos: string[];
}

export interface SimulacaoResultado {
  periodo: { ano: number; mes: number; periodoCodigo: string };
  dataProcessamento: Date;
  tipoProcessamento: string;
  funcionarios: FuncionarioResultado[];
  resumo: {
    total: number;
    sucessos: number;
    erros: number;
    totalRemuneracoes: string;
    totalDescontos: string;
    totalLiquido: string;
  };
  avisos: string[];
}

export interface PrepararResultado extends SimulacaoResultado {
  /** Dados brutos do loader para auditoria/inspecção. */
  loaderData?: DadosProcessamento;
}

export class RhProcessamentoService {
  constructor(
    private readonly loader = rhProcessamentoLoaderService,
    private readonly carregarParametros: (
      empresaId: string,
      data: Date,
    ) => Promise<ParametrosProcessamento> = carregarParametrosProcessamento,
  ) {}

  /**
   * Simulação: carrega dados, calcula para cada funcionário, devolve resultados.
   * NÃO persiste nada na BD.
   */
  async simular(input: SimulacaoInput): Promise<SimulacaoResultado> {
    const empresaId = input.empresaId;
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');

    // 1. Carregar dados (loader RH-403)
    const loaderData = await this.loader.carregar({
      empresaId,
      ano: input.ano,
      mes: input.mes,
      periodoCodigo: input.periodoCodigo,
      funcionarioIds: input.funcionarioIds,
      incluirFimContrato: input.incluirFimContrato,
      dataLimiteFaltasHE: input.dataLimiteFaltasHE,
      dataProcessamento: input.dataProcessamento,
      tipoProcessamento: input.tipoProcessamento,
    });

    // 2. Parâmetros fiscais vigentes
    const dataProcessamento = new Date(input.dataProcessamento);
    const parametros = await this.carregarParametros(empresaId, dataProcessamento);
    const tipo = (input.tipoProcessamento ?? 'VENCIMENTO') as EntradaCalculo['tipo'];

    // Ajustes manuais (RH-408): normalizados uma vez e aplicados pelo motor.
    const ajustesManuais = rhProcessamentoManualService.normalizar(input.ajustesManuais);

    // 3. Calcular para cada funcionário elegível
    const funcionarios: FuncionarioResultado[] = [];

    for (const fd of loaderData.funcionarios) {
      try {
        const entrada = construirEntradaCalculo({
          loaderData,
          funcionarioId: fd.funcionario.id,
          tipo,
          parametros,
          diasProcessados: input.diasProcessados,
          ajustesManuais,
        });
        const resultado = calcular(entrada);

        funcionarios.push({
          funcionarioId: fd.funcionario.id,
          codigo: fd.funcionario.codigo,
          nome: fd.funcionario.nome,
          sucesso: resultado.erros.length === 0,
          resultado,
          totais: {
            remuneracoes: round2(resultado.totais.remuneracoes).toFixed(2),
            descontos: round2(resultado.totais.descontos).toFixed(2),
            encargos: round2(resultado.totais.encargos).toFixed(2),
            liquido: round2(resultado.totais.liquido).toFixed(2),
          },
          erro: resultado.erros.length > 0 ? resultado.erros.join(' ') : undefined,
          avisos: resultado.avisos,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        funcionarios.push({
          funcionarioId: fd.funcionario.id,
          codigo: fd.funcionario.codigo,
          nome: fd.funcionario.nome,
          sucesso: false,
          erro: msg,
          avisos: [],
        });
      }
    }

    const sucessos = funcionarios.filter((f) => f.sucesso).length;
    const erros = funcionarios.filter((f) => !f.sucesso).length;

    const totais = funcionarios.reduce(
      (acc, f) => {
        if (f.resultado) {
          acc.remuneracoes = acc.remuneracoes.plus(f.resultado.totais.remuneracoes);
          acc.descontos = acc.descontos.plus(f.resultado.totais.descontos);
          acc.liquido = acc.liquido.plus(f.resultado.totais.liquido);
        }
        return acc;
      },
      { remuneracoes: d(0), descontos: d(0), liquido: d(0) },
    );

    return {
      periodo: {
        ano: input.ano,
        mes: input.mes,
        periodoCodigo: input.periodoCodigo,
      },
      dataProcessamento,
      tipoProcessamento: tipo,
      funcionarios,
      resumo: {
        total: funcionarios.length,
        sucessos,
        erros,
        totalRemuneracoes: round2(totais.remuneracoes).toFixed(2),
        totalDescontos: round2(totais.descontos).toFixed(2),
        totalLiquido: round2(totais.liquido).toFixed(2),
      },
      avisos: [],
    };
  }

  /**
   * Preparação: igual à simulação mas devolve também dados do loader
   * para que o `processar` confirmado possa usar sem recarregar.
   */
  async preparar(input: SimulacaoInput): Promise<PrepararResultado> {
    const simulacao = await this.simular(input);
    return { ...simulacao, loaderData: undefined };
  }
}

export const rhProcessamentoService = new RhProcessamentoService();
