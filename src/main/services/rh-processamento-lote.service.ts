/**
 * @file rh-processamento-lote.service.ts
 * @description Service de processamento em lote (RH-406).
 *
 * Orquestra o processamento de vários funcionários para um período/tipo:
 * 1. Carrega os dados uma única vez (loader RH-403) e valida o período.
 * 2. Adquire o *lock* lógico por período × tipo (ver §5.1 da spec).
 * 3. Cria o cabeçalho `RhLoteProcessamento` em estado `EM_EXECUCAO`.
 * 4. Executa, **por funcionário**, uma transacção atómica reutilizando o
 *    `executarFuncionario` do serviço de execução (RH-405). Uma falha num
 *    funcionário é registada no relatório e não impede os restantes.
 * 5. Emite eventos de progresso (callback → IPC `rh:processamento:progresso`).
 * 6. Fecha o lote (`CONCLUIDO`/`CONCLUIDO_COM_ERROS`) com totais e relatório.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient, RhTipoProcessamento } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  rhProcessamentoLoaderService,
  type RhProcessamentoLoaderService,
} from './rh-processamento-loader.service';
import {
  rhProcessamentoExecucaoService,
  type FormaPagamentoProcessamento,
  type RhProcessamentoExecucaoService,
} from './rh-processamento-execucao.service';
import {
  carregarParametrosProcessamento,
  type ParametrosProcessamento,
} from './rh-processamento-entrada';
import {
  RhBusinessRuleError,
  RhConflictError,
  RhNotFoundError,
  RH_ERROR_CODES,
} from '../utils/rh-errors';

export interface ProcessarLoteInput {
  empresaId: string | null;
  utilizadorId?: string | null;
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  tipoProcessamento: string;
  incluirFimContrato?: boolean;
  funcionarioIds: string[];
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  forcarReprocessamento?: boolean;
  formaPagamento?: FormaPagamentoProcessamento;
  contaBancariaId?: string;
  referenciaPagamento?: string;
}

/** Progresso emitido após cada funcionário processado. */
export interface ProgressoLote {
  total: number;
  feitos: number;
  funcionarioId: string;
  estado: 'SUCESSO' | 'ERRO';
}

export interface ProcessarLoteDetalhe {
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  sucesso: boolean;
  erro?: string;
  processamentoId?: string;
  liquido?: string;
}

export interface ProcessarLoteErro {
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  erro: string;
}

export interface ProcessarLoteResultado {
  loteId: string;
  totalFuncionarios: number;
  totalSucesso: number;
  totalErros: number;
  totalLiquido: string;
  detalhes: ProcessarLoteDetalhe[];
  relatorioErros: ProcessarLoteErro[];
}

export type OnProgressoLote = (progresso: ProgressoLote) => void;

