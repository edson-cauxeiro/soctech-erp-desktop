/**
 * @file rh-csv.ts
 * @description Utilitários puros para leitura de ficheiros CSV (RH-208).
 *
 * Sem dependências de Electron, Prisma ou Zod: só texto. Isto permite testar a
 * leitura de CSV, a detecção de separador e a normalização de valores sem base
 * de dados, que é onde os erros de importação realmente nascem.
 */

/**
 * Deteta o separador mais provável na primeira linha com conteúdo.
 *
 * O export do ERP usa `;` (o Excel em português só abre CSV com uma coluna por
 * campo com esse separador), mas ficheiros vindos de folhas de cálculo e de
 * outras ferramentas usam `,` ou tab. A escolha é feita fora de aspas para que
 * uma vírgula dentro de um campo `"Silva, Ana"` não decida o separador.
 */
export function detetarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((linha) => linha.trim() !== '') ?? '';
  const contagens: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let dentroAspas = false;

  for (const caracter of primeira) {
    if (caracter === '"') dentroAspas = !dentroAspas;
    else if (!dentroAspas && caracter in contagens) contagens[caracter]++;
  }

  const melhor = Object.entries(contagens).sort((a, b) => b[1] - a[1])[0];
  return melhor[1] > 0 ? melhor[0] : ';';
}

/**
 * Lê um CSV para uma matriz de campos, seguindo o RFC 4180.
 *
 * Aceita aspas duplicadas (`""`) como escape, campos com separadores e quebras
 * de linha, CRLF ou LF, e remove o BOM inicial (o Excel grava-o e sem o remover
 * o primeiro cabeçalho fica com um caractere invisível à frente). Linhas
 * totalmente vazias são descartadas — normalmente são o resultado de um ficheiro
 * terminado com uma quebra de linha.
 */
export function parseCsv(texto: string, separadorForcado?: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, '');
  const separador = separadorForcado ?? detetarSeparador(limpo);

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let dentroAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const caracter = limpo[i];

    if (dentroAspas) {
      if (caracter === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += caracter;
      }
      continue;
    }

    if (caracter === '"') dentroAspas = true;
    else if (caracter === separador) {
      linha.push(campo);
      campo = '';
    } else if (caracter === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (caracter !== '\r') {
      campo += caracter;
    }
  }

  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((linha) => linha.some((valor) => valor.trim() !== ''));
}

/**
 * Normaliza um cabeçalho ou código para comparação: remove acentos, baixa para
 * minúsculas e descarta tudo o que não seja letra ou dígito.
 *
 * `"Data de Admissão"` e `"dataAdmissao"` passam ambas a `datadeadmissao`, o que
 * permite aceitar cabeçalhos escritos por humanos sem impor um dicionário
 * rígido de nomes de coluna.
 */
export function normalizarChave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normaliza um valor destinado a um enum: remove acentos, troca espaços e hífens
 * por underscore e passa a maiúsculas. `"prazo certo"` → `PRAZO_CERTO`.
 * Devolve `undefined` para vazio, para que o campo fique em falta em vez de
 * inválido.
 */
export function normalizarEnum(valor: string): string | undefined {
  const normalizado = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return normalizado === '' ? undefined : normalizado;
}

/**
 * Converte um número no formato português ou internacional para `number`.
 *
 * Aceita `"1.234,56"` (pt), `"1,234.56"` (en) e `"1234.56"`. A decisão entre
 * ponto e vírgula como separador decimal é tomada pelo último separador quando
 * ambos estão presentes. Só com vírgula, esta é decimal (`"1500,5"` → 1500.5).
 * Só com ponto, se a parte fracional tiver exatamente 3 dígitos assume-o como
 * milhar (`"150.000"` → 150000, comum nos campos monetários do ERP) e usa-o como
 * decimal caso contrário (`"1234.56"` → 1234.56).
 */
export function parseNumero(valor: string): number | null {
  const limpo = valor.replace(/\s/g, '');
  if (limpo === '') return null;

  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');
  let normalizado = limpo;

  if (temVirgula && temPonto) {
    normalizado =
      limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
        ? limpo.replace(/\./g, '').replace(',', '.')
        : limpo.replace(/,/g, '');
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.');
  } else if (temPonto) {
    const fracao = limpo.split('.').pop() ?? '';
    normalizado = fracao.length === 3 ? limpo.replace(/\./g, '') : limpo;
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Converte uma data em `YYYY-MM-DD` ou `DD/MM/YYYY` (também `DD-MM-YYYY` e
 * `DD.MM.YYYY`) para `Date` em UTC. Devolve `null` quando o texto não é uma data
 * válida — incluindo datas impossíveis como `31/02/2026`.
 */
export function parseData(valor: string): Date | null {
  const texto = valor.trim();
  if (texto === '') return null;

  let ano: number;
  let mes: number;
  let dia: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else {
    const br = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(texto);
    if (!br) return null;
    dia = Number(br[1]);
    mes = Number(br[2]);
    ano = Number(br[3]);
  }

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return data;
}
