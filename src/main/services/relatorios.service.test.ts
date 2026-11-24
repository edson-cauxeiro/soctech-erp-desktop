/**
 * @file relatorios.service.test.ts
 * @description Testes do serviço de relatórios analíticos (REL-01).
 *
 * O alvo são as conversões que o TypeScript faz a seguir ao SQL, porque é aí
 * que os erros ficam escondidos: um `Decimal` atravessa o IPC como string e
 * parte a escala de um gráfico; uma nota de crédito somada em vez de subtraída
 * dá um número que parece certo e não é; e a dívida de uma fatura paga a 10%
 * não se lê a partir do rótulo `parcial`.
 *
 * As agregações em si são trabalho do Prisma e do PostgreSQL. O que se fixa
 * aqui é a aritmética e as decisões de negócio aplicadas aos resultados.
 */

import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { RelatoriosService, type FiltroRelatorio } from './relatorios.service';

/**
 * Devolve as respostas de `$queryRaw` pela ordem em que o serviço as pede.
 *
 * O `RelatoriosService` faz várias consultas e cada uma consome a resposta
 * seguinte da fila. Não interessa queSQL é: o que se testa é o que o serviço
 * faz com as linhas que o PostgreSQL devolveu.
 */
function mockSql(porOrdem: unknown[][]) {
  let indice = 0;
  return {
    $queryRaw: vi.fn(async () => porOrdem[indice++] ?? []),
  };
}

const filtro: FiltroRelatorio = {
  empresaId: 'empresa_1',
  periodo: { de: new Date('2026-01-01'), ate: new Date('2026-12-31') },
};

/** O que o PostgreSQL devolveria para uma coluna `numeric`. */
type DecimalLike = number | string | Prisma.Decimal;

/** `NULL` na soma do SQL é zero, não `null`. */
function decimal(valor: DecimalLike | undefined): Prisma.Decimal {
  return new Prisma.Decimal(valor ?? 0);
}

describe('RelatoriosService — IVA por taxa', () => {
  it('separa a base a partir do valor com IVA já incluído', async () => {
    // `total_linha` é o valor *com* IVA: 123 € a 23% são 100 € de base e 23 €
    // de IVA. Somar 23% a 123 daria 28,29 de IVA — o erro que este teste
    // existe para apanhar.
    const svc = new RelatoriosService(
      mockSql([[{ taxa: new Prisma.Decimal(23), liquido: new Prisma.Decimal(123) }]]) as never
    );
    const [linha] = await svc.ivaPorTaxa(filtro);

    expect(linha.base).toBe(100);
    expect(linha.iva).toBe(23);
    expect(linha.liquido).toBe(123);
    // A soma tem de fechar, senão o mapa de taxas não bate com o documento.
    expect(linha.base + linha.iva).toBeCloseTo(linha.liquido, 2);
  });

  it('trata taxa 0 sem divisão por zero', async () => {
    const svc = new RelatoriosService(
      mockSql([[{ taxa: new Prisma.Decimal(0), liquido: new Prisma.Decimal(500) }]]) as never
    );
    const [linha] = await svc.ivaPorTaxa(filtro);

    expect(linha.base).toBe(500);
    expect(linha.iva).toBe(0);
  });

  it('devolve lista vazia quando não há documentos no período', async () => {
    const svc = new RelatoriosService(mockSql([[]]) as never);
    expect(await svc.ivaPorTaxa(filtro)).toEqual([]);
  });

  it('arredonda a duas casas os valores monetários', async () => {
    // 3,33 € tem de ser 3,33 e não 3,3333… a baralhar o gráfico. Com 23%, a base
    // arredondada é 2,71 e o IVA a diferença: 0,62.
    const svc = new RelatoriosService(
      mockSql([[{ taxa: new Prisma.Decimal(23), liquido: new Prisma.Decimal(3.33) }]]) as never
    );
    const [linha] = await svc.ivaPorTaxa(filtro);

    expect(linha.liquido).toBe(3.33);
    expect(linha.base).toBe(2.71);
  });
});

describe('RelatoriosService — dívida de clientes', () => {
  it('calcula a dívida a partir do pago e não do estado de pagamento', async () => {
    // Uma fatura paga a 2850 € em 344850 € facturados tem 342000 € em dívida.
    // Ler o rótulo `parcial` como "não paga" daria 344850 — o total, não o
    // que falta.
    const svc = new RelatoriosService(
      mockSql([
        [
          {
            cliente_id: 'cli_1',
            nome: 'Cliente Final',
            faturas: 2n,
            total: new Prisma.Decimal(344850),
            pago: new Prisma.Decimal(2850),
          },
        ],
      ]) as never
    );
    const [linha] = await svc.topClientes(filtro);

    expect(linha.total).toBe(344850);
    expect(linha.totalPago).toBe(2850);
    expect(linha.emDivida).toBe(342000);
    expect(linha.faturas).toBe(2);
  });

  it('não produz dívida negativa quando o cliente tem adiantamento', async () => {
    // Dinheiro recebido antes de haver fatura. Sem o piso, a dívida ficaria
    // negativa e o relatório mostrava um cliente a dever dinheiro à empresa.
    const svc = new RelatoriosService(
      mockSql([
        [
          {
            cliente_id: 'cli_2',
            nome: 'Cliente com Adiantamento',
            faturas: 1n,
            total: new Prisma.Decimal(100),
            pago: new Prisma.Decimal(250),
          },
        ],
      ]) as never
    );
    const [linha] = await svc.topClientes(filtro);

    expect(linha.emDivida).toBe(0);
    // O valor pago continua a ser o que entrou, para a dívida não desaparecer.
    expect(linha.totalPago).toBe(250);
  });
});

