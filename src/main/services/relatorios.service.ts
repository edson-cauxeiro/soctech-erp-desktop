/**
 * @file relatorios.service.ts
 * @description Relatórios analíticos agregados (REL-01).
 *
 * Estas consultas são só de leitura e existem para alimentar gráficos. Duas
 * decisões que valem a pena deixar escritas, porque não são óbvias ao ler o
 * código:
 *
 * 1. **Documentos anulados nunca entram.** Um documento anulado está no
 *    histórico por auditoria, mas somá-lo às vendas dá um número que não
 *    corresponde a dinheiro que entrou. Fica sempre de fora, em todos os
 *    relatórios.
 *
 * 2. **Notas de crédito subtraem.** Uma nota de crédito é venda revertida, e
 *   逆 Reportá-la como venda positive é o erro clássico deste ecrã. Faturas e
 *    recibos somam, notas de crédito tiram, notas de débito somam.
 *
 * Todos os valores saem como `number` já arredondado a 2 casas: quem consome
 * isto são gráficos, e um `Decimal` serializado como string atravessa o IPC
 * como texto e quebra a escala do gráfico. A conversão para `number` é
 * deliberada e está no limite do serviço.
 *
 * O `empresaId` é obrigatório em tudo o que é financeiro. Sem ele o relatório
 * mistura empresas e não há forma de o utilizador perceber de onde veio o
 * número.
 */

import { PrismaClient, Prisma, TipoDocumentoVenda } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import type { FiltroRelatorio, LinhaFolhaVencimentoDto, ResumoIrtDto, ResumoInssDto, LinhaMapaFeriasDto, LinhaMapaAusenciasDto, LinhaDividasAbertasDto, LinhaCustoDepartamentoDto } from '../@types/electron';
import { sanitizarRespostaSemSalarios, sanitizarListaSemSalarios } from '../utils/sanitize';

export type { FiltroRelatorio };

export interface PeriodoRelatorio {
  /** Primeiro instante do período, inclusivo. */
  de: Date;
  /** Último instante do período, inclusivo. */
  ate: Date;
}

export interface SerieMensal {
  /** `AAAA-MM`. */
  mes: string;
  total: number;
  quantidade: number;
}

export interface LinhaTopArtigo {
  artigoId: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  total: number;
}

export interface LinhaTopCliente {
  clienteId: string;
  nome: string;
  nif: string;
  faturas: number;
  total: number;
  totalPago: number;
  emDivida: number;
}

export interface LinhaStockBaixo {
  artigoId: string;
  codigo: string;
  descricao: string;
  stockMinimo: number;
  pontoEncomenda: number;
  stockAtual: number;
  suggestaoEncomenda: number;
}

export interface LinhaValorizacao {
  artigoId: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  custoUnitario: number;
  valor: number;
}

export interface LinhaFluxoTesouraria {
  mes: string;
  entradas: number;
  saidas: number;
  liquido: number;
}

export interface LinhaIva {
  taxa: number;
  base: number;
  iva: number;
  liquido: number;
}

export interface ResumoExecutivo {
  /** Receita líquida de notas de crédito. */
  totalVendas: number;
  /** Total das notas de crédito do período. Já descontado em `totalVendas`. */
  totalNotasCredito: number;
  totalCompras: number;
  totalIvaLiquidado: number;
  resultado: number;
  numeroFaturas: number;
  numeroClientes: number;
  margemBruta: number;
  margemBrutaPercentagem: number;
}

export interface RelatorioCompleto {
  resumo: ResumoExecutivo;
  vendasPorMes: SerieMensal[];
  fluxoTesourariaPorMes: LinhaFluxoTesouraria[];
  topArtigos: LinhaTopArtigo[];
  topClientes: LinhaTopCliente[];
  stockBaixo: LinhaStockBaixo[];
  valorizacao: LinhaValorizacao[];
  ivaPorTaxa: LinhaIva[];
  folhaVencimentos: LinhaFolhaVencimentoDto[];
  resumoIrt: ResumoIrtDto | null;
  resumoInss: ResumoInssDto | null;
  mapaFerias: LinhaMapaFeriasDto[];
  mapaAusencias: LinhaMapaAusenciasDto[];
  dividasAbertas: LinhaDividasAbertasDto[];
  custoDepartamento: LinhaCustoDepartamentoDto[];
}

/** Tipos que somam ao total de vendas. `nota_credito` é tratada à parte. */
const TIPOS_QUE_SOMAM: TipoDocumentoVenda[] = ['fatura', 'fatura_recibo', 'nota_debito'];

/**
 * Arredonda a 2 casas no limite do serviço.
 *
 * `toFixed` devolve string; o `Number` de volta é o que o gráfico quer. Um
 * `Decimal` do Prisma serializado no IPC seria recebido como string e
 * inviabilizaria a escala do gráfico.
 */
function arredondar(valor: Prisma.Decimal | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  return Number(Number(valor).toFixed(2));
}

function arredondar4(valor: Prisma.Decimal | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  return Number(Number(valor).toFixed(4));
}

/**
 * Meia-noite local do dia civil que `data` representa.
 *
 * Os componentes UTC de `data` são o dia que o utilizador pediu. Reconstruir
 * a meia-noite local a partir deles é o que evita o erro de fuso horário
 * clássico: `new Date('2026-01-01')` é lido pelo JavaScript como meia-noite
 * *UTC*, e numa máquina atrás de UTC isso é o dia anterior às 21:00. Somar as
 * horas locais a seguir deslocava o relatório para o dia 31 de Dezembro.
 */
