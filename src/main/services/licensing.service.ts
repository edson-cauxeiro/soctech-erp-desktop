/**
 * @file licensing.service.ts
 * @description Serviço de domínio de licenciamento no Electron Main.
 *
 * Toda a decisão de direito é tomada aqui, a partir do documento assinado.
 * O estado devolvido ao Renderer é sempre derivado no momento da consulta;
 * a base de dados guarda o payload canónico e a assinatura, nunca um estado
 * `VALID` permanente. Não existe qualquer chamada de rede.
 */

import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { LICENSING_MODULES, getLicensingModuleDependencies, getLicensingModuleLabel, isAlwaysAvailableModule, isLicensingModule } from '../../shared/licensing/modules';
import { LICENSE_FILE_EXTENSION, LICENSE_FILE_MAX_BYTES, parseLicenseFileContent } from '../../shared/licensing/file';
import { LICENSING_MESSAGES } from '../../shared/licensing/messages';
import type {
  EssentialCapability,
  ImportLicenseResult,
  LicensePreviewResult,
  LicenseStatus,
  LicenseStatusResult,
  LicenseSummary,
  LicensedModuleView,
  ModuleAccessReason,
  ModuleAccessResult,
} from '../../shared/licensing/types';
import type { LicensePayload } from '../../shared/licensing/schemas';
import { AuditService, type AcaoAuditoria, type RegistarAuditoriaParams, type SeveridadeAuditoria } from './audit.service';
import { LicensingError } from '../utils/licensing-errors';
import {
  LicensingRepository,
  licensingRepository,
  type LicenseComModulos,
} from '../repositories/licensing.repository';
import type { LicensePublicKey } from './licensing/public-keys';
import { validateLicenseDocument } from './licensing/license-validator.service';

/** Quem pediu a operação; a auditoria é opcional quando não há sessão. */
export interface ContextoLicenciamento {
  empresaId?: string | null;
  utilizadorId?: string | null;
}

/** Leitor de ficheiros injectável para testes. */
export interface LeitorFicheirosLicenca {
  stat(caminho: string): Promise<{ size: number }>;
  readFile(caminho: string, encoding: 'utf8'): Promise<string>;
}

const leitorPadrao: LeitorFicheirosLicenca = {
  stat: (caminho) => stat(caminho),
  readFile: (caminho, encoding) => readFile(caminho, encoding),
};

export interface OpcoesServicoLicenciamento {
  repository?: LicensingRepository;
  publicKeys?: readonly LicensePublicKey[];
  /** Data injectável para testes de validade. */
  agora?: () => Date;
  leitorFicheiros?: LeitorFicheirosLicenca;
  auditoria?: Pick<AuditService, 'registar' | 'listar'>;
}

interface EventoLicenciamento {
  acao: AcaoAuditoria;
  descricao: string;
  severidade?: SeveridadeAuditoria;
  entidadeId?: string | null;
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
}

function iso(data: Date | string | null | undefined): string | null {
  if (!data) return null;
  return new Date(data).toISOString();
}

/** Converte um estado de licença num motivo de acesso a módulo. */
function motivoDoEstado(status: LicenseStatus): ModuleAccessReason {
  switch (status) {
    case 'MISSING':
      return 'LICENSE_MISSING';
    case 'EXPIRED':
      return 'LICENSE_EXPIRED';
    case 'NOT_YET_VALID':
      return 'LICENSE_NOT_YET_VALID';
    case 'INSTALLATION_MISMATCH':
      return 'INSTALLATION_MISMATCH';
    default:
      return 'LICENSE_INVALID';
  }
}

export class LicensingService {
  private readonly repository: LicensingRepository;
  private readonly publicKeys: readonly LicensePublicKey[] | undefined;
  private readonly agora: () => Date;
  private readonly leitor: LeitorFicheirosLicenca;
  private readonly auditoria: Pick<AuditService, 'registar' | 'listar'>;

  constructor(opcoes: OpcoesServicoLicenciamento = {}) {
    this.repository = opcoes.repository ?? licensingRepository;
    this.publicKeys = opcoes.publicKeys;
    this.agora = opcoes.agora ?? (() => new Date());
    this.leitor = opcoes.leitorFicheiros ?? leitorPadrao;
    this.auditoria = opcoes.auditoria ?? new AuditService();
  }

