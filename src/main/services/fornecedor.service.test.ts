/**
 * @file fornecedor.service.test.ts
 * @description Testes unitários para o FornecedorService (RF05).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FornecedorService } from './fornecedor.service';
import { ConflictError, NotFoundError } from '../utils/errors';
import { EstadoFornecedor } from '@prisma/client';

describe('FornecedorService', () => {
  let mockPrisma: any;
  let service: FornecedorService;

  beforeEach(() => {
    mockPrisma = {
      fornecedor: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    };
    service = new FornecedorService(mockPrisma);
  });

  describe('createFornecedor', () => {
    it('deve criar um fornecedor com sucesso', async () => {
      mockPrisma.fornecedor.findUnique.mockResolvedValue(null);
      mockPrisma.fornecedor.create.mockResolvedValue({
        id: 'forn-1',
        codigo: 'FORN-001',
        nome: 'Distribuidora Global, Lda.',
        nif: '501234567',
        endereco: 'Zona Industrial de Viana',
        estado: EstadoFornecedor.ativo,
      });

      const res = await service.createFornecedor({
        codigo: 'FORN-001',
        nome: 'Distribuidora Global, Lda.',
        nif: '501234567',
        endereco: 'Zona Industrial de Viana',
      });

      expect(res.id).toBe('forn-1');
      expect(res.codigo).toBe('FORN-001');
      expect(mockPrisma.fornecedor.create).toHaveBeenCalled();
    });

    it('deve rejeitar fornecedor com código duplicado', async () => {
      mockPrisma.fornecedor.findUnique.mockResolvedValueOnce({
        id: 'forn-exist',
        codigo: 'FORN-001',
      });

      await expect(
        service.createFornecedor({
          codigo: 'FORN-001',
          nome: 'Outra Distribuidora',
          nif: '509999999',
          endereco: 'Porto',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('deleteFornecedor', () => {
    it('deve remover fornecedor', async () => {
      mockPrisma.fornecedor.findUnique.mockResolvedValue({ id: 'forn-del' });
      mockPrisma.fornecedor.delete.mockResolvedValue({ id: 'forn-del' });

      const res = await service.deleteFornecedor('forn-del');
      expect(res.deleted).toBe(true);
      expect(mockPrisma.fornecedor.delete).toHaveBeenCalledWith({ where: { id: 'forn-del' } });
    });

    it('deve lançar NotFoundError se fornecedor não existir', async () => {
      mockPrisma.fornecedor.findUnique.mockResolvedValue(null);

      await expect(service.deleteFornecedor('non-existing')).rejects.toThrow(NotFoundError);
    });
  });
});
