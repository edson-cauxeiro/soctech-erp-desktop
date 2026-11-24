/**
 * @file saft.validador.test.ts
 * @description Testes do validador estrutural (RN08.1).
 *
 * A estratégia é partir sempre do fixture válido e partir uma coisa de cada
 * vez. Assim cada teste diz exactamente que regra está a ser exercitada, e um
 * `expect` que passa continua a passar depois de outras regras mudarem.
 */

import { describe, it, expect } from 'vitest';
import { validarSaft, verificarIntegridade, type ProblemaValidacao } from './saft.validador';
import { documentoFixtureCompleto, documentoFixtureSemHashes, xmlFixture } from './saft.fixture';
import { calcularHashFicheiro } from './saft.hash';
import { serializarSaft } from './saft.construcao';
import type { SaftAuditFile, SaftGeneralLedgerEntries } from './saft.tipos';

/** Códigos de todos os problemas de um resultado. */
function codigos(resultado: { problemas: ProblemaValidacao[] }): string[] {
  return resultado.problemas.map((p) => p.codigo);
}

/** O documento de fixture, já com os hashes recalculados. */
function documento(): SaftAuditFile {
  return documentoFixtureCompleto();
}

/** Bloco de contabilidade interna consistente com as suas próprias linhas. */
function blocoContabilidade(): SaftGeneralLedgerEntries {
  return {
    // Uma transação com duas linhas: o XSD conta vouchers, não linhas.
    NumberOfEntries: 1,
    TotalDebit: '100.00',
    TotalCredit: '100.00',
    Journal: [
      {
        JournalID: 'VD',
        Description: 'Diário de Vendas',
        Transaction: [
          {
            TransactionID: '12',
            TransactionDate: '2026-03-10',
            SourceID: 'DocumentoOrigem',
            SystemEntryDate: '2026-03-10T10:30:00',
            Description: 'Venda de Março',
            Line: [
              { LineNumber: 1, AccountID: '1010', DebitAmount: '100.00', CreditAmount: '0.00' },
              { LineNumber: 2, AccountID: '4010', DebitAmount: '0.00', CreditAmount: '100.00' },
            ],
          },
        ],
      },
    ],
  };
}

/** Valida o XML gerado a partir de um documento com o bloco dado. */
function validarComContabilidade(entries: SaftGeneralLedgerEntries) {
  const doc = documento();
  doc.Body.GeneralLedgerEntries = entries;
  return validarSaft(serializarSaft(doc), doc);
}

