/**
 * @file tesouraria.router.ts
 * @description Registo de canais IPC da Tesouraria.
 */

import { tesourariaController } from '../controllers/tesouraria.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerTesourariaRouter(): void {
  const handle = handleLicenciado('financas');
  // Contas bancárias
  handle('tesouraria:contas:list', async (_, filters) => {
    return tesourariaController.listarContas(filters);
  });

  handle('tesouraria:contas:listComSaldos', async (_, filters) => {
    return tesourariaController.listarContasComSaldos(filters);
  });

  handle(
    'tesouraria:contas:contasContabeisDisponiveis',
    async (_, empresaId: string, contaBancariaId?: string) => {
      return tesourariaController.listarContasContabeisDisponiveis(empresaId, contaBancariaId);
    }
  );

  handle('tesouraria:contas:get', async (_, id: string) => {
    return tesourariaController.obterConta(id);
  });

  handle('tesouraria:contas:resumoSaldos', async (_, filters) => {
    return tesourariaController.resumoSaldos(filters);
  });

  handle('tesouraria:contas:criar', async (_, data) => {
    return tesourariaController.criarConta(data);
  });

  handle('tesouraria:contas:atualizar', async (_, id: string, data) => {
    return tesourariaController.atualizarConta(id, data);
  });

  handle('tesouraria:contas:ajustarSaldoInicial', async (_, id: string, saldoInicial: number, observacoes?: string) => {
    return tesourariaController.ajustarSaldoInicial(id, saldoInicial, observacoes);
  });

  handle('tesouraria:contas:desativar', async (_, id: string) => {
    return tesourariaController.desativarConta(id);
  });

  handle('tesouraria:contas:reativar', async (_, id: string) => {
    return tesourariaController.reativarConta(id);
  });

  handle('tesouraria:contas:remover', async (_, id: string) => {
    return tesourariaController.removerConta(id);
  });

  // Lançamentos
  handle('tesouraria:movimentos:list', async (_, filters) => {
    return tesourariaController.listarMovimentos(filters);
  });

  handle('tesouraria:movimentos:get', async (_, id: string) => {
    return tesourariaController.obterMovimento(id);
  });

  handle('tesouraria:movimentos:resumo', async (_, filters) => {
    return tesourariaController.resumo(filters);
  });

  handle('tesouraria:movimentos:criar', async (_, data) => {
    return tesourariaController.criarMovimento(data);
  });

  handle('tesouraria:movimentos:confirmar', async (_, id: string) => {
    return tesourariaController.confirmarMovimento(id);
  });

  handle('tesouraria:movimentos:estornar', async (_, id: string, data) => {
    return tesourariaController.estornarMovimento(id, data);
  });

  handle('tesouraria:movimentos:conciliar', async (_, id: string, conciliado: boolean, dataConciliacao?: string) => {
    return tesourariaController.conciliarMovimento(id, conciliado, dataConciliacao);
  });

  handle('tesouraria:movimentos:conciliarLote', async (_, data) => {
    return tesourariaController.conciliarLote(data);
  });

  handle('tesouraria:validarMeioPagamento', async (_, data) => {
    return tesourariaController.validarMeioPagamento(data);
  });

  // Sessões de caixa
  handle('tesouraria:sessoes:list', async (_, filters) => {
    return tesourariaController.listarSessoes(filters);
  });

  handle('tesouraria:sessoes:get', async (_, id: string) => {
    return tesourariaController.obterSessao(id);
  });

  handle('tesouraria:sessoes:aberta', async (_, contaCaixaId: string) => {
    return tesourariaController.obterSessaoAberta(contaCaixaId);
  });

  handle('tesouraria:sessoes:apurar', async (_, id: string) => {
    return tesourariaController.apurarSessao(id);
  });

  handle('tesouraria:sessoes:movimentos', async (_, id: string) => {
    return tesourariaController.listarMovimentosSessao(id);
  });

  handle('tesouraria:sessoes:abrir', async (_, data) => {
    return tesourariaController.abrirSessao(data);
  });

  handle('tesouraria:sessoes:fechar', async (_, id: string, data) => {
    return tesourariaController.fecharSessao(id, data);
  });
}
