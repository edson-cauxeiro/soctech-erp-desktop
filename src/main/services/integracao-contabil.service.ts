/**
 * @file integracao-contabil.service.ts
 * @description Orquestrador de integração contabilística.
 *
 * Este serviço é o ponto de entrada **único** para os módulos de origem
 * (Vendas, Recibos, Compras, Tesouraria, RH) criarem lançamentos contabilísticos.
 *
 * Regras:
 *  - Chamado **depois** do commit do documento no módulo de origem.
 *  - Envolvido em `try/catch` no chamador: se o motor falhar, o erro é
 *    registado e o módulo de origem **continua** (não faz rollback).
 *  - Idempotência garantida pelo motor via `@@unique` no lançamento.
 */

import { MotorContabilizacaoService, motorContabilizacaoService } from './motor-contabilizacao.service';
import { LancamentoContabilService, lancamentoContabilService } from './lancamento-contabil.service';
import { BusinessRuleError } from '../utils/errors';

export interface ResultadoIntegracao {
  sucesso: boolean;
  pendente: boolean;
  lancamentoId?: string;
  numero?: number;
  mensagem: string;
}

export class IntegracaoContabilService {
  private motor: MotorContabilizacaoService;
  private lancamentoService: LancamentoContabilService;

  constructor(
    motor: MotorContabilizacaoService = motorContabilizacaoService,
    lancamentoService: LancamentoContabilService = lancamentoContabilService
  ) {
    this.motor = motor;
    this.lancamentoService = lancamentoService;
  }

  // ─── Vendas ────────────────────────────────────────────────────────────────

