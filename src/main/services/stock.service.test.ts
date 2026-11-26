/**
 * @file stock.service.test.ts
 * @description Testes unitários para StockService (RN01.2, RN01.3, RN06.1, RN06.2, RN06.3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StockService } from './stock.service';
import { BusinessRuleError } from '../utils/errors';
import { ZodError } from 'zod';

describe('StockService', () => {
  let mockPrisma: any;
  let mockArmazemService: any;
  let service: StockService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', diasAlertaValidade: 90 }),
      },
      movimentoStock: {
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { quantidade: 0 } }),
        groupBy: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      artigo: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      armazem: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      inventarioContagem: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      // TASK-037: a sequência e o lock de concorrência são usados dentro da
      // transacção; aqui o `$transaction` passa o próprio mock, por isso estes
      // campos são acedidos como `tx.sequencia` / `tx.$executeRaw`.
      sequencia: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        findFirstOrThrow: vi.fn().mockResolvedValue({ valor: 1 }),
      },
      lote: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockArmazemService = {
      getDefaultVendasArmazem: vi.fn().mockResolvedValue({ id: 'arm-vendas', codigo: 'ARM-02' }),
      getDefaultComprasArmazem: vi.fn().mockResolvedValue({ id: 'arm-geral', codigo: 'ARM-01' }),
    };

    service = new StockService(mockPrisma, mockArmazemService);
  });

  describe('createMovimento & Regras de Negócio', () => {
    it('deve recusar movimentação física de artigo do tipo serviço (RN01.2)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-srv',
        codigo: 'SRV-01',
        tipo: 'servico',
      });

      await expect(
        service.createMovimento({
          tipo: 'entrada',
          artigoId: 'art-srv',
          quantidade: 5,
          armazemDestinoId: 'arm-geral',
          documentoOrigem: 'TESTE',
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('deve exigir lote se o artigo tiver controlo de lote ativo (RN06.2)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-lote',
        codigo: 'MED-01',
        tipo: 'produto_acabado',
        controloLote: true,
      });

      await expect(
        service.createMovimento({
          tipo: 'entrada',
          artigoId: 'art-lote',
          quantidade: 10,
          armazemDestinoId: 'arm-geral',
          lote: '', // vazio
          documentoOrigem: 'TESTE',
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('deve bloquear saída se o stock em armazém for insuficiente (RN06.1)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
      });

      // Saldo no armazém = 5
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 10 } }) // entradas
        .mockResolvedValueOnce({ _sum: { quantidade: 5 } }); // saídas

      // Tentativa de retirar 8 (disponível é 5)
      await expect(
        service.createMovimento({
          tipo: 'saida',
          artigoId: 'art-prod',
          quantidade: 8,
          armazemOrigemId: 'arm-vendas',
          documentoOrigem: 'TESTE-SAIDA',
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('deve recalcular Custo Médio Ponderado (PMP) na entrada de material (RN01.3)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        precoCustoMedio: 10, // PMP atual = 10€
        controloLote: false,
      });

      // Stock atual = 10 unidades
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 10 } })
        .mockResolvedValueOnce({ _sum: { quantidade: 0 } });

      mockPrisma.movimentoStock.create.mockResolvedValue({
        id: 'mov-1',
        numero: 'MOV-2026/0001',
      });

      // Nova entrada de 10 unidades a 20€
      // Novo PMP esperado: (10*10 + 10*20) / 20 = 300 / 20 = 15€
      await service.createMovimento({
        tipo: 'entrada',
        artigoId: 'art-prod',
        quantidade: 10,
        armazemDestinoId: 'arm-geral',
        custoUnitario: 20,
        documentoOrigem: 'GR 2026/0001',
      });

      expect(mockPrisma.artigo.update).toHaveBeenCalledWith({
        where: { id: 'art-prod' },
        data: { precoCustoMedio: 15 },
      });
    });

    it('tranca o artigo/armazém antes de ler o saldo e numera pela sequência (TASK-037)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
      });
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 10 } }) // entradas
        .mockResolvedValueOnce({ _sum: { quantidade: 2 } }); // saídas → saldo 8
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-1', numero: 'MOV-x' });

      await service.createMovimento({
        tipo: 'saida',
        artigoId: 'art-prod',
        quantidade: 8,
        armazemOrigemId: 'arm-vendas',
        documentoOrigem: 'TASK-037',
      });

      // O lock foi pedido, e antes da primeira agregação que lê o saldo.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.movimentoStock.aggregate.mock.invocationCallOrder[0],
      );

      // O número passou a vir da sequência, não de `count()+1`.
      expect(mockPrisma.sequencia.updateMany).toHaveBeenCalled();
      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ numero: expect.stringMatching(/^MOV-\d{4}\/00001$/) }),
        }),
      );
    });

    it('com transacções serializadas pelo lock, só uma de duas saídas concorrentes passa (TASK-037)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
      });

      // Saldo partilhado, mutável: o `create` debita-o, as saídas lêem-no.
      let saldo = 10;
      mockPrisma.movimentoStock.aggregate.mockImplementation(({ where }: any) => {
        // O saldo apura-se por entradas − saídas; aqui basta que uma das pontas
        // devolva o saldo partilhado e a outra zero, para o resultado ser `saldo`.
        const total = where.armazemDestinoId !== undefined ? saldo : 0;
        return Promise.resolve({ _sum: { quantidade: total } });
      });
      mockPrisma.movimentoStock.create.mockImplementation(({ data }: any) => {
        saldo -= Number(data.quantidade);
        return Promise.resolve({ id: 'mov', numero: data.numero });
      });

      // O advisory lock real serializa por (artigo, armazém); aqui emulamos
      // essa serialização para tornar a corrida determinística.
      let fila = Promise.resolve();
      mockPrisma.$transaction.mockImplementation((cb: any) => {
        const resultado = fila.then(() => cb(mockPrisma));
        fila = resultado.then(
          () => undefined,
          () => undefined,
        );
        return resultado;
      });

      const resultados = await Promise.allSettled([
        service.createMovimento({ tipo: 'saida', artigoId: 'art-prod', quantidade: 8, armazemOrigemId: 'arm-vendas', documentoOrigem: 'A' }),
        service.createMovimento({ tipo: 'saida', artigoId: 'art-prod', quantidade: 8, armazemOrigemId: 'arm-vendas', documentoOrigem: 'B' }),
      ]);

      const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
      const rejeitados = resultados.filter((r) => r.status === 'rejected');
      expect(cumpridos).toHaveLength(1);
      expect(rejeitados).toHaveLength(1);
      expect(rejeitados[0].reason).toBeInstanceOf(BusinessRuleError);
      expect(saldo).toBe(2);
    });
  });

  describe('Apuramento de saldo por armazém e total', () => {
    type MovimentoHistorico = {
      tipo: string;
      quantidade: number;
      origem?: string | null;
      destino?: string | null;
    };

    /**
     * Reproduz o histórico de movimentos aplicando o filtro recebido, de modo a validar
     * os tipos de movimento considerados em cada apuramento e não apenas o resultado final.
     */
    const mockHistorico = (movimentos: MovimentoHistorico[]) => {
      mockPrisma.movimentoStock.aggregate.mockImplementation(({ where }: any) => {
        const tipos: string[] = where.tipo?.in ?? [];
        const chave = where.armazemDestinoId !== undefined ? 'destino' : 'origem';
        const filtro = where[chave === 'destino' ? 'armazemDestinoId' : 'armazemOrigemId'];
        const qualquerArmazem = filtro !== null && typeof filtro === 'object';

        const total = movimentos
          .filter((m) => tipos.includes(m.tipo))
          .filter((m) => (qualquerArmazem ? Boolean(m[chave]) : m[chave] === filtro))
          .reduce((acc, m) => acc + m.quantidade, 0);

        return Promise.resolve({ _sum: { quantidade: total } });
      });
    };

    it('deve contar uma entrada com origem e destino idênticos no saldo do armazém (regressão)', async () => {
      // Uma entrada não consome armazém de origem. Se fosse contada nos dois sentidos,
      // anular-se-ia a zero e uma reposição de stock não teria efeito.
      mockHistorico([{ tipo: 'entrada', quantidade: 10, origem: 'arm-vendas', destino: 'arm-vendas' }]);

      await expect(service.getStockArtigoArmazem('art-prod', 'arm-vendas')).resolves.toBe(10);
    });

    it('não deve creditar o armazém de destino numa saída', async () => {
      mockHistorico([{ tipo: 'saida', quantidade: 5, origem: 'arm-vendas', destino: 'arm-vendas' }]);

      await expect(service.getStockArtigoArmazem('art-prod', 'arm-vendas')).resolves.toBe(-5);
    });

    it('deve debitar a origem e creditar o destino numa transferência', async () => {
      mockHistorico([{ tipo: 'transferencia', quantidade: 5, origem: 'arm-geral', destino: 'arm-vendas' }]);

      await expect(service.getStockArtigoArmazem('art-prod', 'arm-geral')).resolves.toBe(-5);
      await expect(service.getStockArtigoArmazem('art-prod', 'arm-vendas')).resolves.toBe(5);
    });

    it('deve tratar o ajuste de inventário nos dois sentidos', async () => {
      mockHistorico([
        { tipo: 'ajuste', quantidade: 3, destino: 'arm-geral' },
        { tipo: 'ajuste', quantidade: 4, origem: 'arm-geral' },
      ]);

      await expect(service.getStockArtigoArmazem('art-prod', 'arm-geral')).resolves.toBe(-1);
    });

    it('deve ignorar transferências no apuramento do stock total', async () => {
      mockHistorico([
        { tipo: 'entrada', quantidade: 20, destino: 'arm-geral' },
        { tipo: 'saida', quantidade: 5, origem: 'arm-vendas' },
        { tipo: 'transferencia', quantidade: 8, origem: 'arm-vendas', destino: 'arm-geral' },
      ]);

      await expect(service.getStockTotalArtigo('art-prod')).resolves.toBe(15);
    });

    it('deve descontar no stock total o ajuste negativo de inventário', async () => {
      mockHistorico([
        { tipo: 'entrada', quantidade: 20, destino: 'arm-geral' },
        { tipo: 'ajuste', quantidade: 4, origem: 'arm-geral' },
      ]);

      await expect(service.getStockTotalArtigo('art-prod')).resolves.toBe(16);
    });

    it('deve gravar uma entrada sem armazém de origem, mesmo que o cliente o envie (regressão)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
        precoCustoMedio: 0,
      });
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-1', numero: 'MOV-2026/00001' });

      await service.createMovimento({
        tipo: 'entrada',
        artigoId: 'art-prod',
        quantidade: 10,
        armazemOrigemId: 'arm-vendas',
        armazemDestinoId: 'arm-vendas',
        documentoOrigem: 'AJUSTE-MANUAL',
      });

      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ armazemOrigemId: null, armazemDestinoId: 'arm-vendas' }),
        })
      );
    });

    it('deve gravar uma saída sem armazém de destino, mesmo que o cliente o envie', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
        precoCustoMedio: 0,
      });
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 10 } })
        .mockResolvedValueOnce({ _sum: { quantidade: 0 } });
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-2', numero: 'MOV-2026/00002' });

      await service.createMovimento({
        tipo: 'saida',
        artigoId: 'art-prod',
        quantidade: 3,
        armazemOrigemId: 'arm-vendas',
        armazemDestinoId: 'arm-vendas',
        documentoOrigem: 'TESTE-SAIDA',
      });

      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ armazemOrigemId: 'arm-vendas', armazemDestinoId: null }),
        })
      );
    });

    it('deve recusar um ajuste sem qualquer armazém definido', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-prod',
        codigo: 'PROD-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
        precoCustoMedio: 0,
      });

      await expect(
        service.createMovimento({
          tipo: 'ajuste',
          artigoId: 'art-prod',
          quantidade: 2,
          documentoOrigem: 'AJUSTE-SEM-ARMAZEM',
        })
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('transferenciaStock', () => {
    it('deve realizar transferência entre armazéns distintos', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-1',
        codigo: 'ART-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
      });

      // Saldo disponível na origem = 50
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 50 } })
        .mockResolvedValueOnce({ _sum: { quantidade: 0 } });

      mockPrisma.movimentoStock.create.mockResolvedValue({
        id: 'mov-transf',
        tipo: 'transferencia',
        quantidade: 20,
      });

      const res = await service.transferenciaStock({
        artigoId: 'art-1',
        quantidade: 20,
        armazemOrigemId: 'arm-geral',
        armazemDestinoId: 'arm-vendas',
        documentoOrigem: 'TRANSFERENCIA-MANUAL',
      });

      expect(res.id).toBe('mov-transf');
      expect(mockPrisma.movimentoStock.create).toHaveBeenCalled();
    });

    it('deve recusar transferência entre o mesmo armazém', async () => {
      await expect(
        service.transferenciaStock({
          artigoId: 'art-1',
          quantidade: 20,
          armazemOrigemId: 'arm-geral',
          armazemDestinoId: 'arm-geral',
          documentoOrigem: 'TRANSFERENCIA-INVALIDA',
        })
      ).rejects.toBeInstanceOf(ZodError);
      expect(mockPrisma.movimentoStock.create).not.toHaveBeenCalled();
    });

    it('deve bloquear transferência se a origem não tiver saldo disponível', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-1',
        codigo: 'ART-01',
        tipo: 'produto_acabado',
        unidade: 'UN',
        controloLote: false,
      });

      // Saldo disponível na origem = 0 (20 entradas − 20 saídas)
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 20 } })
        .mockResolvedValueOnce({ _sum: { quantidade: 20 } });

      await expect(
        service.transferenciaStock({
          artigoId: 'art-1',
          quantidade: 20,
          armazemOrigemId: 'arm-geral',
          armazemDestinoId: 'arm-vendas',
          documentoOrigem: 'TRANSFERENCIA-SEM-SALDO',
        })
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('fecharInventario (RN06.3)', () => {
    it('deve gerar movimentos de ajuste para reconciliar divergências', async () => {
      mockPrisma.inventarioContagem.findUnique.mockResolvedValue({
        id: 'inv-1',
        numero: 'INV-2026/0001',
        armazemId: 'arm-geral',
        estado: 'em_curso',
        linhas: [
          {
            id: 'l1',
            artigoId: 'art-sobra',
            diferenca: 5, // Sobra de 5 -> Ajuste Entrada
            artigo: { precoCustoMedio: 10 },
          },
          {
            id: 'l2',
            artigoId: 'art-falta',
            diferenca: -3, // Falta de 3 -> Ajuste Saída
            artigo: { precoCustoMedio: 12 },
          },
        ],
      });

      mockPrisma.inventarioContagem.update.mockResolvedValue({
        id: 'inv-1',
        estado: 'fechado',
      });

      await service.fecharInventario('inv-1');

      // Verifica se criou os 2 movimentos de ajuste
      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.inventarioContagem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: { estado: 'fechado' },
        })
      );
    });
  });

  describe('getEstadoStock (painel de alertas)', () => {
    type ArtigoMock = {
      id: string;
      codigo: string;
      descricao: string;
      unidade: string;
      stockMinimo: number;
      stockMaximo: number;
      pontoEncomenda: number;
      precoCustoMedio: number;
    };

    const ARTIGOS: ArtigoMock[] = [
      {
        id: 'art-normal',
        codigo: 'ART-0001',
        descricao: 'Artigo com stock saudável',
        unidade: 'UN',
        stockMinimo: 5,
        stockMaximo: 100,
        pontoEncomenda: 10,
        precoCustoMedio: 10,
      },
      {
        id: 'art-baixo',
        codigo: 'ART-0002',
        descricao: 'Artigo abaixo do mínimo',
        unidade: 'CX',
        stockMinimo: 10,
        stockMaximo: 50,
        pontoEncomenda: 20,
        precoCustoMedio: 25,
      },
      {
        id: 'art-rutura',
        codigo: 'ART-0003',
        descricao: 'Artigo em rutura',
        unidade: 'KG',
        stockMinimo: 2,
        stockMaximo: 40,
        pontoEncomenda: 8,
        precoCustoMedio: 5,
      },
    ];

    /**
     * Reproduz o `where` de pesquisa em SQL (`contains` sobre código/descrição),
     * aplicado pelo serviço antes das agregações.
     */
    const filtrarArtigos = (where: any): ArtigoMock[] => {
      const termo = where?.OR?.[0]?.codigo?.contains;
      if (!termo) return ARTIGOS;
      const t = String(termo).toLowerCase();
      return ARTIGOS.filter(
        (artigo) => artigo.codigo.toLowerCase().includes(t) || artigo.descricao.toLowerCase().includes(t)
      );
    };

    /**
     * Configura o stock por artigo devolvendo as agregações em bulk (groupBy) na ordem
     * entradas/saídas, para reproduzir o comportamento do serviço sem base de dados.
     */
    const mockStockPorArtigo = (entradas: Record<string, number>, saidas: Record<string, number>) => {
      mockPrisma.artigo.findMany.mockImplementation(({ where, skip = 0, take }: any) => {
        let lista = filtrarArtigos(where);
        if (take !== undefined) lista = lista.slice(skip, skip + take);
        return Promise.resolve(lista);
      });
      mockPrisma.artigo.count.mockImplementation(({ where }: any) =>
        Promise.resolve(filtrarArtigos(where).length)
      );
      mockPrisma.movimentoStock.groupBy
        .mockResolvedValueOnce(
          Object.entries(entradas).map(([artigoId, quantidade]) => ({ artigoId, _sum: { quantidade } }))
        )
        .mockResolvedValueOnce(
          Object.entries(saidas).map(([artigoId, quantidade]) => ({ artigoId, _sum: { quantidade } }))
        );
    };

    it('deve devolver o estado de todos os artigos, incluindo os que estão normais', async () => {
      // O painel tem de mostrar as quantidades de todos os artigos, não apenas das violações.
      mockStockPorArtigo(
        { 'art-normal': 40, 'art-baixo': 8, 'art-rutura': 6 },
        { 'art-normal': 0, 'art-baixo': 0, 'art-rutura': 6 }
      );

      const resultado = await service.getEstadoStock();

      expect(resultado.total).toBe(3);
      expect(resultado.items).toHaveLength(3);
      expect(resultado.items.map((linha) => linha.situacao)).toEqual([
        'normal',
        'stock_baixo',
        'rutura',
      ]);
    });

    it('deve calcular o saldo e o valor de inventário de cada artigo', async () => {
      mockStockPorArtigo({ 'art-normal': 40 }, {});

      const { items } = await service.getEstadoStock();

      expect(items[0]).toMatchObject({
        artigoId: 'art-normal',
        codigo: 'ART-0001',
        unidade: 'UN',
        stockAtual: 40,
        stockMinimo: 5,
        pontoEncomenda: 10,
        precoCustoMedio: 10,
        valorTotal: 400,
        situacao: 'normal',
      });
    });

    it('deve devolver apenas as violações quando apenasAlertas estiver activo', async () => {
      mockStockPorArtigo(
        { 'art-normal': 40, 'art-baixo': 8, 'art-rutura': 6 },
        { 'art-rutura': 6 }
      );

      const resultado = await service.getEstadoStock({ apenasAlertas: true });

      expect(resultado.total).toBe(2);
      expect(resultado.items.map((linha) => linha.codigo)).toEqual(['ART-0002', 'ART-0003']);
    });

    it('deve filtrar por código ou descrição, na query de artigos', async () => {
      mockStockPorArtigo({ 'art-normal': 40, 'art-baixo': 8, 'art-rutura': 6 }, {});

      const porCodigo = await service.getEstadoStock({ search: 'art-0002' });
      const porDescricao = await service.getEstadoStock({ search: 'saudável' });

      expect(porCodigo.items.map((linha) => linha.codigo)).toEqual(['ART-0002']);
      expect(porDescricao.items.map((linha) => linha.codigo)).toEqual(['ART-0001']);

      // A pesquisa é resolvida no `where` do SQL, não em memória (TASK-038).
      expect(mockPrisma.artigo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        })
      );
    });

    it('deve filtrar por situação específica', async () => {
      mockStockPorArtigo(
        { 'art-normal': 40, 'art-baixo': 8, 'art-rutura': 0 },
        {}
      );

      const resultado = await service.getEstadoStock({ situacao: 'rutura' });

      expect(resultado.items.map((linha) => linha.codigo)).toEqual(['ART-0003']);
    });

    it('deve paginar mantendo o total real', async () => {
      mockStockPorArtigo({ 'art-normal': 40, 'art-baixo': 8, 'art-rutura': 0 }, {});

      const resultado = await service.getEstadoStock({ skip: 1, take: 1 });

      expect(resultado.total).toBe(3);
      expect(resultado.items).toHaveLength(1);
      expect(resultado.items[0].codigo).toBe('ART-0002');
    });

    it('deve agregar os movimentos em duas consultas, sem uma por artigo', async () => {
      mockStockPorArtigo({ 'art-normal': 40, 'art-baixo': 8, 'art-rutura': 6 }, {});

      await service.getEstadoStock();

      // Duas agregações em bulk (entradas e saídas) para a lista inteira, nunca N+1.
      expect(mockPrisma.movimentoStock.groupBy).toHaveBeenCalledTimes(2);
      expect(mockPrisma.movimentoStock.aggregate).not.toHaveBeenCalled();
    });

    it('deve excluir transferências do saldo, por serem neutras no total', async () => {
      mockStockPorArtigo({ 'art-normal': 40 }, {});

      await service.getEstadoStock();

      const [consultaEntradas, consultaSaidas] = mockPrisma.movimentoStock.groupBy.mock.calls;
      expect(consultaEntradas[0].where.tipo.in).toEqual(['entrada', 'ajuste']);
      expect(consultaSaidas[0].where.tipo.in).toEqual(['saida', 'consumo_producao', 'ajuste']);
    });

    it('deve devolver lista vazia sem artículos, sem falhar', async () => {
      mockPrisma.artigo.findMany.mockResolvedValue([]);
      mockPrisma.movimentoStock.groupBy.mockResolvedValue([]);

      const resultado = await service.getEstadoStock();

      expect(resultado).toEqual({
        items: [],
        total: 0,
        resumo: {
          ruturas: 0,
          stockBaixo: 0,
          artigosComLotesCaducados: 0,
          artigosComLotesProximosCaducar: 0,
          normais: 0,
          valorInventario: 0,
        },
      });
    });
  });

  describe('TASK-038 — performance do caminho legado', () => {
    it('criarInventario calcula o saldo de todas as linhas com dois groupBy (sem N+1)', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', codigo: 'ARM-01' });
      mockPrisma.inventarioContagem.count.mockResolvedValue(0);
      mockPrisma.inventarioContagem.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.movimentoStock.groupBy
        .mockResolvedValueOnce([{ artigoId: 'a1', _sum: { quantidade: 10 } }])
        .mockResolvedValueOnce([{ artigoId: 'a1', _sum: { quantidade: 4 } }]);

      await service.criarInventario({
        data: new Date(),
        armazemId: 'arm-1',
        linhas: [
          { artigoId: 'a1', qtdContada: 8 },
          { artigoId: 'a2', qtdContada: 3 },
        ],
      });

      // Duas agregações agrupadas para a lista inteira, em vez de duas por linha.
      expect(mockPrisma.movimentoStock.groupBy).toHaveBeenCalledTimes(2);
      expect(mockPrisma.movimentoStock.aggregate).not.toHaveBeenCalled();

      const { data } = mockPrisma.inventarioContagem.create.mock.calls[0][0];
      expect(data.linhas.create).toEqual([
        { artigoId: 'a1', qtdSistema: 6, qtdContada: 8, diferenca: 2, lote: null },
        { artigoId: 'a2', qtdSistema: 0, qtdContada: 3, diferenca: 3, lote: null },
      ]);
    });

    it('listInventarios sem filtros mantém o contrato actual (não pagina)', async () => {
      mockPrisma.inventarioContagem.findMany.mockResolvedValue([]);

      await service.listInventarios();

      const argumento = mockPrisma.inventarioContagem.findMany.mock.calls[0][0];
      expect(argumento.skip).toBeUndefined();
      expect(argumento.take).toBeUndefined();
    });

    it('listInventarios aplica skip/take na query', async () => {
      mockPrisma.inventarioContagem.findMany.mockResolvedValue([]);

      await service.listInventarios({ skip: 10, take: 5 });

      expect(mockPrisma.inventarioContagem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it('processarBaixaVenda pré-carrega os artigos e usa uma única transacção', async () => {
      mockPrisma.artigo.findMany.mockResolvedValue([
        { id: 'a1', codigo: 'A1', tipo: 'produto_acabado', unidade: 'UN', controloLote: false, precoCustoMedio: 5 },
        { id: 'srv', codigo: 'SRV', tipo: 'servico', unidade: 'UN', controloLote: false, precoCustoMedio: 0 },
      ]);
      // Saldo do artigo a1: entradas 100 − saídas 0.
      mockPrisma.movimentoStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantidade: 100 } })
        .mockResolvedValueOnce({ _sum: { quantidade: 0 } });
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov' });

      const movimentos = await service.processarBaixaVenda({
        documentoOrigem: 'FT 2026/1',
        linhas: [
          { artigoId: 'a1', quantidade: 2 },
          { artigoId: 'srv', quantidade: 1 },
        ],
      });

      // Nenhum `findUnique` por linha e uma só transacção para toda a venda.
      expect(mockPrisma.artigo.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(movimentos).toHaveLength(1);
    });
  });
});
