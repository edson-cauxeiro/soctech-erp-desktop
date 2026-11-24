import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { RhFuncionarioService } from './rh-funcionario.service';
import type { AuditService } from './audit.service';
import { RhBusinessRuleError, RhNotFoundError } from '../utils/rh-errors';

function criarMock() {
  const prisma = {
    rhFuncionario: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    rhSequencia: { upsert: vi.fn() },
    rhDepartamento: { findFirst: vi.fn() },
    rhCargo: { findFirst: vi.fn() },
    rhRubrica: { findFirst: vi.fn() },
    rhDependente: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    rhFuncionarioRubrica: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    rhFuncionarioDocumento: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[])
  );
  return prisma;
}

describe('RhFuncionarioService (RH-201)', () => {
  let prisma: ReturnType<typeof criarMock>;
  let audit: { registarOperacao: ReturnType<typeof vi.fn> };
  let service: RhFuncionarioService;

  beforeEach(() => {
    prisma = criarMock();
    audit = { registarOperacao: vi.fn(async () => 'log-1') };
    service = new RhFuncionarioService(
      prisma as unknown as PrismaClient,
      audit as unknown as AuditService
    );
  });

  it('gera códigos sequenciais por empresa (001, 002) e audita cada criação', async () => {
    prisma.rhSequencia.upsert
      .mockResolvedValueOnce({ id: 's1', chave: 'FUNCIONARIO:emp-1', ultimo: 1 })
      .mockResolvedValueOnce({ id: 's1', chave: 'FUNCIONARIO:emp-1', ultimo: 2 });
    prisma.rhDepartamento.findFirst.mockResolvedValue(null);
    prisma.rhCargo.findFirst.mockResolvedValue(null);
    prisma.rhFuncionario.create.mockImplementation(async ({ data }: { data: { codigo: string } }) => ({
      id: `f-${data.codigo}`,
      ...data,
    }));

    const primeiro = await service.criar(
      { nome: 'Ana', dataAdmissao: new Date('2026-01-05') },
      'emp-1',
      'u1'
    );
    const segundo = await service.criar(
      { nome: 'Bruno', dataAdmissao: new Date('2026-01-06') },
      'emp-1',
      'u1'
    );

    expect(primeiro.codigo).toBe('001');
    expect(segundo.codigo).toBe('002');
    expect(prisma.rhSequencia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chave: 'FUNCIONARIO:emp-1' },
        update: { ultimo: { increment: 1 } },
      })
    );
    expect(audit.registarOperacao).toHaveBeenCalledTimes(2);
    expect(audit.registarOperacao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'criar', entidade: 'RhFuncionario', modulo: 'rh' })
    );
  });

  it('recusa departamento inexistente ou de outra empresa', async () => {
    prisma.rhDepartamento.findFirst.mockResolvedValue(null);

    await expect(
      service.criar(
        { nome: 'Ana', dataAdmissao: new Date('2026-01-05'), departamentoId: 'dep-inexistente' },
        'emp-1',
        'u1'
      )
    ).rejects.toBeInstanceOf(RhBusinessRuleError);
  });

  it('inativa sem eliminar e regista auditoria', async () => {
    prisma.rhFuncionario.findFirst.mockResolvedValue({
      id: 'f1',
      codigo: '001',
      nome: 'Ana',
      estado: 'ATIVO',
    });
    prisma.rhFuncionario.update.mockResolvedValue({
      id: 'f1',
      codigo: '001',
      nome: 'Ana',
      estado: 'INATIVO',
    });

    const atualizado = await service.inativar('f1', 'emp-1', 'u1');

    expect(atualizado.estado).toBe('INATIVO');
    expect(prisma.rhFuncionario.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1' }, data: { estado: 'INATIVO' } })
    );
    expect(prisma.rhFuncionario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1', empresaId: 'emp-1' } })
    );
  });

  it('recusa inativar um funcionário já inativo', async () => {
    prisma.rhFuncionario.findFirst.mockResolvedValue({ id: 'f1', codigo: '001', estado: 'INATIVO' });

    await expect(service.inativar('f1', 'emp-1', 'u1')).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
  });

  it('lança erro claro quando o funcionário não existe', async () => {
    prisma.rhFuncionario.findFirst.mockResolvedValue(null);

    await expect(service.obterDetalhe('inexistente', 'emp-1')).rejects.toBeInstanceOf(
      RhNotFoundError
    );
  });

  it('filtra a listagem por empresa e estado com paginação', async () => {
    prisma.rhFuncionario.count.mockResolvedValue(2);
    prisma.rhFuncionario.findMany.mockResolvedValue([{ id: 'f1' }]);

    const resultado = await service.listar(
      { skip: 0, take: 50, estado: 'ATIVO' },
      'emp-1'
    );

    expect(resultado.total).toBe(2);
    expect(resultado.items).toHaveLength(1);
    expect(prisma.rhFuncionario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresaId: 'emp-1', estado: 'ATIVO' }, skip: 0, take: 50 })
    );
  });

  it('guarda os dados anteriores na auditoria da atualização', async () => {
    prisma.rhFuncionario.findFirst.mockResolvedValue({
      id: 'f1',
      codigo: '001',
      nome: 'Ana',
      estado: 'ATIVO',
    });
    prisma.rhFuncionario.update.mockResolvedValue({
      id: 'f1',
      codigo: '001',
      nome: 'Ana Silva',
      estado: 'ATIVO',
    });

    await service.atualizar('f1', { nome: 'Ana Silva' }, 'emp-1', 'u1');

    expect(audit.registarOperacao).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'actualizar',
        dadosAnteriores: expect.objectContaining({ nome: 'Ana' }),
        dadosNovos: expect.objectContaining({ nome: 'Ana Silva' }),
      })
    );
  });

  it('exige empresa associada à sessão', async () => {
    await expect(service.listar({ skip: 0, take: 50 }, null)).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
  });

  describe('dependentes e dados da ficha (RH-203)', () => {
    it('cria dependente após validar que o funcionário pertence à empresa', async () => {
      prisma.rhFuncionario.findFirst.mockResolvedValue({ id: 'f1' });
      prisma.rhDependente.create.mockImplementation(async ({ data }: { data: object }) => ({
        id: 'd1',
        ...data,
      }));

      const criado = await service.criarDependente(
        'f1',
        { nome: 'Filho', parentesco: 'FILHO' },
        'emp-1',
        'u1'
      );

      expect(criado.id).toBe('d1');
      expect(prisma.rhFuncionario.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'f1', empresaId: 'emp-1' } })
      );
      expect(audit.registarOperacao).toHaveBeenCalledWith(
        expect.objectContaining({ entidade: 'RhDependente', acao: 'criar' })
      );
    });

    it('recusa dependente de funcionário de outra empresa', async () => {
      prisma.rhFuncionario.findFirst.mockResolvedValue(null);

      await expect(
        service.criarDependente('f1', { nome: 'Filho', parentesco: 'FILHO' }, 'emp-1', 'u1')
      ).rejects.toBeInstanceOf(RhNotFoundError);
    });

    it('recusa rubrica fixa cuja rubrica é de outra empresa', async () => {
      prisma.rhFuncionario.findFirst.mockResolvedValue({ id: 'f1' });
      prisma.rhRubrica.findFirst.mockResolvedValue(null);

      await expect(
        service.criarRubricaFixa(
          'f1',
          { rubricaId: 'rub-inexistente', dataInicio: '2026-01-01' },
          'emp-1',
          'u1'
        )
      ).rejects.toBeInstanceOf(RhBusinessRuleError);
    });

    it('anexa documento ao funcionário e audita', async () => {
      prisma.rhFuncionario.findFirst.mockResolvedValue({ id: 'f1' });
      prisma.rhFuncionarioDocumento.create.mockImplementation(
        async ({ data }: { data: object }) => ({ id: 'doc1', ...data })
      );

      const criado = await service.criarDocumento(
        'f1',
        { tipo: 'BI', caminho: 'C:/docs/bi.pdf' },
        'emp-1',
        'u1'
      );

      expect(criado.id).toBe('doc1');
      expect(audit.registarOperacao).toHaveBeenCalledWith(
        expect.objectContaining({ entidade: 'RhFuncionarioDocumento', acao: 'criar' })
      );
    });

    it('remove dependente existente na empresa', async () => {
      prisma.rhDependente.findFirst.mockResolvedValue({
        id: 'd1',
        funcionarioId: 'f1',
        nome: 'Filho',
      });
      prisma.rhDependente.delete.mockResolvedValue({ id: 'd1' });

      const resultado = await service.removerDependente('d1', 'emp-1', 'u1');

      expect(resultado).toEqual({ id: 'd1' });
      expect(prisma.rhDependente.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    });
  });
});
