/**
 * @file saft.mapeamento.ts
 * @description Tradução do modelo Prisma para o modelo SAF-T (FIS-01).
 *
 * Duas decisões que não são óbvias e que mudam o resultado do ficheiro:
 *
 *  1. **O snapshot ganha ao registo actual.** O `clienteNif` e o
 *     `artigoCodigo`/`artigoDescricao` vêm da *linha da fatura*, nunca do
 *     `Cliente`/`Artigo` de agora. É o que sustenta a RN03.2: se o cadastro
 *     muda em Março, a fatura de Janeiro tem de continuar a declarar o que
 *     vendeu em Janeiro.
 *
 *  2. **`InvoiceNo` não é o número impresso.** O DoraERP numera
 *     `FT 2026/0001`; a AT quer `Series="2026"` e `InvoiceNo="0001"`. É a
 *     mesma informação repartida em dois campos, não uma truncagem.
 */

import {
  SAFT_CASAS_DECIMAIS,
  SAFT_TAX_ACCOUNTING_BASIS_N,
  SAFT_AUDIT_VERSION,
  SAFT_TAX_TABLE_IDS,
  type SaftContexto,
  type SaftCustomer,
  type SaftDocumentTotals,
  type SaftGeneralLedgerEntries,
  type SaftGeneralLedgerJournal,
  type SaftGeneralLedgerLine,
  type SaftGeneralLedgerTransaction,
  type SaftInvoice,
  type SaftInvoiceLine,
  type SaftProduct,
  type SaftTaxTable,
  type SaftTaxTableEntry,
  type SaftTaxTableId,
  type SaftAuditFileSemHashes,
} from './saft.tipos';

/** Tolerância de arredondamento em Kwanza/Euro, alinhada com a tesouraria. */
const TOLERANCIA = 0.0001;

/** Formata um número com casas decimais fixas, sem notação científica. */
export function formatarValor(valor: number | string | null | undefined): string {
  const numero = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  if (!Number.isFinite(numero)) return (0).toFixed(SAFT_CASAS_DECIMAIS);
  return numero.toFixed(SAFT_CASAS_DECIMAIS);
}

/** Formata uma quantidade com 4 casas, que é a precisão do schema. */
export function formatarQuantidade(valor: number | string | null | undefined): string {
  const numero = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  if (!Number.isFinite(numero)) return '0.0000';
  return numero.toFixed(4);
}

/** Data em `YYYY-MM-DD`, que é o formato que a AT espera em todo o ficheiro. */
export function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Data-hora completa em ISO local, usada em `SystemEntryDate`. */
export function formatarDataHora(data: Date): string {
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  const segundos = String(data.getSeconds()).padStart(2, '0');
  return `${formatarData(data)}T${horas}:${minutos}:${segundos}`;
}

/** Número do mês em duas casas, como o `Month` do `Header` exige. */
export function formatarMes(mes: number): string {
  return String(mes).padStart(2, '0');
}

/** Converte um `Decimal` do Prisma para `number` sem perder precisão. */
export function paraNumero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const convertido = Number(valor as string);
  return Number.isFinite(convertido) ? convertido : 0;
}

/**
 * Mapeia o tipo de fatura do Prisma para o identificador SAF-T.
 * A correspondência é a mesma de `vendas.service.ts:258`, e tem de continuar
 * a ser: um `FR` impresso como `FT` no ficheiro fiscal é uma reconciliação
 * que ninguém consegue fazer.
 */
