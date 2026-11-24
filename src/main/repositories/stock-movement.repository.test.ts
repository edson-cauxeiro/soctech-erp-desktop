/**
 * @file stock-movement.repository.test.ts
 * @description Testes do acesso a dados do livro-razão (EPIC 2, TASK-016).
 *
 * `MovimentoStock` não tem `empresaId`: o tenancy chega por
 * `armazemOrigem`/`armazemDestino`, e o número é único em toda a tabela. Por
 * isso nenhum teste aqui filtra por empresa — esse filtro não existe.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { MovimentoStockRepository } from './stock-movement.repository';

describe('MovimentoStockRepository', () => {
  let mockPrisma: any;
  let repo: MovimentoStockRepository;

  // Datas construídas por componentes em vez de strings ISO: `new Date(s)`
  // é UTC, e a máquina de teste está em UTC+1. Comparar `getHours()` com 23
  // num instante UTC não testaria nada. Com o construtor local, a meia-noite
  // local é mesmo a meia-noite local, em qualquer fuso.
  const inicioJaneiro = new Date(2026, 0, 1, 0, 0, 0, 0);
  const dia15 = new Date(2026, 0, 15, 0, 0, 0, 0);

  beforeEach(() => {
    mockPrisma = {
      movimentoStock: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    repo = new MovimentoStockRepository(mockPrisma);
  });

  describe('projeção das leituras', () => {
    it('traz tipo, quantidade e data, sem os quais não há histórico', async () => {
      // Regressão: o `select` listava apenas relações. Um histórico sem
      // `quantidade` nem `data` não mostra o que entrou nem quando.
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1');

      const { select } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      for (const campo of ['id', 'numero', 'tipo', 'data', 'quantidade']) {
        expect(select[campo]).toBe(true);
      }
    });

    it('não traz o artigo inteiro, para não arrastar a descrição em cada linha', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1');

      const { select } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(select.artigo).toEqual({
        select: { id: true, codigo: true, descricao: true, unidade: true },
      });
    });
  });

  describe('findByNumero', () => {
    it('procura pelo número, que é único em toda a tabela', async () => {
      await repo.findByNumero('MOV-1');

      expect(mockPrisma.movimentoStock.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { numero: 'MOV-1' } })
      );
    });
  });

  describe('intervalo', () => {
    it('alarga uma meia-noite exacta para o fim do dia', async () => {
      // Uma data sem hora significa "o dia todo". Sem o alargamento, um filtro
      // "até 15/01" devolveria zero movimentos, porque 00:00:00 é o primeiro
      // instante do dia e nada mais passaria o limite.
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByDateRange(inicioJaneiro, dia15);

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.data.lte.getDate()).toBe(15);
      expect(where.data.lte.getHours()).toBe(23);
      expect(where.data.lte.getMinutes()).toBe(59);
      expect(where.data.lte.getSeconds()).toBe(59);
      expect(where.data.lte.getMilliseconds()).toBe(999);
    });

    it('não mexe num instante que já tem hora', async () => {
      // Verificar só `getHours() === 23` trataria 23:30 como fim de dia e
      // saltaria para o dia seguinte, devolvendo um dia a mais.
      const fimDeSessao = new Date(2026, 0, 15, 23, 30, 0, 0);
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByDateRange(inicioJaneiro, fimDeSessao);

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.data.lte.getTime()).toBe(fimDeSessao.getTime());
    });

    it('inclui o limite inferior', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByDateRange(inicioJaneiro, dia15);

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.data.gte.getTime()).toBe(inicioJaneiro.getTime());
    });
  });

  describe('findByProduct', () => {
    it('aplica o artigo recebido e não o que vier nos filtros', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1', { loteId: 'lote-9' });

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.artigoId).toBe('art-1');
      // O filtro de lote usa o id, que é a coluna real; `loteNormalizadoId`
      // não existe e o Prisma rejeitaria o `where`.
      expect(where.loteId).toBe('lote-9');
      expect(where.loteNormalizadoId).toBeUndefined();
    });

    it('ordena por data descendente, para os mais recentes primeiro', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1');

      expect(mockPrisma.movimentoStock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { data: 'desc' } })
      );
    });

    it('respeita a ordenação pedida', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1', { orderBy: { numero: 'asc' } });

      expect(mockPrisma.movimentoStock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { numero: 'asc' } })
      );
    });
  });

  describe('findByDateRange', () => {
    it('combina o intervalo com os restantes filtros', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByDateRange(inicioJaneiro, dia15, { artigoId: 'art-1', tipo: 'saida' });

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.artigoId).toBe('art-1');
      expect(where.tipo).toBe('saida');
      expect(where.data.gte).toBeDefined();
    });
  });

  describe('count', () => {
    it('conta com o mesmo where que a lista, e não deixa paginação vazar', async () => {
      mockPrisma.movimentoStock.count.mockResolvedValue(7);

      const resultado = await repo.count({
        artigoId: 'art-1',
        desde: inicioJaneiro,
        skip: 20,
        take: 10,
      });

      expect(resultado).toBe(7);
      const { where } = mockPrisma.movimentoStock.count.mock.calls[0][0];
      expect(where.artigoId).toBe('art-1');
      expect(where.skip).toBeUndefined();
      expect(where.take).toBeUndefined();
    });
  });

  describe('pesquisa', () => {
    it('procura no número, no documento e no lote', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1', { search: 'MOV' });

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.OR).toEqual([
        { numero: { contains: 'MOV', mode: 'insensitive' } },
        { documentoOrigem: { contains: 'MOV', mode: 'insensitive' } },
        { lote: { contains: 'MOV', mode: 'insensitive' } },
      ]);
    });
  });

  describe('create', () => {
    it('grava a quantidade tal como vem, e o sinal fica nos lados', async () => {
      // `quantidade` é sempre positiva. O sinal vem de estar em
      // `armazemDestinoId` ou em `armazemOrigemId`, é o que `verificar_stock.sql`
      // avalia no seu `CASE`, e é o que a migration de backfill assumia. Um
      // service que gravasse a saída já negativa faria o `CASE` subtrair duas
      // vezes.
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-1' });

      await repo.create({
        numero: 'MOV-2',
        tipo: 'saida',
        artigoId: 'art-1',
        armazemOrigemId: 'arm-1',
        documentoOrigem: 'SAIDA-9',
        quantidade: new Prisma.Decimal(5),
      });

      const { data } = mockPrisma.movimentoStock.create.mock.calls[0][0];
      expect(data.quantidade.toNumber()).toBe(5);
      expect(data.armazemOrigemId).toBe('arm-1');
      // Uma saída não tem destino: gravá-lo anularia a saída no cálculo.
      expect(data.armazemDestinoId).toBeUndefined();
    });
  });

  describe('armazemId', () => {
    it('filtra pelos dois lados com OR, sem perder o search', async () => {
      // Um ecrã de histórico de um armazém quer os movimentos que o
      // envolveram. O `OR` de "qualquer lado" tem de entrar em `AND` e não em
      // `where.OR`, que o `search` também escreve — e o segundo a escrever
      // apagaria o primeiro.
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findMany({ armazemId: 'arm-1', search: 'MOV', skip: 0, take: 10 });

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.AND).toEqual([
        { OR: [{ armazemOrigemId: 'arm-1' }, { armazemDestinoId: 'arm-1' }] },
      ]);
      expect(where.OR).toEqual([
        { numero: { contains: 'MOV', mode: 'insensitive' } },
        { documentoOrigem: { contains: 'MOV', mode: 'insensitive' } },
        { lote: { contains: 'MOV', mode: 'insensitive' } },
      ]);
    });

    it('acumula em AND sem descartar o filtro anterior', async () => {
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findMany({ artigoId: 'art-1', armazemId: 'arm-1' });

      const { where } = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(where.artigoId).toBe('art-1');
      expect(where.AND).toHaveLength(1);
    });
  });

  describe('findMany', () => {
    it('lista sem datas, e não com datas extremas inventadas', async () => {
      // `findByDateRange` exige `[desde, ate]`. Passar `new Date(0)` e
      // `new Date()` para significar "todos" transformaria as datas em valores
      // de omissão falsos.
      mockPrisma.movimentoStock.findMany.mockResolvedValue([]);

      await repo.findMany({ artigoId: 'art-1' });

      const consulta = mockPrisma.movimentoStock.findMany.mock.calls[0][0];
      expect(consulta.where.data).toBeUndefined();
      expect(consulta.orderBy).toEqual({ data: 'desc' });
    });
  });
});
