/**
 * @file warehouse.repository.test.ts
 * @description Testes do acesso a dados de armazém (EPIC 2, TASK-013).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArmazemRepository } from './warehouse.repository';

describe('ArmazemRepository', () => {
  let mockPrisma: any;
  let repo: ArmazemRepository;

  beforeEach(() => {
    mockPrisma = {
      armazem: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    repo = new ArmazemRepository(mockPrisma);
  });

  describe('findByCodigo', () => {
    it('procura pelo código, sem inventar uma chave composta', async () => {
      // `codigo` deixou de ser @unique global (só existe o índice composto
      // `(empresaId, codigo)`), pelo que `findUnique({ where: { codigo } })`
      // deixou de compilar. Usa-se `findFirst`.
      await repo.findByCodigo('CENTRAL');

      expect(mockPrisma.armazem.findFirst).toHaveBeenCalledWith({
        where: { codigo: 'CENTRAL' },
      });
    });
  });

  describe('findById', () => {
    it('devolve null em vez de propagar NotFound', async () => {
      // O repository não conhece AppError: translation to HTTP é do service.
      mockPrisma.armazem.findUnique.mockResolvedValue(null);

      expect(await repo.findById('inexistente')).toBeNull();
    });
  });

  describe('filtrosWhere', () => {
    it('aplica a pesquisa a `findAll`', async () => {
      await repo.findAll({ search: 'cent' });

      expect(mockPrisma.armazem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ codigo: expect.any(Object) }),
              expect.objectContaining({ designacao: expect.any(Object) }),
            ]),
          }),
        })
      );
    });

    it('aplica a mesma pesquisa a `count`, para o total bater certo com a página', async () => {
      // Regressão: `count` decompunha os filtros e ignorava `search`, pelo que
      // uma pesquisa que devolvia 1 linha anunciava o total de todos os
      // armazéns activos.
      await repo.count({ search: 'cent', ativo: true });

      expect(mockPrisma.armazem.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          ativo: true,
          OR: expect.any(Array),
        }),
      });
    });

    it('não deixa `skip`, `take` nem `orderBy` a vazar para o `where`', async () => {
      await repo.count({ skip: 10, take: 5, orderBy: { codigo: 'desc' } });

      const { where } = mockPrisma.armazem.count.mock.calls[0][0];
      expect(Object.keys(where)).toEqual([]);
    });

    it('omite a condição de `ativo` quando não é pedida', async () => {
      await repo.findAll({});

      expect(mockPrisma.armazem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe('findAll', () => {
    it('ordena por código por omissão, para paginação estável', async () => {
      // Sem um `orderBy` explícito o PostgreSQL não garante a mesma ordem entre
      // páginas, e uma linha pode repetir ou desaparecer.
      await repo.findAll();

      expect(mockPrisma.armazem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { codigo: 'asc' } })
      );
    });

    it('respeita a ordenação pedida', async () => {
      await repo.findAll({ orderBy: { designacao: 'desc' } });

      expect(mockPrisma.armazem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { designacao: 'desc' } })
      );
    });
  });

  describe('deactivate', () => {
    it('desactiva em vez de apagar', async () => {
      // Há stock, movimentos e localizações a apontar para o armazém: um
      // DELETE deixaria linhas órfãs ou falharia no foreign key.
      mockPrisma.armazem.update.mockResolvedValue({ id: 'arm-1', ativo: false });

      const resultado = await repo.deactivate('arm-1');

      expect(resultado.ativo).toBe(false);
      expect(mockPrisma.armazem.update).toHaveBeenCalledWith({
        where: { id: 'arm-1' },
        data: { ativo: false },
      });
      expect(mockPrisma.armazem.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.anything() }) })
      );
    });
  });

  describe('deactivateMany', () => {
    it('delega num único updateMany, em vez de um update por armazém', async () => {
      mockPrisma.armazem.updateMany.mockResolvedValue({ count: 3 });

      const resultado = await repo.deactivateMany(['a', 'b', 'c']);

      expect(resultado).toBe(3);
      expect(mockPrisma.armazem.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('deixa o id e os timestamps para a base', async () => {
      // O tipo `DadosArmazem` omite `id`, `createdAt` e `updatedAt`, e o
      // `data` enviado não os transporta. Aceitar um id do cliente abriria a
      // porta a sobrepor linhas de outra empresa.
      mockPrisma.armazem.create.mockResolvedValue({ id: 'novo' });

      await repo.create({ codigo: 'NOVO', designacao: 'Novo', empresaId: 'emp-1' });

      expect(mockPrisma.armazem.create).toHaveBeenCalledWith({
        data: { codigo: 'NOVO', designacao: 'Novo', empresaId: 'emp-1' },
      });
    });
  });
});
