/**
 * @file contabilidade.controller.ts
 * @description Controlador IPC da Contabilidade Geral.
 *
 * Tudo exige o módulo `financas` do RBAC. Consultar exige `read`; criar e
 * editar exigem `write`; fechar, reabrir, bloquear e apurar exigem `approve`;
 * eliminar exige `delete`. O seed é tratado como escrita porque cria centenas
 * de linhas de uma vez.
 */

import { writeFile } from 'node:fs/promises';
import { dialog, BrowserWindow } from 'electron';
import { z, ZodError } from 'zod';
import {
  contaContabilService,
  ContaContabilService,
} from '../services/conta-contabil.service';
import {
  diarioContabilService,
  DiarioContabilService,
} from '../services/diario-contabil.service';
import {
  periodoContabilService,
  PeriodoContabilService,
} from '../services/periodo-contabil.service';
import {
  mapeamentoContaService,
  MapeamentoContaService,
} from '../services/mapeamento-conta.service';
import {
  contabilidadeSeedService,
  ContabilidadeSeedService,
} from '../services/contabilidade-seed.service';
import {
  lancamentoContabilService,
  LancamentoContabilService,
} from '../services/lancamento-contabil.service';
import {
  reconciliacaoContabilService,
  ReconciliacaoContabilService,
} from '../services/reconciliacao-contabil.service';
import {
  motorContabilizacaoService,
  MotorContabilizacaoService,
} from '../services/motor-contabilizacao.service';
import {
  integracaoContabilService,
  IntegracaoContabilService,
} from '../services/integracao-contabil.service';
import { exercicioService, ExercicioService } from '../services/exercicio.service';
import { authService, AuthService } from '../services/auth.service';
import {
  apuramentoIvaService,
  ApuramentoIvaService,
} from '../services/apuramento-iva.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';
import { relatoriosContabilidadeService, RelatoriosContabilidadeService } from '../services/relatorios-contabilidade.service';
import {
  fechoPeriodoService,
  FechoPeriodoService,
} from '../services/fecho-periodo.service';
import {
  apuramentoResultadosService,
  ApuramentoResultadosService,
} from '../services/apuramento-resultados.service';
import { fechoAnualService, FechoAnualService } from '../services/fecho-anual.service';
import {
  demonstracoesService,
  DemonstracoesService,
  DemonstracaoDto,
  EstruturaRelatorioInput,
  LinhaDemonstracaoDto,
} from '../services/demonstracoes.service';
import {
  balanceteFiltersSchema,
  razaoFiltersSchema,
  diariosFiltersSchema,
  contaCorrenteFiltersSchema,
} from '../validators/relatorios.validator';
import { RelatoriosController, type Tabela } from './relatorios.controller';
import { gerarPdfRelatorio, tituloRelatorio } from '../services/relatorio-pdf.service';
import { auditService, AuditService } from '../services/audit.service';

const exportarRelatorioSchema = z.object({
  relatorio: z.enum(['balancete', 'razao', 'diarios', 'contaCorrente', 'demonstracao']),
  formato: z.enum(['csv', 'xlsx', 'pdf']),
  filtros: z.record(z.unknown()),
});

const exportarDemonstracaoFiltersSchema = z.object({
  estruturaId: z.string().min(1),
  dataInicio: z.string().min(1),
  dataFim: z.string().min(1),
});

type RelatorioContabilExportavel = z.infer<typeof exportarRelatorioSchema>['relatorio'];

function dataParaExportacao(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const data = new Date(String(valor));
  return Number.isNaN(data.getTime()) ? String(valor) : data.toISOString().slice(0, 10);
}

function periodoParaExportacao(filtros: Record<string, unknown>): { de: string; ate: string } {
  return {
    de: filtros.dataInicio ? dataParaExportacao(filtros.dataInicio) : '',
    ate: filtros.dataFim ? dataParaExportacao(filtros.dataFim) : '',
  };
}

/**
 * Achata a árvore da demonstração na ordem em que o utilizador a vê, usando
 * espaços que não partem (NBSP) para marcar o nível: num CSV um espaço normal
 * no início da célula perde-se, e a hierarquia desaparecia no ficheiro.
 */
