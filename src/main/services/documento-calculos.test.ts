import { describe, expect, it } from 'vitest';
import { calcularLinhasComerciais } from './documento-calculos';

describe('calcularLinhasComerciais', () => {
  it('calculates discount, IVA and final totals to four decimals', () => {
    const result = calcularLinhasComerciais([
      { artigoId: 'a1', quantidade: 2, precoUnitario: 10, desconto: 10, taxaIva: 23 },
    ]);
    expect(result).toMatchObject({ totalIliquido: 18, totalIva: 4.14, totalLiquido: 22.14 });
    expect(result.linhas[0].totalLinha).toBe(22.14);
    expect(result.resumoIva).toHaveLength(1);
    expect(result.resumoIva[0].taxa).toBe(23);
    expect(result.resumoIva[0].baseIncidencia).toBe(18);
    expect(result.resumoIva[0].valorIva).toBe(4.14);
  });

  it('aggregates multiple lines with different VAT rates and exemption reasons', () => {
    const result = calcularLinhasComerciais([
      { artigoId: 'a1', quantidade: 1, precoUnitario: 100, desconto: 0, taxaIva: 14 },
      { artigoId: 'a2', quantidade: 2, precoUnitario: 50, desconto: 0, taxaIva: 0, motivoIsencao: 'M02 - Artigo 12.º do CIVA' },
    ]);
    expect(result.totalIliquido).toBe(200);
    expect(result.totalIva).toBe(14);
    expect(result.totalLiquido).toBe(214);
    expect(result.resumoIva).toHaveLength(2);
  });
});
