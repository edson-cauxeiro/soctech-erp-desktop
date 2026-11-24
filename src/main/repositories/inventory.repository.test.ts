/**
 * @file inventory.repository.test.ts
 * @description Testes do acesso a dados de saldo de stock (EPIC 2, TASK-015).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { EstoqueRepository } from './inventory.repository';
import { BusinessRuleError } from '../utils/errors';

describe('EstoqueRepository', () => {
  let mockPrisma: any;
  let repo: EstoqueRepository;

  const posicao = {
    artigoId: 'art-1',
    armazemId: 'arm-1',
    localizacaoId: null,
    loteId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      estoque: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        aggregate: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };
    repo = new EstoqueRepository(mockPrisma);
  });

  describe('projeção das leituras', () => {
    it('traz os escalares de stock, não só as relações', async () => {
      // Regressão: o `select` listava apenas relações, e uma leitura de stock
      // devolvia artigo, armazém e lote sem qualquer quantidade — impossível
      // de somar ou de mostrar. O `id` também faltava, portanto nem era
      // possível chamar `addQuantity` sobre o que a leitura devolveu.
      mockPrisma.estoque.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1');

      const { select } = mockPrisma.estoque.findMany.mock.calls[0][0];
      for (const campo of ['id', 'quantidade', 'quantidadeReservada', 'artigoId', 'armazemId']) {
        expect(select[campo]).toBe(true);
      }
    });
  });

  describe('findByProduct', () => {
    it('lê as posições de um artigo', async () => {
      mockPrisma.estoque.findMany.mockResolvedValue([]);

      await repo.findByProduct('art-1');

      const { where } = mockPrisma.estoque.findMany.mock.calls[0][0];
      expect(where.artigoId).toBe('art-1');
    });
  });

  describe('posicaoWhere', () => {
    it('normaliza localizacao e lote ausentes para null, não undefined', async () => {
      // O índice único é UNIQUE (..., COALESCE(localizacao_id,''), COALESCE(lote_id,'')).
      // `undefined` e `null` não são equivalentes nessa cláusula.
      mockPrisma.estoque.findFirst.mockResolvedValue(null);

      await repo.findByPosition({ artigoId: 'a', armazemId: 'b' });

      expect(mockPrisma.estoque.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            artigoId: 'a',
            armazemId: 'b',
            localizacaoId: null,
            loteId: null,
          },
        })
      );
    });
  });

  describe('findOrCreateByPosition', () => {
    it('devolve a posição existente sem criar', async () => {
      const existente = { id: 'e1', quantidade: 5 };
      mockPrisma.estoque.findFirst.mockResolvedValue(existente);

      const resultado = await repo.findOrCreateByPosition(posicao);

      expect(resultado).toBe(existente);
      expect(mockPrisma.estoque.create).not.toHaveBeenCalled();
    });

    it('cria quando não existe', async () => {
      mockPrisma.estoque.findFirst.mockResolvedValue(null);
      mockPrisma.estoque.create.mockResolvedValue({ id: 'nova', quantidade: 0 });

      const resultado = await repo.findOrCreateByPosition(posicao, { custoUnitario: 5 });

      expect(resultado.id).toBe('nova');
      expect(mockPrisma.estoque.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ artigoId: 'art-1', armazemId: 'arm-1', custoUnitario: 5 }),
        })
      );
    });

    it('quando outra transacção cria a mesma posição, devolve a vencedora em vez de propagar o erro', async () => {
      // findFirst: não existe; create: violação de índice único P2002; findFirst: já existe
      mockPrisma.estoque.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'vencedora', quantidade: 3 });
      mockPrisma.estoque.create.mockRejectedValue({ code: 'P2002' });

      const resultado = await repo.findOrCreateByPosition(posicao);

      expect(resultado.id).toBe('vencedora');
    });

    it('propaga o erro quando não é violação de unicidade', async () => {
      mockPrisma.estoque.findFirst.mockResolvedValue(null);
      mockPrisma.estoque.create.mockRejectedValue({ code: 'P2003' });

      await expect(repo.findOrCreateByPosition(posicao)).rejects.toEqual({ code: 'P2003' });
    });
  });

  describe('reserve', () => {
    it('rejeita quantidade zero ou negativa antes de tocar na base', async () => {
      await expect(repo.reserve('e1', 0)).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(repo.reserve('e1', -3)).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('faz o UPDATE condicional em SQL, e não ler-depois-escrever', async () => {
      // A verificação "há saldo?" tem de estar na cláusula WHERE do UPDATE.
      // Um findUnique seguido de update deixaria duas reservas concorrentes
      // passar as duas.
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 1n }]);
      mockPrisma.estoque.findUnique.mockResolvedValue({ id: 'e1', quantidadeReservada: 12 });

      await repo.reserve('e1', 10);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.estoque.findUnique).toHaveBeenCalledTimes(1);
    });

    it('levanta BusinessRuleError quando o UPDATE não afectou nenhuma linha', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(repo.reserve('e1', 10)).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(repo.reserve('e1', 10)).rejects.toThrow(/saldo disponível suficiente/i);
    });
  });

  describe('release', () => {
    it('rejeita quantidade zero ou negativa', async () => {
      await expect(repo.release('e1', 0)).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('levanta BusinessRuleError quando não há reserva suficiente', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(repo.release('e1', 5)).rejects.toThrow(/reserva suficiente/i);
    });

    it('devolve a posição actualizada quando a libertação é válida', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 1n }]);
      mockPrisma.estoque.findUnique.mockResolvedValue({ id: 'e1', quantidadeReservada: 2 });

      const resultado = await repo.release('e1', 5);

      expect(resultado.quantidadeReservada).toBe(2);
    });
  });

  describe('availableQuantity', () => {
    it('subtrai a reserva da quantidade em SQL', async () => {
      mockPrisma.estoque.aggregate.mockResolvedValue({
        _sum: {
          quantidade: new Prisma.Decimal(30),
          quantidadeReservada: new Prisma.Decimal(12),
        },
      });

      const resultado = await repo.availableQuantity(posicao);

      expect(resultado.toNumber()).toBe(18);
    });

    it('devolve zero quando não há qualquer posição', async () => {
      mockPrisma.estoque.aggregate.mockResolvedValue({
        _sum: { quantidade: null, quantidadeReservada: null },
      });

      const resultado = await repo.availableQuantity(posicao);

      expect(resultado.toNumber()).toBe(0);
    });
  });

  describe('addQuantity', () => {
    it('converte o incremento para Decimal, para não perder precisão', async () => {
      mockPrisma.estoque.update.mockResolvedValue({ id: 'e1' });

      await repo.addQuantity('e1', 3, 12.5);

      expect(mockPrisma.estoque.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantidade: { increment: expect.any(Prisma.Decimal) },
            custoUnitario: new Prisma.Decimal(12.5),
          }),
        })
      );
    });
  });
});
