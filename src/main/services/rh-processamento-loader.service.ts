/**
 * @file rh-processamento-loader.service.ts
 * @description Loader de dados para processamento de salários (RH-403).
 *
 * Carrega em bloco (sem N+1) todos os dados necessários para o motor de cálculo:
 * - Funcionários elegíveis (via RH-313)
 * - Contratos activos
 * - Rubricas recorrentes por funcionário
 * - Alterações mensais pendentes
 * - Ausências até data limite
 * - Horas extra até data limite
 * - Dívidas/penhoras com prestações do mês
 * - Férias (direito, gozados, não gozados)
 * - Configuração (INSS, IRT, subsídios, baseDiasMes, limitePenhora)
 * - Tabela de IRT vigente
 * - Período (aberto/fechado)
 *
 * Regras:
 * - Isolamento por empresa (ADR-009)
 * - Queries em bloco (constante em relação ao nº de funcionários)
 * - Retorna estrutura tipada pronta para o motor de cálculo
 */

import type {
  PrismaClient,
  RhFuncionario,
  RhContrato,
  RhRubrica,
  RhFuncionarioRubrica,
  RhAlteracaoMensal,
  RhAusencia,
  RhTipoAusencia,
  RhHoraExtra,
  RhPrestacaoDivida,
  RhRetroativo,
  RhPeriodo,
  RhConfiguracao,
  RhTabelaIRT,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { avaliarElegibilidade, type FiltroElegibilidade, type ResultadoElegibilidade } from '../services/rh/calculo/regras/elegibilidade';
import { RhBusinessRuleError, RhNotFoundError } from '../utils/rh-errors';

export interface LoaderInput {
  empresaId: string | null;
  ano: number;
  mes: number;
  periodoCodigo: string; // P01..P12
  funcionarioIds?: string[]; // se vazio, processa todos elegíveis
  incluirFimContrato?: boolean;
  dataLimiteFaltasHE: string | Date; // data limite para faltas/HE
  dataProcessamento: string | Date;
  tipoProcessamento?: string; // VENCIMENTO, FIM_CONTRATO, etc.
}

export interface FuncionarioDados {
  funcionario: RhFuncionario & {
    contratos: (RhContrato & { alteracoesSalariais: any[] })[];
    rubricasFixas: (RhFuncionarioRubrica & { rubrica: RhRubrica })[];
    dependentes: any[];
  };
  contrato: RhContrato & { alteracoesSalariais: any[] } | null;
  elegibilidade: { podeProcessar: boolean; restricoes: string[] };
}

export interface DadosProcessamento {
  funcionarios: FuncionarioDados[];
  alteracoesMensais: Map<string, (RhAlteracaoMensal & { rubrica: RhRubrica })[]>;
  ausencias: Map<string, (RhAusencia & { tipo: RhTipoAusencia })[]>;
  horasExtra: Map<string, RhHoraExtra[]>;
  dividas: Map<string, RhPrestacaoDivida[]>;
  ferias: Map<string, { diasDireito: number; diasGozadosOuMarcados: number; diasNaoGozados: number }>;
  retroactivos: Map<string, RhRetroativo[]>;
  configuracao: RhConfiguracao;
  tabelaIrt: RhTabelaIRT | null;
  periodo: RhPeriodo | null;
  elegibilidade: ResultadoElegibilidade;
  dataLimiteFaltasHE: Date;
  dataProcessamento: Date;
  baseDiasMes: number;
}

export class RhProcessamentoLoaderService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
  ) {}

  /**
   * Carrega todos os dados necessários para o processamento.
   * Queries em bloco: O(1) queries independentemente do nº de funcionários.
   */
  async carregar(input: LoaderInput): Promise<DadosProcessamento> {
    const empresaId = this.exigirEmpresa(input.empresaId);
    const dataLimiteFaltasHE = new Date(input.dataLimiteFaltasHE);
    const dataProcessamento = new Date(input.dataProcessamento);
    const tipoProcessamento = input.tipoProcessamento ?? 'VENCIMENTO';

    // 1. Período
    const periodo = await this.prisma.rhPeriodo.findFirst({
      where: { empresaId, codigo: input.periodoCodigo, ano: input.ano },
    });
    if (!periodo) throw new RhNotFoundError(`Período ${input.periodoCodigo}/${input.ano} não encontrado.`);
    const estadosBloqueados = ['FECHADO', 'PROCESSADO', 'ANULADO'];
    if (estadosBloqueados.includes(periodo.estado)) {
      throw new RhBusinessRuleError(`Período ${periodo.estado.toLowerCase()} — não permite processar.`);
    }

    // 2. Configuração + Tabela IRT
    const [configuracao, tabelaIrt] = await Promise.all([
      this.carregarConfiguracao(empresaId),
      this.carregarTabelaIrtVigente(empresaId, dataProcessamento),
    ]);

    // 3. Funcionários base (filtro por empresa + ids opcionais)
    const funcionariosBase = await this.carregarFuncionariosBase(empresaId, input.funcionarioIds);
    if (funcionariosBase.length === 0) {
      throw new RhBusinessRuleError('Nenhum funcionário encontrado para processar.');
    }

    // 4. Elegibilidade (RH-313)
    const filtroEleg: FiltroElegibilidade = {
      ano: input.ano,
      mes: input.mes,
      tipoProcessamento,
      incluirFimContrato: input.incluirFimContrato ?? false,
    };
    const elegibilidade = avaliarElegibilidade(
      funcionariosBase.map((f) => ({
        id: f.id,
        ativo: f.estado === 'ATIVO',
        suspenso: f.estado === 'SUSPENSO',
        temContratoAtivo: f.contratos.some((c) => c.estado === 'ATIVO'),
        temIban: !!f.iban,
        dataCessacao: f.dataCessacao ? new Date(f.dataCessacao) : null,
        jaProcessado: false,
        periodoFechado: periodo.estado !== 'ABERTO',
      })),
      filtroEleg,
    );

    // 5. Filtrar apenas elegíveis
    const funcionariosElegiveis = funcionariosBase.filter((f) =>
      elegibilidade.elegiveis.includes(f.id),
    );

    // 6. Carregar dados em bloco para funcionários elegíveis
    const funcionarioIds = funcionariosElegiveis.map((f) => f.id);

    const [
      alteracoesMensais,
      ausencias,
      horasExtra,
      dividasPrestacoes,
      feriasInfo,
      retroactivos,
    ] = await Promise.all([
      this.carregarAlteracoesMensais(empresaId, funcionarioIds, input.ano, input.mes),
      this.carregarAusencias(empresaId, funcionarioIds, periodo.dataInicio, dataLimiteFaltasHE),
      this.carregarHorasExtra(empresaId, funcionarioIds, dataLimiteFaltasHE),
      this.carregarDividasPrestacoes(empresaId, funcionarioIds, input.ano, input.mes),
      this.carregarFeriasInfo(empresaId, funcionarioIds, input.ano),
      this.carregarRetroactivos(empresaId, funcionarioIds, input.ano, input.mes),
    ]);

    // 7. Montar resultado
    return {
      funcionarios: funcionariosElegiveis.map((f) => {
        const contratoAtivo = f.contratos.find((c) => c.estado === 'ATIVO') ?? f.contratos[0] ?? null;
        return {
          funcionario: f,
          contrato: contratoAtivo,
          elegibilidade: { podeProcessar: true, restricoes: [] },
        };
      }),
      alteracoesMensais,
      ausencias,
      horasExtra,
      dividas: dividasPrestacoes,
      ferias: feriasInfo,
      retroactivos,
      configuracao,
      tabelaIrt,
      periodo,
      elegibilidade,
      dataLimiteFaltasHE,
      dataProcessamento,
      baseDiasMes: configuracao.baseDiasMes ?? 30,
    };
  }

  private async carregarConfiguracao(empresaId: string): Promise<any> {
    let cfg = await this.prisma.rhConfiguracao.findUnique({ where: { empresaId } });
    if (!cfg) {
      cfg = await this.prisma.rhConfiguracao.create({ data: { empresaId } });
    }
    return cfg;
  }

  private async carregarTabelaIrtVigente(empresaId: string, data: Date): Promise<any> {
    return this.prisma.rhTabelaIRT.findFirst({
      where: {
        empresaId,
        ativo: true,
        vigenteDesde: { lte: data },
        OR: [{ vigenteAte: null }, { vigenteAte: { gte: data } }],
      },
      include: { escaloes: { orderBy: { ordem: 'asc' } } },
    });
  }

  private async carregarFuncionariosBase(
    empresaId: string,
    funcionarioIds?: string[],
  ): Promise<any[]> {
    const where: any = {
      empresaId,
      ...(funcionarioIds?.length ? { id: { in: funcionarioIds } } : {}),
      estado: { in: ['ATIVO', 'SUSPENSO', 'CESSADO'] },
    };

    return this.prisma.rhFuncionario.findMany({
      where,
      include: {
        contratos: {
          include: { alteracoesSalariais: { orderBy: { dataEfeito: 'asc' } } },
          orderBy: { dataInicio: 'desc' },
        },
        rubricasFixas: {
          where: { ativo: true, dataInicio: { lte: new Date() }, OR: [{ dataFim: null }, { dataFim: { gte: new Date() } }] },
          include: { rubrica: true },
        },
        dependentes: true,
      },
      orderBy: { codigo: 'asc' },
    });
  }

  private async carregarAlteracoesMensais(
    empresaId: string,
    funcionarioIds: string[],
    ano: number,
    mes: number,
  ): Promise<Map<string, any[]>> {
    const alteracoes = await this.prisma.rhAlteracaoMensal.findMany({
      where: {
        funcionario: { empresaId },
        funcionarioId: { in: funcionarioIds },
        ano,
        mes,
        estado: 'PENDENTE',
      },
      include: { rubrica: true },
      orderBy: { createdAt: 'asc' },
    });

    const mapa = new Map<string, any[]>();
    for (const a of alteracoes) {
      if (!mapa.has(a.funcionarioId)) mapa.set(a.funcionarioId, []);
      mapa.get(a.funcionarioId)!.push(a);
    }
    return mapa;
  }

  private async carregarAusencias(
    empresaId: string,
    funcionarioIds: string[],
    dataInicioJanela: Date,
    dataLimite: Date,
  ): Promise<Map<string, any[]>> {
    const ausencias = await this.prisma.rhAusencia.findMany({
      where: {
        funcionario: { empresaId },
        funcionarioId: { in: funcionarioIds },
        // `RhAusencia.dataFim` é obrigatório no modelo: escolhem-se as
        // ausências que sobrepõem a janela [início do período, data limite].
        dataInicio: { lte: dataLimite },
        dataFim: { gte: dataInicioJanela },
        estado: 'APROVADO',
      },
      include: { tipo: true },
      orderBy: { dataInicio: 'asc' },
    });

    const mapa = new Map<string, any[]>();
    for (const a of ausencias) {
      if (!mapa.has(a.funcionarioId)) mapa.set(a.funcionarioId, []);
      mapa.get(a.funcionarioId)!.push(a);
    }
    return mapa;
  }

  private async carregarHorasExtra(
    empresaId: string,
    funcionarioIds: string[],
    dataLimite: Date,
  ): Promise<Map<string, any[]>> {
    const he = await this.prisma.rhHoraExtra.findMany({
      where: {
        funcionario: { empresaId },
        funcionarioId: { in: funcionarioIds },
        data: { lte: dataLimite },
        estado: 'APROVADO',
      },
      orderBy: { data: 'asc' },
    });

    const mapa = new Map<string, any[]>();
    for (const h of he) {
      if (!mapa.has(h.funcionarioId)) mapa.set(h.funcionarioId, []);
      mapa.get(h.funcionarioId)!.push(h);
    }
    return mapa;
  }

  private async carregarDividasPrestacoes(
    empresaId: string,
    funcionarioIds: string[],
    ano: number,
    mes: number,
  ): Promise<Map<string, any[]>> {
    const prestacoes = await this.prisma.rhPrestacaoDivida.findMany({
      where: {
        processo: { funcionario: { empresaId }, funcionarioId: { in: funcionarioIds } },
        ano,
        mes,
        estado: 'PENDENTE',
      },
      include: { processo: true },
      orderBy: { numero: 'asc' },
    });

    const mapa = new Map<string, any[]>();
    for (const p of prestacoes) {
      const funcId = p.processo.funcionarioId;
      if (!mapa.has(funcId)) mapa.set(funcId, []);
      mapa.get(funcId)!.push(p);
    }
    return mapa;
  }

  private async carregarFeriasInfo(
    empresaId: string,
    funcionarioIds: string[],
    ano: number,
  ): Promise<Map<string, { diasDireito: number; diasGozadosOuMarcados: number; diasNaoGozados: number }>> {
    const [saldos, marcacoes] = await Promise.all([
      this.prisma.rhFeriasSaldo.findMany({
        where: { funcionario: { empresaId }, funcionarioId: { in: funcionarioIds }, ano },
      }),
      this.prisma.rhMarcacaoFerias.findMany({
        where: {
          funcionario: { empresaId },
          funcionarioId: { in: funcionarioIds },
          ano,
estado: 'APROVADA',
        },
      }),
    ]);

    const mapaSaldos = new Map(saldos.map((s) => [s.funcionarioId, s]));
    const marcacoesPorFunc = new Map<string, any[]>();
    for (const m of marcacoes) {
      if (!marcacoesPorFunc.has(m.funcionarioId)) marcacoesPorFunc.set(m.funcionarioId, []);
      marcacoesPorFunc.get(m.funcionarioId)!.push(m);
    }

    const mapa = new Map<string, { diasDireito: number; diasGozadosOuMarcados: number; diasNaoGozados: number }>();

    for (const id of funcionarioIds) {
      const saldo = mapaSaldos.get(id);
      const funcMarcacoes = marcacoesPorFunc.get(id) ?? [];
      const diasMarcados = funcMarcacoes.reduce((acc, m) => acc + Number(m.dias), 0);
      const diasDireito = saldo ? Number(saldo.diasDireito) + Number(saldo.diasTransitados) : 22;
      const diasGozados = Number(saldo?.diasGozados ?? 0) + diasMarcados;

      mapa.set(id, {
        diasDireito,
        diasGozadosOuMarcados: diasGozados,
        diasNaoGozados: Math.max(0, diasDireito - diasGozados),
      });
    }
    return mapa;
  }

  private async carregarRetroactivos(
    empresaId: string,
    funcionarioIds: string[],
    ano: number,
    mes: number,
  ): Promise<Map<string, RhRetroativo[]>> {
    const retroactivos = await this.prisma.rhRetroativo.findMany({
      where: {
        funcionario: { empresaId },
        funcionarioId: { in: funcionarioIds },
        anoAplicacao: ano,
        mesAplicacao: mes,
        estado: { in: ['PENDENTE', 'APLICADO'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const mapa = new Map<string, RhRetroativo[]>();
    for (const r of retroactivos) {
      if (!mapa.has(r.funcionarioId)) mapa.set(r.funcionarioId, []);
      mapa.get(r.funcionarioId)!.push(r);
    }
    return mapa;
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) throw new RhBusinessRuleError('Empresa não identificada na sessão.');
    return empresaId;
  }
}

export const rhProcessamentoLoaderService = new RhProcessamentoLoaderService();