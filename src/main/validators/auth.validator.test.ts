import { describe, it, expect } from 'vitest';
import { loginSchema, createUserSchema, changePasswordSchema } from './auth.validator';

describe('Auth Validators (Zod Schemas)', () => {
  describe('loginSchema', () => {
    it('deve aceitar credenciais válidas', () => {
      const result = loginSchema.safeParse({
        login: 'ana.marques',
        password: 'senha123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.login).toBe('ana.marques');
        expect(result.data.password).toBe('senha123');
      }
    });

    it('deve rejeitar utilizador curto (<3 caracteres)', () => {
      const result = loginSchema.safeParse({
        login: 'ab',
        password: 'senha123',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar senha curta (<6 caracteres)', () => {
      const result = loginSchema.safeParse({
        login: 'admin',
        password: '123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createUserSchema', () => {
    it('deve validar criação de utilizador válido', () => {
      const result = createUserSchema.safeParse({
        login: 'novo.utilizador',
        nomeCompleto: 'Novo Utilizador',
        email: 'novo@doraerp.local',
        password: 'passwordSegura123',
        perfilId: 'perfil-uuid-1',
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar email inválido', () => {
      const result = createUserSchema.safeParse({
        login: 'novo.utilizador',
        nomeCompleto: 'Novo Utilizador',
        email: 'email-invalido',
        password: 'passwordSegura123',
        perfilId: 'perfil-uuid-1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('deve validar troca de senha com dados válidos', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'antigaSenha1',
        newPassword: 'novaSenhaForte123',
      });
      expect(result.success).toBe(true);
    });
  });
});
