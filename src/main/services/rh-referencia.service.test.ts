import { describe, it, expect, vi } from 'vitest';
import {
  CARGOS_REFERENCIA,
  DEPARTAMENTOS_REFERENCIA,
  semearDepartamentosECargos,
  type PrismaRhReferencia,
} from './rh-referencia.service';

function prismaFake(contagens = { departamentos: 8, cargos: 13 }): {
  prisma: PrismaRhReferencia;
  criarDepartamentos: ReturnType<typeof vi.fn>;
  criarCargos: ReturnType<typeof vi.fn>;
} {
  const criarDepartamentos = vi.fn(async () => ({ count: contagens.departamentos }));
  const criarCargos = vi.fn(async () => ({ count: contagens.cargos }));

  return {
    prisma: {
      rhDepartamento: { createMany: criarDepartamentos },
      rhCargo: { createMany: criarCargos },
    } as unknown as PrismaRhReferencia,
    criarDepartamentos,
    criarCargos,
  };
}

describe('rh-referencia.service (RH-806)', () => {
  it('cria os departamentos e cargos de referência com skipDuplicates', async () => {
    const { prisma, criarDepartamentos, criarCargos } = prismaFake();

    const resultado = await semearDepartamentosECargos(prisma, 'emp-1');

    expect(resultado).toEqual({ departamentosCriados: 8, cargosCriados: 13 });
    expect(criarDepartamentos).toHaveBeenCalledWith({
      data: DEPARTAMENTOS_REFERENCIA.map((d) => ({ ...d, empresaId: 'emp-1' })),
      skipDuplicates: true,
    });
    expect(criarCargos).toHaveBeenCalledWith({
      data: CARGOS_REFERENCIA.map((c) => ({ ...c, empresaId: 'emp-1' })),
      skipDuplicates: true,
    });
  });

  it('devolve zero quando os registos já existem (idempotente)', async () => {
    const { prisma } = prismaFake({ departamentos: 0, cargos: 0 });

    const resultado = await semearDepartamentosECargos(prisma, 'emp-1');

    expect(resultado).toEqual({ departamentosCriados: 0, cargosCriados: 0 });
  });

  it('não tem códigos duplicados nas listas de referência', () => {
    const codigosDepartamentos = DEPARTAMENTOS_REFERENCIA.map((d) => d.codigo);
    const codigosCargos = CARGOS_REFERENCIA.map((c) => c.codigo);

    expect(new Set(codigosDepartamentos).size).toBe(codigosDepartamentos.length);
    expect(new Set(codigosCargos).size).toBe(codigosCargos.length);
  });
});
