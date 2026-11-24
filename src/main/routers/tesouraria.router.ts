/**
 * @file tesouraria.router.ts
 * @description Registo de canais IPC da Tesouraria.
 */

import { ipcMain } from 'electron';
import { tesourariaController } from '../controllers/tesouraria.controller';

export function registerTesourariaRouter(): void {
  // Contas bancárias
  ipcMain.handle('tesouraria:contas:list', async (_, filters) => {
    return tesourariaController.listarContas(filters);
  });

  ipcMain.handle('tesouraria:contas:listComSaldos', async (_, filters) => {
    return tesourariaController.listarContasComSaldos(filters);
  });

  ipcMain.handle(
    'tesouraria:contas:contasContabeisDisponiveis',
    async (_, empresaId: string, contaBancariaId?: string) => {
      return tesourariaController.listarContasContabeisDisponiveis(empresaId, contaBancariaId);
    }
  );

  ipcMain.handle('tesouraria:contas:get', async (_, id: string) => {
    return tesourariaController.obterConta(id);
  });

  ipcMain.handle('tesouraria:contas:resumoSaldos', async (_, filters) => {
    return tesourariaController.resumoSaldos(filters);
  });

  ipcMain.handle('tesouraria:contas:criar', async (_, data) => {
    return tesourariaController.criarConta(data);
  });

  ipcMain.handle('tesouraria:contas:atualizar', async (_, id: string, data) => {
    return tesourariaController.atualizarConta(id, data);
  });

  ipcMain.handle('tesouraria:contas:ajustarSaldoInicial', async (_, id: string, saldoInicial: number, observacoes?: string) => {
    return tesourariaController.ajustarSaldoInicial(id, saldoInicial, observacoes);
  });

  ipcMain.handle('tesouraria:contas:desativar', async (_, id: string) => {
    return tesourariaController.desativarConta(id);
  });

  ipcMain.handle('tesouraria:contas:reativar', async (_, id: string) => {
    return tesourariaController.reativarConta(id);
  });

  ipcMain.handle('tesouraria:contas:remover', async (_, id: string) => {
    return tesourariaController.removerConta(id);
  });

  // Lançamentos
  ipcMain.handle('tesouraria:movimentos:list', async (_, filters) => {
    return tesourariaController.listarMovimentos(filters);
  });

  ipcMain.handle('tesouraria:movimentos:get', async (_, id: string) => {
    return tesourariaController.obterMovimento(id);
  });

  ipcMain.handle('tesouraria:movimentos:resumo', async (_, filters) => {
    return tesourariaController.resumo(filters);
  });

  ipcMain.handle('tesouraria:movimentos:criar', async (_, data) => {
    return tesourariaController.criarMovimento(data);
  });

  ipcMain.handle('tesouraria:movimentos:confirmar', async (_, id: string) => {
    return tesourariaController.confirmarMovimento(id);
  });

  ipcMain.handle('tesouraria:movimentos:estornar', async (_, id: string, data) => {
    return tesourariaController.estornarMovimento(id, data);
  });

  ipcMain.handle('tesouraria:movimentos:conciliar', async (_, id: string, conciliado: boolean, dataConciliacao?: string) => {
    return tesourariaController.conciliarMovimento(id, conciliado, dataConciliacao);
  });

  ipcMain.handle('tesouraria:movimentos:conciliarLote', async (_, data) => {
    return tesourariaController.conciliarLote(data);
  });

  ipcMain.handle('tesouraria:validarMeioPagamento', async (_, data) => {
    return tesourariaController.validarMeioPagamento(data);
  });

  // Sessões de caixa
  ipcMain.handle('tesouraria:sessoes:list', async (_, filters) => {
    return tesourariaController.listarSessoes(filters);
  });

  ipcMain.handle('tesouraria:sessoes:get', async (_, id: string) => {
    return tesourariaController.obterSessao(id);
  });

  ipcMain.handle('tesouraria:sessoes:aberta', async (_, contaCaixaId: string) => {
    return tesourariaController.obterSessaoAberta(contaCaixaId);
  });

  ipcMain.handle('tesouraria:sessoes:apurar', async (_, id: string) => {
    return tesourariaController.apurarSessao(id);
  });

  ipcMain.handle('tesouraria:sessoes:movimentos', async (_, id: string) => {
    return tesourariaController.listarMovimentosSessao(id);
  });

  ipcMain.handle('tesouraria:sessoes:abrir', async (_, data) => {
    return tesourariaController.abrirSessao(data);
  });

  ipcMain.handle('tesouraria:sessoes:fechar', async (_, id: string, data) => {
    return tesourariaController.fecharSessao(id, data);
  });
}
