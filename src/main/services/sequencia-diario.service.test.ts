import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SequenciaDiarioService } from './sequencia-diario.service';
import { ValidationError } from '../utils/errors';

describe('SequenciaDiarioService', () => {
  let mockPrisma: any;
  let service: SequenciaDiarioService;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
      sequenciaDiario: { findUnique: vi.fn() },
    };
    service = new SequenciaDiarioService(mockPrisma);
  });

  it('cria sequência e devolve 1 na primeira chamada', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ultimo_numero: 1 }]);

    const numero = await service.proximoNumero('diario-1', 'ex-1');

    expect(numero).toBe(1);
  });

  it('incrementa a sequência em chamadas subsequentes', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ ultimo_numero: 1 }])
      .mockResolvedValueOnce([{ ultimo_numero: 2 }])
      .mockResolvedValueOnce([{ ultimo_numero: 3 }]);

    const n1 = await service.proximoNumero('diario-1', 'ex-1');
    const n2 = await service.proximoNumero('diario-1', 'ex-1');
    const n3 = await service.proximoNumero('diario-1', 'ex-1');

    expect(n1).toBe(1);
    expect(n2).toBe(2);
    expect(n3).toBe(3);
  });

  it('rejeita diário vazio', async () => {
    await expect(service.proximoNumero('', 'ex-1')).rejects.toThrow(ValidationError);
  });

  it('rejeita exercício vazio', async () => {
    await expect(service.proximoNumero('diario-1', '')).rejects.toThrow(ValidationError);
  });

  it('obterUltimoNumero devolve 0 quando não existe', async () => {
    mockPrisma.sequenciaDiario.findUnique.mockResolvedValue(null);

    const n = await service.obterUltimoNumero('diario-1', 'ex-1');
    expect(n).toBe(0);
  });

  it('obterUltimoNumero devolve o valor guardado', async () => {
    mockPrisma.sequenciaDiario.findUnique.mockResolvedValue({ ultimoNumero: 42 });

    const n = await service.obterUltimoNumero('diario-1', 'ex-1');
    expect(n).toBe(42);
  });
});