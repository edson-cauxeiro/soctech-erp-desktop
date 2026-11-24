/**
 * @file saft.construcao.ts
 * @description Serialização do modelo SAF-T para XML (FIS-01).
 *
 * Usa `xmlbuilder`, que escapa os valores por nós. Isto importa: um nome de
 * cliente com `&` ou um endereço com `<` produziria XML malformado e a AT
 * rejeitaria o ficheiro inteiro — não a linha.
 *
 * A ordem dos elementos é a do esquema e não é negociável. O `xmlbuilder`
 * preserva a ordem de inserção, por isso escrevemos por ordem em vez de
 * iterar o objecto.
 */

import { create, type XMLElement } from 'xmlbuilder';
import type {
  SaftAuditFile,
  SaftBody,
  SaftCustomer,
  SaftGeneralLedgerEntries,
  SaftInvoice,
  SaftProduct,
  SaftTaxTable,
} from './saft.tipos';
import { SAFT_XML_ROOT } from './saft.tipos';

/** Elementos de `Header` que são opcionais e podem não existir. */
const CAMPOS_HEADER_SEMPRE = [
  'AuditFileVersion',
  'CompanyName',
  'CompanyID',
  'TaxRegistrationNumber',
  'TaxAccountingBasis',
  'CompanyFiscalName',
  'CompanyAddress',
  'CompanyPostalCode',
  'CompanyCity',
  'CompanyCountry',
  'CompanyEmail',
  'CompanyTelephone',
  'CompanyFax',
  'FiscalYear',
  'Month',
  'DateStart',
  'DateEnd',
  'Currency',
  'DateCreated',
  'TaxEntity',
  'SoftwareCertificateNumber',
  'SoftwareCertificateSerialNumber',
  'Hash',
] as const;

/** Escreve os elementos não nulos de um objecto, na ordem da lista de chaves. */
function escreverCampos(
  pai: XMLElement,
  campos: readonly string[],
  valores: object,
): void {
  for (const campo of campos) {
    const valor = valores[campo];
    if (valor === null || valor === undefined) continue;
    pai.ele(campo, {}, String(valor));
  }
}

/**
 * Escreve `<GeneralLedgerEntries>` na ordem do esquema: totais, depois os
 * diários, transações e linhas. Um `Journal` sem transações (ou cujas
 * transações não têm linhas) não é escrito — um bloco vazio é rejeitado pela
 * AT e não acrescenta informação nenhuma.
 */
export function escreverGeneralLedgerEntries(
  pai: XMLElement,
  entries: SaftGeneralLedgerEntries,
): void {
  const bloco = pai.ele('GeneralLedgerEntries');
  escreverCampos(bloco, ['NumberOfEntries', 'TotalDebit', 'TotalCredit'], entries);

  for (const journal of entries.Journal ?? []) {
    const transacoes = journal.Transaction.filter((transaction) => transaction.Line.length > 0);
    if (transacoes.length === 0) continue;

    const elementoJournal = bloco.ele('Journal');
    escreverCampos(elementoJournal, ['JournalID', 'Description'], journal);

    for (const transaction of transacoes) {
      const elementoTransaction = elementoJournal.ele('Transaction');
      escreverCampos(
        elementoTransaction,
        ['TransactionID', 'TransactionDate', 'SourceID', 'SystemEntryDate', 'Description'],
        transaction,
      );

      for (const linha of transaction.Line) {
        escreverCampos(
          elementoTransaction.ele('Line'),
          ['LineNumber', 'AccountID', 'DebitAmount', 'CreditAmount'],
          linha,
        );
      }
    }
  }
}

