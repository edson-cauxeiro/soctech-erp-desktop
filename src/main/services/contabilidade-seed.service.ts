/**
 * @file contabilidade-seed.service.ts
 * @description Semeia o plano de contas PGC Angola, os diários padrão e os
 * mapeamentos simbólicos de uma empresa.
 *
 * O seed é idempotente: correr duas vezes não duplica contas, diários nem
 * mapeamentos. Também não reescreve o que o utilizador editou — se uma conta
 * já existe, fica como está; só são criadas as que faltam. É essa a diferença
 * entre "semear" e "resetar": o seed prepara uma empresa nova sem apagar o
 * trabalho de quem já configurou a sua.
 */

import { PrismaClient, NaturezaConta, TipoContaContabil, TipoDiario } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { NotFoundError, ValidationError } from '../utils/errors';
import { DemonstracoesService, EstruturaRelatorioInput } from './demonstracoes.service';
import pgcAngola from '../../../prisma/data/pgc-angola.json';

export interface ContaSeed {
  codigo: string;
  designacao: string;
  tipo: TipoContaContabil;
  natureza: NaturezaConta;
  aceitaMovimento: boolean;
  exigeCentroCusto?: boolean;
  exigeEntidade?: boolean;
}

export interface DiarioSeed {
  codigo: string;
  designacao: string;
  tipo: TipoDiario;
}

export interface MapeamentoSeed {
  chave: string;
  codigoConta: string;
  descricao: string;
}

export interface ResultadoSeedContabilidade {
  contasCriadas: number;
  contasTotal: number;
  diariosCriados: number;
  diariosTotal: number;
  mapeamentosCriados: number;
  mapeamentosTotal: number;
  estruturasCriadas: number;
  estruturasTotal: number;
}

const CONTAS_PGC = pgcAngola as unknown as ContaSeed[];

/**
 * Diários mínimos para operar. O código é o que aparece no SAF-T e nos
 * extractos; a designação é livre. `AP` é o diário de apuramentos e `LG` o de
 * liquidações — separá-los evita misturar regularizações com pagamentos.
 */
export const DIARIOS_PADRAO: DiarioSeed[] = [
  { codigo: 'VD', designacao: 'Diário de vendas', tipo: 'vendas' },
  { codigo: 'CP', designacao: 'Diário de compras', tipo: 'compras' },
  { codigo: 'CX', designacao: 'Diário de caixa', tipo: 'caixa' },
  { codigo: 'BC', designacao: 'Diário de banco', tipo: 'banco' },
  { codigo: 'OD', designacao: 'Diário de operações diversas', tipo: 'geral' },
  { codigo: 'AB', designacao: 'Diário de abertura', tipo: 'abertura' },
  { codigo: 'AP', designacao: 'Diário de apuramentos', tipo: 'ajustamento' },
  { codigo: 'LG', designacao: 'Diário de liquidações', tipo: 'liquidacao' },
];

/**
 * Chaves estáveis que o motor de contabilização usa para resolver contas.
 * Nenhuma conta fica escrita no código do motor: muda-se o mapeamento, não o
 * código. As chaves são maiúsculas e não têm acentos para sobreviverem a
 * exportações e integrações.
 */
