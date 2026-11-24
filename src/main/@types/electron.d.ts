/**
 * Tipos partilhados para o processo principal (main).
 * Estes tipos espelham os definidos em src/renderer/src/@types/electron.d.ts
 * para uso nos serviços e controllers do Electron.
 */

export interface PeriodoRelatorioDto {
  de: string;
  ate: string;
}

export interface PeriodoRelatorio {
  de: Date;
  ate: Date;
}

export interface FiltroRelatorio {
  empresaId: string;
  periodo: PeriodoRelatorio;
  /** Se true, inclui valores salariais. Requer permissão `rh.salarios.ver`. */
  podeVerSalarios?: boolean;
}

export interface LinhaFolhaVencimentoDto {
  funcionarioId: string;
  codigo: string;
  nome: string;
  departamento: string;
  cargo: string;
  salarioBase: number;
  horasExtras: number;
  valorHorasExtras: number;
  faltas: number;
  valorFaltas: number;
  inss: number;
  irt: number;
  outrasDeducoes: number;
  totalDeducoes: number;
  liquido: number;
  mes: string;
  ano: number;
}

export interface ResumoIrtDto {
  periodo: { de: string; ate: string };
  totalSujeito: number;
  totalIrt: number;
  porEscaloes: Array<{
    escalão: number;
    de: number;
    ate: number | null;
    taxa: number;
    parcelaFixa: number;
    base: number;
    imposto: number;
  }>;
}

export interface ResumoInssDto {
  periodo: { de: string; ate: string };
  totalRemuneracoes: number;
  inssEmpresa: number;
  inssFuncionario: number;
  totalInss: number;
  porFaixas: Array<{
    de: number;
    ate: number | null;
    taxa: number;
    base: number;
    contribEmpresa: number;
    contribFuncionario: number;
  }>;
}

export interface LinhaMapaFeriasDto {
  funcionarioId: string;
  codigo: string;
  nome: string;
  departamento: string;
  ano: number;
  diasDireito: number;
  diasMarcados: number;
  diasGozados: number;
  saldo: number;
  subsidioFerias: number;
  subsidioFeriasPago: boolean;
}

export interface LinhaMapaAusenciasDto {
  funcionarioId: string;
  codigo: string;
  nome: string;
  departamento: string;
  tipo: string;
  dataInicio: string;
  dataFim: string;
  dias: number;
  horas: number | null;
  estado: string;
  justificativa: string | null;
}

export interface LinhaDividasAbertasDto {
  funcionarioId: string;
  codigo: string;
  nome: string;
  processoId: string;
  tipo: string;
  valorOriginal: number;
  valorPago: number;
  saldo: number;
  proximaPrestacao: number | null;
  dataProximaPrestacao: string | null;
}

export interface LinhaCustoDepartamentoDto {
  departamento: string;
  totalFuncionarios: number;
  custoSalarios: number;
  custoInss: number;
  custoIRT: number;
  custoFerias: number;
  custoSubsidioNatal: number;
  custoOutros: number;
  custoTotal: number;
  mediaPorFuncionario: number;
}