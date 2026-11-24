/**
 * @file file.ts
 * @description Convenções do ficheiro de licença partilhadas entre Main e UI.
 */

/** Extensão única aceite pelo importador. O conteúdo é sempre validado. */
export const LICENSE_FILE_EXTENSION = '.erplic';

/** Limite generoso para um JSON assinado; impede ficheiros absurdos na importação. */
export const LICENSE_FILE_MAX_BYTES = 256 * 1024;

/** Analisa o conteúdo lido; erros de JSON são traduzidos pelo chamador. */
export function parseLicenseFileContent(content: string): unknown {
  return JSON.parse(content) as unknown;
}
