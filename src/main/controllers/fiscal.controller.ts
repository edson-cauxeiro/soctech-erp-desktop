/**
 * @file fiscal.controller.ts
 * @description Controlador IPC do módulo Fiscal: SAF-T, conformidade AGT e
 * auditoria.
 *
 * Todas as rotas exigem o módulo `fiscal` do RBAC. A distinção entre `read`
 * e `write` aqui não é decorativa: gerar um ficheiro e registar a sua
 * submissão muda o estado fiscal da empresa e escreve em disco, enquanto
 * listar o histórico é só consulta. Um perfil que só pode consultar não
 * deve conseguir produzir um ficheiro.
 *
 * Cada acção com efeito fiscal é registada na auditoria a partir daqui, e
 * não de dentro do serviço: um registo que só existe no caminho do IPC
 * não cobre quem chama o serviço por outro caminho (testes, CLI, jobs).
 * Por isso o `AuditService` é chamado em vez de ficar implícito.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { type IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { requirePermission, type UserSession } from '../middlewares/rbac.middleware';
import { authService, type AuthService } from '../services/auth.service';
import { auditService, type AuditService, type RegistarAuditoriaParams } from '../services/audit.service';
import { saftService, type SaftService } from '../services/saft/saft.service';
import {
  fiscalAgtService,
  FiscalAgtService,
} from '../services/fiscal/fiscal-agt.service';
import { prisma } from '../database/prisma';
import {
  fiscalPeriodoSchema,
  fiscalValidarSchema,
  fiscalAgtSchema,
  respostaAgtSchema,
  fiscalAuditoriaSchema,
  verificarIntegridadeSchema,
  listarSubmissoesSchema,
} from '../validators/fiscal.validator';

export class FiscalController {
  private auth: AuthService;
  private audit: AuditService;
  private saft: SaftService;
  private agt: FiscalAgtService;

  constructor(
    auth: AuthService = authService,
    audit: AuditService = auditService,
    saft: SaftService = saftService,
    agt: FiscalAgtService = fiscalAgtService,
  ) {
    this.auth = auth;
    this.audit = audit;
    this.saft = saft;
    this.agt = agt;
  }

  // ===========================================================================
  // SAF-T
  // ===========================================================================

  /**
   * Gera o ficheiro SAF-T do período e grava-o em disco.
   *
   * Grava em `userData/fiscal`, não no directório do executável: numa
   * instalação em modo protegido o directório da aplicação não é
   * escribível, e falhar por isso seria silencioso e difícil de
   * diagnosticar.
   */
  async gerarSaft(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'gerar ficheiro SAF-T', async (sessao) => {
      const params = fiscalPeriodoSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);

      const empresa = await prisma.empresaConfig.findUnique({
        where: { id: empresaId },
        select: { nome: true, moedaBase: true },
      });
      if (!empresa) throw new NotFoundError(`Empresa não encontrada: ${empresaId}`);

      const resultado = await this.saft.gerar({
        empresaId,
        ano: params.ano,
        mes: params.mes,
        incluirAnulados: params.incluirAnulados,
      });

      // A validação estrutural decide se o ficheiro é gravado. Gravar um
      // ficheiro que o próprio motor rejeita deixa um artefacto na pasta de
      // exportação que parece autoritativo e não é.
      if (!resultado.validacao.valido) {
        await this.registarAuditoria(sessao, {
          acao: 'validar',
          entidade: 'FicheiroSaft',
          descricao: `Geração SAF-T ${params.ano}/${params.mes ?? 'ano'} rejeitada na validação estrutural.`,
          severidade: 'critico',
          dadosNovos: {
            erros: resultado.validacao.totalErros,
            problemas: resultado.validacao.problemas.map((p) => p.codigo),
          },
        });

        // Lançar e não devolver `err(...)`: o `com()` já embrulha o resultado em
        // `ok()`, e uma resposta de erro devolvida de dentro acabava embrulhada
        // em `success: true`. O renderer via o ficheiro como gerado com sucesso
        // e os erros apareciam como um banner verde de conformidade.
        throw new AppError(
          `O ficheiro SAF-T foi gerado mas não passou a validação estrutural (${resultado.validacao.totalErros} erro(s)).`,
          'SAFT_VALIDACAO_FALHOU',
          422,
          resultado.validacao.problemas,
        );
      }

      const caminho = await this.gravarFicheiro(resultado.nomeFicheiro, resultado.xml);

      await this.registarAuditoria(sessao, {
        acao: 'exportar',
        entidade: 'FicheiroSaft',
        descricao: `Gerou ${resultado.nomeFicheiro} com ${resultado.estatisticas.documentos} documento(s).`,
        dadosNovos: {
          nomeFicheiro: resultado.nomeFicheiro,
          caminho,
          hash: resultado.hashFicheiro,
          documentos: resultado.estatisticas.documentos,
          totalLiquido: resultado.estatisticas.totalLiquido,
        },
      });

      return {
        nomeFicheiro: resultado.nomeFicheiro,
        caminho,
        hashFicheiro: resultado.hashFicheiro,
        estatisticas: resultado.estatisticas,
        avisos: resultado.validacao.totalAvisos,
        problemas: resultado.validacao.problemas.filter((p) => p.severidade === 'aviso'),
      };
    });
  }

  /**
   * Gera e devolve o XML sem o gravar.
   *
   * Existe em separado do `gerar` porque pré-visualizar não é exportar: a
   * UI mostra o resultado da validação sem deixar um ficheiro por limpar.
   */
  async validarSaft(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'validar ficheiro SAF-T', async (sessao) => {
      const params = fiscalValidarSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);
      const resultado = await this.saft.gerar({
        empresaId,
        ano: params.ano,
        mes: params.mes,
      });

      await this.registarAuditoria(sessao, {
        acao: 'validar',
        entidade: 'FicheiroSaft',
        descricao: `Validou ${resultado.nomeFicheiro} sem exportar.`,
        dadosNovos: {
          erros: resultado.validacao.totalErros,
          avisos: resultado.validacao.totalAvisos,
        },
      });

      return {
        nomeFicheiro: resultado.nomeFicheiro,
        valido: resultado.validacao.valido,
        totalErros: resultado.validacao.totalErros,
        totalAvisos: resultado.validacao.totalAvisos,
        ambito: resultado.validacao.ambito,
        problemas: resultado.validacao.problemas,
        estatisticas: resultado.estatisticas,
      };
    });
  }

  // ===========================================================================
  // Conformidade AGT
  // ===========================================================================

  /**
   * Gera um ficheiro AGT e regista-o no rastreio local.
   *
   * Não submete: a submissão é feita pelo software certificado do operador.
   * O que fica aqui é a cadeia de custódia e as assinaturas por documento.
   */
  async gerarAgt(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'gerar ficheiro AGT', async (sessao) => {
      const params = fiscalAgtSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);

      const empresa = await prisma.empresaConfig.findUnique({
        where: { id: empresaId },
        select: { nome: true, nif: true, moedaBase: true, pais: true },
      });
      if (!empresa) throw new NotFoundError(`Empresa não encontrada: ${empresaId}`);

      if (empresa.pais !== 'AO') {
        throw new ValidationError(
          `O ficheiro AGT é para empresas de Angola; a empresa configurada é de '${empresa.pais}'.`,
        );
      }

      const [inicio, fim] = resolverPeriodo(params.ano, params.mes);

      const faturas = await prisma.faturaVenda.findMany({
        where: {
          empresaId,
          dataEmissao: { gte: inicio, lte: fim },
        },
        include: { linhas: true },
        orderBy: { numero: 'asc' },
      });

      const documentos = faturas.map((f) => FiscalAgtService.paraDocumentoAgt(f, empresa.moedaBase));

      const resultado = await this.agt.gerarFicheiro({
        empresaId,
        utilizadorId: sessao.id,
        software: params.software,
        nifEmpresa: empresa.nif,
        moeda: empresa.moedaBase,
        nomeEmpresa: empresa.nome,
        documentos,
        ano: params.ano,
        mes: params.mes,
        conteudo: resumoConteudo(documentos),
        nomeFicheiro: params.nomeFicheiro,
      });

      await this.registarAuditoria(sessao, {
        acao: 'exportar',
        entidade: 'SubmissaoAgt',
        entidadeId: resultado.id,
        descricao: `Gerou ${resultado.nomeFicheiro} (${resultado.documentos.length} documento(s)).`,
        severidade: resultado.conformidade.conforme ? 'info' : 'aviso',
        dadosNovos: {
          nomeFicheiro: resultado.nomeFicheiro,
          hash: resultado.hashFicheiro,
          erros: resultado.conformidade.resumo.erros,
          avisos: resultado.conformidade.resumo.avisos,
        },
      });

      return resultado;
    });
  }

  /** Regista o que o operador reportou do software certificado. */
  async registarRespostaAgt(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'registar resposta da AGT', async (sessao) => {
      const params = respostaAgtSchema.parse(payload);

      // A submissão tem de ser desta empresa. Sem este `where`, bastava
      // conhecer um `submissaoId` de outra empresa para lhe escrever o estado
      // e injectar uma resposta forjada na cadeia de custódia.
      const submissao = await this.agt.obterDeEmpresa(params.submissaoId, sessao.empresaConfigId!);
      if (!submissao) {
        throw new NotFoundError(
          `Submissão '${params.submissaoId}' não encontrada nesta empresa.`,
        );
      }

      await this.agt.registarResposta(params.submissaoId, {
        estado: params.estado,
        respostaAgt: params.respostaAgt,
        hashRecebido: params.hashRecebido.toLowerCase(),
      });

      await this.registarAuditoria(sessao, {
        acao: 'submeter',
        entidade: 'SubmissaoAgt',
        entidadeId: params.submissaoId,
        descricao: `Estado da submissão passou a "${params.estado}".`,
        severidade: params.estado === 'rejeitado' ? 'critico' : 'info',
        dadosNovos: { estado: params.estado, resposta: params.respostaAgt.slice(0, 500) },
      });

      return { submissaoId: params.submissaoId, estado: params.estado };
    });
  }

  /**
   * Histórico de ficheiros AGT.
   *
   * Não regista a consulta: ver `listarAuditoria` para o porquê.
   */
  async listarSubmissoes(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar submissões AGT', async (sessao) => {
      const params = listarSubmissoesSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);
      return this.agt.listar(empresaId, {
        estado: params.estado,
        limite: params.limite,
      });
    });
  }

  // ===========================================================================
  // Auditoria
  // ===========================================================================

  /** Lista o log de auditoria da empresa. */
  async listarAuditoria(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar auditoria', async (sessao) => {
      const params = fiscalAuditoriaSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);
      const resultado = await this.audit.listar({
        empresaId,
        entidade: params.entidade,
        entidadeId: params.entidadeId,
        utilizadorId: params.utilizadorId,
        acao: params.acao,
        severidade: params.severidade,
        modulo: params.modulo,
        desde: params.desde ? new Date(params.desde) : undefined,
        ate: params.ate ? new Date(params.ate) : undefined,
        cursor: params.cursor,
        limite: params.limite,
        incluirArquivados: params.incluirArquivados,
      });

      // A consulta ao log não é registada. Seria registar cada leitura num
      // log que é lido por essa mesma leitura, e o custo cresce sem que
      // ninguém aprenda nada novo sobre o que aconteceu.
      return resultado;
    });
  }

  /** Verifica a integridade do log por hash. */
  async verificarIntegridade(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'verificar integridade da auditoria', async (sessao) => {
      const params = verificarIntegridadeSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);
      const resultado = await this.audit.verificarIntegridade(empresaId, {
        desde: params.desde ? new Date(params.desde) : undefined,
        ate: params.ate ? new Date(params.ate) : undefined,
        limite: params.limite,
      });

      return resultado;
    });
  }

  /** Resumo por período, para o painel de conformidade. */
  async resumoAuditoria(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'resumir auditoria', async (sessao) => {
      const params = fiscalAuditoriaSchema.parse(payload);
      const empresaId = exigirEmpresaDaSessao(sessao, params.empresaId);
      const [porAcao, porSeveridade] = await Promise.all([
        this.audit.resumo(empresaId, {
          desde: params.desde ? new Date(params.desde) : undefined,
          ate: params.ate ? new Date(params.ate) : undefined,
          agruparPor: 'acao',
        }),
        this.audit.resumo(empresaId, {
          desde: params.desde ? new Date(params.desde) : undefined,
          ate: params.ate ? new Date(params.ate) : undefined,
          agruparPor: 'severidade',
        }),
      ]);

      return { porAcao, porSeveridade };
    });
  }

  /** Arquiva (soft-delete) um registo de auditoria. */
  async arquivarAuditoria(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'arquivar registo de auditoria', async (sessao) => {
      const empresaId = exigirEmpresaDaSessao(sessao, undefined);
      const { id } = z.object({ id: z.string().min(1) }).parse(payload);
      const ok = await this.audit.arquivar(empresaId, id);
      if (!ok) throw new NotFoundError(`Registo de auditoria '${id}' não encontrado ou já arquivado.`);
      await this.registarAuditoria(sessao, {
        acao: 'actualizar',
        entidade: 'AuditLog',
        entidadeId: id,
        descricao: `Registo de auditoria arquivado (soft-delete).`,
        severidade: 'info',
      });
      return { success: true };
    });
  }

  /** Desarquiva um registo de auditoria previamente arquivado. */
  async desarquivarAuditoria(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('write', 'desarquivar registo de auditoria', async (sessao) => {
      const empresaId = exigirEmpresaDaSessao(sessao, undefined);
      const { id } = z.object({ id: z.string().min(1) }).parse(payload);
      const ok = await this.audit.desarquivar(empresaId, id);
      if (!ok) throw new NotFoundError(`Registo de auditoria '${id}' não encontrado ou não arquivado.`);
      await this.registarAuditoria(sessao, {
        acao: 'actualizar',
        entidade: 'AuditLog',
        entidadeId: id,
        descricao: `Registo de auditoria desarquivado (restaurado).`,
        severidade: 'info',
      });
      return { success: true };
    });
  }

  // ===========================================================================
  // Internos
  // ===========================================================================

  /** Grava o ficheiro em `userData/fiscal`, criando a pasta se não existir. */
  private async gravarFicheiro(nomeFicheiro: string, conteudo: string): Promise<string> {
    const pasta = join(app.getPath('userData'), 'fiscal');
    await fs.mkdir(pasta, { recursive: true });

    const caminho = join(pasta, nomeFicheiro);
    await fs.writeFile(caminho, conteudo, 'utf8');

    return caminho;
  }

  /**
   * Preenche o contexto do log com a sessão.
   *
   * O `enderecoIp` e o agente não vêm aqui: o controller IPC não recebe
   * informação de rede fiável, e inventar um valor seria pior que registar
   * `null`, que pelo menos não mente.
   */
  private async registarAuditoria(
    sessao: UserSession,
    params: Omit<RegistarAuditoriaParams, 'empresaId' | 'utilizadorId'>,
  ): Promise<void> {
    await this.audit.registar({
      empresaId: sessao.empresaConfigId ?? '',
      utilizadorId: sessao.id,
      modulo: 'fiscal',
      ...params,
    });
  }

  /**
   * Envolve cada rota em verificação de permissão e tradução de erro.
   *
   * A sessão vem do `AuthService` e não do pedido IPC: um renderer
   * comprometido não pode escolher em que sessão corre.
   */
  private async com(
    acao: 'read' | 'write' | 'delete',
    descricao: string,
    fn: (sessao: UserSession, empresaId: string) => Promise<unknown>,
  ): Promise<IpcResponse<unknown>> {
    try {
      const sessao = this.auth.getCurrentSession();
      requirePermission(sessao, 'fiscal', acao);

      if (!sessao?.empresaConfigId) {
        throw new AppError('Sessão sem empresa associada.', 'SEM_EMPRESA', 403);
      }

      return ok(await fn(sessao, sessao.empresaConfigId));
    } catch (erro) {
      if (erro instanceof AppError) return err(erro.code, erro.message, erro.details);
      return err('INTERNAL_ERROR', (erro as Error)?.message || `Erro ao ${descricao}.`);
    }
  }
}

