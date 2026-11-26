/**
 * @file stock.service.ts
 * @description Serviço de regras de negócio para Movimentação de Estoque, Lotes, Custo Médio e Inventário (RF06).
 * Implementa RN01.2 (Serviços), RN01.3 (PMP), RN06.1 (Bloqueio Stock Negativo), RN06.2 (Lotes) e RN06.3 (Inventário).
 */

import { PrismaClient, MovimentoStock, InventarioContagem, Artigo, Prisma, TipoMovimentoStock } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { armazemService, ArmazemService } from './armazem.service';
import {
  createMovimentoStockSchema,
  transferenciaStockSchema,
  baixaVendaStockSchema,
  criarInventarioSchema,
  stockFiltersSchema,
  stockEstadoFiltersSchema,
  inventarioFiltersSchema,
  CreateMovimentoStockInput,
  TransferenciaStockInput,
  BaixaVendaStockInput,
  CriarInventarioInput,
  StockFilters,
  StockEstadoFilters,
  InventarioFilters,
} from '../validators/stock.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { sequenciaService } from './sequencia.service';

/**
 * Movimentos que aumentam o stock do armazém de destino.
 * `ajuste` aparece nos dois sentidos: o inventário grava a diferença com sinal implícito,
 * preenchendo apenas o destino (divergência positiva) ou apenas a origem (divergência negativa).
 */
const TIPOS_ENTRADA: TipoMovimentoStock[] = ['entrada', 'ajuste', 'transferencia'];

/** Movimentos que diminuem o stock do armazém de origem. */
const TIPOS_SAIDA: TipoMovimentoStock[] = ['saida', 'consumo_producao', 'ajuste', 'transferencia'];

/**
 * Transferências deslocam mercadoria entre armazéns: não alteram o stock total do artigo,
 * pelo que ficam fora do cálculo global.
 */
const TIPOS_ENTRADA_TOTAL: TipoMovimentoStock[] = ['entrada', 'ajuste'];
const TIPOS_SAIDA_TOTAL: TipoMovimentoStock[] = ['saida', 'consumo_producao', 'ajuste'];

/** Situação de um artigo face ao seu limite mínimo de stock e validade de lotes. */
export type SituacaoStock = 'normal' | 'stock_baixo' | 'rutura' | 'proximo_caducar' | 'caducado';

/** Estado de stock de um artigo, conforme apresentado no painel de alertas. */
export interface EstadoArtigoStock {
  artigoId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  estado: string;
  stockAtual: number;
  stockMinimo: number;
  stockMaximo: number;
  pontoEncomenda: number;
  precoCustoMedio: number;
  valorTotal: number;
  situacao: SituacaoStock;
  /** Data de validade mais próxima dos lotes deste artigo (se houver). */
  loteValidadeMaisProxima?: Date | null;
  /** Quantidade de lotes a caducar (dentro da janela de alerta). */
  qtdLotesProximosCaducar?: number;
  /** Quantidade de lotes já caducados. */
  qtdLotesCaducados?: number;
}

/**
 * Contexto de quem executa a operação, preenchido pelo controller a partir da
 * sessão — nunca vindo do cliente. `criadoPorId` alimenta a auditoria de stock
 * (`MovimentoStock.criadoPorId`).
 */
export interface StockContexto {
  criadoPorId?: string | null;
}

/**
 * Campos que uma criação de movimento precisa. É um subconjunto de
 * `CreateMovimentoStockInput`, para que a baixa de uma venda (várias linhas numa
 * única transacção) possa reutilizar o mesmo corpo transaccional.
 */
export interface MovimentoAProcessar {
  tipo: TipoMovimentoStock;
  artigoId: string;
  quantidade: number;
  armazemOrigemId?: string | null;
  armazemDestinoId?: string | null;
  lote?: string | null;
  documentoOrigem: string;
  documentoTipo?: string | null;
  documentoId?: string | null;
  custoUnitario?: number | null;
  data?: Date;
  numero?: string;
}

export class StockService {
  private prisma: PrismaClient;
  private armazemService: ArmazemService;

  constructor(prismaClient: PrismaClient = defaultPrisma, armService: ArmazemService = armazemService) {
    this.prisma = prismaClient;
    this.armazemService = armService;
  }

