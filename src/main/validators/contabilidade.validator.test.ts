import { describe, it, expect } from 'vitest';
import {
  criarContaContabilSchema,
  atualizarContaContabilSchema,
  contaContabilFiltersSchema,
  criarDiarioContabilSchema,
  criarPeriodoContabilSchema,
  alterarEstadoPeriodoSchema,
  guardarMapeamentoContaSchema,
  semearContabilidadeSchema,
} from './contabilidade.validator';

describe('contabilidade.validator', () => {
  describe('criarContaContabilSchema', () => {
    it('aceita uma conta válida e aplica os defaults', () => {
      const parsed = criarContaContabilSchema.parse({
        empresaId: 'emp-1',
        codigo: ' 3111 ',
        designacao: ' Clientes conta corrente ',
        tipo: 'activo',
        natureza: 'devedora',
      });

      expect(parsed.codigo).toBe('3111');
      expect(parsed.designacao).toBe('Clientes conta corrente');
      expect(parsed.aceitaMovimento).toBe(false);
      expect(parsed.activa).toBe(true);
      expect(parsed.contaPaiId).toBeUndefined();
    });

    it('transforma contaPaiId vazio em undefined', () => {
      const parsed = criarContaContabilSchema.parse({
        empresaId: 'emp-1',
        codigo: '3111',
        designacao: 'Clientes',
        contaPaiId: '',
        tipo: 'activo',
        natureza: 'devedora',
      });

      expect(parsed.contaPaiId).toBeUndefined();
    });

    it('rejeita código fora do PGC e designação curta', () => {
      expect(() =>
        criarContaContabilSchema.parse({
          empresaId: 'emp-1',
          codigo: '9',
          designacao: 'Clientes',
          tipo: 'activo',
          natureza: 'devedora',
        })
      ).toThrow();

      expect(() =>
        criarContaContabilSchema.parse({
          empresaId: 'emp-1',
          codigo: '311',
          designacao: 'X',
          tipo: 'activo',
          natureza: 'devedora',
        })
      ).toThrow();
    });
  });

  describe('atualizarContaContabilSchema', () => {
    it('ignora o código (imutável)', () => {
      const parsed = atualizarContaContabilSchema.parse({
        codigo: '999',
        designacao: 'Nova designação',
      });

      expect(parsed).not.toHaveProperty('codigo');
      expect(parsed.designacao).toBe('Nova designação');
    });

    it('aceita actualização parcial', () => {
      expect(atualizarContaContabilSchema.parse({ activa: false })).toEqual({ activa: false });
    });
  });

  describe('contaContabilFiltersSchema', () => {
    it('converte classe e booleanos de query string', () => {
      const parsed = contaContabilFiltersSchema.parse({
        classe: '3',
        activa: 'true',
        apenasFolhas: 'false',
      });

      expect(parsed.classe).toBe(3);
      expect(parsed.activa).toBe(true);
      expect(parsed.apenasFolhas).toBe(false);
    });

    it('rejeita classe fora de 1–8', () => {
      expect(() => contaContabilFiltersSchema.parse({ classe: '9' })).toThrow();
    });
  });

  describe('criarDiarioContabilSchema', () => {
    it('normaliza o código para maiúsculas', () => {
      const parsed = criarDiarioContabilSchema.parse({
        empresaId: 'emp-1',
        codigo: ' vd ',
        designacao: 'Diário de vendas',
        tipo: 'vendas',
      });

      expect(parsed.codigo).toBe('VD');
      expect(parsed.activo).toBe(true);
    });

    it('rejeita código com caracteres inválidos', () => {
      expect(() =>
        criarDiarioContabilSchema.parse({
          empresaId: 'emp-1',
          codigo: 'V-1',
          designacao: 'Diário',
          tipo: 'vendas',
        })
      ).toThrow();
    });
  });

  describe('criarPeriodoContabilSchema', () => {
    it('converte datas e número de período', () => {
      const parsed = criarPeriodoContabilSchema.parse({
        exercicioId: 'ex-1',
        numero: '1',
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
      });

      expect(parsed.numero).toBe(1);
      expect(parsed.dataInicio).toBeInstanceOf(Date);
      expect(parsed.dataFim).toBeInstanceOf(Date);
    });

    it('rejeita fim anterior ao início', () => {
      expect(() =>
        criarPeriodoContabilSchema.parse({
          exercicioId: 'ex-1',
          numero: 1,
          dataInicio: '2026-02-01',
          dataFim: '2026-01-31',
        })
      ).toThrow();
    });

    it('rejeita número fora de 1–13', () => {
      expect(() =>
        criarPeriodoContabilSchema.parse({
          exercicioId: 'ex-1',
          numero: 14,
          dataInicio: '2026-01-01',
          dataFim: '2026-01-31',
        })
      ).toThrow();
    });
  });

  describe('alterarEstadoPeriodoSchema', () => {
    it('aceita estados válidos', () => {
      expect(alterarEstadoPeriodoSchema.parse({ estado: 'fechado' })).toEqual({ estado: 'fechado' });
    });

    it('rejeita estados desconhecidos', () => {
      expect(() => alterarEstadoPeriodoSchema.parse({ estado: 'cancelado' })).toThrow();
    });
  });

  describe('guardarMapeamentoContaSchema', () => {
    it('normaliza a chave para maiúsculas', () => {
      const parsed = guardarMapeamentoContaSchema.parse({
        empresaId: 'emp-1',
        chave: 'iva_liquidado',
        contaId: 'conta-1',
      });

      expect(parsed.chave).toBe('IVA_LIQUIDADO');
    });

    it('rejeita chave com espaços ou acentos', () => {
      expect(() =>
        guardarMapeamentoContaSchema.parse({
          empresaId: 'emp-1',
          chave: 'IVA LIQUIDADO',
          contaId: 'conta-1',
        })
      ).toThrow();
    });
  });

  describe('semearContabilidadeSchema', () => {
    it('exige empresa', () => {
      expect(() => semearContabilidadeSchema.parse({ empresaId: '' })).toThrow();
    });
  });
});
