/**
 * @file audit.service.test.ts
 * @description Testes das garantias de integridade do serviço de auditoria.
 *
 * O `AuditLog` é **append-only**: a razão de ser do serviço é que o rasto seja
 * imutável e verificável. Qualquer API de remoção que toque na base de dados
 * quebraria essa garantia, por isso `eliminar`/`limpar` existem apenas para
 * preservar o contrato de tipos e recusam-se a apagar.
 */

import { describe, it, expect, vi } from 'vitest';
import { AuditService } from './audit.service';
import { BusinessRuleError } from '../utils/errors';

function criarServico() {
  // Um prisma que rebenta se for tocado: as operações de eliminação não podem
  // chegar à base de dados.
  const prisma = {
    auditLog: {
      deleteMany: vi.fn(() => {
        throw new Error('a base de dados não devia ser tocada');
      }),
    },
  };
  const servico = new AuditService(prisma as never);
  return { servico, prisma };
}

describe('AuditService — append-only', () => {
  it('recusa-se a eliminar um registo e não toca na base de dados', async () => {
    const { servico, prisma } = criarServico();

    await expect(servico.eliminar('empresa_1', 'reg_1')).rejects.toThrow(BusinessRuleError);
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('recusa-se a limpar o log de uma empresa e não toca na base de dados', async () => {
    const { servico, prisma } = criarServico();

    await expect(servico.limpar('empresa_1')).rejects.toThrow(BusinessRuleError);
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('explica porque é que recusa: o log é imutável de propósito', async () => {
    const { servico } = criarServico();

    await expect(servico.eliminar('empresa_1', 'reg_1')).rejects.toThrow(/append-only/i);
    await expect(servico.limpar('empresa_1')).rejects.toThrow(/append-only/i);
  });
});