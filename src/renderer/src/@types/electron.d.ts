import { type ElectronAPI } from '@electron-toolkit/preload';

export interface UserSessionDto {
  id: string;
  login: string;
  nomeCompleto: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  permissoes: Record<string, string[] | boolean>;
  armazemDefaultId?: string | null;
  empresaConfigId?: string | null;
  empresaNome?: string | null;
  empresaNif?: string | null;
}

export type TipoSerieDocumento = 'FT' | 'FR' | 'NC' | 'ND' | 'FP' | 'GR' | 'RC';
export type EstadoDocumentoFiscal = 'emitido' | 'anulado';
export type EstadoProforma = 'rascunho' | 'emitida' | 'convertida' | 'anulada';
export type EstadoGuiaEntrega = 'rascunho' | 'confirmada' | 'faturada' | 'anulada';

export interface ExercicioFiscalDto {
  id: string;
  ano: string;
  empresaId: string;
  modulosJson: string;
  dataInicio: string | Date;
  dataFim: string | Date;
  estado: EstadoExercicio;
  fechadoEm?: string | Date | null;
  fechadoPorId?: string | null;
  updatedAt?: string | Date;
  createdAt: string | Date;
  empresa?: {
    id: string;
    nome: string;
    nif: string;
    identificador?: string | null;
  };
  periodos?: PeriodoContabilDto[];
}

// ─── Contabilidade geral ────────────────────────────────────────────────────

export type NaturezaConta = 'devedora' | 'credora';
export type TipoContaContabil =
  | 'activo'
  | 'passivo'
  | 'capitalProprio'
  | 'proveito'
  | 'custo'
  | 'resultado'
  | 'memo';
export type EstadoExercicio = 'aberto' | 'emFecho' | 'fechado';
export type EstadoPeriodoContabil = 'aberto' | 'fechado' | 'bloqueado';
export type TipoDiario =
  | 'vendas'
  | 'compras'
  | 'caixa'
  | 'banco'
  | 'geral'
  | 'ajustamento'
  | 'abertura'
  | 'liquidacao'
  | 'salarios'
  | 'imobilizado';

export interface ContaContabilDto {
  id: string;
  empresaId: string;
  codigo: string;
  designacao: string;
  contaPaiId?: string | null;
  nivel: number;
  classe: number;
  tipo: TipoContaContabil;
  natureza: NaturezaConta;
  aceitaMovimento: boolean;
  exigeCentroCusto: boolean;
  exigeEntidade: boolean;
  activa: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  pai?: { id: string; codigo: string; designacao: string } | null;
  filhas?: ContaContabilDto[];
  contaBancaria?: { id: string; codigo: string; designacao: string } | null;
  mapeamentos?: { id: string; chave: string }[];
  _count?: { filhas: number; mapeamentos?: number };
}

export interface ContaContabilCriarInput {
  empresaId: string;
  codigo: string;
  designacao: string;
  contaPaiId?: string | null;
  tipo: TipoContaContabil;
  natureza: NaturezaConta;
  aceitaMovimento?: boolean;
  exigeCentroCusto?: boolean;
  exigeEntidade?: boolean;
  activa?: boolean;
}

export interface ContaContabilAtualizarInput {
  designacao?: string;
  contaPaiId?: string | null;
  tipo?: TipoContaContabil;
  natureza?: NaturezaConta;
  aceitaMovimento?: boolean;
  exigeCentroCusto?: boolean;
  exigeEntidade?: boolean;
  activa?: boolean;
}

export interface ContaContabilFiltros {
  empresaId?: string;
  classe?: number;
  tipo?: TipoContaContabil;
  activa?: boolean;
  aceitaMovimento?: boolean;
  apenasFolhas?: boolean;
  search?: string;
}

export interface DiarioContabilDto {
  id: string;
  empresaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoDiario;
  activo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: { sequencias: number };
}

export interface DiarioContabilCriarInput {
  empresaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoDiario;
  activo?: boolean;
}

export interface DiarioContabilAtualizarInput {
  designacao?: string;
  tipo?: TipoDiario;
  activo?: boolean;
}

export interface DiarioContabilFiltros {
  empresaId?: string;
  tipo?: TipoDiario;
  activo?: boolean;
  search?: string;
}

export interface PeriodoContabilDto {
  id: string;
  exercicioId: string;
  numero: number;
  dataInicio: string | Date;
  dataFim: string | Date;
  estado: EstadoPeriodoContabil;
  fechadoEm?: string | Date | null;
  fechadoPorId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  exercicio?: {
    id: string;
    ano: string;
    dataInicio: string | Date;
    dataFim: string | Date;
    estado: EstadoExercicio;
    empresaId: string;
  };
  fechadoPor?: { id: string; nomeCompleto: string; login: string } | null;
}

export interface PeriodoContabilCriarInput {
  exercicioId: string;
  numero: number;
  dataInicio: string | Date;
  dataFim: string | Date;
}

export interface PeriodoContabilFiltros {
  empresaId?: string;
  exercicioId?: string;
  estado?: EstadoPeriodoContabil;
}

export interface AlterarEstadoPeriodoInput {
  estado: EstadoPeriodoContabil;
  utilizadorId?: string;
}

export interface MapeamentoContaDto {
  id: string;
  empresaId: string;
  chave: string;
  contaId: string;
  conta?: {
    id: string;
    codigo: string;
    designacao: string;
    aceitaMovimento: boolean;
  };
}

export interface MapeamentoContaGuardarInput {
  empresaId: string;
  chave: string;
  contaId: string;
}

export type EstadoLancamento = 'rascunho' | 'validado' | 'estornado';
export type OrigemLancamento =
  | 'manual'
  | 'integracao'
  | 'abertura'
  | 'fecho'
  | 'ajustamento'
  | 'liquidacao'
  | 'estorno';
export type TipoEntidadeLancamento = 'cliente' | 'fornecedor' | 'funcionario' | 'outro';

export interface LinhaLancamentoDto {
  id: string;
  lancamentoId: string;
  numeroLinha: number;
  contaId: string;
  debito: string;
  credito: string;
  descricao?: string | null;
  centroCustoId?: string | null;
  entidadeTipo?: TipoEntidadeLancamento | null;
  entidadeId?: string | null;
  codigoImposto?: string | null;
  baseImposto?: string | null;
  dataVencimento?: string | Date | null;
  conciliadoEm?: string | Date | null;
  movimentoTesourariaId?: string | null;
  conta?: {
    id: string;
    codigo: string;
    designacao: string;
    aceitaMovimento: boolean;
    exigeCentroCusto: boolean;
    exigeEntidade: boolean;
  };
  centroCusto?: { id: string; codigo: string; designacao: string } | null;
}

export interface LancamentoContabilDto {
  id: string;
  empresaId: string;
  diarioId: string;
  exercicioId: string;
  periodoId: string;
  numero?: number | null;
  dataContabilistica: string | Date;
  dataDocumento?: string | Date | null;
  descricao: string;
  estado: EstadoLancamento;
  origem: OrigemLancamento;
  moduloOrigem?: string | null;
  tipoOrigem?: string | null;
  origemId?: string | null;
  execucaoFechoId?: string | null;
  estornoDeId?: string | null;
  moeda: string;
  taxaCambio: string;
  totalDebito: string;
  totalCredito: string;
  criadoPorId: string;
  validadoPorId?: string | null;
  validadoEm?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  diario: { id: string; codigo: string; designacao: string };
  periodo: { id: string; numero: number; dataInicio: string | Date; dataFim: string | Date; estado: EstadoPeriodoContabil };
  exercicio: { id: string; ano: string; estado: EstadoExercicio };
  criadoPor: { id: string; nomeCompleto: string };
  validadoPor?: { id: string; nomeCompleto: string } | null;
  linhas?: LinhaLancamentoDto[];
  estornoDe?: { id: string; numero?: number | null; descricao: string } | null;
  estornadoPor?: { id: string; numero?: number | null; descricao: string } | null;
  _count?: { linhas: number };
}

export interface LancamentoContabilCriarInput {
  empresaId: string;
  diarioId: string;
  dataContabilistica: string | Date;
  dataDocumento?: string | Date | null;
  descricao: string;
  origem?: OrigemLancamento;
  moduloOrigem?: string | null;
  tipoOrigem?: string | null;
  origemId?: string | null;
  linhas: Array<{
    contaId: string;
    debito: string;
    credito: string;
    descricao?: string | null;
    centroCustoId?: string | null;
    entidadeTipo?: TipoEntidadeLancamento | null;
    entidadeId?: string | null;
    codigoImposto?: string | null;
    baseImposto?: string | null;
    dataVencimento?: string | Date | null;
  }>;
}

export interface LancamentoContabilAtualizarInput {
  diarioId?: string;
  dataContabilistica?: string | Date;
  dataDocumento?: string | Date | null;
  descricao?: string;
  origem?: OrigemLancamento;
  moduloOrigem?: string | null;
  tipoOrigem?: string | null;
  origemId?: string | null;
  linhas?: Array<{
    contaId: string;
    debito: string;
    credito: string;
    descricao?: string | null;
    centroCustoId?: string | null;
    entidadeTipo?: TipoEntidadeLancamento | null;
    entidadeId?: string | null;
    codigoImposto?: string | null;
    baseImposto?: string | null;
    dataVencimento?: string | Date | null;
  }>;
}

export interface LancamentoContabilEstornarInput {
  dataContabilistica: string | Date;
  descricao?: string | null;
  utilizadorId?: string;
}

