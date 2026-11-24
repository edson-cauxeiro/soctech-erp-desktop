/**
 * @file sequencia.service.test.ts
 * @description Testes do contador sequencial atómico (TASK-037).
 *
 * O que se prova é o contrato de que o resto do sistema depende: o número
 * devolvido é formatado de forma estável, o contador é criado na primeira
 * utilização, e a corrida de arranque (duas transacções a criar o contador ao
 * mesmo tempo) não rebenta — retoma com o incremento.
 */

import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SequenciaService } from './sequencia.service';

function criarTx(overrides: {
  updateCount?: number;
  valor?: number;
  createErro?: unknown;
} = {}) {
  const updateMany = vi
    .fn()
    .mockResolvedValueOnce({ count: overrides.updateCount ?? 1 })
    // eventual incremento de retoma após conflito de criação
    .mockResolvedValue({ count: 1 });
  const create = overrides.createErro
    ? vi.fn().mockRejectedValue(overrides.createErro)
    : vi.fn().mockResolvedValue({});
  const findFirstOrThrow = vi.fn().mockResolvedValue({ valor: overrides.valor ?? 1 });

  return { sequencia: { updateMany, create, findFirstOrThrow } } as unknown as Prisma.TransactionClient & {
    sequencia: { updateMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; findFirstOrThrow: ReturnType<typeof vi.fn> };
  };
}

const ANO = new Date().getFullYear();

describe('SequenciaService.proximoNumero', () => {
  it('incrementa o contador existente e formata o número', async () => {
    const tx = criarTx({ updateCount: 1, valor: 5 });

    const numero = await new SequenciaService().proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' });

    expect(numero).toBe(`MOV-${ANO}/00005`);
    expect(tx.sequencia.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.sequencia.create).not.toHaveBeenCalled();
  });

  it('cria o contador na primeira utilização', async () => {
    const tx = criarTx({ updateCount: 0, valor: 1 });

    const numero = await new SequenciaService().proximoNumero(tx, { escopo: 'PUTAWAY', prefixo: 'PUTAWAY', padSize: 5 });

    expect(numero).toBe(`PUTAWAY-${ANO}/00001`);
    expect(tx.sequencia.create).toHaveBeenCalledWith({
      data: { escopo: 'PUTAWAY', ano: ANO, valor: 1 },
    });
  });

  it('retoma o incremento se a criação colidir (P2002) com outra transacção', async () => {
    const conflito = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['escopo', 'ano'] },
    });
    const tx = criarTx({ updateCount: 0, valor: 2, createErro: conflito });

    const numero = await new SequenciaService().proximoNumero(tx, { escopo: 'MOV', prefixo: 'MOV' });

    expect(numero).toBe(`MOV-${ANO}/00002`);
    // 1 incremento inicial (count 0) + 1 incremento de retoma.
    expect(tx.sequencia.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.sequencia.create).toHaveBeenCalledTimes(1);
  });

  it('aplica o padrão de dígitos pedido e o ano indicado', async () => {
    const tx = criarTx({ updateCount: 1, valor: 1 });

    const numero = await new SequenciaService().proximoNumero(tx, {
      escopo: 'MOV',
      prefixo: 'MOV',
      ano: 2030,
      padSize: 3,
    });

    expect(numero).toBe('MOV-2030/001');
  });
});