/**
 * @file saft.service.ts
 * @description Motor de geração do ficheiro SAF-T (FIS-01, RN08.1).
 *
 * A ordem das fases importa e não é negociável:
 *
 *   1. carregar o contexto da empresa e o período
 *   2. ler as faturas emitidas no intervalo
 *   3. mapear para o modelo SAF-T
 *   4. serializar o `<Body>` isoladamente e calcular o seu hash
 *   5. preencher `Header.Hash` e montar `<Hashes>`
 *   6. serializar o documento completo
 *   7. validar a estrutura (RN08.1) — e só então oferecer o ficheiro
 *
 * O passo 7 antes do 6 seria possível, mas o passo 4 exige o XML, e o
 * validador deve ver exactamente o que vai para o disco.
 */

import {
  PrismaClient,
  FaturaVenda,
  LancamentoContabil,
  LinhaLancamentoContabil,
  Prisma,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../database/prisma';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import {
  construirAuditFile,
  construirCustomer,
  construirDocumentTotals,
  construirGeneralLedgerEntries,
  construirInvoiceLine,
  construirProduct,
  formatarData,
  formatarDataHora,
  nomeFicheiroSaft,
  paraNumero,
} from './saft.mapeamento';
import type { SaftContexto } from './saft.tipos';
import {
  calcularHashBody,
  calcularHashControl,
  calcularHashFicheiro,
  calcularHashHeader,
  construirHashes,
} from './saft.hash';
import { construirBody, serializarSaft, serializarElemento } from './saft.construcao';
import { validarSaft, type ResultadoValidacao } from './saft.validador';
import type {
  SaftAuditFile,
  SaftAuditFileSemHashes,
  SaftCustomer,
  SaftInvoice,
  SaftProduct,
} from './saft.tipos';

export interface GerarSaftParams {
  empresaId: string;
  ano: number;
  /** 1..12. `null` ou `0` significa o ano inteiro. */
  mes?: number | null;
  /** Documentos anulados entram no ficheiro com `DocumentStatus = A`. */
  incluirAnulados?: boolean;
}

/** Contadores devolvidos ao chamador; os de contabilidade são aditivos. */
export interface EstatisticasSaft {
  documentos: number;
  clientes: number;
  artigos: number;
  taxas: number;
  totalLiquido: number;
  lancamentos?: number;
  linhasContabeis?: number;
  totalDebitoContabil?: string;
  totalCreditoContabil?: string;
}

export interface SaftGerado {
  xml: string;
  nomeFicheiro: string;
  validacao: ResultadoValidacao;
  estatisticas: EstatisticasSaft;
  hashFicheiro: string;
}

/** Fatura com as relações necessárias ao mapeamento fiscal. */
export type FaturaComRelacoes = FaturaVenda & {
  cliente: { codigo: string; nome: string; nif: string; endereco: string; codigoPostal: string | null; cidade: string | null; pais: string; email: string | null; telefone: string | null };
  linhas: Array<{
    artigoId: string;
    artigoCodigo: string;
    artigoDescricao: string;
    artigoUnidade: string;
    quantidade: Prisma.Decimal;
    precoUnitario: Prisma.Decimal;
    desconto: Prisma.Decimal;
    taxaIva: Prisma.Decimal;
    motivoIsencao: string | null;
    totalLinha: Prisma.Decimal;
  }>;
};

/** Lançamento com as relações necessárias ao bloco de contabilidade geral. */
export type LancamentoComRelacoes = LancamentoContabil & {
  diario: { codigo: string; designacao: string };
  linhas: Array<LinhaLancamentoContabil & { conta: { codigo: string; designacao: string } }>;
};

