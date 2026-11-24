/**
 * @file rh-recibos-pdf.service.ts
 * @description Geração de PDF para recibos de processamento (RH-502).
 *
 * Gera o recibo em formato PDF conforme RF-REC-01/03:
 * - Cabeçalho da empresa
 * - Dados do funcionário
 * - Período e tipo de processamento
 * - Rubricas (remunerações, descontos, encargos)
 * - Bases de incidência (INSS, IRT)
 * - Totais e líquido
 * - Assinatura
 */

import PDFDocument from 'pdfkit';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { RhNotFoundError } from '../utils/rh-errors';

const fmtMoeda = new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' });
const fmtData = new Intl.DateTimeFormat('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface DadosRecibo {
  recibo: {
    id: string;
    serie: string;
    ano: number;
    numero: number;
    estado: string;
    emitidoEm: Date;
    impressoes: number;
    anuladoEm: Date | null;
    processamento: {
      id: string;
      tipo: string;
      sequencia: number;
      modo: string;
      manual: boolean;
      dataProcessamento: Date;
      dataLimiteFaltasHE: Date | null;
      diasProcessados: number;
      moeda: string;
      totalRemuneracoes: Prisma.Decimal;
      totalDescontos: Prisma.Decimal;
      totalEncargos: Prisma.Decimal;
      liquido: Prisma.Decimal;
      baseINSS: Prisma.Decimal;
      baseIRT: Prisma.Decimal;
      inssTrabalhador: Prisma.Decimal;
      inssPatronal: Prisma.Decimal;
      irt: Prisma.Decimal;
      irtEscalaoId: string | null;
      snapshot: Prisma.JsonValue;
      funcionario: {
        id: string;
        codigo: string;
        nome: string;
        nif: string | null;
        documentoNumero: string | null;
        categoria: string | null;
        departamento: { id: string; nome: string } | null;
        cargo: { id: string; nome: string } | null;
        dataAdmissao: Date;
        formaPagamento: string;
        banco: string | null;
        iban: string | null;
        contrato: {
          id: string;
          salarioBase: Prisma.Decimal;
          tipo: string;
          dataInicio: Date;
          dataFim: Date | null;
        } | null;
      };
      itens: Array<{
        id: string;
        codigo: string;
        descricao: string;
        tipo: string;
        origem: string;
        quantidade: Prisma.Decimal | null;
        valorUnitario: Prisma.Decimal | null;
        valor: Prisma.Decimal;
        moeda: string;
        taxaCambio: Prisma.Decimal | null;
        incideIRT: boolean;
        incideINSS: boolean;
        ordem: number;
      }>;
    };
  };
}

interface EscalaoIRT {
  ordem: number;
  rendimentoDe: Prisma.Decimal;
  rendimentoAte: Prisma.Decimal | null;
  parcelaFixa: Prisma.Decimal;
  taxa: Prisma.Decimal;
  excessoDe: Prisma.Decimal;
}

