/**
 * @file fiscal-agt.service.ts
 * @description Conformidade fiscal AGT (Angola) e rastreio de ficheiros.
 *
 * Âmbito, e o limite que importa reter: este módulo **não submete nada**. A
 * submissão à AGT é feita por software certificado, instalado na máquina do
 * operador e fora do alcance deste repositório. O que o DoraERP faz é o que
 * pode fazer sem inventar uma API que não existe:
 *
 * 1. Verificar que um documento satisfaz as regras de conformidade locais
 *    (moeda, NIF, campos obrigatórios, assinatura presente).
 * 2. Calcular a assinatura (`ATC-UD`) para que o documento impresso em A4
 *    possa ser carregado no software certificado.
 * 3. Guardar a cadeia de custódia do ficheiro — versão, hash, período,
 *    resultado da validação — para responder "o que foi gerado e quando".
 *
 * Sobre a assinatura: a fórmula da AGT é uma concatenação Base64 de campos
 * por ordem fixa, o mesmo desenho do `Hash` do SAF-T. A ordem está isolada
 * em `CAMPOS_ASSINATURA` e cada campo tem o seu valor Base64 isolado, tal
 * como a especificação determina. **Verifique a ordem e o conjunto de campos
 * contra a especificação técnica da AGT da sua versão antes de emitir em
 * produção** — um hash de assinatura errado não dá erro visível, apenas
 * documentos que a AGT recusa mais tarde.
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../database/prisma';
import { ValidationError, NotFoundError } from '../../utils/errors';

// =============================================================================
// Tipos
// =============================================================================

export type EstadoSubmissao = 'rascunho' | 'assinado' | 'submetido' | 'aceite' | 'rejeitado';

export type SeveridadeAgt = 'erro' | 'aviso' | 'info';

export interface ProblemaConformidade {
  /** Código estável, para a UI poder filtrar e para testes poderem citar. */
  codigo: string;
  severidade: SeveridadeAgt;
  mensagem: string;
  /** Campo exacto onde está o problema, quando aplicável. */
  campo?: string;
}

export interface ResultadoConformidade {
  conforme: boolean;
  problemas: ProblemaConformidade[];
  /** Resumo para a UI, sem repetir as mensagens. */
  resumo: {
    erros: number;
    avisos: number;
  };
}

/** Campos de uma fatura que a conformidade AGT olha. */
export interface DocumentoAgt {
  id: string;
  numero: string;
  serie: string;
  tipo: 'fatura' | 'fatura_recibo' | 'nota_credito' | 'nota_debito';
  dataEmissao: Date;
  dataVencimento: Date;
  clienteNome: string;
  clienteNif: string;
  totalIliquido: number;
  totalIva: number;
  totalLiquido: number;
  moeda: string;
  atcud: string | null;
  hashAssinatura: string | null;
  estadoDocumento: string;
  /** linhas para a validação de coerência de totais. */
  linhas: Array<{ taxaIva: number; totalLinha: number }>;
}

/** Identificação fiscal do software que produziu o ficheiro. */
export interface SoftwareAgt {
  nome: string;
  versao: string;
  /** Chave de segurança da aplicação, emitida pela AGT. */
  chaveSeguranca: string;
  /** Series/número de série do certificado de software. */
  certificado: string;
}

export interface ParametrosAssinatura extends SoftwareAgt {
  empresaId: string;
  nifEmpresa: string;
  documento: DocumentoAgt;
}

// =============================================================================
// Constantes
// =============================================================================

/** Moeda Angola. Uma fatura em AOA é o que a AGT exige. */
export const MOEDA_AGT = 'AOA';

/** Moeda Portugal, para a validação cruzada de que a fatura está certa. */
export const MOEDA_PT = 'EUR';

/** Versão do layout que este módulo conhece. */
export const VERSAO_AGT = '1.0';

/**
 * Ordem de concatenação da assinatura da AGT.
 *
 * Não reordenar. Cada entrada é `[nome do campo, valor]`, e o valor entra
 * já codificado em Base64 — a AGT assina os campos individualmente
 * codificados, não o valor em claro, e misturar as duas formas dá um hash
 * diferente sem qualquer erro visível.
 */
