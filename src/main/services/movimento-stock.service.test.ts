/**
 * @file movimento-stock.service.test.ts
 * @description Testes unitários do MovimentoStockService (TASK-019 / TASK-033).
 *
 * Cobrem as regras de negócio que o service aplica dentro da transacção:
 *  - entrada credita e recalcula PMP;
 *  - saída debita e bloqueia stock insuficiente (RN06.1);
 *  - transferência debita origem e credita destino na mesma transacção;
 *  - ajuste aceita diferença com sinal (e sem exigência de lote);
 *  - devolução, reserva/libertação de reserva e consultas.
 *
 * A atomicidade e o `WHERE quantidade >= x` dos débitos são o objecto do
 * teste: o `updateMany` levar contagem 0 é o sinal de corrida perdida.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { MovimentoStockService } from './movimento-stock.service';
import { BusinessRuleError, NotFoundError } from '../utils/errors';
import { ZodError } from 'zod';

const D = (n: number) => new Prisma.Decimal(n);

describe('MovimentoStockService', () => {
  let mockPrisma: any;
  let mockEstoque: any;
  let mockMovimento: any;
  let service: MovimentoStockService;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn((cb: (tx: any) => unknown) => cb(mockPrisma)),
      lote: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      artigo: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      estoque: {
        updateMany: vi.fn(),
        aggregate: vi.fn(),
      },
      movimentoStock: {
        count: vi.fn().mockResolvedValue(0),
      },
      // TASK-037: o número passou a ser reservado na tabela de sequências,
      // dentro da transacção. `$transaction` corre o callback com este mock,
      // por isso `sequencia` é acedido como `tx.sequencia`.
      sequencia: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        findFirstOrThrow: vi.fn().mockResolvedValue({ valor: 42 }),
      },
    };

    mockEstoque = {
      findOrCreateByPosition: vi.fn(),
      findByPosition: vi.fn(),
      findById: vi.fn(),
      reserve: vi.fn(),
      release: vi.fn(),
      availableQuantity: vi.fn(),
    };

    mockMovimento = {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    };

    service = new MovimentoStockService(mockPrisma, mockEstoque, mockMovimento);
  });

  /** Artigo comum, sem controlo de lote, com PMP para os cálculos de entrada. */
  function artigoComum(precoCustoMedio = 10): { codigo: string; tipo: string; controloLote: boolean; classeArmazenamento: null; precoCustoMedio: number } {
    return {
      codigo: 'ART-001',
      tipo: 'produto_acabado',
      controloLote: false,
      classeArmazenamento: null,
      precoCustoMedio,
    };
  }

  function posicao(id: string, quantidade: number, reservada = 0, localizacao: string | null = null): any {
    return { id, quantidade: D(quantidade), quantidadeReservada: D(reservada), localizacao };
  }

  describe('Entrada (credita e actualiza PMP)', () => {
    it('credita o armazém de destino e grava o movimento como entrada', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-1', 10));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.estoque.aggregate.mockResolvedValue({ _sum: { quantidade: D(20) } });
      mockMovimento.create.mockResolvedValue({ id: 'mov-1', numero: 'MOV-T-1' });

      const res = await service.registarEntrada({
        numero: 'MOV-T-1',
        artigoId: 'art-1',
        armazemDestinoId: 'arm-geral',
        quantidade: 10,
        custoUnitario: 25,
        documentoOrigem: 'GR-001',
      });

      expect(res.numero).toBe('MOV-T-1');
      expect(mockPrisma.estoque.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantidade: { increment: D(10) } } })
      );
      // PMP: (anterior 10 * 10 + entrada 10 * 25) / total 20 = 17.5
      const pmp = mockPrisma.artigo.update.mock.calls[0][0].data.precoCustoMedio;
      expect(pmp.toNumber()).toBeCloseTo(17.5, 2);
      expect(mockMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'entrada', armazemDestinoId: 'arm-geral' }),
        mockPrisma
      );
    });

    it('gera o número na sequência quando não é fornecido (TASK-037)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-1', 10));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.estoque.aggregate.mockResolvedValue({ _sum: { quantidade: D(20) } });
      mockMovimento.create.mockResolvedValue({ id: 'mov-1', numero: 'MOV-2026/00042' });

      await service.registarEntrada({
        artigoId: 'art-1',
        armazemDestinoId: 'arm-geral',
        quantidade: 10,
        custoUnitario: 25,
        documentoOrigem: 'GR-001',
      });

      expect(mockPrisma.sequencia.updateMany).toHaveBeenCalled();
      expect(mockMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ numero: expect.stringMatching(/^MOV-\d{4}\/00042$/) }),
        mockPrisma
      );
    });

    it('cria o lote quando a entrada traz um lote novo', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockPrisma.lote.findUnique.mockResolvedValue(null);
      mockPrisma.lote.create.mockResolvedValue({ id: 'lote-novo' });
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-1', 0));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockMovimento.create.mockResolvedValue({ id: 'mov-1' });

      await service.registarEntrada({
        numero: 'MOV-T-2',
        artigoId: 'art-1',
        armazemDestinoId: 'arm-geral',
        quantidade: 5,
        lote: 'LT-2026-001',
        documentoOrigem: 'GR-002',
      });

      expect(mockPrisma.lote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ artigoId: 'art-1', numeroLote: 'LT-2026-001' }) })
      );
      expect(mockEstoque.findOrCreateByPosition).toHaveBeenCalledWith(
        expect.objectContaining({ loteId: 'lote-novo' }),
        {},
        mockPrisma
      );
    });

    it('recusa artigo do tipo serviço (RN01.2)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        codigo: 'SRV-01',
        tipo: 'servico',
        controloLote: false,
        classeArmazenamento: null,
      });

      await expect(
        service.registarEntrada({
          numero: 'MOV-T-3',
          artigoId: 'art-srv',
          armazemDestinoId: 'arm-geral',
          quantidade: 1,
          documentoOrigem: 'GR-X',
        })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('exige lote quando o artigo tem controloLote (RN06.2)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue({
        codigo: 'ART-LT',
        tipo: 'produto_acabado',
        controloLote: true,
        classeArmazenamento: null,
      });

      await expect(
        service.registarEntrada({
          numero: 'MOV-T-4',
          artigoId: 'art-lt',
          armazemDestinoId: 'arm-geral',
          quantidade: 1,
          documentoOrigem: 'GR-Y',
        })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });
  });

  describe('Saída (debita e bloqueia stock insuficiente)', () => {
    it('debita o armazém de origem com saldo suficiente', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-origem', 15));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockMovimento.create.mockResolvedValue({ id: 'mov-1' });

      await service.registarSaida({
        numero: 'MOV-VND-1',
        artigoId: 'art-1',
        armazemOrigemId: 'arm-vendas',
        quantidade: 5,
        documentoOrigem: 'FT 2026/0001',
      });

      expect(mockPrisma.estoque.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ quantidade: { gte: D(5) } }),
          data: { quantidade: { increment: D(-5) } },
        })
      );
      expect(mockMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'saida', armazemOrigemId: 'arm-vendas' }),
        mockPrisma
      );
    });

    it('falha com stock insuficiente (RN06.1)', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-origem', 5));

      await expect(
        service.registarSaida({
          numero: 'MOV-VND-2',
          artigoId: 'art-1',
          armazemOrigemId: 'arm-vendas',
          quantidade: 10,
          documentoOrigem: 'FT 2026/0002',
        })
      ).rejects.toBeInstanceOf(BusinessRuleError);

      expect(mockPrisma.estoque.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Transferência (atomicidade origem → destino)', () => {
    it('debita a origem e credita o destino na mesma transacção', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition
        .mockResolvedValueOnce(posicao('est-origem', 100))
        .mockResolvedValueOnce(posicao('est-destino', 0));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockMovimento.create.mockResolvedValue({ id: 'mov-transf' });

      const res = await service.registarTransferencia({
        numero: 'MOV-T-5',
        artigoId: 'art-1',
        armazemOrigemId: 'arm-01',
        armazemDestinoId: 'arm-02',
        quantidade: 20,
        documentoOrigem: 'TRANSFERENCIA-MANUAL',
      });

      expect(res.id).toBe('mov-transf');
      expect(mockPrisma.estoque.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.estoque.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ id: 'est-origem' }),
          data: { quantidade: { increment: D(-20) } },
        })
      );
      expect(mockPrisma.estoque.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ id: 'est-destino' }),
          data: { quantidade: { increment: D(20) } },
        })
      );
      expect(mockMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'transferencia' }),
        mockPrisma
      );
    });

    it('recusa transferência entre o mesmo armazém', async () => {
      await expect(
        service.registarTransferencia({
          numero: 'MOV-T-6',
          artigoId: 'art-1',
          armazemOrigemId: 'arm-01',
          armazemDestinoId: 'arm-01',
          quantidade: 1,
          documentoOrigem: 'TRANSF',
        })
      ).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe('Ajuste (diferença com sinal)', () => {
    it('ajuste negativo debita o armazém', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-1', 40));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockMovimento.create.mockResolvedValue({ id: 'mov-ajuste' });

      await service.registarAjuste({
        numero: 'MOV-AJ-1',
        artigoId: 'art-1',
        armazemId: 'arm-geral',
        diferenca: -3,
        documentoOrigem: 'INV-2026/0001',
      });

      expect(mockPrisma.estoque.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantidade: { increment: D(-3) } } })
      );
      expect(mockMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'ajuste', armazemOrigemId: 'arm-geral' }),
        mockPrisma
      );
    });
  });

  describe('Devolução e reservas', () => {
    it('devolução volta a creditar o armazém como devolucao', async () => {
      mockPrisma.artigo.findUnique.mockResolvedValue(artigoComum());
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-1', 0));
      mockPrisma.estoque.updateMany.mockResolvedValue({ count: 1 });
      mockMovimento.create.mockResolvedValue({ id: 'mov-dev' });

      await service.registarDevolucao({
        numero: 'MOV-DEV-1',
        artigoId: 'art-1',
        armazemId: 'arm-vendas',
        quantidade: 2,
        documentoOrigem: 'DEV 2026/0001',
      });

      expect(mockPrisma.estoque.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantidade: { increment: D(2) } } })
      );
      expect(mockMovimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'devolucao', armazemDestinoId: 'arm-vendas' }),
        mockPrisma
      );
    });

    it('reserva marca o saldo como ocupado sem o mover', async () => {
      mockEstoque.findOrCreateByPosition.mockResolvedValue(posicao('est-1', 10));
      mockEstoque.reserve.mockResolvedValue(undefined);
      mockEstoque.findById.mockResolvedValue(posicao('est-1', 10, 4));

      await service.reservarStock({
        artigoId: 'art-1',
        armazemId: 'arm-vendas',
        quantidade: 4,
      });

      expect(mockEstoque.reserve).toHaveBeenCalledWith('est-1', D(4), mockPrisma);
      expect(mockEstoque.findById).toHaveBeenCalledWith('est-1', mockPrisma);
    });

    it('libertar reserva devolve o saldo ao disponível', async () => {
      mockEstoque.findByPosition.mockResolvedValue(posicao('est-1', 10, 4));
      mockEstoque.release.mockResolvedValue(undefined);
      mockEstoque.findById.mockResolvedValue(posicao('est-1', 10, 0));

      const res = await service.libertarReserva('art-1', 'arm-vendas', 4);

      expect(mockEstoque.release).toHaveBeenCalledWith('est-1', D(4), mockPrisma);
      expect(res.quantidadeReservada.toNumber()).toBe(0);
    });
  });

  describe('Consultas', () => {
    it('lista movimentos paginados com o mesmo filtro para total e página', async () => {
      mockMovimento.findMany.mockResolvedValue([{ id: 'm1' }]);
      mockMovimento.count.mockResolvedValue(9);

      const res = await service.listarMovimentos({ tipo: 'entrada', take: 25 });

      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(9);
      expect(mockMovimento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'entrada', take: 25 })
      );
    });

    it('saldo consulta o estoque disponível', async () => {
      mockEstoque.availableQuantity.mockResolvedValue(D(7));

      await expect(service.consultarSaldo('art-1', 'arm-vendas')).resolves.toBe(7);
      expect(mockEstoque.availableQuantity).toHaveBeenCalledWith({
        artigoId: 'art-1',
        armazemId: 'arm-vendas',
      });
    });

    it('libertar reserva falha se a posição não existe', async () => {
      mockEstoque.findByPosition.mockResolvedValue(null);

      await expect(service.libertarReserva('art-1', 'arm-1', 1)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});