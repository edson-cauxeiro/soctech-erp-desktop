/**
 * @file tesouraria.api.ts
 * @description Cliente de API tipado da Tesouraria: contas bancárias,
 * lançamentos e sessões de caixa.
 */

import {
  ContaBancariaDto,
  ContaBancariaComSaldoDto,
  ContaBancariaCriarInput,
  ContaBancariaAtualizarInput,
  ContaContabilDisponivelDto,
  ResumoSaldoContaDto,
  MovimentoTesourariaDto,
  MovimentoTesourariaCriarInput,
  MovimentoTesourariaFilters,
  ResumoTesourariaDto,
  ConciliacaoLoteInput,
  SessaoCaixaDto,
  ApuramentoSessaoDto,
  AbrirSessaoCaixaInput,
  FecharSessaoCaixaInput,
  ValidacaoMeioPagamentoDto,
  TipoContaBancaria,
  EstadoSessaoCaixa,
  IpcResponse,
  PaginatedResult,
} from '../@types/electron';

const INDISPONIVEL = 'UNAVAILABLE';
const MSG = 'API de tesouraria não disponível.';

function semApi<T>(): IpcResponse<T> {
  return { success: false, error: { code: INDISPONIVEL, message: MSG } };
}

/**
 * Todos os métodos devolvem `IpcResponse` em vez de lançar excepções, para
 * que a UI possa mostrar a mensagem de regra de negócio (ex.: "a caixa não
 * tem sessão aberta") tal e qual veio do backend.
 */
