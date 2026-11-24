/**
 * @file fiscal.api.ts
 * @description Cliente de API do módulo Fiscal (SPRINT 5).
 *
 * wrappers finos sobre `window.api.fiscal`. Sem lógica de negócio: decidir
 * quando gerar um ficheiro ou como reagir a um erro é da UI, não do
 * cliente. O único trabalho aqui é normalizar a ausência de `window.api`
 * (execução no browser durante desenvolvimento) num erro explícito em vez
 * de um `TypeError` difícil de ler.
 */

import type {
  ConformidadeAgtDto,
  FicheiroAgtDto,
  IpcResponse,
  ListaAuditoriaDto,
  PeriodoFiscalDto,
  ResultadoGerarSaftDto,
  ResultadoValidarSaftDto,
  SoftwareAgtDto,
  EstadoSubmissaoAgtDto,
  SubmissaoAgtDto,
  VerificacaoIntegridadeDto,
} from '../@types/electron';

/** Erro de "não estamos dentro do Electron", para não parecer um bug de tipo. */
function semIpc(): IpcResponse<never> {
  return {
    success: false,
    error: {
      code: 'SEM_IPC',
      message: 'Módulo fiscal indisponível: a aplicação não está a correr dentro do Electron.',
    },
  };
}

function disponivel(): boolean {
  return typeof window !== 'undefined' && Boolean(window.api?.fiscal);
}

export const fiscalApi = {
  // ===========================================================================
  // SAF-T
  // ===========================================================================

  /** Gera o ficheiro SAF-T e grava-o em `userData/fiscal`. Exige `write`. */
  async gerarSaft(periodo: PeriodoFiscalDto): Promise<IpcResponse<ResultadoGerarSaftDto>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.gerarSaft(periodo);
  },

  /** Valida sem gravar. Exige apenas `read`. */
  async validarSaft(periodo: PeriodoFiscalDto): Promise<IpcResponse<ResultadoValidarSaftDto>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.validarSaft(periodo);
  },

  // ===========================================================================
  // Conformidade AGT
  // ===========================================================================

  /**
   * Gera o ficheiro AGT e regista-o no rastreio local.
   *
   * Não submete nada à AGT: a submissão é feita pelo software certificado do
   * operador, fora desta aplicação.
   */
  async gerarAgt(
    periodo: PeriodoFiscalDto,
    software: SoftwareAgtDto,
    nomeFicheiro?: string,
  ): Promise<IpcResponse<FicheiroAgtDto>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.gerarAgt({ ...periodo, software, nomeFicheiro });
  },

  /** Regista o que o operador reportou do software certificado. */
  async registarRespostaAgt(params: {
    submissaoId: string;
    estado: EstadoSubmissaoAgtDto;
    respostaAgt: string;
    hashRecebido: string;
  }): Promise<IpcResponse<{ submissaoId: string; estado: EstadoSubmissaoAgtDto }>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.registarRespostaAgt(params);
  },

  /** Histórico de ficheiros AGT. */
  async listarSubmissoes(filtros: {
    empresaId: string;
    estado?: EstadoSubmissaoAgtDto;
    limite?: number;
  }): Promise<IpcResponse<SubmissaoAgtDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.listarSubmissoes(filtros);
  },

  // ===========================================================================
  // Auditoria
  // ===========================================================================

  /** Lista o log de auditoria. Paginado por cursor. */
  async listarAuditoria(filtros: {
    empresaId: string;
    entidade?: string;
    entidadeId?: string;
    utilizadorId?: string;
    acao?: string;
    severidade?: 'info' | 'aviso' | 'critico';
    modulo?: string;
    desde?: string;
    ate?: string;
    cursor?: string;
    limite?: number;
    incluirArquivados?: boolean;
  }): Promise<IpcResponse<ListaAuditoriaDto>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.listarAuditoria(filtros);
  },

  /** Verifica a integridade do log por hash. */
  async verificarIntegridade(filtros: {
    empresaId: string;
    desde?: string;
    ate?: string;
    limite?: number;
  }): Promise<IpcResponse<VerificacaoIntegridadeDto>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.verificarIntegridade(filtros);
  },

  /** Resumo do log por acção e por severidade. */
  async resumoAuditoria(filtros: { empresaId: string; desde?: string; ate?: string }): Promise<
    IpcResponse<{ porAcao: Record<string, number>; porSeveridade: Record<string, number> }>
  > {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.resumoAuditoria(filtros);
  },

  /** Arquiva um registo de auditoria (soft-delete). */
  async arquivarAuditoria(id: string): Promise<IpcResponse<{ success: boolean }>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.arquivarAuditoria({ id });
  },

  /** Desarquiva um registo de auditoria. */
  async desarquivarAuditoria(id: string): Promise<IpcResponse<{ success: boolean }>> {
    if (!disponivel()) return semIpc();
    return window.api.fiscal.desarquivarAuditoria({ id });
  },
};

export type { ConformidadeAgtDto };