export class RhProcessamentoLoteService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService,
    private readonly execucao: RhProcessamentoExecucaoService = rhProcessamentoExecucaoService,
    private readonly loader: RhProcessamentoLoaderService = rhProcessamentoLoaderService,
    private readonly carregarParametros: (
      empresaId: string,
      data: Date,
    ) => Promise<ParametrosProcessamento> = carregarParametrosProcessamento,
  ) {}

  /**
   * Processa vários funcionários para o mesmo período/tipo. Uma falha por
   * funcionário é isolada (transacção própria) e não interrompe o lote.
   */
  async processarLote(
    input: ProcessarLoteInput,
    onProgresso?: OnProgressoLote,
  ): Promise<ProcessarLoteResultado> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const tipo = input.tipoProcessamento as RhTipoProcessamento;

    if (!input.funcionarioIds || input.funcionarioIds.length === 0) {
      throw new RhBusinessRuleError('Selecione pelo menos um funcionário para processar.');
    }
    if (tipo === 'FIM_CONTRATO') {
      throw new RhBusinessRuleError('Fim de contrato só pode ser processado individualmente.', {
        code: RH_ERROR_CODES.VALIDACAO,
      });
    }

    const dataProcessamento = new Date(input.dataProcessamento);
    const dataLimiteFaltasHE = new Date(input.dataLimiteFaltasHE);

    // 1. Dados em bloco (uma só leitura, independentemente do nº de funcionários)
    const loaderData = await this.loader.carregar({
      empresaId,
      ano: input.ano,
      mes: input.mes,
      periodoCodigo: input.periodoCodigo,
      funcionarioIds: input.funcionarioIds,
      incluirFimContrato: input.incluirFimContrato,
      dataLimiteFaltasHE: input.dataLimiteFaltasHE,
      dataProcessamento,
      tipoProcessamento: input.tipoProcessamento,
    });

    const periodo = loaderData.periodo;
    if (!periodo) throw new RhNotFoundError('Período não encontrado para processamento.');
    if (periodo.estado !== 'ABERTO') {
      throw new RhBusinessRuleError(`Período ${periodo.estado.toLowerCase()} — não permite processar.`, {
        code: RH_ERROR_CODES.PERIODO_FECHADO,
      });
    }

    // 2. Lock lógico: um lote em execução por período × tipo.
    await this.verificarLock(periodo.id, tipo);

    const parametros = await this.carregarParametros(empresaId, dataProcessamento);

    // 3. Cabeçalho do lote
    const lote = await this.prisma.rhLoteProcessamento.create({
      data: {
        periodoId: periodo.id,
        modo: 'LOTE',
        operacao: 'PROCESSAR',
        tipos: [tipo],
        parametros: {
          ano: input.ano,
          mes: input.mes,
          periodoCodigo: input.periodoCodigo,
          tipoProcessamento: tipo,
          incluirFimContrato: input.incluirFimContrato ?? false,
          forcarReprocessamento: input.forcarReprocessamento ?? false,
          dataProcessamento: dataProcessamento.toISOString(),
          dataLimiteFaltasHE: dataLimiteFaltasHE.toISOString(),
        },
        estado: 'EM_EXECUCAO',
        totalFuncionarios: input.funcionarioIds.length,
        criadoPorId: input.utilizadorId ?? null,
      },
    });

    const porId = new Map(loaderData.funcionarios.map((f) => [f.funcionario.id, f] as const));

    const detalhes: ProcessarLoteDetalhe[] = [];
    const relatorioErros: ProcessarLoteErro[] = [];
    let totalSucesso = 0;
    let totalErros = 0;
    let feitos = 0;
    let totalLiquido = new Prisma.Decimal(0);

    // 4. Um funcionário de cada vez, cada um na sua transacção.
    for (const funcionarioId of input.funcionarioIds) {
      const func = porId.get(funcionarioId);
      const codigo = func?.funcionario.codigo ?? null;
      const nome = func?.funcionario.nome ?? null;
      let sucesso = false;

      try {
        const res = await this.execucao.executarFuncionario({
          empresaId,
          utilizadorId: input.utilizadorId ?? null,
          loaderData,
          funcionarioId,
          tipo,
          dataProcessamento,
          dataLimiteFaltasHE,
          forcarReprocessamento: input.forcarReprocessamento,
          formaPagamento: input.formaPagamento,
          referenciaPagamento: input.referenciaPagamento ?? null,
          parametros,
          loteId: lote.id,
          modo: 'LOTE',
        });

        sucesso = true;
        totalSucesso += 1;
        totalLiquido = totalLiquido.plus(new Prisma.Decimal(res.liquido));
        detalhes.push({
          funcionarioId,
          codigo,
          nome,
          sucesso: true,
          processamentoId: res.processamentoId,
          liquido: res.liquido,
        });
      } catch (e) {
        totalErros += 1;
        const erro = e instanceof Error ? e.message : 'Erro inesperado no processamento.';
        detalhes.push({ funcionarioId, codigo, nome, sucesso: false, erro });
        relatorioErros.push({ funcionarioId, codigo, nome, erro });
      } finally {
        feitos += 1;
        onProgresso?.({
          total: input.funcionarioIds.length,
          feitos,
          funcionarioId,
          estado: sucesso ? 'SUCESSO' : 'ERRO',
        });
      }
    }

    // 5. Fecho do lote
    const estadoFinal = totalErros > 0 ? 'CONCLUIDO_COM_ERROS' : 'CONCLUIDO';
    await this.prisma.rhLoteProcessamento.update({
      where: { id: lote.id },
      data: {
        estado: estadoFinal,
        totalSucesso,
        totalErros,
        totalLiquido,
        relatorioErros: relatorioErros as unknown as Prisma.InputJsonValue,
        concluidoEm: new Date(),
      },
    });

    // 6. Auditoria agregada
    await this.audit.registarOperacao({
      empresaId,
      utilizadorId: input.utilizadorId ?? null,
      acao: 'criar',
      entidade: 'RhLoteProcessamento',
      entidadeId: lote.id,
      modulo: 'rh',
      descricao: `Processamento em lote ${tipo} (${input.ano}/${input.mes}) — ${totalSucesso} sucesso(s), ${totalErros} erro(s).`,
      severidade: totalErros > 0 ? 'aviso' : 'info',
      dadosNovos: {
        tipo,
        totalFuncionarios: input.funcionarioIds.length,
        totalSucesso,
        totalErros,
        totalLiquido: totalLiquido.toFixed(2),
      },
    });

    return {
      loteId: lote.id,
      totalFuncionarios: input.funcionarioIds.length,
      totalSucesso,
      totalErros,
      totalLiquido: totalLiquido.toFixed(2),
      detalhes,
      relatorioErros,
    };
  }

  /** Impede dois lotes concorrentes do mesmo período e tipo (lock lógico). */
  private async verificarLock(periodoId: string, tipo: RhTipoProcessamento): Promise<void> {
    const emExecucao = await this.prisma.rhLoteProcessamento.findMany({
      where: { periodoId, estado: 'EM_EXECUCAO' },
      select: { id: true, tipos: true },
    });
    const conflito = emExecucao.some(
      (l) => Array.isArray(l.tipos) && (l.tipos as unknown[]).includes(tipo),
    );
    if (conflito) {
      throw new RhConflictError(
        `Já existe um processamento em lote de ${tipo} em execução neste período.`,
        { code: RH_ERROR_CODES.LOTE_EM_EXECUCAO },
      );
    }
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhProcessamentoLoteService = new RhProcessamentoLoteService();
