/**
 * @file saft.hash.ts
 * @description Cálculo dos dois `Hash` obrigatórios do SAF-T (RN08.1).
 *
 * O `Hash` do `Header` é o SHA-1 da concatenação dos campos do cabeçalho
 * **na ordem em que aparecem no schema**, e o `Hash` do `Body` é o SHA-1 do
 * XML do `Body` completo.
 *
 * A concatenação do `Header` não tem separadores. Isso é propositado: mudar a
 * ordem dos campos troca o hash sem dar qualquer erro visível.
 * `CAMPOS_HEADER_HASH` fixa essa ordem e `saft.hash.test.ts` fixa o
 * resultado, para que uma reordenação falhe em teste e não diante da AT.
 *
 * **Verificar antes de emitir em produção.** `CAMPOS_HEADER_HASH` tem 18
 * entradas, que é o conjunto completo de campos escritos no `Header` deste
 * motor. A ordem exacta e o conjunto que a AT concatena para a variante
 * escolhida têm de ser confirmados contra a especificação técnica oficial
 * antes de o ficheiro ir para produção: um `Hash` errado não dá erro visível,
 * apenas uma rejeição da AT sem explicação útil. Ver `resources/saft/README.md`.
 */

import { createHash } from 'crypto';
import type { SaftBody, SaftHashEntry, SaftHeader } from './saft.tipos';
import { SAFT_HASH_ALGORITHM } from './saft.tipos';

/**
 * Os campos do `Header` que entram no `Hash`, por ordem.
 *
 * Não reordenar nem remover entradas: muda o hash sem dar erro. Ver o aviso
 * no cabeçalho deste ficheiro sobre confirmar a lista contra a especificação
 * da AT.
 */
export const CAMPOS_HEADER_HASH = [
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
  'FiscalYear',
  'Month',
  'DateStart',
  'DateEnd',
  'Currency',
  'TaxEntity',
  'SoftwareCertificateNumber',
  'SoftwareCertificateSerialNumber',
] as const;

/** SHA-1 em hexadecimal minúsculo, que é o formato que a AT aceita. */
export function sha1(conteudo: string): string {
  return createHash('sha1').update(conteudo, 'utf8').digest('hex');
}

/**
 * Hash do `Header`.
 * @param header - Cabeçalho sem `Hash` (o próprio campo não entra no cálculo).
 * @returns Digest SHA-1 em hexadecimal.
 */
export function calcularHashHeader(header: Omit<SaftHeader, 'Hash'>): string {
  const concatenado = CAMPOS_HEADER_HASH.map((campo) => header[campo] ?? '').join('');
  return sha1(concatenado);
}

/**
 * Hash do `Body`, calculado sobre o XML já serializado.
 * @param bodyXml - XML do elemento `<Body>`.
 * @returns Digest SHA-1 em hexadecimal.
 */
export function calcularHashBody(bodyXml: string): string {
  return sha1(bodyXml);
}

/** Hash do ficheiro inteiro, para registo local e detecção de adulteração. */
export function calcularHashFicheiro(xmlCompleto: string): string {
  return sha1(xmlCompleto);
}

/**
 * Monta o bloco `Hashes` com os dois elementos exigidos pela AT.
 * A ordem é obrigatória: `0` é sempre o `Header`, `1` é sempre o `Body`.
 *
 * @param headerHash - Digest do cabeçalho.
 * @param bodyHash - Digest do corpo.
 * @returns Os dois `Hash` prontos a serializar.
 */
export function construirHashes(headerHash: string, bodyHash: string): SaftHashEntry[] {
  return [
    {
      DigestMethod: SAFT_HASH_ALGORITHM,
      DigestValue: headerHash,
      SourceID: 'Header',
      SourceHash: '',
    },
    {
      DigestMethod: SAFT_HASH_ALGORITHM,
      DigestValue: bodyHash,
      SourceID: 'SourceID',
      SourceHash: headerHash,
    },
  ];
}

/**
 * Digest de uma linha, usado no `HashControl` de cada documento.
 * Não é um `Hash` de schema — é o valor que permite à AT ligar um documento do
 * ficheiro ao registo contabilístico correspondente, e por isso tem de ser
 * determinístico.
 */
export function calcularHashControl(
  numero: string,
  dataEmissao: string,
  totalLiquido: string,
  atcud: string | null,
): string {
  return sha1(`${numero}|${dataEmissao}|${totalLiquido}|${atcud ?? ''}`).slice(0, 40);
}

/** Reexportado para quem só precisa do tipo do corpo a serializar. */
export type { SaftBody };