export class SaftService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Gera o ficheiro SAF-T de um período.
   *
   * @param params - Empresa, ano e mês pretendidos.
   * @returns O XML, o resultado da validação estrutural e estatísticas.
   * @throws {BusinessRuleError} Se o período não existir no calendário.
   * @throws {NotFoundError} Se a empresa não existir.
   */
  async gerar(params: GerarSaftParams): Promise<SaftGerado> {
    const mes = params.mes && params.mes > 0 ? params.mes : null;
    const { dataInicio, dataFim, dataFimInclusiva } = resolverPeriodo(params.ano, mes);

    // `dataFim` é exclusivo (primeiro dia do período seguinte) e serve só para
    // as consultas; o Header leva o último dia propriamente dito.
    const contexto = await this.carregarContexto(
      params.empresaId,
      params.ano,
      mes,
      dataInicio,
      dataFimInclusiva,
    );
    const faturas = await this.carregarFaturas(
      params.empresaId,
      dataInicio,
      dataFim,
      params.incluirAnulados ?? false,
    );
    const lancamentos = await this.carregarLancamentos(params.empresaId, dataInicio, dataFim);

    const { documento, estatisticas } = this.montarDocumento(contexto, faturas, lancamentos);

    // Fase 4: o hash do corpo é calculado sobre o `<Body>` isolado, porque
    // é isso que a AT hasheia — não o documento com o `Hashes` dentro.
    const bodyXml = serializarElemento(construirBody(documento.Body));
    const bodyHash = calcularHashBody(bodyXml);

    // Fase 5
    const headerHash = calcularHashHeader(documento.Header);
    const completo: SaftAuditFile = {
      Header: { ...documento.Header, Hash: headerHash },
      Body: documento.Body,
      Hashes: { Hash: construirHashes(headerHash, bodyHash) },
    };

    // Fase 6
    const xml = serializarSaft(completo);

    // Fase 7 — RN08.1. Validamos exactamente o que vai para o disco.
    const validacao = validarSaft(xml, completo);

    return {
      xml,
      nomeFicheiro: nomeFicheiroSaft(contexto),
      validacao,
      estatisticas: { ...estatisticas },
      hashFicheiro: calcularHashFicheiro(xml),
    };
  }

  /**
   * Resolve empresa e período num `SaftContexto`.
   * @throws {NotFoundError} Se a empresa não existir.
   */
  private async carregarContexto(
    empresaId: string,
    ano: number,
    mes: number | null,
    dataInicio: Date,
    dataFim: Date,
  ): Promise<SaftContexto> {
    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: empresaId } });
    if (!empresa) {
      throw new NotFoundError('Empresa não encontrada para gerar o ficheiro SAF-T.');
    }

    // O `identificador` é o `TaxID` junto da AT. Sem ele configurado, o NIF
    // é o único identificador que temos — usá-lo é melhor do que gerar um
    // ficheiro que a AT recusa por `CompanyID` vazio.
    const { cidade, codigoPostal } = extrairEndereco(empresa.endereco);

    return {
      empresaId: empresa.id,
      nomeEmpresa: empresa.nome,
      nifEmpresa: empresa.nif,
      identificadorEmpresa: empresa.identificador ?? empresa.nif,
      enderecoEmpresa: empresa.endereco ?? '',
      codigoPostalEmpresa: codigoPostal,
      cidadeEmpresa: cidade,
      paisEmpresa: paisIso(empresa.pais),
      emailEmpresa: empresa.email ?? '',
      telefoneEmpresa: empresa.telefone ?? '',
      faxEmpresa: '',
      regimeIva: empresa.regimeIva,
      moeda: empresa.moedaBase,
      ano,
      mes: mes ?? 12,
      dataInicio,
      dataFim,
    };
  }

  /**
   * Lê as faturas do período com as relações de que o mapeamento precisa.
   *
   * Anulados são excluídos por omissão: um ficheiro de faturação comunica o
   * que foi emitido, e um documento anulado aparece como nota de crédito ou
   * simplesmente não aparece. `incluirAnulados` existe para quem precisa da
   * listagem completa para conferência interna. `dataFim` é exclusivo, para
   * apanhar também os documentos registados ao longo do último dia.
   */
  private async carregarFaturas(
    empresaId: string,
    dataInicio: Date,
    dataFim: Date,
    incluirAnulados: boolean,
  ): Promise<FaturaComRelacoes[]> {
    return this.prisma.faturaVenda.findMany({
      where: {
        empresaId,
        dataEmissao: { gte: dataInicio, lt: dataFim },
        ...(incluirAnulados ? {} : { estadoDocumento: 'emitido' }),
      },
      include: {
        cliente: {
          select: {
            codigo: true,
            nome: true,
            nif: true,
            endereco: true,
            codigoPostal: true,
            cidade: true,
            pais: true,
            email: true,
            telefone: true,
          },
        },
        linhas: { orderBy: { id: 'asc' } },
      },
      orderBy: [{ dataEmissao: 'asc' }, { numero: 'asc' }],
    }) as Promise<FaturaComRelacoes[]>;
  }

  /**
   * Lê os lançamentos publicados do período com diário, linhas e contas.
   *
   * Rascunhos ficam de fora: só `validado` e `estornado` são factos
   * contabilísticos. O filtro por empresa e período é o mesmo das faturas, com
   * `dataFim` exclusivo, para que o bloco de contabilidade corresponda
   * exactamente ao período do ficheiro.
   */
  private async carregarLancamentos(
    empresaId: string,
    dataInicio: Date,
    dataFim: Date,
  ): Promise<LancamentoComRelacoes[]> {
    return this.prisma.lancamentoContabil.findMany({
      where: {
        empresaId,
        dataContabilistica: { gte: dataInicio, lt: dataFim },
        estado: { in: ['validado', 'estornado'] },
      },
      include: {
        diario: { select: { codigo: true, designacao: true } },
        linhas: {
          orderBy: { numeroLinha: 'asc' },
          include: { conta: { select: { codigo: true, designacao: true } } },
        },
      },
      orderBy: [{ dataContabilistica: 'asc' }, { numero: 'asc' }],
    }) as Promise<LancamentoComRelacoes[]>;
  }

  /**
   * Mapeia faturas para o documento SAF-T.
   *
   * Faturas sem linhas não entram: um `Invoice` sem `Line` é rejeitado pela
   * AT, e uma fatura vazia é um erro de emissão, não um ficheiro de cliente.
   */
  private montarDocumento(
    contexto: SaftContexto,
    faturas: FaturaComRelacoes[],
    lancamentos: LancamentoComRelacoes[],
  ): { documento: SaftAuditFileSemHashes; estatisticas: EstatisticasSaft } {
    const customers = new Map<string, SaftCustomer>();
    const products = new Map<string, SaftProduct>();
    const invoices: SaftInvoice[] = [];
    const taxasUsadas = new Set<number>();
    let totalLiquido = 0;

    for (const fatura of faturas) {
      if (fatura.linhas.length === 0) continue;

      // O snapshot do cliente vem do cadastro actual apenas para o endereço:
      // nome e NIF são os que estavam na fatura (RN03.2).
      if (!customers.has(fatura.cliente.codigo)) {
        customers.set(
          fatura.cliente.codigo,
          construirCustomer({
            codigo: fatura.cliente.codigo,
            nome: fatura.clienteNome,
            nif: fatura.clienteNif,
            endereco: fatura.cliente.endereco ?? '',
            codigoPostal: fatura.cliente.codigoPostal ?? '',
            cidade: fatura.cliente.cidade ?? '',
            pais: paisTexto(fatura.cliente.pais),
            email: fatura.cliente.email ?? '',
            telefone: fatura.cliente.telefone ?? '',
          }),
        );
      }

      for (const linha of fatura.linhas) {
        if (!products.has(linha.artigoCodigo)) {
          products.set(
            linha.artigoCodigo,
            construirProduct({
              codigo: linha.artigoCodigo,
              descricao: linha.artigoDescricao,
              unidade: linha.artigoUnidade,
              tipo: 'produto',
            }),
          );
        }
        taxasUsadas.add(paraNumero(linha.taxaIva));
      }

      const tipoDocumento = mapearTipo(fatura);
      const linhas = fatura.linhas.map((linha, indice) => {
        return construirInvoiceLine(
          {
            artigoCodigo: linha.artigoCodigo,
            artigoDescricao: linha.artigoDescricao,
            artigoUnidade: linha.artigoUnidade,
            quantidade: paraNumero(linha.quantidade),
            precoUnitario: paraNumero(linha.precoUnitario),
            desconto: paraNumero(linha.desconto),
            taxaIva: paraNumero(linha.taxaIva),
            totalLinha: paraNumero(linha.totalLinha),
            motivoIsencao: linha.motivoIsencao,
          },
          indice + 1,
          tipoDocumento,
          fatura.dataEmissao,
        );
      });

      const totalIliquido = fatura.linhas.reduce((soma, l) => soma + baseDeLinha(l), 0);
      const totalIva = paraNumero(fatura.totalIva);
      const liquidoDocumento = paraNumero(fatura.totalLiquido);
      const totais = construirDocumentTotals(totalIliquido, totalIva, liquidoDocumento);
      totalLiquido += liquidoDocumento;

      const anulado = fatura.estadoDocumento === 'anulado';

      // `Tax`/`TaxTotal` exigem taxa única em todo o documento.
      const taxasDistintas = new Set(fatura.linhas.map((l) => paraNumero(l.taxaIva)));
      const taxaUnica = taxasDistintas.size === 1 ? [...taxasDistintas][0] : null;

      invoices.push({
        InvoiceNo: fatura.numero,
        DocumentStatus: {
          DocumentStatus: anulado ? 'A' : 'N',
          DocumentStatusDate: anulado && fatura.anuladaEm ? formatarData(fatura.anuladaEm) : formatarData(fatura.dataEmissao),
          SourceID: 'DocumentoOrigem',
          SourceBilling: 'DocumentoContabilistico',
          SystemEntryDate: formatarDataHora(fatura.createdAt ?? new Date()),
        },
        HashControl: calcularHashControl(
          fatura.numero,
          formatarData(fatura.dataEmissao),
          liquidoDocumento.toFixed(2),
          fatura.atcud,
        ),
        Period: String(contexto.mes).padStart(2, '0'),
        TransactionDate: formatarData(fatura.dataEmissao),
        SourceID: 'DocumentoOrigem',
        SourceBilling: 'DocumentoContabilistico',
        SystemEntryDate: formatarDataHora(fatura.createdAt ?? new Date()),
        CustomerID: fatura.cliente.codigo,
        Line: linhas,
        DocumentTotals: totais,
        ...(taxaUnica !== null ? { Tax: mapearTaxaId(taxaUnica), TaxTotal: totalIva.toFixed(2) } : {}),
        ...(fatura.estadoPagamento === 'pago' ? { TaxAccrued: totalIva.toFixed(2) } : {}),
        Currency: contexto.moeda,
      });
    }

    const generalLedgerEntries = construirGeneralLedgerEntries(lancamentos, contexto.moeda);
    const documento = construirAuditFile(contexto, {
      customers: [...customers.values()].sort((a, b) => a.CustomerID.localeCompare(b.CustomerID)),
      products: [...products.values()].sort((a, b) => a.ProductCode.localeCompare(b.ProductCode)),
      invoices,
      taxasUsadas: [...taxasUsadas],
      ...(generalLedgerEntries ? { generalLedgerEntries } : {}),
    });

    const contagemLancamentos =
      generalLedgerEntries?.Journal?.reduce((total, journal) => total + journal.Transaction.length, 0) ?? 0;
    // `NumberOfEntries` conta vouchers; a estatística de linhas é derivada das
    // próprias linhas, que é o que o utilizador vê no ficheiro.
    const contagemLinhas =
      generalLedgerEntries?.Journal?.reduce(
        (total, journal) =>
          total + journal.Transaction.reduce((soma, transaction) => soma + transaction.Line.length, 0),
        0,
      ) ?? 0;

    return {
      documento,
      estatisticas: {
        documentos: invoices.length,
        clientes: customers.size,
        artigos: products.size,
        taxas: taxasUsadas.size,
        totalLiquido,
        ...(generalLedgerEntries
          ? {
              lancamentos: contagemLancamentos,
              linhasContabeis: contagemLinhas,
              totalDebitoContabil: generalLedgerEntries.TotalDebit,
              totalCreditoContabil: generalLedgerEntries.TotalCredit,
            }
          : {}),
      },
    };
  }
}

