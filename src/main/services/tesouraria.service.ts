/**
 * @file tesouraria.service.ts
 * @description Tesouraria — lançamentos de dinheiro.
 *
 * Semântica dos tipos (FIN-01):
 *   entrada        credita `contaDestinoId` (dinheiro entra)
 *   saida          debita  `contaOrigemId`  (dinheiro sai)
 *   transferencia  debita a origem e credita o destino
 *   ajuste         credita a origem (ou debita, conforme o sinal da conta)
 *   estorno        gerado automaticamente, nunca pedido directamente
 *
 * Dinheiro só entra na conta quando o movimento é `confirmado`. Um movimento
 * `pendente` fica visível para conferência mas não mexe no saldo.
 *
 * Nenhum dinheiro numérico é aceite sem uma sessão de caixa aberta na conta
 * correspondente — é a regra que garante que a arqueação bate certo.
 */

import { PrismaClient, Prisma, MovimentoTesouraria } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarMovimentoSchema,
  estornarMovimentoSchema,
  conciliacaoLoteSchema,
  movimentoFiltersSchema,
  CriarMovimentoInput,
  EstornarMovimentoInput,
  ConciliacaoLoteInput,
  MovimentoFilters,
} from '../validators/tesouraria.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { DocumentoNumeroService, documentoNumeroService } from './documento-numero.service';
import {
  IntegracaoContabilService,
  integracaoContabilService,
} from './integracao-contabil.service';
import { integrarDepoisCommit } from './integracao-contabil-helpers';

export type MovimentoComRelacoes = MovimentoTesouraria & {
  contaOrigem: { id: string; codigo: string; designacao: string } | null;
  contaDestino: { id: string; codigo: string; designacao: string } | null;
  utilizador: { id: string; nomeCompleto: string } | null;
  sessaoCaixa: { id: string; numero: string } | null;
  estornoDe: { id: string; numero: string } | null;
  estornos: Array<{ id: string; numero: string }>;
};

export interface ResumoTesouraria {
  totalEntradas: number;
  totalSaidas: number;
  resultado: number;
  totalMovimentos: number;
  movimentosPendentes: number;
  movimentosNaoConciliados: number;
  porTipo: Record<string, { quantidade: number; total: number }>;
}

function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}

/**
 * Só movimentos manuais são contabilizados aqui. Movimentos ligados a
 * recibos/faturas já são contabilizados pelos módulos de origem; integrá-los
 * outra vez criaria lançamentos duplicados.
 */
function deveIntegrar(movimento: Pick<MovimentoTesouraria, 'documentoTipo' | 'movimentoEstornoId'>): boolean {
  return movimento.documentoTipo === 'manual' && !movimento.movimentoEstornoId;
}