export const CAMPOS_ASSINATURA: Array<(p: ParametrosAssinatura) => string> = [
  // Identificação do emitente.
  (p) => p.nifEmpresa,
  // Documento.
  (p) => p.documento.numero,
  (p) => p.documento.serie,
  (p) => formatarTipoDocumentoAgt(p.documento.tipo),
  (p) => formatarDataIso(p.documento.dataEmissao),
  (p) => formatarDataIso(p.documento.dataVencimento),
  // Identificação do destinatário.
  (p) => p.documento.clienteNif,
  // Valores, cada um pela sua base.
  (p) => formatarValorAgt(p.documento.totalIliquido),
  (p) => formatarValorAgt(p.documento.totalIva),
  (p) => formatarValorAgt(p.documento.totalLiquido),
  // Software.
  (p) => p.nome,
  (p) => p.versao,
  (p) => p.chaveSeguranca,
  (p) => p.certificado,
  // Momento em que a assinatura foi gerada.
  () => formatarDataIso(new Date()),
];

/** Nomes dos campos, na mesma ordem, para mensagens de erro legíveis. */
export const NOMES_CAMPOS_ASSINATURA = [
  'NIF do emitente',
  'Número do documento',
  'Série do documento',
  'Tipo de documento',
  'Data de emissão',
  'Data de vencimento',
  'NIF do cliente',
  'Valor ilíquido',
  'Valor do IVA',
  'Valor total',
  'Nome do software',
  'Versão do software',
  'Chave de segurança',
  'Certificado de software',
  'Data de geração',
] as const;

// =============================================================================
// Formatação
// =============================================================================

function base64(valor: string): string {
  return Buffer.from(valor, 'utf8').toString('base64');
}

/** `AAAA-MM-DD`, que é o formato que a AGT usa nas assinaturas. */
function formatarDataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Dois decimais e ponto decimal, independente da locale do sistema. */
function formatarValorAgt(valor: number): string {
  return valor.toFixed(2);
}

/**
 * Compara dois valores em cêntimos, não em `float`.
 *
 * `Math.abs(123 - 123.01)` dá `0.010000000000005116`, que é maior do que
 * `0.01` e transformava um arredondamento legítimo num erro de IVA. Contar
 * cêntimos arredondados diz o que se quer dizer e não depende da
 * representação binária.
 */
function excedeCentimos(real: number, declarado: number, cêntimos = 1): boolean {
  return Math.round(Math.abs(real - declarado) * 100) > cêntimos;
}

function formatarTipoDocumentoAgt(tipo: DocumentoAgt['tipo']): string {
  switch (tipo) {
    case 'fatura':
      return 'FT';
    case 'fatura_recibo':
      return 'FR';
    case 'nota_credito':
      return 'NC';
    case 'nota_debito':
      return 'ND';
  }
}

// =============================================================================
// NIF
// =============================================================================

/**
 * Valida um NIF angolano: 9 dígitos seguidos de 2 letras.
 *
 * É uma validação **de formato**, não de existência. A AGT é a única fonte
 * que sabe se um NIF está activo; daqui só se pode exigir que o número
 * tenha a forma que o arquivo oficial usa.
 */
export function validarNifAngola(nif: string): { valido: boolean; motivo?: string } {
  const limpo = nif.trim().toUpperCase().replace(/\s+/g, '');

  if (limpo.length === 0) return { valido: false, motivo: 'NIF vazio.' };
  if (!/^\d{9}[A-Z]{2}$/.test(limpo)) {
    return {
      valido: false,
      motivo: `NIF angolano tem de ter 9 dígitos e 2 letras; '${nif}' não tem essa forma.`,
    };
  }
  return { valido: true };
}

/**
 * Valida um NIF português por formato e dígito de controlo.
 *
 * O dígito de controlo é público e verificável, por isso esta validação é
 * forte: apanha um NIF digitado com um dígito errado, que é o erro mais
 * comum e o que mais devolve rejeições da AT.
 */
