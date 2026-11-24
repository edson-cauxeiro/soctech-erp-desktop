/**
 * @file utilizador.validator.ts
 * @description Schemas de validação Zod para a gestão de utilizadores, perfis de acesso e matriz de permissões (RNF03).
 */

import { z } from 'zod';

import { MODULOS_RBAC, ACOES_RBAC } from '../constants/permissions.constants';

/** Módulos e acções suportados pela matriz de permissões. */
export const moduloSchema = z.enum(MODULOS_RBAC);
export const acaoSchema = z.enum(ACOES_RBAC);

/**
 * Matriz de permissões: `{ vendas: ['read', 'write'], ... }`.
 * Aceita também `true` (acesso total ao módulo) e `'*'` dentro do array.
 */
export const permissoesSchema = z.record(
  moduloSchema,
  z.union([z.boolean(), z.array(z.union([acaoSchema, z.literal('*')]))])
);

export type PermissoesInput = z.infer<typeof permissoesSchema>;

export const estadoUtilizadorSchema = z.enum(['ativo', 'inativo']);

/** Filtros de listagem de utilizadores. */
export const listarUtilizadoresSchema = z.object({
  search: z.string().trim().max(100).optional(),
  perfilId: z.string().trim().min(1).optional(),
  estado: estadoUtilizadorSchema.optional(),
  empresaConfigId: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(500).optional().default(100),
  skip: z.coerce.number().int().min(0).optional().default(0),
});

export type ListarUtilizadoresInput = z.infer<typeof listarUtilizadoresSchema>;

/** Criação de utilizador: senha obrigatória. */
export const criarUtilizadorSchema = z.object({
  login: z
    .string({ required_error: 'O login é obrigatório.' })
    .trim()
    .min(3, 'O login deve ter pelo menos 3 caracteres.')
    .max(50, 'O login não pode exceder os 50 caracteres.')
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'O login só pode conter letras, números, ponto, hífen e underscore.'
    ),
  nomeCompleto: z
    .string({ required_error: 'O nome completo é obrigatório.' })
    .trim()
    .min(3, 'O nome completo deve ter pelo menos 3 caracteres.')
    .max(100, 'O nome não pode exceder os 100 caracteres.'),
  email: z
    .string({ required_error: 'O email é obrigatório.' })
    .trim()
    .toLowerCase()
    .email('Formato de email inválido.'),
  password: z
    .string({ required_error: 'A senha é obrigatória.' })
    .min(6, 'A senha deve ter pelo menos 6 caracteres.')
    .max(100, 'A senha não pode exceder os 100 caracteres.'),
  perfilId: z.string({ required_error: 'O perfil de acesso é obrigatório.' }).trim().min(1),
  empresaConfigId: z
    .string({ required_error: 'A empresa é obrigatória.' })
    .trim()
    .min(1, 'A empresa é obrigatória.'),
  armazemDefaultId: z.string().trim().min(1).optional().nullable(),
  telefone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  estado: estadoUtilizadorSchema.optional().default('ativo'),
});

export type CriarUtilizadorInput = z.infer<typeof criarUtilizadorSchema>;

/**
 * Actualização de utilizador: a senha é omitível (só muda quando enviada).
 * O perfil e a empresa podem ser alterados, mas o serviço valida as invariantes.
 */
export const atualizarUtilizadorSchema = z.object({
  login: z
    .string()
    .trim()
    .min(3, 'O login deve ter pelo menos 3 caracteres.')
    .max(50, 'O login não pode exceder os 50 caracteres.')
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'O login só pode conter letras, números, ponto, hífen e underscore.'
    )
    .optional(),
  nomeCompleto: z.string().trim().min(3, 'O nome completo deve ter pelo menos 3 caracteres.').max(100).optional(),
  email: z.string().trim().toLowerCase().email('Formato de email inválido.').optional(),
  password: z
    .string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres.')
    .max(100, 'A senha não pode exceder os 100 caracteres.')
    .optional(),
  perfilId: z.string().trim().min(1).optional(),
  empresaConfigId: z.string().trim().min(1).optional(),
  armazemDefaultId: z.string().trim().min(1).nullable().optional(),
  telefone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  estado: estadoUtilizadorSchema.optional(),
});

export type AtualizarUtilizadorInput = z.infer<typeof atualizarUtilizadorSchema>;

/** Alteração de senha pelo próprio utilizador. */
export const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'A senha atual é obrigatória.'),
  novaSenha: z
    .string()
    .min(6, 'A nova senha deve ter pelo menos 6 caracteres.')
    .max(100, 'A senha não pode exceder os 100 caracteres.'),
});

export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;

/** Reposição de senha por administrador: não exige a senha atual. */
export const reporSenhaSchema = z.object({
  novaSenha: z
    .string({ required_error: 'A nova senha é obrigatória.' })
    .min(6, 'A nova senha deve ter pelo menos 6 caracteres.')
    .max(100, 'A nova senha não pode exceder os 100 caracteres.'),
});

export type ReporSenhaInput = z.infer<typeof reporSenhaSchema>;

/** Perfis de acesso ------------------------------------------------------- */

export const criarPerfilSchema = z.object({
  nome: z
    .string({ required_error: 'O nome do perfil é obrigatório.' })
    .trim()
    .min(2, 'O nome do perfil deve ter pelo menos 2 caracteres.')
    .max(50, 'O nome não pode exceder os 50 caracteres.'),
  descricao: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  permissoes: permissoesSchema.optional().default({}),
});

export type CriarPerfilInput = z.infer<typeof criarPerfilSchema>;

export const atualizarPerfilSchema = z.object({
  nome: z.string().trim().min(2, 'O nome do perfil deve ter pelo menos 2 caracteres.').max(50).optional(),
  descricao: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  permissoes: permissoesSchema.optional(),
});

export type AtualizarPerfilInput = z.infer<typeof atualizarPerfilSchema>;
