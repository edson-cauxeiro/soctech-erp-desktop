/**
 * @file canonical.ts
 * @description Serialização determinística do payload assinado.
 *
 * A assinatura cobre os bytes canónicos do payload. A ordem das propriedades
 * de um objecto JavaScript não é estável após parse/serialização, por isso
 * as chaves são ordenadas recursivamente antes de assinar e verificar.
 */

/** Ordena chaves recursivamente e remove propriedades `undefined`. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      result[key] = normalize(source[key]);
    }
    return result;
  }
  return value;
}

/** Devolve a representação JSON canónica de um valor. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}
