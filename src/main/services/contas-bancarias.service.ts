/**
 * @file contas-bancarias.service.ts
 * @description Tesouraria — contas bancárias e caixas.
 *
 * O saldo de uma conta NUNCA é escrito directamente. É sempre derivado:
 *
 *     saldo = saldoInicial + Σ(entradas e créditos) − Σ(saídas e débitos)
 *
 * considerando apenas movimentos em estado `confirmado`. `saldoAtual` existe
 * na tabela por compatibilidade com relatórios legados, mas é recalculado a
 * partir dos movimentos sempre que é lido, para nunca divergir.
 */

import { PrismaClient, Prisma, ContaBancaria, TipoContaBancaria, NaturezaConta } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarContaBancariaSchema,
  atualizarContaBancariaSchema,
  contaBancariaFiltersSchema,
  contasContabeisDisponiveisSchema,
  CriarContaBancariaInput,
  AtualizarContaBancariaInput,
  ContaBancariaFilters,
  ContasContabeisDisponiveisInput,
} from '../validators/tesouraria.validator';
import { NotFoundError, BusinessRuleError, ConflictError } from '../utils/errors';
import { credita, debita, arredondar } from './tesouraria.saldo';

// O `tipo` NÃO decide o efeito no saldo: o lado nomeado decide (ver
// `tesouraria.saldo`). Um `ajuste` que credita uma caixa tem de a aumentar, e
// filtrar por tipo escondia-o do saldo.

export interface SaldoConta {
  contaId: string;
  codigo: string;
  designacao: string;
  tipo: TipoContaBancaria;
  moeda: string;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalMovimentos: number;
  movimentosConciliados: number;
  movimentosNaoConciliados: number;
}

export type ContaComSaldo = Omit<ContaBancaria, 'saldoAtual'> & { saldo: number };

export interface ContaContabilDisponivel {
  id: string;
  codigo: string;
  designacao: string;
  natureza: NaturezaConta;
}

