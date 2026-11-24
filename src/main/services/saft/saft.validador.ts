/**
 * @file saft.validador.ts
 * @description Validação estrutural do ficheiro SAF-T gerado (RN08.1).
 *
 * Este validador **não** valida contra o XSD oficial da AT. Valida o
 * subconjunto estruturado que este motor produz, contra as regras do esquema
 * que a AT publica — obrigatoriedade de campos, ordem de elementos, formatos,
 * e coerência aritmética.
 *
 * A diferença importa e a UI diz isso ao utilizador: isto apanha um ficheiro
 * malformado ou internamente incoerente, não substitui a validação normativa
 * da AT. O XSD oficial fica em `resources/saft/` para validação externa.
 *
 * As regras estão agrupadas em três níveis, e cada erro tem código estável
 * para que a UI possa reagir em vez de mostrar texto solto.
 */

import type { SaftAuditFile } from './saft.tipos';
import { SAFT_TAX_TABLE_IDS } from './saft.tipos';
import { calcularHashFicheiro } from './saft.hash';

/** Severidade de um problema encontrado. */
export type SeveridadeValidacao = 'erro' | 'aviso';

export interface ProblemaValidacao {
  codigo: string;
  severidade: SeveridadeValidacao;
  mensagem: string;
  /** Caminho do elemento, para o utilizador saber onde olhar. */
  caminho: string;
}

export interface ResultadoValidacao {
  valido: boolean;
  problemas: ProblemaValidacao[];
  /** Contagem de erros, para mostrar o resumo. */
  totalErros: number;
  totalAvisos: number;
  /** O que esta validação cobre — a UI mostra isto tal e qual. */
  ambito: string;
}

/** Tolerância nas comparações monetárias, alinhada com a tesouraria. */
const TOLERANCIA = 0.0001;

/** Formatos aceites por `Currency` no schema (ISO 4217). */
const MOEDAS_VALIDAS = /^[A-Z]{3}$/;

/** Padrão de data que o schema usa em todo o ficheiro. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Padrão de hora usado em `SystemEntryDate`. */
const HORA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/** NIF português: 9 dígitos. NIF angolano: 10 dígitos, BI de 14 caracteres ou 9 dígitos (Consumidor Final). */
const NIF_PT = /^\d{9}$/;
const NIF_AO = /^(\d{10}|\d{9}[A-Z0-9]{2}\d{3}|\d{9}[0-5L]?|999999999)$/i;

/** Acumulador de problemas, para não repetir `problemas.push(...)`. */
class Coletor {
  readonly problemas: ProblemaValidacao[] = [];

  erro(codigo: string, mensagem: string, caminho: string): void {
    this.problemas.push({ codigo, severidade: 'erro', mensagem, caminho });
  }

  aviso(codigo: string, mensagem: string, caminho: string): void {
    this.problemas.push({ codigo, severidade: 'aviso', mensagem, caminho });
  }
}

/**
 * Valida o documento SAF-T.
 *
 * @param xml - XML já serializado, o mesmo que vai para o disco.
 * @param documento - Modelo em memória, para as verificações de conteúdo.
 * @returns Resultado com a lista de problemas e o total de erros.
 */
export function validarSaft(xml: string, documento: SaftAuditFile): ResultadoValidacao {
  const coletor = new Coletor();

  validarXml(xml, coletor);
  validarHeader(documento, coletor);
  validarHashes(documento, coletor);
  validarCompany(documento, coletor);
  validarTaxTable(documento, coletor);
  validarCustomers(documento, coletor);
  validarProducts(documento, coletor);
  validarInvoices(documento, coletor);
  validarGeneralLedgerEntries(documento, coletor);

  const totalErros = coletor.problemas.filter((p) => p.severidade === 'erro').length;
  const totalAvisos = coletor.problemas.filter((p) => p.severidade === 'aviso').length;

  return {
    valido: totalErros === 0,
    problemas: coletor.problemas,
    totalErros,
    totalAvisos,
    ambito:
      'Conformidade estrutural: campos obrigatórios, ordem de elementos, formatos e coerência de somatórios. Não substitui a validação normativa contra o XSD oficial da AT.',
  };
}

