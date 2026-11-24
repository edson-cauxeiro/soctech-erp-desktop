/**
 * @file contabilidade.api.ts
 * @description Cliente de API tipado da Contabilidade Geral.
 *
 * Tal como na tesouraria, todos os métodos devolvem `IpcResponse` em vez de
 * lançar: a UI mostra a mensagem de regra de negócio do backend (ex.: "uma
 * conta com filhas não aceita movimento") sem ter de a reconstruir.
 */

import {
  IpcResponse,
  PaginatedResult,
  ContaContabilDto,
  ContaContabilCriarInput,
  ContaContabilAtualizarInput,
  ContaContabilFiltros,
  DiarioContabilDto,
  DiarioContabilCriarInput,
  DiarioContabilAtualizarInput,
  DiarioContabilFiltros,
  ExercicioFiscalDto,
  PeriodoContabilDto,
  PeriodoContabilCriarInput,
  PeriodoContabilFiltros,
  AlterarEstadoPeriodoInput,
  MapeamentoContaDto,
  MapeamentoContaGuardarInput,
  SemearContabilidadeResultadoDto,
  LancamentoContabilDto,
  LancamentoContabilCriarInput,
  LancamentoContabilAtualizarInput,
  LancamentoContabilEstornarInput,
  LancamentoContabilFiltros,
  LancamentoContabilListResult,
  EstornoLancamentoResultado,
  ContaBancariaReconciliavelDto,
  ResumoReconciliacaoDto,
  SugestaoReconciliacaoDto,
  ConciliarInput,
  DesconciliarInput,
  GerarLancamentoDeMovimentoInput,
  RegraContabilizacaoDto,
  RegraContabilizacaoCriarInput,
  RegraContabilizacaoAtualizarInput,
  ErroIntegracaoContabilDto,
  PrevisaoFechoDto,
  ExecucaoFechoDto,
  ExecucaoFechoFiltros,
  ReabrirPeriodoInput,
  PrevisaoApuramentoIvaDto,
  ApuramentoIvaExecutarResultadoDto,
  ApuramentoIvaPagamentoInput,
  ApuramentoIvaPagamentoResultadoDto,
  ApuramentoImpostoDto,
  PrevisaoResultadosDto,
  ApuramentoResultadosExecutarResultadoDto,
  PrevisaoFechoAnualDto,
  FechoAnualExecutarResultadoDto,
  AberturaExercicioResultadoDto,
  ReabrirExercicioInput,
  BalanceteFiltrosDto,
  BalanceteResultadoDto,
  RazaoFiltrosDto,
  RazaoResultadoDto,
  RelatorioDiariosFiltrosDto,
  RelatorioDiariosResultadoDto,
  ContaCorrenteFiltrosDto,
  ContaCorrenteResultadoDto,
  ExportarRelatorioContabilDto,
  ResultadoExportacaoRelatorioContabilDto,
  EstruturaRelatorioDto,
  DemonstracaoDto,
  EstruturaRelatorioInput,
} from '../@types/electron';

const INDISPONIVEL = 'UNAVAILABLE';
const MSG = 'API de contabilidade não disponível.';

function semApi<T>(): IpcResponse<T> {
  return { success: false, error: { code: INDISPONIVEL, message: MSG } };
}

function api() {
  return typeof window !== 'undefined' ? window.api?.contabilidade : undefined;
}

