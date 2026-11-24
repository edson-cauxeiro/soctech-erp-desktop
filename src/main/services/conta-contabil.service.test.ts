import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContaContabilService } from './conta-contabil.service';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';

function conta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conta-1',
    empresaId: 'emp-1',
    codigo: '311',
    designacao: 'Clientes',
    contaPaiId: null,
    nivel: 3,
    classe: 3,
    tipo: 'activo',
    natureza: 'devedora',
    aceitaMovimento: true,
    exigeCentroCusto: false,
    exigeEntidade: true,
    activa: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ContaContabilService', () => {
  let mockPrisma: any;
  let service: ContaContabilService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn(),
      },
      contaContabil: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    };
    service = new ContaContabilService(mockPrisma);
  });

  describe('validarCodigo', () => {
    it('deriva a classe e o nível do código', () => {
      expect(ContaContabilService.validarCodigo('3111')).toEqual({ classe: 3, nivel: 4 });
      expect(ContaContabilService.validarCodigo('8')).toEqual({ classe: 8, nivel: 1 });
    });

    it('rejeita códigos fora do PGC', () => {
      expect(() => ContaContabilService.validarCodigo('0')).toThrow(ValidationError);
      expect(() => ContaContabilService.validarCodigo('9')).toThrow(ValidationError);
      expect(() => ContaContabilService.validarCodigo('31A')).toThrow(ValidationError);
      expect(() => ContaContabilService.validarCodigo('12345678901')).toThrow(ValidationError);
    });
  });

  describe('arvore', () => {
    it('monta a hierarquia a partir da lista plana', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        conta({ id: 'a', codigo: '1', contaPaiId: null }),
        conta({ id: 'b', codigo: '11', contaPaiId: 'a' }),
        conta({ id: 'c', codigo: '12', contaPaiId: 'a' }),
        conta({ id: 'd', codigo: '111', contaPaiId: 'b' }),
      ]);

      const arvore = await service.arvore('emp-1');

      expect(arvore).toHaveLength(1);
      expect(arvore[0].codigo).toBe('1');
      expect(arvore[0].filhas.map((f) => f.codigo)).toEqual(['11', '12']);
      expect(arvore[0].filhas[0].filhas[0].codigo).toBe('111');
    });

    it('exige empresa', async () => {
      await expect(service.arvore('')).rejects.toThrow(ValidationError);
    });
  });

  describe('criar', () => {
    it('rejeita código inválido antes de tocar na base de dados', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: '9',
          designacao: 'Conta inválida',
          tipo: 'activo',
          natureza: 'devedora',
        })
      ).rejects.toThrow();
      expect(mockPrisma.empresaConfig.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita código duplicado na mesma empresa', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.contaContabil.findUnique.mockResolvedValue({ id: 'existente' });

      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: '311',
          designacao: 'Clientes',
          tipo: 'activo',
          natureza: 'devedora',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('resolve o pai pelo prefixo e converte-o em conta de agregação', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.contaContabil.findUnique.mockResolvedValue(null);
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'pai-311', codigo: '311', aceitaMovimento: true },
      ]);
      mockPrisma.contaContabil.update.mockResolvedValue({});
      mockPrisma.contaContabil.create.mockResolvedValue(conta({ codigo: '3111', nivel: 4 }));

      await service.criar({
        empresaId: 'emp-1',
        codigo: '3111',
        designacao: 'Clientes conta corrente',
        tipo: 'activo',
        natureza: 'devedora',
        aceitaMovimento: true,
      });

      expect(mockPrisma.contaContabil.update).toHaveBeenCalledWith({
        where: { id: 'pai-311' },
        data: { aceitaMovimento: false },
      });
      expect(mockPrisma.contaContabil.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codigo: '3111',
            contaPaiId: 'pai-311',
            classe: 3,
            nivel: 4,
            aceitaMovimento: true,
          }),
        })
      );
    });

    it('rejeita um pai explícito de outra empresa', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.contaContabil.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'pai-x', empresaId: 'emp-2', codigo: '311', aceitaMovimento: true });

      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: '3111',
          designacao: 'Clientes',
          contaPaiId: 'pai-x',
          tipo: 'activo',
          natureza: 'devedora',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('rejeita um pai que não é prefixo do código', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1' });
      mockPrisma.contaContabil.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'pai-4', empresaId: 'emp-1', codigo: '4', aceitaMovimento: true });

      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: '3111',
          designacao: 'Clientes',
          contaPaiId: 'pai-4',
          tipo: 'activo',
          natureza: 'devedora',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('atualizar', () => {
    it('impede que uma conta com filhas volte a aceitar movimento', async () => {
      mockPrisma.contaContabil.findUnique.mockResolvedValue(
        conta({ _count: { filhas: 2 } })
      );

      await expect(service.atualizar('conta-1', { aceitaMovimento: true })).rejects.toThrow(
        BusinessRuleError
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('bloqueia a eliminação de uma conta com filhas', async () => {
      mockPrisma.contaContabil.findUnique.mockResolvedValue(
        conta({ contaBancaria: null, _count: { filhas: 1, mapeamentos: 0 } })
      );

      await expect(service.remover('conta-1')).rejects.toThrow(ConflictError);
      expect(mockPrisma.contaContabil.delete).not.toHaveBeenCalled();
    });

    it('bloqueia a eliminação de uma conta associada a conta bancária', async () => {
      mockPrisma.contaContabil.findUnique.mockResolvedValue(
        conta({ contaBancaria: { id: 'cb-1', codigo: 'BC' }, _count: { filhas: 0, mapeamentos: 0 } })
      );

      await expect(service.remover('conta-1')).rejects.toThrow(ConflictError);
    });

    it('bloqueia a eliminação de uma conta usada por mapeamentos', async () => {
      mockPrisma.contaContabil.findUnique.mockResolvedValue(
        conta({ contaBancaria: null, _count: { filhas: 0, mapeamentos: 2 } })
      );

      await expect(service.remover('conta-1')).rejects.toThrow(ConflictError);
    });

    it('elimina uma conta folha sem dependências', async () => {
      mockPrisma.contaContabil.findUnique.mockResolvedValue(
        conta({ contaBancaria: null, _count: { filhas: 0, mapeamentos: 0 } })
      );
      mockPrisma.contaContabil.delete.mockResolvedValue(conta());

      await service.remover('conta-1');

      expect(mockPrisma.contaContabil.delete).toHaveBeenCalledWith({ where: { id: 'conta-1' } });
    });

    it('falha se a conta não existir', async () => {
      mockPrisma.contaContabil.findUnique.mockResolvedValue(null);
      await expect(service.remover('inexistente')).rejects.toThrow(NotFoundError);
    });
  });
});
