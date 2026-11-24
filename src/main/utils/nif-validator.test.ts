/**
 * @file nif-validator.test.ts
 * @description Testes unitários para o validador de NIF de Portugal e Angola (RN02.1).
 */

import { describe, it, expect } from 'vitest';
import { validateNifPT, validateNifAO, validateNif } from './nif-validator';

describe('Validação de NIF (Portugal - PT)', () => {
  it('deve validar NIFs portugueses válidos reais e calculados', () => {
    // 500000000 -> 5*9 + 0 = 45 % 11 = 1 -> resto 1 => check digit 0.
    // 5*9 = 45 -> 45 % 11 = 1 -> se resto é 0 ou 1, dígito é 0! Então 500000000 é válido!
    expect(validateNifPT('500000000')).toBe(true);

    // NIF real PT (Ex: Fundação Calouste Gulbenkian: 500792780)
    // 5*9 + 0*8 + 0*7 + 7*6 + 9*5 + 2*4 + 7*3 + 8*2 = 45 + 0 + 0 + 42 + 45 + 8 + 21 + 16 = 177 % 11 = 1 -> checkDigit = 0
    expect(validateNifPT('500792780')).toBe(true);

    // NIF de pessoa singular válido: 123456789 -> 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8 = 9+16+21+24+25+24+21+16 = 156 % 11 = 2 -> 11-2 = 9
    expect(validateNifPT('123456789')).toBe(true);
  });

  it('deve rejeitar NIF com dígito de controlo incorreto', () => {
    expect(validateNifPT('123456788')).toBe(false);
    expect(validateNifPT('500000001')).toBe(false);
  });

  it('deve rejeitar NIF com número de caracteres diferente de 9', () => {
    expect(validateNifPT('12345678')).toBe(false);
    expect(validateNifPT('1234567890')).toBe(false);
    expect(validateNifPT('')).toBe(false);
  });

  it('deve rejeitar NIF com prefixos inválidos', () => {
    // Começa com 0 ou 4 (exceto 45)
    expect(validateNifPT('012345678')).toBe(false);
    expect(validateNifPT('412345678')).toBe(false);
  });

  it('deve aceitar NIF com espaços ou pontuação e normalizar', () => {
    expect(validateNifPT('123 456 789')).toBe(true);
    expect(validateNifPT('123-456-789')).toBe(true);
  });
});

describe('Validação de NIF (Angola - AO)', () => {
  it('deve validar NIFs angolanos numéricos de 10 dígitos (AGT)', () => {
    expect(validateNifAO('5417000000')).toBe(true);
    expect(validateNifAO('0012345678')).toBe(true);
    expect(validateNifAO('5417 000 000')).toBe(true);
  });

  it('deve validar NIFs angolanos no formato de Bilhete de Identidade (14 caracteres)', () => {
    expect(validateNifAO('001234567LA045')).toBe(true);
    expect(validateNifAO('004567890BA012')).toBe(true);
  });

  it('deve rejeitar NIFs angolanos em formatos inválidos', () => {
    expect(validateNifAO('12345')).toBe(false);
    expect(validateNifAO('ABC1234567')).toBe(false);
    expect(validateNifAO('')).toBe(false);
  });
});

describe('Função polimórfica validateNif', () => {
  it('deve rotear corretamente conforme o país', () => {
    expect(validateNif('123456789', 'PT')).toBe(true);
    expect(validateNif('5417000000', 'AO')).toBe(true);
    expect(validateNif('ABC-987654', 'outro')).toBe(true);
    expect(validateNif('', 'PT')).toBe(false);
  });
});
