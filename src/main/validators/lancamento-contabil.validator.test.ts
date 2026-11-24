import { describe, it, expect } from 'vitest';
import {
  criarLancamentoSchema,
  atualizarLancamentoSchema,
  estornarLancamentoSchema,
  lancamentoFiltersSchema,
} from './lancamento-contabil.validator';

describe('lancamento-contabil.validator', () => {
  describe('criarLancamentoSchema', () => {
    it('aceita um lançamento válido', () => {
      const parsed = criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento de teste',
        linhas: [
          { contaId: 'conta-1', debito: '100.00', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100.00' },
        ],
      });

      expect(parsed.linhas).toHaveLength(2);
      expect(parsed.linhas[0].debito).toBe('100.00');
      expect(parsed.linhas[0].credito).toBe('0');
    });

    it('rejeita lançamento com menos de 2 linhas', () => {
      expect(() => criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [{ contaId: 'conta-1', debito: '100', credito: '0' }],
      })).toThrow();
    });

    it('rejeita linha com débito e crédito ao mesmo tempo', () => {
      expect(() => criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '100', credito: '50' },
          { contaId: 'conta-2', debito: '0', credito: '150' },
        ],
      })).toThrow();
    });

    it('rejeita linha sem débito nem crédito', () => {
      expect(() => criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '0', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100' },
        ],
      })).toThrow();
    });

    it('rejeita valores negativos', () => {
      expect(() => criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '-100', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100' },
        ],
      })).toThrow();
    });

    it('rejeita valores com mais de 4 casas decimais', () => {
      expect(() => criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '100.12345', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100' },
        ],
      })).toThrow();
    });

    it('aceita valores com vírgula decimal', () => {
      const parsed = criarLancamentoSchema.parse({
        empresaId: 'emp-1',
        diarioId: 'diario-1',
        dataContabilistica: '2026-01-15',
        descricao: 'Lançamento',
        linhas: [
          { contaId: 'conta-1', debito: '100,50', credito: '0' },
          { contaId: 'conta-2', debito: '0', credito: '100,50' },
        ],
      });

      expect(parsed.linhas[0].debito).toBe('100.50');
    });
  });

  describe('atualizarLancamentoSchema', () => {
    it('permite atualização parcial', () => {
      const parsed = atualizarLancamentoSchema.parse({ descricao: 'Nova descrição' });
      expect(parsed.descricao).toBe('Nova descrição');
    });
  });

  describe('estornarLancamentoSchema', () => {
    it('exige data contabilística', () => {
      const parsed = estornarLancamentoSchema.parse({
        dataContabilistica: '2026-02-01',
        descricao: 'Estorno',
      });
      expect(parsed.dataContabilistica).toBeInstanceOf(Date);
    });
  });

  describe('lancamentoFiltersSchema', () => {
    it('converte page e pageSize', () => {
      const parsed = lancamentoFiltersSchema.parse({ page: '2', pageSize: '25' });
      expect(parsed.page).toBe(2);
      expect(parsed.pageSize).toBe(25);
    });

    it('rejeita estado inválido', () => {
      expect(() => lancamentoFiltersSchema.parse({ estado: 'invalido' })).toThrow();
    });
  });
});