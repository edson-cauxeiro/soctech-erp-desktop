import { describe, it, expect } from 'vitest';
import {
  RH_PERMISSOES,
  RH_CHAVE_SALARIOS,
  obterRhPermissao,
  dividirRhChave,
  ehSubmoduloRh,
  rhPermissaoConcede,
  extrairPermissoesRh,
} from './rh-permissions.constants';

describe('rh-permissions.constants', () => {
  describe('catálogo', () => {
    it('expõe chaves no formato rh.<recurso>.<acção>', () => {
      expect(RH_PERMISSOES.length).toBeGreaterThan(0);
      for (const permissao of RH_PERMISSOES) {
        expect(permissao.chave).toMatch(/^rh\.[a-z]+\.[a-z]+$/);
      }
    });

    it('marca os valores salariais como sensíveis e sem fallback coarse', () => {
      const salarios = obterRhPermissao(RH_CHAVE_SALARIOS);
      expect(salarios).toBeDefined();
      expect(salarios?.sensivel).toBe(true);
      expect(salarios?.rbac).toBeNull();
    });

    it('mapeia anular/aprovar para a acção coarse "approve"', () => {
      expect(obterRhPermissao('rh.processamento.anular')?.rbac).toBe('approve');
      expect(obterRhPermissao('rh.assiduidade.aprovar')?.rbac).toBe('approve');
    });

    it('mapeia a configuração de RH para "admin" na edição', () => {
      expect(obterRhPermissao('rh.config.editar')?.rbac).toBe('admin');
      expect(obterRhPermissao('rh.config.ver')?.rbac).toBe('read');
    });
  });

  describe('dividirRhChave / ehSubmoduloRh', () => {
    it('divide uma chave válida', () => {
      expect(dividirRhChave('rh.funcionarios.criar')).toEqual({
        recurso: 'funcionarios',
        acao: 'criar',
      });
    });

    it('rejeita formatos inválidos', () => {
      expect(dividirRhChave('funcionarios.criar')).toBeNull();
      expect(dividirRhChave('rh.funcionarios')).toBeNull();
      expect(dividirRhChave('rh.funcionarios.criar.extra')).toBeNull();
    });

    it('reconhece submódulos conhecidos', () => {
      expect(ehSubmoduloRh('rh.funcionarios')).toBe(true);
      expect(ehSubmoduloRh('rh.desconhecido')).toBe(false);
      expect(ehSubmoduloRh('rh.funcionarios.criar')).toBe(false);
    });
  });

  describe('rhPermissaoConcede', () => {
    it('nega sem permissões', () => {
      expect(rhPermissaoConcede(null, 'rh.funcionarios.ver')).toBe(false);
      expect(rhPermissaoConcede({}, 'rh.funcionarios.ver')).toBe(false);
    });

    it('concede com wildcard global', () => {
      expect(rhPermissaoConcede({ '*': true }, 'rh.salarios.ver')).toBe(true);
    });

    it('concede via chave exacta do submódulo', () => {
      expect(rhPermissaoConcede({ 'rh.funcionarios': ['criar'] }, 'rh.funcionarios.criar')).toBe(true);
      expect(rhPermissaoConcede({ 'rh.funcionarios': ['ver'] }, 'rh.funcionarios.criar')).toBe(false);
    });

    it('usa o fallback coarse para permissões não sensíveis', () => {
      expect(rhPermissaoConcede({ rh: ['read'] }, 'rh.funcionarios.ver')).toBe(true);
      expect(rhPermissaoConcede({ rh: ['write'] }, 'rh.funcionarios.criar')).toBe(true);
      expect(rhPermissaoConcede({ rh: ['approve'] }, 'rh.processamento.anular')).toBe(true);
      expect(rhPermissaoConcede({ rh: ['read'] }, 'rh.funcionarios.criar')).toBe(false);
    });

    it('nunca concede dados sensíveis pelo fallback coarse', () => {
      expect(rhPermissaoConcede({ rh: ['read', 'write', 'approve'] }, 'rh.salarios.ver')).toBe(false);
    });

    it('concede dados sensíveis pela chave exacta ou por administração', () => {
      expect(rhPermissaoConcede({ 'rh.salarios': ['ver'] }, 'rh.salarios.ver')).toBe(true);
      expect(rhPermissaoConcede({ rh: ['admin'] }, 'rh.salarios.ver')).toBe(true);
      expect(rhPermissaoConcede({ rh: true }, 'rh.salarios.ver')).toBe(true);
    });
  });

  describe('extrairPermissoesRh', () => {
    it('preserva submódulos válidos e filtra acções desconhecidas', () => {
      const resultado = extrairPermissoesRh({
        'rh.funcionarios': ['ver', 'invalida', 'criar'],
        'rh.salarios': ['ver'],
        outros: ['read'],
      });

      expect(resultado).toEqual({
        'rh.funcionarios': ['ver', 'criar'],
        'rh.salarios': ['ver'],
      });
    });

    it('expande `true` para todas as acções do submódulo', () => {
      const resultado = extrairPermissoesRh({ 'rh.contratos': true });
      expect(resultado['rh.contratos']).toEqual(['ver', 'gerir']);
    });

    it('ignora submódulos desconhecidos e chaves malformadas', () => {
      const resultado = extrairPermissoesRh({
        'rh.desconhecido': true,
        'rh.funcionarios.criar': true,
        rh: ['read'],
      });
      expect(resultado).toEqual({});
    });
  });
});
