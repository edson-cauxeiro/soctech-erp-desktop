import { describe, it, expect } from 'vitest';
import { MODULOS_RBAC } from './permissions.constants';
import { LICENSING_MODULE_KEYS } from '../../shared/licensing/modules';

describe('sincronização entre catálogo de licenciamento e RBAC', () => {
  it('usa exactamente as mesmas chaves e ordem', () => {
    expect([...LICENSING_MODULE_KEYS]).toEqual([...MODULOS_RBAC]);
  });

  it('não permite módulo licenciável sem módulo RBAC correspondente', () => {
    for (const key of LICENSING_MODULE_KEYS) {
      expect(MODULOS_RBAC).toContain(key);
    }
  });
});
