import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { RhImportacaoService } from './rh-importacao.service';
import type { AuditService } from './audit.service';
import { RhValidationError } from '../utils/rh-errors';

function criarMock() {
  const prisma = {
    rhDepartamento: { findMany: vi.fn() },
    rhCargo: { findMany: vi.fn() },
    rhFuncionario: { findMany: vi.fn(), create: vi.fn() },
    rhContrato: { findMany: vi.fn(), create: vi.fn() },
    rhSequencia: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[])
  );
  return prisma;
}

describe('RhImportacaoService (RH-208) — Funcionários', () => {
  let prisma: ReturnType<typeof criarMock>;
  let audit: { registarOperacao: ReturnType<typeof vi.fn> };
  let service: RhImportacaoService;

  beforeEach(() => {
    prisma = criarMock();
    audit = { registarOperacao: vi.fn(async () => 'log-1') };
    service = new RhImportacaoService(
      prisma as unknown as PrismaClient,
      audit as unknown as AuditService
    );
    prisma.rhDepartamento.findMany.mockResolvedValue([
      { id: 'dep-dir', codigo: 'DIR' },
      { id: 'dep-geral', codigo: 'GERAL' },
    ]);
    prisma.rhCargo.findMany.mockResolvedValue([{ id: 'car-1', codigo: 'ANALISTA' }]);
    prisma.rhFuncionario.findMany.mockResolvedValue([]);
    prisma.rhSequencia.upsert.mockImplementation(async () => ({ ultimo: 1 }));
    prisma.rhFuncionario.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 'novo',
      ...data,
    }));
  });

  it('pré-visualiza linhas válidas e inválidas sem escrever nada', async () => {
    const csv = [
      'nome;dataAdmissao;nif;departamentoCodigo;cargoCodigo;genero',
      'Ana Souza;2026-01-05;123456789;DIR;ANALISTA;FEMININO',
      'Bruno Reis;31/02/2026;;DIR;ANALISTA;OUTRO',
      'Carlos;2026-01-06;123456789;INE;N/A;ZEFE',
    ].join('\n');

    const preview = await service.previsualizar('FUNCIONARIOS', 'f.csv', csv, 'emp-1');

    expect(preview.totalLinhas).toBe(3);
    expect(preview.totalValidas).toBe(1);
    expect(preview.totalInvalidas).toBe(2);
    expect(preview.linhas[0].valida).toBe(true);
    expect(preview.linhas[0].resumo).toBe('Ana Souza');

    expect(preview.linhas[1].valida).toBe(false);
    expect(preview.linhas[1].erros.some((e) => e.campo === 'dataAdmissao')).toBe(true);

    expect(preview.linhas[2].valida).toBe(false);
    const camposCarlos = preview.linhas[2].erros.map((e) => e.campo);
    expect(camposCarlos).toContain('nif');
    expect(camposCarlos).toContain('departamentoCodigo');
    expect(camposCarlos).toContain('genero');

    expect(prisma.rhFuncionario.create).not.toHaveBeenCalled();
    expect(prisma.rhContrato.create).not.toHaveBeenCalled();
  });

  it('reconhece os rótulos canónicos das colunas como cabeçalhos (RH-806)', async () => {
    // Um utilizador exporta a lista do ecrã e importa-a tal como está: os
    // cabeçalhos vêm com os rótulos ("Data de admissão"), não com as chaves.
    const csv = [
      'Nome;Data de admissão;Departamento (código)',
      'Ana Souza;2026-01-05;DIR',
    ].join('\n');

    const preview = await service.previsualizar('FUNCIONARIOS', 'f.csv', csv, 'emp-1');

    expect(preview.colunasIgnoradas).toEqual([]);
    expect(preview.totalLinhas).toBe(1);
    expect(preview.totalValidas).toBe(1);
    expect(preview.totalInvalidas).toBe(0);
  });

  it('importa linhas válidas numa transacção com códigos sequenciais', async () => {
    prisma.rhSequencia.upsert
      .mockResolvedValueOnce({ id: 's', chave: 'FUNCIONARIO:emp-1', ultimo: 1 })
      .mockResolvedValueOnce({ id: 's', chave: 'FUNCIONARIO:emp-1', ultimo: 2 });
    const csv = ['nome;dataAdmissao;nif', 'Ana;2026-01-05;111', 'Bruno;2026-01-06;222'].join('\n');

    const resultado = await service.importar('FUNCIONARIOS', 'f.csv', csv, 'emp-1', 'u1');

    expect(resultado.importados).toBe(2);
    expect(resultado.ignorados).toBe(0);
    expect(prisma.rhFuncionario.create).toHaveBeenCalledTimes(2);
    expect(prisma.rhFuncionario.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ codigo: '001', nome: 'Ana' }) })
    );
    expect(prisma.rhFuncionario.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ codigo: '002', nome: 'Bruno' }) })
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.registarOperacao).toHaveBeenCalledTimes(1);
  });

  it('bloqueia a importação quando existem linhas inválidas sem autorização para ignorar', async () => {
    const csv = ['nome;dataAdmissao', 'Ana;2026-01-05', ';2026-01-06'].join('\n');

    await expect(service.importar('FUNCIONARIOS', 'f.csv', csv, 'emp-1', 'u1')).rejects.toBeInstanceOf(
      RhValidationError
    );
    expect(prisma.rhFuncionario.create).not.toHaveBeenCalled();
  });

  it('importa só as válidas quando `ignorarInvalidas` é verdadeiro', async () => {
    const csv = ['nome;dataAdmissao', 'Ana;2026-01-05', ';2026-01-06'].join('\n');

    const resultado = await service.importar('FUNCIONARIOS', 'f.csv', csv, 'emp-1', 'u1', {
      ignorarInvalidas: true,
    });

    expect(resultado.importados).toBe(1);
    expect(resultado.ignorados).toBe(1);
    expect(prisma.rhFuncionario.create).toHaveBeenCalledTimes(1);
  });

  it('rejeita ficheiros vazios e sem colunas reconhecidas', async () => {
    await expect(
      service.previsualizar('FUNCIONARIOS', 'f.csv', '', 'emp-1')
    ).rejects.toBeInstanceOf(RhValidationError);

    await expect(
      service.previsualizar('FUNCIONARIOS', 'f.csv', 'foo;bar\n1;2', 'emp-1')
    ).rejects.toBeInstanceOf(RhValidationError);
  });
});

