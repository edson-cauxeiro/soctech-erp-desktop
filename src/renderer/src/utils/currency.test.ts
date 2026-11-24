/**
 * @file currency.test.ts
 * @description O parsing de valores escritos à mão é onde um ERP perde dinheiro
 * em silêncio: "1 250,50" guardado como 1250 dá um preço mil vezes errado.
 * Estes testes fixam o que a pessoa escreve e o que o sistema entende.
 */

import { describe, it, expect } from 'vitest';
import { parseCurrencyInput, formatCurrencyInput, formatCurrency } from './currency';

describe('parseCurrencyInput', () => {
  it('lê o formato que a pessoa escreve em Angola', () => {
    expect(parseCurrencyInput('1250,50')).toBe(1250.5);
    expect(parseCurrencyInput('1 250,50')).toBe(1250.5);
    expect(parseCurrencyInput('1.250,50')).toBe(1250.5);
    expect(parseCurrencyInput('1\u00a0234\u00a0567,89')).toBe(1234567.89);
  });

  it('aceita ponto decimal, porque muita gente escreve assim', () => {
    expect(parseCurrencyInput('1250.50')).toBe(1250.5);
    expect(parseCurrencyInput('1.250,50')).toBe(1250.5);
    expect(parseCurrencyInput('1,250.50')).toBe(1250.5);
  });

  it('trata três casas depois do separador como milhares, não como cêntimos', () => {
    // "1.250" em pt-AO é mil e duzentos e cinquenta, não um e meio.
    expect(parseCurrencyInput('1.250')).toBe(1250);
    expect(parseCurrencyInput('1,250')).toBe(1250);
    expect(parseCurrencyInput('1 250')).toBe(1250);
  });

  it('lê o espaço não separável que o Intl produz', () => {
    // U+00A0 e não um espaço normal: é o que o Intl emite em pt-AO, e é
    // exactamente o carácter que um `trim()` ou `split(' ')` deixaria passar.
    const formatado = formatCurrencyInput(1234567.89);
    expect(formatado).toBe('1\u00a0234\u00a0567,89');
    // Ida e volta: o que se mostra é o que se lê.
    expect(parseCurrencyInput(formatado)).toBe(1234567.89);
    // O espaço normal tem de ser lido também, senão depende de onde veio.
    expect(parseCurrencyInput(formatado.replace(/\u00a0/g, ' '))).toBe(1234567.89);
  });

  it('ignora o símbolo da moeda e sufixos colados ao número', () => {
    expect(parseCurrencyInput('Kz 1 250,50')).toBe(1250.5);
    expect(parseCurrencyInput('1250,50 Kz')).toBe(1250.5);
    expect(parseCurrencyInput('1 250,50€')).toBe(1250.5);
  });

  it('devolve 0 em vez de NaN quando não há nada a ler', () => {
    expect(parseCurrencyInput('')).toBe(0);
    expect(parseCurrencyInput('   ')).toBe(0);
    expect(parseCurrencyInput('Kz')).toBe(0);
    expect(parseCurrencyInput('abc')).toBe(0);
  });

  it('aceita negativos, para ajustes e estornos', () => {
    expect(parseCurrencyInput('-1250,50')).toBe(-1250.5);
    expect(parseCurrencyInput('-1 250')).toBe(-1250);
  });

  it('não se perde nos valores grandes que o kwanza atinge', () => {
    expect(parseCurrencyInput('12 500 000,00')).toBe(12500000);
    expect(parseCurrencyInput('999 999 999 999,99')).toBe(999999999999.99);
  });
});

describe('formatCurrencyInput', () => {
  it('agrupa sem símbolo, porque a etiqueta do campo já diz a moeda', () => {
    expect(formatCurrencyInput(1234567.89)).toBe('1\u00a0234\u00a0567,89');
    expect(formatCurrencyInput(0)).toBe('0,00');
    expect(formatCurrencyInput(1000)).toBe('1\u00a0000,00');
  });
});

describe('formatCurrency', () => {
  it('mostra o símbolo do kwanza', () => {
    expect(formatCurrency(1250.5)).toMatch(/Kz/);
  });
});
