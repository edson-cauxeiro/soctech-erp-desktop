/**
 * @file rh.api.ts
 * @description Cliente de API tipado do módulo de Recursos Humanos.
 *
 * Envolve os canais IPC expostos pelo preload (`window.api.rh`) num contrato
 * tipado e tolerante à ausência da ponte (por exemplo, em testes ou no
 * browser). A Fase 1 acrescenta os cadastros e a configuração de RH.
 */

import type {
  IpcResponse,
  RhPingDto,
  RhFiltroCadastroInput,
  RhPaginaDto,
  RhDepartamentoDto,
  RhDepartamentoInput,
  RhCargoDto,
  RhCargoInput,
  RhRubricaDto,
  RhRubricaInput,
  RhTipoAusenciaDto,
  RhTipoAusenciaInput,
  RhCentroCustoDto,
  RhCentroCustoInput,
  RhParametroFiscalDto,
  RhParametroInput,
  RhTabelaIrtDto,
  RhTabelaIrtInput,
  RhPeriodoDto,
  RhConfiguracaoDto,
  RhConfiguracaoInput,
  RhReferenciaSeedDto,
  RhFuncionarioListaDto,
  RhFuncionarioDetalheDto,
  RhFuncionarioInput,
  RhFiltroFuncionarioInput,
  RhContratoDto,
  RhContratoCriarInput,
  RhContratoAtualizarInput,
  RhCessarContratoInput,
  RhAlteracaoSalarialDto,
  RhAlteracaoSalarialInput,
  RhSalarioNaDataDto,
  RhDependenteDto,
  RhDependenteCriarInput,
  RhDependenteAtualizarInput,
  RhFuncionarioRubricaDto,
  RhFuncionarioRubricaCriarInput,
  RhFuncionarioRubricaAtualizarInput,
  RhFuncionarioDocumentoDto,
  RhFuncionarioDocumentoCriarInput,
  RhFuncionarioDocumentoAtualizarInput,
  RhImportacaoSelecionarResultado,
  RhImportacaoPreviewDto,
  RhImportacaoResultadoDto,
  RhImportacaoConteudoInput,
  RhImportacaoImportarInput,
  RhAlteracaoMensalDto,
  RhAlteracaoMensalCriarInput,
  RhAlteracaoMensalAtualizarInput,
  RhAlteracoesMensaisListarInput,
  RhAlteracoesMensaisPaginaDto,
  RhCopiarMesAnteriorInput,
  RhCopiarMesAnteriorResultado,
  RhProcessamentoLoaderInput,
  RhProcessamentoLoaderResultado,
  RhSimularSalariosInput,
  RhSimulacaoResultadoDto,
  RhPrepararSalariosInput,
  RhPrepararResultadoDto,
  RhProcessarIndividualInput,
  RhProcessarIndividualResultadoDto,
  RhProcessarLoteInput,
  RhProcessarLoteResultadoDto,
  ProgressoLoteDto,
  RhAnularProcessamentosInput,
  RhAnularProcessamentosResultadoDto,
  RhProcessamentoListarInput,
  RhProcessamentoResumoDto,
  RhProcessamentoHistoricoInput,
  RhProcessamentoHistoricoPaginaDto,
  RhProcessamentoDetalheDto,
  RhRecibosListarInput,
  RhRecibosPaginaDto,
  RhReciboResumoDto,
  RhRecibosGerarPdfInput,
  RhOrdensPagamentoListarInput,
  RhOrdemPagamentoCriarInput,
  RhPagamentosListarInput,
  RhPagamentoConfirmarInput,
  RhPagamentoEstornarInput,
  OrdemPagamentoResumoDto,
  OrdemPagamentoDetalheDto,
  PagamentoResumoDto,
  RhAusenciasListarInput,
  RhAusenciaPaginaDto,
  RhAusenciaDto,
  RhAusenciaCriarInput,
  RhAusenciaAtualizarInput,
  RhAusenciaAprovarInput,
  RhHorasExtraListarInput,
  RhHoraExtraPaginaDto,
  RhHoraExtraDto,
  RhHoraExtraCriarInput,
  RhHoraExtraAtualizarInput,
  RhHoraExtraAprovarInput,
  RhFeriasSaldosListarInput,
  RhFeriasSaldoDto,
  RhFeriasSaldoAtualizarInput,
  RhMarcacoesFeriasListarInput,
  RhMarcacaoFeriasPaginaDto,
  RhMarcacaoFeriasDto,
  RhMarcacaoFeriasCriarInput,
  RhMarcacaoFeriasAtualizarInput,
  RhMarcacaoFeriasAprovarInput,
  RhAfetacoesListarInput,
  RhAfetacaoPaginaDto,
  RhAfetacaoDto,
  RhAfetacaoCriarInput,
  RhAfetacaoAtualizarInput,
  RhProcessosDividaListarInput,
  RhProcessoDividaPaginaDto,
  RhProcessoDividaDto,
  RhProcessoDividaCriarInput,
  RhProcessoDividaAtualizarInput,
  RhProcessoDividaSuspenderInput,
  RhProcessoDividaCancelarInput,
  RhPrestacoesDividaListarInput,
  RhPrestacaoDividaPaginaDto,
  RhPrestacaoDividaDto,
  RhPrestacaoDividaAtualizarInput,
  RhPrestacaoDividaDescontarInput,
  RhPrestacaoDividaAnularInput,
  RhPrestacaoDividaPerdoarInput,
  RhRetroativosListarInput,
  RhRetroativoPaginaDto,
  RhRetroativoDto,
  RhRetroativoCriarInput,
  RhRetroativoAtualizarInput,
  RhRetroativoAplicarInput,
  RhRetroativoAnularInput,
  RhIndependentesListarInput,
  RhIndependentePaginaDto,
  RhIndependenteDto,
  RhIndependenteCriarInput,
  RhIndependenteAtualizarInput,
  RhAtividadesListarInput,
  RhAtividadePaginaDto,
  RhAtividadeDto,
  RhAtividadeCriarInput,
  RhAtividadeAtualizarInput,
  RhAuditoriaListarInput,
  RhAuditoriaPorFuncionarioInput,
  RhAuditoriaPorProcessamentoInput,
  RhAuditoriaPaginaDto,
} from '../@types/electron';

