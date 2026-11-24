/**
 * @file rh-importacao.service.ts
 * @description Importação CSV de funcionários e contratos (RH-208).
 *
 * O fluxo tem duas fases com o mesmo pipeline de análise:
 *
 * 1. `previsualizar` — lê o ficheiro, valida cada linha (Zod + referências) e
 *    devolve o relatório para o ecrã, sem escrever nada;
 * 2. `importar` — revalida e grava **todas as linhas válidas numa única
 *    transacção** (ou nenhuma, quando `ignorarInvalidas` é falso e há erros).
 *
 * As colunas de departamento/cargo/funcionário são referenciadas por **código**
 * (legível por humanos), não por cuid. Os códigos de funcionário são gerados
 * pela mesma sequência do formulário (`proximoCodigoFuncionario`), para que a
 * importação nunca colida com a criação manual nem duplique códigos.
 *
 * Isolamento por empresa (ADR-009) e auditoria agregada por importação.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import { proximoCodigoFuncionario, paraCriarFuncionario } from './rh-funcionario.service';
import {
  parseCsv,
  normalizarChave,
  normalizarEnum,
  parseNumero,
  parseData,
} from '../utils/rh-csv';
import {
  criarRhFuncionarioSchema,
  criarRhContratoSchema,
  maxLinhasImportacao,
  type RhTipoImportacaoInput,
  type CriarRhFuncionarioInput,
  type CriarRhContratoInput,
} from '../validators/rh.validator';
import { RhBusinessRuleError, RhValidationError } from '../utils/rh-errors';

// ── Modelo das colunas ───────────────────────────────────────────────────────

interface ColunaDef {
  chave: string;
  rotulo: string;
  aliases?: string[];
}

const COLUNAS_FUNCIONARIOS: ColunaDef[] = [
  { chave: 'nome', rotulo: 'Nome', aliases: ['nome completo'] },
  { chave: 'dataAdmissao', rotulo: 'Data de admissão', aliases: ['admissao', 'data admissao'] },
  { chave: 'documentoNumero', rotulo: 'Nº documento (BI)', aliases: ['documento', 'bi', 'n doc'] },
  { chave: 'nif', rotulo: 'NIF', aliases: ['n de contribuinte'] },
  { chave: 'niss', rotulo: 'NISS', aliases: ['numero inss'] },
  { chave: 'dataNascimento', rotulo: 'Data de nascimento', aliases: ['nascimento', 'data nasc'] },
  { chave: 'genero', rotulo: 'Género' },
  { chave: 'estadoCivil', rotulo: 'Estado civil' },
  { chave: 'nacionalidade', rotulo: 'Nacionalidade' },
  { chave: 'morada', rotulo: 'Morada', aliases: ['endereco'] },
  { chave: 'telefone', rotulo: 'Telefone', aliases: ['telefone 1', 'contacto'] },
  { chave: 'email', rotulo: 'Email', aliases: ['e mail'] },
  {
    chave: 'departamentoCodigo',
    rotulo: 'Departamento (código)',
    aliases: ['departamento', 'dep codigo', 'departamento cod'],
  },
  { chave: 'cargoCodigo', rotulo: 'Cargo (código)', aliases: ['cargo', 'funcao', 'cargo codigo'] },
  { chave: 'categoria', rotulo: 'Categoria', aliases: ['categoria profissional'] },
  { chave: 'dataCessacao', rotulo: 'Data de cessação', aliases: ['cessacao', 'fim contrato'] },
  { chave: 'estado', rotulo: 'Estado' },
  { chave: 'formaPagamento', rotulo: 'Forma de pagamento', aliases: ['forma pgt'] },
  { chave: 'banco', rotulo: 'Banco' },
  { chave: 'iban', rotulo: 'IBAN' },
  { chave: 'modoSubsidioNatal', rotulo: 'Subsídio de Natal (modo)', aliases: ['modo natal'] },
  { chave: 'mesPagamentoSubsidioNatal', rotulo: 'Mês subsídio de Natal', aliases: ['mes natal'] },
  {
    chave: 'modoSubsidioFerias',
    rotulo: 'Subsídio de Férias (modo)',
    aliases: ['modo ferias'],
  },
  { chave: 'mesPagamentoSubsidioFerias', rotulo: 'Mês subsídio de Férias', aliases: ['mes ferias'] },
];

const COLUNAS_CONTRATOS: ColunaDef[] = [
  {
    chave: 'funcionarioCodigo',
    rotulo: 'Funcionário (código)',
    aliases: ['codigo', 'funcionario', 'cod funcionario'],
  },
  { chave: 'nif', rotulo: 'Funcionário (NIF)', aliases: ['nif funcionario', 'funcionario nif'] },
  { chave: 'tipo', rotulo: 'Tipo de contrato', aliases: ['tipo contrato'] },
  { chave: 'categoria', rotulo: 'Categoria', aliases: ['categoria profissional'] },
  { chave: 'salarioBase', rotulo: 'Salário base', aliases: ['salario', 'sal base'] },
  { chave: 'moeda', rotulo: 'Moeda' },
  { chave: 'cargaHorariaSemanal', rotulo: 'Carga horária semanal', aliases: ['horas semana'] },
  { chave: 'dataInicio', rotulo: 'Data de início', aliases: ['inicio', 'data inicio contrato'] },
  { chave: 'dataFim', rotulo: 'Data de fim', aliases: ['fim', 'data fim'] },
  { chave: 'observacoes', rotulo: 'Observações', aliases: ['obs'] },
];

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface RhImportacaoErroLinha {
  campo: string;
  mensagem: string;
}

export interface RhImportacaoLinhaPreview {
  /** Número da linha no ficheiro (1 = cabeçalho; 2 = primeira linha de dados). */
  numero: number;
  /** Valores em bruto por coluna reconhecida (para o ecrã). */
  dados: Record<string, string>;
  valida: boolean;
  erros: RhImportacaoErroLinha[];
  /** Identidade da linha para leitura rápida (nome, código, NIF...). */
  resumo: string;
}

