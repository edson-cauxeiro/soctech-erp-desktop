/**
 * @file rh-processamento-anular.service.ts
 * @description Service de anulação de processamento (RH-407).
 *
 * Reverte, de forma transaccional, os efeitos de um processamento confirmado
 * (spec §5.7):
 * 1. Processamento → `ANULADO` (mantém os dados, guarda motivo/quem/quando).
 * 2. Recibo → `ANULADO` (nunca reutiliza o número sequencial).
 * 3. Pagamento pendente → `CANCELADO`.
 * 4. Alterações mensais aplicadas → `PENDENTE` (desligadas do item).
 * 5. Prestações de dívida descontadas → `PENDENTE` e saldo do processo reposto.
 * 6. Ausências e horas extra processadas → desmarcadas (`processadaEm = null`).
 * 7. Lançamento contabilístico → estornado (best-effort, ADR-010).
 *
 * Bloqueios (por processamento): período fechado e pagamento já efectuado
 * (exige anular o pagamento antes). Cada processamento é revertido na sua
 * própria transacção, pelo que uma falha não impede os restantes — o resultado
 * segue a forma de lote (`total`/`sucesso`/`erros`/`detalhes`).
 *
 * Nota de modelação: as ausências e horas extra não guardam a referência ao
 * processamento (apenas `processadaEm`); a reversão desmarca as que partilham a
 * data de processamento do registo anulado. Ver ADR-012.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import { financasGateway as defaultGateway, type FinancasGateway } from './rh-financas-gateway';
import {
  FinancasIndisponivelError,
  RhBusinessRuleError,
  RH_ERROR_CODES,
} from '../utils/rh-errors';

export interface AnularProcessamentoInput {
  empresaId: string | null;
  utilizadorId?: string | null;
  processamentoIds: string[];
  motivo: string;
}

export interface AnularProcessamentoDetalhe {
  processamentoId: string;
  funcionarioId?: string;
  codigo?: string | null;
  nome?: string | null;
  sucesso: boolean;
  erro?: string;
  reciboAnulado?: boolean;
  pagamentosCancelados?: number;
  alteracoesRepostas?: number;
  prestacoesRepostas?: number;
  lancamentoEstornado?: boolean;
  avisos?: string[];
}

export interface AnularProcessamentoResultado {
  total: number;
  sucesso: number;
  erros: number;
  detalhes: AnularProcessamentoDetalhe[];
}

type ProcessamentoComRelacoes = Prisma.RhProcessamentoGetPayload<{
  include: {
    itens: { select: { id: true } };
    recibo: true;
    pagamentos: true;
    periodo: true;
    funcionario: { select: { id: true; codigo: true; nome: true } };
  };
}>;

export class RhProcessamentoAnularService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService,
    private readonly gateway: FinancasGateway = defaultGateway,
  ) {}

  async anular(input: AnularProcessamentoInput): Promise<AnularProcessamentoResultado> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const motivo = input.motivo?.trim();
    if (!motivo) {
      throw new RhBusinessRuleError('O motivo da anulação é obrigatório.', {
        code: RH_ERROR_CODES.VALIDACAO,
      });
    }
    if (!input.processamentoIds || input.processamentoIds.length === 0) {
      throw new RhBusinessRuleError('Selecione pelo menos um processamento para anular.', {
        code: RH_ERROR_CODES.VALIDACAO,
      });
    }

    const processamentos = await this.prisma.rhProcessamento.findMany({
      where: { id: { in: input.processamentoIds }, periodo: { empresaId } },
      include: {
        itens: { select: { id: true } },
        recibo: true,
        pagamentos: true,
        periodo: true,
        funcionario: { select: { id: true, codigo: true, nome: true } },
      },
    });
    const porId = new Map(processamentos.map((p) => [p.id, p] as const));

    const detalhes: AnularProcessamentoDetalhe[] = [];
    let sucesso = 0;
    let erros = 0;

    for (const processamentoId of input.processamentoIds) {
      const proc = porId.get(processamentoId);
      if (!proc) {
        detalhes.push({ processamentoId, sucesso: false, erro: 'Processamento não encontrado.' });
        erros += 1;
        continue;
      }

      const base = {
        processamentoId,
        funcionarioId: proc.funcionarioId,
        codigo: proc.funcionario.codigo,
        nome: proc.funcionario.nome,
      } as const;

      const impedimento = this.validar(proc);
      if (impedimento) {
        detalhes.push({ ...base, sucesso: false, erro: impedimento });
        erros += 1;
        continue;
      }

      try {
        const resumo = await this.reverter(proc, empresaId, input.utilizadorId ?? null, motivo);
        detalhes.push({ ...base, sucesso: true, ...resumo });
        sucesso += 1;
      } catch (e) {
        detalhes.push({
          ...base,
          sucesso: false,
          erro: e instanceof Error ? e.message : 'Erro inesperado na anulação.',
        });
        erros += 1;
      }
    }

    return { total: input.processamentoIds.length, sucesso, erros, detalhes };
  }

  /** Motivo de bloqueio da anulação, ou `null` se pode ser anulado. */
  private validar(proc: ProcessamentoComRelacoes): string | null {
    if (proc.estado === 'ANULADO') {
      return 'O processamento já se encontra anulado.';
    }
    if (proc.periodo.estado !== 'ABERTO') {
      return 'Período fechado — não permite anular.';
    }
    const efetuado = proc.pagamentos.some(
      (p) =>
        p.estado === 'PAGO' ||
        p.estado === 'PARCIAL' ||
        new Prisma.Decimal(p.valorPago).greaterThan(0),
    );
    if (efetuado) {
      return 'Existe pagamento efectuado. Anule o pagamento antes de anular o processamento.';
    }
    return null;
  }

  private async reverter(
    proc: ProcessamentoComRelacoes,
    empresaId: string,
    utilizadorId: string | null,
    motivo: string,
  ): Promise<Omit<AnularProcessamentoDetalhe, 'processamentoId' | 'funcionarioId' | 'codigo' | 'nome' | 'sucesso'>> {
    const agora = new Date();
    const itemIds = proc.itens.map((i) => i.id);

    const resumo = await this.prisma.$transaction(async (tx) => {
      await tx.rhProcessamento.update({
        where: { id: proc.id },
        data: {
          estado: 'ANULADO',
          anuladoEm: agora,
          anuladoPorId: utilizadorId,
          motivoAnulacao: motivo,
        },
      });

      const reciboAnulado = proc.recibo?.estado === 'EMITIDO';
      if (reciboAnulado && proc.recibo) {
        await tx.rhRecibo.update({
          where: { id: proc.recibo.id },
          data: { estado: 'ANULADO', anuladoEm: agora },
        });
      }

      let pagamentosCancelados = 0;
      for (const p of proc.pagamentos) {
        if (p.estado === 'PENDENTE') {
          await tx.rhPagamento.update({ where: { id: p.id }, data: { estado: 'CANCELADO' } });
          pagamentosCancelados += 1;
        }
      }

      let alteracoesRepostas = 0;
      if (itemIds.length > 0) {
        const r = await tx.rhAlteracaoMensal.updateMany({
          where: { processamentoItemId: { in: itemIds } },
          data: { estado: 'PENDENTE', processamentoItemId: null },
        });
        alteracoesRepostas = r.count;
      }

      // As prestações não guardam a referência ao item; o loader desconta as
      // PENDENTE do (funcionário, ano, mês) do período, pelo que a reversão
      // localiza-as por essa chave + estado DESCONTADA.
      const prestacoes = await tx.rhPrestacaoDivida.findMany({
        where: {
          ano: proc.periodo.ano,
          mes: proc.periodo.mes,
          estado: 'DESCONTADA',
          processo: { funcionarioId: proc.funcionarioId },
        },
        include: { processo: true },
      });
      for (const pr of prestacoes) {
        const descontado = new Prisma.Decimal(pr.valorDescontado);
        await tx.rhPrestacaoDivida.update({
          where: { id: pr.id },
          data: {
            estado: 'PENDENTE',
            valorDescontado: new Prisma.Decimal(0),
            processamentoItemId: null,
          },
        });
        const novoSaldo = new Prisma.Decimal(pr.processo.saldo).plus(descontado);
        await tx.rhProcessoDivida.update({
          where: { id: pr.processoId },
          data: {
            saldo: novoSaldo,
            ...(pr.processo.estado === 'LIQUIDADA' && novoSaldo.greaterThan(0)
              ? { estado: 'ATIVA' as const }
              : {}),
          },
        });
      }

      await tx.rhAusencia.updateMany({
        where: { funcionarioId: proc.funcionarioId, processadaEm: proc.dataProcessamento },
        data: { processadaEm: null },
      });
      await tx.rhHoraExtra.updateMany({
        where: { funcionarioId: proc.funcionarioId, processadaEm: proc.dataProcessamento },
        data: { processadaEm: null },
      });

      return {
        reciboAnulado,
        pagamentosCancelados,
        alteracoesRepostas,
        prestacoesRepostas: prestacoes.length,
      };
    });

    await this.audit.registarOperacao({
      empresaId,
      utilizadorId,
      acao: 'anular',
      entidade: 'RhProcessamento',
      entidadeId: proc.id,
      modulo: 'rh',
      descricao: `Anulação do processamento ${proc.tipo} do funcionário ${proc.funcionario.codigo} (${proc.periodo.ano}/${proc.periodo.mes}).`,
      severidade: 'info',
      dadosAnteriores: { estado: proc.estado },
      dadosNovos: { estado: 'ANULADO', motivo },
    });

    const estorno = await this.estornarLancamento(proc, motivo, utilizadorId);
    return { ...resumo, lancamentoEstornado: estorno.estornado, avisos: estorno.avisos };
  }

  /** Estorna o lançamento contabilístico (best-effort) se a sua referência existir. */
  private async estornarLancamento(
    proc: ProcessamentoComRelacoes,
    motivo: string,
    utilizadorId?: string | null,
  ): Promise<{ estornado: boolean; avisos: string[] }> {
    const avisos: string[] = [];
    const snapshot = (proc.snapshot ?? {}) as Record<string, unknown>;
    const lancamentoId = snapshot.lancamentoContabilId;
    if (typeof lancamentoId !== 'string' || !lancamentoId) {
      return { estornado: false, avisos };
    }
    try {
      await this.gateway.estornarLancamento(lancamentoId, motivo, utilizadorId ?? undefined);
      return { estornado: true, avisos };
    } catch (e) {
      if (e instanceof FinancasIndisponivelError) {
        avisos.push('Estorno contabilístico não efectuado: integração com Finanças indisponível.');
      } else {
        avisos.push('Estorno contabilístico não efectuado por erro inesperado na integração com Finanças.');
      }
      return { estornado: false, avisos };
    }
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhProcessamentoAnularService = new RhProcessamentoAnularService();