  /** Estado actual, derivado da assinatura guardada. Nunca lê `status` da BD. */
  async obterEstado(): Promise<LicenseStatusResult> {
    const installationId = await this.repository.obterInstallationId();
    const registro = await this.repository.obterLicencaAtual();

    if (!registro) {
      return this.resultadoBase({
        status: 'MISSING',
        message: LICENSING_MESSAGES.MISSING,
        registro: null,
        installationId,
      });
    }

    const validacao = this.validarRegistro(registro, installationId);
    if (!validacao.valid) {
      return this.resultadoBase({
        status: validacao.status,
        message: validacao.message,
        registro,
        installationId,
      });
    }

    const agora = this.agora();
    let validadoEm = iso(registro.lastValidatedAt);
    try {
      if (await this.repository.marcarValidacao(registro.id, agora)) {
        validadoEm = agora.toISOString();
      }
    } catch {
      // A revalidação é leitura: falha ao actualizar o timestamp não invalida
      // a licença nem pode impedir a resposta.
    }

    return {
      status: 'VALID',
      message: LICENSING_MESSAGES.VALID,
      summary: this.criarResumo(validacao.payload),
      installationId,
      installedAt: iso(registro.installedAt),
      lastValidatedAt: validadoEm,
      licensedModules: this.modulosLicenciados(validacao.payload),
      modules: this.criarModulosView(validacao.payload),
    };
  }

  /** Reexecuta a validação no arranque; chamada de forma não bloqueante. */
  async revalidarLicencaArmazenada(contexto: ContextoLicenciamento = {}): Promise<LicenseStatusResult> {
    const estado = await this.obterEstado();
    await this.registarEvento(contexto, {
      acao: 'validar',
      descricao: `Revalidação local: ${estado.status}.`,
      severidade: estado.status === 'VALID' ? 'info' : 'aviso',
      entidadeId: estado.summary?.licenseId ?? null,
      dadosNovos: { status: estado.status },
    });
    return estado;
  }

  /** Módulos com direito concedido, pela ordem do catálogo. */
  async obterModulosLicenciados(): Promise<string[]> {
    const estado = await this.obterEstado();
    return estado.status === 'VALID' ? [...estado.licensedModules] : [];
  }

  /**
   * Decisão central de acesso a módulo. RBAC e licenciamento são verificações
   * distintas: aqui só se responde sobre o direito da licença.
   */
  async checkModuleAccess(modulo: string): Promise<ModuleAccessResult> {
    if (!isLicensingModule(modulo)) {
      return { allowed: false, reason: 'MODULE_NOT_LICENSED' };
    }
    if (isAlwaysAvailableModule(modulo)) {
      return { allowed: true, reason: 'LICENSE_ACTIVE' };
    }

    const estado = await this.obterEstado();
    if (estado.status !== 'VALID') {
      return { allowed: false, reason: motivoDoEstado(estado.status) };
    }

    for (const dependencia of getLicensingModuleDependencies(modulo)) {
      if (!estado.licensedModules.includes(dependencia)) {
        return { allowed: false, reason: 'MODULE_NOT_LICENSED' };
      }
    }

    return {
      allowed: estado.licensedModules.includes(modulo),
      reason: estado.licensedModules.includes(modulo) ? 'LICENSE_ACTIVE' : 'MODULE_NOT_LICENSED',
    };
  }

  /** Funcionalidades transversais nunca são bloqueadas por licença de módulo. */
  async checkCapabilityAccess(_capability: EssentialCapability): Promise<ModuleAccessResult> {
    return { allowed: true, reason: 'LICENSE_ACTIVE' };
  }

  /** Pré-visualiza um documento sem o gravar. Não regista eventos de auditoria. */
  async previewLicenseDocument(raw: unknown): Promise<LicensePreviewResult> {
    const installationId = await this.repository.obterInstallationId();
    const resultado = this.validarDocumento(raw, installationId);
    if (!resultado.valid) {
      return { valid: false, status: resultado.status, message: resultado.message, summary: null };
    }
    return {
      valid: true,
      status: 'VALID',
      message: LICENSING_MESSAGES.VALID,
      summary: this.criarResumo(resultado.payload),
    };
  }

  /** Lê e pré-visualiza um ficheiro `.erplic` sem o instalar. */
  async previewLicenseFile(caminho: string): Promise<LicensePreviewResult> {
    return this.previewLicenseDocument(await this.lerFicheiro(caminho));
  }

  /** Pré-visualiza o conteúdo devolvido pelo diálogo nativo. */
  async previewLicenseContent(conteudo: string): Promise<LicensePreviewResult> {
    return this.previewLicenseDocument(this.analisarConteudo(conteudo));
  }

