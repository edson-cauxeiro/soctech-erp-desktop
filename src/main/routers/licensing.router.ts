/**
 * @file licensing.router.ts
 * @description Registo dos canais IPC de licenciamento. Todas as operações
 * passam por `licensingHandler`: sessão, RBAC no Main e validação Zod.
 */

import { ipcMain } from 'electron';
import { licensingController } from '../controllers/licensing.controller';
import {
  licensingConteudoSchema,
  licensingEventosSchema,
  licensingModuleSchema,
  licensingPingSchema,
} from '../validators/licensing.validator';
import { licensingHandler } from '../utils/licensing-handler';

const LEITURA = { modulo: 'configuracoes', acao: 'read' } as const;
const ADMINISTRACAO = { modulo: 'configuracoes', acao: 'admin' } as const;

export function registerLicensingRouter(): void {
  ipcMain.handle(
    'licensing:getStatus',
    licensingHandler(licensingPingSchema, LEITURA, () => licensingController.getStatus())
  );
  ipcMain.handle(
    'licensing:getModules',
    licensingHandler(licensingPingSchema, LEITURA, () => licensingController.getModules())
  );
  ipcMain.handle(
    'licensing:checkModule',
    licensingHandler(licensingModuleSchema, LEITURA, ({ modulo }) =>
      licensingController.checkModule({ modulo })
    )
  );
  ipcMain.handle(
    'licensing:getEvents',
    licensingHandler(licensingEventosSchema, LEITURA, ({ limite }, ctx) =>
      licensingController.getEvents({ limite }, ctx)
    )
  );
  ipcMain.handle(
    'licensing:selectFile',
    licensingHandler(licensingPingSchema, ADMINISTRACAO, () => licensingController.selectFile())
  );
  ipcMain.handle(
    'licensing:import',
    licensingHandler(licensingConteudoSchema, ADMINISTRACAO, ({ conteudo }, ctx) =>
      licensingController.import({ conteudo }, ctx)
    )
  );
  ipcMain.handle(
    'licensing:remove',
    licensingHandler(licensingPingSchema, ADMINISTRACAO, (_input, ctx) =>
      licensingController.remove({}, ctx)
    )
  );
}