export interface RhImportacaoPreview {
  tipo: RhTipoImportacaoInput;
  nome: string | null;
  cabecalhos: string[];
  colunasIgnoradas: string[];
  totalLinhas: number;
  totalValidas: number;
  totalInvalidas: number;
  linhas: RhImportacaoLinhaPreview[];
}

export interface RhImportacaoResultado {
  tipo: RhTipoImportacaoInput;
  importados: number;
  ignorados: number;
  /** Linhas inválidas que não foram importadas (vazias quando tudo corre bem). */
  naoImportadas: Array<{ numero: number; resumo: string; erros: RhImportacaoErroLinha[] }>;
}

// ── Estruturas internas ──────────────────────────────────────────────────────

interface LinhaAnalisada {
  numero: number;
  dados: Record<string, string>;
  valida: boolean;
  erros: RhImportacaoErroLinha[];
  resumo: string;
  entrada?: CriarRhFuncionarioInput;
  entradaContrato?: CriarRhContratoInput;
  funcionarioId?: string;
}

interface MapeamentoCabecalhos {
  mapaChave: Map<string, number>;
  ignoradas: string[];
}

function mapearCabecalhos(cabecalhos: string[], colunas: ColunaDef[]): MapeamentoCabecalhos {
  const mapaChave = new Map<string, number>();
  const ignoradas: string[] = [];

  cabecalhos.forEach((cabecalho, indice) => {
    const chave = normalizarChave(cabecalho);
    const coluna = colunas.find(
      (def) =>
        normalizarChave(def.chave) === chave ||
        normalizarChave(def.rotulo) === chave ||
        (def.aliases ?? []).some((alias) => normalizarChave(alias) === chave)
    );
    if (!coluna) {
      ignoradas.push(cabecalho);
      return;
    }
    mapaChave.set(coluna.chave, indice);
  });

  return { mapaChave, ignoradas };
}

function registoDe(linha: string[], mapaChave: Map<string, number>): Record<string, string> {
  const registo: Record<string, string> = {};
  for (const [chave, indice] of mapaChave) {
    registo[chave] = (linha[indice] ?? '').trim();
  }
  return registo;
}

function adicionarErro(
  erros: RhImportacaoErroLinha[],
  campo: string,
  mensagem: string
): void {
  erros.push({ campo, mensagem });
}

function lerData(registo: Record<string, string>, campo: string, erros: RhImportacaoErroLinha[]): Date | undefined {
  const bruto = registo[campo] ?? '';
  if (bruto === '') return undefined;
  const data = parseData(bruto);
  if (!data) {
    adicionarErro(erros, campo, 'Data inválida (use AAAA-MM-DD ou DD/MM/AAAA).');
    return undefined;
  }
  return data;
}

