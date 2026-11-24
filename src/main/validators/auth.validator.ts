/**
 * @file auth.validator.ts
 * @description Schemas de validação Zod para autenticação e utilizadores.
 */

import { z } from 'zod';

export const loginSchema = z.object({
  login: z
    .string({ required_error: 'O utilizador é obrigatório.' })
    .trim()
    .min(3, 'O utilizador deve ter pelo menos 3 caracteres.')
    .max(50, 'O utilizador não pode exceder os 50 caracteres.'),
  password: z
    .string({ required_error: 'A senha é obrigatória.' })
    .min(6, 'A senha deve ter pelo menos 6 caracteres.')
    .max(100, 'A senha não pode exceder os 100 caracteres.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  login: z
    .string({ required_error: 'O login é obrigatório.' })
    .trim()
    .min(3, 'O login deve ter pelo menos 3 caracteres.')
    .max(50, 'O login não pode exceder os 50 caracteres.'),
  nomeCompleto: z
    .string({ required_error: 'O nome completo é obrigatório.' })
    .trim()
    .min(3, 'O nome completo deve ter pelo menos 3 caracteres.')
    .max(100, 'O nome não pode exceder os 100 caracteres.'),
  email: z
    .string({ required_error: 'O email é obrigatório.' })
    .trim()
    .email('Formato de email inválido.'),
  password: z
    .string({ required_error: 'A senha é obrigatória.' })
    .min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  perfilId: z.string({ required_error: 'O perfil de acesso é obrigatório.' }),
  armazemDefaultId: z.string().optional().nullable(),
  empresaConfigId: z.string().optional().nullable(),
  estado: z.enum(['ativo', 'inativo']).default('ativo'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'A senha atual é obrigatória.'),
  newPassword: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
