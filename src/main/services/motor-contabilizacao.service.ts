/**
 * @file motor-contabilizacao.service.ts
 * @description Motor de contabilização declarativo.
 *
 * Recebe:
 *  - `empresaId`, `moduloOrigem`, `tipoOrigem`, `origemId` (identificam o documento)
 *  - `dados` (objeto com os valores brutos do documento: total, net, tax, base, etc.)
 *
 * Fluxo:
 *  1. Procura regra ativa para `(empresaId, moduloOrigem, tipoOrigem)`.
 *  2. Para cada linha da regra:
 *     - Resolve a chave da conta via `MapeamentoConta`.
 *     - Verifica se a conta aceita movimento.
 *     - Calcula o valor pela `expressaoValor` (switch puro, sem eval).
 *  3. Soma débitos e créditos; exige equilíbrio exacto.
 *  4. Verifica período/exercício abertos.
 *  5. Cria `LancamentoContabil` com `origem = 'integracao'` e numeração atómica.
 *  6. Valida o lançamento (passa para `validado`).
 *
 * Idempotência: `@@unique([moduloOrigem, tipoOrigem, origemId, origem])` no lançamento.
 * Se a regra/conta não existir → grava `ErroIntegracaoContabil` e devolve `{ pendente: true }`.
 *
 * O motor **não** lança excepção para o módulo de origem; devolve o erro para que
 * o módulo continue o seu ciclo (ex.: emitir fatura) e o erro apareça no ecrã
 * de integração para reprocessamento posterior.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { SequenciaDiarioService, sequenciaDiarioService } from './sequencia-diario.service';
import { BusinessRuleError, NotFoundError, ValidationError } from '../utils/errors';
import {
  CODIGOS_ERRO_MOTOR,
  CodigoErroMotor,
} from '../constants/contabilidade.constants';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

/**
 * Prepara os dados originais para serem guardados no erro de integração.
 * O erro tem de ser reprocessável depois, pelo que `detalhes.dados` recebe uma
 * cópia serializável (datas ISO, sem funções, símbolos, ciclos ou BigInt).
 */
function sanitizarDadosParaErro(dados: DadosMotorContabilizacao): Record<string, unknown> {
  const vistos = new WeakSet<object>();
  const profundidadeMaxima = 8;

  const converter = (valor: unknown, profundidade: number): unknown => {
    if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : String(valor);
    if (typeof valor === 'bigint') return String(valor);
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === 'undefined' || typeof valor === 'function' || typeof valor === 'symbol') {
      return undefined;
    }
    if (profundidade >= profundidadeMaxima) return '[profundidade máxima]';
    if (vistos.has(valor as object)) return '[ciclo]';
    vistos.add(valor as object);

    if (Array.isArray(valor)) {
      return valor
        .map((item) => converter(item, profundidade + 1))
        .filter((item) => item !== undefined);
    }
    const resultado: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      const convertido = converter(item, profundidade + 1);
      if (convertido !== undefined) resultado[chave] = convertido;
    }
    return resultado;
  };

  return (converter(dados, 0) ?? {}) as Record<string, unknown>;
}

export interface DadosMotorContabilizacao {
  /** Total bruto (com IVA). */
  total?: number | string;
  /** Total líquido (sem IVA). */
  net?: number | string;
  /** IVA total. */
  tax?: number | string;
  /** Base tributável. */
  base?: number | string;
  /** Descontos. */
  discount?: number | string;
  /** Valor já pago. */
  paid?: number | string;
  /** IVA por taxa: { "14": 100, "23": 200 }. */
  taxPorTaxa?: Record<string, number | string>;
  /** Data contabilística (ISO string ou Date). */
  dataContabilistica?: string | Date;
  /** Data do documento (ISO string ou Date). */
  dataDocumento?: string | Date;
  /** Descrição base para o lançamento. */
  descricao?: string;
  /** Moeda (default AOA). */
  moeda?: string;
  /** Taxa de câmbio (default 1). */
  taxaCambio?: number | string;
}

export interface ResultadoMotor {
  /** Se `true`, houve erro e foi gravado em `ErroIntegracaoContabil`. */
  pendente: boolean;
  /** ID do lançamento criado (se sucesso). */
  lancamentoId?: string;
  /** Número do lançamento (se sucesso). */
  numero?: number;
  /** Código do erro (se pendente). */
  codigoErro?: CodigoErroMotor;
  /** Mensagem legível. */
  mensagem: string;
}