  /**
   * Contabiliza uma fatura de venda emitida.
   * Regra esperada: `VENDA_FATURA`.
   *
   * @param dados Deve conter: total, net, tax, base, taxPorTaxa, dataContabilistica, dataDocumento, descricao
   */
  async contabilizarFaturaVenda(params: {
    empresaId: string;
    faturaId: string;
    numeroFatura: string;
    dados: {
      total: number | string;
      net: number | string;
      tax: number | string;
      base?: number | string;
      taxPorTaxa?: Record<string, number | string>;
      dataContabilistica: string | Date;
      dataDocumento?: string | Date;
      descricao?: string;
      moeda?: string;
      taxaCambio?: number | string;
    };
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      const res = await this.motor.gerar({
        empresaId: params.empresaId,
        moduloOrigem: 'vendas',
        tipoOrigem: 'fatura',
        origemId: params.faturaId,
        dados: {
          ...params.dados,
          descricao: params.dados.descricao || `Fatura ${params.numeroFatura}`,
        },
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: !res.pendente,
        pendente: res.pendente,
        lancamentoId: res.lancamentoId,
        numero: res.numero,
        mensagem: res.mensagem,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao contabilizar fatura ${params.numeroFatura}: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Estorna a contabilização de uma fatura anulada.
   * Cria um lançamento de estorno ligado ao original.
   */
  async estornarFaturaVenda(params: {
    empresaId: string;
    faturaId: string;
    numeroFatura: string;
    dataEstorno: string | Date;
    descricao?: string;
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      // Procurar o lançamento original
      const original = await this.lancamentoService['prisma'].lancamentoContabil.findFirst({
        where: {
          empresaId: params.empresaId,
          moduloOrigem: 'vendas',
          tipoOrigem: 'fatura',
          origemId: params.faturaId,
          origem: 'integracao',
        },
        select: { id: true, numero: true, estado: true },
      });

      if (!original) {
        return {
          sucesso: false,
          pendente: false,
          mensagem: `Nenhum lançamento encontrado para fatura ${params.numeroFatura}.`,
        };
      }
      if (original.estado !== 'validado') {
        return {
          sucesso: false,
          pendente: false,
          mensagem: `Lançamento original não está validado (estado: ${original.estado}).`,
        };
      }

      const res = await this.lancamentoService.estornar(original.id, {
        dataContabilistica: params.dataEstorno,
        descricao: params.descricao || `Estorno de fatura ${params.numeroFatura}`,
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: true,
        pendente: false,
        lancamentoId: res.estorno.id,
        numero: res.estorno.numero ?? undefined,
        mensagem: `Estorno criado (lanc. ${res.estorno.numero ?? res.estorno.id}).`,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao estornar fatura ${params.numeroFatura}: ${(error as Error).message}`,
      };
    }
  }

  // ─── Recibos ───────────────────────────────────────────────────────────────

  /**
   * Contabiliza um recibo de venda (recebimento).
   * Regra esperada: `VENDA_RECIBO`.
   */
  async contabilizarReciboVenda(params: {
    empresaId: string;
    reciboId: string;
    numeroRecibo: string;
    dados: {
      total: number | string; // = PAID
      net?: number | string;
      tax?: number | string;
      base?: number | string;
      dataContabilistica: string | Date;
      dataDocumento?: string | Date;
      descricao?: string;
      moeda?: string;
      taxaCambio?: number | string;
    };
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      const res = await this.motor.gerar({
        empresaId: params.empresaId,
        moduloOrigem: 'vendas',
        tipoOrigem: 'recibo',
        origemId: params.reciboId,
        dados: {
          ...params.dados,
          paid: params.dados.total, // recibo = valor pago
          descricao: params.dados.descricao || `Recibo ${params.numeroRecibo}`,
        },
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: !res.pendente,
        pendente: res.pendente,
        lancamentoId: res.lancamentoId,
        numero: res.numero,
        mensagem: res.mensagem,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao contabilizar recibo ${params.numeroRecibo}: ${(error as Error).message}`,
      };
    }
  }

  // ─── Compras ───────────────────────────────────────────────────────────────

  /**
   * Contabiliza uma fatura de compra recebida.
   * Regra esperada: `COMPRA_FATURA`.
   */
  async contabilizarFaturaCompra(params: {
    empresaId: string;
    faturaId: string;
    numeroFatura: string;
    dados: {
      total: number | string;
      net: number | string;
      tax: number | string;
      base?: number | string;
      taxPorTaxa?: Record<string, number | string>;
      dataContabilistica: string | Date;
      dataDocumento?: string | Date;
      descricao?: string;
      moeda?: string;
      taxaCambio?: number | string;
    };
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      const res = await this.motor.gerar({
        empresaId: params.empresaId,
        moduloOrigem: 'compras',
        tipoOrigem: 'fatura',
        origemId: params.faturaId,
        dados: {
          ...params.dados,
          descricao: params.dados.descricao || `Fatura compra ${params.numeroFatura}`,
        },
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: !res.pendente,
        pendente: res.pendente,
        lancamentoId: res.lancamentoId,
        numero: res.numero,
        mensagem: res.mensagem,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao contabilizar fatura compra ${params.numeroFatura}: ${(error as Error).message}`,
      };
    }
  }

  // ─── Tesouraria ────────────────────────────────────────────────────────────

  /**
   * Contabiliza um movimento de tesouraria confirmado (entrada/saída/ajuste).
   * Regra esperada: `TESOURARIA_MOVIMENTO`.
   */
  async contabilizarMovimentoTesouraria(params: {
    empresaId: string;
    movimentoId: string;
    dados: {
      total: number | string;
      net?: number | string;
      tax?: number | string;
      tipo: 'entrada' | 'saida' | 'ajuste' | 'transferencia';
      dataContabilistica: string | Date;
      descricao?: string;
      moeda?: string;
      taxaCambio?: number | string;
    };
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      const res = await this.motor.gerar({
        empresaId: params.empresaId,
        moduloOrigem: 'tesouraria',
        tipoOrigem: 'movimento',
        origemId: params.movimentoId,
        dados: {
          ...params.dados,
          descricao: params.dados.descricao || `Movimento tesouraria ${params.movimentoId}`,
        },
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: !res.pendente,
        pendente: res.pendente,
        lancamentoId: res.lancamentoId,
        numero: res.numero,
        mensagem: res.mensagem,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao contabilizar movimento ${params.movimentoId}: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Estorna a contabilização de um movimento de tesouraria anulado.
   * Cria um lançamento de estorno ligado ao original.
   */
  async estornarMovimentoTesouraria(params: {
    empresaId: string;
    movimentoId: string;
    dataEstorno: string | Date;
    descricao?: string;
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      const original = await this.lancamentoService['prisma'].lancamentoContabil.findFirst({
        where: {
          empresaId: params.empresaId,
          moduloOrigem: 'tesouraria',
          tipoOrigem: 'movimento',
          origemId: params.movimentoId,
          origem: 'integracao',
        },
        select: { id: true, numero: true, estado: true },
      });

      if (!original) {
        return {
          sucesso: false,
          pendente: false,
          mensagem: `Nenhum lançamento encontrado para movimento ${params.movimentoId}.`,
        };
      }
      if (original.estado !== 'validado') {
        return {
          sucesso: false,
          pendente: false,
          mensagem: `Lançamento original não está validado (estado: ${original.estado}).`,
        };
      }

      const res = await this.lancamentoService.estornar(original.id, {
        dataContabilistica: params.dataEstorno,
        descricao: params.descricao || `Estorno de movimento ${params.movimentoId}`,
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: true,
        pendente: false,
        lancamentoId: res.estorno.id,
        numero: res.estorno.numero ?? undefined,
        mensagem: `Estorno criado (lanc. ${res.estorno.numero ?? res.estorno.id}).`,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao estornar movimento ${params.movimentoId}: ${(error as Error).message}`,
      };
    }
  }

  // ─── RH (via FinancasGateway real) ────────────────────────────────────────

  /**
   * Contabiliza processamento de salários (ordem de pagamento).
   * Regra esperada: `RH_PROCESSAMENTO`.
   *
   * O `RhFinancasGateway` real (substituto do stub) chama este método
   * depois de gravar a `RhOrdemPagamento`.
   */
  async contabilizarProcessamentoRH(params: {
    empresaId: string;
    ordemPagamentoId: string;
    dados: {
      total: number | string; // total líquido a pagar
      net?: number | string; // base salarial
      tax?: number | string; // IRS
      base?: number | string; // base SS
      discount?: number | string; // descontos vários
      dataContabilistica: string | Date;
      descricao?: string;
      moeda?: string;
      taxaCambio?: number | string;
    };
    utilizadorId?: string;
  }): Promise<ResultadoIntegracao> {
    try {
      const res = await this.motor.gerar({
        empresaId: params.empresaId,
        moduloOrigem: 'rh',
        tipoOrigem: 'processamento',
        origemId: params.ordemPagamentoId,
        dados: {
          ...params.dados,
          descricao: params.dados.descricao || `Processamento RH ${params.ordemPagamentoId}`,
        },
        utilizadorId: params.utilizadorId,
      });

      return {
        sucesso: !res.pendente,
        pendente: res.pendente,
        lancamentoId: res.lancamentoId,
        numero: res.numero,
        mensagem: res.mensagem,
      };
    } catch (error) {
      return {
        sucesso: false,
        pendente: true,
        mensagem: `Erro ao contabilizar processamento ${params.ordemPagamentoId}: ${(error as Error).message}`,
      };
    }
  }

  // ─── Utilitários ──────────────────────────────────────────────────────────

  /**
   * Reprocessa um erro de integração pendente.
   * Útil quando o utilizador corrige o mapeamento ou a regra.
   */
  async reprocessarErro(
    erroId: string,
    utilizadorId?: string,
    empresaId?: string
  ): Promise<ResultadoIntegracao> {
    const erro = await this.motor['prisma'].erroIntegracaoContabil.findUnique({
      where: empresaId ? { id: erroId, empresaId } : { id: erroId },
      select: {
        id: true,
        empresaId: true,
        moduloOrigem: true,
        tipoOrigem: true,
        origemId: true,
        origem: true,
        detalhes: true,
        resolvido: true,
      },
    });
    if (!erro) throw new BusinessRuleError(`Erro de integração ${erroId} não encontrado.`);
    if (erro.resolvido) throw new BusinessRuleError('Este erro já foi resolvido.');

    // Os detalhes originais deviam ter os `dados` passados ao motor.
    // Se não tiverem, não dá para reprocessar automaticamente.
    const detalhes = erro.detalhes ? JSON.parse(erro.detalhes) : null;
    if (!detalhes?.dados) {
      throw new BusinessRuleError('O erro não contém os dados originais para reprocessamento.');
    }

    const res = await this.motor.gerar({
      empresaId: erro.empresaId,
      moduloOrigem: erro.moduloOrigem,
      tipoOrigem: erro.tipoOrigem,
      origemId: erro.origemId,
      dados: detalhes.dados,
      utilizadorId,
    });

    if (!res.pendente) {
      await this.motor['prisma'].erroIntegracaoContabil.update({
        where: { id: erroId },
        data: { resolvido: true, resolvidoEm: new Date(), resolvidoPorId: utilizadorId },
      });
    }

    return {
      sucesso: !res.pendente,
      pendente: res.pendente,
      lancamentoId: res.lancamentoId,
      numero: res.numero,
      mensagem: res.mensagem,
    };
  }
}

export const integracaoContabilService = new IntegracaoContabilService();