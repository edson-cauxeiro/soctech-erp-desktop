/**
 * @file saft.tipos.ts
 * @description Modelo de dados do ficheiro SAF-T (AO) — subconjunto estruturado
 * da Faturação (FIS-01, RN08.1).
 *
 * Âmbito: `AuditFile` > `Header` + `Body` + `Hashes`. A ordem dos filhos de
 * `Body` é a do XSD publicado: `MasterFiles`, `GeneralLedgerEntries` e
 * `SourceDocuments`. `GeneralLedgerEntries` é escrito quando existem
 * lançamentos contabilísticos publicados no período; sem eles o bloco é
 * omitido, porque um bloco vazio é rejeitado pelo esquema. `StockMovement`
 * não é emitido.
 *
 * Os nomes dos campos seguem o `AuditVersion` suportado. A correspondência
 * entre o Prisma e estes nós está em `saft.mapeamento.ts`; este ficheiro
 * descreve o destino, não a origem.
 */

/** Versão do esquema SAF-T gerada por este motor. */
export const SAFT_AUDIT_VERSION = '1.01_01';

/** Algoritmo de hash exigido pela AT em ambos os elementos `Hash`. */
export const SAFT_HASH_ALGORITHM = 'SHA1';

/** Identificadores exigidos pelo esquema dentro de `TaxTable`. */
export const SAFT_TAX_TABLE_IDS = ['RED', 'INT', 'NOR', 'ISE', 'OUT'] as const;

export type SaftTaxTableId = (typeof SAFT_TAX_TABLE_IDS)[number];

/** Identificadores de tipo de documento permitidos em `SourceDocuments`. */
export const SAFT_INVOICE_TYPES = ['FT', 'FS', 'FR', 'ND', 'NC'] as const;

export type SaftInvoiceType = (typeof SAFT_INVOICE_TYPES)[number];

/** `TaxAccountingBasis`: `N` = regime normal (o mais comum; `C` = simplificado). */
export const SAFT_TAX_ACCOUNTING_BASIS_N = 'N';

/** Designação do ficheiro tal e qual a AT a nomeia. */
export const SAFT_XML_ROOT = 'AuditFile';

/** Número de casas decimais com que os montantes são escritos no XML. */
export const SAFT_CASAS_DECIMAIS = 2;

/**
 * Cabeçalho (`<Header>`). Todos os campos são obrigatórios pela AT; os que
 * não temos fonte que os preencha são preenchidos com string vazia, o que o
 * esquema aceita e evita inventar dados.
 *
 * `Hash` é preenchido depois de os restantes campos estarem fechados — é a
 * razão de `SaftAuditFileSemHashes` existir.
 */
export interface SaftHeader {
  AuditFileVersion: string;
  CompanyName: string;
  CompanyID: string;
  TaxRegistrationNumber: string;
  TaxAccountingBasis: string;
  CompanyFiscalName: string;
  CompanyAddress: string;
  CompanyPostalCode: string;
  CompanyCity: string;
  CompanyCountry: string;
  CompanyEmail: string;
  CompanyTelephone: string;
  CompanyFax: string;
  FiscalYear: string;
  Month: string;
  DateStart: string;
  DateEnd: string;
  Currency: string;
  DateCreated: string;
  TaxEntity: string;
  SoftwareCertificateNumber: string;
  SoftwareCertificateSerialNumber: string;
  Hash: string;
}

/** Produto ou serviço (`MasterFiles/Product`). */
export interface SaftProduct {
  ProductType: 'P' | 'S' | 'O' | 'E' | 'I';
  ProductCode: string;
  ProductDescription: string;
  ProductNumberCode?: string;
  UnitOfMeasure: string;
}

/** Cliente (`MasterFiles/Customer`). */
export interface SaftCustomer {
  CustomerID: string;
  TaxRegistrationNumber: string;
  Name: string;
  CompanyName: string;
  Address: string;
  PostalCode: string;
  City: string;
  Country: string;
  Email: string;
  Telephone: string;
  Fax: string;
  CustomerType: string;
  CustomerAccount: string;
}

/** Linha de documento (`SourceDocuments/SalesInvoices/Line`). */
export interface SaftInvoiceLine {
  LineNumber: number;
  ProductCode: string;
  ProductDescription: string;
  Quantity: string;
  UnitOfMeasure: string;
  UnitPrice: string;
  TaxPointDate: string;
  Description: string;
  CreditAmount: string;
  DebitAmount: string;
  Tax: SaftTaxTableId;
  TaxAmount: string;
  TaxCode: string;
  TaxBase: string;
}

/** Totais do documento (`DocumentTotals`). */
export interface SaftDocumentTotals {
  TaxPayable: string;
  NetTotal: string;
  GrossTotal: string;
}

/** `DocumentStatus` — controlo de estado do documento. */
export interface SaftDocumentStatus {
  DocumentStatus: 'N' | 'A';
  DocumentStatusDate: string;
  SourceID: 'DocumentoOrigem';
  SourceBilling: 'DocumentoContabilistico';
  SystemEntryDate: string;
}