export const MAPEAMENTOS_PADRAO: MapeamentoSeed[] = [
  // IVA
  { chave: 'VAT_INPUT', codigoConta: '3421', descricao: 'IVA dedutível nas compras' },
  { chave: 'VAT_OUTPUT', codigoConta: '3422', descricao: 'IVA liquidado nas vendas' },
  { chave: 'VAT_PAYABLE', codigoConta: '3423', descricao: 'IVA a pagar ao Estado' },
  { chave: 'VAT_RECOVERABLE', codigoConta: '3424', descricao: 'IVA a recuperar do Estado' },
  // Entidades
  { chave: 'CUSTOMER_ACCOUNT', codigoConta: '311', descricao: 'Conta corrente de clientes' },
  { chave: 'SUPPLIER_ACCOUNT', codigoConta: '321', descricao: 'Conta corrente de fornecedores' },
  // Negócio
  { chave: 'SALES_ACCOUNT', codigoConta: '611', descricao: 'Vendas de mercadorias' },
  { chave: 'PURCHASE_ACCOUNT', codigoConta: '211', descricao: 'Compras de mercadorias' },
  { chave: 'CASH_ACCOUNT', codigoConta: '411', descricao: 'Caixa em moeda nacional' },
  { chave: 'BANK_ACCOUNT', codigoConta: '421', descricao: 'Depósitos à ordem em moeda nacional' },
  // Capital próprio
  { chave: 'RETAINED_EARNINGS', codigoConta: '54', descricao: 'Resultados transitados' },
  // Resultados
  { chave: 'RESULT_OPERATING', codigoConta: '81', descricao: 'Resultados operacionais' },
  { chave: 'RESULT_FINANCIAL', codigoConta: '82', descricao: 'Resultados financeiros' },
  { chave: 'RESULT_CURRENT', codigoConta: '83', descricao: 'Resultados correntes' },
  { chave: 'RESULT_NON_OPERATING', codigoConta: '84', descricao: 'Resultados não correntes' },
  { chave: 'RESULT_BEFORE_TAX', codigoConta: '85', descricao: 'Resultados antes de impostos' },
  { chave: 'RESULT_TAX', codigoConta: '86', descricao: 'Imposto sobre os lucros' },
  { chave: 'RESULT_ACTIVITIES', codigoConta: '87', descricao: 'Resultados líquidos das actividades' },
  { chave: 'RESULT_NET', codigoConta: '88', descricao: 'Resultados líquidos do exercício' },
  // RH
  { chave: 'PAYROLL_EXPENSE', codigoConta: '731', descricao: 'Remunerações' },
  { chave: 'PAYROLL_PAYABLE', codigoConta: '331', descricao: 'Remunerações a pagar' },
  { chave: 'SOCIAL_SECURITY_PAYABLE', codigoConta: '344', descricao: 'Contribuições para a segurança social' },
  { chave: 'WITHHOLDING_PAYABLE', codigoConta: '341', descricao: 'Retenções na fonte a pagar' },
];

/**
 * Chaves antigas (anteriores à normalização para `CHAVES_CONTA`) que são
 * renomeadas no local em vez de duplicadas. Mantém as instalações existentes
 * coerentes com o motor, que só conhece as chaves inglesas.
 */
const MAPEAMENTOS_LEGADOS: Record<string, string> = {
  IVA_DEDUTIVEL: 'VAT_INPUT',
  IVA_LIQUIDADO: 'VAT_OUTPUT',
  IVA_A_PAGAR: 'VAT_PAYABLE',
  IVA_A_RECUPERAR: 'VAT_RECOVERABLE',
  CLIENTES: 'CUSTOMER_ACCOUNT',
  FORNECEDORES: 'SUPPLIER_ACCOUNT',
  VENDAS: 'SALES_ACCOUNT',
  COMPRAS: 'PURCHASE_ACCOUNT',
  CAIXA: 'CASH_ACCOUNT',
  BANCO: 'BANK_ACCOUNT',
  RESULTADOS_TRANSITADOS: 'RETAINED_EARNINGS',
  RESULTADO_LIQUIDO: 'RESULT_NET',
};

