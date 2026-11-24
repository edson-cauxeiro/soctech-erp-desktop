/**
 * @file audit.service.ts
 * @description Registo de auditoria com pegada de integridade.
 *
 * Um log de auditoria que se pode apagar não serve para nada numa
 * fiscalização. Este serviço é deliberadamente **append-only**: só grava e
 * lê, e cada linha leva um SHA-256 do seu próprio conteúdo. Se alguém mexer
 * numa linha à mão, o hash deixa de bater e a verificação diz onde.
 *
 * A gravação **nunca** lança. Perder um log não pode impedir uma fatura de
 * ser emitida; perder a fatura é que seria um desastre. O que falha fica
 * registado em `console.error` para aparecer no log do processo.
 */

import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { BusinessRuleError } from '../utils/errors';
import { sanitizarParaAuditoria } from '../utils/sanitize';

/** Campos de acção aceitos, espelhando o enum `TipoAcaoAuditoria`. */
export type AcaoAuditoria =
  | 'criar'
  | 'actualizar'
  | 'eliminar'
  | 'exportar'
  | 'validar'
  | 'imprimir'
  | 'login'
  | 'logout'
  | 'anular'
  | 'submeter'
  | 'estornar'
  | 'fechar'
  | 'reabrir'
  | 'pagar'
  | 'apurar'
  | 'conciliar'
  | 'desconciliar';

export type SeveridadeAuditoria = 'info' | 'aviso' | 'critico';

/** Contexto de quem fez a acção, filled pelo controller a partir da sessão. */
export interface ContextoAuditoria {
  empresaId: string;
  utilizadorId?: string | null;
  /** IP e agente vêm do pedido IPC; sem eles o log não diz de onde veio. */
  enderecoIp?: string | null;
  agenteUtilizador?: string | null;
}

export interface RegistarAuditoriaParams extends ContextoAuditoria {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: string | null;
  modulo?: string;
  descricao: string;
  severidade?: SeveridadeAuditoria;
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
}

export interface ListarAuditoriaParams extends ContextoAuditoria {
  entidade?: string;
  entidadeId?: string;
  utilizadorId?: string;
  acao?: AcaoAuditoria;
  severidade?: SeveridadeAuditoria;
  modulo?: string;
  desde?: Date;
  ate?: Date;
  limite?: number;
  cursor?: string;
  /** Se true, inclui registos arquivados (soft-deleted). Default: false. */
  incluirArquivados?: boolean;
}

export interface ListarAuditoriaResultado {
  registos: AuditLog[];
  /** `null` quando a página seguinte é o fim dos resultados. */
  proximoCursor: string | null;
  total: number;
}

export interface AuditLog {
  id: string;
  empresaId: string;
  utilizadorId: string | null;
  utilizadorLogin: string | null;
  acao: AcaoAuditoria;
  severidade: SeveridadeAuditoria;
  entidade: string;
  entidadeId: string | null;
  modulo: string;
  descricao: string;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
  enderecoIp: string | null;
  agenteUtilizador: string | null;
  integridade: string | null;
  dataHora: Date;
  /** Se true, o registo foi arquivado (soft-delete) e não aparece nas listagens padrão. */
  arquivado: boolean;
}

export interface VerificacaoIntegridade {
  totalVerificados: number;
  /** Ids das linhas cujo hash não bate com o conteúdo. */
  adulterados: Array<{
    id: string;
    dataHora: Date;
    esperado: string;
    obtido: string;
  }>;
  integro: boolean;
}

const LIMITE_MAXIMO = 500;

/** Campos que nunca entram no log, por não serem dados fiscais nem úteis. */
const CAMPOS_IGNORADOS = new Set(['createdAt', 'atualizadoEm', 'updatedAt', 'senha', 'passwordHash']);

/**
 * Normaliza um objecto para JSON estável.
 *
 * A ordem das chaves muda o SHA-256 sem mudar o conteúdo, e o objecto que
 * chega vem de um `JSON.parse` cuja ordem não é garantida. Ordenar é o que
 * torna o hash reprodutível entre a gravação e a verificação.
 */
