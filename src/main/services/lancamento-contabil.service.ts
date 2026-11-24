/**
 * @file lancamento-contabil.service.ts
 * @description Lançamentos contabilísticos em partidas dobradas.
 *
 * O ciclo é `rascunho → validado → estornado`:
 *  - O rascunho pode ser editado e apagado, e pode estar desequilibrado.
 *  - A validação é a fronteira de confiança: período e exercício abertos,
 *    contas folha activas, exigências de centro de custo/entidade, equilíbrio
 *    exacto e número atribuído atomicamente. Tudo numa transacção
 *    `Serializable`, com retry em conflitos.
 *  - Depois de validado, o lançamento é imutável. O estorno cria um novo
 *    lançamento com os lados invertidos e marca o original como `estornado`.
 *
 * Os montantes saem do serviço como string com 4 casas para o renderer não
 * perder precisão ao passar por JSON. O `serializeIpcData` não os converte
 * porque já não são `Decimal`.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  criarLancamentoSchema,
  atualizarLancamentoSchema,
  estornarLancamentoSchema,
  lancamentoFiltersSchema,
  CriarLancamentoInput,
  AtualizarLancamentoInput,
  EstornarLancamentoInput,
  LancamentoFilters,
} from '../validators/lancamento-contabil.validator';
import { SequenciaDiarioService, sequenciaDiarioService } from './sequencia-diario.service';
import { BusinessRuleError, NotFoundError, ValidationError } from '../utils/errors';

const selectUtilizador = { id: true, nomeCompleto: true } as const;
const selectDiario = { id: true, codigo: true, designacao: true } as const;
const selectPeriodo = {
  id: true,
  numero: true,
  dataInicio: true,
  dataFim: true,
  estado: true,
} as const;
const selectExercicio = { id: true, ano: true, estado: true } as const;

const includeLista = {
  diario: { select: selectDiario },
  periodo: { select: selectPeriodo },
  exercicio: { select: selectExercicio },
  criadoPor: { select: selectUtilizador },
  validadoPor: { select: selectUtilizador },
  _count: { select: { linhas: true } },
} satisfies Prisma.LancamentoContabilInclude;

const includeDetalhe = {
  ...includeLista,
  linhas: {
    orderBy: { numeroLinha: 'asc' as const },
    include: {
      conta: {
        select: {
          id: true,
          codigo: true,
          designacao: true,
          aceitaMovimento: true,
          exigeCentroCusto: true,
          exigeEntidade: true,
        },
      },
      centroCusto: { select: { id: true, codigo: true, designacao: true } },
    },
  },
  estornoDe: { select: { id: true, numero: true, descricao: true } },
  estornadoPor: { select: { id: true, numero: true, descricao: true } },
} satisfies Prisma.LancamentoContabilInclude;

type LancamentoLista = Prisma.LancamentoContabilGetPayload<{ include: typeof includeLista }>;
type LancamentoDetalhe = Prisma.LancamentoContabilGetPayload<{ include: typeof includeDetalhe }>;

function decimalParaString(valor: Prisma.Decimal | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return valor.toFixed(4);
}

function mapearLista(lancamento: LancamentoLista) {
  return {
    ...lancamento,
    totalDebito: typeof lancamento.totalDebito === 'string' ? lancamento.totalDebito : lancamento.totalDebito.toFixed(4),
    totalCredito: typeof lancamento.totalCredito === 'string' ? lancamento.totalCredito : lancamento.totalCredito.toFixed(4),
    taxaCambio: typeof lancamento.taxaCambio === 'string' ? lancamento.taxaCambio : lancamento.taxaCambio.toFixed(6),
  };
}

function mapearDetalhe(lancamento: LancamentoDetalhe) {
  return {
    ...mapearLista(lancamento),
    linhas: lancamento.linhas.map((linha) => ({
      ...linha,
      debito: linha.debito.toFixed(4),
      credito: linha.credito.toFixed(4),
      baseImposto: decimalParaString(linha.baseImposto),
    })),
  };
}

export class LancamentoContabilService {
  private prisma: PrismaClient;
  private sequencia: SequenciaDiarioService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    sequencia: SequenciaDiarioService = sequenciaDiarioService
  ) {
    this.prisma = prismaClient;
    this.sequencia = sequencia;
  }

  // ─── Leitura ──────────────────────────────────────────────────────────────

  async listar(filters?: unknown): Promise<{
    items: ReturnType<typeof mapearLista>[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const f: LancamentoFilters = filters
      ? lancamentoFiltersSchema.parse(filters)
      : lancamentoFiltersSchema.parse({});

    const where: Prisma.LancamentoContabilWhereInput = {};
    if (f.empresaId) where.empresaId = f.empresaId;
    if (f.exercicioId) where.exercicioId = f.exercicioId;
    if (f.periodoId) where.periodoId = f.periodoId;
    if (f.diarioId) where.diarioId = f.diarioId;
    if (f.estado) where.estado = f.estado;

    if (f.dataInicio || f.dataFim) {
      where.dataContabilistica = {
        ...(f.dataInicio ? { gte: f.dataInicio } : {}),
        ...(f.dataFim ? { lte: f.dataFim } : {}),
      };
    }

    const linhaWhere: Prisma.LinhaLancamentoContabilWhereInput = {};
    if (f.contaId) linhaWhere.contaId = f.contaId;
    if (f.entidadeTipo) linhaWhere.entidadeTipo = f.entidadeTipo;
    if (f.entidadeId) linhaWhere.entidadeId = f.entidadeId;
    if (Object.keys(linhaWhere).length > 0) where.linhas = { some: linhaWhere };

    if (f.search) {
      const termo = f.search.trim();
      where.OR = [
        { descricao: { contains: termo, mode: 'insensitive' } },
        { origemId: { contains: termo, mode: 'insensitive' } },
      ];
      if (/^\d+$/.test(termo)) where.OR.push({ numero: Number(termo) });
    }

    const [items, total] = await Promise.all([
      this.prisma.lancamentoContabil.findMany({
        where,
        include: includeLista,
        orderBy: [{ dataContabilistica: 'desc' }, { createdAt: 'desc' }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.prisma.lancamentoContabil.count({ where }),
    ]);

    return { items: items.map(mapearLista), total, page: f.page, pageSize: f.pageSize };
  }

  async obter(id: string) {
    const lancamento = await this.prisma.lancamentoContabil.findUnique({
      where: { id },
      include: includeDetalhe,
    });
    if (!lancamento) throw new NotFoundError(`Lançamento contabilístico '${id}' não encontrado.`);
    return mapearDetalhe(lancamento);
  }

  // ─── Escrita ──────────────────────────────────────────────────────────────

  async criar(rawInput: unknown, utilizadorId?: string): Promise<ReturnType<typeof mapearDetalhe>> {
    const input: CriarLancamentoInput = criarLancamentoSchema.parse(rawInput);
    const autorId = this.exigirUtilizador(utilizadorId);

    return this.prisma.$transaction(async (tx) => {
      await this.exigirEmpresa(tx, input.empresaId);
      await this.exigirDiario(tx, input.diarioId, input.empresaId);
      const periodo = await this.resolverPeriodoAberto(tx, input.empresaId, input.dataContabilistica);
      const { totalDebito, totalCredito } = await this.validarContasBasico(
        tx,
        input.empresaId,
        input.linhas
      );

      const lancamento = await tx.lancamentoContabil.create({
        data: {
          empresaId: input.empresaId,
          diarioId: input.diarioId,
          exercicioId: periodo.exercicioId,
          periodoId: periodo.id,
          dataContabilistica: input.dataContabilistica,
          dataDocumento: input.dataDocumento ?? null,
          descricao: input.descricao.trim(),
          origem: input.origem,
          moduloOrigem: input.moduloOrigem ?? null,
          tipoOrigem: input.tipoOrigem ?? null,
          origemId: input.origemId ?? null,
          criadoPorId: autorId,
          totalDebito,
          totalCredito,
          linhas: { create: this.linhasParaCreate(input.linhas) },
        },
        include: includeDetalhe,
      });

      return mapearDetalhe(lancamento);
    });
  }

  async atualizar(
    id: string,
    rawInput: unknown,
    utilizadorId?: string
  ): Promise<ReturnType<typeof mapearDetalhe>> {
    const input: AtualizarLancamentoInput = atualizarLancamentoSchema.parse(rawInput);
    this.exigirUtilizador(utilizadorId);

    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.lancamentoContabil.findUnique({
        where: { id },
        include: includeDetalhe,
      });
      if (!existente) throw new NotFoundError(`Lançamento contabilístico '${id}' não encontrado.`);
      if (existente.estado !== 'rascunho') {
        throw new BusinessRuleError('Só lançamentos em rascunho podem ser alterados.');
      }

      const diarioId = input.diarioId ?? existente.diarioId;
      await this.exigirDiario(tx, diarioId, existente.empresaId);

      const dataContabilistica = input.dataContabilistica ?? existente.dataContabilistica;
      const periodo = await this.resolverPeriodoAberto(tx, existente.empresaId, dataContabilistica);

      let totalDebito = existente.totalDebito;
      let totalCredito = existente.totalCredito;
      if (input.linhas) {
        const totais = await this.validarContasBasico(tx, existente.empresaId, input.linhas);
        totalDebito = totais.totalDebito;
        totalCredito = totais.totalCredito;
      }

      const lancamento = await tx.lancamentoContabil.update({
        where: { id },
        data: {
          diarioId,
          exercicioId: periodo.exercicioId,
          periodoId: periodo.id,
          dataContabilistica,
          dataDocumento: input.dataDocumento ?? existente.dataDocumento,
          descricao: input.descricao?.trim() ?? existente.descricao,
          origem: input.origem ?? existente.origem,
          moduloOrigem: input.moduloOrigem ?? existente.moduloOrigem,
          tipoOrigem: input.tipoOrigem ?? existente.tipoOrigem,
          origemId: input.origemId ?? existente.origemId,
          totalDebito,
          totalCredito,
          ...(input.linhas
            ? {
                linhas: {
                  deleteMany: {},
                  create: this.linhasParaCreate(input.linhas),
                },
              }
            : {}),
        },
        include: includeDetalhe,
      });

      return mapearDetalhe(lancamento);
    });
  }

  async validar(id: string, utilizadorId?: string): Promise<ReturnType<typeof mapearDetalhe>> {
    const autorId = this.exigirUtilizador(utilizadorId);
    return this.executarSerializable((tx) => this.validarDentroTransacao(tx, id, autorId));
  }

  async estornar(
    id: string,
    rawInput: unknown
  ): Promise<{
    original: ReturnType<typeof mapearDetalhe>;
    estorno: ReturnType<typeof mapearDetalhe>;
  }> {
    const input: EstornarLancamentoInput = estornarLancamentoSchema.parse(rawInput);
    const autorId = this.exigirUtilizador(input.utilizadorId);

    return this.executarSerializable(async (tx) => {
      const original = await tx.lancamentoContabil.findUnique({
        where: { id },
        include: includeDetalhe,
      });
      if (!original) throw new NotFoundError(`Lançamento contabilístico '${id}' não encontrado.`);
      if (original.estado !== 'validado') {
        throw new BusinessRuleError('Só lançamentos validados podem ser estornados.');
      }
      if (original.origem === 'estorno' || original.estornoDeId) {
        throw new BusinessRuleError('Um lançamento de estorno não pode ser estornado.');
      }

      const periodo = await this.resolverPeriodoAberto(
        tx,
        original.empresaId,
        input.dataContabilistica
      );

      const novo = await tx.lancamentoContabil.create({
        data: {
          empresaId: original.empresaId,
          diarioId: original.diarioId,
          exercicioId: periodo.exercicioId,
          periodoId: periodo.id,
          dataContabilistica: input.dataContabilistica,
          dataDocumento: original.dataDocumento,
          descricao: input.descricao?.trim() || `Estorno de ${original.descricao}`,
          origem: 'estorno',
          estornoDeId: original.id,
          criadoPorId: autorId,
          totalDebito: original.totalCredito,
          totalCredito: original.totalDebito,
          linhas: {
            create: original.linhas.map((linha, indice) => ({
              numeroLinha: indice + 1,
              contaId: linha.contaId,
              debito: linha.credito,
              credito: linha.debito,
              descricao: linha.descricao,
              centroCustoId: linha.centroCustoId,
              entidadeTipo: linha.entidadeTipo,
              entidadeId: linha.entidadeId,
              codigoImposto: linha.codigoImposto,
              baseImposto: linha.baseImposto,
              dataVencimento: linha.dataVencimento,
            })),
          },
        },
        include: includeDetalhe,
      });

      const estornoValidado = await this.validarDentroTransacao(tx, novo.id, autorId);

      const originalEstornado = await tx.lancamentoContabil.update({
        where: { id: original.id },
        data: { estado: 'estornado' },
        include: includeDetalhe,
      });

      await tx.auditLog.create({
        data: {
          empresaId: original.empresaId,
          utilizadorId: autorId,
          acao: 'estornar',
          severidade: 'aviso',
          entidade: 'LancamentoContabil',
          entidadeId: original.id,
          modulo: 'contabilidade',
          descricao: `Lançamento ${original.numero ?? original.id} estornado pelo lançamento ${estornoValidado.numero ?? estornoValidado.id}.`,
          dadosAnteriores: JSON.stringify({
            estado: original.estado,
            numero: original.numero,
          }),
          dadosNovos: JSON.stringify({
            estado: 'estornado',
            estornoId: novo.id,
            estornoNumero: estornoValidado.numero,
          }),
        },
      });

      return {
        original: mapearDetalhe(originalEstornado),
        estorno: estornoValidado,
      };
    });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existente = await tx.lancamentoContabil.findUnique({
        where: { id },
        select: { id: true, estado: true, periodo: { select: { estado: true } } },
      });
      if (!existente) throw new NotFoundError(`Lançamento contabilístico '${id}' não encontrado.`);
      if (existente.estado !== 'rascunho') {
        throw new BusinessRuleError('Só lançamentos em rascunho podem ser eliminados.');
      }
      if (!existente.periodo) {
        throw new NotFoundError('Período do lançamento não encontrado.');
      }
      this.exigirPeriodoAberto(existente.periodo);

      await tx.linhaLancamentoContabil.deleteMany({ where: { lancamentoId: id } });
      await tx.lancamentoContabil.delete({ where: { id } });
    });
  }

  // ─── Interno ──────────────────────────────────────────────────────────────

  private exigirUtilizador(utilizadorId?: string): string {
    if (!utilizadorId?.trim()) throw new ValidationError('O utilizador é obrigatório.');
    return utilizadorId;
  }

  private async exigirEmpresa(tx: Prisma.TransactionClient, empresaId: string): Promise<void> {
    const empresa = await tx.empresaConfig.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });
    if (!empresa) throw new NotFoundError('Empresa não encontrada.');
  }

  private async exigirDiario(
    tx: Prisma.TransactionClient,
    diarioId: string,
    empresaId: string
  ): Promise<void> {
    const diario = await tx.diarioContabil.findFirst({
      where: { id: diarioId, empresaId },
      select: { id: true, activo: true, codigo: true },
    });
    if (!diario) throw new NotFoundError('Diário contabilístico não encontrado para esta empresa.');
    if (!diario.activo) throw new BusinessRuleError(`O diário ${diario.codigo} está inactivo.`);
  }

  private async resolverPeriodo(
    tx: Prisma.TransactionClient,
    empresaId: string,
    data: Date
  ): Promise<{ id: string; exercicioId: string; estado: string }> {
    const periodo = await tx.periodoContabil.findFirst({
      where: {
        dataInicio: { lte: data },
        dataFim: { gte: data },
        exercicio: { empresaId },
      },
      select: { id: true, exercicioId: true, estado: true },
      orderBy: { dataInicio: 'desc' },
    });
    if (!periodo) {
      throw new BusinessRuleError(
        'Não existe período contabilístico para a data indicada. Gere os períodos do exercício.'
      );
    }
    return periodo;
  }

  private exigirPeriodoAberto(periodo: { estado: string }): void {
    if (periodo.estado !== 'aberto') {
      throw new BusinessRuleError('Não é possível escrever num período fechado.');
    }
  }

  private async resolverPeriodoAberto(
    tx: Prisma.TransactionClient,
    empresaId: string,
    data: Date
  ): Promise<{ id: string; exercicioId: string; estado: string }> {
    const periodo = await this.resolverPeriodo(tx, empresaId, data);
    this.exigirPeriodoAberto(periodo);
    return periodo;
  }

  private linhasParaCreate(linhas: CriarLancamentoInput['linhas']) {
    return linhas.map((linha, indice) => ({
      numeroLinha: indice + 1,
      contaId: linha.contaId,
      debito: new Prisma.Decimal(linha.debito),
      credito: new Prisma.Decimal(linha.credito),
      descricao: linha.descricao ?? null,
      centroCustoId: linha.centroCustoId ?? null,
      entidadeTipo: linha.entidadeTipo ?? null,
      entidadeId: linha.entidadeId ?? null,
      codigoImposto: linha.codigoImposto ?? null,
      baseImposto: linha.baseImposto ? new Prisma.Decimal(linha.baseImposto) : null,
      dataVencimento: linha.dataVencimento ?? null,
    }));
  }

  /** Verificação mínima do rascunho: contas e centros de custo da empresa. */
  private async validarContasBasico(
    tx: Prisma.TransactionClient,
    empresaId: string,
    linhas: CriarLancamentoInput['linhas']
  ): Promise<{ totalDebito: Prisma.Decimal; totalCredito: Prisma.Decimal }> {
    const contaIds = [...new Set(linhas.map((l) => l.contaId))];
    const contas = await tx.contaContabil.findMany({
      where: { id: { in: contaIds }, empresaId },
      select: { id: true },
    });
    const contasSet = new Set(contas.map((c) => c.id));

    const centroIds = [
      ...new Set(
        linhas.map((l) => l.centroCustoId).filter((v): v is string => Boolean(v))
      ),
    ];
    if (centroIds.length > 0) {
      const centros = await tx.centroCusto.findMany({
        where: { id: { in: centroIds }, empresaId },
        select: { id: true },
      });
      const centrosSet = new Set(centros.map((c) => c.id));
      for (const centroId of centroIds) {
        if (!centrosSet.has(centroId)) {
          throw new ValidationError('O centro de custo não pertence à empresa.');
        }
      }
    }

    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    for (const [indice, linha] of linhas.entries()) {
      if (!contasSet.has(linha.contaId)) {
        throw new ValidationError(`A conta da linha ${indice + 1} não pertence à empresa.`);
      }
      totalDebito = totalDebito.plus(linha.debito);
      totalCredito = totalCredito.plus(linha.credito);
    }

    return { totalDebito, totalCredito };
  }

  /** Verificação completa, só executada na validação. */
  private async validarContasParaValidacao(
    tx: Prisma.TransactionClient,
    lancamento: LancamentoDetalhe
  ): Promise<void> {
    const contaIds = [...new Set(lancamento.linhas.map((l) => l.contaId))];
    const contas = await tx.contaContabil.findMany({
      where: { id: { in: contaIds } },
      select: {
        id: true,
        empresaId: true,
        codigo: true,
        activa: true,
        aceitaMovimento: true,
        exigeCentroCusto: true,
        exigeEntidade: true,
      },
    });
    const porId = new Map(contas.map((c) => [c.id, c]));

    const centroIds = [
      ...new Set(
        lancamento.linhas.map((l) => l.centroCustoId).filter((v): v is string => Boolean(v))
      ),
    ];
    const centros =
      centroIds.length > 0
        ? await tx.centroCusto.findMany({
            where: { id: { in: centroIds }, empresaId: lancamento.empresaId },
            select: { id: true },
          })
        : [];
    const centrosSet = new Set(centros.map((c) => c.id));

    for (const [indice, linha] of lancamento.linhas.entries()) {
      const conta = porId.get(linha.contaId);
      if (!conta || conta.empresaId !== lancamento.empresaId) {
        throw new ValidationError(`A conta da linha ${indice + 1} não pertence à empresa.`);
      }
      if (!conta.activa) {
        throw new BusinessRuleError(`A conta ${conta.codigo} está inactiva.`);
      }
      if (!conta.aceitaMovimento) {
        throw new BusinessRuleError(
          `A conta ${conta.codigo} é de agregação e não aceita movimento.`
        );
      }
      if (conta.exigeCentroCusto && !linha.centroCustoId) {
        throw new BusinessRuleError(
          `A conta ${conta.codigo} exige centro de custo na linha ${indice + 1}.`
        );
      }
      if (conta.exigeEntidade && (!linha.entidadeTipo || !linha.entidadeId)) {
        throw new BusinessRuleError(
          `A conta ${conta.codigo} exige entidade na linha ${indice + 1}.`
        );
      }
      if (linha.centroCustoId && !centrosSet.has(linha.centroCustoId)) {
        throw new ValidationError(
          `O centro de custo da linha ${indice + 1} não pertence à empresa.`
        );
      }
    }
  }

  private async validarDentroTransacao(
    tx: Prisma.TransactionClient,
    id: string,
    utilizadorId: string
  ): Promise<ReturnType<typeof mapearDetalhe>> {
    const lancamento = await tx.lancamentoContabil.findUnique({
      where: { id },
      include: includeDetalhe,
    });
    if (!lancamento) throw new NotFoundError(`Lançamento contabilístico '${id}' não encontrado.`);

    if (lancamento.estado !== 'rascunho') {
      throw new BusinessRuleError('Só lançamentos em rascunho podem ser validados.');
    }
    this.exigirPeriodoAberto(lancamento.periodo);
    if (lancamento.exercicio.estado !== 'aberto') {
      throw new BusinessRuleError(
        `O exercício ${lancamento.exercicio.ano} está ${lancamento.exercicio.estado} e não aceita lançamentos.`
      );
    }
    if (lancamento.linhas.length < 2) {
      throw new BusinessRuleError('O lançamento deve ter pelo menos duas linhas.');
    }

    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    for (const linha of lancamento.linhas) {
      totalDebito = totalDebito.plus(linha.debito);
      totalCredito = totalCredito.plus(linha.credito);
    }

    if (!totalDebito.equals(totalCredito)) {
      throw new BusinessRuleError(
        `O lançamento não está equilibrado: débitos ${totalDebito.toFixed(4)} e créditos ${totalCredito.toFixed(4)}.`
      );
    }
    if (totalDebito.isZero()) {
      throw new BusinessRuleError('O lançamento não pode ter valor zero.');
    }

    await this.validarContasParaValidacao(tx, lancamento);

    const numero = await this.sequencia.proximoNumero(
      lancamento.diarioId,
      lancamento.exercicioId,
      tx
    );

    const validado = await tx.lancamentoContabil.update({
      where: { id },
      data: {
        numero,
        estado: 'validado',
        validadoPorId: utilizadorId,
        validadoEm: new Date(),
        totalDebito,
        totalCredito,
      },
      include: includeDetalhe,
    });

    await tx.auditLog.create({
      data: {
        empresaId: lancamento.empresaId,
        utilizadorId,
        acao: 'validar',
        severidade: 'info',
        entidade: 'LancamentoContabil',
        entidadeId: lancamento.id,
        modulo: 'contabilidade',
        descricao: `Lançamento ${numero} validado: ${lancamento.descricao}.`,
        dadosAnteriores: JSON.stringify({
          estado: lancamento.estado,
          numero: lancamento.numero,
        }),
        dadosNovos: JSON.stringify({ estado: 'validado', numero }),
      },
    });

    return mapearDetalhe(validado);
  }

  private async executarSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    const maxTentativas = 3;
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        });
      } catch (error) {
        const conflito =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (conflito && tentativa < maxTentativas) continue;
        throw error;
      }
    }
  }
}

export const lancamentoContabilService = new LancamentoContabilService();
