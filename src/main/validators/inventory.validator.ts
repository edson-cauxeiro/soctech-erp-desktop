/**
 * @file inventory.validator.ts
 * @description Validadores Zod para as consultas de saldo (EPIC 3, TASK-024/029).
 *
 * Os filtros da listagem por localização são todos opcionais: sem nenhum, a
 * tela mostra o stock inteiro paginado, que é a primeira coisa que alguém quer
 * ver ao abri-la.
 */

import { z } from 'zod';
import { EstadoEstoque } from '@prisma/client';

/** Aceita `true`, `'true'` e `'1'` — o query string do IPC não tem booleanos. */
const booleano = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((valor) =>
    valor === undefined ? undefined : valor === true || valor === 'true' || valor === '1'
  );

const id = z.string().trim().min(1).optional();

/** Saldo de um artigo, opcionalmente limitado a um armazém. */
export const consultarSaldoSchema = z.object({
  artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).trim().min(1),
  armazemId: id,
});

/**
 * Stock por localização (TASK-029).
 *
 * `take` até 200: a tabela paginada nunca pede mais do que uma página, e
 * deixar `take` livre transformaria um clique indevido num `select` de
 * todas as posições do armazém.
 */
export const consultarStockSchema = z.object({
  armazemId: id,
  areaId: id,
  zonaId: id,
  localizacaoId: id,
  artigoId: id,
  loteId: id,
  /** Texto livre sobre `lotes.numeroLote`, não uma chave. */
  numeroLote: z.string().trim().max(60).optional(),
  estado: z.nativeEnum(EstadoEstoque).optional(),
  apenasComSaldo: booleano,
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(100),
});

export type ConsultarSaldoInput = z.infer<typeof consultarSaldoSchema>;
export type ConsultarStockInput = z.infer<typeof consultarStockSchema>;