  /**
   * Calcula o stock atual de um artigo num determinado armazém.
   *
   * O saldo é apurado pelo tipo de movimento: uma `entrada` aumenta o armazém de destino e
   * nunca consome um armazém de origem. Sem esta separação, um movimento de entrada guardado
   * com origem e destino idênticos seria contado simultaneamente como entrada e como saída,
   * anulando-se a zero.
   */
  async getStockArtigoArmazem(artigoId: string, armazemId: string): Promise<number> {
    return this.agregarStockMovimentos(this.prisma, artigoId, armazemId);
  }

  /**
   * Mede a mesma quantidade que `getStockArtigoArmazem`, mas sobre o cliente de
   * transacção (`tx`) em vez do cliente global.
   *
   * O saldo de uma operação de escrita tem de ser lido **dentro** da transacção
   * que move o stock, e não fora: ler pelo `this.prisma` fora da `$transaction`
   * devolvia um valor que outro processo já pode ter alterado antes do
   * `commit`. Este é o escape que a TASK-037 corrige.
   */
  private async getStockArtigoArmazemTx(
    tx: Prisma.TransactionClient,
    artigoId: string,
    armazemId: string,
  ): Promise<number> {
    return this.agregarStockMovimentos(tx, artigoId, armazemId);
  }

  /**
   * Calcula o stock total de um artigo em todos os armazéns.
   * Transferências são neutras para o total e por isso não entram no cálculo.
   */
  async getStockTotalArtigo(artigoId: string): Promise<number> {
    return this.agregarStockTotal(this.prisma, artigoId);
  }

  /** Variante de `getStockTotalArtigo` sobre o cliente de transacção. */
  private async getStockTotalArtigoTx(
    tx: Prisma.TransactionClient,
    artigoId: string,
  ): Promise<number> {
    return this.agregarStockTotal(tx, artigoId);
  }

  /** Agrega entradas/saídas de um artigo num armazém, num cliente. */
  private async agregarStockMovimentos(
    cliente: Prisma.TransactionClient | PrismaClient,
    artigoId: string,
    armazemId: string,
  ): Promise<number> {
    const [entradas, saidas] = await Promise.all([
      cliente.movimentoStock.aggregate({
        where: {
          artigoId,
          armazemDestinoId: armazemId,
          tipo: { in: TIPOS_ENTRADA },
        },
        _sum: { quantidade: true },
      }),
      cliente.movimentoStock.aggregate({
        where: {
          artigoId,
          armazemOrigemId: armazemId,
          tipo: { in: TIPOS_SAIDA },
        },
        _sum: { quantidade: true },
      }),
    ]);

    const totalEntradas = Number(entradas._sum.quantidade || 0);
    const totalSaidas = Number(saidas._sum.quantidade || 0);
    return Number((totalEntradas - totalSaidas).toFixed(4));
  }

  /** Agrega entradas/saídas globais de um artigo, num cliente. */
  private async agregarStockTotal(cliente: Prisma.TransactionClient | PrismaClient, artigoId: string): Promise<number> {
    const [entradas, saidas] = await Promise.all([
      cliente.movimentoStock.aggregate({
        where: {
          artigoId,
          armazemDestinoId: { not: null },
          tipo: { in: TIPOS_ENTRADA_TOTAL },
        },
        _sum: { quantidade: true },
      }),
      cliente.movimentoStock.aggregate({
        where: {
          artigoId,
          armazemOrigemId: { not: null },
          tipo: { in: TIPOS_SAIDA_TOTAL },
        },
        _sum: { quantidade: true },
      }),
    ]);

    const totalEntradas = Number(entradas._sum.quantidade || 0);
    const totalSaidas = Number(saidas._sum.quantidade || 0);
    return Number((totalEntradas - totalSaidas).toFixed(4));
  }

  /**
   * Chaves de lock de concorrência para um artigo/armazéns.
   *
   * Para a transferência, a origem e o destino são trancados **por ordem
   * lexicográfica**: um movimento oposto (A → B vs B → A) tranca as mesmas
   * duas chaves na mesma ordem, por isso nunca há deadlock por troca de ordem.
   */
  private chavesLock(data: { artigoId: string; armazemOrigemId?: string | null; armazemDestinoId?: string | null }): string[] {
    const chaves = new Set<string>();
    for (const armazemId of [data.armazemOrigemId, data.armazemDestinoId]) {
      if (armazemId) chaves.add(`${data.artigoId}|${armazemId}`);
    }
    return [...chaves].sort();
  }

