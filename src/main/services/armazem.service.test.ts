/**
 * @file armazem.service.test.ts
 * @description Testes unitários para ArmazemService (RF06).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArmazemService } from './armazem.service';
import { ConflictError, BusinessRuleError, NotFoundError } from '../utils/errors';

describe('ArmazemService', () => {
  let mockPrisma: any;
  let service: ArmazemService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1' }),
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1' }),
      },
      armazem: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        upsert: vi.fn(),
      },
      artigo: {
        findMany: vi.fn(),
      },
      movimentoStock: {
        findMany: vi.fn(),
      },
      estoque: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };
    service = new ArmazemService(mockPrisma);
  });

  describe('ensureDefaultArmazens', () => {
    it('deve garantir os armazéns ARM-01 Geral e ARM-02 Vendas', async () => {
      // Já não há `upsert`: sem chave global única em `codigo`, procura-se por
      // `findFirst` e cria-se quando não existe.
      mockPrisma.armazem.findFirst.mockResolvedValue(null);
      mockPrisma.armazem.create.mockResolvedValue({});
      await service.ensureDefaultArmazens();
      expect(mockPrisma.armazem.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.armazem.create).toHaveBeenCalledTimes(2);
    });

    it('actualiza os armazéns por omissão já existentes em vez de os recriar', async () => {
      mockPrisma.armazem.findFirst.mockResolvedValue({ id: 'arm-1' });
      mockPrisma.armazem.update.mockResolvedValue({});
      await service.ensureDefaultArmazens();
      expect(mockPrisma.armazem.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.armazem.create).not.toHaveBeenCalled();
    });
  });

  describe('createArmazem', () => {
    it('deve criar um armazém personalizado com sucesso', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue(null);
      mockPrisma.armazem.create.mockResolvedValue({
        id: 'arm-3',
        codigo: 'ARM-03',
        designacao: 'Armazém Filial Norte',
        tipo: 'produto_acabado',
        ativo: true,
      });

      const res = await service.createArmazem({
        codigo: 'ARM-03',
        designacao: 'Armazém Filial Norte',
        empresaId: 'emp-1',
        tipo: 'produto_acabado',
        ativo: true,
      });

      expect(res.id).toBe('arm-3');
      expect(res.codigo).toBe('ARM-03');
      expect(mockPrisma.armazem.create).toHaveBeenCalled();
    });

    it('deve recusar código de armazém duplicado na mesma empresa', async () => {
      // A unicidade passou a ser `(empresaId, codigo)`: a procura é um
      // `findFirst` pelo par, e não um `findUnique` pelo código global.
      mockPrisma.armazem.findFirst.mockResolvedValueOnce({
        id: 'arm-dup',
        codigo: 'ARM-01',
        empresaId: 'emp-1',
      });

      await expect(
        service.createArmazem({
          codigo: 'ARM-01',
          designacao: 'Tentativa Duplicada',
          empresaId: 'emp-1',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('deve aceitar o mesmo código numa empresa diferente', async () => {
      // O `@unique` global em `codigo` ainda existe como rede de segurança
      // até ao passo seguinte da migração, mas a intenção de M4 é esta: duas
      // empresas podem ter ambas um 'ARM-01'. Este teste documenta que o
      // service já não rejeita por conta própria.
      mockPrisma.armazem.findFirst.mockResolvedValueOnce(null);
      mockPrisma.armazem.create.mockResolvedValue({ id: 'arm-9', codigo: 'ARM-01' });

      const res = await service.createArmazem({
        codigo: 'ARM-01',
        designacao: 'Geral da outra empresa',
        empresaId: 'emp-2',
      });

      expect(res.id).toBe('arm-9');
      expect(mockPrisma.armazem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ empresaId: 'emp-2' }) })
      );
    });

    it('deve recusar uma empresa que não existe', async () => {
      // Sem esta verificação, o `empresaId` aceite pelo validador ficava como
      // FK órfã e só se notava mais tarde, ao listar.
      mockPrisma.empresaConfig.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createArmazem({
          codigo: 'ARM-07',
          designacao: 'Armazém órfão',
          empresaId: 'emp-inexistente',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('deve exigir a empresa', async () => {
      await expect(
        service.createArmazem({ codigo: 'ARM-08', designacao: 'Sem empresa' })
      ).rejects.toThrow();
      // Nem chegou a procurar: a validação falha antes de qualquer escrita.
      expect(mockPrisma.armazem.create).not.toHaveBeenCalled();
    });
  });

  describe('getStockByArmazem', () => {
    it('lê o saldo de `estoques`, e não a soma de movimentos', async () => {
      // Decisão D2: `estoques` é a fonte da verdade. Reagregar movimentos aqui
      // reintroduzia a aritmética que o backfill já teve de reproduzir uma vez.
      mockPrisma.armazem.findUnique.mockResolvedValue({ id: 'arm-1', codigo: 'ARM-01' });
      mockPrisma.estoque.findMany.mockResolvedValue([
        {
          artigoId: 'art-1',
          quantidade: 20,
          custoUnitario: 5,
          artigo: { codigo: 'ART-0001', descricao: 'Café', unidade: 'kg' },
        },
        {
          artigoId: 'art-1',
          quantidade: 3,
          custoUnitario: 5,
          artigo: { codigo: 'ART-0001', descricao: 'Café', unidade: 'kg' },
        },
        {
          artigoId: 'art-2',
          quantidade: 10,
          custoUnitario: 2,
          artigo: { codigo: 'ART-0002', descricao: 'Açúcar', unidade: 'kg' },
        },
      ]);

      const res = await service.getStockByArmazem('arm-1');

      expect(mockPrisma.movimentoStock.findMany).not.toHaveBeenCalled();
      expect(res.artigos).toHaveLength(3);
      expect(res.artigos[0].valorTotal).toBe(100);
      // Só as posições com saldo contam para o total de artigos com mercadoria.
      // Três posições, mas só dois artigos distintos.
      expect(res.totalItens).toBe(2);
      expect(res.valorTotalArmazem).toBe(135);
    });
  });

  describe('deleteArmazem', () => {
    it('deve impedir a remoção dos armazéns padrão ARM-01 e ARM-02', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({
        id: 'arm-1',
        codigo: 'ARM-01',
        _count: { movimentosOrigem: 0, movimentosDestino: 0 },
      });

      await expect(service.deleteArmazem('arm-1')).rejects.toThrow(BusinessRuleError);
    });

    it('deve inativar armazém com histórico de movimentos em vez de apagar', async () => {
      mockPrisma.armazem.findUnique.mockResolvedValue({
        id: 'arm-hist',
        codigo: 'ARM-09',
        _count: { movimentosOrigem: 5, movimentosDestino: 2 },
      });
      mockPrisma.armazem.update.mockResolvedValue({ id: 'arm-hist', ativo: false });

      const res = await service.deleteArmazem('arm-hist');
      expect(res.deleted).toBe(false);
      expect(res.inativado).toBe(true);
      expect(mockPrisma.armazem.update).toHaveBeenCalledWith({
        where: { id: 'arm-hist' },
        data: { ativo: false },
      });
    });
  });
});
