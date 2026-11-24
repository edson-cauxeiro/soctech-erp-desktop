/**
 * @file compras.service.ts
 * @description Serviço de regras de negócio para Compras: Encomendas, Guias de Receção e Faturas de Fornecedor (RF05).
 * Implementa RN05.1 (Entrada Física de Stock na Receção) com destino padrão no Armazém 01 (Geral) e recálculo de PMP.
 */

import {
  PrismaClient,
  EncomendaCompra,
  GuiaRecepcao,
  FaturaCompra,
  Prisma,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { armazemService, ArmazemService } from './armazem.service';
import { stockService, StockService } from './stock.service';
import { movimentoStockService, MovimentoStockService } from './movimento-stock.service';
import {
  createEncomendaCompraSchema,
  createGuiaRecepcaoSchema,
  createFaturaCompraSchema,
  comprasFiltersSchema,
  CreateEncomendaCompraInput,
  CreateGuiaRecepcaoInput,
  CreateFaturaCompraInput,
  ComprasFilters,
} from '../validators/compras.validator';
import { NotFoundError } from '../utils/errors';
import {
  IntegracaoContabilService,
  integracaoContabilService,
} from './integracao-contabil.service';
import { integrarDepoisCommit } from './integracao-contabil-helpers';

export class ComprasService {
  private prisma: PrismaClient;
  private armazemService: ArmazemService;
  private stockService: StockService;
  private movimentoStockService: MovimentoStockService;
  private integracao: IntegracaoContabilService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    armService: ArmazemService = armazemService,
    stkService: StockService = stockService,
    movService: MovimentoStockService = movimentoStockService,
    integracao: IntegracaoContabilService = integracaoContabilService
  ) {
    this.prisma = prismaClient;
    this.armazemService = armService;
    this.stockService = stkService;
    this.movimentoStockService = movService;
    this.integracao = integracao;
  }

  /**
   * Gera numeração para Encomenda de Compra (ex: EC-2026/0001).
   */
  private async generateNumeroEncomenda(): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.prisma.encomendaCompra.count();
    const seq = String(count + 1).padStart(4, '0');
    return `EC-${ano}/${seq}`;
  }

  /**
   * Gera numeração para Guia de Receção (ex: GR-2026/0001).
   */
  private async generateNumeroGuia(): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.prisma.guiaRecepcao.count();
    const seq = String(count + 1).padStart(4, '0');
    return `GR-${ano}/${seq}`;
  }

  /**
   * Gera numeração para Fatura de Fornecedor interna (ex: FC-2026/0001).
   */
  private async generateNumeroFatura(): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.prisma.faturaCompra.count();
    const seq = String(count + 1).padStart(4, '0');
    return `FC-${ano}/${seq}`;
  }

  // ==========================================
  // ENCOMENDAS A FORNECEDOR
  // ==========================================

  async listEncomendas(filters?: unknown): Promise<{ items: EncomendaCompra[]; total: number }> {
    const validated: ComprasFilters = filters ? comprasFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.EncomendaCompraWhereInput = {};

    if (validated.fornecedorId) {
      where.fornecedorId = validated.fornecedorId;
    }

    if (validated.estado) {
      where.estado = validated.estado as any;
    }

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { fornecedor: { nome: { contains: s, mode: 'insensitive' } } },
        { fornecedor: { codigo: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.encomendaCompra.findMany({
        where,
        include: {
          fornecedor: true,
          armazemDestino: true,
          linhas: {
            include: { artigo: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.encomendaCompra.count({ where }),
    ]);

    return { items, total };
  }

  async getEncomenda(id: string): Promise<EncomendaCompra> {
    const enc = await this.prisma.encomendaCompra.findUnique({
      where: { id },
      include: {
        fornecedor: true,
        armazemDestino: true,
        linhas: {
          include: { artigo: true },
        },
        guiasRecepcao: {
          include: {
            linhas: { include: { artigo: true } },
          },
        },
      },
    });

    if (!enc) {
      throw new NotFoundError(`Encomenda de compra com ID '${id}' não encontrada.`);
    }

    return enc;
  }

  async createEncomenda(rawInput: unknown): Promise<EncomendaCompra> {
    const data: CreateEncomendaCompraInput = createEncomendaCompraSchema.parse(rawInput);

    const fornecedor = await this.prisma.fornecedor.findUnique({
      where: { id: data.fornecedorId },
    });
    if (!fornecedor) {
      throw new NotFoundError(`Fornecedor com ID '${data.fornecedorId}' não encontrado.`);
    }

    // Armazém de destino padrão: ARM-01 Geral
    let armazemId = data.armazemDestinoId;
    if (!armazemId) {
      const defaultGeral = await this.armazemService.getDefaultComprasArmazem();
      armazemId = defaultGeral.id;
    }

    const numero = data.numero || (await this.generateNumeroEncomenda());

    // Calcula totais
    let totalIliquido = 0;
    let totalIva = 0;

    const linhasProcessadas = data.linhas.map((linha) => {
      const subtotal = linha.quantidade * linha.precoAcordado;
      const valorIva = subtotal * (linha.taxaIva / 100);
      const totalLinha = subtotal + valorIva;

      totalIliquido += subtotal;
      totalIva += valorIva;

      return {
        artigoId: linha.artigoId,
        quantidade: linha.quantidade,
        precoAcordado: linha.precoAcordado,
        taxaIva: linha.taxaIva,
        totalLinha: Number(totalLinha.toFixed(4)),
      };
    });

    const totalLiquido = totalIliquido + totalIva;

    return this.prisma.encomendaCompra.create({
      data: {
        numero,
        data: data.data,
        fornecedorId: data.fornecedorId,
        dataRecepcao: data.dataRecepcao,
        armazemDestinoId: armazemId,
        estado: data.estado || 'aberta',
        observacoes: data.observacoes ?? null,
        totalIliquido: Number(totalIliquido.toFixed(4)),
        totalIva: Number(totalIva.toFixed(4)),
        totalLiquido: Number(totalLiquido.toFixed(4)),
        linhas: {
          create: linhasProcessadas,
        },
      },
      include: {
        fornecedor: true,
        armazemDestino: true,
        linhas: { include: { artigo: true } },
      },
    });
  }

  // ==========================================
  // GUIAS DE RECEÇÃO (RN05.1: ENTRADA FÍSICA)
  // ==========================================

  async listGuias(filters?: unknown): Promise<{ items: GuiaRecepcao[]; total: number }> {
    const validated: ComprasFilters = filters ? comprasFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.GuiaRecepcaoWhereInput = {};

    if (validated.fornecedorId) {
      where.fornecedorId = validated.fornecedorId;
    }

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { encomenda: { numero: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.guiaRecepcao.findMany({
        where,
        include: {
          encomenda: { include: { fornecedor: true } },
          armazemDestino: true,
          linhas: { include: { artigo: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.guiaRecepcao.count({ where }),
    ]);

    return { items, total };
  }

  async getGuia(id: string): Promise<GuiaRecepcao> {
    const guia = await this.prisma.guiaRecepcao.findUnique({
      where: { id },
      include: {
        encomenda: { include: { fornecedor: true } },
        armazemDestino: true,
        linhas: { include: { artigo: true } },
        faturasCompra: true,
      },
    });

    if (!guia) {
      throw new NotFoundError(`Guia de receção com ID '${id}' não encontrada.`);
    }

    return guia;
  }

  /**
   * RN05.1: Cria a Guia de Receção e gera automaticamente os movimentos físicos
   * de entrada de stock no Armazém de destino (por defeito ARM-01 Geral).
   */
  async createGuiaRecepcao(rawInput: unknown): Promise<GuiaRecepcao> {
    const data: CreateGuiaRecepcaoInput = createGuiaRecepcaoSchema.parse(rawInput);

    // Armazém destino padrão: ARM-01 Geral
    let armazemDestinoId = data.armazemDestinoId;
    if (!armazemDestinoId) {
      const defaultGeral = await this.armazemService.getDefaultComprasArmazem();
      armazemDestinoId = defaultGeral.id;
    }

    const armazem = await this.prisma.armazem.findUnique({
      where: { id: armazemDestinoId },
    });
    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${armazemDestinoId}' não encontrado.`);
    }

    const numero = data.numero || (await this.generateNumeroGuia());

    return this.prisma.$transaction(async (tx) => {
      // 1. Cria o registo da Guia de Receção
      const guia = await tx.guiaRecepcao.create({
        data: {
          numero,
          data: data.data,
          fornecedorId: data.fornecedorId ?? null,
          encomendaId: data.encomendaId ?? null,
          armazemDestinoId,
          conformidade: data.conformidade || 'conforme',
          observacoes: data.observacoes ?? null,
          estado: 'processado',
          linhas: {
            create: data.linhas.map((l) => ({
              artigoId: l.artigoId,
              quantidade: l.quantidade,
              precoCusto: l.precoCusto ?? 0,
              lote: l.lote ?? null,
              validade: l.validade ?? null,
            })),
          },
        },
        include: {
          encomenda: true,
          armazemDestino: true,
          linhas: { include: { artigo: true } },
        },
      });

      // 2. RN05.1: Dá entrada física de stock para cada artigo rececionado.
      // Os artigos das linhas são pré-carregados numa só consulta (TASK-038).
      const idsArtigos = [...new Set(data.linhas.map((linha) => linha.artigoId))];
      const artigos = await tx.artigo.findMany({ where: { id: { in: idsArtigos } } });
      const artigosPorId = new Map(artigos.map((artigo) => [artigo.id, artigo]));

      for (const linha of data.linhas) {
        const artigo = artigosPorId.get(linha.artigoId);
        if (!artigo || artigo.tipo === 'servico') continue;

        // Cria movimento de entrada usando o serviço que gere lote/validade/estoques atomicamente.
        await this.movimentoStockService.createMovimentoInTransaction(tx, {
          tipo: 'entrada',
          artigoId: linha.artigoId,
          quantidade: linha.quantidade,
          armazemDestinoId,
          lote: linha.lote ?? null,
          dataValidade: linha.validade ?? null,
          documentoOrigem: `GR ${numero}`,
          custoUnitario: linha.precoCusto ?? 0,
          data: data.data,
        });

        // RN01.3: Recalcular Custo Médio Ponderado (PMP)
        if ((linha.precoCusto ?? 0) > 0) {
          const pmpAtual = Number(artigo.precoCustoMedio || 0);
          const stockAtualTotal = await this.stockService.getStockTotalArtigo(artigo.id);
          const qtdEntrada = linha.quantidade;
          const custoEntrada = linha.precoCusto || 0;

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
      }

      // 3. Se associada a uma encomenda, atualiza as quantidades recebidas e o estado
      if (data.encomendaId) {
        for (const linha of data.linhas) {
          await tx.linhaEncomendaCompra.updateMany({
            where: {
              encomendaId: data.encomendaId,
              artigoId: linha.artigoId,
            },
            data: {
              quantidadeRecebida: {
                increment: linha.quantidade,
              },
            },
          });
        }

        const linhasEncomenda = await tx.linhaEncomendaCompra.findMany({
          where: { encomendaId: data.encomendaId },
        });

        const todasTotalmenteRecebidas = linhasEncomenda.every(
          (l) => Number(l.quantidadeRecebida) >= Number(l.quantidade)
        );
        const algumaRecebida = linhasEncomenda.some(
          (l) => Number(l.quantidadeRecebida) > 0
        );

        const novoEstado = todasTotalmenteRecebidas ? 'recebida' : algumaRecebida ? 'parcial' : 'aberta';

        await tx.encomendaCompra.update({
          where: { id: data.encomendaId },
          data: { estado: novoEstado },
        });
      }

      return guia;
    });
  }

  // ==========================================
  // FATURAS DE COMPRA / FORNECEDOR
  // ==========================================

  async listFaturas(filters?: unknown): Promise<{ items: FaturaCompra[]; total: number }> {
    const validated: ComprasFilters = filters ? comprasFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.FaturaCompraWhereInput = {};

    if (validated.fornecedorId) {
      where.fornecedorId = validated.fornecedorId;
    }

    if (validated.estado) {
      where.estadoPagamento = validated.estado as any;
    }

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numeroInterno: { contains: s, mode: 'insensitive' } },
        { numeroFornecedor: { contains: s, mode: 'insensitive' } },
        { fornecedor: { nome: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.faturaCompra.findMany({
        where,
        include: {
          fornecedor: true,
          guiaRecepcao: true,
          linhas: { include: { artigo: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.faturaCompra.count({ where }),
    ]);

    return { items, total };
  }

  async getFatura(id: string): Promise<FaturaCompra> {
    const fatura = await this.prisma.faturaCompra.findUnique({
      where: { id },
      include: {
        fornecedor: true,
        guiaRecepcao: true,
        linhas: { include: { artigo: true } },
      },
    });

    if (!fatura) {
      throw new NotFoundError(`Fatura de fornecedor com ID '${id}' não encontrada.`);
    }

    return fatura;
  }

  async createFaturaCompra(rawInput: unknown): Promise<FaturaCompra> {
    const data: CreateFaturaCompraInput = createFaturaCompraSchema.parse(rawInput);

    const fornecedor = await this.prisma.fornecedor.findUnique({
      where: { id: data.fornecedorId },
    });
    if (!fornecedor) {
      throw new NotFoundError(`Fornecedor com ID '${data.fornecedorId}' não encontrado.`);
    }

    const numeroInterno = data.numeroInterno || (await this.generateNumeroFatura());

    let totalIliquido = 0;
    let totalIva = 0;

    const linhasProcessadas = data.linhas.map((linha) => {
      const subtotal = linha.quantidade * linha.precoUnitario;
      const valorIva = subtotal * (linha.taxaIva / 100);
      const totalLinha = subtotal + valorIva;

      totalIliquido += subtotal;
      totalIva += valorIva;

      return {
        artigoId: linha.artigoId,
        quantidade: linha.quantidade,
        precoUnitario: linha.precoUnitario,
        taxaIva: linha.taxaIva,
        totalLinha: Number(totalLinha.toFixed(4)),
      };
    });

    const totalLiquido = totalIliquido + totalIva;

    const fatura = await this.prisma.faturaCompra.create({
      data: {
        numeroInterno,
        numeroFornecedor: data.numeroFornecedor,
        dataEmissao: data.dataEmissao,
        dataVencimento: data.dataVencimento,
        fornecedorId: data.fornecedorId,
        guiaRecepcaoId: data.guiaRecepcaoId ?? null,
        estadoPagamento: data.estadoPagamento || 'pendente',
        retencaoFonte: data.retencaoFonte ?? 0,
        totalIliquido: Number(totalIliquido.toFixed(4)),
        totalIva: Number(totalIva.toFixed(4)),
        totalLiquido: Number(totalLiquido.toFixed(4)),
        linhas: {
          create: linhasProcessadas,
        },
      },
      include: {
        fornecedor: true,
        guiaRecepcao: true,
        linhas: { include: { artigo: true } },
      },
    });

    // A fatura de compra não guarda empresaId: usa o da sessão (quando
    // disponível) ou a primeira empresa configurada. A integração nunca
    // impede o registo da fatura.
    const empresaId =
      data.empresaId ??
      (await this.prisma.empresaConfig.findFirst({ select: { id: true } }))?.id;
    if (empresaId) {
      const taxPorTaxa: Record<string, number> = {};
      for (const linha of data.linhas) {
        const chave = String(linha.taxaIva);
        const iva = linha.quantidade * linha.precoUnitario * (linha.taxaIva / 100);
        taxPorTaxa[chave] = Number(((taxPorTaxa[chave] ?? 0) + iva).toFixed(4));
      }

      await integrarDepoisCommit(`fatura compra ${fatura.numeroInterno || fatura.numeroFornecedor}`, () =>
        this.integracao.contabilizarFaturaCompra({
          empresaId,
          faturaId: fatura.id,
          numeroFatura: fatura.numeroInterno || fatura.numeroFornecedor,
          dados: {
            total: Number(fatura.totalLiquido),
            net: Number(fatura.totalIliquido),
            tax: Number(fatura.totalIva),
            base: Number(fatura.totalIliquido),
            taxPorTaxa,
            dataContabilistica: fatura.dataEmissao,
            dataDocumento: fatura.dataEmissao,
            descricao: `Fatura compra ${fatura.numeroInterno || fatura.numeroFornecedor} — ${fatura.fornecedor?.nome || ''}`.trim(),
          },
        })
      );
    }

    return fatura;
  }
}

export const comprasService = new ComprasService();