const INDISPONIVEL = 'UNAVAILABLE';
const MSG = 'API de Recursos Humanos não disponível.';

function semApi<T>(): IpcResponse<T> {
  return { success: false, error: { code: INDISPONIVEL, message: MSG } };
}

function config(): Window['api']['rh']['config'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.config;
}

function funcionarios(): Window['api']['rh']['funcionarios'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.funcionarios;
}

function contratos(): Window['api']['rh']['contratos'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.contratos;
}

function importacao(): Window['api']['rh']['importacao'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.importacao;
}

function alteracoesMensais(): Window['api']['rh']['alteracoesMensais'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.alteracoesMensais;
}

function processamento(): Window['api']['rh']['processamento'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.processamento;
}

function recibos(): Window['api']['rh']['recibos'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.recibos;
}

function pagamentos(): Window['api']['rh']['pagamentos'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.pagamentos;
}

function ausencias(): Window['api']['rh']['ausencias'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.ausencias;
}

function horasExtra(): Window['api']['rh']['horasExtra'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.horasExtra;
}

function ferias(): Window['api']['rh']['ferias'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.ferias;
}

function afetacoes(): Window['api']['rh']['afetacoes'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.afetacoes;
}

function dividas(): Window['api']['rh']['dividas'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.dividas;
}

function retroativos(): Window['api']['rh']['retroativos'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.retroativos;
}

function independentes(): Window['api']['rh']['independentes'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.independentes;
}

function atividades(): Window['api']['rh']['atividades'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.atividades;
}

function auditoria(): Window['api']['rh']['auditoria'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.api?.rh?.auditoria;
}

type ComId<T> = T & { id: string };

