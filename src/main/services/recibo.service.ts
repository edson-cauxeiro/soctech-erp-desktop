/**
 * @file recibo.service.ts
 * @description Serviço de regras de negócio para Recibos de Venda (RC) e Imputações a Faturas.
 */

import { PrismaClient, ReciboVenda, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { documentoNumeroService, DocumentoNumeroService } from './documento-numero.service';
import {
  criarReciboSchema,
  imputarReciboSchema,
  anularReciboSchema,
  reciboFiltersSchema,
  CriarReciboInput,
  ReciboFilters,
} from '../validators/recibo.validator';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { contaDoDocumento } from './dados-bancarios-documento';
import {
  IntegracaoContabilService,
  integracaoContabilService,
} from './integracao-contabil.service';
import { integrarDepoisCommit } from './integracao-contabil-helpers';

/** Meios de pagamento que significam dinheiro físico e exigem caixa aberta. */
const MEIOS_NUMERICOS = new Set(['numerario', 'multicaixa']);

export class ReciboService {
  private prisma: PrismaClient;
  private docNumeroService: DocumentoNumeroService;
  private integracao: IntegracaoContabilService;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    docNumService: DocumentoNumeroService = documentoNumeroService,
    integracao: IntegracaoContabilService = integracaoContabilService
  ) {
    this.prisma = prismaClient;
    this.docNumeroService = docNumService;
    this.integracao = integracao;
  }

  async list(filters?: unknown): Promise<{ items: ReciboVenda[]; total: number }> {
    const validated: ReciboFilters = filters ? reciboFiltersSchema.parse(filters) : { skip: 0, take: 100 };

    const where: Prisma.ReciboVendaWhereInput = {};

    if (validated.empresaId) where.empresaId = validated.empresaId;
    if (validated.clienteId) where.clienteId = validated.clienteId;
    if (validated.estadoDocumento) where.estadoDocumento = validated.estadoDocumento as any;

    if (validated.search) {
      const s = validated.search;
      where.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { clienteNome: { contains: s, mode: 'insensitive' } },
        { clienteNif: { contains: s, mode: 'insensitive' } },
        { contaBancaria: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (validated.dataInicio || validated.dataFim) {
      where.data = {
        ...(validated.dataInicio && { gte: validated.dataInicio }),
        ...(validated.dataFim && { lte: validated.dataFim }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.reciboVenda.findMany({
        where,
        include: {
          empresa: true,
          cliente: true,
          imputacoes: {
            include: { fatura: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: validated.skip,
        take: validated.take,
      }),
      this.prisma.reciboVenda.count({ where }),
    ]);

    return { items, total };
  }

  async get(id: string): Promise<ReciboVenda> {
    const recibo = await this.prisma.reciboVenda.findUnique({
      where: { id },
      include: {
        empresa: true,
        cliente: true,
        imputacoes: {
          include: { fatura: true },
        },
      },
    });

    if (!recibo) {
      throw new NotFoundError(`Recibo de venda '${id}' não encontrado.`);
    }

    return recibo;
  }

  async criar(rawInput: unknown): Promise<ReciboVenda> {
    const data: CriarReciboInput = criarReciboSchema.parse(rawInput);

    const empresa = await this.prisma.empresaConfig.findUnique({ where: { id: data.empresaId } });
    if (!empresa) throw new NotFoundError(`Empresa '${data.empresaId}' não encontrada.`);

    const cliente = await this.prisma.cliente.findUnique({ where: { id: data.clienteId } });
    if (!cliente) throw new NotFoundError(`Cliente '${data.clienteId}' não encontrado.`);

    const conta = await this.prisma.contaBancaria.findUnique({
      where: { id: data.contaBancariaId },
    });
    if (!conta) throw new NotFoundError(`Conta bancária '${data.contaBancariaId}' não encontrada.`);
    if (conta.empresaId !== data.empresaId) {
      throw new NotFoundError(`Conta bancária '${data.contaBancariaId}' não encontrada.`);
    }
    if (!conta.ativo) {
      throw new BusinessRuleError(`A conta '${conta.designacao}' está inactiva e não pode receber o pagamento.`);
    }

    // Um recibo é dinheiro que entrou. Em numerário a caixa tem de estar
    // aberta, senão a arqueação no fecho do dia não bate certo.
    let sessaoCaixaId: string | null = null;
    if (conta.tipo === 'caixa' && MEIOS_NUMERICOS.has(data.meioPagamento)) {
      const sessao = await this.prisma.sessaoCaixa.findFirst({
        where: { contaCaixaId: conta.id, empresaId: data.empresaId, estado: 'aberta' },
        select: { id: true },
      });
      if (!sessao) {
        throw new BusinessRuleError(
          `A conta de caixa '${conta.designacao}' não tem sessão aberta. Abra a sessão de caixa antes de emitir o recibo.`
        );
      }
      sessaoCaixaId = sessao.id;
    }

    // Validar total das imputações
    const totalImputado = (data.imputacoes || []).reduce((acc, imp) => acc + imp.valorImputado, 0);
    if (totalImputado > data.valorRecebido) {
      throw new BusinessRuleError(
        `O total imputado (${totalImputado}) não pode ser superior ao valor total recebido (${data.valorRecebido}).`
      );
    }

    // Validar cada fatura imputada
    if (data.imputacoes && data.imputacoes.length > 0) {
      for (const imp of data.imputacoes) {
        const fatura = await this.prisma.faturaVenda.findUnique({
          where: { id: imp.faturaId },
          include: { imputacoesRecibo: true },
        });

        if (!fatura) throw new NotFoundError(`Fatura '${imp.faturaId}' não encontrada.`);
        if (fatura.clienteId !== data.clienteId) {
          throw new BusinessRuleError(`A fatura '${fatura.numero}' não pertence ao cliente selecionado.`);
        }
        if (fatura.estadoDocumento === 'anulado') {
          throw new BusinessRuleError(`Não é possível imputar pagamento à fatura anulada '${fatura.numero}'.`);
        }

        const jaImputado = fatura.imputacoesRecibo.reduce((sum, i) => sum + Number(i.valorImputado), 0);
        const pendente = Number(fatura.totalLiquido) - jaImputado;

        if (imp.valorImputado > pendente + 0.0001) {
          throw new BusinessRuleError(
            `Valor imputado (${imp.valorImputado}) excede o saldo pendente (${pendente}) da fatura '${fatura.numero}'.`
          );
        }
      }
    }

    const recibo = await this.prisma.$transaction(async (tx) => {
      const numero = await this.docNumeroService.reservarNumero(tx, 'RC', data.serie, data.empresaId);

      const recibo = await tx.reciboVenda.create({
        data: {
          numero,
          serie: data.serie,
          empresaId: data.empresaId,
          data: data.data,
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          clienteNif: cliente.nif,
          clienteEndereco: `${cliente.endereco || ''}${cliente.cidade ? `, ${cliente.cidade}` : ''}`,
          meioPagamento: data.meioPagamento,
          valorRecebido: data.valorRecebido,
          contaBancaria: data.contaBancaria || conta.designacao,
          contaBancariaId: conta.id,
          sessaoCaixaId,
          retencaoFonte: data.retencaoFonte || 0,
          observacoes: data.observacoes || null,
          estadoDocumento: 'emitido',
          imputacoes: {
            create: (data.imputacoes || []).map((imp) => ({
              faturaId: imp.faturaId,
              valorImputado: imp.valorImputado,
            })),
          },
        },
        include: {
          empresa: true,
          cliente: true,
          imputacoes: { include: { fatura: true } },
        },
      });

      // Reconciliar estado de pagamento de cada fatura
      if (data.imputacoes && data.imputacoes.length > 0) {
        for (const imp of data.imputacoes) {
          await this.reconciliarEstadoFatura(tx, imp.faturaId);
        }
      }

      // O recibo é dinheiro recebido: o crédito na tesouraria é criado na
      // mesma transação. Sem isto, a fatura ficaria "paga" e o dinheiro
      // simplesmente não existiria em lado nenhum.
      const numeroTes = await this.docNumeroService.reservarNumero(tx, 'TS', 'TES', data.empresaId);

      await tx.movimentoTesouraria.create({
        data: {
          empresaId: data.empresaId,
          numero: numeroTes,
          data: data.data,
          tipo: 'entrada',
          contaOrigemId: null,
          contaDestinoId: conta.id,
          valor: data.valorRecebido,
          documentoTipo: 'recibo_venda',
          documentoId: recibo.id,
          documentoNumero: recibo.numero,
          descricao: `Recebimento de ${recibo.numero} — ${cliente.nome}`,
          estado: 'confirmado',
          meioPagamento: data.meioPagamento,
          sessaoCaixaId,
        },
      });

      return recibo;
    });

    // Um recibo é dinheiro entrado: contabiliza depois do commit, sem fazer
    // rollback do recibo se o motor não estiver configurado.
    await integrarDepoisCommit(`recibo ${recibo.serie}/${recibo.numero}`, () =>
      this.integracao.contabilizarReciboVenda({
        empresaId: recibo.empresaId ?? data.empresaId,
        reciboId: recibo.id,
        numeroRecibo: `${recibo.serie}/${recibo.numero}`,
        dados: {
          total: Number(recibo.valorRecebido),
          dataContabilistica: recibo.data,
          dataDocumento: recibo.data,
          descricao: `Recibo ${recibo.serie}/${recibo.numero} — ${recibo.clienteNome}`,
        },
      })
    );

    return recibo;
  }

  async imputarFaturas(id: string, imputacoesInput: Array<{ faturaId: string; valorImputado: number }>) {
    imputarReciboSchema.parse({ id, imputacoes: imputacoesInput });

    const recibo = await this.get(id);
    if (recibo.estadoDocumento === 'anulado') {
      throw new BusinessRuleError(`Não é possível imputar recibo anulado '${recibo.numero}'.`);
    }

    const jaImputado = (recibo as any).imputacoes.reduce((sum: number, i: any) => sum + Number(i.valorImputado), 0);
    const novoImputado = imputacoesInput.reduce((sum, i) => sum + i.valorImputado, 0);

    if (jaImputado + novoImputado > Number(recibo.valorRecebido) + 0.0001) {
      throw new BusinessRuleError(
        `O total imputado (${jaImputado + novoImputado}) excede o valor disponível do recibo (${recibo.valorRecebido.toString()}).`
      );
    }

    // Validar faturas
    for (const imp of imputacoesInput) {
      const fatura = await this.prisma.faturaVenda.findUnique({
        where: { id: imp.faturaId },
        include: { imputacoesRecibo: true },
      });

      if (!fatura) throw new NotFoundError(`Fatura '${imp.faturaId}' não encontrada.`);
      if (fatura.clienteId !== recibo.clienteId) {
        throw new BusinessRuleError(`A fatura '${fatura.numero}' não pertence ao mesmo cliente do recibo.`);
      }
      if (fatura.estadoDocumento === 'anulado') {
        throw new BusinessRuleError(`Não é possível imputar a fatura anulada '${fatura.numero}'.`);
      }

      const fJaImputado = fatura.imputacoesRecibo.reduce((sum, i) => sum + Number(i.valorImputado), 0);
      const pendente = Number(fatura.totalLiquido) - fJaImputado;

      if (imp.valorImputado > pendente + 0.0001) {
        throw new BusinessRuleError(
          `Valor a imputar (${imp.valorImputado}) excede o saldo pendente (${pendente}) da fatura '${fatura.numero}'.`
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const imp of imputacoesInput) {
        await tx.imputacaoRecibo.create({
          data: {
            reciboId: recibo.id,
            faturaId: imp.faturaId,
            valorImputado: imp.valorImputado,
          },
        });
        await this.reconciliarEstadoFatura(tx, imp.faturaId);
      }

      return tx.reciboVenda.findUniqueOrThrow({
        where: { id: recibo.id },
        include: {
          empresa: true,
          cliente: true,
          imputacoes: { include: { fatura: true } },
        },
      });
    });
  }

  async anular(id: string, motivo: string): Promise<ReciboVenda> {
    anularReciboSchema.parse({ id, motivo });

    const recibo = await this.get(id);
    if (recibo.estadoDocumento === 'anulado') {
      throw new BusinessRuleError(`O recibo '${recibo.numero}' já se encontra anulado.`);
    }

    const faturasAfetadas = (recibo as any).imputacoes.map((i: any) => i.faturaId);

    return this.prisma.$transaction(async (tx) => {
      // Estornar o crédito na tesouraria. Anular um recibo tem de devolver o
      // dinheiro à sua conta, senão o caixa ficaria com um depósito fantasma.
      const movimento = await tx.movimentoTesouraria.findFirst({
        where: { documentoTipo: 'recibo_venda', documentoId: recibo.id, estado: 'confirmado' },
      });

      if (movimento) {
        const numeroTes = await this.docNumeroService.reservarNumero(tx, 'TS', 'TES', recibo.empresaId!);

        await tx.movimentoTesouraria.create({
          data: {
            empresaId: recibo.empresaId,
            numero: numeroTes,
            data: new Date(),
            tipo: 'saida',
            contaOrigemId: movimento.contaDestinoId,
            contaDestinoId: null,
            valor: movimento.valor,
            documentoTipo: 'recibo_venda',
            documentoId: recibo.id,
            documentoNumero: recibo.numero,
            descricao: `Estorno de ${recibo.numero}: ${motivo}`,
            estado: 'confirmado',
            meioPagamento: movimento.meioPagamento,
            sessaoCaixaId: movimento.sessaoCaixaId,
            movimentoEstornoId: movimento.id,
          },
        });

        await tx.movimentoTesouraria.update({
          where: { id: movimento.id },
          data: { estado: 'estornado', conciliado: false, dataConciliacao: null },
        });
      }

      // Remover imputações
      await tx.imputacaoRecibo.deleteMany({
        where: { reciboId: recibo.id },
      });

      // Anular recibo
      const updated = await tx.reciboVenda.update({
        where: { id: recibo.id },
        data: {
          estadoDocumento: 'anulado',
          motivoAnulacao: motivo,
          anuladaEm: new Date(),
        },
        include: {
          empresa: true,
          cliente: true,
          imputacoes: true,
        },
      });

      // Reconciliar faturas afetadas
      for (const fatId of faturasAfetadas) {
        await this.reconciliarEstadoFatura(tx, fatId);
      }

      return updated;
    });
  }

  private async reconciliarEstadoFatura(tx: Prisma.TransactionClient, faturaId: string) {
    const fatura = await tx.faturaVenda.findUnique({
      where: { id: faturaId },
      include: { imputacoesRecibo: true },
    });

    if (!fatura) return;

    const totalImputado = fatura.imputacoesRecibo.reduce((sum, i) => sum + Number(i.valorImputado), 0);
    const totalLiquido = Number(fatura.totalLiquido);

    let novoEstado: 'pago' | 'parcial' | 'pendente' = 'pendente';
    if (totalImputado >= totalLiquido - 0.0001) {
      novoEstado = 'pago';
    } else if (totalImputado > 0) {
      novoEstado = 'parcial';
    }

    await tx.faturaVenda.update({
      where: { id: faturaId },
      data: { estadoPagamento: novoEstado },
    });
  }

  async getDocumentoImprimivel(id: string) {
    const recibo = await this.get(id);
    const empresa = (recibo as any).empresa || (await this.prisma.empresaConfig.findFirst());

    if (!empresa) {
      throw new BusinessRuleError('Empresa emissora não configurada.');
    }

    // A conta que o recibo liquidou é a que o cliente tem de pagar. A
    // `ContaBancaria` é a fonte única; o `dadosBancarios` legado é ignorado.
    const contasBancarias = await contaDoDocumento(
      (recibo as any).contaBancariaId,
      this.prisma
    );

    const imputacoesLinhas = ((recibo as any).imputacoes || []).map((imp: any) => ({
      codigo: imp.fatura?.numero || 'FATURA',
      descricao: `Liquidação ${imp.fatura?.numero || ''} (Total: ${Number(imp.fatura?.totalLiquido || 0).toFixed(2)} ${empresa.moedaBase || 'AOA'})`,
      unidade: 'UN',
      quantidade: 1,
      precoUnitario: Number(imp.valorImputado),
      desconto: 0,
      taxaIva: 0,
      valorIva: 0,
      totalLinha: Number(imp.valorImputado),
    }));

    const valorRecebido = Number(recibo.valorRecebido);
    const retencaoValor = valorRecebido * (Number(recibo.retencaoFonte || 0) / 100);
    const totalImputado = ((recibo as any).imputacoes || []).reduce(
      (acc: number, imp: any) => acc + Number(imp.valorImputado || 0),
      0
    );

    return {
      tipoDocumento: 'RC' as const,
      tituloDocumento: 'RECIBO DE VENDA',
      numero: recibo.numero,
      serie: recibo.serie,
      dataEmissao: recibo.data,
      dataVencimento: null,
      estado: recibo.estadoDocumento,
      moeda: empresa.moedaBase || 'AOA',
      atcud: null,
      hashAssinatura: null,
      qrPayload: null,
      qrDataUrl: null,
      emissor: {
        nome: empresa.nome,
        nif: empresa.nif,
        endereco: empresa.endereco,
        pais: empresa.pais,
        telefone: empresa.telefone || null,
        email: empresa.email || null,
        logotipoUrl: empresa.logotipoUrl || null,
        dadosBancarios: empresa.dadosBancarios || null,
        regimeIva: empresa.regimeIva,
        motivoIsencao: empresa.motivoIsencao,
      },
      destinatario: {
        nome: recibo.clienteNome,
        nif: recibo.clienteNif,
        endereco: recibo.clienteEndereco,
        pais: (recibo as any).cliente?.pais || null,
        telefone: (recibo as any).cliente?.telefone || null,
        email: (recibo as any).cliente?.email || null,
      },
      linhas: imputacoesLinhas.length > 0 ? imputacoesLinhas : [
        {
          codigo: 'ADIANTAMENTO',
          descricao: 'Adiantamento por conta / Depósito em conta corrente',
          unidade: 'UN',
          quantidade: 1,
          precoUnitario: Number(recibo.valorRecebido),
          desconto: 0,
          taxaIva: 0,
          valorIva: 0,
          totalLinha: Number(recibo.valorRecebido),
        },
      ],
      totais: {
        totalIliquido: Number(recibo.valorRecebido),
        totalDesconto: 0,
        totalIva: 0,
        totalLiquido: Number(recibo.valorRecebido),
        retencaoFonte: Number(recibo.retencaoFonte || 0),
        resumoIva: [],
      },
      documentoOrigem: null,
      observacoes: recibo.observacoes || null,
      notice: totalImputado > 0 ? null : 'Documento de Liquidação — o valor não imputado constitui Adiantamento do Cliente',
      pagamento: {
        meioPagamento: recibo.meioPagamento,
        valorRecebido,
        retencaoFonte: retencaoValor,
        saldoAdiantamento: Number((valorRecebido - retencaoValor - totalImputado).toFixed(4)),
        contaBancaria: recibo.contaBancaria || null,
        imputacoes: ((recibo as any).imputacoes || []).map((imp: any) => ({
          faturaNumero: imp.fatura?.numero || '',
          valorImputado: Number(imp.valorImputado || 0),
        })),
      },
      dadosBancarios: empresa.dadosBancarios || null,
      contasBancarias,
    };
  }
}

export const reciboService = new ReciboService();
