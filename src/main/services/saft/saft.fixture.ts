/**
 * @file saft.fixture.ts
 * @description Documento SAF-T de exemplo, partilhado pelos testes.
 *
 * Um único ficheiro de fixture para o mapeamento, a construção, os hashes e o
 * validador. Se cada teste montasse o seu próprio documento, cada um bateria
 * com um erro de montagem próprio — e o teste do validador acabaria a testar
 * o seu próprio `given`.
 */

import type { SaftAuditFile, SaftContexto } from './saft.tipos';
import { SAFT_AUDIT_VERSION } from './saft.tipos';
import { calcularHashBody, calcularHashHeader, construirHashes } from './saft.hash';
import { construirBody, serializarElemento, serializarSaft } from './saft.construcao';

/** Contexto de empresa e período para os testes. */
export const contextoFixture: SaftContexto = {
  empresaId: 'emp-1',
  nomeEmpresa: 'DoraERP Soluções Empresariais, Lda.',
  nifEmpresa: '501442600',
  identificadorEmpresa: '501442600',
  enderecoEmpresa: 'Avenida da Liberdade, 100, 1250-001 Lisboa',
  codigoPostalEmpresa: '1250-001',
  cidadeEmpresa: 'Lisboa',
  paisEmpresa: 'PT',
  emailEmpresa: 'geral@doraerp.pt',
  telefoneEmpresa: '+351 210 000 000',
  faxEmpresa: '',
  regimeIva: 'geral',
  moeda: 'EUR',
  ano: 2026,
  mes: 3,
  dataInicio: new Date(2026, 2, 1),
  dataFim: new Date(2026, 2, 31),
};

