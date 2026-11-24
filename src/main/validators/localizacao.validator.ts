/**
 * @file localizacao.validator.ts
 * @description Validadores Zod para a estrutura de armazéns (EPIC 3, TASK-018).
 *
 * Áreas, zonas e localizações. A capacidade é `null` quando não declarada, e
 * `null` não é zero: significaria que a prateleira não aceita nada.
 */

import { z } from 'zod';
import { TipoLocalizacao } from '@prisma/client';

const capacidade = z
  .union([z.number(), z.string(), z.null()])
  .nullish()
  .transform((valor) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = Number(valor);
    if (Number.isNaN(numero)) return Number.NaN;
    return numero;
  })
  .refine(
    (valor) => valor === null || (Number.isFinite(valor) && valor >= 0),
    'A capacidade não pode ser negativa.'
  );

export const criarAreaSchema = z.object({
  armazemId: z.string({ required_error: 'O armazém é obrigatório.' }).trim().min(1),
  codigo: z
    .string({ required_error: 'O código da área é obrigatório.' })
    .trim()
    .min(1, 'O código da área não pode estar vazio.')
    .max(20, 'O código da área deve ter no máximo 20 caracteres.'),
  designacao: z
    .string({ required_error: 'A designação da área é obrigatória.' })
    .trim()
    .min(1, 'A designação da área não pode estar vazia.')
    .max(100),
  /**
   * `String?` no schema, livre para extensão: recepção, quarentena, expedição,
   * ou qualquer rótulo que o negócio invente.
   */
  tipo: z.string().trim().max(50).optional().nullable(),
  descricao: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
});

/**
 * Actualização de área. `armazemId` não entra: mover uma área de armazém
 * levaria as zonas e o stock endereçado atrás dela e quebraria a unicidade de
 * `(armazemId, codigo)` sem que ninguém o tivesse pedido.
 */
export const actualizarAreaSchema = z.object({
  codigo: z.string().trim().min(1, 'O código não pode estar vazio.').max(20).optional(),
  designacao: z.string().trim().min(1, 'A designação não pode estar vazia.').max(100).optional(),
  tipo: z.string().trim().max(50).optional().nullable(),
  descricao: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
});

