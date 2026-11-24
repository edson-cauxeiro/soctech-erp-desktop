/**
 * @file artigo.service.test.ts
 * @description Testes unitários para o ArtigoService (RN01.1, RN01.2, RN01.4).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtigoService } from './artigo.service';
import { ConflictError } from '../utils/errors';
import { TipoArtigo, UnidadeArtigo, EstadoArtigo } from '@prisma/client';

describe('ArtigoService', () => {
  let mockPrisma: any;
  let service: ArtigoService;

  beforeEach(() => {
    mockPrisma = {
      artigo: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    };
    service = new ArtigoService(mockPrisma);
  });

  describe('createArtigo', () => {
    it('deve criar um artigo com sucesso', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(null);
      mockPrisma.artigo.create.mockResolvedValue({
        id: 'art-1',
        codigo: 'ART-001',
        descricao: 'Computador Portátil',
        tipo: TipoArtigo.produto_acabado,
        unidade: UnidadeArtigo.UN,
        estado: EstadoArtigo.ativo,
        precoVenda: 1200,
        taxaIva: 23,
      });

      const res = await service.createArtigo({
        codigo: 'ART-001',
        descricao: 'Computador Portátil',
        tipo: 'produto_acabado',
        unidade: 'UN',
        precoVenda: 1200,
        taxaIva: 23,
      });

      expect(res.id).toBe('art-1');
      expect(res.codigo).toBe('ART-001');
      expect(mockPrisma.artigo.create).toHaveBeenCalled();
    });

    it('deve recusar artigo com código SKU já existente (RN01.1)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValueOnce({
        id: 'art-exist',
        codigo: 'ART-DUPLICADO',
      });

      await expect(
        service.createArtigo({
          codigo: 'ART-DUPLICADO',
          descricao: 'Produto Novo',
          tipo: 'produto_acabado',
          unidade: 'UN',
          precoVenda: 10,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('deve recusar artigo com código de barras (EAN) duplicado (RN01.1)', async () => {
      mockPrisma.artigo.findUnique
        .mockResolvedValueOnce(null) // SKU livre
        .mockResolvedValueOnce({ id: 'art-ean-exist', codigoBarras: '5601234567890' }); // EAN em uso

      await expect(
        service.createArtigo({
          codigo: 'ART-002',
          descricao: 'Produto com EAN Duplicado',
          tipo: 'produto_acabado',
          unidade: 'UN',
          codigoBarras: '5601234567890',
          precoVenda: 25,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('deve zerar automaticamente controle de estoque se tipo for servico (RN01.2)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(null);
      mockPrisma.artigo.create.mockImplementation(({ data }) => Promise.resolve({ id: 'art-srv', ...data }));

      const res = await service.createArtigo({
        codigo: 'SRV-001',
        descricao: 'Consultoria Técnica',
        tipo: 'servico',
        unidade: 'UN',
        precoVenda: 80,
        stockMinimo: 50, // deve ser anulado pela regra
        controloLote: true, // deve ser false pela regra
      });

      expect(res.stockMinimo).toBe(0);
      expect(res.controloLote).toBe(false);
      expect(res.armazemPadraoId).toBeNull();
    });

    it('deve aceitar unidade com expoente M² e normalizar para M2 (RN01.4)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(null);
      mockPrisma.artigo.create.mockImplementation(({ data }) => Promise.resolve({ id: 'art-sqm', ...data }));

      const res = await service.createArtigo({
        codigo: 'PIS-001',
        descricao: 'Piso Flutuante',
        tipo: 'produto_acabado',
        unidade: 'M²',
        precoVenda: 15,
      });

      expect(res.unidade).toBe(UnidadeArtigo.M2);
    });
  });

  describe('listArtigos', () => {
    it('deve listar artigos com paginação e busca', async () => {
      mockPrisma.artigo.findMany.mockResolvedValue([
        { id: 'art-1', codigo: 'ART-001', descricao: 'Monitor' },
      ]);
      mockPrisma.artigo.count.mockResolvedValue(1);

      const res = await service.listArtigos({ search: 'Monitor', take: 10 });
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('deleteArtigo', () => {
    it('deve remover artigo diretamente se não possuir histórico', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-clean',
        _count: { linhasFaturaVenda: 0, movimentosStock: 0 },
      });
      mockPrisma.artigo.delete.mockResolvedValue({ id: 'art-clean' });

      const res = await service.deleteArtigo('art-clean');
      expect(res.deleted).toBe(true);
      expect(mockPrisma.artigo.delete).toHaveBeenCalledWith({ where: { id: 'art-clean' } });
    });

    it('deve inativar artigo se possuir histórico fiscal (RNF02)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        id: 'art-historic',
        _count: { linhasFaturaVenda: 3, movimentosStock: 1 },
      });
      mockPrisma.artigo.update.mockResolvedValue({ id: 'art-historic', estado: 'inativo' });

      const res = await service.deleteArtigo('art-historic');
      expect(res.deleted).toBe(false);
      expect(res.inativado).toBe(true);
      expect(mockPrisma.artigo.update).toHaveBeenCalledWith({
        where: { id: 'art-historic' },
        data: { estado: 'inativo' },
      });
    });
  });
});