export class RhRecibosPdfService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Gera o PDF do recibo e retorna o buffer.
   */
  async gerarPdf(reciboId: string): Promise<Buffer> {
    const dados = await this.obterDados(reciboId);
    return this.renderPdf(dados);
  }

  /**
   * Gera PDFs em lote para múltiplos recibos.
   * Retorna array de buffers na mesma ordem dos IDs fornecidos.
   */
  async gerarPdfLote(reciboIds: string[]): Promise<Buffer[]> {
    const resultados: Buffer[] = [];
    for (const id of reciboIds) {
      const pdf = await this.gerarPdf(id);
      resultados.push(pdf);
    }
    return resultados;
  }

  /**
   * Incrementa o contador de impressões do recibo.
   */
  async incrementarImpressoes(reciboId: string): Promise<void> {
    await this.prisma.rhRecibo.update({
      where: { id: reciboId },
      data: { impressoes: { increment: 1 } },
    });
  }

  private async obterDados(reciboId: string): Promise<DadosRecibo> {
    const recibo = await this.prisma.rhRecibo.findUnique({
      where: { id: reciboId },
      include: {
        processamento: {
          include: {
            funcionario: {
              include: {
                departamento: true,
                cargo: true,
                contratos: {
                  where: { estado: 'ATIVO' },
                  take: 1,
                  orderBy: { dataInicio: 'desc' },
                },
              },
            },
            itens: {
              orderBy: { ordem: 'asc' },
            },
          },
        },
      },
    });

    if (!recibo) {
      throw new RhNotFoundError(`Recibo ${reciboId} não encontrado.`);
    }

    // `renderPdf` lê `{ recibo: {...} }` — o registo devolvido pelo Prisma é a
    // própria estrutura do recibo.
    return { recibo } as unknown as DadosRecibo;
  }

  private async renderPdf(dados: DadosRecibo): Promise<Buffer> {
    const { recibo } = dados;
    const p = recibo.processamento;
    const escalaoInfo = p.irtEscalaoId ? await this.obterEscalao(p.irtEscalaoId) : null;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const f = p.funcionario;

      // Título
      doc.fontSize(16).font('Helvetica-Bold').text('RECIBO DE VENCIMENTO', { align: 'center' });
      doc.moveDown(0.5);

      // Série/Número
      doc.fontSize(10).font('Helvetica').text(`Série: ${recibo.serie}  Ano: ${recibo.ano}  Número: ${String(recibo.numero).padStart(4, '0')}`, { align: 'center' });
      doc.moveDown(0.5);

      // Estado
      const estadoLabel = recibo.estado === 'EMITIDO' ? 'EMITIDO' : 'ANULADO';
      doc.fontSize(9).font('Helvetica-Oblique').text(`Estado: ${estadoLabel}`, { align: 'center' });
      if (recibo.anuladoEm) {
        doc.text(`Anulado em: ${fmtData.format(recibo.anuladoEm)}`, { align: 'center' });
      }
      doc.moveDown(1);

      // Linha separadora
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // Empresa (cabeçalho)
      doc.fontSize(11).font('Helvetica-Bold').text('DORAERP SOLUÇÕES EMPRESARIAIS, LDA.', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text('Recibo de Processamento de Salários', { align: 'center' });
      doc.moveDown(1);

      // Dados do funcionário
      doc.fontSize(10).font('Helvetica-Bold').text('DADOS DO FUNCIONÁRIO');
      doc.moveDown(0.3);
      this.addLinha(doc, 'Nome:', f?.nome ?? '—');
      this.addLinha(doc, 'Código:', f?.codigo ?? '—');
      this.addLinha(doc, 'NIF/BI:', f?.nif ?? f?.documentoNumero ?? '—');
      this.addLinha(doc, 'Categoria:', f?.categoria ?? '—');
      this.addLinha(doc, 'Departamento:', f?.departamento?.nome ?? '—');
      this.addLinha(doc, 'Cargo:', f?.cargo?.nome ?? '—');
      this.addLinha(doc, 'Data Admissão:', f?.dataAdmissao ? fmtData.format(f.dataAdmissao) : '—');
      this.addLinha(doc, 'Forma Pagamento:', f?.formaPagamento ?? '—');
      this.addLinha(doc, 'Banco/IBAN:', `${f?.banco ?? '—'} / ${f?.iban ?? '—'}`);
      doc.moveDown(0.5);

      // Período e processamento
      doc.fontSize(10).font('Helvetica-Bold').text('PERÍODO E PROCESSAMENTO');
      doc.moveDown(0.3);
      const tipoLabel = this.tipoLabel(p.tipo);
      this.addLinha(doc, 'Tipo:', `${tipoLabel}${p.sequencia > 1 ? ` #${p.sequencia}` : ''}`);
      this.addLinha(doc, 'Modo:', p.modo === 'INDIVIDUAL' ? 'Individual' : 'Em lote');
      this.addLinha(doc, 'Data Processamento:', fmtData.format(p.dataProcessamento));
      if (p.dataLimiteFaltasHE) {
        this.addLinha(doc, 'Data Limite Faltas/HE:', fmtData.format(p.dataLimiteFaltasHE));
      }
      this.addLinha(doc, 'Dias Processados:', String(p.diasProcessados));
      this.addLinha(doc, 'Moeda:', p.moeda);
      if (p.manual) {
        this.addLinha(doc, 'Ajustes manuais:', 'Sim');
      }
      doc.moveDown(0.5);

      // Rubricas - Remunerações
      const remuneracoes = p.itens.filter((i) => i.tipo === 'REMUNERACAO');
      const descontos = p.itens.filter((i) => i.tipo === 'DESCONTO');
      const encargos = p.itens.filter((i) => i.tipo === 'ENCARGO_PATRONAL');

      if (remuneracoes.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('REMUNERAÇÕES');
        doc.moveDown(0.3);
        this.tabelaRubricas(doc, remuneracoes);
        doc.moveDown(0.5);
      }

      // Rubricas - Descontos
      if (descontos.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('DESCONTOS');
        doc.moveDown(0.3);
        this.tabelaRubricas(doc, descontos);
        doc.moveDown(0.5);
      }

      // Rubricas - Encargos Patronais
      if (encargos.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('ENCARGOS PATRONAIS');
        doc.moveDown(0.3);
        this.tabelaRubricas(doc, encargos);
        doc.moveDown(0.5);
      }

      // Bases e impostos
      doc.fontSize(10).font('Helvetica-Bold').text('BASES DE INCIDÊNCIA E IMPOSTOS');
      doc.moveDown(0.3);
      this.addLinha(doc, 'Base INSS:', fmtMoeda.format(Number(p.baseINSS) || 0));
      this.addLinha(doc, 'Base IRT:', fmtMoeda.format(Number(p.baseIRT) || 0));
      this.addLinha(doc, 'INSS Trabalhador:', fmtMoeda.format(Number(p.inssTrabalhador) || 0));
      this.addLinha(doc, 'INSS Patronal:', fmtMoeda.format(Number(p.inssPatronal) || 0));
      this.addLinha(doc, 'IRT:', fmtMoeda.format(Number(p.irt) || 0));
      if (escalaoInfo) {
        this.addLinha(doc, `Escalão IRT (${escalaoInfo.ordem}):`, `De ${fmtMoeda.format(Number(escalaoInfo.rendimentoDe) || 0)}${escalaoInfo.rendimentoAte ? ` a ${fmtMoeda.format(Number(escalaoInfo.rendimentoAte) || 0)}` : '+'} — Parcela fixa ${fmtMoeda.format(Number(escalaoInfo.parcelaFixa) || 0)} + ${Number(escalaoInfo.taxa) || 0}% sobre excesso de ${fmtMoeda.format(Number(escalaoInfo.excessoDe) || 0)}`);
      }
      doc.moveDown(0.5);

      // Totais
      doc.fontSize(11).font('Helvetica-Bold').text('TOTAIS');
      doc.moveDown(0.3);
      this.addLinha(doc, 'Total Remunerações:', fmtMoeda.format(Number(p.totalRemuneracoes) || 0));
      this.addLinha(doc, 'Total Descontos:', fmtMoeda.format(Number(p.totalDescontos) || 0));
      this.addLinha(doc, 'Total Encargos Patronais:', fmtMoeda.format(Number(p.totalEncargos) || 0));
      doc.moveDown(0.2);
      doc.fontSize(12).font('Helvetica-Bold').text(`LÍQUIDO A RECEBER: ${fmtMoeda.format(Number(p.liquido) || 0)}`, { align: 'right' });
      doc.moveDown(1);

      // Assinatura
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);
      doc.fontSize(9).font('Helvetica').text('_________________________________', { align: 'center' });
      doc.text('Assinatura do Funcionário', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica-Oblique').text(`Emitido em ${fmtData.format(recibo.emitidoEm)} — Impressão nº ${recibo.impressoes + 1}`, { align: 'center' });

      doc.end();
    });
  }

  private addLinha(doc: PDFKit.PDFDocument, label: string, valor: string): void {
    doc.font('Helvetica-Bold').text(label, { continued: true, width: 180 });
    doc.font('Helvetica').text(` ${valor}`);
  }

  private tabelaRubricas(doc: PDFKit.PDFDocument, itens: DadosRecibo['recibo']['processamento']['itens']): void {
    const colunas = [
      { label: 'Código', width: 60, align: 'left' as const },
      { label: 'Descrição', width: 200, align: 'left' as const },
      { label: 'Origem', width: 70, align: 'left' as const },
      { label: 'Qtd.', width: 50, align: 'right' as const },
      { label: 'Valor Unit.', width: 80, align: 'right' as const },
      { label: 'Valor', width: 80, align: 'right' as const },
      { label: 'IRT', width: 30, align: 'center' as const },
      { label: 'INSS', width: 30, align: 'center' as const },
    ];

    // Cabeçalho
    let xPos = doc.x;
    doc.font('Helvetica-Bold').fontSize(8);
    for (const col of colunas) {
      doc.text(col.label, xPos, doc.y, { width: col.width, align: col.align });
      xPos += col.width + 5;
    }
    doc.moveDown(0.3);

    // Linhas
    doc.font('Helvetica').fontSize(8);
    for (const item of itens) {
      xPos = doc.x;
      if (doc.y > 700) {
        doc.addPage();
        xPos = doc.x;
      }
      const valores = [
        item.codigo,
        item.descricao,
        this.origemLabel(item.origem),
        item.quantidade !== null ? Number(item.quantidade).toLocaleString('pt-AO') : '—',
        item.valorUnitario !== null ? fmtMoeda.format(Number(item.valorUnitario) || 0) : '—',
        fmtMoeda.format(Number(item.valor) || 0),
        item.incideIRT ? '✓' : '—',
        item.incideINSS ? '✓' : '—',
      ];
      for (let i = 0; i < colunas.length; i++) {
        doc.text(valores[i], xPos, doc.y, { width: colunas[i].width, align: colunas[i].align });
        xPos += colunas[i].width + 5;
      }
      doc.moveDown(0.25);
    }
  }

  private tipoLabel(tipo: string): string {
    const map: Record<string, string> = {
      VENCIMENTO: 'Vencimento',
      SUBSIDIO_FERIAS: 'Subsídio de Férias',
      SUBSIDIO_NATAL: 'Subsídio de Natal',
      EXTRAORDINARIO: 'Extraordinário',
      FIM_CONTRATO: 'Fim de Contrato',
    };
    return map[tipo] ?? tipo;
  }

  private origemLabel(origem: string): string {
    const map: Record<string, string> = {
      AUTOMATICO: 'Automático',
      MANUAL: 'Manual',
      ALTERACAO_MENSAL: 'Alteração Mensal',
      AUSENCIA: 'Ausência',
      HORA_EXTRA: 'Hora Extra',
      PRESTACAO: 'Prestação',
      RETROATIVO: 'Retroactivo',
      FERIAS: 'Férias',
    };
    return map[origem] ?? origem;
  }

  private async obterEscalao(id: string): Promise<EscalaoIRT | null> {
    const esc = await this.prisma.rhEscalaoIRT.findUnique({ where: { id } });
    return esc as unknown as EscalaoIRT | null;
  }
}

export const rhRecibosPdfService = new RhRecibosPdfService();