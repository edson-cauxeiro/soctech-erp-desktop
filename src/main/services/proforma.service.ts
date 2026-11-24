/**
 * @file proforma.service.ts
 * @description Serviço de regras de negócio para Proforma de Venda (FP).
 * Proformas nunca movimentam stock. Ciclo: Rascunho → Emitida → Convertida (FT ou GR) ou Anulada.
 */

import { PrismaClient, ProformaVenda, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { documentoNumeroService, DocumentoNumeroService } from './documento-numero.service';
import { calcularLinhasComerciais } from './documento-calculos';
import { vendasService, VendasService } from './vendas.service';
import { guiaEntregaService, GuiaEntregaService } from './guia-entrega.service';
import {
  criarProformaSchema,
  emitirProformaSchema,
  converterParaFaturaSchema,
  converterParaGuiaSchema,
  anularProformaSchema,
  proformaFiltersSchema,
  CriarProformaInput,
  ProformaFilters,
} from '../validators/proforma.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { contasAtivasDaEmpresa } from './dados-bancarios-documento';

export class ProformaService {
  private prisma: PrismaClient;
  private docNumeroService: DocumentoNumeroService;
  private vendasService: VendasService;
  private guiaService: GuiaEntregaService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    docNumService: DocumentoNumeroService = documentoNumeroService,
    vndService: VendasService = vendasService,
    gService: GuiaEntregaService = guiaEntregaService
  ) {
    this.prisma = prismaClient;
    this.docNumeroService = docNumService;
    this.vendasService = vndService;
    this.guiaService = gService;
  }

  async list(filters?: unknown): Promise<{ items: ProformaVenda[]; total: number }> {
    const validated: ProformaFilters = filters ? proformaFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.ProformaVendaWhereInput = {};

    if (validated.empresaId) where.empresaId = validated.empresaId;
    if (validated.clienteId) where.clienteId = validated.clienteId;
    if (validated.estado) where.estado = validated.estado as any;

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { clienteNome: { contains: s, mode: 'insensitive' } },
        { clienteNif: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (validated.dataInicio || validated.dataFim) {
      where.dataEmissao = {
        ...(validated.dataInicio && { gte: validated.dataInicio }),
        ...(validated.dataFim && { lte: validated.dataFim }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.proformaVenda.findMany({
        where,
        include: {
          empresa: true,
          cliente: true,
          linhas: { include: { artigo: true } },
          guiaEntrega: true,
          faturaVenda: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.proformaVenda.count({ where }),
    ]);

    return { items, total };
  }

  async get(id: string): Promise<ProformaVenda> {
    const proforma = await this.prisma.proformaVenda.findUnique({
      where: { id },
      include: {
        empresa: true,
        cliente: true,
        linhas: { include: { artigo: true } },
        guiaEntrega: true,
        faturaVenda: true,
      },
    });

    if (!proforma) {
      throw new NotFoundError(`Proforma de venda '${id}' não encontrada.`);
    }

    return proforma;
  }

  async criar(rawInput: unknown): Promise<ProformaVenda> {
    const data: CriarProformaInput = criarProformaSchema.parse(rawInput);

    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: data.empresaId } });
    if (!empresa) throw new NotFoundError(`Empresa '${data.empresaId}' não encontrada.`);

    const cliente = await this.prisma.cliente.findUnique({ where: { id: data.clienteId } });
    if (!cliente) throw new NotFoundError(`Cliente '${data.clienteId}' não encontrado.`);

    const artigosMap = new Map<string, any>();
    for (const linha of data.linhas) {
      let art = artigosMap.get(linha.artigoId);
      if (!art) {
        art = await this.prisma.artigo.findUnique({ where: { id: linha.artigoId } });
        if (!art) throw new NotFoundError(`Artigo '${linha.artigoId}' não encontrado.`);
        artigosMap.set(linha.artigoId, art);
      }
    }

    const calculos = calcularLinhasComerciais(data.linhas);
    const dataValidade = data.dataValidade || new Date(data.dataEmissao.getTime() + 15 * 24 * 3600 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const numero = await this.docNumeroService.reservarNumero(tx, 'FP', data.serie, data.empresaId);

      const linhasCreate = calculos.linhas.map((l) => {
        const art = artigosMap.get(l.artigoId);
        return {
          artigoId: l.artigoId,
          artigoCodigo: art.codigo,
          artigoDescricao: art.descricao,
          artigoUnidade: art.unidade,
          quantidade: l.quantidade,
          precoUnitario: l.precoUnitario,
          desconto: l.desconto,
          taxaIva: l.taxaIva,
          motivoIsencao: l.motivoIsencao || data.motivoIsencao || null,
          totalLinha: l.totalLinha,
        };
      });

      return tx.proformaVenda.create({
        data: {
          numero,
          serie: data.serie,
          empresaId: data.empresaId,
          dataEmissao: data.dataEmissao,
          dataValidade,
          moeda: empresa.moedaBase || 'AOA',
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          clienteNif: cliente.nif,
          clienteEndereco: `${cliente.endereco || ''}${cliente.cidade ? `, ${cliente.cidade}` : ''}`,
          encomendaOrigem: data.encomendaOrigem || null,
          motivoIsencao: data.motivoIsencao || null,
          estado: 'rascunho',
          totalIliquido: calculos.totalIliquido,
          totalIva: calculos.totalIva,
          totalLiquido: calculos.totalLiquido,
          linhas: {
            create: linhasCreate,
          },
        },
        include: {
          empresa: true,
          cliente: true,
          linhas: { include: { artigo: true } },
        },
      });
    });
  }

  async emitir(id: string): Promise<ProformaVenda> {
    emitirProformaSchema.parse({ id });

    const proforma = await this.get(id);
    if (proforma.estado !== 'rascunho') {
      throw new BusinessRuleError(`Apenas proformas em rascunho podem ser emitidas. Estado atual: ${proforma.estado}`);
    }

    return this.prisma.proformaVenda.update({
      where: { id: proforma.id },
      data: { estado: 'emitida' },
      include: {
        empresa: true,
        cliente: true,
        linhas: { include: { artigo: true } },
      },
    });
  }

  async converterParaFatura(id: string, payload: { serie: string; armazemExpedicaoId?: string | null }) {
    converterParaFaturaSchema.parse({ id, ...payload });

    const proforma = await this.get(id);
    if (proforma.estado !== 'emitida') {
      throw new BusinessRuleError(`Apenas proformas no estado "emitida" podem ser convertidas. Estado atual: ${proforma.estado}`);
    }

    if (!proforma.empresaId) {
      throw new BusinessRuleError('Proforma não tem empresa associada.');
    }

    const linhasFatura = (proforma as any).linhas.map((l: any) => ({
      artigoId: l.artigoId,
      quantidade: Number(l.quantidade),
      precoUnitario: Number(l.precoUnitario),
      desconto: Number(l.desconto || 0),
      taxaIva: Number(l.taxaIva),
      motivoIsencao: l.motivoIsencao,
    }));

    return this.vendasService.emitirFatura({
      empresaId: proforma.empresaId,
      serie: payload.serie,
      tipo: 'fatura',
      clienteId: proforma.clienteId,
      proformaOrigemId: proforma.id,
      armazemExpedicaoId: payload.armazemExpedicaoId,
      motivoIsencao: proforma.motivoIsencao,
      linhas: linhasFatura,
    });
  }

  async converterParaGuia(id: string, payload: { serie: string; armazemExpedicaoId: string; localEntrega?: string | null; transportador?: string | null }) {
    converterParaGuiaSchema.parse({ id, ...payload });

    const proforma = await this.get(id);
    if (proforma.estado !== 'emitida') {
      throw new BusinessRuleError(`Apenas proformas no estado "emitida" podem ser convertidas. Estado atual: ${proforma.estado}`);
    }

    if (!proforma.empresaId) {
      throw new BusinessRuleError('Proforma não tem empresa associada.');
    }

    const linhasGuia = (proforma as any).linhas.map((l: any) => ({
      artigoId: l.artigoId,
      quantidade: Number(l.quantidade),
    }));

    const guia = await this.guiaService.criar({
      empresaId: proforma.empresaId,
      serie: payload.serie,
      data: new Date(),
      clienteId: proforma.clienteId,
      armazemExpedicaoId: payload.armazemExpedicaoId,
      proformaOrigemId: proforma.id,
      localEntrega: payload.localEntrega || proforma.clienteEndereco,
      transportador: payload.transportador,
      linhas: linhasGuia,
    });

    await this.prisma.proformaVenda.update({
      where: { id: proforma.id },
      data: { estado: 'convertida' },
    });

    return guia;
  }

  async anular(id: string, motivo: string): Promise<ProformaVenda> {
    anularProformaSchema.parse({ id, motivo });

    const proforma = await this.get(id);
    if (proforma.estado === 'anulada') {
      throw new BusinessRuleError(`A proforma '${proforma.numero}' já se encontra anulada.`);
    }

    if (proforma.estado === 'convertida') {
      throw new BusinessRuleError(`Não é possível anular a proforma '${proforma.numero}' porque já se encontra convertida.`);
    }

    return this.prisma.proformaVenda.update({
      where: { id: proforma.id },
      data: {
        estado: 'anulada',
        motivoAnulacao: motivo,
        anuladaEm: new Date(),
      },
      include: {
        empresa: true,
        cliente: true,
        linhas: { include: { artigo: true } },
      },
    });
  }

  async getDocumentoImprimivel(id: string) {
    const proforma = await this.get(id);
    const empresa = (proforma as any).empresa || (await this.prisma.empresaConfig.findFirst());

    if (!empresa) {
      throw new BusinessRuleError('Empresa emissora não configurada.');
    }

    const calculos = calcularLinhasComerciais(
      (proforma as any).linhas.map((l: any) => ({
        artigoId: l.artigoId,
        quantidade: Number(l.quantidade),
        precoUnitario: Number(l.precoUnitario),
        desconto: Number(l.desconto || 0),
        taxaIva: Number(l.taxaIva),
        motivoIsencao: l.motivoIsencao,
      }))
    );

    // A proforma não liquida nada, por isso lista as contas ativas da
    // empresa: é onde o destinatário pode pagar.
    const contasBancarias = await contasAtivasDaEmpresa(
      (proforma as any).empresaId,
      this.prisma
    );

    return {
      tipoDocumento: 'FP' as const,
      tituloDocumento: 'FATURA PROFORMA',
      numero: proforma.numero,
      serie: proforma.serie,
      dataEmissao: proforma.dataEmissao,
      dataVencimento: proforma.dataValidade,
      estado: proforma.estado,
      moeda: proforma.moeda || empresa.moedaBase || 'AOA',
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
        nome: proforma.clienteNome,
        nif: proforma.clienteNif,
        endereco: proforma.clienteEndereco,
        pais: (proforma as any).cliente?.pais || null,
        telefone: (proforma as any).cliente?.telefone || null,
        email: (proforma as any).cliente?.email || null,
      },
      linhas: (proforma as any).linhas.map((l: any, idx: number) => ({
        codigo: l.artigoCodigo || l.artigo?.codigo || '',
        descricao: l.artigoDescricao || l.artigo?.descricao || '',
        unidade: l.artigoUnidade || l.artigo?.unidade || 'UN',
        quantidade: Number(l.quantidade),
        precoUnitario: Number(l.precoUnitario),
        desconto: Number(l.desconto || 0),
        taxaIva: Number(l.taxaIva),
        valorIva: calculos.linhas[idx]?.valorIva ?? 0,
        motivoIsencao: l.motivoIsencao || null,
        totalLinha: Number(l.totalLinha),
      })),
      totais: {
        totalIliquido: Number(proforma.totalIliquido),
        totalDesconto: calculos.totalDesconto,
        totalIva: Number(proforma.totalIva),
        totalLiquido: Number(proforma.totalLiquido),
        resumoIva: calculos.resumoIva,
      },
      documentoOrigem: null,
      observacoes: `Válida até: ${new Date(proforma.dataValidade).toLocaleDateString('pt-PT')}`,
      notice: 'Documento Proforma — Não é documento fiscal e não movimenta stock',
      dadosBancarios: empresa.dadosBancarios || null,
      contasBancarias,
    };
  }
}

export const proformaService = new ProformaService();
