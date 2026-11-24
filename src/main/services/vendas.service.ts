/**
 * @file vendas.service.ts
 * @description Serviço de regras de negócio para Vendas e Faturação Fiscal (FT, FR, NC, ND).
 * Suporta origens (GR→FT, FP→FT), série atómica com DocumentoNumeroService,
 * regras de saída de stock, anulação com trilha de auditoria e modelo de impressão fiscal com AGT QR.
 */

import { PrismaClient, FaturaVenda, Prisma, TipoSerieDocumento } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { armazemService, ArmazemService } from './armazem.service';
import { stockService, StockService } from './stock.service';
import { documentoNumeroService, DocumentoNumeroService } from './documento-numero.service';
import { calcularLinhasComerciais } from './documento-calculos';
import { buildAgtVerificationUrl, generateAgtQrDataUrl } from '../utils/agt-qr';
import {
  emitirFaturaVendaSchema,
  vendasFiltersSchema,
  anularFaturaSchema,
  EmitirFaturaVendaInput,
  VendasFilters,
} from '../validators/vendas.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { contaDoDocumento, contasAtivasDaEmpresa } from './dados-bancarios-documento';
import {
  IntegracaoContabilService,
  integracaoContabilService,
} from './integracao-contabil.service';
import { integrarDepoisCommit } from './integracao-contabil-helpers';