/**
 * Documento de vendas (`SourceDocuments/SalesInvoices`).
 *
 * `Tax`/`TaxTotal` só existem quando todas as linhas do documento estão à
 * mesma taxa — a AT exige-os quando há uma taxa única e proíbe-os quando há
 * várias. `TaxAccrued` só é preenchido quando o documento tem liquidação.
 */
export interface SaftInvoice {
  InvoiceNo: string;
  DocumentStatus: SaftDocumentStatus;
  HashControl: string;
  Period: string;
  TransactionDate: string;
  SourceID: 'DocumentoOrigem';
  SourceBilling: 'DocumentoContabilistico';
  SystemEntryDate: string;
  CustomerID: string;
  Line: SaftInvoiceLine[];
  DocumentTotals: SaftDocumentTotals;
  Tax?: SaftTaxTableId;
  TaxTotal?: string;
  TaxAccrued?: string;
  Currency?: string;
  ExchangeRate?: string;
}

export interface SaftTaxTableEntry {
  TaxType: string;
  TaxCode: string;
  TaxDescription: string;
  Tax: number;
}

export interface SaftTaxTable {
  TaxTableID: SaftTaxTableId;
  Tax: SaftTaxTableEntry[];
}

export interface SaftSalesInvoices {
  NumberOfEntries: number;
  TotalDebit: string;
  TotalCredit: string;
  Invoice: SaftInvoice[];
}

export interface SaftSourceDocuments {
  SalesInvoices: SaftSalesInvoices;
}

export interface SaftCompany {
  TaxRegistrationNumber: string;
  Name: string;
  BusinessName: string;
  CompanyName: string;
  CompanyAddress: string;
  CompanyPostalCode: string;
  CompanyCity: string;
  CompanyCountry: string;
  CompanyEmail: string;
  CompanyTelephone: string;
  CompanyFax: string;
  TaxAccountingBasis: string;
  CompanyType: string;
  BusinessStartDate: string;
  CompanyFiscalName: string;
  CompanyFiscalNumber: string;
}

/** Linha de `GeneralLedgerEntries/Journal/Transaction/Line`. */
export interface SaftGeneralLedgerLine {
  LineNumber: number;
  AccountID: string;
  DebitAmount: string;
  CreditAmount: string;
}

/** Transação de `GeneralLedgerEntries/Journal/Transaction`. */
export interface SaftGeneralLedgerTransaction {
  TransactionID: string;
  TransactionDate: string;
  SourceID: string;
  SystemEntryDate: string;
  Description: string;
  Line: SaftGeneralLedgerLine[];
}

/** Diário de `GeneralLedgerEntries/Journal`. */
export interface SaftGeneralLedgerJournal {
  JournalID: string;
  Description: string;
  Transaction: SaftGeneralLedgerTransaction[];
}

/** `NumberOfEntries` conta transações (vouchers), não linhas. */
export interface SaftGeneralLedgerEntries {
  NumberOfEntries: number;
  TotalDebit: string;
  TotalCredit: string;
  Journal: SaftGeneralLedgerJournal[];
}

export interface SaftMasterFiles {
  Company: SaftCompany;
  Customer: SaftCustomer[];
  Product: SaftProduct[];
  TaxTable: SaftTaxTable[];
}

/**
 * Filhos de `<Body>` pela ordem do XSD. `GeneralLedgerEntries` é irmão de
 * `MasterFiles` (não seu filho) e antecede `SourceDocuments`.
 */
export interface SaftBody {
  MasterFiles: SaftMasterFiles;
  GeneralLedgerEntries?: SaftGeneralLedgerEntries;
  SourceDocuments: SaftSourceDocuments;
}

export interface SaftHashEntry {
  DigestMethod: string;
  DigestValue: string;
  SourceID: string;
  SourceHash: string;
}

export interface SaftHashes {
  Hash: SaftHashEntry[];
}

/** Documento completo pronto a serializar. */
export interface SaftAuditFile {
  Header: SaftHeader;
  Body: SaftBody;
  Hashes: SaftHashes;
}

/**
 * Documento antes de os `Hash` existirem — tanto o bloco `<Hashes>` como o
 * campo `Header.Hash` ficam por preencher.
 */
export type SaftAuditFileSemHashes = {
  Header: Omit<SaftHeader, 'Hash'>;
  Body: SaftBody;
};

/** Contexto de empresa e período, resolvido antes do mapeamento. */
export interface SaftContexto {
  empresaId: string;
  nomeEmpresa: string;
  nifEmpresa: string;
  identificadorEmpresa: string;
  enderecoEmpresa: string;
  codigoPostalEmpresa: string;
  cidadeEmpresa: string;
  paisEmpresa: string;
  emailEmpresa: string;
  telefoneEmpresa: string;
  faxEmpresa: string;
  regimeIva: string;
  moeda: string;
  ano: number;
  mes: number;
  dataInicio: Date;
  dataFim: Date;
}