/**
 * @file rh-financas-gateway.ts
 * @description Porta de integração do módulo RH com Finanças/Contabilidade.
 *
 * A implementação activa usa os serviços reais (`LancamentoContabilService` e
 * `TesourariaService`). As chamadas são best-effort: os serviços de RH capturam
 * qualquer erro e continuam. `FinancasIndisponivelError` (`RH_FINANCAS_INDISPONIVEL`)
 * fica reservado para indisponibilidade real de configuração (ex.: não existe
 * diário activo); falhas de mapeamento ou de validação são erros normais.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  LancamentoContabilService,
  lancamentoContabilService,
} from './lancamento-contabil.service';
import { TesourariaService, tesourariaService } from './tesouraria.service';
import { isChaveConta, type ChaveConta } from '../constants/contabilidade.constants';
import { ValidationError } from '../utils/errors';
import { FinancasIndisponivelError, RH_ERROR_CODES } from '../utils/rh-errors';

export type OrigemLancamentoRh =
  | 'RH_PROCESSAMENTO'
  | 'RH_PAGAMENTO'
  | 'RH_HONORARIO'
  | 'RH_ESTORNO';

export interface LinhaLancamentoContabil {
  /** Código PGC, chave simbólica ou alias RH da conta contabilística. */
  conta: string;
  descricao: string;
  debito?: string | number;
  credito?: string | number;
}

export interface CriarLancamentoContabilParams {
  empresaId: string;
  data: Date;
  descricao: string;
  origemTipo: OrigemLancamentoRh;
  origemId: string;
  linhas: LinhaLancamentoContabil[];
  /** Utilizador que autoriza o lançamento (quando disponível na origem). */
  utilizadorId?: string;
}

export type TipoMovimentoTesouraria = 'entrada' | 'saida';

export interface CriarMovimentoTesourariaParams {
  empresaId: string;
  data: Date;
  tipo: TipoMovimentoTesouraria;
  contaBancariaId: string;
  valor: string | number;
  descricao: string;
  origemTipo: OrigemLancamentoRh;
  origemId: string;
  utilizadorId?: string;
}

export interface FinancasGateway {
  /** Cria e valida um lançamento contabilístico e devolve o seu id. */
  criarLancamentoContabil(params: CriarLancamentoContabilParams): Promise<{ id: string }>;
  /** Estorna um lançamento contabilístico previamente criado. */
  estornarLancamento(lancamentoId: string, motivo: string, utilizadorId?: string): Promise<void>;
  /** Cria um movimento de tesouraria ligado a uma conta bancária. */
  criarMovimentoTesouraria(params: CriarMovimentoTesourariaParams): Promise<{ id: string }>;
  /** Estorna um movimento de tesouraria previamente criado. */
  estornarMovimento(movimentoId: string, motivo: string, utilizadorId?: string): Promise<void>;
}

/** Aliases históricos usados pelo RH antes de existir o plano de contas. */
const ALIASES_RH: Record<string, ChaveConta> = {
  RH_DESPESA_REMUNERACOES: 'PAYROLL_EXPENSE',
  RH_ENCARGOS_PATRONAIS: 'PAYROLL_EXPENSE',
  RH_DESCONTOS: 'WITHHOLDING_PAYABLE',
  RH_LIQUIDO_PAGAR: 'PAYROLL_PAYABLE',
};

/** Códigos PGC por defeito (usados apenas se a empresa não tiver mapeamento). */
const CODIGOS_PADRAO_RH: Partial<Record<ChaveConta, string>> = {
  PAYROLL_EXPENSE: '731',
  PAYROLL_PAYABLE: '331',
  SOCIAL_SECURITY_PAYABLE: '344',
  WITHHOLDING_PAYABLE: '341',
};

type ClienteBanco = Pick<PrismaClient, 'mapeamentoConta' | 'contaContabil' | 'diarioContabil' | 'movimentoTesouraria'>;

