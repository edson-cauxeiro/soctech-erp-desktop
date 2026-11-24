/**
 * @file stock.validator.ts
 * @description Validadores Zod para Movimentação de Estoque, Transferências e Inventário (RF06).
 */

import { z } from 'zod';
import { TipoMovimentoStock } from '@prisma/client';

export const createMovimentoStockSchema = z
  .object({
    numero: z.string().trim().max(50).optional(),
    tipo: z.nativeEnum(TipoMovimentoStock, {
      errorMap: () => ({ message: 'Tipo de movimento de stock inválido.' }),
    }),
    data: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : undefined), z.date()).optional(),
    artigoId: z.string({ required_error: 'O artigo é obrigatório.' }).min(1, 'Selecione um artigo.'),
    quantidade: z.coerce
      .number({ invalid_type_error: 'Quantidade deve ser um número.' })
      .int('A quantidade deve ser um número inteiro.')
      .positive('A quantidade deve ser superior a zero.'),
    armazemOrigemId: z.string().trim().optional().nullable(),
    armazemDestinoId: z.string().trim().optional().nullable(),
    lote: z.string().trim().max(100).optional().nullable(),
    documentoOrigem: z
      .string({ required_error: 'O documento de origem é obrigatório.' })
      .trim()
      .min(1, 'Indique o documento de origem.'),
    documentoTipo: z.string().trim().max(50).optional().nullable(),
    documentoId: z.string().trim().max(50).optional().nullable(),
    custoUnitario: z.coerce.number().min(0).default(0).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.tipo === 'entrada' && !data.armazemDestinoId) {
        return false;
      }
      return true;
    },
    {
      message: 'O armazém de destino é obrigatório para movimentos de entrada.',
      path: ['armazemDestinoId'],
    }
  )
  .refine(
    (data) => {
      if (data.tipo === 'saida' && !data.armazemOrigemId) {
        return false;
      }
      return true;
    },
    {
      message: 'O armazém de origem é obrigatório para movimentos de saída.',
      path: ['armazemOrigemId'],
    }
  )
  .refine(
    (data) => {
      if (data.tipo === 'transferencia' && (!data.armazemOrigemId || !data.armazemDestinoId)) {
        return false;
      }
      if (data.tipo === 'transferencia' && data.armazemOrigemId === data.armazemDestinoId) {
        return false;
      }
      return true;
    },
    {
      message: 'A transferência exige armazém de origem e destino distintos.',
      path: ['armazemDestinoId'],
    }
  );

export const transferenciaStockSchema = z
  .object({
    artigoId: z.string().min(1, 'Artigo é obrigatório.'),
    quantidade: z.coerce
      .number({ invalid_type_error: 'Quantidade deve ser um número.' })
      .int('A quantidade deve ser um número inteiro.')
      .positive('Quantidade deve ser superior a zero.'),
    armazemOrigemId: z.string().min(1, 'Armazém de origem é obrigatório.'),
    armazemDestinoId: z.string().min(1, 'Armazém de destino é obrigatório.'),
    lote: z.string().trim().optional().nullable(),
    documentoOrigem: z.string().trim().default('TRANSFERÊNCIA'),
  })
  .refine((data) => data.armazemOrigemId !== data.armazemDestinoId, {
    message: 'Armazém de origem e destino não podem ser iguais.',
    path: ['armazemDestinoId'],
  });

export const baixaVendaLinhaSchema = z.object({
  artigoId: z.string().min(1),
  quantidade: z.coerce
    .number({ invalid_type_error: 'Quantidade deve ser um número.' })
    .int('A quantidade deve ser um número inteiro.')
    .positive('A quantidade deve ser superior a zero.'),
  precoUnitario: z.coerce.number().min(0).optional(),
});

export const baixaVendaStockSchema = z.object({
  armazemId: z.string().optional().nullable(),
  documentoOrigem: z.string().min(1, 'Documento de venda é obrigatório.'),
  linhas: z.array(baixaVendaLinhaSchema).min(1, 'Adicione pelo menos um item para baixa de stock.'),
});

export const linhaInventarioInputSchema = z.object({
  artigoId: z.string().min(1, 'Artigo é obrigatório.'),
  qtdContada: z.coerce.number().min(0, 'Quantidade contada não pode ser negativa.'),
  lote: z.string().trim().optional().nullable(),
});

export const criarInventarioSchema = z.object({
  numero: z.string().trim().max(50).optional(),
  data: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : new Date()), z.date()),
  armazemId: z.string({ required_error: 'Armazém é obrigatório.' }).min(1, 'Selecione o armazém.'),
  responsavel: z.string().trim().max(100).optional().nullable(),
  observacoes: z.string().max(1000).optional().nullable(),
  linhas: z.array(linhaInventarioInputSchema).min(1, 'Adicione pelo menos uma linha de contagem.'),
});

export const fecharInventarioSchema = z.object({
  inventarioId: z.string().min(1, 'ID de inventário obrigatório.'),
});

export const stockFiltersSchema = z.object({
  artigoId: z.string().trim().optional(),
  armazemId: z.string().trim().optional(),
  tipo: z.nativeEnum(TipoMovimentoStock).optional(),
  search: z.string().trim().optional(),
  dataInicio: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  dataFim: z.preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date().optional()),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).default(100).optional(),
});

/**
 * Filtros do painel de estado/alertas de stock.
 * `apenasAlertas` é opcional e, quando omisso, devolve o estado de todos os artigos
 * para que o utilizador veja sempre as quantidades actuais.
 */
export const stockEstadoFiltersSchema = z.object({
  apenasAlertas: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
  situacao: z.enum(['normal', 'stock_baixo', 'rutura', 'proximo_caducar', 'caducado']).optional(),
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(500).default(200).optional(),
});

/**
 * Filtros de listagem de inventários. Sem filtros devolve a lista completa,
 * para não quebrar o ecrã que hoje mostra todos os inventários.
 */
export const inventarioFiltersSchema = z.object({
  skip: z.coerce.number().min(0).default(0).optional(),
  take: z.coerce.number().min(1).max(200).optional(),
});

export type CreateMovimentoStockInput = z.infer<typeof createMovimentoStockSchema>;
export type TransferenciaStockInput = z.infer<typeof transferenciaStockSchema>;
export type BaixaVendaStockInput = z.infer<typeof baixaVendaStockSchema>;
export type CriarInventarioInput = z.infer<typeof criarInventarioSchema>;
export type StockFilters = z.infer<typeof stockFiltersSchema>;
export type StockEstadoFilters = z.infer<typeof stockEstadoFiltersSchema>;
export type InventarioFilters = z.infer<typeof inventarioFiltersSchema>;
