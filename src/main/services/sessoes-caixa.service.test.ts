import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessoesCaixaService } from './sessoes-caixa.service';
import { BusinessRuleError, NotFoundError, ConflictError } from '../utils/errors';

describe('SessoesCaixaService', () => {
  let mockPrisma: any;
  let mockDocNumeroService: any;
  let service: SessoesCaixaService;

  const contaCaixa = { id: 'c-caixa', codigo: 'CAIXA', designacao: 'Caixa', tipo: 'caixa', ativo: true, empresaId: 'emp-1' };
  const contaBanco = { id: 'c-banco', codigo: 'BANC-01', designacao: 'Banco', tipo: 'banco', ativo: true, empresaId: 'emp-1' };
  const contaCaixaInativa = { ...contaCaixa, ativo: false };
  const contaCaixaOutraEmpresa = { ...contaCaixa, id: 'c-caixa-emp2', empresaId: 'emp-2' };

  const sessaoAberta = {
    id: 's-1',
    numero: 'SC CX/0001',
    empresaId: 'emp-1',
    contaCaixaId: 'c-caixa',
    fundoInicial: 100,
    estado: 'aberta',
    dataAbertura: new Date('2026-09-29'),
    horaAbertura: new Date('2026-09-29T08:00:00'),
    totalContado: null,
    diferenca: null,
  };

  beforeEach(() => {
    mockPrisma = {
      empresaConfig: {
        findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', moedaBase: 'AOA' }),
      },
      contaBancaria: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'c-caixa') return Promise.resolve(contaCaixa);
          if (where.id === 'c-banco') return Promise.resolve(contaBanco);
          if (where.id === 'c-caixa-inativa') return Promise.resolve(contaCaixaInativa);
          if (where.id === 'c-caixa-emp2') return Promise.resolve(contaCaixaOutraEmpresa);
          return Promise.resolve(null);
        }),
      },
      sessaoCaixa: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(sessaoAberta),
        create: vi.fn().mockImplementation(({ data }) => ({ id: 's-novo', ...data })),
        update: vi.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
        count: vi.fn().mockResolvedValue(0),
      },
      movimentoTesouraria: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockDocNumeroService = {
      reservarNumero: vi.fn().mockResolvedValue('SC CX/0001'),
    };

    service = new SessoesCaixaService(mockPrisma, mockDocNumeroService);
  });

  describe('abrir', () => {
    it('abre uma sessão de caixa com fundo inicial', async () => {
      const sessao = await service.abrir({
        empresaId: 'emp-1',
        contaCaixaId: 'c-caixa',
        dataAbertura: '2026-09-29',
        fundoInicial: 500,
        utilizadorId: 'u-1',
      });

      expect(sessao.estado).toBe('aberta');
      expect(Number(sessao.fundoInicial)).toBe(500);
      expect(sessao.utilizadorAberturaId).toBe('u-1');
      expect(mockDocNumeroService.reservarNumero).toHaveBeenCalledWith(expect.anything(), 'SC', 'CX', 'emp-1');
    });

    it('aceita fundo inicial zero', async () => {
      const sessao = await service.abrir({
        empresaId: 'emp-1',
        contaCaixaId: 'c-caixa',
        dataAbertura: '2026-09-29',
        fundoInicial: 0,
      });

      expect(Number(sessao.fundoInicial)).toBe(0);
    });

    it('rejeita fundo inicial negativo', async () => {
      await expect(
        service.abrir({
          empresaId: 'emp-1',
          contaCaixaId: 'c-caixa',
          dataAbertura: '2026-09-29',
          fundoInicial: -1,
        })
      ).rejects.toThrow();
    });

    it('não abre sessão numa conta bancária', async () => {
      await expect(
        service.abrir({
          empresaId: 'emp-1',
          contaCaixaId: 'c-banco',
          dataAbertura: '2026-09-29',
          fundoInicial: 100,
        })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('recusa uma segunda sessão aberta na mesma caixa', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue({ numero: 'SC CX/0007' });

      await expect(
        service.abrir({
          empresaId: 'emp-1',
          contaCaixaId: 'c-caixa',
          dataAbertura: '2026-09-29',
          fundoInicial: 100,
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('recusa uma conta de caixa inactiva', async () => {
      await expect(
        service.abrir({
          empresaId: 'emp-1',
          contaCaixaId: 'c-caixa-inativa',
          dataAbertura: '2026-09-29',
          fundoInicial: 100,
        })
      ).rejects.toThrow(/inactiva/);
    });

    it('recusa uma caixa de outra empresa', async () => {
      await expect(
        service.abrir({
          empresaId: 'emp-1',
          contaCaixaId: 'c-caixa-emp2',
          dataAbertura: '2026-09-29',
          fundoInicial: 100,
        })
      ).rejects.toThrow(/não pertence a esta empresa/);

      expect(mockPrisma.sessaoCaixa.create).not.toHaveBeenCalled();
    });

    it('devolve NotFoundError para uma conta inexistente', async () => {
      await expect(
        service.abrir({
          empresaId: 'emp-1',
          contaCaixaId: 'fantasma',
          dataAbertura: '2026-09-29',
          fundoInicial: 100,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('apuramento', () => {
    it('soma entradas e subtrai saídas do fundo inicial', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { tipo: 'entrada', valor: 200, contaOrigemId: null, contaDestinoId: 'c-caixa' },
        { tipo: 'saida', valor: 50, contaOrigemId: 'c-caixa', contaDestinoId: null },
      ]);

      const ap = await service.apurar('s-1');

      expect(ap.totalEsperado).toBe(250);
      expect(ap.totalEntradas).toBe(200);
      expect(ap.totalSaidas).toBe(50);
      expect(ap.movimentos).toBe(2);
    });

    it('uma transferência de/para a caixa entra no saldo esperado', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { tipo: 'transferencia', valor: 300, contaOrigemId: 'c-banco', contaDestinoId: 'c-caixa' },
      ]);

      const ap = await service.apurar('s-1');

      expect(ap.totalEsperado).toBe(400);
      expect(ap.totalTransferencia).toBe(300);
    });

    it('ignora movimentos que não tocam nesta caixa', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { tipo: 'entrada', valor: 999, contaOrigemId: null, contaDestinoId: 'c-banco' },
        { tipo: 'saida', valor: 999, contaOrigemId: 'c-banco', contaDestinoId: null },
      ]);

      const ap = await service.apurar('s-1');

      expect(ap.totalEsperado).toBe(100);
      expect(ap.movimentos).toBe(2);
    });

    it('separa numerário de multicaixa pelo meio de pagamento do movimento', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        {
          tipo: 'entrada',
          valor: 300,
          meioPagamento: 'numerario',
          contaOrigemId: null,
          contaDestinoId: 'c-caixa',
        },
        {
          tipo: 'entrada',
          valor: 700,
          meioPagamento: 'multicaixa',
          contaOrigemId: null,
          contaDestinoId: 'c-caixa',
        },
      ]);

      const ap = await service.apurar('s-1');

      expect(ap.totalNumerario).toBe(300);
      expect(ap.totalMulticaixa).toBe(700);
      expect(ap.totalEntradas).toBe(1000);
      expect(ap.totalEsperado).toBe(1100);
    });

    it('um ajuste que credita a caixa entra no total esperado', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        {
          tipo: 'ajuste',
          valor: 50,
          meioPagamento: 'numerario',
          contaOrigemId: null,
          contaDestinoId: 'c-caixa',
        },
      ]);

      const ap = await service.apurar('s-1');

      expect(ap.totalEntradas).toBe(50);
      expect(ap.totalEsperado).toBe(150);
    });

    it('devolve os totais congelados no fecho em vez de os reconstruir', async () => {
      const fechada = {
        ...sessaoAberta,
        estado: 'fechada',
        totalEntradas: 400,
        totalSaidas: 150,
        totalNumerario: 250,
        totalMulticaixa: 0,
        totalTransferencia: 150,
        totalEsperado: 300,
        totalContado: 295,
        diferenca: -5,
      };
      mockPrisma.sessaoCaixa.findUnique.mockResolvedValue(fechada);
      mockPrisma.sessaoCaixa.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 's-1' ? fechada : null)
      );

      const ap = await service.apurar('s-1');

      // As saídas não são zero só porque o fecho não as tinha guardado: são
      // o que a sessão fechou com.
      expect(ap.totalEntradas).toBe(400);
      expect(ap.totalSaidas).toBe(150);
      expect(ap.totalEsperado).toBe(300);
      expect(ap.totalContado).toBe(295);
      expect(ap.diferenca).toBe(-5);
    });

    it('ignora movimentos pendentes e estornados', async () => {
      // A query do serviço já filtra por `estado: 'confirmado'`, portanto o
      // mock devolve apenas o que sobrevive a esse filtro.
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([]);

      const ap = await service.apurar('s-1');

      expect(ap.totalEsperado).toBe(100);
      expect(mockPrisma.movimentoTesouraria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sessaoCaixaId: 's-1', estado: 'confirmado' }) })
      );
    });
  });

  describe('fechar', () => {
    it('regista a contagem e calcula a diferença', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([
        { tipo: 'entrada', valor: 200, contaOrigemId: null, contaDestinoId: 'c-caixa' },
        { tipo: 'saida', valor: 50, contaOrigemId: 'c-caixa', contaDestinoId: null },
      ]);

      const fechada = await service.fechar('s-1', {
        totalNumerario: 240,
        totalMulticaixa: 0,
        totalTransferencia: 0,
      });

      const data = mockPrisma.sessaoCaixa.update.mock.calls[0][0].data;
      expect(Number(data.totalEsperado)).toBe(250);
      expect(Number(data.totalContado)).toBe(240);
      // Faltaram 10: a diferença fica registada, não é "corrigida".
      expect(Number(data.diferenca)).toBe(-10);
      expect(data.estado).toBe('fechada');
      expect(fechada.id).toBe('s-1');
    });

    it('aceita uma diferença positiva (sobra de caixa)', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([]);

      await service.fechar('s-1', {
        totalNumerario: 130,
        totalMulticaixa: 0,
        totalTransferencia: 0,
      });

      const data = mockPrisma.sessaoCaixa.update.mock.calls[0][0].data;
      expect(Number(data.diferenca)).toBe(30);
    });

    it('uma contagem exacta dá diferença zero', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([]);

      await service.fechar('s-1', { totalNumerario: 100, totalMulticaixa: 0, totalTransferencia: 0 });

      const data = mockPrisma.sessaoCaixa.update.mock.calls[0][0].data;
      expect(Number(data.diferenca)).toBe(0);
    });

    it('soma os três totais para chegar ao total contado', async () => {
      mockPrisma.movimentoTesouraria.findMany.mockResolvedValue([]);

      await service.fechar('s-1', {
        totalNumerario: 60,
        totalMulticaixa: 30,
        totalTransferencia: 20,
      });

      const data = mockPrisma.sessaoCaixa.update.mock.calls[0][0].data;
      expect(Number(data.totalContado)).toBe(110);
    });

    it('recusa fechar uma sessão já fechada', async () => {
      mockPrisma.sessaoCaixa.findUnique.mockResolvedValue({ ...sessaoAberta, estado: 'fechada' });

      await expect(
        service.fechar('s-1', { totalNumerario: 100, totalMulticaixa: 0, totalTransferencia: 0 })
      ).rejects.toThrow(/já está fechada/);
    });

    it('recusa uma contagem inteiramente a zero', async () => {
      await expect(
        service.fechar('s-1', { totalNumerario: 0, totalMulticaixa: 0, totalTransferencia: 0 })
      ).rejects.toThrow(/pelo menos um total/);
    });

    it('recusa totais negativos', async () => {
      await expect(
        service.fechar('s-1', { totalNumerario: -5, totalMulticaixa: 0, totalTransferencia: 0 })
      ).rejects.toThrow();
    });

    it('devolve NotFoundError para uma sessão inexistente', async () => {
      mockPrisma.sessaoCaixa.findUnique.mockResolvedValue(null);

      await expect(
        service.fechar('fantasma', { totalNumerario: 100, totalMulticaixa: 0, totalTransferencia: 0 })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getAberta', () => {
    it('devolve a sessão aberta da caixa', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue({ ...sessaoAberta, numero: 'SC CX/0003' });

      const sessao = await service.getAberta('c-caixa');

      expect(sessao?.numero).toBe('SC CX/0003');
      expect(mockPrisma.sessaoCaixa.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contaCaixaId: 'c-caixa', estado: 'aberta' } })
      );
    });

    it('devolve null quando não há sessão aberta', async () => {
      mockPrisma.sessaoCaixa.findFirst.mockResolvedValue(null);

      expect(await service.getAberta('c-caixa')).toBeNull();
    });
  });

  describe('listarMovimentos', () => {
    it('devolve os movimentos da sessão por ordem cronológica', async () => {
      mockPrisma.sessaoCaixa.findUnique.mockResolvedValue(sessaoAberta);

      await service.listarMovimentos('s-1');

      expect(mockPrisma.movimentoTesouraria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessaoCaixaId: 's-1' } })
      );
    });
  });
});
