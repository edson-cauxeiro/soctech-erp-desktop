import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TesourariaService } from './tesouraria.service';
import { NotFoundError } from '../utils/errors';

describe('TesourariaService', () => {
  let mockPrisma: any;
  let mockDocNumeroService: any;
  let service: TesourariaService;

  const contaBanco = { id: 'c-banco', codigo: 'BANC-01', tipo: 'banco', ativo: true, empresaId: 'emp-1' };
  const contaCaixa = { id: 'c-caixa', codigo: 'CAIXA', tipo: 'caixa', ativo: true, empresaId: 'emp-1' };
  const sessaoAberta = { id: 's-1', numero: 'SC CX/0001', utilizadorAberturaId: 'u-1' };

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', moedaBase: 'AOA' }),
      },
      contaBancaria: {
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          const ids = where?.id?.in ?? [];
          return Promise.resolve(ids.map((id: string) => (id === 'c-caixa' ? contaCaixa : contaBanco)));
        }),
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(where.id === 'c-caixa' ? contaCaixa : contaBanco);
        }),
      },
      sessaoCaixa: {
        findFirst: vi.fn().mockResolvedValue(sessaoAberta),
      },
      movimentoTesouraria: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        create: vi.fn().mockImplementation(({ data }) => ({ id: 'm-1', ...data })),
        update: vi.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockDocNumeroService = {
      reservarNumero: vi.fn().mockResolvedValue('TS TES/0001'),
    };

    const integracao = {
      contabilizarMovimentoTesouraria: vi
        .fn()
        .mockResolvedValue({ sucesso: true, pendente: false, mensagem: 'ok' }),
      estornarMovimentoTesouraria: vi
        .fn()
        .mockResolvedValue({ sucesso: true, pendente: false, mensagem: 'ok' }),
    };

    service = new TesourariaService(mockPrisma, mockDocNumeroService, integracao as any);
  });

  describe('criar — validação de contas', () => {
    it('cria uma entrada sem conta de origem', async () => {
      const mov = await service.criar({
        empresaId: 'emp-1',
        data: '2026-09-29',
        tipo: 'entrada',
        contaDestinoId: 'c-banco',
        valor: 1000,
        descricao: 'Empréstimo',
      });

      expect(mov.contaOrigemId).toBeNull();
      expect(mov.contaDestinoId).toBe('c-banco');
      expect(mov.estado).toBe('confirmado');
    });

    it('recusa uma entrada com conta de origem', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'entrada',
          contaOrigemId: 'c-banco',
          contaDestinoId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow(/não pode ter conta de origem/);
    });

    it('recusa uma saída com conta de destino', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'saida',
          contaOrigemId: 'c-banco',
          contaDestinoId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow(/não pode ter conta de destino/);
    });

    it('recusa uma saída sem conta de origem', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'saida',
          valor: 100,
        })
      ).rejects.toThrow(/conta de onde sai/);
    });

    it('recusa uma transferência com a mesma conta nos dois lados', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'transferencia',
          contaOrigemId: 'c-banco',
          contaDestinoId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow(/diferente da conta de origem/);
    });

    it('recusa um valor zero ou negativo', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'entrada',
          contaDestinoId: 'c-banco',
          valor: 0,
        })
      ).rejects.toThrow();

      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'entrada',
          contaDestinoId: 'c-banco',
          valor: -50,
        })
      ).rejects.toThrow();
    });

    it('exige descrição num ajuste', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'ajuste',
          contaOrigemId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow(/justificado com uma descrição/);
    });

    it('recusa contas inexistentes', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([]);

      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'entrada',
          contaDestinoId: 'fantasma',
          valor: 100,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('recusa contas inactivas', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([{ ...contaBanco, ativo: false }]);

      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'entrada',
          contaDestinoId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow(/inactiva/);
    });

    it('recusa contas de outra empresa', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        { ...contaBanco, empresaId: 'emp-2' },
      ]);

      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'entrada',
          contaDestinoId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow(/não pertence a esta empresa/);

      // O dinheiro de outra empresa não se move, mesmo que a conta exista.
      expect(mockPrisma.movimentoTesouraria.create).not.toHaveBeenCalled();
    });

    it('recusa estornos registados à mão', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'estorno',
          contaOrigemId: 'c-banco',
          valor: 100,
        })
      ).rejects.toThrow();
    });
  });

  describe('sessão de caixa obrigatória', () => {
    it('liga o movimento à sessão aberta quando a conta é de caixa', async () => {
      const mov = await service.criar({
        empresaId: 'emp-1',
        data: '2026-09-29',
        tipo: 'entrada',
        contaDestinoId: 'c-caixa',
        valor: 100,
      });

      expect(mov.sessaoCaixaId).toBe('s-1');
      expect(mov.utilizadorId).toBe('u-1');
    });

    it('bloqueia numerário na caixa sem sessão aberta', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue(null);

      await expect(
        service.criar({
          empresaId: 'emp-1',
          data: '2026-09-29',
          tipo: 'saida',
          contaOrigemId: 'c-caixa',
          valor: 100,
        })
      ).rejects.toThrow(/não tem sessão aberta/);
    });

    it('não exige sessão para contas bancárias', async () => {
      const mov = await service.criar({
        empresaId: 'emp-1',
        data: '2026-09-29',
        tipo: 'saida',
        contaOrigemId: 'c-banco',
        valor: 100,
      });

      expect(mov.sessaoCaixaId).toBeNull();
      expect(mockPrisma.sessaoCaixa.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('estorno', () => {
    it('cria o movimento inverso e marca o original como estornado', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-original',
        numero: 'TS TES/0001',
        empresaId: 'emp-1',
        tipo: 'saida',
        contaOrigemId: 'c-banco',
        contaDestinoId: null,
        valor: 750,
        documentoTipo: 'fatura_compra',
        documentoId: 'fc-1',
        documentoNumero: 'FC 2026/0001',
        utilizadorId: 'u-1',
        sessaoCaixaId: null,
        movimentoEstornoId: null,
        estado: 'confirmado',
      });

      const estorno = await service.estornar('m-original', { motivo: 'Fornecedor cancelou' });

      // Uma saída estornada passa a ser uma entrada na mesma conta.
      expect(estorno.tipo).toBe('entrada');
      expect(estorno.contaDestinoId).toBe('c-banco');
      expect(estorno.contaOrigemId).toBeNull();
      expect(Number(estorno.valor)).toBe(750);
      expect(estorno.movimentoEstornoId).toBe('m-original');
      expect(estorno.descricao).toContain('Estorno de TS TES/0001');
      expect(estorno.descricao).toContain('Fornecedor cancelou');

      expect(mockPrisma.movimentoTesouraria.update).toHaveBeenCalledWith({
        where: { id: 'm-original' },
        data: { estado: 'estornado', conciliado: false, dataConciliacao: null },
      });
    });

    it('uma entrada estornada passa a ser saída', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-original',
        numero: 'TS TES/0002',
        empresaId: 'emp-1',
        tipo: 'entrada',
        contaOrigemId: null,
        contaDestinoId: 'c-banco',
        valor: 100,
        documentoTipo: 'manual',
        documentoId: null,
        documentoNumero: null,
        utilizadorId: 'u-1',
        sessaoCaixaId: null,
        movimentoEstornoId: null,
        estado: 'confirmado',
      });

      const estorno = await service.estornar('m-original', { motivo: 'Duplicado' });

      expect(estorno.tipo).toBe('saida');
      expect(estorno.contaOrigemId).toBe('c-banco');
    });

    it('recusa estornar um movimento já estornado', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-original',
        numero: 'TS TES/0001',
        estado: 'estornado',
        movimentoEstornoId: null,
      });

      await expect(service.estornar('m-original', { motivo: 'Outro motivo' })).rejects.toThrow(/já foi estornado/);
    });

    it('recusa estornar dois vezes o mesmo movimento', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-original',
        numero: 'TS TES/0001',
        empresaId: 'emp-1',
        tipo: 'saida',
        contaOrigemId: 'c-banco',
        contaDestinoId: null,
        valor: 100,
        documentoTipo: 'manual',
        documentoId: null,
        documentoNumero: null,
        utilizadorId: 'u-1',
        sessaoCaixaId: null,
        movimentoEstornoId: null,
        estado: 'confirmado',
      });
      mockPrisma.movimentoTesouraria.findFirst.mockResolvedValue({ id: 'm-estorno', numero: 'TS TES/0009' });

      await expect(service.estornar('m-original', { motivo: 'Repetido' })).rejects.toThrow(/já tem o estorno/);
    });

    it('recusa estornar um estorno', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-estorno',
        numero: 'TS TES/0009',
        estado: 'confirmado',
        movimentoEstornoId: 'm-original',
      });

      await expect(service.estornar('m-estorno', { motivo: 'Cascata' })).rejects.toThrow(/não pode ser estornado/);
    });

    it('exige um motivo com 3 caracteres', async () => {
      await expect(service.estornar('m-original', { motivo: 'x' })).rejects.toThrow();
    });
  });

  describe('conciliação', () => {
    it('marca um movimento como conciliado com a data indicada', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-1',
        numero: 'TS TES/0001',
        estado: 'confirmado',
      });
      mockPrisma.movimentoTesouraria.findUnique
        .mockResolvedValueOnce({ id: 'm-1', numero: 'TS TES/0001', estado: 'confirmado' })
        .mockResolvedValueOnce({ id: 'm-1', numero: 'TS TES/0001', estado: 'confirmado' });

      const mov = await service.conciliar('m-1', true, new Date('2026-09-30'));

      expect(mockPrisma.movimentoTesouraria.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { conciliado: true, dataConciliacao: new Date('2026-09-30') },
      });
      expect(mov.id).toBe('m-1');
    });

    it('não concilia movimentos estornados', async () => {
      mockPrisma.movimentoTesouraria.findUnique.mockResolvedValue({
        id: 'm-1',
        numero: 'TS TES/0001',
        estado: 'estornado',
      });

      await expect(service.conciliar('m-1', true)).rejects.toThrow(/está estornado/);
    });

    it('conciliação em lote rejeita movimentos de outra conta', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { id: 'm-1', numero: 'TS TES/0001', estado: 'confirmado', contaOrigemId: 'outra', contaDestinoId: null },
      ]);

      await expect(
        service.conciliarLote({
          empresaId: 'emp-1',
          contaBancariaId: 'c-banco',
          movimentosIds: ['m-1'],
          dataConciliacao: '2026-09-30',
        })
      ).rejects.toThrow(/não pertencem à conta indicada/);
    });

    it('conciliação em lote rejeita movimentos estornados', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { id: 'm-1', numero: 'TS TES/0001', estado: 'estornado', contaOrigemId: 'c-banco', contaDestinoId: null },
      ]);

      await expect(
        service.conciliarLote({
          empresaId: 'emp-1',
          contaBancariaId: 'c-banco',
          movimentosIds: ['m-1'],
          dataConciliacao: '2026-09-30',
        })
      ).rejects.toThrow(/Não é possível conciliar/);
    });

    it('conciliação em lote atualiza os movimentos válidos', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { id: 'm-1', numero: 'TS TES/0001', estado: 'confirmado', contaOrigemId: 'c-banco', contaDestinoId: null },
        { id: 'm-2', numero: 'TS TES/0002', estado: 'confirmado', contaOrigemId: 'c-banco', contaDestinoId: null },
      ]);

      const res = await service.conciliarLote({
        empresaId: 'emp-1',
        contaBancariaId: 'c-banco',
        movimentosIds: ['m-1', 'm-2'],
        dataConciliacao: '2026-09-30',
      });

      expect(res.atualizados).toBe(2);
    });
  });

  describe('resumo', () => {
    it('separa entradas, saídas e conta apenas movimentos confirmados', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { tipo: 'entrada', valor: 1000, estado: 'confirmado', conciliado: true },
        { tipo: 'saida', valor: 300, estado: 'confirmado', conciliado: false },
        { tipo: 'entrada', valor: 500, estado: 'pendente', conciliado: false },
        { tipo: 'saida', valor: 200, estado: 'estornado', conciliado: false },
      ]);

      const resumo = await service.resumo({ empresaId: 'emp-1' });

      expect(resumo.totalEntradas).toBe(1000);
      expect(resumo.totalSaidas).toBe(300);
      expect(resumo.resultado).toBe(700);
      expect(resumo.totalMovimentos).toBe(4);
      expect(resumo.movimentosPendentes).toBe(1);
      expect(resumo.movimentosNaoConciliados).toBe(1);
      expect(resumo.porTipo.entrada.quantidade).toBe(2);
    });

    it('uma transferência conta como entrada e como saída', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { tipo: 'transferencia', valor: 400, estado: 'confirmado', conciliado: true },
      ]);

      const resumo = await service.resumo({ empresaId: 'emp-1' });

      expect(resumo.totalEntradas).toBe(400);
      expect(resumo.totalSaidas).toBe(400);
      expect(resumo.resultado).toBe(0);
    });
  });

  describe('validarMeioPagamento', () => {
    it('numérico numa caixa sem sessão aberta é sinalizado', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue(null);

      const r = await service.validarMeioPagamento({
        empresaId: 'emp-1',
        meioPagamento: 'numerario',
        contaBancariaId: 'c-caixa',
      });

      expect(r).toEqual({ exigeSessao: true, sessaoAberta: false, numeroSessao: null });
    });

    it('numérico numa caixa com sessão aberta indica o número', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue({ numero: 'SC CX/0001' });

      const r = await service.validarMeioPagamento({
        empresaId: 'emp-1',
        meioPagamento: 'numerario',
        contaBancariaId: 'c-caixa',
      });

      expect(r).toEqual({ exigeSessao: true, sessaoAberta: true, numeroSessao: 'SC CX/0001' });
    });

    it('transferência para a caixa também exige sessão, porque o dinheiro entra na gaveta', async () => {
      const r = await service.validarMeioPagamento({
        empresaId: 'emp-1',
        meioPagamento: 'transferencia',
        contaBancariaId: 'c-caixa',
      });

      // Tem de coincidir com `criar`, que exige sessão para qualquer valor que
      // toque uma caixa. Um "false" aqui laisseria o utilizador preencher o
      // formulário e só no fim receber o erro.
      expect(r.exigeSessao).toBe(true);
      expect(r.sessaoAberta).toBe(true);
    });
  });
});
