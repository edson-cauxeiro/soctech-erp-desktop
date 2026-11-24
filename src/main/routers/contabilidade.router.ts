/**
 * @file contabilidade.router.ts
 * @description Registo de canais IPC da Contabilidade Geral.
 *
 * Os nomes seguem o padrão `modulo:recurso:acao` usado pelo resto da app. O
 * preload expõe exactamente estes canais; não há lógica aqui, só encaminhamento.
 */

import { BrowserWindow } from 'electron';
import { contabilidadeController } from '../controllers/contabilidade.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerContabilidadeRouter(): void {
  const handle = handleLicenciado('financas');
  // Plano de contas
  handle('contabilidade:contas:list', async (_, filters) => {
    return contabilidadeController.listarContas(filters);
  });

  handle('contabilidade:contas:arvore', async (_, empresaId: string) => {
    return contabilidadeController.arvoreContas(empresaId);
  });

  handle('contabilidade:contas:get', async (_, id: string) => {
    return contabilidadeController.obterConta(id);
  });

  handle('contabilidade:contas:criar', async (_, payload) => {
    return contabilidadeController.criarConta(payload);
  });

  handle('contabilidade:contas:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarConta(id, payload);
  });

  handle('contabilidade:contas:remover', async (_, id: string) => {
    return contabilidadeController.removerConta(id);
  });

  // Diários
  handle('contabilidade:diarios:list', async (_, filters) => {
    return contabilidadeController.listarDiarios(filters);
  });

  handle('contabilidade:diarios:get', async (_, id: string) => {
    return contabilidadeController.obterDiario(id);
  });

  handle('contabilidade:diarios:criar', async (_, payload) => {
    return contabilidadeController.criarDiario(payload);
  });

  handle('contabilidade:diarios:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarDiario(id, payload);
  });

  handle('contabilidade:diarios:remover', async (_, id: string) => {
    return contabilidadeController.removerDiario(id);
  });

  // Exercícios (leitura) e períodos
  handle('contabilidade:exercicios:list', async (_, empresaId?: string) => {
    return contabilidadeController.listarExercicios(empresaId);
  });

  handle('contabilidade:exercicios:get', async (_, id: string) => {
    return contabilidadeController.obterExercicio(id);
  });

  handle('contabilidade:periodos:list', async (_, filters) => {
    return contabilidadeController.listarPeriodos(filters);
  });

  handle('contabilidade:periodos:get', async (_, id: string) => {
    return contabilidadeController.obterPeriodo(id);
  });

  handle('contabilidade:periodos:criar', async (_, payload) => {
    return contabilidadeController.criarPeriodo(payload);
  });

  handle('contabilidade:periodos:criarDoExercicio', async (_, exercicioId: string) => {
    return contabilidadeController.criarPeriodosDoExercicio(exercicioId);
  });

  handle('contabilidade:periodos:alterarEstado', async (_, id: string, payload) => {
    return contabilidadeController.alterarEstadoPeriodo(id, payload);
  });

  handle('contabilidade:periodos:fechar', async (_, id: string) => {
    return contabilidadeController.fecharPeriodo(id);
  });

  handle('contabilidade:periodos:reabrir', async (_, id: string) => {
    return contabilidadeController.reabrirPeriodo(id);
  });

  handle('contabilidade:periodos:bloquear', async (_, id: string) => {
    return contabilidadeController.bloquearPeriodo(id);
  });

  // Mapeamentos
  handle('contabilidade:mapeamentos:list', async (_, filters) => {
    return contabilidadeController.listarMapeamentos(filters);
  });

  handle('contabilidade:mapeamentos:get', async (_, id: string) => {
    return contabilidadeController.obterMapeamento(id);
  });

  handle('contabilidade:mapeamentos:guardar', async (_, payload) => {
    return contabilidadeController.guardarMapeamento(payload);
  });

  handle('contabilidade:mapeamentos:remover', async (_, id: string) => {
    return contabilidadeController.removerMapeamento(id);
  });

  // Seed
  handle('contabilidade:semear', async () => {
    return contabilidadeController.semear();
  });

  // Lançamentos contabilísticos
  handle('contabilidade:lancamentos:list', async (_, filters) => {
    return contabilidadeController.listarLancamentos(filters);
  });

  handle('contabilidade:lancamentos:get', async (_, id: string) => {
    return contabilidadeController.obterLancamento(id);
  });

  handle('contabilidade:lancamentos:criar', async (_, payload) => {
    return contabilidadeController.criarLancamento(payload);
  });

  handle('contabilidade:lancamentos:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarLancamento(id, payload);
  });

  handle('contabilidade:lancamentos:validar', async (_, id: string) => {
    return contabilidadeController.validarLancamento(id);
  });

  handle('contabilidade:lancamentos:estornar', async (_, id: string, payload) => {
    return contabilidadeController.estornarLancamento(id, payload);
  });

  handle('contabilidade:lancamentos:remover', async (_, id: string) => {
    return contabilidadeController.removerLancamento(id);
  });

  // Reconciliação
  handle('contabilidade:reconciliacao:contas', async (_, empresaId: string) => {
    return contabilidadeController.listarContasBancariasParaReconciliar(empresaId);
  });

  handle('contabilidade:reconciliacao:resumo', async (_, contaBancariaId: string, empresaId: string) => {
    return contabilidadeController.obterResumoReconciliacao(contaBancariaId, empresaId);
  });

  handle('contabilidade:reconciliacao:sugerir', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.sugerirParesReconciliacao(contaBancariaId, empresaId, payload);
  });

  handle('contabilidade:reconciliacao:conciliar', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.conciliar(contaBancariaId, empresaId, payload);
  });

  handle('contabilidade:reconciliacao:desconciliar', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.desconciliar(contaBancariaId, empresaId, payload);
  });

  handle('contabilidade:reconciliacao:gerarLancamento', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.gerarLancamentoDeMovimento(contaBancariaId, empresaId, payload);
  });

  // Regras de contabilização
  handle('contabilidade:regras:list', async (_, filters) => {
    return contabilidadeController.listarRegras(filters);
  });

  handle('contabilidade:regras:get', async (_, id: string) => {
    return contabilidadeController.obterRegra(id);
  });

  handle('contabilidade:regras:criar', async (_, payload) => {
    return contabilidadeController.criarRegra(payload);
  });

  handle('contabilidade:regras:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarRegra(id, payload);
  });

  handle('contabilidade:regras:remover', async (_, id: string) => {
    return contabilidadeController.removerRegra(id);
  });

  // Erros de integração
  handle('contabilidade:erros:list', async (_, filters) => {
    return contabilidadeController.listarErrosIntegracao(filters);
  });

  handle('contabilidade:erros:reprocessar', async (_, erroId: string) => {
    return contabilidadeController.reprocessarErro(erroId);
  });

  // Fecho de período
  handle('contabilidade:fecho:previsao', async (_, periodoId: string) => {
    return contabilidadeController.previsaoFecho(periodoId);
  });

  handle('contabilidade:fecho:executar', async (_, periodoId: string) => {
    return contabilidadeController.executarFecho(periodoId);
  });

  handle('contabilidade:fecho:reabrir', async (_, periodoId: string, payload) => {
    return contabilidadeController.reabrirPeriodoFecho(periodoId, payload);
  });

  handle('contabilidade:fecho:execucoes', async (_, filters) => {
    return contabilidadeController.listarExecucoesFecho(filters);
  });

  // Relatórios
  handle('contabilidade:relatorios:balancete', async (_, filters) => {
    return contabilidadeController.balancete(filters);
  });

  handle('contabilidade:relatorios:razao', async (_, filters) => {
    return contabilidadeController.razao(filters);
  });

  handle('contabilidade:relatorios:diarios', async (_, filters) => {
    return contabilidadeController.relatorioDiarios(filters);
  });

  handle('contabilidade:relatorios:contaCorrente', async (_, filters) => {
    return contabilidadeController.contaCorrente(filters);
  });

  // Apuramento IVA
  handle('contabilidade:apuramentoIva:previsao', async (_, periodoId: string) => {
    return contabilidadeController.previsaoApuramentoIva(periodoId);
  });

  handle('contabilidade:apuramentoIva:list', async (_, filters) => {
    return contabilidadeController.listarApuramentosIva(filters);
  });

  handle('contabilidade:apuramentoIva:executar', async (_, periodoId: string) => {
    return contabilidadeController.executarApuramentoIva(periodoId);
  });

  handle('contabilidade:apuramentoIva:pagamento', async (_, payload) => {
    return contabilidadeController.registarPagamentoIva(payload);
  });

  // Apuramento de resultados e fecho anual
  handle('contabilidade:resultados:previsao', async (_, exercicioId: string) => {
    return contabilidadeController.previsaoApuramentoResultados(exercicioId);
  });

  handle('contabilidade:resultados:executar', async (_, exercicioId: string) => {
    return contabilidadeController.executarApuramentoResultados(exercicioId);
  });

  handle('contabilidade:fechoAnual:previsao', async (_, exercicioId: string) => {
    return contabilidadeController.previsaoFechoAnual(exercicioId);
  });

  handle('contabilidade:fechoAnual:executar', async (_, exercicioId: string) => {
    return contabilidadeController.executarFechoAnual(exercicioId);
  });

  handle('contabilidade:fechoAnual:abrir', async (_, exercicioId: string) => {
    return contabilidadeController.abrirExercicioSeguinte(exercicioId);
  });

  handle('contabilidade:fechoAnual:reabrir', async (_, exercicioId: string, payload) => {
    return contabilidadeController.reabrirFechoAnual(exercicioId, payload);
  });

  // Exportação de relatórios contabilísticos
  handle('contabilidade:relatorios:exportar', (event, payload) =>
    contabilidadeController.exportarRelatorio(payload, BrowserWindow.fromWebContents(event.sender))
  );

  // Demonstrações
  handle('contabilidade:estruturas:list', async (_, empresaId?: string) => {
    return contabilidadeController.listarEstruturas(empresaId);
  });

  handle('contabilidade:estruturas:get', async (_, id: string) => {
    return contabilidadeController.obterEstrutura(id);
  });

  handle('contabilidade:estruturas:save', async (_, empresaId: string, payload) => {
    return contabilidadeController.guardarEstrutura(empresaId, payload);
  });

  handle('contabilidade:estruturas:delete', async (_, id: string) => {
    return contabilidadeController.removerEstrutura(id);
  });

  handle('contabilidade:demonstracoes:gerar', async (_, estruturaId: string, dataInicio: string, dataFim: string) => {
    return contabilidadeController.gerarDemonstracao(estruturaId, dataInicio, dataFim);
  });

}
