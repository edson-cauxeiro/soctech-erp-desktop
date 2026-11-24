import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
export const api = {
  auth: {
    login: (credentials: unknown) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    me: () => ipcRenderer.invoke('auth:me'),
  },
  dbConfig: {
    ler: () => ipcRenderer.invoke('config:ler'),
    guardar: (data: unknown) => ipcRenderer.invoke('config:guardar', data),
    testar: (data: unknown) => ipcRenderer.invoke('config:testar', data),
  },
  utilizadores: {
    list: (filters?: unknown) => ipcRenderer.invoke('utilizadores:list', filters),
    get: (id: string) => ipcRenderer.invoke('utilizadores:get', id),
    create: (data: unknown) => ipcRenderer.invoke('utilizadores:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('utilizadores:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('utilizadores:delete', id),
    changePassword: (id: string, data: unknown) => ipcRenderer.invoke('utilizadores:changePassword', id, data),
    resetPassword: (id: string, data: unknown) => ipcRenderer.invoke('utilizadores:resetPassword', id, data),
  },
  perfis: {
    list: () => ipcRenderer.invoke('perfis:list'),
    get: (id: string) => ipcRenderer.invoke('perfis:get', id),
    create: (data: unknown) => ipcRenderer.invoke('perfis:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('perfis:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('perfis:delete', id),
    duplicate: (id: string, novoNome: string) => ipcRenderer.invoke('perfis:duplicate', id, novoNome),
  },
  empresa: {
    list: () => ipcRenderer.invoke('empresa:list'),
    get: (id?: string) => ipcRenderer.invoke('empresa:get', id),
    create: (data: unknown) => ipcRenderer.invoke('empresa:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('empresa:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('empresa:delete', id),
    save: (data: unknown) => ipcRenderer.invoke('empresa:save', data),
  },
  exercicio: {
    list: (empresaId?: string) => ipcRenderer.invoke('exercicio:list', empresaId),
    create: (data: unknown) => ipcRenderer.invoke('exercicio:create', data),
    delete: (id: string) => ipcRenderer.invoke('exercicio:delete', id),
  },
  serie: {
    list: (empresaId?: string, tipoDocumento?: string) => ipcRenderer.invoke('serie:list', empresaId, tipoDocumento),
    create: (data: unknown) => ipcRenderer.invoke('serie:create', data),
    delete: (id: string) => ipcRenderer.invoke('serie:delete', id),
  },
  artigos: {
    list: (filters?: unknown) => ipcRenderer.invoke('artigos:list', filters),
    get: (id: string) => ipcRenderer.invoke('artigos:get', id),
    create: (data: unknown) => ipcRenderer.invoke('artigos:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('artigos:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('artigos:delete', id),
  },
  clientes: {
    list: (filters?: unknown) => ipcRenderer.invoke('clientes:list', filters),
    get: (id: string) => ipcRenderer.invoke('clientes:get', id),
    create: (data: unknown) => ipcRenderer.invoke('clientes:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('clientes:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('clientes:delete', id),
  },
  fornecedores: {
    list: (filters?: unknown) => ipcRenderer.invoke('fornecedores:list', filters),
    get: (id: string) => ipcRenderer.invoke('fornecedores:get', id),
    create: (data: unknown) => ipcRenderer.invoke('fornecedores:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('fornecedores:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('fornecedores:delete', id),
  },
  armazens: {
    list: (filters?: unknown) => ipcRenderer.invoke('armazens:list', filters),
    get: (id: string) => ipcRenderer.invoke('armazens:get', id),
    getDefaultVendas: () => ipcRenderer.invoke('armazens:getDefaultVendas'),
    getDefaultCompras: () => ipcRenderer.invoke('armazens:getDefaultCompras'),
    getStock: (armazemId: string) => ipcRenderer.invoke('armazens:getStock', armazemId),
    create: (data: unknown) => ipcRenderer.invoke('armazens:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('armazens:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('armazens:delete', id),
  },
  localizacoes: {
    list: (filters?: unknown) => ipcRenderer.invoke('localizacoes:list', filters),
    get: (id: string) => ipcRenderer.invoke('localizacoes:get', id),
    areas: (armazemId: string) => ipcRenderer.invoke('localizacoes:areas', armazemId),
    criarArea: (data: unknown) => ipcRenderer.invoke('localizacoes:criar-area', data),
    criarZona: (data: unknown) => ipcRenderer.invoke('localizacoes:criar-zona', data),
    actualizarArea: (id: string, data: unknown) => ipcRenderer.invoke('localizacoes:actualizar-area', id, data),
    desactivarArea: (id: string) => ipcRenderer.invoke('localizacoes:desactivar-area', id),
    actualizarZona: (id: string, data: unknown) => ipcRenderer.invoke('localizacoes:actualizar-zona', id, data),
    desactivarZona: (id: string) => ipcRenderer.invoke('localizacoes:desactivar-zona', id),
    zonas: (areaId: string) => ipcRenderer.invoke('localizacoes:zonas', areaId),
    tree: (armazemId: string) => ipcRenderer.invoke('localizacoes:tree', armazemId),
    create: (data: unknown) => ipcRenderer.invoke('localizacoes:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('localizacoes:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('localizacoes:delete', id),
    mostrarCapacidade: (id: string) => ipcRenderer.invoke('localizacoes:mostrar-capacidade', id),
    mostrarEstado: (id: string) => ipcRenderer.invoke('localizacoes:mostrar-estado', id),
  },
  lotes: {
    list: (filters?: unknown) => ipcRenderer.invoke('lotes:list', filters),
    get: (id: string) => ipcRenderer.invoke('lotes:get', id),
    create: (data: unknown) => ipcRenderer.invoke('lotes:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('lotes:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('lotes:delete', id),
  },
  inventory: {
    consultarSaldo: (data: unknown) => ipcRenderer.invoke('inventory:consultar-saldo', data),
    consultarStock: (filters?: unknown) => ipcRenderer.invoke('inventory:consultar-stock', filters),
  },
  stock: {
    listMovimentos: (filters?: unknown) => ipcRenderer.invoke('stock:listMovimentos', filters),
    getArtigoArmazem: (artigoId: string, armazemId: string) => ipcRenderer.invoke('stock:getArtigoArmazem', artigoId, armazemId),
    getTotalArtigo: (artigoId: string) => ipcRenderer.invoke('stock:getTotalArtigo', artigoId),
    createMovimento: (data: unknown) => ipcRenderer.invoke('stock:createMovimento', data),
    transferencia: (data: unknown) => ipcRenderer.invoke('stock:transferencia', data),
    baixaVenda: (data: unknown) => ipcRenderer.invoke('stock:baixaVenda', data),
    listInventarios: () => ipcRenderer.invoke('stock:listInventarios'),
    criarInventario: (data: unknown) => ipcRenderer.invoke('stock:criarInventario', data),
    fecharInventario: (id: string) => ipcRenderer.invoke('stock:fecharInventario', id),
    getEstadoStock: (filters?: unknown) => ipcRenderer.invoke('stock:getEstadoStock', filters),
  },
  compras: {
    listEncomendas: (filters?: unknown) => ipcRenderer.invoke('compras:listEncomendas', filters),
    getEncomenda: (id: string) => ipcRenderer.invoke('compras:getEncomenda', id),
    createEncomenda: (data: unknown) => ipcRenderer.invoke('compras:createEncomenda', data),
    listGuias: (filters?: unknown) => ipcRenderer.invoke('compras:listGuias', filters),
    getGuia: (id: string) => ipcRenderer.invoke('compras:getGuia', id),
    createGuia: (data: unknown) => ipcRenderer.invoke('compras:createGuia', data),
    listFaturas: (filters?: unknown) => ipcRenderer.invoke('compras:listFaturas', filters),
    getFatura: (id: string) => ipcRenderer.invoke('compras:getFatura', id),
    createFatura: (data: unknown) => ipcRenderer.invoke('compras:createFatura', data),
  },
  vendas: {
    listFaturas: (filters?: unknown) => ipcRenderer.invoke('vendas:listFaturas', filters),
    getFatura: (id: string) => ipcRenderer.invoke('vendas:getFatura', id),
    emitirFatura: (data: unknown) => ipcRenderer.invoke('vendas:emitirFatura', data),
    anularFatura: (id: string, motivo: string) => ipcRenderer.invoke('vendas:anularFatura', id, motivo),
    getDocumentoImprimivel: (id: string) => ipcRenderer.invoke('vendas:getDocumentoImprimivel', id),
  },
  proformas: {
    list: (filters?: unknown) => ipcRenderer.invoke('proformas:list', filters),
    get: (id: string) => ipcRenderer.invoke('proformas:get', id),
    criar: (data: unknown) => ipcRenderer.invoke('proformas:criar', data),
    emitir: (id: string) => ipcRenderer.invoke('proformas:emitir', id),
    converterParaFatura: (id: string, payload: unknown) => ipcRenderer.invoke('proformas:converterParaFatura', id, payload),
    converterParaGuia: (id: string, payload: unknown) => ipcRenderer.invoke('proformas:converterParaGuia', id, payload),
    anular: (id: string, motivo: string) => ipcRenderer.invoke('proformas:anular', id, motivo),
    getDocumentoImprimivel: (id: string) => ipcRenderer.invoke('proformas:getDocumentoImprimivel', id),
  },
  guiasEntrega: {
    list: (filters?: unknown) => ipcRenderer.invoke('guiasEntrega:list', filters),
    get: (id: string) => ipcRenderer.invoke('guiasEntrega:get', id),
    criar: (data: unknown) => ipcRenderer.invoke('guiasEntrega:criar', data),
    confirmar: (id: string) => ipcRenderer.invoke('guiasEntrega:confirmar', id),
    faturar: (id: string, payload: unknown) => ipcRenderer.invoke('guiasEntrega:faturar', id, payload),
    anular: (id: string, motivo: string) => ipcRenderer.invoke('guiasEntrega:anular', id, motivo),
    getDocumentoImprimivel: (id: string) => ipcRenderer.invoke('guiasEntrega:getDocumentoImprimivel', id),
  },
  recibos: {
    list: (filters?: unknown) => ipcRenderer.invoke('recibos:list', filters),
    get: (id: string) => ipcRenderer.invoke('recibos:get', id),
    criar: (data: unknown) => ipcRenderer.invoke('recibos:criar', data),
    imputarFaturas: (id: string, imputacoes: unknown) => ipcRenderer.invoke('recibos:imputarFaturas', id, imputacoes),
    anular: (id: string, motivo: string) => ipcRenderer.invoke('recibos:anular', id, motivo),
    getDocumentoImprimivel: (id: string) => ipcRenderer.invoke('recibos:getDocumentoImprimivel', id),
  },
  tesouraria: {
    // Contas bancárias
    listarContas: (filters?: unknown) => ipcRenderer.invoke('tesouraria:contas:list', filters),
    listarContasComSaldos: (filters?: unknown) => ipcRenderer.invoke('tesouraria:contas:listComSaldos', filters),
    listarContasContabeisDisponiveis: (empresaId: string, contaBancariaId?: string) =>
      ipcRenderer.invoke('tesouraria:contas:contasContabeisDisponiveis', empresaId, contaBancariaId),
    obterConta: (id: string) => ipcRenderer.invoke('tesouraria:contas:get', id),
    resumoSaldos: (filters?: unknown) => ipcRenderer.invoke('tesouraria:contas:resumoSaldos', filters),
    criarConta: (data: unknown) => ipcRenderer.invoke('tesouraria:contas:criar', data),
    atualizarConta: (id: string, data: unknown) => ipcRenderer.invoke('tesouraria:contas:atualizar', id, data),
    ajustarSaldoInicial: (id: string, saldoInicial: number, observacoes?: string) =>
      ipcRenderer.invoke('tesouraria:contas:ajustarSaldoInicial', id, saldoInicial, observacoes),
    desativarConta: (id: string) => ipcRenderer.invoke('tesouraria:contas:desativar', id),
    reativarConta: (id: string) => ipcRenderer.invoke('tesouraria:contas:reativar', id),
    removerConta: (id: string) => ipcRenderer.invoke('tesouraria:contas:remover', id),
    // Lançamentos
    listarMovimentos: (filters?: unknown) => ipcRenderer.invoke('tesouraria:movimentos:list', filters),
    obterMovimento: (id: string) => ipcRenderer.invoke('tesouraria:movimentos:get', id),
    resumo: (filters?: unknown) => ipcRenderer.invoke('tesouraria:movimentos:resumo', filters),
    criarMovimento: (data: unknown) => ipcRenderer.invoke('tesouraria:movimentos:criar', data),
    confirmarMovimento: (id: string) => ipcRenderer.invoke('tesouraria:movimentos:confirmar', id),
    estornarMovimento: (id: string, data: unknown) => ipcRenderer.invoke('tesouraria:movimentos:estornar', id, data),
    conciliarMovimento: (id: string, conciliado: boolean, dataConciliacao?: string) =>
      ipcRenderer.invoke('tesouraria:movimentos:conciliar', id, conciliado, dataConciliacao),
    conciliarLote: (data: unknown) => ipcRenderer.invoke('tesouraria:movimentos:conciliarLote', data),
    validarMeioPagamento: (data: unknown) => ipcRenderer.invoke('tesouraria:validarMeioPagamento', data),
    // Sessões de caixa
    listarSessoes: (filters?: unknown) => ipcRenderer.invoke('tesouraria:sessoes:list', filters),
    obterSessao: (id: string) => ipcRenderer.invoke('tesouraria:sessoes:get', id),
    obterSessaoAberta: (contaCaixaId: string) => ipcRenderer.invoke('tesouraria:sessoes:aberta', contaCaixaId),
    apurarSessao: (id: string) => ipcRenderer.invoke('tesouraria:sessoes:apurar', id),
    listarMovimentosSessao: (id: string) => ipcRenderer.invoke('tesouraria:sessoes:movimentos', id),
    abrirSessao: (data: unknown) => ipcRenderer.invoke('tesouraria:sessoes:abrir', data),
    fecharSessao: (id: string, data: unknown) => ipcRenderer.invoke('tesouraria:sessoes:fechar', id, data),
  },
  contabilidade: {
    contas: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:contas:list', filters),
      arvore: (empresaId: string) => ipcRenderer.invoke('contabilidade:contas:arvore', empresaId),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:contas:get', id),
      criar: (data: unknown) => ipcRenderer.invoke('contabilidade:contas:criar', data),
      atualizar: (id: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:contas:atualizar', id, data),
      remover: (id: string) => ipcRenderer.invoke('contabilidade:contas:remover', id),
    },
    diarios: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:diarios:list', filters),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:diarios:get', id),
      criar: (data: unknown) => ipcRenderer.invoke('contabilidade:diarios:criar', data),
      atualizar: (id: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:diarios:atualizar', id, data),
      remover: (id: string) => ipcRenderer.invoke('contabilidade:diarios:remover', id),
    },
    exercicios: {
      listar: (empresaId?: string) =>
        ipcRenderer.invoke('contabilidade:exercicios:list', empresaId),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:exercicios:get', id),
    },
    periodos: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:periodos:list', filters),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:periodos:get', id),
      criar: (data: unknown) => ipcRenderer.invoke('contabilidade:periodos:criar', data),
      criarDoExercicio: (exercicioId: string) =>
        ipcRenderer.invoke('contabilidade:periodos:criarDoExercicio', exercicioId),
      alterarEstado: (id: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:periodos:alterarEstado', id, data),
      fechar: (id: string) => ipcRenderer.invoke('contabilidade:periodos:fechar', id),
      reabrir: (id: string) => ipcRenderer.invoke('contabilidade:periodos:reabrir', id),
      bloquear: (id: string) => ipcRenderer.invoke('contabilidade:periodos:bloquear', id),
    },
    mapeamentos: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:mapeamentos:list', filters),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:mapeamentos:get', id),
      guardar: (data: unknown) => ipcRenderer.invoke('contabilidade:mapeamentos:guardar', data),
      remover: (id: string) => ipcRenderer.invoke('contabilidade:mapeamentos:remover', id),
    },
    semear: () => ipcRenderer.invoke('contabilidade:semear'),
    lancamentos: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:lancamentos:list', filters),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:lancamentos:get', id),
      criar: (data: unknown) => ipcRenderer.invoke('contabilidade:lancamentos:criar', data),
      atualizar: (id: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:lancamentos:atualizar', id, data),
      validar: (id: string) => ipcRenderer.invoke('contabilidade:lancamentos:validar', id),
      estornar: (id: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:lancamentos:estornar', id, data),
      remover: (id: string) => ipcRenderer.invoke('contabilidade:lancamentos:remover', id),
    },
    reconciliacao: {
      listarContas: (empresaId: string) =>
        ipcRenderer.invoke('contabilidade:reconciliacao:contas', empresaId),
      resumo: (contaBancariaId: string, empresaId: string) =>
        ipcRenderer.invoke('contabilidade:reconciliacao:resumo', contaBancariaId, empresaId),
      sugerir: (contaBancariaId: string, empresaId: string, data?: unknown) =>
        ipcRenderer.invoke('contabilidade:reconciliacao:sugerir', contaBancariaId, empresaId, data),
      conciliar: (contaBancariaId: string, empresaId: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:reconciliacao:conciliar', contaBancariaId, empresaId, data),
      desconciliar: (contaBancariaId: string, empresaId: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:reconciliacao:desconciliar', contaBancariaId, empresaId, data),
      gerarLancamento: (contaBancariaId: string, empresaId: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:reconciliacao:gerarLancamento', contaBancariaId, empresaId, data),
    },
    regras: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:regras:list', filters),
      obter: (id: string) => ipcRenderer.invoke('contabilidade:regras:get', id),
      criar: (data: unknown) => ipcRenderer.invoke('contabilidade:regras:criar', data),
      atualizar: (id: string, data: unknown) =>
        ipcRenderer.invoke('contabilidade:regras:atualizar', id, data),
      remover: (id: string) => ipcRenderer.invoke('contabilidade:regras:remover', id),
    },
    fecho: {
      previsao: (periodoId: string) => ipcRenderer.invoke('contabilidade:fecho:previsao', periodoId),
      executar: (periodoId: string) => ipcRenderer.invoke('contabilidade:fecho:executar', periodoId),
      reabrir: (periodoId: string, data: { motivo: string }) =>
        ipcRenderer.invoke('contabilidade:fecho:reabrir', periodoId, data),
      listarExecucoes: (filters?: unknown) => ipcRenderer.invoke('contabilidade:fecho:execucoes', filters),
    },
    apuramentoIva: {
      previsao: (periodoId: string) => ipcRenderer.invoke('contabilidade:apuramentoIva:previsao', periodoId),
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:apuramentoIva:list', filters),
      executar: (periodoId: string) => ipcRenderer.invoke('contabilidade:apuramentoIva:executar', periodoId),
      pagamento: (data: { apuramentoId: string; dataPagamento: string | Date; contaBancariaId: string }) =>
        ipcRenderer.invoke('contabilidade:apuramentoIva:pagamento', data),
    },
    resultados: {
      previsao: (exercicioId: string) => ipcRenderer.invoke('contabilidade:resultados:previsao', exercicioId),
      executar: (exercicioId: string) => ipcRenderer.invoke('contabilidade:resultados:executar', exercicioId),
    },
    fechoAnual: {
      previsao: (exercicioId: string) => ipcRenderer.invoke('contabilidade:fechoAnual:previsao', exercicioId),
      executar: (exercicioId: string) => ipcRenderer.invoke('contabilidade:fechoAnual:executar', exercicioId),
      abrir: (exercicioId: string) => ipcRenderer.invoke('contabilidade:fechoAnual:abrir', exercicioId),
      reabrir: (exercicioId: string, data: { motivo: string }) =>
        ipcRenderer.invoke('contabilidade:fechoAnual:reabrir', exercicioId, data),
    },
    demonstracoes: {
      listarEstruturas: (empresaId?: string) => ipcRenderer.invoke('contabilidade:estruturas:list', empresaId),
      obterEstrutura: (id: string) => ipcRenderer.invoke('contabilidade:estruturas:get', id),
      guardarEstrutura: (empresaId: string, payload: unknown) =>
        ipcRenderer.invoke('contabilidade:estruturas:save', empresaId, payload),
      removerEstrutura: (id: string) => ipcRenderer.invoke('contabilidade:estruturas:delete', id),
      gerar: (estruturaId: string, dataInicio: string, dataFim: string) =>
        ipcRenderer.invoke('contabilidade:demonstracoes:gerar', estruturaId, dataInicio, dataFim),
    },
    relatorios: {
      balancete: (filters?: unknown) => ipcRenderer.invoke('contabilidade:relatorios:balancete', filters),
      razao: (filters?: unknown) => ipcRenderer.invoke('contabilidade:relatorios:razao', filters),
      diarios: (filters?: unknown) => ipcRenderer.invoke('contabilidade:relatorios:diarios', filters),
      contaCorrente: (filters?: unknown) =>
        ipcRenderer.invoke('contabilidade:relatorios:contaCorrente', filters),
      exportarRelatorio: (payload: unknown) =>
        ipcRenderer.invoke('contabilidade:relatorios:exportar', payload),
    },
    errosIntegracao: {
      listar: (filters?: unknown) => ipcRenderer.invoke('contabilidade:erros:list', filters),
      reprocessar: (erroId: string) => ipcRenderer.invoke('contabilidade:erros:reprocessar', erroId),
    },
  },
  rh: {
    ping: () => ipcRenderer.invoke('rh:sistema:ping'),
    funcionarios: {
      listar: (filtros?: unknown) => ipcRenderer.invoke('rh:funcionarios:listar', filtros),
      get: (id: string) => ipcRenderer.invoke('rh:funcionarios:get', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:atualizar', dados),
      inativar: (id: string) => ipcRenderer.invoke('rh:funcionarios:inativar', { id }),
      dependentes: {
        criar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:dependentes:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:dependentes:atualizar', dados),
        remover: (id: string) => ipcRenderer.invoke('rh:funcionarios:dependentes:remover', { id }),
      },
      rubricasFixas: {
        criar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:rubricas-fixas:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:rubricas-fixas:atualizar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:funcionarios:rubricas-fixas:inativar', { id }),
      },
      documentos: {
        criar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:documentos:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:funcionarios:documentos:atualizar', dados),
        remover: (id: string) => ipcRenderer.invoke('rh:funcionarios:documentos:remover', { id }),
      },
    },
    contratos: {
      listar: (funcionarioId: string) => ipcRenderer.invoke('rh:contratos:listar', { funcionarioId }),
      get: (id: string) => ipcRenderer.invoke('rh:contratos:get', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:contratos:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:contratos:atualizar', dados),
      cessar: (dados: unknown) => ipcRenderer.invoke('rh:contratos:cessar', dados),
      criarAlteracao: (dados: unknown) => ipcRenderer.invoke('rh:contratos:alteracoes:criar', dados),
      salarioNaData: (funcionarioId: string, data: string) =>
        ipcRenderer.invoke('rh:contratos:salario-na-data', { funcionarioId, data }),
    },
    importacao: {
      selecionar: () => ipcRenderer.invoke('rh:importacao:selecionar'),
      funcionarios: {
        previsualizar: (dados: unknown) => ipcRenderer.invoke('rh:importacao:funcionarios:previsualizar', dados),
        importar: (dados: unknown) => ipcRenderer.invoke('rh:importacao:funcionarios:importar', dados),
      },
      contratos: {
        previsualizar: (dados: unknown) => ipcRenderer.invoke('rh:importacao:contratos:previsualizar', dados),
        importar: (dados: unknown) => ipcRenderer.invoke('rh:importacao:contratos:importar', dados),
      },
    },
    alteracoesMensais: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:alteracoes-mensais:listar', input),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:alteracoes-mensais:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:alteracoes-mensais:atualizar', dados),
      anular: (id: string, motivo?: string) => ipcRenderer.invoke('rh:alteracoes-mensais:anular', { id, motivo }),
      copiarMesAnterior: (input: unknown) => ipcRenderer.invoke('rh:alteracoes-mensais:copiar-mes-anterior', input),
    },
    processamento: {
      carregar: (input: unknown) => ipcRenderer.invoke('rh:processamento:carregar', input),
      simular: (input: unknown) => ipcRenderer.invoke('rh:processamento:simular', input),
      preparar: (input: unknown) => ipcRenderer.invoke('rh:processamento:preparar', input),
      processar: (input: unknown) => ipcRenderer.invoke('rh:processamento:processar', input),
      processarLote: (input: unknown) => ipcRenderer.invoke('rh:processamento:processar-lote', input),
      anular: (input: unknown) => ipcRenderer.invoke('rh:processamento:anular', input),
      listar: (input: unknown) => ipcRenderer.invoke('rh:processamento:listar', input),
      historico: (input: unknown) => ipcRenderer.invoke('rh:processamento:historico', input),
      obter: (input: unknown) => ipcRenderer.invoke('rh:processamento:obter', input),
      // Subscreve os eventos de progresso do lote; devolve a função de limpeza.
      onProgresso: (callback: (progresso: unknown) => void) => {
        const listener = (_event: IpcRendererEvent, progresso: unknown): void => callback(progresso);
        ipcRenderer.on('rh:processamento:progresso', listener);
        return () => ipcRenderer.removeListener('rh:processamento:progresso', listener);
      },
    },
    config: {
      departamentos: {
        listar: (filtros?: unknown) => ipcRenderer.invoke('rh:config:departamentos:listar', filtros),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:departamentos:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:config:departamentos:atualizar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:config:departamentos:inativar', { id }),
      },
      cargos: {
        listar: (filtros?: unknown) => ipcRenderer.invoke('rh:config:cargos:listar', filtros),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:cargos:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:config:cargos:atualizar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:config:cargos:inativar', { id }),
      },
      rubricas: {
        listar: (filtros?: unknown) => ipcRenderer.invoke('rh:config:rubricas:listar', filtros),
        get: (id: string) => ipcRenderer.invoke('rh:config:rubricas:get', { id }),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:rubricas:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:config:rubricas:atualizar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:config:rubricas:inativar', { id }),
      },
      tiposAusencia: {
        listar: (filtros?: unknown) => ipcRenderer.invoke('rh:config:tipos-ausencia:listar', filtros),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:tipos-ausencia:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:config:tipos-ausencia:atualizar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:config:tipos-ausencia:inativar', { id }),
      },
      centrosCusto: {
        listar: (filtros?: unknown) => ipcRenderer.invoke('rh:config:centros-custo:listar', filtros),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:centros-custo:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:config:centros-custo:atualizar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:config:centros-custo:inativar', { id }),
      },
      parametros: {
        listar: (filtros?: unknown) => ipcRenderer.invoke('rh:config:parametros:listar', filtros),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:parametros:criar', dados),
      },
      irt: {
        listar: () => ipcRenderer.invoke('rh:config:irt:listar', {}),
        get: (id: string) => ipcRenderer.invoke('rh:config:irt:get', { id }),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:config:irt:criar', dados),
      },
      periodos: {
        listar: (ano: number) => ipcRenderer.invoke('rh:config:periodos:listar', { ano }),
        gerar: (ano: number) => ipcRenderer.invoke('rh:config:periodos:gerar', { ano }),
        fechar: (id: string) => ipcRenderer.invoke('rh:config:periodos:fechar', { id }),
        reabrir: (id: string) => ipcRenderer.invoke('rh:config:periodos:reabrir', { id }),
      },
      configuracao: {
        obter: () => ipcRenderer.invoke('rh:config:configuracao:obter', {}),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:config:configuracao:atualizar', dados),
      },
      // Dados de referência padrão (RH-806) — idempotente.
      referencia: {
        semear: () => ipcRenderer.invoke('rh:config:referencia:semear', {}),
      },
    },
    // Recibos de processamento (RH-502/503)
    recibos: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:recibos:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:recibos:obter', { id }),
      gerarPdf: (input: { reciboIds: string[] }) => ipcRenderer.invoke('rh:recibos:gerarPdf', input),
      registarImpressao: (id: string) => ipcRenderer.invoke('rh:recibos:registarImpressao', { id }),
    },
    // Pagamentos (RH-504)
    pagamentos: {
      ordens: {
        listar: (input: unknown) => ipcRenderer.invoke('rh:pagamentos:ordens:listar', input),
        criar: (input: unknown) => ipcRenderer.invoke('rh:pagamentos:ordens:criar', input),
        obter: (id: string) => ipcRenderer.invoke('rh:pagamentos:ordens:obter', { id }),
        gerarFicheiro: (id: string) => ipcRenderer.invoke('rh:pagamentos:ordens:gerarFicheiro', { id }),
      },
      listar: (input: unknown) => ipcRenderer.invoke('rh:pagamentos:listar', input),
      confirmar: (input: unknown) => ipcRenderer.invoke('rh:pagamentos:confirmar', input),
      estornar: (input: unknown) => ipcRenderer.invoke('rh:pagamentos:estornar', input),
    },
    // Ausências (RH-601)
    ausencias: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:ausencias:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:ausencias:obter', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:ausencias:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:ausencias:atualizar', dados),
      aprovar: (dados: unknown) => ipcRenderer.invoke('rh:ausencias:aprovar', dados),
      inativar: (id: string) => ipcRenderer.invoke('rh:ausencias:inativar', { id }),
    },
    // Horas Extra (RH-602)
    horasExtra: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:horas-extra:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:horas-extra:obter', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:horas-extra:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:horas-extra:atualizar', dados),
      aprovar: (dados: unknown) => ipcRenderer.invoke('rh:horas-extra:aprovar', dados),
      inativar: (id: string) => ipcRenderer.invoke('rh:horas-extra:inativar', { id }),
    },
    // Férias (RH-603)
    ferias: {
      saldos: {
        listar: (input: unknown) => ipcRenderer.invoke('rh:ferias:saldos:listar', input),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:ferias:saldos:atualizar', dados),
      },
      marcacoes: {
        listar: (input: unknown) => ipcRenderer.invoke('rh:ferias:marcacoes:listar', input),
        obter: (id: string) => ipcRenderer.invoke('rh:ferias:marcacoes:obter', { id }),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:ferias:marcacoes:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:ferias:marcacoes:atualizar', dados),
        aprovar: (dados: unknown) => ipcRenderer.invoke('rh:ferias:marcacoes:aprovar', dados),
        inativar: (id: string) => ipcRenderer.invoke('rh:ferias:marcacoes:inativar', { id }),
      },
    },
    // Afetações (RH-605)
    afetacoes: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:afetacoes:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:afetacoes:obter', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:afetacoes:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:afetacoes:atualizar', dados),
      remover: (id: string) => ipcRenderer.invoke('rh:afetacoes:remover', { id }),
    },
    // Dívidas/Penhora (RH-606/607)
    dividas: {
      processos: {
        listar: (input: unknown) => ipcRenderer.invoke('rh:dividas:processos:listar', input),
        obter: (id: string) => ipcRenderer.invoke('rh:dividas:processos:obter', { id }),
        criar: (dados: unknown) => ipcRenderer.invoke('rh:dividas:processos:criar', dados),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:dividas:processos:atualizar', dados),
        gerarPlano: (id: string) => ipcRenderer.invoke('rh:dividas:processos:gerar-plano', { id }),
        suspender: (dados: unknown) => ipcRenderer.invoke('rh:dividas:processos:suspender', dados),
        liquidar: (id: string) => ipcRenderer.invoke('rh:dividas:processos:liquidar', { id }),
        cancelar: (dados: unknown) => ipcRenderer.invoke('rh:dividas:processos:cancelar', dados),
      },
      prestacoes: {
        listar: (input: unknown) => ipcRenderer.invoke('rh:dividas:prestacoes:listar', input),
        obter: (id: string) => ipcRenderer.invoke('rh:dividas:prestacoes:obter', { id }),
        atualizar: (dados: unknown) => ipcRenderer.invoke('rh:dividas:prestacoes:atualizar', dados),
        descontar: (dados: unknown) => ipcRenderer.invoke('rh:dividas:prestacoes:descontar', dados),
        anular: (dados: unknown) => ipcRenderer.invoke('rh:dividas:prestacoes:anular', dados),
        perdoar: (dados: unknown) => ipcRenderer.invoke('rh:dividas:prestacoes:perdoar', dados),
      },
    },
    // Retroactivos (RH-608)
    retroativos: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:retroativos:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:retroativos:obter', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:retroativos:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:retroativos:atualizar', dados),
      aplicar: (dados: unknown) => ipcRenderer.invoke('rh:retroativos:aplicar', dados),
      anular: (dados: unknown) => ipcRenderer.invoke('rh:retroativos:anular', dados),
    },
    // Independentes (RH-701)
    independentes: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:independentes:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:independentes:obter', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:independentes:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:independentes:atualizar', dados),
      inativar: (id: string) => ipcRenderer.invoke('rh:independentes:inativar', { id }),
    },
    // Atividades (RH-702)
    atividades: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:atividades:listar', input),
      obter: (id: string) => ipcRenderer.invoke('rh:atividades:obter', { id }),
      criar: (dados: unknown) => ipcRenderer.invoke('rh:atividades:criar', dados),
      atualizar: (dados: unknown) => ipcRenderer.invoke('rh:atividades:atualizar', dados),
      inativar: (id: string) => ipcRenderer.invoke('rh:atividades:inativar', { id }),
    },
    // Auditoria (RH-802)
    auditoria: {
      listar: (input: unknown) => ipcRenderer.invoke('rh:auditoria:listar', input),
      porFuncionario: (input: unknown) => ipcRenderer.invoke('rh:auditoria:por-funcionario', input),
      porProcessamento: (input: unknown) => ipcRenderer.invoke('rh:auditoria:por-processamento', input),
    },
  },
  fiscal: {
    // SAF-T
    gerarSaft: (payload: unknown) => ipcRenderer.invoke('fiscal:saft:gerar', payload),
    validarSaft: (payload: unknown) => ipcRenderer.invoke('fiscal:saft:validar', payload),
    // Conformidade AGT
    gerarAgt: (payload: unknown) => ipcRenderer.invoke('fiscal:agt:gerar', payload),
    registarRespostaAgt: (payload: unknown) => ipcRenderer.invoke('fiscal:agt:resposta', payload),
    listarSubmissoes: (payload: unknown) => ipcRenderer.invoke('fiscal:agt:listar', payload),
    // Auditoria
    listarAuditoria: (payload: unknown) => ipcRenderer.invoke('fiscal:auditoria:listar', payload),
    verificarIntegridade: (payload: unknown) => ipcRenderer.invoke('fiscal:auditoria:integridade', payload),
    resumoAuditoria: (payload: unknown) => ipcRenderer.invoke('fiscal:auditoria:resumo', payload),
    arquivarAuditoria: (payload: unknown) => ipcRenderer.invoke('fiscal:auditoria:arquivar', payload),
    desarquivarAuditoria: (payload: unknown) => ipcRenderer.invoke('fiscal:auditoria:desarquivar', payload),
  },