function achatarLinhasDemonstracao(
  linhas: readonly LinhaDemonstracaoDto[]
): Array<{ codigo: string; designacao: string; valor: string }> {
  const resultado: Array<{ codigo: string; designacao: string; valor: string }> = [];
  const visitar = (atual: readonly LinhaDemonstracaoDto[]) => {
    for (const linha of atual) {
      resultado.push({
        codigo: linha.codigo,
        designacao: `${'\u00a0'.repeat(Math.max(0, linha.nivel) * 2)}${linha.designacao}`,
        valor: linha.valorFinal ?? linha.valor,
      });
      visitar(linha.filhos ?? []);
    }
  };
  visitar(linhas);
  return resultado;
}

export class ContabilidadeController {
  private contas: ContaContabilService;
  private diarios: DiarioContabilService;
  private periodos: PeriodoContabilService;
  private mapeamentos: MapeamentoContaService;
  private seed: ContabilidadeSeedService;
  private exercicios: ExercicioService;
  private lancamentos: LancamentoContabilService;
  private reconciliacao: ReconciliacaoContabilService;
  private motor: MotorContabilizacaoService;
  private integracao: IntegracaoContabilService;
  private relatorios: RelatoriosContabilidadeService;
  private fecho: FechoPeriodoService;
  private apuramento: ApuramentoIvaService;
  private apuramentoResultados: ApuramentoResultadosService;
  private fechoAnual: FechoAnualService;
  private demonstracoes: DemonstracoesService;
  private auth: AuthService;
  private auditoria: AuditService;

  constructor(
    contas: ContaContabilService = contaContabilService,
    diarios: DiarioContabilService = diarioContabilService,
    periodos: PeriodoContabilService = periodoContabilService,
    mapeamentos: MapeamentoContaService = mapeamentoContaService,
    seed: ContabilidadeSeedService = contabilidadeSeedService,
    exercicios: ExercicioService = exercicioService,
    lancamentos: LancamentoContabilService = lancamentoContabilService,
    reconciliacao: ReconciliacaoContabilService = reconciliacaoContabilService,
    motor: MotorContabilizacaoService = motorContabilizacaoService,
    integracao: IntegracaoContabilService = integracaoContabilService,
    relatorios: RelatoriosContabilidadeService = relatoriosContabilidadeService,
    fecho: FechoPeriodoService = fechoPeriodoService,
    apuramento: ApuramentoIvaService = apuramentoIvaService,
    apuramentoResultados: ApuramentoResultadosService = apuramentoResultadosService,
    fechoAnual: FechoAnualService = fechoAnualService,
    demonstracoes: DemonstracoesService = demonstracoesService,
    auth: AuthService = authService,
    auditoria: AuditService = auditService
  ) {
    this.contas = contas;
    this.diarios = diarios;
    this.periodos = periodos;
    this.mapeamentos = mapeamentos;
    this.seed = seed;
    this.exercicios = exercicios;
    this.lancamentos = lancamentos;
    this.reconciliacao = reconciliacao;
    this.motor = motor;
    this.integracao = integracao;
    this.relatorios = relatorios;
    this.fecho = fecho;
    this.apuramento = apuramento;
    this.apuramentoResultados = apuramentoResultados;
    this.fechoAnual = fechoAnual;
    this.demonstracoes = demonstracoes;
    this.auth = auth;
    this.auditoria = auditoria;
  }

  // ─── Plano de contas ──────────────────────────────────────────────────────

  async listarContas(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar o plano de contas', () => this.contas.list(filters));
  }

