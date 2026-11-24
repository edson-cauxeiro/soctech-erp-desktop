import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContabilidadeSeedService,
  DIARIOS_PADRAO,
  MAPEAMENTOS_PADRAO,
} from './contabilidade-seed.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import pgcAngola from '../../../prisma/data/pgc-angola.json';

const CATALOGO = pgcAngola as Array<{
  codigo: string;
  designacao: string;
  tipo: string;
  natureza: string;
  aceitaMovimento: boolean;
}>;

describe('ContabilidadeSeedService', () => {
  let mockPrisma: any;
  let service: ContabilidadeSeedService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1' }),
      },
      contaContabil: {
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      diarioContabil: {
        findMany: vi.fn(),
        createMany: vi.fn(),
      },
      mapeamentoConta: {
        findMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    service = new ContabilidadeSeedService(mockPrisma);
  });

  describe('validarCatalogo', () => {
    it('aceita o catálogo PGC incluído', () => {
      expect(() => service.validarCatalogo()).not.toThrow();
    });

    it('rejeita códigos inválidos e duplicados', () => {
      expect(() =>
        service.validarCatalogo([
          {
            codigo: '9',
            designacao: 'Inválida',
            tipo: 'activo',
            natureza: 'devedora',
            aceitaMovimento: true,
          },
        ])
      ).toThrow(ValidationError);

      expect(() =>
        service.validarCatalogo([
          {
            codigo: '311',
            designacao: 'Clientes',
            tipo: 'activo',
            natureza: 'devedora',
            aceitaMovimento: true,
          },
          {
            codigo: '311',
            designacao: 'Clientes duplicado',
            tipo: 'activo',
            natureza: 'devedora',
            aceitaMovimento: true,
          },
        ])
      ).toThrow(ValidationError);
    });
  });

  describe('semearPlanoContas', () => {
    it('cria apenas as contas em falta e converte pais em agregação', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'id-3', codigo: '3', aceitaMovimento: true, _count: { filhas: 1 } },
      ]);
      mockPrisma.contaContabil.create.mockImplementation(async ({ data }: any) => ({
        id: `id-${data.codigo}`,
        ...data,
      }));
      mockPrisma.contaContabil.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.semearPlanoContas('emp-1');

      expect(res.criadas).toBe(CATALOGO.length - 1);
      expect(res.total).toBe(CATALOGO.length);
      expect(mockPrisma.contaContabil.create).toHaveBeenCalledTimes(CATALOGO.length - 1);

      const criada311 = mockPrisma.contaContabil.create.mock.calls.find(
        ([arg]: any) => arg.data.codigo === '311'
      );
      expect(criada311).toBeTruthy();
      expect(criada311[0].data.contaPaiId).toBe('id-31');
      expect(criada311[0].data.classe).toBe(3);
      expect(criada311[0].data.nivel).toBe(3);

      const idsActualizados = mockPrisma.contaContabil.updateMany.mock.calls[0][0].where.id.in;
      expect(idsActualizados).toContain('id-3');
      expect(idsActualizados).not.toContain('id-31');
    });

    it('é idempotente quando o plano já está completo', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue(
        CATALOGO.map((c) => ({
          id: `id-${c.codigo}`,
          codigo: c.codigo,
          aceitaMovimento: false,
          _count: { filhas: 0 },
        }))
      );

      const res = await service.semearPlanoContas('emp-1');

      expect(res.criadas).toBe(0);
      expect(mockPrisma.contaContabil.create).not.toHaveBeenCalled();
      expect(mockPrisma.contaContabil.updateMany).not.toHaveBeenCalled();
    });

    it('falha se a empresa não existir', async () => {
      mockPrisma.empresaConfig.findUnique.mockResolvedValue(null);
      await expect(service.semearPlanoContas('inexistente')).rejects.toThrow(NotFoundError);
    });
  });

  describe('semearDiariosPadrao', () => {
    it('cria os diários que faltam', async () => {
      mockPrisma.diarioContabil.findMany.mockResolvedValue([{ codigo: 'VD' }]);
      mockPrisma.diarioContabil.createMany.mockResolvedValue({ count: 7 });

      const res = await service.semearDiariosPadrao('emp-1');

      expect(res).toEqual({ criados: DIARIOS_PADRAO.length - 1, total: DIARIOS_PADRAO.length });
      expect(mockPrisma.diarioContabil.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ codigo: 'CP', tipo: 'compras', activo: true }),
        ]),
        skipDuplicates: true,
      });
    });

    it('não cria nada quando todos existem', async () => {
      mockPrisma.diarioContabil.findMany.mockResolvedValue(
        DIARIOS_PADRAO.map((d) => ({ codigo: d.codigo }))
      );

      const res = await service.semearDiariosPadrao('emp-1');

      expect(res.criados).toBe(0);
      expect(mockPrisma.diarioContabil.createMany).not.toHaveBeenCalled();
    });
  });

  describe('semearMapeamentosPadrao', () => {
    function contasDeMapeamento(aceitaMovimento = true) {
      const codigos = [...new Set(MAPEAMENTOS_PADRAO.map((m) => m.codigoConta))];
      return codigos.map((codigo) => ({
        id: `id-${codigo}`,
        codigo,
        aceitaMovimento,
      }));
    }

    it('falha com uma mensagem útil se faltarem contas', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue([]);

      await expect(service.semearMapeamentosPadrao('emp-1')).rejects.toThrow(NotFoundError);
      await expect(service.semearMapeamentosPadrao('emp-1')).rejects.toThrow(/311/);
    });

    it('rejeita contas que não aceitam movimento', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue(contasDeMapeamento(false));

      await expect(service.semearMapeamentosPadrao('emp-1')).rejects.toThrow(ValidationError);
    });

    it('cria apenas os mapeamentos em falta', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue(contasDeMapeamento());
      mockPrisma.mapeamentoConta.findMany.mockResolvedValue([{ id: 'map-1', chave: 'CUSTOMER_ACCOUNT' }]);
      mockPrisma.mapeamentoConta.createMany.mockResolvedValue({ count: 22 });

      const res = await service.semearMapeamentosPadrao('emp-1');

      expect(res).toEqual({
        criados: MAPEAMENTOS_PADRAO.length - 1,
        total: MAPEAMENTOS_PADRAO.length,
      });
      expect(mockPrisma.mapeamentoConta.createMany).toHaveBeenCalledTimes(1);
      const criados = mockPrisma.mapeamentoConta.createMany.mock.calls[0][0].data;
      expect(criados.some((m: { chave: string }) => m.chave === 'CUSTOMER_ACCOUNT')).toBe(false);
      expect(criados.some((m: { chave: string }) => m.chave === 'VAT_OUTPUT')).toBe(true);
    });
  });

  describe('semearTudo', () => {
    it('agrega os quatro passos na ordem correcta', async () => {
      vi.spyOn(service, 'semearPlanoContas').mockResolvedValue({ criadas: 3, total: 160 });
      vi.spyOn(service, 'semearDiariosPadrao').mockResolvedValue({ criados: 2, total: 8 });
      vi.spyOn(service, 'semearMapeamentosPadrao').mockResolvedValue({ criados: 1, total: MAPEAMENTOS_PADRAO.length });
      vi.spyOn(service, 'semearEstruturasPadrao').mockResolvedValue({ criadas: 4, total: 4 });

      const res = await service.semearTudo('emp-1');

      expect(res).toEqual({
        contasCriadas: 3,
        contasTotal: 160,
        diariosCriados: 2,
        diariosTotal: 8,
        mapeamentosCriados: 1,
        mapeamentosTotal: MAPEAMENTOS_PADRAO.length,
        estruturasCriadas: 4,
        estruturasTotal: 4,
      });
      expect(service.semearPlanoContas).toHaveBeenCalledWith('emp-1');
      expect(service.semearDiariosPadrao).toHaveBeenCalledWith('emp-1');
      expect(service.semearMapeamentosPadrao).toHaveBeenCalledWith('emp-1');
      expect(service.semearEstruturasPadrao).toHaveBeenCalledWith('emp-1');
    });
  });
});