function inicioDoDia(data: Date): Date {
  return new Date(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

/**
 * Limites do período, com o último dia incluído.
 *
 * O limite superior é exclusivo e aponta para a meia-noite do dia seguinte.
 * Usar a meia-noite do próprio `ate` como limite excluiria o dia final inteiro.
 */
function filtroData(periodo: PeriodoRelatorio): { gte: Date; lt: Date } {
  const inicio = inicioDoDia(periodo.de);
  const fim = new Date(inicioDoDia(periodo.ate));
  fim.setDate(fim.getDate() + 1);

  return { gte: inicio, lt: fim };
}

/**
 * Sinal do documento no total de vendas, escrito em SQL em cada consulta.
 *
 * Nota de crédito é o único tipo que reduz. Fatura e fatura-recibo somam uma
 * venda normal; nota de débito soma porque representa cobrança a acrescer. A
 * regra está escrita em cada `CASE` em vez de numa função de propósito: para a
 * chegar ao SQL é preciso interpolar expressões, não só colunas, e um helper
 * que aceitasse SQL bruto acabava por ser uma concatenação sem proteção.
 */

export class RelatoriosService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Receita por mês, com as notas de crédito já revertidas.
   *
   * A agregação por mês é feita em SQL (`date_trunc`) porque o Prisma não tem
   * `groupBy` por um campo derivado como o mês. Todos os valores interpolados
   * vão por placeholder — nada de concatenar input na query.
   */
  async vendasPorMes(filtro: FiltroRelatorio): Promise<SerieMensal[]> {
    const datas = filtroData(filtro.periodo);

    const linhas = await this.prisma.$queryRaw<
      Array<{ mes: string; total: Prisma.Decimal; quantidade: bigint }>
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('month', f.data_emissao), 'YYYY-MM') AS mes,
        COALESCE(SUM(
          CASE WHEN f.tipo = 'nota_credito' THEN -f.total_liquido ELSE f.total_liquido END
        ), 0) AS total,
        COUNT(*) AS quantidade
      FROM faturas_venda f
      WHERE f.estado_documento = 'emitido'
        AND (f.empresa_id IS NULL OR f.empresa_id = ${filtro.empresaId})
        AND f.data_emissao >= ${datas.gte}
        AND f.data_emissao < ${datas.lt}
      GROUP BY date_trunc('month', f.data_emissao)
      ORDER BY date_trunc('month', f.data_emissao) ASC
    `);

    return linhas.map((linha) => ({
      mes: linha.mes,
      total: arredondar(linha.total),
      quantidade: Number(linha.quantidade),
    }));
  }

/**
   * IVA liquidado por taxa no período, só sobre documentos emitidos.
   *
   * `total_linha` é o valor **com** IVA — é o que `documento-calculos.ts`
   * grava e o que aparece na linha da fatura. A base extrai-se dividindo pela
   * taxa e não subtraindo o IVA de uma coluna que já é líquida: somar
   * `total_linha * taxa / 100` daria IVA a duplicar e um mapa de taxas que
   * nunca bate com o total do documento.
   *
   * Notas de crédito entram com sinal negativo para que uma devolução na taxa
   * de 23% reduza o mapa de IVA em vez de desaparecer dele.
   */
  async ivaPorTaxa(filtro: FiltroRelatorio): Promise<LinhaIva[]> {
    const datas = filtroData(filtro.periodo);

    const linhas = await this.prisma.$queryRaw<
      Array<{ taxa: Prisma.Decimal; liquido: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT
        l.taxa_iva AS taxa,
        COALESCE(SUM(
          CASE WHEN f.tipo = 'nota_credito' THEN -l.total_linha ELSE l.total_linha END
        ), 0) AS liquido
      FROM linhas_fatura_venda l
      INNER JOIN faturas_venda f ON f.id = l.fatura_id
      WHERE f.estado_documento = 'emitido'
        AND (f.empresa_id IS NULL OR f.empresa_id = ${filtro.empresaId})
        AND f.data_emissao >= ${datas.gte}
        AND f.data_emissao < ${datas.lt}
      GROUP BY l.taxa_iva
      ORDER BY taxa DESC
    `);

    return linhas.map((linha) => {
      const liquido = arredondar(linha.liquido);
      const taxa = arredondar(linha.taxa);
      // Base sem IVA: qualquer desconto já está refletido em `total_linha`.
      const base = arredondar(taxa === -100 ? liquido : liquido / (1 + taxa / 100));
      return { taxa, base, iva: arredondar(liquido - base), liquido };
    });
  }

  /**
   * Resumo executivo do período.
   *
   * `margemBruta` é vendas menos custo das mercadorias vendidas. Só entra o
   * custo do que foi vendido (linhas com quantidade positiva), não o custo do
   * que está em armazém — este é um relatório de resultado, não de armazém.
   */
  async resumoExecutivo(filtro: FiltroRelatorio): Promise<ResumoExecutivo> {
    const datas = filtroData(filtro.periodo);

    const [vendas, creditos, compras, faturas, custoVendido, ivaBruto] = await Promise.all([
      this.prisma.faturaVenda.aggregate({
        where: {
          estadoDocumento: 'emitido',
          tipo: { in: TIPOS_QUE_SOMAM },
          OR: [{ empresaId: filtro.empresaId }, { empresaId: null }],
          dataEmissao: { gte: datas.gte, lt: datas.lt },
        },
        _sum: { totalLiquido: true },
        _count: { _all: true },
      }),
      this.prisma.faturaVenda.aggregate({
        where: {
          estadoDocumento: 'emitido',
          tipo: 'nota_credito',
          OR: [{ empresaId: filtro.empresaId }, { empresaId: null }],
          dataEmissao: { gte: datas.gte, lt: datas.lt },
        },
        _sum: { totalLiquido: true },
      }),
      // `faturas_compra` não tem `empresa_id` nem `estado_documento`: as compras
      // não são emitidas por empresa e não têm estado de anulação. Somam-se
      // pelo período e ponto final.
      this.prisma.faturaCompra.aggregate({
        where: { dataEmissao: { gte: datas.gte, lt: datas.lt } },
        _sum: { totalLiquido: true },
      }),
      this.prisma.faturaVenda.groupBy({
        by: ['clienteId'],
        where: {
          estadoDocumento: 'emitido',
          OR: [{ empresaId: filtro.empresaId }, { empresaId: null }],
          dataEmissao: { gte: datas.gte, lt: datas.lt },
        },
      }),
      this.custoDasVendas(filtro),
      this.prisma.$queryRaw<Array<{ iva: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(
          CASE WHEN f.tipo = 'nota_credito' THEN -f.total_iva ELSE f.total_iva END
        ), 0) AS iva
        FROM faturas_venda f
        WHERE f.estado_documento = 'emitido'
          AND (f.empresa_id IS NULL OR f.empresa_id = ${filtro.empresaId})
          AND f.data_emissao >= ${datas.gte}
          AND f.data_emissao < ${datas.lt}
      `),
    ]);

    const totalVendasBruto = arredondar(vendas._sum.totalLiquido);
    const totalNotasCredito = arredondar(creditos._sum.totalLiquido);
    // Líquido de notas de crédito, e não bruto: o custo das mercadorias
    // vendidas já as desconta (`custoDasVendas` nega as linhas de nota de
    // crédito), e `vendasPorMes` também. Somar a receita bruta a um custo
    // líquido daria uma margem bruta que não corresponde a nada. O total bruto
    // continua visível em `totalNotasCredito`.
    const totalVendas = arredondar(totalVendasBruto - totalNotasCredito);
    const totalCompras = arredondar(compras._sum.totalLiquido);
    const totalIvaLiquidado = arredondar(ivaBruto[0]?.iva);

    const resultado = arredondar(totalVendas - totalCompras);
    const margemBruta = arredondar(totalVendas - custoVendido);

    return {
      totalVendas,
      totalNotasCredito,
      totalCompras,
      totalIvaLiquidado,
      resultado,
      numeroFaturas: vendas._count._all,
      numeroClientes: faturas.length,
      margemBruta,
      margemBrutaPercentagem:
        totalVendas === 0 ? 0 : arredondar((margemBruta / totalVendas) * 100),
    };
  }

  /**
   * Custo das mercadorias vendidas, pelo custo unitário médio do artigo.
   *
   * É uma aproximação: o custo real de uma venda depende do lote que saiu, e
   * só os artigos com controlo de lote o saberiam. Para os restantes, o custo
   * médio guardado no artigo é o que há. Fica assim porque é o mesmo valor que
   * a app mostra no artigo, e um relatório que não bate com a ficha do artigo
   * gera mais dúvidas do que resolve.
   */
  private async custoDasVendas(filtro: FiltroRelatorio): Promise<number> {
    const datas = filtroData(filtro.periodo);

    const linhas = await this.prisma.$queryRaw<Array<{ custo: Prisma.Decimal }>>(Prisma.sql`
      SELECT COALESCE(SUM(
        l.quantidade * a.preco_custo_medio
        * CASE WHEN f.tipo = 'nota_credito' THEN -1 ELSE 1 END
      ), 0) AS custo
      FROM linhas_fatura_venda l
      INNER JOIN faturas_venda f ON f.id = l.fatura_id
      INNER JOIN artigos a ON a.id = l.artigo_id
      WHERE f.estado_documento = 'emitido'
        AND l.quantidade > 0
        AND (f.empresa_id IS NULL OR f.empresa_id = ${filtro.empresaId})
        AND f.data_emissao >= ${datas.gte}
        AND f.data_emissao < ${datas.lt}
    `);

    return arredondar(linhas[0]?.custo);
  }

  /** Artigos mais vendidos no período, por valor de linha. */
  async topArtigos(filtro: FiltroRelatorio, limite = 10): Promise<LinhaTopArtigo[]> {
    const datas = filtroData(filtro.periodo);

    const linhas = await this.prisma.$queryRaw<
      Array<{
        artigo_id: string;
        codigo: string;
        descricao: string;
        quantidade: Prisma.Decimal;
        total: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        l.artigo_id,
        l.artigo_codigo AS codigo,
        l.artigo_descricao AS descricao,
        COALESCE(SUM(
          CASE WHEN f.tipo = 'nota_credito' THEN -l.quantidade ELSE l.quantidade END
        ), 0) AS quantidade,
        COALESCE(SUM(
          CASE WHEN f.tipo = 'nota_credito' THEN -l.total_linha ELSE l.total_linha END
        ), 0) AS total
      FROM linhas_fatura_venda l
      INNER JOIN faturas_venda f ON f.id = l.fatura_id
      WHERE f.estado_documento = 'emitido'
        AND (f.empresa_id IS NULL OR f.empresa_id = ${filtro.empresaId})
        AND f.data_emissao >= ${datas.gte}
        AND f.data_emissao < ${datas.lt}
      GROUP BY l.artigo_id, l.artigo_codigo, l.artigo_descricao
      ORDER BY total DESC
      LIMIT ${limite}
    `);

    return linhas.map((linha) => ({
      artigoId: linha.artigo_id,
      codigo: linha.codigo,
      descricao: linha.descricao,
      quantidade: arredondar4(linha.quantidade),
      total: arredondar(linha.total),
    }));
  }

  /**
   * Clientes por valor facturado, com a dívida em aberto.
   *
   * O que está pago vem das imputações de recibo, e não do
   * `estadoPagamento`. O estado é um rótulo derivado (`pago`/`parcial`/
   * `pendente`) e não diz quanto foi pago — uma fatura `parcial` a 10% tem
   * 90% em dívida, e ler o estado como "não está paga" dava 100%.
   *
   * As imputações são pré-agregadas por fatura numa subconsulta. Sem isso, uma
   * fatura com dois recibos aparecia duas vezes no `JOIN` e o total dela
   * contava para o dobro.
   */
  async topClientes(filtro: FiltroRelatorio, limite = 10): Promise<LinhaTopCliente[]> {
    const datas = filtroData(filtro.periodo);

    const linhas = await this.prisma.$queryRaw<
      Array<{
        cliente_id: string;
        nome: string;
        nif: string;
        faturas: bigint;
        total: Prisma.Decimal;
        pago: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        f.cliente_id,
        f.cliente_nome AS nome,
        COALESCE(MAX(NULLIF(f.cliente_nif, '')), '') AS nif,
        COUNT(*) AS faturas,
        COALESCE(SUM(
          CASE WHEN f.tipo = 'nota_credito' THEN -f.total_liquido ELSE f.total_liquido END
        ), 0) AS total,
        COALESCE(SUM(pago.valor), 0) AS pago
      FROM faturas_venda f
      LEFT JOIN (
        SELECT fatura_id, SUM(valor_imputado) AS valor
        FROM imputacoes_recibo
        GROUP BY fatura_id
      ) pago ON pago.fatura_id = f.id
      WHERE f.estado_documento = 'emitido'
        AND (f.empresa_id IS NULL OR f.empresa_id = ${filtro.empresaId})
        AND f.data_emissao >= ${datas.gte}
        AND f.data_emissao < ${datas.lt}
      GROUP BY f.cliente_id, f.cliente_nome
      ORDER BY total DESC
      LIMIT ${limite}
    `);

    return linhas.map((linha) => {
      const total = arredondar(linha.total);
      const pago = arredondar(linha.pago);
      return {
        clienteId: linha.cliente_id,
        nome: linha.nome,
        // O NIF entra como agregada (`MAX`) e não como coluna do `GROUP BY`
        // de propósito: faturas antigas podem ter o NIF vazio e o mesmo
        // cliente apareceria duas vezes na tabela se o agrupássemos por ele.
        nif: linha.nif ?? '',
        faturas: Number(linha.faturas),
        total,
        totalPago: pago,
        // Sem piso, um adiantamento do cliente — dinheiro recebido antes de
        // haver fatura — produzia dívida negativa, e o gráfico mostrava um
        // cliente a dever dinheiro à empresa. A dívida fica em zero e o que
        // sobra do adiantamento transparece em `totalPago` acima do total.
        emDivida: arredondar(Math.max(total - pago, 0)),
      };
    });
  }

  /**
   * Artigos abaixo do stock mínimo, com a quantidade a encomendar.
   *
   * O stock reproduz a mesma conta de `stock.service.ts` — entradas por
   * `armazemDestinoId`, saídas por `armazemOrigemId`, transferências de fora
   * porque não mudam o total — para que o relatório e a ficha do artigo nunca
   * mostrem números diferentes. Um `ajuste` conta nos dois sentidos, conforme
   * o armazém preenchido.
   *
   * A sugestão nunca é negativa: um artigo abaixo do mínimo precisa de
   * encomenda, e sugerir `0` seria pior do que não sugerir nada.
   */
  async stockBaixo(): Promise<LinhaStockBaixo[]> {
    const linhas = await this.prisma.$queryRaw<
      Array<{
        artigo_id: string;
        codigo: string;
        descricao: string;
        stock_minimo: Prisma.Decimal;
        ponto_encomenda: Prisma.Decimal;
        stock_atual: Prisma.Decimal;
      }>
    >(Prisma.sql`
      WITH movimentos AS (
        SELECT
          a.id AS artigo_id,
          a.codigo,
          a.descricao,
          a.stock_minimo,
          a.ponto_encomenda,
          a.preco_custo_medio,
          COALESCE(entradas.quantidade, 0) - COALESCE(saidas.quantidade, 0) AS stock_atual
        FROM artigos a
        LEFT JOIN (
          SELECT artigo_id, SUM(quantidade) AS quantidade
          FROM movimentos_stock
          WHERE armazem_destino_id IS NOT NULL AND tipo IN ('entrada', 'ajuste')
          GROUP BY artigo_id
        ) entradas ON entradas.artigo_id = a.id
        LEFT JOIN (
          SELECT artigo_id, SUM(quantidade) AS quantidade
          FROM movimentos_stock
          WHERE armazem_origem_id IS NOT NULL AND tipo IN ('saida', 'consumo_producao', 'ajuste')
          GROUP BY artigo_id
        ) saidas ON saidas.artigo_id = a.id
        WHERE a.estado = 'ativo'
      )
      SELECT
        artigo_id,
        codigo,
        descricao,
        stock_minimo,
        ponto_encomenda,
        stock_atual
      FROM movimentos
      WHERE stock_atual < stock_minimo
      ORDER BY stock_atual ASC
      LIMIT 50
    `);

    return linhas.map((linha) => {
      const stockAtual = arredondar4(linha.stock_atual);
      const stockMinimo = arredondar4(linha.stock_minimo);
      const pontoEncomenda = arredondar4(linha.ponto_encomenda);

      // Repor até ao stock máximo dá o número maior de sempre. Repor até ao
      // mínimo é mais barato em capital circulante. Quando o ponto de encomenda
      // está definido, é ele que manda, porque foi definido por alguém que
      // conhece o prazo de_fornecedor.
      const alvo = pontoEncomenda > 0 ? pontoEncomenda : Math.max(stockMinimo * 2, stockMinimo);
      return {
        artigoId: linha.artigo_id,
        codigo: linha.codigo,
        descricao: linha.descricao,
        stockMinimo,
        pontoEncomenda,
        stockAtual,
        suggestaoEncomenda: arredondar4(Math.max(alvo - stockAtual, 0)),
      };
    });
  }

  /**
   * Valorização do stock em armazém.
   *
   * Mesma conta de stock que `stockBaixo`, pela mesma razão: o número tem de
   * bater com a ficha do artigo. Transferências ficam de fora porque não
   * alteram o total. Se existirem vários armazéns com o mesmo artigo, isto
   * devolve a soma; a desagregação por armazém fica para quando o relatório
   * precisar dela.
   */
  async valorizacaoStock(limite = 25): Promise<LinhaValorizacao[]> {
    const linhas = await this.prisma.$queryRaw<
      Array<{
        artigo_id: string;
        codigo: string;
        descricao: string;
        quantidade: Prisma.Decimal;
        custo_unitario: Prisma.Decimal;
      }>
    >(Prisma.sql`
      WITH movimentos AS (
        SELECT
          a.id AS artigo_id,
          a.codigo,
          a.descricao,
          a.preco_custo_medio,
          COALESCE(entradas.quantidade, 0) - COALESCE(saidas.quantidade, 0) AS quantidade
        FROM artigos a
        LEFT JOIN (
          SELECT artigo_id, SUM(quantidade) AS quantidade
          FROM movimentos_stock
          WHERE armazem_destino_id IS NOT NULL AND tipo IN ('entrada', 'ajuste')
          GROUP BY artigo_id
        ) entradas ON entradas.artigo_id = a.id
        LEFT JOIN (
          SELECT artigo_id, SUM(quantidade) AS quantidade
          FROM movimentos_stock
          WHERE armazem_origem_id IS NOT NULL AND tipo IN ('saida', 'consumo_producao', 'ajuste')
          GROUP BY artigo_id
        ) saidas ON saidas.artigo_id = a.id
        WHERE a.estado = 'ativo'
      )
      SELECT
        artigo_id,
        codigo,
        descricao,
        preco_custo_medio AS custo_unitario,
        quantidade
      FROM (
        SELECT *, quantidade * preco_custo_medio AS valor
        FROM movimentos
        WHERE quantidade > 0
      ) valorizado
      ORDER BY valor DESC
      LIMIT ${limite}
    `);

    return linhas.map((linha) => {
      const quantidade = arredondar4(linha.quantidade);
      const custoUnitario = arredondar(linha.custo_unitario);
      return {
        artigoId: linha.artigo_id,
        codigo: linha.codigo,
        descricao: linha.descricao,
        quantidade,
        custoUnitario,
        valor: arredondar(quantidade * custoUnitario),
      };
    });
  }

  /**
   * Entradas e saídas de tesouraria por mês, só de movimentos confirmados.
   *
   * Três decisões, todas para que o gráfico corresponda ao saldo real:
   *
   * - Só entram movimentos `confirmado`. Um `pendente` é visível para
   *   conferência mas ainda não mexeu em saldo nenhum.
   * - Um estorno aparece como o tipo invertido do movimento que anulou (é
   *   assim que `tesouraria.service.ts` o grava), pelo que entra
   *   naturalmente no sentido certo. Não é preciso tratamento à parte.
   * - `ajuste` fica de fora. É uma correção pontual de saldo, não operação, e
   *   incluí-lo bateria o fluxo de caixa com correções administrativas.
   *
   * Uma transferência conta como saída: sai dinheiro de uma conta, e o gráfico
   * mostra o movimento de dinheiro, não a soma das contas.
   */
  async fluxoTesourariaPorMes(filtro: FiltroRelatorio): Promise<LinhaFluxoTesouraria[]> {
    const datas = filtroData(filtro.periodo);

    const linhas = await this.prisma.$queryRaw<
      Array<{
        mes: string;
        entradas: Prisma.Decimal;
        saidas: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('month', m.data), 'YYYY-MM') AS mes,
        COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(
          CASE WHEN m.tipo IN ('saida', 'transferencia') THEN m.valor ELSE 0 END
        ), 0) AS saidas
      FROM movimentos_tesouraria m
      WHERE m.estado = 'confirmado'
        AND m.tipo IN ('entrada', 'saida', 'transferencia')
        AND (m.empresa_id IS NULL OR m.empresa_id = ${filtro.empresaId})
        AND m.data >= ${datas.gte}
        AND m.data < ${datas.lt}
      GROUP BY date_trunc('month', m.data)
      ORDER BY date_trunc('month', m.data) ASC
    `);

    return linhas.map((linha) => {
      const entradas = arredondar(linha.entradas);
      const saidas = arredondar(linha.saidas);
      return { mes: linha.mes, entradas, saidas, liquido: arredondar(entradas - saidas) };
    });
  }

  /** Todas as consultas de uma vez, para o ecrã carregar com um pedido só. */
  async relatorioCompleto(filtro: FiltroRelatorio): Promise<RelatorioCompleto> {
    const [resumo, vendasPorMes, fluxo, topArtigos, topClientes, stockBaixo, valorizacao, ivaPorTaxa] =
      await Promise.all([
        this.resumoExecutivo(filtro),
        this.vendasPorMes(filtro),
        this.fluxoTesourariaPorMes(filtro),
        this.topArtigos(filtro),
        this.topClientes(filtro),
        this.stockBaixo(),
        this.valorizacaoStock(),
        this.ivaPorTaxa(filtro),
      ]);

    const [
      folhaVencimentos,
      resumoIrt,
      resumoInss,
      mapaFerias,
      mapaAusencias,
      dividasAbertas,
      custoDepartamento,
    ] = await Promise.all([
      this.folhaVencimentos(filtro),
      this.resumoIrt(filtro),
      this.resumoInss(filtro),
      this.mapaFerias(filtro),
      this.mapaAusencias(filtro),
      this.dividasAbertas(filtro),
      this.custoDepartamento(filtro),
    ]);

    return {
      resumo,
      vendasPorMes,
      fluxoTesourariaPorMes: fluxo,
      topArtigos,
      topClientes,
      stockBaixo,
      valorizacao,
      ivaPorTaxa,
      folhaVencimentos,
      resumoIrt,
      resumoInss,
      mapaFerias,
      mapaAusencias,
      dividasAbertas,
      custoDepartamento,
    };
  }

/**
   * Folha de vencimentos (payroll sheet) por funcionário no período.
   * Respeita `podeVerSalarios` — se false, remove campos monetários.
   */
  async folhaVencimentos(filtro: FiltroRelatorio): Promise<LinhaFolhaVencimentoDto[]> {
    const podeVerSalarios = filtro.podeVerSalarios ?? false;
    const datas = filtroData(filtro.periodo);

    // Buscar processamentos de salário no período
    const processamentos = await this.prisma.rhProcessamento.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        tipo: 'VENCIMENTO',
        estado: 'PROCESSADO',
        dataProcessamento: {
          gte: datas.gte,
          lte: datas.lt,
        },
      },
      include: {
        funcionario: {
          select: { id: true, codigo: true, nome: true, departamento: { select: { nome: true } }, cargo: { select: { nome: true } } },
        },
        itens: {
          include: {
            rubrica: true,
          },
        },
      },
    });

    const resultado: LinhaFolhaVencimentoDto[] = [];

    for (const proc of processamentos) {
      const func = proc.funcionario;
      const mes = new Date(proc.dataProcessamento).getMonth() + 1;
      const ano = new Date(proc.dataProcessamento).getFullYear();

      for (const item of proc.itens) {
        const rubrica = item.rubrica;
        if (!rubrica) continue;
        const codigoSistema = rubrica.codigoSistema || '';

        // Encontrar ou criar linha do funcionário
        let linha = resultado.find((l) => l.funcionarioId === func.id && l.mes === String(mes) && l.ano === ano);
        if (!linha) {
          linha = {
            funcionarioId: func.id,
            codigo: func.codigo,
            nome: func.nome,
            departamento: func.departamento?.nome || '',
            cargo: func.cargo?.nome || '',
            salarioBase: 0,
            horasExtras: 0,
            valorHorasExtras: 0,
            faltas: 0,
            valorFaltas: 0,
            inss: 0,
            irt: 0,
            outrasDeducoes: 0,
            totalDeducoes: 0,
            liquido: 0,
            mes: String(mes),
            ano,
          };
          resultado.push(linha);
        }

        // Agregar por código de sistema da rubrica
        const valor = Number(item.valor);
        switch (codigoSistema) {
          case 'SALARIO_BASE':
            linha.salarioBase += valor;
            break;
          case 'HORA_EXTRA':
            linha.horasExtras += Number(item.quantidade || 0);
            linha.valorHorasExtras += valor;
            break;
          case 'FALTA':
            linha.faltas += Number(item.quantidade || 0);
            linha.valorFaltas += valor;
            break;
          case 'INSS_EMPRESA':
          case 'INSS_FUNCIONARIO':
            linha.inss += valor;
            break;
          case 'IRT':
            linha.irt += valor;
            break;
          case 'DEDUCAO':
            linha.outrasDeducoes += valor;
            break;
        }

        // Calcular totais
        linha.totalDeducoes = linha.inss + linha.irt + linha.outrasDeducoes;
        linha.liquido = linha.salarioBase + linha.valorHorasExtras - linha.valorFaltas - linha.totalDeducoes;
      }
    }

    if (!podeVerSalarios) {
      return sanitizarListaSemSalarios(resultado, false) as unknown as LinhaFolhaVencimentoDto[];
    }
    return resultado;
  }

  /**
   * Resumo IRT por escalões.
   * Respeita `podeVerSalarios` — se false, remove valores monetários.
   */
  async resumoIrt(filtro: FiltroRelatorio): Promise<ResumoIrtDto> {
    const podeVerSalarios = filtro.podeVerSalarios ?? false;
    const datas = filtroData(filtro.periodo);

    // Buscar processamentos no período
    const processamentos = await this.prisma.rhProcessamento.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        tipo: 'VENCIMENTO',
        estado: 'PROCESSADO',
        dataProcessamento: {
          gte: datas.gte,
          lte: datas.lt,
        },
      },
      include: {
        itens: {
          where: { rubrica: { codigoSistema: { in: ['IRT', 'BASE_IRT'] } } },
          include: { rubrica: true },
        },
      },
    });

    let totalSujeito = 0;
    let totalIrt = 0;

    // Agregar IRT por processamento
    for (const proc of processamentos) {
      for (const item of proc.itens) {
        const rubrica = item.rubrica;
        if (!rubrica) continue;
        if (rubrica.codigoSistema === 'IRT') {
          totalIrt += Number(item.valor);
        }
        if (rubrica.codigoSistema === 'BASE_IRT') {
          totalSujeito += Number(item.valor);
        }
      }
    }

    // Buscar escalões da tabela IRT vigente
    const tabelaIrt = await this.prisma.rhTabelaIRT.findFirst({
      where: {
        empresaId: filtro.empresaId,
        vigenteDesde: { lte: datas.lt },
        OR: [{ vigenteAte: null }, { vigenteAte: { gte: datas.gte } }],
      },
      include: { escaloes: { orderBy: { ordem: 'asc' } } },
    });

    const porEscaloesDetalhado = tabelaIrt?.escaloes.map((e) => ({
      escalão: e.ordem,
      de: Number(e.rendimentoDe),
      ate: e.rendimentoAte ? Number(e.rendimentoAte) : null,
      taxa: Number(e.taxa),
      parcelaFixa: Number(e.parcelaFixa),
      base: 0,
      imposto: 0,
    })) || [];

    const resultado: ResumoIrtDto = {
      periodo: { de: filtro.periodo.de.toISOString().split('T')[0], ate: filtro.periodo.ate.toISOString().split('T')[0] },
      totalSujeito,
      totalIrt,
      porEscaloes: porEscaloesDetalhado,
    };

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(resultado, false) as unknown as ResumoIrtDto;
    }
    return resultado;
  }

  /**
   * Resumo INSS (contribuições).
   * Respeita `podeVerSalarios` — se false, remove valores monetários.
   */
  async resumoInss(filtro: FiltroRelatorio): Promise<ResumoInssDto> {
    const podeVerSalarios = filtro.podeVerSalarios ?? false;
    const datas = filtroData(filtro.periodo);

    // Buscar processamentos no período
    const processamentos = await this.prisma.rhProcessamento.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        tipo: 'VENCIMENTO',
        estado: 'PROCESSADO',
        dataProcessamento: {
          gte: datas.gte,
          lte: datas.lt,
        },
      },
      include: {
        itens: {
          where: { rubrica: { codigoSistema: { in: ['INSS_EMPRESA', 'INSS_FUNCIONARIO', 'BASE_INSS'] } } },
          include: { rubrica: true },
        },
      },
    });

    let totalRemuneracoes = 0;
    let inssEmpresa = 0;
    let inssFuncionario = 0;

    for (const proc of processamentos) {
      for (const item of proc.itens) {
        const rubrica = item.rubrica;
        if (!rubrica) continue;
        if (rubrica.codigoSistema === 'BASE_INSS') {
          totalRemuneracoes += Number(item.valor);
        } else if (rubrica.codigoSistema === 'INSS_EMPRESA') {
          inssEmpresa += Number(item.valor);
        } else if (rubrica.codigoSistema === 'INSS_FUNCIONARIO') {
          inssFuncionario += Number(item.valor);
        }
      }
    }

    // Buscar parâmetros INSS (faixas) via RhParametroFiscal
    const parametrosInss = await this.prisma.rhParametroFiscal.findMany({
      where: {
        empresaId: filtro.empresaId,
        chave: { startsWith: 'INSS_' },
        vigenteDesde: { lte: datas.lt },
        OR: [{ vigenteAte: null }, { vigenteAte: { gte: datas.gte } }],
      },
      orderBy: { chave: 'asc' },
    });

    const porFaixas = parametrosInss.map((_p) => ({
      de: 0,
      ate: null,
      taxa: 0,
      base: 0,
      contribEmpresa: 0,
      contribFuncionario: 0,
    }));

    const resultado: ResumoInssDto = {
      periodo: { de: filtro.periodo.de.toISOString().split('T')[0], ate: filtro.periodo.ate.toISOString().split('T')[0] },
      totalRemuneracoes,
      inssEmpresa,
      inssFuncionario,
      totalInss: inssEmpresa + inssFuncionario,
      porFaixas,
    };

    if (!podeVerSalarios) {
      return sanitizarRespostaSemSalarios(resultado, false) as unknown as ResumoInssDto;
    }
    return resultado;
  }

  /**
   * Mapa de férias por funcionário.
   * Respeita `podeVerSalarios` — se false, remove `subsidioFerias`.
   */
  async mapaFerias(filtro: FiltroRelatorio): Promise<LinhaMapaFeriasDto[]> {
    const podeVerSalarios = filtro.podeVerSalarios ?? false;
    const ano = new Date(filtro.periodo.de).getFullYear();

    const saldos = await this.prisma.rhFeriasSaldo.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        ano,
      },
      include: {
        funcionario: {
          select: { id: true, codigo: true, nome: true, departamento: { select: { nome: true } } },
        },
      },
    });

    // Buscar marcações de férias no ano
    const marcacoes = await this.prisma.rhMarcacaoFerias.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        ano,
        estado: { in: ['APROVADA', 'GOZADA'] },
      },
      include: { funcionario: { select: { id: true } } },
    });

    // Buscar subsídios de férias processados
    const subsidioFerias = await this.prisma.rhProcessamento.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        tipo: 'SUBSIDIO_FERIAS',
        estado: 'PROCESSADO',
        periodo: { ano },
      },
      include: {
        itens: {
          where: { rubrica: { codigoSistema: 'SUBSIDIO_FERIAS' } },
          include: { rubrica: true },
        },
      },
    });

    const resultado: LinhaMapaFeriasDto[] = [];

    for (const saldo of saldos) {
      const marcacoesFunc = marcacoes.filter((m) => m.funcionarioId === saldo.funcionarioId);
      const diasMarcados = marcacoesFunc.reduce((s, m) => s + Number(m.dias), 0);
      const diasGozados = marcacoesFunc.filter((m) => m.estado === 'GOZADA').reduce((s, m) => s + Number(m.dias), 0);

      const subsidio = subsidioFerias.find((s) => s.funcionarioId === saldo.funcionarioId);
      let valorSubsidio = 0;
      let subsidioPago = false;

      if (subsidio) {
        const item = subsidio.itens.find((i) => i.rubrica?.codigoSistema === 'SUBSIDIO_FERIAS');
        if (item) {
          valorSubsidio = Number(item.valor);
          subsidioPago = true;
        }
      }

      const diasSaldo = Number(saldo.diasDireito) + Number(saldo.diasTransitados) - Number(saldo.diasMarcados) - Number(saldo.diasGozados);

      resultado.push({
        funcionarioId: saldo.funcionarioId,
        codigo: saldo.funcionario.codigo,
        nome: saldo.funcionario.nome,
        departamento: saldo.funcionario.departamento?.nome || '',
        ano,
        diasDireito: Number(saldo.diasDireito),
        diasMarcados: Number(saldo.diasMarcados) + diasMarcados,
        diasGozados: Number(saldo.diasGozados) + diasGozados,
        saldo: diasSaldo,
        subsidioFerias: valorSubsidio,
        subsidioFeriasPago: subsidioPago,
      });
    }

    if (!podeVerSalarios) {
      return sanitizarListaSemSalarios(resultado, false) as unknown as LinhaMapaFeriasDto[];
    }
    return resultado;
  }

  /**
   * Mapa de ausências por funcionário.
   */
  async mapaAusencias(filtro: FiltroRelatorio): Promise<LinhaMapaAusenciasDto[]> {
    const datas = filtroData(filtro.periodo);

    const ausencias = await this.prisma.rhAusencia.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        dataInicio: { lte: datas.lt },
        dataFim: { gte: datas.gte },
      },
      include: {
        funcionario: { select: { id: true, codigo: true, nome: true, departamento: { select: { nome: true } } } },
        tipo: true,
      },
    });

    return ausencias.map((a) => ({
      funcionarioId: a.funcionarioId,
      codigo: a.funcionario.codigo,
      nome: a.funcionario.nome,
      departamento: a.funcionario.departamento?.nome || '',
      tipo: a.tipo.codigo,
      dataInicio: a.dataInicio.toISOString().split('T')[0],
      dataFim: a.dataFim.toISOString().split('T')[0],
      dias: Number(a.dias),
      horas: a.horas ? Number(a.horas) : null,
      estado: a.estado,
      justificativa: a.observacao || null,
    }));
  }

  /**
   * Dívidas em aberto (processos de dívida com saldo > 0).
   * Respeita `podeVerSalarios` — se false, remove valores monetários.
   */
  async dividasAbertas(filtro: FiltroRelatorio): Promise<LinhaDividasAbertasDto[]> {
    const podeVerSalarios = filtro.podeVerSalarios ?? false;

    const processos = await this.prisma.rhProcessoDivida.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        estado: { in: ['ATIVA', 'SUSPENSA'] },
        saldo: { gt: 0 },
      },
      include: {
        funcionario: { select: { id: true, codigo: true, nome: true } },
        prestacoes: {
          where: { estado: 'PENDENTE' },
          orderBy: { numero: 'asc' },
          take: 1,
        },
      },
    });

    const resultado = processos.map((p) => ({
      funcionarioId: p.funcionarioId,
      codigo: p.funcionario.codigo,
      nome: p.funcionario.nome,
      processoId: p.id,
      tipo: p.tipo,
      valorOriginal: Number(p.valorTotal),
      valorPago: Number(p.valorTotal) - Number(p.saldo),
      saldo: Number(p.saldo),
      proximaPrestacao: p.prestacoes[0] ? Number(p.prestacoes[0].valor) : null,
      dataProximaPrestacao: p.prestacoes[0] ? new Date(p.prestacoes[0].ano, p.prestacoes[0].mes - 1, 1).toISOString().split('T')[0] : null,
    }));

    if (!podeVerSalarios) {
      return sanitizarListaSemSalarios(resultado, false) as unknown as LinhaDividasAbertasDto[];
    }
    return resultado;
  }

  /**
   * Custo por departamento.
   * Respeita `podeVerSalarios` — se false, remove valores monetários.
   */
  async custoDepartamento(filtro: FiltroRelatorio): Promise<LinhaCustoDepartamentoDto[]> {
    const podeVerSalarios = filtro.podeVerSalarios ?? false;
    const datas = filtroData(filtro.periodo);

    // Buscar processamentos de vencimento no período
    const processamentos = await this.prisma.rhProcessamento.findMany({
      where: {
        funcionario: { empresaId: filtro.empresaId },
        tipo: 'VENCIMENTO',
        estado: 'PROCESSADO',
        dataProcessamento: {
          gte: datas.gte,
          lte: datas.lt,
        },
      },
      include: {
        funcionario: {
          select: { id: true, departamento: { select: { nome: true } } },
        },
        itens: {
          include: {
            rubrica: true,
          },
        },
      },
    });

    const mapa: Map<string, LinhaCustoDepartamentoDto> = new Map<string, LinhaCustoDepartamentoDto>();

    for (const proc of processamentos) {
      const dept = proc.funcionario?.departamento?.nome || 'Sem Departamento';
      if (!mapa.has(dept)) {
        mapa.set(dept, {
          departamento: dept,
          totalFuncionarios: 0,
          custoSalarios: 0,
          custoInss: 0,
          custoIRT: 0,
          custoFerias: 0,
          custoSubsidioNatal: 0,
          custoOutros: 0,
          custoTotal: 0,
          mediaPorFuncionario: 0,
        });
      }

      const deptData = mapa.get(dept)!;

      for (const item of proc.itens) {
        const valor = Number(item.valor);
        const rubrica = item.rubrica;
        if (!rubrica) continue;
        const codigoSistema = rubrica.codigoSistema || '';
        switch (codigoSistema) {
          case 'SALARIO_BASE':
            deptData.custoSalarios += valor;
            break;
          case 'INSS_EMPRESA':
            deptData.custoInss += valor;
            break;
          case 'INSS_FUNCIONARIO':
            // já incluído no salário bruto
            break;
          case 'IRT':
            deptData.custoIRT += valor;
            break;
          case 'SUBSIDIO_FERIAS':
            deptData.custoFerias += valor;
            break;
          case 'SUBSIDIO_NATAL':
            deptData.custoSubsidioNatal += valor;
            break;
          default:
            deptData.custoOutros += valor;
        }
      }
    }

    // Calcular totais e médias - contar funcionários únicos por departamento
    const funcionariosPorDept = new Map<string, Set<string>>();
    const processamentos2 = await this.prisma.rhProcessamento.findMany({
      where: { 
        funcionario: { empresaId: filtro.empresaId },
        tipo: 'VENCIMENTO', 
        estado: 'PROCESSADO',
        dataProcessamento: {
          gte: datas.gte,
          lte: datas.lt,
        },
      },
      select: { funcionarioId: true, funcionario: { select: { departamento: { select: { nome: true } } } } },
    });

    for (const proc of processamentos2) {
      const dept = proc.funcionario?.departamento?.nome || 'Sem Departamento';
      if (!funcionariosPorDept.has(dept)) funcionariosPorDept.set(dept, new Set());
      funcionariosPorDept.get(dept)!.add(proc.funcionarioId);
    }

    const resultado: LinhaCustoDepartamentoDto[] = [];
    for (const [dept, data] of mapa.entries()) {
      const totalFunc = funcionariosPorDept.get(dept)?.size || 1;
      const custoTotal = data.custoSalarios + data.custoInss + data.custoIRT + data.custoFerias + data.custoSubsidioNatal + data.custoOutros;
      resultado.push({
        ...data,
        totalFuncionarios: totalFunc,
        custoTotal,
        mediaPorFuncionario: custoTotal / totalFunc,
      });
    }

    if (!podeVerSalarios) {
      return sanitizarListaSemSalarios(resultado, false) as unknown as LinhaCustoDepartamentoDto[];
    }
    return resultado;
  }
}
export const relatoriosService = new RelatoriosService();