  /** Valida e instala um documento já lido; a anterior só é apagada após validação. */
  async importLicenseDocument(
    raw: unknown,
    contexto: ContextoLicenciamento = {}
  ): Promise<ImportLicenseResult> {
    const installationId = await this.repository.obterInstallationId();
    const validacao = this.validarDocumento(raw, installationId);
    if (!validacao.valid) {
      await this.registarEvento(contexto, {
        acao: 'validar',
        descricao: `Importação rejeitada: ${validacao.status}.`,
        severidade: 'aviso',
        dadosNovos: { status: validacao.status },
      });
      throw new LicensingError(validacao.status);
    }

    const payload = validacao.payload;
    const anterior = await this.repository.obterLicencaAtual();
    const agora = this.agora();
    const instalada = await this.repository.substituirLicenca({
      licenseId: payload.licenseId,
      productId: payload.productId,
      customerName: payload.customer.name,
      customerTaxNumber: payload.customer.taxNumber ?? null,
      issuedAt: new Date(payload.issuedAt),
      notBefore: new Date(payload.notBefore),
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      payloadJson: validacao.canonicalPayload,
      signature: this.assinarTextoBruto(raw),
      keyId: payload.keyId,
      bindingMode: payload.installation.bindingMode,
      installationId: payload.installation.installationId,
      modulos: payload.modules.map((modulo) => ({ moduleKey: modulo.key, enabled: modulo.enabled })),
      installedAt: agora,
      lastValidatedAt: agora,
    });

    await this.registarEvento(contexto, {
      acao: 'actualizar',
      descricao: `Licença ${payload.licenseId} instalada para ${payload.customer.name}.`,
      entidadeId: instalada.id,
      dadosAnteriores: anterior ? { licenseId: anterior.licenseId } : undefined,
      dadosNovos: {
        licenseId: payload.licenseId,
        status: 'VALID',
        modules: this.modulosLicenciados(payload),
      },
    });

    return {
      valid: true,
      status: 'VALID',
      message: LICENSING_MESSAGES.VALID,
      summary: this.criarResumo(payload),
      installedAt: iso(instalada.installedAt),
    };
  }

  /** Importa um ficheiro `.erplic` seleccionado pelo diálogo nativo do Main. */
  async importLicenseFile(caminho: string, contexto: ContextoLicenciamento = {}): Promise<ImportLicenseResult> {
    return this.importLicenseDocument(await this.lerFicheiro(caminho), contexto);
  }

  /** Importa o conteúdo já lido pelo Main; a assinatura é sempre revalidada. */
  async importLicenseContent(
    conteudo: string,
    contexto: ContextoLicenciamento = {}
  ): Promise<ImportLicenseResult> {
    return this.importLicenseDocument(this.analisarConteudo(conteudo), contexto);
  }

  /** Remove apenas a licença; nenhum dado de negócio é apagado ou bloqueado. */
  async removerLicenca(contexto: ContextoLicenciamento = {}): Promise<boolean> {
    const anterior = await this.repository.obterLicencaAtual();
    const removidas = await this.repository.removerLicenca();

    if (removidas > 0) {
      await this.registarEvento(contexto, {
        acao: 'eliminar',
        descricao: 'Licença removida. Os dados de negócio foram preservados.',
        severidade: 'aviso',
        entidadeId: anterior?.id ?? null,
        dadosAnteriores: anterior ? { licenseId: anterior.licenseId } : undefined,
      });
    }
    return removidas > 0;
  }

  /** Histórico em `AuditLog`, com `modulo: 'configuracoes'`. */
  async listarEventos(empresaId: string, limite = 50) {
    return this.auditoria.listar({
      empresaId,
      modulo: 'configuracoes',
      entidade: 'License',
      limite,
      incluirArquivados: false,
    });
  }

  /** Lê extensão, tamanho e conteúdo real; nunca confia apenas na extensão. */
  private async lerFicheiro(caminho: string): Promise<unknown> {
    if (extname(caminho).toLowerCase() !== LICENSE_FILE_EXTENSION) {
      throw new LicensingError('INVALID_FORMAT', { reason: 'EXTENSION' });
    }

    try {
      const { size } = await this.leitor.stat(caminho);
      if (size > LICENSE_FILE_MAX_BYTES) {
        throw new LicensingError('INVALID_FORMAT', { reason: 'SIZE' });
      }
    } catch (erro) {
      if (erro instanceof LicensingError) throw erro;
      throw new LicensingError('INVALID_FORMAT', { reason: 'STAT' });
    }

    let conteudo: string;
    try {
      conteudo = await this.leitor.readFile(caminho, 'utf8');
    } catch {
      throw new LicensingError('INVALID_FORMAT', { reason: 'READ' });
    }

    return this.analisarConteudo(conteudo);
  }