describe('RhImportacaoService (RH-208) — Contratos', () => {
  let prisma: ReturnType<typeof criarMock>;
  let audit: { registarOperacao: ReturnType<typeof vi.fn> };
  let service: RhImportacaoService;

  beforeEach(() => {
    prisma = criarMock();
    audit = { registarOperacao: vi.fn(async () => 'log-1') };
    service = new RhImportacaoService(
      prisma as unknown as PrismaClient,
      audit as unknown as AuditService
    );
    prisma.rhFuncionario.findMany.mockResolvedValue([
      { id: 'f1', codigo: '001', nif: '111111111' },
      { id: 'f2', codigo: '002', nif: '222222222' },
    ]);
    prisma.rhContrato.findMany.mockResolvedValue([]);
    prisma.rhContrato.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 'novo-contrato',
      ...data,
    }));
  });

  it('pré-visualiza contratos e resolve o funcionário pelo código', async () => {
    const csv = [
      'funcionarioCodigo;tipo;salarioBase;dataInicio',
      '001;PRAZO_INDETERMINADO;150000,00;2026-01-01',
      '999;PRAZO_CERTO;120000;2026-02-01',
    ].join('\n');

    const preview = await service.previsualizar('CONTRATOS', 'c.csv', csv, 'emp-1');

    expect(preview.totalValidas).toBe(1);
    expect(preview.totalInvalidas).toBe(1);
    expect(preview.linhas[1].erros.some((e) => e.campo === 'funcionarioCodigo')).toBe(true);
    expect(prisma.rhContrato.create).not.toHaveBeenCalled();
  });

  it('recusa um segundo contrato ativo para o mesmo funcionário', async () => {
    prisma.rhContrato.findMany.mockResolvedValue([{ funcionarioId: 'f1' }]);
    const csv = [
      'funcionarioCodigo;tipo;salarioBase;dataInicio',
      '001;PRAZO_INDETERMINADO;150000;2026-01-01',
      '002;PRAZO_CERTO;120000;2026-02-01',
    ].join('\n');

    const preview = await service.previsualizar('CONTRATOS', 'c.csv', csv, 'emp-1');

    expect(preview.linhas[0].valida).toBe(false);
    expect(preview.linhas[0].erros.some((e) => e.mensagem.includes('ativo'))).toBe(true);
    expect(preview.linhas[1].valida).toBe(true);
  });

  it('resolve pelo NIF e importa os contratos numa transacção', async () => {
    const csv = [
      'nif;tipo;salarioBase;dataInicio',
      '111111111;PRAZO_INDETERMINADO;150000;2026-01-01',
      '222222222;PRAZO_CERTO;120000;2026-02-01',
    ].join('\n');

    const resultado = await service.importar('CONTRATOS', 'c.csv', csv, 'emp-1', 'u1');

    expect(resultado.importados).toBe(2);
    expect(prisma.rhContrato.create).toHaveBeenCalledTimes(2);
    expect(prisma.rhContrato.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ funcionarioId: 'f1' }) })
    );
    expect(prisma.rhContrato.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ funcionarioId: 'f2' }) })
    );
  });
});