export class RhFinancasGateway implements FinancasGateway {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly lancamentos: LancamentoContabilService = lancamentoContabilService,
    private readonly tesouraria: TesourariaService = tesourariaService
  ) {}

  async criarLancamentoContabil(
    params: CriarLancamentoContabilParams
  ): Promise<{ id: string }> {
    const utilisadorId = params.utilizadorId?.trim() || 'sistema';
    const diarioId = await this.resolverDiario(params.empresaId);

    const linhas = await Promise.all(
      params.linhas.map(async (linha, indice) => {
        const contaId = await this.resolverConta(params.empresaId, linha.conta);
        return {
          contaId,
          descricao: (linha.descricao || `Linha ${indice + 1}`).trim().slice(0, 200),
          debito: this.normalizarValor(linha.debito),
          credito: this.normalizarValor(linha.credito),
        };
      })
    );

    let lancamentoId: string | undefined;
    try {
      const rascunho = await this.lancamentos.criar(
        {
          empresaId: params.empresaId,
          diarioId,
          dataContabilistica: params.data,
          descricao: params.descricao.trim().slice(0, 200),
          origem: 'integracao',
          moduloOrigem: 'rh',
          tipoOrigem: params.origemTipo.toLowerCase(),
          origemId: params.origemId,
          linhas,
        },
        utilisadorId
      );
      lancamentoId = rascunho.id;
      await this.lancamentos.validar(rascunho.id, utilisadorId);
      return { id: rascunho.id };
    } catch (erro) {
      // Se a validação falhar, não deixar um rascunho órfão na contabilidade.
      if (lancamentoId) {
        try {
          await this.lancamentos.remover(lancamentoId);
        } catch {
          // O rascunho já não existe ou não pode ser removido; o erro original é
          // o que interessa ao chamador.
        }
      }
      throw erro;
    }
  }

  async estornarLancamento(
    lancamentoId: string,
    motivo: string,
    utilizadorId?: string
  ): Promise<void> {
    await this.lancamentos.estornar(lancamentoId, {
      dataContabilistica: new Date(),
      descricao: `Estorno RH: ${motivo}`.slice(0, 200),
      utilizadorId: utilizadorId?.trim() || 'sistema',
    });
  }

  async criarMovimentoTesouraria(
    params: CriarMovimentoTesourariaParams
  ): Promise<{ id: string }> {
    if (!params.contaBancariaId?.trim()) {
      throw new ValidationError('Conta bancária é obrigatória para criar movimento de tesouraria do RH.');
    }

    const movimento = await this.tesouraria.criar({
      empresaId: params.empresaId,
      data: params.data,
      tipo: params.tipo,
      contaOrigemId: params.tipo === 'saida' ? params.contaBancariaId : undefined,
      contaDestinoId: params.tipo === 'entrada' ? params.contaBancariaId : undefined,
      valor: params.valor,
      descricao: params.descricao,
      entidadeTipo: 'funcionario',
      entidadeId: params.origemId,
    });

    // O TesourariaService cria o movimento como 'manual'. Ligamos o documento
    // de origem para permitir localizar o movimento no estorno do pagamento.
    await (this.prisma as ClienteBanco).movimentoTesouraria.update({
      where: { id: movimento.id },
      data: {
        documentoTipo: 'manual',
        documentoId: params.origemId,
        documentoNumero: params.origemTipo,
      },
    });

    return { id: movimento.id };
  }

  async estornarMovimento(
    movimentoId: string,
    motivo: string,
    utilizadorId?: string
  ): Promise<void> {
    await this.tesouraria.estornar(movimentoId, {
      motivo,
      utilizadorId: utilizadorId?.trim() || undefined,
    });
  }

  private async resolverDiario(empresaId: string): Promise<string> {
    const filtros = [
      { empresaId, activo: true, tipo: 'salarios' as const },
      { empresaId, activo: true, codigo: 'OD' },
      { empresaId, activo: true },
    ];

    for (const where of filtros) {
      const diario = await (this.prisma as ClienteBanco).diarioContabil.findFirst({
        where,
        select: { id: true },
      });
      if (diario) return diario.id;
    }

    throw new FinancasIndisponivelError(
      'Não existe diário contabilístico activo para processamentos de salários.',
      {
        operacao: 'criarLancamentoContabil',
        codigo: RH_ERROR_CODES.FINANCAS_INDISPONIVEL,
        empresaId,
      }
    );
  }

  private candidatosConta(codigo: string): string[] {
    const base = codigo.trim();
    const chave = isChaveConta(base) ? base : ALIASES_RH[base];
    const codigoPadrao = chave ? CODIGOS_PADRAO_RH[chave] : undefined;
    return Array.from(new Set([base, chave, codigoPadrao].filter((v): v is string => Boolean(v))));
  }

  private async resolverConta(empresaId: string, codigo: string): Promise<string> {
    const candidatos = this.candidatosConta(codigo);
    const problemas: string[] = [];

    for (const candidato of candidatos) {
      const mapeado = await (this.prisma as ClienteBanco).mapeamentoConta.findFirst({
        where: { empresaId, chave: candidato },
        select: { conta: { select: { id: true, activa: true, aceitaMovimento: true } } },
      });
      if (mapeado?.conta) {
        if (mapeado.conta.activa && mapeado.conta.aceitaMovimento) return mapeado.conta.id;
        problemas.push(`a conta mapeada para '${candidato}' não aceita movimento`);
      }
    }

    for (const candidato of candidatos) {
      const conta = await (this.prisma as ClienteBanco).contaContabil.findFirst({
        where: { empresaId, codigo: candidato },
        select: { id: true, activa: true, aceitaMovimento: true },
      });
      if (conta) {
        if (conta.activa && conta.aceitaMovimento) return conta.id;
        problemas.push(`a conta '${candidato}' não aceita movimento`);
      }
    }

    throw new ValidationError(
      `Conta contabilística '${codigo}' não resolvida para a empresa. ${problemas.join('; ')}`.trim(),
      { empresaId, codigo, candidatos, problemas }
    );
  }

  private normalizarValor(valor: string | number | undefined): string {
    if (valor === undefined || valor === null || valor === '') return '0';
    const texto = String(valor).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,4})?$/.test(texto)) {
      throw new ValidationError(`Valor monetário inválido no lançamento RH: '${String(valor)}'.`);
    }
    return texto;
  }
}

/** Instância por defeito usada pelos serviços de RH. */
export const financasGateway: FinancasGateway = new RhFinancasGateway();
