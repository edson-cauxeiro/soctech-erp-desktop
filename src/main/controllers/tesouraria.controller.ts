/**
 * @file tesouraria.controller.ts
 * @description Controlador IPC da Tesouraria: contas bancárias, lançamentos e
 * sessões de caixa.
 *
 * Todas as rotas exigem o módulo `financas` do RBAC. Consultar exige `read`;
 * tudo o que mexe em dinheiro exige `write`; eliminar uma conta exige
 * `delete`, porque é a operação mais destrutiva da tesouraria.
 */

import {
  contasBancariasService,
  ContasBancariasService,
} from '../services/contas-bancarias.service';
import { tesourariaService, TesourariaService } from '../services/tesouraria.service';
import { sessoesCaixaService, SessoesCaixaService } from '../services/sessoes-caixa.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class TesourariaController {
  private contas: ContasBancariasService;
  private tesouraria: TesourariaService;
  private sessoes: SessoesCaixaService;
  private auth: AuthService;

  constructor(
    contasSvc: ContasBancariasService = contasBancariasService,
    tesourariaSvc: TesourariaService = tesourariaService,
    sessoesSvc: SessoesCaixaService = sessoesCaixaService,
    auth: AuthService = authService
  ) {
    this.contas = contasSvc;
    this.tesouraria = tesourariaSvc;
    this.sessoes = sessoesSvc;
    this.auth = auth;
  }

  // ===========================================================================
  // Contas bancárias
  // ===========================================================================

  async listarContas(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar contas bancárias', () => this.contas.list(filters));
  }

  async listarContasComSaldos(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar contas com saldo', () => this.contas.listarComSaldos(filters));
  }

  async listarContasContabeisDisponiveis(
    empresaId: string,
    contaBancariaId?: string
  ): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar contas contabilísticas disponíveis', () =>
      this.contas.listarContasContabeisDisponiveis({ empresaId, contaBancariaId })
    );
  }

  async obterConta(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter conta bancária', () => this.contas.getComSaldo(id));
  }

  async resumoSaldos(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter resumo de saldos', () => this.contas.resumoSaldos(filters));
  }

  async criarConta(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'criar conta bancária', () => this.contas.criar(payload));
  }

  async atualizarConta(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'atualizar conta bancária', () => this.contas.atualizar(id, payload));
  }

  async ajustarSaldoInicial(
    id: string,
    saldoInicial: number,
    observacoes?: string
  ): Promise<IpcResponse<unknown>> {
    return this.com('write', 'ajustar saldo inicial', () =>
      this.contas.ajustarSaldoInicial(id, saldoInicial, observacoes)
    );
  }

  async desativarConta(id: string): Promise<IpcResponse<unknown>> {
    return this.com('write', 'desativar conta bancária', () => this.contas.desativar(id));
  }

  async reativarConta(id: string): Promise<IpcResponse<unknown>> {
    return this.com('write', 'reativar conta bancária', () => this.contas.reativar(id));
  }

  async removerConta(id: string): Promise<IpcResponse<unknown>> {
    return this.com('delete', 'eliminar conta bancária', () => this.contas.remover(id));
  }

  // ===========================================================================
  // Lançamentos
  // ===========================================================================

  async listarMovimentos(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar lançamentos', () => this.tesouraria.list(filters));
  }

  async obterMovimento(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter lançamento', () => this.tesouraria.get(id));
  }

  async resumo(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter resumo de tesouraria', () => this.tesouraria.resumo(filters));
  }

  async criarMovimento(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'criar lançamento', () => this.tesouraria.criar(payload));
  }

  async confirmarMovimento(id: string): Promise<IpcResponse<unknown>> {
    return this.com('write', 'confirmar lançamento', () => this.tesouraria.confirmar(id));
  }

  async estornarMovimento(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'estornar lançamento', () => this.tesouraria.estornar(id, payload));
  }

  async conciliarMovimento(
    id: string,
    conciliado: boolean,
    dataConciliacao?: string
  ): Promise<IpcResponse<unknown>> {
    return this.com('write', 'conciliar lançamento', () =>
      this.tesouraria.conciliar(id, conciliado, dataConciliacao ? new Date(dataConciliacao) : undefined)
    );
  }

  async conciliarLote(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'conciliar lançamentos em lote', () => this.tesouraria.conciliarLote(payload));
  }

  /**
   * Verificação usada pelo formulário de pagamento de facturas e recibos para
   * avisar antes de submeter se falta abrir a caixa.
   */
  async validarMeioPagamento(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'validar meio de pagamento', () =>
      this.tesouraria.validarMeioPagamento(payload as { empresaId: string; meioPagamento: string; contaBancariaId: string })
    );
  }

  // ===========================================================================
  // Sessões de caixa
  // ===========================================================================

  async listarSessoes(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar sessões de caixa', () => this.sessoes.list(filters));
  }

  async obterSessao(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter sessão de caixa', () => this.sessoes.get(id));
  }

  async obterSessaoAberta(contaCaixaId: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter sessão de caixa aberta', () => this.sessoes.getAberta(contaCaixaId));
  }

  async apurarSessao(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'apurar sessão de caixa', () => this.sessoes.apurar(id));
  }

  async listarMovimentosSessao(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar movimentos da sessão', () => this.sessoes.listarMovimentos(id));
  }

  async abrirSessao(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'abrir sessão de caixa', () => this.sessoes.abrir(payload));
  }

  async fecharSessao(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'fechar sessão de caixa', () => this.sessoes.fechar(id, payload));
  }

  // ===========================================================================
  // Auxiliares
  // ===========================================================================

  /**
   * Envolve a chamada de serviço na verificação de permissões e na
   * normalização de erros. Evita repetir o mesmo try/catch 20 vezes e
   * garante que nenhum canal devolve uma excepção crua ao renderer.
   */
  private async com(
    acao: 'read' | 'write' | 'delete',
    descricao: string,
    fn: () => Promise<unknown>
  ): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'financas', acao);
      return ok(await fn());
    } catch (error) {
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || `Erro ao ${descricao}.`);
    }
  }
}

export const tesourariaController = new TesourariaController();
