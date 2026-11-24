import { describe, it, expect } from 'vitest';
import { normalizarPermissoes, MODULOS_RBAC } from './permissions.constants';

describe('permissions.constants', () => {
  it('inclui o módulo rh no catálogo RBAC', () => {
    expect(MODULOS_RBAC).toContain('rh');
  });

  describe('normalizarPermissoes', () => {
    it('normaliza o módulo coarse rh', () => {
      const resultado = normalizarPermissoes({ rh: ['read', 'write', 'invalida'] });
      expect(resultado.rh).toEqual(['read', 'write']);
    });

    it('preserva as chaves fine-grained do RH', () => {
      const resultado = normalizarPermissoes({
        rh: ['read'],
        'rh.funcionarios': ['ver', 'criar', 'invalida'],
        'rh.salarios': ['ver'],
      });

      expect(resultado.rh).toEqual(['read']);
      expect(resultado['rh.funcionarios']).toEqual(['ver', 'criar']);
      expect(resultado['rh.salarios']).toEqual(['ver']);
    });

    it('descarta chaves RH desconhecidas', () => {
      const resultado = normalizarPermissoes({ 'rh.desconhecido': true });
      expect(resultado).toEqual({});
    });
  });
});