// =============================================================================
// Validações
// =============================================================================

/** `SAFT-001` — o XML tem de estar bem formado e ter a raiz certa. */
function validarXml(xml: string, coletor: Coletor): void {
  if (!xml.trim()) {
    coletor.erro('SAFT-001', 'XML vazio.', 'AuditFile');
    return;
  }

  if (!xml.trimStart().startsWith('<?xml')) {
    coletor.erro('SAFT-001', 'O ficheiro não começa por uma declaração XML.', 'AuditFile');
  }

  if (!xml.includes('<AuditFile')) {
    coletor.erro('SAFT-001', 'O elemento raiz tem de ser <AuditFile>.', 'AuditFile');
  }

  // Tags desemparelhadas são o erro de XML mais comum e o mais fácil de
  // deixar passar num teste que só olha para o modelo em memória.
  const abrem = (xml.match(/<[^/!?][^>]*[^/]>/g) ?? []).length;
  const fecham = (xml.match(/<\/[^>]+>/g) ?? []).length;
  if (abrem !== fecham) {
    coletor.erro(
      'SAFT-002',
      `Número de tags de abertura (${abrem}) diferente do de fecho (${fecham}); o XML está malformado.`,
      'AuditFile',
    );
  }
}

/** `SAFT-010` — `Header` completo e com os formatos certos. */
function validarHeader(documento: SaftAuditFile, coletor: Coletor): void {
  const h = documento.Header;

  if (!h.AuditFileVersion) {
    coletor.erro('SAFT-010', 'AuditFileVersion em falta no Header.', 'AuditFile/Header/AuditFileVersion');
  }

  if (!h.CompanyName) {
    coletor.erro('SAFT-010', 'CompanyName em falta no Header.', 'AuditFile/Header/CompanyName');
  }

  if (!h.CompanyID) {
    coletor.erro('SAFT-010', 'CompanyID em falta no Header (identificador junto da AT).', 'AuditFile/Header/CompanyID');
  }

  if (!h.TaxRegistrationNumber) {
    coletor.erro('SAFT-010', 'TaxRegistrationNumber (NIF) em falta no Header.', 'AuditFile/Header/TaxRegistrationNumber');
  } else if (!NIF_PT.test(h.TaxRegistrationNumber) && !NIF_AO.test(h.TaxRegistrationNumber)) {
    coletor.erro(
      'SAFT-011',
      `NIF '${h.TaxRegistrationNumber}' não tem o formato de um NIF português ou angolano.`,
      'AuditFile/Header/TaxRegistrationNumber',
    );
  }

  if (h.TaxAccountingBasis !== 'N' && h.TaxAccountingBasis !== 'C') {
    coletor.erro(
      'SAFT-012',
      `TaxAccountingBasis tem de ser 'N' (normal) ou 'C' (simplificado); recebeu '${h.TaxAccountingBasis}'.`,
      'AuditFile/Header/TaxAccountingBasis',
    );
  }

  if (!/^\d{4}$/.test(h.FiscalYear)) {
    coletor.erro('SAFT-013', `FiscalYear tem de ter 4 dígitos; recebeu '${h.FiscalYear}'.`, 'AuditFile/Header/FiscalYear');
  }

  if (!/^\d{2}$/.test(h.Month) || Number(h.Month) < 1 || Number(h.Month) > 12) {
    coletor.erro('SAFT-013', `Month tem de estar entre '01' e '12'; recebeu '${h.Month}'.`, 'AuditFile/Header/Month');
  }

  for (const [campo, valor] of [
    ['DateStart', h.DateStart],
    ['DateEnd', h.DateEnd],
  ] as const) {
    if (!DATA_ISO.test(valor)) {
      coletor.erro('SAFT-014', `${campo} tem de estar em AAAA-MM-DD; recebeu '${valor}'.`, `AuditFile/Header/${campo}`);
    }
  }

  if (DATA_ISO.test(h.DateStart) && DATA_ISO.test(h.DateEnd) && h.DateStart > h.DateEnd) {
    coletor.erro('SAFT-015', 'DateStart é posterior a DateEnd.', 'AuditFile/Header/DateStart');
  }

  if (!MOEDAS_VALIDAS.test(h.Currency)) {
    coletor.erro(
      'SAFT-016',
      `Currency tem de ser um código ISO 4217 de 3 letras; recebeu '${h.Currency}'.`,
      'AuditFile/Header/Currency',
    );
  }

  // `DateCreated` é o único campo de data/hora do Header, e o schema aceita
  // data ou data-hora. Aceitamos as duas formas.
  if (!DATA_ISO.test(h.DateCreated) && !HORA_ISO.test(h.DateCreated)) {
    coletor.erro(
      'SAFT-014',
      `DateCreated tem de estar em AAAA-MM-DD ou AAAA-MM-DDTHH:MM:SS; recebeu '${h.DateCreated}'.`,
      'AuditFile/Header/DateCreated',
    );
  }

  if (!h.Hash) {
    coletor.erro('SAFT-010', 'Hash em falta no Header.', 'AuditFile/Header/Hash');
  }
}

