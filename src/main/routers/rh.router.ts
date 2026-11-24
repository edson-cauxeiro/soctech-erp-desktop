/**
 * @file rh.router.ts
 * @description Registo dos canais IPC do módulo de Recursos Humanos.
 *
 * Todos os canais passam pelo contrato base `rhHandler` (ADR-008): sessão →
 * permissão → validação Zod → resposta normalizada. Fase 0 expunha apenas
 * `rh:sistema:ping`; a Fase 1 acrescenta os canais de cadastros e configuração
 * (`rh:config:*`), isolados por empresa através do contexto da sessão.
 */

import { dialog, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { rhHandler } from '../utils/rh-handler';
import { AppError } from '../utils/errors';
import {
  rhIdSchema,
  rhIdInputSchema,
  rhFiltroCadastroSchema,
  criarRhDepartamentoSchema,
  criarRhCargoSchema,
  criarRhRubricaSchema,
  criarRhTipoAusenciaSchema,
  criarRhCentroCustoSchema,
  criarRhParametroSchema,
  rhListarParametrosSchema,
  criarRhTabelaIrtSchema,
  gerarRhPeriodosSchema,
  rhListarPeriodosSchema,
  atualizarRhConfiguracaoSchema,
  filtroFuncionarioSchema,
  criarRhFuncionarioSchema,
  atualizarRhFuncionarioSchema,
  rhContratoBaseSchema,
  atualizarRhContratoSchema,
  cessarRhContratoSchema,
  criarRhAlteracaoSalarialSchema,
  rhSalarioNaDataSchema,
  criarRhDependenteSchema,
  atualizarRhDependenteSchema,
  criarRhFuncionarioRubricaSchema,
  atualizarRhFuncionarioRubricaSchema,
  criarRhFuncionarioDocumentoSchema,
  atualizarRhFuncionarioDocumentoSchema,
  rhImportacaoPrevisualizarSchema,
  rhImportacaoImportarSchema,
  criarRhAlteracaoMensalSchema,
  atualizarRhAlteracaoMensalSchema,
  copiarAlteracoesMesAnteriorSchema,
  rhEstadoAlteracaoSchema,
  rhProcessamentoLoaderInputSchema,
  rhSimularSalariosInputSchema,
  rhPrepararSalariosInputSchema,
  rhProcessarIndividualInputSchema,
  rhProcessarLoteInputSchema,
  rhAnularProcessamentosInputSchema,
  rhProcessamentoListarInputSchema,
  rhProcessamentoHistoricoInputSchema,
  rhProcessamentoDetalheInputSchema,
  rhRecibosListarInputSchema,
  rhRecibosGerarPdfInputSchema,
  rhReciboIdInputSchema,
  rhOrdensPagamentoListarInputSchema,
  rhOrdemPagamentoCriarInputSchema,
  rhOrdemPagamentoIdInputSchema,
  rhOrdemPagamentoGerarFicheiroInputSchema,
  rhPagamentosListarInputSchema,
  rhPagamentoConfirmarInputSchema,
  rhPagamentoEstornarInputSchema,
  criarRhAusenciaSchema,
  atualizarRhAusenciaSchema,
  rhAusenciasListarInputSchema,
  rhAusenciaAprovarSchema,
  criarRhHoraExtraSchema,
  atualizarRhHoraExtraSchema,
  rhHorasExtraListarInputSchema,
  rhHoraExtraAprovarSchema,
  rhFeriasSaldosListarInputSchema,
  rhFeriasSaldoAtualizarSchema,
  criarRhMarcacaoFeriasSchema,
  atualizarRhMarcacaoFeriasSchema,
  rhMarcacoesFeriasListarInputSchema,
  rhMarcacaoFeriasAprovarSchema,
  criarRhAfetacaoSchema,
  atualizarRhAfetacaoSchema,
  rhAfetacoesListarInputSchema,
  criarRhProcessoDividaSchema,
  atualizarRhProcessoDividaSchema,
  rhProcessosDividaListarInputSchema,
  rhProcessoDividaGerarPlanoSchema,
  rhProcessoDividaSuspenderSchema,
  rhProcessoDividaLiquidarSchema,
  rhPrestacoesDividaListarInputSchema,
  rhPrestacaoDividaAtualizarSchema,
  rhPrestacaoDividaDescontarSchema,
  rhPrestacaoDividaAnularSchema,
  rhPrestacaoDividaPerdoarSchema,
  criarRhRetroativoSchema,
  atualizarRhRetroativoSchema,
  rhRetroativosListarInputSchema,
  rhRetroativoAplicarSchema,
  rhRetroativoAnularSchema,
  criarRhIndependenteSchema,
  atualizarRhIndependenteSchema,
  rhIndependentesListarInputSchema,
  criarRhAtividadeSchema,
  atualizarRhAtividadeSchema,
  rhAtividadesListarInputSchema,
  rhAuditoriaListarInputSchema,
  rhAuditoriaPorFuncionarioInputSchema,
  rhAuditoriaPorProcessamentoInputSchema,
} from '../validators/rh.validator';
import { rhConfiguracaoService } from '../services/rh-configuracao.service';
import { rhRecibosService } from '../services/rh-recibos.service';
import { rhPagamentosService } from '../services/rh-pagamentos.service';
import { rhFuncionarioService } from '../services/rh-funcionario.service';
import { rhContratosService } from '../services/rh-contratos.service';
import { rhImportacaoService } from '../services/rh-importacao.service';
import { rhAlteracoesMensaisService } from '../services/rh-alteracoes-mensais.service';
import { rhProcessamentoLoaderService } from '../services/rh-processamento-loader.service';
import { rhProcessamentoService } from '../services/rh-processamento.service';
import { rhProcessamentoExecucaoService } from '../services/rh-processamento-execucao.service';
import { rhProcessamentoLoteService } from '../services/rh-processamento-lote.service';
import { rhProcessamentoAnularService } from '../services/rh-processamento-anular.service';
import { rhProcessamentoListarService } from '../services/rh-processamento-listar.service';
import { rhProcessamentoHistoricoService } from '../services/rh-processamento-historico.service';
import { rhAusenciasService } from '../services/rh-ausencias.service';
import { rhHorasExtraService } from '../services/rh-horas-extra.service';
import { rhFeriasService } from '../services/rh-ferias.service';
import { rhAfetacoesService } from '../services/rh-afetacoes.service';
import { rhDividasService } from '../services/rh-dividas.service';
import { rhRetroativosService } from '../services/rh-retroativos.service';
import { rhIndependentesService } from '../services/rh-independentes.service';
import { rhAtividadesService } from '../services/rh-atividades.service';
import { rhAuditoriaService } from '../services/rh-auditoria.service';

const pingSchema = z.object({}).passthrough();
/**
 * Payload da pré-visualização/importação, já sem o `tipo`: cada canal
 * (funcionários/contratos) fixa o tipo e a permissão, em vez de aceitar um
 * `tipo` do renderer e decidir em cima dele a qual das bases de permissão
 * atender. Ver `docs/rh-docs/03-tasks.md` (RH-208).
 */
const rhConteudoFicheiroSchema = rhImportacaoPrevisualizarSchema.omit({ tipo: true });
const rhImportarFicheiroSchema = rhImportacaoImportarSchema.omit({ tipo: true });
const verConfig = { chave: 'rh.config.ver' } as const;
const editarConfig = { chave: 'rh.config.editar' } as const;
const verFuncionarios = { chave: 'rh.funcionarios.ver' } as const;
const criarFuncionario = { chave: 'rh.funcionarios.criar' } as const;
const editarFuncionario = { chave: 'rh.funcionarios.editar' } as const;
const inativarFuncionario = { chave: 'rh.funcionarios.inativar' } as const;
const verContratos = { chave: 'rh.contratos.ver' } as const;
const gerirContratos = { chave: 'rh.contratos.gerir' } as const;
const verAlteracoes = { chave: 'rh.alteracoes.ver' } as const;
const gerirAlteracoes = { chave: 'rh.alteracoes.gerir' } as const;
const processarSalarios = { chave: 'rh.processamento.processar' } as const;
const simularSalarios = { chave: 'rh.processamento.simular' } as const;
const prepararSalarios = { chave: 'rh.processamento.preparar' } as const;
const anularProcessamentos = { chave: 'rh.processamento.anular' } as const;
const verProcessamento = { chave: 'rh.processamento.ver' } as const;
const verAusencias = { chave: 'rh.ausencias.ver' } as const;
const gerirAusencias = { chave: 'rh.ausencias.gerir' } as const;
const verHorasExtra = { chave: 'rh.horas-extra.ver' } as const;
const gerirHorasExtra = { chave: 'rh.horas-extra.gerir' } as const;
const verFerias = { chave: 'rh.ferias.ver' } as const;
const gerirFerias = { chave: 'rh.ferias.gerir' } as const;
const verAfetacoes = { chave: 'rh.afetacoes.ver' } as const;
const gerirAfetacoes = { chave: 'rh.afetacoes.gerir' } as const;
const verDividas = { chave: 'rh.dividas.ver' } as const;
const gerirDividas = { chave: 'rh.dividas.gerir' } as const;
const verRetroativos = { chave: 'rh.retroativos.ver' } as const;
const gerirRetroativos = { chave: 'rh.retroativos.gerir' } as const;
const verIndependentes = { chave: 'rh.independentes.ver' } as const;
const gerirIndependentes = { chave: 'rh.independentes.gerir' } as const;
const verAtividades = { chave: 'rh.atividades.ver' } as const;
const gerirAtividades = { chave: 'rh.atividades.gerir' } as const;
const verAuditoria = { chave: 'rh.auditoria.ver' } as const;

export interface RhPingResult {
  modulo: 'rh';
  ok: true;
  utilizadorId: string;
  empresaId: string | null;
  podeVerSalarios: boolean;
  timestamp: string;
}

import { handleLicenciado } from '../utils/licensed-handler';

export function registerRhRouter(): void {
  const handle = handleLicenciado('rh');
  // ── Diagnóstico ───────────────────────────────────────────────────────────
  handle(
    'rh:sistema:ping',
    rhHandler(pingSchema, { modulo: 'rh', acao: 'read' }, async (_input, ctx) => ({
      modulo: 'rh',
      ok: true,
      utilizadorId: ctx.utilizadorId,
      empresaId: ctx.empresaId,
      podeVerSalarios: ctx.podeVerSalarios,
      timestamp: new Date().toISOString(),
    }) satisfies RhPingResult)
  );

  // ── Funcionários (RH-201) ─────────────────────────────────────────────────
  handle(
    'rh:funcionarios:listar',
    rhHandler(filtroFuncionarioSchema, verFuncionarios, (input, ctx) =>
      rhFuncionarioService.listar(input, ctx.empresaId)
    )
  );
  handle(
    'rh:funcionarios:get',
    rhHandler(rhIdInputSchema, verFuncionarios, ({ id }, ctx) =>
      rhFuncionarioService.obterDetalhe(id, ctx.empresaId, ctx.podeVerSalarios)
    )
  );
  handle(
    'rh:funcionarios:criar',
    rhHandler(criarRhFuncionarioSchema, criarFuncionario, (input, ctx) =>
      rhFuncionarioService.criar(input, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:atualizar',
    rhHandler(
      rhIdInputSchema.extend(atualizarRhFuncionarioSchema.shape),
      editarFuncionario,
      ({ id, ...dados }, ctx) =>
        rhFuncionarioService.atualizar(id, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:inativar',
    rhHandler(rhIdInputSchema, inativarFuncionario, ({ id }, ctx) =>
      rhFuncionarioService.inativar(id, ctx.empresaId, ctx.utilizadorId)
    )
  );

  // ── Dependentes (RH-203) ──────────────────────────────────────────────────
  handle(
    'rh:funcionarios:dependentes:criar',
    rhHandler(
      z.object({ funcionarioId: rhIdSchema, ...criarRhDependenteSchema.shape }),
      editarFuncionario,
      ({ funcionarioId, ...dados }, ctx) =>
        rhFuncionarioService.criarDependente(funcionarioId, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:dependentes:atualizar',
    rhHandler(rhIdInputSchema.extend(atualizarRhDependenteSchema.shape), editarFuncionario, ({ id, ...dados }, ctx) =>
      rhFuncionarioService.atualizarDependente(id, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:dependentes:remover',
    rhHandler(rhIdInputSchema, editarFuncionario, ({ id }, ctx) =>
      rhFuncionarioService.removerDependente(id, ctx.empresaId, ctx.utilizadorId)
    )
  );

  // ── Rubricas fixas do funcionário (RH-203/RH-206) ─────────────────────────
  handle(
    'rh:funcionarios:rubricas-fixas:criar',
    rhHandler(
      z.object({ funcionarioId: rhIdSchema, ...criarRhFuncionarioRubricaSchema.shape }),
      editarFuncionario,
      ({ funcionarioId, ...dados }, ctx) =>
        rhFuncionarioService.criarRubricaFixa(funcionarioId, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:rubricas-fixas:atualizar',
    rhHandler(
      rhIdInputSchema.extend(atualizarRhFuncionarioRubricaSchema.shape),
      editarFuncionario,
      ({ id, ...dados }, ctx) =>
        rhFuncionarioService.atualizarRubricaFixa(id, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:rubricas-fixas:inativar',
    rhHandler(rhIdInputSchema, editarFuncionario, ({ id }, ctx) =>
      rhFuncionarioService.inativarRubricaFixa(id, ctx.empresaId, ctx.utilizadorId)
    )
  );

  // ── Documentos do funcionário (RH-203) ────────────────────────────────────
  handle(
    'rh:funcionarios:documentos:criar',
    rhHandler(
      z.object({ funcionarioId: rhIdSchema, ...criarRhFuncionarioDocumentoSchema.shape }),
      editarFuncionario,
      ({ funcionarioId, ...dados }, ctx) =>
        rhFuncionarioService.criarDocumento(funcionarioId, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:documentos:atualizar',
    rhHandler(
      rhIdInputSchema.extend(atualizarRhFuncionarioDocumentoSchema.shape),
      editarFuncionario,
      ({ id, ...dados }, ctx) =>
        rhFuncionarioService.atualizarDocumento(id, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:funcionarios:documentos:remover',
    rhHandler(rhIdInputSchema, editarFuncionario, ({ id }, ctx) =>
      rhFuncionarioService.removerDocumento(id, ctx.empresaId, ctx.utilizadorId)
    )
  );

  // ── Contratos e alterações salariais (RH-204) ─────────────────────────────
  handle(
    'rh:contratos:listar',
    rhHandler(z.object({ funcionarioId: rhIdSchema }), verContratos, ({ funcionarioId }, ctx) =>
      rhContratosService.listarPorFuncionario(funcionarioId, ctx.empresaId, ctx.podeVerSalarios)
    )
  );
  handle(
    'rh:contratos:get',
    rhHandler(rhIdInputSchema, verContratos, ({ id }, ctx) =>
      rhContratosService.obterContrato(id, ctx.empresaId, ctx.podeVerSalarios)
    )
  );
  handle(
    'rh:contratos:criar',
    rhHandler(
      z.object({ funcionarioId: rhIdSchema, ...rhContratoBaseSchema.shape }),
      gerirContratos,
      ({ funcionarioId, ...dados }, ctx) =>
        rhContratosService.criarContrato(funcionarioId, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:contratos:atualizar',
    rhHandler(rhIdInputSchema.extend(atualizarRhContratoSchema.shape), gerirContratos, ({ id, ...dados }, ctx) =>
      rhContratosService.atualizarContrato(id, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:contratos:cessar',
    rhHandler(rhIdInputSchema.extend(cessarRhContratoSchema.shape), gerirContratos, ({ id, ...dados }, ctx) =>
      rhContratosService.cessarContrato(id, dados, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:contratos:alteracoes:criar',
    rhHandler(criarRhAlteracaoSalarialSchema, gerirContratos, (input, ctx) =>
      rhContratosService.registarAlteracaoSalarial(input, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:contratos:salario-na-data',
    rhHandler(rhSalarioNaDataSchema, verContratos, ({ funcionarioId, data }, ctx) =>
      rhContratosService.salarioNaData(funcionarioId, data, ctx.empresaId, ctx.podeVerSalarios)
    )
  );

  // ── Alterações Mensais (RH-401) ──────────────────────────────────────────────
  handle(
    'rh:alteracoes-mensais:listar',
    rhHandler(
      z.object({
        funcionarioId: rhIdSchema,
        ano: z.coerce.number().int().min(2000).max(2100),
        mes: z.coerce.number().int().min(1).max(12),
        estado: rhEstadoAlteracaoSchema.optional(),
        skip: z.coerce.number().int().min(0).default(0),
        take: z.coerce.number().int().min(1).max(500).default(50),
      }),
      verAlteracoes,
      (input, ctx) => rhAlteracoesMensaisService.listar(input, ctx.empresaId),
    )
  );
  handle(
    'rh:alteracoes-mensais:criar',
    rhHandler(
      criarRhAlteracaoMensalSchema,
      gerirAlteracoes,
      (input, ctx) =>
        rhAlteracoesMensaisService.criar(input, ctx.empresaId, ctx.utilizadorId),
    )
  );
  handle(
    'rh:alteracoes-mensais:atualizar',
    rhHandler(
      rhIdInputSchema.extend(atualizarRhAlteracaoMensalSchema.shape),
      gerirAlteracoes,
      ({ id, ...dados }, ctx) =>
        rhAlteracoesMensaisService.atualizar(id, dados, ctx.empresaId, ctx.utilizadorId),
    )
  );
  handle(
    'rh:alteracoes-mensais:anular',
    rhHandler(
      z.object({ id: rhIdSchema, motivo: z.string().trim().max(240).optional() }),
      gerirAlteracoes,
      ({ id, motivo }, ctx) =>
        rhAlteracoesMensaisService.anular(id, ctx.empresaId, ctx.utilizadorId, motivo),
    )
  );
  handle(
    'rh:alteracoes-mensais:copiar-mes-anterior',
    rhHandler(copiarAlteracoesMesAnteriorSchema, gerirAlteracoes, (input, ctx) =>
      rhAlteracoesMensaisService.copiarMesAnterior(input, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Ausências (RH-601) ─────────────────────────────────────────────────────────
  handle(
    'rh:ausencias:listar',
    rhHandler(rhAusenciasListarInputSchema, verAusencias, (input, ctx) =>
      rhAusenciasService.listar(ctx.empresaId, input),
    )
  );
  handle(
    'rh:ausencias:obter',
    rhHandler(rhIdSchema, verAusencias, (input, ctx) =>
      rhAusenciasService.obter(input, ctx.empresaId),
    )
  );
  handle(
    'rh:ausencias:criar',
    rhHandler(criarRhAusenciaSchema, gerirAusencias, (input, ctx) =>
      rhAusenciasService.criar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:ausencias:atualizar',
    rhHandler(atualizarRhAusenciaSchema, gerirAusencias, (input, ctx) =>
      rhAusenciasService.atualizar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:ausencias:aprovar',
    rhHandler(rhAusenciaAprovarSchema, gerirAusencias, (input, ctx) =>
      rhAusenciasService.aprovar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:ausencias:inativar',
    rhHandler(rhIdSchema, gerirAusencias, (input, ctx) =>
      rhAusenciasService.inativar(input, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Horas Extra (RH-602) ───────────────────────────────────────────────────────
  handle(
    'rh:horas-extra:listar',
    rhHandler(rhHorasExtraListarInputSchema, verHorasExtra, (input, ctx) =>
      rhHorasExtraService.listar(ctx.empresaId, input),
    )
  );
  handle(
    'rh:horas-extra:obter',
    rhHandler(rhIdSchema, verHorasExtra, (input, ctx) =>
      rhHorasExtraService.obter(input, ctx.empresaId),
    )
  );
  handle(
    'rh:horas-extra:criar',
    rhHandler(criarRhHoraExtraSchema, gerirHorasExtra, (input, ctx) =>
      rhHorasExtraService.criar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:horas-extra:atualizar',
    rhHandler(atualizarRhHoraExtraSchema, gerirHorasExtra, (input, ctx) =>
      rhHorasExtraService.atualizar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:horas-extra:aprovar',
    rhHandler(rhHoraExtraAprovarSchema, gerirHorasExtra, (input, ctx) =>
      rhHorasExtraService.aprovar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:horas-extra:inativar',
    rhHandler(rhIdSchema, gerirHorasExtra, (input, ctx) =>
      rhHorasExtraService.inativar(input, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Férias: Saldos (RH-603) ───────────────────────────────────────────────────
  handle(
    'rh:ferias:saldos:listar',
    rhHandler(rhFeriasSaldosListarInputSchema, verFerias, (input, ctx) =>
      rhFeriasService.listarSaldos(ctx.empresaId, input),
    )
  );
  handle(
    'rh:ferias:saldos:atualizar',
    rhHandler(rhFeriasSaldoAtualizarSchema, gerirFerias, (input, ctx) =>
      rhFeriasService.atualizarSaldo(ctx.empresaId, input, ctx.utilizadorId),
    )
  );

  // ── Férias: Marcações (RH-603) ────────────────────────────────────────────────
  handle(
    'rh:ferias:marcacoes:listar',
    rhHandler(rhMarcacoesFeriasListarInputSchema, verFerias, (input, ctx) =>
      rhFeriasService.listarMarcacoes(ctx.empresaId, input),
    )
  );
  handle(
    'rh:ferias:marcacoes:obter',
    rhHandler(rhIdSchema, verFerias, (input, ctx) =>
      rhFeriasService.obterMarcacao(input, ctx.empresaId),
    )
  );
  handle(
    'rh:ferias:marcacoes:criar',
    rhHandler(criarRhMarcacaoFeriasSchema, gerirFerias, (input, ctx) =>
      rhFeriasService.criarMarcacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:ferias:marcacoes:atualizar',
    rhHandler(atualizarRhMarcacaoFeriasSchema, gerirFerias, (input, ctx) =>
      rhFeriasService.atualizarMarcacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:ferias:marcacoes:aprovar',
    rhHandler(rhMarcacaoFeriasAprovarSchema, gerirFerias, (input, ctx) =>
      rhFeriasService.aprovarMarcacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:ferias:marcacoes:inativar',
    rhHandler(rhIdSchema, gerirFerias, (input, ctx) =>
      rhFeriasService.inativarMarcacao(input, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Afetações (RH-605) ─────────────────────────────────────────────────────────
  handle(
    'rh:afetacoes:listar',
    rhHandler(rhAfetacoesListarInputSchema, verAfetacoes, (input, ctx) =>
      rhAfetacoesService.listar(ctx.empresaId, input),
    )
  );
  handle(
    'rh:afetacoes:obter',
    rhHandler(rhIdSchema, verAfetacoes, (input, ctx) =>
      rhAfetacoesService.obter(input, ctx.empresaId),
    )
  );
  handle(
    'rh:afetacoes:criar',
    rhHandler(criarRhAfetacaoSchema, gerirAfetacoes, (input, ctx) =>
      rhAfetacoesService.criar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:afetacoes:atualizar',
    rhHandler(atualizarRhAfetacaoSchema, gerirAfetacoes, (input, ctx) =>
      rhAfetacoesService.atualizar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:afetacoes:remover',
    rhHandler(z.object({ id: rhIdSchema }), gerirAfetacoes, (input, ctx) =>
      rhAfetacoesService.remover(input.id, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Processos de Dívida/Penhora (RH-606) ─────────────────────────────────────
  handle(
    'rh:dividas:processos:listar',
    rhHandler(rhProcessosDividaListarInputSchema, verDividas, (input, ctx) =>
      rhDividasService.listarProcessos(ctx.empresaId, input),
    )
  );
  handle(
    'rh:dividas:processos:obter',
    rhHandler(rhIdSchema, verDividas, (input, ctx) =>
      rhDividasService.obterProcesso(input, ctx.empresaId),
    )
  );
  handle(
    'rh:dividas:processos:criar',
    rhHandler(criarRhProcessoDividaSchema, gerirDividas, (input, ctx) =>
      rhDividasService.criarProcesso(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:processos:atualizar',
    rhHandler(atualizarRhProcessoDividaSchema, gerirDividas, (input, ctx) =>
      rhDividasService.atualizarProcesso(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:processos:gerar-plano',
    rhHandler(rhProcessoDividaGerarPlanoSchema, gerirDividas, (input, ctx) =>
      rhDividasService.gerarPlanoPrestacoes(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:processos:suspender',
    rhHandler(rhProcessoDividaSuspenderSchema, gerirDividas, (input, ctx) =>
      rhDividasService.suspenderProcesso(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:processos:liquidar',
    rhHandler(rhProcessoDividaLiquidarSchema, gerirDividas, (input, ctx) =>
      rhDividasService.liquidarProcesso(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:processos:cancelar',
    rhHandler(z.object({ id: rhIdSchema, motivo: z.string().min(3).max(500) }), gerirDividas, (input, ctx) =>
      rhDividasService.cancelarProcesso(input.id, ctx.empresaId, input.motivo, ctx.utilizadorId),
    )
  );

  // ── Prestações de Dívida (RH-606) ────────────────────────────────────────────
  handle(
    'rh:dividas:prestacoes:listar',
    rhHandler(rhPrestacoesDividaListarInputSchema, verDividas, (input, ctx) =>
      rhDividasService.listarPrestacoes(ctx.empresaId, input),
    )
  );
  handle(
    'rh:dividas:prestacoes:obter',
    rhHandler(rhIdSchema, verDividas, (input, ctx) =>
      rhDividasService.obterPrestacao(input, ctx.empresaId),
    )
  );
  handle(
    'rh:dividas:prestacoes:atualizar',
    rhHandler(rhPrestacaoDividaAtualizarSchema, gerirDividas, (input, ctx) =>
      rhDividasService.atualizarPrestacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:prestacoes:descontar',
    rhHandler(rhPrestacaoDividaDescontarSchema, gerirDividas, (input, ctx) =>
      rhDividasService.descontarPrestacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:prestacoes:anular',
    rhHandler(rhPrestacaoDividaAnularSchema, gerirDividas, (input, ctx) =>
      rhDividasService.anularPrestacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:dividas:prestacoes:perdoar',
    rhHandler(rhPrestacaoDividaPerdoarSchema, gerirDividas, (input, ctx) =>
      rhDividasService.perdoarPrestacao(ctx.empresaId, input, ctx.utilizadorId),
    )
  );

  // ── Retroactivos (RH-608) ───────────────────────────────────────────────────────
  handle(
    'rh:retroativos:listar',
    rhHandler(rhRetroativosListarInputSchema, verRetroativos, (input, ctx) =>
      rhRetroativosService.listar(ctx.empresaId, input),
    )
  );
  handle(
    'rh:retroativos:obter',
    rhHandler(rhIdSchema, verRetroativos, (input, ctx) =>
      rhRetroativosService.obter(input, ctx.empresaId),
    )
  );
  handle(
    'rh:retroativos:criar',
    rhHandler(criarRhRetroativoSchema, gerirRetroativos, (input, ctx) =>
      rhRetroativosService.criar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:retroativos:atualizar',
    rhHandler(atualizarRhRetroativoSchema, gerirRetroativos, (input, ctx) =>
      rhRetroativosService.atualizar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:retroativos:aplicar',
    rhHandler(rhRetroativoAplicarSchema, gerirRetroativos, (input, ctx) =>
      rhRetroativosService.aplicar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:retroativos:anular',
    rhHandler(rhRetroativoAnularSchema, gerirRetroativos, (input, ctx) =>
      rhRetroativosService.anular(ctx.empresaId, input, ctx.utilizadorId),
    )
  );

  // ── Independentes (RH-701) ──────────────────────────────────────────────────
  handle(
    'rh:independentes:listar',
    rhHandler(rhIndependentesListarInputSchema, verIndependentes, (input, ctx) =>
      rhIndependentesService.listar(ctx.empresaId, input),
    )
  );
  handle(
    'rh:independentes:obter',
    rhHandler(rhIdSchema, verIndependentes, (input, ctx) =>
      rhIndependentesService.obter(input, ctx.empresaId),
    )
  );
  handle(
    'rh:independentes:criar',
    rhHandler(criarRhIndependenteSchema, gerirIndependentes, (input, ctx) =>
      rhIndependentesService.criar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:independentes:atualizar',
    rhHandler(atualizarRhIndependenteSchema, gerirIndependentes, (input, ctx) =>
      rhIndependentesService.atualizar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:independentes:inativar',
    rhHandler(rhIdSchema, gerirIndependentes, (input, ctx) =>
      rhIndependentesService.inativar(input, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Atividades (RH-702) ─────────────────────────────────────────────────────
  handle(
    'rh:atividades:listar',
    rhHandler(rhAtividadesListarInputSchema, verAtividades, (input, ctx) =>
      rhAtividadesService.listar(ctx.empresaId, input),
    )
  );
  handle(
    'rh:atividades:obter',
    rhHandler(rhIdSchema, verAtividades, (input, ctx) =>
      rhAtividadesService.obter(input, ctx.empresaId),
    )
  );
  handle(
    'rh:atividades:criar',
    rhHandler(criarRhAtividadeSchema, gerirAtividades, (input, ctx) =>
      rhAtividadesService.criar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:atividades:atualizar',
    rhHandler(atualizarRhAtividadeSchema, gerirAtividades, (input, ctx) =>
      rhAtividadesService.atualizar(ctx.empresaId, input, ctx.utilizadorId),
    )
  );
  handle(
    'rh:atividades:inativar',
    rhHandler(rhIdSchema, gerirAtividades, (input, ctx) =>
      rhAtividadesService.inativar(input, ctx.empresaId, ctx.utilizadorId),
    )
  );

  // ── Processamento Loader (RH-403) ──────────────────────────────────────────
  handle(
    'rh:processamento:carregar',
    rhHandler(rhProcessamentoLoaderInputSchema, processarSalarios, (input, ctx) =>
      rhProcessamentoLoaderService.carregar({ ...input, empresaId: ctx.empresaId })
    )
  );

  // ── Processamento Simular/Preparar (RH-404) ──────────────────────────────────
  handle(
    'rh:processamento:simular',
    rhHandler(rhSimularSalariosInputSchema, simularSalarios, (input, ctx) =>
      rhProcessamentoService.simular({ ...input, empresaId: ctx.empresaId })
    )
  );
  handle(
    'rh:processamento:preparar',
    rhHandler(rhPrepararSalariosInputSchema, prepararSalarios, (input, ctx) =>
      rhProcessamentoService.preparar({ ...input, empresaId: ctx.empresaId })
    )
  );
  handle(
    'rh:processamento:processar',
    rhHandler(rhProcessarIndividualInputSchema, processarSalarios, (input, ctx) =>
      rhProcessamentoExecucaoService.processarIndividual({
        ...input,
        empresaId: ctx.empresaId,
        utilizadorId: ctx.utilizadorId,
      })
    )
  );
  // Processamento em lote (RH-406): emite progresso por funcionário no evento
  // `rh:processamento:progresso` enquanto o `invoke` devolve o resultado final.
  handle('rh:processamento:processar-lote', (event, raw) =>
    rhHandler(rhProcessarLoteInputSchema, processarSalarios, (input, ctx) =>
      rhProcessamentoLoteService.processarLote(
        { ...input, empresaId: ctx.empresaId, utilizadorId: ctx.utilizadorId },
        (progresso) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('rh:processamento:progresso', progresso);
          }
        }
      )
    )(raw)
  );
  // Anulação de processamentos (RH-407): reverte os efeitos de cada registo
  // numa transacção própria e devolve o resultado agregado.
  handle(
    'rh:processamento:anular',
    rhHandler(rhAnularProcessamentosInputSchema, anularProcessamentos, (input, ctx) =>
      rhProcessamentoAnularService.anular({
        ...input,
        empresaId: ctx.empresaId,
        utilizadorId: ctx.utilizadorId,
      })
    )
  );
  // Listagem de processamentos do período (RH-412): alimenta a selecção do
  // ecrã de anulação. Só leitura; a anulação continua em `rh:processamento:anular`.
  handle(
    'rh:processamento:listar',
    rhHandler(rhProcessamentoListarInputSchema, anularProcessamentos, (input, ctx) =>
      rhProcessamentoListarService.listar({ ...input, empresaId: ctx.empresaId, podeVerSalarios: ctx.podeVerSalarios })
    )
  );
  // Histórico de processamentos efectuados (RH-414): listagem filtrável com
  // paginação, isolada por empresa. Só leitura.
  handle(
    'rh:processamento:historico',
    rhHandler(rhProcessamentoHistoricoInputSchema, verProcessamento, (input, ctx) =>
      rhProcessamentoHistoricoService.listar({ ...input, empresaId: ctx.empresaId, podeVerSalarios: ctx.podeVerSalarios })
    )
  );
  // Visão detalhada de um processamento (RH-414): cabeçalho, bases, escalão de
  // IRT aplicado e itens por rubrica (RF-PRO-06).
  handle(
    'rh:processamento:obter',
    rhHandler(rhProcessamentoDetalheInputSchema, verProcessamento, ({ id }, ctx) =>
      rhProcessamentoHistoricoService.detalhar({ empresaId: ctx.empresaId, id, podeVerSalarios: ctx.podeVerSalarios })
    )
  );

  // ── Departamentos ─────────────────────────────────────────────────────────
  handle(
    'rh:config:departamentos:listar',
    rhHandler(rhFiltroCadastroSchema, verConfig, (input, ctx) =>
      rhConfiguracaoService.listarDepartamentos(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:departamentos:criar',
    rhHandler(criarRhDepartamentoSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarDepartamento(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:departamentos:atualizar',
    rhHandler(
      rhIdInputSchema.extend(criarRhDepartamentoSchema.partial().shape),
      editarConfig,
      ({ id, ...dados }, ctx) => rhConfiguracaoService.atualizarDepartamento(id, dados, ctx.empresaId)
    )
  );
  handle(
    'rh:config:departamentos:inativar',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.inativarDepartamento(id, ctx.empresaId)
    )
  );

  // ── Cargos ────────────────────────────────────────────────────────────────
  handle(
    'rh:config:cargos:listar',
    rhHandler(rhFiltroCadastroSchema, verConfig, (input, ctx) =>
      rhConfiguracaoService.listarCargos(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:cargos:criar',
    rhHandler(criarRhCargoSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarCargo(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:cargos:atualizar',
    rhHandler(
      rhIdInputSchema.extend(criarRhCargoSchema.partial().shape),
      editarConfig,
      ({ id, ...dados }, ctx) => rhConfiguracaoService.atualizarCargo(id, dados, ctx.empresaId)
    )
  );
  handle(
    'rh:config:cargos:inativar',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.inativarCargo(id, ctx.empresaId)
    )
  );

  // ── Dados de referência (RH-806) ──────────────────────────────────────────
  // Idempotente: cria departamentos/cargos padrão e os períodos do ano.
  handle(
    'rh:config:referencia:semear',
    rhHandler(pingSchema, editarConfig, (_input, ctx) =>
      rhConfiguracaoService.semearReferencia(ctx.empresaId)
    )
  );

  // ── Rubricas ──────────────────────────────────────────────────────────────
  handle(
    'rh:config:rubricas:listar',
    rhHandler(rhFiltroCadastroSchema, verConfig, (input, ctx) =>
      rhConfiguracaoService.listarRubricas(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:rubricas:get',
    rhHandler(rhIdInputSchema, verConfig, ({ id }, ctx) =>
      rhConfiguracaoService.obterRubrica(id, ctx.empresaId)
    )
  );
  handle(
    'rh:config:rubricas:criar',
    rhHandler(criarRhRubricaSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarRubrica(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:rubricas:atualizar',
    rhHandler(
      rhIdInputSchema.extend(criarRhRubricaSchema.partial().shape),
      editarConfig,
      ({ id, ...dados }, ctx) => rhConfiguracaoService.atualizarRubrica(id, dados, ctx.empresaId)
    )
  );
  handle(
    'rh:config:rubricas:inativar',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.inativarRubrica(id, ctx.empresaId)
    )
  );

  // ── Tipos de ausência ─────────────────────────────────────────────────────
  handle(
    'rh:config:tipos-ausencia:listar',
    rhHandler(rhFiltroCadastroSchema, verConfig, (input, ctx) =>
      rhConfiguracaoService.listarTiposAusencia(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:tipos-ausencia:criar',
    rhHandler(criarRhTipoAusenciaSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarTipoAusencia(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:tipos-ausencia:atualizar',
    rhHandler(
      rhIdInputSchema.extend(criarRhTipoAusenciaSchema.partial().shape),
      editarConfig,
      ({ id, ...dados }, ctx) => rhConfiguracaoService.atualizarTipoAusencia(id, dados, ctx.empresaId)
    )
  );
  handle(
    'rh:config:tipos-ausencia:inativar',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.inativarTipoAusencia(id, ctx.empresaId)
    )
  );

  // ── Centros de custo ──────────────────────────────────────────────────────
  handle(
    'rh:config:centros-custo:listar',
    rhHandler(rhFiltroCadastroSchema, verConfig, (input, ctx) =>
      rhConfiguracaoService.listarCentrosCusto(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:centros-custo:criar',
    rhHandler(criarRhCentroCustoSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarCentroCusto(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:centros-custo:atualizar',
    rhHandler(
      rhIdInputSchema.extend(criarRhCentroCustoSchema.partial().shape),
      editarConfig,
      ({ id, ...dados }, ctx) => rhConfiguracaoService.atualizarCentroCusto(id, dados, ctx.empresaId)
    )
  );
  handle(
    'rh:config:centros-custo:inativar',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.inativarCentroCusto(id, ctx.empresaId)
    )
  );

  // ── Parâmetros fiscais (com vigência) ─────────────────────────────────────
  handle(
    'rh:config:parametros:listar',
    rhHandler(rhListarParametrosSchema, verConfig, (input, ctx) =>
      rhConfiguracaoService.listarParametros(input, ctx.empresaId)
    )
  );
  handle(
    'rh:config:parametros:criar',
    rhHandler(criarRhParametroSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarParametro(input, ctx.empresaId)
    )
  );

  // ── Tabela de IRT ─────────────────────────────────────────────────────────
  handle(
    'rh:config:irt:listar',
    rhHandler(pingSchema, verConfig, (_input, ctx) =>
      rhConfiguracaoService.listarTabelasIrt(ctx.empresaId)
    )
  );
  handle(
    'rh:config:irt:get',
    rhHandler(rhIdInputSchema, verConfig, ({ id }, ctx) =>
      rhConfiguracaoService.obterTabelaIrt(id, ctx.empresaId)
    )
  );
  handle(
    'rh:config:irt:criar',
    rhHandler(criarRhTabelaIrtSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.criarTabelaIrt(input, ctx.empresaId)
    )
  );

  // ── Períodos ──────────────────────────────────────────────────────────────
  handle(
    'rh:config:periodos:listar',
    rhHandler(rhListarPeriodosSchema, verConfig, ({ ano }, ctx) =>
      rhConfiguracaoService.listarPeriodos(ano, ctx.empresaId)
    )
  );
  handle(
    'rh:config:periodos:gerar',
    rhHandler(gerarRhPeriodosSchema, editarConfig, ({ ano }, ctx) =>
      rhConfiguracaoService.gerarPeriodos(ano, ctx.empresaId)
    )
  );
  handle(
    'rh:config:periodos:fechar',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.fecharPeriodo(id, ctx.empresaId, ctx.utilizadorId)
    )
  );
  handle(
    'rh:config:periodos:reabrir',
    rhHandler(rhIdInputSchema, editarConfig, ({ id }, ctx) =>
      rhConfiguracaoService.reabrirPeriodo(id, ctx.empresaId, ctx.utilizadorId)
    )
  );

  // ── Configuração singleton ────────────────────────────────────────────────
  handle(
    'rh:config:configuracao:obter',
    rhHandler(pingSchema, verConfig, (_input, ctx) =>
      rhConfiguracaoService.obterConfiguracao(ctx.empresaId)
    )
  );
  handle(
    'rh:config:configuracao:atualizar',
    rhHandler(atualizarRhConfiguracaoSchema, editarConfig, (input, ctx) =>
      rhConfiguracaoService.atualizarConfiguracao(input, ctx.empresaId)
    )
  );

  // ── Recibos (RH-502/503) ──────────────────────────────────────────────────
  // Permissão: rh.recibos.ver (listar/obter), rh.recibos.emitir (gerarPdf)
  const verRecibos = { chave: 'rh.recibos.ver' };
  const emitirRecibos = { chave: 'rh.recibos.emitir' };

  handle(
    'rh:recibos:listar',
    rhHandler(rhRecibosListarInputSchema, verRecibos, (input, ctx) => {
      const { funcionarioId, ...rest } = input;
      return rhRecibosService.listar({ ...rest, funcionarioId: funcionarioId ?? undefined, empresaId: ctx.empresaId, podeVerSalarios: ctx.podeVerSalarios });
    })
  );
  handle(
    'rh:recibos:obter',
    rhHandler(rhReciboIdInputSchema, verRecibos, ({ id }, ctx) =>
      rhRecibosService.obter(id, ctx.empresaId, ctx.podeVerSalarios)
    )
  );
  handle(
    'rh:recibos:gerarPdf',
    rhHandler(rhRecibosGerarPdfInputSchema, emitirRecibos, ({ reciboIds }) =>
      rhRecibosService.gerarPdfLote(reciboIds)
    )
  );
  handle(
    'rh:recibos:registarImpressao',
    rhHandler(rhReciboIdInputSchema, emitirRecibos, ({ id }) =>
      rhRecibosService.registarImpressao(id)
    )
  );

  // ── Pagamentos (RH-504) ──────────────────────────────────────────────────────
  // Permissão: rh.pagamentos.ver (listar), rh.pagamentos.gerir (criar ordem, gerar ficheiro, confirmar, estornar)
  const verPagamentos = { chave: 'rh.pagamentos.ver' } as const;
  const gerirPagamentos = { chave: 'rh.pagamentos.gerir' } as const;

  handle(
    'rh:pagamentos:ordens:listar',
    rhHandler(rhOrdensPagamentoListarInputSchema, verPagamentos, (input, ctx) =>
      rhPagamentosService.listarOrdens({ ...input, empresaId: ctx.empresaId })
    )
  );
  handle(
    'rh:pagamentos:ordens:criar',
    rhHandler(rhOrdemPagamentoCriarInputSchema, gerirPagamentos, (input, ctx) =>
      rhPagamentosService.criarOrdem({ ...input, empresaId: ctx.empresaId })
    )
  );
  handle(
    'rh:pagamentos:ordens:obter',
    rhHandler(rhOrdemPagamentoIdInputSchema, verPagamentos, ({ id }, ctx) =>
      rhPagamentosService.obterOrdem(id, ctx.empresaId)
    )
  );
  handle(
    'rh:pagamentos:ordens:gerarFicheiro',
    rhHandler(rhOrdemPagamentoGerarFicheiroInputSchema, gerirPagamentos, ({ id }, ctx) =>
      rhPagamentosService.gerarFicheiroTransferencia(id, ctx.empresaId)
    )
  );
  handle(
    'rh:pagamentos:listar',
    rhHandler(rhPagamentosListarInputSchema, verPagamentos, (input, ctx) =>
      rhPagamentosService.listarPagamentos({ ...input, empresaId: ctx.empresaId })
    )
  );
  handle(
    'rh:pagamentos:confirmar',
    rhHandler(rhPagamentoConfirmarInputSchema, gerirPagamentos, (input, ctx) =>
      rhPagamentosService.confirmarPagamento({
        ...input,
        empresaId: ctx.empresaId,
        utilizadorId: ctx.utilizadorId,
      })
    )
  );
  handle(
    'rh:pagamentos:estornar',
    rhHandler(rhPagamentoEstornarInputSchema, gerirPagamentos, (input, ctx) =>
      rhPagamentosService.estornarPagamento({
        ...input,
        empresaId: ctx.empresaId,
        utilizadorId: ctx.utilizadorId,
      })
    )
  );

  // ── Importação CSV (RH-208) ────────────────────────────────────────────────
  // Canais separados por tipo: o tipo nunca vem do payload nem se decide em
  // cima do conteúdo — vem do próprio canal, e com ele a permissão certa.
  handle(
    'rh:importacao:selecionar',
    rhHandler(pingSchema, { modulo: 'rh', acao: 'write' }, async (_input, _ctx) => {
      // O `write` coarse cobre tanto `rh.funcionarios.criar` como
      // `rh.contratos.gerir`, as duas acções que usam este diálogo.
      const janela = BrowserWindow.getFocusedWindow();
      if (!janela) {
        throw new AppError('Janela principal não encontrada.', 'WINDOW_NOT_FOUND', 500);
      }
      const escolha = await dialog.showOpenDialog(janela, {
        title: 'Selecionar ficheiro CSV',
        properties: ['openFile'],
        filters: [{ name: 'Ficheiros CSV', extensions: ['csv', 'txt'] }],
      });
      if (escolha.canceled || escolha.filePaths.length === 0) {
        return { cancelado: true as const };
      }
      const [caminho] = escolha.filePaths;
      const nome = caminho.split(/[\\/]/).pop() ?? caminho;
      const conteudo = await readFile(caminho, 'utf8');
      return { cancelado: false as const, nome, conteudo };
    })
  );
  handle(
    'rh:importacao:funcionarios:previsualizar',
    rhHandler(rhConteudoFicheiroSchema, criarFuncionario, ({ nome, conteudo }, ctx) =>
      rhImportacaoService.previsualizar('FUNCIONARIOS', nome, conteudo, ctx.empresaId)
    )
  );
  handle(
    'rh:importacao:funcionarios:importar',
    rhHandler(rhImportarFicheiroSchema, criarFuncionario, ({ nome, conteudo, ignorarInvalidas }, ctx) =>
      rhImportacaoService.importar(
        'FUNCIONARIOS',
        nome,
        conteudo,
        ctx.empresaId,
        ctx.utilizadorId,
        { ignorarInvalidas }
      )
    )
  );
  handle(
    'rh:importacao:contratos:previsualizar',
    rhHandler(rhConteudoFicheiroSchema, gerirContratos, ({ nome, conteudo }, ctx) =>
      rhImportacaoService.previsualizar('CONTRATOS', nome, conteudo, ctx.empresaId)
    )
  );
  handle(
    'rh:importacao:contratos:importar',
    rhHandler(rhImportarFicheiroSchema, gerirContratos, ({ nome, conteudo, ignorarInvalidas }, ctx) =>
      rhImportacaoService.importar(
        'CONTRATOS',
        nome,
        conteudo,
        ctx.empresaId,
        ctx.utilizadorId,
        { ignorarInvalidas }
      )
    )
  );

  // ── Auditoria (RH-802) ────────────────────────────────────────────────────────
  handle(
    'rh:auditoria:listar',
    rhHandler(rhAuditoriaListarInputSchema, verAuditoria, (input, ctx) =>
      rhAuditoriaService.listar(ctx.empresaId, input)
    )
  );
  handle(
    'rh:auditoria:por-funcionario',
    rhHandler(rhAuditoriaPorFuncionarioInputSchema, verAuditoria, (input, ctx) =>
      rhAuditoriaService.listarPorFuncionario(ctx.empresaId, input)
    )
  );
  handle(
    'rh:auditoria:por-processamento',
    rhHandler(rhAuditoriaPorProcessamentoInputSchema, verAuditoria, (input, ctx) =>
      rhAuditoriaService.listarPorProcessamento(ctx.empresaId, input)
    )
  );
}