export class MotorContabilizacaoService {
  private prisma: PrismaClient;
  private sequenciaService: SequenciaDiarioService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    sequenciaService: SequenciaDiarioService = sequenciaDiarioService
  ) {
    this.prisma = prismaClient;
    this.sequenciaService = sequenciaService;
  }

  /**
   * Ponto de entrada principal. Devolve `{ pendente: false, lancamentoId, numero }`
   * em caso de sucesso, ou `{ pendente: true, codigoErro, mensagem }` se
   * a regra/conta não existir. **Nunca lança** para o módulo de origem.
   */
  async gerar(params: {
    empresaId: string;
    moduloOrigem: string;
    tipoOrigem: string;
    origemId: string;
    dados: DadosMotorContabilizacao;
    utilizadorId?: string;
  }): Promise<ResultadoMotor> {
    const { empresaId, moduloOrigem, tipoOrigem, origemId, dados, utilizadorId } = params;

    try {
      // 1. Validar entradas básicas
      if (!empresaId?.trim()) throw new ValidationError('Empresa obrigatória.');
      if (!moduloOrigem?.trim()) throw new ValidationError('Módulo de origem obrigatório.');
      if (!tipoOrigem?.trim()) throw new ValidationError('Tipo de origem obrigatório.');
      if (!origemId?.trim()) throw new ValidationError('ID de origem obrigatório.');

      // 2. Executar tudo numa transação Serializable
      return await this.prisma.$transaction(async (tx) => {
        // 2.1 Verificar se já existe lançamento para esta origem (idempotência)
        const existente = await tx.lancamentoContabil.findFirst({
          where: {
            empresaId,
            moduloOrigem,
            tipoOrigem,
            origemId,
            origem: 'integracao',
          },
          select: { id: true, numero: true },
        });
        if (existente) {
          return {
            pendente: false,
            lancamentoId: existente.id,
            numero: existente.numero ?? undefined,
            mensagem: 'Lançamento já existia (idempotência).',
          };
        }

        // 2.2 Procurar regra ativa
        const regra = await tx.regraContabilizacao.findFirst({
          where: { empresaId, moduloOrigem, tipoOrigem, activa: true },
          include: { linhas: { orderBy: { numeroLinha: 'asc' } } },
        });
        if (!regra) {
          return await this.gravarErro(tx, {
            empresaId,
            moduloOrigem,
            tipoOrigem,
            origemId,
            origem: 'integracao',
            codigoErro: CODIGOS_ERRO_MOTOR.REGRA_NAO_ENCONTRADA,
            mensagem: `Nenhuma regra de contabilização activa para ${moduloOrigem}/${tipoOrigem}.`,
            detalhes: this.detalhesParaErro(dados, { empresaId, moduloOrigem, tipoOrigem }),
          });
        }

        // 2.3 Resolver período e exercício
        const dataContabilistica = dados.dataContabilistica
          ? new Date(dados.dataContabilistica)
          : new Date();
        const periodo = await this.resolverPeriodo(tx, empresaId, dataContabilistica);
        if (periodo.estado !== 'aberto') {
          return await this.gravarErro(tx, {
            empresaId,
            moduloOrigem,
            tipoOrigem,
            origemId,
            origem: 'integracao',
            codigoErro: CODIGOS_ERRO_MOTOR.PERIODO_FECHADO,
            mensagem: `O período ${periodo.numero} está ${periodo.estado}.`,
            detalhes: this.detalhesParaErro(dados, { periodoId: periodo.id, estado: periodo.estado }),
          });
        }
        const exercicio = await tx.exercicioFiscal.findUnique({
          where: { id: periodo.exercicioId },
          select: { id: true, estado: true, ano: true },
        });
        if (!exercicio || exercicio.estado !== 'aberto') {
          return await this.gravarErro(tx, {
            empresaId,
            moduloOrigem,
            tipoOrigem,
            origemId,
            origem: 'integracao',
            codigoErro: CODIGOS_ERRO_MOTOR.EXERCICIO_FECHADO,
            mensagem: `O exercício ${exercicio?.ano ?? 'desconhecido'} está ${exercicio?.estado ?? 'desconhecido'}.`,
            detalhes: this.detalhesParaErro(dados, {
              exercicioId: exercicio?.id,
              estado: exercicio?.estado,
            }),
          });
        }

        // 2.4 Resolver contas e calcular montantes
        const { linhas, totalDebito, totalCredito } = await this.resolverLinhas(
          tx,
          empresaId,
          regra,
          dados
        );

        if (!totalDebito.equals(totalCredito) || totalDebito.isZero()) {
          return await this.gravarErro(tx, {
            empresaId,
            moduloOrigem,
            tipoOrigem,
            origemId,
            origem: 'integracao',
            codigoErro: CODIGOS_ERRO_MOTOR.LANCAMENTO_DESEQUILIBRADO,
            mensagem: `Lançamento gerado desequilibrado: D ${totalDebito.toFixed(4)} ≠ C ${totalCredito.toFixed(4)}.`,
            detalhes: this.detalhesParaErro(dados, {
              totalDebito: totalDebito.toFixed(4),
              totalCredito: totalCredito.toFixed(4),
            }),
          });
        }

        // 2.5 Criar lançamento em rascunho
        const lancamento = await tx.lancamentoContabil.create({
          data: {
            empresaId,
            diarioId: regra.diarioId,
            exercicioId: periodo.exercicioId,
            periodoId: periodo.id,
            dataContabilistica,
            dataDocumento: dados.dataDocumento ? new Date(dados.dataDocumento) : null,
            descricao: dados.descricao?.trim() || `Contabilização ${moduloOrigem}/${tipoOrigem} #${origemId}`,
            origem: 'integracao',
            moduloOrigem,
            tipoOrigem,
            origemId,
            moeda: dados.moeda ?? 'AOA',
            taxaCambio: new Prisma.Decimal(String(dados.taxaCambio ?? 1)),
            totalDebito,
            totalCredito,
            criadoPorId: utilizadorId ?? 'sistema',
            linhas: { create: linhas },
          },
          select: { id: true },
        });

        // 2.6 Validar o lançamento (atribui número, passa a validado)
        const validado = await this.validarLancamentoCriado(
          tx,
          empresaId,
          lancamento.id,
          utilizadorId ?? 'sistema'
        );

        return {
          pendente: false,
          lancamentoId: validado.id,
          numero: validado.numero ?? undefined,
          mensagem: 'Lançamento contabilizado e validado.',
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      // Erro inesperado: gravar erro de integração e devolver pendente
      await this.gravarErroForaTransacao({
        empresaId,
        moduloOrigem,
        tipoOrigem,
        origemId,
        origem: 'integracao',
        codigoErro: CODIGOS_ERRO_MOTOR.DADOS_INSUFICIENTES,
        mensagem: `Erro interno no motor: ${(error as Error).message}`,
        detalhes: this.detalhesParaErro(dados, { stack: (error as Error).stack }),
      });
      return {
        pendente: true,
        codigoErro: CODIGOS_ERRO_MOTOR.DADOS_INSUFICIENTES,
        mensagem: 'Erro interno no motor de contabilização.',
      };
    }
  }

  /**
   * Resolve as linhas da regra: para cada linha, busca a conta via mapeamento,
   * valida se aceita movimento, calcula o valor pela expressão.
   */
  private async resolverLinhas(
    tx: ClientePrisma,
    empresaId: string,
    regra: { linhas: { id: string; numeroLinha: number; lado: string; chaveConta: string; expressaoValor: string; taxaImposto: string | null }[] },
    dados: DadosMotorContabilizacao
  ): Promise<{
    linhas: { numeroLinha: number; contaId: string; debito: Prisma.Decimal; credito: Prisma.Decimal; descricao: string }[];
    totalDebito: Prisma.Decimal;
    totalCredito: Prisma.Decimal;
  }> {
    const linhas: { numeroLinha: number; contaId: string; debito: Prisma.Decimal; credito: Prisma.Decimal; descricao: string }[] = [];
    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);

    for (const linhaRegra of regra.linhas) {
      // 1. Resolver conta via mapeamento
      const mapeamento = await tx.mapeamentoConta.findFirst({
        where: { empresaId, chave: linhaRegra.chaveConta },
        select: { contaId: true },
      });
      if (!mapeamento) {
        throw new BusinessRuleError(
          `Chave de conta "${linhaRegra.chaveConta}" não mapeada para a empresa.`
        );
      }

      const conta = await tx.contaContabil.findUnique({
        where: { id: mapeamento.contaId },
        select: {
          id: true,
          empresaId: true,
          codigo: true,
          aceitaMovimento: true,
          exigeCentroCusto: true,
          exigeEntidade: true,
        },
      });
      if (!conta) {
        throw new BusinessRuleError(
          `Conta mapeada pela chave "${linhaRegra.chaveConta}" não existe.`
        );
      }
      if (conta.empresaId !== empresaId) {
        throw new BusinessRuleError(
          `A conta ${conta.codigo} (chave "${linhaRegra.chaveConta}") pertence a outra empresa.`
        );
      }
      if (!conta.aceitaMovimento) {
        throw new BusinessRuleError(
          `A conta ${conta.codigo} (chave "${linhaRegra.chaveConta}") não aceita movimento.`
        );
      }

      // 2. Calcular valor pela expressão
      const valor = this.calcularValor(linhaRegra.expressaoValor, linhaRegra.taxaImposto, dados);
      if (valor.isZero()) continue; // linhas com valor zero não entram no lançamento

      // 3. Atribuir ao lado correcto
      const debito = linhaRegra.lado === 'debito' ? valor : new Prisma.Decimal(0);
      const credito = linhaRegra.lado === 'credito' ? valor : new Prisma.Decimal(0);

      totalDebito = totalDebito.plus(debito);
      totalCredito = totalCredito.plus(credito);

      linhas.push({
        numeroLinha: linhaRegra.numeroLinha,
        contaId: conta.id,
        debito,
        credito,
        descricao: `Linha ${linhaRegra.numeroLinha} (${linhaRegra.chaveConta})`,
      });
    }

    return { linhas, totalDebito, totalCredito };
  }

  /**
   * Calcula o valor de uma expressão.
   * Expressões suportadas: TOTAL, NET, TAX, TAX:<taxa>, BASE, DISCOUNT, PAID, OUTSTANDING.
   */
  private calcularValor(
    expressao: string,
    _taxaImposto: string | null,
    dados: DadosMotorContabilizacao
  ): Prisma.Decimal {
    // Expressão com taxa explícita: TAX:<taxa>
    if (expressao.startsWith('TAX:')) {
      const taxa = Number(expressao.split(':')[1]);
      const taxPorTaxa = dados.taxPorTaxa ?? {};
      const valor = taxPorTaxa[String(taxa)];
      return new Prisma.Decimal(valor !== undefined ? String(valor) : '0');
    }

    switch (expressao) {
      case 'TOTAL':
        return new Prisma.Decimal(dados.total ?? '0');
      case 'NET':
        return new Prisma.Decimal(dados.net ?? '0');
      case 'TAX':
        return new Prisma.Decimal(dados.tax ?? '0');
      case 'BASE':
        return new Prisma.Decimal(dados.base ?? '0');
      case 'DISCOUNT':
        return new Prisma.Decimal(dados.discount ?? '0');
      case 'PAID':
        return new Prisma.Decimal(dados.paid ?? '0');
      case 'OUTSTANDING': {
        const net = new Prisma.Decimal(dados.net ?? '0');
        const paid = new Prisma.Decimal(dados.paid ?? '0');
        return net.minus(paid);
      }
      default:
        throw new BusinessRuleError(`Expressão de valor desconhecida: "${expressao}".`);
    }
  }

  /**
   * Resolve o período contabilístico para uma data.
   */
  private async resolverPeriodo(
    tx: ClientePrisma,
    empresaId: string,
    data: Date
  ): Promise<{ id: string; exercicioId: string; estado: string; numero: number }> {
    const periodo = await tx.periodoContabil.findFirst({
      where: {
        dataInicio: { lte: data },
        dataFim: { gte: data },
        exercicio: { empresaId },
      },
      select: { id: true, exercicioId: true, estado: true, numero: true },
      orderBy: { dataInicio: 'desc' },
    });
    if (!periodo) {
      throw new BusinessRuleError('Não existe período contabilístico para a data indicada.');
    }
    return periodo;
  }

  /**
   * Valida o lançamento criado (atribui número, passa a validado).
   * Reutiliza a lógica do `LancamentoContabilService` mas dentro da mesma transação.
   */
  private async validarLancamentoCriado(
    tx: ClientePrisma,
    empresaId: string,
    lancamentoId: string,
    utilizadorId: string
  ): Promise<{ id: string; numero?: number | null }> {
    const lancamento = await tx.lancamentoContabil.findUnique({
      where: { id: lancamentoId },
      include: {
        linhas: { include: { conta: true } },
        periodo: true,
        exercicio: true,
        diario: true,
      },
    });
    if (!lancamento) throw new NotFoundError('Lançamento não encontrado após criação.');
    if (lancamento.empresaId !== empresaId) {
      throw new BusinessRuleError('O lançamento criado pertence a outra empresa.');
    }

    if (lancamento.periodo.estado !== 'aberto' || lancamento.exercicio.estado !== 'aberto') {
      throw new BusinessRuleError('Período ou exercício não aberto no momento da validação.');
    }
    if (lancamento.linhas.length < 2) {
      throw new BusinessRuleError('O lançamento deve ter pelo menos duas linhas.');
    }

    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    for (const linha of lancamento.linhas) {
      if (
        linha.conta.empresaId !== empresaId ||
        linha.conta.empresaId !== lancamento.empresaId
      ) {
        throw new BusinessRuleError(
          `A conta ${linha.conta.codigo} do lançamento pertence a outra empresa.`
        );
      }
      if (!linha.conta.activa || !linha.conta.aceitaMovimento) {
        throw new BusinessRuleError(`Conta ${linha.conta.codigo} não aceita movimento.`);
      }
      totalDebito = totalDebito.plus(linha.debito);
      totalCredito = totalCredito.plus(linha.credito);
    }
    if (!totalDebito.equals(totalCredito) || totalDebito.isZero()) {
      throw new BusinessRuleError('Lançamento desequilibrado ou valor zero.');
    }

    const numero = await this.sequenciaService.proximoNumero(
      lancamento.diarioId,
      lancamento.exercicioId,
      tx
    );

    const validado = await tx.lancamentoContabil.update({
      where: { id: lancamentoId },
      data: {
        numero,
        estado: 'validado',
        validadoPorId: utilizadorId,
        validadoEm: new Date(),
        totalDebito,
        totalCredito,
      },
      select: { id: true, numero: true },
    });

    await tx.auditLog.create({
      data: {
        empresaId: lancamento.empresaId,
        utilizadorId,
        acao: 'validar',
        severidade: 'info',
        entidade: 'LancamentoContabil',
        entidadeId: lancamentoId,
        modulo: 'contabilidade',
        descricao: `Lançamento automático ${numero} validado (integração ${lancamento.moduloOrigem}/${lancamento.tipoOrigem}).`,
        dadosNovos: JSON.stringify({ estado: 'validado', numero, origem: 'integracao' }),
      },
    });

    return validado;
  }

  /**
   * Junta aos detalhes do erro os dados originais do documento, para que a
   * pendência possa ser reprocessada depois de corrigida a regra/mapeamento.
   */
  private detalhesParaErro(
    dados: DadosMotorContabilizacao,
    detalhes?: Record<string, unknown>
  ): Record<string, unknown> {
    return { ...(detalhes ?? {}), dados: sanitizarDadosParaErro(dados) };
  }

  /**
   * Grava um erro de integração dentro de uma transação.
   * O `await` é obrigatório: sem ele a linha podia nunca chegar à base e a
   * pendência ficaria perdida quando a transação terminasse.
   */
  private async gravarErro(
    tx: ClientePrisma,
    erro: {
      empresaId: string;
      moduloOrigem: string;
      tipoOrigem: string;
      origemId: string;
      origem: 'integracao';
      codigoErro: CodigoErroMotor;
      mensagem: string;
      detalhes?: Record<string, unknown>;
    }
  ): Promise<ResultadoMotor> {
    await tx.erroIntegracaoContabil.create({
      data: {
        empresaId: erro.empresaId,
        moduloOrigem: erro.moduloOrigem,
        tipoOrigem: erro.tipoOrigem,
        origemId: erro.origemId,
        origem: erro.origem,
        codigoErro: erro.codigoErro,
        mensagem: erro.mensagem,
        detalhes: erro.detalhes ? JSON.stringify(erro.detalhes) : null,
      },
    });
    return {
      pendente: true,
      codigoErro: erro.codigoErro,
      mensagem: erro.mensagem,
    };
  }

  /**
   * Grava um erro de integração fora de transação (fallback).
   */
  private async gravarErroForaTransacao(erro: {
    empresaId: string;
    moduloOrigem: string;
    tipoOrigem: string;
    origemId: string;
    origem: 'integracao';
    codigoErro: CodigoErroMotor;
    mensagem: string;
    detalhes?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.erroIntegracaoContabil.create({
        data: {
          empresaId: erro.empresaId,
          moduloOrigem: erro.moduloOrigem,
          tipoOrigem: erro.tipoOrigem,
          origemId: erro.origemId,
          origem: erro.origem,
          codigoErro: erro.codigoErro,
          mensagem: erro.mensagem,
          detalhes: erro.detalhes ? JSON.stringify(erro.detalhes) : null,
        },
      });
    } catch {
      // Se falhar a gravar o erro, nada a fazer — o erro original já foi tratado
    }
  }
}

export const motorContabilizacaoService = new MotorContabilizacaoService();