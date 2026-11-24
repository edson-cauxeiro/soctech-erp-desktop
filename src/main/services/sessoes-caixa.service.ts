/**
 * @file sessoes-caixa.service.ts
 * @description Tesouraria — sessões de caixa (abertura, movimentos e fecho).
 *
 * Uma sessão de caixa é a janela de tempo em que alguém tem o dinheiro
 * numerário à sua frente. Só existe uma sessão aberta por caixa de cada vez
 * (garantido pelo índice parcial na base de dados) e, enquanto ela está
 * aberta, qualquer numerário que entre ou saia da caixa fica ligado a ela.
 *
 * O fecho faz a arqueação:
 *     esperado = fundoInicial + Σ(entradas) − Σ(saídas) da sessão
 *     diferença = totalContado − esperado
 */

import { PrismaClient, Prisma, SessaoCaixa } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  abrirSessaoCaixaSchema,
  fecharSessaoCaixaSchema,
  sessaoCaixaFiltersSchema,
  AbrirSessaoCaixaInput,
  FecharSessaoCaixaInput,
  SessaoCaixaFilters,
} from '../validators/tesouraria.validator';
import { NotFoundError, BusinessRuleError, ConflictError } from '../utils/errors';
import { DocumentoNumeroService, documentoNumeroService } from './documento-numero.service';
import { arredondar } from './tesouraria.saldo';

export type SessaoCaixaCompleta = SessaoCaixa & {
  contaCaixa: { id: string; codigo: string; designacao: string };
  utilizadorAbertura: { id: string; nomeCompleto: string } | null;
  utilizadorFecho: { id: string; nomeCompleto: string } | null;
};

export interface ApuramentoSessao {
  fundoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  totalNumerario: number;
  totalMulticaixa: number;
  totalTransferencia: number;
  totalEsperado: number;
  totalContado: number | null;
  diferenca: number | null;
  estado: 'aberta' | 'fechada';
  movimentos: number;
}