/** Constrói `<MasterFiles>`, que não contém `GeneralLedgerEntries`. */
function construirMasterFiles(pai: XMLElement, body: SaftBody): void {
  const master = pai.ele('MasterFiles');
  const masterFiles = body.MasterFiles;

  const company = master.ele('Company');
  escreverCampos(
    company,
    [
      'TaxRegistrationNumber',
      'Name',
      'BusinessName',
      'CompanyName',
      'CompanyAddress',
      'CompanyPostalCode',
      'CompanyCity',
      'CompanyCountry',
      'CompanyEmail',
      'CompanyTelephone',
      'CompanyFax',
      'TaxAccountingBasis',
      'CompanyType',
      'BusinessStartDate',
      'CompanyFiscalName',
      'CompanyFiscalNumber',
    ],
    masterFiles.Company,
  );

  for (const cliente of masterFiles.Customer) {
    escreverCustomer(master.ele('Customer'), cliente);
  }
  for (const produto of masterFiles.Product) {
    escreverProduct(master.ele('Product'), produto);
  }
  for (const tabela of masterFiles.TaxTable) {
    construirTaxTable(master, tabela);
  }
}

/** Escreve um `<Customer>`. */
export function escreverCustomer(pai: XMLElement, cliente: SaftCustomer): void {
  escreverCampos(
    pai,
    [
      'CustomerID',
      'TaxRegistrationNumber',
      'Name',
      'CompanyName',
      'Address',
      'PostalCode',
      'City',
      'Country',
      'Email',
      'Telephone',
      'Fax',
      'CustomerType',
      'CustomerAccount',
    ],
    cliente,
  );
}

/** Escreve um `<Product>`. */
export function escreverProduct(pai: XMLElement, produto: SaftProduct): void {
  escreverCampos(
    pai,
    ['ProductType', 'ProductCode', 'ProductDescription', 'ProductNumberCode', 'UnitOfMeasure'],
    produto,
  );
}

/** Escreve uma `<TaxTable>` com as suas entradas `<Tax>`. */
export function construirTaxTable(pai: XMLElement, tabela: SaftTaxTable): void {
  const elemento = pai.ele('TaxTable');
  elemento.ele('TaxTableID', {}, tabela.TaxTableID);
  for (const entrada of tabela.Tax) {
    escreverCampos(elemento.ele('Tax'), ['TaxType', 'TaxCode', 'TaxDescription', 'Tax'], entrada);
  }
}

/** Escreve um `<Invoice>` com as suas `<Line>`. */
export function escreverInvoice(pai: XMLElement, fatura: SaftInvoice): void {
  const invoice = pai.ele('Invoice');

  invoice.ele('InvoiceNo', {}, fatura.InvoiceNo);

  const status = invoice.ele('DocumentStatus');
  escreverCampos(
    status,
    ['DocumentStatus', 'DocumentStatusDate', 'SourceID', 'SourceBilling', 'SystemEntryDate'],
    fatura.DocumentStatus,
  );

  escreverCampos(invoice, ['HashControl', 'Period', 'TransactionDate', 'SourceID', 'SourceBilling'], {
    HashControl: fatura.HashControl,
    Period: fatura.Period,
    TransactionDate: fatura.TransactionDate,
    SourceID: fatura.SourceID,
    SourceBilling: fatura.SourceBilling,
  });

  invoice.ele('SystemEntryDate', {}, fatura.SystemEntryDate);
  invoice.ele('CustomerID', {}, fatura.CustomerID);

  for (const linha of fatura.Line) {
    const line = invoice.ele('Line');
    escreverCampos(
      line,
      [
        'LineNumber',
        'ProductCode',
        'ProductDescription',
        'Quantity',
        'UnitOfMeasure',
        'UnitPrice',
        'TaxPointDate',
        'Description',
        'CreditAmount',
        'DebitAmount',
        'Tax',
        'TaxAmount',
        'TaxCode',
        'TaxBase',
      ],
      linha,
    );
  }

  const totais = invoice.ele('DocumentTotals');
  escreverCampos(totais, ['TaxPayable', 'NetTotal', 'GrossTotal'], fatura.DocumentTotals);

  // `Tax`/`TaxTotal` só existem com taxa única; `TaxAccrued` só quando
  // liquido. `escreverCampos` salta os que não existem.
  escreverCampos(invoice, ['Tax', 'TaxTotal', 'TaxAccrued'], fatura);
}

