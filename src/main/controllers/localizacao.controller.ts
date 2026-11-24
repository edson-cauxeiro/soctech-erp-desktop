/**
 * @file localizacao.controller.ts
 * @description Controlador IPC para a estrutura de armazéns (RF07, TASK-023/028).
 *
 * Um método por canal, todos dentro da classe: o ficheiro anterior tinha
 * `tree`, `mostrarCapacidade` e `mostrarEstado` duplicados — uma cópia dentro
 * da classe e outra no topo do módulo, a usar `this` sem classe — e o router
 * registava os canais duas vezes, o que fazia o `ipcMain.handle` rebentar no
 * arranque.
 *
 * A validação Zod fica no service (é ele que faz `schema.parse`); aqui trata-se
 * apenas de sessão, permissões e mapear o erro para a resposta IPC.
 */

import { ZodError } from 'zod';
import { localizacaoService, LocalizacaoService } from '../services/localizacao.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission, requirePermission } from '../middlewares/rbac.middleware';

export class LocalizacaoController {
  private localizacaoService: LocalizacaoService;
  private auth: AuthService;

  constructor(
    svc: LocalizacaoService = localizacaoService,
    auth: AuthService = authService
  ) {
    this.localizacaoService = svc;
    this.auth = auth;
  }

  /** Erro de leitura → `VALIDATION_ERROR`; erro de negócio → o seu código. */
  private responder(erro: unknown, mensagem: string): IpcResponse<never> {
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
      ['vendas', 'read'],
      ['compras', 'read'],
    ]);
  }

  private exigirEscrita(): void {
    const session = this.auth.getCurrentSession();
    requirePermission(session, 'estoque', 'write');
  }

  /** Localizações de uma zona, com filtros opcionais de pesquisa e estado. */
  async list(rawFilters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.listarLocalizacoes(rawFilters));
    } catch (erro) {
      return this.responder(erro, 'Erro ao listar localizações.');
    }
  }

  /** Uma localização, com zona e área carregadas. */
  async get(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.obterPorId(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao obter localização.');
    }
  }

  /** Áreas de um armazém — primeiro degrau do filtro em cascata da UI. */
  async areas(armazemId: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.listarAreas(armazemId));
    } catch (erro) {
      return this.responder(erro, 'Erro ao listar áreas.');
    }
  }

  /** Zonas de uma área — segundo degrau do mesmo filtro. */
  async zonas(areaId: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.listarZonas(areaId));
    } catch (erro) {
      return this.responder(erro, 'Erro ao listar zonas.');
    }
  }

  /** Árvore `armazém → áreas → zonas → localizações`. */
  async tree(armazemId: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.obterArvore(armazemId));
    } catch (erro) {
      return this.responder(erro, 'Erro ao listar a estrutura do armazém.');
    }
  }

  /** Criar uma área num armazém — o primeiro degrau da árvore. */
  async criarArea(raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.criarArea(raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de criação de área inválidos.');
    }
  }

  /** Criar uma zona numa área — o segundo degrau da árvore. */
  async criarZona(raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.criarZona(raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de criação de zona inválidos.');
    }
  }

  /** Actualizar os dados editáveis de uma área. `armazemId` é imutável. */
  async actualizarArea(id: string, raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.actualizarArea(id, raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de actualização de área inválidos.');
    }
  }

  /** Desactivar (nunca apagar) uma área. Bloqueia se tiver zonas activas. */
  async desactivarArea(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.desactivarArea(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao desactivar a área.');
    }
  }

  /** Actualizar os dados editáveis de uma zona. `areaId` é imutável. */
  async actualizarZona(id: string, raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.actualizarZona(id, raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de actualização de zona inválidos.');
    }
  }

  /** Desactivar (nunca apagar) uma zona. Bloqueia se tiver localizações activas. */
  async desactivarZona(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.desactivarZona(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao desactivar a zona.');
    }
  }

  /** Criar uma localização dentro de uma zona. */
  async create(raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.criarLocalizacao(raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de criação de localização inválidos.');
    }
  }

  /** Actualizar uma localização. `zonaId` e `codigo` são imutáveis. */
  async update(id: string, raw: unknown): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.actualizarLocalizacao(id, raw));
    } catch (erro) {
      return this.responder(erro, 'Dados de actualização de localização inválidos.');
    }
  }

  /** Desactivar (nunca apagar): há stock e movimentos a apontar para aqui. */
  async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirEscrita();
      return ok(await this.localizacaoService.desactivarLocalizacao(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao desactivar localização.');
    }
  }

  /** Capacidade declarada vs. quantidade armazenada. */
  async mostrarCapacidade(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.mostrarCapacidade(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao consultar a capacidade.');
    }
  }

  /** Estado operacional: activa, bloqueada, pickable e putaway. */
  async mostrarEstado(id: string): Promise<IpcResponse<unknown>> {
    try {
      this.exigirLeitura();
      return ok(await this.localizacaoService.mostrarEstado(id));
    } catch (erro) {
      return this.responder(erro, 'Erro ao consultar o estado da localização.');
    }
  }
}

export const localizacaoController = new LocalizacaoController();
