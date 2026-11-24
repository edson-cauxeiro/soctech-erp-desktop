/**
 * @file sequencia.service.ts
 * @description Contadores sequenciais atómicos (TASK-037).
 *
 * Antes disto, os números de movimento eram `count()+1` ou aleatórios: dois
 * processos a gravarem ao mesmo tempo podiam colidir no número. Aqui o
 * incremento é feito com `updateMany` dentro da transacção que vai criar o
 * documento — o mesmo padrão de `DocumentoNumeroService.reservarNumero` —, o
 * que torna a reserva atómica entre conexões: nunca dois documentos do mesmo
 * escopo/ano recebem o mesmo valor.
 */

import { Prisma } from '@prisma/client';

export interface ProximoNumeroParams {
  /** Escopo do contador, ex. `MOV`, `PUTAWAY`, `INV`. */
  escopo: string;
  /** Ano do contador. Por omissão, o ano corrente. */
  ano?: number;
  /** Prefixo do número devolvido, ex. `MOV`. */
  prefixo: string;
  /** Largura do dígito do número, ex. 5 → `00001`. */
  padSize?: number;
}

export class SequenciaService {
  /**
   * Reserva o próximo valor de `escopo/ano`, criando o contador à primeira
   * utilização. Devolve o número já formatado (`MOV-2026/00001`).
   *
   * Deve ser chamado **dentro** da transacção que grava o documento, porque a
   * unicidade do número depende do contador e do documento cometerem juntos.
   */
  async proximoNumero(tx: Prisma.TransactionClient, params: ProximoNumeroParams): Promise<string> {
    const ano = params.ano ?? new Date().getFullYear();
    const padSize = params.padSize ?? 5;

    const atualizado = await tx.sequencia.updateMany({
      where: { escopo: params.escopo, ano },
      data: { valor: { increment: 1 } },
    });

    // Primeira utilização do contador: cria-o. Se outra transacção o criou
    // entretanto (corrida de arranque), o `updateMany` acima não saltou — só a
    // criação falha com P2002; nesse caso retoma com o incremento normal.
    if (atualizado.count === 0) {
      try {
        await tx.sequencia.create({
          data: { escopo: params.escopo, ano, valor: 1 },
        });
      } catch (erro) {
        if (!(erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002')) {
          throw erro;
        }
        await tx.sequencia.updateMany({
          where: { escopo: params.escopo, ano },
          data: { valor: { increment: 1 } },
        });
      }
    }

    const linha = await tx.sequencia.findFirstOrThrow({
      where: { escopo: params.escopo, ano },
      select: { valor: true },
    });

    return `${params.prefixo}-${ano}/${String(linha.valor).padStart(padSize, '0')}`;
  }
}

export const sequenciaService = new SequenciaService();