  /**
   * Lista o histórico de movimentos de estoque com filtros.
   */
  async listMovimentos(filters?: unknown): Promise<{ items: MovimentoStock[]; total: number }> {
    const validated: StockFilters = filters ? stockFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.MovimentoStockWhereInput = {};

    if (validated.artigoId) {
      where.artigoId = validated.artigoId;
    }

    if (validated.armazemId) {
      where.OR = [
        { armazemOrigemId: validated.armazemId },
        { armazemDestinoId: validated.armazemId },
      ];
    }

    if (validated.tipo) {
      where.tipo = validated.tipo;
    }

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { documentoOrigem: { contains: s, mode: 'insensitive' } },
        { lote: { contains: s, mode: 'insensitive' } },
        { artigo: { descricao: { contains: s, mode: 'insensitive' } } },
        { artigo: { codigo: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (validated.dataInicio || validated.dataFim) {
      where.data = {
        ...(validated.dataInicio && { gte: validated.dataInicio }),
        ...(validated.dataFim && { lte: validated.dataFim }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.movimentoStock.findMany({
        where,
        include: {
          artigo: {
            select: {
              id: true,
              codigo: true,
              descricao: true,
              unidade: true,
              tipo: true,
            },
          },
          armazemOrigem: {
            select: { id: true, codigo: true, designacao: true },
          },
          armazemDestino: {
            select: { id: true, codigo: true, designacao: true },
          },
        },
        orderBy: { data: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.movimentoStock.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Regista um movimento de stock com validação de regras de negócio:
   * - RN01.2 (Serviços não movimentam stock)
   * - RN06.1 (Bloqueio de Stock Negativo em saídas/transferências)
   * - RN06.2 (Obrigatoriedade de lote se controloLote = true)
   * - RN01.3 (Recálculo de PMP em entradas)
   */
  async createMovimento(rawInput: unknown, contexto: StockContexto = {}): Promise<MovimentoStock> {
    const data: CreateMovimentoStockInput = createMovimentoStockSchema.parse(rawInput);

    const artigo = await this.prisma.artigo.findUnique({
      where: { id: data.artigoId },
    });

    if (!artigo) {
      throw new NotFoundError(`Artigo com ID '${data.artigoId}' não encontrado.`);
    }

    // RN01.2: Artigo do tipo serviço não movimenta estoque
    if (artigo.tipo === 'servico') {
      throw new BusinessRuleError(`O artigo '${artigo.codigo}' é do tipo Serviço e não admite movimentação de stock físico.`);
    }

    // RN06.2: Se controloLote for verdadeiro, o campo lote é obrigatório
    if (artigo.controloLote && (!data.lote || data.lote.trim() === '')) {
      throw new BusinessRuleError(`O artigo '${artigo.codigo}' possui controlo por lote ativado. O campo 'Lote' é obrigatório.`);
    }

    // RN06.1: Um movimento de saída/transferência/consumo precisa de origem.
    // O saldo em si valida-se **dentro** da transacção, depois de trancar o
    // artigo no armazém (TASK-037): validá-lo aqui fora iria ler um valor que
    // outro processo ainda pode alterar antes do `commit`.
    if (data.tipo === 'saida' || data.tipo === 'transferencia' || data.tipo === 'consumo_producao') {
      if (!data.armazemOrigemId) {
        throw new BusinessRuleError('Armazém de origem é obrigatório para este tipo de movimento.');
      }
    }

    return this.prisma.$transaction((tx) => this.criarMovimentoTx(tx, artigo, data, contexto));
  }

  /**
   * Corpo transaccional da criação de um movimento.
   *
   * Extraído de `createMovimento` para poder ser reutilizado numa transacção
   * única — por exemplo, a baixa de uma venda com várias linhas — sem duplicar
   * o lock de concorrência nem a validação de saldo.
   */
  private async criarMovimentoTx(
    tx: Prisma.TransactionClient,
    artigo: Artigo,
    data: MovimentoAProcessar,
    contexto: StockContexto
  ): Promise<MovimentoStock> {
      // Normaliza os armazéns pelo tipo de movimento: uma entrada só entra no
      // destino e uma saída só sai da origem. Sem isto, um valor de origem
      // herdado do formulário (campo oculto) seria gravado e anularia a entrada
      // no cálculo do saldo.
      const movimentaOrigem =
        data.tipo === 'saida' || data.tipo === 'transferencia' || data.tipo === 'consumo_producao' || data.tipo === 'ajuste';
      const movimentaDestino =
        data.tipo === 'entrada' || data.tipo === 'transferencia' || data.tipo === 'ajuste';
      const armazemOrigemId = movimentaOrigem ? data.armazemOrigemId ?? null : null;
      const armazemDestinoId = movimentaDestino ? data.armazemDestinoId ?? null : null;

      if (data.tipo === 'ajuste' && !armazemOrigemId && !armazemDestinoId) {
        throw new BusinessRuleError('Um ajuste de stock exige pelo menos um armazém de origem ou de destino.');
      }

      // TASK-037: lock de concorrência por (artigo, armazém). Só entra aqui
      // quem move o mesmo artigo no mesmo armazém; o lock é libertado no
      // `commit`/`rollback` da transacção (`pg_advisory_xact_lock`). A ordem
      // lexicográfica das chaves evita deadlocks em transferências opostas.
      if (data.tipo === 'saida' || data.tipo === 'transferencia' || data.tipo === 'consumo_producao') {
        for (const chave of this.chavesLock({ artigoId: artigo.id, armazemOrigemId, armazemDestinoId })) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0));`;
        }

        // RN06.1: Bloqueio de Stock Negativo — lido já com a chave trancada.
        const stockDisponivel = await this.getStockArtigoArmazemTx(tx, artigo.id, armazemOrigemId as string);
        if (stockDisponivel < data.quantidade) {
          const armazem = await this.prisma.armazem.findUnique({ where: { id: armazemOrigemId as string } });
          throw new BusinessRuleError(
            `Stock insuficiente no armazém '${armazem?.designacao || data.armazemOrigemId}'. Disponível: ${stockDisponivel} ${artigo.unidade}, Solicitado: ${data.quantidade} ${artigo.unidade}.`
          );
        }
      }

      // Número sequencial atómico, na mesma transacção do movimento (TASK-037).
      // Deixa de ser `count()+1`, que colidia entre processos.
      const numero = data.numero || (await sequenciaService.proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' }));

      // Cria o registo do movimento
      const movimento = await tx.movimentoStock.create({
        data: {
          numero,
          tipo: data.tipo,
          data: data.data || new Date(),
          artigoId: data.artigoId,
          quantidade: data.quantidade,
          armazemOrigemId,
          armazemDestinoId,
          lote: data.lote ?? null,
          documentoOrigem: data.documentoOrigem,
          documentoTipo: data.documentoTipo ?? null,
          documentoId: data.documentoId ?? null,
          criadoPorId: contexto.criadoPorId ?? null,
          custoUnitario: data.custoUnitario ?? 0,
        },
        include: {
          artigo: true,
          armazemOrigem: true,
          armazemDestino: true,
        },
      });

      // RN01.3: Recalcular Custo Médio Ponderado (PMP) na Entrada de material
      if (data.tipo === 'entrada' && (data.custoUnitario ?? 0) > 0) {
        const stockAtualTotal = await this.getStockTotalArtigoTx(tx, artigo.id);
        const pmpAtual = Number(artigo.precoCustoMedio || 0);
        const qtdEntrada = data.quantidade;
        const custoEntrada = data.custoUnitario || 0;

        let novoPmp: number;
        if (stockAtualTotal <= 0) {
          novoPmp = custoEntrada;
        } else {
          novoPmp = (stockAtualTotal * pmpAtual + qtdEntrada * custoEntrada) / (stockAtualTotal + qtdEntrada);
        }

        await tx.artigo.update({
          where: { id: artigo.id },
          data: { precoCustoMedio: Number(novoPmp.toFixed(4)) },
        });
      }

      return movimento;
  }

  /**
   * Realiza uma transferência de stock entre dois armazéns.
   */
  async transferenciaStock(rawInput: unknown, contexto: StockContexto = {}): Promise<MovimentoStock> {
    const data: TransferenciaStockInput = transferenciaStockSchema.parse(rawInput);

    return this.createMovimento(
      {
        tipo: 'transferencia',
        artigoId: data.artigoId,
        quantidade: data.quantidade,
        armazemOrigemId: data.armazemOrigemId,
        armazemDestinoId: data.armazemDestinoId,
        lote: data.lote,
        documentoOrigem: data.documentoOrigem || 'TRANSFERÊNCIA',
      },
      contexto
    );
  }

  /**
   * Processa a baixa de stock para uma venda / emissão de fatura.
   * Utiliza por defeito o Armazém de Vendas (ARM-02).
   */
  async processarBaixaVenda(rawInput: unknown, contexto: StockContexto = {}): Promise<MovimentoStock[]> {
    const data: BaixaVendaStockInput = baixaVendaStockSchema.parse(rawInput);

    let armazemVendasId = data.armazemId;
    if (!armazemVendasId) {
      const defaultVendas = await this.armazemService.getDefaultVendasArmazem();
      armazemVendasId = defaultVendas.id;
    }

    // Pré-carrega os artigos das linhas numa só consulta, em vez de um
    // `findUnique` por linha.
    const idsArtigos = [...new Set(data.linhas.map((linha) => linha.artigoId))];
    const artigos = await this.prisma.artigo.findMany({
      where: { id: { in: idsArtigos } },
    });
    const artigosPorId = new Map(artigos.map((artigo) => [artigo.id, artigo]));

    // Uma única transacção para toda a venda: ou dão baixa todos os movimentos,
    // ou nenhum. O saldo de cada artigo é validado dentro da transacção pelo
    // `criarMovimentoTx` (lock + leitura do saldo já trancado).
    return this.prisma.$transaction(async (tx) => {
      const movimentosCriados: MovimentoStock[] = [];

      for (const linha of data.linhas) {
        const artigo = artigosPorId.get(linha.artigoId);

        if (!artigo || artigo.tipo === 'servico') {
          // Serviços não dão baixa física de stock
          continue;
        }

        const mov = await this.criarMovimentoTx(
          tx,
          artigo,
          {
            tipo: 'saida',
            artigoId: artigo.id,
            quantidade: linha.quantidade,
            armazemOrigemId: armazemVendasId,
            documentoOrigem: data.documentoOrigem,
            custoUnitario: Number(artigo.precoCustoMedio || 0),
          },
          contexto
        );

        movimentosCriados.push(mov);
      }

      return movimentosCriados;
    });
  }

  /**
   * Gera um número sequencial único para inventário (ex: INV-2026/0001).
   *
   * Os inventários são poucos e criados por um operador de cada vez; o escopo
   * da TASK-037 (movimentos/putaway) é que precisa da sequência atómica.
   */
  private async generateNumeroInventario(): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.prisma.inventarioContagem.count();
    const seq = String(count + 1).padStart(4, '0');
    return `INV-${ano}/${seq}`;
  }

  /**
   * Cria um documento de inventário físico com cálculo de diferenças.
   */
  async criarInventario(rawInput: unknown): Promise<InventarioContagem> {
    const data: CriarInventarioInput = criarInventarioSchema.parse(rawInput);

    const armazem = await this.prisma.armazem.findUnique({
      where: { id: data.armazemId },
    });
    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${data.armazemId}' não encontrado.`);
    }

    const numero = data.numero || (await this.generateNumeroInventario());

    // Calcula a quantidade em sistema para todas as linhas com duas agregações
    // agrupadas (entradas/saídas), em vez de dois agregados por linha. As regras
    // de tipo são as mesmas de `getStockArtigoArmazem`.
    const idsArtigos = data.linhas.map((linha) => linha.artigoId);

    const [movimentosEntrada, movimentosSaida] = await Promise.all([
      this.prisma.movimentoStock.groupBy({
        by: ['artigoId'],
        where: {
          artigoId: { in: idsArtigos },
          armazemDestinoId: data.armazemId,
          tipo: { in: TIPOS_ENTRADA },
        },
        _sum: { quantidade: true },
      }),
      this.prisma.movimentoStock.groupBy({
        by: ['artigoId'],
        where: {
          artigoId: { in: idsArtigos },
          armazemOrigemId: data.armazemId,
          tipo: { in: TIPOS_SAIDA },
        },
        _sum: { quantidade: true },
      }),
    ]);

    const entradasPorArtigo = new Map<string, number>(
      movimentosEntrada.map((grupo) => [grupo.artigoId, Number(grupo._sum.quantidade || 0)])
    );
    const saidasPorArtigo = new Map<string, number>(
      movimentosSaida.map((grupo) => [grupo.artigoId, Number(grupo._sum.quantidade || 0)])
    );

    const linhasProcessadas = data.linhas.map((linha) => {
      const entradas = entradasPorArtigo.get(linha.artigoId) || 0;
      const saidas = saidasPorArtigo.get(linha.artigoId) || 0;
      const qtdSistema = Number((entradas - saidas).toFixed(4));
      const diferenca = Number((linha.qtdContada - qtdSistema).toFixed(4));
      return {
        artigoId: linha.artigoId,
        qtdSistema,
        qtdContada: linha.qtdContada,
        diferenca,
        lote: linha.lote ?? null,
      };
    });

    return this.prisma.inventarioContagem.create({
      data: {
        numero,
        data: data.data,
        armazemId: data.armazemId,
        estado: 'em_curso',
        responsavel: data.responsavel ?? null,
        observacoes: data.observacoes ?? null,
        linhas: {
          create: linhasProcessadas,
        },
      },
      include: {
        armazem: true,
        linhas: {
          include: { artigo: true },
        },
      },
    });
  }

  /**
   * Lista contagens de inventário.
   */
  async listInventarios(rawFilters?: unknown): Promise<InventarioContagem[]> {
    // Sem filtros devolve tudo (contrato actual do InventarioManager); com
    // `skip`/`take` pagina no SQL em vez de carregar todas as linhas.
    const filtros: InventarioFilters = rawFilters ? inventarioFiltersSchema.parse(rawFilters) : {};

    return this.prisma.inventarioContagem.findMany({
      skip: filtros.skip,
      take: filtros.take,
      include: {
        armazem: true,
        linhas: {
          include: { artigo: true },
        },
      },
      orderBy: { data: 'desc' },
    });
  }

  /**
   * RN06.3: Fecha o inventário e gera automaticamente movimentos de ajuste para reconciliação.
   */
  async fecharInventario(inventarioId: string, contexto: StockContexto = {}): Promise<InventarioContagem> {
    const inventario = await this.prisma.inventarioContagem.findUnique({
      where: { id: inventarioId },
      include: {
        linhas: {
          include: { artigo: true },
        },
      },
    });

    if (!inventario) {
      throw new NotFoundError(`Inventário com ID '${inventarioId}' não encontrado.`);
    }

    if (inventario.estado === 'fechado') {
      throw new BusinessRuleError('Este inventário já se encontra fechado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Para cada linha com divergência, cria movimento de ajuste
      for (const linha of inventario.linhas) {
        const diferenca = Number(linha.diferenca);
        if (diferenca === 0) continue;

        if (diferenca > 0) {
          // Ajuste positivo (Entrada de acerto no armazém)
          const movNumero = await sequenciaService.proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' });
          await tx.movimentoStock.create({
            data: {
              numero: movNumero,
              tipo: 'ajuste',
              artigoId: linha.artigoId,
              quantidade: diferenca,
              armazemDestinoId: inventario.armazemId,
              lote: linha.lote,
              documentoOrigem: `INV ${inventario.numero}`,
              documentoTipo: 'inventario',
              documentoId: inventario.id,
              criadoPorId: contexto.criadoPorId ?? null,
              custoUnitario: Number(linha.artigo.precoCustoMedio || 0),
            },
          });
        } else {
          // Ajuste negativo (Saída de acerto do armazém)
          const movNumero = await sequenciaService.proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' });
          await tx.movimentoStock.create({
            data: {
              numero: movNumero,
              tipo: 'ajuste',
              artigoId: linha.artigoId,
              quantidade: Math.abs(diferenca),
              armazemOrigemId: inventario.armazemId,
              lote: linha.lote,
              documentoOrigem: `INV ${inventario.numero}`,
              documentoTipo: 'inventario',
              documentoId: inventario.id,
              criadoPorId: contexto.criadoPorId ?? null,
              custoUnitario: Number(linha.artigo.precoCustoMedio || 0),
            },
          });
        }
      }

      return tx.inventarioContagem.update({
        where: { id: inventarioId },
        data: { estado: 'fechado' },
        include: {
          armazem: true,
          linhas: {
            include: { artigo: true },
          },
        },
      });
    });
  }

  /**
   * Obtém o estado de stock de todos os artigos físicos, sinalizando ruturas, stock baixo
   * e artigos dentro dos parâmetros.
   *
   * Ao contrário de uma consulta apenas de violações, devolve sempre a lista completa com as
   * quantidades actuales: o painel de alertas tem de mostrar onde está cada artigo, mesmo
   * quando nenhum limite foi ultrapassado.
   *
   * @param rawFilters - Filtros opcionais (`apenasAlertas`, `search`, `situacao`, paginação).
   * @returns Lista paginada do estado de stock por artigo.
   */
  async getEstadoStock(rawFilters?: unknown): Promise<{ items: EstadoArtigoStock[]; total: number }> {
    const filtros: StockEstadoFilters = rawFilters
      ? stockEstadoFiltersSchema.parse(rawFilters)
      : { skip: 0, take: 200 };

    // A pesquisa e a paginação passam a ser resolvidas em SQL. Os filtros
    // `apenasAlertas`/`situacao` dependem do saldo calculado a partir dos
    // movimentos, pelo que permanecem em memória; nesse caso não se pagina em
    // SQL, para não devolver uma página já parcialmente filtrada.
    const whereArtigos: Prisma.ArtigoWhereInput = {
      tipo: { not: 'servico' },
      estado: 'ativo',
      ...(filtros.search
        ? {
            OR: [
              { codigo: { contains: filtros.search, mode: 'insensitive' } },
              { descricao: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const paginarEmSql = !filtros.apenasAlertas && !filtros.situacao;

    const [artigos, total] = await Promise.all([
      this.prisma.artigo.findMany({
        where: whereArtigos,
        select: {
          id: true,
          codigo: true,
          descricao: true,
          unidade: true,
          estado: true,
          stockMinimo: true,
          stockMaximo: true,
          pontoEncomenda: true,
          precoCustoMedio: true,
          controloLote: true,
        },
        orderBy: { codigo: 'asc' },
        ...(paginarEmSql ? { skip: filtros.skip ?? 0, take: filtros.take ?? 200 } : {}),
      }),
      this.prisma.artigo.count({ where: whereArtigos }),
    ]);

    // Agrega todos os movimentos de uma só vez: duas consultas para a lista inteira, em vez
    // de duas por artigo. As regras de tipo são as mesmas de getStockTotalArtigo, pelo que as
    // transferências entre armazéns não afectam o total.
    const idsArtigos = artigos.map((artigo) => artigo.id);

    const [movimentosEntrada, movimentosSaida, lotesValidade] = await Promise.all([
      this.prisma.movimentoStock.groupBy({
        by: ['artigoId'],
        where: {
          artigoId: { in: idsArtigos },
          armazemDestinoId: { not: null },
          tipo: { in: TIPOS_ENTRADA_TOTAL },
        },
        _sum: { quantidade: true },
      }),
      this.prisma.movimentoStock.groupBy({
        by: ['artigoId'],
        where: {
          artigoId: { in: idsArtigos },
          armazemOrigemId: { not: null },
          tipo: { in: TIPOS_SAIDA_TOTAL },
        },
        _sum: { quantidade: true },
      }),
      // Busca lotes com data de validade para os artigos da lista
      this.prisma.lote.findMany({
        where: {
          artigoId: { in: idsArtigos },
          dataValidade: { not: null },
        },
        select: {
          artigoId: true,
          dataValidade: true,
        },
      }),
    ]);

    const entradasPorArtigo = new Map<string, number>(
      movimentosEntrada.map((grupo) => [grupo.artigoId, Number(grupo._sum.quantidade || 0)])
    );
    const saidasPorArtigo = new Map<string, number>(
      movimentosSaida.map((grupo) => [grupo.artigoId, Number(grupo._sum.quantidade || 0)])
    );

    // Agrupa lotes por artigo e calcula métricas de validade
    const agora = new Date();
    const diasAlerta = await this.obterDiasAlertaValidade();
    const limiteAlerta = new Date(agora);
    limiteAlerta.setDate(limiteAlerta.getDate() + diasAlerta);

    const lotesPorArtigo = new Map<string, { dataValidade: Date }[]>();
    for (const lote of lotesValidade) {
      const arr = lotesPorArtigo.get(lote.artigoId) || [];
      arr.push({ dataValidade: lote.dataValidade! });
      lotesPorArtigo.set(lote.artigoId, arr);
    }

    let estado: EstadoArtigoStock[] = artigos.map((artigo) => {
      const entradas = entradasPorArtigo.get(artigo.id) || 0;
      const saidas = saidasPorArtigo.get(artigo.id) || 0;
      const stockAtual = Number((entradas - saidas).toFixed(4));
      const stockMinimo = Number(artigo.stockMinimo || 0);
      const pmp = Number(artigo.precoCustoMedio || 0);

      // Calcula métricas de validade dos lotes
      const lotesArtigo = lotesPorArtigo.get(artigo.id) || [];
      let loteValidadeMaisProxima: Date | null = null;
      let qtdLotesProximosCaducar = 0;
      let qtdLotesCaducados = 0;

      for (const lote of lotesArtigo) {
        const dataValidade = new Date(lote.dataValidade);
        if (dataValidade < agora) {
          qtdLotesCaducados++;
        } else if (dataValidade <= limiteAlerta) {
          qtdLotesProximosCaducar++;
        }
        if (!loteValidadeMaisProxima || dataValidade < loteValidadeMaisProxima) {
          loteValidadeMaisProxima = dataValidade;
        }
      }

      // Classifica a situação considerando stock e validade
      const situacaoStock = this.classificarSituacaoStock(stockAtual, stockMinimo);
      let situacaoFinal: SituacaoStock = situacaoStock;
      if (qtdLotesCaducados > 0) {
        situacaoFinal = 'caducado';
      } else if (qtdLotesProximosCaducar > 0) {
        situacaoFinal = 'proximo_caducar';
      }

      return {
        artigoId: artigo.id,
        codigo: artigo.codigo,
        descricao: artigo.descricao,
        unidade: artigo.unidade,
        estado: artigo.estado,
        stockAtual,
        stockMinimo,
        stockMaximo: Number(artigo.stockMaximo || 0),
        pontoEncomenda: Number(artigo.pontoEncomenda || 0),
        precoCustoMedio: pmp,
        valorTotal: Number((stockAtual * pmp).toFixed(2)),
        situacao: situacaoFinal,
        loteValidadeMaisProxima,
        qtdLotesProximosCaducar,
        qtdLotesCaducados,
      };
    });

    // Caminho comum (só pesquisa): o resultado já veio paginado do SQL.
    if (paginarEmSql) {
      return { items: estado, total };
    }

    // Filtros dependentes do saldo calculado: aplicam-se em memória. O conjunto
    // veio completo (sem `skip`/`take` em SQL), pelo que a paginação e o total
    // mantêm o comportamento anterior.
    if (filtros.apenasAlertas) {
      estado = estado.filter((linha) => linha.situacao !== 'normal');
    }
    if (filtros.situacao) {
      estado = estado.filter((linha) => linha.situacao === filtros.situacao);
    }

    const skip = filtros.skip ?? 0;
    const take = filtros.take ?? 200;

    return { items: estado.slice(skip, skip + take), total: estado.length };
  }

  /**
   * Classifica a situação de stock de um artigo face ao seu limite mínimo.
   * @param stockAtual - Saldo actual do artigo em todos os armazéns.
   * @param stockMinimo - Limite mínimo configurado no artigo.
   * @returns 'rutura', 'stock_baixo' ou 'normal'.
   */
  private async obterDiasAlertaValidade(): Promise<number> {
    const config = await this.prisma.empresaConfig.findFirst({
      select: { diasAlertaValidade: true },
    });
    return config?.diasAlertaValidade ?? 90;
  }

  private classificarSituacaoStock(stockAtual: number, stockMinimo: number): SituacaoStock {
    if (stockAtual <= 0) {
      return 'rutura';
    }
    if (stockMinimo > 0 && stockAtual <= stockMinimo) {
      return 'stock_baixo';
    }
    return 'normal';
  }
}

export const stockService = new StockService();