/** `SAFT-020` — `Hashes` tem exactamente os dois elementos exigidos. */
function validarHashes(documento: SaftAuditFile, coletor: Coletor): void {
  const hashes = documento.Hashes?.Hash ?? [];

  if (hashes.length !== 2) {
    coletor.erro(
      'SAFT-020',
      `O elemento Hashes tem de ter exactamente 2 elementos Hash; tem ${hashes.length}.`,
      'AuditFile/Hashes/Hash',
    );
    return;
  }

  const [header, body] = hashes;

  if (header.SourceID !== 'Header') {
    coletor.erro('SAFT-021', 'O primeiro Hash tem de ter SourceID="Header".', 'AuditFile/Hashes/Hash[0]/SourceID');
  }
  if (body.SourceID !== 'SourceID') {
    coletor.erro('SAFT-021', 'O segundo Hash tem de ter SourceID="SourceID".', 'AuditFile/Hashes/Hash[1]/SourceID');
  }
  if (body.SourceHash !== header.DigestValue) {
    coletor.erro(
      'SAFT-022',
      'O SourceHash do segundo Hash tem de ser igual ao DigestValue do primeiro.',
      'AuditFile/Hashes/Hash[1]/SourceHash',
    );
  }

  for (const [indice, entrada] of hashes.entries()) {
    if (!entrada.DigestMethod) {
      coletor.erro('SAFT-023', `Hash[${indice}] sem DigestMethod.`, `AuditFile/Hashes/Hash[${indice}]/DigestMethod`);
    }
    if (!/^[0-9a-f]{40}$/i.test(entrada.DigestValue ?? '')) {
      coletor.erro(
        'SAFT-024',
        `DigestValue do Hash[${indice}] não é um SHA-1 hexadecimal de 40 caracteres.`,
        `AuditFile/Hashes/Hash[${indice}]/DigestValue`,
      );
    }
  }
}

/** `SAFT-030` — `Company` com os campos obrigatórios. */
function validarCompany(documento: SaftAuditFile, coletor: Coletor): void {
  const c = documento.Body.MasterFiles.Company;
  const obrigatorios = [
    'TaxRegistrationNumber',
    'Name',
    'CompanyName',
    'CompanyAddress',
    'CompanyCountry',
    'TaxAccountingBasis',
    'CompanyFiscalNumber',
  ] as const;

  for (const campo of obrigatorios) {
    if (!c[campo]) {
      coletor.erro('SAFT-030', `${campo} em falta em MasterFiles/Company.`, `AuditFile/Body/MasterFiles/Company/${campo}`);
    }
  }

  if (c.TaxAccountingBasis !== 'N' && c.TaxAccountingBasis !== 'C') {
    coletor.erro('SAFT-012', `TaxAccountingBasis inválido em Company: '${c.TaxAccountingBasis}'.`, 'AuditFile/Body/MasterFiles/Company/TaxAccountingBasis');
  }
}

/**
 * `SAFT-040` — `TaxTable` com as 5 entradas exigidas.
 *
 * Uma `TaxTable` incompleta é a causa mais comum de rejeição: o schema exige
 * RED, INT, NOR, ISE e OUT, mesmo que a empresa nunca aplique a taxa `OUT`.
 */
