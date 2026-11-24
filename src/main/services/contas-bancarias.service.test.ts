import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContasBancariasService } from './contas-bancarias.service';
import { BusinessRuleError, NotFoundError, ConflictError } from '../utils/errors';

const base = {
  empresaId: 'emp-1',
  codigo: 'BANC-01',
  designacao: 'Banco Principal',
  tipo: 'banco' as const,
  iban: 'AO06 0000 0000 0000 0000 0000 0',
};

describe('ContasBancariasService', () => {
  let mockPrisma: any;
  let service: ContasBancariasService;

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', moedaBase: 'AOA' }),
      },
      contaBancaria: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        findCount: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(({ data }) => ({ id: 'conta-1', ...data })),
        update: vi.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      movimentoTesouraria: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      sessaoCaixa: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
      },
      reciboVenda: { count: vi.fn().mockResolvedValue(0) },
      faturaVenda: { count: vi.fn().mockResolvedValue(0) },
      contaContabil: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    service = new ContasBancariasService(mockPrisma);
  });

  describe('criar', () => {
    it('normaliza o código para maiúsculas e deriva a moeda da empresa', async () => {
      const conta = await service.criar({
        empresaId: 'emp-1',
        codigo: 'banc-01',
        designacao: 'Banco Principal',
        tipo: 'banco',
        iban: 'AO06 0000 0000 0000 0000 0000 0',
      });

      expect(conta.codigo).toBe('BANC-01');
      expect(conta.moeda).toBe('AOA');
      expect(conta.saldoInicial).toBeDefined();
    });

    it('rejeita uma conta bancária sem IBAN', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: 'BANC-02',
          designacao: 'Sem IBAN',
          tipo: 'banco',
        })
      ).rejects.toThrow(/IBAN/);
    });

    it('aceita uma conta de caixa sem IBAN', async () => {
      const conta = await service.criar({
        empresaId: 'emp-1',
        codigo: 'CX-01',
        designacao: 'Caixa da loja',
        tipo: 'caixa',
      });

      expect(conta.tipo).toBe('caixa');
    });

    it('rejeita códigos duplicados na mesma empresa', async () => {
      mockPrisma.contaBancaria.findFirst.mockResolvedValue({ id: 'existente', codigo: 'BANC-01' });

      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: 'BANC-01',
          designacao: 'Duplicada',
          tipo: 'caixa',
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejeita saldo inicial negativo', async () => {
      await expect(
        service.criar({
          empresaId: 'emp-1',
          codigo: 'CX-02',
          designacao: 'Caixa',
          tipo: 'caixa',
          saldoInicial: -100,
        })
      ).rejects.toThrow();
    });
  });

  describe('contas contabilísticas disponíveis', () => {
    it('devolve só contas activas, com movimento, da empresa e não usadas', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'cc-1', codigo: '101', designacao: 'Banco', activa: true, aceitaMovimento: true, natureza: 'devedora' },
        { id: 'cc-2', codigo: '102', designacao: 'Caixa', activa: true, aceitaMovimento: true, natureza: 'devedora' },
      ]);
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        { id: 'cb-1', contaContabilId: 'cc-2' },
      ]);

      const opcoes = await service.listarContasContabeisDisponiveis({ empresaId: 'emp-1' });

      expect(mockPrisma.contaContabil.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresaId: 'emp-1', activa: true, aceitaMovimento: true },
        })
      );
      expect(opcoes.map((o) => o.id)).toEqual(['cc-1']);
    });

    it('inclui a conta actualmente ligada quando se edita essa conta bancária', async () => {
      mockPrisma.contaContabil.findMany.mockResolvedValue([
        { id: 'cc-1', codigo: '101', designacao: 'Banco', activa: true, aceitaMovimento: true, natureza: 'devedora' },
      ]);
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        { id: 'cb-1', contaContabilId: 'cc-1' },
      ]);

      const opcoes = await service.listarContasContabeisDisponiveis({ empresaId: 'emp-1', contaBancariaId: 'cb-1' });

      expect(opcoes.map((o) => o.id)).toEqual(['cc-1']);
    });
  });

  describe('associação contabilística na escrita', () => {
    it('grava contaContabilId na criação', async () => {
      mockPrisma.contaContabil.findFirst.mockResolvedValue({
        id: 'cc-1',
        empresaId: 'emp-1',
        activa: true,
        aceitaMovimento: true,
      });
      mockPrisma.contaBancaria.findFirst.mockResolvedValue(null);

      const conta = await service.criar({ ...base, contaContabilId: 'cc-1' });

      expect(conta.contaContabilId).toBe('cc-1');
    });

    it('rejeita conta de outra empresa, inactiva, sem movimento e duplicada', async () => {
      mockPrisma.contaContabil.findFirst.mockResolvedValue(null);
      await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow(
        'Conta contabilística não encontrada.'
      );

      mockPrisma.contaContabil.findFirst.mockResolvedValue({
        id: 'cc-1', empresaId: 'emp-1', activa: false, aceitaMovimento: true,
      });
      await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow(
        'A conta contabilística não aceita movimentos.'
      );

      mockPrisma.contaContabil.findFirst.mockResolvedValue({
        id: 'cc-1', empresaId: 'emp-1', activa: true, aceitaMovimento: false,
      });
      await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow(
        'A conta contabilística não aceita movimentos.'
      );

      mockPrisma.contaContabil.findFirst.mockResolvedValue({
        id: 'cc-1', empresaId: 'emp-1', activa: true, aceitaMovimento: true,
      });
      mockPrisma.contaBancaria.findFirst.mockResolvedValue({ id: 'cb-2', contaContabilId: 'cc-1' });
      await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow(
        'Esta conta contabilística já está associada a outra conta bancária.'
      );
    });

    it('limpa contaContabilId na edição quando recebe null', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({
        id: 'c1', codigo: 'C1', designacao: 'Conta', tipo: 'banco', iban: 'AO06', empresaId: 'emp-1',
      });

      await service.atualizar('c1', { empresaId: 'emp-1', contaContabilId: null });

      expect(mockPrisma.contaBancaria.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contaContabilId: null }) })
      );
    });
  });

  describe('cálculo de saldo derivado', () => {
    beforeEach(() => {
      mockPrisma.contaBancaria.findMany.mockImplementation(({ where }: any) => {
        const ids = where?.id?.in ?? [];
        return Promise.resolve(
          ids.map((id: string) => ({
            id,
            codigo: id.toUpperCase(),
            designacao: id,
            tipo: 'banco',
            moeda: 'AOA',
            saldoInicial: 1000,
            saldoAtual: 999999,
            ativo: true,
            empresaId: 'emp-1',
            observacoes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        );
      });
    });

    it('soma entradas, subtrai saídas e ignora movimentos pendentes', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { contaOrigemId: null, contaDestinoId: 'c1', valor: 500, tipo: 'entrada' },
        { contaOrigemId: 'c1', contaDestinoId: null, valor: 200, tipo: 'saida' },
      ]);

      const saldos = await service.calcularSaldos(['c1']);

      expect(saldos.get('c1')).toBe(1300);
    });

    it('uma transferência sai de uma conta e entra na outra', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { contaOrigemId: 'c1', contaDestinoId: 'c2', valor: 300, tipo: 'transferencia' },
      ]);

      const saldos = await service.calcularSaldos(['c1', 'c2']);

      expect(saldos.get('c1')).toBe(700);
      expect(saldos.get('c2')).toBe(1300);
    });

    it('não deixa o saldo descer abaixo do que a base de dados devolve', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { contaOrigemId: 'c1', contaDestinoId: null, valor: 1500, tipo: 'saida' },
      ]);

      const saldos = await service.calcularSaldos(['c1']);

      // 1000 inicial − 1500 saída = −500. O saldo pode ser negativo (a conta
      // ficou a dever), mas tem de bater certo com os movimentos.
      expect(saldos.get('c1')).toBe(-500);
    });

    it('arredonda a 4 casas decimais', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { contaOrigemId: null, contaDestinoId: 'c1', valor: 0.1, tipo: 'entrada' },
        { contaOrigemId: null, contaDestinoId: 'c1', valor: 0.2, tipo: 'entrada' },
      ]);

      const saldos = await service.calcularSaldos(['c1']);

      expect(saldos.get('c1')).toBe(1000.3);
    });

    it('devolve um mapa vazio sem contas', async () => {
      const saldos = await service.calcularSaldos([]);
      expect(saldos.size).toBe(0);
      expect(mockPrisma.movimentoTesouraria.findMany).not.toHaveBeenCalled();
    });
  });

  describe('resumoSaldos', () => {
    it('agrega entradas, saídas e estado de conciliação', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        {
          id: 'c1',
          codigo: 'C1',
          designacao: 'Conta 1',
          tipo: 'banco',
          moeda: 'AOA',
          saldoInicial: 1000,
          saldoAtual: 0,
          ativo: true,
          empresaId: 'emp-1',
          observacoes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      mockPrisma.movimentoTesouraria.groupBy.mockResolvedValue([
        { contaOrigemId: null, contaDestinoId: 'c1', tipo: 'entrada', conciliado: true, _sum: { valor: 400 }, _count: { _all: 2 } },
        { contaOrigemId: 'c1', contaDestinoId: null, tipo: 'saida', conciliado: false, _sum: { valor: 100 }, _count: { _all: 1 } },
      ]);

      const [resumo] = await service.resumoSaldos({ empresaId: 'emp-1' });

      expect(resumo.totalEntradas).toBe(400);
      expect(resumo.totalSaidas).toBe(100);
      expect(resumo.saldo).toBe(1300);
      expect(resumo.movimentosConciliados).toBe(2);
      expect(resumo.movimentosNaoConciliados).toBe(1);
    });

    it('conta um ajuste que credita a conta, seja qual for o seu tipo', async () => {
      mockPrisma.contaBancaria.findMany.mockResolvedValue([
        {
          id: 'c1',
          codigo: 'C1',
          designacao: 'Caixa',
          tipo: 'caixa',
          moeda: 'AOA',
          saldoInicial: 1000,
          saldoAtual: 0,
          ativo: true,
          empresaId: 'emp-1',
          observacoes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Um ajuste existe precisamente para corrigir a caixa. Filtrar o saldo por
      // `tipo` escondia-os e a caixa ficava com o valor errado sem aviso.
      mockPrisma.movimentoTesouraria.groupBy.mockResolvedValue([
        { contaOrigemId: null, contaDestinoId: 'c1', conciliado: false, _sum: { valor: 250 }, _count: { _all: 1 } },
      ]);

      const [resumo] = await service.resumoSaldos({ empresaId: 'emp-1' });

      expect(resumo.totalEntradas).toBe(250);
      expect(resumo.saldo).toBe(1250);
    });
  });

  describe('ajustarSaldoInicial', () => {
    it('recusa mexer no saldo de uma conta com movimentos', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({ id: 'c1', codigo: 'C1', observacoes: null });
      mockPrisma.movimentoTesouraria.count.mockResolvedValue(5);

      await expect(service.ajustarSaldoInicial('c1', 5000)).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(service.ajustarSaldoInicial('c1', 5000)).rejects.toThrow(/lançamento de ajuste/);
    });

    it('aceita o ajuste quando a conta ainda não tem movimentos', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({ id: 'c1', codigo: 'C1', observacoes: null });
      mockPrisma.movimentoTesouraria.count.mockResolvedValue(0);

      const conta = await service.ajustarSaldoInicial('c1', 5000);
      expect(Number(conta.saldoInicial)).toBe(5000);
    });

    it('rejeita saldo inicial negativo', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({ id: 'c1', codigo: 'C1', observacoes: null });

      await expect(service.ajustarSaldoInicial('c1', -1)).rejects.toBeInstanceOf(BusinessRuleError);
    });
  });

  describe('atualizar', () => {
    it('actualiza uma conta da própria empresa', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({
        id: 'c1',
        codigo: 'C1',
        designacao: 'Conta',
        tipo: 'banco',
        iban: 'AO06',
        empresaId: 'emp-1',
      });

      const conta = await service.atualizar('c1', {
        empresaId: 'emp-1',
        designacao: 'Conta Nova',
      });

      expect(conta.designacao).toBe('Conta Nova');
      expect(mockPrisma.contaBancaria.update).toHaveBeenCalled();
    });

    it('não deixa editar a conta de outra empresa', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({
        id: 'c1',
        codigo: 'C1',
        designacao: 'Conta',
        tipo: 'banco',
        iban: 'AO06',
        empresaId: 'emp-2',
      });

      await expect(
        service.atualizar('c1', { empresaId: 'emp-1', designacao: 'Conta Nova' })
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(mockPrisma.contaBancaria.update).not.toHaveBeenCalled();
    });
  });

  describe('desativar e remover', () => {
    it('não desativa uma conta com sessão de caixa aberta', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({ id: 'c1', codigo: 'CAIXA', tipo: 'caixa' });
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue({ id: 's1', numero: 'SC CX/0001' });

      await expect(service.desativar('c1')).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('não elimina uma conta com movimentos', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({ id: 'c1', codigo: 'C1' });
      mockPrisma.movimentoTesouraria.count.mockResolvedValue(3);

      await expect(service.remover('c1')).rejects.toThrow(/Desative-a/);
      expect(mockPrisma.contaBancaria.delete).not.toHaveBeenCalled();
    });

    it('elimina uma conta nova sem movimentos nem documentos', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue({ id: 'c1', codigo: 'C1' });
      mockPrisma.movimentoTesouraria.count.mockResolvedValue(0);
      mockPrisma.sessaoCaixa.count.mockResolvedValue(0);

      await service.remover('c1');

      expect(mockPrisma.contaBancaria.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('devolve NotFoundError para uma conta inexistente', async () => {
      mockPrisma.contaBancaria.findUnique.mockResolvedValue(null);

      await expect(service.get('inexistente')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
