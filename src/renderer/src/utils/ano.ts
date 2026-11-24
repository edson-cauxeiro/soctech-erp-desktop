export const SEM_ANO = "sem-ano";

/** Extrai o ano de uma data (ISO ou Date) sem depender de fuso horário. */
export function anoDeData(data: string | Date | null | undefined): string {
  if (!data) return SEM_ANO;
  if (typeof data === "string") {
    const prefixo = /^(\d{4})/.exec(data);
    if (prefixo) return prefixo[1];
  }
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? SEM_ANO : String(d.getFullYear());
}

/** Ano a partir de um campo textual (ex.: `ano` de um exercício fiscal), com fallback para a data. */
export function anoDeTexto(
  valor: string | number | null | undefined,
  data?: string | Date | null
): string {
  const texto = valor != null ? String(valor).trim() : "";
  return /^\d{4}$/.test(texto) ? texto : anoDeData(data);
}

export interface GrupoAno<T> {
  ano: string;
  itens: T[];
}

/** Agrupa registos por ano, do mais recente para o mais antigo (sem ano no fim). */
export function agruparPorAno<T>(itens: T[], anoDe: (item: T) => string): GrupoAno<T>[] {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const ano = anoDe(item);
    const lista = mapa.get(ano);
    if (lista) lista.push(item);
    else mapa.set(ano, [item]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => {
      if (a === SEM_ANO) return 1;
      if (b === SEM_ANO) return -1;
      return Number(b) - Number(a);
    })
    .map(([ano, lista]) => ({ ano, itens: lista }));
}