function validarTaxTable(documento: SaftAuditFile, coletor: Coletor): void {
  const tabelas = documento.Body.MasterFiles.TaxTable;
  const presentes = tabelas.map((t) => t.TaxTableID);

  for (const exigido of SAFT_TAX_TABLE_IDS) {
    if (!presentes.includes(exigido)) {
      coletor.erro(
        'SAFT-040',
        `Falta a entrada '${exigido}' na TaxTable. O esquema exige RED, INT, NOR, ISE e OUT.`,
        'AuditFile/Body/MasterFiles/TaxTable',
      );
    }
  }

  for (const tabela of tabelas) {
    if (tabela.Tax.length === 0) {
      coletor.erro('SAFT-041', `A TaxTable '${tabela.TaxTableID}' não tem entradas <Tax>.`, 'AuditFile/Body/MasterFiles/TaxTable/Tax');
    }
    for (const entrada of tabela.Tax) {
      if (typeof entrada.Tax !== 'number' || !Number.isFinite(entrada.Tax)) {
        coletor.erro(
          'SAFT-042',
          `A taxa da entrada '${tabela.TaxTableID}' não é numérica: '${entrada.Tax}'.`,
          'AuditFile/Body/MasterFiles/TaxTable/Tax/Tax',
        );
      }
    }
  }
}

/** `SAFT-050` — clientes com identificador e NIF. */
function validarCustomers(documento: SaftAuditFile, coletor: Coletor): void {
  const clientes = documento.Body.MasterFiles.Customer;

  if (clientes.length === 0) {
    coletor.aviso(
      'SAFT-051',
      'Não há clientes no MasterFiles. É normal para um período sem faturação, mas a AT costuma exigir pelo menos um.',
      'AuditFile/Body/MasterFiles/Customer',
    );
    return;
  }

  const vistos = new Set<string>();
  for (const [indice, cliente] of clientes.entries()) {
    const base = `AuditFile/Body/MasterFiles/Customer[${indice}]`;

    if (!cliente.CustomerID) {
      coletor.erro('SAFT-050', `Customer[${indice}] sem CustomerID.`, `${base}/CustomerID`);
    } else if (vistos.has(cliente.CustomerID)) {
      // Duplicados são o erro que aparece quando o mesmo cliente é emitido
      // com códigos diferentes no cadastro.
      coletor.erro(
        'SAFT-052',
        `CustomerID duplicado: '${cliente.CustomerID}'. A AT rejeita MasterFiles com chaves repetidas.`,
        `${base}/CustomerID`,
      );
    } else {
      vistos.add(cliente.CustomerID);
    }

    if (!cliente.Name) {
      coletor.erro('SAFT-050', `Customer[${indice}] sem Name.`, `${base}/Name`);
    }
    if (!cliente.TaxRegistrationNumber) {
      coletor.erro('SAFT-050', `Customer[${indice}] sem TaxRegistrationNumber.`, `${base}/TaxRegistrationNumber`);
    }
  }
}

/** `SAFT-060` — produtos com código e descrição. */
function validarProducts(documento: SaftAuditFile, coletor: Coletor): void {
  const produtos = documento.Body.MasterFiles.Product;
  const vistos = new Set<string>();

  for (const [indice, produto] of produtos.entries()) {
    const base = `AuditFile/Body/MasterFiles/Product[${indice}]`;

    if (!produto.ProductCode) {
      coletor.erro('SAFT-060', `Product[${indice}] sem ProductCode.`, `${base}/ProductCode`);
    } else if (vistos.has(produto.ProductCode)) {
      coletor.erro('SAFT-061', `ProductCode duplicado: '${produto.ProductCode}'.`, `${base}/ProductCode`);
    } else {
      vistos.add(produto.ProductCode);
    }

    if (!produto.ProductDescription) {
      coletor.erro('SAFT-060', `Product[${indice}] sem ProductDescription.`, `${base}/ProductDescription`);
    }
    if (!['P', 'S', 'O', 'E', 'I'].includes(produto.ProductType)) {
      coletor.erro(
        'SAFT-062',
        `ProductType inválido em '${produto.ProductCode}': '${produto.ProductType}'. Valores aceites: P, S, O, E, I.`,
        `${base}/ProductType`,
      );
    }
    if (!produto.UnitOfMeasure) {
      coletor.erro('SAFT-060', `Product[${indice}] sem UnitOfMeasure.`, `${base}/UnitOfMeasure`);
    }
  }
}

