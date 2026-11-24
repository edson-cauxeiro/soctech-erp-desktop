/**
 * @file relatorios.api.ts
 * @description Cliente de API dos relatórios (SPRINT 6, REL-01/REL-03).
 *
 * Invólucros finos sobre `window.api.relatorios`, como `fiscal.api.ts`. Sem
 * lógica de negócio: decidir quando gerar um relatório ou como reagir a um
 * erro é da UI, não do cliente. O único trabalho aqui é normalizar a ausência
 * de `window.api` (execução no browser durante desenvolvimento) num erro
 * explícito em vez de um `TypeError` difícil de ler.
 *
 * A distinção entre `read` e `exportar` está aqui documentada porque é a única
 * diferença que importa ao utilizador: ler um relatório não altera nada,
 * exportar escreve um ficheiro fora da aplicação.
 */

import type {
  IpcResponse,
  LinhaFluxoTesourariaDto,
  LinhaIvaDto,
  LinhaStockBaixoDto,
  LinhaTopArtigoDto,
  LinhaTopClienteDto,
  LinhaValorizacaoDto,
  LinhaFolhaVencimentoDto,
  ResumoIrtDto,
  ResumoInssDto,
  LinhaMapaFeriasDto,
  LinhaMapaAusenciasDto,
  LinhaDividasAbertasDto,
  LinhaCustoDepartamentoDto,
  NomeRelatorioDto,
  PeriodoRelatorioDto,
  RelatorioCompletoDto,
  ResumoExecutivoDto,
  SerieMensalDto,
} from '../@types/electron';

/** Erro de "não estamos dentro do Electron", para não parecer um bug de tipo. */
function semIpc(): IpcResponse<never> {
  return {
    success: false,
    error: {
      code: 'SEM_IPC',
      message: 'Módulo de relatórios indisponível: a aplicação não está a correr dentro do Electron.',
    },
  };
}

function disponivel(): boolean {
  return typeof window !== 'undefined' && Boolean(window.api?.relatorios);
}

/**
 * Resultado da exportação.
 *
 * Sem `success` próprio: o envelope do IPC (`IpcResponse.success`) já diz se o
 * pedido foi atendido. A UI decide com `cancelado`, e um `success` aqui
 *aninhava-se ao envelope do lado errado.
 */
export interface ResultadoExportacao {
  /** `true` quando o utilizador fechou o diálogo sem guardar. */
  cancelado?: boolean;
  caminho?: string;
  linhas?: number;
  formato?: string;
}

export const relatoriosApi = {
  /** Relatório inteiro num pedido só, para o ecrã carregar de uma vez. */
  async completo(
    periodo: PeriodoRelatorioDto & { limite?: number },
  ): Promise<IpcResponse<RelatorioCompletoDto>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.completo(periodo);
  },

  async resumo(periodo: PeriodoRelatorioDto): Promise<IpcResponse<ResumoExecutivoDto>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.resumo(periodo);
  },

  async vendasPorMes(periodo: PeriodoRelatorioDto): Promise<IpcResponse<SerieMensalDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.vendasPorMes(periodo);
  },

  async fluxoTesouraria(
    periodo: PeriodoRelatorioDto,
  ): Promise<IpcResponse<LinhaFluxoTesourariaDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.fluxoTesouraria(periodo);
  },

  async topArtigos(
    periodo: PeriodoRelatorioDto & { limite?: number },
  ): Promise<IpcResponse<LinhaTopArtigoDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.topArtigos(periodo);
  },

  async topClientes(
    periodo: PeriodoRelatorioDto & { limite?: number },
  ): Promise<IpcResponse<LinhaTopClienteDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.topClientes(periodo);
  },

  /**
   * Artigos abaixo do stock mínimo.
   *
   * Sem período: é o estado actual do armazém, não uma janela do passado.
   */
  async stockBaixo(): Promise<IpcResponse<LinhaStockBaixoDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.stockBaixo();
  },

  async valorizacao(limite?: number): Promise<IpcResponse<LinhaValorizacaoDto[]>> {
    if (!disponivel()) return semIpc();
    // O limite é opcional; sem ele, o serviço usa o valor por omissão.
    return limite === undefined
      ? window.api.relatorios.valorizacao({})
      : window.api.relatorios.valorizacao({ limite });
  },

  async ivaPorTaxa(periodo: PeriodoRelatorioDto): Promise<IpcResponse<LinhaIvaDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.ivaPorTaxa(periodo);
  },

  // RH-801 novos relatórios
  async folhaVencimentos(periodo: PeriodoRelatorioDto): Promise<IpcResponse<LinhaFolhaVencimentoDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.folhaVencimentos(periodo);
  },

  async resumoIrt(periodo: PeriodoRelatorioDto): Promise<IpcResponse<ResumoIrtDto>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.resumoIrt(periodo);
  },

  async resumoInss(periodo: PeriodoRelatorioDto): Promise<IpcResponse<ResumoInssDto>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.resumoInss(periodo);
  },

  async mapaFerias(periodo: PeriodoRelatorioDto): Promise<IpcResponse<LinhaMapaFeriasDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.mapaFerias(periodo);
  },

  async mapaAusencias(periodo: PeriodoRelatorioDto): Promise<IpcResponse<LinhaMapaAusenciasDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.mapaAusencias(periodo);
  },

  async dividasAbertas(periodo: PeriodoRelatorioDto): Promise<IpcResponse<LinhaDividasAbertasDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.dividasAbertas(periodo);
  },

  async custoDepartamento(periodo: PeriodoRelatorioDto): Promise<IpcResponse<LinhaCustoDepartamentoDto[]>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.custoDepartamento(periodo);
  },

  /**
   * Exporta para CSV ou Excel. Exige `relatorios: write`.
   *
   * Devolve `cancelado` em vez de erro quando o utilizador fecha o diálogo de
   * gravação: fechar um diálogo não é uma falha e a UI não deve mostrar um erro
   * vermelho por isso.
   */
  async exportar(
    periodo: PeriodoRelatorioDto & {
      relatorio: NomeRelatorioDto;
      formato: 'csv' | 'xlsx' | 'pdf';
      limite?: number;
    },
  ): Promise<IpcResponse<ResultadoExportacao>> {
    if (!disponivel()) return semIpc();
    return window.api.relatorios.exportar(periodo);
  },
};