/** Constrói `<SourceDocuments>` com o bloco de `SalesInvoices`. */
function construirSourceDocuments(pai: XMLElement, body: SaftBody): void {
  const source = pai.ele('SourceDocuments');
  const vendas = source.ele('SalesInvoices');
  const salesInvoices = body.SourceDocuments.SalesInvoices;

  escreverCampos(vendas, ['NumberOfEntries', 'TotalDebit', 'TotalCredit'], {
    NumberOfEntries: salesInvoices.NumberOfEntries,
    TotalDebit: salesInvoices.TotalDebit,
    TotalCredit: salesInvoices.TotalCredit,
  });

  for (const fatura of salesInvoices.Invoice) {
    escreverInvoice(vendas, fatura);
  }
}

/**
 * Escreve os filhos de `<Body>` na ordem do XSD: `MasterFiles`,
 * `GeneralLedgerEntries` (quando existem lançamentos) e `SourceDocuments`.
 */
function escreverFilhosBody(elemento: XMLElement, body: SaftBody): void {
  construirMasterFiles(elemento, body);
  if (body.GeneralLedgerEntries) {
    escreverGeneralLedgerEntries(elemento, body.GeneralLedgerEntries);
  }
  construirSourceDocuments(elemento, body);
}

/**
 * Constrói `<Body>`.
 *
 * Exportado isoladamente porque o `Hash` do corpo é calculado sobre este XML
 * sozinho, antes de existir o `Hashes`. Ver `saft.service.ts`, fase 4.
 */
export function construirBody(body: SaftBody): XMLElement {
  const elemento = create('Body');
  escreverFilhosBody(elemento, body);
  return elemento;
}

/**
 * Escreve o `<Body>` dentro de um pai já existente.
 *
 * Existe separada de `construirBody` porque os dois usos precisam de coisas
 * diferentes: o hash quer um elemento à parte, o documento final quer o `<Body>`
 * no sítio certo da árvore.
 */
export function escreverBody(pai: XMLElement, body: SaftBody): XMLElement {
  const elemento = pai.ele('Body');
  escreverFilhosBody(elemento, body);
  return elemento;
}

/**
 * Serializa um elemento para string.
 *
 * O `xmlbuilder` aceita as opções de formatação no `.end()` ou no construtor,
 * mas a assinatura do tipo muda conforme a versão — daí o wrapper, para que a
 * chamada exista num sítio só.
 */
export function serializarElemento(elemento: XMLElement): string {
  return elemento.doc().end({
    pretty: true,
    indent: '  ',
  });
}

/**
 * Serializa o documento SAF-T completo para XML.
 *
 * O `Body` é serializado primeiro e isoladamente, porque o `Hash` do corpo é o
 * digest desse XML — não faz sentido calculá-lo sobre um pedaço do documento.
 *
 * @param documento - Documento já com `Header.Hash` e `Hashes` preenchidos.
 * @returns XML formatado, com declaração XML e indentação de 2 espaços.
 */
export function serializarSaft(documento: SaftAuditFile): string {
  const raiz = create(SAFT_XML_ROOT, { version: '1.0', encoding: 'UTF-8' });

  const header = raiz.ele('Header');
  escreverCampos(header, CAMPOS_HEADER_SEMPRE, documento.Header);

  // `<Body>` tem de ser criado na raiz entre `<Header>` e `<Hashes>`: a ordem
  // dos elementos é a do esquema, e o `xmlbuilder` escreve na ordem de chamada.
  escreverBody(raiz, documento.Body);

  const hashes = raiz.ele('Hashes');
  for (const entrada of documento.Hashes.Hash) {
    escreverCampos(hashes.ele('Hash'), ['DigestMethod', 'DigestValue', 'SourceID', 'SourceHash'], entrada);
  }

  return serializarElemento(raiz);
}