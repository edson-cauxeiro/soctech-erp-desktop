/**
 * @file sequencia-diario.service.ts
 * @description Numeração atómica por diário e exercício.
 *
 * O número do lançamento só é atribuído na validação. A sequência é
 * incrementada com `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`, numa
 * única instrução, para que N validações concorrentes recebam 1..N sem buracos
 * e sem depender de isolamento `Serializable` ou de retries.
 */

import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { ValidationError } from '../utils/errors';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export class SequenciaDiarioService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /** Devolve o próximo número e grava o incremento na mesma instrução. */
  async proximoNumero(
    diarioId: string,
    exercicioId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    if (!diarioId?.trim()) throw new ValidationError('O diário é obrigatório.');
    if (!exercicioId?.trim()) throw new ValidationError('O exercício é obrigatório.');

    const cliente: ClientePrisma = tx ?? this.prisma;
    const linhas = await cliente.$queryRaw<Array<{ ultimo_numero: number | bigint }>>(
      Prisma.sql`
        INSERT INTO "sequencias_diario" ("id", "diario_id", "exercicio_id", "ultimo_numero")
        VALUES (${randomUUID()}, ${diarioId}, ${exercicioId}, 1)
        ON CONFLICT ("diario_id", "exercicio_id")
        DO UPDATE SET "ultimo_numero" = "sequencias_diario"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `
    );

    const numero = Number(linhas[0]?.ultimo_numero ?? 0);
    if (!Number.isInteger(numero) || numero < 1) {
      throw new ValidationError('Não foi possível obter o próximo número do diário.');
    }
    return numero;
  }

  /** Lê o último número sem o incrementar (para diagnóstico/UI). */
  async obterUltimoNumero(diarioId: string, exercicioId: string): Promise<number> {
    const sequencia = await this.prisma.sequenciaDiario.findUnique({
      where: { diarioId_exercicioId: { diarioId, exercicioId } },
      select: { ultimoNumero: true },
    });
    return sequencia?.ultimoNumero ?? 0;
  }
}

export const sequenciaDiarioService = new SequenciaDiarioService();
