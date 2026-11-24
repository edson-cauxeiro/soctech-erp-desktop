/**
 * @file rh-processamento-execucao.service.ts
 * @description Execução de processamento individual (RH-405).
 *
 * Confirma um processamento (já simulado/preparado) de forma atómica:
 * 1. Recarrega os dados (loader RH-403) e os parâmetros fiscais vigentes.
 * 2. Valida o período e a unicidade (funcionário × período × tipo).
 * 3. Calcula com o motor puro (Fase 3) — a simulação e a execução usam o
 *    mesmo builder de entrada, pelo que o resultado é idêntico.
 * 4. Grava, numa única transacção: cabeçalho, itens, marca de alterações
 *    mensais / prestações / ausências / horas extra, recibo (número sequencial)
 *    e pagamento pendente.
 * 5. Fora da transacção, tenta criar o lançamento contabilístico via
 *    `FinancasGateway`. Enquanto a integração não existir, a indisponibilidade
 *    é registada como aviso (best-effort) — ver ADR-010.
 *
 * Regras:
 * - Unicidade: não processa o mesmo (funcionário, período, tipo) sem
 *   `forcarReprocessamento`; nesse caso cria uma nova sequência.
 * - Atomicidade: qualquer falha dentro da transacção faz rollback total.
 * - Isolamento por empresa (ADR-009).
 *
 * O método `executarFuncionario` é partilhado com o processamento em lote
 * (RH-406): o lote carrega os dados uma única vez e invoca-o por funcionário,
 * preservando a transacção (e o rollback) por funcionário.
 */

import { Prisma } from '@prisma/client';
import type {
  PrismaClient,
  RhTipoProcessamento,
  RhOrigemItem,
  RhModoProcessamento,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  rhProcessamentoLoaderService,
  type DadosProcessamento,
  type RhProcessamentoLoaderService,
} from './rh-processamento-loader.service';
import { calcular } from './rh/calculo/calculadoras/engine';
import type { AjusteManual, OrigemItem } from './rh/calculo/engine/types';
import { d, round2, type MoneyInput } from './rh/calculo/engine/decimal';
import {
  carregarParametrosProcessamento,
  construirEntradaCalculo,
  type ParametrosProcessamento,
} from './rh-processamento-entrada';
import {
  rhProcessamentoManualService,
  type RhProcessamentoManualService,
} from './rh-processamento-manual.service';
import type { AjusteManualInput } from '../validators/rh.validator';
import { financasGateway as defaultGateway, type FinancasGateway } from './rh-financas-gateway';
import {
  FinancasIndisponivelError,
  RhBusinessRuleError,
  RhConflictError,
  RhNotFoundError,
  RH_ERROR_CODES,
} from '../utils/rh-errors';

const SEQUENCIA_RECIBO = 'RECIBO';

export type FormaPagamentoProcessamento = 'TRANSFERENCIA' | 'NUMERARIO' | 'CHEQUE';

export interface ProcessarIndividualInput {
  empresaId: string | null;
  utilizadorId?: string | null;
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  tipoProcessamento: string;
  incluirFimContrato?: boolean;
  diasProcessados?: number;
  dataLimiteFaltasHE: string | Date;
  dataProcessamento: string | Date;
  funcionarioId: string;
  forcarReprocessamento?: boolean;
  formaPagamento?: FormaPagamentoProcessamento;
  contaBancariaId?: string;
  referenciaPagamento?: string;
  /** Ajustes manuais (RF-PRO-03) introduzidos antes de confirmar (RH-408). */
  ajustesManuais?: AjusteManualInput[];
}

export interface ProcessarIndividualResultado {
  sucesso: boolean;
  processamentoId: string;
  tipo: string;
  sequencia: number;
  reciboId: string;
  serieRecibo: string;
  numeroRecibo: number;
  pagamentoId: string;
  liquido: string;
  totalRemuneracoes: string;
  totalDescontos: string;
  totalEncargos: string;
  avisos: string[];
  lancamentoContabilId?: string;
}

/**
 * Argumentos de execução de um funcionário a partir de dados já carregados.
 * Usado pelo `processarIndividual` (RH-405) e pelo `processarLote` (RH-406).
 */