/** Documento sem `Hashes` nem `Header.Hash`. */
export const documentoFixtureSemHashes = {
  Header: {
    AuditFileVersion: SAFT_AUDIT_VERSION,
    CompanyName: contextoFixture.nomeEmpresa,
    CompanyID: contextoFixture.identificadorEmpresa,
    TaxRegistrationNumber: contextoFixture.nifEmpresa,
    TaxAccountingBasis: 'N',
    CompanyFiscalName: contextoFixture.nomeEmpresa,
    CompanyAddress: contextoFixture.enderecoEmpresa,
    CompanyPostalCode: contextoFixture.codigoPostalEmpresa,
    CompanyCity: contextoFixture.cidadeEmpresa,
    CompanyCountry: contextoFixture.paisEmpresa,
    CompanyEmail: contextoFixture.emailEmpresa,
    CompanyTelephone: contextoFixture.telefoneEmpresa,
    CompanyFax: contextoFixture.faxEmpresa,
    FiscalYear: '2026',
    Month: '03',
    DateStart: '2026-03-01',
    DateEnd: '2026-03-31',
    Currency: 'EUR',
    DateCreated: '2026-04-01T09:30:00',
    TaxEntity: 'PT',
    SoftwareCertificateNumber: '',
    SoftwareCertificateSerialNumber: '',
  },
  Body: {
    MasterFiles: {
      Company: {
        TaxRegistrationNumber: contextoFixture.nifEmpresa,
        Name: contextoFixture.nomeEmpresa,
        BusinessName: contextoFixture.nomeEmpresa,
        CompanyName: contextoFixture.nomeEmpresa,
        CompanyAddress: contextoFixture.enderecoEmpresa,
        CompanyPostalCode: contextoFixture.codigoPostalEmpresa,
        CompanyCity: contextoFixture.cidadeEmpresa,
        CompanyCountry: contextoFixture.paisEmpresa,
        CompanyEmail: contextoFixture.emailEmpresa,
        CompanyTelephone: contextoFixture.telefoneEmpresa,
        CompanyFax: contextoFixture.faxEmpresa,
        TaxAccountingBasis: 'N',
        CompanyType: 'PT',
        BusinessStartDate: '2026-03-01',
        CompanyFiscalName: contextoFixture.nomeEmpresa,
        CompanyFiscalNumber: contextoFixture.nifEmpresa,
      },
      Customer: [
        {
          CustomerID: 'CLI-001',
          TaxRegistrationNumber: '501442600',
          Name: 'Cliente Exemplo, Lda.',
          CompanyName: 'Cliente Exemplo, Lda.',
          Address: 'Rua Direita, 45, 1200-192 Lisboa',
          PostalCode: '1200-192',
          City: 'Lisboa',
          Country: 'PT',
          Email: 'geral@clienteexemplo.pt',
          Telephone: '+351 220 000 000',
          Fax: '',
          CustomerType: 'PT',
          CustomerAccount: '',
        },
      ],
      Product: [
        {
          ProductType: 'P' as const,
          ProductCode: 'ART-001',
          ProductDescription: 'Café torrado 250g',
          ProductNumberCode: 'ART-001',
          UnitOfMeasure: 'UN',
        },
      ],
      TaxTable: [
        {
          TaxTableID: 'NOR' as const,
          Tax: [
            {
              TaxType: 'IVA',
              TaxCode: 'NOR',
              TaxDescription: 'Normal',
              Tax: 23,
            },
          ],
        },
        {
          TaxTableID: 'RED' as const,
          Tax: [{ TaxType: 'IVA', TaxCode: 'RED', TaxDescription: 'Reduzida', Tax: 6 }],
        },
        {
          TaxTableID: 'INT' as const,
          Tax: [{ TaxType: 'IVA', TaxCode: 'INT', TaxDescription: 'Intermédia', Tax: 13 }],
        },
        {
          TaxTableID: 'ISE' as const,
          Tax: [{ TaxType: 'ISE', TaxCode: 'ISE', TaxDescription: 'Isenta', Tax: 0 }],
        },
        {
          TaxTableID: 'OUT' as const,
          Tax: [{ TaxType: 'IVA', TaxCode: 'OUT', TaxDescription: 'Outra', Tax: 0 }],
        },
      ],
    },
    SourceDocuments: {
      SalesInvoices: {
        NumberOfEntries: 1,
        TotalDebit: '100.00',
        TotalCredit: '0.00',
        Invoice: [
          {
            InvoiceNo: '0001',
            DocumentStatus: {
              DocumentStatus: 'N' as const,
              DocumentStatusDate: '2026-03-15',
              SourceID: 'DocumentoOrigem' as const,
              SourceBilling: 'DocumentoContabilistico' as const,
              SystemEntryDate: '2026-03-15T10:12:00',
            },
            HashControl: 'a'.repeat(40),
            Period: '03',
            TransactionDate: '2026-03-15',
            SourceID: 'DocumentoOrigem' as const,
            SourceBilling: 'DocumentoContabilistico' as const,
            SystemEntryDate: '2026-03-15T10:12:00',
            CustomerID: 'CLI-001',
            Line: [
              {
                LineNumber: 1,
                ProductCode: 'ART-001',
                ProductDescription: 'Café torrado 250g',
                Quantity: '1.0000',
                UnitOfMeasure: 'UN',
                UnitPrice: '81.30',
                TaxPointDate: '2026-03-15',
                Description: 'Café torrado 250g.',
                CreditAmount: '0.00',
                DebitAmount: '100.00',
                Tax: 'NOR' as const,
                TaxAmount: '23.00',
                TaxCode: 'NOR' as const,
                TaxBase: '100.00',
              },
            ],
            DocumentTotals: {
              TaxPayable: '23.00',
              NetTotal: '100.00',
              GrossTotal: '123.00',
            },
            Tax: 'NOR' as const,
            TaxTotal: '23.00',
            Currency: 'EUR',
          },
        ],
      },
    },
  },
};

/**
 * Documento completo, com os `Hash` calculados pelas mesmas funções que o
 * serviço usa em produção.
 */
export function documentoFixtureCompleto(): SaftAuditFile {
  const semHashes = structuredClone(documentoFixtureSemHashes);
  const bodyHash = calcularHashBody(serializarElemento(construirBody(semHashes.Body)));
  const headerHash = calcularHashHeader(semHashes.Header);

  return {
    Header: { ...semHashes.Header, Hash: headerHash },
    Body: semHashes.Body,
    Hashes: { Hash: construirHashes(headerHash, bodyHash) },
  };
}

/** XML do documento de fixture. */
export function xmlFixture(): string {
  return serializarSaft(documentoFixtureCompleto());
}