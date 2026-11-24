/**
 * @file inventory.service.test.ts
 * @description Testes unitários para InventoryService (EPIC 3, TASK-024/029).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import type { LinhaStockPorLocalizacao } from '../repositories/inventory.repository';

const linhaBase: LinhaStockPorLocalizacao = {
  id: 'est-1',
  artigoId: 'art-1',
  armazemId: 'arm-1',
  localizacaoId: 'loc-1',
  loteId: 'lote-1',
  estado: 'disponivel',
  quantidade: new Prisma.Decimal(10),
  quantidadeReservada: new Prisma.Decimal(3),
  custoUnitario: new Prisma.Decimal('2.5'),
  artigo: { id: 'art-1', codigo: 'P-001', descricao: 'Parafuso M6', unidade: 'UN' },
  armazem: { id: 'arm-1', codigo: 'ARM-01', designacao: 'Geral' },
  lote: { id: 'lote-1', numeroLote: 'L-2024', dataValidade: new Date('2026-12-31') },
  localizacao: {
    id: 'loc-1',
    codigo: 'A1-Z2-01',
    designacao: 'Prateleira 1',
    isPickable: true,
    bloqueada: false,
    zona: {
      id: 'zon-1',
      codigo: 'Z2',
      designacao: 'Corredor B',
      area: { id: 'are-1', codigo: 'A1', designacao: 'Ambiente Seco' },
    },
  },
};

describe('InventoryService', () => {
  let mockRepo: {
    availableQuantity: ReturnType<typeof vi.fn>;
    listarPorLocalizacao: ReturnType<typeof vi.fn>;
  };
  let service: InventoryService;

  beforeEach(() => {
    mockRepo = {
      availableQuantity: vi.fn().mockResolvedValue(new Prisma.Decimal(7)),
      listarPorLocalizacao: vi.fn().mockResolvedValue({ items: [linhaBase], total: 1 }),
    };
    service = new InventoryService({} as never, mockRepo as never);
  });

  describe('consultarSaldo', () => {
    it('devolve o saldo servevel do repositório com o armazém indicado', async () => {
      const saldo = await service.consultarSaldo('art-1', 'arm-1');

      expect(mockRepo.availableQuantity).toHaveBeenCalledWith({
        artigoId: 'art-1',
        armazemId: 'arm-1',
      });
      expect(saldo.toNumber()).toBe(7);
    });

    it('permite consultar sem restrição de armazém', async () => {
      await service.consultarSaldo('art-1');

      expect(mockRepo.availableQuantity).toHaveBeenCalledWith({
        artigoId: 'art-1',
        armazemId: undefined,
      });
    });
  });

  describe('listarStock', () => {
    it('aplica a paginação por omissão (skip 0, take 100)', async () => {
      const res = await service.listarStock({});

      expect(mockRepo.listarPorLocalizacao).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
        { skip: 0, take: 100 }
      );
      expect(res.total).toBe(1);
      expect(res.skip).toBe(0);
      expect(res.take).toBe(100);
    });

    it('passa os filtros da TASK-029 para o repositório', async () => {
      await service.listarStock({
        armazemId: 'arm-1',
        areaId: 'are-1',
        zonaId: 'zon-1',
        localizacaoId: 'loc-1',
        artigoId: 'art-1',
        numeroLote: 'L-2024',
        estado: 'quarentena',
        skip: 50,
        take: 50,
      });

      expect(mockRepo.listarPorLocalizacao).toHaveBeenCalledWith(
        expect.objectContaining({
          armazemId: 'arm-1',
          areaId: 'are-1',
          zonaId: 'zon-1',
          localizacaoId: 'loc-1',
          artigoId: 'art-1',
          numeroLote: 'L-2024',
          estado: 'quarentena',
        }),
        { skip: 50, take: 50 }
      );
    });

    it('rejeita take acima do limite de segurança (200)', async () => {
      await expect(service.listarStock({ take: 500 })).rejects.toThrow();
      expect(mockRepo.listarPorLocalizacao).not.toHaveBeenCalled();
    });

    it('rejeita estado fora do enum', async () => {
      await expect(service.listarStock({ estado: 'perdido' })).rejects.toThrow();
      expect(mockRepo.listarPorLocalizacao).not.toHaveBeenCalled();
    });

    it('calcula disponível (qtd - reservada) e valor (qtd * custo)', async () => {
      const res = await service.listarStock({});

      expect(res.items[0].disponivel.toNumber()).toBe(7);
      expect(res.items[0].valorTotal.toNumber()).toBe(25);
    });

    it('achata localização → zona → área na linha devolvida', async () => {
      const res = await service.listarStock({});

      expect(res.items[0].localizacao).toEqual({
        id: 'loc-1',
        codigo: 'A1-Z2-01',
        designacao: 'Prateleira 1',
        bloqueada: false,
      });
      expect(res.items[0].zona).toEqual({ id: 'zon-1', codigo: 'Z2', designacao: 'Corredor B' });
      expect(res.items[0].area).toEqual({ id: 'are-1', codigo: 'A1', designacao: 'Ambiente Seco' });
    });

    it('mantém os níveis físicos a null quando o stock não tem endereço (D4)', async () => {
      mockRepo.listarPorLocalizacao.mockResolvedValue({
        items: [{ ...linhaBase, lote: null, localizacao: null }],
        total: 1,
      });

      const res = await service.listarStock({});

      expect(res.items[0].localizacao).toBeNull();
      expect(res.items[0].zona).toBeNull();
      expect(res.items[0].area).toBeNull();
      expect(res.items[0].lote).toBeNull();
    });
  });
});
