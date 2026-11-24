/**
 * @file movimento-stock.service.ts
 * @description Operações de stock (EPIC 3, TASK-019).
 *
 * Cada operação grava **um** movimento no livro-razão e move **o mesmo saldo**
 * em `estoques`, na mesma transacção (decisão D2). É esta atomicidade que o
 * `stock.service.ts` legado não tinha: escrevia o movimento e voltava a ler o
 * saldo em chamadas separadas, pelo que duas saídas simultâneas podiam ambas
 * passar a verificação de saldo.
 *
 * Duas convenções atravessam o ficheiro e vale a pena dizê-las de uma vez.
 *
 * **A quantidade do movimento é sempre positiva.** O sinal vem de estar em
 * `armazemDestinoId` (entra) ou `armazemOrigemId` (sai). É o que o `CASE` de
 * `verificar_stock.sql` avalia e o que a migração de backfill assumiu.
 *
 * **O saldo é a fonte da verdade.** Nenhuma operação soma movimentos para saber
 * quanto há: lê `estoques`. O CHECK `estoques_quantidade_nao_negativa` é a última
 * linha de defesa contra saldo negativo.
 */

import { PrismaClient, Prisma, TipoMovimentoStock } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { EstoqueRepository, EstoqueCompleto } from '../repositories/inventory.repository';
import { MovimentoStockRepository, MovimentoCompleto } from '../repositories/stock-movement.repository';
import { sequenciaService } from './sequencia.service';
import {
  entradaStockSchema,
  saidaStockSchema,
  transferenciaStockSchema,
  ajusteStockSchema,
  devolucaoStockSchema,
  reservaStockSchema,
  filtrosMovimentoSchema,
  EntradaStockInput,
  SaidaStockInput,
  TransferenciaStockInput,
  AjusteStockInput,
  DevolucaoStockInput,
  ReservaStockInput,
  FiltrosMovimentoInput,
} from '../validators/movimento-stock.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';

/** Posição de stock a afectar numa operação. */
interface Afectado {
  armazemId: string;
  localizacaoId: string | null;
  loteId: string | null;
  /** `1` credita, `-1` debita. */
  sinal: 1 | -1;
  quantidade: Prisma.Decimal;
}

/** Campos gravados no movimento, antes de o número ser atribuído. */
interface MovimentoAGravar {
  numero: string | null;
  tipo: TipoMovimentoStock;
  artigoId: string;
  quantidade: Prisma.Decimal;
  armazemOrigemId: string | null;
  armazemDestinoId: string | null;
  /** Número de lote em texto livre; resolve-se dentro da transacção. */
  lote: string | null;
  /** ID de lote já existente, se o chamador o conhece. */
  loteId: string | null;
  /** Data de validade do lote (opcional), para propagar ao registo de Lote. */
  dataValidade: Date | null;
  documentoOrigem: string;
  documentoTipo: string | null;
  documentoId: string | null;
  criadoPorId: string | null;
  custoUnitario: Prisma.Decimal;
  data: Date;
}

