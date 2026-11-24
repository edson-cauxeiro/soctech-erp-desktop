/**
 * @file elegibilidade.ts
 * @description Regras de elegibilidade e restrições para processamento (RH-313).
 */

export type MotivoRestricao =
  | 'CONTRATO_INATIVO'
  | 'JA_PROCESSADO'
  | 'PERIODO_FECHADO'
  | 'SUSPENSO'
  | 'IBAN_EM_FALTA'
  | 'FIM_CONTRATO_SEM_FLAG'
  | 'SEM_CONTRATO_ATIVO'
  | 'OUTRO';

export interface RestricaoFuncionario {
  funcionarioId: string;
  motivo: MotivoRestricao;
  descricao: string;
}

export interface FuncionarioElegibilidade {
  id: string;
  nome?: string;
  codigo?: string;
  podeProcessar: boolean;
  restricoes: RestricaoFuncionario[];
}

export interface FiltroElegibilidade {
  ano: number;
  mes: number;
  tipoProcessamento: string;
  incluirFimContrato?: boolean;
}

export interface ResultadoElegibilidade {
  elegiveis: string[];
  restricoes: RestricaoFuncionario[];
  detalhes: FuncionarioElegibilidade[];
}

/**
 * Avalia elegibilidade genérica para processamento.
 * Implementação base - será extendida pelo serviço RH-313.
 */
export function avaliarElegibilidade(
  funcionarios: Array<{
    id: string;
    ativo: boolean;
    suspenso?: boolean;
    temContratoAtivo: boolean;
    temIban?: boolean;
    dataCessacao?: Date | null;
    jaProcessado?: boolean;
    periodoFechado?: boolean;
  }>,
  filtro: FiltroElegibilidade,
): ResultadoElegibilidade {
  const detalhes: FuncionarioElegibilidade[] = [];
  const elegiveis: string[] = [];
  const restricoes: RestricaoFuncionario[] = [];

  for (const f of funcionarios) {
    const restr: RestricaoFuncionario[] = [];

    if (!f.temContratoAtivo) {
      restr.push({
        funcionarioId: f.id,
        motivo: 'SEM_CONTRATO_ATIVO',
        descricao: 'Funcionário sem contrato activo',
      });
    }

    if (f.suspenso) {
      restr.push({
        funcionarioId: f.id,
        motivo: 'SUSPENSO',
        descricao: 'Funcionário suspenso',
      });
    }

    if (!f.ativo && !f.dataCessacao) {
      restr.push({
        funcionarioId: f.id,
        motivo: 'CONTRATO_INATIVO',
        descricao: 'Funcionário inactivo',
      });
    }

    if (f.periodoFechado) {
      restr.push({
        funcionarioId: f.id,
        motivo: 'PERIODO_FECHADO',
        descricao: 'Período fechado para processamento',
      });
    }

    if (f.jaProcessado) {
      restr.push({
        funcionarioId: f.id,
        motivo: 'JA_PROCESSADO',
        descricao: 'Já processado neste período/tipo',
      });
    }

    if (!f.temIban) {
      restr.push({
        funcionarioId: f.id,
        motivo: 'IBAN_EM_FALTA',
        descricao: 'IBAN em falta',
      });
    }

    const isFimContrato = filtro.tipoProcessamento === 'FIM_CONTRATO';
    if (isFimContrato) {
      if (!f.dataCessacao) {
        restr.push({
          funcionarioId: f.id,
          motivo: 'FIM_CONTRATO_SEM_FLAG',
          descricao: 'Funcionário sem data de cessação para fim de contrato',
        });
      }
      if (!filtro.incluirFimContrato) {
        restr.push({
          funcionarioId: f.id,
          motivo: 'FIM_CONTRATO_SEM_FLAG',
          descricao: 'Fim de contrato não incluído no filtro',
        });
      }
    }

    detalhes.push({
      id: f.id,
      podeProcessar: restr.length === 0,
      restricoes: restr,
    });

    restr.forEach((r) => restricoes.push(r));
    if (restr.length === 0) elegiveis.push(f.id);
  }

  return { elegiveis, restricoes, detalhes };
}