export function validarNifPortugal(nif: string): { valido: boolean; motivo?: string } {
  const limpo = nif.trim().toUpperCase().replace(/[\s.-]/g, '');

  if (limpo.length === 0) return { valido: false, motivo: 'NIF vazio.' };

  const inicio = limpo.startsWith('PT') ? limpo.slice(2) : limpo;
  if (!/^\d{9}$/.test(inicio)) {
    return { valido: false, motivo: `NIF português tem de ter 9 dígitos; recebeu '${nif}'.` };
  }

  const pesos = [9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(inicio[i]) * pesos[i];
  const controlo = 11 - (soma % 11);
  const esperado = controlo >= 10 ? 0 : controlo;

  if (Number(inicio[8]) !== esperado) {
    return {
      valido: false,
      motivo: `Dígito de controlo inválido no NIF '${nif}' (esperava ${esperado}).`,
    };
  }
  return { valido: true };
}

// =============================================================================
// Assinatura
// =============================================================================

/**
 * Calcula a assinatura `ATC-UD` de um documento.
 *
 * @returns Digest SHA-1 em Base64, o formato que a AGT usa no rodapé do A4.
 */
export function calcularAssinatura(params: ParametrosAssinatura): string {
  const concatenado = CAMPOS_ASSINATURA.map((campo) => base64(campo(params))).join('');
  return createHash('sha1').update(concatenado, 'utf8').digest('base64');
}

/**
 * Campos da assinatura com o valor já codificado, para diagnóstico.
 *
 * Serve para comparar campo a campo com o que o software certificado
 * produziu. É isto que permite diagnosticar uma divergência de assinatura
 * sem ter de adivinhar.
 */
export function detalharAssinatura(params: ParametrosAssinatura): Array<{ campo: string; valor: string }> {
  return CAMPOS_ASSINATURA.map((campo, indice) => ({
    campo: NOMES_CAMPOS_ASSINATURA[indice],
    valor: base64(campo(params)),
  }));
}

// =============================================================================
// Conformidade
// =============================================================================

/**
 * Verifica a conformidade AGT de um documento.
 *
 * Não escreve nada. É uma função pura: a mesma entrada dá sempre a mesma
 * saída, o que a torna testável e permite mostrar o resultado na UI antes
 * de o operador decidir gravar.
 */
export function verificarConformidade(
  documento: DocumentoAgt,
  contexto: { moedaEsperada?: string; nifEmpresa: string; exigirAssinatura?: boolean } = {
    nifEmpresa: '',
  },
): ResultadoConformidade {
  const problemas: ProblemaConformidade[] = [];
  const moedaEsperada = contexto.moedaEsperada ?? MOEDA_AGT;

  const erro = (codigo: string, mensagem: string, campo?: string) =>
    problemas.push({ codigo, severidade: 'erro', mensagem, campo });
  const aviso = (codigo: string, mensagem: string, campo?: string) =>
    problemas.push({ codigo, severidade: 'aviso', mensagem, campo });

  // --- Emitente -------------------------------------------------------------
  const nifEmitente = validarNifAngola(contexto.nifEmpresa);
  if (!nifEmitente.valido) {
    erro('AGT-001', `NIF do emitente inválido: ${nifEmitente.motivo}`, 'nifEmpresa');
  }

  // --- Moeda ----------------------------------------------------------------
  if (documento.moeda !== moedaEsperada) {
    erro(
      'AGT-002',
      `Moeda '${documento.moeda}' não é a moeda esperada '${moedaEsperada}' para este regime fiscal.`,
      'moeda',
    );
  }

  // --- Identificação do documento ------------------------------------------
  if (!documento.numero.trim()) {
    erro('AGT-003', 'Documento sem número.', 'numero');
  }
  if (!documento.serie.trim()) {
    aviso('AGT-004', 'Documento sem série; a AGT espera série e número separados.', 'serie');
  }

  // --- Destinatário ---------------------------------------------------------
  const nifCliente = validarNifAngola(documento.clienteNif);
  if (!nifCliente.valido) {
    // Consumidor final é aceite sem NIF; a AGT distingue-o por código, mas
    // sem esse código não dá para dizer se a falta é erro ou consumidor.
    aviso(
      'AGT-005',
      `NIF do cliente ausente ou inválido (${nifCliente.motivo}). Confirme que é consumidor final.`,
      'clienteNif',
    );
  }
  if (!documento.clienteNome.trim()) {
    erro('AGT-006', 'Documento sem nome do cliente.', 'clienteNome');
  }

  // --- Datas ----------------------------------------------------------------
  if (documento.dataVencimento < documento.dataEmissao) {
    erro('AGT-007', 'Data de vencimento anterior à data de emissão.', 'dataVencimento');
  }
  if (documento.dataEmissao.getTime() > Date.now()) {
    aviso('AGT-008', 'Documento com data de emissão no futuro.', 'dataEmissao');
  }

  // --- Coerência de valores -------------------------------------------------
  const brutoCalculado = documento.totalIliquido + documento.totalIva;
  if (excedeCentimos(documento.totalLiquido, brutoCalculado)) {
    erro(
      'AGT-009',
      `Total (${documento.totalLiquido.toFixed(2)}) não bate com ilíquido + IVA (${brutoCalculado.toFixed(2)}).`,
      'totalLiquido',
    );
  }

  if (documento.totalLiquido <= 0 && documento.tipo !== 'nota_credito') {
    erro('AGT-010', 'Documento de venda com valor total zero.', 'totalLiquido');
  }

  // --- Linhas ---------------------------------------------------------------
  if (documento.linhas.length === 0) {
    erro('AGT-011', 'Documento sem linhas.', 'linhas');
  }

  const somaLinhas = documento.linhas.reduce((soma, l) => soma + l.totalLinha, 0);
  if (documento.linhas.length > 0 && excedeCentimos(Math.abs(somaLinhas), Math.abs(documento.totalLiquido))) {
    erro(
      'AGT-012',
      `Soma das linhas (${somaLinhas.toFixed(2)}) não bate com o total do documento (${documento.totalLiquido.toFixed(2)}).`,
      'linhas',
    );
  }

  for (const [indice, linha] of documento.linhas.entries()) {
    if (linha.taxaIva < 0 || linha.taxaIva > 50) {
      aviso(
        'AGT-013',
        `Taxa de IVA fora da gama habitual (${linha.taxaIva.toFixed(2)}%) na linha ${indice + 1}.`,
        `linhas[${indice}].taxaIva`,
      );
    }
  }

  // --- Estado e assinatura --------------------------------------------------
  if (documento.estadoDocumento === 'anulado') {
    aviso('AGT-014', 'Documento anulado: não deve ser submetido à AGT.', 'estadoDocumento');
  }

  if (contexto.exigirAssinatura) {
    if (!documento.hashAssinatura) {
      erro('AGT-015', 'Documento sem assinatura (ATC-UD).', 'hashAssinatura');
    } else if (documento.atcud && documento.hashAssinatura !== documento.atcud) {
      erro(
        'AGT-016',
        'A assinatura gravada não corresponde ao ATC-UD; o documento foi alterado depois de assinado.',
        'hashAssinatura',
      );
    }
  }

  const erros = problemas.filter((p) => p.severidade === 'erro').length;
  const avisos = problemas.length - erros;

  return {
    conforme: erros === 0,
    problemas,
    resumo: { erros, avisos },
  };
}

// =============================================================================
// Serviço
// =============================================================================

export interface GerarFicheiroAgtParams {
  empresaId: string;
  utilizadorId?: string | null;
  software: SoftwareAgt;
  /** Configuração fiscal da empresa. */
  nifEmpresa: string;
  moeda: string;
  nomeEmpresa: string;
  /** Documentos do período, já carregados pelo chamador. */
  documentos: DocumentoAgt[];
  ano: number;
  /**
   * `null` é o ano civil inteiro.
   *
   * Não se traduz para Dezembro: o relatório anual é gerado com
   * `mes: null` e o nome do ficheiro e o `periodo` reflectem o ano, para não
   * arquivar um ficheiro de doze meses como se fosse só o último.
   */
  mes: number | null;
  /** XML ou conteúdo do ficheiro, para efeitos de hash e de custódia. */
  conteudo: string;
  nomeFicheiro?: string;
}

export interface FicheiroAgtGerado {
  id: string;
  nomeFicheiro: string;
  hashFicheiro: string;
  versao: string;
  periodo: string;
  conformidade: ResultadoConformidade;
  /** Uma linha por documento, para a UI mostrar o estado sem refazer a validação. */
  documentos: Array<{
    id: string;
    numero: string;
    conforme: boolean;
    assinatura: string | null;
    problemas: ProblemaConformidade[];
  }>;
}

export class FiscalAgtService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Gera e regista um ficheiro AGT no rastreio local.
   *
   * Regista mesmo que a conformidade falhe: um ficheiro não conforme é
   * exactamente o que o operador precisa de ver para corrigir, e perdê-lo do
   * histórico seria pior do que guardá-lo marcado como inválido.
   */
  async gerarFicheiro(params: GerarFicheiroAgtParams): Promise<FicheiroAgtGerado> {
    if (params.documentos.length === 0) {
      throw new ValidationError('Não há documentos no período: não há ficheiro para gerar.');
    }
    if (params.ano < 2000 || params.ano > 2100) {
      throw new ValidationError(`Ano inválido: ${params.ano}.`);
    }
    if (params.mes !== null && (params.mes < 1 || params.mes > 12)) {
      throw new ValidationError(`Mês inválido: ${params.mes}.`);
    }

    // `2026` ou `2026-12`: o período guardado tem de ser o que foi pedido.
    const periodo =
      params.mes === null
        ? String(params.ano)
        : `${params.ano}-${String(params.mes).padStart(2, '0')}`;
    const nomeFicheiro =
      params.nomeFicheiro ?? `AGT_${periodo.replace('-', '_')}.xml`;

    const porDocumento = params.documentos.map((documento) => {
      const conformidade = verificarConformidade(documento, {
        nifEmpresa: params.nifEmpresa,
        moedaEsperada: params.moeda,
      });
      return { documento, conformidade };
    });

    const problemas: ProblemaConformidade[] = porDocumento.flatMap((p) =>
      p.conformidade.problemas.map((problema) => ({
        ...problema,
        mensagem: `Documento ${p.documento.numero}: ${problema.mensagem}`,
      })),
    );
    const erros = problemas.filter((p) => p.severidade === 'erro').length;

    const conformidadePeriodo: ResultadoConformidade = {
      conforme: erros === 0,
      problemas,
      resumo: { erros, avisos: problemas.length - erros },
    };

    // A assinatura só é calculada para documentos conformes: assinar um
    // documento que não cumpre os requisitos cria uma assinatura que valida
    // um documento inválido.
    const documentos = porDocumento.map(({ documento, conformidade }) => {
      const assinatura = conformidade.conforme
        ? calcularAssinatura({
            empresaId: params.empresaId,
            nifEmpresa: params.nifEmpresa,
            documento,
            ...params.software,
          })
        : null;

      return {
        id: documento.id,
        numero: documento.numero,
        conforme: conformidade.conforme,
        assinatura,
        problemas: conformidade.problemas,
      };
    });

    const hashFicheiro = createHash('sha256').update(params.conteudo, 'utf8').digest('hex');

    const registo = await this.prisma.submissaoAgt.create({
      data: {
        id: randomUUID(),
        empresaId: params.empresaId,
        nomeFicheiro,
        versao: VERSAO_AGT,
        moeda: params.moeda,
        periodo,
        estado: conformidadePeriodo.conforme ? 'assinado' : 'rascunho',
        hashFicheiro,
        utilizadorId: params.utilizadorId ?? null,
        resultadoValidacao: JSON.stringify(conformidadePeriodo),
        observacoes: conformidadePeriodo.conforme
          ? null
          : `${erros} erro(s) de conformidade impedem a submissão.`,
      },
    });

    return {
      id: registo.id,
      nomeFicheiro,
      hashFicheiro,
      versao: VERSAO_AGT,
      periodo,
      conformidade: conformidadePeriodo,
      documentos,
    };
  }

  /**
   * Actualiza o estado de uma submissão a partir do que o operador
   * reportou do software certificado.
   *
   * Aceitar um ficheiro cuja hash não bate é o caminho para um histórico que
   * mente. Por isso o `hashRecebido` é obrigatório e tem de bater certo.
   */
  async registarResposta(
    submissaoId: string,
    resposta: { estado: EstadoSubmissao; respostaAgt: string; hashRecebido: string },
  ): Promise<void> {
    const submissao = await this.prisma.submissaoAgt.findUnique({ where: { id: submissaoId } });
    if (!submissao) throw new NotFoundError(`Submissão AGT não encontrada: ${submissaoId}`);

    if (resposta.hashRecebido !== submissao.hashFicheiro) {
      throw new ValidationError(
        `O hash do ficheiro recebido (${resposta.hashRecebido}) não corresponde ao que foi gerado (${submissao.hashFicheiro}).`,
      );
    }

    if (resposta.estado === 'aceite' && submissao.estado !== 'submetido') {
      throw new ValidationError('Só é possível aceitar uma submissão que já esteja em estado "submetido".');
    }

    await this.prisma.submissaoAgt.update({
      where: { id: submissaoId },
      data: {
        estado: resposta.estado,
        respostaAgt: resposta.respostaAgt,
        submittedAt: resposta.estado === 'submetido' || resposta.estado === 'aceite' ? new Date() : null,
      },
    });
  }

  /**
   * Confirma que uma submissão existe e pertence a esta empresa.
   *
   * O `findUnique` por `id` sozinho não chega: o `id` de uma submissão é
   * previsível e o controller precisa de saber se a submissão que vai alterar
   * é mesmo da empresa da sessão, antes de escrever estado nela.
   */
  async obterDeEmpresa(
    submissaoId: string,
    empresaId: string,
  ): Promise<{ id: string; empresaId: string; estado: EstadoSubmissao } | null> {
    return this.prisma.submissaoAgt.findFirst({
      where: { id: submissaoId, empresaId },
      select: { id: true, empresaId: true, estado: true },
    });
  }

  /** Histórico de ficheiros gerados, do mais recente para o mais antigo. */
  async listar(
    empresaId: string,
    opcoes: { estado?: EstadoSubmissao; limite?: number } = {},
  ): Promise<
    Array<{
      id: string;
      nomeFicheiro: string;
      versao: string;
      moeda: string;
      periodo: string;
      estado: EstadoSubmissao;
      hashFicheiro: string;
      hashAssinatura: string | null;
      conformidade: ResultadoConformidade | null;
      submittedAt: Date | null;
      dataHora: Date;
    }>
  > {
    const registos = await this.prisma.submissaoAgt.findMany({
      where: { empresaId, ...(opcoes.estado ? { estado: opcoes.estado } : {}) },
      orderBy: { dataHora: 'desc' },
      take: Math.min(opcoes.limite ?? 50, 200),
    });

    return registos.map((r) => ({
      id: r.id,
      nomeFicheiro: r.nomeFicheiro,
      versao: r.versao,
      moeda: r.moeda,
      periodo: r.periodo,
      estado: r.estado as EstadoSubmissao,
      hashFicheiro: r.hashFicheiro,
      hashAssinatura: r.hashAssinatura,
      conformidade: r.resultadoValidacao
        ? (JSON.parse(r.resultadoValidacao) as ResultadoConformidade)
        : null,
      submittedAt: r.submittedAt,
      dataHora: r.dataHora,
    }));
  }

  /**
   * Converte documentos do Prisma na forma que a validação usa.
   *
   * Separado da validação para que a função pura possa ser testada sem base
   * de dados, e para o mapeamento ter um sítio único onde mudar.
   */
  static paraDocumentoAgt(
    fatura: Prisma.FaturaVendaGetPayload<{ include: { linhas: true } }>,
    moeda: string,
  ): DocumentoAgt {
    const numero = new Prisma.Decimal(fatura.totalIliquido);
    return {
      id: fatura.id,
      numero: fatura.numero,
      serie: fatura.serie,
      tipo: fatura.tipo,
      dataEmissao: fatura.dataEmissao,
      dataVencimento: fatura.dataVencimento,
      clienteNome: fatura.clienteNome,
      clienteNif: fatura.clienteNif,
      totalIliquido: numero.toNumber(),
      totalIva: new Prisma.Decimal(fatura.totalIva).toNumber(),
      totalLiquido: new Prisma.Decimal(fatura.totalLiquido).toNumber(),
      moeda,
      atcud: fatura.atcud,
      hashAssinatura: fatura.hashAssinatura,
      estadoDocumento: fatura.estadoDocumento,
      linhas: fatura.linhas.map((l) => ({
        taxaIva: new Prisma.Decimal(l.taxaIva).toNumber(),
        totalLinha: new Prisma.Decimal(l.totalLinha).toNumber(),
      })),
    };
  }
}

export const fiscalAgtService = new FiscalAgtService();