/**
 * `SAFT-070` — coerência aritmética dos documentos.
 *
 * Esta é a família de erros que mais dói: o ficheiro passa a validação de
 * esquema e é rejeitado na submissão por os totais não baterem com as linhas.
 */
function validarInvoices(documento: SaftAuditFile, coletor: Coletor): void {
  const vendas = documento.Body.SourceDocuments.SalesInvoices;
  const faturas = vendas.Invoice;

  if (vendas.NumberOfEntries !== faturas.length) {
    coletor.erro(
      'SAFT-070',
      `NumberOfEntries declara ${vendas.NumberOfEntries} mas o ficheiro tem ${faturas.length} documentos.`,
      'AuditFile/Body/SourceDocuments/SalesInvoices/NumberOfEntries',
    );
  }

  const codigosProduto = new Set(documento.Body.MasterFiles.Product.map((p) => p.ProductCode));
  const codigosCliente = new Set(documento.Body.MasterFiles.Customer.map((c) => c.CustomerID));

  let somaDebito = 0;
  let somaCredito = 0;
  const numerosVistos = new Set<string>();

  for (const [indice, fatura] of faturas.entries()) {
    const base = `AuditFile/Body/SourceDocuments/SalesInvoices/Invoice[${indice}]`;

    if (!fatura.InvoiceNo) {
      coletor.erro('SAFT-071', `Invoice[${indice}] sem InvoiceNo.`, `${base}/InvoiceNo`);
    } else if (numerosVistos.has(fatura.InvoiceNo)) {
      coletor.erro('SAFT-072', `InvoiceNo duplicado: '${fatura.InvoiceNo}'.`, `${base}/InvoiceNo`);
    } else {
      numerosVistos.add(fatura.InvoiceNo);
    }

    if (!DATA_ISO.test(fatura.TransactionDate)) {
      coletor.erro('SAFT-073', `TransactionDate inválida em '${fatura.InvoiceNo}': '${fatura.TransactionDate}'.`, `${base}/TransactionDate`);
    }
    if (!HORA_ISO.test(fatura.SystemEntryDate)) {
      coletor.erro('SAFT-074', `SystemEntryDate inválida em '${fatura.InvoiceNo}': '${fatura.SystemEntryDate}'.`, `${base}/SystemEntryDate`);
    }
    if (fatura.DocumentStatus?.DocumentStatus !== 'N' && fatura.DocumentStatus?.DocumentStatus !== 'A') {
      coletor.erro(
        'SAFT-075',
        `DocumentStatus inválido em '${fatura.InvoiceNo}': '${String(fatura.DocumentStatus?.DocumentStatus)}'. Valores aceites: N, A.`,
        `${base}/DocumentStatus`,
      );
    }

    if (!codigosCliente.has(fatura.CustomerID)) {
      coletor.erro(
        'SAFT-076',
        `CustomerID '${fatura.CustomerID}' não existe em MasterFiles/Customer.`,
        `${base}/CustomerID`,
      );
    }

    if (fatura.Line.length === 0) {
      coletor.erro('SAFT-077', `Invoice '${fatura.InvoiceNo}' não tem linhas.`, `${base}/Line`);
    }

    let somaBase = 0;
    let somaIva = 0;

    for (const [indiceLinha, linha] of fatura.Line.entries()) {
      const baseLinha = `${base}/Line[${indiceLinha}]`;

      if (!codigosProduto.has(linha.ProductCode)) {
        coletor.erro(
          'SAFT-078',
          `ProductCode '${linha.ProductCode}' não existe em MasterFiles/Product.`,
          `${baseLinha}/ProductCode`,
        );
      }

      if (linha.LineNumber !== indiceLinha + 1) {
        coletor.erro(
          'SAFT-079',
          `LineNumber tem de ser sequencial (${indiceLinha + 1}); recebeu ${linha.LineNumber}.`,
          `${baseLinha}/LineNumber`,
        );
      }

      if (!TAXA_POR_ID.has(linha.Tax)) {
        coletor.erro(
          'SAFT-080',
          `Tax '${linha.Tax}' não é um identificador válido (${[...TAXA_POR_ID.keys()].join(', ')}).`,
          `${baseLinha}/Tax`,
        );
      }

      if (!DATA_ISO.test(linha.TaxPointDate)) {
        coletor.erro(
          'SAFT-081',
          `TaxPointDate inválida na linha ${linha.LineNumber}: '${linha.TaxPointDate}'.`,
          `${baseLinha}/TaxPointDate`,
        );
      }

      // `TaxBase` e `DebitAmount`/`CreditAmount` são a mesma base de incidência
      // dita de duas formas; somá-las seria contar a fatura duas vezes. O
      // maior dos dois funciona com qualquer das convenções e não depende de
      // qual delas o emissor usou.
      const baseDeclarada = numero(linha.TaxBase);
      const basePelasLateral = numero(linha.DebitAmount) + numero(linha.CreditAmount);
      somaBase += Math.max(baseDeclarada, basePelasLateral);
      somaIva += numero(linha.TaxAmount);
    }

    // Somatório das linhas contra os totais declarados no documento.
    const netDeclarado = numero(fatura.DocumentTotals?.NetTotal);
    const ivaDeclarado = numero(fatura.DocumentTotals?.TaxPayable);
    const brutoDeclarado = numero(fatura.DocumentTotals?.GrossTotal);

    if (Math.abs(somaBase - netDeclarado) > TOLERANCIA) {
      coletor.erro(
        'SAFT-082',
        `Soma das bases de '${fatura.InvoiceNo}' (${somaBase.toFixed(2)}) difere do NetTotal declarado (${netDeclarado.toFixed(2)}).`,
        `${base}/DocumentTotals/NetTotal`,
      );
    }

    if (Math.abs(somaIva - ivaDeclarado) > TOLERANCIA) {
      coletor.erro(
        'SAFT-083',
        `Soma do IVA das linhas de '${fatura.InvoiceNo}' (${somaIva.toFixed(2)}) difere do TaxPayable declarado (${ivaDeclarado.toFixed(2)}).`,
        `${base}/DocumentTotals/TaxPayable`,
      );
    }

    if (Math.abs(netDeclarado + ivaDeclarado - brutoDeclarado) > TOLERANCIA) {
      coletor.erro(
        'SAFT-084',
        `Em '${fatura.InvoiceNo}': NetTotal + TaxPayable (${(netDeclarado + ivaDeclarado).toFixed(2)}) não é igual a GrossTotal (${brutoDeclarado.toFixed(2)}).`,
        `${base}/DocumentTotals/GrossTotal`,
      );
    }

    if (fatura.DocumentStatus?.DocumentStatus === 'N') {
      // Um documento anulado não entra nas somas do ficheiro.
      const ehCredito =
        fatura.Line.some((l) => numero(l.CreditAmount) > 0) ||
        fatura.InvoiceNo.startsWith('NC ') ||
        fatura.HashControl.startsWith('NC ');
      if (ehCredito) somaCredito += netDeclarado;
      else somaDebito += netDeclarado;
    }
  }

  if (Math.abs(somaDebito - numero(vendas.TotalDebit)) > TOLERANCIA) {
    coletor.erro(
      'SAFT-085',
      `TotalDebit (${numero(vendas.TotalDebit).toFixed(2)}) não bate com a soma dos documentos normals (${somaDebito.toFixed(2)}).`,
      'AuditFile/Body/SourceDocuments/SalesInvoices/TotalDebit',
    );
  }

  if (Math.abs(somaCredito - numero(vendas.TotalCredit)) > TOLERANCIA) {
    coletor.erro(
      'SAFT-085',
      `TotalCredit (${numero(vendas.TotalCredit).toFixed(2)}) não bate com a soma das notas de crédito (${somaCredito.toFixed(2)}).`,
      'AuditFile/Body/SourceDocuments/SalesInvoices/TotalCredit',
    );
  }
}