export interface LancamentoContabilFiltros {
  empresaId?: string;
  exercicioId?: string;
  periodoId?: string;
  diarioId?: string;
  estado?: EstadoLancamento;
  contaId?: string;
  entidadeTipo?: TipoEntidadeLancamento;
  entidadeId?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LancamentoContabilListResult {
  items: LancamentoContabilDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EstornoLancamentoResultado {
  original: LancamentoContabilDto;
  estorno: LancamentoContabilDto;
}

// ─── Motor de contabilização ────────────────────────────────────────────────

export type LadoLancamento = 'debito' | 'credito';

export interface LinhaRegraContabilizacaoDto {
  id: string;
  regraId: string;
  numeroLinha: number;
  lado: LadoLancamento;
  chaveConta: string;
  expressaoValor: string;
  taxaImposto?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface LinhaRegraContabilizacaoCriarInput {
  numeroLinha: number;
  lado: LadoLancamento;
  chaveConta: string;
  expressaoValor: string;
  taxaImposto?: string | null;
}

export interface LinhaRegraContabilizacaoAtualizarInput {
  numeroLinha?: number;
  lado?: LadoLancamento;
  chaveConta?: string;
  expressaoValor?: string;
  taxaImposto?: string | null;
}

export interface RegraContabilizacaoDto {
  id: string;
  empresaId: string;
  codigo: string;
  designacao: string;
  moduloOrigem: string;
  tipoOrigem: string;
  diarioId: string;
  diario?: { id: string; codigo: string; designacao: string };
  activa: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  linhas: LinhaRegraContabilizacaoDto[];
}

export interface RegraContabilizacaoCriarInput {
  empresaId: string;
  codigo: string;
  designacao: string;
  moduloOrigem: string;
  tipoOrigem: string;
  diarioId: string;
  activa?: boolean;
  linhas: LinhaRegraContabilizacaoCriarInput[];
}

export interface RegraContabilizacaoAtualizarInput {
  codigo?: string;
  designacao?: string;
  moduloOrigem?: string;
  tipoOrigem?: string;
  diarioId?: string;
  activa?: boolean;
  linhas?: LinhaRegraContabilizacaoCriarInput[];
}

export interface ErroIntegracaoContabilDto {
  id: string;
  empresaId: string;
  moduloOrigem: string;
  tipoOrigem: string;
  origemId: string;
  origem: OrigemLancamento;
  codigoErro: string;
  mensagem: string;
  detalhes?: string | null;
  resolvido: boolean;
  resolvidoEm?: string | Date | null;
  resolvidoPorId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  resolvidoPor?: { id: string; nomeCompleto: string } | null;
}

export interface ErroIntegracaoContabilFiltros {
  empresaId?: string;
  resolvido?: boolean;
  moduloOrigem?: string;
  tipoOrigem?: string;
}

// ─── Fecho de período ────────────────────────────────────────────────────────

export type ExecucaoFechoTipo = 'fechoMensal' | 'apuramentoIva' | 'apuramentoResultados' | 'fechoAnual' | 'aberturaExercicioSeguinte';
export type ExecucaoFechoEstado = 'previsao' | 'executado' | 'revertido' | 'falhado';

export interface PassoFechoDto {
  codigo: string;
  descricao: string;
  estado: 'ok' | 'pendente' | 'erro';
  detalhes?: string;
}

export interface PrevisaoFechoDto {
  periodoId: string;
  exercicioId: string;
  passos: PassoFechoDto[];
  podeFechar: boolean;
  bloqueios: string[];
}

export interface ExecucaoFechoDto {
  id: string;
  empresaId: string;
  periodoId: string | null;
  exercicioId: string;
  tipo: ExecucaoFechoTipo;
  estado: ExecucaoFechoEstado;
  iniciadoPorId: string;
  iniciadoEm: string | Date;
  concluidoEm?: string | Date | null;
  detalhes?: string | null;
  createdAt: string | Date;
}

export interface ExecucaoFechoFiltros {
  empresaId?: string;
  periodoId?: string;
  tipo?: ExecucaoFechoTipo;
  estado?: ExecucaoFechoEstado;
}

export interface ReabrirPeriodoInput {
  motivo: string;
}

export interface ExecucaoFechoListResult {
  items: ExecucaoFechoDto[];
  total: number;
}

// ─── Apuramento IVA ──────────────────────────────────────────────────────────

export interface PrevisaoApuramentoIvaDto {
  periodoId: string;
  exercicioId: string;
  ivaLiquidado: string;
  ivaDedutivel: string;
  creditoTransitado: string;
  saldo: string;
  aPagar: string;
  aRecuperar: string;
  detalhes: {
    contasOutput: Array<{ codigo: string; designacao: string; debito: string; credito: string; liquido: string }>;
    contasInput: Array<{ codigo: string; designacao: string; debito: string; credito: string; liquido: string }>;
  };
}

export interface ApuramentoIvaExecutarResultadoDto {
  apuramentoId: string;
  lancamentoId: string;
}

export interface ApuramentoIvaPagamentoInput {
  apuramentoId: string;
  dataPagamento: string | Date;
  contaBancariaId: string;
}

export interface ApuramentoIvaPagamentoResultadoDto {
  lancamentoId: string;
}

export interface ApuramentoImpostoDto {
  id: string;
  periodoId: string;
  exercicioId: string;
  periodoNumero: number;
  ano: string;
  tipoImposto: string;
  estado: string;
  liquidado: string;
  dedutivel: string;
  creditoTransitado: string;
  saldo: string;
  pagoEm: string | Date | null;
  lancamentoId: string | null;
}

// ─── Apuramento de resultados e fecho anual ──────────────────────────────────

export interface ResumoResultadosDto {
  proveitos: string;
  custos: string;
  resultadoOperacional: string;
  resultadoFinanceiro: string;
  resultadoNaoCorrente: string;
  resultadoAntesImpostos: string;
  imposto: string;
  resultadoLiquido: string;
}

export interface DetalheResultadoDto {
  contaId: string;
  codigo: string;
  designacao: string;
  valor: string;
  classe?: 'operating' | 'financial' | 'nonOperating';
}

export interface PrevisaoResultadosDto {
  exercicioId: string;
  ano: string;
  periodosAbertos: number[];
  podeExecutar: boolean;
  bloqueios: string[];
  resumo: ResumoResultadosDto;
  detalhes: {
    proveitos: DetalheResultadoDto[];
    custos: DetalheResultadoDto[];
    imposto: DetalheResultadoDto[];
  };
}

export interface ApuramentoResultadosExecutarResultadoDto {
  execucaoId: string;
  lancamentoId: string;
  resumo: ResumoResultadosDto;
}

export interface PassoFechoAnualDto {
  codigo: string;
  descricao: string;
  estado: 'ok' | 'pendente' | 'erro';
  detalhes?: string;
}

export interface PrevisaoFechoAnualDto {
  exercicioId: string;
  ano: string;
  passos: PassoFechoAnualDto[];
  podeEncerrar: boolean;
  podeAbrir: boolean;
  bloqueios: string[];
  proximoExercicio: { id: string; ano: string } | null;
}

export interface FechoAnualExecutarResultadoDto {
  execucaoId: string;
}

export interface AberturaExercicioResultadoDto {
  exercicioId: string;
  lancamentoId: string;
}

export interface ReabrirExercicioInput {
  motivo: string;
}

// ─── Demonstrações ────────────────────────────────────────────────────────────

export type TipoEstruturaRelatorio = 'balanco' | 'demonstracaoResultados' | 'fluxosCaixa' | 'alteracoesCapitalProprio';
export type TipoLinhaRelatorio = 'activo' | 'passivo' | 'capitalProprio' | 'proveito' | 'custo' | 'resultado' | 'subtotal' | 'total' | 'fluxo' | 'memo';
export type OperacaoLinhaRelatorio = 'saldo' | 'debito' | 'credito' | 'creditoMenosDebito';

export interface ContaEstruturaDto {
  contaId: string;
  codigo: string;
  designacao: string;
  classe: number;
  tipo: string;
  natureza: string;
  sinal: number;
}

export interface LinhaEstruturaDto {
  id: string;
  codigo: string;
  designacao: string;
  parentCodigo: string | null;
  ordem: number;
  nivel: number;
  tipo: TipoLinhaRelatorio;
  operacao: OperacaoLinhaRelatorio;
  sinal: number;
  contas: ContaEstruturaDto[];
}

export interface EstruturaRelatorioDto {
  id: string;
  empresaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoEstruturaRelatorio;
  activa: boolean;
  linhas: LinhaEstruturaDto[];
}

export interface LinhaDemonstracaoDto {
  linhaId: string;
  codigo: string;
  designacao: string;
  nivel: number;
  tipo: TipoLinhaRelatorio;
  sinal: number;
  valor: string;
  valorInicial?: string;
  valorPeriodo?: string;
  valorFinal?: string;
  filhos: LinhaDemonstracaoDto[];
}

export interface DemonstracaoDto {
  estruturaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoEstruturaRelatorio;
  dataInicio: string;
  dataFim: string;
  linhas: LinhaDemonstracaoDto[];
  totais: Record<string, string>;
  avisos: string[];
}

export interface EstruturaRelatorioInput {
  id?: string;
  codigo: string;
  designacao: string;
  tipo: TipoEstruturaRelatorio;
  activa?: boolean;
  linhas: Array<{
    codigo: string;
    designacao: string;
    parentCodigo?: string | null;
    ordem?: number;
    nivel?: number;
    tipo?: TipoLinhaRelatorio;
    operacao?: OperacaoLinhaRelatorio;
    sinal?: number;
    contas?: Array<{ contaId: string; sinal?: number }>;
  }>;
}

// ─── Relatórios contabilísticos ─────────────────────────────────────────────

export interface BalanceteFiltrosDto {
  exercicioId?: string;
  periodoId?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  diarioId?: string;
  classe?: number;
  apenasFolhas?: boolean;
  incluirSaldoZero?: boolean;
  acumulado?: boolean;
  page?: number;
  pageSize?: number;
}

export interface BalanceteLinhaDto {
  contaId: string;
  codigo: string;
  designacao: string;
  nivel: number;
  classe: number;
  natureza: string;
  debito: string;
  credito: string;
  saldo: string;
  linhas: number;
}

export interface BalanceteResultadoDto {
  items: BalanceteLinhaDto[];
  totais: { debito: string; credito: string; saldo: string };
}

export interface RazaoFiltrosDto {
  contaId: string;
  exercicioId?: string;
  periodoId?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  page?: number;
  pageSize?: number;
}

export interface RazaoResultadoDto {
  conta: { id: string; codigo: string; designacao: string; natureza: string; saldoTransitado: string };
  items: Array<{
    id: string;
    numeroLinha: number;
    dataContabilistica: string | Date;
    numeroLancamento: number | null;
    descricaoLancamento: string;
    debito: string;
    credito: string;
    saldoCorrente: string;
    contaCodigo: string;
    contaDesignacao: string;
  }>;
  saldoFinal: string;
}

export interface RelatorioDiariosFiltrosDto {
  exercicioId?: string;
  periodoId?: string;
  diarioId?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  page?: number;
  pageSize?: number;
}

export interface RelatorioDiariosResultadoDto {
  items: Array<{
    id: string;
    numero: number | null;
    dataContabilistica: string | Date;
    dataDocumento: string | Date | null;
    descricao: string;
    estado: string;
    origem: string;
    totalDebito: string;
    totalCredito: string;
    diarioCodigo: string;
    diarioDesignacao: string;
    criadoPor: string;
  }>;
  totais: { debito: string; credito: string };
}

export type EntidadeContaCorrenteTipo = 'cliente' | 'fornecedor' | 'funcionario' | 'outro';

export interface ContaCorrenteFiltrosDto {
  entidadeTipo: EntidadeContaCorrenteTipo;
  entidadeId: string;
  exercicioId?: string;
  periodoId?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  incluirAntiguidade?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ContaCorrenteResultadoDto {
  entidade: { tipo: string; id: string };
  items: Array<{
    id: string;
    numeroLinha: number;
    dataContabilistica: string | Date;
    numeroLancamento: number | null;
    descricaoLancamento: string;
    debito: string;
    credito: string;
    saldoCorrente: string;
    entidadeTipo?: string | null;
    entidadeId?: string | null;
    dataVencimento?: string | Date | null;
  }>;
  saldoFinal: string;
  antiguidade?: { ate30: string; ate60: string; ate90: string; mais90: string };
}

export interface SemearContabilidadeResultadoDto {
  contasCriadas: number;
  contasTotal: number;
  diariosCriados: number;
  diariosTotal: number;
  mapeamentosCriados: number;
  mapeamentosTotal: number;
}

export interface ContaBancariaReconciliavelDto {
  id: string;
  codigo: string;
  designacao: string;
  tipo: 'banco' | 'caixa';
  saldoAtual: string;
  contaContabilId: string | null;
  contaContabil: {
    id: string;
    codigo: string;
    designacao: string;
    natureza: 'devedora' | 'credora';
  } | null;
}

export interface LinhaContabilParaReconciliarDto {
  id: string;
  lancamentoId: string;
  numeroLinha: number;
  contaId: string;
  contaCodigo: string;
  contaDesignacao: string;
  debito: string;
  credito: string;
  dataContabilistica: string | Date;
  descricao?: string | null;
  conciliadoEm?: string | Date | null;
  movimentoTesourariaId?: string | null;
  lancamentoNumero?: number | null;
  lancamentoDescricao: string;
}

export interface MovimentoTesourariaParaReconciliarDto {
  id: string;
  numero: string;
  data: string | Date;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  valor: string;
  descricao?: string | null;
  conciliado: boolean;
  dataConciliacao?: string | Date | null;
  observacaoExtrato?: string | null;
  contaBancariaId: string;
  contaBancariaCodigo: string;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
}

export interface SugestaoReconciliacaoDto {
  linha: LinhaContabilParaReconciliarDto;
  movimento: MovimentoTesourariaParaReconciliarDto;
  diferencaDias: number;
  valorExato: boolean;
}

export interface ResumoReconciliacaoDto {
  contaBancaria: {
    id: string;
    codigo: string;
    designacao: string;
    saldoAtual: string;
  };
  contaContabil: {
    id: string;
    codigo: string;
    designacao: string;
    saldoContabilistico: string;
  };
  itensEmTransito: {
    soNoExtrato: MovimentoTesourariaParaReconciliarDto[];
    soNaContabilidade: LinhaContabilParaReconciliarDto[];
  };
  diferenca: string;
}

export interface ConciliarInput {
  pares: Array<{ linhaId: string; movimentoId: string }>;
}

export interface DesconciliarInput {
  linhaIds: string[];
}

export interface GerarLancamentoDeMovimentoInput {
  movimentoId: string;
  contaContabilId: string;
}

export interface SerieDocumentoDto {
  id: string;
  codigo: string;
  descricao: string;
  empresaId: string;
  tipoDocumento?: TipoSerieDocumento | null;
  modulosJson: string;
  dataInicio: string | Date;
  dataFim: string | Date;
  ultimoLancamento: number;
  estado: string;
  createdAt: string | Date;
  empresa?: {
    id: string;
    nome: string;
    nif: string;
    identificador?: string | null;
  };
}

export interface EmpresaConfigDto {
  id: string;
  identificador?: string | null;
  nome: string;
  nif: string;
  endereco: string;
  pais: 'PT' | 'AO' | 'outro';
  cae?: string | null;
  regimeIva: 'geral' | 'simplificado' | 'isento';
  regimeIvaTipo?: string | null;
  motivoIsencao?: string | null;
  moedaBase: string;
  moedaAlternativa?: string | null;
  modulosJson?: string | null;
  mesInicial?: string | Date | null;
  mesFinal?: string | Date | null;
  anoFiscalInicio: string | Date;
  anoFiscalFim: string | Date;
  serieDefault?: string | null;
  dadosBancarios?: string | null;
  telefone?: string | null;
  email?: string | null;
  logotipoUrl?: string | null;
  diasAlertaValidade?: number | null;
  createdAt?: string | Date;
  exercicios?: ExercicioFiscalDto[];
  series?: SerieDocumentoDto[];
}

export interface IpcSuccess<T> {
  success: true;
  data: T;
}

export interface IpcError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type IpcResponse<T> = IpcSuccess<T> | IpcError;

export interface ArtigoDto {
  id: string;
  codigo: string;
  descricao: string;
  tipo: 'produto_acabado' | 'materia_prima' | 'produto_intermedio' | 'consumivel' | 'servico';
  unidade: 'UN' | 'KG' | 'L' | 'CX' | 'M' | 'M2' | 'M3' | 'M²' | 'M³';
  familia?: string | null;
  codigoBarras?: string | null;
  estado: 'ativo' | 'descontinuado' | 'inativo';
  precoVenda: number;
  taxaIva: number;
  fatorConversao?: number | null;
  stockMinimo: number;
  stockMaximo: number;
  pontoEncomenda: number;
  controloLote: boolean;
  armazemPadraoId?: string | null;
  precoCustoMedio: number;
  bom?: string | null;
  observacoes?: string | null;
  createdAt?: string | Date;
}

export interface ClienteDto {
  id: string;
  codigo: string;
  nome: string;
  nif: string;
  tipo: 'particular' | 'empresa';
  email?: string | null;
  telefone?: string | null;
  endereco: string;
  cidade?: string | null;
  codigoPostal?: string | null;
  pais: 'PT' | 'AO' | 'outro';
  condPagamento?: string | null;
  metodoPagamento?: string | null;
  limiteCredito: number;
  saldoContaCorrente: number;
  descontoPadrao: number;
  moeda: string;
  vendedor?: string | null;
  estado: 'ativo' | 'inativo' | 'bloqueado';
  regimeIva: 'geral' | 'isento' | 'misto';
  retencaoFonte: number;
  observacoes?: string | null;
  createdAt?: string | Date;
}

export interface FornecedorDto {
  id: string;
  codigo: string;
  nome: string;
  nif: string;
  email?: string | null;
  telefone?: string | null;
  endereco: string;
  codigoPostal?: string | null;
  pais: 'PT' | 'AO' | 'outro';
  condPagamento?: string | null;
  iban?: string | null;
  prazoEntregaDias: number;
  estado: 'ativo' | 'bloqueado';
  retencaoFonte: number;
  saldoContaCorrente: number;
  observacoes?: string | null;
  createdAt?: string | Date;
}

export type TipoArmazem = 'materia_prima' | 'produto_acabado' | 'producao' | 'devolucoes';

export interface ArmazemDto {
  id: string;
  codigo: string;
  designacao: string;
  tipo: TipoArmazem | null;
  localizacao?: string | null;
  responsavel?: string | null;
  isDefaultVendas: boolean;
  isDefaultCompras: boolean;
  ativo: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ArmazemStockDetailDto {
  armazem: ArmazemDto;
  artigos: Array<{
    artigoId: string;
    codigo: string;
    descricao: string;
    unidade: string;
    stockAtual: number;
    precoCustoMedio: number;
    valorTotal: number;
  }>;
  totalItens: number;
  valorTotalArmazem: number;
}

/** Estados do saldo em `estoques` (enum `EstadoEstoque`). */
export type EstadoStockLocal = 'disponivel' | 'quarentena' | 'bloqueado' | 'esgotado';

export interface AreaArmazemDto {
  id: string;
  armazemId: string;
  codigo: string;
  designacao: string;
  tipo?: string | null;
  descricao?: string | null;
  ativo: boolean;
}

export interface ZonaArmazemDto {
  id: string;
  areaId: string;
  codigo: string;
  designacao: string;
  descricao?: string | null;
  altaRotacao: boolean;
  temperaturaControlada: boolean;
  ativo: boolean;
}

export interface LocalizacaoArmazemDto {
  id: string;
  zonaId: string;
  parentId?: string | null;
  codigo: string;
  designacao?: string | null;
  tipo: string;
  ativo: boolean;
  bloqueada: boolean;
  isPickable: boolean;
  isPutaway: boolean;
  capacidadeQuantidade?: number | null;
  capacidadePeso?: number | null;
  capacidadeVolume?: number | null;
}

/** Nó da árvore de estrutura (TASK-027): uma localização com os filhos. */
export interface NoLocalizacaoDto extends LocalizacaoArmazemDto {
  permitirMixProdutos: boolean;
  permitirMixLotes: boolean;
  filhos: NoLocalizacaoDto[];
}

/** Uma zona com as suas localizações, dentro da árvore. */
export interface ZonaEstruturaDto extends ZonaArmazemDto {
  localizacoes: NoLocalizacaoDto[];
}

/** Raiz da árvore: uma área com as suas zonas. */
export interface ArvoreLocalizacaoDto {
  area: AreaArmazemDto;
  zonas: ZonaEstruturaDto[];
}

/**
 * Uma linha de stock por localização (TASK-029).
 *
 * A árvore `localização → zona → área` vem achatada: a tabela tem uma coluna
 * por nível, e `null` significa stock sem endereço físico (decisão D4), não
 * "campo por preencher".
 */
export interface StockLocalizacaoDto {
  id: string;
  estado: EstadoStockLocal;
  quantidade: number;
  quantidadeReservada: number;
  disponivel: number;
  custoUnitario: number;
  valorTotal: number;
  artigo: { id: string; codigo: string; descricao: string; unidade: string };
  armazem: { id: string; codigo: string; designacao: string };
  lote: { id: string; numeroLote: string; dataValidade?: string | Date | null } | null;
  localizacao: { id: string; codigo: string; designacao: string | null; bloqueada: boolean } | null;
  zona: { id: string; codigo: string; designacao: string } | null;
  area: { id: string; codigo: string; designacao: string } | null;
}

/** Estado de um lote face à sua data de validade. */
export type EstadoValidadeLote = 'valido' | 'proximo_caducar' | 'caducado' | 'sem_validade';

/** Lote de um artigo (TASK-041). */
export interface LoteDto {
  id: string;
  artigoId: string;
  numeroLote: string;
  dataFabrico?: string | Date | null;
  dataValidade?: string | Date | null;
  fornecedorId?: string | null;
  precoCusto?: number | null;
  observacoes?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  artigo?: { id: string; codigo: string; descricao: string; unidade: string };
  fornecedor?: { id: string; nome: string } | null;
}

/** Filtros do ecrã de stock por localização (TASK-029). */
export interface FiltrosStockLocalizacao {
  armazemId?: string;
  areaId?: string;
  zonaId?: string;
  localizacaoId?: string;
  artigoId?: string;
  loteId?: string;
  numeroLote?: string;
  estado?: EstadoStockLocal;
  apenasComSaldo?: boolean;
  skip?: number;
  take?: number;
}

export interface MovimentoStockDto {
  id: string;
  numero: string;
  data: string | Date;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste' | 'consumo_producao';
  artigoId: string;
  quantidade: number;
  armazemOrigemId?: string | null;
  armazemDestinoId?: string | null;
  lote?: string | null;
  documentoOrigem: string;
  custoUnitario: number;
  artigo?: ArtigoDto;
  armazemOrigem?: ArmazemDto | null;
  armazemDestino?: ArmazemDto | null;
}

export interface LinhaEncomendaCompraDto {
  id?: string;
  artigoId: string;
  quantidade: number;
  quantidadeRecebida?: number;
  precoAcordado: number;
  taxaIva: number;
  totalLinha?: number;
  artigo?: ArtigoDto;
}

export interface EncomendaCompraDto {
  id: string;
  numero: string;
  data: string | Date;
  fornecedorId: string;
  dataRecepcao?: string | Date | null;
  armazemDestinoId?: string | null;
  estado: 'aberta' | 'parcial' | 'recebida' | 'cancelada';
  observacoes?: string | null;
  totalIliquido: number;
  totalIva: number;
  totalLiquido: number;
  createdAt?: string | Date;
  fornecedor?: FornecedorDto;
  armazemDestino?: ArmazemDto;
  linhas: LinhaEncomendaCompraDto[];
}

export interface LinhaGuiaRecepcaoDto {
  id?: string;
  artigoId: string;
  quantidade: number;
  precoCusto?: number;
  lote?: string | null;
  validade?: string | Date | null;
  artigo?: ArtigoDto;
}

export interface GuiaRecepcaoDto {
  id: string;
  numero: string;
  data: string | Date;
  fornecedorId?: string | null;
  encomendaId?: string | null;
  armazemDestinoId: string;
  conformidade: 'conforme' | 'divergente';
  observacoes?: string | null;
  estado: string;
  createdAt?: string | Date;
  encomenda?: EncomendaCompraDto | null;
  armazemDestino?: ArmazemDto;
  linhas: LinhaGuiaRecepcaoDto[];
}

export interface LinhaFaturaCompraDto {
  id?: string;
  artigoId: string;
  quantidade: number;
  precoUnitario: number;
  taxaIva: number;
  totalLinha?: number;
  artigo?: ArtigoDto;
}

export interface FaturaCompraDto {
  id: string;
  numeroInterno: string;
  numeroFornecedor: string;
  dataEmissao: string | Date;
  dataVencimento: string | Date;
  fornecedorId: string;
  guiaRecepcaoId?: string | null;
  estadoPagamento: 'pago' | 'pendente' | 'parcial' | 'vencido';
  retencaoFonte: number;
  totalIliquido: number;
  totalIva: number;
  totalLiquido: number;
  createdAt?: string | Date;
  fornecedor?: FornecedorDto;
  linhas: LinhaFaturaCompraDto[];
}

export interface LinhaFaturaVendaDto {
  id?: string;
  faturaId?: string;
  artigoId: string;
  artigoCodigo: string;
  artigoDescricao: string;
  artigoUnidade: string;
  quantidade: number;
  precoUnitario: number;
  desconto?: number;
  taxaIva: number;
  motivoIsencao?: string | null;
  totalLinha: number;
  artigo?: ArtigoDto;
}

export interface FaturaVendaDto {
  id: string;
  empresaId?: string | null;
  numero: string;
  serie: string;
  tipo: 'fatura' | 'fatura_recibo' | 'nota_credito' | 'nota_debito';
  estadoDocumento: EstadoDocumentoFiscal;
  dataEmissao: string | Date;
  dataVencimento: string | Date;
  clienteId: string;
  clienteNome: string;
  clienteNif: string;
  clienteEndereco: string;
  faturaOrigemId?: string | null;
  proformaOrigemId?: string | null;
  guiaEntregaOrigemId?: string | null;
  motivoNotaCredito?: string | null;
  motivoAnulacao?: string | null;
  anuladaEm?: string | Date | null;
  encomendaOrigem?: string | null;
  motivoIsencao?: string | null;
  estadoPagamento: 'pago' | 'pendente' | 'parcial' | 'vencido';
  /// Liquidação de uma Fatura-Recibo.
  meioPagamento?: 'numerario' | 'transferencia' | 'cheque' | 'multicaixa' | null;
  contaBancariaId?: string | null;
  dataPagamento?: string | Date | null;
  atcud?: string | null;
  hashAssinatura?: string | null;
  totalIliquido: number;
  totalIva: number;
  totalLiquido: number;
  createdAt?: string | Date;
  empresa?: EmpresaConfigDto | null;
  cliente?: ClienteDto;
  faturaOrigem?: FaturaVendaDto | null;
  proformaOrigem?: ProformaVendaDto | null;
  guiaEntregaOrigem?: GuiaEntregaDto | null;
  notasCredito?: FaturaVendaDto[];
  linhas: LinhaFaturaVendaDto[];
  imputacoesRecibo?: ImputacaoReciboDto[];
}

export interface LinhaProformaVendaDto {
  id?: string;
  proformaId?: string;
  artigoId: string;
  artigoCodigo: string;
  artigoDescricao: string;
  artigoUnidade: string;
  quantidade: number;
  precoUnitario: number;
  desconto?: number;
  taxaIva: number;
  motivoIsencao?: string | null;
  totalLinha: number;
  artigo?: ArtigoDto;
}

export interface ProformaVendaDto {
  id: string;
  empresaId?: string | null;
  numero: string;
  serie: string;
  dataEmissao: string | Date;
  dataValidade: string | Date;
  moeda: string;
  clienteId: string;
  clienteNome: string;
  clienteNif: string;
  clienteEndereco: string;
  encomendaOrigem?: string | null;
  motivoIsencao?: string | null;
  estado: EstadoProforma;
  motivoAnulacao?: string | null;
  anuladaEm?: string | Date | null;
  totalIliquido: number;
  totalIva: number;
  totalLiquido: number;
  createdAt?: string | Date;
  empresa?: EmpresaConfigDto | null;
  cliente?: ClienteDto;
  guiaEntrega?: GuiaEntregaDto | null;
  faturaVenda?: FaturaVendaDto | null;
  linhas: LinhaProformaVendaDto[];
}

export interface LinhaGuiaEntregaDto {
  id?: string;
  guiaId?: string;
  artigoId: string;
  artigoCodigo: string;
  artigoDescricao: string;
  artigoUnidade: string;
  quantidade: number;
  lote?: string | null;
  artigo?: ArtigoDto;
}

export interface GuiaEntregaDto {
  id: string;
  empresaId?: string | null;
  numero: string;
  serie: string;
  data: string | Date;
  clienteId: string;
  clienteNome: string;
  clienteNif: string;
  clienteEndereco: string;
  armazemExpedicaoId: string;
  armazemDesignacao: string;
  proformaOrigemId?: string | null;
  encomendaOrigem?: string | null;
  localEntrega?: string | null;
  transportador?: string | null;
  observacoes?: string | null;
  estado: EstadoGuiaEntrega;
  motivoAnulacao?: string | null;
  anuladaEm?: string | Date | null;
  createdAt?: string | Date;
  empresa?: EmpresaConfigDto | null;
  cliente?: ClienteDto;
  armazemExpedicao?: ArmazemDto;
  proformaOrigem?: ProformaVendaDto | null;
  faturaVenda?: FaturaVendaDto | null;
  linhas: LinhaGuiaEntregaDto[];
}

export interface ImputacaoReciboDto {
  id?: string;
  reciboId?: string;
  faturaId: string;
  valorImputado: number;
  fatura?: FaturaVendaDto;
}

export interface ReciboVendaDto {
  id: string;
  empresaId?: string | null;
  numero: string;
  serie: string;
  estadoDocumento: EstadoDocumentoFiscal;
  data: string | Date;
  clienteId: string;
  clienteNome: string;
  clienteNif: string;
  clienteEndereco: string;
  meioPagamento: 'numerario' | 'transferencia' | 'cheque' | 'multicaixa';
  valorRecebido: number;
  /// Texto livre legado; em recibos novos guarda a designação da conta.
  contaBancaria?: string | null;
  contaBancariaId?: string | null;
  sessaoCaixaId?: string | null;
  retencaoFonte: number;
  observacoes?: string | null;
  motivoAnulacao?: string | null;
  anuladaEm?: string | Date | null;
  createdAt?: string | Date;
  empresa?: EmpresaConfigDto | null;
  cliente?: ClienteDto;
  imputacoes: ImputacaoReciboDto[];
}

// =============================================================================
// Tesouraria
// =============================================================================

export type TipoContaBancaria = 'banco' | 'caixa';

export type TipoMovimentoTesouraria = 'entrada' | 'saida' | 'transferencia' | 'ajuste';

export type EstadoMovimentoTesouraria = 'pendente' | 'confirmado' | 'estornado';

export type TipoDocumentoTesouraria =
  | 'manual'
  | 'recibo_venda'
  | 'fatura_venda'
  | 'fatura_compra'
  | 'guia_recepcao';

export type EstadoSessaoCaixa = 'aberta' | 'fechada';

export interface ContaBancariaDto {
  id: string;
  /// Obrigatório: uma conta pertence sempre a uma empresa.
  empresaId: string;
  contaContabilId?: string | null;
  codigo: string;
  designacao: string;
  tipo: TipoContaBancaria;
  nomeBanco?: string | null;
  iban?: string | null;
  swiftBic?: string | null;
  saldoInicial: number;
  saldoAtual: number;
  moeda: string;
  ativo: boolean;
  observacoes?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** Conta com o saldo derivado já calculado pelo backend. */
export interface ContaBancariaComSaldoDto extends Omit<ContaBancariaDto, 'saldoAtual'> {
  saldo: number;
}

export interface ContaContabilDisponivelDto {
  id: string;
  codigo: string;
  designacao: string;
  natureza: 'devedora' | 'credora';
}

export interface ResumoSaldoContaDto {
  contaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoContaBancaria;
  moeda: string;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalMovimentos: number;
  movimentosConciliados: number;
  movimentosNaoConciliados: number;
}

export interface MovimentoTesourariaDto {
  id: string;
  empresaId?: string | null;
  numero: string;
  data: string | Date;
  tipo: TipoMovimentoTesouraria;
  contaOrigemId?: string | null;
  contaDestinoId?: string | null;
  valor: number;
  documentoTipo: TipoDocumentoTesouraria;
  documentoId?: string | null;
  documentoNumero?: string | null;
  descricao?: string | null;
  estado: EstadoMovimentoTesouraria;
  /// Vem do documento que originou o movimento. É o que separa numerário de
  /// multicaixa na arqueação da caixa.
  meioPagamento?: string | null;
  utilizadorId?: string | null;
  sessaoCaixaId?: string | null;
  movimentoEstornoId?: string | null;
  conciliado: boolean;
  dataConciliacao?: string | Date | null;
  observacaoExtrato?: string | null;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
  createdAt?: string | Date;
  contaOrigem?: { id: string; codigo: string; designacao: string } | null;
  contaDestino?: { id: string; codigo: string; designacao: string } | null;
  utilizador?: { id: string; nomeCompleto: string } | null;
  sessaoCaixa?: { id: string; numero: string } | null;
  estornoDe?: { id: string; numero: string } | null;
  estornos?: Array<{ id: string; numero: string }>;
}

export interface ResumoTesourariaDto {
  totalEntradas: number;
  totalSaidas: number;
  resultado: number;
  totalMovimentos: number;
  movimentosPendentes: number;
  movimentosNaoConciliados: number;
  porTipo: Record<string, { quantidade: number; total: number }>;
}

export interface SessaoCaixaDto {
  id: string;
  empresaId: string;
  contaCaixaId: string;
  numero: string;
  dataAbertura: string | Date;
  horaAbertura: string | Date;
  fundoInicial: number;
  estado: EstadoSessaoCaixa;
  dataFecho?: string | Date | null;
  horaFecho?: string | Date | null;
  /// Totais ESPERADOS, congelados no fecho pela mesma regra da sessão aberta.
  totalEntradas: number;
  totalSaidas: number;
  totalNumerario: number;
  totalMulticaixa: number;
  totalTransferencia: number;
  totalEsperado: number;
  /// O que o operador contou à mão, e a diferença para o esperado.
  totalContado?: number | null;
  diferenca?: number | null;
  observacoes?: string | null;
  utilizadorAberturaId?: string | null;
  utilizadorFechoId?: string | null;
  contaCaixa?: { id: string; codigo: string; designacao: string };
  utilizadorAbertura?: { id: string; nomeCompleto: string } | null;
  utilizadorFecho?: { id: string; nomeCompleto: string } | null;
}

export interface ApuramentoSessaoDto {
  fundoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  totalNumerario: number;
  totalMulticaixa: number;
  totalTransferencia: number;
  totalEsperado: number;
  totalContado: number | null;
  diferenca: number | null;
  estado: EstadoSessaoCaixa;
  movimentos: number;
}

export interface ContaBancariaCriarInput {
  empresaId: string;
  contaContabilId?: string | null;
  codigo: string;
  designacao: string;
  tipo: TipoContaBancaria;
  nomeBanco?: string | null;
  iban?: string | null;
  swiftBic?: string | null;
  saldoInicial?: number;
  moeda?: string;
  observacoes?: string | null;
  ativo?: boolean;
}

export type ContaBancariaAtualizarInput = Partial<
  Omit<ContaBancariaCriarInput, 'codigo' | 'saldoInicial' | 'moeda'>
> & {
  /// A empresa dona da conta. Sem ela, qualquer conta poderia ser editada.
  empresaId: string;
};

export interface MovimentoTesourariaCriarInput {
  empresaId: string;
  data: string | Date;
  tipo: TipoMovimentoTesouraria;
  contaOrigemId?: string | null;
  contaDestinoId?: string | null;
  valor: number;
  meioPagamento?: string | null;
  descricao?: string | null;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
  observacaoExtrato?: string | null;
  conciliado?: boolean;
  dataConciliacao?: string | Date | null;
}

export interface MovimentoTesourariaFilters {
  empresaId?: string;
  contaId?: string;
  tipo?: TipoMovimentoTesouraria;
  estado?: EstadoMovimentoTesouraria;
  conciliado?: boolean;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  search?: string;
  skip?: number;
  take?: number;
}

export interface ConciliacaoLoteInput {
  empresaId: string;
  contaBancariaId: string;
  movimentosIds: string[];
  dataConciliacao: string | Date;
  conciliado?: boolean;
}

export interface AbrirSessaoCaixaInput {
  empresaId: string;
  contaCaixaId: string;
  dataAbertura: string | Date;
  fundoInicial: number;
  utilizadorId?: string;
}

export interface FecharSessaoCaixaInput {
  totalNumerario: number;
  totalMulticaixa: number;
  totalTransferencia: number;
  observacoes?: string | null;
  utilizadorId?: string;
}

export interface ValidacaoMeioPagamentoDto {
  exigeSessao: boolean;
  sessaoAberta: boolean;
  numeroSessao: string | null;
}

export interface LinhaInventarioDto {
  id?: string;
  artigoId: string;
  qtdSistema: number;
  qtdContada: number;
  diferenca: number;
  lote?: string | null;
  artigo?: ArtigoDto;
}

export interface InventarioContagemDto {
  id: string;
  numero: string;
  data: string | Date;
  armazemId: string;
  estado: 'em_curso' | 'fechado' | 'cancelado';
  responsavel?: string | null;
  observacoes?: string | null;
  createdAt?: string | Date;
  armazem?: ArmazemDto;
  linhas: LinhaInventarioDto[];
}

  export interface AlertaStockDto {
    artigoId: string;
    codigo: string;
    descricao: string;
    unidade: string;
    estado: string;
    stockAtual: number;
    stockMinimo: number;
    stockMaximo: number;
    pontoEncomenda: number;
    precoCustoMedio: number;
    valorTotal: number;
    situacao: 'normal' | 'stock_baixo' | 'rutura' | 'proximo_caducar' | 'caducado';
    /** Data de validade mais próxima dos lotes deste artigo, se houver. */
    loteValidadeMaisProxima?: string | Date | null;
    /** Quantidade de lotes a caducar dentro da janela de alerta. */
    qtdLotesProximosCaducar?: number;
    /** Quantidade de lotes já caducados. */
    qtdLotesCaducados?: number;
  }

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

// =============================================================================
// Fiscal (SPRINT 5)
// =============================================================================

/** Severidade de um problema encontrado na validação. */
export type SeveridadeProblemaFiscal = 'erro' | 'aviso';

export interface ProblemaFiscalDto {
  /** Código estável (`SAFT-014`, `AGT-009`…), citável por teste e pela UI. */
  codigo: string;
  severidade: SeveridadeProblemaFiscal;
  mensagem: string;
  /** Caminho do campo, quando o problema é localizável. */
  caminho?: string;
}

export interface ValidacaoSaftDto {
  valido: boolean;
  totalErros: number;
  totalAvisos: number;
  /**
   * O que o validador garante. A UI tem de mostrar isto ao lado do resultado
   * para não prometer validação normativa contra o XSD.
   */
  ambito: string;
  problemas: ProblemaFiscalDto[];
}

export interface EstatisticasSaftDto {
  documentos: number;
  clientes: number;
  artigos: number;
  taxas: number;
  totalLiquido: number;
}

export interface ResultadoGerarSaftDto {
  nomeFicheiro: string;
  caminho: string;
  hashFicheiro: string;
  estatisticas: EstatisticasSaftDto;
  avisos: number;
  problemas: ProblemaFiscalDto[];
}

export interface ResultadoValidarSaftDto extends EstatisticasSaftDto {
  nomeFicheiro: string;
  valido: boolean;
  totalErros: number;
  totalAvisos: number;
  ambito: string;
  problemas: ProblemaFiscalDto[];
}

export type EstadoSubmissaoAgtDto = 'rascunho' | 'assinado' | 'submetido' | 'aceite' | 'rejeitado';

export interface ProblemaConformidadeAgtDto {
  codigo: string;
  severidade: 'erro' | 'aviso' | 'info';
  mensagem: string;
  campo?: string;
}

export interface ConformidadeAgtDto {
  conforme: boolean;
  problemas: ProblemaConformidadeAgtDto[];
  resumo: { erros: number; avisos: number };
}

export interface DocumentoAgtDto {
  id: string;
  numero: string;
  conforme: boolean;
  /** `ATC-UD` em Base64, ou `null` se o documento não era conforme. */
  assinatura: string | null;
  problemas: ProblemaConformidadeAgtDto[];
}

export interface FicheiroAgtDto {
  id: string;
  nomeFicheiro: string;
  hashFicheiro: string;
  versao: string;
  periodo: string;
  conformidade: ConformidadeAgtDto;
  documentos: DocumentoAgtDto[];
}

export interface SubmissaoAgtDto {
  id: string;
  nomeFicheiro: string;
  versao: string;
  moeda: string;
  periodo: string;
  estado: EstadoSubmissaoAgtDto;
  hashFicheiro: string;
  hashAssinatura: string | null;
  conformidade: ConformidadeAgtDto | null;
  submittedAt: string | Date | null;
  dataHora: string | Date;
}

/** Período comum a SAF-T e AGT. `mes: null` significa o ano inteiro. */
export interface PeriodoFiscalDto {
  empresaId: string;
  ano: number;
  mes?: number | null;
  incluirAnulados?: boolean;
}

export interface SoftwareAgtDto {
  nome: string;
  versao: string;
  chaveSeguranca: string;
  certificado: string;
}

// =============================================================================
// Relatórios (SPRINT 6, REL-01)
// =============================================================================

/** Período fechado e inclusivo, em `AAAA-MM-DD`. */
export interface PeriodoRelatorioDto {
  empresaId: string;
  de: string;
  ate: string;
}

export type NomeRelatorioDto =
  | 'vendasPorMes'
  | 'topArtigos'
  | 'topClientes'
  | 'stockBaixo'
  | 'valorizacao'
  | 'ivaPorTaxa'
  | 'fluxoTesourariaPorMes'
  | 'folhaVencimentos'
  | 'resumoIrt'
  | 'resumoInss'
  | 'mapaFerias'
  | 'mapaAusencias'
  | 'dividasAbertas'
  | 'custoDepartamento';

export interface SerieMensalDto {
  mes: string;
  total: number;
  quantidade: number;
}

export interface LinhaTopArtigoDto {
  artigoId: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  total: number;
}

export interface LinhaTopClienteDto {
  clienteId: string;
  nome: string;
  nif: string;
  faturas: number;
  total: number;
  totalPago: number;
  emDivida: number;
}

export interface LinhaStockBaixoDto {
  artigoId: string;
  codigo: string;
  descricao: string;
  stockMinimo: number;
  pontoEncomenda: number;
  stockAtual: number;
  suggestaoEncomenda: number;
}

export interface LinhaValorizacaoDto {
  artigoId: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  custoUnitario: number;
  valor: number;
}

export interface LinhaFluxoTesourariaDto {
  mes: string;
  entradas: number;
  saidas: number;
  liquido: number;
}

export interface LinhaIvaDto {
  taxa: number;
  base: number;
  iva: number;
  liquido: number;
}

export interface ResumoExecutivoDto {
  totalVendas: number;
  totalNotasCredito: number;
  totalCompras: number;
  totalIvaLiquidado: number;
  resultado: number;
  numeroFaturas: number;
  numeroClientes: number;
  margemBruta: number;
  margemBrutaPercentagem: number;
}

export interface RelatorioCompletoDto {
  resumo: ResumoExecutivoDto;
  vendasPorMes: SerieMensalDto[];
  fluxoTesourariaPorMes: LinhaFluxoTesourariaDto[];
  topArtigos: LinhaTopArtigoDto[];
  topClientes: LinhaTopClienteDto[];
  stockBaixo: LinhaStockBaixoDto[];
  valorizacao: LinhaValorizacaoDto[];
  ivaPorTaxa: LinhaIvaDto[];
  folhaVencimentos: LinhaFolhaVencimentoDto[];
  resumoIrt: ResumoIrtDto | null;
  resumoInss: ResumoInssDto | null;
  mapaFerias: LinhaMapaFeriasDto[];
  mapaAusencias: LinhaMapaAusenciasDto[];
  dividasAbertas: LinhaDividasAbertasDto[];
  custoDepartamento: LinhaCustoDepartamentoDto[];
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

export interface AuditoriaLogDto {
  id: string;
  empresaId: string;
  utilizadorId: string | null;
  utilizadorLogin: string | null;
  acao: string;
  severidade: 'info' | 'aviso' | 'critico';
  entidade: string;
  entidadeId: string | null;
  modulo: string;
  descricao: string;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
  enderecoIp: string | null;
  agenteUtilizador: string | null;
  integridade: string | null;
  dataHora: string | Date;
  /** Se true, o registo foi arquivado (soft-delete) e não aparece nas listagens padrão. */
  arquivado: boolean;
}

export interface ListaAuditoriaDto {
  registos: AuditoriaLogDto[];
  /** `null` quando não há mais páginas. */
  proximoCursor: string | null;
  total: number;
}

export interface VerificacaoIntegridadeDto {
  totalVerificados: number;
  adulterados: Array<{
    id: string;
    dataHora: string | Date;
    esperado: string;
    obtido: string;
  }>;
  integro: boolean;
}

export interface DocumentoPrintDto {
  tipoDocumento: TipoSerieDocumento;
  tituloDocumento: string;
  numero: string;
  serie: string;
  dataEmissao: string | Date;
  dataVencimento?: string | Date | null;
  estado: string;
  moeda: string;
  atcud?: string | null;
  hashAssinatura?: string | null;
  qrPayload?: string | null;
  qrDataUrl?: string | null;
  emissor: {
    nome: string;
    nif: string;
    endereco: string;
    pais: string;
    telefone?: string | null;
    email?: string | null;
    logotipoUrl?: string | null;
    dadosBancarios?: string | null;
    regimeIva?: string | null;
    motivoIsencao?: string | null;
  };
  destinatario: {
    nome: string;
    nif: string;
    endereco: string;
    pais?: string | null;
    telefone?: string | null;
    email?: string | null;
  };
  linhas: Array<{
    codigo: string;
    descricao: string;
    unidade: string;
    quantidade: number;
    precoUnitario: number;
    desconto: number;
    taxaIva: number;
    valorIva: number;
    motivoIsencao?: string | null;
    totalLinha: number;
    lote?: string | null;
  }>;
  totais: {
    totalIliquido: number;
    totalDesconto: number;
    totalIva: number;
    totalLiquido: number;
    retencaoFonte?: number;
    resumoIva: Array<{
      taxa: number;
      baseIncidencia: number;
      valorIva: number;
      motivoIsencao?: string | null;
    }>;
  };
  documentoOrigem?: {
    tipo: string;
    numero: string;
  } | null;
  observacoes?: string | null;
  notice?: string | null;
  pagamento?: {
    meioPagamento: string;
    valorRecebido: number;
    retencaoFonte: number;
    saldoAdiantamento: number;
    contaBancaria?: string | null;
    imputacoes: Array<{
      faturaNumero: string;
      valorImputado: number;
    }>;
  } | null;
  dadosBancarios?: string | null;
  contasBancarias?: Array<{
    banco: string;
    iban: string;
    swift?: string | null;
  }>;
}

/** Módulos do RBAC (espelho de `MODULOS_RBAC` no Main). */
export type ModuloRbac =
  | 'vendas'
  | 'compras'
  | 'estoque'
  | 'comercial'
  | 'financas'
  | 'fiscal'
  | 'rh'
  | 'configuracoes'
  | 'relatorios';

/** Acções de controlo de acesso por módulo. */
export type AcaoRbac = 'read' | 'write' | 'delete' | 'approve' | 'admin';

/**
 * Matriz de permissões de um perfil. Cada módulo pode ter acesso total (`true`)
 * ou um conjunto de acções (ex.: `['read', 'write']`).
 */
export type PermissoesRbac = Partial<Record<ModuloRbac, boolean | AcaoRbac[]>>;

/** Resultado do canal de diagnóstico `rh:sistema:ping`. */
export interface RhPingDto {
  modulo: 'rh';
  ok: true;
  utilizadorId: string;
  empresaId: string | null;
  podeVerSalarios: boolean;
  timestamp: string;
}

// ── RH · Cadastros e configuração (Fase 1) ───────────────────────────────────

export type RhTipoRubricaDto = 'REMUNERACAO' | 'DESCONTO' | 'ENCARGO_PATRONAL';
export type RhNaturezaRubricaDto = 'FIXA' | 'VARIAVEL' | 'EXTRAORDINARIA';
export type RhFormaCalculoRubricaDto =
  | 'VALOR_FIXO'
  | 'PERCENTAGEM_SALARIO'
  | 'VALOR_X_QUANTIDADE'
  | 'SISTEMA';

export interface RhDepartamentoDto {
  id: string;
  empresaId: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhCargoDto {
  id: string;
  empresaId: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhRubricaDto {
  id: string;
  empresaId: string;
  codigo: string;
  descricao: string;
  tipo: RhTipoRubricaDto;
  natureza: RhNaturezaRubricaDto;
  formaCalculo: RhFormaCalculoRubricaDto;
  valorPadrao: number | null;
  percentagem: number | null;
  incideIRT: boolean;
  incideINSS: boolean;
  limiteIsencaoIRT: number | null;
  limiteIsencaoINSS: number | null;
  ordemRecibo: number;
  sistema: boolean;
  codigoSistema: string | null;
  contaDebitoId: string | null;
  contaCreditoId: string | null;
  ativo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhTipoAusenciaDto {
  id: string;
  empresaId: string;
  codigo: string;
  descricao: string;
  justificada: boolean;
  descontaSalario: boolean;
  descontaSubsidioAlimentacao: boolean;
  ativo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhCentroCustoDto {
  id: string;
  empresaId: string;
  codigo: string;
  designacao: string;
  descricao: string | null;
  ativo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhParametroFiscalDto {
  id: string;
  empresaId: string;
  chave: string;
  valor: string;
  tipoValor: 'DECIMAL' | 'INT' | 'BOOLEAN' | 'JSON' | 'STRING';
  descricao: string | null;
  vigenteDesde: string | Date;
  vigenteAte: string | Date | null;
  createdAt: string | Date;
}

export interface RhEscalaoIrtDto {
  id: string;
  tabelaId: string;
  ordem: number;
  rendimentoDe: number;
  rendimentoAte: number | null;
  parcelaFixa: number;
  taxa: number;
  excessoDe: number;
}

export interface RhTabelaIrtDto {
  id: string;
  empresaId: string;
  descricao: string;
  vigenteDesde: string | Date;
  vigenteAte: string | Date | null;
  ativo: boolean;
  createdAt: string | Date;
  escaloes?: RhEscalaoIrtDto[];
}

export interface RhPeriodoDto {
  id: string;
  empresaId: string;
  ano: number;
  codigo: string;
  tipo: 'MENSAL' | 'SEMANAL' | 'QUINZENAL';
  mes: number;
  descricao: string;
  dataInicio: string | Date;
  dataFim: string | Date;
  estado: 'ABERTO' | 'FECHADO' | 'PROCESSADO' | 'ANULADO';
  fechadoEm: string | Date | null;
  fechadoPorId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhConfiguracaoDto {
  id: string;
  empresaId: string;
  modoSubsidioNatalPadrao: 'PAGAMENTO_UNICO' | 'DUODECIMOS';
  mesSubsidioNatalPadrao: number;
  modoSubsidioFeriasPadrao: 'ANTES_GOZO' | 'MES_FIXO' | 'DUODECIMOS';
  mesSubsidioFeriasPadrao: number | null;
  baseDiasMes: number;
  liquidoNegativoBloqueia: boolean;
  serieRecibo: string;
  updatedAt: string | Date;
}

/** Filtro comum das listagens de cadastros RH. */
export interface RhFiltroCadastroInput {
  skip?: number;
  take?: number;
  search?: string;
  ativo?: boolean;
}

/** Página de resultados de um cadastro RH. */
export interface RhPaginaDto<T> {
  total: number;
  items: T[];
}

/** Resultado da criação dos dados de referência do RH (RH-806). */
export interface RhReferenciaSeedDto {
  departamentosCriados: number;
  cargosCriados: number;
  periodosCriados: number;
}

export interface RhDepartamentoInput {
  codigo: string;
  nome: string;
  ativo?: boolean;
}

export interface RhCargoInput {
  codigo: string;
  nome: string;
  ativo?: boolean;
}

export interface RhRubricaInput {
  codigo: string;
  descricao: string;
  tipo: RhTipoRubricaDto;
  natureza?: RhNaturezaRubricaDto;
  formaCalculo?: RhFormaCalculoRubricaDto;
  valorPadrao?: number | null;
  percentagem?: number | null;
  incideIRT?: boolean;
  incideINSS?: boolean;
  limiteIsencaoIRT?: number | null;
  limiteIsencaoINSS?: number | null;
  ordemRecibo?: number;
  contaDebitoId?: string | null;
  contaCreditoId?: string | null;
  ativo?: boolean;
}

export interface RhTipoAusenciaInput {
  codigo: string;
  descricao: string;
  justificada?: boolean;
  descontaSalario?: boolean;
  descontaSubsidioAlimentacao?: boolean;
  ativo?: boolean;
}

export interface RhCentroCustoInput {
  codigo: string;
  designacao: string;
  descricao?: string | null;
  ativo?: boolean;
}

export interface RhParametroInput {
  chave: string;
  valor: string;
  tipoValor?: 'DECIMAL' | 'INT' | 'BOOLEAN' | 'JSON' | 'STRING';
  descricao?: string | null;
  vigenteDesde: string;
  vigenteAte?: string | null;
}

export interface RhEscalaoIrtInput {
  ordem: number;
  rendimentoDe: number;
  rendimentoAte: number | null;
  parcelaFixa: number;
  taxa: number;
  excessoDe: number;
}

export interface RhTabelaIrtInput {
  descricao: string;
  vigenteDesde: string;
  vigenteAte?: string | null;
  ativo?: boolean;
  escaloes: RhEscalaoIrtInput[];
}

export interface RhConfiguracaoInput {
  modoSubsidioNatalPadrao?: 'PAGAMENTO_UNICO' | 'DUODECIMOS';
  mesSubsidioNatalPadrao?: number;
  modoSubsidioFeriasPadrao?: 'ANTES_GOZO' | 'MES_FIXO' | 'DUODECIMOS';
  mesSubsidioFeriasPadrao?: number | null;
  baseDiasMes?: number;
  liquidoNegativoBloqueia?: boolean;
  serieRecibo?: string;
}

// ── RH · Funcionários (Fase 2 · RH-201/RH-202) ──────────────────────────────

export type RhEstadoFuncionarioDto = 'ATIVO' | 'SUSPENSO' | 'INATIVO' | 'CESSADO';
export type RhGeneroDto = 'MASCULINO' | 'FEMININO' | 'OUTRO';
export type RhEstadoCivilDto = 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'UNIAO_FACTO';
export type RhFormaPagamentoDto = 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
export type RhModoSubsidioNatalDto = 'PAGAMENTO_UNICO' | 'DUODECIMOS';
export type RhModoSubsidioFeriasDto = 'ANTES_GOZO' | 'MES_FIXO' | 'DUODECIMOS';
export type RhTipoContratoDto =
  | 'PRAZO_INDETERMINADO'
  | 'PRAZO_CERTO'
  | 'EXPERIENCIA'
  | 'ESTAGIO'
  | 'TEMPO_PARCIAL'
  | 'OUTRO';
export type RhEstadoContratoDto = 'ATIVO' | 'ENCERRADO' | 'SUSPENSO';
export type RhMotivoCessacaoDto =
  | 'TERMO'
  | 'DEMISSAO'
  | 'DESPEDIMENTO'
  | 'MUTUO_ACORDO'
  | 'REFORMA'
  | 'FALECIMENTO'
  | 'PERIODO_EXPERIENCIA'
  | 'OUTRO';

export interface RhFuncionarioListaDto {
  id: string;
  codigo: string;
  nome: string;
  nif: string | null;
  documentoNumero: string | null;
  telefone: string | null;
  email: string | null;
  estado: RhEstadoFuncionarioDto;
  dataAdmissao: string | Date;
  departamento: { id: string; nome: string } | null;
  cargo: { id: string; nome: string } | null;
}

export interface RhDependenteDto {
  id: string;
  funcionarioId: string;
  nome: string;
  parentesco: string;
  dataNascimento: string | Date | null;
}

export interface RhFuncionarioDocumentoDto {
  id: string;
  funcionarioId: string;
  tipo: string;
  descricao: string | null;
  caminho: string;
  createdAt: string | Date;
}

export interface RhAlteracaoSalarialDto {
  id: string;
  contratoId: string;
  dataEfeito: string | Date;
  salarioAnterior: number;
  salarioNovo: number;
  motivo: string | null;
  criadoPorId: string | null;
  createdAt: string | Date;
}

export interface RhContratoDto {
  id: string;
  funcionarioId: string;
  tipo: RhTipoContratoDto;
  estado: RhEstadoContratoDto;
  dataInicio: string | Date;
  dataFim: string | Date | null;
  salarioBase: number;
  moeda: string;
  cargaHorariaSemanal: number;
  categoria: string | null;
  motivoCessacao: RhMotivoCessacaoDto | null;
  dataCessacao: string | Date | null;
  observacoes: string | null;
  funcionario?: { id: string; codigo: string; nome: string } | null;
  alteracoesSalariais?: RhAlteracaoSalarialDto[];
}

export interface RhFuncionarioRubricaDto {
  id: string;
  funcionarioId: string;
  rubricaId: string;
  valor: number | null;
  percentagem: number | null;
  moeda: string;
  dataInicio: string | Date;
  dataFim: string | Date | null;
  ativo: boolean;
  rubrica?: { id: string; codigo: string; descricao: string; tipo: RhTipoRubricaDto } | null;
}

export interface RhFuncionarioDetalheDto {
  id: string;
  empresaId: string;
  codigo: string;
  nome: string;
  documentoNumero: string | null;
  nif: string | null;
  niss: string | null;
  dataNascimento: string | Date | null;
  genero: RhGeneroDto | null;
  estadoCivil: RhEstadoCivilDto | null;
  nacionalidade: string | null;
  morada: string | null;
  telefone: string | null;
  email: string | null;
  fotoPath: string | null;
  departamentoId: string | null;
  cargoId: string | null;
  categoria: string | null;
  dataAdmissao: string | Date;
  dataCessacao: string | Date | null;
  estado: RhEstadoFuncionarioDto;
  formaPagamento: RhFormaPagamentoDto;
  banco: string | null;
  iban: string | null;
  modoSubsidioNatal: RhModoSubsidioNatalDto | null;
  modoSubsidioFerias: RhModoSubsidioFeriasDto | null;
  mesPagamentoSubsidioNatal: number | null;
  mesPagamentoSubsidioFerias: number | null;
  departamento: { id: string; nome: string } | null;
  cargo: { id: string; nome: string } | null;
  dependentes: RhDependenteDto[];
  documentos: RhFuncionarioDocumentoDto[];
  rubricasFixas: RhFuncionarioRubricaDto[];
  contratos: RhContratoDto[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhFuncionarioInput {
  nome: string;
  documentoNumero?: string | null;
  nif?: string | null;
  niss?: string | null;
  dataNascimento?: string | Date | null;
  genero?: RhGeneroDto | null;
  estadoCivil?: RhEstadoCivilDto | null;
  nacionalidade?: string | null;
  morada?: string | null;
  telefone?: string | null;
  email?: string | null;
  fotoPath?: string | null;
  departamentoId?: string | null;
  cargoId?: string | null;
  categoria?: string | null;
  dataAdmissao: string | Date;
  dataCessacao?: string | Date | null;
  estado?: RhEstadoFuncionarioDto;
  formaPagamento?: RhFormaPagamentoDto;
  banco?: string | null;
  iban?: string | null;
  modoSubsidioNatal?: RhModoSubsidioNatalDto | null;
  modoSubsidioFerias?: RhModoSubsidioFeriasDto | null;
  mesPagamentoSubsidioNatal?: number | null;
  mesPagamentoSubsidioFerias?: number | null;
}

export interface RhFiltroFuncionarioInput {
  skip?: number;
  take?: number;
  search?: string;
  estado?: RhEstadoFuncionarioDto;
  departamentoId?: string;
  codigo?: string;
  nif?: string;
}

// ── RH · Contratos e ficha do funcionário (Fase 2 · RH-203/RH-204) ───────────

export interface RhContratoInput {
  tipo: RhTipoContratoDto;
  categoria?: string | null;
  salarioBase: number;
  moeda?: string;
  cargaHorariaSemanal?: number;
  dataInicio: string | Date;
  dataFim?: string | Date | null;
  observacoes?: string | null;
}

export interface RhContratoCriarInput extends RhContratoInput {
  funcionarioId: string;
}

export interface RhContratoAtualizarInput extends Partial<RhContratoInput> {
  id: string;
}

export interface RhCessarContratoInput {
  id: string;
  motivo: RhMotivoCessacaoDto;
  dataCessacao: string | Date;
  observacoes?: string | null;
}

export interface RhAlteracaoSalarialInput {
  contratoId: string;
  dataEfeito: string | Date;
  salarioNovo: number;
  motivo?: string | null;
}

export interface RhSalarioNaDataDto {
  funcionarioId: string;
  data: string | Date;
  contratoId: string | null;
  salario: number | null;
  moeda: string | null;
}

export interface RhDependenteInput {
  nome: string;
  parentesco: string;
  dataNascimento?: string | Date | null;
}

export interface RhDependenteCriarInput extends RhDependenteInput {
  funcionarioId: string;
}

export interface RhDependenteAtualizarInput extends Partial<RhDependenteInput> {
  id: string;
}

export interface RhFuncionarioRubricaInput {
  rubricaId: string;
  valor?: number | null;
  percentagem?: number | null;
  moeda?: string;
  dataInicio: string | Date;
  dataFim?: string | Date | null;
  ativo?: boolean;
}

export interface RhFuncionarioRubricaCriarInput extends RhFuncionarioRubricaInput {
  funcionarioId: string;
}

export interface RhFuncionarioRubricaAtualizarInput extends Partial<RhFuncionarioRubricaInput> {
  id: string;
}

export interface RhFuncionarioDocumentoInput {
  tipo: string;
  descricao?: string | null;
  caminho: string;
}

export interface RhFuncionarioDocumentoCriarInput extends RhFuncionarioDocumentoInput {
  funcionarioId: string;
}

export interface RhFuncionarioDocumentoAtualizarInput extends Partial<RhFuncionarioDocumentoInput> {
  id: string;
}

// ── RH · Importação CSV (RH-208) ─────────────────────────────────────────────

export type RhTipoImportacaoDto = 'FUNCIONARIOS' | 'CONTRATOS';

export interface RhImportacaoErroLinhaDto {
  campo: string;
  mensagem: string;
}

export interface RhImportacaoLinhaPreviewDto {
  /** Número da linha no ficheiro (1 = cabeçalho; 2 = primeira linha de dados). */
  numero: number;
  dados: Record<string, string>;
  valida: boolean;
  erros: RhImportacaoErroLinhaDto[];
  resumo: string;
}

export interface RhImportacaoPreviewDto {
  tipo: RhTipoImportacaoDto;
  nome: string | null;
  cabecalhos: string[];
  colunasIgnoradas: string[];
  totalLinhas: number;
  totalValidas: number;
  totalInvalidas: number;
  linhas: RhImportacaoLinhaPreviewDto[];
}

export interface RhImportacaoResultadoDto {
  tipo: RhTipoImportacaoDto;
  importados: number;
  ignorados: number;
  /** Linhas inválidas que não foram importadas (vazias quando tudo corre bem). */
  naoImportadas: Array<{ numero: number; resumo: string; erros: RhImportacaoErroLinhaDto[] }>;
}

export interface RhImportacaoConteudoInput {
  nome?: string;
  conteudo: string;
}

export interface RhImportacaoImportarInput extends RhImportacaoConteudoInput {
  /** Quando `true`, as linhas inválidas são ignoradas e só as válidas importadas. */
  ignorarInvalidas?: boolean;
}

export type RhImportacaoSelecionarResultado =
  | { cancelado: true }
  | { cancelado: false; nome: string; conteudo: string };

// ── RH · Alterações Mensais (Fase 4 · RH-401/RH-402) ────────────────────────────

export type RhEstadoAlteracaoDto = 'PENDENTE' | 'APLICADA' | 'ANULADA';

export interface RhAlteracaoMensalDto {
  id: string;
  funcionarioId: string;
  ano: number;
  mes: number;
  rubricaId: string;
  quantidade: number | null;
  valor: number;
  moeda: string;
  extraordinaria: boolean;
  observacao: string | null;
  estado: RhEstadoAlteracaoDto;
  processamentoItemId: string | null;
  criadoPorId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  rubrica?: { id: string; codigo: string; descricao: string; tipo: RhTipoRubricaDto } | null;
  funcionario?: { id: string; codigo: string; nome: string } | null;
}

export interface RhAlteracaoMensalInput {
  funcionarioId: string;
  ano: number;
  mes: number;
  rubricaId: string;
  quantidade?: number | null;
  valor: number;
  moeda?: string;
  extraordinaria?: boolean;
  observacao?: string | null;
}

export interface RhAlteracaoMensalCriarInput extends RhAlteracaoMensalInput {}

export interface RhAlteracaoMensalAtualizarInput extends Partial<RhAlteracaoMensalInput> {
  id: string;
}

export interface RhAlteracoesMensaisListarInput {
  funcionarioId: string;
  ano: number;
  mes: number;
  estado?: RhEstadoAlteracaoDto;
  skip?: number;
  take?: number;
}

export interface RhCopiarMesAnteriorInput {
  funcionarioId: string;
  anoOrigem: number;
  mesOrigem: number;
  anoDestino: number;
  mesDestino: number;
}

export interface RhCopiarMesAnteriorResultado {
  criadas: number;
  ignoradas: number;
}

// ── RH-403 · Loader de processamento ────────────────────────────────────────

export interface RhProcessamentoLoaderInput {
  empresaId?: string | null;
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  funcionarioIds?: string[];
  incluirFimContrato?: boolean;
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  tipoProcessamento?: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
}

export interface RhAlteracoesMensaisPaginaDto {
  total: number;
  items: RhAlteracaoMensalDto[];
}

export interface RhFuncionarioDadosDto {
  funcionario: RhFuncionarioDetalheDto;
  contrato: RhContratoDto | null;
  elegibilidade: { podeProcessar: boolean; restricoes: string[] };
}

export interface RhProcessamentoLoaderResultado {
  funcionarios: RhFuncionarioDadosDto[];
  alteracoesMensais: Record<string, RhAlteracaoMensalDto[]>; // funcionarioId -> []
  ausencias: Record<string, (RhAusenciaDto & { tipo: RhTipoAusenciaDto })[]>;
  horasExtra: Record<string, RhHoraExtraDto[]>;
  dividas: Record<string, RhPrestacaoDividaDto[]>;
  ferias: Record<string, { diasDireito: number; diasGozadosOuMarcados: number; diasNaoGozados: number }>;
  configuracao: RhConfiguracaoDto;
  tabelaIrt: RhTabelaIrtDto | null;
  periodo: RhPeriodoDto | null;
  elegibilidade: { elegiveis: string[]; restricoes: Array<{ funcionarioId: string; motivo: string; descricao: string }>; detalhes: Array<{ id: string; podeProcessar: boolean; restricoes: Array<{ funcionarioId: string; motivo: string; descricao: string }> }> };
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  baseDiasMes: number;
}

// ── RH-404 · Simulação/Preparação ────────────────────────────────────────────

export interface RhFuncionarioResultadoDto {
  funcionarioId: string;
  codigo: string;
  nome: string;
  sucesso: boolean;
  resultado?: ResultadoCalculo;
  totais?: {
    remuneracoes: string;
    descontos: string;
    encargos: string;
    liquido: string;
  };
  erro?: string;
  avisos: string[];
}

export interface RhSimulacaoResultadoDto {
  periodo: { ano: number; mes: number; periodoCodigo: string };
  dataProcessamento: string | Date;
  tipoProcessamento: string;
  funcionarios: RhFuncionarioResultadoDto[];
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

export interface RhPrepararResultadoDto extends RhSimulacaoResultadoDto {
  loaderData?: RhProcessamentoLoaderResultado;
}

export interface RhAjusteManualDto {
  rubricaId?: string | null;
  codigo?: string | null;
  descricao: string;
  tipo: 'REMUNERACAO' | 'DESCONTO' | 'ENCARGO_PATRONAL';
  valor: number;
  quantidade?: number | null;
  incideIRT?: boolean;
  incideINSS?: boolean;
}

export interface RhProcessarSalariosInput {
  operacao: 'SIMULAR' | 'PREPARAR' | 'PROCESSAR' | 'ANULAR';
  modo: 'INDIVIDUAL' | 'LOTE';
  tipos: ('VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO')[];
  incluirFimContrato?: boolean;
  ano: number;
  periodoCodigo: string;
  mes: number;
  diasProcessados?: number;
  dataProcessamento: string | Date;
  dataLimiteFaltasHE: string | Date;
  funcionarioIds?: string[];
  tipoProcessamento?: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
  ajustesManuais?: RhAjusteManualDto[];
}

export interface RhSimularSalariosInput extends Omit<RhProcessarSalariosInput, 'operacao'> {}
export interface RhPrepararSalariosInput extends Omit<RhProcessarSalariosInput, 'operacao'> {}

// ── RH-405 · Execução de processamento individual ─────────────────────────────

export interface RhProcessarIndividualInput {
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  tipoProcessamento: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
  incluirFimContrato?: boolean;
  diasProcessados?: number;
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  funcionarioId: string;
  forcarReprocessamento?: boolean;
  formaPagamento?: 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
  contaBancariaId?: string;
  referenciaPagamento?: string;
  ajustesManuais?: RhAjusteManualDto[];
}

export interface RhProcessarIndividualResultadoDto {
  sucesso: boolean;
  processamentoId: string;
  tipo: string;
  sequencia: number;
  reciboId: string;
  serieRecibo: string;
  numeroRecibo: number;
  pagamentoId: string;
  liquido: string;
  totalRemuneracoes: string;
  totalDescontos: string;
  totalEncargos: string;
  avisos: string[];
  lancamentoContabilId?: string;
}

// ── RH-406 · Execução de processamento em lote ────────────────────────────────

export interface RhProcessarLoteInput {
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  tipoProcessamento: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO';
  incluirFimContrato?: boolean;
  funcionarioIds: string[];
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  forcarReprocessamento?: boolean;
  formaPagamento?: 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
  contaBancariaId?: string;
  referenciaPagamento?: string;
}

export interface ProgressoLoteDto {
  total: number;
  feitos: number;
  funcionarioId: string;
  estado: 'SUCESSO' | 'ERRO';
}

export interface RhProcessarLoteDetalheDto {
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  sucesso: boolean;
  erro?: string;
  processamentoId?: string;
  liquido?: string;
}

export interface RhProcessarLoteErroDto {
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  erro: string;
}

export interface RhProcessarLoteResultadoDto {
  loteId: string;
  totalFuncionarios: number;
  totalSucesso: number;
  totalErros: number;
  totalLiquido: string;
  detalhes: RhProcessarLoteDetalheDto[];
  relatorioErros: RhProcessarLoteErroDto[];
}

// ── RH-407 · Anulação de processamentos ───────────────────────────────────────

export interface RhAnularProcessamentosInput {
  processamentoIds: string[];
  motivo: string;
}

export interface RhAnularProcessamentoDetalheDto {
  processamentoId: string;
  funcionarioId?: string;
  codigo?: string | null;
  nome?: string | null;
  sucesso: boolean;
  erro?: string;
  reciboAnulado?: boolean;
  pagamentosCancelados?: number;
  alteracoesRepostas?: number;
  prestacoesRepostas?: number;
  lancamentoEstornado?: boolean;
  avisos?: string[];
}

export interface RhAnularProcessamentosResultadoDto {
  total: number;
  sucesso: number;
  erros: number;
  detalhes: RhAnularProcessamentoDetalheDto[];
}

// ── RH-412 · Listagem de processamentos (para anulação) ───────────────────────

export interface RhProcessamentoListarInput {
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  estado?: 'PROCESSADO' | 'ANULADO';
  funcionarioIds?: string[];
}

export interface RhProcessamentoResumoDto {
  id: string;
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  tipo: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
  sequencia: number;
  modo: 'INDIVIDUAL' | 'LOTE';
  estado: 'PROCESSADO' | 'ANULADO';
  periodoCodigo: string;
  ano: number;
  mes: number;
  dataProcessamento: string | Date;
  totalRemuneracoes: string;
  totalDescontos: string;
  liquido: string;
  reciboNumero: number | null;
  jaAnulado: boolean;
  motivoAnulacao: string | null;
}

// ── RH-414 · Histórico e visão detalhada de processamentos ────────────────────

export interface RhProcessamentoHistoricoInput {
  ano?: number;
  mes?: number;
  periodoCodigo?: string; // P01..P12
  tipo?: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
  estado?: 'PROCESSADO' | 'ANULADO';
  funcionarioId?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export interface RhProcessamentoHistoricoPaginaDto {
  total: number;
  items: RhProcessamentoResumoDto[];
}

export interface RhProcessamentoItemDetalheDto {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  origem: string;
  quantidade: string | null;
  valorUnitario: string | null;
  valor: string;
  moeda: string;
  taxaCambio: string | null;
  incideIRT: boolean;
  incideINSS: boolean;
  ordem: number;
  referenciaId: string | null;
}

export interface RhProcessamentoEscalaoDetalheDto {
  ordem: number;
  rendimentoDe: string;
  rendimentoAte: string | null;
  parcelaFixa: string;
  taxa: string;
  excessoDe: string;
}

export interface RhProcessamentoReciboDetalheDto {
  id: string;
  serie: string;
  ano: number;
  numero: number;
  estado: string;
  emitidoEm: string | Date;
}

export interface RhProcessamentoDetalheDto extends RhProcessamentoResumoDto {
  manual: boolean;
  contratoId: string | null;
  diasProcessados: number;
  dataLimiteFaltasHE: string | Date | null;
  moeda: string;
  taxaCambio: string | null;
  totalEncargos: string;
  baseINSS: string;
  baseIRT: string;
  inssTrabalhador: string;
  inssPatronal: string;
  irt: string;
  escalao: RhProcessamentoEscalaoDetalheDto | null;
  recibo: RhProcessamentoReciboDetalheDto | null;
  itens: RhProcessamentoItemDetalheDto[];
  avisos: string[];
  anuladoEm: string | Date | null;
  motivoAnulacao: string | null;
  lancamentoContabilId: string | null;
  parametros: Record<string, unknown> | null;
}

// Recibos de processamento (RH-502/503)
export interface RhReciboResumoDto {
  id: string;
  serie: string;
  ano: number;
  numero: number;
  estado: 'EMITIDO' | 'ANULADO';
  emitidoEm: string | Date;
  impressoes: number;
  anuladoEm: string | Date | null;
  processamento: {
    id: string;
    tipo: string;
    sequencia: number;
    modo: string;
    dataProcessamento: string | Date;
    liquido: string;
    funcionario: {
      id: string;
      codigo: string;
      nome: string;
    };
    periodo: {
      id: string;
      codigo: string;
      ano: number;
      mes: number;
    };
  };
}

export interface RhRecibosPaginaDto {
  total: number;
  items: RhReciboResumoDto[];
}

export interface RhRecibosListarInput {
  empresaId?: string;
  funcionarioId?: string;
  ano?: number;
  mes?: number;
  periodoCodigo?: string;
  tipo?: 'VENCIMENTO' | 'SUBSIDIO_FERIAS' | 'SUBSIDIO_NATAL' | 'EXTRAORDINARIO' | 'FIM_CONTRATO';
  estado?: 'EMITIDO' | 'ANULADO';
  search?: string;
  skip?: number;
  take?: number;
}

// Pagamentos (RH-504)
export interface OrdemPagamentoResumoDto {
  id: string;
  numero: number;
  banco: string | null;
  formaPagamento: string;
  estado: string;
  totalValor: string;
  pagamentosCount: number;
  createdAt: string | Date;
  ficheiroPath: string | null;
}

export interface OrdemPagamentoDetalheDto extends OrdemPagamentoResumoDto {
  pagamentos: {
    id: string;
    funcionario: { id: string; codigo: string; nome: string };
    formaPagamento: string;
    valor: string;
    valorPago: string;
    estado: string;
    dataPagamento: string | Date | null;
    referencia: string | null;
  }[];
}

export interface PagamentoResumoDto {
  id: string;
  processamentoId: string;
  funcionario: { id: string; codigo: string; nome: string };
  formaPagamento: string;
  valor: string;
  valorPago: string;
  estado: string;
  dataPagamento: string | Date | null;
  referencia: string | null;
  ordemId: string | null;
  processamento: {
    id: string;
    tipo: string;
    sequencia: number;
    periodo: { codigo: string; ano: number };
  };
}

export interface RhOrdensPagamentoListarInput {
  empresaId?: string;
  estado?: 'ABERTA' | 'ENVIADA' | 'CONCLUIDA' | 'CANCELADA';
  skip?: number;
  take?: number;
}

export interface RhOrdemPagamentoCriarInput {
  empresaId?: string;
  periodoId?: string;
  banco?: string;
  formaPagamento: 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
  pagamentoIds: string[];
}

export interface RhOrdemPagamentoIdInput {
  id: string;
}

export interface RhOrdemPagamentoGerarFicheiroInput {
  id: string;
}

export interface RhPagamentosListarInput {
  empresaId?: string;
  funcionarioId?: string;
  estado?: 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'ESTORNADO' | 'CANCELADO';
  formaPagamento?: 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';
  ordemId?: string;
  skip?: number;
  take?: number;
}

export interface RhPagamentoConfirmarInput {
  empresaId?: string;
  pagamentoId: string;
  valorPago: number;
  dataPagamento: string | Date;
  referencia?: string;
  contaBancariaId?: string;
}

export interface RhPagamentoEstornarInput {
  empresaId?: string;
  pagamentoId: string;
  motivo: string;
}

export interface RhRecibosGerarPdfInput {
  reciboIds: string[];
}

export interface RhAusenciaDto {
  id: string;
  funcionarioId: string;
  tipoId: string;
  dataInicio: string | Date;
  dataFim: string | Date;
  dias: number;
  horas: number | null;
  justificativoPath: string | null;
  observacao: string | null;
  estado: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  aprovadoPorId: string | null;
  processadaEm: string | Date | null;
  tipo: RhTipoAusenciaDto;
}

export interface RhAusenciaPaginaDto {
  total: number;
  items: RhAusenciaDto[];
}

export interface RhAusenciasListarInput {
  empresaId?: string;
  funcionarioId?: string;
  tipoId?: string;
  estado?: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface RhAusenciaCriarInput {
  funcionarioId: string;
  tipoId: string;
  dataInicio: string | Date;
  dataFim: string | Date;
  dias: number;
  horas?: number | null;
  justificativoPath?: string | null;
  observacao?: string | null;
  estado?: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
}

export interface RhAusenciaAtualizarInput {
  id: string;
  funcionarioId?: string;
  tipoId?: string;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  dias?: number;
  horas?: number | null;
  justificativoPath?: string | null;
  observacao?: string | null;
  estado?: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
}

export interface RhAusenciaAprovarInput {
  id: string;
  aprovadoPorId: string;
  estado: 'APROVADO' | 'REJEITADO';
}

export interface RhHoraExtraDto {
  id: string;
  funcionarioId: string;
  data: string | Date;
  horas: number;
  tipo: 'DIURNA_UTIL' | 'NOTURNA' | 'DESCANSO_FERIADO';
  percentagem: number;
  estado: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
}

export interface RhHoraExtraPaginaDto {
  total: number;
  items: RhHoraExtraDto[];
}

export interface RhHorasExtraListarInput {
  empresaId?: string;
  funcionarioId?: string;
  tipo?: 'DIURNA_UTIL' | 'NOTURNA' | 'DESCANSO_FERIADO';
  estado?: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  dataInicio?: string | Date;
  dataFim?: string | Date;
  skip?: number;
  take?: number;
}

export interface RhHoraExtraCriarInput {
  funcionarioId: string;
  data: string | Date;
  horas: number;
  tipo: 'DIURNA_UTIL' | 'NOTURNA' | 'DESCANSO_FERIADO';
  percentagem: number;
  estado?: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
}

export interface RhHoraExtraAtualizarInput {
  id: string;
  funcionarioId?: string;
  data?: string | Date;
  horas?: number;
  tipo?: 'DIURNA_UTIL' | 'NOTURNA' | 'DESCANSO_FERIADO';
  percentagem?: number;
  estado?: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
}

export interface RhHoraExtraAprovarInput {
  id: string;
  aprovadoPorId: string;
  estado: 'APROVADO' | 'REJEITADO';
}

export interface RhFeriasSaldoDto {
  id: string;
  funcionarioId: string;
  ano: number;
  diasDireito: number;
  diasTransitados: number;
  diasMarcados: number;
  diasGozados: number;
  subsidioFeriasProcessado: boolean;
}

export interface RhMarcacaoFeriasDto {
  id: string;
  funcionarioId: string;
  ano: number;
  dataInicio: string | Date;
  dataFim: string | Date;
  dias: number;
  estado: 'PLANEADA' | 'APROVADA' | 'GOZADA' | 'CANCELADA';
  aprovadoPorId: string | null;
  subsidioProcessamentoId: string | null;
  observacao: string | null;
}

export interface RhMarcacaoFeriasPaginaDto {
  total: number;
  items: RhMarcacaoFeriasDto[];
}

export interface RhFeriasSaldosListarInput {
  empresaId?: string;
  funcionarioId?: string;
  ano?: number;
  skip?: number;
  take?: number;
}

export interface RhMarcacoesFeriasListarInput {
  empresaId?: string;
  funcionarioId?: string;
  ano?: number;
  estado?: 'PLANEADA' | 'APROVADA' | 'GOZADA' | 'CANCELADA';
  skip?: number;
  take?: number;
}

export interface RhFeriasSaldoAtualizarInput {
  id: string;
  diasDireito?: number;
  diasTransitados?: number;
  diasMarcados?: number;
  diasGozados?: number;
  subsidioFeriasProcessado?: boolean;
}

export interface RhMarcacaoFeriasCriarInput {
  funcionarioId: string;
  ano: number;
  dataInicio: string | Date;
  dataFim: string | Date;
  dias: number;
  estado?: 'PLANEADA' | 'APROVADA' | 'GOZADA' | 'CANCELADA';
  observacao?: string | null;
}

export interface RhMarcacaoFeriasAtualizarInput {
  id: string;
  funcionarioId?: string;
  ano?: number;
  dataInicio?: string | Date;
  dataFim?: string | Date;
  dias?: number;
  estado?: 'PLANEADA' | 'APROVADA' | 'GOZADA' | 'CANCELADA';
  aprovadoPorId?: string | null;
  subsidioProcessamentoId?: string | null;
  observacao?: string | null;
}

export interface RhMarcacaoFeriasAprovarInput {
  id: string;
  aprovadoPorId: string;
  estado: 'APROVADA' | 'REJEITADA' | 'CANCELADA';
}

// Afetações (RH-605)
export interface RhAfetacaoDto {
  id: string;
  funcionarioId: string;
  centroCustoId: string | null;
  percentagem: number;
  dataInicio: string | Date;
  dataFim: string | Date | null;
  centroCusto: { id: string; codigo: string; designacao: string } | null;
}

export interface RhAfetacaoPaginaDto {
  total: number;
  items: RhAfetacaoDto[];
}

export interface RhAfetacoesListarInput {
  empresaId?: string;
  funcionarioId?: string;
  centroCustoId?: string;
  skip?: number;
  take?: number;
}

export interface RhAfetacaoCriarInput {
  funcionarioId: string;
  centroCustoId: string | null;
  percentagem: number;
  dataInicio: string | Date;
  dataFim?: string | Date | null;
}

export interface RhAfetacaoAtualizarInput {
  id: string;
  funcionarioId?: string;
  centroCustoId?: string | null;
  percentagem?: number;
  dataInicio?: string | Date;
  dataFim?: string | Date | null;
}

export interface RhAfetacaoRemoverInput {
  id: string;
}

// Processos de Dívida/Penhora (RH-606/607)
export interface RhProcessoDividaDto {
  id: string;
  funcionarioId: string;
  tipo: 'ADIANTAMENTO' | 'EMPRESTIMO' | 'PENHORA' | 'OUTRO';
  descricao: string | null;
  credor: string | null;
  numeroProcesso: string | null;
  valorTotal: number;
  numeroPrestacoes: number;
  valorPrestacao: number;
  saldo: number;
  moeda: string;
  dataInicio: string | Date;
  estado: 'ATIVA' | 'SUSPENSA' | 'LIQUIDADA' | 'CANCELADA';
  respeitaLimitePenhora: boolean;
  funcionario: { id: string; codigo: string; nome: string };
  prestacoes?: RhPrestacaoDividaDto[];
}

export interface RhProcessoDividaPaginaDto {
  total: number;
  items: RhProcessoDividaDto[];
}

export interface RhProcessosDividaListarInput {
  empresaId?: string;
  funcionarioId?: string;
  tipo?: 'ADIANTAMENTO' | 'EMPRESTIMO' | 'PENHORA' | 'OUTRO';
  estado?: 'ATIVA' | 'SUSPENSA' | 'LIQUIDADA' | 'CANCELADA';
  skip?: number;
  take?: number;
}

export interface RhProcessoDividaCriarInput {
  funcionarioId: string;
  tipo: 'ADIANTAMENTO' | 'EMPRESTIMO' | 'PENHORA' | 'OUTRO';
  descricao?: string | null;
  credor?: string | null;
  numeroProcesso?: string | null;
  valorTotal: number;
  numeroPrestacoes: number;
  valorPrestacao: number;
  moeda?: string;
  dataInicio: string | Date;
  respeitaLimitePenhora?: boolean;
}

export interface RhProcessoDividaAtualizarInput {
  id: string;
  funcionarioId?: string;
  tipo?: 'ADIANTAMENTO' | 'EMPRESTIMO' | 'PENHORA' | 'OUTRO';
  descricao?: string | null;
  credor?: string | null;
  numeroProcesso?: string | null;
  valorTotal?: number;
  numeroPrestacoes?: number;
  valorPrestacao?: number;
  moeda?: string;
  dataInicio?: string | Date;
  estado?: 'ATIVA' | 'SUSPENSA' | 'LIQUIDADA' | 'CANCELADA';
  respeitaLimitePenhora?: boolean;
}

export interface RhProcessoDividaGerarPlanoInput {
  id: string;
}

export interface RhProcessoDividaSuspenderInput {
  id: string;
  motivo: string;
}

export interface RhProcessoDividaLiquidarInput {
  id: string;
}

export interface RhProcessoDividaCancelarInput {
  id: string;
  motivo: string;
}

// Prestações de Dívida
export interface RhPrestacoesDividaListarInput {
  empresaId?: string;
  funcionarioId?: string;
  processoId?: string;
  ano?: number;
  mes?: number;
  estado?: 'PENDENTE' | 'DESCONTADA' | 'ANULADA' | 'PERDOADA';
  skip?: number;
  take?: number;
}

export interface RhPrestacaoDividaPaginaDto {
  total: number;
  items: RhPrestacaoDividaDto[];
}

export interface RhPrestacaoDividaAtualizarInput {
  id: string;
  valorDescontado?: number;
  estado?: 'PENDENTE' | 'DESCONTADA' | 'ANULADA' | 'PERDOADA';
  processamentoItemId?: string | null;
}

export interface RhPrestacaoDividaDescontarInput {
  id: string;
  valorDescontado: number;
  processamentoItemId: string;
}

export interface RhPrestacaoDividaAnularInput {
  id: string;
  motivo: string;
}

export interface RhPrestacaoDividaPerdoarInput {
  id: string;
  motivo: string;
}

export interface RhRetroativoDto {
  id: string;
  funcionarioId: string;
  rubricaId: string;
  anoOrigem: number;
  mesOrigem: number;
  anoAplicacao: number;
  mesAplicacao: number;
  valor: number;
  motivo: string | null;
  estado: 'PENDENTE' | 'APLICADO' | 'ANULADO';
  processamentoItemId: string | null;
  criadoPorId: string | null;
  funcionario: { id: string; codigo: string; nome: string };
  rubrica: { id: string; codigo: string; descricao: string };
}

export interface RhRetroativoPaginaDto {
  total: number;
  items: RhRetroativoDto[];
}

export interface RhRetroativosListarInput {
  empresaId?: string;
  funcionarioId?: string;
  rubricaId?: string;
  anoOrigem?: number;
  mesOrigem?: number;
  anoAplicacao?: number;
  mesAplicacao?: number;
  estado?: 'PENDENTE' | 'APLICADO' | 'ANULADO';
  skip?: number;
  take?: number;
}

export interface RhRetroativoCriarInput {
  funcionarioId: string;
  rubricaId: string;
  anoOrigem: number;
  mesOrigem: number;
  anoAplicacao: number;
  mesAplicacao: number;
  valor: number;
  motivo?: string | null;
  estado?: 'PENDENTE' | 'APLICADO' | 'ANULADO';
}

export interface RhRetroativoAtualizarInput {
  id: string;
  funcionarioId?: string;
  rubricaId?: string;
  anoOrigem?: number;
  mesOrigem?: number;
  anoAplicacao?: number;
  mesAplicacao?: number;
  valor?: number;
  motivo?: string | null;
  estado?: 'PENDENTE' | 'APLICADO' | 'ANULADO';
}

export interface RhRetroativoAplicarInput {
  id: string;
}

export interface RhRetroativoAnularInput {
  id: string;
  motivo: string;
}

// Independentes (RH-701)
export interface RhIndependenteDto {
  id: string;
  empresaId: string;
  codigo: string;
  nome: string;
  nif: string | null;
  email: string | null;
  telefone: string | null;
  morada: string | null;
  banco: string | null;
  iban: string | null;
  taxaRetencao: number | null;
  ativo: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface RhIndependentePaginaDto {
  total: number;
  items: RhIndependenteDto[];
}

export interface RhIndependentesListarInput {
  empresaId?: string;
  codigo?: string;
  nome?: string;
  ativo?: boolean;
  skip?: number;
  take?: number;
}

export interface RhIndependenteCriarInput {
  codigo: string;
  nome: string;
  nif?: string | null;
  email?: string | null;
  telefone?: string | null;
  morada?: string | null;
  banco?: string | null;
  iban?: string | null;
  taxaRetencao?: number;
  ativo?: boolean;
}

export interface RhIndependenteAtualizarInput {
  id: string;
  codigo?: string;
  nome?: string;
  nif?: string | null;
  email?: string | null;
  telefone?: string | null;
  morada?: string | null;
  banco?: string | null;
  iban?: string | null;
  taxaRetencao?: number | null;
  ativo?: boolean;
}

// Atividades (RH-702)
export interface RhAtividadeDto {
  id: string;
  independenteId: string;
  descricao: string;
  valorFixo: number | null;
  valorHora: number | null;
  centroCustoId: string | null;
  dataInicio: string | Date;
  dataFim: string | Date | null;
  ativa: boolean;
  independente: { id: string; codigo: string; nome: string };
  centroCusto: { id: string; codigo: string; designacao: string } | null;
}

export interface RhAtividadePaginaDto {
  total: number;
  items: RhAtividadeDto[];
}

// Auditoria (RH-802)
export interface RhAuditLogDto {
  id: string;
  empresaId: string;
  utilizadorId: string | null;
  utilizadorLogin: string | null;
  utilizadorNome: string | null;
  acao: string;
  severidade: string;
  entidade: string;
  entidadeId: string | null;
  modulo: string;
  descricao: string;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
  enderecoIp: string | null;
  agenteUtilizador: string | null;
  integridade: string | null;
  dataHora: string | Date;
  arquivado: boolean;
}

export interface RhAuditoriaPaginaDto {
  registos: RhAuditLogDto[];
  proximoCursor: string | null;
  total: number;
}

export interface RhAuditoriaListarInput {
  entidade?: string;
  entidadeId?: string;
  utilizadorId?: string;
  acao?: string;
  severidade?: string;
  desde?: string | Date;
  ate?: string | Date;
  limite?: number;
  cursor?: string;
  incluirArquivados?: boolean;
}

export interface RhAuditoriaPorFuncionarioInput {
  funcionarioId: string;
  acao?: string;
  severidade?: string;
  desde?: string | Date;
  ate?: string | Date;
  limite?: number;
  cursor?: string;
  incluirArquivados?: boolean;
}

export interface RhAuditoriaPorProcessamentoInput {
  processamentoId: string;
  acao?: string;
  severidade?: string;
  desde?: string | Date;
  ate?: string | Date;
  limite?: number;
  cursor?: string;
  incluirArquivados?: boolean;
}

export interface RhAtividadesListarInput {
  empresaId?: string;
  independenteId?: string;
  centroCustoId?: string;
  ativa?: boolean;
  skip?: number;
  take?: number;
}

export interface RhAtividadeCriarInput {
  independenteId: string;
  descricao: string;
  valorFixo?: number | null;
  valorHora?: number | null;
  centroCustoId?: string | null;
  dataInicio: string | Date;
  dataFim?: string | Date | null;
  ativa?: boolean;
}

export interface RhAtividadeAtualizarInput {
  id: string;
  descricao?: string;
  valorFixo?: number | null;
  valorHora?: number | null;
  centroCustoId?: string | null;
  dataInicio?: string | Date;
  dataFim?: string | Date | null;
  ativa?: boolean;
}

export interface RhPrestacaoDividaDto {
  id: string;
  processoId: string;
  numero: number;
  ano: number;
  mes: number;
  valor: number;
  valorDescontado: number;
  estado: 'PENDENTE' | 'DESCONTADA' | 'ANULADA' | 'PERDOADA';
  processamentoItemId: string | null;
  processo: { id: string; funcionarioId: string; tipo: string; valorPrestacao: number; moeda: string; funcionario: { id: string; codigo: string; nome: string } };
}

export interface RhConfiguracaoDto {
  id: string;
  empresaId: string;
  modoSubsidioNatalPadrao: 'PAGAMENTO_UNICO' | 'DUODECIMOS';
  mesSubsidioNatalPadrao: number;
  modoSubsidioFeriasPadrao: 'ANTES_GOZO' | 'MES_FIXO' | 'DUODECIMOS';
  mesSubsidioFeriasPadrao: number | null;
  baseDiasMes: number;
  liquidoNegativoBloqueia: boolean;
  serieRecibo: string;
}

export interface RhTabelaIrtDto {
  id: string;
  empresaId: string;
  descricao: string;
  vigenteDesde: string | Date;
  vigenteAte: string | Date | null;
  ativo: boolean;
  escaloes: RhEscalaoIrtDto[];
}

export interface RhEscalaoIrtDto {
  id: string;
  tabelaId: string;
  ordem: number;
  rendimentoDe: number;
  rendimentoAte: number | null;
  parcelaFixa: number;
  taxa: number;
  excessoDe: number;
}

export interface RhPeriodoDto {
  id: string;
  empresaId: string;
  ano: number;
  codigo: string;
  tipo: 'MENSAL' | 'SEMANAL' | 'QUINZENAL';
  mes: number;
  descricao: string;
  dataInicio: string | Date;
  dataFim: string | Date;
  estado: 'ABERTO' | 'FECHADO' | 'PROCESSADO' | 'ANULADO';
}

export interface RhFuncionarioDadosDto {
  funcionario: RhFuncionarioDetalheDto;
  contrato: RhContratoDto | null;
  elegibilidade: { podeProcessar: boolean; restricoes: string[] };
}

export interface UtilizadorDto {
  id: string;
  login: string;
  nomeCompleto: string;
  email: string;
  telefone: string | null;
  estado: 'ativo' | 'inativo';
  perfilId: string;
  armazemDefaultId: string | null;
  empresaConfigId: string;
  ultimoAcessoEm: string | Date | null;
  criadoEm: string | Date;
  atualizadoEm: string | Date;
  perfil: { id: string; nome: string; sistema: boolean };
  empresaConfig: { id: string; nome: string; nif: string };
  armazemPadrao?: { id: string; codigo: string; designacao: string } | null;
}

export interface UtilizadorCriarInput {
  login: string;
  nomeCompleto: string;
  email: string;
  password: string;
  perfilId: string;
  empresaConfigId: string;
  armazemDefaultId?: string | null;
  telefone?: string;
  estado?: 'ativo' | 'inativo';
}

export interface UtilizadorAtualizarInput {
  login?: string;
  nomeCompleto?: string;
  email?: string;
  password?: string;
  perfilId?: string;
  empresaConfigId?: string;
  armazemDefaultId?: string | null;
  telefone?: string;
  estado?: 'ativo' | 'inativo';
}

export interface PerfilAcessoDto {
  id: string;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  permissoes: PermissoesRbac;
  totalUtilizadores: number;
}

export interface PerfilAcessoCriarInput {
  nome: string;
  descricao?: string;
  permissoes?: PermissoesRbac;
}

export interface ExportarRelatorioContabilDto {
  relatorio: 'balancete' | 'razao' | 'diarios' | 'contaCorrente' | 'demonstracao';
  formato: 'csv' | 'xlsx' | 'pdf';
  filtros: Record<string, unknown>;
}

export interface ResultadoExportacaoRelatorioContabilDto {
  cancelado?: boolean;
  caminho?: string;
  linhas?: number;
  formato?: 'csv' | 'xlsx' | 'pdf';
}

export interface ErpApi {
  auth: {
    login: (credentials: {
      login?: string;
      password?: string;
      utilizador?: string;
      senha?: string;
    }) => Promise<IpcResponse<UserSessionDto>>;
    logout: () => Promise<IpcResponse<{ success: boolean }>>;
    me: () => Promise<IpcResponse<UserSessionDto | null>>;
  };
  dbConfig: {
    ler: () => Promise<
      IpcResponse<{
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
        appSecret: string;
      }>
    >;
    guardar: (data: unknown) => Promise<IpcResponse<{ message: string }>>;
    testar: (
      data: unknown,
    ) => Promise<IpcResponse<{ ok: boolean; ms?: number; error?: string }>>;
  };
  utilizadores: {
    list: (filters?: {
      search?: string;
      perfilId?: string;
      estado?: 'ativo' | 'inativo';
      empresaConfigId?: string;
      take?: number;
      skip?: number;
    }) => Promise<IpcResponse<PaginatedResult<UtilizadorDto>>>;
    get: (id: string) => Promise<IpcResponse<UtilizadorDto>>;
    create: (data: UtilizadorCriarInput) => Promise<IpcResponse<UtilizadorDto>>;
    update: (id: string, data: UtilizadorAtualizarInput) => Promise<IpcResponse<UtilizadorDto>>;
    delete: (id: string) => Promise<IpcResponse<{ id: string }>>;
    changePassword: (id: string, data: { senhaAtual: string; novaSenha: string }) => Promise<IpcResponse<{ id: string; actualizadoEm: string | Date }>>;
    resetPassword: (id: string, data: { novaSenha: string }) => Promise<IpcResponse<{ id: string; actualizadoEm: string | Date }>>;
  };
  perfis: {
    list: () => Promise<IpcResponse<PerfilAcessoDto[]>>;
    get: (id: string) => Promise<IpcResponse<PerfilAcessoDto>>;
    create: (data: PerfilAcessoCriarInput) => Promise<IpcResponse<PerfilAcessoDto>>;
    update: (id: string, data: { nome?: string; descricao?: string; permissoes?: PermissoesRbac }) => Promise<IpcResponse<PerfilAcessoDto>>;
    delete: (id: string) => Promise<IpcResponse<{ id: string }>>;
    duplicate: (id: string, novoNome: string) => Promise<IpcResponse<PerfilAcessoDto>>;
  };
  empresa: {
    list: () => Promise<IpcResponse<EmpresaConfigDto[]>>;
    get: (id?: string) => Promise<IpcResponse<EmpresaConfigDto | null>>;
    create: (data: Partial<EmpresaConfigDto> & { modulos?: string[] }) => Promise<IpcResponse<EmpresaConfigDto>>;
    update: (id: string, data: Partial<EmpresaConfigDto> & { modulos?: string[] }) => Promise<IpcResponse<EmpresaConfigDto>>;
    delete: (id: string) => Promise<IpcResponse<EmpresaConfigDto>>;
    save: (data: Partial<EmpresaConfigDto>) => Promise<IpcResponse<EmpresaConfigDto>>;
  };
  exercicio: {
    list: (empresaId?: string) => Promise<IpcResponse<ExercicioFiscalDto[]>>;
    create: (data: {
      ano: string;
      empresaId: string;
      modulos?: string[];
      dataInicio: string;
      dataFim: string;
      estado?: 'aberto' | 'fechado';
    }) => Promise<IpcResponse<ExercicioFiscalDto>>;
    delete: (id: string) => Promise<IpcResponse<ExercicioFiscalDto>>;
  };
  serie: {
    list: (empresaId?: string, tipoDocumento?: TipoSerieDocumento) => Promise<IpcResponse<SerieDocumentoDto[]>>;
    create: (data: {
      codigo: string;
      descricao: string;
      empresaId: string;
      tipoDocumento?: TipoSerieDocumento;
      modulos?: string[];
      dataInicio: string;
      dataFim: string;
      ultimoLancamento?: number;
      estado?: 'ativo' | 'inativo';
    }) => Promise<IpcResponse<SerieDocumentoDto>>;
    delete: (id: string) => Promise<IpcResponse<SerieDocumentoDto>>;
  };
  artigos: {
    list: (filters?: {
      search?: string;
      tipo?: string;
      estado?: string;
      familia?: string;
      skip?: number;
      take?: number;
    }) => Promise<IpcResponse<PaginatedResult<ArtigoDto>>>;
    get: (id: string) => Promise<IpcResponse<ArtigoDto>>;
    create: (data: Partial<ArtigoDto>) => Promise<IpcResponse<ArtigoDto>>;
    update: (id: string, data: Partial<ArtigoDto>) => Promise<IpcResponse<ArtigoDto>>;
    delete: (id: string) => Promise<IpcResponse<{ deleted: boolean; inativado?: boolean; message: string }>>;
  };
  clientes: {
    list: (filters?: {
      search?: string;
      tipo?: string;
      estado?: string;
      skip?: number;
      take?: number;
    }) => Promise<IpcResponse<PaginatedResult<ClienteDto>>>;
    get: (id: string) => Promise<IpcResponse<ClienteDto>>;
    create: (data: Partial<ClienteDto>) => Promise<IpcResponse<ClienteDto>>;
    update: (id: string, data: Partial<ClienteDto>) => Promise<IpcResponse<ClienteDto>>;
    delete: (id: string) => Promise<IpcResponse<{ deleted: boolean; inativado?: boolean; message: string }>>;
  };
  fornecedores: {
    list: (filters?: {
      search?: string;
      estado?: string;
      skip?: number;
      take?: number;
    }) => Promise<IpcResponse<PaginatedResult<FornecedorDto>>>;
    get: (id: string) => Promise<IpcResponse<FornecedorDto>>;
    create: (data: Partial<FornecedorDto>) => Promise<IpcResponse<FornecedorDto>>;
    update: (id: string, data: Partial<FornecedorDto>) => Promise<IpcResponse<FornecedorDto>>;
    delete: (id: string) => Promise<IpcResponse<{ deleted: boolean; message: string }>>;
  };
  armazens: {
    list: (filters?: { search?: string; tipo?: string; ativo?: boolean; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<ArmazemDto>>>;
    get: (id: string) => Promise<IpcResponse<ArmazemDto>>;
    getDefaultVendas: () => Promise<IpcResponse<ArmazemDto>>;
    getDefaultCompras: () => Promise<IpcResponse<ArmazemDto>>;
    getStock: (armazemId: string) => Promise<IpcResponse<ArmazemStockDetailDto>>;
    create: (data: Partial<ArmazemDto>) => Promise<IpcResponse<ArmazemDto>>;
    update: (id: string, data: Partial<ArmazemDto>) => Promise<IpcResponse<ArmazemDto>>;
    delete: (id: string) => Promise<IpcResponse<{ deleted: boolean; inativado?: boolean; message: string }>>;
  };
  localizacoes: {
    list: (filters?: {
      zonaId?: string;
      search?: string;
      apenasAtivas?: boolean;
      apenasPickable?: boolean;
      apenasPutaway?: boolean;
    }) => Promise<IpcResponse<LocalizacaoArmazemDto[]>>;
    get: (id: string) => Promise<IpcResponse<LocalizacaoArmazemDto>>;
    areas: (armazemId: string) => Promise<IpcResponse<AreaArmazemDto[]>>;
    criarArea: (data: {
      armazemId: string;
      codigo: string;
      designacao: string;
      tipo?: string | null;
      descricao?: string | null;
      ativo?: boolean;
    }) => Promise<IpcResponse<AreaArmazemDto>>;
    zonas: (areaId: string) => Promise<IpcResponse<ZonaArmazemDto[]>>;
    criarZona: (data: {
      areaId: string;
      codigo: string;
      designacao: string;
      descricao?: string | null;
      altaRotacao?: boolean;
      temperaturaControlada?: boolean;
      ativo?: boolean;
    }) => Promise<IpcResponse<ZonaArmazemDto>>;
    actualizarArea: (id: string, data: {
      codigo?: string;
      designacao?: string;
      tipo?: string | null;
      descricao?: string | null;
      ativo?: boolean;
    }) => Promise<IpcResponse<AreaArmazemDto>>;
    desactivarArea: (id: string) => Promise<IpcResponse<AreaArmazemDto>>;
    actualizarZona: (id: string, data: {
      codigo?: string;
      designacao?: string;
      descricao?: string | null;
      altaRotacao?: boolean;
      temperaturaControlada?: boolean;
      ativo?: boolean;
    }) => Promise<IpcResponse<ZonaArmazemDto>>;
    desactivarZona: (id: string) => Promise<IpcResponse<ZonaArmazemDto>>;
    tree: (armazemId: string) => Promise<IpcResponse<ArvoreLocalizacaoDto[]>>;
    create: (data: unknown) => Promise<IpcResponse<LocalizacaoArmazemDto>>;
    update: (id: string, data: unknown) => Promise<IpcResponse<LocalizacaoArmazemDto>>;
    delete: (id: string) => Promise<IpcResponse<LocalizacaoArmazemDto>>;
    mostrarCapacidade: (id: string) => Promise<IpcResponse<{
      id: string;
      codigo: string;
      designacao?: string | null;
      capacidadeQuantidade: number | null;
      capacidadePeso: number | null;
      capacidadeVolume: number | null;
      quantidadeActual: number;
    }>>;
    mostrarEstado: (id: string) => Promise<IpcResponse<{
      id: string;
      codigo: string;
      ativo: boolean;
      bloqueada: boolean;
      isPickable: boolean;
      isPutaway: boolean;
    }>>;
  };
  lotes: {
    list: (filters?: {
      artigoId?: string;
      search?: string;
      estadoValidade?: 'valido' | 'proximo_caducar' | 'caducado' | 'sem_validade';
      skip?: number;
      take?: number;
    }) => Promise<IpcResponse<PaginatedResult<LoteDto>>>;
    get: (id: string) => Promise<IpcResponse<LoteDto>>;
    create: (data: {
      artigoId: string;
      numeroLote: string;
      dataFabrico?: string | Date | null;
      dataValidade?: string | Date | null;
      fornecedorId?: string | null;
      precoCusto?: number | string | null;
      observacoes?: string | null;
    }) => Promise<IpcResponse<LoteDto>>;
    update: (id: string, data: Partial<LoteDto>) => Promise<IpcResponse<LoteDto>>;
    delete: (id: string) => Promise<IpcResponse<{ id: string }>>;
  };
  inventory: {
    consultarSaldo: (data: {
      artigoId: string;
      armazemId?: string;
    }) => Promise<IpcResponse<{ disponivel: number }>>;
    consultarStock: (filters?: FiltrosStockLocalizacao) => Promise<
      IpcResponse<{ items: StockLocalizacaoDto[]; total: number; skip: number; take: number }>
    >;
  };
  stock: {
    listMovimentos: (filters?: {
      artigoId?: string;
      armazemId?: string;
      tipo?: string;
      search?: string;
      dataInicio?: string | Date;
      dataFim?: string | Date;
      skip?: number;
      take?: number;
    }) => Promise<IpcResponse<PaginatedResult<MovimentoStockDto>>>;
    getArtigoArmazem: (artigoId: string, armazemId: string) => Promise<IpcResponse<number>>;
    getTotalArtigo: (artigoId: string) => Promise<IpcResponse<number>>;
    createMovimento: (data: Partial<MovimentoStockDto>) => Promise<IpcResponse<MovimentoStockDto>>;
    transferencia: (data: {
      artigoId: string;
      quantidade: number;
      armazemOrigemId: string;
      armazemDestinoId: string;
      lote?: string | null;
      documentoOrigem?: string;
    }) => Promise<IpcResponse<MovimentoStockDto>>;
    baixaVenda: (data: {
      armazemId?: string | null;
      documentoOrigem: string;
      linhas: Array<{ artigoId: string; quantidade: number; precoUnitario?: number }>;
    }) => Promise<IpcResponse<MovimentoStockDto[]>>;
    listInventarios: () => Promise<IpcResponse<InventarioContagemDto[]>>;
    criarInventario: (data: {
      numero?: string;
      data: string | Date;
      armazemId: string;
      responsavel?: string;
      observacoes?: string;
      linhas: Array<{ artigoId: string; qtdContada: number; lote?: string }>;
    }) => Promise<IpcResponse<InventarioContagemDto>>;
    fecharInventario: (id: string) => Promise<IpcResponse<InventarioContagemDto>>;
    getEstadoStock: (filters?: unknown) => Promise<IpcResponse<PaginatedResult<AlertaStockDto>>>;
  };
  compras: {
    listEncomendas: (filters?: { fornecedorId?: string; estado?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<EncomendaCompraDto>>>;
    getEncomenda: (id: string) => Promise<IpcResponse<EncomendaCompraDto>>;
    createEncomenda: (data: Partial<EncomendaCompraDto>) => Promise<IpcResponse<EncomendaCompraDto>>;
    listGuias: (filters?: { fornecedorId?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<GuiaRecepcaoDto>>>;
    getGuia: (id: string) => Promise<IpcResponse<GuiaRecepcaoDto>>;
    createGuia: (data: Partial<GuiaRecepcaoDto>) => Promise<IpcResponse<GuiaRecepcaoDto>>;
    listFaturas: (filters?: { fornecedorId?: string; estado?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<FaturaCompraDto>>>;
    getFatura: (id: string) => Promise<IpcResponse<FaturaCompraDto>>;
    createFatura: (data: Partial<FaturaCompraDto>) => Promise<IpcResponse<FaturaCompraDto>>;
  };
  vendas: {
    listFaturas: (filters?: { empresaId?: string; clienteId?: string; tipo?: string; estadoDocumento?: string; estadoPagamento?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<FaturaVendaDto>>>;
    getFatura: (id: string) => Promise<IpcResponse<FaturaVendaDto>>;
    emitirFatura: (data: {
      empresaId: string;
      serie: string;
      tipo?: 'fatura' | 'fatura_recibo' | 'nota_credito' | 'nota_debito';
      dataEmissao?: string | Date;
      dataVencimento?: string | Date;
      clienteId: string;
      armazemExpedicaoId?: string | null;
      encomendaOrigem?: string | null;
      faturaOrigemId?: string | null;
      guiaEntregaOrigemId?: string | null;
      proformaOrigemId?: string | null;
      motivoNotaCredito?: string | null;
      motivoIsencao?: string | null;
      estadoPagamento?: 'pago' | 'pendente' | 'parcial' | 'vencido';
      /// Obrigatórios quando `tipo = 'fatura_recibo'`: a fatura afirma que o
      /// dinheiro já entrou, logo a conta tem de ser reais.
      meioPagamento?: 'numerario' | 'transferencia' | 'cheque' | 'multicaixa' | null;
      contaBancariaId?: string | null;
      dataPagamento?: string | Date;
      linhas: Array<{
        artigoId: string;
        quantidade: number;
        precoUnitario: number;
        desconto?: number;
        taxaIva: number;
        motivoIsencao?: string | null;
      }>;
    }) => Promise<IpcResponse<FaturaVendaDto>>;
    anularFatura: (id: string, motivo: string) => Promise<IpcResponse<FaturaVendaDto>>;
    getDocumentoImprimivel: (id: string) => Promise<IpcResponse<DocumentoPrintDto>>;
  };
  proformas: {
    list: (filters?: { empresaId?: string; clienteId?: string; estado?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<ProformaVendaDto>>>;
    get: (id: string) => Promise<IpcResponse<ProformaVendaDto>>;
    criar: (data: {
      empresaId: string;
      serie: string;
      dataEmissao?: string | Date;
      dataValidade?: string | Date;
      clienteId: string;
      encomendaOrigem?: string | null;
      motivoIsencao?: string | null;
      linhas: Array<{
        artigoId: string;
        quantidade: number;
        precoUnitario: number;
        desconto?: number;
        taxaIva: number;
        motivoIsencao?: string | null;
      }>;
    }) => Promise<IpcResponse<ProformaVendaDto>>;
    emitir: (id: string) => Promise<IpcResponse<ProformaVendaDto>>;
    converterParaFatura: (id: string, data: { serie: string; armazemExpedicaoId?: string | null }) => Promise<IpcResponse<FaturaVendaDto>>;
    converterParaGuia: (id: string, data: { serie: string; armazemExpedicaoId: string; localEntrega?: string | null; transportador?: string | null }) => Promise<IpcResponse<GuiaEntregaDto>>;
    anular: (id: string, motivo: string) => Promise<IpcResponse<ProformaVendaDto>>;
    getDocumentoImprimivel: (id: string) => Promise<IpcResponse<DocumentoPrintDto>>;
  };
  guiasEntrega: {
    list: (filters?: { empresaId?: string; clienteId?: string; estado?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<GuiaEntregaDto>>>;
    get: (id: string) => Promise<IpcResponse<GuiaEntregaDto>>;
    criar: (data: {
      empresaId: string;
      serie: string;
      data?: string | Date;
      clienteId: string;
      armazemExpedicaoId: string;
      proformaOrigemId?: string | null;
      encomendaOrigem?: string | null;
      localEntrega?: string | null;
      transportador?: string | null;
      observacoes?: string | null;
      linhas: Array<{
        artigoId: string;
        quantidade: number;
        lote?: string | null;
      }>;
    }) => Promise<IpcResponse<GuiaEntregaDto>>;
    confirmar: (id: string) => Promise<IpcResponse<GuiaEntregaDto>>;
    faturar: (id: string, data: { serie: string }) => Promise<IpcResponse<FaturaVendaDto>>;
    anular: (id: string, motivo: string) => Promise<IpcResponse<GuiaEntregaDto>>;
    getDocumentoImprimivel: (id: string) => Promise<IpcResponse<DocumentoPrintDto>>;
  };
  recibos: {
    list: (filters?: { empresaId?: string; clienteId?: string; estadoDocumento?: string; search?: string; skip?: number; take?: number }) => Promise<IpcResponse<PaginatedResult<ReciboVendaDto>>>;
    get: (id: string) => Promise<IpcResponse<ReciboVendaDto>>;
    criar: (data: {
      empresaId: string;
      serie: string;
      data?: string | Date;
      clienteId: string;
      meioPagamento: 'numerario' | 'transferencia' | 'cheque' | 'multicaixa';
      valorRecebido: number;
      contaBancaria?: string | null;
      contaBancariaId: string;
      retencaoFonte?: number;
      observacoes?: string | null;
      imputacoes?: Array<{ faturaId: string; valorImputado: number }>;
    }) => Promise<IpcResponse<ReciboVendaDto>>;
    imputarFaturas: (id: string, imputacoes: Array<{ faturaId: string; valorImputado: number }>) => Promise<IpcResponse<ReciboVendaDto>>;
    anular: (id: string, motivo: string) => Promise<IpcResponse<ReciboVendaDto>>;
    getDocumentoImprimivel: (id: string) => Promise<IpcResponse<DocumentoPrintDto>>;
  };
  tesouraria: {
    // Contas bancárias
    listarContas: (filters?: {
      empresaId?: string;
      tipo?: TipoContaBancaria;
      apenasAtivas?: boolean;
      search?: string;
    }) => Promise<IpcResponse<PaginatedResult<ContaBancariaDto>>>;
    listarContasComSaldos: (filters?: {
      empresaId?: string;
      tipo?: TipoContaBancaria;
      apenasAtivas?: boolean;
      search?: string;
    }) => Promise<IpcResponse<PaginatedResult<ContaBancariaComSaldoDto>>>;
    listarContasContabeisDisponiveis: (
      empresaId: string,
      contaBancariaId?: string
    ) => Promise<IpcResponse<ContaContabilDisponivelDto[]>>;
    obterConta: (id: string) => Promise<IpcResponse<ContaBancariaComSaldoDto>>;
    resumoSaldos: (filters?: {
      empresaId?: string;
      tipo?: TipoContaBancaria;
      apenasAtivas?: boolean;
      search?: string;
    }) => Promise<IpcResponse<ResumoSaldoContaDto[]>>;
    criarConta: (data: ContaBancariaCriarInput) => Promise<IpcResponse<ContaBancariaDto>>;
    atualizarConta: (id: string, data: ContaBancariaAtualizarInput) => Promise<IpcResponse<ContaBancariaDto>>;
    ajustarSaldoInicial: (
      id: string,
      saldoInicial: number,
      observacoes?: string
    ) => Promise<IpcResponse<ContaBancariaDto>>;
    desativarConta: (id: string) => Promise<IpcResponse<ContaBancariaDto>>;
    reativarConta: (id: string) => Promise<IpcResponse<ContaBancariaDto>>;
    removerConta: (id: string) => Promise<IpcResponse<{ success: boolean }>>;
    // Lançamentos
    listarMovimentos: (filters?: MovimentoTesourariaFilters) => Promise<IpcResponse<PaginatedResult<MovimentoTesourariaDto>>>;
    obterMovimento: (id: string) => Promise<IpcResponse<MovimentoTesourariaDto>>;
    resumo: (filters?: MovimentoTesourariaFilters) => Promise<IpcResponse<ResumoTesourariaDto>>;
    criarMovimento: (data: MovimentoTesourariaCriarInput) => Promise<IpcResponse<MovimentoTesourariaDto>>;
    confirmarMovimento: (id: string) => Promise<IpcResponse<MovimentoTesourariaDto>>;
    estornarMovimento: (id: string, data: { motivo: string }) => Promise<IpcResponse<MovimentoTesourariaDto>>;
    conciliarMovimento: (
      id: string,
      conciliado: boolean,
      dataConciliacao?: string
    ) => Promise<IpcResponse<MovimentoTesourariaDto>>;
    conciliarLote: (data: ConciliacaoLoteInput) => Promise<IpcResponse<{ atualizados: number }>>;
    validarMeioPagamento: (data: {
      empresaId: string;
      meioPagamento: string;
      contaBancariaId: string;
    }) => Promise<IpcResponse<ValidacaoMeioPagamentoDto>>;
    // Sessões de caixa
    listarSessoes: (filters?: {
      empresaId?: string;
      contaCaixaId?: string;
      estado?: EstadoSessaoCaixa;
      dataInicio?: string | Date;
      dataFim?: string | Date;
    }) => Promise<IpcResponse<PaginatedResult<SessaoCaixaDto>>>;
    obterSessao: (id: string) => Promise<IpcResponse<SessaoCaixaDto>>;
    obterSessaoAberta: (contaCaixaId: string) => Promise<IpcResponse<SessaoCaixaDto | null>>;
    apurarSessao: (id: string) => Promise<IpcResponse<ApuramentoSessaoDto>>;
    listarMovimentosSessao: (id: string) => Promise<IpcResponse<MovimentoTesourariaDto[]>>;
    abrirSessao: (data: AbrirSessaoCaixaInput) => Promise<IpcResponse<SessaoCaixaDto>>;
    fecharSessao: (id: string, data: FecharSessaoCaixaInput) => Promise<IpcResponse<SessaoCaixaDto>>;
  };
  contabilidade: {
    contas: {
      listar: (
        filters?: ContaContabilFiltros
      ) => Promise<IpcResponse<PaginatedResult<ContaContabilDto>>>;
      arvore: (empresaId: string) => Promise<IpcResponse<ContaContabilDto[]>>;
      obter: (id: string) => Promise<IpcResponse<ContaContabilDto>>;
      criar: (data: ContaContabilCriarInput) => Promise<IpcResponse<ContaContabilDto>>;
      atualizar: (
        id: string,
        data: ContaContabilAtualizarInput
      ) => Promise<IpcResponse<ContaContabilDto>>;
      remover: (id: string) => Promise<IpcResponse<void>>;
    };
    diarios: {
      listar: (
        filters?: DiarioContabilFiltros
      ) => Promise<IpcResponse<PaginatedResult<DiarioContabilDto>>>;
      obter: (id: string) => Promise<IpcResponse<DiarioContabilDto>>;
      criar: (data: DiarioContabilCriarInput) => Promise<IpcResponse<DiarioContabilDto>>;
      atualizar: (
        id: string,
        data: DiarioContabilAtualizarInput
      ) => Promise<IpcResponse<DiarioContabilDto>>;
      remover: (id: string) => Promise<IpcResponse<void>>;
    };
    exercicios: {
      listar: (empresaId?: string) => Promise<IpcResponse<ExercicioFiscalDto[]>>;
      obter: (id: string) => Promise<IpcResponse<ExercicioFiscalDto>>;
    };
    periodos: {
      listar: (
        filters?: PeriodoContabilFiltros
      ) => Promise<IpcResponse<PaginatedResult<PeriodoContabilDto>>>;
      obter: (id: string) => Promise<IpcResponse<PeriodoContabilDto>>;
      criar: (data: PeriodoContabilCriarInput) => Promise<IpcResponse<PeriodoContabilDto>>;
      criarDoExercicio: (exercicioId: string) => Promise<IpcResponse<PeriodoContabilDto[]>>;
      alterarEstado: (
        id: string,
        data: AlterarEstadoPeriodoInput
      ) => Promise<IpcResponse<PeriodoContabilDto>>;
      fechar: (id: string) => Promise<IpcResponse<PeriodoContabilDto>>;
      reabrir: (id: string) => Promise<IpcResponse<PeriodoContabilDto>>;
      bloquear: (id: string) => Promise<IpcResponse<PeriodoContabilDto>>;
    };
    mapeamentos: {
      listar: (
        filters?: { empresaId?: string }
      ) => Promise<IpcResponse<PaginatedResult<MapeamentoContaDto>>>;
      obter: (id: string) => Promise<IpcResponse<MapeamentoContaDto>>;
      guardar: (data: MapeamentoContaGuardarInput) => Promise<IpcResponse<MapeamentoContaDto>>;
      remover: (id: string) => Promise<IpcResponse<void>>;
    };
    semear: () => Promise<IpcResponse<SemearContabilidadeResultadoDto>>;
    lancamentos: {
      listar: (filters?: LancamentoContabilFiltros) => Promise<IpcResponse<LancamentoContabilListResult>>;
      obter: (id: string) => Promise<IpcResponse<LancamentoContabilDto>>;
      criar: (data: LancamentoContabilCriarInput) => Promise<IpcResponse<LancamentoContabilDto>>;
      atualizar: (id: string, data: LancamentoContabilAtualizarInput) => Promise<IpcResponse<LancamentoContabilDto>>;
      validar: (id: string) => Promise<IpcResponse<LancamentoContabilDto>>;
      estornar: (id: string, data: LancamentoContabilEstornarInput) => Promise<IpcResponse<EstornoLancamentoResultado>>;
      remover: (id: string) => Promise<IpcResponse<void>>;
    },
    reconciliacao: {
      listarContas: (empresaId: string) => Promise<IpcResponse<ContaBancariaReconciliavelDto[]>>;
      resumo: (contaBancariaId: string, empresaId: string) => Promise<IpcResponse<ResumoReconciliacaoDto>>;
      sugerir: (contaBancariaId: string, empresaId: string, data?: { janelaDias?: number }) => Promise<IpcResponse<SugestaoReconciliacaoDto[]>>;
      conciliar: (contaBancariaId: string, empresaId: string, data: ConciliarInput) => Promise<IpcResponse<{ conciliados: number }>>;
      desconciliar: (contaBancariaId: string, empresaId: string, data: DesconciliarInput) => Promise<IpcResponse<{ desconciliados: number }>>;
      gerarLancamento: (contaBancariaId: string, empresaId: string, data: GerarLancamentoDeMovimentoInput) => Promise<IpcResponse<{ lancamentoId: string }>>;
    },
    regras: {
      listar: (filters?: { empresaId?: string; activa?: boolean; search?: string }) => Promise<IpcResponse<RegraContabilizacaoDto[]>>;
      obter: (id: string) => Promise<IpcResponse<RegraContabilizacaoDto>>;
      criar: (data: RegraContabilizacaoCriarInput) => Promise<IpcResponse<RegraContabilizacaoDto>>;
      atualizar: (id: string, data: RegraContabilizacaoAtualizarInput) => Promise<IpcResponse<RegraContabilizacaoDto>>;
      remover: (id: string) => Promise<IpcResponse<void>>;
    },
    errosIntegracao: {
      listar: (filters?: { empresaId?: string; resolvido?: boolean; moduloOrigem?: string; tipoOrigem?: string }) => Promise<IpcResponse<ErroIntegracaoContabilDto[]>>;
      reprocessar: (erroId: string) => Promise<IpcResponse<{ sucesso: boolean; pendente: boolean; mensagem: string }>>;
    },
    fecho: {
      previsao: (periodoId: string) => Promise<IpcResponse<PrevisaoFechoDto>>;
      executar: (periodoId: string) => Promise<IpcResponse<{ execucaoId: string }>>;
      reabrir: (periodoId: string, data: ReabrirPeriodoInput) => Promise<IpcResponse<void>>;
      listarExecucoes: (filters?: ExecucaoFechoFiltros) => Promise<IpcResponse<{ items: ExecucaoFechoDto[]; total: number }>>;
    },
    apuramentoIva: {
      previsao: (periodoId: string) => Promise<IpcResponse<PrevisaoApuramentoIvaDto>>;
      listar: (filters?: { exercicioId?: string }) => Promise<IpcResponse<ApuramentoImpostoDto[]>>;
      executar: (periodoId: string) => Promise<IpcResponse<ApuramentoIvaExecutarResultadoDto>>;
      pagamento: (data: ApuramentoIvaPagamentoInput) => Promise<IpcResponse<ApuramentoIvaPagamentoResultadoDto>>;
    },
    resultados: {
      previsao: (exercicioId: string) => Promise<IpcResponse<PrevisaoResultadosDto>>;
      executar: (exercicioId: string) => Promise<IpcResponse<ApuramentoResultadosExecutarResultadoDto>>;
    },
    fechoAnual: {
      previsao: (exercicioId: string) => Promise<IpcResponse<PrevisaoFechoAnualDto>>;
      executar: (exercicioId: string) => Promise<IpcResponse<FechoAnualExecutarResultadoDto>>;
      abrir: (exercicioId: string) => Promise<IpcResponse<AberturaExercicioResultadoDto>>;
      reabrir: (exercicioId: string, data: ReabrirExercicioInput) => Promise<IpcResponse<void>>;
    },
    demonstracoes: {
      listarEstruturas: (empresaId?: string) => Promise<IpcResponse<EstruturaRelatorioDto[]>>;
      obterEstrutura: (id: string) => Promise<IpcResponse<EstruturaRelatorioDto>>;
      guardarEstrutura: (empresaId: string, payload: EstruturaRelatorioInput) => Promise<IpcResponse<EstruturaRelatorioDto>>;
      removerEstrutura: (id: string) => Promise<IpcResponse<void>>;
      gerar: (estruturaId: string, dataInicio: string, dataFim: string) => Promise<IpcResponse<DemonstracaoDto>>;
    },
    relatorios: {
      balancete: (filters: BalanceteFiltrosDto) => Promise<IpcResponse<BalanceteResultadoDto>>;
      razao: (filters: RazaoFiltrosDto) => Promise<IpcResponse<RazaoResultadoDto>>;
      diarios: (filters: RelatorioDiariosFiltrosDto) => Promise<IpcResponse<RelatorioDiariosResultadoDto>>;
      contaCorrente: (filters: ContaCorrenteFiltrosDto) => Promise<IpcResponse<ContaCorrenteResultadoDto>>;
      exportarRelatorio: (payload: ExportarRelatorioContabilDto) => Promise<IpcResponse<ResultadoExportacaoRelatorioContabilDto>>;
    },
  };
  fiscal: {
    // SAF-T
    gerarSaft: (payload: PeriodoFiscalDto) => Promise<IpcResponse<ResultadoGerarSaftDto>>;
    validarSaft: (payload: PeriodoFiscalDto) => Promise<IpcResponse<ResultadoValidarSaftDto>>;
    // Conformidade AGT
    gerarAgt: (payload: PeriodoFiscalDto & { software: SoftwareAgtDto; nomeFicheiro?: string }) =>
      Promise<IpcResponse<FicheiroAgtDto>>;
    registarRespostaAgt: (payload: {
      submissaoId: string;
      estado: EstadoSubmissaoAgtDto;
      respostaAgt: string;
      hashRecebido: string;
    }) => Promise<IpcResponse<{ submissaoId: string; estado: EstadoSubmissaoAgtDto }>>;
    listarSubmissoes: (payload: { empresaId: string; estado?: EstadoSubmissaoAgtDto; limite?: number }) =>
      Promise<IpcResponse<SubmissaoAgtDto[]>>;
    // Auditoria
    listarAuditoria: (payload: {
      empresaId: string;
      entidade?: string;
      entidadeId?: string;
      utilizadorId?: string;
      acao?: string;
      severidade?: 'info' | 'aviso' | 'critico';
      modulo?: string;
      desde?: string;
      ate?: string;
      cursor?: string;
      limite?: number;
      incluirArquivados?: boolean;
    }) => Promise<IpcResponse<ListaAuditoriaDto>>;
    arquivarAuditoria: (payload: { id: string }) => Promise<IpcResponse<{ success: boolean }>>;
    desarquivarAuditoria: (payload: { id: string }) => Promise<IpcResponse<{ success: boolean }>>;
    verificarIntegridade: (payload: { empresaId: string; desde?: string; ate?: string; limite?: number }) =>
      Promise<IpcResponse<VerificacaoIntegridadeDto>>;
    resumoAuditoria: (payload: { empresaId: string; desde?: string; ate?: string }) =>
      Promise<IpcResponse<{ porAcao: Record<string, number>; porSeveridade: Record<string, number> }>>;
  };
  relatorios: {
    completo: (payload: PeriodoRelatorioDto & { limite?: number }) =>
      Promise<IpcResponse<RelatorioCompletoDto>>;
    resumo: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<ResumoExecutivoDto>>;
    vendasPorMes: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<SerieMensalDto[]>>;
    fluxoTesouraria: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaFluxoTesourariaDto[]>>;
    topArtigos: (payload: PeriodoRelatorioDto & { limite?: number }) =>
      Promise<IpcResponse<LinhaTopArtigoDto[]>>;
    topClientes: (payload: PeriodoRelatorioDto & { limite?: number }) =>
      Promise<IpcResponse<LinhaTopClienteDto[]>>;
    /** Sem payload: o stock baixo é um estado actual, não um período. */
    stockBaixo: () => Promise<IpcResponse<LinhaStockBaixoDto[]>>;
    valorizacao: (payload: { limite?: number }) => Promise<IpcResponse<LinhaValorizacaoDto[]>>;
    ivaPorTaxa: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaIvaDto[]>>;
    // RH-801 novos relatórios
    folhaVencimentos: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaFolhaVencimentoDto[]>>;
    resumoIrt: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<ResumoIrtDto>>;
    resumoInss: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<ResumoInssDto>>;
    mapaFerias: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaMapaFeriasDto[]>>;
    mapaAusencias: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaMapaAusenciasDto[]>>;
    dividasAbertas: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaDividasAbertasDto[]>>;
    custoDepartamento: (payload: PeriodoRelatorioDto) => Promise<IpcResponse<LinhaCustoDepartamentoDto[]>>;
    /** Exige `relatorios: write` e abre o diálogo de gravação no Main. */
    exportar: (
      payload: PeriodoRelatorioDto & {
        relatorio: NomeRelatorioDto;
        formato: 'csv' | 'xlsx' | 'pdf';
        limite?: number;
      },
    ) => Promise<
      IpcResponse<{
        /** `true` quando o utilizador fechou o diálogo sem guardar. */
        cancelado?: boolean;
        caminho?: string;
        linhas?: number;
        formato?: string;
      }>
    >;
  };
  documentoPrint: {
    exportPdf: (options: { suggestedFilename: string }) => Promise<IpcResponse<{ success: boolean; canceled?: boolean; filePath?: string }>>;
  };
  rh: {
    /** Canal de diagnóstico da Fase 0 (exige `rh: read`). */
    ping: () => Promise<IpcResponse<RhPingDto>>;
    funcionarios: {
      listar: (
        filtros?: RhFiltroFuncionarioInput
      ) => Promise<IpcResponse<RhPaginaDto<RhFuncionarioListaDto>>>;
      get: (id: string) => Promise<IpcResponse<RhFuncionarioDetalheDto>>;
      criar: (dados: RhFuncionarioInput) => Promise<IpcResponse<RhFuncionarioDetalheDto>>;
      atualizar: (
        dados: RhFuncionarioInput & { id: string }
      ) => Promise<IpcResponse<RhFuncionarioDetalheDto>>;
      inativar: (id: string) => Promise<IpcResponse<RhFuncionarioDetalheDto>>;
      dependentes: {
        criar: (dados: RhDependenteCriarInput) => Promise<IpcResponse<RhDependenteDto>>;
        atualizar: (dados: RhDependenteAtualizarInput) => Promise<IpcResponse<RhDependenteDto>>;
        remover: (id: string) => Promise<IpcResponse<{ id: string }>>;
      };
      rubricasFixas: {
        criar: (
          dados: RhFuncionarioRubricaCriarInput
        ) => Promise<IpcResponse<RhFuncionarioRubricaDto>>;
        atualizar: (
          dados: RhFuncionarioRubricaAtualizarInput
        ) => Promise<IpcResponse<RhFuncionarioRubricaDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhFuncionarioRubricaDto>>;
      };
      documentos: {
        criar: (
          dados: RhFuncionarioDocumentoCriarInput
        ) => Promise<IpcResponse<RhFuncionarioDocumentoDto>>;
        atualizar: (
          dados: RhFuncionarioDocumentoAtualizarInput
        ) => Promise<IpcResponse<RhFuncionarioDocumentoDto>>;
        remover: (id: string) => Promise<IpcResponse<{ id: string }>>;
      };
    };
    contratos: {
      listar: (funcionarioId: string) => Promise<IpcResponse<RhContratoDto[]>>;
      get: (id: string) => Promise<IpcResponse<RhContratoDto>>;
      criar: (dados: RhContratoCriarInput) => Promise<IpcResponse<RhContratoDto>>;
      atualizar: (dados: RhContratoAtualizarInput) => Promise<IpcResponse<RhContratoDto>>;
      cessar: (dados: RhCessarContratoInput) => Promise<IpcResponse<RhContratoDto>>;
      criarAlteracao: (
        dados: RhAlteracaoSalarialInput
      ) => Promise<IpcResponse<RhAlteracaoSalarialDto>>;
      salarioNaData: (
        funcionarioId: string,
        data: string
      ) => Promise<IpcResponse<RhSalarioNaDataDto>>;
    };
    importacao: {
      selecionar: () => Promise<IpcResponse<RhImportacaoSelecionarResultado>>;
      funcionarios: {
        previsualizar: (
          dados: RhImportacaoConteudoInput
        ) => Promise<IpcResponse<RhImportacaoPreviewDto>>;
        importar: (
          dados: RhImportacaoImportarInput
        ) => Promise<IpcResponse<RhImportacaoResultadoDto>>;
      };
      contratos: {
        previsualizar: (
          dados: RhImportacaoConteudoInput
        ) => Promise<IpcResponse<RhImportacaoPreviewDto>>;
        importar: (
          dados: RhImportacaoImportarInput
        ) => Promise<IpcResponse<RhImportacaoResultadoDto>>;
      };
    };
    alteracoesMensais: {
      listar: (
        input: RhAlteracoesMensaisListarInput
      ) => Promise<IpcResponse<RhAlteracoesMensaisPaginaDto>>;
      criar: (
        dados: RhAlteracaoMensalCriarInput
      ) => Promise<IpcResponse<RhAlteracaoMensalDto>>;
      atualizar: (
        dados: RhAlteracaoMensalAtualizarInput
      ) => Promise<IpcResponse<RhAlteracaoMensalDto>>;
      anular: (
        id: string,
        motivo?: string
      ) => Promise<IpcResponse<RhAlteracaoMensalDto>>;
      copiarMesAnterior: (
        input: RhCopiarMesAnteriorInput
      ) => Promise<IpcResponse<RhCopiarMesAnteriorResultado>>;
    };
    processamento: {
      carregar: (
        input: RhProcessamentoLoaderInput
      ) => Promise<IpcResponse<RhProcessamentoLoaderResultado>>;
      simular: (
        input: RhSimularSalariosInput
      ) => Promise<IpcResponse<RhSimulacaoResultadoDto>>;
      preparar: (
        input: RhPrepararSalariosInput
      ) => Promise<IpcResponse<RhPrepararResultadoDto>>;
      processar: (
        input: RhProcessarIndividualInput
      ) => Promise<IpcResponse<RhProcessarIndividualResultadoDto>>;
      processarLote: (
        input: RhProcessarLoteInput
      ) => Promise<IpcResponse<RhProcessarLoteResultadoDto>>;
      anular: (
        input: RhAnularProcessamentosInput
      ) => Promise<IpcResponse<RhAnularProcessamentosResultadoDto>>;
      listar: (
        input: RhProcessamentoListarInput
      ) => Promise<IpcResponse<RhProcessamentoResumoDto[]>>;
      historico: (
        input: RhProcessamentoHistoricoInput
      ) => Promise<IpcResponse<RhProcessamentoHistoricoPaginaDto>>;
      obter: (input: { id: string }) => Promise<IpcResponse<RhProcessamentoDetalheDto>>;
      onProgresso: (callback: (progresso: ProgressoLoteDto) => void) => () => void;
    };
    // Recibos de processamento (RH-502/503)
    recibos: {
      listar: (
        input?: RhRecibosListarInput
      ) => Promise<IpcResponse<RhRecibosPaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhReciboResumoDto>>;
      gerarPdf: (input: RhRecibosGerarPdfInput) => Promise<IpcResponse<ArrayBuffer>>;
      registarImpressao: (id: string) => Promise<IpcResponse<void>>;
    };
    // Pagamentos (RH-504)
    pagamentos: {
      ordens: {
        listar: (
          input?: RhOrdensPagamentoListarInput
        ) => Promise<IpcResponse<{ total: number; items: OrdemPagamentoResumoDto[] }>>;
        criar: (input: RhOrdemPagamentoCriarInput) => Promise<IpcResponse<OrdemPagamentoResumoDto>>;
        obter: (id: string) => Promise<IpcResponse<OrdemPagamentoDetalheDto>>;
        gerarFicheiro: (id: string) => Promise<IpcResponse<string>>;
      };
      listar: (
        input?: RhPagamentosListarInput
      ) => Promise<IpcResponse<{ total: number; items: PagamentoResumoDto[] }>>;
      confirmar: (input: RhPagamentoConfirmarInput) => Promise<IpcResponse<void>>;
      estornar: (input: RhPagamentoEstornarInput) => Promise<IpcResponse<void>>;
    };
    // Ausências (RH-601)
    ausencias: {
      listar: (input?: RhAusenciasListarInput) => Promise<IpcResponse<RhAusenciaPaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhAusenciaDto>>;
      criar: (dados: RhAusenciaCriarInput) => Promise<IpcResponse<RhAusenciaDto>>;
      atualizar: (dados: RhAusenciaAtualizarInput) => Promise<IpcResponse<RhAusenciaDto>>;
      aprovar: (dados: RhAusenciaAprovarInput) => Promise<IpcResponse<RhAusenciaDto>>;
      inativar: (id: string) => Promise<IpcResponse<RhAusenciaDto>>;
    };
    // Horas Extra (RH-602)
    horasExtra: {
      listar: (input?: RhHorasExtraListarInput) => Promise<IpcResponse<RhHoraExtraPaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhHoraExtraDto>>;
      criar: (dados: RhHoraExtraCriarInput) => Promise<IpcResponse<RhHoraExtraDto>>;
      atualizar: (dados: RhHoraExtraAtualizarInput) => Promise<IpcResponse<RhHoraExtraDto>>;
      aprovar: (dados: RhHoraExtraAprovarInput) => Promise<IpcResponse<RhHoraExtraDto>>;
      inativar: (id: string) => Promise<IpcResponse<RhHoraExtraDto>>;
    };
    // Férias (RH-603)
    ferias: {
      saldos: {
        listar: (input?: RhFeriasSaldosListarInput) => Promise<IpcResponse<{ total: number; items: RhFeriasSaldoDto[] }>>;
        atualizar: (dados: RhFeriasSaldoAtualizarInput) => Promise<IpcResponse<RhFeriasSaldoDto>>;
      };
      marcacoes: {
        listar: (input?: RhMarcacoesFeriasListarInput) => Promise<IpcResponse<RhMarcacaoFeriasPaginaDto>>;
        obter: (id: string) => Promise<IpcResponse<RhMarcacaoFeriasDto>>;
        criar: (dados: RhMarcacaoFeriasCriarInput) => Promise<IpcResponse<RhMarcacaoFeriasDto>>;
        atualizar: (dados: RhMarcacaoFeriasAtualizarInput) => Promise<IpcResponse<RhMarcacaoFeriasDto>>;
        aprovar: (dados: RhMarcacaoFeriasAprovarInput) => Promise<IpcResponse<RhMarcacaoFeriasDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhMarcacaoFeriasDto>>;
      };
    };
    // Afetações (RH-605)
    afetacoes: {
      listar: (input?: RhAfetacoesListarInput) => Promise<IpcResponse<RhAfetacaoPaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhAfetacaoDto>>;
      criar: (dados: RhAfetacaoCriarInput) => Promise<IpcResponse<RhAfetacaoDto>>;
      atualizar: (dados: RhAfetacaoAtualizarInput) => Promise<IpcResponse<RhAfetacaoDto>>;
      remover: (id: string) => Promise<IpcResponse<RhAfetacaoDto>>;
    };
    // Dívidas/Penhora (RH-606/607)
    dividas: {
      processos: {
        listar: (input?: RhProcessosDividaListarInput) => Promise<IpcResponse<RhProcessoDividaPaginaDto>>;
        obter: (id: string) => Promise<IpcResponse<RhProcessoDividaDto>>;
        criar: (dados: RhProcessoDividaCriarInput) => Promise<IpcResponse<RhProcessoDividaDto>>;
        atualizar: (dados: RhProcessoDividaAtualizarInput) => Promise<IpcResponse<RhProcessoDividaDto>>;
        gerarPlano: (id: string) => Promise<IpcResponse<RhProcessoDividaDto>>;
        suspender: (dados: RhProcessoDividaSuspenderInput) => Promise<IpcResponse<RhProcessoDividaDto>>;
        liquidar: (id: string) => Promise<IpcResponse<RhProcessoDividaDto>>;
        cancelar: (dados: RhProcessoDividaCancelarInput) => Promise<IpcResponse<RhProcessoDividaDto>>;
      };
      prestacoes: {
        listar: (input?: RhPrestacoesDividaListarInput) => Promise<IpcResponse<RhPrestacaoDividaPaginaDto>>;
        obter: (id: string) => Promise<IpcResponse<RhPrestacaoDividaDto>>;
        atualizar: (dados: RhPrestacaoDividaAtualizarInput) => Promise<IpcResponse<RhPrestacaoDividaDto>>;
        descontar: (dados: RhPrestacaoDividaDescontarInput) => Promise<IpcResponse<RhPrestacaoDividaDto>>;
        anular: (dados: RhPrestacaoDividaAnularInput) => Promise<IpcResponse<RhPrestacaoDividaDto>>;
        perdoar: (dados: RhPrestacaoDividaPerdoarInput) => Promise<IpcResponse<RhPrestacaoDividaDto>>;
      };
    };
    // Retroactivos (RH-608)
    retroativos: {
      listar: (input?: RhRetroativosListarInput) => Promise<IpcResponse<RhRetroativoPaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhRetroativoDto>>;
      criar: (dados: RhRetroativoCriarInput) => Promise<IpcResponse<RhRetroativoDto>>;
      atualizar: (dados: RhRetroativoAtualizarInput) => Promise<IpcResponse<RhRetroativoDto>>;
      aplicar: (dados: RhRetroativoAplicarInput) => Promise<IpcResponse<RhRetroativoDto>>;
      anular: (dados: RhRetroativoAnularInput) => Promise<IpcResponse<RhRetroativoDto>>;
    };
    // Independentes (RH-701)
    independentes: {
      listar: (input?: RhIndependentesListarInput) => Promise<IpcResponse<RhIndependentePaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhIndependenteDto>>;
      criar: (dados: RhIndependenteCriarInput) => Promise<IpcResponse<RhIndependenteDto>>;
      atualizar: (dados: RhIndependenteAtualizarInput) => Promise<IpcResponse<RhIndependenteDto>>;
      inativar: (id: string) => Promise<IpcResponse<RhIndependenteDto>>;
    };
    // Atividades (RH-702)
    atividades: {
      listar: (input?: RhAtividadesListarInput) => Promise<IpcResponse<RhAtividadePaginaDto>>;
      obter: (id: string) => Promise<IpcResponse<RhAtividadeDto>>;
      criar: (dados: RhAtividadeCriarInput) => Promise<IpcResponse<RhAtividadeDto>>;
      atualizar: (dados: RhAtividadeAtualizarInput) => Promise<IpcResponse<RhAtividadeDto>>;
      inativar: (id: string) => Promise<IpcResponse<RhAtividadeDto>>;
    };
    // Auditoria (RH-802)
    auditoria: {
      listar: (input?: RhAuditoriaListarInput) => Promise<IpcResponse<RhAuditoriaPaginaDto>>;
      porFuncionario: (input: RhAuditoriaPorFuncionarioInput) => Promise<IpcResponse<RhAuditoriaPaginaDto>>;
      porProcessamento: (input: RhAuditoriaPorProcessamentoInput) => Promise<IpcResponse<RhAuditoriaPaginaDto>>;
    };
    config: {
      departamentos: {
        listar: (filtros?: RhFiltroCadastroInput) => Promise<IpcResponse<RhPaginaDto<RhDepartamentoDto>>>;
        criar: (dados: RhDepartamentoInput) => Promise<IpcResponse<RhDepartamentoDto>>;
        atualizar: (
          dados: RhDepartamentoInput & { id: string }
        ) => Promise<IpcResponse<RhDepartamentoDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhDepartamentoDto>>;
      };
      cargos: {
        listar: (filtros?: RhFiltroCadastroInput) => Promise<IpcResponse<RhPaginaDto<RhCargoDto>>>;
        criar: (dados: RhCargoInput) => Promise<IpcResponse<RhCargoDto>>;
        atualizar: (dados: RhCargoInput & { id: string }) => Promise<IpcResponse<RhCargoDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhCargoDto>>;
      };
      rubricas: {
        listar: (filtros?: RhFiltroCadastroInput) => Promise<IpcResponse<RhPaginaDto<RhRubricaDto>>>;
        get: (id: string) => Promise<IpcResponse<RhRubricaDto>>;
        criar: (dados: RhRubricaInput) => Promise<IpcResponse<RhRubricaDto>>;
        atualizar: (dados: RhRubricaInput & { id: string }) => Promise<IpcResponse<RhRubricaDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhRubricaDto>>;
      };
      tiposAusencia: {
        listar: (filtros?: RhFiltroCadastroInput) => Promise<IpcResponse<RhPaginaDto<RhTipoAusenciaDto>>>;
        criar: (dados: RhTipoAusenciaInput) => Promise<IpcResponse<RhTipoAusenciaDto>>;
        atualizar: (
          dados: RhTipoAusenciaInput & { id: string }
        ) => Promise<IpcResponse<RhTipoAusenciaDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhTipoAusenciaDto>>;
      };
      centrosCusto: {
        listar: (filtros?: RhFiltroCadastroInput) => Promise<IpcResponse<RhPaginaDto<RhCentroCustoDto>>>;
        criar: (dados: RhCentroCustoInput) => Promise<IpcResponse<RhCentroCustoDto>>;
        atualizar: (
          dados: RhCentroCustoInput & { id: string }
        ) => Promise<IpcResponse<RhCentroCustoDto>>;
        inativar: (id: string) => Promise<IpcResponse<RhCentroCustoDto>>;
      };
      parametros: {
        listar: (filtros?: { chave?: string }) => Promise<IpcResponse<RhParametroFiscalDto[]>>;
        criar: (dados: RhParametroInput) => Promise<IpcResponse<RhParametroFiscalDto>>;
      };
      irt: {
        listar: () => Promise<IpcResponse<RhTabelaIrtDto[]>>;
        get: (id: string) => Promise<IpcResponse<RhTabelaIrtDto>>;
        criar: (dados: RhTabelaIrtInput) => Promise<IpcResponse<RhTabelaIrtDto>>;
      };
      periodos: {
        listar: (ano: number) => Promise<IpcResponse<RhPeriodoDto[]>>;
        gerar: (ano: number) => Promise<IpcResponse<RhPeriodoDto[]>>;
        fechar: (id: string) => Promise<IpcResponse<RhPeriodoDto>>;
        reabrir: (id: string) => Promise<IpcResponse<RhPeriodoDto>>;
      };
      configuracao: {
        obter: () => Promise<IpcResponse<RhConfiguracaoDto>>;
        atualizar: (dados: RhConfiguracaoInput) => Promise<IpcResponse<RhConfiguracaoDto>>;
      };
      /** Cria dados de referência padrão em falta (RH-806). Idempotente. */
      referencia: {
        semear: () => Promise<IpcResponse<RhReferenciaSeedDto>>;
      };
    };
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: ErpApi;
  }
}