/**
 * Confirma que a empresa pedida é a empresa da sessão.
 *
 * O `requirePermission` só diz *se* o perfil pode ver o módulo fiscal; não diz
 * *de que empresa*. Sem esta verificação, um utilizador com `fiscal: read`
 * numa empresa trocava o `empresaId` no payload e lia as vendas, o stock e a
 * auditoria de outra empresa inteira — passava a verificação de permissão e
 * falhava só no dado.
 *
 * A empresa da sessão é a única autoridade. O `empresaId` do payload é
 * conferido contra ela e nunca a substitui.
 */
function exigirEmpresaDaSessao(sessao: UserSession, pedido: string | undefined): string {
  const empresaDaSessao = sessao.empresaConfigId;
  if (!empresaDaSessao) {
    throw new AppError('Sessão sem empresa associada.', 'SEM_EMPRESA', 403);
  }
  if (pedido && pedido !== empresaDaSessao) {
    throw new ForbiddenError('A empresa pedida não corresponde à empresa da sessão.');
  }
  return empresaDaSessao;
}

/** Resolve um ano com ou sem mês para um intervalo fechado. */
function resolverPeriodo(ano: number, mes: number | null): [Date, Date] {
  const inicio = mes ? new Date(ano, mes - 1, 1) : new Date(ano, 0, 1);
  const fim = mes ? new Date(ano, mes, 0) : new Date(ano, 11, 31);
  return [inicio, fim];
}

/**
 * Resumo determinístico dos documentos, para ter o que hashear.
 *
 * AAGT não define um formato de ficheiro próprio nesta implementação, por
 * isso o `hashFicheiro` é sobre este resumo e não sobre um XML. Está
 * isolado numa função nomeada para que, quando o formato existir, o único
 * sítio a mudar seja este.
 */
function resumoConteudo(documentos: Array<{ id: string; numero: string; totalLiquido: number }>): string {
  return JSON.stringify(
    documentos.map((d) => ({ id: d.id, numero: d.numero, total: d.totalLiquido })),
    null,
    2,
  );
}

export const fiscalController = new FiscalController();