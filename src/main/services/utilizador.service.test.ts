import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UtilizadorService } from './utilizador.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import bcrypt from 'bcryptjs';

describe('UtilizadorService', () => {
  let mockPrisma: any;
  let service: UtilizadorService;

  beforeEach(() => {
    mockPrisma = {
      utilizador: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      perfilAcesso: {
        findUnique: vi.fn(),
      },
      empresaConfig: {
        findUnique: vi.fn(),
      },
      armazem: {
        findUnique: vi.fn(),
      },
    };
    service = new UtilizadorService(mockPrisma);
  });

  describe('reporSenha', () => {
    it('reponha a senha sem exigir a senha atual', async () => {
      mockPrisma.utilizador.findUnique.mockResolvedValue({ id: 'u-1' });
      mockPrisma.utilizador.update.mockResolvedValue({ id: 'u-1' });

      const result = await service.reporSenha('u-1', { novaSenha: 'nova-senha-segura' });

      expect(result.id).toBe('u-1');
      const atualizacao = mockPrisma.utilizador.update.mock.calls[0][0];
      expect(atualizacao.data.passwordHash).not.toBe('nova-senha-segura');
      expect(await bcrypt.compare('nova-senha-segura', atualizacao.data.passwordHash)).toBe(true);
    });

    it('lança NotFoundError quando o utilizador não existe', async () => {
      mockPrisma.utilizador.findUnique.mockResolvedValue(null);

      await expect(service.reporSenha('u-inexistente', { novaSenha: 'nova-senha-segura' })).rejects.toThrow(
        NotFoundError
      );
    });

    it('lança ValidationError com nova senha demasiado curta', async () => {
      mockPrisma.utilizador.findUnique.mockResolvedValue({ id: 'u-1' });

      await expect(service.reporSenha('u-1', { novaSenha: '123' })).rejects.toThrow(ValidationError);
    });
  });

  describe('criar', () => {
    it('lança ValidationError quando a empresa é omitida', async () => {
      await expect(
        service.criar({
          login: 'novo.utilizador',
          nomeCompleto: 'Novo Utilizador',
          email: 'novo@empresa.ao',
          password: 'segredo123',
          perfilId: 'p-1',
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});