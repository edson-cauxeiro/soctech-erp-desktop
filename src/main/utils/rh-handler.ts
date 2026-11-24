/**
 * @file rh-handler.ts
 * @description Wrapper base para handlers IPC do módulo de Recursos Humanos.
 *
 * Centraliza o que, de outro modo, se repetiria em cada canal: obtenção da
 * sessão, verificação de permissões (coarse ou fine-grained), validação Zod do
 * payload, construção de um contexto comum e normalização da resposta/erros.
 * Ver `docs/rh-docs/DECISOES.md` (ADR-008).
 */

import { ZodError, type ZodTypeAny } from 'zod';
import { err, ok, type IpcError, type IpcResponse } from './ipc-response';
import { AppError, ForbiddenError, UnauthorizedError } from './errors';
import { rhPermissaoConcede, RH_CHAVE_SALARIOS } from '../constants/rh-permissions.constants';
import { authService, type AuthService } from '../services/auth.service';
import { requirePermission, type UserSession } from '../middlewares/rbac.middleware';
import type { AcaoRbac } from '../constants/permissions.constants';

type Inferir<T extends ZodTypeAny> = T['_output'];

/**
 * Extrai o payload dos argumentos recebidos pelo handler.
 *
 * O `ipcMain.handle` invoca o callback com `(event, ...args)`, enquanto os
 * testes unitários chamam a função diretamente com o payload. Sem esta
 * distinção o `event` era validado como se fosse o payload — todas as escritas
 * do RH falhavam com `VALIDATION_ERROR` (campos obrigatórios em falta) e as
 * leituras ignoravam os filtros.
 */
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

/** Requisito de autorização: um par coarse (módulo+acção) ou uma chave fina. */
export type RhPermissaoRequisito =
  | { modulo: string; acao?: AcaoRbac }
  | { chave: string };

export interface RhContext {
  session: UserSession;
  empresaId: string | null;
  utilizadorId: string;
  /** `true` quando a sessão pode consultar valores salariais. */
  podeVerSalarios: boolean;
}

function verificarRequisito(session: UserSession, requisito: RhPermissaoRequisito): void {
  // Perfil de sistema "Administrador" tem acesso total (mesma regra de `hasPermission`).
  if (session.perfilNome === 'Administrador') return;

  if ('chave' in requisito) {
    if (!rhPermissaoConcede(session.permissoes, requisito.chave)) {
      throw new ForbiddenError(`Permissão insuficiente. Requer '${requisito.chave}'.`);
    }
    return;
  }
  requirePermission(session, requisito.modulo, requisito.acao ?? 'read');
}

function mapearErro(erro: unknown): IpcError {
  if (erro instanceof ZodError) {
    return err('VALIDATION_ERROR', 'Dados inválidos.', erro.flatten());
  }
  if (erro instanceof AppError) {
    return err(erro.code, erro.message, erro.details);
  }
  const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado no módulo de RH.';
  return err('INTERNAL_ERROR', mensagem);
}

/**
 * Cria um handler IPC para o módulo de RH.
 *
 * @param schema - Schema Zod que valida o payload recebido.
 * @param permissao - Requisito (ou lista, avaliada em conjunção) de autorização.
 * @param fn - Lógica do handler; recebe o input validado e o contexto da sessão.
 * @param auth - Serviço de autenticação (injectável para testes).
 * @returns Função pronta para `ipcMain.handle`.
 */
export function rhHandler<TSchema extends ZodTypeAny, TResult>(
  schema: TSchema,
  permissao: RhPermissaoRequisito | RhPermissaoRequisito[],
  fn: (input: Inferir<TSchema>, ctx: RhContext) => Promise<TResult>,
  auth: AuthService = authService
): (...args: unknown[]) => Promise<IpcResponse<TResult>> {
  const requisitos = Array.isArray(permissao) ? permissao : [permissao];

  return async (...args: unknown[]): Promise<IpcResponse<TResult>> => {
    const raw = extrairPayload(args);
    try {
      const session = auth.getCurrentSession();
      if (!session) {
        throw new UnauthorizedError('Sessão expirada ou não autenticada.');
      }

      for (const requisito of requisitos) {
        verificarRequisito(session, requisito);
      }

      const input = schema.parse(raw ?? {}) as Inferir<TSchema>;

      const ctx: RhContext = {
        session,
        empresaId: session.empresaConfigId ?? null,
        utilizadorId: session.id,
        podeVerSalarios:
          session.perfilNome === 'Administrador' ||
          rhPermissaoConcede(session.permissoes, RH_CHAVE_SALARIOS),
      };

      return ok(await fn(input, ctx));
    } catch (erro) {
      return mapearErro(erro);
    }
  };
}
