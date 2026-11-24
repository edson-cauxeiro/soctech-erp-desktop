/**
 * @file licensed-handler.ts
 * @description Wrapper dos handlers IPC que executam operações de módulos
 * comerciais. RBAC e licenciamento são verificações distintas: o controller
 * continua a exigir a permissão funcional; aqui só se verifica o direito da
 * licença.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { requireAnyLicensedModule } from '../middlewares/licensing.middleware';
import type { LicensingModuleKey } from '../../shared/licensing/types';
import { AppError } from './errors';
import { err, type IpcError, type IpcResponse } from './ipc-response';

type Ouvinte = (evento: IpcMainInvokeEvent, ...argumentos: any[]) => unknown;

/** Traduz a falha de licença para a forma padrão `{ success, error }`. */
async function verificar(modulos: readonly LicensingModuleKey[]): Promise<IpcError | null> {
  try {
    await requireAnyLicensedModule(modulos);
    return null;
  } catch (erro) {
    if (erro instanceof AppError) {
      return err(erro.code, erro.message, erro.details);
    }
    return err(
      'INTERNAL_ERROR',
      erro instanceof Error ? erro.message : 'Erro inesperado ao verificar a licença.'
    );
  }
}

/**
 * Devolve uma função com a mesma forma de `ipcMain.handle`, mas que só
 * executa o listener quando a licença cobre pelo menos um dos módulos.
 *
 * `any` nos argumentos é deliberado: os routers já tipam cada argumento nos
 * seus listeners e esta função apenas os repassa sem os inspeccionar.
 */
export function handleLicenciado(modulos: LicensingModuleKey | readonly LicensingModuleKey[]) {
  const exigidos: readonly LicensingModuleKey[] = Array.isArray(modulos) ? modulos : [modulos];
  return (canal: string, listener: Ouvinte): void => {
    ipcMain.handle(canal, async (evento, ...argumentos) => {
      const bloqueio = await verificar(exigidos);
      if (bloqueio) return bloqueio;
      return (await listener(evento, ...argumentos)) as IpcResponse<unknown>;
    });
  };
}