/**
 * `SAFT-090` a `SAFT-095` — coerência do bloco de contabilidade geral.
 *
 * O bloco é opcional: um período sem lançamentos publicados não o tem, e isso
 * não é erro. Quando existe, a contagem de `NumberOfEntries` tem de bater com
 * o número de transações (vouchers) e os totais com as linhas efectivamente
 * escritas, tal como no `SalesInvoices`.
 */
function validarGeneralLedgerEntries(documento: SaftAuditFile, coletor: Coletor): void {
  const entries = documento.Body.GeneralLedgerEntries;
  if (!entries) return;

  const base = 'AuditFile/Body/GeneralLedgerEntries';
  const journals = entries.Journal ?? [];
  let numeroTransacoes = 0;
  let somaDebito = 0;
  let somaCredito = 0;

  for (const [indiceJournal, journal] of journals.entries()) {
    const baseJournal = `${base}/Journal[${indiceJournal}]`;

    if (journal.Transaction.length === 0) {
      coletor.erro(
        'SAFT-093',
        `Journal '${journal.JournalID}' não tem transações.`,
        `${baseJournal}/Transaction`,
      );
    }

    for (const [indiceTransaction, transaction] of journal.Transaction.entries()) {
      const baseTransaction = `${baseJournal}/Transaction[${indiceTransaction}]`;
      numeroTransacoes += 1;

      if (transaction.Line.length === 0) {
        coletor.erro(
          'SAFT-094',
          `Transaction '${transaction.TransactionID}' não tem linhas.`,
          `${baseTransaction}/Line`,
        );
      }

      for (const [indiceLinha, linha] of transaction.Line.entries()) {
        somaDebito += numero(linha.DebitAmount);
        somaCredito += numero(linha.CreditAmount);

        if (!linha.AccountID || !String(linha.AccountID).trim()) {
          coletor.erro(
            'SAFT-095',
            `Linha ${linha.LineNumber} da transação '${transaction.TransactionID}' sem AccountID.`,
            `${baseTransaction}/Line[${indiceLinha}]/AccountID`,
          );
        }
      }
    }
  }

  if (entries.NumberOfEntries !== numeroTransacoes) {
    coletor.erro(
      'SAFT-090',
      `NumberOfEntries declara ${entries.NumberOfEntries} mas o bloco tem ${numeroTransacoes} transações.`,
      `${base}/NumberOfEntries`,
    );
  }

  const debitoDeclarado = numero(entries.TotalDebit);
  if (Math.abs(debitoDeclarado - somaDebito) > TOLERANCIA) {
    coletor.erro(
      'SAFT-091',
      `TotalDebit declarado (${debitoDeclarado.toFixed(2)}) difere da soma das linhas (${somaDebito.toFixed(2)}).`,
      `${base}/TotalDebit`,
    );
  }

  const creditoDeclarado = numero(entries.TotalCredit);
  if (Math.abs(creditoDeclarado - somaCredito) > TOLERANCIA) {
    coletor.erro(
      'SAFT-092',
      `TotalCredit declarado (${creditoDeclarado.toFixed(2)}) difere da soma das linhas (${somaCredito.toFixed(2)}).`,
      `${base}/TotalCredit`,
    );
  }
}

/** Identificadores de `TaxTable` aceites em `Line/Tax`. */
const TAXA_POR_ID = new Map<string, number>([
  ['RED', 6],
  ['INT', 13],
  ['NOR', 23],
  ['ISE', 0],
  ['OUT', 0],
]);

/** Converte um valor monetário do XML em número, tolerando string vazia. */
function numero(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

/**
 * Verifica que o digest do ficheiro corresponde ao seu conteúdo.
 * Usado pela ficha de exportação para detetar que o ficheiro foi alterado
 * depois de gerado.
 */
export function verificarIntegridade(xml: string, hashEsperado: string): boolean {
  return calcularHashFicheiro(xml) === hashEsperado;
}