export function mapearTipoDocumento(tipo: string): 'FT' | 'FR' | 'NC' | 'ND' {
  switch (tipo) {
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

/**
 * Separa o número interno `FT 2026/0001` em série e número sequencial.
 * O formato é garantido por `documento-numero.service.ts:36`; se um documento
 * vier de fora desse contrato, devolvemos a série vazia em vez de partir mal
 * a string e produzir um `InvoiceNo` silenciosamente errado.
 */
export function separarNumeroDocumento(numero: string): { serie: string; numero: string } {
  const match = /^[A-Z]{2}\s+(.+)\/(\d+)$/.exec(numero.trim());
  if (!match) return { serie: '', numero: numero.trim() };
  return { serie: match[1], numero: match[2] };
}

/**
 * Escolhe o identificador da `TaxTable` a partir da taxa de IVA.
 * `ISE` (isento) tem precedência sobre qualquer valor numérico, porque uma
 * isenção escreve-se como taxa 0 e não como uma taxa que por acaso é zero.
 */
export function mapearTaxTable(taxa: number): SaftTaxTableId {
  if (taxa === 0) return 'ISE';
  if (taxa <= 6) return 'RED';
  if (taxa <= 13) return 'INT';
  if (taxa <= 23) return 'NOR';
  return 'OUT';
}

/** Descrição legível da entrada de IVA, para a `TaxTable`. */
export function descreverTaxa(taxTableId: SaftTaxTableId): string {
  switch (taxTableId) {
    case 'RED':
      return 'Reduzida';
    case 'INT':
      return 'Intermédia';
    case 'NOR':
      return 'Normal';
    case 'ISE':
      return 'Isenta';
    default:
      return 'Outra';
  }
}

/**
 * A `TaxTable` no SAF-T exige os identificadores padrão (RED, INT, NOR, ISE e OUT)
 * preenchidos com as taxas reais utilizadas ou as taxas por defeito.
 */
export function construirTaxTable(taxasUsadas: number[], pais: string = 'PT'): SaftTaxTable[] {
  const padroes: Record<SaftTaxTableId, number> = {
    NOR: pais === 'AO' ? 14 : 23,
    INT: 13,
    RED: pais === 'AO' ? 7 : 6,
    ISE: 0,
    OUT: 0,
  };

  const porTabela = new Map<SaftTaxTableId, number>();

  // Garante a presença obrigatória de todas as categorias do schema SAF-T
  for (const id of SAFT_TAX_TABLE_IDS) {
    porTabela.set(id, padroes[id]);
  }

  // Sobrescreve com as taxas efetivamente utilizadas nas faturas
  for (const taxa of taxasUsadas) {
    const id = mapearTaxTable(paraNumero(taxa));
    const existente = porTabela.get(id);
    if (existente === undefined || Math.abs(paraNumero(taxa)) > Math.abs(existente)) {
      porTabela.set(id, paraNumero(taxa));
    }
  }

  return [...porTabela.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([taxTableId, taxa]) => {
      const entrada: SaftTaxTableEntry = {
        TaxType: taxTableId === 'ISE' ? 'ISE' : 'IVA',
        TaxCode: taxTableId,
        TaxDescription: descreverTaxa(taxTableId),
        Tax: paraNumero(taxa),
      };
      return { TaxTableID: taxTableId, Tax: [entrada] };
    });
}

/** Códigos de unidade aceite pelo schema, normalizados a partir do cadastro. */
const UNIDADES_SAFT: Record<string, string> = {
  un: 'UN',
  und: 'UN',
  unidade: 'UN',
  kg: 'KG',
  kgm: 'KG',
  quilo: 'KG',
  g: 'KG',
  lt: 'LT',
  l: 'LT',
  litro: 'LT',
  m: 'MT',
  m2: 'M2',
  m3: 'M3',
  cx: 'CX',
  caixa: 'CX',
  pct: 'PCT',
  hr: 'HUR',
  hora: 'HUR',
};

/** Normaliza uma unidade do cadastro para um código do schema SAF-T. */
export function normalizarUnidade(unidade: string | null | undefined): string {
  if (!unidade) return 'UN';
  const chave = String(unidade).trim().toLowerCase();
  return UNIDADES_SAFT[chave] ?? 'UN';
}

/** Constrói um nó `Customer` a partir do snapshot da fatura. */
export function construirCustomer(dados: {
  codigo: string;
  nome: string;
  nif: string;
  endereco: string;
  codigoPostal: string;
  cidade: string;
  pais: string;
  email: string;
  telefone: string;
}): SaftCustomer {
  return {
    CustomerID: dados.codigo,
    TaxRegistrationNumber: dados.nif,
    Name: dados.nome,
    CompanyName: dados.nome,
    Address: dados.endereco,
    PostalCode: dados.codigoPostal,
    City: dados.cidade,
    Country: dados.pais,
    Email: dados.email,
    Telephone: dados.telefone,
    Fax: '',
    CustomerType: 'PT',
    CustomerAccount: '',
  };
}

/** Constrói um nó `Product` a partir do snapshot da linha de fatura. */
export function construirProduct(dados: {
  codigo: string;
  descricao: string;
  unidade: string;
  tipo: string;
}): SaftProduct {
  return {
    ProductType: dados.tipo === 'servico' ? 'S' : 'P',
    ProductCode: dados.codigo,
    ProductDescription: dados.descricao,
    ProductNumberCode: dados.codigo,
    UnitOfMeasure: normalizarUnidade(dados.unidade),
  };
}

/** Totais do documento, derivados das linhas para não divergir delas. */
export function construirDocumentTotals(
  totalIliquido: number,
  totalIva: number,
  totalLiquido: number,
): SaftDocumentTotals {
  const liquido = Math.abs(totalLiquido - (totalIliquido + totalIva));
  // Uma diferença de meio cêntimo vem do arredondamento feito na emissão; o
  // schema quer os totais a bater certo, e é o `GrossTotal` que a AT confere.
  const grossTotal = liquido <= TOLERANCIA ? totalIliquido + totalIva : totalLiquido;
  return {
    TaxPayable: formatarValor(totalIva),
    NetTotal: formatarValor(totalIliquido),
    GrossTotal: formatarValor(grossTotal),
  };
}

/** Constrói uma linha de documento a partir do snapshot da linha da fatura. */
export function construirInvoiceLine(
  linha: {
    artigoCodigo: string;
    artigoDescricao: string;
    artigoUnidade: string;
    quantidade: number;
    precoUnitario: number;
    desconto: number;
    taxaIva: number;
    totalLinha: number;
    motivoIsencao?: string | null;
  },
  numeroLinha: number,
  tipoDocumento: 'FT' | 'FR' | 'NC' | 'ND',
  dataDocumento: Date,
): SaftInvoiceLine {
  // `totalLinha` chega com imposto incluído. A base de incidência extrai-se
  // desfazendo a taxa, e o IVA é a diferença entre o total e essa base — não
  // ao contrário: trocar as duas produz ficheiros que somam certo no
  // `GrossTotal` e estão errados linha a linha.
  const total = paraNumero(linha.totalLinha);
  const taxa = paraNumero(linha.taxaIva);
  const baseIncidencia = total - (total * taxa) / (100 + taxa);
  const valorIva = total - baseIncidencia;
  const motivo = linha.motivoIsencao ? ` Motivo: ${linha.motivoIsencao}.` : '';

  // Uma nota de crédito é um crédito; tudo o resto é um débito. Este é o sinal
  // que a AT usa para somar o `TotalDebit` e o `TotalCredit` do ficheiro. A base
  // e o IVA continuam positivos em `TaxBase`/`TaxAmount` — os totais do
  // documento também são —, para que a soma das linhas bata com o `TaxPayable`.
  const ehCredito = tipoDocumento === 'NC';

  return {
    LineNumber: numeroLinha,
    ProductCode: linha.artigoCodigo,
    ProductDescription: linha.artigoDescricao,
    Quantity: formatarQuantidade(linha.quantidade),
    UnitOfMeasure: normalizarUnidade(linha.artigoUnidade),
    UnitPrice: formatarValor(linha.precoUnitario),
    TaxPointDate: formatarData(dataDocumento),
    Description: `${linha.artigoDescricao}.${motivo}`,
    CreditAmount: ehCredito ? formatarValor(baseIncidencia) : formatarValor(0),
    DebitAmount: ehCredito ? formatarValor(0) : formatarValor(baseIncidencia),
    Tax: mapearTaxTable(paraNumero(linha.taxaIva)),
    TaxAmount: formatarValor(valorIva),
    TaxCode: mapearTaxTable(paraNumero(linha.taxaIva)),
    TaxBase: formatarValor(baseIncidencia),
  };
}

/** Estados em que um lançamento é considerado publicado para o SAF-T. */
const ESTADOS_LANCAMENTO_PUBLICADO = new Set(['validado', 'estornado']);

/** Não há utilizador no modelo de lançamento; usa-se a origem documental. */
const SOURCE_ID_CONTABILIDADE = 'DocumentoOrigem';

/** Lançamento com as relações de que o bloco de contabilidade precisa. */
export interface LancamentoContabilParaSaft {
  id?: string;
  numero?: number | string | null;
  dataContabilistica?: Date | string | null;
  descricao?: string | null;
  /** Quando presente, rascunhos são ignorados mesmo que cheguem até aqui. */
  estado?: string | null;
  createdAt?: Date | string | null;
  validadoEm?: Date | string | null;
  diario?: { codigo: string; designacao: string } | null;
  linhas?: Array<{
    numeroLinha?: number;
    debito?: unknown;
    credito?: unknown;
    conta?: { codigo?: string; designacao?: string | null } | null;
  }> | null;
}

/** Converte datas do Prisma (ou strings de teste) para `Date`. */
function paraData(valor: Date | string | null | undefined): Date {
  if (valor instanceof Date) return valor;
  const data = new Date(valor ?? '');
  return Number.isNaN(data.getTime()) ? new Date(0) : data;
}

/**
 * Mapeia os lançamentos publicados para `GeneralLedgerEntries`.
 *
 * `NumberOfEntries` conta as transações (vouchers), como o XSD exige; os
 * totais são derivados das linhas escritas, nunca dos `totalDebito`/
 * `totalCredito` do lançamento: é o que garante que o bloco bate com o próprio
 * XML. Diários sem transações e lançamentos sem linhas são ignorados, para não
 * produzir um bloco que o validador rejeitaria.
 *
 * @returns `undefined` quando não há lançamentos publicados com linhas — um
 * bloco vazio é pior do que um bloco ausente.
 */
export function construirGeneralLedgerEntries(
  lancamentos: LancamentoContabilParaSaft[],
  moeda?: string,
): SaftGeneralLedgerEntries | undefined {
  // O esquema SAF-T não tem `Currency` em `Transaction`; o parâmetro existe
  // para alinhar a assinatura com a moeda do contexto do serviço.
  void moeda;

  const porDiario = new Map<string, SaftGeneralLedgerTransaction[]>();
  const descricoesDiario = new Map<string, string>();
  let numberOfEntries = 0;
  let totalDebito = 0;
  let totalCredito = 0;

  for (const lancamento of lancamentos) {
    if (!lancamento) continue;
    if (lancamento.estado && !ESTADOS_LANCAMENTO_PUBLICADO.has(lancamento.estado)) continue;
    const linhas = lancamento.linhas ?? [];
    if (linhas.length === 0) continue;

    // Uma transação por lançamento publicado, independentemente do número de
    // linhas: é este o significado de `NumberOfEntries` no XSD.
    numberOfEntries += 1;

    const journalId = lancamento.diario?.codigo ?? '';
    descricoesDiario.set(journalId, lancamento.diario?.designacao ?? journalId);
    const transacoes = porDiario.get(journalId) ?? [];

    const linhasSaft: SaftGeneralLedgerLine[] = [...linhas]
      .sort((a, b) => (a.numeroLinha ?? 0) - (b.numeroLinha ?? 0))
      .map((linha) => {
        const debito = paraNumero(linha.debito);
        const credito = paraNumero(linha.credito);
        totalDebito += debito;
        totalCredito += credito;

        return {
          LineNumber: linha.numeroLinha ?? 0,
          AccountID: linha.conta?.codigo ?? '',
          DebitAmount: formatarValor(debito),
          CreditAmount: formatarValor(credito),
        };
      });

    const numero = lancamento.numero;
    const transactionId =
      numero !== null && numero !== undefined && numero !== ''
        ? String(numero)
        : (lancamento.id ?? `${journalId}-${transacoes.length + 1}`);

    const transacao: SaftGeneralLedgerTransaction = {
      TransactionID: transactionId,
      TransactionDate: formatarData(paraData(lancamento.dataContabilistica)),
      SourceID: SOURCE_ID_CONTABILIDADE,
      SystemEntryDate: formatarDataHora(
        paraData(lancamento.validadoEm ?? lancamento.createdAt ?? lancamento.dataContabilistica),
      ),
      Description: lancamento.descricao ?? '',
      Line: linhasSaft,
    };

    transacoes.push(transacao);
    porDiario.set(journalId, transacoes);
  }

  if (numberOfEntries === 0) return undefined;

  const journal: SaftGeneralLedgerJournal[] = [...porDiario.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([journalId, transacoes]) => ({
      JournalID: journalId,
      Description: descricoesDiario.get(journalId) ?? journalId,
      Transaction: transacoes,
    }));

  return {
    NumberOfEntries: numberOfEntries,
    TotalDebit: formatarValor(totalDebito),
    TotalCredit: formatarValor(totalCredito),
    Journal: journal,
  };
}

/**
 * Monta o documento SAF-T completo.
 *
 * `Hashes` e `Header.Hash` ficam por preencher: dependem do XML já
 * serializado e são calculados em `saft.hash.ts`, que devolve o documento
 * completo. Ver `saft.service.ts` para a ordem das fases.
 */
export function construirAuditFile(
  contexto: SaftContexto,
  dados: {
    customers: SaftCustomer[];
    products: SaftProduct[];
    invoices: SaftInvoice[];
    taxasUsadas: number[];
    generalLedgerEntries?: SaftGeneralLedgerEntries;
  },
): SaftAuditFileSemHashes {
  const agora = new Date();

  return {
    Header: {
      AuditFileVersion: SAFT_AUDIT_VERSION,
      CompanyName: contexto.nomeEmpresa,
      CompanyID: contexto.identificadorEmpresa,
      TaxRegistrationNumber: contexto.nifEmpresa,
      TaxAccountingBasis:
        contexto.regimeIva === 'simplificado' ? 'C' : SAFT_TAX_ACCOUNTING_BASIS_N,
      CompanyFiscalName: contexto.nomeEmpresa,
      CompanyAddress: contexto.enderecoEmpresa,
      CompanyPostalCode: contexto.codigoPostalEmpresa,
      CompanyCity: contexto.cidadeEmpresa,
      CompanyCountry: contexto.paisEmpresa,
      CompanyEmail: contexto.emailEmpresa,
      CompanyTelephone: contexto.telefoneEmpresa,
      CompanyFax: contexto.faxEmpresa,
      FiscalYear: String(contexto.ano),
      Month: formatarMes(contexto.mes),
      DateStart: formatarData(contexto.dataInicio),
      DateEnd: formatarData(contexto.dataFim),
      Currency: contexto.moeda,
      DateCreated: formatarDataHora(agora),
      TaxEntity: contexto.paisEmpresa === 'PT' ? 'PT' : 'AO',
      SoftwareCertificateNumber: '',
      SoftwareCertificateSerialNumber: '',
    },
    Body: {
      MasterFiles: {
        Company: {
          TaxRegistrationNumber: contexto.nifEmpresa,
          Name: contexto.nomeEmpresa,
          BusinessName: contexto.nomeEmpresa,
          CompanyName: contexto.nomeEmpresa,
          CompanyAddress: contexto.enderecoEmpresa,
          CompanyPostalCode: contexto.codigoPostalEmpresa,
          CompanyCity: contexto.cidadeEmpresa,
          CompanyCountry: contexto.paisEmpresa,
          CompanyEmail: contexto.emailEmpresa,
          CompanyTelephone: contexto.telefoneEmpresa,
          CompanyFax: contexto.faxEmpresa,
          TaxAccountingBasis: contexto.regimeIva === 'simplificado' ? 'C' : 'N',
          CompanyType: contexto.paisEmpresa === 'PT' ? 'PT' : 'AO',
          BusinessStartDate: formatarData(contexto.dataInicio),
          CompanyFiscalName: contexto.nomeEmpresa,
          CompanyFiscalNumber: contexto.nifEmpresa,
        },
        Customer: dados.customers,
        Product: dados.products,
        TaxTable: construirTaxTable(dados.taxasUsadas, contexto.paisEmpresa),
      },
      // Irmão de MasterFiles, entre este e SourceDocuments, como o XSD exige.
      ...(dados.generalLedgerEntries
        ? { GeneralLedgerEntries: dados.generalLedgerEntries }
        : {}),
      SourceDocuments: {
        SalesInvoices: {
          NumberOfEntries: dados.invoices.length,
          // Notas de crédito entram em `TotalCredit`; tudo o resto em
          // `TotalDebit`. Um ficheiro onde as duas colunas não fecham
          // contra os `Invoice` é rejeitado por incoerência aritmética.
          TotalDebit: formatarValor(
            dados.invoices
              .filter((f) => f.DocumentStatus.DocumentStatus === 'N' && f.InvoiceNo && !ehNotaCredito(f))
              .reduce((soma, f) => soma + paraNumero(f.DocumentTotals.NetTotal), 0),
          ),
          TotalCredit: formatarValor(
            dados.invoices
              .filter((f) => f.DocumentStatus.DocumentStatus === 'N' && ehNotaCredito(f))
              .reduce((soma, f) => soma + paraNumero(f.DocumentTotals.NetTotal), 0),
          ),
          Invoice: dados.invoices,
        },
      },
    },
  };
}

/**
 * Uma nota de crédito é o documento que entra em `TotalCredit`.
 */
function ehNotaCredito(fatura: SaftInvoice): boolean {
  return (
    fatura.Line.some((l) => paraNumero(l.CreditAmount) > 0) ||
    fatura.InvoiceNo.startsWith('NC ') ||
    fatura.HashControl.startsWith('NC ')
  );
}

/** Nome do ficheiro segundo a convenção da AT: `SAFTPT01_2026_09.xml`. */
export function nomeFicheiroSaft(contexto: SaftContexto): string {
  return `SAFTPT01_${contexto.ano}_${formatarMes(contexto.mes)}.xml`;
}

