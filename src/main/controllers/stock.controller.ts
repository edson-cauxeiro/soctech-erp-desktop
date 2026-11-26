/**
 * @file stock.controller.ts
 * @description Controlador IPC para Movimentação de Estoque, Transferências e Inventário (RF06).
 */

import { stockService, StockService } from '../services/stock.service';
import { authService, AuthService } from '../services/auth.service';
import { auditService, AuditService, RegistarAuditoriaParams } from '../services/audit.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requireAnyPermission, requirePermission, type UserSession } from '../middlewares/rbac.middleware';

export class StockController {
  private stockService: StockService;
  private auth: AuthService;
  private audit: AuditService;

  constructor(svc: StockService = stockService, auth: AuthService = authService, audit: AuditService = auditService) {
    this.stockService = svc;
    this.auth = auth;
    this.audit = audit;
  }

  async listMovimentos(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'read');

      const result = await this.stockService.listMovimentos(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar movimentos de stock.');
    }
  }

  async getStockArtigoArmazem(artigoId: string, armazemId: string): Promise<IpcResponse<unknown>> {
    try {
      const result = await this.stockService.getStockArtigoArmazem(artigoId, armazemId);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter stock do artigo no armazém.');
    }
  }

  async getStockTotalArtigo(artigoId: string): Promise<IpcResponse<unknown>> {
    try {
      const result = await this.stockService.getStockTotalArtigo(artigoId);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter stock total do artigo.');
    }
  }

  async createMovimento(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.stockService.createMovimento(payload, this.contexto(session));
      await this.registarAuditoria(session, {
        acao: 'criar',
        entidade: 'MovimentoStock',
        entidadeId: result.numero,
        dadosNovos: this.dadosMovimento(result),
        descricao: 'Criação de movimento de stock',
      });
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar movimento de stock.');
    }
  }

  async transferencia(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.stockService.transferenciaStock(payload, this.contexto(session));
      await this.registarAuditoria(session, {
        acao: 'criar',
        entidade: 'MovimentoStock',
        entidadeId: result.numero,
        dadosNovos: this.dadosMovimento(result),
        descricao: 'Transferência de stock entre armazéns',
      });
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao realizar transferência de stock.');
    }
  }

  async baixaVenda(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requireAnyPermission(session, [
        ['vendas', 'write'],
        ['estoque', 'write'],
      ]);

      const result = await this.stockService.processarBaixaVenda(payload, this.contexto(session));
      for (const movimento of result) {
        await this.registarAuditoria(session, {
          acao: 'criar',
          entidade: 'MovimentoStock',
          entidadeId: movimento.numero,
          dadosNovos: this.dadosMovimento(movimento),
          descricao: 'Saída de stock por venda',
        });
      }
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao processar baixa de stock de venda.');
    }
  }

  async listInventarios(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'read');

      const result = await this.stockService.listInventarios(filters);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar inventários.');
    }
  }

  async criarInventario(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.stockService.criarInventario(payload);
      await this.registarAuditoria(session, {
        acao: 'criar',
        entidade: 'InventarioContagem',
        entidadeId: result.numero,
        dadosNovos: { armazemId: result.armazemId },
        descricao: 'Criação de inventário de contagem',
      });
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar inventário.');
    }
  }

  async fecharInventario(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'write');

      const result = await this.stockService.fecharInventario(id, this.contexto(session));
      await this.registarAuditoria(session, {
        acao: 'submeter',
        entidade: 'InventarioContagem',
        entidadeId: result.numero,
        dadosNovos: { estado: result.estado },
        descricao: 'Fecho de inventário com lançamento de ajustes',
      });
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao fechar inventário.');
    }
  }

  /**
   * Estado de stock por artigo: quantidades actuais, limites, valor e situação,
   * paginado. Substitui `getAlertas`, que só devolvia as violações.
   */
  async getEstadoStock(filters?: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'estoque', 'read');

      const result = await this.stockService.getEstadoStock(filters, session?.empresaConfigId ?? undefined);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter o estado de stock.');
    }
  }

  // ===========================================================================
  // Auditoria e contexto
  // ===========================================================================

  /**
   * Contexto de quem executa a operação, apenas a partir da sessão.
   *
   * Um renderer comprometido podia enviar `criadoPorId` no payload: por isso o
   * autor vem sempre daqui e nunca do cliente. O `enderecoIp`/agente não existem
   * no canal IPC — fica `null`, que ao menos não inventa.
   */
  private contexto(session: UserSession | null): { criadoPorId: string | null } {
    return { criadoPorId: session?.id ?? null };
  }

  /** Preenche o log de auditoria com a sessão; best-effort (nunca lança). */
  private async registarAuditoria(
    session: UserSession | null,
    params: Omit<RegistarAuditoriaParams, 'empresaId' | 'utilizadorId'>,
  ): Promise<void> {
    await this.audit.registar({
      empresaId: session?.empresaConfigId ?? '',
      utilizadorId: session?.id ?? null,
      modulo: 'estoque',
      ...params,
    });
  }

  /** O que interessa da operação para o log — sem relação nem segredos. */
  private dadosMovimento(movimento: {
    numero: string;
    tipo: string;
    artigoId: string;
    quantidade: number | { toNumber: () => number; toString: () => string };
    armazemOrigemId: string | null;
    armazemDestinoId: string | null;
    documentoOrigem: string;
  }): Record<string, unknown> {
    return {
      numero: movimento.numero,
      tipo: movimento.tipo,
      artigoId: movimento.artigoId,
      quantidade: Number(movimento.quantidade),
      armazemOrigemId: movimento.armazemOrigemId,
      armazemDestinoId: movimento.armazemDestinoId,
      documentoOrigem: movimento.documentoOrigem,
    };
  }
}

export const stockController = new StockController();
