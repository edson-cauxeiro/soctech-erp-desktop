import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { RhConfiguracaoService } from './rh-configuracao.service';
import type { AuditService } from './audit.service';
import { RhNotFoundError, RhBusinessRuleError } from '../utils/rh-errors';

interface ParametroMock {
  id: string;
  chave: string;
  valor: string;
  tipoValor: string;
  descricao: string | null;
  vigenteDesde: Date;
  vigenteAte: Date | null;
}

function parametro(
  chave: string,
  valor: string,
  tipoValor: string,
  vigenteDesde: string,
  vigenteAte: string | null
): ParametroMock {
  return {
    id: `${chave}-${vigenteDesde}`,
    chave,
    valor,
    tipoValor,
    descricao: null,
    vigenteDesde: new Date(vigenteDesde),
    vigenteAte: vigenteAte ? new Date(vigenteAte) : null,
  };
}

describe('RhConfiguracaoService — vigência (RH-106)', () => {
  let parametros: ParametroMock[];
  let tabelas: Array<Record<string, unknown>>;
  let service: RhConfiguracaoService;

  beforeEach(() => {
    parametros = [];
    tabelas = [];
    const prismaMock = {
      rhParametroFiscal: {
        findMany: vi.fn(async () =>
          [...parametros].sort((a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime())
        ),
      },
      rhTabelaIRT: {
        findMany: vi.fn(async () => [...tabelas]),
      },
    } as unknown as PrismaClient;
    service = new RhConfiguracaoService(prismaMock);
  });

  it('devolve a versão do parâmetro vigente na data indicada', async () => {
    parametros = [
      parametro('INSS_TRAB', '3', 'DECIMAL', '2025-01-01', '2025-06-30'),
      parametro('INSS_TRAB', '3.5', 'DECIMAL', '2025-07-01', null),
    ];

    const marco = await service.obterParametro<Prisma.Decimal>(
      'INSS_TRAB',
      new Date('2025-03-15'),
      'emp-1'
    );
    const agosto = await service.obterParametro<Prisma.Decimal>(
      'INSS_TRAB',
      new Date('2025-08-01'),
      'emp-1'
    );

    expect(marco.toString()).toBe('3');
    expect(agosto.toString()).toBe('3.5');
  });

  it('interpreta o valor segundo o tipo (INT, BOOLEAN)', async () => {
    parametros = [
      parametro('BASE_DIAS_MES', '30', 'INT', '2025-01-01', null),
      parametro('EXTRAORD_ACUMULA_IRT', 'true', 'BOOLEAN', '2025-01-01', null),
    ];

    await expect(
      service.obterParametro('BASE_DIAS_MES', new Date('2025-05-01'), 'emp-1')
    ).resolves.toBe(30);
    await expect(
      service.obterParametro('EXTRAORD_ACUMULA_IRT', new Date('2025-05-01'), 'emp-1')
    ).resolves.toBe(true);
  });

  it('lança erro claro quando não existe versão vigente', async () => {
    parametros = [parametro('INSS_TRAB', '3', 'DECIMAL', '2026-01-01', null)];

    await expect(
      service.obterParametro('INSS_TRAB', new Date('2025-06-01'), 'emp-1')
    ).rejects.toBeInstanceOf(RhNotFoundError);

    await expect(
      service.obterParametro('INEXISTENTE', new Date('2026-06-01'), 'emp-1')
    ).rejects.toMatchObject({ code: 'RH_NAO_ENCONTRADO' });
  });

  it('resolve a tabela de IRT vigente com os escalões ordenados', async () => {
    tabelas = [
      {
        id: 'tab-2025',
        descricao: 'IRT 2025',
        vigenteDesde: new Date('2025-01-01'),
        vigenteAte: null,
        escaloes: [{ ordem: 1 }],
      },
    ];

    const tabela = await service.obterTabelaIRT(new Date('2025-09-01'), 'emp-1');
    expect(tabela.id).toBe('tab-2025');
    expect(tabela.escaloes).toHaveLength(1);
  });

  it('lança erro quando não há tabela de IRT vigente', async () => {
    await expect(
      service.obterTabelaIRT(new Date('2025-09-01'), 'emp-1')
    ).rejects.toBeInstanceOf(RhNotFoundError);
  });

  it('exige empresa associada à sessão', async () => {
    await expect(
      service.obterParametro('INSS_TRAB', new Date('2025-01-01'), null)
    ).rejects.toMatchObject({ code: 'RH_VALIDACAO' });
  });
});

describe('RhConfiguracaoService — fecho/abertura de período (RH-415)', () => {
  const periodoBase = {
    id: 'per-1',
    empresaId: 'emp-1',
    codigo: 'P03',
    ano: 2026,
    mes: 3,
    descricao: 'Março 2026',
    estado: 'ABERTO' as const,
    fechadoEm: null as Date | null,
    fechadoPorId: null as string | null,
    dataInicio: new Date('2026-03-01'),
    dataFim: new Date('2026-03-31'),
    createdAt: new Date('2026-01-01'),
    atualizadoEm: new Date('2026-01-01'),
  };

  let findFirst: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let registarOperacao: ReturnType<typeof vi.fn>;
  let service: RhConfiguracaoService;

  beforeEach(() => {
    findFirst = vi.fn(async () => ({ ...periodoBase }));
    update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...periodoBase,
      ...data,
    }));
    registarOperacao = vi.fn(async () => 'audit-1');
    const prismaMock = {
      rhPeriodo: { findFirst, update },
    } as unknown as PrismaClient;
    const auditMock = { registarOperacao } as unknown as AuditService;
    service = new RhConfiguracaoService(prismaMock, auditMock);
  });

  it('fecha o período e registra auditoria de severidade info', async () => {
    const resultado = await service.fecharPeriodo('per-1', 'emp-1', 'user-1');

    expect(resultado.estado).toBe('FECHADO');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'per-1' },
      data: expect.objectContaining({ estado: 'FECHADO', fechadoPorId: 'user-1' }),
    });
    expect(registarOperacao).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'emp-1',
        utilizadorId: 'user-1',
        acao: 'actualizar',
        entidade: 'RhPeriodo',
        entidadeId: 'per-1',
        severidade: 'info',
        dadosAnteriores: { estado: 'ABERTO' },
        dadosNovos: { estado: 'FECHADO' },
      })
    );
  });

  it('recusa fechar um período já fechado sem registar auditoria', async () => {
    findFirst.mockResolvedValueOnce({ ...periodoBase, estado: 'FECHADO' });

    await expect(service.fecharPeriodo('per-1', 'emp-1', 'user-1')).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
    expect(update).not.toHaveBeenCalled();
    expect(registarOperacao).not.toHaveBeenCalled();
  });

  it('reabre o período e registra auditoria de aviso', async () => {
    findFirst.mockResolvedValueOnce({
      ...periodoBase,
      estado: 'FECHADO',
      fechadoEm: new Date('2026-04-01'),
      fechadoPorId: 'user-0',
    });

    const resultado = await service.reabrirPeriodo('per-1', 'emp-1', 'user-9');

    expect(resultado.estado).toBe('ABERTO');
    expect(resultado.fechadoEm).toBeNull();
    expect(resultado.fechadoPorId).toBeNull();
    expect(registarOperacao).toHaveBeenCalledWith(
      expect.objectContaining({
        utilizadorId: 'user-9',
        acao: 'actualizar',
        entidade: 'RhPeriodo',
        entidadeId: 'per-1',
        severidade: 'aviso',
        dadosAnteriores: expect.objectContaining({ estado: 'FECHADO', fechadoPorId: 'user-0' }),
        dadosNovos: { estado: 'ABERTO' },
      })
    );
  });

  it('recusa reabrir um período aberto', async () => {
    await expect(service.reabrirPeriodo('per-1', 'emp-1', 'user-1')).rejects.toBeInstanceOf(
      RhBusinessRuleError
    );
    expect(update).not.toHaveBeenCalled();
    expect(registarOperacao).not.toHaveBeenCalled();
  });

  it('exige empresa associada à sessão', async () => {
    await expect(service.fecharPeriodo('per-1', null, 'user-1')).rejects.toMatchObject({
      code: 'RH_VALIDACAO',
    });
    await expect(service.reabrirPeriodo('per-1', null, 'user-1')).rejects.toMatchObject({
      code: 'RH_VALIDACAO',
    });
  });
});