export const tesourariaApi = {
  // =========================================================================
  // Contas bancárias
  // =========================================================================

  async listarContas(filters?: {
    empresaId?: string;
    tipo?: TipoContaBancaria;
    apenasAtivas?: boolean;
    search?: string;
  }): Promise<IpcResponse<PaginatedResult<ContaBancariaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.listarContas === 'function') {
      return window.api.tesouraria.listarContas(filters);
    }
    return semApi();
  },

  async listarContasComSaldos(filters?: {
    empresaId?: string;
    tipo?: TipoContaBancaria;
    apenasAtivas?: boolean;
    search?: string;
  }): Promise<IpcResponse<PaginatedResult<ContaBancariaComSaldoDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.listarContasComSaldos === 'function') {
      return window.api.tesouraria.listarContasComSaldos(filters);
    }
    return semApi();
  },

  async listarContasContabeisDisponiveis(
    empresaId: string,
    contaBancariaId?: string
  ): Promise<IpcResponse<ContaContabilDisponivelDto[]>> {
    if (
      typeof window !== 'undefined' &&
      typeof window.api?.tesouraria?.listarContasContabeisDisponiveis === 'function'
    ) {
      return window.api.tesouraria.listarContasContabeisDisponiveis(empresaId, contaBancariaId);
    }
    return semApi();
  },

  async obterConta(id: string): Promise<IpcResponse<ContaBancariaComSaldoDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.obterConta === 'function') {
      return window.api.tesouraria.obterConta(id);
    }
    return semApi();
  },

  async resumoSaldos(filters?: {
    empresaId?: string;
    tipo?: TipoContaBancaria;
    apenasAtivas?: boolean;
    search?: string;
  }): Promise<IpcResponse<ResumoSaldoContaDto[]>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.resumoSaldos === 'function') {
      return window.api.tesouraria.resumoSaldos(filters);
    }
    return semApi();
  },

  async criarConta(data: ContaBancariaCriarInput): Promise<IpcResponse<ContaBancariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.criarConta === 'function') {
      return window.api.tesouraria.criarConta(data);
    }
    return semApi();
  },

  async atualizarConta(id: string, data: ContaBancariaAtualizarInput): Promise<IpcResponse<ContaBancariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.atualizarConta === 'function') {
      return window.api.tesouraria.atualizarConta(id, data);
    }
    return semApi();
  },

  async ajustarSaldoInicial(
    id: string,
    saldoInicial: number,
    observacoes?: string
  ): Promise<IpcResponse<ContaBancariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.ajustarSaldoInicial === 'function') {
      return window.api.tesouraria.ajustarSaldoInicial(id, saldoInicial, observacoes);
    }
    return semApi();
  },

  async desativarConta(id: string): Promise<IpcResponse<ContaBancariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.desativarConta === 'function') {
      return window.api.tesouraria.desativarConta(id);
    }
    return semApi();
  },

  async reativarConta(id: string): Promise<IpcResponse<ContaBancariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.reativarConta === 'function') {
      return window.api.tesouraria.reativarConta(id);
    }
    return semApi();
  },

  async removerConta(id: string): Promise<IpcResponse<{ success: boolean }>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.removerConta === 'function') {
      return window.api.tesouraria.removerConta(id);
    }
    return semApi();
  },

  // =========================================================================
  // Lançamentos
  // =========================================================================

  async listarMovimentos(filters?: MovimentoTesourariaFilters): Promise<IpcResponse<PaginatedResult<MovimentoTesourariaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.listarMovimentos === 'function') {
      return window.api.tesouraria.listarMovimentos(filters);
    }
    return semApi();
  },

  async obterMovimento(id: string): Promise<IpcResponse<MovimentoTesourariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.obterMovimento === 'function') {
      return window.api.tesouraria.obterMovimento(id);
    }
    return semApi();
  },

  async resumo(filters?: MovimentoTesourariaFilters): Promise<IpcResponse<ResumoTesourariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.resumo === 'function') {
      return window.api.tesouraria.resumo(filters);
    }
    return semApi();
  },

  async criarMovimento(data: MovimentoTesourariaCriarInput): Promise<IpcResponse<MovimentoTesourariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.criarMovimento === 'function') {
      return window.api.tesouraria.criarMovimento(data);
    }
    return semApi();
  },

  async confirmarMovimento(id: string): Promise<IpcResponse<MovimentoTesourariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.confirmarMovimento === 'function') {
      return window.api.tesouraria.confirmarMovimento(id);
    }
    return semApi();
  },

  async estornarMovimento(id: string, motivo: string): Promise<IpcResponse<MovimentoTesourariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.estornarMovimento === 'function') {
      return window.api.tesouraria.estornarMovimento(id, { motivo });
    }
    return semApi();
  },

  async conciliarMovimento(
    id: string,
    conciliado: boolean,
    dataConciliacao?: string
  ): Promise<IpcResponse<MovimentoTesourariaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.conciliarMovimento === 'function') {
      return window.api.tesouraria.conciliarMovimento(id, conciliado, dataConciliacao);
    }
    return semApi();
  },

  async conciliarLote(data: ConciliacaoLoteInput): Promise<IpcResponse<{ atualizados: number }>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.conciliarLote === 'function') {
      return window.api.tesouraria.conciliarLote(data);
    }
    return semApi();
  },

  async validarMeioPagamento(data: {
    empresaId: string;
    meioPagamento: string;
    contaBancariaId: string;
  }): Promise<IpcResponse<ValidacaoMeioPagamentoDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.validarMeioPagamento === 'function') {
      return window.api.tesouraria.validarMeioPagamento(data);
    }
    return semApi();
  },

  // =========================================================================
  // Sessões de caixa
  // =========================================================================

  async listarSessoes(filters?: {
    empresaId?: string;
    contaCaixaId?: string;
    estado?: EstadoSessaoCaixa;
    dataInicio?: string | Date;
    dataFim?: string | Date;
  }): Promise<IpcResponse<PaginatedResult<SessaoCaixaDto>>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.listarSessoes === 'function') {
      return window.api.tesouraria.listarSessoes(filters);
    }
    return semApi();
  },

  async obterSessao(id: string): Promise<IpcResponse<SessaoCaixaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.obterSessao === 'function') {
      return window.api.tesouraria.obterSessao(id);
    }
    return semApi();
  },

  async obterSessaoAberta(contaCaixaId: string): Promise<IpcResponse<SessaoCaixaDto | null>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.obterSessaoAberta === 'function') {
      return window.api.tesouraria.obterSessaoAberta(contaCaixaId);
    }
    return semApi();
  },

  async apurarSessao(id: string): Promise<IpcResponse<ApuramentoSessaoDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.apurarSessao === 'function') {
      return window.api.tesouraria.apurarSessao(id);
    }
    return semApi();
  },

  async listarMovimentosSessao(id: string): Promise<IpcResponse<MovimentoTesourariaDto[]>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.listarMovimentosSessao === 'function') {
      return window.api.tesouraria.listarMovimentosSessao(id);
    }
    return semApi();
  },

  async abrirSessao(data: AbrirSessaoCaixaInput): Promise<IpcResponse<SessaoCaixaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.abrirSessao === 'function') {
      return window.api.tesouraria.abrirSessao(data);
    }
    return semApi();
  },

  async fecharSessao(id: string, data: FecharSessaoCaixaInput): Promise<IpcResponse<SessaoCaixaDto>> {
    if (typeof window !== 'undefined' && typeof window.api?.tesouraria?.fecharSessao === 'function') {
      return window.api.tesouraria.fecharSessao(id, data);
    }
    return semApi();
  },
};
