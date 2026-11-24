/**
 * @file guia-entrega.service.ts
 * @description Serviço de regras de negócio para Guia de Entrega / Remessa (GR).
 * Gerencia ciclo de vida: Rascunho → Confirmada (baixa física de stock) → Faturada ou Anulada.
 */

import { PrismaClient, GuiaEntrega, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { stockService, StockService } from './stock.service';
import { movimentoStockService, MovimentoStockService } from './movimento-stock.service';
import { documentoNumeroService, DocumentoNumeroService } from './documento-numero.service';
import { vendasService, VendasService } from './vendas.service';
import {
  criarGuiaEntregaSchema,
  confirmarGuiaEntregaSchema,
  faturarGuiaEntregaSchema,
  anularGuiaEntregaSchema,
  guiaEntregaFiltersSchema,
  CriarGuiaEntregaInput,
  GuiaEntregaFilters,
} from '../validators/guia-entrega.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { contasAtivasDaEmpresa } from './dados-bancarios-documento';

export class GuiaEntregaService {
  private prisma: PrismaClient;
  private stockService: StockService;
  private movimentoStockService: MovimentoStockService;
  private docNumeroService: DocumentoNumeroService;
  private vendasService: VendasService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    stkService: StockService = stockService,
    movService: MovimentoStockService = movimentoStockService,
    docNumService: DocumentoNumeroService = documentoNumeroService,
    vndService: VendasService = vendasService
  ) {
    this.prisma = prismaClient;
    this.stockService = stkService;
    this.movimentoStockService = movService;
    this.docNumeroService = docNumService;
    this.vendasService = vndService;
  }

  async listar(filters?: unknown): Promise<{ items: GuiaEntrega[]; total: number }> {
    const validated: GuiaEntregaFilters = filters ? guiaEntregaFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.GuiaEntregaWhereInput = {};

    if (validated.empresaId) where.empresaId = validated.empresaId;
    if (validated.clienteId) where.clienteId = validated.clienteId;
    if (validated.estado) where.estado = validated.estado as any;

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { clienteNome: { contains: s, mode: 'insensitive' } },
        { clienteNif: { contains: s, mode: 'insensitive' } },
        { localEntrega: { contains: s, mode: 'insensitive' } },
        { transportador: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (validated.dataInicio || validated.dataFim) {
      where.data = {
        ...(validated.dataInicio && { gte: validated.dataInicio }),
        ...(validated.dataFim && { lte: validated.dataFim }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.guiaEntrega.findMany({
        where,
        include: {
          empresa: true,
          cliente: true,
          armazemExpedicao: true,
          linhas: { include: { artigo: true } },
          proformaOrigem: true,
          faturaVenda: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.guiaEntrega.count({ where }),
    ]);

    return { items, total };
  }

  async obter(id: string): Promise<GuiaEntrega> {
    const guia = await this.prisma.guiaEntrega.findUnique({
      where: { id },
      include: {
        empresa: true,
        cliente: true,
        armazemExpedicao: true,
        linhas: { include: { artigo: true } },
        proformaOrigem: true,
        faturaVenda: true,
      },
    });

    if (!guia) {
      throw new NotFoundError(`Guia de entrega '${id}' não encontrada.`);
    }

    return guia;
  }

  async criar(rawInput: unknown): Promise<GuiaEntrega> {
    const data: CriarGuiaEntregaInput = criarGuiaEntregaSchema.parse(rawInput);

    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: data.empresaId } });
    if (!empresa) throw new NotFoundError(`Empresa '${data.empresaId}' não encontrada.`);

    const cliente = await this.prisma.cliente.findUnique({ where: { id: data.clienteId } });
    if (!cliente) throw new NotFoundError(`Cliente '${data.clienteId}' não encontrado.`);

    const armazem = await this.prisma.armazem.findUnique({ where: { id: data.armazemExpedicaoId } });
    if (!armazem) throw new NotFoundError(`Armazém '${data.armazemExpedicaoId}' não encontrado.`);

    // Pré-carrega todos os artigos das linhas numa só consulta (TASK-038).
    const idsArtigos = [...new Set(data.linhas.map((linha) => linha.artigoId))];
    const artigos = await this.prisma.artigo.findMany({ where: { id: { in: idsArtigos } } });
    const artigosMap = new Map<string, any>(artigos.map((artigo) => [artigo.id, artigo]));
    for (const linha of data.linhas) {
      if (!artigosMap.has(linha.artigoId)) {
        throw new NotFoundError(`Artigo '${linha.artigoId}' não encontrado.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const numero = await this.docNumeroService.reservarNumero(tx, 'GR', data.serie, data.empresaId);

      const linhasCreate = data.linhas.map((l) => {
        const art = artigosMap.get(l.artigoId);
        return {
          artigoId: l.artigoId,
          artigoCodigo: art.codigo,
          artigoDescricao: art.descricao,
          artigoUnidade: art.unidade,
          quantidade: l.quantidade,
          lote: l.lote || null,
        };
      });

      return tx.guiaEntrega.create({
        data: {
          numero,
          serie: data.serie,
          empresaId: data.empresaId,
          data: data.data,
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          clienteNif: cliente.nif,
          clienteEndereco: `${cliente.endereco || ''}${cliente.cidade ? `, ${cliente.cidade}` : ''}`,
          armazemExpedicaoId: armazem.id,
          armazemDesignacao: `${armazem.codigo} - ${armazem.designacao}`,
          proformaOrigemId: data.proformaOrigemId || null,
          encomendaOrigem: data.encomendaOrigem || null,
          localEntrega: data.localEntrega || cliente.endereco || null,
          transportador: data.transportador || null,
          observacoes: data.observacoes || null,
          estado: 'rascunho',
          linhas: {
            create: linhasCreate,
          },
        },
        include: {
          empresa: true,
          cliente: true,
          armazemExpedicao: true,
          linhas: { include: { artigo: true } },
        },
      });
    });
  }

  async confirmar(id: string): Promise<GuiaEntrega> {
    confirmarGuiaEntregaSchema.parse({ id });

    const guia = await this.obter(id);
    if (guia.estado !== 'rascunho') {
      throw new BusinessRuleError(`Apenas guias em rascunho podem ser confirmadas. Estado atual: ${guia.estado}`);
    }

    // Validar artigos, lote e stock disponível
    for (const linha of (guia as any).linhas) {
      const artigo = linha.artigo;
      if (artigo.tipo !== 'servico') {
        if (artigo.controloLote && !linha.lote) {
          throw new BusinessRuleError(
            `O artigo '${artigo.codigo} - ${artigo.descricao}' exige controlo de lote, mas nenhum lote foi indicado na linha.`
          );
        }

        const disponivel = await this.stockService.getStockArtigoArmazem(artigo.id, guia.armazemExpedicaoId);
        if (disponivel < Number(linha.quantidade)) {
          throw new BusinessRuleError(
            `Stock insuficiente no armazém para o artigo '${artigo.codigo}'. Disponível: ${disponivel}, Solicitado: ${linha.quantidade}`
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Gerar saídas de stock usando o serviço de movimento que gere lote/estoques atomicamente.
      for (const linha of (guia as any).linhas) {
        const artigo = linha.artigo;
        if (artigo.tipo !== 'servico') {
          await this.movimentoStockService.createMovimentoInTransaction(tx, {
            tipo: 'saida',
            artigoId: artigo.id,
            quantidade: Number(linha.quantidade),
            armazemOrigemId: guia.armazemExpedicaoId,
            lote: linha.lote || null,
            dataValidade: null,
            documentoOrigem: guia.numero,
            custoUnitario: Number(artigo.precoCustoMedio || 0),
            data: new Date(),
          });
        }
      }

      // 2. Atualizar estado da guia
      return tx.guiaEntrega.update({
        where: { id: guia.id },
        data: { estado: 'confirmada' },
        include: {
          empresa: true,
          cliente: true,
          armazemExpedicao: true,
          linhas: { include: { artigo: true } },
        },
      });
    });
  }

  async faturar(id: string, payload: { serie: string }): Promise<any> {
    faturarGuiaEntregaSchema.parse({ id, serie: payload.serie });

    const guia = await this.obter(id);
    if (guia.estado !== 'confirmada') {
      throw new BusinessRuleError(`Apenas guias no estado "confirmada" podem ser faturadas. Estado atual: ${guia.estado}`);
    }

    if (!guia.empresaId) {
      throw new BusinessRuleError('Guia de entrega não tem empresa associada.');
    }

    // Montar linhas da fatura a partir das linhas da guia com preços dos artigos
    const linhasFatura = (guia as any).linhas.map((l: any) => ({
      artigoId: l.artigoId,
      quantidade: Number(l.quantidade),
      precoUnitario: Number(l.artigo.precoVenda || 0),
      taxaIva: Number(l.artigo.taxaIva || 14),
      desconto: 0,
    }));

    return this.vendasService.emitirFatura({
      empresaId: guia.empresaId,
      serie: payload.serie,
      tipo: 'fatura',
      clienteId: guia.clienteId,
      guiaEntregaOrigemId: guia.id,
      linhas: linhasFatura,
    });
  }

  async anular(id: string, motivo: string): Promise<GuiaEntrega> {
    anularGuiaEntregaSchema.parse({ id, motivo });

    const guia = await this.obter(id);
    if (guia.estado === 'anulada') {
      throw new BusinessRuleError(`A guia '${guia.numero}' já se encontra anulada.`);
    }

    if (guia.estado === 'faturada') {
      throw new BusinessRuleError(`Não é possível anular a guia '${guia.numero}' porque já se encontra faturada.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Se estava confirmada, reverte as saídas de stock (cria movimentos de entrada).
      if (guia.estado === 'confirmada') {
        for (const linha of (guia as any).linhas) {
          const artigo = linha.artigo;
          if (artigo.tipo !== 'servico') {
            await this.movimentoStockService.createMovimentoInTransaction(tx, {
              tipo: 'entrada',
              artigoId: artigo.id,
              quantidade: Number(linha.quantidade),
              armazemDestinoId: guia.armazemExpedicaoId,
              lote: linha.lote || null,
              dataValidade: null,
              documentoOrigem: `ANULACAO-${guia.numero}`,
              custoUnitario: Number(artigo.precoCustoMedio || 0),
              data: new Date(),
            });
          }
        }
      }

      return tx.guiaEntrega.update({
        where: { id: guia.id },
        data: {
          estado: 'anulada',
          motivoAnulacao: motivo,
          anuladaEm: new Date(),
        },
        include: {
          empresa: true,
          cliente: true,
          armazemExpedicao: true,
          linhas: { include: { artigo: true } },
        },
      });
    });
  }

  async getDocumentoImprimivel(id: string) {
    const guia = await this.obter(id);
    const empresa = (guia as any).empresa || (await this.prisma.empresaConfig.findFirst());

    if (!empresa) {
      throw new BusinessRuleError('Empresa emissora não configurada.');
    }

    // A guia de entrega não liquida nada, por isso lista as contas ativas
    // da empresa: é onde o destinatário pode pagar.
    const contasBancarias = await contasAtivasDaEmpresa(
      (guia as any).empresaId,
      this.prisma
    );

    return {
      tipoDocumento: 'GR' as const,
      tituloDocumento: 'GUIA DE ENTREGA',
      numero: guia.numero,
      serie: guia.serie,
      dataEmissao: guia.data,
      dataVencimento: null,
      estado: guia.estado,
      moeda: empresa.moedaBase || 'AOA',
      atcud: null,
      hashAssinatura: null,
      qrPayload: null,
      qrDataUrl: null,
      emissor: {
        nome: empresa.nome,
        nif: empresa.nif,
        endereco: empresa.endereco,
        pais: empresa.pais,
        telefone: empresa.telefone || null,
        email: empresa.email || null,
        logotipoUrl: empresa.logotipoUrl || null,
        dadosBancarios: empresa.dadosBancarios || null,
        regimeIva: empresa.regimeIva,
        motivoIsencao: empresa.motivoIsencao,
      },
      destinatario: {
        nome: guia.clienteNome,
        nif: guia.clienteNif,
        endereco: guia.localEntrega || guia.clienteEndereco,
        pais: (guia as any).cliente?.pais || null,
        telefone: (guia as any).cliente?.telefone || null,
        email: (guia as any).cliente?.email || null,
      },
      linhas: (guia as any).linhas.map((l: any) => ({
        codigo: l.artigoCodigo || l.artigo?.codigo || '',
        descricao: l.artigoDescricao || l.artigo?.descricao || '',
        unidade: l.artigoUnidade || l.artigo?.unidade || 'UN',
        quantidade: Number(l.quantidade),
        precoUnitario: 0,
        desconto: 0,
        taxaIva: 0,
        valorIva: 0,
        totalLinha: 0,
        lote: l.lote || null,
      })),
      totais: {
        totalIliquido: 0,
        totalDesconto: 0,
        totalIva: 0,
        totalLiquido: 0,
        resumoIva: [],
      },
      documentoOrigem: (guia as any).proformaOrigem
        ? { tipo: 'PROFORMA', numero: (guia as any).proformaOrigem.numero }
        : null,
      observacoes: `${guia.transportador ? `Transportador: ${guia.transportador}. ` : ''}${guia.observacoes || ''}`.trim() || null,
      notice: 'Não serve como fatura — Documento Logístico de Entrega de Mercadorias',
      dadosBancarios: empresa.dadosBancarios || null,
      contasBancarias,
    };
  }
}

export const guiaEntregaService = new GuiaEntregaService();
