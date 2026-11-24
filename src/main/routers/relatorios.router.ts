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

import { BrowserWindow } from 'electron';
import { relatoriosController } from '../controllers/relatorios.controller';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerRelatoriosRouter(): void {
  const handle = handleLicenciado('relatorios');
  handle('relatorios:completo', (_, payload: unknown) =>
    relatoriosController.completo(payload),
  );
  handle('relatorios:resumo', (_, payload: unknown) =>
    relatoriosController.resumoExecutivo(payload),
  );
  handle('relatorios:vendasPorMes', (_, payload: unknown) =>
    relatoriosController.vendasPorMes(payload),
  );
  handle('relatorios:fluxoTesouraria', (_, payload: unknown) =>
    relatoriosController.fluxoTesourariaPorMes(payload),
  );
  handle('relatorios:topArtigos', (_, payload: unknown) =>
    relatoriosController.topArtigos(payload),
  );
  handle('relatorios:topClientes', (_, payload: unknown) =>
    relatoriosController.topClientes(payload),
  );
  // `stockBaixo` é um estado actual e não depende do período, por isso não
  // recebe payload.
  handle('relatorios:stockBaixo', () => relatoriosController.stockBaixo());
  handle('relatorios:valorizacao', (_, payload: unknown) =>
    relatoriosController.valorizacao(payload),
  );
  handle('relatorios:ivaPorTaxa', (_, payload: unknown) =>
    relatoriosController.ivaPorTaxa(payload),
  );

  // RH-801 novos relatórios
  handle('relatorios:folhaVencimentos', (_, payload: unknown) =>
    relatoriosController.folhaVencimentos(payload),
  );
  handle('relatorios:resumoIrt', (_, payload: unknown) =>
    relatoriosController.resumoIrt(payload),
  );
  handle('relatorios:resumoInss', (_, payload: unknown) =>
    relatoriosController.resumoInss(payload),
  );
  handle('relatorios:mapaFerias', (_, payload: unknown) =>
    relatoriosController.mapaFerias(payload),
  );
  handle('relatorios:mapaAusencias', (_, payload: unknown) =>
    relatoriosController.mapaAusencias(payload),
  );
  handle('relatorios:dividasAbertas', (_, payload: unknown) =>
    relatoriosController.dividasAbertas(payload),
  );
  handle('relatorios:custoDepartamento', (_, payload: unknown) =>
    relatoriosController.custoDepartamento(payload),
  );

  handle('relatorios:exportar', (event, payload: unknown) =>
    relatoriosController.exportar(payload, BrowserWindow.fromWebContents(event.sender)),
  );
}