export class MovimentoStockService {
  private prisma: PrismaClient;
  private estoqueRepo: EstoqueRepository;
  private movimentoRepo: MovimentoStockRepository;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    estoqueRepo?: EstoqueRepository,
    movimentoRepo?: MovimentoStockRepository
  ) {
    this.prisma = prismaClient;
    this.estoqueRepo = estoqueRepo ?? new EstoqueRepository(prismaClient);
    this.movimentoRepo = movimentoRepo ?? new MovimentoStockRepository(prismaClient);
  }

  /**
   * Número sequencial do movimento, do formato `MOV-<ano>/<sequência>`.
   *
   * A reserva é atómica (TASK-037): incrementa a tabela `sequencias` dentro da
   * transacção que grava o documento, pelo que duas operações concorrentes
   * nunca recebem o mesmo número.
   */
  private async gerarNumero(tx: Prisma.TransactionClient): Promise<string> {
    return sequenciaService.proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' });
  }

  /**
   * Resolve o lote, criando-o se necessário.
   *
   * `Lote` é único por `(artigoId, numeroLote)`. Uma entrada com um lote novo
   * cria o lote; com um lote que já existe liga ao existente, em vez de falhar
   * numa violação de unicidade que o operador não pode resolver.
   */
  private async resolverLote(
    artigoId: string,
    lote: string | null | undefined,
    loteId: string | null | undefined,
    tx: Prisma.TransactionClient,
    dataValidade?: Date | null
  ): Promise<string | null> {
    if (loteId) {
      const existente = await tx.lote.findUnique({ where: { id: loteId }, select: { id: true } });
      if (!existente) {
        throw new NotFoundError(`Lote com ID '${loteId}' não encontrado.`);
      }
      return loteId;
    }

    if (!lote || lote.trim() === '') return null;

    const numeroLote = lote.trim();
    const existente = await tx.lote.findUnique({
      where: { artigoId_numeroLote: { artigoId, numeroLote } },
      select: { id: true, dataValidade: true },
    });
    if (existente) {
      // Se o lote existe mas não tem dataValidade e foi fornecida, actualiza.
      if (dataValidade && !existente.dataValidade) {
        await tx.lote.update({
          where: { id: existente.id },
          data: { dataValidade },
        });
      }
      return existente.id;
    }

    const criado = await tx.lote.create({
      data: { artigoId, numeroLote, dataValidade: dataValidade ?? undefined },
      select: { id: true },
    });
    return criado.id;
  }

  /**
   * Valida o artigo: tem de existir, não ser serviço, e ter lote se a classe de
   * armazenamento o exigir.
   */
  private async validarArtigo(
    artigoId: string,
    loteId: string | null,
    tx: Prisma.TransactionClient,
    exigirLote: boolean
  ): Promise<{ codigo: string }> {
    const artigo = await tx.artigo.findUnique({
      where: { id: artigoId },
      select: {
        codigo: true,
        tipo: true,
        controloLote: true,
        classeArmazenamento: { select: { exigeLote: true } },
      },
    });

    if (!artigo) {
      throw new NotFoundError(`Artigo com ID '${artigoId}' não encontrado.`);
    }

    if (artigo.tipo === 'servico') {
      throw new BusinessRuleError(
        `O artigo '${artigo.codigo}' é do tipo Serviço e não movimenta stock físico.`
      );
    }

    // O lote pode ser exigido pelo artigo (`controloLote`) ou pela classe de
    // armazenamento (`exigeLote`). Qualquer um dos dois chega. O ajuste
    // desliga a exigência: corrigir o saldo de mercadoria sem etiqueta é
    // precisamente o que o inventário faz.
    const exigeLote =
      exigirLote && (artigo.controloLote || artigo.classeArmazenamento?.exigeLote === true);
    if (exigeLote && !loteId) {
      throw new BusinessRuleError(
        `O artigo '${artigo.codigo}' exige identificação por lote. Indique o lote desta entrada.`
      );
    }

    return { codigo: artigo.codigo };
  }

  /**
   * Aplica as variações de saldo e grava o movimento, na transacção de quem
   * chama.
   *
   * O `updateMany` leva a condição de saldo no `where` em vez de um `find`
   * seguido de `update`. Um `UPDATE ... WHERE quantidade >= x` que não encontra
   * linha devolve `count: 0`, e esse zero é o sinal atómico de que o saldo não
   * chega. O `exigirSaldo` anterior existe para a mensagem de erro, não por
   * segurança: sem ele, o operador leria um erro de concorrência em vez de
   * "stock insuficiente".
   */
  private async aplicar(
    movimento: MovimentoAGravar,
    afectados: Afectado[],
    opcoes: { actualizarPmp?: boolean; exigirLote?: boolean } = {}
  ): Promise<MovimentoCompleto> {
    return this.prisma.$transaction(async (tx) => {
      const loteId = await this.resolverLote(
        movimento.artigoId,
        movimento.lote,
        movimento.loteId,
        tx,
        movimento.dataValidade
      );
      await this.validarArtigo(movimento.artigoId, loteId, tx, opcoes.exigirLote ?? true);

      for (const afectado of afectados) {
        const posicao = await this.estoqueRepo.findOrCreateByPosition(
          {
            artigoId: movimento.artigoId,
            armazemId: afectado.armazemId,
            localizacaoId: afectado.localizacaoId,
            loteId,
          },
          {},
          tx
        );

        // Débito: tem de haver saldo disponível. A reserva conta como saldo
        // ocupado, pelo que o que sai tem de caber em `quantidade -
        // quantidadeReservada`, não só em `quantidade`.
        if (afectado.sinal === -1) {
          await this.exigirSaldo(posicao, afectado.quantidade);
        }

        const actualizado = await tx.estoque.updateMany({
          where: {
            id: posicao.id,
            ...(afectado.sinal === -1 ? { quantidade: { gte: afectado.quantidade } } : {}),
          },
          data: { quantidade: { increment: afectado.quantidade.mul(afectado.sinal) } },
        });

        if (actualizado.count === 0) {
          // Só se chega aqui num débito que perdeu a corrida entre o
          // `findOrCreateByPosition` e o `update`. O CHECK
          // `estoques_quantidade_nao_negativa` continua a ser a rede final.
          throw new BusinessRuleError(
            'O saldo foi consumido por outra operação concorrente. Tente novamente.'
          );
        }

        // O preço médio só se mexe nas entradas, e sobre o saldo resultante.
        if (opcoes.actualizarPmp && afectado.sinal === 1 && movimento.custoUnitario.gt(0)) {
          await this.recalcularPrecoMedio(
            tx,
            movimento.artigoId,
            movimento.custoUnitario,
            afectado.quantidade
          );
        }
      }

      const numero = movimento.numero ?? (await this.gerarNumero(tx));

      return this.movimentoRepo.create(
        {
          numero,
          tipo: movimento.tipo,
          data: movimento.data,
          artigoId: movimento.artigoId,
          quantidade: movimento.quantidade,
          armazemOrigemId: movimento.armazemOrigemId,
          armazemDestinoId: movimento.armazemDestinoId,
          loteId,
          lote: movimento.lote,
          documentoOrigem: movimento.documentoOrigem,
          documentoTipo: movimento.documentoTipo,
          documentoId: movimento.documentoId,
          criadoPorId: movimento.criadoPorId,
          custoUnitario: movimento.custoUnitario,
        },
        tx
      );
    });
  }

  /**
   * Falha com mensagem útil quando a posição não tem saldo para a saída.
   */
  private async exigirSaldo(
    posicao: EstoqueCompleto,
    quantidade: Prisma.Decimal
  ): Promise<void> {
    const disponivel = new Prisma.Decimal(posicao.quantidade).minus(
      new Prisma.Decimal(posicao.quantidadeReservada)
    );

    if (disponivel.lessThan(quantidade)) {
      const local = posicao.localizacao ? ` na localização '${posicao.localizacao.codigo}'` : '';
      throw new BusinessRuleError(
        `Stock insuficiente${local}. Disponível: ${disponivel.toString()}, solicitado: ${quantidade.toString()}.`
      );
    }
  }

  /**
   * Recalcula o preço de custo médio ponderado do artigo.
   *
   * A média é sobre o total do artigo em todos os armazéns, e esse total lê
   * `estoques` (D2), não a soma de movimentos. Posições a zero entram no
   * agregado e não alteram a média, portanto não precisam de filtro.
   */
  private async recalcularPrecoMedio(
    tx: Prisma.TransactionClient,
    artigoId: string,
    custoEntrada: Prisma.Decimal,
    quantidadeEntrada: Prisma.Decimal
  ): Promise<void> {
    const agregacao = await tx.estoque.aggregate({
      where: { artigoId },
      _sum: { quantidade: true },
    });

    // A entrada já está em `estoques` quando isto corre, por isso o total
    // inclui a própria quantidade a valorar e não é preciso somá-la.
    const total = new Prisma.Decimal(agregacao._sum.quantidade ?? 0);
    if (total.lessThanOrEqualTo(0)) return;

    const artigo = await tx.artigo.findUnique({
      where: { id: artigoId },
      select: { precoCustoMedio: true },
    });
    if (!artigo) return;

    const pmpActual = new Prisma.Decimal(artigo.precoCustoMedio);
    const anterior = total.minus(quantidadeEntrada);
    const novoPmp = anterior
      .mul(pmpActual)
      .plus(quantidadeEntrada.mul(custoEntrada))
      .div(total);

    await tx.artigo.update({
      where: { id: artigoId },
      data: { precoCustoMedio: novoPmp.toDecimalPlaces(4) },
    });
  }

  // ── Entrada ──────────────────────────────────────────────────────────────

  /**
   * Entrada de mercadoria. Credita o armazém de destino.
   */
  async registarEntrada(rawInput: unknown): Promise<MovimentoCompleto> {
    const data: EntradaStockInput = entradaStockSchema.parse(rawInput);
    const quantidade = new Prisma.Decimal(data.quantidade);

    return this.aplicar(
      {
        numero: data.numero ?? null,
        tipo: 'entrada',
        artigoId: data.artigoId,
        quantidade,
        armazemOrigemId: null,
        armazemDestinoId: data.armazemDestinoId,
        loteId: null,
        lote: data.lote ?? data.loteId ?? null,
        dataValidade: null,
        documentoOrigem: data.documentoOrigem,
        documentoTipo: data.documentoTipo ?? null,
        documentoId: data.documentoId ?? null,
        criadoPorId: data.criadoPorId ?? null,
        custoUnitario: new Prisma.Decimal(data.custoUnitario ?? 0),
        data: data.data ?? new Date(),
      },
      [
        {
          armazemId: data.armazemDestinoId,
          localizacaoId: data.localizacaoDestinoId ?? null,
          loteId: null,
          sinal: 1,
          quantidade,
        },
      ],
      { actualizarPmp: true }
    );
  }

  // ── Saída ───────────────────────────────────────────────────────────────

  /**
   * Saída de mercadoria. Debita o armazém de origem.
   */
  async registarSaida(rawInput: unknown): Promise<MovimentoCompleto> {
    const data: SaidaStockInput = saidaStockSchema.parse(rawInput);
    const quantidade = new Prisma.Decimal(data.quantidade);

    return this.aplicar(
      {
        numero: data.numero ?? null,
        tipo: 'saida',
        artigoId: data.artigoId,
        quantidade,
        armazemOrigemId: data.armazemOrigemId,
        armazemDestinoId: null,
        loteId: null,
        lote: data.lote ?? data.loteId ?? null,
        dataValidade: null,
        documentoOrigem: data.documentoOrigem,
        documentoTipo: data.documentoTipo ?? null,
        documentoId: data.documentoId ?? null,
        criadoPorId: data.criadoPorId ?? null,
        custoUnitario: new Prisma.Decimal(0),
        data: data.data ?? new Date(),
      },
      [
        {
          armazemId: data.armazemOrigemId,
          localizacaoId: data.localizacaoOrigemId ?? null,
          loteId: null,
          sinal: -1,
          quantidade,
        },
      ]
    );
  }

  // ── Transferência ───────────────────────────────────────────────────────

  /**
   * Transferência entre armazéns: debita a origem e credita o destino na mesma
   * transacção.
   *
   * É o caso em que a atomicidade mais importa. Com duas transações separadas,
   * uma falha a meio deixaria a mercadoria num armazém e o livro-razão a dizer
   * que saiu — e `estoques` deixaria de fechar com os movimentos.
   */
  async registarTransferencia(rawInput: unknown): Promise<MovimentoCompleto> {
    const data: TransferenciaStockInput = transferenciaStockSchema.parse(rawInput);
    const quantidade = new Prisma.Decimal(data.quantidade);

    return this.aplicar(
      {
        numero: data.numero ?? null,
        tipo: 'transferencia',
        artigoId: data.artigoId,
        quantidade,
        armazemOrigemId: data.armazemOrigemId,
        armazemDestinoId: data.armazemDestinoId,
        loteId: null,
        lote: data.lote ?? data.loteId ?? null,
        dataValidade: null,
        documentoOrigem: data.documentoOrigem,
        documentoTipo: data.documentoTipo ?? null,
        documentoId: data.documentoId ?? null,
        criadoPorId: data.criadoPorId ?? null,
        custoUnitario: new Prisma.Decimal(data.custoUnitario ?? 0),
        data: data.data ?? new Date(),
      },
      [
        {
          armazemId: data.armazemOrigemId,
          localizacaoId: data.localizacaoOrigemId ?? null,
          loteId: null,
          sinal: -1,
          quantidade,
        },
        {
          armazemId: data.armazemDestinoId,
          localizacaoId: data.localizacaoDestinoId ?? null,
          loteId: null,
          sinal: 1,
          quantidade,
        },
      ]
    );
  }

  // ── Ajuste ──────────────────────────────────────────────────────────────

  /**
   * Ajuste de inventário: a diferença apurada entra ou sai.
   *
   * A diferença é convertida em sinal aqui. Um `ajuste` negativo não é uma
   * saída comum: é uma correcção de sistema, e é por isso que fica registado
   * como `ajuste` e não como `saida` — o histórico distingue as duas coisas.
   *
   * O saldo resultante pode ser negativo, que é o objectivo: o ajuste existe
   * para corrigir um saldo que a operação anterior não reflectiu. Por isso o
   * CHECK `estoques_quantidade_nao_negativa` tem de estar desligado para esta
   * operação, e isso fica para a TASK-037, com CHECK parcial por operação ou
   * coluna de controlo.
   */
  async registarAjuste(rawInput: unknown): Promise<MovimentoCompleto> {
    const data: AjusteStockInput = ajusteStockSchema.parse(rawInput);

    const diferenca = new Prisma.Decimal(data.diferenca);
    const credita = diferenca.greaterThan(0);
    const quantidade = diferenca.abs();

    return this.aplicar(
      {
        numero: data.numero ?? null,
        tipo: 'ajuste',
        artigoId: data.artigoId,
        quantidade,
        armazemOrigemId: credita ? null : data.armazemId,
        armazemDestinoId: credita ? data.armazemId : null,
        loteId: null,
        lote: data.lote ?? data.loteId ?? null,
        dataValidade: null,
        documentoOrigem: data.documentoOrigem,
        documentoTipo: data.documentoTipo ?? null,
        documentoId: data.documentoId ?? null,
        criadoPorId: data.criadoPorId ?? null,
        custoUnitario: new Prisma.Decimal(data.custoUnitario ?? 0),
        data: data.data ?? new Date(),
      },
      [
        {
          armazemId: data.armazemId,
          localizacaoId: data.localizacaoId ?? null,
          loteId: null,
          sinal: credita ? 1 : -1,
          quantidade,
        },
      ],
      { actualizarPmp: credita, exigirLote: false }
    );
  }

  // ── Devolução ───────────────────────────────────────────────────────────

  /**
   * Devolução: uma saída que volta a entrar no mesmo armazém.
   *
   * Fica registada como `devolucao` e não como `entrada`. O total do artigo
   * volta ao valor anterior, mas o histórico mostra que houve um retorno, e é
   * essa distinção que um relatório de devoluções precisa.
   */
  async registarDevolucao(rawInput: unknown): Promise<MovimentoCompleto> {
    const data: DevolucaoStockInput = devolucaoStockSchema.parse(rawInput);
    const quantidade = new Prisma.Decimal(data.quantidade);

    return this.aplicar(
      {
        numero: data.numero ?? null,
        tipo: 'devolucao',
        artigoId: data.artigoId,
        quantidade,
        armazemOrigemId: null,
        armazemDestinoId: data.armazemId,
        loteId: null,
        lote: data.lote ?? data.loteId ?? null,
        dataValidade: null,
        documentoOrigem: data.documentoOrigem,
        documentoTipo: data.documentoTipo ?? null,
        documentoId: data.documentoId ?? null,
        criadoPorId: data.criadoPorId ?? null,
        custoUnitario: new Prisma.Decimal(data.custoUnitario ?? 0),
        data: data.data ?? new Date(),
      },
      [
        {
          armazemId: data.armazemId,
          localizacaoId: data.localizacaoId ?? null,
          loteId: null,
          sinal: 1,
          quantidade,
        },
      ],
      { actualizarPmp: true }
    );
  }

  // ── Reservas ────────────────────────────────────────────────────────────

  /**
   * Reserva stock para um documento. Não move o saldo: passa de disponível a
   * reservado. É a razão de `disponível = quantidade - quantidadeReservada`.
   */
  async reservarStock(rawInput: unknown): Promise<EstoqueCompleto> {
    const data: ReservaStockInput = reservaStockSchema.parse(rawInput);
    const quantidade = new Prisma.Decimal(data.quantidade);

    return this.prisma.$transaction(async (tx) => {
      const posicao = await this.estoqueRepo.findOrCreateByPosition(
        {
          artigoId: data.artigoId,
          armazemId: data.armazemId,
          localizacaoId: data.localizacaoId ?? null,
          loteId: data.loteId ?? null,
        },
        {},
        tx
      );

      await this.estoqueRepo.reserve(posicao.id, quantidade, tx);

      const actualizada = await this.estoqueRepo.findById(posicao.id, tx);
      if (!actualizada) {
        throw new NotFoundError('A posição de stock desapareceu durante a reserva.');
      }
      return actualizada;
    });
  }

  /**
   * Liberta uma reserva. O saldo não muda; só a reserva.
   */
  async libertarReserva(
    artigoId: string,
    armazemId: string,
    quantidade: number,
    localizacaoId: string | null = null,
    loteId: string | null = null
  ): Promise<EstoqueCompleto> {
    const qtd = new Prisma.Decimal(quantidade);

    return this.prisma.$transaction(async (tx) => {
      const posicao = await this.estoqueRepo.findByPosition(
        { artigoId, armazemId, localizacaoId, loteId },
        tx
      );

      if (!posicao) {
        throw new NotFoundError('Não existe posição de stock para libertar a reserva.');
      }

      await this.estoqueRepo.release(posicao.id, qtd, tx);

      const actualizada = await this.estoqueRepo.findById(posicao.id, tx);
      if (!actualizada) {
        throw new NotFoundError('A posição de stock desapareceu durante a libertação.');
      }
      return actualizada;
    });
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  /**
   * Histórico de movimentos, paginado.
   *
   * A contagem vai pelo mesmo `filtrosWhere` da listagem — dois `where`
   * separados divergem no primeiro filtro novo, e essa divergência aparece como
   * "12 resultados" numa página de 20.
   */
  async listarMovimentos(
    rawInput?: unknown
  ): Promise<{ items: MovimentoCompleto[]; total: number }> {
    const filtros: FiltrosMovimentoInput = filtrosMovimentoSchema.parse(rawInput ?? {});

    const repo = {
      artigoId: filtros.artigoId,
      armazemId: filtros.armazemId,
      loteId: filtros.loteId,
      tipo: filtros.tipo as TipoMovimentoStock | undefined,
      desde: filtros.desde,
      ate: filtros.ate,
      search: filtros.search,
      skip: filtros.skip,
      take: filtros.take,
    };

    const [items, total] = await Promise.all([
      this.movimentoRepo.findMany(repo),
      this.movimentoRepo.count(repo),
    ]);

    return { items, total };
  }

  /**
   * Saldo disponível de um artigo num armazém, lido de `estoques`.
   */
  async consultarSaldo(artigoId: string, armazemId: string): Promise<number> {
    const total = await this.estoqueRepo.availableQuantity({ artigoId, armazemId });
    return total.toNumber();
  }

  /**
   * Cria um movimento de stock dentro de uma transacção já existente.
   *
   * Útil quando o chamador já controla a transacção (ex.: guias de receção,
   * facturas de compra) e precisa de garantir atomicidade com outras operações.
   * Reutiliza toda a lógica de validação, lock, numeração e escrita em estoques.
   */
  async createMovimentoInTransaction(
    tx: Prisma.TransactionClient,
    movimento: {
      tipo: TipoMovimentoStock;
      artigoId: string;
      quantidade: number;
      armazemOrigemId?: string | null;
      armazemDestinoId?: string | null;
      lote?: string | null;
      loteId?: string | null;
      dataValidade?: Date | null;
      documentoOrigem: string;
      documentoTipo?: string | null;
      documentoId?: string | null;
      criadoPorId?: string | null;
      custoUnitario?: number;
      data?: Date;
    }
  ): Promise<MovimentoCompleto> {
    return this.criarMovimentoTx(tx, {
      numero: null,
      tipo: movimento.tipo,
      artigoId: movimento.artigoId,
      quantidade: new Prisma.Decimal(movimento.quantidade),
      armazemOrigemId: movimento.armazemOrigemId ?? null,
      armazemDestinoId: movimento.armazemDestinoId ?? null,
      loteId: null,
      lote: movimento.lote ?? null,
      dataValidade: movimento.dataValidade ?? null,
      documentoOrigem: movimento.documentoOrigem,
      documentoTipo: movimento.documentoTipo ?? null,
      documentoId: movimento.documentoId ?? null,
      criadoPorId: movimento.criadoPorId ?? null,
      custoUnitario: new Prisma.Decimal(movimento.custoUnitario ?? 0),
      data: movimento.data ?? new Date(),
    });
  }

  /**
   * Corpo transaccional de criação de um movimento, para ser usado dentro de
   * uma transacção já existente (ex.: guias de receção, facturas).
   */
  private async criarMovimentoTx(
    tx: Prisma.TransactionClient,
    movimento: MovimentoAGravar
  ): Promise<MovimentoCompleto> {
    const loteId = await this.resolverLote(
      movimento.artigoId,
      movimento.lote,
      movimento.loteId,
      tx,
      movimento.dataValidade
    );
    await this.validarArtigo(movimento.artigoId, loteId, tx, true);

    const afectados: Afectado[] = [];
    if (movimento.tipo === 'entrada' || movimento.tipo === 'ajuste') {
      if (movimento.armazemDestinoId) {
        afectados.push({
          armazemId: movimento.armazemDestinoId,
          localizacaoId: null,
          loteId: null,
          sinal: 1,
          quantidade: movimento.quantidade,
        });
      }
    }
    if (movimento.tipo === 'saida' || movimento.tipo === 'transferencia') {
      if (movimento.armazemOrigemId) {
        afectados.push({
          armazemId: movimento.armazemOrigemId,
          localizacaoId: null,
          loteId: null,
          sinal: -1,
          quantidade: movimento.quantidade,
        });
      }
    }
    if (movimento.tipo === 'transferencia' && movimento.armazemDestinoId) {
      afectados.push({
        armazemId: movimento.armazemDestinoId,
        localizacaoId: null,
        loteId: null,
        sinal: 1,
        quantidade: movimento.quantidade,
      });
    }

    for (const afectado of afectados) {
      const posicao = await this.estoqueRepo.findOrCreateByPosition(
        {
          artigoId: movimento.artigoId,
          armazemId: afectado.armazemId,
          localizacaoId: afectado.localizacaoId,
          loteId,
        },
        {},
        tx
      );

      if (afectado.sinal === -1) {
        await this.exigirSaldo(posicao, afectado.quantidade);
      }

      await this.estoqueRepo.addQuantity(
        posicao.id,
        afectado.sinal === 1 ? afectado.quantidade : afectado.quantidade.mul(-1),
        undefined,
        tx
      );
    }

    const numero = movimento.numero || (await sequenciaService.proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' }));

    const movimentoCriado = await tx.movimentoStock.create({
      data: {
        numero,
        tipo: movimento.tipo,
        data: movimento.data,
        artigoId: movimento.artigoId,
        quantidade: movimento.quantidade,
        armazemOrigemId: movimento.armazemOrigemId,
        armazemDestinoId: movimento.armazemDestinoId,
        lote: movimento.lote,
        loteId,
        documentoOrigem: movimento.documentoOrigem,
        documentoTipo: movimento.documentoTipo,
        documentoId: movimento.documentoId,
        criadoPorId: movimento.criadoPorId,
        custoUnitario: movimento.custoUnitario,
      },
      select: {
        id: true,
        numero: true,
        tipo: true,
        data: true,
        artigoId: true,
        quantidade: true,
        armazemOrigemId: true,
        armazemDestinoId: true,
        localizacaoOrigemId: true,
        localizacaoDestinoId: true,
        lote: true,
        loteId: true,
        documentoOrigem: true,
        documentoTipo: true,
        documentoId: true,
        criadoPorId: true,
        custoUnitario: true,
        artigo: { select: { id: true, codigo: true, descricao: true, unidade: true, tipo: true } },
        armazemOrigem: { select: { id: true, codigo: true, designacao: true } },
        armazemDestino: { select: { id: true, codigo: true, designacao: true } },
        loteNormalizado: { select: { id: true, numeroLote: true, dataValidade: true } },
        localizacaoOrigem: { select: { id: true, codigo: true } },
        localizacaoDestino: { select: { id: true, codigo: true } },
        criadoPor: { select: { id: true, login: true, nomeCompleto: true } },
      },
    });

    return movimentoCriado;
  }
}

export const movimentoStockService = new MovimentoStockService();
