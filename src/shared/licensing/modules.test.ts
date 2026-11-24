import { describe, it, expect } from 'vitest';
import {
  ESSENTIAL_CAPABILITIES,
  LICENSING_MODULES,
  LICENSING_MODULE_KEYS,
  getLicensingModule,
  getLicensingModuleDependencies,
  getLicensingModuleLabel,
  isAlwaysAvailableModule,
  isLicensingModule,
} from './modules';

describe('catálogo de módulos licenciáveis', () => {
  it('contém exactamente os 9 módulos RBAC existentes, sem duplicados', () => {
    expect(LICENSING_MODULE_KEYS).toEqual([
      'vendas',
      'compras',
      'estoque',
      'comercial',
      'financas',
      'fiscal',
      'rh',
      'configuracoes',
      'relatorios',
    ]);
    expect(new Set(LICENSING_MODULE_KEYS).size).toBe(LICENSING_MODULES.length);
  });

  it('usa os rótulos reais do ERP (Stock, não Estoque)', () => {
    expect(getLicensingModuleLabel('estoque')).toBe('Stock');
    expect(getLicensingModuleLabel('rh')).toBe('Recursos Humanos');
  });

  it('não declara dependências entre módulos na versão 1', () => {
    for (const module of LICENSING_MODULES) {
      expect(module.dependencies).toEqual([]);
      expect(getLicensingModuleDependencies(module.key)).toEqual([]);
    }
  });

  it('mantém as configurações sempre disponíveis e os restantes módulos sujeitos a licença', () => {
    expect(isAlwaysAvailableModule('configuracoes')).toBe(true);
    expect(LICENSING_MODULES.filter((module) => module.alwaysAvailable).map((module) => module.key)).toEqual([
      'configuracoes',
    ]);
  });

  it('protege as capacidades essenciais fora do catálogo comercial', () => {
    expect(ESSENTIAL_CAPABILITIES).toEqual([
      'login',
      'inicio',
      'configuracoes',
      'licenciamento',
      'backup',
      'export',
    ]);
    expect(isLicensingModule('inicio')).toBe(false);
    expect(isLicensingModule('licenciamento')).toBe(false);
    expect(isLicensingModule('SALES')).toBe(false);
  });

  it('reconhece apenas chaves do catálogo', () => {
    expect(isLicensingModule('vendas')).toBe(true);
    expect(getLicensingModule('rh')?.label).toBe('Recursos Humanos');
    expect(getLicensingModule('inexistente')).toBeNull();
    expect(getLicensingModuleLabel('inexistente')).toBe('inexistente');
  });
});
