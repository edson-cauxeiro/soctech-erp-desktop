/**
 * @file picking.service.test.ts
 * @description Testes unitários do PickingService (TASK-021 / TASK-033).
 *
 * Cobre a listagem de posições elegíveis para picking:
 *  - passa os filtros artigo/armazém ao `findMany`;
 *  - exclui posições sem saldo disponível (quantidade − reservada ≤ 0);
 *  - ordena por disponível desc e depois por código da localização;
 *  - tolera relações em falta (artigo/armazém/localização apagados).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { PickingService } from './picking.service';

const D = (n: number) => new Prisma.Decimal(n);

describe('PickingService', () => {
  let mockPrisma: any;
  let service: PickingService;

  beforeEach(() => {
    mockPrisma = { 
      estoque: { findMany: vi.fn() },
      regraPicking: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new PickingService(mockPrisma);
  });

  function posicao(id: string, quantidade: number, reservada: number, localizacaoCodigo: string): any {
    return {
      id,
      artigo: { codigo: 'ART-001' },
      armazem: { codigo: 'ARM-01', id: 'arm-1' },
      localizacao: { codigo: localizacaoCodigo },
      quantidade: D(quantidade),
      quantidadeReservada: D(reservada),
      createdAt: new Date(),
    };
  }

  it('passa os filtros de artigo e armazém ao findMany', async () => {
    mockPrisma.estoque.findMany.mockResolvedValue([]);

    await service.listarElegiveis({ artigoId: 'art-1', armazemId: 'arm-1' });

    expect(mockPrisma.estoque.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artigoId: 'art-1', armazemId: 'arm-1' } })
    );
  });

  it('exclui posições sem saldo disponível', async () => {
    mockPrisma.estoque.findMany.mockResolvedValue([
      posicao('p1', 10, 0, 'LOC-A'), // disponível 10
      posicao('p2', 5, 5, 'LOC-B'), // disponível 0 → excluída
      posicao('p3', 0, 0, 'LOC-C'), // disponível 0 → excluída
    ]);

    const res = await service.listarElegiveis({});

    expect(res.map((p) => p.id)).toEqual(['p1']);
  });

it('ordena por disponível desc e depois por código da localização (estrategia manual)', async () => {
    mockPrisma.estoque.findMany.mockResolvedValue([
      posicao('a', 3, 0, 'LOC-B'),
      posicao('b', 8, 0, 'LOC-C'),
      posicao('c', 8, 0, 'LOC-A'),
      posicao('d', 1, 0, 'LOC-D'),
    ]);
    mockPrisma.regraPicking.findMany.mockResolvedValue([
      { armazemId: 'arm-1', estrategia: 'manual', respeitarValidade: true },
    ]);

    const res = await service.listarElegiveis({ armazemId: 'arm-1' });

    expect(res.map((p) => `${p.id}:${p.disponivel}:${p.localizacaoCodigo}`)).toEqual([
      'c:8:LOC-A',
      'b:8:LOC-C',
      'a:3:LOC-B',
      'd:1:LOC-D',
    ]);
  });

  it('tolera relações em falta com códigos "desconhecido"', async () => {
    mockPrisma.estoque.findMany.mockResolvedValue([
      {
        id: 'p1',
        artigo: null,
        armazem: null,
        localizacao: null,
        quantidade: D(2),
        quantidadeReservada: D(0),
      },
    ]);

    const res = await service.listarElegiveis({});

    expect(res[0]).toEqual({
      id: 'p1',
      artigoCodigo: 'desconhecido',
      armazemCodigo: 'desconhecido',
      localizacaoCodigo: 'desconhecido',
      disponivel: 2,
    });
  });
});