export class ContasBancariasService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ===========================================================================
  // Leitura
  // ===========================================================================

  async list(filters?: unknown): Promise<{ items: ContaBancaria[]; total: number }> {
    const f: ContaBancariaFilters = filters
      ? contaBancariaFiltersSchema.parse(filters)
      : { apenasAtivas: true };

    const where: Prisma.ContaBancariaWhereInput = {};
    if (f.empresaId) where.empresaId = f.empresaId;
    if (f.tipo) where.tipo = f.tipo;
    if (f.apenasAtivas !== false) where.ativo = true;
    if (f.search) {
      const s = f.search;
      where.OR = [
        { codigo: { contains: s, mode: 'insensitive' } },
        { designacao: { contains: s, mode: 'insensitive' } },
        { iban: { contains: s, mode: 'insensitive' } },
        { nomeBanco: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contaBancaria.findMany({
        where,
        orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      }),
      this.prisma.contaBancaria.count({ where }),
    ]);

    return { items, total };
  }

  async get(id: string): Promise<ContaBancaria> {
    const conta = await this.prisma.contaBancaria.findUnique({ where: { id } });
    if (!conta) throw new NotFoundError(`Conta bancária '${id}' não encontrada.`);
    return conta;
  }

  /** Contas do plano elegíveis para associar a uma conta bancária/caixa. */
  async listarContasContabeisDisponiveis(rawInput: unknown): Promise<ContaContabilDisponivel[]> {
    const input: ContasContabeisDisponiveisInput = contasContabeisDisponiveisSchema.parse(rawInput);

    const [contas, ligacoes] = await Promise.all([
      this.prisma.contaContabil.findMany({
        where: { empresaId: input.empresaId, activa: true, aceitaMovimento: true },
        select: { id: true, codigo: true, designacao: true, natureza: true },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.contaBancaria.findMany({
        where: { empresaId: input.empresaId, contaContabilId: { not: null } },
        select: { id: true, contaContabilId: true },
      }),
    ]);

    const usadas = new Set(
      ligacoes
        .filter((ligacao) => ligacao.id !== input.contaBancariaId)
        .map((ligacao) => ligacao.contaContabilId)
    );

    return contas.filter((conta) => !usadas.has(conta.id));
  }

  /** Lista de contas com o saldo derivado, para preencher selects e dashboards. */
  async listarComSaldos(filters?: unknown): Promise<{ items: ContaComSaldo[]; total: number }> {
    const f: ContaBancariaFilters = filters
      ? contaBancariaFiltersSchema.parse(filters)
      : { apenasAtivas: true };

    const contas = await this.list(f);
    const saldos = await this.calcularSaldos(contas.items.map((c) => c.id));

    return {
      items: contas.items.map((c) => ({ ...c, saldo: saldos.get(c.id) ?? 0 })),
      total: contas.total,
    };
  }

  async getComSaldo(id: string): Promise<ContaComSaldo> {
    const conta = await this.get(id);
    const saldos = await this.calcularSaldos([id]);
    return { ...conta, saldo: saldos.get(id) ?? 0 };
  }

  /**
   * Calcula o saldo derivado de um conjunto de contas com uma única query de
   * agregação, para não fazer N+1 ao pintar a lista de contas.
   */
  async calcularSaldos(contaIds: string[]): Promise<Map<string, number>> {
    const resultado = new Map<string, number>();
    if (contaIds.length === 0) return resultado;

    const contas = await this.prisma.contaBancaria.findMany({
      where: { id: { in: contaIds } },
      select: { id: true, saldoInicial: true },
    });

    for (const c of contas) resultado.set(c.id, Number(c.saldoInicial));

    // Uma linha por (conta, sentido). Um movimento de transferência aparece
    // duas vezes, que é exactamente o pretendido: sai de uma, entra na outra.
    const linhas = await this.prisma.movimentoTesouraria.findMany({
      where: {
        estado: 'confirmado',
        OR: [{ contaOrigemId: { in: contaIds } }, { contaDestinoId: { in: contaIds } }],
      },
      select: {
        contaOrigemId: true,
        contaDestinoId: true,
        valor: true,
      },
    });

    for (const m of linhas) {
      const valor = Number(m.valor);

      if (m.contaOrigemId && debita(m) && resultado.has(m.contaOrigemId)) {
        resultado.set(m.contaOrigemId, (resultado.get(m.contaOrigemId) ?? 0) - valor);
      }

      if (m.contaDestinoId && credita(m) && resultado.has(m.contaDestinoId)) {
        resultado.set(m.contaDestinoId, (resultado.get(m.contaDestinoId) ?? 0) + valor);
      }
    }

    for (const [id, valor] of resultado) resultado.set(id, arredondar(valor));

    return resultado;
  }

  /**
   * Resumo por conta com totais de entradas/saídas e estado de conciliação.
   * Usado na aba Contas e no topo da aba Lançamentos.
   */
  async resumoSaldos(filters?: unknown): Promise<SaldoConta[]> {
    const f: ContaBancariaFilters = filters
      ? contaBancariaFiltersSchema.parse(filters)
      : { apenasAtivas: true };

    const contas = await this.list(f);
    if (contas.items.length === 0) return [];

    const ids = contas.items.map((c) => c.id);

    const agregacao = await this.prisma.movimentoTesouraria.groupBy({
      by: ['contaOrigemId', 'contaDestinoId', 'conciliado'],
      where: {
        estado: 'confirmado',
        OR: [{ contaOrigemId: { in: ids } }, { contaDestinoId: { in: ids } }],
      },
      _sum: { valor: true },
      _count: { _all: true },
    });

    const mapa = new Map<string, SaldoConta>();

    for (const c of contas.items) {
      mapa.set(c.id, {
        contaId: c.id,
        codigo: c.codigo,
        designacao: c.designacao,
        tipo: c.tipo,
        moeda: c.moeda,
        saldoInicial: Number(c.saldoInicial),
        totalEntradas: 0,
        totalSaidas: 0,
        saldo: Number(c.saldoInicial),
        totalMovimentos: 0,
        movimentosConciliados: 0,
        movimentosNaoConciliados: 0,
      });
    }

    for (const linha of agregacao) {
      const valor = Number(linha._sum.valor ?? 0);
      const quantidade = linha._count._all;

      if (linha.contaOrigemId && debita(linha)) {
        const conta = mapa.get(linha.contaOrigemId);
        if (conta) {
          conta.totalSaidas += valor;
          conta.saldo -= valor;
          conta.totalMovimentos += quantidade;
          if (linha.conciliado) conta.movimentosConciliados += quantidade;
          else conta.movimentosNaoConciliados += quantidade;
        }
      }

      if (linha.contaDestinoId && credita(linha)) {
        const conta = mapa.get(linha.contaDestinoId);
        if (conta) {
          conta.totalEntradas += valor;
          conta.saldo += valor;
          conta.totalMovimentos += quantidade;
          if (linha.conciliado) conta.movimentosConciliados += quantidade;
          else conta.movimentosNaoConciliados += quantidade;
        }
      }
    }

    for (const conta of mapa.values()) {
      conta.saldo = arredondar(conta.saldo);
      conta.totalEntradas = arredondar(conta.totalEntradas);
      conta.totalSaidas = arredondar(conta.totalSaidas);
    }

    return [...mapa.values()];
  }

  // ===========================================================================
  // Escrita
  // ===========================================================================

  /** Valida a conta contabilística a ligar e garante que não está já em uso. */
  private async validarContaContabil(
    empresaId: string,
    contaContabilId: string,
    contaBancariaId?: string
  ): Promise<void> {
    const contaContabil = await this.prisma.contaContabil.findFirst({
      where: { id: contaContabilId, empresaId },
      select: { activa: true, aceitaMovimento: true },
    });
    if (!contaContabil) {
      throw new NotFoundError('Conta contabilística não encontrada.');
    }
    if (!contaContabil.activa || !contaContabil.aceitaMovimento) {
      throw new BusinessRuleError('A conta contabilística não aceita movimentos.');
    }

    const where: Prisma.ContaBancariaWhereInput = { contaContabilId };
    if (contaBancariaId) where.id = { not: contaBancariaId };

    const ligada = await this.prisma.contaBancaria.findFirst({ where, select: { id: true } });
    if (ligada) {
      throw new ConflictError('Esta conta contabilística já está associada a outra conta bancária.');
    }
  }

  async criar(rawInput: unknown): Promise<ContaBancaria> {
    const data: CriarContaBancariaInput = criarContaBancariaSchema.parse(rawInput);

    const empresa = await this.prisma.empresaConfig.findUnique({
      where: { id: data.empresaId },
    });
    if (!empresa) throw new NotFoundError(`Empresa '${data.empresaId}' não encontrada.`);

    if (data.contaContabilId) {
      await this.validarContaContabil(data.empresaId, data.contaContabilId);
    }

    const duplicada = await this.prisma.contaBancaria.findFirst({
      where: { empresaId: data.empresaId, codigo: data.codigo },
    });
    if (duplicada) {
      throw new ConflictError(`Já existe uma conta com o código '${data.codigo}' nesta empresa.`);
    }

    return this.prisma.contaBancaria.create({
      data: {
        empresaId: data.empresaId,
        contaContabilId: data.contaContabilId ?? null,
        codigo: data.codigo,
        designacao: data.designacao,
        tipo: data.tipo,
        nomeBanco: data.nomeBanco || null,
        iban: data.iban || null,
        swiftBic: data.swiftBic || null,
        saldoInicial: new Prisma.Decimal(data.saldoInicial ?? 0),
        saldoAtual: new Prisma.Decimal(0),
        moeda: data.moeda || empresa.moedaBase || 'AOA',
        observacoes: data.observacoes || null,
        ativo: data.ativo ?? true,
      },
    });
  }

  async atualizar(id: string, rawInput: unknown): Promise<ContaBancaria> {
    const data: AtualizarContaBancariaInput = atualizarContaBancariaSchema.parse(rawInput);
    const conta = await this.get(id);

    if (conta.empresaId !== data.empresaId) {
      throw new NotFoundError(`Conta bancária '${id}' não encontrada.`);
    }

    if ('contaContabilId' in data && data.contaContabilId) {
      await this.validarContaContabil(data.empresaId, data.contaContabilId, id);
    }

    // Não se pode transformar uma conta com uma sessão aberta num tipo que
    // deixa de ser caixa, nem desativar a conta que tem dinheiro a passar.
    const tipoNovo = data.tipo ?? conta.tipo;
    if (tipoNovo !== 'caixa' && conta.tipo === 'caixa') {
      const sessaoAberta = await this.prisma.sessaoCaixa.findFirst({
        where: { contaCaixaId: id, estado: 'aberta' },
      });
      if (sessaoAberta) {
        throw new BusinessRuleError(
          `Não é possível alterar o tipo da conta '${conta.codigo}' com uma sessão de caixa aberta. Feche a sessão primeiro.`
        );
      }
    }

    const ibanNovo = data.iban !== undefined ? data.iban : conta.iban;
    const tipoParaValidar = data.tipo ?? conta.tipo;
    if (tipoParaValidar === 'banco' && !ibanNovo) {
      throw new BusinessRuleError('Contas bancárias exigem IBAN. Só contas do tipo caixa podem ficar sem IBAN.');
    }

    return this.prisma.contaBancaria.update({
      where: { id },
      data: {
        ...('contaContabilId' in data && { contaContabilId: data.contaContabilId ?? null }),
        ...(data.designacao !== undefined && { designacao: data.designacao }),
        ...(data.tipo !== undefined && { tipo: data.tipo }),
        ...(data.nomeBanco !== undefined && { nomeBanco: data.nomeBanco || null }),
        ...(data.iban !== undefined && { iban: data.iban || null }),
        ...(data.swiftBic !== undefined && { swiftBic: data.swiftBic || null }),
        ...(data.observacoes !== undefined && { observacoes: data.observacoes || null }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });
  }

  /**
   * Ajusta o saldo inicial de uma conta. Só é permitido enquanto a conta não
   * tiver movimentos, para não baralhar a auditoria: depois de existir um único
   * movimento, a correcção faz-se com um movimento de ajuste.
   */
  async ajustarSaldoInicial(id: string, saldoInicial: number, observacoes?: string): Promise<ContaBancaria> {
    if (typeof saldoInicial !== 'number' || Number.isNaN(saldoInicial)) {
      throw new BusinessRuleError('O saldo inicial deve ser um número.');
    }
    if (saldoInicial < 0) {
      throw new BusinessRuleError('O saldo inicial não pode ser negativo. Registe um movimento de saída.');
    }

    const conta = await this.get(id);

    const movimentos = await this.prisma.movimentoTesouraria.count({
      where: { OR: [{ contaOrigemId: id }, { contaDestinoId: id }] },
    });

    if (movimentos > 0) {
      throw new BusinessRuleError(
        `A conta '${conta.codigo}' já tem ${movimentos} movimento(s). Altere o saldo com um lançamento de ajuste para preservar o histórico.`
      );
    }

    return this.prisma.contaBancaria.update({
      where: { id },
      data: {
        saldoInicial: new Prisma.Decimal(saldoInicial),
        observacoes: observacoes || conta.observacoes,
      },
    });
  }

  /**
   * Desativa uma conta. Contas com movimentos nunca são eliminadas fisicamente
   * — desativar preserva a integridade referencial dos lançamentos e
   * documentos já emitidos.
   */
  async desativar(id: string): Promise<ContaBancaria> {
    const conta = await this.get(id);

    const sessaoAberta = await this.prisma.sessaoCaixa.findFirst({
      where: { contaCaixaId: id, estado: 'aberta' },
    });
    if (sessaoAberta) {
      throw new BusinessRuleError(
        `Não é possível desativar a conta '${conta.codigo}' com uma sessão de caixa aberta.`
      );
    }

    return this.prisma.contaBancaria.update({ where: { id }, data: { ativo: false } });
  }

  async reativar(id: string): Promise<ContaBancaria> {
    await this.get(id);
    return this.prisma.contaBancaria.update({ where: { id }, data: { ativo: true } });
  }

  /**
   * Elimina uma conta apenas se for realmente nova (sem movimentos, sem
   * documentos associados e sem sessões de caixa).
   */
  async remover(id: string): Promise<void> {
    const conta = await this.get(id);

    const movimentos = await this.prisma.movimentoTesouraria.count({
      where: { OR: [{ contaOrigemId: id }, { contaDestinoId: id }] },
    });
    if (movimentos > 0) {
      throw new BusinessRuleError(
        `A conta '${conta.codigo}' tem ${movimentos} movimento(s) associado(s). Desative-a em vez de a eliminar.`
      );
    }

    const sessoes = await this.prisma.sessaoCaixa.count({ where: { contaCaixaId: id } });
    if (sessoes > 0) {
      throw new BusinessRuleError(`A conta '${conta.codigo}' tem sessões de caixa registadas e não pode ser eliminada.`);
    }

    const [recibos, faturas] = await Promise.all([
      this.prisma.reciboVenda.count({ where: { contaBancariaId: id } }),
      this.prisma.faturaVenda.count({ where: { contaBancariaId: id } }),
    ]);
    if (recibos + faturas > 0) {
      throw new BusinessRuleError(
        `A conta '${conta.codigo}' está associada a ${recibos + faturas} documento(s) emitido(s) e não pode ser eliminada.`
      );
    }

    await this.prisma.contaBancaria.delete({ where: { id } });
  }
}

export const contasBancariasService = new ContasBancariasService();
