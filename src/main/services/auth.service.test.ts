import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { UtilizadorService } from './utilizador.service';
import { UnauthorizedError, ValidationError, ConflictError } from '../utils/errors';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let mockPrisma: any;
  let authService: AuthService;

  beforeEach(() => {
    mockPrisma = {
      utilizador: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      perfilAcesso: {
        findUnique: vi.fn().mockResolvedValue({ id: 'perfil-1', nome: 'Gestor' }),
      },
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'empresa-1', nome: 'Empresa Teste' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', nome: 'DoraERP Soluções, Lda.', nif: '599999990' }),
      },
    };
    authService = new AuthService(mockPrisma, new UtilizadorService(mockPrisma));
  });

  describe('hashPassword & comparePassword', () => {
    it('deve gerar um hash bcrypt válido e comparar corretamente', async () => {
      const password = 'minhaSenhaSegura123';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);

      const isValid = await authService.comparePassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await authService.comparePassword('senhaErrada', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('login', () => {
    it('deve efetuar login com sucesso com credenciais válidas', async () => {
      const passwordHash = await bcrypt.hash('senha123', 10);
      mockPrisma.utilizador.findUnique.mockResolvedValue({
        id: 'u-1',
        login: 'ana.marques',
        nomeCompleto: 'Ana Marques',
        email: 'ana@doraerp.local',
        passwordHash,
        estado: 'ativo',
        perfilId: 'p-1',
        armazemDefaultId: 'arm-1',
        empresaConfigId: 'emp-1',
        perfil: {
          id: 'p-1',
          nome: 'Vendedor',
          permissoesJson: JSON.stringify({ vendas: ['read', 'write'] }),
        },
      });

      const session = await authService.login({
        login: 'ana.marques',
        password: 'senha123',
      });

      expect(session).toBeDefined();
      expect(session.login).toBe('ana.marques');
      expect(session.perfilNome).toBe('Vendedor');
      expect(session.permissoes).toEqual({ vendas: ['read', 'write'] });
      expect(authService.getCurrentSession()).toEqual(session);
    });

    it('deve lançar UnauthorizedError se utilizador não for encontrado', async () => {
      mockPrisma.utilizador.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ login: 'inexistente', password: 'senha123' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('deve lançar UnauthorizedError se senha for incorreta', async () => {
      const passwordHash = await bcrypt.hash('senhaCorreta', 10);
      mockPrisma.utilizador.findUnique.mockResolvedValue({
        id: 'u-1',
        login: 'admin',
        nomeCompleto: 'Admin',
        email: 'admin@doraerp.local',
        passwordHash,
        estado: 'ativo',
        perfilId: 'p-1',
        perfil: { nome: 'Administrador', permissoesJson: '{"*":true}' },
      });

      await expect(
        authService.login({ login: 'admin', password: 'senhaErrada' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('deve lançar UnauthorizedError se utilizador estiver inativo', async () => {
      const passwordHash = await bcrypt.hash('senha123', 10);
      mockPrisma.utilizador.findUnique.mockResolvedValue({
        id: 'u-1',
        login: 'bloqueado',
        nomeCompleto: 'Bloqueado',
        email: 'bloq@doraerp.local',
        passwordHash,
        estado: 'inativo',
        perfilId: 'p-1',
        perfil: { nome: 'Operador', permissoesJson: '{}' },
      });

      await expect(
        authService.login({ login: 'bloqueado', password: 'senha123' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('deve lançar ValidationError para inputs inválidos', async () => {
      await expect(
        authService.login({ login: 'ab', password: '123' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('logout', () => {
    it('deve limpar a sessão ativa no logout', async () => {
      authService.setSession({
        id: 'u-1',
        login: 'admin',
        nomeCompleto: 'Admin',
        email: 'admin@doraerp.local',
        perfilId: 'p-1',
        perfilNome: 'Administrador',
        permissoes: { '*': true },
      });

      expect(authService.getCurrentSession()).not.toBeNull();
      await authService.logout();
      expect(authService.getCurrentSession()).toBeNull();
    });
  });

  describe('createUser', () => {
    it('deve criar novo utilizador com senha hashada', async () => {
      mockPrisma.utilizador.findUnique.mockResolvedValue(null);
      mockPrisma.utilizador.create.mockResolvedValue({
        id: 'u-novo',
        login: 'carlos.silva',
      });

      const newUser = await authService.createUser({
        login: 'carlos.silva',
        nomeCompleto: 'Carlos Silva',
        email: 'carlos@doraerp.local',
        password: 'password123',
        perfilId: 'perfil-1',
        empresaConfigId: 'empresa-1',
        estado: 'ativo',
      });

      expect(newUser.id).toBe('u-novo');
      expect(newUser.login).toBe('carlos.silva');
      expect(mockPrisma.utilizador.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            login: 'carlos.silva',
            nomeCompleto: 'Carlos Silva',
            email: 'carlos@doraerp.local',
            passwordHash: expect.stringMatching(/^\$2/),
          }),
        })
      );
    });

    it('deve lançar ConflictError se o login já existir', async () => {
      mockPrisma.utilizador.findUnique.mockResolvedValueOnce({ id: 'u-existente' });

      await expect(
        authService.createUser({
          login: 'existente',
          nomeCompleto: 'Nome',
          email: 'novo@doraerp.local',
          password: 'password123',
          perfilId: 'perfil-1',
          empresaConfigId: 'empresa-1',
          estado: 'ativo',
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});