export const rhApi = {
  /** Testa o contrato base do módulo (sessão → permissão → resposta). */
  async ping(): Promise<IpcResponse<RhPingDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.rh?.ping === 'function') {
      return window.api.rh.ping();
    }
    return semApi();
  },

  funcionarios: {
    listar: (
      filtros?: RhFiltroFuncionarioInput
    ): Promise<IpcResponse<RhPaginaDto<RhFuncionarioListaDto>>> =>
      funcionarios()?.listar(filtros) ?? Promise.resolve(semApi()),
    get: (id: string): Promise<IpcResponse<RhFuncionarioDetalheDto>> =>
      funcionarios()?.get(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhFuncionarioInput): Promise<IpcResponse<RhFuncionarioDetalheDto>> =>
      funcionarios()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: ComId<RhFuncionarioInput>): Promise<IpcResponse<RhFuncionarioDetalheDto>> =>
      funcionarios()?.atualizar(dados) ?? Promise.resolve(semApi()),
    inativar: (id: string): Promise<IpcResponse<RhFuncionarioDetalheDto>> =>
      funcionarios()?.inativar(id) ?? Promise.resolve(semApi()),
    dependentes: {
      criar: (dados: RhDependenteCriarInput): Promise<IpcResponse<RhDependenteDto>> =>
        funcionarios()?.dependentes.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: RhDependenteAtualizarInput): Promise<IpcResponse<RhDependenteDto>> =>
        funcionarios()?.dependentes.atualizar(dados) ?? Promise.resolve(semApi()),
      remover: (id: string): Promise<IpcResponse<{ id: string }>> =>
        funcionarios()?.dependentes.remover(id) ?? Promise.resolve(semApi()),
    },
    rubricasFixas: {
      criar: (
        dados: RhFuncionarioRubricaCriarInput
      ): Promise<IpcResponse<RhFuncionarioRubricaDto>> =>
        funcionarios()?.rubricasFixas.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (
        dados: RhFuncionarioRubricaAtualizarInput
      ): Promise<IpcResponse<RhFuncionarioRubricaDto>> =>
        funcionarios()?.rubricasFixas.atualizar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhFuncionarioRubricaDto>> =>
        funcionarios()?.rubricasFixas.inativar(id) ?? Promise.resolve(semApi()),
    },
    documentos: {
      criar: (
        dados: RhFuncionarioDocumentoCriarInput
      ): Promise<IpcResponse<RhFuncionarioDocumentoDto>> =>
        funcionarios()?.documentos.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (
        dados: RhFuncionarioDocumentoAtualizarInput
      ): Promise<IpcResponse<RhFuncionarioDocumentoDto>> =>
        funcionarios()?.documentos.atualizar(dados) ?? Promise.resolve(semApi()),
      remover: (id: string): Promise<IpcResponse<{ id: string }>> =>
        funcionarios()?.documentos.remover(id) ?? Promise.resolve(semApi()),
    },
  },

  contratos: {
    listar: (funcionarioId: string): Promise<IpcResponse<RhContratoDto[]>> =>
      contratos()?.listar(funcionarioId) ?? Promise.resolve(semApi()),
    get: (id: string): Promise<IpcResponse<RhContratoDto>> =>
      contratos()?.get(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhContratoCriarInput): Promise<IpcResponse<RhContratoDto>> =>
      contratos()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhContratoAtualizarInput): Promise<IpcResponse<RhContratoDto>> =>
      contratos()?.atualizar(dados) ?? Promise.resolve(semApi()),
    cessar: (dados: RhCessarContratoInput): Promise<IpcResponse<RhContratoDto>> =>
      contratos()?.cessar(dados) ?? Promise.resolve(semApi()),
    criarAlteracao: (
      dados: RhAlteracaoSalarialInput
    ): Promise<IpcResponse<RhAlteracaoSalarialDto>> =>
      contratos()?.criarAlteracao(dados) ?? Promise.resolve(semApi()),
    salarioNaData: (funcionarioId: string, data: string): Promise<IpcResponse<RhSalarioNaDataDto>> =>
      contratos()?.salarioNaData(funcionarioId, data) ?? Promise.resolve(semApi()),
  },

  importacao: {
    selecionar: (): Promise<IpcResponse<RhImportacaoSelecionarResultado>> =>
      importacao()?.selecionar() ?? Promise.resolve(semApi()),
    funcionarios: {
      previsualizar: (dados: RhImportacaoConteudoInput): Promise<IpcResponse<RhImportacaoPreviewDto>> =>
        importacao()?.funcionarios.previsualizar(dados) ?? Promise.resolve(semApi()),
      importar: (dados: RhImportacaoImportarInput): Promise<IpcResponse<RhImportacaoResultadoDto>> =>
        importacao()?.funcionarios.importar(dados) ?? Promise.resolve(semApi()),
    },
    contratos: {
      previsualizar: (dados: RhImportacaoConteudoInput): Promise<IpcResponse<RhImportacaoPreviewDto>> =>
        importacao()?.contratos.previsualizar(dados) ?? Promise.resolve(semApi()),
      importar: (dados: RhImportacaoImportarInput): Promise<IpcResponse<RhImportacaoResultadoDto>> =>
        importacao()?.contratos.importar(dados) ?? Promise.resolve(semApi()),
    },
  },

  alteracoesMensais: {
    listar: (input: RhAlteracoesMensaisListarInput): Promise<IpcResponse<RhAlteracoesMensaisPaginaDto>> =>
      alteracoesMensais()?.listar(input) ?? Promise.resolve(semApi()),
    criar: (dados: RhAlteracaoMensalCriarInput): Promise<IpcResponse<RhAlteracaoMensalDto>> =>
      alteracoesMensais()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhAlteracaoMensalAtualizarInput): Promise<IpcResponse<RhAlteracaoMensalDto>> =>
      alteracoesMensais()?.atualizar(dados) ?? Promise.resolve(semApi()),
    anular: (id: string, motivo?: string): Promise<IpcResponse<RhAlteracaoMensalDto>> =>
      alteracoesMensais()?.anular(id, motivo) ?? Promise.resolve(semApi()),
    copiarMesAnterior: (input: RhCopiarMesAnteriorInput): Promise<IpcResponse<RhCopiarMesAnteriorResultado>> =>
      alteracoesMensais()?.copiarMesAnterior(input) ?? Promise.resolve(semApi()),
  },

  processamento: {
    carregar: (input: RhProcessamentoLoaderInput): Promise<IpcResponse<RhProcessamentoLoaderResultado>> =>
      processamento()?.carregar(input) ?? Promise.resolve(semApi()),
    simular: (input: RhSimularSalariosInput): Promise<IpcResponse<RhSimulacaoResultadoDto>> =>
      processamento()?.simular(input) ?? Promise.resolve(semApi()),
    preparar: (input: RhPrepararSalariosInput): Promise<IpcResponse<RhPrepararResultadoDto>> =>
      processamento()?.preparar(input) ?? Promise.resolve(semApi()),
    processar: (input: RhProcessarIndividualInput): Promise<IpcResponse<RhProcessarIndividualResultadoDto>> =>
      processamento()?.processar(input) ?? Promise.resolve(semApi()),
    processarLote: (input: RhProcessarLoteInput): Promise<IpcResponse<RhProcessarLoteResultadoDto>> =>
      processamento()?.processarLote(input) ?? Promise.resolve(semApi()),
    anular: (input: RhAnularProcessamentosInput): Promise<IpcResponse<RhAnularProcessamentosResultadoDto>> =>
      processamento()?.anular(input) ?? Promise.resolve(semApi()),
    listar: (input: RhProcessamentoListarInput): Promise<IpcResponse<RhProcessamentoResumoDto[]>> =>
      processamento()?.listar(input) ?? Promise.resolve(semApi()),
    historico: (
      input: RhProcessamentoHistoricoInput
    ): Promise<IpcResponse<RhProcessamentoHistoricoPaginaDto>> =>
      processamento()?.historico(input) ?? Promise.resolve(semApi()),
    obter: (input: { id: string }): Promise<IpcResponse<RhProcessamentoDetalheDto>> =>
      processamento()?.obter(input) ?? Promise.resolve(semApi()),
    onProgresso: (callback: (progresso: ProgressoLoteDto) => void): (() => void) =>
      processamento()?.onProgresso(callback) ?? ((): void => {}),
  },

  // Recibos de processamento (RH-502/503)
  recibos: {
    listar: (
      input?: RhRecibosListarInput
    ): Promise<IpcResponse<RhRecibosPaginaDto>> =>
      recibos()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhReciboResumoDto>> =>
      recibos()?.obter(id) ?? Promise.resolve(semApi()),
    gerarPdf: (input: RhRecibosGerarPdfInput): Promise<IpcResponse<ArrayBuffer>> =>
      recibos()?.gerarPdf(input) ?? Promise.resolve(semApi()),
    registarImpressao: (id: string): Promise<IpcResponse<void>> =>
      recibos()?.registarImpressao(id) ?? Promise.resolve(semApi()),
  },

  // Pagamentos (RH-504)
  pagamentos: {
    ordens: {
      listar: (
        input?: RhOrdensPagamentoListarInput
      ): Promise<IpcResponse<{ total: number; items: OrdemPagamentoResumoDto[] }>> =>
        pagamentos()?.ordens.listar(input) ?? Promise.resolve(semApi()),
      criar: (input: RhOrdemPagamentoCriarInput): Promise<IpcResponse<OrdemPagamentoResumoDto>> =>
        pagamentos()?.ordens.criar(input) ?? Promise.resolve(semApi()),
      obter: (id: string): Promise<IpcResponse<OrdemPagamentoDetalheDto>> =>
        pagamentos()?.ordens.obter(id) ?? Promise.resolve(semApi()),
      gerarFicheiro: (id: string): Promise<IpcResponse<string>> =>
        pagamentos()?.ordens.gerarFicheiro(id) ?? Promise.resolve(semApi()),
    },
    listar: (
      input?: RhPagamentosListarInput
    ): Promise<IpcResponse<{ total: number; items: PagamentoResumoDto[] }>> =>
      pagamentos()?.listar(input) ?? Promise.resolve(semApi()),
    confirmar: (input: RhPagamentoConfirmarInput): Promise<IpcResponse<void>> =>
      pagamentos()?.confirmar(input) ?? Promise.resolve(semApi()),
    estornar: (input: RhPagamentoEstornarInput): Promise<IpcResponse<void>> =>
      pagamentos()?.estornar(input) ?? Promise.resolve(semApi()),
  },

  config: {
    departamentos: {
      listar: (filtros?: RhFiltroCadastroInput): Promise<IpcResponse<RhPaginaDto<RhDepartamentoDto>>> =>
        config()?.departamentos.listar(filtros) ?? Promise.resolve(semApi()),
      criar: (dados: RhDepartamentoInput): Promise<IpcResponse<RhDepartamentoDto>> =>
        config()?.departamentos.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: ComId<RhDepartamentoInput>): Promise<IpcResponse<RhDepartamentoDto>> =>
        config()?.departamentos.atualizar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhDepartamentoDto>> =>
        config()?.departamentos.inativar(id) ?? Promise.resolve(semApi()),
    },
    cargos: {
      listar: (filtros?: RhFiltroCadastroInput): Promise<IpcResponse<RhPaginaDto<RhCargoDto>>> =>
        config()?.cargos.listar(filtros) ?? Promise.resolve(semApi()),
      criar: (dados: RhCargoInput): Promise<IpcResponse<RhCargoDto>> =>
        config()?.cargos.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: ComId<RhCargoInput>): Promise<IpcResponse<RhCargoDto>> =>
        config()?.cargos.atualizar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhCargoDto>> =>
        config()?.cargos.inativar(id) ?? Promise.resolve(semApi()),
    },
    rubricas: {
      listar: (filtros?: RhFiltroCadastroInput): Promise<IpcResponse<RhPaginaDto<RhRubricaDto>>> =>
        config()?.rubricas.listar(filtros) ?? Promise.resolve(semApi()),
      get: (id: string): Promise<IpcResponse<RhRubricaDto>> =>
        config()?.rubricas.get(id) ?? Promise.resolve(semApi()),
      criar: (dados: RhRubricaInput): Promise<IpcResponse<RhRubricaDto>> =>
        config()?.rubricas.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: ComId<RhRubricaInput>): Promise<IpcResponse<RhRubricaDto>> =>
        config()?.rubricas.atualizar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhRubricaDto>> =>
        config()?.rubricas.inativar(id) ?? Promise.resolve(semApi()),
    },
    tiposAusencia: {
      listar: (filtros?: RhFiltroCadastroInput): Promise<IpcResponse<RhPaginaDto<RhTipoAusenciaDto>>> =>
        config()?.tiposAusencia.listar(filtros) ?? Promise.resolve(semApi()),
      criar: (dados: RhTipoAusenciaInput): Promise<IpcResponse<RhTipoAusenciaDto>> =>
        config()?.tiposAusencia.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: ComId<RhTipoAusenciaInput>): Promise<IpcResponse<RhTipoAusenciaDto>> =>
        config()?.tiposAusencia.atualizar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhTipoAusenciaDto>> =>
        config()?.tiposAusencia.inativar(id) ?? Promise.resolve(semApi()),
    },
    centrosCusto: {
      listar: (filtros?: RhFiltroCadastroInput): Promise<IpcResponse<RhPaginaDto<RhCentroCustoDto>>> =>
        config()?.centrosCusto.listar(filtros) ?? Promise.resolve(semApi()),
      criar: (dados: RhCentroCustoInput): Promise<IpcResponse<RhCentroCustoDto>> =>
        config()?.centrosCusto.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: ComId<RhCentroCustoInput>): Promise<IpcResponse<RhCentroCustoDto>> =>
        config()?.centrosCusto.atualizar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhCentroCustoDto>> =>
        config()?.centrosCusto.inativar(id) ?? Promise.resolve(semApi()),
    },
    parametros: {
      listar: (filtros?: { chave?: string }): Promise<IpcResponse<RhParametroFiscalDto[]>> =>
        config()?.parametros.listar(filtros) ?? Promise.resolve(semApi()),
      criar: (dados: RhParametroInput): Promise<IpcResponse<RhParametroFiscalDto>> =>
        config()?.parametros.criar(dados) ?? Promise.resolve(semApi()),
    },
    irt: {
      listar: (): Promise<IpcResponse<RhTabelaIrtDto[]>> =>
        config()?.irt.listar() ?? Promise.resolve(semApi()),
      get: (id: string): Promise<IpcResponse<RhTabelaIrtDto>> =>
        config()?.irt.get(id) ?? Promise.resolve(semApi()),
      criar: (dados: RhTabelaIrtInput): Promise<IpcResponse<RhTabelaIrtDto>> =>
        config()?.irt.criar(dados) ?? Promise.resolve(semApi()),
    },
    periodos: {
      listar: (ano: number): Promise<IpcResponse<RhPeriodoDto[]>> =>
        config()?.periodos.listar(ano) ?? Promise.resolve(semApi()),
      gerar: (ano: number): Promise<IpcResponse<RhPeriodoDto[]>> =>
        config()?.periodos.gerar(ano) ?? Promise.resolve(semApi()),
      fechar: (id: string): Promise<IpcResponse<RhPeriodoDto>> =>
        config()?.periodos.fechar(id) ?? Promise.resolve(semApi()),
      reabrir: (id: string): Promise<IpcResponse<RhPeriodoDto>> =>
        config()?.periodos.reabrir(id) ?? Promise.resolve(semApi()),
    },
    configuracao: {
      obter: (): Promise<IpcResponse<RhConfiguracaoDto>> =>
        config()?.configuracao.obter() ?? Promise.resolve(semApi()),
      atualizar: (dados: RhConfiguracaoInput): Promise<IpcResponse<RhConfiguracaoDto>> =>
        config()?.configuracao.atualizar(dados) ?? Promise.resolve(semApi()),
    },
    referencia: {
      semear: (): Promise<IpcResponse<RhReferenciaSeedDto>> =>
        config()?.referencia.semear() ?? Promise.resolve(semApi()),
    },
  },

  ausencias: {
    listar: (input: RhAusenciasListarInput): Promise<IpcResponse<RhAusenciaPaginaDto>> =>
      ausencias()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhAusenciaDto>> =>
      ausencias()?.obter(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhAusenciaCriarInput): Promise<IpcResponse<RhAusenciaDto>> =>
      ausencias()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhAusenciaAtualizarInput): Promise<IpcResponse<RhAusenciaDto>> =>
      ausencias()?.atualizar(dados) ?? Promise.resolve(semApi()),
    aprovar: (dados: RhAusenciaAprovarInput): Promise<IpcResponse<RhAusenciaDto>> =>
      ausencias()?.aprovar(dados) ?? Promise.resolve(semApi()),
    inativar: (id: string): Promise<IpcResponse<RhAusenciaDto>> =>
      ausencias()?.inativar(id) ?? Promise.resolve(semApi()),
  },

  horasExtra: {
    listar: (input: RhHorasExtraListarInput): Promise<IpcResponse<RhHoraExtraPaginaDto>> =>
      horasExtra()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhHoraExtraDto>> =>
      horasExtra()?.obter(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhHoraExtraCriarInput): Promise<IpcResponse<RhHoraExtraDto>> =>
      horasExtra()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhHoraExtraAtualizarInput): Promise<IpcResponse<RhHoraExtraDto>> =>
      horasExtra()?.atualizar(dados) ?? Promise.resolve(semApi()),
    aprovar: (dados: RhHoraExtraAprovarInput): Promise<IpcResponse<RhHoraExtraDto>> =>
      horasExtra()?.aprovar(dados) ?? Promise.resolve(semApi()),
    inativar: (id: string): Promise<IpcResponse<RhHoraExtraDto>> =>
      horasExtra()?.inativar(id) ?? Promise.resolve(semApi()),
  },

  ferias: {
    saldos: {
      listar: (input: RhFeriasSaldosListarInput): Promise<IpcResponse<{ total: number; items: RhFeriasSaldoDto[] }>> =>
        ferias()?.saldos.listar(input) ?? Promise.resolve(semApi()),
      atualizar: (dados: RhFeriasSaldoAtualizarInput): Promise<IpcResponse<RhFeriasSaldoDto>> =>
        ferias()?.saldos.atualizar(dados) ?? Promise.resolve(semApi()),
    },
    marcacoes: {
      listar: (input: RhMarcacoesFeriasListarInput): Promise<IpcResponse<RhMarcacaoFeriasPaginaDto>> =>
        ferias()?.marcacoes.listar(input) ?? Promise.resolve(semApi()),
      obter: (id: string): Promise<IpcResponse<RhMarcacaoFeriasDto>> =>
        ferias()?.marcacoes.obter(id) ?? Promise.resolve(semApi()),
      criar: (dados: RhMarcacaoFeriasCriarInput): Promise<IpcResponse<RhMarcacaoFeriasDto>> =>
        ferias()?.marcacoes.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: RhMarcacaoFeriasAtualizarInput): Promise<IpcResponse<RhMarcacaoFeriasDto>> =>
        ferias()?.marcacoes.atualizar(dados) ?? Promise.resolve(semApi()),
      aprovar: (dados: RhMarcacaoFeriasAprovarInput): Promise<IpcResponse<RhMarcacaoFeriasDto>> =>
        ferias()?.marcacoes.aprovar(dados) ?? Promise.resolve(semApi()),
      inativar: (id: string): Promise<IpcResponse<RhMarcacaoFeriasDto>> =>
        ferias()?.marcacoes.inativar(id) ?? Promise.resolve(semApi()),
    },
  },

  afetacoes: {
    listar: (input: RhAfetacoesListarInput): Promise<IpcResponse<RhAfetacaoPaginaDto>> =>
      afetacoes()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhAfetacaoDto>> =>
      afetacoes()?.obter(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhAfetacaoCriarInput): Promise<IpcResponse<RhAfetacaoDto>> =>
      afetacoes()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhAfetacaoAtualizarInput): Promise<IpcResponse<RhAfetacaoDto>> =>
      afetacoes()?.atualizar(dados) ?? Promise.resolve(semApi()),
    remover: (id: string): Promise<IpcResponse<RhAfetacaoDto>> =>
      afetacoes()?.remover(id) ?? Promise.resolve(semApi()),
  },

  dividas: {
    processos: {
      listar: (input: RhProcessosDividaListarInput): Promise<IpcResponse<RhProcessoDividaPaginaDto>> =>
        dividas()?.processos.listar(input) ?? Promise.resolve(semApi()),
      obter: (id: string): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.obter(id) ?? Promise.resolve(semApi()),
      criar: (dados: RhProcessoDividaCriarInput): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.criar(dados) ?? Promise.resolve(semApi()),
      atualizar: (dados: RhProcessoDividaAtualizarInput): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.atualizar(dados) ?? Promise.resolve(semApi()),
      gerarPlano: (id: string): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.gerarPlano(id) ?? Promise.resolve(semApi()),
      suspender: (dados: RhProcessoDividaSuspenderInput): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.suspender(dados) ?? Promise.resolve(semApi()),
      liquidar: (id: string): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.liquidar(id) ?? Promise.resolve(semApi()),
      cancelar: (dados: RhProcessoDividaCancelarInput): Promise<IpcResponse<RhProcessoDividaDto>> =>
        dividas()?.processos.cancelar(dados) ?? Promise.resolve(semApi()),
    },
    prestacoes: {
      listar: (input: RhPrestacoesDividaListarInput): Promise<IpcResponse<RhPrestacaoDividaPaginaDto>> =>
        dividas()?.prestacoes.listar(input) ?? Promise.resolve(semApi()),
      obter: (id: string): Promise<IpcResponse<RhPrestacaoDividaDto>> =>
        dividas()?.prestacoes.obter(id) ?? Promise.resolve(semApi()),
      atualizar: (dados: RhPrestacaoDividaAtualizarInput): Promise<IpcResponse<RhPrestacaoDividaDto>> =>
        dividas()?.prestacoes.atualizar(dados) ?? Promise.resolve(semApi()),
      descontar: (dados: RhPrestacaoDividaDescontarInput): Promise<IpcResponse<RhPrestacaoDividaDto>> =>
        dividas()?.prestacoes.descontar(dados) ?? Promise.resolve(semApi()),
      anular: (dados: RhPrestacaoDividaAnularInput): Promise<IpcResponse<RhPrestacaoDividaDto>> =>
        dividas()?.prestacoes.anular(dados) ?? Promise.resolve(semApi()),
      perdoar: (dados: RhPrestacaoDividaPerdoarInput): Promise<IpcResponse<RhPrestacaoDividaDto>> =>
        dividas()?.prestacoes.perdoar(dados) ?? Promise.resolve(semApi()),
    },
  },

  retroativos: {
    listar: (input: RhRetroativosListarInput): Promise<IpcResponse<RhRetroativoPaginaDto>> =>
      retroativos()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhRetroativoDto>> =>
      retroativos()?.obter(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhRetroativoCriarInput): Promise<IpcResponse<RhRetroativoDto>> =>
      retroativos()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhRetroativoAtualizarInput): Promise<IpcResponse<RhRetroativoDto>> =>
      retroativos()?.atualizar(dados) ?? Promise.resolve(semApi()),
    aplicar: (dados: RhRetroativoAplicarInput): Promise<IpcResponse<RhRetroativoDto>> =>
      retroativos()?.aplicar(dados) ?? Promise.resolve(semApi()),
    anular: (dados: RhRetroativoAnularInput): Promise<IpcResponse<RhRetroativoDto>> =>
      retroativos()?.anular(dados) ?? Promise.resolve(semApi()),
  },

  independentes: {
    listar: (input: RhIndependentesListarInput): Promise<IpcResponse<RhIndependentePaginaDto>> =>
      independentes()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhIndependenteDto>> =>
      independentes()?.obter(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhIndependenteCriarInput): Promise<IpcResponse<RhIndependenteDto>> =>
      independentes()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhIndependenteAtualizarInput): Promise<IpcResponse<RhIndependenteDto>> =>
      independentes()?.atualizar(dados) ?? Promise.resolve(semApi()),
    inativar: (id: string): Promise<IpcResponse<RhIndependenteDto>> =>
      independentes()?.inativar(id) ?? Promise.resolve(semApi()),
  },

  atividades: {
    listar: (input: RhAtividadesListarInput): Promise<IpcResponse<RhAtividadePaginaDto>> =>
      atividades()?.listar(input) ?? Promise.resolve(semApi()),
    obter: (id: string): Promise<IpcResponse<RhAtividadeDto>> =>
      atividades()?.obter(id) ?? Promise.resolve(semApi()),
    criar: (dados: RhAtividadeCriarInput): Promise<IpcResponse<RhAtividadeDto>> =>
      atividades()?.criar(dados) ?? Promise.resolve(semApi()),
    atualizar: (dados: RhAtividadeAtualizarInput): Promise<IpcResponse<RhAtividadeDto>> =>
      atividades()?.atualizar(dados) ?? Promise.resolve(semApi()),
    inativar: (id: string): Promise<IpcResponse<RhAtividadeDto>> =>
      atividades()?.inativar(id) ?? Promise.resolve(semApi()),
  },

  auditoria: {
    listar: (input: RhAuditoriaListarInput): Promise<IpcResponse<RhAuditoriaPaginaDto>> =>
      auditoria()?.listar(input) ?? Promise.resolve(semApi()),
    porFuncionario: (input: RhAuditoriaPorFuncionarioInput): Promise<IpcResponse<RhAuditoriaPaginaDto>> =>
      auditoria()?.porFuncionario(input) ?? Promise.resolve(semApi()),
    porProcessamento: (input: RhAuditoriaPorProcessamentoInput): Promise<IpcResponse<RhAuditoriaPaginaDto>> =>
      auditoria()?.porProcessamento(input) ?? Promise.resolve(semApi()),
  },
};
