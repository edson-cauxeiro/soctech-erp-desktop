/**
 * @file lote.controller.ts
 * @description Controlador IPC para a gestão de lotes e validades (TASK-041).
 *
 * Segue o padrão do resto do domínio de stock: sessão, permissões e tradução
 * de erros. A validação Zod vive no service, para não se repetir entre o
 * ecrã e o IPC.
 */

import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { authService, AuthService } from '../services/auth.service';
import { loteService, LoteService } from '../services/lote.service';
import { requireAnyPermission, requirePermission } from '../middlewares/rbac.middleware';
import { ZodError } from 'zod';

export class LoteController {
  private loteService: LoteService;
  private auth: AuthService;

  constructor(loteSvc: LoteService = loteService, auth: AuthService = authService) {
    this.loteService = loteSvc;
    this.auth = auth;
  }

  private responder(erro: unknown, mensagem: string): IpcResponse<unknown> {
    if (erro instanceof ZodError) {
      return err('VALIDATION_ERROR', mensagem, erro.issues);
    }
    if (erro instanceof AppError) {
      return err(erro.code, erro.message, erro.details);
    }
    return err('INTERNAL_ERROR', (erro as Error)?.message || mensagem);
  }

  private exigirLeitura(): void {
    const session = this.auth.getCurrentSession();
    requireAnyPermission(session, [
      ['estoque', 'read'],
      ['compras', 'read'],
      ['vendas', 'read'],
    ]);
  }

  private exigirEscrita(): void {
    const session = this.auth.getCurrentSession();
    requirePermission(session, 'estoque', 'write');
  }

  /** Lista lotes, com filtros de artigo, pesquisa e estado de validade. */
  async list(rawFiltros?: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.loteService.listar(rawFiltros));
    } catch (erro) {
      return this.responder(erro, 'Erro ao listar lotes.');
    }
  }

  /** Um lote, com artigo e fornecedor. */
  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.loteService.obterPorId(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao obter lote.');
    }
  }

  /** Cria um lote para um artigo. */
  async create(raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.loteService.criar(raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de criação de lote inválidos.');
    }
  }

  /** Actualiza um lote. `artigoId` é imutável. */
  async update(id: string, raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.loteService.actualizar(id, raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de actualização de lote inválidos.');
    }
  }

  /** Elimina um lote sem saldo. */
  async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.loteService.remover(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao eliminar o lote.');
    }
  }
}

export const loteController = new LoteController();