export class ContabilidadeSeedService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Valida o catálogo antes de tocar na base. Um erro num código só se
   * descobre ao gravar se não for validado aqui; e a essa altura já pode ter
   * criado metade do plano.
   */
  validarCatalogo(contas: ContaSeed[] = CONTAS_PGC): void {
    const vistos = new Set<string>();
    for (const conta of contas) {
      if (!/^[1-8][0-9]{0,9}$/.test(conta.codigo)) {
        throw new ValidationError(
          `Código de conta inválido no catálogo PGC: "${conta.codigo}". Deve começar por 1–8 e conter apenas dígitos.`
        );
      }
      if (vistos.has(conta.codigo)) {
        throw new ValidationError(`Código de conta duplicado no catálogo PGC: "${conta.codigo}".`);
      }
      vistos.add(conta.codigo);
      if (!conta.designacao?.trim()) {
        throw new ValidationError(`A conta "${conta.codigo}" não tem designação.`);
      }
    }
  }

  private encontrarPai(codigo: string, ids: Map<string, string>): string | null {
    for (let i = codigo.length - 1; i >= 1; i--) {
      const prefixo = codigo.slice(0, i);
      if (ids.has(prefixo)) return prefixo;
    }
    return null;
  }

  private async exigirEmpresa(empresaId: string): Promise<void> {
    if (!empresaId) throw new ValidationError('A empresa é obrigatória para semear a contabilidade.');
    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundError('Empresa não encontrada.');
  }

  /**
   * Cria as contas que faltam. As existentes não são alteradas: o plano é
   * editável e uma segunda execução não pode desfazer as edições do utilizador.
   */
  async semearPlanoContas(empresaId: string): Promise<{ criadas: number; total: number }> {
    await this.exigirEmpresa(empresaId);
    this.validarCatalogo();

    const existentes = await this.prisma.contaContabil.findMany({
      where: { empresaId },
      select: {
        id: true,
        codigo: true,
        aceitaMovimento: true,
        _count: { select: { filhas: true } },
      },
    });
    const ids = new Map(existentes.map((c) => [c.codigo, c.id]));
    const estadoMovimento = new Map<string, boolean>(
      existentes.map((c) => [c.codigo, c.aceitaMovimento])
    );

    // Um pai do catálogo é qualquer código que seja prefixo de outra conta do
    // catálogo. Só esses podem perder o direito a movimento; inicializar o
    // conjunto com todas as contas que hoje aceitam movimento fazia a segunda
    // execução marcar as folhas como agregação e quebrar os mapeamentos.
    const codigosCatalogo = new Set(CONTAS_PGC.map((c) => c.codigo));
    const codigosPai = new Set<string>();
    for (const conta of CONTAS_PGC) {
      for (let i = conta.codigo.length - 1; i >= 1; i--) {
        const prefixo = conta.codigo.slice(0, i);
        if (codigosCatalogo.has(prefixo)) {
          codigosPai.add(prefixo);
          break;
        }
      }
    }

    // Só há trabalho de correcção se um pai ainda aceita movimento: contas já
    // corrigidas numa execução anterior não voltam a ser tocadas.
    const paisComMovimento = new Set<string>(
      existentes
        .filter((c) => c.aceitaMovimento && (c._count.filhas > 0 || codigosPai.has(c.codigo)))
        .map((c) => c.id)
    );

    const ordenadas = [...CONTAS_PGC].sort(
      (a, b) => a.codigo.length - b.codigo.length || a.codigo.localeCompare(b.codigo)
    );

    let criadas = 0;
    for (const conta of ordenadas) {
      if (ids.has(conta.codigo)) continue;

      const codigoPai = this.encontrarPai(conta.codigo, ids);
      const contaPaiId = codigoPai ? (ids.get(codigoPai) ?? null) : null;
      if (contaPaiId && codigoPai && estadoMovimento.get(codigoPai) === true) {
        paisComMovimento.add(contaPaiId);
        estadoMovimento.set(codigoPai, false);
      }

      const criada = await this.prisma.contaContabil.create({
        data: {
          empresaId,
          codigo: conta.codigo,
          designacao: conta.designacao,
          contaPaiId,
          nivel: conta.codigo.length,
          classe: Number(conta.codigo[0]),
          tipo: conta.tipo,
          natureza: conta.natureza,
          aceitaMovimento: conta.aceitaMovimento,
          exigeCentroCusto: conta.exigeCentroCusto ?? false,
          exigeEntidade: conta.exigeEntidade ?? false,
          activa: true,
        },
      });
      ids.set(conta.codigo, criada.id);
      estadoMovimento.set(conta.codigo, conta.aceitaMovimento);
      criadas++;
    }

    if (paisComMovimento.size > 0) {
      await this.prisma.contaContabil.updateMany({
        where: { id: { in: [...paisComMovimento] } },
        data: { aceitaMovimento: false },
      });
    }

    return { criadas, total: CONTAS_PGC.length };
  }

  /** Cria os diários padrão que ainda não existem. */
  async semearDiariosPadrao(empresaId: string): Promise<{ criados: number; total: number }> {
    await this.exigirEmpresa(empresaId);

    const existentes = await this.prisma.diarioContabil.findMany({
      where: { empresaId },
      select: { codigo: true },
    });
    const codigos = new Set(existentes.map((d) => d.codigo));
    const faltam = DIARIOS_PADRAO.filter((d) => !codigos.has(d.codigo));

    if (faltam.length > 0) {
      await this.prisma.diarioContabil.createMany({
        data: faltam.map((d) => ({
          empresaId,
          codigo: d.codigo,
          designacao: d.designacao,
          tipo: d.tipo,
          activo: true,
        })),
        skipDuplicates: true,
      });
    }

    return { criados: faltam.length, total: DIARIOS_PADRAO.length };
  }

  /**
   * Cria os mapeamentos padrão. Se a conta ainda não existir, o seed falha com
   * a lista de códigos em falta: um mapeamento para uma conta inexistente é
   * pior do que um erro claro, porque só rebenta meses depois no fecho.
   */
  async semearMapeamentosPadrao(
    empresaId: string
  ): Promise<{ criados: number; total: number }> {
    await this.exigirEmpresa(empresaId);

    const codigos = [...new Set(MAPEAMENTOS_PADRAO.map((m) => m.codigoConta))];
    const contas = await this.prisma.contaContabil.findMany({
      where: { empresaId, codigo: { in: codigos } },
      select: { id: true, codigo: true, aceitaMovimento: true },
    });
    const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

    const emFalta = codigos.filter((codigo) => !porCodigo.has(codigo));
    if (emFalta.length > 0) {
      throw new NotFoundError(
        `Não é possível semear os mapeamentos: faltam as contas ${emFalta.join(', ')}. Semeie primeiro o plano de contas.`
      );
    }

    const naoMovimentaveis = contas
      .filter((c) => !c.aceitaMovimento)
      .map((c) => c.codigo);
    if (naoMovimentaveis.length > 0) {
      throw new ValidationError(
        `Os mapeamentos exigem contas que aceitem movimento. Corrija: ${naoMovimentaveis.join(', ')}.`
      );
    }

    const existentes = await this.prisma.mapeamentoConta.findMany({
      where: { empresaId },
      select: { id: true, chave: true },
    });
    const porChave = new Map(existentes.map((m) => [m.chave, m.id]));

    // Renomear chaves antigas no local, desde que a chave nova ainda não exista.
    for (const [legado, novo] of Object.entries(MAPEAMENTOS_LEGADOS)) {
      const id = porChave.get(legado);
      if (!id || porChave.has(novo)) continue;
      await this.prisma.mapeamentoConta.update({ where: { id }, data: { chave: novo } });
      porChave.delete(legado);
      porChave.set(novo, id);
    }

    const faltam = MAPEAMENTOS_PADRAO.filter((m) => !porChave.has(m.chave));

    if (faltam.length > 0) {
      await this.prisma.mapeamentoConta.createMany({
        data: faltam.map((m) => ({
          empresaId,
          chave: m.chave,
          contaId: porCodigo.get(m.codigoConta)!.id,
        })),
        skipDuplicates: true,
      });
    }

    return { criados: faltam.length, total: MAPEAMENTOS_PADRAO.length };
  }

  /**
   * Cria as quatro demonstrações padrão, mapeando as contas por classe e tipo.
   * O utilizador pode depois editar as linhas e as associações; o seed só corre
   * quando ainda não existe nenhuma estrutura para a empresa.
   */
  async semearEstruturasPadrao(
    empresaId: string
  ): Promise<{ criadas: number; total: number }> {
    await this.exigirEmpresa(empresaId);

    const existentes = await this.prisma.estruturaRelatorio.count({ where: { empresaId } });
    const total = 4;
    if (existentes > 0) return { criadas: 0, total };

    const contas = await this.prisma.contaContabil.findMany({
      where: { empresaId, aceitaMovimento: true },
      select: { id: true, codigo: true, classe: true, tipo: true },
    });

    const contasDe = (predicado: (conta: (typeof contas)[number]) => boolean) =>
      contas.filter(predicado).map((conta) => ({ contaId: conta.id }));
    const comPrefixo = (classe: number, prefixos: string[]) =>
      contasDe((c) => c.classe === classe && prefixos.some((p) => c.codigo.startsWith(p)));

    const especificacoes: EstruturaRelatorioInput[] = [
      {
        codigo: 'BALANCO',
        designacao: 'Balanço',
        tipo: 'balanco',
        linhas: [
          { codigo: 'ATIVO', designacao: 'Activo', ordem: 1, nivel: 1, tipo: 'activo' },
          {
            codigo: 'ATIVO_NAO_CORRENTE',
            designacao: 'Activo não corrente',
            parentCodigo: 'ATIVO',
            ordem: 1,
            nivel: 2,
            tipo: 'subtotal',
            contas: contasDe((c) => c.classe === 1 && c.tipo === 'activo'),
          },
          {
            codigo: 'EXISTENCIAS',
            designacao: 'Existências',
            parentCodigo: 'ATIVO',
            ordem: 2,
            nivel: 2,
            tipo: 'subtotal',
            contas: contasDe((c) => c.classe === 2 && c.tipo === 'activo'),
          },
          {
            codigo: 'CONTAS_A_RECEBER',
            designacao: 'Contas a receber',
            parentCodigo: 'ATIVO',
            ordem: 3,
            nivel: 2,
            tipo: 'subtotal',
            contas: contasDe((c) => c.classe === 3 && c.tipo === 'activo'),
          },
          {
            codigo: 'MEIOS_MONETARIOS',
            designacao: 'Meios monetários',
            parentCodigo: 'ATIVO',
            ordem: 4,
            nivel: 2,
            tipo: 'subtotal',
            contas: contasDe((c) => c.classe === 4 && c.tipo === 'activo'),
          },
          { codigo: 'PASSIVO', designacao: 'Passivo', ordem: 2, nivel: 1, tipo: 'passivo' },
          {
            codigo: 'PASSIVO_CORRENTE',
            designacao: 'Passivo corrente',
            parentCodigo: 'PASSIVO',
            ordem: 1,
            nivel: 2,
            tipo: 'subtotal',
            operacao: 'creditoMenosDebito',
            contas: contasDe((c) => c.classe === 3 && c.tipo === 'passivo'),
          },
          {
            codigo: 'CAPITAL_PROPRIO',
            designacao: 'Capital próprio',
            ordem: 3,
            nivel: 1,
            tipo: 'capitalProprio',
          },
          {
            codigo: 'CAPITAL',
            designacao: 'Capital',
            parentCodigo: 'CAPITAL_PROPRIO',
            ordem: 1,
            nivel: 2,
            tipo: 'subtotal',
            operacao: 'creditoMenosDebito',
            contas: contasDe((c) => c.classe === 5 && c.tipo === 'capitalProprio'),
          },
        ],
      },
      {
        codigo: 'DR',
        designacao: 'Demonstração de resultados',
        tipo: 'demonstracaoResultados',
        linhas: [
          {
            codigo: 'RESULTADO_LIQUIDO',
            designacao: 'Resultado líquido do exercício',
            ordem: 1,
            nivel: 1,
            tipo: 'resultado',
          },
          {
            codigo: 'RESULTADO_ANTES_IMPOSTOS',
            designacao: 'Resultado antes de impostos',
            parentCodigo: 'RESULTADO_LIQUIDO',
            ordem: 1,
            nivel: 2,
            tipo: 'resultado',
          },
          {
            codigo: 'RESULTADO_OPERACIONAL',
            designacao: 'Resultado operacional',
            parentCodigo: 'RESULTADO_ANTES_IMPOSTOS',
            ordem: 1,
            nivel: 3,
            tipo: 'resultado',
          },
          {
            codigo: 'PROVEITOS_OPERACIONAIS',
            designacao: 'Proveitos operacionais',
            parentCodigo: 'RESULTADO_OPERACIONAL',
            ordem: 1,
            nivel: 4,
            tipo: 'proveito',
            operacao: 'creditoMenosDebito',
            contas: contasDe(
              (c) =>
                c.classe === 6 &&
                !c.codigo.startsWith('64') &&
                !c.codigo.startsWith('651') &&
                !c.codigo.startsWith('653')
            ),
          },
          {
            codigo: 'CUSTOS_OPERACIONAIS',
            designacao: 'Custos operacionais',
            parentCodigo: 'RESULTADO_OPERACIONAL',
            ordem: 2,
            nivel: 4,
            tipo: 'custo',
            sinal: -1,
            contas: contasDe(
              (c) =>
                c.classe === 7 &&
                !c.codigo.startsWith('75') &&
                !c.codigo.startsWith('761') &&
                !c.codigo.startsWith('763')
            ),
          },
          {
            codigo: 'RESULTADO_FINANCEIRO',
            designacao: 'Resultado financeiro',
            parentCodigo: 'RESULTADO_ANTES_IMPOSTOS',
            ordem: 2,
            nivel: 3,
            tipo: 'resultado',
          },
          {
            codigo: 'PROVEITOS_FINANCEIROS',
            designacao: 'Proveitos financeiros',
            parentCodigo: 'RESULTADO_FINANCEIRO',
            ordem: 1,
            nivel: 4,
            tipo: 'proveito',
            operacao: 'creditoMenosDebito',
            contas: comPrefixo(6, ['64']),
          },
          {
            codigo: 'CUSTOS_FINANCEIROS',
            designacao: 'Custos financeiros',
            parentCodigo: 'RESULTADO_FINANCEIRO',
            ordem: 2,
            nivel: 4,
            tipo: 'custo',
            sinal: -1,
            contas: comPrefixo(7, ['75']),
          },
          {
            codigo: 'RESULTADO_NAO_CORRENTE',
            designacao: 'Resultado não corrente',
            parentCodigo: 'RESULTADO_ANTES_IMPOSTOS',
            ordem: 3,
            nivel: 3,
            tipo: 'resultado',
          },
          {
            codigo: 'PROVEITOS_NAO_CORRENTES',
            designacao: 'Proveitos não correntes',
            parentCodigo: 'RESULTADO_NAO_CORRENTE',
            ordem: 1,
            nivel: 4,
            tipo: 'proveito',
            operacao: 'creditoMenosDebito',
            contas: comPrefixo(6, ['651', '653']),
          },
          {
            codigo: 'CUSTOS_NAO_CORRENTES',
            designacao: 'Custos não correntes',
            parentCodigo: 'RESULTADO_NAO_CORRENTE',
            ordem: 2,
            nivel: 4,
            tipo: 'custo',
            sinal: -1,
            contas: comPrefixo(7, ['761', '763']),
          },
          {
            codigo: 'IMPOSTO',
            designacao: 'Imposto sobre os lucros',
            parentCodigo: 'RESULTADO_LIQUIDO',
            ordem: 2,
            nivel: 2,
            tipo: 'custo',
            sinal: -1,
            contas: comPrefixo(8, ['86']),
          },
        ],
      },
      {
        codigo: 'FLUXOS_CAIXA',
        designacao: 'Fluxos de caixa',
        tipo: 'fluxosCaixa',
        linhas: [
          {
            codigo: 'ENTRADAS',
            designacao: 'Entradas de caixa e bancos',
            ordem: 1,
            nivel: 2,
            tipo: 'fluxo',
            operacao: 'debito',
            contas: contasDe((c) => c.classe === 4 && c.tipo === 'activo'),
          },
          {
            codigo: 'SAIDAS',
            designacao: 'Saídas de caixa e bancos',
            ordem: 2,
            nivel: 2,
            tipo: 'fluxo',
            operacao: 'credito',
            sinal: -1,
            contas: contasDe((c) => c.classe === 4 && c.tipo === 'activo'),
          },
          {
            codigo: 'FLUXO_LIQUIDO',
            designacao: 'Fluxo líquido de caixa e bancos',
            ordem: 3,
            nivel: 1,
            tipo: 'resultado',
          },
        ],
      },
      {
        codigo: 'CAPITAL_PROPRIO',
        designacao: 'Alterações no capital próprio',
        tipo: 'alteracoesCapitalProprio',
        linhas: [
          {
            codigo: 'CAPITAL_SOCIAL',
            designacao: 'Capital social e acções próprias',
            ordem: 1,
            nivel: 2,
            tipo: 'capitalProprio',
            operacao: 'creditoMenosDebito',
            contas: comPrefixo(5, ['51', '52']),
          },
          {
            codigo: 'RESERVAS',
            designacao: 'Reservas',
            ordem: 2,
            nivel: 2,
            tipo: 'capitalProprio',
            operacao: 'creditoMenosDebito',
            contas: comPrefixo(5, ['53']),
          },
          {
            codigo: 'RESULTADOS_TRANSITADOS',
            designacao: 'Resultados transitados',
            ordem: 3,
            nivel: 2,
            tipo: 'capitalProprio',
            operacao: 'creditoMenosDebito',
            contas: comPrefixo(5, ['54']),
          },
          {
            codigo: 'RESULTADO_EXERCICIO',
            designacao: 'Resultado líquido do exercício',
            ordem: 4,
            nivel: 2,
            tipo: 'capitalProprio',
            operacao: 'creditoMenosDebito',
            contas: comPrefixo(8, ['88']),
          },
          {
            codigo: 'TOTAL_CAPITAL_PROPRIO',
            designacao: 'Total do capital próprio',
            ordem: 5,
            nivel: 1,
            tipo: 'total',
          },
        ],
      },
    ];

    // Hierarquia: as linhas foram declaradas com `parentCodigo`, mas a ordem
    // visual do DR e do balanço exige que os pais sejam criados antes. O
    // serviço de demonstrações resolve a árvore pelo `parentCodigo`.
    const service = new DemonstracoesService(this.prisma);
    let criadas = 0;
    for (const especificacao of especificacoes) {
      await service.guardarEstrutura(empresaId, especificacao);
      criadas++;
    }

    return { criadas, total };
  }

  /** Semeia tudo pela ordem correcta: contas → diários → mapeamentos → estruturas. */
  async semearTudo(empresaId: string): Promise<ResultadoSeedContabilidade> {
    const contas = await this.semearPlanoContas(empresaId);
    const diarios = await this.semearDiariosPadrao(empresaId);
    const mapeamentos = await this.semearMapeamentosPadrao(empresaId);
    const estruturas = await this.semearEstruturasPadrao(empresaId);

    return {
      contasCriadas: contas.criadas,
      contasTotal: contas.total,
      diariosCriados: diarios.criados,
      diariosTotal: diarios.total,
      mapeamentosCriados: mapeamentos.criados,
      mapeamentosTotal: mapeamentos.total,
      estruturasCriadas: estruturas.criadas,
      estruturasTotal: estruturas.total,
    };
  }
}

export const contabilidadeSeedService = new ContabilidadeSeedService();