export const criarZonaSchema = z.object({
  areaId: z.string({ required_error: 'A área é obrigatória.' }).trim().min(1),
  codigo: z
    .string({ required_error: 'O código da zona é obrigatório.' })
    .trim()
    .min(1, 'O código da zona não pode estar vazio.')
    .max(20, 'O código da zona deve ter no máximo 20 caracteres.'),
  designacao: z
    .string({ required_error: 'A designação da zona é obrigatória.' })
    .trim()
    .min(1, 'A designação da zona não pode estar vazia.')
    .max(100),
  descricao: z.string().trim().max(500).optional().nullable(),
  /** Zona de alto movimento: alimenta a estratégia de picking. */
  altaRotacao: z.boolean().optional(),
  temperaturaControlada: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

/**
 * Actualização de zona. `areaId` fica de fora pela mesma razão que `armazemId`
 * fica de fora da área: mover a zona levaria as localizações e o stock atrás.
 */
export const actualizarZonaSchema = z.object({
  codigo: z.string().trim().min(1, 'O código não pode estar vazio.').max(20).optional(),
  designacao: z.string().trim().min(1, 'A designação não pode estar vazia.').max(100).optional(),
  descricao: z.string().trim().max(500).optional().nullable(),
  altaRotacao: z.boolean().optional(),
  temperaturaControlada: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

/**
 * Criar localização.
 *
 * Sem refinamento que exija ao menos uma capacidade: as três poderem ser `null`
 * é uma escolha legítima — `null` significa "sem limite declarado", e uma
 * prateleira de exposição não tem limite. Uma versão anterior exigia uma
 * capacidade não nula e proibia exatamente esse caso.
 */
export const criarLocalizacaoSchema = z.object({
    zonaId: z.string({ required_error: 'A zona é obrigatória.' }).trim().min(1),
    parentId: z.string().trim().min(1).optional().nullable(),
    codigo: z
      .string({ required_error: 'O código da localização é obrigatório.' })
      .trim()
      .min(1, 'O código da localização não pode estar vazio.')
      .max(30, 'O código da localização deve ter no máximo 30 caracteres.'),
    designacao: z.string().trim().max(100).optional().nullable(),
    tipo: z.nativeEnum(TipoLocalizacao).optional(),
    corredor: z.string().trim().max(30).optional().nullable(),
    estante: z.string().trim().max(30).optional().nullable(),
    nivel: z.coerce.number().int().min(0).optional().nullable(),
    posicao: z.coerce.number().int().min(0).optional().nullable(),
    capacidadeQuantidade: capacidade,
    capacidadePeso: capacidade,
    capacidadeVolume: capacidade,
    permitirMixProdutos: z.boolean().optional(),
    permitirMixLotes: z.boolean().optional(),
    isPickable: z.boolean().optional(),
    isPutaway: z.boolean().optional(),
  });

/**
 * Actualização. `zonaId` e `codigo` ficam de fora de propósito: são a
 * identidade da posição de stock em `estoques`, e mudá-los depois de haver
 * saldo faria a chave única deixar de bater certo com as leituras por zona.
 *
 * Não se deriva de `criarLocalizacaoSchema` com `omit`/`partial` porque esse
 * é um `ZodEffects` (a refinamento de capacidade), e `ZodEffects` não expõe
 * `omit`. O corpo volta a listar os campos, e o teste garante que a lista não
 * diverge da do schema de criação.
 */
export const actualizarLocalizacaoSchema = z.object({
  designacao: z.string().trim().max(100).optional().nullable(),
  tipo: z.nativeEnum(TipoLocalizacao).optional(),
  corredor: z.string().trim().max(30).optional().nullable(),
  estante: z.string().trim().max(30).optional().nullable(),
  nivel: z.coerce.number().int().min(0).optional().nullable(),
  posicao: z.coerce.number().int().min(0).optional().nullable(),
  capacidadeQuantidade: capacidade,
  capacidadePeso: capacidade,
  capacidadeVolume: capacidade,
  permitirMixProdutos: z.boolean().optional(),
  permitirMixLotes: z.boolean().optional(),
  isPickable: z.boolean().optional(),
  isPutaway: z.boolean().optional(),
  parentId: z.string().trim().min(1).optional().nullable(),
  ativo: z.boolean().optional(),
  bloqueada: z.boolean().optional(),
});

export const filtrosLocalizacaoSchema = z.object({
  zonaId: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  apenasAtivas: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((valor) =>
      valor === undefined ? undefined : valor === true || valor === 'true'
    ),
  apenasPickable: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((valor) =>
      valor === undefined ? undefined : valor === true || valor === 'true'
    ),
  apenasPutaway: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((valor) =>
      valor === undefined ? undefined : valor === true || valor === 'true'
    ),
  incluirDescendentes: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((valor) =>
      valor === undefined ? undefined : valor === true || valor === 'true'
    ),
});

export const sugestoesLocalizacaoSchema = z.object({
  armazemId: z.string({ required_error: 'O armazém é obrigatório.' }).trim().min(1),
  artigoId: z.string().trim().min(1).optional(),
  quantidade: z.coerce.number().positive('A quantidade tem de ser maior que zero.'),
  loteId: z.string().trim().min(1).optional().nullable(),
});

export type CriarAreaInput = z.infer<typeof criarAreaSchema>;
export type CriarZonaInput = z.infer<typeof criarZonaSchema>;
export type ActualizarAreaInput = z.infer<typeof actualizarAreaSchema>;
export type ActualizarZonaInput = z.infer<typeof actualizarZonaSchema>;
export type CriarLocalizacaoInput = z.infer<typeof criarLocalizacaoSchema>;
export type ActualizarLocalizacaoInput = z.infer<typeof actualizarLocalizacaoSchema>;
export type FiltrosLocalizacaoInput = z.infer<typeof filtrosLocalizacaoSchema>;
export type SugestoesLocalizacaoInput = z.infer<typeof sugestoesLocalizacaoSchema>;