/** Base de incidência de uma linha, extraindo o IVA a partir do total bruto. */
function baseDeLinha(linha: { totalLinha: Prisma.Decimal; taxaIva: Prisma.Decimal }): number {
  const total = paraNumero(linha.totalLinha);
  const taxa = paraNumero(linha.taxaIva);
  return total - (total * taxa) / (100 + taxa);
}

/** Mapeia o tipo de fatura do Prisma para o identificador SAF-T. */
function mapearTipo(fatura: Pick<FaturaVenda, 'tipo'>): 'FT' | 'FR' | 'NC' | 'ND' {
  switch (fatura.tipo) {
    case 'nota_credito':
      return 'NC';
    case 'nota_debito':
      return 'ND';
    case 'fatura_recibo':
      return 'FR';
    default:
      return 'FT';
  }
}

/** Identificador de `TaxTable` a partir da taxa. */
function mapearTaxaId(taxa: number): SaftAuditFile['Body']['MasterFiles']['TaxTable'][number]['TaxTableID'] {
  if (taxa === 0) return 'ISE';
  if (taxa <= 6) return 'RED';
  if (taxa <= 13) return 'INT';
  if (taxa <= 23) return 'NOR';
  return 'OUT';
}

/**
 * Resolve o intervalo de um período.
 *
 * `dataFim` é o limite **exclusivo** das consultas (meia-noite do primeiro dia
 * do período seguinte), para não perder os registos registados mais tarde no
 * último dia. `dataFimInclusiva` é o último dia do período, para o `DateEnd`
 * do Header.
 *
 * @throws {BusinessRuleError} Se o mês for inválido.
 */
