/**
 * @file artigo.validator.ts
 * @description Validadores Zod para o cadastro e gestão de Artigos (Master Data 360° - RF01).
 * Implementa RN01.1, RN01.2 e RN01.4.
 */

import { z } from 'zod';
import { TipoArtigo, UnidadeArtigo, EstadoArtigo } from '@prisma/client';

/**
 * Normaliza unidades de medida aceitando tanto notação com expoente (M², M³)
 * quanto os enums do Prisma (M2, M3).
 */
export function normalizeUnidade(val: string): UnidadeArtigo {
  if (val === 'M²') return UnidadeArtigo.M2;
  if (val === 'M³') return UnidadeArtigo.M3;
  return val as UnidadeArtigo;
}

export const createArtigoSchema = z
  .object({
    codigo: z
      .string({ required_error: 'O código SKU é obrigatório.' })
      .trim()
      .min(1, 'O código SKU não pode estar vazio.')
      .max(50, 'O código SKU deve ter no máximo 50 caracteres.'),
    descricao: z
      .string({ required_error: 'A descrição do artigo é obrigatória.' })
      .trim()
      .min(2, 'A descrição deve ter pelo menos 2 caracteres.')
      .max(255, 'A descrição deve ter no máximo 255 caracteres.'),
    tipo: z.nativeEnum(TipoArtigo, {
      errorMap: () => ({ message: 'Tipo de artigo inválido.' }),
    }),
    unidade: z
      .string()
      .transform(normalizeUnidade),
    familia: z.string().trim().max(100).optional().nullable(),
    codigoBarras: z
      .string()
      .trim()
      .max(50, 'O código de barras deve ter no máximo 50 caracteres.')
      .optional()
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    estado: z.nativeEnum(EstadoArtigo).default(EstadoArtigo.ativo),
    precoVenda: z.coerce
      .number({ invalid_type_error: 'Preço de venda deve ser um número.' })
      .min(0, 'O preço de venda não pode ser negativo.')
      .default(0),
    taxaIva: z.coerce
      .number({ invalid_type_error: 'Taxa de IVA deve ser um número.' })
      .min(0, 'A taxa de IVA não pode ser negativa.')
      .max(100, 'A taxa de IVA não pode exceder 100%.')
      .default(23),
    fatorConversao: z.coerce
      .number()
      .min(0.0001, 'Fator de conversão deve ser superior a zero.')
      .default(1.0)
      .optional()
      .nullable(),
    stockMinimo: z.coerce.number().min(0).default(0).optional().nullable(),
    stockMaximo: z.coerce.number().min(0).default(0).optional().nullable(),
    pontoEncomenda: z.coerce.number().min(0).default(0).optional().nullable(),
    controloLote: z.boolean().default(false).optional(),
    armazemPadraoId: z.string().trim().optional().nullable(),
    armazemPadrao: z.string().trim().optional().nullable(),
    precoCustoMedio: z.coerce.number().min(0).default(0).optional().nullable(),
    bom: z.string().optional().nullable(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  .transform((data) => {
    const finalArmazemId = data.armazemPadraoId || data.armazemPadrao || null;
    // RN01.2: Se o tipo for 'servico', limpa atributos de estoque físico
    if (data.tipo === TipoArtigo.servico) {
      return {
        ...data,
        armazemPadraoId: null,
        stockMinimo: 0,
        stockMaximo: 0,
        pontoEncomenda: 0,
        controloLote: false,
      };
    }
    return {
      ...data,
      armazemPadraoId: finalArmazemId,
    };
  });

export const updateArtigoSchema = z
  .object({
    codigo: z.string().trim().min(1).max(50).optional(),
    descricao: z.string().trim().min(2).max(255).optional(),
    tipo: z.nativeEnum(TipoArtigo).optional(),
    unidade: z
      .string()
      .transform(normalizeUnidade)
      .optional(),
    familia: z.string().trim().max(100).optional().nullable(),
    codigoBarras: z
      .string()
      .trim()
      .max(50)
      .optional()
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    estado: z.nativeEnum(EstadoArtigo).optional(),
    precoVenda: z.coerce.number().min(0).optional(),
    taxaIva: z.coerce.number().min(0).max(100).optional(),
    fatorConversao: z.coerce.number().min(0.0001).optional().nullable(),
    stockMinimo: z.coerce.number().min(0).optional().nullable(),
    stockMaximo: z.coerce.number().min(0).optional().nullable(),
    pontoEncomenda: z.coerce.number().min(0).optional().nullable(),
    controloLote: z.boolean().optional(),
    armazemPadraoId: z.string().trim().optional().nullable(),
    armazemPadrao: z.string().trim().optional().nullable(),
    precoCustoMedio: z.coerce.number().min(0).optional().nullable(),
    bom: z.string().optional().nullable(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  .transform((data) => {
    const finalArmazemId = data.armazemPadraoId || data.armazemPadrao || null;
    if (data.tipo === TipoArtigo.servico) {
      return {
        ...data,
        armazemPadraoId: null,
        stockMinimo: 0,
        stockMaximo: 0,
        pontoEncomenda: 0,
        controloLote: false,
      };
    }
    return {
      ...data,
      armazemPadraoId: finalArmazemId,
    };
  });

export const artigoFiltersSchema = z.object({
  search: z.string().trim().optional(),
  tipo: z.nativeEnum(TipoArtigo).optional(),
  estado: z.nativeEnum(EstadoArtigo).optional(),
  familia: z.string().trim().optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

export type CreateArtigoInput = z.infer<typeof createArtigoSchema>;
export type UpdateArtigoInput = z.infer<typeof updateArtigoSchema>;
export type ArtigoFilters = z.infer<typeof artigoFiltersSchema>;