relatorios: {
    completo: (payload: unknown) => ipcRenderer.invoke('relatorios:completo', payload),
    resumo: (payload: unknown) => ipcRenderer.invoke('relatorios:resumo', payload),
    vendasPorMes: (payload: unknown) => ipcRenderer.invoke('relatorios:vendasPorMes', payload),
    fluxoTesouraria: (payload: unknown) => ipcRenderer.invoke('relatorios:fluxoTesouraria', payload),
    topArtigos: (payload: unknown) => ipcRenderer.invoke('relatorios:topArtigos', payload),
    topClientes: (payload: unknown) => ipcRenderer.invoke('relatorios:topClientes', payload),
    // Sem payload: o stock baixo é um estado actual, não um período.
    stockBaixo: () => ipcRenderer.invoke('relatorios:stockBaixo'),
    valorizacao: (payload: unknown) => ipcRenderer.invoke('relatorios:valorizacao', payload),
    ivaPorTaxa: (payload: unknown) => ipcRenderer.invoke('relatorios:ivaPorTaxa', payload),
    // RH-801 novos relatórios
    folhaVencimentos: (payload: unknown) => ipcRenderer.invoke('relatorios:folhaVencimentos', payload),
    resumoIrt: (payload: unknown) => ipcRenderer.invoke('relatorios:resumoIrt', payload),
    resumoInss: (payload: unknown) => ipcRenderer.invoke('relatorios:resumoInss', payload),
    mapaFerias: (payload: unknown) => ipcRenderer.invoke('relatorios:mapaFerias', payload),
    mapaAusencias: (payload: unknown) => ipcRenderer.invoke('relatorios:mapaAusencias', payload),
    dividasAbertas: (payload: unknown) => ipcRenderer.invoke('relatorios:dividasAbertas', payload),
    custoDepartamento: (payload: unknown) => ipcRenderer.invoke('relatorios:custoDepartamento', payload),
    // `exportar` abre o diálogo de gravação no processo Main, por isso devolve
    // `cancelado` em vez de erro quando o utilizador fecha o diálogo de gravação.
    exportar: (payload: unknown) => ipcRenderer.invoke('relatorios:exportar', payload),
  },
  documentoPrint: {
    exportPdf: (options: { suggestedFilename: string }) => ipcRenderer.invoke('documentoPrint:exportPdf', options),
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error('Falha ao expor contextBridge no Preload:', error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
