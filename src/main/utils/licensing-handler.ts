/**
 * @file licensing-handler.ts
 * @description Wrapper dos handlers IPC de licenciamento.
 *
 * Segue o padrão de `rhHandler`: sessão, RBAC no Main, validação Zod e
 * resposta `{ success, data }`. O Renderer nunca tem acesso directo à BD nem
 * à verificação criptográfica.
 */

import { ZodError, type ZodTypeAny } from 'zod';
import { err, ok, type IpcError, type IpcResponse } from './ipc-response';
import { AppError, UnauthorizedError } from './errors';
import { authService, type AuthService } from '../services/auth.service';
import { requirePermission, type UserSession } from '../middlewares/rbac.middleware';
import type { AcaoRbac } from '../constants/permissions.constants';

type Inferir<T extends ZodTypeAny> = T['_output'];

export interface LicensingContext {
  session: UserSession;
  empresaId: string | null;
  utilizadorId: string;
}

export interface LicensingPermissao {
  modulo: 'configuracoes';
  acao: AcaoRbac;
}

function extrairPayload(args: unknown[]): unknown {
  if (args.length > 1) return args[1];
  const unico = args[0];
  const pareceEventoIpc =
    typeof unico === 'object' &&
    unico !== null &&
    'sender' in unico &&
    ('frameId' in unico || 'senderFrame' in unico);
  return pareceEventoIpc ? undefined : unico;
}

function mapearErro(erro: unknown): IpcError {
  if (erro instanceof ZodError) {
    return err('VALIDATION_ERROR', 'Dados inválidos.', erro.flatten());
  }
  if (erro instanceof AppError) {
    return err(erro.code, erro.message, erro.details);
  }
  return err('INTERNAL_ERROR', erro instanceof Error ? erro.message : 'Erro inesperado no licenciamento.');
}

/** Cria um handler `ipcMain.handle` com RBAC e contrato tipado. */
export function licensingHandler<TSchema extends ZodTypeAny, TResult>(
  schema: TSchema,
  permissao: LicensingPermissao,
  fn: (input: Inferir<TSchema>, ctx: LicensingContext) => Promise<TResult>,
  auth: AuthService = authService
): (...args: unknown[]) => Promise<IpcResponse<TResult>> {
  return async (...args: unknown[]): Promise<IpcResponse<TResult>> => {
    try {
      const session = auth.getCurrentSession();
      if (!session) throw new UnauthorizedError();
      requirePermission(session, permissao.modulo, permissao.acao);

      const input = schema.parse(extrairPayload(args) ?? {}) as Inferir<TSchema>;
      const ctx: LicensingContext = {
        session,
        empresaId: session.empresaConfigId ?? null,
        utilizadorId: session.id,
      };
      return ok(await fn(input, ctx));
    } catch (erro) {
      return mapearErro(erro);
    }
  };
}
