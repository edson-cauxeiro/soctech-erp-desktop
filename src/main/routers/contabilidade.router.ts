/**
 * @file contabilidade.router.ts
 * @description Registo de canais IPC da Contabilidade Geral.
 *
 * Os nomes seguem o padrão `modulo:recurso:acao` usado pelo resto da app. O
 * preload expõe exactamente estes canais; não há lógica aqui, só encaminhamento.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { contabilidadeController } from '../controllers/contabilidade.controller';

export function registerContabilidadeRouter(): void {
  // Plano de contas
  ipcMain.handle('contabilidade:contas:list', async (_, filters) => {
    return contabilidadeController.listarContas(filters);
  });

  ipcMain.handle('contabilidade:contas:arvore', async (_, empresaId: string) => {
    return contabilidadeController.arvoreContas(empresaId);
  });

  ipcMain.handle('contabilidade:contas:get', async (_, id: string) => {
    return contabilidadeController.obterConta(id);
  });

  ipcMain.handle('contabilidade:contas:criar', async (_, payload) => {
    return contabilidadeController.criarConta(payload);
  });

  ipcMain.handle('contabilidade:contas:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarConta(id, payload);
  });

  ipcMain.handle('contabilidade:contas:remover', async (_, id: string) => {
    return contabilidadeController.removerConta(id);
  });

  // Diários
  ipcMain.handle('contabilidade:diarios:list', async (_, filters) => {
    return contabilidadeController.listarDiarios(filters);
  });

  ipcMain.handle('contabilidade:diarios:get', async (_, id: string) => {
    return contabilidadeController.obterDiario(id);
  });

  ipcMain.handle('contabilidade:diarios:criar', async (_, payload) => {
    return contabilidadeController.criarDiario(payload);
  });

  ipcMain.handle('contabilidade:diarios:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarDiario(id, payload);
  });

  ipcMain.handle('contabilidade:diarios:remover', async (_, id: string) => {
    return contabilidadeController.removerDiario(id);
  });

  // Exercícios (leitura) e períodos
  ipcMain.handle('contabilidade:exercicios:list', async (_, empresaId?: string) => {
    return contabilidadeController.listarExercicios(empresaId);
  });

  ipcMain.handle('contabilidade:exercicios:get', async (_, id: string) => {
    return contabilidadeController.obterExercicio(id);
  });

  ipcMain.handle('contabilidade:periodos:list', async (_, filters) => {
    return contabilidadeController.listarPeriodos(filters);
  });

  ipcMain.handle('contabilidade:periodos:get', async (_, id: string) => {
    return contabilidadeController.obterPeriodo(id);
  });

  ipcMain.handle('contabilidade:periodos:criar', async (_, payload) => {
    return contabilidadeController.criarPeriodo(payload);
  });

  ipcMain.handle('contabilidade:periodos:criarDoExercicio', async (_, exercicioId: string) => {
    return contabilidadeController.criarPeriodosDoExercicio(exercicioId);
  });

  ipcMain.handle('contabilidade:periodos:alterarEstado', async (_, id: string, payload) => {
    return contabilidadeController.alterarEstadoPeriodo(id, payload);
  });

  ipcMain.handle('contabilidade:periodos:fechar', async (_, id: string) => {
    return contabilidadeController.fecharPeriodo(id);
  });

  ipcMain.handle('contabilidade:periodos:reabrir', async (_, id: string) => {
    return contabilidadeController.reabrirPeriodo(id);
  });

  ipcMain.handle('contabilidade:periodos:bloquear', async (_, id: string) => {
    return contabilidadeController.bloquearPeriodo(id);
  });

  // Mapeamentos
  ipcMain.handle('contabilidade:mapeamentos:list', async (_, filters) => {
    return contabilidadeController.listarMapeamentos(filters);
  });

  ipcMain.handle('contabilidade:mapeamentos:get', async (_, id: string) => {
    return contabilidadeController.obterMapeamento(id);
  });

  ipcMain.handle('contabilidade:mapeamentos:guardar', async (_, payload) => {
    return contabilidadeController.guardarMapeamento(payload);
  });

  ipcMain.handle('contabilidade:mapeamentos:remover', async (_, id: string) => {
    return contabilidadeController.removerMapeamento(id);
  });

  // Seed
  ipcMain.handle('contabilidade:semear', async () => {
    return contabilidadeController.semear();
  });

  // Lançamentos contabilísticos
  ipcMain.handle('contabilidade:lancamentos:list', async (_, filters) => {
    return contabilidadeController.listarLancamentos(filters);
  });

  ipcMain.handle('contabilidade:lancamentos:get', async (_, id: string) => {
    return contabilidadeController.obterLancamento(id);
  });

  ipcMain.handle('contabilidade:lancamentos:criar', async (_, payload) => {
    return contabilidadeController.criarLancamento(payload);
  });

  ipcMain.handle('contabilidade:lancamentos:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarLancamento(id, payload);
  });

  ipcMain.handle('contabilidade:lancamentos:validar', async (_, id: string) => {
    return contabilidadeController.validarLancamento(id);
  });

  ipcMain.handle('contabilidade:lancamentos:estornar', async (_, id: string, payload) => {
    return contabilidadeController.estornarLancamento(id, payload);
  });

  ipcMain.handle('contabilidade:lancamentos:remover', async (_, id: string) => {
    return contabilidadeController.removerLancamento(id);
  });

  // Reconciliação
  ipcMain.handle('contabilidade:reconciliacao:contas', async (_, empresaId: string) => {
    return contabilidadeController.listarContasBancariasParaReconciliar(empresaId);
  });

  ipcMain.handle('contabilidade:reconciliacao:resumo', async (_, contaBancariaId: string, empresaId: string) => {
    return contabilidadeController.obterResumoReconciliacao(contaBancariaId, empresaId);
  });

  ipcMain.handle('contabilidade:reconciliacao:sugerir', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.sugerirParesReconciliacao(contaBancariaId, empresaId, payload);
  });

  ipcMain.handle('contabilidade:reconciliacao:conciliar', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.conciliar(contaBancariaId, empresaId, payload);
  });

  ipcMain.handle('contabilidade:reconciliacao:desconciliar', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.desconciliar(contaBancariaId, empresaId, payload);
  });

  ipcMain.handle('contabilidade:reconciliacao:gerarLancamento', async (_, contaBancariaId: string, empresaId: string, payload) => {
    return contabilidadeController.gerarLancamentoDeMovimento(contaBancariaId, empresaId, payload);
  });

  // Regras de contabilização
  ipcMain.handle('contabilidade:regras:list', async (_, filters) => {
    return contabilidadeController.listarRegras(filters);
  });

  ipcMain.handle('contabilidade:regras:get', async (_, id: string) => {
    return contabilidadeController.obterRegra(id);
  });

  ipcMain.handle('contabilidade:regras:criar', async (_, payload) => {
    return contabilidadeController.criarRegra(payload);
  });

  ipcMain.handle('contabilidade:regras:atualizar', async (_, id: string, payload) => {
    return contabilidadeController.atualizarRegra(id, payload);
  });

  ipcMain.handle('contabilidade:regras:remover', async (_, id: string) => {
    return contabilidadeController.removerRegra(id);
  });

  // Erros de integração
  ipcMain.handle('contabilidade:erros:list', async (_, filters) => {
    return contabilidadeController.listarErrosIntegracao(filters);
  });

  ipcMain.handle('contabilidade:erros:reprocessar', async (_, erroId: string) => {
    return contabilidadeController.reprocessarErro(erroId);
  });

  // Fecho de período
  ipcMain.handle('contabilidade:fecho:previsao', async (_, periodoId: string) => {
    return contabilidadeController.previsaoFecho(periodoId);
  });

  ipcMain.handle('contabilidade:fecho:executar', async (_, periodoId: string) => {
    return contabilidadeController.executarFecho(periodoId);
  });

  ipcMain.handle('contabilidade:fecho:reabrir', async (_, periodoId: string, payload) => {
    return contabilidadeController.reabrirPeriodoFecho(periodoId, payload);
  });

  ipcMain.handle('contabilidade:fecho:execucoes', async (_, filters) => {
    return contabilidadeController.listarExecucoesFecho(filters);
  });

  // Relatórios
  ipcMain.handle('contabilidade:relatorios:balancete', async (_, filters) => {
    return contabilidadeController.balancete(filters);
  });

  ipcMain.handle('contabilidade:relatorios:razao', async (_, filters) => {
    return contabilidadeController.razao(filters);
  });

  ipcMain.handle('contabilidade:relatorios:diarios', async (_, filters) => {
    return contabilidadeController.relatorioDiarios(filters);
  });

  ipcMain.handle('contabilidade:relatorios:contaCorrente', async (_, filters) => {
    return contabilidadeController.contaCorrente(filters);
  });

  // Apuramento IVA
  ipcMain.handle('contabilidade:apuramentoIva:previsao', async (_, periodoId: string) => {
    return contabilidadeController.previsaoApuramentoIva(periodoId);
  });

  ipcMain.handle('contabilidade:apuramentoIva:list', async (_, filters) => {
    return contabilidadeController.listarApuramentosIva(filters);
  });

  ipcMain.handle('contabilidade:apuramentoIva:executar', async (_, periodoId: string) => {
    return contabilidadeController.executarApuramentoIva(periodoId);
  });

  ipcMain.handle('contabilidade:apuramentoIva:pagamento', async (_, payload) => {
    return contabilidadeController.registarPagamentoIva(payload);
  });

  // Apuramento de resultados e fecho anual
  ipcMain.handle('contabilidade:resultados:previsao', async (_, exercicioId: string) => {
    return contabilidadeController.previsaoApuramentoResultados(exercicioId);
  });

  ipcMain.handle('contabilidade:resultados:executar', async (_, exercicioId: string) => {
    return contabilidadeController.executarApuramentoResultados(exercicioId);
  });

  ipcMain.handle('contabilidade:fechoAnual:previsao', async (_, exercicioId: string) => {
    return contabilidadeController.previsaoFechoAnual(exercicioId);
  });

  ipcMain.handle('contabilidade:fechoAnual:executar', async (_, exercicioId: string) => {
    return contabilidadeController.executarFechoAnual(exercicioId);
  });

  ipcMain.handle('contabilidade:fechoAnual:abrir', async (_, exercicioId: string) => {
    return contabilidadeController.abrirExercicioSeguinte(exercicioId);
  });

  ipcMain.handle('contabilidade:fechoAnual:reabrir', async (_, exercicioId: string, payload) => {
    return contabilidadeController.reabrirFechoAnual(exercicioId, payload);
  });

  // Exportação de relatórios contabilísticos
  ipcMain.handle('contabilidade:relatorios:exportar', (event, payload) =>
    contabilidadeController.exportarRelatorio(payload, BrowserWindow.fromWebContents(event.sender))
  );

  // Demonstrações
  ipcMain.handle('contabilidade:estruturas:list', async (_, empresaId?: string) => {
    return contabilidadeController.listarEstruturas(empresaId);
  });

  ipcMain.handle('contabilidade:estruturas:get', async (_, id: string) => {
    return contabilidadeController.obterEstrutura(id);
  });

  ipcMain.handle('contabilidade:estruturas:save', async (_, empresaId: string, payload) => {
    return contabilidadeController.guardarEstrutura(empresaId, payload);
  });

  ipcMain.handle('contabilidade:estruturas:delete', async (_, id: string) => {
    return contabilidadeController.removerEstrutura(id);
  });

  ipcMain.handle('contabilidade:demonstracoes:gerar', async (_, estruturaId: string, dataInicio: string, dataFim: string) => {
    return contabilidadeController.gerarDemonstracao(estruturaId, dataInicio, dataFim);
  });

}