export interface ExecutarFuncionarioArgs {
  empresaId: string;
  utilizadorId: string | null;
  loaderData: DadosProcessamento;
  funcionarioId: string;
  tipo: RhTipoProcessamento;
  dataProcessamento: Date;
  dataLimiteFaltasHE: Date;
  diasProcessados?: number;
  forcarReprocessamento?: boolean;
  formaPagamento?: FormaPagamentoProcessamento;
  referenciaPagamento?: string | null;
  parametros: ParametrosProcessamento;
  /** Ajustes manuais já normalizados para o motor (RH-408). */
  ajustesManuais?: AjusteManual[];
  /** Lote de origem (RH-406); nulo no modo individual. */
  loteId?: string | null;
  /** Modo persistido no cabeçalho; por omissão `INDIVIDUAL`. */
  modo?: RhModoProcessamento;
}

/** Mapeia a origem do motor para o enum persistido (`RhOrigemItem`). */
function mapearOrigem(origem: OrigemItem): RhOrigemItem {
  switch (origem) {
    case 'AUSENCIA':
      return 'SISTEMA';
    case 'HORA_EXTRA':
    case 'CALCULADO':
      return 'AUTOMATICO';
    default:
      return origem;
  }
}

/** Converte um valor do motor para `Prisma.Decimal`. */
function toDec(value: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(d(value).toFixed(4));
}

