/**
 * @file fecho-periodo.service.ts
 * @description Fecho mensal e gestão de execuções de fecho.
 *
 * O fecho mensal é uma sequência de passos validados:
 *  1. Integrações pendentes (motor de contabilização)
 *  2. Reconciliação bancária
 *  3. Lançamentos em rascunho
 *  4. Amortizações/imobilizado (se módulo activo)
 *  5. Regularizações
 *  6. Apuramento IVA
 *  7. Balancete equilibrado
 *
 * Só quando todos os passos estão "ok" a execução pode ser concluída,
 * passando o período a `fechado` e criando o registo `ExecucaoFecho`.
 *
 * A reabertura exige permissão `approve` e cria uma execução `revertido`
 * que estorna os lançamentos de fecho.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError, NotFoundError, ValidationError } from '../utils/errors';

interface PassoFecho {
  codigo: string;
  descricao: string;
  estado: 'ok' | 'pendente' | 'erro';
  detalhes?: string;
}

interface PrevisaoFecho {
  periodoId: string;
  exercicioId: string;
  passos: PassoFecho[];
  podeFechar: boolean;
  bloqueios: string[];
}

// type ExecucaoFechoTipo = 'fechoMensal' | 'apuramentoIva' | 'apuramentoResultados' | 'fechoAnual' | 'aberturaExercicioSeguinte';

export class FechoPeriodoService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ─── Previsão / Diagnóstico ──────────────────────────────────────────────

  async previsao(periodoId: string): Promise<PrevisaoFecho> {
    const periodo = await this.prisma.periodoContabil.findUnique({
      where: { id: periodoId },
      include: { exercicio: { select: { id: true, estado: true, empresaId: true } } },
    });
    if (!periodo) throw new NotFoundError(`Período ${periodoId} não encontrado.`);

    const empresaId = periodo.exercicio.empresaId;
    const passos: PassoFecho[] = [];
    const bloqueios: string[] = [];

    // 1. Período e exercício abertos
    if (periodo.estado !== 'aberto') {
      passos.push({ codigo: 'periodo_aberto', descricao: 'Período aberto', estado: 'erro', detalhes: `Estado: ${periodo.estado}` });
      bloqueios.push('Período não está aberto.');
    } else {
      passos.push({ codigo: 'periodo_aberto', descricao: 'Período aberto', estado: 'ok' });
    }
    if (periodo.exercicio.estado !== 'aberto') {
      passos.push({ codigo: 'exercicio_aberto', descricao: 'Exercício aberto', estado: 'erro', detalhes: `Estado: ${periodo.exercicio.estado}` });
      bloqueios.push('Exercício não está aberto.');
    } else {
      passos.push({ codigo: 'exercicio_aberto', descricao: 'Exercício aberto', estado: 'ok' });
    }

    // 2. Integrações pendentes (erros de integração não resolvidos)
    const errosPendentes = await this.prisma.erroIntegracaoContabil.count({
      where: { empresaId, resolvido: false, moduloOrigem: { in: ['vendas', 'compras', 'tesouraria', 'rh'] } },
    });
    if (errosPendentes > 0) {
      passos.push({ codigo: 'integracoes', descricao: 'Integrações pendentes', estado: 'pendente', detalhes: `${errosPendentes} erro(s) de integração por resolver.` });
      bloqueios.push('Existem erros de integração por resolver.');
    } else {
      passos.push({ codigo: 'integracoes', descricao: 'Integrações pendentes', estado: 'ok' });
    }

    // 3. Reconciliação bancária (contas com contaContabilId)
    const contasPorConciliar = await this.prisma.contaBancaria.count({
      where: {
        empresaId,
        contaContabilId: { not: null },
        ativo: true,
        OR: [
          { movimentosOrigem: { some: { conciliado: false, estado: 'confirmado', data: { gte: periodo.dataInicio, lte: periodo.dataFim } } } },
          { movimentosDestino: { some: { conciliado: false, estado: 'confirmado', data: { gte: periodo.dataInicio, lte: periodo.dataFim } } } },
        ],
      },
    });
    if (contasPorConciliar > 0) {
      passos.push({ codigo: 'reconciliacao', descricao: 'Reconciliação bancária', estado: 'pendente', detalhes: `${contasPorConciliar} conta(s) bancária(s) com movimentos por conciliar.` });
      bloqueios.push('Existem movimentos bancários por conciliar.');
    } else {
      passos.push({ codigo: 'reconciliacao', descricao: 'Reconciliação bancária', estado: 'ok' });
    }

    // 4. Lançamentos em rascunho no período
    const rascunhos = await this.prisma.lancamentoContabil.count({
      where: { periodoId, estado: 'rascunho' },
    });
    if (rascunhos > 0) {
      passos.push({ codigo: 'rascunhos', descricao: 'Lançamentos em rascunho', estado: 'pendente', detalhes: `${rascunhos} lançamento(s) em rascunho.` });
      bloqueios.push('Existem lançamentos em rascunho não validados.');
    } else {
      passos.push({ codigo: 'rascunhos', descricao: 'Lançamentos em rascunho', estado: 'ok' });
    }

    // 5. Amortizações/imobilizado (placeholder - se módulo activo)
    // TODO: implementar quando existir módulo de imobilizado

    // 6. Regularizações (placeholder - lançamentos de ajustamento em rascunho)
    const ajustesRascunho = await this.prisma.lancamentoContabil.count({
      where: { periodoId, origem: 'ajustamento', estado: 'rascunho' },
    });
    if (ajustesRascunho > 0) {
      passos.push({ codigo: 'regularizacoes', descricao: 'Regularizações', estado: 'pendente', detalhes: `${ajustesRascunho} ajustamento(s) em rascunho.` });
      bloqueios.push('Existem regularizações por validar.');
    } else {
      passos.push({ codigo: 'regularizacoes', descricao: 'Regularizações', estado: 'ok' });
    }

    // 7. IVA - verificar se apuramento existe
    const apuramentoIva = await this.prisma.apuramentoImposto.findFirst({
      where: { periodoId, tipoImposto: 'IVA' },
    });
    if (!apuramentoIva || apuramentoIva.estado === 'rascunho') {
      passos.push({ codigo: 'iva', descricao: 'Apuramento IVA', estado: 'pendente', detalhes: 'Apuramento IVA não realizado ou em rascunho.' });
      bloqueios.push('Apuramento IVA não realizado.');
    } else {
      passos.push({ codigo: 'iva', descricao: 'Apuramento IVA', estado: 'ok' });
    }

    // 8. Balancete equilibrado
    const balancete = await this.verificarBalanceteEquilibrado(periodoId);
    if (!balancete.equilibrado) {
      passos.push({ codigo: 'balancete', descricao: 'Balancete equilibrado', estado: 'erro', detalhes: `Diferença: ${balancete.diferenca}` });
      bloqueios.push('Balancete não equilibrado.');
    } else {
      passos.push({ codigo: 'balancete', descricao: 'Balancete equilibrado', estado: 'ok' });
    }

    const podeFechar = bloqueios.length === 0;

    return {
      periodoId,
      exercicioId: periodo.exercicioId,
      passos,
      podeFechar,
      bloqueios,
    };
  }

  private async verificarBalanceteEquilibrado(periodoId: string): Promise<{ equilibrado: boolean; diferenca: string }> {
    const agg = await this.prisma.linhaLancamentoContabil.aggregate({
      where: { lancamento: { periodoId, estado: 'validado' } },
      _sum: { debito: true, credito: true },
    });
    const totalDebito = agg._sum.debito ?? new Prisma.Decimal(0);
    const totalCredito = agg._sum.credito ?? new Prisma.Decimal(0);
    const diferenca = totalDebito.minus(totalCredito).abs();
    return { equilibrado: totalDebito.equals(totalCredito), diferenca: diferenca.toFixed(4) };
  }

  // ─── Execução do Fecho ───────────────────────────────────────────────────

  async executar(periodoId: string, utilizadorId: string): Promise<{ execucaoId: string }> {
    const previsao = await this.previsao(periodoId);
    if (!previsao.podeFechar) {
      throw new BusinessRuleError(`Não é possível fechar: ${previsao.bloqueios.join('; ')}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const periodo = await tx.periodoContabil.findUniqueOrThrow({
        where: { id: periodoId },
        include: { exercicio: { select: { id: true, empresaId: true, ano: true } } },
      });

      const empresaId = periodo.exercicio.empresaId;

      // Criar execução de fecho
      const execucao = await tx.execucaoFecho.create({
        data: {
          empresaId,
          periodoId,
          exercicioId: periodo.exercicioId,
          tipo: 'fechoMensal',
          estado: 'executado',
          iniciadoPorId: utilizadorId,
          concluidoEm: new Date(),
          detalhes: JSON.stringify({ passos: previsao.passos }),
        },
      });

      // Fechar período
      await tx.periodoContabil.update({
        where: { id: periodoId },
        data: { estado: 'fechado', fechadoEm: new Date(), fechadoPorId: utilizadorId },
      });

      // AuditLog
      await tx.auditLog.create({
        data: {
          empresaId,
          utilizadorId,
          acao: 'fechar',
          severidade: 'info',
          entidade: 'PeriodoContabil',
          entidadeId: periodoId,
          modulo: 'contabilidade',
          descricao: `Período ${periodo.numero}/${periodo.exercicio.ano} fechado.`,
          dadosAnteriores: JSON.stringify({ estado: 'aberto' }),
          dadosNovos: JSON.stringify({ estado: 'fechado', execucaoId: execucao.id }),
        },
      });

      return { execucaoId: execucao.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ─── Reabertura ──────────────────────────────────────────────────────────

  async reabrir(periodoId: string, utilizadorId: string, motivo: string): Promise<void> {
    if (!motivo?.trim()) throw new ValidationError('O motivo da reabertura é obrigatório.');

    await this.prisma.$transaction(async (tx) => {
      const periodo = await tx.periodoContabil.findUnique({
        where: { id: periodoId },
        include: { exercicio: { select: { id: true, empresaId: true, ano: true } } },
      });
      if (!periodo) throw new NotFoundError('Período não encontrado.');
      if (periodo.estado !== 'fechado') throw new BusinessRuleError('Só períodos fechados podem ser reabertos.');

      const empresaId = periodo.exercicio.empresaId;

      // Criar execução de reabertura
      await tx.execucaoFecho.create({
        data: {
          empresaId,
          periodoId,
          exercicioId: periodo.exercicioId,
          tipo: 'fechoMensal',
          estado: 'revertido',
          iniciadoPorId: utilizadorId,
          concluidoEm: new Date(),
          detalhes: JSON.stringify({ motivo, tipo: 'reabertura' }),
        },
      });

      // Reabrir período
      await tx.periodoContabil.update({
        where: { id: periodoId },
        data: { estado: 'aberto', fechadoEm: null, fechadoPorId: null },
      });

      await tx.auditLog.create({
        data: {
          empresaId,
          utilizadorId,
          acao: 'reabrir',
          severidade: 'aviso',
          entidade: 'PeriodoContabil',
          entidadeId: periodoId,
          modulo: 'contabilidade',
          descricao: `Período ${periodo.numero}/${periodo.exercicio.ano} reaberto: ${motivo}.`,
          dadosAnteriores: JSON.stringify({ estado: 'fechado' }),
          dadosNovos: JSON.stringify({ estado: 'aberto', motivo }),
        },
      });
    });
  }

  // ─── Listagens ────────────────────────────────────────────────────────────

  async listarExecucoes(filters: { empresaId?: string; periodoId?: string; tipo?: string; estado?: string } = {}): Promise<{
    items: Array<{
      id: string;
      empresaId: string;
      periodoId: string | null;
      exercicioId: string;
      tipo: string;
      estado: string;
      iniciadoPorId: string;
      iniciadoEm: Date;
      concluidoEm: Date | null;
      detalhes: string | null;
      createdAt: Date;
    }>;
    total: number;
  }> {
    const where: Prisma.ExecucaoFechoWhereInput = {};
    if (filters.empresaId) where.empresaId = filters.empresaId;
    if (filters.periodoId) where.periodoId = filters.periodoId;
    if (filters.tipo) where.tipo = filters.tipo as 'fechoMensal' | 'apuramentoIva' | 'apuramentoResultados' | 'fechoAnual' | 'aberturaExercicioSeguinte';
    if (filters.estado) where.estado = filters.estado as 'previsao' | 'executado' | 'revertido' | 'falhado';

    const [items, total] = await Promise.all([
      this.prisma.execucaoFecho.findMany({
        where,
        orderBy: { iniciadoEm: 'desc' },
        select: { id: true, empresaId: true, periodoId: true, exercicioId: true, tipo: true, estado: true, iniciadoPorId: true, iniciadoEm: true, concluidoEm: true, detalhes: true, createdAt: true },
      }),
      this.prisma.execucaoFecho.count({ where }),
    ]);
    return { items, total };
  }
}

export const fechoPeriodoService = new FechoPeriodoService();