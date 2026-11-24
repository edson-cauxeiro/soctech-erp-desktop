/**
 * @file dados-bancarios-documento.test.ts
 * @description A impressão de documentos lê a `ContaBancaria`. Estes testes
 * fixam essa fonte única: nada de `EmpresaConfig.dadosBancarios`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contaDoDocumento, contasAtivasDaEmpresa } from './dados-bancarios-documento';

describe('dados bancários de documento', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      contaBancaria: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
  });

  describe('contaDoDocumento', () => {
    it('não devolve nada quando o documento não tem conta', async () => {
      const resultado = await contaDoDocumento(null, mockPrisma);
      expect(resultado).toEqual([]);
      expect(mockPrisma.contaBancaria.findUnique).not.toHaveBeenCalled();
    });

    it('usa o nome do banco quando existe, e a designação quando não', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({
        nomeBanco: 'BAI',
        designacao: 'Conta corrente principal',
        iban: 'AO06...123',
        swiftBic: 'BAIXAO21',
      });
      const [conta] = await contaDoDocumento('cb-1', mockPrisma);
      expect(conta).toEqual({ banco: 'BAI', iban: 'AO06...123', swift: 'BAIXAO21' });

      mockPrisma.contaBancaria.findUnique.mockResolvedValue({
        nomeBanco: null,
        designacao: 'Caixa Sede',
        iban: null,
        swiftBic: null,
      });
      const [caixa] = await contaDoDocumento('cb-2', mockPrisma);
      expect(caixa).toEqual({ banco: 'Caixa Sede', iban: '', swift: null });
    });

    it('devolve lista vazia se a conta não existir', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue(null);
      expect(await contaDoDocumento('cb-inexistente', mockPrisma)).toEqual([]);
    });
  });

  describe('contasAtivasDaEmpresa', () => {
    it('lista apenas contas ativas com IBAN, por ordem de código', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        { nomeBanco: 'BFA', designacao: 'BFA', iban: 'AO06...456', swiftBic: null },
      ]);
      const contas = await contasAtivasDaEmpresa('emp-1', mockPrisma);

      expect(contas).toEqual([{ banco: 'BFA', iban: 'AO06...456', swift: null }]);
      expect(mockPrisma.contaBancaria.findMany).toHaveBeenCalledWith({
        where: { empresaId: 'emp-1', ativo: true, iban: { not: null } },
        orderBy: { codigo: 'asc' },
        select: { nomeBanco: true, designacao: true, iban: true, swiftBic: true },
      });
    });

    it('não consulta a base sem empresa', async () => {
      expect(await contasAtivasDaEmpresa(null, mockPrisma)).toEqual([]);
      expect(mockPrisma.contaBancaria.findMany).not.toHaveBeenCalled();
    });
  });
});