export function resolverPeriodo(
  ano: number,
  mes: number | null,
): { dataInicio: Date; dataFim: Date; dataFimInclusiva: Date } {
  if (mes !== null && (mes < 1 || mes > 12)) {
    throw new BusinessRuleError(`Mês inválido: ${mes}. Use 1 a 12, ou 0/null para o ano inteiro.`);
  }

  const dataInicio = mes === null ? new Date(ano, 0, 1) : new Date(ano, mes - 1, 1);
  const dataFim = mes === null ? new Date(ano + 1, 0, 1) : new Date(ano, mes, 1);
  // Dia 0 do mês do limite exclusivo é o último dia do mês anterior.
  const dataFimInclusiva = new Date(dataFim.getFullYear(), dataFim.getMonth(), 0);

  return { dataInicio, dataFim, dataFimInclusiva };
}

/** Converte o `Pais` do Prisma para o código ISO de duas letras. */
function paisIso(pais: string): string {
  switch (pais) {
    case 'PT':
      return 'PT';
    case 'AO':
      return 'AO';
    default:
      return 'PT';
  }
}

/** Converte o nome do país guardado no cadastro para o texto que o schema quer. */
function paisTexto(pais: string): string {
  switch (pais?.trim().toLowerCase()) {
    case 'portugal':
      return 'PT';
    case 'angola':
      return 'AO';
    default:
      return pais ? pais.slice(0, 60) : '';
  }
}

/**
 * Separa `cidade` e `código postal` de um endereço livre.
 * O schema exige `PostalCode` separado e o `EmpresaConfig` guarda tudo num
 * único texto, por isso tentamos o padrão português `cidade, código-postal`.
 */
export function extrairEndereco(endereco: string | null | undefined): { cidade: string; codigoPostal: string } {
  if (!endereco) return { cidade: '', codigoPostal: '' };

  const match = /^(.*?)[,;]\s*(\d{4}-\d{3})\s*$/.exec(endereco.trim());
  if (match) return { cidade: match[1].trim(), codigoPostal: match[2] };
  return { cidade: endereco.trim(), codigoPostal: '' };
}

export const saftService = new SaftService();