export class VendasService {
  private prisma: PrismaClient;
  private armazemService: ArmazemService;
  private stockService: StockService;
  private docNumeroService: DocumentoNumeroService;
  private integracao: IntegracaoContabilService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    armService: ArmazemService = armazemService,
    stkService: StockService = stockService,
    docNumService: DocumentoNumeroService = documentoNumeroService,
    integracao: IntegracaoContabilService = integracaoContabilService
  ) {
    this.prisma = prismaClient;
    this.armazemService = armService;
    this.stockService = stkService;
    this.docNumeroService = docNumService;
    this.integracao = integracao;
  }

  /**
   * Lista faturas de venda emitidas com filtros e paginação.
   */
  async listFaturas(filters?: unknown): Promise<{ items: FaturaVenda[]; total: number }> {
    const validated: VendasFilters = filters ? vendasFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.FaturaVendaWhereInput = {};

    if (validated.empresaId) {
      where.empresaId = validated.empresaId;
    }

    if (validated.clienteId) {
      where.clienteId = validated.clienteId;
    }

    if (validated.tipo) {
      where.tipo = validated.tipo as any;
    }

    if (validated.estadoDocumento) {
      where.estadoDocumento = validated.estadoDocumento as any;
    }

    if (validated.estadoPagamento) {
      where.estadoPagamento = validated.estadoPagamento as any;
    }

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { clienteNome: { contains: s, mode: 'insensitive' } },
        { clienteNif: { contains: s, mode: 'insensitive' } },
        { atcud: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (validated.dataInicio || validated.dataFim) {
      where.dataEmissao = {
        ...(validated.dataInicio && { gte: validated.dataInicio }),
        ...(validated.dataFim && { lte: validated.dataFim }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.faturaVenda.findMany({
        where,
        include: {
          empresa: true,
          cliente: true,
          linhas: {
            include: { artigo: true },
          },
          faturaOrigem: true,
          proformaOrigem: true,
          guiaEntregaOrigem: true,
          notasCredito: true,
          imputacoesRecibo: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.faturaVenda.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Obtém os detalhes completos de uma fatura de venda por ID.
   */
  async getFatura(id: string): Promise<FaturaVenda> {
    const fatura = await this.prisma.faturaVenda.findUnique({
      where: { id },
      include: {
        empresa: true,
        cliente: true,
        linhas: {
          include: { artigo: true },
        },
        faturaOrigem: true,
        proformaOrigem: true,
        guiaEntregaOrigem: true,
        notasCredito: true,
        imputacoesRecibo: {
          include: { recibo: true },
        },
      },
    });

    if (!fatura) {
      throw new NotFoundError(`Fatura de venda com ID '${id}' não encontrada.`);
    }

    return fatura;
  }

  /**
   * Emite uma fatura de venda (FT, FR, NC, ND) com número atómico de série,
   * snapshot de cliente/artigos e gestão de baixas de stock.
   */
  async emitirFatura(rawInput: unknown): Promise<FaturaVenda> {
    const data: EmitirFaturaVendaInput = emitirFaturaVendaSchema.parse(rawInput);

    // 1. Obter empresa
    const empresa = await this.prisma.empresaConfig.findUnique({
      where: { id: data.empresaId },
    });
    if (!empresa) {
      throw new NotFoundError(`Empresa com ID '${data.empresaId}' não encontrada.`);
    }

    // 2. Obter cliente para snapshot fiscal
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: data.clienteId },
    });
    if (!cliente) {
      throw new NotFoundError(`Cliente com ID '${data.clienteId}' não encontrado.`);
    }

    // 3. Validações de origem
    let guiaOrigem: any = null;
    let proformaOrigem: any = null;
    let faturaOrigem: any = null;

    if (data.guiaEntregaOrigemId) {
      guiaOrigem = await this.prisma.guiaEntrega.findUnique({
        where: { id: data.guiaEntregaOrigemId },
      });
      if (!guiaOrigem) {
        throw new NotFoundError(`Guia de entrega de origem '${data.guiaEntregaOrigemId}' não encontrada.`);
      }
      if (guiaOrigem.estado !== 'confirmada') {
        throw new BusinessRuleError('Apenas guias de entrega no estado "confirmada" podem ser faturadas.');
      }
      if (guiaOrigem.clienteId !== data.clienteId) {
        throw new BusinessRuleError('O cliente da fatura deve coincidir com o cliente da guia de entrega de origem.');
      }
    }

    if (data.proformaOrigemId) {
      proformaOrigem = await this.prisma.proformaVenda.findUnique({
        where: { id: data.proformaOrigemId },
      });
      if (!proformaOrigem) {
        throw new NotFoundError(`Proforma de origem '${data.proformaOrigemId}' não encontrada.`);
      }
      if (proformaOrigem.estado !== 'emitida') {
        throw new BusinessRuleError('Apenas proformas no estado "emitida" podem ser convertidas em fatura.');
      }
    }

    if (data.tipo === 'nota_credito') {
      if (!data.faturaOrigemId) {
        throw new BusinessRuleError('Nota de crédito requer a identificação da fatura retificada.');
      }
      faturaOrigem = await this.prisma.faturaVenda.findUnique({
        where: { id: data.faturaOrigemId },
      });
      if (!faturaOrigem) {
        throw new NotFoundError(`Fatura original '${data.faturaOrigemId}' não encontrada.`);
      }
      if (faturaOrigem.estadoDocumento === 'anulado') {
        throw new BusinessRuleError('Não é possível emitir nota de crédito sobre uma fatura já anulada.');
      }
    }

    // 4. Determinar armazém de venda se for fatura direta com movimento físico
    const moveStock = !guiaOrigem && data.tipo !== 'nota_credito';
    let armazemExpedicaoId = data.armazemExpedicaoId;

    if (moveStock) {
      if (!armazemExpedicaoId) {
        const defaultVendas = await this.armazemService.getDefaultVendasArmazem();
        armazemExpedicaoId = defaultVendas.id;
      }
      const armazem = await this.prisma.armazem.findUnique({
        where: { id: armazemExpedicaoId },
      });
      if (!armazem) {
        throw new NotFoundError(`Armazém com ID '${armazemExpedicaoId}' não encontrado.`);
      }
    }

    // 5. Validar artigos e verificar stock disponível quando aplicável
    const artigosMap = new Map<string, any>();
    for (const linha of data.linhas) {
      let artigo = artigosMap.get(linha.artigoId);
      if (!artigo) {
        artigo = await this.prisma.artigo.findUnique({
          where: { id: linha.artigoId },
        });
        if (!artigo) {
          throw new NotFoundError(`Artigo com ID '${linha.artigoId}' não encontrado.`);
        }
        artigosMap.set(linha.artigoId, artigo);
      }

      if (moveStock && artigo.tipo !== 'servico' && armazemExpedicaoId) {
        const stockDisponivel = await this.stockService.getStockArtigoArmazem(artigo.id, armazemExpedicaoId);
        if (stockDisponivel < linha.quantidade) {
          throw new BusinessRuleError(
            `Stock insuficiente para o artigo '${artigo.codigo} - ${artigo.descricao}'. Disponível: ${stockDisponivel} ${artigo.unidade}, Solicitado: ${linha.quantidade} ${artigo.unidade}.`
          );
        }
      }
    }

    // 6. Calcular linhas comerciais e totais
    const calculos = calcularLinhasComerciais(data.linhas);

    const dataVencimento = data.dataVencimento || new Date(data.dataEmissao.getTime() + 30 * 24 * 3600 * 1000);

    const tipoDoc: TipoSerieDocumento =
      data.tipo === 'nota_credito' ? 'NC' : data.tipo === 'fatura_recibo' ? 'FR' : data.tipo === 'nota_debito' ? 'ND' : 'FT';

    // 7. Transação atómica
    const fatura = await this.prisma.$transaction(async (tx) => {
      // 7.1 Reservar número atómico
      const numero = await this.docNumeroService.reservarNumero(tx, tipoDoc, data.serie, data.empresaId);

      // 7.2 Preparar linhas com snapshots de artigo
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

      const fatura = await tx.faturaVenda.create({
        data: {
          numero,
          serie: data.serie,
          tipo: data.tipo as any,
          estadoDocumento: 'emitido',
          empresaId: data.empresaId,
          dataEmissao: data.dataEmissao,
          dataVencimento,
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          clienteNif: cliente.nif,
          clienteEndereco: `${cliente.endereco || ''}${cliente.cidade ? `, ${cliente.cidade}` : ''}`,
          faturaOrigemId: data.faturaOrigemId ?? null,
          proformaOrigemId: data.proformaOrigemId ?? null,
          guiaEntregaOrigemId: data.guiaEntregaOrigemId ?? null,
          motivoNotaCredito: data.motivoNotaCredito ?? null,
          encomendaOrigem: data.encomendaOrigem ?? null,
          motivoIsencao: data.motivoIsencao ?? null,
          estadoPagamento: data.tipo === 'fatura_recibo' ? 'pago' : (data.estadoPagamento as any),
          meioPagamento: (data.meioPagamento ?? null) as any,
          contaBancariaId: data.contaBancariaId ?? null,
          dataPagamento: data.dataPagamento ?? data.dataEmissao,
          atcud: data.atcud ?? null,
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
          linhas: {
            include: { artigo: true },
          },
          faturaOrigem: true,
          proformaOrigem: true,
          guiaEntregaOrigem: true,
        },
      });

      // 7.3 Atualizar estado da origem se existir
      if (guiaOrigem) {
        await tx.guiaEntrega.update({
          where: { id: guiaOrigem.id },
          data: { estado: 'faturada' },
        });
      }

      if (proformaOrigem) {
        await tx.proformaVenda.update({
          where: { id: proformaOrigem.id },
          data: { estado: 'convertida' },
        });
      }

      // 7.4 Movimentos de stock físicos para fatura direta
      if (moveStock && armazemExpedicaoId) {
        let seq = 1;
        for (const linha of data.linhas) {
          const artigo = artigosMap.get(linha.artigoId);
          if (artigo && artigo.tipo !== 'servico') {
            const movNumero = `MOV-VND-${numero.replace(/\s+/g, '-').replace(/\//g, '-')}-${seq++}`;
            await tx.movimentoStock.create({
              data: {
                numero: movNumero,
                tipo: 'saida',
                data: data.dataEmissao,
                artigoId: artigo.id,
                quantidade: linha.quantidade,
                armazemOrigemId: armazemExpedicaoId,
                documentoOrigem: numero,
                custoUnitario: Number(artigo.precoCustoMedio || 0),
              },
            });
          }
        }
      }

      // 7.5 Uma Fatura-Recibo afirma pagamento: o dinheiro tem de entrar na
      // tesouraria na MESMA transação, senão a fatura diz "paga" sem que
      // nenhum movimento de caixa exista. Se a validação falhar, a fatura
      // também não é criada — não fica um documento órfão.
      if (data.tipo === 'fatura_recibo' && data.contaBancariaId) {
        const conta = await tx.contaBancaria.findUnique({ where: { id: data.contaBancariaId } });
        if (!conta) {
          throw new NotFoundError(`Conta bancária '${data.contaBancariaId}' não encontrada.`);
        }
        if (conta.empresaId !== data.empresaId) {
          throw new NotFoundError(`Conta bancária '${data.contaBancariaId}' não encontrada.`);
        }
        if (!conta.ativo) {
          throw new BusinessRuleError(
            `A conta '${conta.designacao}' está inactiva e não pode receber o pagamento da fatura.`
          );
        }

        // Numerário só entra na caixa com uma sessão aberta.
        let sessaoCaixaId: string | null = null;
        if (conta.tipo === 'caixa') {
          const MEIOS_NUMERICOS = new Set(['numerario', 'multicaixa']);
          if (MEIOS_NUMERICOS.has(String(data.meioPagamento))) {
            const sessao = await tx.sessaoCaixa.findFirst({
              where: { contaCaixaId: conta.id, empresaId: data.empresaId, estado: 'aberta' },
              select: { id: true, numero: true },
            });
            if (!sessao) {
              throw new BusinessRuleError(
                `A conta de caixa '${conta.designacao}' não tem sessão aberta. Abra a sessão de caixa antes de emitir a Fatura-Recibo.`
              );
            }
            sessaoCaixaId = sessao.id;
          }
        }

        const numeroTes = await this.docNumeroService.reservarNumero(tx, 'TS', 'TES', data.empresaId);

        await tx.movimentoTesouraria.create({
          data: {
            empresaId: data.empresaId,
            numero: numeroTes,
            data: data.dataPagamento ?? data.dataEmissao,
            tipo: 'entrada',
            contaOrigemId: null,
            contaDestinoId: conta.id,
            valor: calculos.totalLiquido,
            documentoTipo: 'fatura_venda',
            documentoId: fatura.id,
            documentoNumero: fatura.numero,
            descricao: `Liquidação de ${fatura.numero} (${data.meioPagamento})`,
            estado: 'confirmado',
            meioPagamento: data.meioPagamento,
            sessaoCaixaId,
          },
        });
      }

      return fatura;
    });

    // A contabilização acontece depois do commit e nunca faz rollback da fatura.
    await integrarDepoisCommit(`fatura ${fatura.serie}/${fatura.numero}`, () =>
      this.integracao.contabilizarFaturaVenda({
        empresaId: fatura.empresaId ?? data.empresaId,
        faturaId: fatura.id,
        numeroFatura: `${fatura.serie}/${fatura.numero}`,
        dados: {
          total: Number(fatura.totalLiquido),
          net: Number(fatura.totalIliquido),
          tax: Number(fatura.totalIva),
          base: Number(fatura.totalIliquido),
          taxPorTaxa: Object.fromEntries(
            calculos.resumoIva.map((r) => [String(r.taxa), r.valorIva])
          ),
          dataContabilistica: fatura.dataEmissao,
          dataDocumento: fatura.dataEmissao,
          descricao: `Fatura ${fatura.serie}/${fatura.numero} — ${fatura.clienteNome}`,
        },
      })
    );

    return fatura;
  }

  /**
   * Anula uma fatura de venda mantendo registro de auditoria e revertendo movimentos se aplicável.
   */
  async anularFatura(id: string, motivo: string): Promise<FaturaVenda> {
    const validated = anularFaturaSchema.parse({ id, motivo });

    const fatura = await this.prisma.faturaVenda.findUnique({
      where: { id: validated.id },
      include: {
        imputacoesRecibo: true,
        linhas: { include: { artigo: true } },
      },
    });

    if (!fatura) {
      throw new NotFoundError(`Fatura '${validated.id}' não encontrada.`);
    }

    if (fatura.estadoDocumento === 'anulado') {
      throw new BusinessRuleError(`A fatura '${fatura.numero}' já se encontra anulada.`);
    }

    if (fatura.imputacoesRecibo && fatura.imputacoesRecibo.length > 0) {
      throw new BusinessRuleError(
        `Não é possível anular a fatura '${fatura.numero}' porque possui recibos ou pagamentos imputados.`
      );
    }

    const anulada = await this.prisma.faturaVenda.update({
      where: { id: validated.id },
      data: {
        estadoDocumento: 'anulado',
        motivoAnulacao: validated.motivo,
        anuladaEm: new Date(),
      },
      include: {
        empresa: true,
        cliente: true,
        linhas: { include: { artigo: true } },
      },
    });

    await integrarDepoisCommit(`estorno da fatura ${anulada.serie}/${anulada.numero}`, () =>
      this.integracao.estornarFaturaVenda({
        empresaId: anulada.empresaId ?? fatura.empresaId!,
        faturaId: anulada.id,
        numeroFatura: `${anulada.serie}/${anulada.numero}`,
        dataEstorno: anulada.anuladaEm ?? new Date(),
        descricao: `Estorno de fatura ${anulada.serie}/${anulada.numero}: ${validated.motivo}`.slice(0, 200),
      })
    );

    return anulada;
  }

  /**
   * Obtém o modelo de impressão (DocumentoPrintDto) pronto para renderização ou exportação PDF.
   */
  async getDocumentoImprimivel(id: string) {
    const fatura = await this.getFatura(id);
    const empresa = (fatura as any).empresa || (await this.prisma.empresaConfig.findFirst());

    if (!empresa) {
      throw new BusinessRuleError('Empresa emissora não configurada.');
    }

    const tipoDoc: TipoSerieDocumento =
      fatura.tipo === 'nota_credito' ? 'NC' : fatura.tipo === 'fatura_recibo' ? 'FR' : fatura.tipo === 'nota_debito' ? 'ND' : 'FT';

    const tituloMap: Record<string, string> = {
      FT: 'FATURA',
      FR: 'FATURA-RECIBO',
      NC: 'NOTA DE CRÉDITO',
      ND: 'NOTA DE DÉBITO',
    };

    const calculos = calcularLinhasComerciais(
      (fatura as any).linhas.map((l: any) => ({
        artigoId: l.artigoId,
        quantidade: Number(l.quantidade),
        precoUnitario: Number(l.precoUnitario),
        desconto: Number(l.desconto || 0),
        taxaIva: Number(l.taxaIva),
        motivoIsencao: l.motivoIsencao,
      }))
    );

    let qrPayload: string | null = null;
    let qrDataUrl: string | null = null;

    if (empresa.pais === 'AO' && empresa.nif && fatura.numero) {
      try {
        qrPayload = buildAgtVerificationUrl(empresa.nif, fatura.numero);
        qrDataUrl = await generateAgtQrDataUrl(qrPayload);
      } catch {
        // Ignora falha de QR se campos forem incompatíveis
      }
    }

    // Uma fatura-recibo diz onde o cliente pagou; as restantes dizem onde pode
    // pagar. Nos dois casos a resposta vem de `ContaBancaria`.
    const contasBancarias =
      tipoDoc === 'FR' && (fatura as any).contaBancariaId
        ? await contaDoDocumento((fatura as any).contaBancariaId, this.prisma)
        : await contasAtivasDaEmpresa((fatura as any).empresaId, this.prisma);

    return {
      tipoDocumento: tipoDoc,
      tituloDocumento: tituloMap[tipoDoc] || 'FATURA',
      numero: fatura.numero,
      serie: fatura.serie,
      dataEmissao: fatura.dataEmissao,
      dataVencimento: fatura.dataVencimento,
      estado: fatura.estadoDocumento,
      moeda: empresa.moedaBase || 'AOA',
      atcud: fatura.atcud,
      hashAssinatura: fatura.hashAssinatura,
      qrPayload,
      qrDataUrl,
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
        nome: fatura.clienteNome,
        nif: fatura.clienteNif,
        endereco: fatura.clienteEndereco,
        pais: (fatura as any).cliente?.pais || null,
        telefone: (fatura as any).cliente?.telefone || null,
        email: (fatura as any).cliente?.email || null,
      },
      linhas: (fatura as any).linhas.map((l: any, idx: number) => ({
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
        totalIliquido: Number(fatura.totalIliquido),
        totalDesconto: calculos.totalDesconto,
        totalIva: Number(fatura.totalIva),
        totalLiquido: Number(fatura.totalLiquido),
        resumoIva: calculos.resumoIva,
      },
      documentoOrigem: (fatura as any).faturaOrigem
        ? { tipo: 'FATURA', numero: (fatura as any).faturaOrigem.numero }
        : (fatura as any).guiaEntregaOrigem
        ? { tipo: 'GUIA DE ENTREGA', numero: (fatura as any).guiaEntregaOrigem.numero }
        : (fatura as any).proformaOrigem
        ? { tipo: 'PROFORMA', numero: (fatura as any).proformaOrigem.numero }
        : null,
      observacoes: fatura.motivoNotaCredito || null,
      notice:
        tipoDoc === 'NC'
          ? 'Nota de Crédito — não repõe stock automaticamente'
          : tipoDoc === 'ND'
            ? 'Nota de Débito'
            : null,
      dadosBancarios: empresa.dadosBancarios || null,
      contasBancarias,
    };
  }
}

export const vendasService = new VendasService();
