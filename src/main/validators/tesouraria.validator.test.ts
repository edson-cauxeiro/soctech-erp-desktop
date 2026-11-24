import { describe, expect, it } from 'vitest';
import {
  criarContaBancariaSchema,
  atualizarContaBancariaSchema,
  contasContabeisDisponiveisSchema,
} from './tesouraria.validator';

const base = {
  empresaId: 'emp-1',
  codigo: 'BANC-01',
  designacao: 'Banco Principal',
  tipo: 'banco' as const,
  iban: 'AO06 0000 0000 0000 0000 0000 0',
};

describe('associação contabilística de contas bancárias', () => {
  it('aceita contaContabilId na criação e na edição', () => {
    expect(criarContaBancariaSchema.parse({ ...base, contaContabilId: 'cc-1' }).contaContabilId).toBe('cc-1');
    expect(
      atualizarContaBancariaSchema.parse({ empresaId: 'emp-1', contaContabilId: null }).contaContabilId
    ).toBeNull();
  });

  it('transforma string vazia em null', () => {
    expect(criarContaBancariaSchema.parse({ ...base, contaContabilId: '' }).contaContabilId).toBeNull();
  });

  it('exige empresa no endpoint de opções', () => {
    expect(() => contasContabeisDisponiveisSchema.parse({})).toThrow();
    expect(
      contasContabeisDisponiveisSchema.parse({ empresaId: 'emp-1', contaBancariaId: 'cb-1' })
    ).toEqual({ empresaId: 'emp-1', contaBancariaId: 'cb-1' });
  });
});
