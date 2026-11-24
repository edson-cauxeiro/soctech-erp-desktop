/**
 * @file putaway.service.test.ts
 * @description Testes unitários do PutawayService (TASK-020 / TASK-033).
 *
 * Cobre as regras de sugerir/executar colocação:
 *  - `sugerirLocalizacao` verifica a zona, filtra posições sem saldo disponível,
 *    ordena e aplica take/skip;
 *  - `executarPutaway` valida que a localização pertence à zona, localiza a
 *    posição pelo armazém dela (regressão do `armazemId: ''`), actualiza a
 *    posição e regista o movimento de auditoria (ajuste, quantidade 0).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { PutawayService } from './putaway.service';
import { NotFoundError, BusinessRuleError } from '../utils/errors';

const D = (n: number) => new Prisma.Decimal(n);

describe('PutawayService', () => {
  let mockPrisma: any;
  let mockEstoque: any;
  let service: PutawayService;

  beforeEach(() => {
    mockPrisma = {
      armazemZona: { findFirst: vi.fn() },
      armazemLocalizacao: { findFirst: vi.fn() },
      estoque: { update: vi.fn() },
      movimentoStock: { create: vi.fn() },
      regraPutaway: { findMany: vi.fn().mockResolvedValue([]) },
      // TASK-037: o putaway passou a ser transaccionado e numera pela
      // sequência. O mock de `$transaction` corre o callback com o próprio
      // mock, por isso `sequencia` é acedido como `tx.sequencia`.
      sequencia: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        findFirstOrThrow: vi.fn().mockResolvedValue({ valor: 7 }),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };
    mockEstoque = {
      findByZone: vi.fn(),
      findByPosition: vi.fn(),
    };
    service = new PutawayService(mockPrisma, mockEstoque);
  });

  function posicao(id: string, quantidade: number, reservada = 0, localizacaoCodigo: string | null): any {
    return {
      id,
      quantidade: D(quantidade),
      quantidadeReservada: D(reservada),
      localizacao: localizacaoCodigo ? { codigo: localizacaoCodigo } : null,
    };
  }

  describe('validarInput', () => {
    it('exige artigoId', () => {
      expect(() => service.validarInput({ zonaId: 'zon-1' })).toThrow(BusinessRuleError);
    });

    it('exige zonaId', () => {
      expect(() => service.validarInput({ artigoId: 'art-1' })).toThrow(BusinessRuleError);
    });
  });

  describe('sugerirLocalizacao', () => {
    it('falha quando a zona não existe ou está inactiva', async () => {
      mockPrisma.armazemZona.findFirst.mockResolvedValue(null);

      await expect(service.sugerirLocalizacao({ artigoId: 'art-1', zonaId: 'zon-x' }))
        .rejects.toBeInstanceOf(NotFoundError);
      expect(mockPrisma.armazemZona.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'zon-x', ativo: true } })
      );
    });

    it('sugere só posições com saldo disponível, ordenadas pelo disponível', async () => {
      mockPrisma.armazemZona.findFirst.mockResolvedValue({ codigo: 'ZON-01', area: { armazemId: 'arm-1' } });
      mockEstoque.findByZone.mockResolvedValue([
        posicao('p-b', 5, 5, 'LOC-B'), // disponível 0 → excluída
        posicao('p-a', 10, 0, 'LOC-A'), // disponível 10
        posicao('p-c', 3, 0, null), // disponível 3, sem código
      ]);

      const res = await service.sugerirLocalizacao({ artigoId: 'art-1', zonaId: 'zon-1' });

      expect(res.zonaCodigo).toBe('ZON-01');
      expect(res.sugestoes).toEqual([
        { localizacaoCodigo: 'LOC-A', disponivel: 10, capacidade: null, localizacaoId: null },
        { localizacaoCodigo: 'sem-código', disponivel: 3, capacidade: null, localizacaoId: null },
      ]);
      expect(mockEstoque.findByZone).toHaveBeenCalledWith('zon-1');
    });

    it('respeita take/skip', async () => {
      mockPrisma.armazemZona.findFirst.mockResolvedValue({ codigo: 'ZON-01', area: { armazemId: 'arm-1' } });
      mockEstoque.findByZone.mockResolvedValue([
        posicao('p-a', 10, 0, 'LOC-A'),
        posicao('p-c', 3, 0, 'LOC-C'),
      ]);

      const res = await service.sugerirLocalizacao({ artigoId: 'art-1', zonaId: 'zon-1', take: 1, skip: 1 });

      expect(res.sugestoes).toEqual([
        { localizacaoCodigo: 'LOC-C', disponivel: 3, capacidade: null, localizacaoId: null },
      ]);
    });
  });

  describe('executarPutaway', () => {
    it('falha se a localização não pertence à zona', async () => {
      mockPrisma.armazemLocalizacao.findFirst.mockResolvedValue(null);

      await expect(service.executarPutaway('art-1', 'zon-1', 'loc-x'))
        .rejects.toBeInstanceOf(NotFoundError);
    });

    it('falha se não existe posição de stock para a localização', async () => {
      mockPrisma.armazemLocalizacao.findFirst.mockResolvedValue({
        id: 'loc-1',
        codigo: 'LOC-1',
        zona: { area: { armazemId: 'ARM-1' } },
      });
      mockEstoque.findByPosition.mockResolvedValue(null);

      await expect(service.executarPutaway('art-1', 'zon-1', 'loc-1'))
        .rejects.toBeInstanceOf(NotFoundError);
    });

    it('move o saldo disponível para a localização e regista o movimento de auditoria', async () => {
      mockPrisma.armazemLocalizacao.findFirst.mockResolvedValue({
        id: 'loc-1',
        codigo: 'LOC-1',
        zona: { area: { armazemId: 'ARM-1' } },
      });
      mockEstoque.findByPosition.mockResolvedValue(posicao('est-1', 10, 2, 'LOC-ANT'));
      mockPrisma.estoque.update.mockResolvedValue({});
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-putaway' });

      await service.executarPutaway('art-1', 'zon-1', 'loc-1');

      // usa o armazém da localização para localizar a posição (regressão)
      expect(mockEstoque.findByPosition).toHaveBeenCalledWith(
        expect.objectContaining({ artigoId: 'art-1', armazemId: 'ARM-1', localizacaoId: 'loc-1' }),
        undefined
      );
      // valor por omissão = saldo disponível (10 - 2)
      expect(mockPrisma.estoque.update).toHaveBeenCalledWith({
        where: { id: 'est-1' },
        data: { localizacaoId: 'loc-1', quantidade: D(8) },
      });
      // auditoria: ajuste com quantidade 0 e localização de destino
      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: 'ajuste',
          artigoId: 'art-1',
          quantidade: D(0),
          localizacaoDestinoId: 'loc-1',
          documentoOrigem: 'putaway',
        }),
      });
    });

    it('usa a quantidade explícita quando fornecida', async () => {
      mockPrisma.armazemLocalizacao.findFirst.mockResolvedValue({
        id: 'loc-1',
        codigo: 'LOC-1',
        zona: { area: { armazemId: 'ARM-1' } },
      });
      mockEstoque.findByPosition.mockResolvedValue(posicao('est-1', 10, 0, 'LOC-ANT'));
      mockPrisma.estoque.update.mockResolvedValue({});
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-putaway' });

      await service.executarPutaway('art-1', 'zon-1', 'loc-1', 12);

      expect(mockPrisma.estoque.update).toHaveBeenCalledWith({
        where: { id: 'est-1' },
        data: { localizacaoId: 'loc-1', quantidade: D(12) },
      });
    });

    it('numera pela sequência e grava o autor do movimento (TASK-037)', async () => {
      mockPrisma.armazemLocalizacao.findFirst.mockResolvedValue({
        id: 'loc-1',
        codigo: 'LOC-1',
        zona: { area: { armazemId: 'ARM-1' } },
      });
      mockEstoque.findByPosition.mockResolvedValue(posicao('est-1', 10, 0, 'LOC-ANT'));
      mockPrisma.estoque.update.mockResolvedValue({});
      mockPrisma.movimentoStock.create.mockResolvedValue({ id: 'mov-putaway' });

      await service.executarPutaway('art-1', 'zon-1', 'loc-1', undefined, { criadoPorId: 'util-9' });

      expect(mockPrisma.sequencia.updateMany).toHaveBeenCalled();
      expect(mockPrisma.movimentoStock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          numero: expect.stringMatching(/^PUTAWAY-\d{4}\/00007$/),
          criadoPorId: 'util-9',
        }),
      });
    });

    it('é atómico: se o movimento falhar, a operação inteira falha (rollback)', async () => {
      mockPrisma.armazemLocalizacao.findFirst.mockResolvedValue({
        id: 'loc-1',
        codigo: 'LOC-1',
        zona: { area: { armazemId: 'ARM-1' } },
      });
      mockEstoque.findByPosition.mockResolvedValue(posicao('est-1', 10, 0, 'LOC-ANT'));
      mockPrisma.estoque.update.mockResolvedValue({});
      mockPrisma.movimentoStock.create.mockRejectedValue(new Error('falha ao gravar rasto'));

      // A posição e o rasto têm de cometer juntos: uma falha no movimento
      // propaga-se, para a transacção fazer rollback do `estoque.update`.
      await expect(service.executarPutaway('art-1', 'zon-1', 'loc-1')).rejects.toThrow(
        'falha ao gravar rasto',
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});