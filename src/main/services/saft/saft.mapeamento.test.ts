/**
 * @file saft.mapeamento.test.ts
 * @description Testes do mapeamento Prisma → SAF-T e da serialização.
 *
 * O que se protege aqui é a ponte entre o que o DoraERP guarda e o que a AT
 * lê: o tipo de documento, o número partido em série e sequencial, a
 *snapshot do cliente e do artigo, e a `TaxTable` derivada das taxas usadas.
 */

import { describe, it, expect } from 'vitest';
import {
  construirAuditFile,
  construirCustomer,
  construirDocumentTotals,
  construirGeneralLedgerEntries,
  construirInvoiceLine,
  construirProduct,
  construirTaxTable,
  formatarData,
  formatarDataHora,
  formatarMes,
  formatarQuantidade,
  formatarValor,
  mapearTaxTable,
  mapearTipoDocumento,
  normalizarUnidade,
  nomeFicheiroSaft,
  paraNumero,
  separarNumeroDocumento,
  type LancamentoContabilParaSaft,
} from './saft.mapeamento';
import { serializarSaft } from './saft.construcao';
import { documentoFixtureCompleto } from './saft.fixture';
import { contextoFixture } from './saft.fixture';

describe('saft.mapeamento', () => {
  // ===========================================================================
  // Formatação
  // ===========================================================================

  describe('formatadores', () => {
    it('formatarValor usa duas casas decimais', () => {
      expect(formatarValor(1234.5)).toBe('1234.50');
      expect(formatarValor(0)).toBe('0.00');
      expect(formatarValor('99.999')).toBe('100.00');
    });

    it('formatarValor devolve zero para valores não numéricos', () => {
      expect(formatarValor(null)).toBe('0.00');
      expect(formatarValor(undefined)).toBe('0.00');
      expect(formatarValor('abc')).toBe('0.00');
      expect(formatarValor(Number.POSITIVE_INFINITY)).toBe('0.00');
    });

    it('formatarQuantidade usa quatro casas', () => {
      expect(formatarQuantidade(2)).toBe('2.0000');
      expect(formatarQuantidade('1.5')).toBe('1.5000');
    });

    it('formatarData produz AAAA-MM-DD', () => {
      expect(formatarData(new Date(2026, 2, 5))).toBe('2026-03-05');
      expect(formatarData(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('formatarDataHora produz AAAA-MM-DDTHH:MM:SS', () => {
      expect(formatarDataHora(new Date(2026, 2, 5, 9, 7, 3))).toBe('2026-03-05T09:07:03');
    });

    it('formatarMes produz dois dígitos', () => {
      expect(formatarMes(3)).toBe('03');
      expect(formatarMes(12)).toBe('12');
    });

    it('paraNumero converte Decimal e string', () => {
      expect(paraNumero('12.34')).toBe(12.34);
      expect(paraNumero(null)).toBe(0);
      expect(paraNumero({ toString: () => '7.5' })).toBe(7.5);
    });
  });

  // ===========================================================================
  // Tipo de documento e número
  // ===========================================================================

  describe('mapearTipoDocumento', () => {
    it('mapeia os quatro tipos de venda', () => {
      expect(mapearTipoDocumento('fatura')).toBe('FT');
      expect(mapearTipoDocumento('fatura_recibo')).toBe('FR');
      expect(mapearTipoDocumento('nota_credito')).toBe('NC');
      expect(mapearTipoDocumento('nota_debito')).toBe('ND');
    });

    it('cai em FT para um tipo desconhecido, em vez de falhar', () => {
      expect(mapearTipoDocumento('outro')).toBe('FT');
    });
  });

  describe('separarNumeroDocumento', () => {
    it('parte o número no formato do documento-numero.service', () => {
      expect(separarNumeroDocumento('FT 2026/0001')).toEqual({ serie: '2026', numero: '0001' });
      expect(separarNumeroDocumento('NC 2025/0123')).toEqual({ serie: '2025', numero: '0123' });
    });

    it('aceita séries com prefixo alfanumérico', () => {
      expect(separarNumeroDocumento('FR A/2026/0042')).toEqual({ serie: 'A/2026', numero: '0042' });
    });

    it('devolve série vazia em vez de partir mal um número fora do contrato', () => {
      expect(separarNumeroDocumento('FT-0001')).toEqual({ serie: '', numero: 'FT-0001' });
    });

    it('preserva os zeros à esquerda do sequencial', () => {
      expect(separarNumeroDocumento('FT 2026/0007').numero).toBe('0007');
    });
  });

  // ===========================================================================
  // IVA
  // ===========================================================================

  describe('mapearTaxTable', () => {
    it('mapeia as taxas normais', () => {
      expect(mapearTaxTable(23)).toBe('NOR');
      expect(mapearTaxTable(13)).toBe('INT');
      expect(mapearTaxTable(6)).toBe('RED');
    });

    it('trata a isenção como ISE, não como uma taxa zero qualquer', () => {
      expect(mapearTaxTable(0)).toBe('ISE');
    });

    it('mapeia taxas fora da tabela normal para OUT', () => {
      expect(mapearTaxTable(37)).toBe('OUT');
    });

    it('usa as fronteiras da faixa, não arredonda', () => {
      expect(mapearTaxTable(6)).toBe('RED');
      expect(mapearTaxTable(6.01)).toBe('INT');
      expect(mapearTaxTable(13)).toBe('INT');
      expect(mapearTaxTable(13.01)).toBe('NOR');
    });
  });

  describe('construirTaxTable', () => {
    it('garante as 5 categorias obrigatórias e atualiza com as taxas usadas', () => {
      const tabelas = construirTaxTable([23, 6]);

      expect(tabelas.map((t) => t.TaxTableID).sort()).toEqual(['INT', 'ISE', 'NOR', 'OUT', 'RED']);
      const nor = tabelas.find((t) => t.TaxTableID === 'NOR');
      expect(nor?.Tax[0].Tax).toBe(23);
      const red = tabelas.find((t) => t.TaxTableID === 'RED');
      expect(red?.Tax[0].Tax).toBe(6);
    });

    it('não duplica o identificador quando duas taxas caem na mesma faixa', () => {
      const tabelas = construirTaxTable([23, 22]);

      const nors = tabelas.filter((t) => t.TaxTableID === 'NOR');
      expect(nors).toHaveLength(1);
      // Com duas taxas na mesma faixa, guarda a maior.
      expect(nors[0].Tax[0].Tax).toBe(23);
    });

    it('trata a isenção à parte', () => {
      const tabelas = construirTaxTable([23, 0]);
      const ise = tabelas.find((t) => t.TaxTableID === 'ISE');
      expect(ise?.Tax[0].Tax).toBe(0);
    });

    it('devolve todas as 5 categorias mesmo quando não há taxas específicas usadas', () => {
      const tabelas = construirTaxTable([]);
      expect(tabelas).toHaveLength(5);
      expect(tabelas.map((t) => t.TaxTableID).sort()).toEqual(['INT', 'ISE', 'NOR', 'OUT', 'RED']);
    });
  });

  // ===========================================================================
  // Unidades
  // ===========================================================================

  describe('normalizarUnidade', () => {
    it('mapeia as unidades do cadastro para os códigos do schema', () => {
      expect(normalizarUnidade('kg')).toBe('KG');
      expect(normalizarUnidade('Quilo')).toBe('KG');
      expect(normalizarUnidade('lt')).toBe('LT');
      expect(normalizarUnidade('un')).toBe('UN');
    });

    it('cai em UN para uma unidade desconhecida ou vazia', () => {
      expect(normalizarUnidade('banana')).toBe('UN');
      expect(normalizarUnidade(null)).toBe('UN');
      expect(normalizarUnidade(undefined)).toBe('UN');
    });
  });

  // ===========================================================================
  // MasterFiles
  // ===========================================================================

  describe('construirCustomer', () => {
    it('usa o snapshot do documento, não o cadastro actual', () => {
      const cliente = construirCustomer({
        codigo: 'CLI-001',
        nome: 'Nome em Janeiro',
        nif: '501442600',
        endereco: 'Rua A',
        codigoPostal: '1000-001',
        cidade: 'Lisboa',
        pais: 'PT',
        email: '',
        telefone: '',
      });

      expect(cliente.Name).toBe('Nome em Janeiro');
      expect(cliente.TaxRegistrationNumber).toBe('501442600');
    });

    it('espelha o nome em CompanyName, como o schema espera', () => {
      const cliente = construirCustomer({
        codigo: 'CLI-001',
        nome: 'Cliente',
        nif: '501442600',
        endereco: 'Rua A',
        codigoPostal: '1000-001',
        cidade: 'Lisboa',
        pais: 'PT',
        email: '',
        telefone: '',
      });

      expect(cliente.CompanyName).toBe(cliente.Name);
    });
  });

  describe('construirProduct', () => {
    it('classifica serviço como S e o resto como P', () => {
      const servico = construirProduct({ codigo: 'S-1', descricao: 'Consultoria', unidade: 'hr', tipo: 'servico' });
      const produto = construirProduct({ codigo: 'P-1', descricao: 'Café', unidade: 'un', tipo: 'produto' });

      expect(servico.ProductType).toBe('S');
      expect(servico.UnitOfMeasure).toBe('HUR');
      expect(produto.ProductType).toBe('P');
    });

    it('replica o código em ProductNumberCode', () => {
      const produto = construirProduct({ codigo: 'ART-001', descricao: 'Café', unidade: 'un', tipo: 'produto' });
      expect(produto.ProductNumberCode).toBe('ART-001');
    });
  });

  // ===========================================================================
  // Totais
  // ===========================================================================

  describe('construirDocumentTotals', () => {
    it('calcula o bruto a partir do ilíquido e do IVA', () => {
      const totais = construirDocumentTotals(100, 23, 123);

      expect(totais).toEqual({ TaxPayable: '23.00', NetTotal: '100.00', GrossTotal: '123.00' });
    });

    it('usa o total líquido declarado quando a diferença é real', () => {
      // Acima da tolerância de arredondamento, o total do documento manda:
      // inventar um `GrossTotal` que bata com a soma esconderia um erro de
      // cálculo de IVA na origem.
      const totais = construirDocumentTotals(100, 23, 130);
      expect(totais.GrossTotal).toBe('130.00');
    });

    it('só perdoa a diferença quando ela é de arredondamento', () => {
      const totais = construirDocumentTotals(100, 23, 123.005);
      expect(totais.GrossTotal).toBe('123.00');
    });
  });

  // ===========================================================================
  // Linhas
  // ===========================================================================

  describe('construirInvoiceLine', () => {
    const linhaBase = {
      artigoCodigo: 'ART-001',
      artigoDescricao: 'Café 250g',
      artigoUnidade: 'un',
      quantidade: 2,
      precoUnitario: 50,
      desconto: 0,
      taxaIva: 23,
      totalLinha: 123,
      motivoIsencao: null,
    };

    it('extrai a base de incidência e o IVA do total com imposto incluído', () => {
      const linha = construirInvoiceLine(linhaBase, 1, 'FT', new Date(2026, 2, 15));

      expect(linha.TaxBase).toBe('100.00');
      expect(linha.TaxAmount).toBe('23.00');
      expect(linha.DebitAmount).toBe('100.00');
      expect(linha.CreditAmount).toBe('0.00');
    });

    it('numera as linhas a partir de 1', () => {
      expect(construirInvoiceLine(linhaBase, 1, 'FT', new Date(2026, 2, 15)).LineNumber).toBe(1);
      expect(construirInvoiceLine(linhaBase, 7, 'FT', new Date(2026, 2, 15)).LineNumber).toBe(7);
    });

    it('inverte débito e crédito numa nota de crédito', () => {
      const linha = construirInvoiceLine(linhaBase, 1, 'NC', new Date(2026, 2, 15));

      expect(linha.CreditAmount).toBe('100.00');
      expect(linha.DebitAmount).toBe('0.00');
    });

    it('mantém TaxBase e TaxAmount positivos na nota de crédito, como os totais do documento', () => {
      // Zerar o IVA da linha deixaria o TaxPayable positivo da nota de crédito
      // sem contrapartida nas linhas (SAFT-083).
      const linha = construirInvoiceLine(linhaBase, 1, 'NC', new Date(2026, 2, 15));

      expect(linha.TaxBase).toBe('100.00');
      expect(linha.TaxAmount).toBe('23.00');
    });

    it('trata a isenção como taxa 0, com ISE na TaxTable', () => {
      const linha = construirInvoiceLine({ ...linhaBase, taxaIva: 0, totalLinha: 100 }, 1, 'FT', new Date(2026, 2, 15));

      expect(linha.Tax).toBe('ISE');
      expect(linha.TaxAmount).toBe('0.00');
      expect(linha.TaxBase).toBe('100.00');
    });

    it('acrescenta o motivo de isenção à descrição', () => {
      const linha = construirInvoiceLine(
        { ...linhaBase, motivoIsencao: 'M01' },
        1,
        'FT',
        new Date(2026, 2, 15),
      );

      expect(linha.Description).toContain('M01');
    });

    it('usa a data do documento como TaxPointDate', () => {
      const linha = construirInvoiceLine(linhaBase, 1, 'FT', new Date(2026, 2, 15));
      expect(linha.TaxPointDate).toBe('2026-03-15');
    });
  });

  // ===========================================================================
  // Contabilidade geral
  // ===========================================================================

  const lancamentoBase = (overrides: Partial<LancamentoContabilParaSaft> = {}): LancamentoContabilParaSaft => ({
    id: 'lanc-1',
    numero: 12,
    dataContabilistica: new Date(2026, 2, 10),
    descricao: 'Venda de Março',
    estado: 'validado',
    createdAt: new Date(2026, 2, 10, 9, 0, 0),
    validadoEm: new Date(2026, 2, 10, 10, 30, 0),
    diario: { codigo: 'VD', designacao: 'Diário de Vendas' },
    linhas: [
      { numeroLinha: 1, debito: 100, credito: 0, conta: { codigo: '1010', designacao: 'Caixa' } },
      { numeroLinha: 2, debito: 0, credito: 100, conta: { codigo: '4010', designacao: 'Vendas' } },
    ],
    ...overrides,
  });

  describe('construirGeneralLedgerEntries', () => {
    it('conta transações e soma débitos e créditos a partir das linhas escritas', () => {
      const entries = construirGeneralLedgerEntries([lancamentoBase()], 'EUR');

      expect(entries).toMatchObject({
        NumberOfEntries: 1,
        TotalDebit: '100.00',
        TotalCredit: '100.00',
      });
    });

    it('NumberOfEntries conta vouchers, independentemente do número de linhas', () => {
      const entries = construirGeneralLedgerEntries(
        [
          lancamentoBase(),
          lancamentoBase({
            id: 'lanc-2',
            numero: 13,
            linhas: [
              { numeroLinha: 1, debito: 40, credito: 0, conta: { codigo: '1010' } },
              { numeroLinha: 2, debito: 30, credito: 0, conta: { codigo: '1011' } },
              { numeroLinha: 3, debito: 0, credito: 70, conta: { codigo: '4010' } },
            ],
          }),
        ],
        'EUR',
      );

      expect(entries?.NumberOfEntries).toBe(2);
      expect(entries?.Journal?.[0]?.Transaction).toHaveLength(2);
      expect(entries?.Journal?.[0]?.Transaction[1].Line).toHaveLength(3);
    });

    it('agrupa transações por diário, com descrição e identificador do diário', () => {
      const entries = construirGeneralLedgerEntries(
        [
          lancamentoBase(),
          lancamentoBase({
            id: 'lanc-2',
            numero: 13,
            descricao: 'Segunda venda',
            diario: { codigo: 'CX', designacao: 'Diário de Caixa' },
            linhas: [
              { numeroLinha: 1, debito: 50, credito: 0, conta: { codigo: '1010' } },
              { numeroLinha: 2, debito: 0, credito: 50, conta: { codigo: '4010' } },
            ],
          }),
          lancamentoBase({
            id: 'lanc-3',
            numero: 14,
            descricao: 'Outra venda',
            linhas: [
              { numeroLinha: 1, debito: 25, credito: 0, conta: { codigo: '1010' } },
              { numeroLinha: 2, debito: 0, credito: 25, conta: { codigo: '4010' } },
            ],
          }),
        ],
        'EUR',
      );

      expect(entries?.Journal?.map((j) => j.JournalID)).toEqual(['CX', 'VD']);
      expect(entries?.Journal?.find((j) => j.JournalID === 'VD')?.Description).toBe('Diário de Vendas');
      expect(entries?.Journal?.find((j) => j.JournalID === 'VD')?.Transaction).toHaveLength(2);
      expect(entries).toMatchObject({ NumberOfEntries: 3, TotalDebit: '175.00', TotalCredit: '175.00' });
    });

    it('preenche data, sistema e linhas a partir do lançamento publicado', () => {
      const entries = construirGeneralLedgerEntries([lancamentoBase()], 'EUR');
      const transacao = entries?.Journal?.[0]?.Transaction[0];

      expect(transacao).toMatchObject({
        TransactionID: '12',
        TransactionDate: '2026-03-10',
        SourceID: 'DocumentoOrigem',
        SystemEntryDate: '2026-03-10T10:30:00',
        Description: 'Venda de Março',
      });
      expect(transacao?.Line).toEqual([
        { LineNumber: 1, AccountID: '1010', DebitAmount: '100.00', CreditAmount: '0.00' },
        { LineNumber: 2, AccountID: '4010', DebitAmount: '0.00', CreditAmount: '100.00' },
      ]);
    });

    it('ignora rascunhos e lançamentos sem linhas', () => {
      const entries = construirGeneralLedgerEntries(
        [
          lancamentoBase({ estado: 'rascunho' }),
          lancamentoBase({ id: 'vazio', numero: 99, linhas: [] }),
          lancamentoBase({ estado: 'estornado', numero: 15, descricao: 'Estorno' }),
        ],
        'EUR',
      );

      expect(entries?.NumberOfEntries).toBe(1);
      expect(entries?.Journal?.[0]?.Transaction).toHaveLength(1);
      expect(entries?.Journal?.[0]?.Transaction[0].Description).toBe('Estorno');
    });

    it('devolve undefined quando não há lançamentos publicados com linhas', () => {
      expect(construirGeneralLedgerEntries([], 'EUR')).toBeUndefined();
      expect(construirGeneralLedgerEntries([lancamentoBase({ estado: 'rascunho' })], 'EUR')).toBeUndefined();
    });
  });

  // ===========================================================================
  // Documento completo
  // ===========================================================================

  describe('construirAuditFile', () => {
    const dadosVazios = { customers: [], products: [], invoices: [], taxasUsadas: [] };

    it('preenche o Header a partir do contexto', () => {
      const doc = construirAuditFile(contextoFixture, dadosVazios);

      expect(doc.Header.AuditFileVersion).toBe('1.01_01');
      expect(doc.Header.CompanyName).toBe(contextoFixture.nomeEmpresa);
      expect(doc.Header.TaxRegistrationNumber).toBe(contextoFixture.nifEmpresa);
      expect(doc.Header.FiscalYear).toBe('2026');
      expect(doc.Header.Month).toBe('03');
      expect(doc.Header.Currency).toBe('EUR');
      expect(doc.Header.DateStart).toBe('2026-03-01');
      expect(doc.Header.DateEnd).toBe('2026-03-31');
    });

    it('mapeia o regime simplificado para TaxAccountingBasis C', () => {
      const doc = construirAuditFile({ ...contextoFixture, regimeIva: 'simplificado' }, dadosVazios);

      expect(doc.Header.TaxAccountingBasis).toBe('C');
      expect(doc.Body.MasterFiles.Company.TaxAccountingBasis).toBe('C');
    });

    it('deixa o Header sem Hash, que é preenchido depois', () => {
      const doc = construirAuditFile(contextoFixture, dadosVazios);
      expect(doc.Header).not.toHaveProperty('Hash');
    });

    it('não inclui GeneralLedgerEntries quando não há contabilidade geral', () => {
      const doc = construirAuditFile(contextoFixture, dadosVazios);
      expect(doc.Body.GeneralLedgerEntries).toBeUndefined();
    });

    it('inclui o bloco de contabilidade como irmão de MasterFiles, antes de SourceDocuments', () => {
      const entries = construirGeneralLedgerEntries([lancamentoBase()], 'EUR');
      const doc = construirAuditFile(contextoFixture, { ...dadosVazios, generalLedgerEntries: entries });

      expect(doc.Body.GeneralLedgerEntries).toEqual(entries);
      expect(doc.Body.MasterFiles).not.toHaveProperty('GeneralLedgerEntries');
      expect(Object.keys(doc.Body)).toEqual(['MasterFiles', 'GeneralLedgerEntries', 'SourceDocuments']);
    });

    it('declara TaxEntity conforme o país', () => {
      expect(construirAuditFile({ ...contextoFixture, paisEmpresa: 'AO' }, dadosVazios).Header.TaxEntity).toBe('AO');
      expect(construirAuditFile({ ...contextoFixture, paisEmpresa: 'PT' }, dadosVazios).Header.TaxEntity).toBe('PT');
    });
  });

  describe('nomeFicheiroSaft', () => {
    it('segue a convenção SAFPT01_AAAA_MM', () => {
      expect(nomeFicheiroSaft(contextoFixture)).toBe('SAFTPT01_2026_03.xml');
    });
  });

  // ===========================================================================
  // Serialização
  // ===========================================================================

  describe('serializarSaft', () => {
    it('produz XML com declaração e raiz AuditFile', () => {
      const xml = serializarSaft(documentoFixtureCompleto());

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('<AuditFile>');
    });

    it('escreve Header antes de Body antes de Hashes', () => {
      const xml = serializarSaft(documentoFixtureCompleto());
      const posHeader = xml.indexOf('<Header>');
      const posBody = xml.indexOf('<Body>');
      const posHashes = xml.indexOf('<Hashes>');

      expect(posHeader).toBeGreaterThan(-1);
      expect(posBody).toBeGreaterThan(posHeader);
      expect(posHashes).toBeGreaterThan(posBody);
    });

    it('escreve MasterFiles antes de SourceDocuments', () => {
      const xml = serializarSaft(documentoFixtureCompleto());
      expect(xml.indexOf('<MasterFiles>')).toBeLessThan(xml.indexOf('<SourceDocuments>'));
    });

    it('coloca GeneralLedgerEntries entre MasterFiles e SourceDocuments', () => {
      const doc = documentoFixtureCompleto();
      doc.Body.GeneralLedgerEntries = construirGeneralLedgerEntries([lancamentoBase()], 'EUR');
      const xml = serializarSaft(doc);

      expect(xml.indexOf('</MasterFiles>')).toBeLessThan(xml.indexOf('<GeneralLedgerEntries>'));
      expect(xml.indexOf('</GeneralLedgerEntries>')).toBeLessThan(xml.indexOf('<SourceDocuments>'));
      expect(xml).not.toContain('<GeneralLedgerEntries><Company>');
    });

    it('escapa caracteres especiais do nome do cliente', () => {
      // Um `&` sem escape produz XML malformado e a AT rejeita o ficheiro
      // inteiro, não a linha.
      const doc = documentoFixtureCompleto();
      doc.Body.MasterFiles.Customer[0].Name = 'Silva & Filhos <Lda>';

      const xml = serializarSaft(doc);

      expect(xml).toContain('Silva &amp; Filhos &lt;Lda&gt;');
      expect(xml).not.toContain('Filhos <Lda>');
    });

    it('gera os dois elementos Hash no bloco Hashes, mais o hash da fatura', () => {
      const xml = serializarSaft(documentoFixtureCompleto());
      const blocoHashes = xml.slice(xml.indexOf('<Hashes>'));

      // `Hashes` leva dois (`Header` e `Body`); o terceiro `<Hash>` é o
      // `HashControl` de cada Invoice, que vive noutro sítio do schema.
      expect((blocoHashes.match(/<Hash>/g) ?? []).length).toBe(2);
      expect((xml.match(/<Hash>/g) ?? []).length).toBeGreaterThan(2);
    });

    it('fecha todas as tags abertas', () => {
      const xml = serializarSaft(documentoFixtureCompleto());
      const abrem = (xml.match(/<[^/!?][^>]*[^/]>/g) ?? []).length;
      const fecham = (xml.match(/<\/[^>]+>/g) ?? []).length;

      expect(abrem).toBe(fecham);
    });

    it('serializa GeneralLedgerEntries com Journal, Transaction e Line na ordem do esquema', () => {
      const doc = documentoFixtureCompleto();
      doc.Body.GeneralLedgerEntries = construirGeneralLedgerEntries([lancamentoBase()], 'EUR');
      const xml = serializarSaft(doc);

      expect(xml).toContain('<TotalDebit>100.00</TotalDebit>');
      expect(xml).toContain('<TotalCredit>100.00</TotalCredit>');

      const ordem = [
        '<NumberOfEntries>',
        '<TotalDebit>',
        '<TotalCredit>',
        '<Journal>',
        '<JournalID>',
        '<Description>',
        '<Transaction>',
        '<TransactionID>',
        '<TransactionDate>',
        '<SourceID>',
        '<SystemEntryDate>',
        '<Description>',
        '<Line>',
        '<LineNumber>',
        '<AccountID>',
        '<DebitAmount>',
        '<CreditAmount>',
      ];
      let anterior = xml.indexOf('<GeneralLedgerEntries>');
      for (const elemento of ordem) {
        const posicao = xml.indexOf(elemento, anterior + 1);
        expect(posicao, `${elemento} deveria aparecer depois da posição ${anterior}`).toBeGreaterThan(anterior);
        anterior = posicao;
      }

      const bloco = xml.slice(
        xml.indexOf('<GeneralLedgerEntries>'),
        xml.indexOf('</GeneralLedgerEntries>'),
      );
      expect(bloco).toContain('<NumberOfEntries>1</NumberOfEntries>');
      expect((bloco.match(/<Journal>/g) ?? []).length).toBe(1);
      expect((bloco.match(/<Transaction>/g) ?? []).length).toBe(1);
      expect((bloco.match(/<Line>/g) ?? []).length).toBe(2);
      expect(bloco).toContain('<JournalID>VD</JournalID>');
      expect(bloco).toContain('<AccountID>1010</AccountID>');
      expect(bloco).toContain('<DebitAmount>100.00</DebitAmount>');
    });

    it('não escreve Journal vazio quando não há transações com linhas', () => {
      const doc = documentoFixtureCompleto();
      doc.Body.GeneralLedgerEntries = {
        NumberOfEntries: 0,
        TotalDebit: '0.00',
        TotalCredit: '0.00',
        Journal: [
          {
            JournalID: 'VD',
            Description: 'Sem movimentos',
            Transaction: [
              {
                TransactionID: '1',
                TransactionDate: '2026-03-10',
                SourceID: 'DocumentoOrigem',
                SystemEntryDate: '2026-03-10T10:30:00',
                Description: 'Vazia',
                Line: [],
              },
            ],
          },
        ],
      };
      const xml = serializarSaft(doc);

      expect(xml).toContain('<GeneralLedgerEntries>');
      expect(xml).not.toContain('<Journal>');
      expect(xml).not.toContain('<Transaction>');
    });
  });
});