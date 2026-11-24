import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExercicioService } from './exercicio.service';
import { ValidationError, NotFoundError } from '../utils/errors';

describe('ExercicioService', () => {
  let mockPrisma: any;
  let service: ExercicioService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn(),
      },
      exercicioFiscal: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new ExercicioService(mockPrisma);
  });

  it('deve listar exercícios fiscais', async () => {
    mockPrisma.exercicioFiscal.findMany.mockResolvedValue([
      { id: 'ex-1', ano: '2026', empresaId: 'emp-1' },
    ]);

    const res = await service.listExercicios();
    expect(res).toHaveLength(1);
    expect(res[0].ano).toBe('2026');
  });

  it('deve lançar ValidationError se campos obrigatórios faltarem ao criar exercício', async () => {
    await expect(
      service.createExercicio({
        ano: '',
        empresaId: '',
        dataInicio: '',
        dataFim: '',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('deve lançar NotFoundError se a empresa selecionada não existir', async () => {
    mockPrisma.empresaConfig.findUnique.mockResolvedValue(null);

    await expect(
      service.createExercicio({
        ano: '2026',
        empresaId: 'emp-invalida',
        dataInicio: '2026-01-01',
        dataFim: '2026-12-31',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('deve criar exercício fiscal com sucesso', async () => {
    mockPrisma.empresaConfig.findUnique.mockResolvedValue({ id: 'emp-1', nome: 'Empresa Teste' });
    mockPrisma.exercicioFiscal.findUnique.mockResolvedValue(null);
    mockPrisma.exercicioFiscal.create.mockResolvedValue({
      id: 'ex-new',
      ano: '2026',
      empresaId: 'emp-1',
      estado: 'aberto',
    });

    const res = await service.createExercicio({
      ano: '2026',
      empresaId: 'emp-1',
      modulos: ['vendas', 'financas'],
      dataInicio: '2026-01-01',
      dataFim: '2026-12-31',
    });

    expect(res.id).toBe('ex-new');
    expect(res.ano).toBe('2026');
    expect(mockPrisma.exercicioFiscal.create).toHaveBeenCalled();
  });
});
