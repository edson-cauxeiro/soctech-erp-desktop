import { describe, it, expect } from 'vitest';
import {
  detetarSeparador,
  parseCsv,
  normalizarChave,
  normalizarEnum,
  parseNumero,
  parseData,
} from './rh-csv';

describe('rh-csv (RH-208) — separador', () => {
  it('deteta ; como separador predefinido por omissão', () => {
    expect(detetarSeparador('nome;nif\nAna;1')).toBe(';');
  });

  it('deteta , ou tab quando são os mais frequentes', () => {
    expect(detetarSeparador('nome,nif\nAna,1')).toBe(',');
    expect(detetarSeparador('nome\tnif\nAna\t1')).toBe('\t');
  });

  it('ignora separadores dentro de aspas', () => {
    expect(detetarSeparador('"Silva, Ana";nif\n"Silva, Carlos";2')).toBe(';');
  });
});

describe('rh-csv — leitura', () => {
  it('lê cabeçalho e linhas simples', () => {
    expect(parseCsv('nome;nif\r\nAna;1\r\nCarlos;2\r\n')).toEqual([
      ['nome', 'nif'],
      ['Ana', '1'],
      ['Carlos', '2'],
    ]);
  });

  it('remove o BOM inicial', () => {
    expect(parseCsv('\uFEFFnome;nif\nAna;1')).toEqual([
      ['nome', 'nif'],
      ['Ana', '1'],
    ]);
  });

  it('suporta campos com aspas, separadores e quebras no valor', () => {
    expect(parseCsv('nome;obs\n"Silva, Ana";"linha 1\nlinha 2"')).toEqual([
      ['nome', 'obs'],
      ['Silva, Ana', 'linha 1\nlinha 2'],
    ]);
  });

  it('faz escape de aspas duplicadas (RFC 4180)', () => {
    expect(parseCsv('obs\n"disse ""olá"""')).toEqual([['obs'], ['disse "olá"']]);
  });

  it('descarta linhas totalmente vazias', () => {
    expect(parseCsv('a;b\n\n1;2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('aceita separador forçado', () => {
    expect(parseCsv('a|b\n1|2', '|')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('rh-csv — normalização de chaves e enums', () => {
  it('normaliza cabeçalhos com acentos, maiúsculas e espaços', () => {
    expect(normalizarChave('Data de Admissão')).toBe('datadeadmissao');
    expect(normalizarChave('dataAdmissao')).toBe('dataadmissao');
    expect(normalizarChave('  Nº Doc (BI) ')).toBe('ndocbi');
  });

  it('normaliza valores para enums', () => {
    expect(normalizarEnum('Prazo Certo')).toBe('PRAZO_CERTO');
    expect(normalizarEnum('FPrazo-Certo')).toBe('FPRAZO_CERTO');
    expect(normalizarEnum('  ')).toBeUndefined();
    expect(normalizarEnum('')).toBeUndefined();
  });
});

describe('rh-csv — números e datas', () => {
  it('converte formato português com milhares', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56);
    expect(parseNumero('150.000')).toBe(150000);
  });

  it('converte formato internacional com milhares', () => {
    expect(parseNumero('1,234.56')).toBe(1234.56);
  });

  it('converte decimal simples e inteiros', () => {
    expect(parseNumero('1234.56')).toBe(1234.56);
    expect(parseNumero('44')).toBe(44);
    expect(parseNumero('')).toBeNull();
  });

  it('devolve null para valores não numéricos', () => {
    expect(parseNumero('abc')).toBeNull();
    expect(parseNumero('1.234,56,7')).toBeNull();
  });

  it('lê datas ISO e formato português', () => {
    expect(parseData('2026-01-05')).toEqual(new Date('2026-01-05T00:00:00Z'));
    expect(parseData('05/01/2026')).toEqual(new Date('2026-01-05T00:00:00Z'));
    expect(parseData('05-01-2026')).toEqual(new Date('2026-01-05T00:00:00Z'));
  });

  it('rejeita datas impossíveis e texto', () => {
    expect(parseData('31/02/2026')).toBeNull();
    expect(parseData('não é data')).toBeNull();
    expect(parseData('')).toBeNull();
  });
});