export const contabilidadeApi = {
  // =========================================================================
  // Plano de contas
  // =========================================================================

  async listarContas(
    filters?: ContaContabilFiltros
  ): Promise<IpcResponse<PaginatedResult<ContaContabilDto>>> {
    const a = api();
    if (typeof a?.contas?.listar === 'function') return a.contas.listar(filters);
    return semApi();
  },

  async arvoreContas(empresaId: string): Promise<IpcResponse<ContaContabilDto[]>> {
    const a = api();
    if (typeof a?.contas?.arvore === 'function') return a.contas.arvore(empresaId);
    return semApi();
  },

  async obterConta(id: string): Promise<IpcResponse<ContaContabilDto>> {
    const a = api();
    if (typeof a?.contas?.obter === 'function') return a.contas.obter(id);
    return semApi();
  },

  async criarConta(data: ContaContabilCriarInput): Promise<IpcResponse<ContaContabilDto>> {
    const a = api();
    if (typeof a?.contas?.criar === 'function') return a.contas.criar(data);
    return semApi();
  },

  async atualizarConta(
    id: string,
    data: ContaContabilAtualizarInput
  ): Promise<IpcResponse<ContaContabilDto>> {
    const a = api();
    if (typeof a?.contas?.atualizar === 'function') return a.contas.atualizar(id, data);
    return semApi();
  },

  async removerConta(id: string): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.contas?.remover === 'function') return a.contas.remover(id);
    return semApi();
  },

  // =========================================================================
  // Diários
  // =========================================================================

  async listarDiarios(
    filters?: DiarioContabilFiltros
  ): Promise<IpcResponse<PaginatedResult<DiarioContabilDto>>> {
    const a = api();
    if (typeof a?.diarios?.listar === 'function') return a.diarios.listar(filters);
    return semApi();
  },

  async obterDiario(id: string): Promise<IpcResponse<DiarioContabilDto>> {
    const a = api();
    if (typeof a?.diarios?.obter === 'function') return a.diarios.obter(id);
    return semApi();
  },

  async criarDiario(data: DiarioContabilCriarInput): Promise<IpcResponse<DiarioContabilDto>> {
    const a = api();
    if (typeof a?.diarios?.criar === 'function') return a.diarios.criar(data);
    return semApi();
  },

  async atualizarDiario(
    id: string,
    data: DiarioContabilAtualizarInput
  ): Promise<IpcResponse<DiarioContabilDto>> {
    const a = api();
    if (typeof a?.diarios?.atualizar === 'function') return a.diarios.atualizar(id, data);
    return semApi();
  },

  async removerDiario(id: string): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.diarios?.remover === 'function') return a.diarios.remover(id);
    return semApi();
  },

  // =========================================================================
  // Exercícios e períodos
  // =========================================================================

  async listarExercicios(empresaId?: string): Promise<IpcResponse<ExercicioFiscalDto[]>> {
    const a = api();
    if (typeof a?.exercicios?.listar === 'function') return a.exercicios.listar(empresaId);
    return semApi();
  },

  async obterExercicio(id: string): Promise<IpcResponse<ExercicioFiscalDto>> {
    const a = api();
    if (typeof a?.exercicios?.obter === 'function') return a.exercicios.obter(id);
    return semApi();
  },

  async listarPeriodos(
    filters?: PeriodoContabilFiltros
  ): Promise<IpcResponse<PaginatedResult<PeriodoContabilDto>>> {
    const a = api();
    if (typeof a?.periodos?.listar === 'function') return a.periodos.listar(filters);
    return semApi();
  },

  async obterPeriodo(id: string): Promise<IpcResponse<PeriodoContabilDto>> {
    const a = api();
    if (typeof a?.periodos?.obter === 'function') return a.periodos.obter(id);
    return semApi();
  },

  async criarPeriodo(data: PeriodoContabilCriarInput): Promise<IpcResponse<PeriodoContabilDto>> {
    const a = api();
    if (typeof a?.periodos?.criar === 'function') return a.periodos.criar(data);
    return semApi();
  },

  async criarPeriodosDoExercicio(exercicioId: string): Promise<IpcResponse<PeriodoContabilDto[]>> {
    const a = api();
    if (typeof a?.periodos?.criarDoExercicio === 'function') {
      return a.periodos.criarDoExercicio(exercicioId);
    }
    return semApi();
  },

  async alterarEstadoPeriodo(
    id: string,
    data: AlterarEstadoPeriodoInput
  ): Promise<IpcResponse<PeriodoContabilDto>> {
    const a = api();
    if (typeof a?.periodos?.alterarEstado === 'function') {
      return a.periodos.alterarEstado(id, data);
    }
    return semApi();
  },

  async fecharPeriodo(id: string): Promise<IpcResponse<PeriodoContabilDto>> {
    const a = api();
    if (typeof a?.periodos?.fechar === 'function') return a.periodos.fechar(id);
    return semApi();
  },

  async reabrirPeriodo(id: string): Promise<IpcResponse<PeriodoContabilDto>> {
    const a = api();
    if (typeof a?.periodos?.reabrir === 'function') return a.periodos.reabrir(id);
    return semApi();
  },

  async bloquearPeriodo(id: string): Promise<IpcResponse<PeriodoContabilDto>> {
    const a = api();
    if (typeof a?.periodos?.bloquear === 'function') return a.periodos.bloquear(id);
    return semApi();
  },

  // =========================================================================
  // Mapeamentos
  // =========================================================================

  async listarMapeamentos(
    filters?: { empresaId?: string }
  ): Promise<IpcResponse<PaginatedResult<MapeamentoContaDto>>> {
    const a = api();
    if (typeof a?.mapeamentos?.listar === 'function') return a.mapeamentos.listar(filters);
    return semApi();
  },

  async obterMapeamento(id: string): Promise<IpcResponse<MapeamentoContaDto>> {
    const a = api();
    if (typeof a?.mapeamentos?.obter === 'function') return a.mapeamentos.obter(id);
    return semApi();
  },

  async guardarMapeamento(
    data: MapeamentoContaGuardarInput
  ): Promise<IpcResponse<MapeamentoContaDto>> {
    const a = api();
    if (typeof a?.mapeamentos?.guardar === 'function') return a.mapeamentos.guardar(data);
    return semApi();
  },

  async removerMapeamento(id: string): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.mapeamentos?.remover === 'function') return a.mapeamentos.remover(id);
    return semApi();
  },

  // =========================================================================
  // Seed
  // =========================================================================

  async semear(): Promise<IpcResponse<SemearContabilidadeResultadoDto>> {
    const a = api();
    if (typeof a?.semear === 'function') return a.semear();
    return semApi();
  },

  // =========================================================================
  // Lançamentos contabilísticos
  // =========================================================================

  async listarLancamentos(
    filters?: LancamentoContabilFiltros
  ): Promise<IpcResponse<LancamentoContabilListResult>> {
    const a = api();
    if (typeof a?.lancamentos?.listar === 'function') return a.lancamentos.listar(filters);
    return semApi();
  },

  async obterLancamento(id: string): Promise<IpcResponse<LancamentoContabilDto>> {
    const a = api();
    if (typeof a?.lancamentos?.obter === 'function') return a.lancamentos.obter(id);
    return semApi();
  },

  async criarLancamento(data: LancamentoContabilCriarInput): Promise<IpcResponse<LancamentoContabilDto>> {
    const a = api();
    if (typeof a?.lancamentos?.criar === 'function') return a.lancamentos.criar(data);
    return semApi();
  },

  async atualizarLancamento(
    id: string,
    data: LancamentoContabilAtualizarInput
  ): Promise<IpcResponse<LancamentoContabilDto>> {
    const a = api();
    if (typeof a?.lancamentos?.atualizar === 'function') return a.lancamentos.atualizar(id, data);
    return semApi();
  },

  async validarLancamento(id: string): Promise<IpcResponse<LancamentoContabilDto>> {
    const a = api();
    if (typeof a?.lancamentos?.validar === 'function') return a.lancamentos.validar(id);
    return semApi();
  },

  async estornarLancamento(
    id: string,
    data: LancamentoContabilEstornarInput
  ): Promise<IpcResponse<EstornoLancamentoResultado>> {
    const a = api();
    if (typeof a?.lancamentos?.estornar === 'function') return a.lancamentos.estornar(id, data);
    return semApi();
  },

  async removerLancamento(id: string): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.lancamentos?.remover === 'function') return a.lancamentos.remover(id);
    return semApi();
  },

  // =========================================================================
  // Reconciliação
  // =========================================================================

  async listarContasParaReconciliar(empresaId: string): Promise<IpcResponse<ContaBancariaReconciliavelDto[]>> {
    const a = api();
    if (typeof a?.reconciliacao?.listarContas === 'function') return a.reconciliacao.listarContas(empresaId);
    return semApi();
  },

  async obterResumoReconciliacao(contaBancariaId: string, empresaId: string): Promise<IpcResponse<ResumoReconciliacaoDto>> {
    const a = api();
    if (typeof a?.reconciliacao?.resumo === 'function') return a.reconciliacao.resumo(contaBancariaId, empresaId);
    return semApi();
  },

  async sugerirParesReconciliacao(
    contaBancariaId: string,
    empresaId: string,
    data?: { janelaDias?: number }
  ): Promise<IpcResponse<SugestaoReconciliacaoDto[]>> {
    const a = api();
    if (typeof a?.reconciliacao?.sugerir === 'function') return a.reconciliacao.sugerir(contaBancariaId, empresaId, data);
    return semApi();
  },

  async conciliar(
    contaBancariaId: string,
    empresaId: string,
    data: ConciliarInput
  ): Promise<IpcResponse<{ conciliados: number }>> {
    const a = api();
    if (typeof a?.reconciliacao?.conciliar === 'function') return a.reconciliacao.conciliar(contaBancariaId, empresaId, data);
    return semApi();
  },

  async desconciliar(
    contaBancariaId: string,
    empresaId: string,
    data: DesconciliarInput
  ): Promise<IpcResponse<{ desconciliados: number }>> {
    const a = api();
    if (typeof a?.reconciliacao?.desconciliar === 'function') return a.reconciliacao.desconciliar(contaBancariaId, empresaId, data);
    return semApi();
  },

  async gerarLancamentoDeMovimento(
    contaBancariaId: string,
    empresaId: string,
    data: GerarLancamentoDeMovimentoInput
  ): Promise<IpcResponse<{ lancamentoId: string }>> {
    const a = api();
    if (typeof a?.reconciliacao?.gerarLancamento === 'function') return a.reconciliacao.gerarLancamento(contaBancariaId, empresaId, data);
    return semApi();
  },

  // =========================================================================
  // Regras de contabilização
  // =========================================================================

  async listarRegras(
    filters?: { empresaId?: string; activa?: boolean; search?: string }
  ): Promise<IpcResponse<RegraContabilizacaoDto[]>> {
    const a = api();
    if (typeof a?.regras?.listar === 'function') return a.regras.listar(filters);
    return semApi();
  },

  async obterRegra(id: string): Promise<IpcResponse<RegraContabilizacaoDto>> {
    const a = api();
    if (typeof a?.regras?.obter === 'function') return a.regras.obter(id);
    return semApi();
  },

  async criarRegra(data: RegraContabilizacaoCriarInput): Promise<IpcResponse<RegraContabilizacaoDto>> {
    const a = api();
    if (typeof a?.regras?.criar === 'function') return a.regras.criar(data);
    return semApi();
  },

  async atualizarRegra(
    id: string,
    data: RegraContabilizacaoAtualizarInput
  ): Promise<IpcResponse<RegraContabilizacaoDto>> {
    const a = api();
    if (typeof a?.regras?.atualizar === 'function') return a.regras.atualizar(id, data);
    return semApi();
  },

  async removerRegra(id: string): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.regras?.remover === 'function') return a.regras.remover(id);
    return semApi();
  },

  // =========================================================================
  // Erros de integração
  // =========================================================================

  async listarErrosIntegracao(
    filters?: { empresaId?: string; resolvido?: boolean; moduloOrigem?: string; tipoOrigem?: string }
  ): Promise<IpcResponse<ErroIntegracaoContabilDto[]>> {
    const a = api();
    if (typeof a?.errosIntegracao?.listar === 'function') return a.errosIntegracao.listar(filters);
    return semApi();
  },

  async reprocessarErro(erroId: string): Promise<IpcResponse<{ sucesso: boolean; pendente: boolean; mensagem: string }>> {
    const a = api();
    if (typeof a?.errosIntegracao?.reprocessar === 'function') return a.errosIntegracao.reprocessar(erroId);
    return semApi();
  },

  // =========================================================================
  // Fecho de período
  // =========================================================================

  async previsaoFecho(periodoId: string): Promise<IpcResponse<PrevisaoFechoDto>> {
    const a = api();
    if (typeof a?.fecho?.previsao === 'function') return a.fecho.previsao(periodoId);
    return semApi();
  },

  async executarFecho(periodoId: string): Promise<IpcResponse<{ execucaoId: string }>> {
    const a = api();
    if (typeof a?.fecho?.executar === 'function') return a.fecho.executar(periodoId);
    return semApi();
  },

  async reabrirPeriodoFecho(periodoId: string, data: ReabrirPeriodoInput): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.fecho?.reabrir === 'function') return a.fecho.reabrir(periodoId, data);
    return semApi();
  },

  async listarExecucoesFecho(filters?: ExecucaoFechoFiltros): Promise<IpcResponse<{ items: ExecucaoFechoDto[]; total: number }>> {
    const a = api();
    if (typeof a?.fecho?.listarExecucoes === 'function') return a.fecho.listarExecucoes(filters);
    return semApi();
  },

  // =========================================================================
  // Apuramento IVA
  // =========================================================================

  async previsaoApuramentoIva(periodoId: string): Promise<IpcResponse<PrevisaoApuramentoIvaDto>> {
    const a = api();
    if (typeof a?.apuramentoIva?.previsao === 'function') return a.apuramentoIva.previsao(periodoId);
    return semApi();
  },

  async listarApuramentosIva(filters?: { exercicioId?: string }): Promise<IpcResponse<ApuramentoImpostoDto[]>> {
    const a = api();
    if (typeof a?.apuramentoIva?.listar === 'function') return a.apuramentoIva.listar(filters);
    return semApi();
  },

  async executarApuramentoIva(periodoId: string): Promise<IpcResponse<ApuramentoIvaExecutarResultadoDto>> {
    const a = api();
    if (typeof a?.apuramentoIva?.executar === 'function') return a.apuramentoIva.executar(periodoId);
    return semApi();
  },

  async registarPagamentoIva(data: ApuramentoIvaPagamentoInput): Promise<IpcResponse<ApuramentoIvaPagamentoResultadoDto>> {
    const a = api();
    if (typeof a?.apuramentoIva?.pagamento === 'function') return a.apuramentoIva.pagamento(data);
    return semApi();
  },

  // =========================================================================
  // Apuramento de resultados e fecho anual
  // =========================================================================

  async previsaoResultados(exercicioId: string): Promise<IpcResponse<PrevisaoResultadosDto>> {
    const a = api();
    if (typeof a?.resultados?.previsao === 'function') return a.resultados.previsao(exercicioId);
    return semApi();
  },

  async executarApuramentoResultados(exercicioId: string): Promise<IpcResponse<ApuramentoResultadosExecutarResultadoDto>> {
    const a = api();
    if (typeof a?.resultados?.executar === 'function') return a.resultados.executar(exercicioId);
    return semApi();
  },

  async previsaoFechoAnual(exercicioId: string): Promise<IpcResponse<PrevisaoFechoAnualDto>> {
    const a = api();
    if (typeof a?.fechoAnual?.previsao === 'function') return a.fechoAnual.previsao(exercicioId);
    return semApi();
  },

  async executarFechoAnual(exercicioId: string): Promise<IpcResponse<FechoAnualExecutarResultadoDto>> {
    const a = api();
    if (typeof a?.fechoAnual?.executar === 'function') return a.fechoAnual.executar(exercicioId);
    return semApi();
  },

  async abrirExercicioSeguinte(exercicioId: string): Promise<IpcResponse<AberturaExercicioResultadoDto>> {
    const a = api();
    if (typeof a?.fechoAnual?.abrir === 'function') return a.fechoAnual.abrir(exercicioId);
    return semApi();
  },

  async reabrirFechoAnual(exercicioId: string, data: ReabrirExercicioInput): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.fechoAnual?.reabrir === 'function') return a.fechoAnual.reabrir(exercicioId, data);
    return semApi();
  },

  // =========================================================================
  // Demonstrações
  // =========================================================================

  async listarEstruturas(empresaId?: string): Promise<IpcResponse<EstruturaRelatorioDto[]>> {
    const a = api();
    if (typeof a?.demonstracoes?.listarEstruturas === 'function') return a.demonstracoes.listarEstruturas(empresaId);
    return semApi();
  },

  async obterEstrutura(id: string): Promise<IpcResponse<EstruturaRelatorioDto>> {
    const a = api();
    if (typeof a?.demonstracoes?.obterEstrutura === 'function') return a.demonstracoes.obterEstrutura(id);
    return semApi();
  },

  async guardarEstrutura(empresaId: string, payload: EstruturaRelatorioInput): Promise<IpcResponse<EstruturaRelatorioDto>> {
    const a = api();
    if (typeof a?.demonstracoes?.guardarEstrutura === 'function') return a.demonstracoes.guardarEstrutura(empresaId, payload);
    return semApi();
  },

  async removerEstrutura(id: string): Promise<IpcResponse<void>> {
    const a = api();
    if (typeof a?.demonstracoes?.removerEstrutura === 'function') return a.demonstracoes.removerEstrutura(id);
    return semApi();
  },

  async gerarDemonstracao(
    estruturaId: string,
    dataInicio: string,
    dataFim: string
  ): Promise<IpcResponse<DemonstracaoDto>> {
    const a = api();
    if (typeof a?.demonstracoes?.gerar === 'function') return a.demonstracoes.gerar(estruturaId, dataInicio, dataFim);
    return semApi();
  },

  // =========================================================================
  // Relatórios contabilísticos
  // =========================================================================

  async balancete(filters: BalanceteFiltrosDto): Promise<IpcResponse<BalanceteResultadoDto>> {
    const a = api();
    if (typeof a?.relatorios?.balancete === 'function') return a.relatorios.balancete(filters);
    return semApi();
  },

  async razao(filters: RazaoFiltrosDto): Promise<IpcResponse<RazaoResultadoDto>> {
    const a = api();
    if (typeof a?.relatorios?.razao === 'function') return a.relatorios.razao(filters);
    return semApi();
  },

  async relatorioDiarios(filters: RelatorioDiariosFiltrosDto): Promise<IpcResponse<RelatorioDiariosResultadoDto>> {
    const a = api();
    if (typeof a?.relatorios?.diarios === 'function') return a.relatorios.diarios(filters);
    return semApi();
  },

  async contaCorrente(filters: ContaCorrenteFiltrosDto): Promise<IpcResponse<ContaCorrenteResultadoDto>> {
    const a = api();
    if (typeof a?.relatorios?.contaCorrente === 'function') return a.relatorios.contaCorrente(filters);
    return semApi();
  },

  async exportarRelatorio(
    payload: ExportarRelatorioContabilDto
  ): Promise<IpcResponse<ResultadoExportacaoRelatorioContabilDto>> {
    const a = api();
    if (typeof a?.relatorios?.exportarRelatorio === 'function') return a.relatorios.exportarRelatorio(payload);
    return semApi();
  },
};
