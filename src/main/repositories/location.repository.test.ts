/**
 * @file location.repository.test.ts
 * @description Testes do acesso a dados da estrutura de armazéns (EPIC 2, TASK-014).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalizacaoRepository } from './location.repository';

describe('LocalizacaoRepository', () => {
  let mockPrisma: any;
  let repo: LocalizacaoRepository;

  beforeEach(() => {
    mockPrisma = {
      armazemArea: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
      armazemZona: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
      armazemLocalizacao: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      estoque: { findMany: vi.fn() },
    };
    repo = new LocalizacaoRepository(mockPrisma);
  });

  describe('deactivate', () => {
    it('desactiva em vez de apagar, para não perder o histórico', async () => {
      // parentId tem onDelete: Cascade; um DELETE levaria a localização, os
      // descendentes e o estoque que aponta para eles.
      mockPrisma.armazemLocalizacao.update.mockResolvedValue({ id: 'l1', ativo: false });

      const resultado = await repo.deactivate('l1');

      expect(resultado.ativo).toBe(false);
      expect(mockPrisma.armazemLocalizacao.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { ativo: false },
      });
      expect(mockPrisma.armazemLocalizacao.delete).toBeUndefined();
    });
  });

  describe('descendantIds', () => {
    it('reúne o nó e todos os descendentes por níveis', async () => {
      // Três voltas de travessia mais a consulta final de getDescendants:
      //   1. filhos de [l1]        → l2, l3
      //   2. filhos de [l2, l3]    → l4
      //   3. filhos de [l4]        → nenhum, a travessia acaba
      //   4. consulta final         → o que se quer devolver
      mockPrisma.armazemLocalizacao.findMany
        .mockResolvedValueOnce([{ id: 'l2' }, { id: 'l3' }])
        .mockResolvedValueOnce([{ id: 'l4' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'l4' }]);

      const resultado = await repo.getDescendants('l1');

      expect(resultado.map((l: any) => l.id)).toEqual(['l4']);
      // Quatro chamadas, uma por nível mais a final: sem N+1 sobre os nós.
      expect(mockPrisma.armazemLocalizacao.findMany).toHaveBeenCalledTimes(4);
    });

    it('termina em ciclos em vez de iterar para sempre', async () => {
      // l2 declara l1 como pai e l1 declara l2. O CHECK da base impede o
      // auto-pai, mas não um ciclo de dois nós. Ao reencontrar l1, que já foi
      // recolhido, o identificador não volta a `actuais` e a travessia acaba.
      mockPrisma.armazemLocalizacao.findMany
        .mockResolvedValueOnce([{ id: 'l2' }])   // filhos de l1
        .mockResolvedValueOnce([{ id: 'l1' }])   // filhos de l2: l1 já recolhido
        .mockResolvedValueOnce([{ id: 'l2' }]);  // consulta final de getDescendants

      const resultado = await repo.getDescendants('l1');

      // Duas voltas, não infinitas, apesar do ciclo.
      expect(mockPrisma.armazemLocalizacao.findMany).toHaveBeenCalledTimes(3);
      expect(resultado.map((l: any) => l.id)).toEqual(['l2']);
    });

    it('devolve vazio quando o nó não tem filhos', async () => {
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([]);

      expect(await repo.getDescendants('l1')).toEqual([]);
    });
  });

  describe('getChildren', () => {
    it('pede as raízes quando não há pai, em vez de omitir a condição', async () => {
      await repo.getChildren(null);

      expect(mockPrisma.armazemLocalizacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ parentId: null }) })
      );
    });
  });

  describe('getTree', () => {
    it('encadeia armazém → áreas → zonas → localizações', async () => {
      mockPrisma.armazemArea.findMany.mockResolvedValue([
        { id: 'a1', codigo: 'REC', designacao: 'Recepção' },
      ]);
      mockPrisma.armazemZona.findMany.mockResolvedValue([
        { id: 'z1', areaId: 'a1', codigo: 'PESADOS' },
      ]);
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([
        { id: 'l1', zonaId: 'z1', codigo: 'A01', parentId: null },
        { id: 'l2', zonaId: 'z1', codigo: 'A02', parentId: 'l1' },
      ]);

      const [area] = await repo.getTree('arm-1');

      expect(area.area.codigo).toBe('REC');
      expect(area.zonas).toHaveLength(1);
      // l2 é filho de l1, logo não aparece como raiz da zona
      expect(area.zonas[0].localizacoes).toHaveLength(1);
      expect(area.zonas[0].localizacoes[0].id).toBe('l1');
      expect(area.zonas[0].localizacoes[0].filhos.map((f) => f.id)).toEqual(['l2']);
    });

    it('promove a raiz um nó cujo pai não veio no resultado, em vez de o perder', async () => {
      mockPrisma.armazemArea.findMany.mockResolvedValue([{ id: 'a1', codigo: 'REC' }]);
      mockPrisma.armazemZona.findMany.mockResolvedValue([{ id: 'z1', areaId: 'a1' }]);
      // l2 declara l1 como pai, mas l1 não foi devolvido (filtrado por isPickable)
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([
        { id: 'l2', zonaId: 'z1', codigo: 'A02', parentId: 'l1' },
      ]);

      const [area] = await repo.getTree('arm-1');

      expect(area.zonas[0].localizacoes.map((l) => l.id)).toEqual(['l2']);
    });
  });

  describe('getAvailableLocations', () => {
    it('exclui localizações inactivas e bloqueadas', async () => {
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([]);

      await repo.getAvailableLocations({ apenasDisponiveis: true });

      expect(mockPrisma.armazemLocalizacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: true, bloqueada: false }),
        })
      );
    });

    it('não exclui quem não tem capacidade declarada, porque null é "sem limite"', async () => {
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([
        { id: 'l1', codigo: 'A01', capacidadeQuantidade: null },
        { id: 'l2', codigo: 'A02', capacidadeQuantidade: null },
      ]);

      const resultado = await repo.getAvailableLocations({ quantidadeAEntregar: 100 });

      expect(resultado).toHaveLength(2);
      // Sem volumes para comparar, não há necessidade de ler estoque
      expect(mockPrisma.estoque.findMany).not.toHaveBeenCalled();
    });

    it('exclui quem já não tem capacidade livre para a quantidade pedida', async () => {
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([
        { id: 'cheia', codigo: 'A01', capacidadeQuantidade: 100 },
        { id: 'livre', codigo: 'A02', capacidadeQuantidade: 100 },
      ]);
      mockPrisma.estoque.findMany.mockResolvedValue([
        { localizacaoId: 'cheia', quantidade: 95 },
        { localizacaoId: 'livre', quantidade: 0 },
      ]);

      const resultado = await repo.getAvailableLocations({ quantidadeAEntregar: 20 });

      expect(resultado.map((l: any) => l.id)).toEqual(['livre']);
    });
  });
});
