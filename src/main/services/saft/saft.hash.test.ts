/**
 * @file saft.hash.test.ts
 * @description Testes dos hashes SAF-T: o `Hash` do `Header` é o ponto onde
 * um erro silencioso passa completamente despercebido — o ficheiro sai
 * malformado do ponto de vista da AT, mas ninguém vê nada de errado no
 * ecrã. Estes testes fixam a ordem dos campos e a sequência de concatenação.
 */

import { describe, it, expect } from 'vitest';
import {
  CAMPOS_HEADER_HASH,
  calcularHashBody,
  calcularHashControl,
  calcularHashFicheiro,
  calcularHashHeader,
  construirHashes,
  sha1,
} from './saft.hash';
import { documentoFixtureSemHashes, documentoFixtureCompleto } from './saft.fixture';
import { construirBody, serializarElemento } from './saft.construcao';

describe('saft.hash', () => {
  describe('sha1', () => {
    it('produz 40 caracteres hexadecimais minúsculos', () => {
      const digest = sha1('abc');
      expect(digest).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
      expect(digest).toMatch(/^[0-9a-f]{40}$/);
    });

    it('é determinístico', () => {
      expect(sha1('conteúdo')).toBe(sha1('conteúdo'));
    });
  });

  describe('calcularHashHeader', () => {
    it('produz um digest do tamanho certo', () => {
      const hash = calcularHashHeader(documentoFixtureSemHashes.Header);
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it('é determinístico: o mesmo cabeçalho dá o mesmo hash', () => {
      expect(calcularHashHeader(documentoFixtureSemHashes.Header)).toBe(
        calcularHashHeader(structuredClone(documentoFixtureSemHashes.Header)),
      );
    });

    it('muda quando um único campo muda', () => {
      const original = structuredClone(documentoFixtureSemHashes.Header);
      const alterado = structuredClone(documentoFixtureSemHashes.Header);
      alterado.Month = '04';

      expect(calcularHashHeader(alterado)).not.toBe(calcularHashHeader(original));
    });

    it('usa todos os campos listados, pela ordem da AT', () => {
      // Se um campo saísse da lista, mudar esse campo não mudaria o hash —
      // e o ficheiro seria rejeitado sem nenhuma pista do motivo.
      for (const campo of CAMPOS_HEADER_HASH) {
        const original = structuredClone(documentoFixtureSemHashes.Header);
        const alterado = structuredClone(documentoFixtureSemHashes.Header) as Record<string, string>;
        alterado[campo] = `${original[campo] ?? ''}_alterado`;

        expect(calcularHashHeader(alterado as typeof original)).not.toBe(
          calcularHashHeader(original),
        );
      }
    });

    it('concatena sem separadores, pela ordem da lista', () => {
      const header = { ...documentoFixtureSemHashes.Header };
      const esperado = sha1(CAMPOS_HEADER_HASH.map((campo) => header[campo] ?? '').join(''));
      expect(calcularHashHeader(header)).toBe(esperado);
    });

    it('trata um campo ausente como string vazia', () => {
      const incompleto = { ...documentoFixtureSemHashes.Header, CompanyFax: undefined as unknown as string };
      expect(() => calcularHashHeader(incompleto)).not.toThrow();
    });
  });

  describe('calcularHashBody', () => {
    it('muda quando o corpo muda num único caracter', () => {
      const original = serializarElemento(construirBody(documentoFixtureSemHashes.Body));
      const alterado = original.replace('CLI-001', 'CLI-002');

      expect(calcularHashBody(alterado)).not.toBe(calcularHashBody(original));
    });

    it('é determinístico para o mesmo XML', () => {
      const xml = serializarElemento(construirBody(documentoFixtureSemHashes.Body));
      expect(calcularHashBody(xml)).toBe(calcularHashBody(xml));
    });
  });

  describe('calcularHashFicheiro', () => {
    it('muda quando o XML muda de whitespace', () => {
      expect(calcularHashFicheiro('<a/>')).not.toBe(calcularHashFicheiro('<a />'));
    });
  });

  describe('construirHashes', () => {
    it('devolve exactamente os dois Hash exigidos pela AT', () => {
      const hashes = construirHashes('a'.repeat(40), 'b'.repeat(40));
      expect(hashes).toHaveLength(2);
    });

    it('o primeiro Hash é o do Header', () => {
      const headerHash = 'a'.repeat(40);
      const [primeiro] = construirHashes(headerHash, 'b'.repeat(40));

      expect(primeiro.SourceID).toBe('Header');
      expect(primeiro.DigestValue).toBe(headerHash);
      expect(primeiro.SourceHash).toBe('');
    });

    it('o segundo Hash referencia o primeiro em SourceHash', () => {
      const headerHash = 'a'.repeat(40);
      const bodyHash = 'b'.repeat(40);
      const [, segundo] = construirHashes(headerHash, bodyHash);

      expect(segundo.SourceID).toBe('SourceID');
      expect(segundo.DigestValue).toBe(bodyHash);
      expect(segundo.SourceHash).toBe(headerHash);
    });

    it('ambos declaram SHA1', () => {
      for (const entrada of construirHashes('a'.repeat(40), 'b'.repeat(40))) {
        expect(entrada.DigestMethod).toBe('SHA1');
      }
    });
  });

  describe('calcularHashControl', () => {
    it('é determinístico', () => {
      const a = calcularHashControl('FT 2026/0001', '2026-03-15', '123.00', 'ATCUD-1');
      expect(a).toBe(calcularHashControl('FT 2026/0001', '2026-03-15', '123.00', 'ATCUD-1'));
    });

    it('tem no máximo 40 caracteres', () => {
      const hash = calcularHashControl('FT 2026/0001', '2026-03-15', '123.00', 'ATCUD-1');
      expect(hash.length).toBeLessThanOrEqual(40);
    });

    it('muda quando o total muda', () => {
      expect(calcularHashControl('FT 2026/0001', '2026-03-15', '123.00', null)).not.toBe(
        calcularHashControl('FT 2026/0001', '2026-03-15', '124.00', null),
      );
    });

    it('muda quando o ATCUD muda', () => {
      expect(calcularHashControl('FT 2026/0001', '2026-03-15', '123.00', 'A')).not.toBe(
        calcularHashControl('FT 2026/0001', '2026-03-15', '123.00', 'B'),
      );
    });
  });

  describe('documentoFixtureCompleto', () => {
    it('o Header.Hash bate com o que calcularHashHeader devolve', () => {
      const completo = documentoFixtureCompleto();
      expect(completo.Header.Hash).toBe(calcularHashHeader(documentoFixtureSemHashes.Header));
    });

    it('o Hash do Body bate com o XML do Body isolado', () => {
      const completo = documentoFixtureCompleto();
      const esperado = calcularHashBody(serializarElemento(construirBody(documentoFixtureSemHashes.Body)));

      expect(completo.Hashes.Hash[1].DigestValue).toBe(esperado);
    });
  });
});