describe('RelatoriosService — sugestão de encomenda', () => {
  async function comStockBaixo(linha: Record<string, unknown>) {
    const svc = new RelatoriosService(mockSql([[linha]]) as never);
    return (await svc.stockBaixo())[0];
  }

  const base = {
    artigo_id: 'art_1',
    codigo: 'ART-1',
    descricao: 'Teclado',
    stock_minimo: new Prisma.Decimal(10),
    ponto_encomenda: new Prisma.Decimal(50),
  };

  it('repor até ao ponto de encomenda quando está definido', async () => {
    const resultado = await comStockBaixo({ ...base, stock_atual: new Prisma.Decimal(4) });
    expect(resultado.stockAtual).toBe(4);
    expect(resultado.suggestaoEncomenda).toBe(46);
  });

  it('repor até ao dobro do mínimo quando não há ponto de encomenda', async () => {
    const resultado = await comStockBaixo({
      ...base,
      ponto_encomenda: new Prisma.Decimal(0),
      stock_atual: new Prisma.Decimal(3),
    });
    expect(resultado.suggestaoEncomenda).toBe(17);
  });

  it('nunca sugere zero nem quantidade negativa em rutura', async () => {
    const resultado = await comStockBaixo({
      ...base,
      ponto_encomenda: new Prisma.Decimal(0),
      stock_atual: new Prisma.Decimal(-8),
    });
    // Stock negativo é rutura. A encomenda tem de compensar o negativo mais o
    // mínimo; sugerir 0 deixaria o artigo parado.
    expect(resultado.stockAtual).toBe(-8);
    expect(resultado.suggestaoEncomenda).toBe(28);
  });
});

describe('RelatoriosService — período de datas', () => {
  it('inclui o dia final do período', async () => {
    // `ate` chega como a meia-noite do dia 31. Usá-la diretamente como limite
    // superior excluiria as vendas desse dia inteiro — o bug clássico de um
    // relatório a que "faltam as vendas do dia 31".
    const mock = { $queryRaw: vi.fn(async () => []) };
    const svc = new RelatoriosService(mock as never);

    await svc.vendasPorMes({
      empresaId: 'empresa_1',
      periodo: { de: new Date('2026-01-01'), ate: new Date('2026-03-31') },
    });

    // Os limites são meias-noites *locais*, por isso se comparam os
    // componentes de data e não a representação UTC, que muda de hora com o
    // fuso da máquina e faria o teste passar só em metade dos fusos.
    const sql = JSON.stringify(mock.$queryRaw.mock.calls[0]);
    const limites = [...sql.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)].map((m) => m[0]);
    expect(limites.length).toBeGreaterThanOrEqual(2);

    const paraLocal = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };

    expect(paraLocal(limites[0])).toBe('2026-1-1');
    // O limite superior é o dia seguinte, para o dia 31 entrar por inteiro.
    expect(paraLocal(limites[1])).toBe('2026-4-1');
  });

  it('não deixa o fuso da máquina deslocar o dia pedido', async () => {
    // `new Date('2026-01-01')` é meia-noite UTC, ou seja o dia anterior às
    // 23:00 em Luanda. Reconstruir o dia a partir dos componentes UTC dá o dia
    // 1 local, que é o que o utilizador pediu ao pedir "janeiro de 2026".
    const mock = { $queryRaw: vi.fn(async () => []) };
    const svc = new RelatoriosService(mock as never);

    await svc.vendasPorMes({
      empresaId: 'empresa_1',
      periodo: { de: new Date('2026-01-01'), ate: new Date('2026-01-31') },
    });

    const sql = JSON.stringify(mock.$queryRaw.mock.calls[0]);
    const inicio = new Date([...sql.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)][0][0]);

    expect(inicio.getFullYear()).toBe(2026);
    expect(inicio.getMonth()).toBe(0);
    expect(inicio.getDate()).toBe(1);
  });
});