  async arvoreContas(empresaId: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'carregar a árvore de contas', () => this.contas.arvore(empresaId));
  }

  async obterConta(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter a conta', () => this.contas.get(id));
  }

  async criarConta(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'criar a conta', () => this.contas.criar(payload));
  }

  async atualizarConta(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'actualizar a conta', () => this.contas.atualizar(id, payload));
  }

  async removerConta(id: string): Promise<IpcResponse<unknown>> {
    return this.com('delete', 'eliminar a conta', () => this.contas.remover(id));
  }

  // ─── Diários ──────────────────────────────────────────────────────────────

  async listarDiarios(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar os diários', () => this.diarios.list(filters));
  }

  async obterDiario(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter o diário', () => this.diarios.get(id));
  }

  async criarDiario(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'criar o diário', () => this.diarios.criar(payload));
  }

  async atualizarDiario(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'actualizar o diário', () => this.diarios.atualizar(id, payload));
  }

  async removerDiario(id: string): Promise<IpcResponse<unknown>> {
    return this.com('delete', 'eliminar o diário', () => this.diarios.remover(id));
  }

  // ─── Exercícios e períodos ────────────────────────────────────────────────

  async listarExercicios(empresaId?: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar os exercícios', () =>
      this.exercicios.listExercicios(empresaId)
    );
  }

  async obterExercicio(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter o exercício', () => this.exercicios.getExercicioById(id));
  }

  async listarPeriodos(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar os períodos', () => this.periodos.list(filters));
  }

  async obterPeriodo(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter o período', () => this.periodos.get(id));
  }

  async criarPeriodo(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'criar o período', () => this.periodos.criar(payload));
  }

  async criarPeriodosDoExercicio(exercicioId: string): Promise<IpcResponse<unknown>> {
    return this.com('write', 'gerar os períodos do exercício', () =>
      this.periodos.criarPeriodosDoExercicio(exercicioId)
    );
  }

  async alterarEstadoPeriodo(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = payload && typeof payload === 'object' ? payload : {};
    return this.com('approve', 'alterar o estado do período', () =>
      this.periodos.alterarEstado(id, { ...dados, utilizadorId: sessao?.id })
    );
  }

  async fecharPeriodo(id: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'fechar o período', () => this.periodos.fechar(id, sessao?.id));
  }

  async reabrirPeriodo(id: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'reabrir o período', () => this.periodos.reabrir(id, sessao?.id));
  }

  async bloquearPeriodo(id: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'bloquear o período', () => this.periodos.bloquear(id, sessao?.id));
  }

  // ─── Mapeamentos ──────────────────────────────────────────────────────────

  async listarMapeamentos(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar os mapeamentos', async () => {
      const empresaId = this.empresaDaSessao();
      const filtros = filters && typeof filters === 'object' ? filters : {};
      return this.mapeamentos.list({ ...filtros, empresaId });
    });
  }

  async obterMapeamento(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter o mapeamento', async () => {
      const empresaId = this.empresaDaSessao();
      const mapeamento = await this.mapeamentos.get(id);
      if (mapeamento.empresaId !== empresaId) {
        throw new ForbiddenError('O mapeamento não pertence à empresa da sessão.');
      }
      return mapeamento;
    });
  }

  async guardarMapeamento(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'guardar o mapeamento', async () => {
      const empresaId = this.empresaDaSessao();
      const dados = payload && typeof payload === 'object' ? payload : {};
      return this.mapeamentos.guardar({ ...dados, empresaId });
    });
  }

  async removerMapeamento(id: string): Promise<IpcResponse<unknown>> {
    return this.com('delete', 'eliminar o mapeamento', async () => {
      const empresaId = this.empresaDaSessao();
      const mapeamento = await this.mapeamentos.get(id);
      if (mapeamento.empresaId !== empresaId) {
        throw new ForbiddenError('O mapeamento não pertence à empresa da sessão.');
      }
      await this.mapeamentos.remover(id);
    });
  }

  // ─── Lançamentos ──────────────────────────────────────────────────────────

  async listarLancamentos(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar os lançamentos', () => this.lancamentos.listar(filters));
  }

  async obterLancamento(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter o lançamento', () => this.lancamentos.obter(id));
  }

  async criarLancamento(payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('write', 'criar o lançamento', () =>
      this.lancamentos.criar(payload, sessao?.id)
    );
  }

  async atualizarLancamento(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('write', 'actualizar o lançamento', () =>
      this.lancamentos.atualizar(id, payload, sessao?.id)
    );
  }

  async validarLancamento(id: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('write', 'validar o lançamento', () =>
      this.lancamentos.validar(id, sessao?.id)
    );
  }

  async estornarLancamento(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = payload && typeof payload === 'object' ? payload : {};
    return this.com('write', 'estornar o lançamento', () =>
      this.lancamentos.estornar(id, { ...dados, utilizadorId: sessao?.id })
    );
  }

  async removerLancamento(id: string): Promise<IpcResponse<unknown>> {
    return this.com('delete', 'eliminar o lançamento', () => this.lancamentos.remover(id));
  }

  // ─── Reconciliação ──────────────────────────────────────────────────────────

  async listarContasBancariasParaReconciliar(empresaId: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar contas para reconciliação', () =>
      this.reconciliacao.listarContasBancariasParaReconciliar(empresaId)
    );
  }

  async obterResumoReconciliacao(contaBancariaId: string, empresaId: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter resumo de reconciliação', () =>
      this.reconciliacao.obterResumo(contaBancariaId, empresaId)
    );
  }

  async sugerirParesReconciliacao(
    contaBancariaId: string,
    empresaId: string,
    payload: unknown
  ): Promise<IpcResponse<unknown>> {
    const dados = payload && typeof payload === 'object' ? payload : {};
    return this.com('read', 'sugerir pares de reconciliação', () =>
      this.reconciliacao.sugerirPares(contaBancariaId, empresaId, dados)
    );
  }

  async conciliar(
    _contaBancariaId: string,
    empresaId: string,
    payload: unknown
  ): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (payload && typeof payload === 'object' ? payload : {}) as { pares: Array<{ linhaId: string; movimentoId: string }> };
    return this.com('write', 'conciliar', () =>
      this.reconciliacao.conciliar(dados.pares, sessao?.id ?? '', empresaId)
    );
  }

  async desconciliar(
    _contaBancariaId: string,
    empresaId: string,
    payload: unknown
  ): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (payload && typeof payload === 'object' ? payload : {}) as { linhaIds: string[] };
    return this.com('write', 'desconciliar', () =>
      this.reconciliacao.desconciliar(dados.linhaIds, sessao?.id ?? '', empresaId)
    );
  }

  async gerarLancamentoDeMovimento(
    _contaBancariaId: string,
    empresaId: string,
    payload: unknown
  ): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (payload && typeof payload === 'object' ? payload : {}) as { movimentoId: string; contaContabilId: string };
    return this.com('write', 'gerar lançamento de movimento', () =>
      this.reconciliacao.gerarLancamentoDeMovimento(
        dados.movimentoId,
        dados.contaContabilId,
        sessao?.id ?? '',
        empresaId
      )
    );
  }

  // ─── Regras de contabilização ─────────────────────────────────────────────

  async listarRegras(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar as regras', async () => {
      const empresaId = this.empresaDaSessao();
      const filtros =
        filters && typeof filters === 'object' ? (filters as Record<string, unknown>) : {};
      return this.motor['prisma'].regraContabilizacao.findMany({
        where: { ...filtros, empresaId },
        orderBy: { codigo: 'asc' },
      });
    });
  }

  async obterRegra(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter a regra', async () => {
      const empresaId = this.empresaDaSessao();
      const regra = await this.motor['prisma'].regraContabilizacao.findUnique({
        where: { id },
        include: { linhas: { orderBy: { numeroLinha: 'asc' } } },
      });
      if (!regra) throw new NotFoundError('Regra de contabilização não encontrada.');
      if (regra.empresaId !== empresaId) {
        throw new ForbiddenError('A regra não pertence à empresa da sessão.');
      }
      return regra;
    });
  }

  async criarRegra(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'criar a regra', async () => {
      const empresaId = this.empresaDaSessao();
      const data =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      return this.motor['prisma'].regraContabilizacao.create({
        data: { ...data, empresaId } as any,
      });
    });
  }

  async atualizarRegra(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'actualizar a regra', async () => {
      const empresaId = this.empresaDaSessao();
      const existente = await this.motor['prisma'].regraContabilizacao.findUnique({
        where: { id },
        select: { id: true, empresaId: true },
      });
      if (!existente) throw new NotFoundError('Regra de contabilização não encontrada.');
      if (existente.empresaId !== empresaId) {
        throw new ForbiddenError('A regra não pertence à empresa da sessão.');
      }
      const { empresaId: _ignorada, ...alteracoes } =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      return this.motor['prisma'].regraContabilizacao.update({
        where: { id },
        data: { ...alteracoes, empresaId },
      });
    });
  }

  async removerRegra(id: string): Promise<IpcResponse<unknown>> {
    return this.com('delete', 'eliminar a regra', async () => {
      const empresaId = this.empresaDaSessao();
      const existente = await this.motor['prisma'].regraContabilizacao.findUnique({
        where: { id },
        select: { id: true, empresaId: true },
      });
      if (!existente) throw new NotFoundError('Regra de contabilização não encontrada.');
      if (existente.empresaId !== empresaId) {
        throw new ForbiddenError('A regra não pertence à empresa da sessão.');
      }
      await this.motor['prisma'].regraContabilizacao.delete({ where: { id } });
    });
  }

  // ─── Erros de integração ──────────────────────────────────────────────────

  async listarErrosIntegracao(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar erros de integração', async () => {
      const empresaId = this.empresaDaSessao();
      const filtros =
        filters && typeof filters === 'object' ? (filters as Record<string, unknown>) : {};
      return this.motor['prisma'].erroIntegracaoContabil.findMany({
        where: { ...filtros, empresaId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async reprocessarErro(erroId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('write', 'reprocessar o erro', async () => {
      const empresaId = this.empresaDaSessao();
      return this.integracao.reprocessarErro(erroId, sessao?.id, empresaId);
    });
  }

  // ─── Relatórios ───────────────────────────────────────────────────────────

  async balancete(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar balancete', async () => {
      const f = balanceteFiltersSchema.parse({
        ...(filters ?? {}),
        empresaId: this.empresaDaSessao(),
      });
      return this.relatorios.balancete(f);
    });
  }

  async razao(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar razão', async () => {
      const f = razaoFiltersSchema.parse({
        ...(filters ?? {}),
        empresaId: this.empresaDaSessao(),
      });
      return this.relatorios.razao(f);
    });
  }

  async relatorioDiarios(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar diários', async () => {
      const f = diariosFiltersSchema.parse({
        ...(filters ?? {}),
        empresaId: this.empresaDaSessao(),
      });
      return this.relatorios.diarios(f);
    });
  }

  async contaCorrente(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar conta corrente', async () => {
      const f = contaCorrenteFiltersSchema.parse({
        ...(filters ?? {}),
        empresaId: this.empresaDaSessao(),
      });
      return this.relatorios.contaCorrente(f);
    });
  }

  // ─── Fecho de período ─────────────────────────────────────────────────────

  async previsaoFecho(periodoId: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter previsão de fecho', () => this.fecho.previsao(periodoId));
  }

  async executarFecho(periodoId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'executar fecho do período', () => this.fecho.executar(periodoId, sessao?.id ?? ''));
  }

  async reabrirPeriodoFecho(periodoId: string, payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (payload && typeof payload === 'object' ? payload : {}) as { motivo?: string };
    return this.com('approve', 'reabrir período', () => this.fecho.reabrir(periodoId, sessao?.id ?? '', dados.motivo ?? ''));
  }

  async listarExecucoesFecho(filters?: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar execuções de fecho', () => this.fecho.listarExecucoes(filters as { empresaId?: string; periodoId?: string; tipo?: string; estado?: string }));
  }

  // ─── Apuramento IVA ───────────────────────────────────────────────────────

  async previsaoApuramentoIva(periodoId: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter previsão de apuramento IVA', () => this.apuramento.previsao(periodoId));
  }

  async listarApuramentosIva(filters?: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (filters && typeof filters === 'object' ? filters : {}) as { exercicioId?: string };
    return this.com('read', 'listar apuramentos IVA', () =>
      this.apuramento.listar(sessao?.empresaConfigId ?? '', dados.exercicioId)
    );
  }

  async executarApuramentoIva(periodoId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'executar apuramento IVA', () => this.apuramento.executar(periodoId, sessao?.id ?? ''));
  }

  async registarPagamentoIva(payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (payload && typeof payload === 'object' ? payload : {}) as { apuramentoId: string; dataPagamento: string | Date; contaBancariaId: string };
    return this.com('write', 'registar pagamento IVA', () =>
      this.apuramento.registarPagamento(dados.apuramentoId, new Date(dados.dataPagamento), dados.contaBancariaId, sessao?.id ?? '')
    );
  }

  // ─── Apuramento de resultados e fecho anual ───────────────────────────────

  async previsaoApuramentoResultados(exercicioId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('read', 'obter previsão de apuramento de resultados', () =>
      this.apuramentoResultados.previsao(exercicioId, sessao?.empresaConfigId ?? undefined)
    );
  }

  async executarApuramentoResultados(exercicioId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'executar apuramento de resultados', () =>
      this.apuramentoResultados.executar(
        exercicioId,
        sessao?.id ?? '',
        sessao?.empresaConfigId ?? undefined
      )
    );
  }

  async previsaoFechoAnual(exercicioId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('read', 'obter previsão de fecho anual', () =>
      this.fechoAnual.previsao(exercicioId, sessao?.empresaConfigId ?? undefined)
    );
  }

  async executarFechoAnual(exercicioId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'encerrar exercício', () =>
      this.fechoAnual.encerrar(
        exercicioId,
        sessao?.id ?? '',
        sessao?.empresaConfigId ?? undefined
      )
    );
  }

  async abrirExercicioSeguinte(exercicioId: string): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    return this.com('approve', 'abrir exercício seguinte', () =>
      this.fechoAnual.abrirExercicioSeguinte(
        exercicioId,
        sessao?.id ?? '',
        sessao?.empresaConfigId ?? undefined
      )
    );
  }

  async reabrirFechoAnual(exercicioId: string, payload: unknown): Promise<IpcResponse<unknown>> {
    const sessao = this.auth.getCurrentSession();
    const dados = (payload && typeof payload === 'object' ? payload : {}) as { motivo?: string };
    return this.com('approve', 'reabrir exercício', () =>
      this.fechoAnual.reabrir(
        exercicioId,
        sessao?.id ?? '',
        dados.motivo ?? '',
        sessao?.empresaConfigId ?? undefined
      )
    );
  }

  // ─── Demonstrações ─────────────────────────────────────────────────────────

  async listarEstruturas(_empresaId?: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar estruturas de relatório', async () =>
      this.demonstracoes.listarEstruturas(this.empresaDaSessao())
    );
  }

  async obterEstrutura(id: string): Promise<IpcResponse<unknown>> {
    return this.com('read', 'obter estrutura de relatório', async () => {
      const empresaId = this.empresaDaSessao();
      const estrutura = await this.demonstracoes.obterEstrutura(id);
      this.exigirEstruturaDaEmpresa(estrutura, empresaId);
      return estrutura;
    });
  }

  async guardarEstrutura(_empresaId: string, payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'guardar estrutura de relatório', async () =>
      this.demonstracoes.guardarEstrutura(
        this.empresaDaSessao(),
        payload as EstruturaRelatorioInput
      )
    );
  }

  async removerEstrutura(id: string): Promise<IpcResponse<unknown>> {
    return this.com('write', 'remover estrutura de relatório', async () =>
      this.demonstracoes.removerEstrutura(this.empresaDaSessao(), id)
    );
  }

  async gerarDemonstracao(
    estruturaId: string,
    dataInicio: string | Date,
    dataFim: string | Date
  ): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar demonstração', async () => {
      const empresaId = this.empresaDaSessao();
      // `gerar` não recebe empresaId: a estrutura é a única fonte dessa
      // informação, pelo que a propriedade tem de ser verificada antes.
      const estrutura = await this.demonstracoes.obterEstrutura(estruturaId);
      this.exigirEstruturaDaEmpresa(estrutura, empresaId);
      return this.demonstracoes.gerar(estruturaId, new Date(dataInicio), new Date(dataFim));
    });
  }

  // ─── Exportação de relatórios contabilísticos ─────────────────────────────

  async exportarRelatorio(payload: unknown, janela: BrowserWindow | null): Promise<IpcResponse<unknown>> {
    return this.com('write', 'exportar relatório contabilístico', async () => {
      const params = exportarRelatorioSchema.parse(payload);
      const sessao = this.auth.getCurrentSession();
      const empresaId = sessao?.empresaConfigId ?? '';
      if (!empresaId) throw new AppError('Sessão sem empresa seleccionada.', 'VALIDATION_ERROR', 400);

      const filtros = params.filtros;
      let dados: unknown;
      switch (params.relatorio) {
        case 'balancete':
          dados = await this.relatorios.balancete(balanceteFiltersSchema.parse({ ...filtros, empresaId }));
          break;
        case 'razao':
          dados = await this.relatorios.razao(razaoFiltersSchema.parse({ ...filtros, empresaId }));
          break;
        case 'diarios':
          dados = await this.relatorios.diarios(diariosFiltersSchema.parse({ ...filtros, empresaId }));
          break;
        case 'contaCorrente':
          dados = await this.relatorios.contaCorrente(contaCorrenteFiltersSchema.parse({ ...filtros, empresaId }));
          break;
        case 'demonstracao': {
          // `gerar` não recebe empresaId: a estrutura é a única forma de saber
          // a que empresa pertence a demonstração. Sem esta comparação, um
          // estruturaId de outra empresa deixaria exportar os seus valores.
          const f = exportarDemonstracaoFiltersSchema.parse(filtros);
          const estrutura = await this.demonstracoes.obterEstrutura(f.estruturaId);
          if (estrutura.empresaId !== empresaId) {
            throw new AppError(
              'A estrutura de relatório não pertence à empresa da sessão.',
              'FORBIDDEN',
              403
            );
          }
          dados = await this.demonstracoes.gerar(f.estruturaId, f.dataInicio, f.dataFim);
          break;
        }
      }

      const tabela = this.montarTabelaRelatorio(params.relatorio, dados);
      if (!janela) throw new AppError('Janela principal não encontrada.', 'WINDOW_NOT_FOUND', 500);

      const extensao = params.formato === 'csv' ? 'csv' : params.formato === 'pdf' ? 'pdf' : 'xlsx';
      const nomeSugerido = `contabilidade_${params.relatorio}_${new Date().toISOString().slice(0, 10)}.${extensao}`;
      const escolha = await dialog.showSaveDialog(janela, {
        title: 'Guardar relatório contabilístico',
        defaultPath: nomeSugerido,
        filters: [{ name: params.formato === 'csv' ? 'CSV (*.csv)' : params.formato === 'pdf' ? 'PDF (*.pdf)' : 'Excel (*.xlsx)', extensions: [extensao] }],
      });
      if (escolha.canceled || !escolha.filePath) return { cancelado: true };

      const conteudo =
        params.formato === 'csv'
          ? RelatoriosController.paraCsv(tabela)
          : params.formato === 'pdf'
            ? await gerarPdfRelatorio(
                {
                  sessao: sessao!,
                  titulo: tituloRelatorio(params.relatorio),
                  ...periodoParaExportacao(filtros),
                },
                tabela
              )
            : await RelatoriosController.paraExcel([tabela]);

      await writeFile(escolha.filePath, conteudo);
      await this.auditoria.registar({
        empresaId,
        utilizadorId: sessao?.id,
        modulo: 'financas',
        acao: 'exportar',
        entidade: 'Relatorio',
        descricao: `Exportou ${params.formato.toUpperCase()} do relatório contabilístico "${params.relatorio}"`,
        dadosNovos: {
          relatorio: params.relatorio,
          formato: params.formato,
          ficheiro: escolha.filePath,
          linhas: tabela.linhas.length,
        },
      });

      return { caminho: escolha.filePath, linhas: tabela.linhas.length, formato: params.formato };
    });
  }

  private montarTabelaRelatorio(relatorio: RelatorioContabilExportavel, dados: unknown): Tabela {
    switch (relatorio) {
      case 'balancete': {
        const resultado = dados as {
          items: Array<{ codigo: string; designacao: string; classe: number; debito: string; credito: string; saldo: string }>;
          totais: { debito: string; credito: string; saldo: string };
        };
        return {
          nome: 'balancete',
          colunas: [
            { chave: 'codigo', titulo: 'Conta' },
            { chave: 'designacao', titulo: 'Designação' },
            { chave: 'classe', titulo: 'Classe' },
            { chave: 'debito', titulo: 'Débito', numerica: true },
            { chave: 'credito', titulo: 'Crédito', numerica: true },
            { chave: 'saldo', titulo: 'Saldo', numerica: true },
          ],
          linhas: [
            ...resultado.items,
            { codigo: 'Total', designacao: '', classe: 0, ...resultado.totais },
          ],
        };
      }
      case 'razao': {
        const resultado = dados as {
          items: Array<{
            dataContabilistica: string | Date;
            numeroLancamento: number | null;
            descricaoLancamento: string;
            debito: string;
            credito: string;
            saldoCorrente: string;
          }>;
        };
        return {
          nome: 'razao',
          colunas: [
            { chave: 'data', titulo: 'Data' },
            { chave: 'numero', titulo: 'Nº' },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'debito', titulo: 'Débito', numerica: true },
            { chave: 'credito', titulo: 'Crédito', numerica: true },
            { chave: 'saldo', titulo: 'Saldo', numerica: true },
          ],
          linhas: resultado.items.map((i) => ({
            data: dataParaExportacao(i.dataContabilistica),
            numero: i.numeroLancamento ?? '',
            descricao: i.descricaoLancamento,
            debito: i.debito,
            credito: i.credito,
            saldo: i.saldoCorrente,
          })),
        };
      }
      case 'diarios': {
        const resultado = dados as {
          items: Array<{
            diarioCodigo: string;
            numero: number | null;
            dataContabilistica: string | Date;
            descricao: string;
            totalDebito: string;
            totalCredito: string;
          }>;
        };
        return {
          nome: 'diarios',
          colunas: [
            { chave: 'diario', titulo: 'Diário' },
            { chave: 'numero', titulo: 'Nº' },
            { chave: 'data', titulo: 'Data' },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'debito', titulo: 'Débito', numerica: true },
            { chave: 'credito', titulo: 'Crédito', numerica: true },
          ],
          linhas: resultado.items.map((i) => ({
            diario: i.diarioCodigo,
            numero: i.numero ?? '',
            data: dataParaExportacao(i.dataContabilistica),
            descricao: i.descricao,
            debito: i.totalDebito,
            credito: i.totalCredito,
          })),
        };
      }
      case 'contaCorrente': {
        const resultado = dados as {
          items: Array<{
            dataContabilistica: string | Date;
            numeroLancamento: number | null;
            descricaoLancamento: string;
            dataVencimento?: string | Date | null;
            debito: string;
            credito: string;
            saldoCorrente: string;
          }>;
        };
        return {
          nome: 'contaCorrente',
          colunas: [
            { chave: 'data', titulo: 'Data' },
            { chave: 'numero', titulo: 'Nº' },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'vencimento', titulo: 'Vencimento' },
            { chave: 'debito', titulo: 'Débito', numerica: true },
            { chave: 'credito', titulo: 'Crédito', numerica: true },
            { chave: 'saldo', titulo: 'Saldo', numerica: true },
          ],
          linhas: resultado.items.map((i) => ({
            data: dataParaExportacao(i.dataContabilistica),
            numero: i.numeroLancamento ?? '',
            descricao: i.descricaoLancamento,
            vencimento: dataParaExportacao(i.dataVencimento),
            debito: i.debito,
            credito: i.credito,
            saldo: i.saldoCorrente,
          })),
        };
      }
      case 'demonstracao': {
        const resultado = dados as DemonstracaoDto;
        return {
          nome: 'demonstracao',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'designacao', titulo: 'Designação' },
            { chave: 'valor', titulo: 'Valor', numerica: true },
          ],
          linhas: achatarLinhasDemonstracao(resultado.linhas ?? []),
        };
      }
    }
  }

  // ─── Seed ─────────────────────────────────────────────────────────────────

  async semear(_empresaIdDoChamador?: string): Promise<IpcResponse<unknown>> {
    return this.com('write', 'semear a contabilidade', () => this.seed.semearTudo(this.empresaDaSessao()));
  }

  /** Empresa da sessão: nunca aceitar empresaId enviado pelo chamador. */
  private empresaDaSessao(): string {
    const empresaId = this.auth.getCurrentSession()?.empresaConfigId;
    if (!empresaId) {
      throw new AppError('Sessão sem empresa seleccionada.', 'VALIDATION_ERROR', 400);
    }
    return empresaId;
  }

  private exigirEstruturaDaEmpresa(estrutura: { empresaId: string }, empresaId: string): void {
    if (estrutura.empresaId !== empresaId) {
      throw new ForbiddenError('A estrutura de relatório não pertence à empresa da sessão.');
    }
  }

  private async com(
    acao: 'read' | 'write' | 'approve' | 'delete',
    descricao: string,
    fn: () => Promise<unknown>
  ): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'financas', acao);
      return ok(await fn());
    } catch (error) {
      if (error instanceof ZodError) {
        return err(
          'VALIDATION_ERROR',
          error.issues[0]?.message || `Erro ao ${descricao}.`,
          error.issues
        );
      }
      if (error instanceof AppError) return err(error.code, error.message, error.details);
      return err('INTERNAL_ERROR', (error as Error)?.message || `Erro ao ${descricao}.`);
    }
  }
}

export const contabilidadeController = new ContabilidadeController();