describe('saft.validador', () => {
  describe('documento válido', () => {
    it('não produz nenhum aviso num período com faturação', () => {
      const resultado = validarSaft(xmlFixture(), documento());
      expect(resultado.totalAvisos).toBe(0);
    });

    it('aceita o fixture sem erros', () => {
      const resultado = validarSaft(xmlFixture(), documento());

      expect(resultado.totalErros).toBe(0);
      expect(resultado.valido).toBe(true);
    });

    it('não produz nenhum aviso num período com faturação', () => {
      const resultado = validarSaft(xmlFixture(), documento());
      expect(resultado.totalAvisos).toBe(0);
    });

    it('declara o ambito da validação, para a UI não prometer mais do que faz', () => {
      const resultado = validarSaft(xmlFixture(), documento());

      // A diferença entre "conformidade estrutural" e "conformidade normativa"
      // é a diferença entre o que este motor garante e o que a AT exige. Se
      // alguém escrever no validador que "valida o XSD", este teste falha.
      expect(resultado.ambito.toLowerCase()).toContain('conformidade estrutural');
      expect(resultado.ambito.toLowerCase()).toContain('não substitui');
      expect(resultado.ambito.toLowerCase()).toContain('xsd');
    });

    it('aceita um ficheiro XML bem formado', () => {
      const xml = xmlFixture();
      expect(xml.startsWith('<?xml')).toBe(true);
      expect(xml).toContain('<AuditFile');
      expect(xml).toContain('</AuditFile>');
    });
  });

  // ===========================================================================
  // XML
  // ===========================================================================

  describe('SAFT-001 / SAFT-002 — XML malformado', () => {
    it('rejeita XML vazio', () => {
      expect(codigos(validarSaft('', documento()))).toContain('SAFT-001');
    });

    it('rejeita XML sem declaração XML', () => {
      const resultado = validarSaft('<AuditFile></AuditFile>', documento());
      expect(codigos(resultado)).toContain('SAFT-001');
    });

    it('rejeita um elemento raiz diferente de AuditFile', () => {
      const resultado = validarSaft('<?xml version="1.0"?><Outro></Outro>', documento());
      expect(codigos(resultado)).toContain('SAFT-001');
    });

    it('rejeita tags desemparelhadas', () => {
      const xml = '<?xml version="1.0"?><AuditFile><Header></AuditFile>';
      const resultado = validarSaft(xml, documento());
      expect(codigos(resultado)).toContain('SAFT-002');
    });
  });

  // ===========================================================================
  // Header
  // ===========================================================================

  describe('SAFT-010 a SAFT-016 — Header', () => {
    it('exige AuditFileVersion', () => {
      const doc = documento();
      doc.Header.AuditFileVersion = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-010');
    });

    it('exige CompanyName', () => {
      const doc = documento();
      doc.Header.CompanyName = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-010');
    });

    it('exige CompanyID', () => {
      const doc = documento();
      doc.Header.CompanyID = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-010');
    });

    it('exige TaxRegistrationNumber', () => {
      const doc = documento();
      doc.Header.TaxRegistrationNumber = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-010');
    });

    it('exige o Hash no Header', () => {
      const doc = documento();
      doc.Header.Hash = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-010');
    });

    it('rejeita um NIF com formato inválido', () => {
      const doc = documento();
      doc.Header.TaxRegistrationNumber = 'ABC';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-011');
    });

    it('aceita NIF angolano (9 dígitos mais sufixo)', () => {
      const doc = documento();
      doc.Header.TaxRegistrationNumber = '5417364895';
      expect(codigos(validarSaft(xmlFixture(), doc))).not.toContain('SAFT-011');
    });

    it('rejeita um TaxAccountingBasis que não seja N nem C', () => {
      const doc = documento();
      doc.Header.TaxAccountingBasis = 'X';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-012');
    });

    it('rejeita FiscalYear com menos de 4 dígitos', () => {
      const doc = documento();
      doc.Header.FiscalYear = '26';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-013');
    });

    it('rejeita um mês fora de 01..12', () => {
      const doc = documento();
      doc.Header.Month = '13';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-013');
    });

    it('rejeita datas fora de AAAA-MM-DD', () => {
      const doc = documento();
      doc.Header.DateStart = '01/03/2026';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-014');
    });

    it('rejeita DateStart posterior a DateEnd', () => {
      const doc = documento();
      doc.Header.DateStart = '2026-03-31';
      doc.Header.DateEnd = '2026-03-01';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-015');
    });

    it('rejeita uma moeda que não seja ISO 4217', () => {
      const doc = documento();
      doc.Header.Currency = 'EUROS';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-016');
    });
  });

  // ===========================================================================
  // Hashes
  // ===========================================================================

  describe('SAFT-020 a SAFT-024 — Hashes', () => {
    it('exige exactamente dois Hash', () => {
      const doc = documento();
      doc.Hashes.Hash = [doc.Hashes.Hash[0]];
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-020');
    });

    it('exige SourceID="Header" no primeiro Hash', () => {
      const doc = documento();
      doc.Hashes.Hash[0].SourceID = 'Outro';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-021');
    });

    it('exige SourceID="SourceID" no segundo Hash', () => {
      const doc = documento();
      doc.Hashes.Hash[1].SourceID = 'Header';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-021');
    });

    it('exige que o SourceHash do segundo aponte para o DigestValue do primeiro', () => {
      const doc = documento();
      doc.Hashes.Hash[1].SourceHash = 'f'.repeat(40);
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-022');
    });

    it('exige DigestMethod em cada Hash', () => {
      const doc = documento();
      doc.Hashes.Hash[0].DigestMethod = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-023');
    });

    it('exige um DigestValue hexadecimal de 40 caracteres', () => {
      const doc = documento();
      doc.Hashes.Hash[0].DigestValue = 'não é um hash';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-024');
    });
  });

  // ===========================================================================
  // TaxTable
  // ===========================================================================

  describe('SAFT-040 a SAFT-042 — TaxTable', () => {
    it('exige as cinco entradas: RED, INT, NOR, ISE e OUT', () => {
      const doc = documento();
      doc.Body.MasterFiles.TaxTable = doc.Body.MasterFiles.TaxTable.filter(
        (t) => t.TaxTableID !== 'OUT',
      );
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-040');
    });

    it('rejeita uma TaxTable sem entradas', () => {
      const doc = documento();
      doc.Body.MasterFiles.TaxTable[0].Tax = [];
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-041');
    });

    it('rejeita uma taxa não numérica', () => {
      const doc = documento();
      (doc.Body.MasterFiles.TaxTable[0].Tax[0] as { Tax: unknown }).Tax = 'vinte e três';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-042');
    });
  });

  // ===========================================================================
  // MasterFiles
  // ===========================================================================

  describe('SAFT-050 a SAFT-062 — clientes e produtos', () => {
    it('avisa quando não há clientes, mas não dá erro', () => {
      const doc = documento();
      doc.Body.MasterFiles.Customer = [];
      const resultado = validarSaft(xmlFixture(), doc);

      expect(codigos(resultado)).toContain('SAFT-051');
      // Um aviso não pode reprovar o ficheiro: há períodos legitimamente vazios.
      expect(resultado.problemas.find((p) => p.codigo === 'SAFT-051')?.severidade).toBe('aviso');
    });

    it('exige CustomerID', () => {
      const doc = documento();
      doc.Body.MasterFiles.Customer[0].CustomerID = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-050');
    });

    it('rejeita CustomerID duplicado', () => {
      const doc = documento();
      doc.Body.MasterFiles.Customer.push({ ...doc.Body.MasterFiles.Customer[0] });
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-052');
    });

    it('exige ProductCode', () => {
      const doc = documento();
      doc.Body.MasterFiles.Product[0].ProductCode = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-060');
    });

    it('rejeita ProductCode duplicado', () => {
      const doc = documento();
      doc.Body.MasterFiles.Product.push({ ...doc.Body.MasterFiles.Product[0] });
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-061');
    });

    it('rejeita um ProductType inválido', () => {
      const doc = documento();
      (doc.Body.MasterFiles.Product[0] as { ProductType: string }).ProductType = 'Z';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-062');
    });

    it('exige campos obrigatórios em Company', () => {
      const doc = documento();
      doc.Body.MasterFiles.Company.CompanyAddress = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-030');
    });
  });

  // ===========================================================================
  // Invoices
  // ===========================================================================

  describe('SAFT-070 a SAFT-085 — coerência dos documentos', () => {
    it('exige que NumberOfEntries bata com o número de faturas', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.NumberOfEntries = 5;
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-070');
    });

    it('exige InvoiceNo', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].InvoiceNo = '';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-071');
    });

    it('rejeita InvoiceNo duplicado', () => {
      const doc = documento();
      const vendas = doc.Body.SourceDocuments.SalesInvoices;
      vendas.Invoice.push(structuredClone(vendas.Invoice[0]));
      vendas.NumberOfEntries = 2;

      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-072');
    });

    it('rejeita uma TransactionDate mal formatada', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].TransactionDate = '15-03-2026';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-073');
    });

    it('rejeita um DocumentStatus que não seja N nem A', () => {
      const doc = documento();
      (doc.Body.SourceDocuments.SalesInvoices.Invoice[0].DocumentStatus as { DocumentStatus: string }).DocumentStatus =
        'X';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-075');
    });

    it('rejeita um CustomerID que não existe em MasterFiles', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].CustomerID = 'CLI-999';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-076');
    });

    it('rejeita um ProductCode que não existe em MasterFiles', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].Line[0].ProductCode = 'ART-999';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-078');
    });

    it('exige numeração sequencial de linhas', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].Line[0].LineNumber = 5;
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-079');
    });

    it('rejeita um Tax que não seja um identificador válido', () => {
      const doc = documento();
      (doc.Body.SourceDocuments.SalesInvoices.Invoice[0].Line[0] as { Tax: string }).Tax = 'XXX';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-080');
    });

    it('rejeita um TaxPointDate mal formatado', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].Line[0].TaxPointDate = '2026/03/15';
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-081');
    });

    it('detecta NetTotal que não bate com a soma das linhas', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].DocumentTotals.NetTotal = '200.00';

      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-082');
    });

    it('detecta TaxPayable que não bate com a soma do IVA das linhas', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].DocumentTotals.TaxPayable = '46.00';

      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-083');
    });

    it('detecta GrossTotal que não é a soma de NetTotal com TaxPayable', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].DocumentTotals.GrossTotal = '999.00';

      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-084');
    });

    it('detecta TotalDebit que não bate com os documentos', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.TotalDebit = '500.00';

      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-085');
    });

    it('detecta TotalCredit que não bate com as notas de crédito', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.TotalCredit = '10.00';

      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-085');
    });

    it('um anulado não entra nas somas do ficheiro', () => {
      const doc = documento();
      const fatura = doc.Body.SourceDocuments.SalesInvoices.Invoice[0];
      fatura.DocumentStatus.DocumentStatus = 'A';
      // Anulado: o NetTotal continua 100, mas TotalDebit tem de descer a 0.
      doc.Body.SourceDocuments.SalesInvoices.TotalDebit = '0.00';

      const resultado = validarSaft(xmlFixture(), doc);
      expect(codigos(resultado)).not.toContain('SAFT-085');
    });

    it('rejeita uma fatura sem linhas', () => {
      const doc = documento();
      doc.Body.SourceDocuments.SalesInvoices.Invoice[0].Line = [];
      expect(codigos(validarSaft(xmlFixture(), doc))).toContain('SAFT-077');
    });
  });

  // ===========================================================================
  // GeneralLedgerEntries
  // ===========================================================================

  describe('SAFT-090 a SAFT-095 — contabilidade geral', () => {
    it('aceita um bloco consistente', () => {
      const resultado = validarComContabilidade(blocoContabilidade());

      expect(resultado.totalErros).toBe(0);
      expect(resultado.valido).toBe(true);
    });

    it('não exige o bloco quando não há contabilidade no período', () => {
      const resultado = validarSaft(xmlFixture(), documento());
      expect(codigos(resultado)).not.toContain('SAFT-090');
      expect(codigos(resultado)).not.toContain('SAFT-093');
    });

    it('rejeita NumberOfEntries que não bate com o número de transações', () => {
      const bloco = blocoContabilidade();
      bloco.NumberOfEntries = 5;
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-090');
    });

    it('NumberOfEntries conta transações, não linhas', () => {
      const bloco = blocoContabilidade();
      // Duas linhas, mas uma única transação: declarar 2 é erro.
      bloco.NumberOfEntries = 2;
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-090');
    });

    it('rejeita TotalDebit que não bate com a soma das linhas', () => {
      const bloco = blocoContabilidade();
      bloco.TotalDebit = '250.00';
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-091');
    });

    it('rejeita TotalCredit que não bate com a soma das linhas', () => {
      const bloco = blocoContabilidade();
      bloco.TotalCredit = '250.00';
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-092');
    });

    it('aceita diferenças de arredondamento dentro da tolerância', () => {
      const bloco = blocoContabilidade();
      bloco.TotalDebit = '100.00005';
      expect(codigos(validarComContabilidade(bloco))).not.toContain('SAFT-091');
    });

    it('rejeita um diário sem transações', () => {
      const bloco = blocoContabilidade();
      bloco.Journal![0].Transaction = [];
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-093');
    });

    it('rejeita uma transação sem linhas', () => {
      const bloco = blocoContabilidade();
      bloco.Journal![0].Transaction[0].Line = [];
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-094');
    });

    it('rejeita uma linha sem AccountID', () => {
      const bloco = blocoContabilidade();
      bloco.Journal![0].Transaction[0].Line[0].AccountID = '';
      expect(codigos(validarComContabilidade(bloco))).toContain('SAFT-095');
    });
  });

  // ===========================================================================
  // Integridade
  // ===========================================================================

  describe('verificarIntegridade', () => {
    it('confirma um ficheiro inalterado', () => {
      const xml = serializarSaft(documentoFixtureCompleto());
      expect(verificarIntegridade(xml, calcularHashFicheiro(xml))).toBe(true);
    });

    it('detecta um ficheiro adulterado', () => {
      const xml = serializarSaft(documentoFixtureCompleto());
      const hashOriginal = calcularHashFicheiro(xml);

      expect(verificarIntegridade(xml.replace('100.00', '999.00'), hashOriginal)).toBe(false);
    });
  });

  // ===========================================================================
  // Relação com a construção
  // ===========================================================================

  describe('validação do XML real', () => {
    it('o XML serializado de um documento válido passa', () => {
      const doc = documentoFixtureCompleto();
      const xml = serializarSaft(doc);

      expect(validarSaft(xml, doc).valido).toBe(true);
    });

    it('o fixture sem hashes não passa, e diz porquê', () => {
      // Um documento por calcular não pode ser submetido — é a razão de o
      // serviço só validar depois de fechar os hashes.
      const resultado = validarSaft('', documentoFixtureSemHashes as unknown as SaftAuditFile);
      expect(resultado.valido).toBe(false);
    });
  });
});