describe('RelatoriosService — vendas por mês', () => {
  it('devolve o total e a quantidade por mês sem arredondar a média', async () => {
    const svc = new RelatoriosService(
      mockSql([
        [
          { mes: '2026-01', total: new Prisma.Decimal(1000), quantidade: 3n },
          { mes: '2026-02', total: new Prisma.Decimal(2000), quantidade: 4n },
        ],
      ]) as never
    );

    const series = await svc.vendasPorMes(filtro);
    expect(series).toEqual([
      { mes: '2026-01', total: 1000, quantidade: 3 },
      { mes: '2026-02', total: 2000, quantidade: 4 },
    ]);
  });

  it('converte a contagem do PostgreSQL de bigint para número', async () => {
    // O PostgreSQL devolve `COUNT(*)` como bigint. Atravessar o IPC como
    // bigint não é serializável e o gráfico recebia `{ low, high }`.
    const svc = new RelatoriosService(
      mockSql([[{ mes: '2026-01', total: new Prisma.Decimal(1), quantidade: 42n }]]) as never
    );

    const [serie] = await svc.vendasPorMes(filtro);
    expect(typeof serie.quantidade).toBe('number');
    expect(serie.quantidade).toBe(42);
  });
});

describe('RelatoriosService — resumo executivo', () => {
  /**
   * Prisma stub do `resumoExecutivo`.
   *
   * O serviço pede as agregações em paralelo mas sempre pela mesma ordem, por
   * isso um mapa por operação é mais claro do que uma fila: o que muda quando
   * se acrescenta uma consulta a meio fica visível.
   */
  function mockResumo(opcoes: {
    vendas?: { total: DecimalLike; count: number };
    creditos?: { total: DecimalLike };
    compras?: { total: DecimalLike };
    custo?: DecimalLike;
    iva?: DecimalLike;
    clientes?: unknown[];
  }) {
    return {
      faturaVenda: {
        aggregate: vi.fn(async (args: unknown) => {
          // As notas de crédito são o único `aggregate` que filtra por
          // `tipo: 'nota_credito'`; as vendas usam `tipo: { in: [...] }`.
          const filtro = (args as { where: { tipo?: unknown } }).where.tipo;
          if (filtro === 'nota_credito') {
            return { _sum: { totalLiquido: decimal(opcoes.creditos?.total) } };
          }
          return {
            _sum: { totalLiquido: decimal(opcoes.vendas?.total) },
            _count: { _all: opcoes.vendas?.count ?? 0 },
          };
        }),
        groupBy: vi.fn(async () => opcoes.clientes ?? []),
      },
      faturaCompra: {
        aggregate: vi.fn(async () => ({ _sum: { totalLiquido: decimal(opcoes.compras?.total) } })),
      },
      $queryRaw: vi.fn(async () => [
        // As duas consultas brutas do resumo são o IVA e o custo das vendas;
        // devolvem as duas colunas de cada vez para não depender da ordem.
        { iva: decimal(opcoes.iva), custo: decimal(opcoes.custo) },
      ]),
    } as never;
  }

  it('desconta as notas de crédito às vendas', async () => {
    const svc = new RelatoriosService(
      mockResumo({ vendas: { total: 1000, count: 2 }, creditos: { total: 300 } }) as never
    );

    const resumo = await svc.resumoExecutivo(filtro);

    expect(resumo.totalVendas).toBe(700);
    // O total das notas de crédito continua visível para o cartão mostrar
    // "das quais 300 em notas de crédito".
    expect(resumo.totalNotasCredito).toBe(300);
  });

  it('mantém a receita, o custo e o gráfico todos líquidos', async () => {
    // Receita líquida a um custo líquido. Com a receita bruta, a margem bruta
    // ficava inflada por tudo o que tinha sido devolvido.
    const svc = new RelatoriosService(
      mockResumo({
        vendas: { total: 1000, count: 2 },
        creditos: { total: 300 },
        custo: 400,
      }) as never
    );

    const resumo = await svc.resumoExecutivo(filtro);

    expect(resumo.margemBruta).toBe(300);
  });

  it('conta uma nota de crédito como zero documentos de venda', async () => {
    const svc = new RelatoriosService(
      mockResumo({ vendas: { total: 1000, count: 2 }, creditos: { total: 300 } }) as never
    );

    const resumo = await svc.resumoExecutivo(filtro);

    expect(resumo.numeroFaturas).toBe(2);
  });

  it('trata um período sem vendas e sem créditos', async () => {
    const svc = new RelatoriosService(mockResumo({}) as never);

    const resumo = await svc.resumoExecutivo(filtro);

    expect(resumo.totalVendas).toBe(0);
    expect(resumo.margemBrutaPercentagem).toBe(0);
  });
});

describe('RelatoriosService — fluxo de tesouraria', () => {
  it('calcula o líquido a partir das entradas e saídas do mês', async () => {
    const svc = new RelatoriosService(
      mockSql([
        [
          {
            mes: new Date('2026-03-01T00:00:00Z'),
            entradas: new Prisma.Decimal(5000),
            saidas: new Prisma.Decimal(1250.5),
          },
        ],
      ]) as never
    );

    const [linha] = await svc.fluxoTesourariaPorMes(filtro);
    expect(linha.entradas).toBe(5000);
    expect(linha.saidas).toBe(1250.5);
    expect(linha.liquido).toBe(3749.5);
  });
});