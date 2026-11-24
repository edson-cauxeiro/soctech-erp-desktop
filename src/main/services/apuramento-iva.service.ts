/**
 * @file apuramento-iva.service.ts
 * @description Apuramento de IVA por período.
 *
 * O cálculo segue a regra:
 *   ivaLiquidado   = Σ créditos − Σ débitos nas contas VAT_OUTPUT (classe 3/4)
 *   ivaDedutivel   = Σ débitos − Σ créditos nas contas VAT_INPUT  (classe 3/4)
 *   saldo          = liquidado − dedutivel − creditoTransitado
 *
 * Se saldo > 0 → a pagar (VAT_PAYABLE)
 * Se saldo < 0 → a recuperar (VAT_RECOVERABLE)
 *
 * O crédito transitado (saldo negativo) é transportado para o período seguinte
 * como `creditoTransitado` do apuramento seguinte.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

interface PrevisaoApuramentoDto {
  periodoId: string;
  exercicioId: string;
  ivaLiquidado: string;
  ivaDedutivel: string;
  creditoTransitado: string;
  saldo: string;
  aPagar: string;
  aRecuperar: string;
  detalhes: {
    contasOutput: Array<{ codigo: string; designacao: string; debito: string; credito: string; liquido: string }>;
    contasInput: Array<{ codigo: string; designacao: string; debito: string; credito: string; liquido: string }>;
  };
}

interface PrevisaoParaLinhasDto {
  ivaLiquidado: string;
  ivaDedutivel: string;
  creditoTransitado: string;
  saldo: string;
  aPagar: string;
  aRecuperar: string;
}

export class ApuramentoIvaService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  // ─── Previsão (cálculo sem gravar) ────────────────────────────────────────

  async previsao(periodoId: string): Promise<PrevisaoApuramentoDto> {
    const periodo = await this.prisma.periodoContabil.findUnique({
      where: { id: periodoId },
      include: { exercicio: { select: { id: true, estado: true, empresaId: true, ano: true } } },
    });
    if (!periodo) throw new NotFoundError(`Período ${periodoId} não encontrado.`);
    if (periodo.estado !== 'aberto') {
      throw new BusinessRuleError('O apuramento de IVA só pode ser feito em períodos abertos (antes do fecho).');
    }

    const empresaId = periodo.exercicio.empresaId;

    // Buscar crédito transitado do período anterior
    const apuramentoAnterior = await this.prisma.apuramentoImposto.findFirst({
      where: {
        exercicioId: periodo.exercicioId,
        tipoImposto: 'IVA',
        periodo: { numero: periodo.numero - 1 },
      },
      select: { saldo: true },
    });
    // O crédito a transitar é o saldo negativo (a recuperar) do período anterior.
    const saldoAnterior = apuramentoAnterior?.saldo ?? new Prisma.Decimal(0);
    const creditoTransitado = saldoAnterior.lt(0) ? saldoAnterior.abs() : new Prisma.Decimal(0);

    // Contas VAT_OUTPUT (IVA liquidado)
    const contasResultados = await Promise.all([
      this.buscarContasPorMapeamento(empresaId, ['VAT_OUTPUT', 'VAT_PAYABLE', 'VAT_RECOVERABLE']),
      this.buscarContasPorMapeamento(empresaId, ['VAT_INPUT']),
    ]);
    const contasOutput = contasResultados[0];
    const contasInput = contasResultados[1];

    const { debito: debitoOutput, credito: creditoOutput, linhas: linhasOutput } = await this.calcularLiquidoContas(
      contasOutput,
      periodoId
    );
    const { debito: debitoInput, credito: creditoInput, linhas: linhasInput } = await this.calcularLiquidoContas(
      contasInput,
      periodoId
    );

    // IVA liquidado = créditos - débitos nas contas de output
    const ivaLiquidado = creditoOutput.minus(debitoOutput);
    // IVA dedutível = débitos - créditos nas contas de input
    const ivaDedutivel = debitoInput.minus(creditoInput);

    // Saldo = liquidado - dedutivel - creditoTransitado
    const saldo = ivaLiquidado.minus(ivaDedutivel).minus(creditoTransitado);

    const aPagar = saldo.gt(0) ? saldo : new Prisma.Decimal(0);
    const aRecuperar = saldo.lt(0) ? saldo.abs() : new Prisma.Decimal(0);

    return {
      periodoId,
      exercicioId: periodo.exercicioId,
      ivaLiquidado: ivaLiquidado.toFixed(4),
      ivaDedutivel: ivaDedutivel.toFixed(4),
      creditoTransitado: creditoTransitado.toFixed(4),
      saldo: saldo.toFixed(4),
      aPagar: aPagar.toFixed(4),
      aRecuperar: aRecuperar.toFixed(4),
      detalhes: {
        contasOutput: linhasOutput.map(l => ({
          codigo: l.codigo,
          designacao: l.designacao,
          debito: l.debito.toFixed(4),
          credito: l.credito.toFixed(4),
          liquido: l.liquido.toFixed(4),
        })),
        contasInput: linhasInput.map(l => ({
          codigo: l.codigo,
          designacao: l.designacao,
          debito: l.debito.toFixed(4),
          credito: l.credito.toFixed(4),
          liquido: l.liquido.toFixed(4),
        })),
      },
    };
  }

  // ─── Histórico ──────────────────────────────────────────────────────────

  async listar(empresaId: string, exercicioId?: string): Promise<Array<{
    id: string;
    periodoId: string;
    exercicioId: string;
    periodoNumero: number;
    ano: string;
    tipoImposto: string;
    estado: string;
    liquidado: string;
    dedutivel: string;
    creditoTransitado: string;
    saldo: string;
    pagoEm: Date | null;
    lancamentoId: string | null;
  }>> {
    const apuramentos = await this.prisma.apuramentoImposto.findMany({
      where: {
        empresaId,
        tipoImposto: 'IVA',
        ...(exercicioId ? { exercicioId } : {}),
      },
      include: {
        periodo: { select: { numero: true } },
        exercicio: { select: { ano: true } },
      },
      orderBy: [{ exercicio: { ano: 'desc' } }, { periodo: { numero: 'desc' } }],
    });

    return apuramentos.map((a) => ({
      id: a.id,
      periodoId: a.periodoId,
      exercicioId: a.exercicioId,
      periodoNumero: a.periodo.numero,
      ano: a.exercicio.ano,
      tipoImposto: a.tipoImposto,
      estado: a.estado,
      liquidado: a.liquidado.toFixed(4),
      dedutivel: a.dedutivel.toFixed(4),
      creditoTransitado: a.creditoTransitado.toFixed(4),
      saldo: a.saldo.toFixed(4),
      pagoEm: a.pagoEm,
      lancamentoId: a.lancamentoId,
    }));
  }

  // ─── Execução (grava apuramento + lançamento) ───────────────────────────
  async executar(periodoId: string, utilizadorId: string): Promise<{ apuramentoId: string; lancamentoId: string }> {
    const previsao = await this.previsao(periodoId);

    // Verificar se já existe apuramento para este período/tipo
    const existente = await this.prisma.apuramentoImposto.findFirst({
      where: { periodoId: previsao.periodoId, tipoImposto: 'IVA' },
    });
    if (existente) {
      throw new BusinessRuleError('Já existe apuramento de IVA para este período.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Criar apuramento
      const periodo = await tx.periodoContabil.findUnique({ where: { id: previsao.periodoId }, include: { exercicio: true } });
      if (!periodo) throw new BusinessRuleError('Período não encontrado.');

      const apuramento = await tx.apuramentoImposto.create({
        data: {
          empresaId: periodo.exercicio.empresaId,
          periodoId: previsao.periodoId,
          exercicioId: previsao.exercicioId,
          tipoImposto: 'IVA',
          estado: 'validado',
          liquidado: new Prisma.Decimal(previsao.ivaLiquidado),
          dedutivel: new Prisma.Decimal(previsao.ivaDedutivel),
          creditoTransitado: new Prisma.Decimal(previsao.creditoTransitado),
          saldo: new Prisma.Decimal(previsao.saldo),
          lancamentoId: null,
          criadoPorId: utilizadorId,
          validadoPorId: utilizadorId,
          validadoEm: new Date(),
        },
      });

      // 2. Criar lançamento de apuramento
      const periodoObj = await tx.periodoContabil.findUnique({ where: { id: previsao.periodoId }, include: { exercicio: true } });
      if (!periodoObj) throw new BusinessRuleError('Período não encontrado.');

      const diarioApuramento = await tx.diarioContabil.findFirst({
        where: { empresaId: periodoObj.exercicio.empresaId, tipo: 'liquidacao', activo: true },
      });
      if (!diarioApuramento) throw new BusinessRuleError('Não existe diário de liquidação activo para apuramento de IVA.');

      const mapeamentos = await this.resolverContasApuramento(tx, periodoObj.exercicio.empresaId);

      const linhas = this.construirLinhasApuramento(previsao, mapeamentos);

      const totalDebito = linhas.reduce(
        (soma, l) => soma.plus(new Prisma.Decimal(l.debito)),
        new Prisma.Decimal(0)
      );
      const totalCredito = linhas.reduce(
        (soma, l) => soma.plus(new Prisma.Decimal(l.credito)),
        new Prisma.Decimal(0)
      );

      const lancamento = await tx.lancamentoContabil.create({
        data: {
          empresaId: periodoObj.exercicio.empresaId,
          diarioId: diarioApuramento.id,
          exercicioId: previsao.exercicioId,
          periodoId: previsao.periodoId,
          dataContabilistica: periodoObj.dataFim,
          dataDocumento: periodoObj.dataFim,
          descricao: `Apuramento IVA - Período ${periodoObj.numero}/${periodoObj.exercicio.ano}`,
          origem: 'liquidacao',
          moduloOrigem: 'apuramento-iva',
          tipoOrigem: 'apuramento',
          origemId: previsao.periodoId,
          criadoPorId: utilizadorId,
          totalDebito,
          totalCredito,
          linhas: { create: linhas },
        },
        select: { id: true },
      });

      // 3. Atualizar apuramento com ID do lançamento
      await tx.apuramentoImposto.update({
        where: { id: apuramento.id },
        data: { lancamentoId: lancamento.id, estado: 'validado' },
      });

      // 4. Validar lançamento (atribui número)
      const { sequenciaDiarioService } = await import('./sequencia-diario.service');
      const numero = await sequenciaDiarioService.proximoNumero(diarioApuramento.id, previsao.exercicioId, tx);

      await tx.lancamentoContabil.update({
        where: { id: lancamento.id },
        data: { numero, estado: 'validado', validadoPorId: utilizadorId, validadoEm: new Date() },
      });

      await tx.auditLog.create({
        data: {
          empresaId: periodoObj.exercicio.empresaId,
          utilizadorId,
          acao: 'apurar',
          severidade: 'info',
          entidade: 'ApuramentoImposto',
          entidadeId: apuramento.id,
          modulo: 'contabilidade',
          descricao: `Apuramento IVA período ${periodoObj.numero}/${periodoObj.exercicio.ano} executado.`,
          dadosNovos: JSON.stringify({ ivaLiquidado: previsao.ivaLiquidado, ivaDedutivel: previsao.ivaDedutivel, saldo: previsao.saldo }),
        },
      });

      return { apuramentoId: apuramento.id, lancamentoId: lancamento.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ─── Registo de pagamento ───────────────────────────────────────────────

  async registarPagamento(apuramentoId: string, dataPagamento: Date, contaBancariaId: string, utilizadorId: string): Promise<{ lancamentoId: string }> {
    const apuramento = await this.prisma.apuramentoImposto.findUnique({
      where: { id: apuramentoId },
      include: { periodo: { include: { exercicio: true } } },
    });
    if (!apuramento) throw new NotFoundError('Apuramento não encontrado.');
    if (apuramento.estado !== 'validado') throw new BusinessRuleError('Só apuramentos validados podem ser pagos.');
    if (apuramento.saldo.lte(0)) throw new BusinessRuleError('Não há valor a pagar neste apuramento.');

    const contaBancaria = await this.prisma.contaBancaria.findUnique({ where: { id: contaBancariaId } });
    if (!contaBancaria) throw new NotFoundError('Conta bancária não encontrada.');

    const mapeamento = await this.prisma.mapeamentoConta.findFirst({
      where: { empresaId: apuramento.empresaId, chave: 'VAT_PAYABLE' },
      select: { contaId: true },
    });
    if (!mapeamento) throw new BusinessRuleError('Mapeamento VAT_PAYABLE não configurado.');

    const mapeamentoBanco = await this.prisma.mapeamentoConta.findFirst({
      where: { empresaId: apuramento.empresaId, chave: 'BANK_ACCOUNT' },
      select: { contaId: true },
    });
    const contaBancoContabil = await this.prisma.contaBancaria.findUnique({
      where: { id: contaBancariaId, empresaId: apuramento.empresaId },
      select: { contaContabilId: true },
    });
    const contaBanco = mapeamentoBanco?.contaId ?? contaBancoContabil?.contaContabilId;
    if (!contaBanco) throw new BusinessRuleError('Conta contabilística da conta bancária não resolvida.');

    return this.prisma.$transaction(async (tx) => {
      const diario = await tx.diarioContabil.findFirst({
        where: { empresaId: apuramento.empresaId, tipo: 'banco', activo: true },
      });
      if (!diario) throw new BusinessRuleError('Não existe diário de banco activo.');

      const periodo = await tx.periodoContabil.findFirst({
        where: { exercicioId: apuramento.exercicioId, dataInicio: { lte: dataPagamento }, dataFim: { gte: dataPagamento } },
        select: { id: true, exercicioId: true },
      });
      if (!periodo) throw new BusinessRuleError('Não existe período para a data de pagamento.');

      const { sequenciaDiarioService } = await import('./sequencia-diario.service');
      const numero = await sequenciaDiarioService.proximoNumero(diario.id, periodo.exercicioId, tx);

      const lancamento = await tx.lancamentoContabil.create({
        data: {
          empresaId: apuramento.empresaId,
          diarioId: diario.id,
          exercicioId: periodo.exercicioId,
          periodoId: periodo.id,
          numero,
          dataContabilistica: dataPagamento,
          dataDocumento: dataPagamento,
          descricao: `Pagamento IVA - Apuramento ${apuramento.periodo?.numero ?? apuramentoId}`,
          origem: 'integracao',
          moduloOrigem: 'apuramento-iva',
          tipoOrigem: 'pagamento',
          origemId: apuramentoId,
          criadoPorId: utilizadorId,
          totalDebito: new Prisma.Decimal(apuramento.saldo.toString()),
          totalCredito: new Prisma.Decimal(apuramento.saldo.toString()),
          linhas: {
            create: [
              { numeroLinha: 1, contaId: mapeamento.contaId, debito: new Prisma.Decimal(apuramento.saldo.toString()), credito: new Prisma.Decimal(0), descricao: 'IVA a pagar' },
              { numeroLinha: 2, contaId: contaBanco, debito: new Prisma.Decimal(0), credito: new Prisma.Decimal(apuramento.saldo.toString()), descricao: 'Pagamento IVA' },
            ],
          },
        },
        select: { id: true },
      });

      await tx.apuramentoImposto.update({
        where: { id: apuramentoId },
        data: { estado: 'pago', pagoEm: dataPagamento, pagoPorId: utilizadorId },
      });

      await tx.auditLog.create({
        data: {
          empresaId: apuramento.empresaId,
          utilizadorId,
          acao: 'pagar',
          severidade: 'info',
          entidade: 'ApuramentoImposto',
          entidadeId: apuramentoId,
          modulo: 'contabilidade',
          descricao: `Pagamento IVA ${apuramento.saldo.toFixed(4)} registado.`,
          dadosNovos: JSON.stringify({ apuramentoId, valor: apuramento.saldo.toFixed(4) }),
        },
      });

      return { lancamentoId: lancamento.id };
    });
  }

  // ─── Interno ────────────────────────────────────────────────────────────

  private async buscarContasPorMapeamento(empresaId: string, chaves: string[]): Promise<string[]> {
    const mapeamentos = await this.prisma.mapeamentoConta.findMany({
      where: { empresaId, chave: { in: chaves } },
      select: { contaId: true },
    });
    return mapeamentos.map(m => m.contaId);
  }

  private async calcularLiquidoContas(
    contaIds: string[],
    periodoId: string
  ): Promise<{ debito: Prisma.Decimal; credito: Prisma.Decimal; linhas: Array<{ codigo: string; designacao: string; debito: Prisma.Decimal; credito: Prisma.Decimal; liquido: Prisma.Decimal }> }> {
    if (contaIds.length === 0) {
      return { debito: new Prisma.Decimal(0), credito: new Prisma.Decimal(0), linhas: [] };
    }

    const agg = await this.prisma.linhaLancamentoContabil.groupBy({
      by: ['contaId'],
      where: { contaId: { in: contaIds }, lancamento: { periodoId, estado: 'validado' } },
      _sum: { debito: true, credito: true },
    });

    const contas = await this.prisma.contaContabil.findMany({
      where: { id: { in: contaIds } },
      select: { id: true, codigo: true, designacao: true },
    });
    const contasMap = new Map(contas.map(c => [c.id, c]));

    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    const linhas: Array<{ codigo: string; designacao: string; debito: Prisma.Decimal; credito: Prisma.Decimal; liquido: Prisma.Decimal }> = [];

    for (const a of agg) {
      const conta = contasMap.get(a.contaId);
      if (!conta) continue;
      const debito = new Prisma.Decimal(a._sum.debito ?? 0);
      const credito = new Prisma.Decimal(a._sum.credito ?? 0);
      const liquido = debito.minus(credito);
      totalDebito = totalDebito.plus(debito);
      totalCredito = totalCredito.plus(credito);
      linhas.push({ codigo: conta.codigo, designacao: conta.designacao, debito, credito, liquido });
    }

    return { debito: totalDebito, credito: totalCredito, linhas };
  }

  private async resolverContasApuramento(tx: any, empresaId: string): Promise<Record<string, string>> {
    const chaves = ['VAT_OUTPUT', 'VAT_INPUT', 'VAT_PAYABLE', 'VAT_RECOVERABLE'];
    const mapeamentos = await tx.mapeamentoConta.findMany({
      where: { empresaId, chave: { in: chaves } },
      select: { chave: true, contaId: true },
    });
    const mapa: Record<string, string> = {};
    for (const m of mapeamentos) mapa[m.chave] = m.contaId;
    return mapa;
  }

  private construirLinhasApuramento(previsao: PrevisaoParaLinhasDto, mapeamentos: { [key: string]: string }): any[] {
    const linhas: any[] = [];
    let nl = 1;

    // D VAT_OUTPUT (IVA liquidado)
    if (mapeamentos.VAT_OUTPUT && parseFloat(previsao.ivaLiquidado) > 0) {
      linhas.push({ numeroLinha: nl++, contaId: mapeamentos.VAT_OUTPUT, debito: previsao.ivaLiquidado, credito: '0', descricao: 'IVA liquidado' });
    }
    // C VAT_INPUT (IVA dedutível)
    if (mapeamentos.VAT_INPUT && parseFloat(previsao.ivaDedutivel) > 0) {
      linhas.push({ numeroLinha: nl++, contaId: mapeamentos.VAT_INPUT, debito: '0', credito: previsao.ivaDedutivel, descricao: 'IVA dedutível' });
    }
    // C VAT_RECOVERABLE (crédito transitado do período anterior)
    if (mapeamentos.VAT_RECOVERABLE && parseFloat(previsao.creditoTransitado) > 0) {
      linhas.push({ numeroLinha: nl++, contaId: mapeamentos.VAT_RECOVERABLE, debito: '0', credito: previsao.creditoTransitado, descricao: 'Crédito de IVA transitado' });
    }
    // C VAT_PAYABLE ou D VAT_RECOVERABLE conforme saldo
    if (parseFloat(previsao.saldo) > 0 && mapeamentos.VAT_PAYABLE) {
      linhas.push({ numeroLinha: nl++, contaId: mapeamentos.VAT_PAYABLE, debito: '0', credito: previsao.aPagar, descricao: 'IVA a pagar' });
    } else if (parseFloat(previsao.saldo) < 0 && mapeamentos.VAT_RECOVERABLE) {
      linhas.push({ numeroLinha: nl++, contaId: mapeamentos.VAT_RECOVERABLE, debito: previsao.aRecuperar, credito: '0', descricao: 'IVA a recuperar' });
    }
    return linhas;
  }
}

export const apuramentoIvaService = new ApuramentoIvaService();