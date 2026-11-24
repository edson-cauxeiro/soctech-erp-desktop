export interface LinhaComercialInput {
  artigoId: string;
  quantidade: number;
  precoUnitario: number;
  desconto?: number;
  taxaIva: number;
  motivoIsencao?: string | null;
}

export interface LinhaComercialCalculada extends LinhaComercialInput {
  desconto: number;
  totalLinha: number;
  valorIva: number;
  valorDesconto: number;
  baseIncidencia: number;
}

export interface ResumoIvaCalculado {
  taxa: number;
  baseIncidencia: number;
  valorIva: number;
  motivoIsencao?: string | null;
}

export interface DocumentoCalculosResultado {
  linhas: LinhaComercialCalculada[];
  totalIliquido: number;
  totalDesconto: number;
  totalIva: number;
  totalLiquido: number;
  resumoIva: ResumoIvaCalculado[];
}

export function calcularLinhasComerciais(linhas: LinhaComercialInput[]): DocumentoCalculosResultado {
  let totalDesconto = 0;
  let totalIliquido = 0;
  let totalIva = 0;

  const resumoIvaMap = new Map<string, ResumoIvaCalculado>();

  const processadas: LinhaComercialCalculada[] = linhas.map((linha) => {
    const desconto = Number(linha.desconto ?? 0);
    const precoBruto = Number(linha.quantidade) * Number(linha.precoUnitario);
    const valorDesconto = precoBruto * (desconto / 100);
    const baseIncidencia = precoBruto - valorDesconto;
    const taxaIva = Number(linha.taxaIva);
    const valorIva = baseIncidencia * (taxaIva / 100);
    const totalLinha = baseIncidencia + valorIva;

    totalDesconto += valorDesconto;
    totalIliquido += baseIncidencia;
    totalIva += valorIva;

    const key = `${taxaIva}_${linha.motivoIsencao || ''}`;
    const existingResumo = resumoIvaMap.get(key);
    if (existingResumo) {
      existingResumo.baseIncidencia += baseIncidencia;
      existingResumo.valorIva += valorIva;
    } else {
      resumoIvaMap.set(key, {
        taxa: taxaIva,
        baseIncidencia,
        valorIva,
        motivoIsencao: linha.motivoIsencao || null,
      });
    }

    return {
      ...linha,
      desconto,
      valorDesconto: Number(valorDesconto.toFixed(4)),
      baseIncidencia: Number(baseIncidencia.toFixed(4)),
      valorIva: Number(valorIva.toFixed(4)),
      totalLinha: Number(totalLinha.toFixed(4)),
    };
  });

  const resumoIva = Array.from(resumoIvaMap.values()).map((r) => ({
    taxa: Number(r.taxa.toFixed(2)),
    baseIncidencia: Number(r.baseIncidencia.toFixed(4)),
    valorIva: Number(r.valorIva.toFixed(4)),
    motivoIsencao: r.motivoIsencao,
  }));

  return {
    linhas: processadas,
    totalIliquido: Number(totalIliquido.toFixed(4)),
    totalDesconto: Number(totalDesconto.toFixed(4)),
    totalIva: Number(totalIva.toFixed(4)),
    totalLiquido: Number((totalIliquido + totalIva).toFixed(4)),
    resumoIva,
  };
}