function canonicalizar(valor: unknown): unknown {
  // `bigint` tem de ser tratado antes do teste de `object`: o TypeScript
  // já o exclui aí, e uma comparação posterior daria `never`.
  if (typeof valor === 'bigint') return valor.toString();
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor instanceof Date) return valor.toISOString();

  const entrada = valor as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(entrada).sort()) {
    if (CAMPOS_IGNORADOS.has(chave)) continue;
    saida[chave] = canonicalizar(entrada[chave]);
  }
  return saida;
}

/** Serializa de forma canónica: mesma conteúdo, mesma string, mesmo hash. */
function serializarCanonico(valor: unknown): string {
  return JSON.stringify(canonicalizar(valor) ?? null);
}

/**
 * SHA-256 do conteúdo de uma linha.
 *
 * Não inclui o próprio campo `integridade`, obviamente, nem o `id` gerado —
 * incluir o `id` faria o hash depender de um valor aleatório e portanto não
 * verificável por quem não tem a linha original.
 */
function calcularIntegridade(linha: {
  empresaId: string;
  utilizadorId: string | null;
  acao: string;
  severidade: string;
  entidade: string;
  entidadeId: string | null;
  modulo: string;
  descricao: string;
  dadosAnteriores: string | null;
  dadosNovos: string | null;
  enderecoIp: string | null;
  agenteUtilizador: string | null;
  dataHora: Date;
}): string {
  return createHash('sha256')
    .update(
      serializarCanonico({
        empresaId: linha.empresaId,
        utilizadorId: linha.utilizadorId,
        acao: linha.acao,
        severidade: linha.severidade,
        entidade: linha.entidade,
        entidadeId: linha.entidadeId,
        modulo: linha.modulo,
        descricao: linha.descricao,
        dadosAnteriores: linha.dadosAnteriores,
        dadosNovos: linha.dadosNovos,
        enderecoIp: linha.enderecoIp,
        agenteUtilizador: linha.agenteUtilizador,
        dataHora: linha.dataHora.toISOString(),
      }),
    )
    .digest('hex');
}

