/**
 * @file relatorios.router.ts
 * @description Registo de canais IPC do módulo Relatórios.
 *
 * Os canais seguem `{modulo}:{acao}` — `relatorios:vendasPorMes` — em vez do
 * `{modulo}:{entidade}:{acao}` que o resto da aplicação usa. A inconsistência
 * já cá estava e é mantida de propósito: mudar o nome de um canal parte o
 * `preload` e o renderer ao mesmo tempo, e o ganho seria só consistência de
 * escrita. O que interessa é que o canal é o contrato, e o contrato é o mesmo
 * dos dois lados.
 *
 * Os canais de leitura não recebem `BrowserWindow`; o de exportação recebe, e
 * é ele que abre o diálogo de gravação. Passar a janela a todos era a opção
 *simples e punha nos canais de leitura um parâmetro que não podem usar.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { relatoriosController } from '../controllers/relatorios.controller';

export function registerRelatoriosRouter(): void {
  ipcMain.handle('relatorios:completo', (_, payload: unknown) =>
    relatoriosController.completo(payload),
  );
  ipcMain.handle('relatorios:resumo', (_, payload: unknown) =>
    relatoriosController.resumoExecutivo(payload),
  );
  ipcMain.handle('relatorios:vendasPorMes', (_, payload: unknown) =>
    relatoriosController.vendasPorMes(payload),
  );
  ipcMain.handle('relatorios:fluxoTesouraria', (_, payload: unknown) =>
    relatoriosController.fluxoTesourariaPorMes(payload),
  );
  ipcMain.handle('relatorios:topArtigos', (_, payload: unknown) =>
    relatoriosController.topArtigos(payload),
  );
  ipcMain.handle('relatorios:topClientes', (_, payload: unknown) =>
    relatoriosController.topClientes(payload),
  );
  // `stockBaixo` é um estado actual e não depende do período, por isso não
  // recebe payload.
  ipcMain.handle('relatorios:stockBaixo', () => relatoriosController.stockBaixo());
  ipcMain.handle('relatorios:valorizacao', (_, payload: unknown) =>
    relatoriosController.valorizacao(payload),
  );
  ipcMain.handle('relatorios:ivaPorTaxa', (_, payload: unknown) =>
    relatoriosController.ivaPorTaxa(payload),
  );

  // RH-801 novos relatórios
  ipcMain.handle('relatorios:folhaVencimentos', (_, payload: unknown) =>
    relatoriosController.folhaVencimentos(payload),
  );
  ipcMain.handle('relatorios:resumoIrt', (_, payload: unknown) =>
    relatoriosController.resumoIrt(payload),
  );
  ipcMain.handle('relatorios:resumoInss', (_, payload: unknown) =>
    relatoriosController.resumoInss(payload),
  );
  ipcMain.handle('relatorios:mapaFerias', (_, payload: unknown) =>
    relatoriosController.mapaFerias(payload),
  );
  ipcMain.handle('relatorios:mapaAusencias', (_, payload: unknown) =>
    relatoriosController.mapaAusencias(payload),
  );
  ipcMain.handle('relatorios:dividasAbertas', (_, payload: unknown) =>
    relatoriosController.dividasAbertas(payload),
  );
  ipcMain.handle('relatorios:custoDepartamento', (_, payload: unknown) =>
    relatoriosController.custoDepartamento(payload),
  );

  ipcMain.handle('relatorios:exportar', (event, payload: unknown) =>
    relatoriosController.exportar(payload, BrowserWindow.fromWebContents(event.sender)),
  );
}