  private analisarConteudo(conteudo: string): unknown {
    try {
      return parseLicenseFileContent(conteudo);
    } catch {
      throw new LicensingError('INVALID_FORMAT', { reason: 'JSON' });
    }
  }

  /** Lê a assinatura do envelope sem a devolver na pré-visualização. */
  private assinarTextoBruto(raw: unknown): string {
    const envelope = raw as { signature?: unknown };
    return typeof envelope?.signature === 'string' ? envelope.signature : '';
  }

  private validarRegistro(
    registro: LicenseComModulos,
    installationId: string
  ): ReturnType<typeof validateLicenseDocument> {
    let payload: unknown;
    try {
      payload = JSON.parse(registro.payloadJson) as unknown;
    } catch {
      return { valid: false, status: 'INVALID_FORMAT', message: LICENSING_MESSAGES.INVALID_FORMAT };
    }
    return this.validarDocumento({ payload, signature: registro.signature }, installationId);
  }

  private validarDocumento(raw: unknown, installationId: string) {
    return validateLicenseDocument(raw, {
      now: this.agora(),
      currentInstallationId: installationId,
      ...(this.publicKeys ? { publicKeys: this.publicKeys } : {}),
    });
  }

  private resultadoBase(params: {
    status: LicenseStatus;
    message: string;
    registro: LicenseComModulos | null;
    installationId: string;
  }): LicenseStatusResult {
    return {
      status: params.status,
      message: params.message,
      summary: null,
      installationId: params.installationId,
      installedAt: iso(params.registro?.installedAt),
      lastValidatedAt: iso(params.registro?.lastValidatedAt),
      licensedModules: [],
      modules: this.criarModulosView(null),
    };
  }

  private criarModulosView(payload: LicensePayload | null): LicensedModuleView[] {
    const concedidos = new Set(
      payload?.modules.filter((modulo) => modulo.enabled).map((modulo) => modulo.key) ?? []
    );
    return LICENSING_MODULES.map((definicao) => ({
      key: definicao.key,
      label: definicao.label,
      licensed: concedidos.has(definicao.key),
      enabled: concedidos.has(definicao.key),
      alwaysAvailable: definicao.alwaysAvailable,
      dependencies: definicao.dependencies,
    }));
  }

  private modulosLicenciados(payload: LicensePayload) {
    const concedidos = new Set(payload.modules.filter((modulo) => modulo.enabled).map((modulo) => modulo.key));
    return LICENSING_MODULES.map((definicao) => definicao.key).filter((chave) => concedidos.has(chave));
  }

  private criarResumo(payload: LicensePayload): LicenseSummary {
    return {
      licenseId: payload.licenseId,
      productId: payload.productId,
      customerName: payload.customer.name,
      customerTaxNumber: payload.customer.taxNumber ?? null,
      issuedAt: payload.issuedAt,
      notBefore: payload.notBefore,
      expiresAt: payload.expiresAt,
      keyId: payload.keyId,
      bindingMode: payload.installation.bindingMode,
      installationId: payload.installation.installationId,
      limits: {
        maxUsers: payload.limits.maxUsers,
        maxDevices: payload.limits.maxDevices,
      },
      modules: payload.modules.map((modulo) => ({
        key: modulo.key,
        label: getLicensingModuleLabel(modulo.key),
        enabled: modulo.enabled,
      })),
    };
  }

  private async registarEvento(contexto: ContextoLicenciamento, evento: EventoLicenciamento): Promise<void> {
    if (!contexto.empresaId) return;

    const parametros: RegistarAuditoriaParams = {
      empresaId: contexto.empresaId,
      utilizadorId: contexto.utilizadorId ?? null,
      modulo: 'configuracoes',
      entidade: 'License',
      acao: evento.acao,
      severidade: evento.severidade ?? 'info',
      descricao: evento.descricao,
      entidadeId: evento.entidadeId ?? null,
      ...(evento.dadosAnteriores === undefined ? {} : { dadosAnteriores: evento.dadosAnteriores }),
      ...(evento.dadosNovos === undefined ? {} : { dadosNovos: evento.dadosNovos }),
    };
    await this.auditoria.registar(parametros);
  }
}

export const licensingService = new LicensingService();