export class AuditService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Regista uma acção.
   *
   * Nunca lança. Devolve `null` se a gravação falhar, para que o chamador
   * possa decidir o que fazer sem ter de apanhar excepção — e o erro fica
   * visível em `console.error`.
   */
  async registar(params: RegistarAuditoriaParams): Promise<string | null> {
    try {
      const dataHora = new Date();

      // Sanitizar antes de serializar: remove PII e mascara valores sensíveis
      const dadosAnterioresSanitizados = params.dadosAnteriores === undefined
        ? null
        : sanitizarParaAuditoria(params.dadosAnteriores);
      const dadosNovosSanitizados = params.dadosNovos === undefined
        ? null
        : sanitizarParaAuditoria(params.dadosNovos);

      const dadosAnteriores = dadosAnterioresSanitizados === null ? null : serializarCanonico(dadosAnterioresSanitizados);
      const dadosNovos = dadosNovosSanitizados === null ? null : serializarCanonico(dadosNovosSanitizados);

      const integridade = calcularIntegridade({
        empresaId: params.empresaId,
        utilizadorId: params.utilizadorId ?? null,
        acao: params.acao,
        severidade: params.severidade ?? 'info',
        entidade: params.entidade,
        entidadeId: params.entidadeId ?? null,
        modulo: params.modulo ?? 'fiscal',
        descricao: params.descricao,
        dadosAnteriores,
        dadosNovos,
        enderecoIp: params.enderecoIp ?? null,
        agenteUtilizador: params.agenteUtilizador ?? null,
        dataHora,
      });

      const criado = await this.prisma.auditLog.create({
        data: {
          id: randomUUID(),
          empresaId: params.empresaId,
          utilizadorId: params.utilizadorId ?? null,
          acao: params.acao,
          severidade: params.severidade ?? 'info',
          entidade: params.entidade,
          entidadeId: params.entidadeId ?? null,
          modulo: params.modulo ?? 'fiscal',
          descricao: params.descricao,
          dadosAnteriores,
          dadosNovos,
          enderecoIp: params.enderecoIp ?? null,
          agenteUtilizador: params.agenteUtilizador ?? null,
          integridade,
          dataHora,
        },
      });

      return criado.id;
    } catch (erro) {
      // Um log perdido tem de ser notável sem ser fatal.
      console.error('[auditoria] Falha ao registar acção:', erro);
      return null;
    }
  }

  /**
   * Regista uma operação que o utilizador explicitamente pediu para auditar.
   *
   * É este o ponto de chamada nos serviços de negócio; `registar` fica
   * disponível para quando um teste precisar de escreve directamente.
   */
  async registarOperacao(params: RegistarAuditoriaParams): Promise<string | null> {
    return this.registar(params);
  }

  /**
   * Arquiva um registo de auditoria (soft-delete).
   *
   * O log mantém-se append-only: o registo não é eliminado fisicamente,
   * apenas marcado como arquivado (`arquivado = true`). Deixa de aparecer
   * nas listagens padrão, mas permanece intacto para efeitos de integridade
   * e verificação de integridade.
   */
  async arquivar(empresaId: string, id: string): Promise<boolean> {
    const resultado = await this.prisma.auditLog.updateMany({
      where: { id, empresaId, arquivado: false },
      data: { arquivado: true },
    });
    return resultado.count > 0;
  }

  /**
   * Desarquiva um registo de auditoria.
   *
   * Reverte o arquivo (soft-delete), tornando o registo visível novamente
   * nas listagens padrão.
   */
  async desarquivar(empresaId: string, id: string): Promise<boolean> {
    const resultado = await this.prisma.auditLog.updateMany({
      where: { id, empresaId, arquivado: true },
      data: { arquivado: false },
    });
    return resultado.count > 0;
  }

  /**
   * Eliminação de um registo de auditoria.
   *
   * O log é **append-only**: um registo que se pode apagar não serve para uma
   * fiscalização. Este método existe para preservar o contrato de tipos de quem
   * já o usava, mas recusa-se a apagar — nunca toca na base de dados.
   */
  async eliminar(_empresaId: string, _id: string): Promise<boolean> {
    throw new BusinessRuleError(
      'O log de auditoria é append-only: os registos não podem ser eliminados fisicamente. Use arquivar() para soft-delete.'
    );
  }

  /**
   * Limpeza do log de auditoria de uma empresa.
   *
   * Tal como `eliminar`, recusa-se a apagar: o objecto deste serviço é que o
   * rasto seja imutável.
   */
  async limpar(_empresaId: string): Promise<number> {
    throw new BusinessRuleError(
      'O log de auditoria é append-only: os registos não podem ser apagados fisicamente. Use arquivar() para soft-delete.'
    );
  }

  /**
   * Lista o log de uma empresa, do mais recente para o mais antigo.
   *
   * Paginamos por cursor (`dataHora`, `id`) e não por `offset`: o log é
   * append-only e cresce a cada acção, então um `offset` deslocaria a página
   * enquanto o utilizador lê a mesma linha apareceria duas vezes.
   */
  async listar(params: ListarAuditoriaParams): Promise<ListarAuditoriaResultado> {
    const limite = Math.min(params.limite ?? 50, LIMITE_MAXIMO);
    const filtros: Prisma.AuditLogWhereInput = { 
      empresaId: params.empresaId,
      arquivado: params.incluirArquivados ? undefined : false,
    };

    if (params.entidade) filtros.entidade = params.entidade;
    if (params.entidadeId) filtros.entidadeId = params.entidadeId;
    if (params.utilizadorId) filtros.utilizadorId = params.utilizadorId;
    if (params.acao) filtros.acao = params.acao;
    if (params.severidade) filtros.severidade = params.severidade;
    if (params.modulo) filtros.modulo = params.modulo;
    if (params.desde || params.ate) {
      filtros.dataHora = {
        ...(params.desde ? { gte: params.desde } : {}),
        ...(params.ate ? { lte: params.ate } : {}),
      };
    }

    if (params.cursor) {
      const [dataIso, id] = params.cursor.split('|');
      const data = new Date(dataIso);
      if (!Number.isNaN(data.getTime()) && id) {
        const cursor = { dataHora: data, id };
        filtros.AND = [
          {
            OR: [{ dataHora: { lt: cursor.dataHora } }, { dataHora: cursor.dataHora, id: { lt: cursor.id } }],
          },
        ];
      }
    }

    const [linhas, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: filtros,
        orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
        take: limite + 1,
        include: { utilizador: { select: { login: true, nomeCompleto: true } } },
      }),
      this.prisma.auditLog.count({ where: filtros }),
    ]);

    const temMais = linhas.length > limite;
    const pagina = temMais ? linhas.slice(0, limite) : linhas;
    const ultimo = pagina[pagina.length - 1];

    return {
      registos: pagina.map((l) => ({
        id: l.id,
        empresaId: l.empresaId,
        utilizadorId: l.utilizadorId,
        utilizadorLogin: l.utilizador?.login ?? null,
        acao: l.acao as AcaoAuditoria,
        severidade: l.severidade as SeveridadeAuditoria,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        modulo: l.modulo,
        descricao: l.descricao,
        dadosAnteriores: l.dadosAnteriores ? JSON.parse(l.dadosAnteriores) : null,
        dadosNovos: l.dadosNovos ? JSON.parse(l.dadosNovos) : null,
        enderecoIp: l.enderecoIp,
        agenteUtilizador: l.agenteUtilizador,
        integridade: l.integridade,
        dataHora: l.dataHora,
        arquivado: l.arquivado,
      })),
      proximoCursor: temMais && ultimo ? `${ultimo.dataHora.toISOString()}|${ultimo.id}` : null,
      total,
    };
  }

  /**
   * Recalcula o hash de um intervalo de linhas e diz quais não batem certo.
   *
   * Serve para provar a integridade numa auditoria: o resultado só garante
   * que *nada* mudou desde a gravação, não que o registo original era
   * verdadeiro. Isso só o emissor da assinatura o pode dizer.
   */
  async verificarIntegridade(
    empresaId: string,
    opcoes: { desde?: Date; ate?: Date; limite?: number } = {},
  ): Promise<VerificacaoIntegridade> {
    const linhas = await this.prisma.auditLog.findMany({
      where: {
        empresaId,
        ...(opcoes.desde || opcoes.ate
          ? {
              dataHora: {
                ...(opcoes.desde ? { gte: opcoes.desde } : {}),
                ...(opcoes.ate ? { lte: opcoes.ate } : {}),
              },
            }
          : {}),
      },
      orderBy: { dataHora: 'desc' },
      take: Math.min(opcoes.limite ?? 1000, 5000),
    });

    const adulterados: VerificacaoIntegridade['adulterados'] = [];

    for (const linha of linhas) {
      if (!linha.integridade) continue;
      const esperado = calcularIntegridade({
        empresaId: linha.empresaId,
        utilizadorId: linha.utilizadorId,
        acao: linha.acao,
        severidade: linha.severidade,
        entidade: linha.entidade,
        entidadeId: linha.entidadeId,
        modulo: linha.modulo,
        descricao: linha.descricao,
        dadosAnteriores: linha.dadosAnteriores,
        dadosNovos: linha.dadosNovos,
        enderecoIp: linha.enderecoIp,
        agenteUtilizador: linha.agenteUtilizador,
        dataHora: linha.dataHora,
      });

      if (esperado !== linha.integridade) {
        adulterados.push({
          id: linha.id,
          dataHora: linha.dataHora,
          esperado: linha.integridade,
          obtido: esperado,
        });
      }
    }

    return {
      totalVerificados: linhas.length,
      adulterados,
      integro: adulterados.length === 0,
    };
  }

  /**
   * Resumo por período, para o painel de conformidade.
   *
   * `agruparPor` é livre para deixar a UI escolher a vista, mas não é
   * interpolado em SQL: o valor só entra como chave do `groupBy`, nunca
   * como nome de coluna escolhido pelo cliente.
   */
  async resumo(
    empresaId: string,
    opcoes: { desde?: Date; ate?: Date; agruparPor?: 'acao' | 'severidade' | 'entidade' | 'utilizador' } = {},
  ): Promise<Record<string, number>> {
    const campo =
      opcoes.agruparPor === 'severidade'
        ? 'severidade'
        : opcoes.agruparPor === 'entidade'
          ? 'entidade'
          : opcoes.agruparPor === 'utilizador'
            ? 'utilizadorId'
            : 'acao';

    const grupos = await this.prisma.auditLog.groupBy({
      by: [campo],
      where: {
        empresaId,
        ...(opcoes.desde || opcoes.ate
          ? {
              dataHora: {
                ...(opcoes.desde ? { gte: opcoes.desde } : {}),
                ...(opcoes.ate ? { lte: opcoes.ate } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
    });

    return Object.fromEntries(grupos.map((g) => [String((g as Record<string, unknown>)[campo] ?? 'desconhecido'), g._count._all]));
  }
}

/** Instância partilhada, para não abrir um pool por chamada. */
export const auditService = new AuditService();