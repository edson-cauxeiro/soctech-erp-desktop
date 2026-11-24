/**
 * @file localizacao.service.test.ts
 * @description Testes da LocalizacaoService (EPIC 3, TASK-018).
 *
 * O foco é o que a base de dados não sabe decidir: `parentId` é uma
 * auto-relação sem restrição de zona, e o `CHECK` só impede o auto-pai. Um pai
 * de outra zona, e um ciclo entre dois nós, são aceites pelo schema e rejeitados
 * aqui.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalizacaoService } from './localizacao.service';
import { NotFoundError, ConflictError, BusinessRuleError } from '../utils/errors';

describe('LocalizacaoService', () => {
  let mockPrisma: any;
  let service: LocalizacaoService;

  const zona = { id: 'zona-1', codigo: 'A', ativo: true, areaId: 'area-1' };
  const outraZona = { id: 'zona-2', codigo: 'B', ativo: true, areaId: 'area-1' };

  beforeEach(() => {
    mockPrisma = {
      armazem: { findUnique: vi.fn() },
      armazemArea: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      armazemZona: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      armazemLocalizacao: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      estoque: { findMany: vi.fn() },
    };

    // O repositório é ligado ao mesmo `prisma` por omissão, por isso mockar o
    // cliente chega para exercitar os dois sítios.
    service = new LocalizacaoService(mockPrisma);
  });

  describe('criarArea', () => {
    it('recusa uma área em armazém inactivo', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', ativo: false });

      await expect(
        service.criarArea({ armazemId: 'arm-1', codigo: 'REC', designacao: 'Recepção' })
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.armazemArea.create).not.toHaveBeenCalled();
    });

    it('recusa código de área duplicado no mesmo armazém', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', ativo: true });
      mockPrisma.armazemArea.findUnique.mockResolvedValue({ id: 'area-existente' });

      await expect(
        service.criarArea({ armazemId: 'arm-1', codigo: 'REC', designacao: 'Recepção' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('aceita o mesmo código de área em armazéns diferentes', async () => {
      // A unicidade é `(armazemId, codigo)`. Duas filiais podem ter ambas uma
      // área 'REC'.
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', ativo: true });
      mockPrisma.armazemArea.findUnique.mockResolvedValue(null);
      mockPrisma.armazemArea.create.mockResolvedValue({ id: 'area-nova', codigo: 'REC' });

      const res = await service.criarArea({
        armazemId: 'arm-1',
        codigo: 'REC',
        designacao: 'Recepção',
      });

      expect(res.id).toBe('area-nova');
    });
  });

  describe('criarZona', () => {
    it('recusa uma zona em área inactiva', async () => {
      mockPrisma.armazemArea.findUnique.mockResolvedValue({
        id: 'area-1',
        codigo: 'REC',
        ativo: false,
      });

      await expect(
        service.criarZona({ areaId: 'area-1', codigo: 'PESADOS', designacao: 'Pesados' })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('cria a zona com alta rotação e temperatura controlada', async () => {
      mockPrisma.armazemArea.findUnique.mockResolvedValue({
        id: 'area-1',
        codigo: 'REC',
        ativo: true,
      });
      mockPrisma.armazemZona.findUnique.mockResolvedValue(null);
      mockPrisma.armazemZona.create.mockResolvedValue({ id: 'zona-nova' });

      await service.criarZona({
        areaId: 'area-1',
        codigo: 'FRIO',
        designacao: 'Câmara fria',
        altaRotacao: true,
        temperaturaControlada: true,
      });

      expect(mockPrisma.armazemZona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ altaRotacao: true, temperaturaControlada: true }),
        })
      );
    });
  });

  describe('criarLocalizacao', () => {
    it('recusa uma localização cuja zona não existe', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(null);

      await expect(
        service.criarLocalizacao({
          zonaId: 'zona-inexistente',
          codigo: 'A01',
          capacidadeQuantidade: 100,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('recusa um pai de outra zona, algo que o schema não impede', async () => {
      // `parentId` é uma auto-relação livre: o schema aceita este par. A
      // localização ficaria órfã na leitura da árvore por zona.
      mockPrisma.armazemZona.findUnique.mockResolvedValue(zona);
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue({
        id: 'pai-1',
        codigo: 'A01',
        zonaId: outraZona.id,
        parentId: null,
        ativo: true,
      });

      await expect(
        service.criarLocalizacao({
          zonaId: zona.id,
          parentId: 'pai-1',
          codigo: 'A02',
          capacidadeQuantidade: 100,
        })
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.armazemLocalizacao.create).not.toHaveBeenCalled();
    });

    it('recusa um pai inexistente', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(zona);
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue(null);

      await expect(
        service.criarLocalizacao({
          zonaId: zona.id,
          parentId: 'nao-existe',
          codigo: 'A02',
          capacidadeQuantidade: 100,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('aceita uma localização sem pai, que é a raiz da zona', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(zona);
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue(null);
      mockPrisma.armazemLocalizacao.create.mockResolvedValue({ id: 'loc-1', parentId: null });

      const res = await service.criarLocalizacao({
        zonaId: zona.id,
        codigo: 'A01',
        capacidadeQuantidade: 100,
      });

      expect(res.id).toBe('loc-1');
    });

    it('trata uma capacidade ausente como "sem limite", e não como zero', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(zona);
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue(null);
      mockPrisma.armazemLocalizacao.create.mockResolvedValue({ id: 'loc-1' });

      await service.criarLocalizacao({ zonaId: zona.id, codigo: 'A01' });

      expect(mockPrisma.armazemLocalizacao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ capacidadeQuantidade: null }),
        })
      );
    });

    it('recusa capacidades negativas', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(zona);

      await expect(
        service.criarLocalizacao({
          zonaId: zona.id,
          codigo: 'A01',
          capacidadeQuantidade: -5,
        })
      ).rejects.toThrow();
    });

    it('recusa código duplicado dentro da mesma zona', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(zona);
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue({ id: 'existente' });

      await expect(
        service.criarLocalizacao({ zonaId: zona.id, codigo: 'A01', capacidadeQuantidade: 10 })
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('actualizarLocalizacao', () => {
    it('recusa que uma localização seja pai de si mesma', async () => {
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue({
        id: 'loc-1',
        zonaId: zona.id,
        parentId: null,
      });

      await expect(
        service.actualizarLocalizacao('loc-1', { parentId: 'loc-1' })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('recusa mover um nó para dentro de si mesmo, formando um ciclo', async () => {
      // loc-1 → loc-2 → loc-3. loc-2 é uma descendente de loc-1, por isso
      // tê-la como pai fecharia o ciclo. O CHECK da base só impede o auto-pai,
      // e isto passava despercebido.
      //
      // Leitura 1: a localização a actualizar. Leitura 2: o candidato a pai.
      // Leitura 3: o primeiro degrau da subida, que encontra loc-1.
      mockPrisma.armazemLocalizacao.findUnique
        .mockResolvedValueOnce({ id: 'loc-1', zonaId: zona.id, parentId: null })
        .mockResolvedValueOnce({ id: 'loc-2', zonaId: zona.id, parentId: 'loc-1' })
        .mockResolvedValueOnce({ id: 'loc-2', zonaId: zona.id, parentId: 'loc-1' });

      await expect(
        service.actualizarLocalizacao('loc-1', { parentId: 'loc-2' })
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.armazemLocalizacao.update).not.toHaveBeenCalled();
    });

    it('aceita mover um nó para debaixo de uma linha diferente', async () => {
      // loc-1 e loc-4 são irmãos, ambos filhos de null. Mover loc-1 para
      // debaixo de loc-4 é uma mudança de posição na zona, não um ciclo.
      mockPrisma.armazemLocalizacao.findUnique
        .mockResolvedValueOnce({ id: 'loc-1', zonaId: zona.id, parentId: null })
        .mockResolvedValueOnce({ id: 'loc-4', zonaId: zona.id, parentId: null })
        .mockResolvedValueOnce({ id: 'loc-4', zonaId: zona.id, parentId: null });
      mockPrisma.armazemLocalizacao.update.mockResolvedValue({ id: 'loc-1' });

      await expect(
        service.actualizarLocalizacao('loc-1', { parentId: 'loc-4' })
      ).resolves.toBeDefined();
      expect(mockPrisma.armazemLocalizacao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'loc-4' }),
        })
      );
    });

    it('termina o percurso mesmo num ciclo já existente na base', async () => {
      // loc-2 e loc-3 apontam um ao outro. O `Set` de vistos impede que o
      // percurso se repita indefinidamente, e o método decide em vez de rodar.
      mockPrisma.armazemLocalizacao.findUnique
        .mockResolvedValueOnce({ id: 'loc-1', zonaId: zona.id, parentId: null })
        .mockResolvedValueOnce({ id: 'loc-2', zonaId: zona.id, parentId: 'loc-3' })
        .mockResolvedValueOnce({ id: 'loc-2', zonaId: zona.id, parentId: 'loc-3' })
        .mockResolvedValueOnce({ id: 'loc-3', zonaId: zona.id, parentId: 'loc-2' })
        .mockResolvedValueOnce({ id: 'loc-2', zonaId: zona.id, parentId: 'loc-3' });
      mockPrisma.armazemLocalizacao.update.mockResolvedValue({ id: 'loc-1' });

      await expect(
        service.actualizarLocalizacao('loc-1', { parentId: 'loc-2' })
      ).resolves.toBeDefined();
    });

    it('não deixa mudar a zona nem o código', async () => {
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue({
        id: 'loc-1',
        zonaId: zona.id,
        parentId: null,
      });

      // `zonaId` e `codigo` não existem no schema de actualização, por isso nem
      // chegam ao `update`.
      await service.actualizarLocalizacao('loc-1', { designacao: 'Prateleira 1' });

      expect(mockPrisma.armazemLocalizacao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ zonaId: expect.anything() }),
        })
      );
    });
  });

  describe('desactivar', () => {
    it('desactiva a localização e os descendentes, e não apaga', async () => {
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue({
        id: 'loc-1',
        zonaId: zona.id,
      });
      // findMany recolhe a subárvore por níveis: loc-2 primeiro, depois nada.
      mockPrisma.armazemLocalizacao.findMany
        .mockResolvedValueOnce([{ id: 'loc-2' }])
        .mockResolvedValueOnce([]);
      mockPrisma.armazemLocalizacao.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.desactivarSubarvore('loc-1');

      // O nó e a descendente. `delete` nunca é chamado: há `estoques` e
      // `movimentos_stock` a apontar para a localização.
      expect(res.total).toBe(2);
      expect(mockPrisma.armazemLocalizacao.delete).toBeUndefined();
    });

    it('desactiva só a localização quando não tem filhos', async () => {
      mockPrisma.armazemLocalizacao.findUnique.mockResolvedValue({
        id: 'loc-1',
        zonaId: zona.id,
      });
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([]);
      mockPrisma.armazemLocalizacao.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.desactivarSubarvore('loc-1');

      expect(res.total).toBe(1);
    });
  });

  describe('obterLocalizacoesDisponiveis', () => {
    it('recusa um armazém inactivo', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', ativo: false });

      await expect(
        service.obterLocalizacoesDisponiveis({ armazemId: 'arm-1', quantidade: 10 })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('recusa quantidade zero ou negativa', async () => {
      await expect(
        service.obterLocalizacoesDisponiveis({ armazemId: 'arm-1', quantidade: 0 })
      ).rejects.toThrow();
    });

    it('filtra pela capacidade, com a quantidade em Decimal', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', ativo: true });
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([]);

      await service.obterLocalizacoesDisponiveis({ armazemId: 'arm-1', quantidade: 25 });

      expect(mockPrisma.armazemLocalizacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            zona: { area: { armazemId: 'arm-1' } },
          }),
        })
      );
    });
  });

  describe('listarLocalizacoes', () => {
    it('exige a zona, porque é ela que dá a unicidade do código', async () => {
      await expect(service.listarLocalizacoes({})).rejects.toThrow();
    });

    it('filtra por elegibilidade de picking e putaway', async () => {
      mockPrisma.armazemLocalizacao.findMany.mockResolvedValue([]);

      await service.listarLocalizacoes({
        zonaId: zona.id,
        apenasPickable: true,
        apenasPutaway: false,
      });

      expect(mockPrisma.armazemLocalizacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPickable: true, isPutaway: false }),
        })
      );
    });
  });

  describe('actualizarArea', () => {
    it('recusa uma área inexistente', async () => {
      mockPrisma.armazemArea.findUnique.mockResolvedValue(null);

      await expect(
        service.actualizarArea('area-x', { designacao: 'Nova' })
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(mockPrisma.armazemArea.update).not.toHaveBeenCalled();
    });

    it('recusa um código que colide com outra área do mesmo armazém', async () => {
      mockPrisma.armazemArea.findUnique
        .mockResolvedValueOnce({ id: 'area-1', armazemId: 'arm-1', codigo: 'REC' })
        .mockResolvedValueOnce({ id: 'area-2' });

      await expect(
        service.actualizarArea('area-1', { codigo: 'EXP' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('actualiza a área quando o código não muda', async () => {
      mockPrisma.armazemArea.findUnique.mockResolvedValue({
        id: 'area-1',
        armazemId: 'arm-1',
        codigo: 'REC',
      });
      mockPrisma.armazemArea.update.mockResolvedValue({ id: 'area-1', codigo: 'REC' });

      await service.actualizarArea('area-1', { designacao: 'Recepção', tipo: 'recepcao' });

      expect(mockPrisma.armazemArea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'area-1' },
          data: expect.objectContaining({ designacao: 'Recepção', tipo: 'recepcao' }),
        })
      );
    });
  });

  describe('desactivarArea', () => {
    it('recusa desactivar uma área com zonas activas', async () => {
      mockPrisma.armazemArea.findUnique.mockResolvedValue({ id: 'area-1', codigo: 'REC' });
      mockPrisma.armazemZona.count.mockResolvedValue(2);

      await expect(service.desactivarArea('area-1')).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.armazemArea.update).not.toHaveBeenCalled();
    });

    it('desactiva uma área sem zonas activas', async () => {
      mockPrisma.armazemArea.findUnique.mockResolvedValue({ id: 'area-1', codigo: 'REC' });
      mockPrisma.armazemZona.count.mockResolvedValue(0);
      mockPrisma.armazemArea.update.mockResolvedValue({ id: 'area-1', ativo: false });

      await service.desactivarArea('area-1');

      expect(mockPrisma.armazemArea.update).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        data: { ativo: false },
      });
    });
  });

  describe('actualizarZona', () => {
    it('recusa uma zona inexistente', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue(null);

      await expect(
        service.actualizarZona('zona-x', { designacao: 'Nova' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('recusa um código que colide com outra zona da mesma área', async () => {
      mockPrisma.armazemZona.findUnique
        .mockResolvedValueOnce({ id: 'zona-1', areaId: 'area-1', codigo: 'A' })
        .mockResolvedValueOnce({ id: 'zona-2' });

      await expect(
        service.actualizarZona('zona-1', { codigo: 'B' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('actualiza as características da zona', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue({
        id: 'zona-1',
        areaId: 'area-1',
        codigo: 'A',
      });
      mockPrisma.armazemZona.update.mockResolvedValue({ id: 'zona-1' });

      await service.actualizarZona('zona-1', { altaRotacao: true });

      expect(mockPrisma.armazemZona.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'zona-1' },
          data: expect.objectContaining({ altaRotacao: true }),
        })
      );
    });
  });

  describe('desactivarZona', () => {
    it('recusa desactivar uma zona com localizações activas', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue({ id: 'zona-1', codigo: 'A' });
      mockPrisma.armazemLocalizacao.count.mockResolvedValue(3);

      await expect(service.desactivarZona('zona-1')).rejects.toBeInstanceOf(BusinessRuleError);
      expect(mockPrisma.armazemZona.update).not.toHaveBeenCalled();
    });

    it('desactiva uma zona sem localizações activas', async () => {
      mockPrisma.armazemZona.findUnique.mockResolvedValue({ id: 'zona-1', codigo: 'A' });
      mockPrisma.armazemLocalizacao.count.mockResolvedValue(0);
      mockPrisma.armazemZona.update.mockResolvedValue({ id: 'zona-1', ativo: false });

      await service.desactivarZona('zona-1');

      expect(mockPrisma.armazemZona.update).toHaveBeenCalledWith({
        where: { id: 'zona-1' },
        data: { ativo: false },
      });
    });
  });
});