function lerNumero(registo: Record<string, string>, campo: string, erros: RhImportacaoErroLinha[]): number | undefined {
  const bruto = registo[campo] ?? '';
  if (bruto === '') return undefined;
  const numero = parseNumero(bruto);
  if (numero === null) {
    adicionarErro(erros, campo, 'Valor numérico inválido.');
    return undefined;
  }
  return numero;
}

function lerEnum(registo: Record<string, string>, campo: string): string | undefined {
  return normalizarEnum(registo[campo] ?? '');
}

function errosDeZod(erro: ZodError): RhImportacaoErroLinha[] {
  return erro.issues.map((questao) => ({
    campo: questao.path.join('.') || 'formato',
    mensagem: questao.message,
  }));
}

function resumirLinhasInvalidas(linhas: LinhaAnalisada[]) {
  return linhas.map((linha) => ({
    numero: linha.numero,
    resumo: linha.resumo,
    erros: linha.erros,
  }));
}

export class RhImportacaoService {
  private prisma: PrismaClient;
  private audit: AuditService;

  constructor(prismaClient: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.prisma = prismaClient;
    this.audit = audit;
  }

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) {
      throw new RhBusinessRuleError('A sessão não está associada a uma empresa.');
    }
    return empresaId;
  }

  // ── Pré-visualização ──────────────────────────────────────────────────────

  public async previsualizar(
    tipo: RhTipoImportacaoInput,
    nome: string | undefined,
    conteudo: string,
    empresaId: string | null
  ): Promise<RhImportacaoPreview> {
    const empresa = this.exigirEmpresa(empresaId);
    const analise = await this.analisar(tipo, conteudo, empresa);

    return {
      tipo,
      nome: nome ?? null,
      cabecalhos: analise.cabecalhos,
      colunasIgnoradas: analise.colunasIgnoradas,
      totalLinhas: analise.totalLinhas,
      totalValidas: analise.totalValidas,
      totalInvalidas: analise.totalInvalidas,
      linhas: analise.linhas.map((linha) => ({
        numero: linha.numero,
        dados: linha.dados,
        valida: linha.valida,
        erros: linha.erros,
        resumo: linha.resumo,
      })),
    };
  }

  // ── Importação ────────────────────────────────────────────────────────────

  public async importar(
    tipo: RhTipoImportacaoInput,
    nome: string | undefined,
    conteudo: string,
    empresaId: string | null,
    utilizadorId: string,
    opcoes: { ignorarInvalidas?: boolean } = {}
  ): Promise<RhImportacaoResultado> {
    const empresa = this.exigirEmpresa(empresaId);
    const ignorar = Boolean(opcoes.ignorarInvalidas);
    const analise = await this.analisar(tipo, conteudo, empresa);

    const validas = analise.linhas.filter((linha) => linha.valida);
    const invalidas = analise.linhas.filter((linha) => !linha.valida);

    if (validas.length === 0) {
      throw new RhValidationError(
        'Nenhuma linha válida para importar. Corrija os erros do relatório e tente de novo.',
        { naoImportadas: resumirLinhasInvalidas(invalidas) }
      );
    }
    if (!ignorar && invalidas.length > 0) {
      throw new RhValidationError(
        `O ficheiro contém ${invalidas.length} linha(s) inválida(s). Corrija-as ou confirme a importação apenas das linhas válidas.`,
        { naoImportadas: resumirLinhasInvalidas(invalidas) }
      );
    }

    const importados = await this.prisma.$transaction(async (tx) => {
      let contagem = 0;
      if (tipo === 'FUNCIONARIOS') {
        for (const linha of validas) {
          const codigo = await proximoCodigoFuncionario(tx, empresa);
          await tx.rhFuncionario.create({
            data: paraCriarFuncionario(linha.entrada!, empresa, codigo),
          });
          contagem++;
        }
      } else {
        for (const linha of validas) {
          await tx.rhContrato.create({
            data: this.paraCriarContrato(linha),
          });
          contagem++;
        }
      }
      return contagem;
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId,
      acao: 'submeter',
      entidade: tipo === 'FUNCIONARIOS' ? 'RhFuncionario' : 'RhContrato',
      entidadeId: null,
      modulo: 'rh',
      severidade: invalidas.length > 0 ? 'aviso' : 'info',
      descricao: `Importação ${tipo} de "${nome ?? 'ficheiro CSV'}" — ${importados} registo(s).`,
      dadosNovos: {
        tipo,
        nome: nome ?? null,
        importados,
        ignorados: invalidas.length,
      },
    });

    return {
      tipo,
      importados,
      ignorados: invalidas.length,
      naoImportadas: resumirLinhasInvalidas(invalidas),
    };
  }

  private paraCriarContrato(linha: LinhaAnalisada): Prisma.RhContratoUncheckedCreateInput {
    const entrada = linha.entradaContrato!;
    return {
      funcionarioId: linha.funcionarioId!,
      tipo: entrada.tipo,
      estado: 'ATIVO',
      dataInicio: entrada.dataInicio,
      dataFim: entrada.dataFim ?? null,
      salarioBase: entrada.salarioBase,
      moeda: entrada.moeda,
      cargaHorariaSemanal: entrada.cargaHorariaSemanal,
      categoria: entrada.categoria ?? null,
      observacoes: entrada.observacoes ?? null,
    };
  }

  // ── Pipeline de análise ───────────────────────────────────────────────────

  private async analisar(
    tipo: RhTipoImportacaoInput,
    conteudo: string,
    empresa: string
  ): Promise<{
    cabecalhos: string[];
    colunasIgnoradas: string[];
    totalLinhas: number;
    totalValidas: number;
    totalInvalidas: number;
    linhas: LinhaAnalisada[];
  }> {
    const brutas = parseCsv(conteudo);
    if (brutas.length === 0) {
      throw new RhValidationError('O ficheiro está vazio ou não é um CSV válido.');
    }

    const [cabecalho, ...resto] = brutas;
    const colunas = tipo === 'FUNCIONARIOS' ? COLUNAS_FUNCIONARIOS : COLUNAS_CONTRATOS;
    const { mapaChave, ignoradas } = mapearCabecalhos(cabecalho, colunas);

    if (mapaChave.size === 0) {
      throw new RhValidationError(
        'Nenhuma coluna reconhecida. Confirme que o cabeçalho segue o modelo esperado.',
        { colunasIgnoradas: ignoradas }
      );
    }
    if (resto.length === 0) {
      throw new RhValidationError('O ficheiro não tem linhas de dados (além do cabeçalho).');
    }
    if (resto.length > maxLinhasImportacao) {
      throw new RhValidationError(
        `O ficheiro tem ${resto.length} linhas; o máximo permitido por importação é ${maxLinhasImportacao}.`
      );
    }

    const linhasAnalisadas: LinhaAnalisada[] =
      tipo === 'FUNCIONARIOS'
        ? await this.analisarFuncionarios(resto, mapaChave, empresa)
        : await this.analisarContratos(resto, mapaChave, empresa);

    const totalValidas = linhasAnalisadas.filter((linha) => linha.valida).length;

    return {
      cabecalhos: [...mapaChave.keys()],
      colunasIgnoradas: ignoradas,
      totalLinhas: linhasAnalisadas.length,
      totalValidas,
      totalInvalidas: linhasAnalisadas.length - totalValidas,
      linhas: linhasAnalisadas,
    };
  }

  private async analisarFuncionarios(
    linhas: string[][],
    mapaChave: Map<string, number>,
    empresa: string
  ): Promise<LinhaAnalisada[]> {
    const [departamentos, cargos] = await Promise.all([
      this.prisma.rhDepartamento.findMany({
        where: { empresaId: empresa },
        select: { id: true, codigo: true },
      }),
      this.prisma.rhCargo.findMany({
        where: { empresaId: empresa },
        select: { id: true, codigo: true },
      }),
    ]);
    const mapaDepartamento = new Map(departamentos.map((d) => [normalizarChave(d.codigo), d.id]));
    const mapaCargo = new Map(cargos.map((c) => [normalizarChave(c.codigo), c.id]));
    const nifsVistos = new Map<string, number>();
    const bilhetesVistos = new Map<string, number>();

    const analisadas: LinhaAnalisada[] = [];
    for (const [indice, celulas] of linhas.entries()) {
      const numero = indice + 2;
      const registo = registoDe(celulas, mapaChave);
      const erros: RhImportacaoErroLinha[] = [];

      const departamentoId = this.resolverPorCodigo(
        registo,
        'departamentoCodigo',
        mapaDepartamento,
        erros
      );
      const cargoId = this.resolverPorCodigo(registo, 'cargoCodigo', mapaCargo, erros);

      this.verificarDuplicado(registo, 'nif', nifsVistos, numero, erros);
      this.verificarDuplicado(registo, 'documentoNumero', bilhetesVistos, numero, erros);

      const entrada = this.montarFuncionario(registo, erros) as CriarRhFuncionarioInput;
      const resultado = criarRhFuncionarioSchema.safeParse(entrada);
      if (!resultado.success) erros.push(...errosDeZod(resultado.error));

      if (departamentoId) entrada.departamentoId = departamentoId;
      if (cargoId) entrada.cargoId = cargoId;

      analisadas.push({
        numero,
        dados: registo,
        valida: erros.length === 0,
        erros,
        resumo: registo.nome || '—',
        entrada,
      });
    }
    return analisadas;
  }

  private async analisarContratos(
    linhas: string[][],
    mapaChave: Map<string, number>,
    empresa: string
  ): Promise<LinhaAnalisada[]> {
    const [funcionarios, contratosAtivos] = await Promise.all([
      this.prisma.rhFuncionario.findMany({
        where: { empresaId: empresa },
        select: { id: true, codigo: true, nif: true },
      }),
      this.prisma.rhContrato.findMany({
        where: { funcionario: { empresaId: empresa }, estado: 'ATIVO' },
        select: { funcionarioId: true },
      }),
    ]);
    const mapaCodigo = new Map(funcionarios.map((f) => [normalizarChave(f.codigo), f.id]));
    const mapaNif = new Map(
      funcionarios.filter((f) => f.nif).map((f) => [normalizarChave(f.nif!), f.id])
    );
    const semContratoAtivo = new Set(contratosAtivos.map((c) => c.funcionarioId));
    const funcionariosUsados = new Map<string, number>();

    const analisadas: LinhaAnalisada[] = [];
    for (const [indice, celulas] of linhas.entries()) {
      const numero = indice + 2;
      const registo = registoDe(celulas, mapaChave);
      const erros: RhImportacaoErroLinha[] = [];

      const funcionarioId = this.resolverFuncionario(registo, mapaCodigo, mapaNif, erros);
      if (funcionarioId) {
        const anterior = funcionariosUsados.get(funcionarioId);
        if (anterior !== undefined) {
          adicionarErro(
            erros,
            'funcionarioCodigo',
            `O mesmo funcionário já tem contrato na linha ${anterior} do ficheiro.`
          );
        } else {
          funcionariosUsados.set(funcionarioId, numero);
        }
        if (semContratoAtivo.has(funcionarioId)) {
          adicionarErro(
            erros,
            'funcionarioCodigo',
            'O funcionário já possui um contrato ativo na empresa.'
          );
        }
      }

      const entrada = this.montarContrato(registo, erros) as CriarRhContratoInput;
      const resultado = criarRhContratoSchema.safeParse(entrada);
      if (!resultado.success) erros.push(...errosDeZod(resultado.error));

      analisadas.push({
        numero,
        dados: registo,
        valida: erros.length === 0,
        erros,
        resumo: registo.funcionarioCodigo || registo.nif || '—',
        entradaContrato: entrada,
        funcionarioId: funcionarioId ?? undefined,
      });
    }
    return analisadas;
  }

  // ── Construtores de entrada ───────────────────────────────────────────────

  private montarFuncionario(
    registo: Record<string, string>,
    erros: RhImportacaoErroLinha[]
  ): Partial<CriarRhFuncionarioInput> {
    return {
      nome: registo.nome ?? '',
      documentoNumero: registo.documentoNumero || undefined,
      nif: registo.nif || undefined,
      niss: registo.niss || undefined,
      dataNascimento: lerData(registo, 'dataNascimento', erros),
      genero: lerEnum(registo, 'genero') as CriarRhFuncionarioInput['genero'] | undefined,
      estadoCivil: lerEnum(registo, 'estadoCivil') as CriarRhFuncionarioInput['estadoCivil'] | undefined,
      nacionalidade: registo.nacionalidade || undefined,
      morada: registo.morada || undefined,
      telefone: registo.telefone || undefined,
      email: registo.email || undefined,
      categoria: registo.categoria || undefined,
      dataAdmissao: lerData(registo, 'dataAdmissao', erros),
      dataCessacao: lerData(registo, 'dataCessacao', erros),
      estado: lerEnum(registo, 'estado') as CriarRhFuncionarioInput['estado'] | undefined,
      formaPagamento: lerEnum(
        registo,
        'formaPagamento'
      ) as CriarRhFuncionarioInput['formaPagamento'] | undefined,
      banco: registo.banco || undefined,
      iban: registo.iban || undefined,
      modoSubsidioNatal: lerEnum(
        registo,
        'modoSubsidioNatal'
      ) as CriarRhFuncionarioInput['modoSubsidioNatal'] | undefined,
      modoSubsidioFerias: lerEnum(
        registo,
        'modoSubsidioFerias'
      ) as CriarRhFuncionarioInput['modoSubsidioFerias'] | undefined,
      mesPagamentoSubsidioNatal: lerNumero(registo, 'mesPagamentoSubsidioNatal', erros),
      mesPagamentoSubsidioFerias: lerNumero(registo, 'mesPagamentoSubsidioFerias', erros),
    };
  }

  private montarContrato(
    registo: Record<string, string>,
    erros: RhImportacaoErroLinha[]
  ): Partial<CriarRhContratoInput> {
    if (!registo.funcionarioCodigo && !registo.nif) {
      adicionarErro(
        erros,
        'funcionarioCodigo',
        'Indique o funcionário pelo código ou pelo NIF.'
      );
    }
    return {
      tipo: lerEnum(registo, 'tipo') as CriarRhContratoInput['tipo'] | undefined,
      categoria: registo.categoria || undefined,
      salarioBase: lerNumero(registo, 'salarioBase', erros),
      moeda: registo.moeda || undefined,
      cargaHorariaSemanal: lerNumero(registo, 'cargaHorariaSemanal', erros),
      dataInicio: lerData(registo, 'dataInicio', erros),
      dataFim: lerData(registo, 'dataFim', erros),
      observacoes: registo.observacoes || undefined,
    };
  }

  // ── Resolução de referências ──────────────────────────────────────────────

  private resolverPorCodigo(
    registo: Record<string, string>,
    campo: string,
    mapa: Map<string, string>,
    erros: RhImportacaoErroLinha[]
  ): string | undefined {
    const bruto = registo[campo];
    if (!bruto) return undefined;
    const id = mapa.get(normalizarChave(bruto));
    if (!id) {
      adicionarErro(erros, campo, `"${bruto}" não existe nos cadastros da empresa.`);
      return undefined;
    }
    return id;
  }

  private resolverFuncionario(
    registo: Record<string, string>,
    mapaCodigo: Map<string, string>,
    mapaNif: Map<string, string>,
    erros: RhImportacaoErroLinha[]
  ): string | undefined {
    const codigo = registo.funcionarioCodigo?.trim();
    if (codigo) {
      const id = mapaCodigo.get(normalizarChave(codigo));
      if (!id) {
        adicionarErro(erros, 'funcionarioCodigo', `Funcionário "${codigo}" não encontrado na empresa.`);
        return undefined;
      }
      return id;
    }
    const nif = registo.nif?.trim();
    if (nif) {
      const id = mapaNif.get(normalizarChave(nif));
      if (!id) {
        adicionarErro(erros, 'nif', `Nenhum funcionário com NIF "${nif}" na empresa.`);
        return undefined;
      }
      return id;
    }
    return undefined;
  }

  private verificarDuplicado(
    registo: Record<string, string>,
    campo: string,
    vistos: Map<string, number>,
    numero: number,
    erros: RhImportacaoErroLinha[]
  ): void {
    const bruto = registo[campo]?.trim();
    if (!bruto) return;
    const chave = normalizarChave(bruto);
    const anterior = vistos.get(chave);
    if (anterior !== undefined) {
      adicionarErro(erros, campo, `Valor duplicado — já utilizado na linha ${anterior}.`);
      return;
    }
    vistos.set(chave, numero);
  }
}

export const rhImportacaoService = new RhImportacaoService();