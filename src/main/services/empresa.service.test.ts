import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmpresaService } from './empresa.service';
import { ValidationError } from '../utils/errors';

describe('EmpresaService', () => {
  let mockPrisma: any;
  let service: EmpresaService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new EmpresaService(mockPrisma);
  });

  it('deve obter a empresa ativa', async () => {
    mockPrisma.empresaConfig.findFirst.mockResolvedValue({
      id: 'emp-1',
      nome: 'DoraERP Soluções, Lda.',
      nif: '599999990',
    });

    const res = await service.getEmpresa();
    expect(res).toBeDefined();
    expect(res?.nome).toBe('DoraERP Soluções, Lda.');
  });

  it('deve listar todas as empresas', async () => {
    mockPrisma.empresaConfig.findMany.mockResolvedValue([
      { id: 'emp-1', nome: 'Empresa 1', nif: '5001' },
      { id: 'emp-2', nome: 'Empresa 2', nif: '5002' },
    ]);

    const res = await service.listEmpresas();
    expect(res).toHaveLength(2);
    expect(mockPrisma.empresaConfig.findMany).toHaveBeenCalled();
  });

  it('deve lançar ValidationError se campos obrigatórios estiverem em falta ao criar empresa', async () => {
    await expect(
      service.createEmpresa({
        nome: '',
        nif: '',
        pais: 'PT',
        regimeIva: 'geral',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('deve criar uma nova empresa com sucesso', async () => {
    mockPrisma.empresaConfig.findUnique.mockResolvedValue(null);
    mockPrisma.empresaConfig.create.mockResolvedValue({
      id: 'emp-new',
      identificador: 'EMP01',
      nome: 'Empresa Teste, Lda.',
      nif: '500123456',
      pais: 'PT',
      moedaBase: 'EUR',
    });

    const res = await service.createEmpresa({
      identificador: 'EMP01',
      nome: 'Empresa Teste, Lda.',
      nif: '500123456',
      pais: 'PT',
      regimeIva: 'geral',
      moedaBase: 'EUR',
      modulos: ['vendas', 'financas'],
    });

    expect(res.id).toBe('emp-new');
    expect(mockPrisma.empresaConfig.create).toHaveBeenCalled();
  });

  it('deve lançar erro se NIF já existir', async () => {
    mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-exist', nif: '500123456' });

    await expect(
      service.createEmpresa({
        nome: 'Empresa Duplicada',
        nif: '500123456',
        pais: 'PT',
        regimeIva: 'geral',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('deve atualizar empresa existente', async () => {
    mockPrisma.empresaConfig.findUnique
      .mockResolvedValueOnce({ id: 'emp-1', nome: 'Nome Antigo', nif: '500123456' })
      .mockResolvedValueOnce(null); // verificação de NIF duplicado

    mockPrisma.empresaConfig.update.mockResolvedValue({
      id: 'emp-1',
      nome: 'Nome Atualizado',
      nif: '500123456',
    });

    const res = await service.updateEmpresa('emp-1', {
      nome: 'Nome Atualizado',
      nif: '500123456',
      pais: 'PT',
      regimeIva: 'geral',
    });

    expect(res.nome).toBe('Nome Atualizado');
    expect(mockPrisma.empresaConfig.update).toHaveBeenCalled();
  });

  it('deve eliminar empresa existente', async () => {
    mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1', nome: 'Empresa' });
    mockPrisma.empresaConfig.delete.mockResolvedValue({ id: 'emp-1' });

    const res = await service.deleteEmpresa('emp-1');
    expect(res.id).toBe('emp-1');
    expect(mockPrisma.empresaConfig.delete).toHaveBeenCalledWith({ where: { id: 'emp-1' } });
  });
});

