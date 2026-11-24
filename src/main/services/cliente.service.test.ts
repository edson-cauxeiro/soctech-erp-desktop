/**
 * @file cliente.service.test.ts
 * @description Testes unitários para o ClienteService (RN02.1, RN02.2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClienteService } from './cliente.service';
import { ConflictError } from '../utils/errors';
import { TipoEntidade, EstadoCliente, RegimeIvaEntidade } from '@prisma/client';

describe('ClienteService', () => {
  let mockPrisma: any;
  let service: ClienteService;

  beforeEach(() => {
    mockPrisma = {
      cliente: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    };
    service = new ClienteService(mockPrisma);
  });

  describe('createCliente', () => {
    it('deve criar um cliente com NIF de Portugal válido', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);
      mockPrisma.cliente.create.mockResolvedValue({
        id: 'cli-1',
        codigo: 'CLI-001',
        nome: 'Cliente Exemplo, Lda.',
        nif: '500000000',
        tipo: TipoEntidade.empresa,
        endereco: 'Rua Principal, 12',
        pais: 'Portugal',
        limiteCredito: 5000,
        estado: EstadoCliente.ativo,
        regimeIva: RegimeIvaEntidade.geral,
      });

      const res = await service.createCliente({
        codigo: 'CLI-001',
        nome: 'Cliente Exemplo, Lda.',
        nif: '500000000',
        tipo: 'empresa',
        endereco: 'Rua Principal, 12',
        pais: 'Portugal',
        limiteCredito: 5000,
      });

      expect(res.id).toBe('cli-1');
      expect(res.codigo).toBe('CLI-001');
      expect(mockPrisma.cliente.create).toHaveBeenCalled();
    });

    it('deve criar um cliente com NIF de Angola válido', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);
      mockPrisma.cliente.create.mockResolvedValue({
        id: 'cli-ao',
        codigo: 'CLI-AO-01',
        nome: 'Empresa Luanda, Lda.',
        nif: '5417000000',
        tipo: TipoEntidade.empresa,
        endereco: 'Avenida 4 de Fevereiro',
        pais: 'AO',
      });

      const res = await service.createCliente({
        codigo: 'CLI-AO-01',
        nome: 'Empresa Luanda, Lda.',
        nif: '5417000000',
        tipo: 'empresa',
        endereco: 'Avenida 4 de Fevereiro',
        pais: 'AO',
      });

      expect(res.id).toBe('cli-ao');
    });

    it('deve rejeitar cliente com NIF inválido (RN02.1)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);

      await expect(
        service.createCliente({
          codigo: 'CLI-ERR',
          nome: 'Cliente Inválido',
          nif: '123456780', // checksum inválido para PT
          tipo: 'particular',
          endereco: 'Rua Teste',
          pais: 'Portugal',
        })
      ).rejects.toThrow();
    });

    it('deve recusar cliente com código duplicado', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce({
        id: 'cli-exist',
        codigo: 'CLI-001',
      });

      await expect(
        service.createCliente({
          codigo: 'CLI-001',
          nome: 'Cliente Repetido',
          nif: '500000000',
          tipo: 'empresa',
          endereco: 'Rua 1',
          pais: 'Portugal',
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('deleteCliente', () => {
    it('deve remover cliente diretamente quando não tem faturas', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue({
        id: 'cli-free',
        _count: { faturasVenda: 0, recibosVenda: 0 },
      });
      mockPrisma.cliente.delete.mockResolvedValue({ id: 'cli-free' });

      const res = await service.deleteCliente('cli-free');
      expect(res.deleted).toBe(true);
      expect(mockPrisma.cliente.delete).toHaveBeenCalledWith({ where: { id: 'cli-free' } });
    });

    it('deve inativar cliente quando já tem faturas ou recibos (RNF02)', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue({
        id: 'cli-with-invoices',
        _count: { faturasVenda: 2, recibosVenda: 1 },
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cli-with-invoices', estado: 'inativo' });

      const res = await service.deleteCliente('cli-with-invoices');
      expect(res.deleted).toBe(false);
      expect(res.inativado).toBe(true);
      expect(mockPrisma.cliente.update).toHaveBeenCalledWith({
        where: { id: 'cli-with-invoices' },
        data: { estado: 'inativo' },
      });
    });
  });
});