export class TesourariaService {
  private prisma: PrismaClient;
  private docNumeroService: DocumentoNumeroService;
  private integracao: IntegracaoContabilService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    docNumService: DocumentoNumeroService = documentoNumeroService,
    integracao: IntegracaoContabilService = integracaoContabilService
  ) {
    this.prisma = prismaClient;
    this.docNumeroService = docNumService;
    this.integracao = integracao;
  }

  // ===========================================================================
  // Leitura
  // ===========================================================================

  async list(filters?: unknown): Promise<{ items: MovimentoComRelacoes[]; total: number }> {
    const f: MovimentoFilters = filtros(filters);
    const where = this.montarWhere(f);

    const [items, total] = await Promise.all([
      this.prisma.movimentoTesouraria.findMany({
        where,
        include: this.incluirRelacoes,
        orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
        skip: f.skip,
        take: f.take,
      }),
      this.prisma.movimentoTesouraria.count({ where }),
    ]);

    return { items: items as MovimentoComRelacoes[], total };
  }

  async get(id: string): Promise<MovimentoComRelacoes> {
    const movimento = await this.prisma.movimentoTesouraria.findUnique({
      where: { id },
      include: this.incluirRelacoes,
    });

    if (!movimento) throw new NotFoundError(`Movimento de tesouraria '${id}' não encontrado.`);

    return movimento as MovimentoComRelacoes;
  }

  async resumo(filters?: unknown): Promise<ResumoTesouraria> {
    const f: MovimentoFilters = filtros(filters);
    const where = this.montarWhere(f);

    const movimentos = await this.prisma.movimentoTesouraria.findMany({
      where,
      select: { tipo: true, valor: true, estado: true, conciliado: true },
    });

    const porTipo: ResumoTesouraria['porTipo'] = {};
    let totalEntradas = 0;
    let totalSaidas = 0;
    let totalMovimentos = 0;
    let movimentosPendentes = 0;
    let movimentosNaoConciliados = 0;

    for (const m of movimentos) {
      const valor = Number(m.valor);
      totalMovimentos += 1;

      const registo = porTipo[m.tipo] ?? { quantidade: 0, total: 0 };
      registo.quantidade += 1;
      registo.total = arredondar(registo.total + valor);
      porTipo[m.tipo] = registo;

      // Só movimentos confirmados mexem no dinheiro.
      if (m.estado !== 'confirmado') {
        if (m.estado === 'pendente') movimentosPendentes += 1;
        continue;
      }

      if (m.tipo === 'entrada' || m.tipo === 'transferencia') totalEntradas += valor;
      if (m.tipo === 'saida' || m.tipo === 'transferencia') totalSaidas += valor;

      if (!m.conciliado) movimentosNaoConciliados += 1;
    }

    return {
      totalEntradas: arredondar(totalEntradas),
      totalSaidas: arredondar(totalSaidas),
      resultado: arredondar(totalEntradas - totalSaidas),
      totalMovimentos,
      movimentosPendentes,
      movimentosNaoConciliados,
      porTipo,
    };
  }

  // ===========================================================================
  // Escrita
  // ===========================================================================

  async criar(rawInput: unknown): Promise<MovimentoComRelacoes> {
    const data: CriarMovimentoInput = criarMovimentoSchema.parse(rawInput);

    const criado = await this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresaConfig.findUnique({ where: { id: data.empresaId } });
      if (!empresa) throw new NotFoundError(`Empresa '${data.empresaId}' não encontrada.`);

      await this.validarContas(tx, data);

      const sessao = await this.exigirSessaoAberta(tx, data);
      const numero = await this.docNumeroService.reservarNumero(tx, 'TS', 'TES', data.empresaId);

      const criado = await tx.movimentoTesouraria.create({
        data: {
          empresaId: data.empresaId,
          numero,
          data: data.data,
          tipo: data.tipo,
          contaOrigemId: data.tipo === 'entrada' ? null : data.contaOrigemId,
          contaDestinoId: data.tipo === 'saida' ? null : data.contaDestinoId,
          valor: new Prisma.Decimal(data.valor),
          documentoTipo: 'manual',
          descricao: data.descricao || null,
          entidadeTipo: data.entidadeTipo || null,
          entidadeId: data.entidadeId || null,
          observacaoExtrato: data.observacaoExtrato || null,
          estado: 'confirmado',
          meioPagamento: data.meioPagamento ?? null,
          utilizadorId: sessao?.utilizadorAberturaId ?? null,
          sessaoCaixaId: sessao?.id ?? null,
          conciliado: data.conciliado ?? false,
          dataConciliacao: data.dataConciliacao ?? null,
        },
        include: this.incluirRelacoes,
      });

      return criado as MovimentoComRelacoes;
    });

    if (deveIntegrar(criado)) {
      await integrarDepoisCommit(`movimento ${criado.numero}`, () =>
        this.integracao.contabilizarMovimentoTesouraria({
          empresaId: criado.empresaId!,
          movimentoId: criado.id,
          dados: {
            total: Number(criado.valor),
            tipo: criado.tipo,
            dataContabilistica: criado.data,
            descricao: criado.descricao || `Movimento tesouraria ${criado.numero}`,
          },
        })
      );
    }

    return criado;
  }

  /**
   * Estorna um movimento criando o movimento inverso. Nunca apaga o original:
   * quem lê a tesouraria tem de conseguir ver que o dinheiro passou e voltou.
   */
  async estornar(id: string, rawInput: unknown): Promise<MovimentoComRelacoes> {
    const { id: movimentoId, motivo, utilizadorId }: EstornarMovimentoInput = estornarMovimentoSchema.parse({
      ...(rawInput as Record<string, unknown>),
      id,
    });

    const { estorno, original } = await this.prisma.$transaction(async (tx) => {
      const original = await tx.movimentoTesouraria.findUnique({ where: { id: movimentoId } });
      if (!original) throw new NotFoundError(`Movimento de tesouraria '${movimentoId}' não encontrado.`);

      if (original.estado === 'estornado') {
        throw new BusinessRuleError(`O movimento '${original.numero}' já foi estornado.`);
      }

      if (original.movimentoEstornoId) {
        throw new BusinessRuleError(`O movimento '${original.numero}' é ele próprio um estorno e não pode ser estornado.`);
      }

      const jaEstornado = await tx.movimentoTesouraria.findFirst({
        where: { movimentoEstornoId: original.id },
      });
      if (jaEstornado) {
        throw new BusinessRuleError(`O movimento '${original.numero}' já tem o estorno '${jaEstornado.numero}'.`);
      }

      // O inverso troca os papéis das contas. Uma entrada estornada passa a
      // ser uma saída da mesma conta, e vice-versa. Um ajuste continua a ser
      // um ajuste com as contas trocadas: dar-lhe o tipo transferência faria
      // o estorno tocar duas contas num movimento que só toca uma.
      const tipoInverso =
        original.tipo === 'entrada'
          ? 'saida'
          : original.tipo === 'saida'
            ? 'entrada'
            : original.tipo === 'ajuste'
              ? 'ajuste'
              : 'transferencia';

      const numero = await this.docNumeroService.reservarNumero(tx, 'TS', 'TES', original.empresaId!);

      const estorno = await tx.movimentoTesouraria.create({
        data: {
          empresaId: original.empresaId,
          numero,
          data: new Date(),
          tipo: tipoInverso,
          contaOrigemId: original.contaDestinoId,
          contaDestinoId: original.contaOrigemId,
          valor: original.valor,
          documentoTipo: original.documentoTipo,
          documentoId: original.documentoId,
          documentoNumero: original.documentoNumero,
          descricao: `Estorno de ${original.numero}: ${motivo}`,
          estado: 'confirmado',
          meioPagamento: original.meioPagamento,
          utilizadorId: utilizadorId || original.utilizadorId,
          sessaoCaixaId: original.sessaoCaixaId,
          movimentoEstornoId: original.id,
        },
        include: this.incluirRelacoes,
      });

      // O original passa a `estornado`: deixa de contar para o saldo (já foi
      // compensado pelo movimento inverso) mas continua visível.
      await tx.movimentoTesouraria.update({
        where: { id: original.id },
        data: { estado: 'estornado', conciliado: false, dataConciliacao: null },
      });

      return { estorno: estorno as MovimentoComRelacoes, original };
    });

    if (deveIntegrar(original)) {
      await integrarDepoisCommit(`estorno do movimento ${original.numero}`, () =>
        this.integracao.estornarMovimentoTesouraria({
          empresaId: original.empresaId!,
          movimentoId: original.id,
          dataEstorno: estorno.data,
          descricao: `Estorno de movimento ${original.numero}: ${motivo}`,
        })
      );
    }

    return estorno;
  }

  /** Confirma um lançamento que estava pendente, passando a mexer no saldo. */
  async confirmar(id: string): Promise<MovimentoComRelacoes> {
    const movimento = await this.prisma.movimentoTesouraria.findUnique({ where: { id } });
    if (!movimento) throw new NotFoundError(`Movimento de tesouraria '${id}' não encontrado.`);

    if (movimento.estado === 'confirmado') {
      throw new BusinessRuleError(`O movimento '${movimento.numero}' já está confirmado.`);
    }
    if (movimento.estado === 'estornado') {
      throw new BusinessRuleError(`O movimento '${movimento.numero}' está estornado e não pode ser confirmado.`);
    }

    await this.prisma.movimentoTesouraria.update({ where: { id }, data: { estado: 'confirmado' } });
    const confirmado = await this.get(id);

    if (deveIntegrar(confirmado)) {
      await integrarDepoisCommit(`movimento ${confirmado.numero}`, () =>
        this.integracao.contabilizarMovimentoTesouraria({
          empresaId: confirmado.empresaId!,
          movimentoId: confirmado.id,
          dados: {
            total: Number(confirmado.valor),
            tipo: confirmado.tipo,
            dataContabilistica: confirmado.data,
            descricao: confirmado.descricao || `Movimento tesouraria ${confirmado.numero}`,
          },
        })
      );
    }

    return confirmado;
  }

  /** Marca (ou desmarca) um movimento como conciliado com o extracto bancário. */
  async conciliar(id: string, conciliado: boolean, dataConciliacao?: Date): Promise<MovimentoComRelacoes> {
    const movimento = await this.prisma.movimentoTesouraria.findUnique({ where: { id } });
    if (!movimento) throw new NotFoundError(`Movimento de tesouraria '${id}' não encontrado.`);

    if (movimento.estado === 'estornado') {
      throw new BusinessRuleError(
        `O movimento '${movimento.numero}' está estornado. Estorne-o para o saldo ficar correto antes de conciliar.`
      );
    }

    await this.prisma.movimentoTesouraria.update({
      where: { id },
      data: {
        conciliado,
        dataConciliacao: conciliado ? dataConciliacao ?? new Date() : null,
      },
    });

    return this.get(id);
  }

  /** Conciliação em lote: marca vários movimentos de uma vez. */
  async conciliarLote(rawInput: unknown): Promise<{ atualizados: number }> {
    const data: ConciliacaoLoteInput = conciliacaoLoteSchema.parse(rawInput);

    const movimentos = await this.prisma.movimentoTesouraria.findMany({
      where: { id: { in: data.movimentosIds } },
      select: { id: true, numero: true, estado: true, contaOrigemId: true, contaDestinoId: true },
    });

    if (movimentos.length !== data.movimentosIds.length) {
      const encontrados = new Set(movimentos.map((m) => m.id));
      const emFalta = data.movimentosIds.filter((id) => !encontrados.has(id));
      throw new NotFoundError(`Movimento(s) não encontrado(s): ${emFalta.join(', ')}`);
    }

    const estornados = movimentos.filter((m) => m.estado === 'estornado');
    if (estornados.length > 0) {
      throw new BusinessRuleError(
        `Não é possível conciliar movimento(s) estornado(s): ${estornados.map((m) => m.numero).join(', ')}.`
      );
    }

    const foraDaConta = movimentos.filter(
      (m) => m.contaOrigemId !== data.contaBancariaId && m.contaDestinoId !== data.contaBancariaId
    );
    if (foraDaConta.length > 0) {
      throw new BusinessRuleError(
        `Os movimentos ${foraDaConta.map((m) => m.numero).join(', ')} não pertencem à conta indicada.`
      );
    }

    const result = await this.prisma.movimentoTesouraria.updateMany({
      where: { id: { in: data.movimentosIds } },
      data: {
        conciliado: data.conciliado,
        dataConciliacao: data.conciliado ? data.dataConciliacao : null,
      },
    });

    return { atualizados: result.count };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private get incluirRelacoes() {
    return {
      contaOrigem: { select: { id: true, codigo: true, designacao: true } },
      contaDestino: { select: { id: true, codigo: true, designacao: true } },
      utilizador: { select: { id: true, nomeCompleto: true } },
      sessaoCaixa: { select: { id: true, numero: true } },
      estornoDe: { select: { id: true, numero: true } },
      estornos: { select: { id: true, numero: true } },
    } as const;
  }

  private montarWhere(f: MovimentoFilters): Prisma.MovimentoTesourariaWhereInput {
    const where: Prisma.MovimentoTesourariaWhereInput = {};

    if (f.empresaId) where.empresaId = f.empresaId;
    if (f.tipo) where.tipo = f.tipo;
    if (f.estado) where.estado = f.estado;
    if (f.conciliado !== undefined) where.conciliado = f.conciliado;

    if (f.contaId) {
      where.OR = [{ contaOrigemId: f.contaId }, { contaDestinoId: f.contaId }];
    }

    if (f.dataInicio || f.dataFim) {
      where.data = {
        ...(f.dataInicio && { gte: f.dataInicio }),
        ...(f.dataFim && { lte: f.dataFim }),
      };
    }

    if (f.search) {
      const s = f.search;
      where.AND = [
        {
          OR: [
            { numero: { contains: s, mode: 'insensitive' } },
            { descricao: { contains: s, mode: 'insensitive' } },
            { documentoNumero: { contains: s, mode: 'insensitive' } },
            { observacaoExtrato: { contains: s, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private async validarContas(
    tx: Prisma.TransactionClient,
    data: CriarMovimentoInput
  ): Promise<void> {
    const ids = [data.contaOrigemId, data.contaDestinoId].filter(Boolean) as string[];
    if (ids.length === 0) return;

    const contas = await tx.contaBancaria.findMany({ where: { id: { in: ids } } });
    const porId = new Map(contas.map((c) => [c.id, c]));

    for (const id of ids) {
      const conta = porId.get(id);
      if (!conta) throw new NotFoundError(`Conta bancária '${id}' não encontrada.`);
      // Uma conta de outra empresa não é "inexistente", é intocável: sem esta
      // verificação, um lançamento da empresa A mexe no saldo da empresa B.
      if (conta.empresaId !== data.empresaId) {
        throw new BusinessRuleError(
          `A conta '${conta.codigo}' não pertence a esta empresa.`
        );
      }
      if (!conta.ativo) {
        throw new BusinessRuleError(`A conta '${conta.codigo}' está inactiva e não pode receber movimentos.`);
      }
    }
  }

  /**
   * Numerário só entra numa conta de caixa se existir uma sessão aberta.
   * O meio de pagamento vem do documento que originou o movimento; quando não
   * é conhecido, assumimos numerário porque foi explicitamente indicado que a
   * operação decorre dentro de uma sessão.
   */
  private async exigirSessaoAberta(
    tx: Prisma.TransactionClient,
    data: Pick<CriarMovimentoInput, 'empresaId' | 'tipo' | 'contaOrigemId' | 'contaDestinoId'>
  ): Promise<{ id: string; utilizadorAberturaId: string | null } | null> {
    const contaId = data.tipo === 'entrada' ? data.contaDestinoId : data.contaOrigemId;
    if (!contaId) return null;

    const conta = await tx.contaBancaria.findUnique({ where: { id: contaId } });
    if (!conta) throw new NotFoundError(`Conta bancária '${contaId}' não encontrada.`);

    // Contas bancárias não têm arqueação: o extracto é a fonte de verdade.
    if (conta.tipo !== 'caixa') return null;

    const sessao = await tx.sessaoCaixa.findFirst({
      where: { contaCaixaId: contaId, empresaId: data.empresaId, estado: 'aberta' },
      select: { id: true, utilizadorAberturaId: true },
    });

    if (!sessao) {
      throw new BusinessRuleError(
        `A conta de caixa '${conta.codigo}' não tem sessão aberta. Abra a sessão de caixa antes de registar numerário.`
      );
    }

    return sessao;
  }

  /**
   * Usado pela faturação: confirma se o meio de pagamento escolhido exige uma
   * sessão de caixa aberta, para o formulário poder avisar antes de submeter.
   *
   * Tem de coincidir com `exigirSessaoAberta`: qualquer valor que entra ou sai
   * de uma caixa conta-se à mão, venha de onde vier. Uma transferência do banco
   * para a caixa também entra na contagem (é o `totalTransferencia` da
   * sessão), por isso exige caixa aberta como o resto.
   */
  async validarMeioPagamento(params: {
    empresaId: string;
    meioPagamento: string;
    contaBancariaId: string;
  }): Promise<{ exigeSessao: boolean; sessaoAberta: boolean; numeroSessao: string | null }> {
    const conta = await this.prisma.contaBancaria.findUnique({
      where: { id: params.contaBancariaId },
    });
    if (!conta) throw new NotFoundError(`Conta bancária '${params.contaBancariaId}' não encontrada.`);

    const exigeSessao = conta.tipo === 'caixa';

    if (!exigeSessao) return { exigeSessao: false, sessaoAberta: true, numeroSessao: null };

    const sessao = await this.prisma.sessaoCaixa.findFirst({
      where: { contaCaixaId: conta.id, empresaId: params.empresaId, estado: 'aberta' },
      select: { numero: true },
    });

    return {
      exigeSessao: true,
      sessaoAberta: Boolean(sessao),
      numeroSessao: sessao?.numero ?? null,
    };
  }
}

function filtros(filters?: unknown): MovimentoFilters {
  return filters ? movimentoFiltersSchema.parse(filters) : { skip: 0, take: 100 };
}

export const tesourariaService = new TesourariaService();