export class SessoesCaixaService {
  private prisma: PrismaClient;
  private docNumeroService: DocumentoNumeroService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    docNumService: DocumentoNumeroService = documentoNumeroService
  ) {
    this.prisma = prismaClient;
    this.docNumeroService = docNumService;
  }

  // ===========================================================================
  // Leitura
  // ===========================================================================

  async list(filters?: unknown): Promise<{ items: SessaoCaixaCompleta[]; total: number }> {
    const f: SessaoCaixaFilters = sessaoCaixaFiltersSchema.parse(filters ?? {});

    const where: Prisma.SessaoCaixaWhereInput = {};
    if (f.empresaId) where.empresaId = f.empresaId;
    if (f.contaCaixaId) where.contaCaixaId = f.contaCaixaId;
    if (f.estado) where.estado = f.estado;
    if (f.dataInicio || f.dataFim) {
      where.dataAbertura = {
        ...(f.dataInicio && { gte: f.dataInicio }),
        ...(f.dataFim && { lte: f.dataFim }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.sessaoCaixa.findMany({
        where,
        include: this.incluirRelacoes,
        orderBy: [{ dataAbertura: 'desc' }, { horaAbertura: 'desc' }],
      }),
      this.prisma.sessaoCaixa.count({ where }),
    ]);

    return { items: items as SessaoCaixaCompleta[], total };
  }

  async get(id: string): Promise<SessaoCaixaCompleta> {
    const sessao = await this.prisma.sessaoCaixa.findUnique({
      where: { id },
      include: this.incluirRelacoes,
    });
    if (!sessao) throw new NotFoundError(`Sessão de caixa '${id}' não encontrada.`);
    return sessao as SessaoCaixaCompleta;
  }

  /** Sessão aberta de uma caixa, ou `null`. Base da regra "numerário exige caixa aberta". */
  async getAberta(contaCaixaId: string): Promise<SessaoCaixaCompleta | null> {
    const sessao = await this.prisma.sessaoCaixa.findFirst({
      where: { contaCaixaId, estado: 'aberta' },
      include: this.incluirRelacoes,
    });
    return sessao as SessaoCaixaCompleta | null;
  }

  /**
   * Apuramento de uma sessão em tempo real. Enquanto a sessão está aberta os
   * totais são recalculados a cada leitura; depois do fecho ficam congelados
   * nos campos da própria sessão.
   */
  async apurar(id: string): Promise<ApuramentoSessao> {
    const sessao = await this.get(id);

    // Sessão fechada: os totais foram congelados no fecho, com a mesma regra que
    // uma sessão aberta mostra ao vivo. Devolvê-los evita inventar entradas e
    // saídas a partir de somas que não separam os dois sentidos.
    if (sessao.estado === 'fechada') {
      return {
        fundoInicial: Number(sessao.fundoInicial),
        totalEntradas: Number(sessao.totalEntradas),
        totalSaidas: Number(sessao.totalSaidas),
        totalNumerario: Number(sessao.totalNumerario),
        totalMulticaixa: Number(sessao.totalMulticaixa),
        totalTransferencia: Number(sessao.totalTransferencia),
        totalEsperado: Number(sessao.totalEsperado),
        totalContado: sessao.totalContado === null ? null : Number(sessao.totalContado),
        diferenca: sessao.diferenca === null ? null : Number(sessao.diferenca),
        estado: sessao.estado,
        movimentos: await this.contarMovimentos(id),
      };
    }

    const totais = await this.calcularTotais(sessao);

    return { ...totais, estado: sessao.estado, movimentos: totais.movimentos };
  }

  /**
   * Totais ao vivo de uma sessão aberta, pela mesma regra de saldo das contas:
   * o lado nomeado no movimento decide. Separar numerário de multicaixa usa o
   * `meioPagamento` do movimento; sem ele (movimentos antigos ou ajustes
   * manuais) o valor conta como numerário, porque foi contado como tal.
   */
  private async calcularTotais(
    sessao: SessaoCaixa
  ): Promise<Omit<ApuramentoSessao, 'estado'> & { movimentos: number }> {
    const movimentos = await this.prisma.movimentoTesouraria.findMany({
      where: { sessaoCaixaId: sessao.id, estado: 'confirmado' },
      select: {
        tipo: true,
        valor: true,
        meioPagamento: true,
        contaOrigemId: true,
        contaDestinoId: true,
      },
    });

    let totalEntradas = 0;
    let totalSaidas = 0;
    let totalNumerario = 0;
    let totalMulticaixa = 0;
    let totalTransferencia = 0;

    for (const m of movimentos) {
      const valor = Number(m.valor);

      if (m.contaDestinoId === sessao.contaCaixaId) {
        totalEntradas += valor;
        if (m.tipo === 'transferencia') totalTransferencia += valor;
        else if (m.meioPagamento === 'multicaixa') totalMulticaixa += valor;
        else totalNumerario += valor;
      }

      if (m.contaOrigemId === sessao.contaCaixaId) {
        totalSaidas += valor;
        if (m.tipo === 'transferencia') totalTransferencia += valor;
        else if (m.meioPagamento === 'multicaixa') totalMulticaixa += valor;
        else totalNumerario += valor;
      }
    }

    return {
      fundoInicial: Number(sessao.fundoInicial),
      totalEntradas: arredondar(totalEntradas),
      totalSaidas: arredondar(totalSaidas),
      totalNumerario: arredondar(totalNumerario),
      totalMulticaixa: arredondar(totalMulticaixa),
      totalTransferencia: arredondar(totalTransferencia),
      totalEsperado: arredondar(Number(sessao.fundoInicial) + totalEntradas - totalSaidas),
      totalContado: sessao.totalContado === null ? null : Number(sessao.totalContado),
      diferenca: null,
      movimentos: movimentos.length,
    };
  }

  // ===========================================================================
  // Abertura e fecho
  // ===========================================================================

  async abrir(rawInput: unknown): Promise<SessaoCaixaCompleta> {
    const data: AbrirSessaoCaixaInput = abrirSessaoCaixaSchema.parse(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const conta = await tx.contaBancaria.findUnique({ where: { id: data.contaCaixaId } });
      if (!conta) throw new NotFoundError(`Conta '${data.contaCaixaId}' não encontrada.`);
      if (conta.empresaId !== data.empresaId) {
        throw new BusinessRuleError(
          `A conta de caixa '${conta.codigo}' não pertence a esta empresa.`
        );
      }
      if (conta.tipo !== 'caixa') {
        throw new BusinessRuleError(
          `A conta '${conta.codigo}' é do tipo '${conta.tipo}'. Só contas do tipo caixa têm sessão de caixa.`
        );
      }
      if (!conta.ativo) {
        throw new BusinessRuleError(`A conta de caixa '${conta.codigo}' está inactiva.`);
      }

      const empresa = await tx.empresaConfig.findUnique({ where: { id: data.empresaId } });
      if (!empresa) throw new NotFoundError(`Empresa '${data.empresaId}' não encontrada.`);

      // Dupla verificação: o índice parcial garante isto na base de dados, mas
      // uma mensagem clara vale mais do que um erro de constraint.
      const aberta = await tx.sessaoCaixa.findFirst({
        where: { contaCaixaId: data.contaCaixaId, estado: 'aberta' },
        select: { numero: true },
      });
      if (aberta) {
        throw new ConflictError(
          `A conta de caixa '${conta.codigo}' já tem a sessão '${aberta.numero}' aberta. Feche-a antes de abrir outra.`
        );
      }

      const numero = await this.docNumeroService.reservarNumero(tx, 'SC', 'CX', data.empresaId);
      const agora = new Date();

      const sessao = await tx.sessaoCaixa.create({
        data: {
          empresaId: data.empresaId,
          contaCaixaId: data.contaCaixaId,
          numero,
          dataAbertura: data.dataAbertura,
          horaAbertura: agora,
          fundoInicial: new Prisma.Decimal(data.fundoInicial),
          estado: 'aberta',
          utilizadorAberturaId: data.utilizadorId || null,
        },
        include: this.incluirRelacoes,
      });

      return sessao as SessaoCaixaCompleta;
    });
  }

  /**
   * Fecha a sessão com a contagem de dinheiro feita à mão.
   *
   * Os campos `totalEntradas`, `totalSaidas`, `totalNumerario`,
   * `totalMulticaixa`, `totalTransferencia` e `totalEsperado` ficam com o
   * ESPERADO, calculado dos movimentos pela mesma regra da sessão aberta. O que
   * o operador contou vai para `totalContado`, e a `diferenca` fica registada
   * tal e qual, mesmo que não bata — é informação valiosa, e o gestor decide
   * depois o que fazer (a diferença não é escondida nem corrigida
   * automaticamente).
   */
  async fechar(id: string, rawInput: unknown): Promise<SessaoCaixaCompleta> {
    const input = (rawInput ?? {}) as Record<string, unknown>;
    const data: FecharSessaoCaixaInput = fecharSessaoCaixaSchema.parse({ ...input, id });

    return this.prisma.$transaction(async (tx) => {
      const sessao = await tx.sessaoCaixa.findUnique({ where: { id } });
      if (!sessao) throw new NotFoundError(`Sessão de caixa '${id}' não encontrada.`);
      if (sessao.estado === 'fechada') {
        throw new BusinessRuleError(`A sessão '${sessao.numero}' já está fechada.`);
      }

      const movimentos = await tx.movimentoTesouraria.findMany({
        where: { sessaoCaixaId: id, estado: 'confirmado' },
        select: {
          tipo: true,
          valor: true,
          meioPagamento: true,
          contaOrigemId: true,
          contaDestinoId: true,
        },
      });

      const contaCaixaId = sessao.contaCaixaId;
      let totalEntradas = 0;
      let totalSaidas = 0;
      let totalNumerario = 0;
      let totalMulticaixa = 0;
      let totalTransferencia = 0;

      for (const m of movimentos) {
        const valor = Number(m.valor);

        if (m.contaDestinoId === contaCaixaId) {
          totalEntradas += valor;
          if (m.tipo === 'transferencia') totalTransferencia += valor;
          else if (m.meioPagamento === 'multicaixa') totalMulticaixa += valor;
          else totalNumerario += valor;
        }

        if (m.contaOrigemId === contaCaixaId) {
          totalSaidas += valor;
          if (m.tipo === 'transferencia') totalTransferencia += valor;
          else if (m.meioPagamento === 'multicaixa') totalMulticaixa += valor;
          else totalNumerario += valor;
        }
      }

      const totalEsperado = arredondar(Number(sessao.fundoInicial) + totalEntradas - totalSaidas);
      const totalContado = arredondar(data.totalNumerario + data.totalMulticaixa + data.totalTransferencia);
      const diferenca = arredondar(totalContado - totalEsperado);

      const fechada = await tx.sessaoCaixa.update({
        where: { id },
        data: {
          estado: 'fechada',
          dataFecho: new Date(),
          horaFecho: new Date(),
          totalEntradas: new Prisma.Decimal(arredondar(totalEntradas)),
          totalSaidas: new Prisma.Decimal(arredondar(totalSaidas)),
          totalNumerario: new Prisma.Decimal(arredondar(totalNumerario)),
          totalMulticaixa: new Prisma.Decimal(arredondar(totalMulticaixa)),
          totalTransferencia: new Prisma.Decimal(arredondar(totalTransferencia)),
          totalEsperado: new Prisma.Decimal(totalEsperado),
          totalContado: new Prisma.Decimal(totalContado),
          diferenca: new Prisma.Decimal(diferenca),
          observacoes: data.observacoes || null,
          utilizadorFechoId: data.utilizadorId || null,
        },
        include: this.incluirRelacoes,
      });

      return fechada as SessaoCaixaCompleta;
    });
  }

  /**
   * Movimentos da sessão, para o utilizador conferir o que entrou e saiu
   * antes de fazer a contagem.
   */
  async listarMovimentos(id: string) {
    await this.get(id);

    return this.prisma.movimentoTesouraria.findMany({
      where: { sessaoCaixaId: id },
      include: {
        contaOrigem: { select: { id: true, codigo: true, designacao: true } },
        contaDestino: { select: { id: true, codigo: true, designacao: true } },
        utilizador: { select: { id: true, nomeCompleto: true } },
        estornoDe: { select: { id: true, numero: true } },
      },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private get incluirRelacoes() {
    return {
      contaCaixa: { select: { id: true, codigo: true, designacao: true } },
      utilizadorAbertura: { select: { id: true, nomeCompleto: true } },
      utilizadorFecho: { select: { id: true, nomeCompleto: true } },
    } as const;
  }

  private async contarMovimentos(id: string): Promise<number> {
    return this.prisma.movimentoTesouraria.count({
      where: { sessaoCaixaId: id, estado: 'confirmado' },
    });
  }
}

export const sessoesCaixaService = new SessoesCaixaService();