export class RhProcessamentoExecucaoService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService,
    private readonly gateway: FinancasGateway = defaultGateway,
    private readonly loader: RhProcessamentoLoaderService = rhProcessamentoLoaderService,
    private readonly carregarParametros: (
      empresaId: string,
      data: Date,
    ) => Promise<ParametrosProcessamento> = carregarParametrosProcessamento,
    private readonly manual: RhProcessamentoManualService = rhProcessamentoManualService,
  ) {}

  /**
   * Processa um único funcionário. Idempotente por (funcionário, período, tipo):
   * repetir sem `forcarReprocessamento` resulta em `RH_JA_PROCESSADO`.
   */
  async processarIndividual(input: ProcessarIndividualInput): Promise<ProcessarIndividualResultado> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const dataProcessamento = new Date(input.dataProcessamento);

    // 1. Recarregar dados (loader RH-403) e parâmetros fiscais.
    const loaderData = await this.loader.carregar({
      empresaId,
      ano: input.ano,
      mes: input.mes,
      periodoCodigo: input.periodoCodigo,
      funcionarioIds: [input.funcionarioId],
      incluirFimContrato: input.incluirFimContrato,
      dataLimiteFaltasHE: input.dataLimiteFaltasHE,
      dataProcessamento,
      tipoProcessamento: input.tipoProcessamento,
    });
    const parametros = await this.carregarParametros(empresaId, dataProcessamento);

    return this.executarFuncionario({
      empresaId,
      utilizadorId: input.utilizadorId ?? null,
      loaderData,
      funcionarioId: input.funcionarioId,
      tipo: input.tipoProcessamento as RhTipoProcessamento,
      dataProcessamento,
      dataLimiteFaltasHE: new Date(input.dataLimiteFaltasHE),
      diasProcessados: input.diasProcessados,
      forcarReprocessamento: input.forcarReprocessamento,
      formaPagamento: input.formaPagamento,
      referenciaPagamento: input.referenciaPagamento ?? null,
      parametros,
      ajustesManuais: this.manual.normalizar(input.ajustesManuais),
      loteId: null,
      modo: 'INDIVIDUAL',
    });
  }

  /**
   * Executa um processamento atómico para um funcionário, a partir de dados já
   * carregados (partilhado pelo modo individual e pelo lote RH-406). Qualquer
   * falha dentro da transacção faz rollback apenas deste funcionário.
   */
  async executarFuncionario(args: ExecutarFuncionarioArgs): Promise<ProcessarIndividualResultado> {
    const {
      empresaId,
      loaderData,
      funcionarioId,
      tipo,
      dataProcessamento,
      dataLimiteFaltasHE,
      parametros,
    } = args;

    const periodo = loaderData.periodo;
    if (!periodo) throw new RhNotFoundError('Período não encontrado para processamento.');
    if (periodo.estado !== 'ABERTO') {
      throw new RhBusinessRuleError(`Período ${periodo.estado.toLowerCase()} — não permite processar.`, {
        code: RH_ERROR_CODES.PERIODO_FECHADO,
      });
    }

    const fd = loaderData.funcionarios.find((f) => f.funcionario.id === funcionarioId);
    if (!fd) {
      throw new RhBusinessRuleError('Funcionário não elegível para processamento neste período.');
    }
    if (!fd.contrato) {
      throw new RhBusinessRuleError('Funcionário sem contrato activo para processar.', {
        code: RH_ERROR_CODES.SEM_CONTRATO_ATIVO,
      });
    }

    // 2. Cálculo (mesmo builder da simulação)
    const ajustesManuais = args.ajustesManuais ?? [];
    const entrada = construirEntradaCalculo({
      loaderData,
      funcionarioId,
      tipo,
      parametros,
      diasProcessados: args.diasProcessados,
      ajustesManuais: ajustesManuais.length > 0 ? ajustesManuais : undefined,
    });
    const resultado = calcular(entrada);

    if (resultado.erros.length > 0) {
      throw new RhBusinessRuleError(resultado.erros.join(' '), { code: RH_ERROR_CODES.LIQUIDO_NEGATIVO });
    }
    if (resultado.totais.liquido.isNegative()) {
      throw new RhBusinessRuleError('O valor líquido calculado é negativo.', {
        code: RH_ERROR_CODES.LIQUIDO_NEGATIVO,
      });
    }

    // 3. Unicidade
    const existente = await this.prisma.rhProcessamento.findFirst({
      where: {
        funcionarioId,
        periodoId: periodo.id,
        tipo,
        estado: 'PROCESSADO',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existente && !args.forcarReprocessamento) {
      throw new RhConflictError(
        `O funcionário já foi processado neste período para ${tipo}. Use reprocessamento para substituir.`,
        { code: RH_ERROR_CODES.JA_PROCESSADO, processamentoId: existente.id },
      );
    }

    const configuracao = loaderData.configuracao;
    const serie = configuracao?.serieRecibo || 'RV';
    const moeda = fd.contrato.moeda || 'AOA';
    const formaPagamento: FormaPagamentoProcessamento = args.formaPagamento ?? 'TRANSFERENCIA';

    const snapshot = {
      tipo,
      ano: periodo.ano,
      mes: periodo.mes,
      parametros,
      entrada,
      origemProcessamentoId: existente?.id ?? null,
    };

    // 4. Gravação atómica
    const gravado = await this.prisma.$transaction(async (tx) => {
      const sequencia =
        (await tx.rhProcessamento.count({
          where: { funcionarioId, periodoId: periodo.id, tipo },
        })) + 1;

      const processamento = await tx.rhProcessamento.create({
        data: {
          loteId: args.loteId ?? null,
          periodoId: periodo.id,
          funcionarioId,
          contratoId: fd.contrato?.id ?? null,
          tipo,
          sequencia,
          modo: args.modo ?? 'INDIVIDUAL',
          manual: ajustesManuais.length > 0,
          estado: 'PROCESSADO',
          dataProcessamento,
          dataLimiteFaltasHE,
          diasProcessados: args.diasProcessados ?? loaderData.baseDiasMes ?? 30,
          moeda,
          totalRemuneracoes: toDec(resultado.totais.remuneracoes),
          totalDescontos: toDec(resultado.totais.descontos),
          totalEncargos: toDec(resultado.totais.encargos),
          liquido: toDec(resultado.totais.liquido),
          baseINSS: toDec(resultado.bases.inss),
          baseIRT: toDec(resultado.bases.irt),
          inssTrabalhador: toDec(resultado.inss.inssTrabalhador),
          inssPatronal: toDec(resultado.inss.inssPatronal),
          irt: toDec(resultado.irt.valor),
          irtEscalaoId: resultado.irt.escalaoId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          avisos: resultado.avisos,
          criadoPorId: args.utilizadorId,
        },
      });

      const alteracoes = loaderData.alteracoesMensais.get(funcionarioId) ?? [];
      const alteracaoPorRubrica = new Map(alteracoes.map((a) => [a.rubricaId, a] as const));

      const itensCriados: Array<{ id: string; alteracaoId: string | null }> = [];
      let ordem = 0;
      for (const item of resultado.itens) {
        const alteracao =
          item.origem === 'ALTERACAO_MENSAL' && item.rubricaId
            ? alteracaoPorRubrica.get(item.rubricaId)
            : undefined;

        const criado = await tx.rhProcessamentoItem.create({
          data: {
            processamentoId: processamento.id,
            rubricaId: item.rubricaId ?? null,
            codigo: item.codigo ?? 'MANUAL',
            descricao: item.descricao,
            tipo: item.tipo,
            origem: mapearOrigem(item.origem),
            quantidade: toDec(item.quantidade),
            valorUnitario: toDec(item.valorUnitario),
            valor: toDec(item.valorTotal),
            moeda,
            incideIRT: item.incideIRT,
            incideINSS: item.incideINSS,
            ordem: ordem++,
            referenciaId: alteracao?.id ?? null,
          },
        });
        itensCriados.push({ id: criado.id, alteracaoId: alteracao?.id ?? null });
      }

      // Marca as alterações mensais como aplicadas e liga-as ao item.
      for (const item of itensCriados) {
        if (!item.alteracaoId) continue;
        await tx.rhAlteracaoMensal.update({
          where: { id: item.alteracaoId },
          data: { estado: 'APLICADA', processamentoItemId: item.id },
        });
      }

      // Marca as prestações de dívida como descontadas e actualiza o saldo.
      const prestacoes = loaderData.dividas.get(funcionarioId) ?? [];
      for (const p of prestacoes) {
        const descontado = toDec(p.valor);
        await tx.rhPrestacaoDivida.update({
          where: { id: p.id },
          data: { estado: 'DESCONTADA', valorDescontado: descontado },
        });
        const processo = await tx.rhProcessoDivida.findUnique({ where: { id: p.processoId } });
        if (processo) {
          const novosaldo = new Prisma.Decimal(processo.saldo).minus(descontado);
          await tx.rhProcessoDivida.update({
            where: { id: p.processoId },
            data: {
              saldo: novosaldo.lessThan(0) ? new Prisma.Decimal(0) : novosaldo,
              ...(novosaldo.lessThanOrEqualTo(0) ? { estado: 'LIQUIDADA' } : {}),
            },
          });
        }
      }

      // Marca ausências e horas extra como processadas.
      for (const a of loaderData.ausencias.get(funcionarioId) ?? []) {
        await tx.rhAusencia.update({ where: { id: a.id }, data: { processadaEm: dataProcessamento } });
      }
      for (const h of loaderData.horasExtra.get(funcionarioId) ?? []) {
        await tx.rhHoraExtra.update({ where: { id: h.id }, data: { processadaEm: dataProcessamento } });
      }

      // Recibo com número sequencial (reserva atómica dentro da transacção).
      const numero = await this.proximoNumeroRecibo(tx, serie, periodo.ano);
      const recibo = await tx.rhRecibo.create({
        data: {
          processamentoId: processamento.id,
          serie,
          ano: periodo.ano,
          numero,
          estado: 'EMITIDO',
        },
      });

      // Pagamento pendente.
      const pagamento = await tx.rhPagamento.create({
        data: {
          processamentoId: processamento.id,
          funcionarioId,
          formaPagamento,
          valor: toDec(resultado.totais.liquido),
          valorPago: new Prisma.Decimal(0),
          estado: 'PENDENTE',
          referencia: args.referenciaPagamento ?? null,
          criadoPorId: args.utilizadorId,
        },
      });

      return { processamento, recibo, pagamento };
    });

    // 5. Lançamento contabilístico (best-effort, fora da transacção)
    const avisos = [...resultado.avisos];
    let lancamentoContabilId: string | undefined;
    try {
      const lancamento = await this.gateway.criarLancamentoContabil({
        empresaId,
        data: dataProcessamento,
        descricao: `Processamento ${tipo} — recibo ${serie}/${gravado.recibo.numero}`,
        origemTipo: 'RH_PROCESSAMENTO',
        origemId: gravado.processamento.id,
        utilizadorId: args.utilizadorId ?? undefined,
        linhas: [
          {
            conta: 'RH_DESPESA_REMUNERACOES',
            descricao: 'Remunerações',
            debito: round2(resultado.totais.remuneracoes).toFixed(2),
          },
          {
            conta: 'RH_ENCARGOS_PATRONAIS',
            descricao: 'Encargos patronais',
            debito: round2(resultado.totais.encargos).toFixed(2),
          },
          {
            conta: 'RH_DESCONTOS',
            descricao: 'Descontos (INSS/IRT/dívidas)',
            credito: round2(resultado.totais.descontos).toFixed(2),
          },
          {
            conta: 'RH_LIQUIDO_PAGAR',
            descricao: 'Líquido a pagar',
            credito: round2(resultado.totais.liquido).toFixed(2),
          },
        ],
      });
      lancamentoContabilId = lancamento.id;
    } catch (e) {
      if (e instanceof FinancasIndisponivelError) {
        avisos.push('Lançamento contabilístico não criado: integração com Finanças indisponível.');
      } else {
        avisos.push('Lançamento contabilístico não criado por erro inesperado na integração com Finanças.');
      }
    }

    // 5.1 Persiste a referência do lançamento contabilístico no snapshot, para
    // que a anulação (RH-407) consiga estorná-lo. Só existe quando a integração
    // com Finanças respondeu com sucesso.
    if (lancamentoContabilId) {
      try {
        await this.prisma.rhProcessamento.update({
          where: { id: gravado.processamento.id },
          data: { snapshot: { ...snapshot, lancamentoContabilId } as unknown as Prisma.InputJsonValue },
        });
      } catch {
        avisos.push('Referência do lançamento contabilístico não foi persistida.');
      }
    }

    // 6. Auditoria
    await this.audit.registarOperacao({
      empresaId,
      utilizadorId: args.utilizadorId,
      acao: 'criar',
      entidade: 'RhProcessamento',
      entidadeId: gravado.processamento.id,
      modulo: 'rh',
      descricao: `Processamento ${args.modo ?? 'INDIVIDUAL'} ${tipo} do funcionário ${fd.funcionario.codigo} (${periodo.ano}/${periodo.mes}).`,
      severidade: 'info',
      dadosNovos: {
        tipo,
        funcionarioId,
        recibo: `${serie}/${gravado.recibo.numero}`,
        liquido: round2(resultado.totais.liquido).toFixed(2),
        forcarReprocessamento: args.forcarReprocessamento ?? false,
        ajustesManuais: ajustesManuais.length,
      },
    });

    return {
      sucesso: true,
      processamentoId: gravado.processamento.id,
      tipo,
      sequencia: gravado.processamento.sequencia,
      reciboId: gravado.recibo.id,
      serieRecibo: serie,
      numeroRecibo: gravado.recibo.numero,
      pagamentoId: gravado.pagamento.id,
      liquido: round2(resultado.totais.liquido).toFixed(2),
      totalRemuneracoes: round2(resultado.totais.remuneracoes).toFixed(2),
      totalDescontos: round2(resultado.totais.descontos).toFixed(2),
      totalEncargos: round2(resultado.totais.encargos).toFixed(2),
      avisos,
      lancamentoContabilId,
    };
  }

  /** Reserva o próximo número de recibo (`serie`/`ano`) dentro da transacção. */
  private async proximoNumeroRecibo(
    tx: Prisma.TransactionClient,
    serie: string,
    ano: number,
  ): Promise<number> {
    const chave = `${SEQUENCIA_RECIBO}:${serie}:${ano}`;
    const sequencia = await tx.rhSequencia.upsert({
      where: { chave },
      create: { chave, ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    return sequencia.ultimo;
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhProcessamentoExecucaoService = new RhProcessamentoExecucaoService();
