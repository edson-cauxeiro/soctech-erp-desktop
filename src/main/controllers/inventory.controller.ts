/**
 * @file inventory.controller.ts
 * @description Controlador IPC das consultas de stock (EPIC 3, TASK-024/029).
 *
 * Só leitura: `consultar-saldo` responde "quanto existe", `consultar-stock`
 * responde "quanto existe e onde". Escrever stock passa por
 * `stock.controller.ts`, que o faz transaccionado com o livro-razão.
 */

import { ZodError } from 'zod';
import { inventoryService, InventoryService } from '../services/inventory.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission } from '../middlewares/rbac.middleware';
import { consultarSaldoSchema } from '../validators/inventory.validator';

export class InventoryController {
  private inventoryService: InventoryService;
  private auth: AuthService;

  constructor(svc: InventoryService = inventoryService, auth: AuthService = authService) {
    this.inventoryService = svc;
    this.auth = auth;
  }

  private exigirLeitura(): void {
    const session = this.auth.getCurrentSession();
    requireAnyPermission(session, [
      ['estoque', 'read'],
      ['vendas', 'read'],
      ['compras', 'read'],
    ]);
  }

  private responder(erro: unknown, mensagem: string): IpcResponse<never> {
    if (erro instanceof ZodError) {
      return err('VALIDATION_ERROR', mensagem, erro.issues);
    }
    if (erro instanceof AppError) {
      return err(erro.code, erro.message, erro.details);
    }
    return err('INTERNAL_ERROR', (erro as Error)?.message || mensagem);
  }

  /** Saldo servevel de um artigo (num armazém, ou em todos). */
  async consultarSaldo(raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      const data = consultarSaldoSchema.parse(raw);
      const disponivel = await this.inventoryService.consultarSaldo(
        data.artigoId,
        data.armazemId
      );
      return ok({ disponivel });
    } catch (erro) {
      return this.responder(erro, 'Erro ao consultar o saldo.');
    }
  }

  /** Stock por localização, paginado (TASK-029). */
  async consultarStock(raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.inventoryService.listarStock(raw));
    } catch (erro) {
      return this.responder(erro, 'Parâmetros de consulta de stock inválidos.');
    }
  }
}

export const inventoryController = new InventoryController();
