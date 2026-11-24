/**
 * @file rh-dividas.service.ts
 * @description Gestão de processos de dívida/penhora e prestações do módulo de RH (Fase 6: RH-606/607).
 *
 * Responsabilidades:
 *  - CRUD de processos de dívida/penhora com isolamento por empresa;
 *  - Geração automática de plano de prestações;
 *  - Suspensão, liquidação antecipada, cancelamento;
 *  - Gestão de prestações: desconto, anulação, perdão;
 *  - Validação de limite de penhora (30% do salário líquido);
 *  - auditoria de cada escrita.
 */

import {
  Prisma,
  RhProcessoDivida,
  RhPrestacaoDivida,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { auditService, type AuditService } from './audit.service';
import {
  criarRhProcessoDividaSchema,
  atualizarRhProcessoDividaSchema,
  rhProcessosDividaListarInputSchema,
  rhProcessoDividaGerarPlanoSchema,
  rhProcessoDividaSuspenderSchema,
  rhProcessoDividaLiquidarSchema,
  rhPrestacoesDividaListarInputSchema,
  rhPrestacaoDividaAtualizarSchema,
  rhPrestacaoDividaDescontarSchema,
  rhPrestacaoDividaAnularSchema,
  rhPrestacaoDividaPerdoarSchema,
  type CriarRhProcessoDividaInput,
  type AtualizarRhProcessoDividaInput,
  type RhProcessosDividaListarInput,
  type RhProcessoDividaGerarPlanoInput,
  type RhProcessoDividaSuspenderInput,
  type RhProcessoDividaLiquidarInput,
  type RhPrestacoesDividaListarInput,
  type RhPrestacaoDividaAtualizarInput,
  type RhPrestacaoDividaDescontarInput,
  type RhPrestacaoDividaAnularInput,
  type RhPrestacaoDividaPerdoarInput,
} from '../validators/rh.validator';

export class RhDividasService {
  constructor(
    private readonly prisma: typeof defaultPrisma = defaultPrisma,
    private readonly audit: AuditService = auditService,
  ) {}

  private exigirEmpresa(empresaId: string | null): string {
    if (!empresaId) {
      throw new Error('A sessão não está associada a uma empresa.');
    }
    return empresaId;
  }

  // ── Processos de Dívida ────────────────────────────────────────────────────

  async listarProcessos(
    empresaId: string | null,
    input: RhProcessosDividaListarInput,
  ): Promise<{ total: number; items: (RhProcessoDivida & { funcionario: { id: string; codigo: string; nome: string } })[] }> {
    const filtros = rhProcessosDividaListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhProcessoDividaWhereInput = {
      funcionario: { empresaId: empresa },
      ...(filtros.funcionarioId && { funcionarioId: filtros.funcionarioId }),
      ...(filtros.tipo && { tipo: filtros.tipo }),
      ...(filtros.estado && { estado: filtros.estado }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhProcessoDivida.count({ where }),
      this.prisma.rhProcessoDivida.findMany({
        where,
        include: {
          funcionario: { select: { id: true, codigo: true, nome: true } },
        },
        orderBy: { dataInicio: 'desc' },
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { total, items };
  }

  async obterProcesso(id: string, empresaId: string | null): Promise<(RhProcessoDivida & { funcionario: { id: string; codigo: string; nome: string }; prestacoes: RhPrestacaoDivida[] }) | null> {
    const empresa = this.exigirEmpresa(empresaId);
    return this.prisma.rhProcessoDivida.findFirst({
      where: { id, funcionario: { empresaId: empresa } },
      include: {
        funcionario: { select: { id: true, codigo: true, nome: true } },
        prestacoes: { orderBy: { numero: 'asc' } },
      },
    });
  }

  async criarProcesso(empresaId: string | null, input: CriarRhProcessoDividaInput, usuarioId: string): Promise<RhProcessoDivida> {
    const dados = criarRhProcessoDividaSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    await this.validarFuncionarioEmpresa(dados.funcionarioId, empresa);

    // Calcular valor da prestação se não informado
    const valorPrestacao = dados.valorPrestacao || Number((dados.valorTotal / dados.numeroPrestacoes).toFixed(4));

    const processo = await this.prisma.rhProcessoDivida.create({
      data: {
        funcionarioId: dados.funcionarioId,
        tipo: dados.tipo,
        descricao: dados.descricao ?? null,
        credor: dados.credor ?? null,
        numeroProcesso: dados.numeroProcesso ?? null,
        valorTotal: new Prisma.Decimal(dados.valorTotal),
        numeroPrestacoes: dados.numeroPrestacoes,
        valorPrestacao: new Prisma.Decimal(valorPrestacao),
        saldo: new Prisma.Decimal(dados.valorTotal),
        moeda: dados.moeda ?? 'AOA',
        dataInicio: new Date(dados.dataInicio),
        estado: 'ATIVA',
        respeitaLimitePenhora: dados.respeitaLimitePenhora ?? false,
      },
    });

    // Gerar prestações automaticamente
    await this.gerarPrestacoes(processo.id, empresa);

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'criar',
      entidade: 'RhProcessoDivida',
      entidadeId: processo.id,
      modulo: 'rh',
      descricao: `Processo de dívida criado para funcionário ${dados.funcionarioId} (${dados.tipo}, ${dados.valorTotal} ${dados.moeda})`,
      dadosNovos: processo,
    });

    return processo;
  }

  async atualizarProcesso(empresaId: string | null, input: AtualizarRhProcessoDividaInput, usuarioId: string): Promise<RhProcessoDivida> {
    const dados = atualizarRhProcessoDividaSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterProcesso(id, empresa);
    if (!existing) throw new Error('Processo de dívida não encontrado.');

    if (updateData.funcionarioId) await this.validarFuncionarioEmpresa(updateData.funcionarioId, empresa);

    const data: Prisma.RhProcessoDividaUpdateInput = {};
    if (updateData.funcionarioId) data.funcionario = { connect: { id: updateData.funcionarioId } };
    if (updateData.tipo) data.tipo = updateData.tipo;
    if (updateData.descricao !== undefined) data.descricao = updateData.descricao;
    if (updateData.credor !== undefined) data.credor = updateData.credor;
    if (updateData.numeroProcesso !== undefined) data.numeroProcesso = updateData.numeroProcesso;
    if (updateData.valorTotal !== undefined) data.valorTotal = new Prisma.Decimal(updateData.valorTotal);
    if (updateData.numeroPrestacoes !== undefined) data.numeroPrestacoes = updateData.numeroPrestacoes;
    if (updateData.valorPrestacao !== undefined) data.valorPrestacao = new Prisma.Decimal(updateData.valorPrestacao);
    if (updateData.moeda !== undefined) data.moeda = updateData.moeda;
    if (updateData.dataInicio) data.dataInicio = new Date(updateData.dataInicio);
    if (updateData.estado) data.estado = updateData.estado;
    if (updateData.respeitaLimitePenhora !== undefined) data.respeitaLimitePenhora = updateData.respeitaLimitePenhora;

    const updated = await this.prisma.rhProcessoDivida.update({ where: { id }, data });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhProcessoDivida',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Processo de dívida ${id} actualizado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async gerarPlanoPrestacoes(empresaId: string | null, input: RhProcessoDividaGerarPlanoInput, usuarioId: string): Promise<RhProcessoDivida> {
    const dados = rhProcessoDividaGerarPlanoSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterProcesso(dados.id, empresa);
    if (!existing) throw new Error('Processo de dívida não encontrado.');

    if (existing.prestacoes && existing.prestacoes.length > 0) {
      throw new Error('Plano de prestações já gerado para este processo.');
    }

    await this.gerarPrestacoes(dados.id, empresa);

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhProcessoDivida',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Plano de prestações gerado para processo ${dados.id}`,
      dadosAnteriores: existing,
    });

    return this.obterProcesso(dados.id, empresa) as Promise<RhProcessoDivida>;
  }

  async suspenderProcesso(empresaId: string | null, input: RhProcessoDividaSuspenderInput, usuarioId: string): Promise<RhProcessoDivida> {
    const dados = rhProcessoDividaSuspenderSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterProcesso(dados.id, empresa);
    if (!existing) throw new Error('Processo de dívida não encontrado.');

    if (existing.estado !== 'ATIVA') {
      throw new Error('Só é possível suspender processos no estado ATIVA.');
    }

    const updated = await this.prisma.rhProcessoDivida.update({
      where: { id: dados.id },
      data: {
        estado: 'SUSPENSA',
        descricao: `${existing.descricao ?? ''}\n[SUSPENSA] ${dados.motivo}`.trim(),
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhProcessoDivida',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Processo de dívida ${dados.id} suspenso (${dados.motivo})`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async liquidarProcesso(empresaId: string | null, input: RhProcessoDividaLiquidarInput, usuarioId: string): Promise<RhProcessoDivida> {
    const dados = rhProcessoDividaLiquidarSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterProcesso(dados.id, empresa);
    if (!existing) throw new Error('Processo de dívida não encontrado.');

    const pendentes = existing.prestacoes?.filter((p) => p.estado === 'PENDENTE') ?? [];
    if (pendentes.length > 0) {
      throw new Error('Existem prestações pendentes. Liquide ou anule-as antes de liquidar o processo.');
    }

    const updated = await this.prisma.rhProcessoDivida.update({
      where: { id: dados.id },
      data: { estado: 'LIQUIDADA' },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhProcessoDivida',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Processo de dívida ${dados.id} liquidado`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  async cancelarProcesso(id: string, empresaId: string | null, motivo: string, usuarioId: string): Promise<RhProcessoDivida> {
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterProcesso(id, empresa);
    if (!existing) throw new Error('Processo de dívida não encontrado.');

    // Anular prestações pendentes
    await this.prisma.rhPrestacaoDivida.updateMany({
      where: { processoId: id, estado: 'PENDENTE' },
      data: { estado: 'ANULADA' },
    });

    const updated = await this.prisma.rhProcessoDivida.update({
      where: { id },
      data: {
        estado: 'CANCELADA',
        descricao: `${existing.descricao ?? ''}\n[CANCELADA] ${motivo}`.trim(),
      },
    });

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhProcessoDivida',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Processo de dívida ${id} cancelado (${motivo})`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return updated;
  }

  // ── Prestações ──────────────────────────────────────────────────────────────

  async listarPrestacoes(
    empresaId: string | null,
    input: RhPrestacoesDividaListarInput,
  ): Promise<{ total: number; items: RhPrestacaoDivida[] }> {
    const filtros = rhPrestacoesDividaListarInputSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const where: Prisma.RhPrestacaoDividaWhereInput = {
      processo: { funcionario: { empresaId: empresa } },
      ...(filtros.funcionarioId && { processo: { funcionarioId: filtros.funcionarioId } }),
      ...(filtros.processoId && { processoId: filtros.processoId }),
      ...(filtros.ano && { ano: filtros.ano }),
      ...(filtros.mes && { mes: filtros.mes }),
      ...(filtros.estado && { estado: filtros.estado }),
    };

    const [total, items] = await Promise.all([
      this.prisma.rhPrestacaoDivida.count({ where }),
      this.prisma.rhPrestacaoDivida.findMany({
        where,
        include: {
          processo: { 
            select: { 
              id: true, 
              funcionarioId: true, 
              tipo: true, 
              valorPrestacao: true, 
              moeda: true,
              funcionario: { select: { id: true, codigo: true, nome: true } }
            } 
          },
        },
        orderBy: [{ ano: 'asc' }, { mes: 'asc' }, { numero: 'asc' }],
        skip: filtros.skip,
        take: filtros.take,
      }),
    ]);

    return { 
      total, 
      items: items.map(item => ({
        ...item,
        valor: Number(item.valor),
        valorDescontado: Number(item.valorDescontado),
        processo: {
          ...item.processo,
          valorPrestacao: Number(item.processo.valorPrestacao),
        }
      })) as unknown as RhPrestacaoDivida[]
    };
  }

  async obterPrestacao(id: string, empresaId: string | null): Promise<RhPrestacaoDivida | null> {
    const empresa = this.exigirEmpresa(empresaId);
    const prestacao = await this.prisma.rhPrestacaoDivida.findFirst({
      where: { id, processo: { funcionario: { empresaId: empresa } } },
      include: { 
        processo: { 
          select: { id: true, funcionarioId: true, tipo: true, valorPrestacao: true, moeda: true, funcionario: { select: { id: true, codigo: true, nome: true } } } 
        } 
      },
    });
    
    if (!prestacao) return null;
    
    return {
      ...prestacao,
      valor: Number(prestacao.valor),
      valorDescontado: Number(prestacao.valorDescontado),
      processo: {
        ...prestacao.processo,
        valorPrestacao: Number(prestacao.processo.valorPrestacao),
      }
    } as unknown as RhPrestacaoDivida;
  }

  async atualizarPrestacao(empresaId: string | null, input: RhPrestacaoDividaAtualizarInput, usuarioId: string): Promise<RhPrestacaoDivida> {
    const dados = rhPrestacaoDividaAtualizarSchema.parse(input);
    const { id, ...updateData } = dados;
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterPrestacao(id, empresa);
    if (!existing) throw new Error('Prestação não encontrada.');

    const data: Prisma.RhPrestacaoDividaUpdateInput = {};
    if (updateData.valorDescontado !== undefined) data.valorDescontado = new Prisma.Decimal(updateData.valorDescontado);
    if (updateData.estado) data.estado = updateData.estado;
    if (updateData.processamentoItemId !== undefined) data.processamentoItemId = updateData.processamentoItemId;

    const updated = await this.prisma.rhPrestacaoDivida.update({ where: { id }, data });
    const result = {
      ...updated,
      valor: Number(updated.valor),
      valorDescontado: Number(updated.valorDescontado),
    } as unknown as RhPrestacaoDivida;

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhPrestacaoDivida',
      entidadeId: id,
      modulo: 'rh',
      descricao: `Prestação de dívida ${id} actualizada`,
      dadosAnteriores: existing,
      dadosNovos: updated,
    });

    return result;
  }

  async descontarPrestacao(empresaId: string | null, input: RhPrestacaoDividaDescontarInput, usuarioId: string): Promise<RhPrestacaoDivida> {
    const dados = rhPrestacaoDividaDescontarSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterPrestacao(dados.id, empresa);
    if (!existing) throw new Error('Prestação não encontrada.');

    if (existing.estado !== 'PENDENTE') {
      throw new Error('Só é possível descontar prestações pendentes.');
    }

    const novoValorDescontado = Number(existing.valorDescontado) + dados.valorDescontado;
    if (novoValorDescontado > Number(existing.valor)) {
      throw new Error('Valor descontado não pode exceder o valor da prestação.');
    }

    const novoEstado = novoValorDescontado >= Number(existing.valor) ? 'DESCONTADA' : 'PENDENTE';

    const prestacao = await this.prisma.rhPrestacaoDivida.update({
      where: { id: dados.id },
      data: {
        valorDescontado: new Prisma.Decimal(novoValorDescontado),
        estado: novoEstado,
        processamentoItemId: dados.processamentoItemId,
      },
    });

    // Atualizar saldo do processo
    await this.atualizarSaldoProcesso(existing.processoId, empresa);

    const result = {
      ...prestacao,
      valor: Number(prestacao.valor),
      valorDescontado: Number(prestacao.valorDescontado),
    } as unknown as RhPrestacaoDivida;

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhPrestacaoDivida',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Prestação ${dados.id} descontada (${dados.valorDescontado})`,
      dadosAnteriores: existing,
      dadosNovos: prestacao,
    });

    return result;
  }

  async anularPrestacao(empresaId: string | null, input: RhPrestacaoDividaAnularInput, usuarioId: string): Promise<RhPrestacaoDivida> {
    const dados = rhPrestacaoDividaAnularSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterPrestacao(dados.id, empresa);
    if (!existing) throw new Error('Prestação não encontrada.');

    if (existing.estado === 'DESCONTADA') {
      throw new Error('Não é possível anular uma prestação já descontada.');
    }

    const prestacao = await this.prisma.rhPrestacaoDivida.update({
      where: { id: dados.id },
      data: {
        estado: 'ANULADA',
        processamentoItemId: null,
      },
    });

    // Atualizar saldo do processo
    await this.atualizarSaldoProcesso(existing.processoId, empresa);

    const result = {
      ...prestacao,
      valor: Number(prestacao.valor),
      valorDescontado: Number(prestacao.valorDescontado),
    } as unknown as RhPrestacaoDivida;

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhPrestacaoDivida',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Prestação ${dados.id} anulada`,
      dadosAnteriores: existing,
      dadosNovos: prestacao,
    });

    return result;
  }

  async perdoarPrestacao(empresaId: string | null, input: RhPrestacaoDividaPerdoarInput, usuarioId: string): Promise<RhPrestacaoDivida> {
    const dados = rhPrestacaoDividaPerdoarSchema.parse(input);
    const empresa = this.exigirEmpresa(empresaId);

    const existing = await this.obterPrestacao(dados.id, empresa);
    if (!existing) throw new Error('Prestação não encontrada.');

    if (existing.estado === 'DESCONTADA') {
      throw new Error('Não é possível perdoar uma prestação já descontada.');
    }

    const prestacao = await this.prisma.rhPrestacaoDivida.update({
      where: { id: dados.id },
      data: {
        estado: 'PERDOADA',
        valorDescontado: existing.valor,
        processamentoItemId: null,
      },
    });

    // Atualizar saldo do processo
    await this.atualizarSaldoProcesso(existing.processoId, empresa);

    const result = {
      ...prestacao,
      valor: Number(prestacao.valor),
      valorDescontado: Number(prestacao.valorDescontado),
    } as unknown as RhPrestacaoDivida;

    await this.audit.registarOperacao({
      empresaId: empresa,
      utilizadorId: usuarioId,
      acao: 'actualizar',
      entidade: 'RhPrestacaoDivida',
      entidadeId: dados.id,
      modulo: 'rh',
      descricao: `Prestação ${dados.id} perdoada`,
      dadosAnteriores: existing,
      dadosNovos: prestacao,
    });

    return result;
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async gerarPrestacoes(processoId: string, empresaId: string): Promise<void> {
    const processo = await this.prisma.rhProcessoDivida.findFirst({
      where: { id: processoId, funcionario: { empresaId } },
    });
    if (!processo) throw new Error('Processo não encontrado.');

    const dataInicio = new Date(processo.dataInicio);
    const anoInicio = dataInicio.getFullYear();
    const mesInicio = dataInicio.getMonth() + 1;

    const prestacoes: Prisma.RhPrestacaoDividaCreateManyInput[] = [];

    for (let i = 0; i < processo.numeroPrestacoes; i++) {
      const mes = mesInicio + i;
      const ano = anoInicio + Math.floor((mes - 1) / 12);
      const mesNormalizado = ((mes - 1) % 12) + 1;

      // Ajustar valor da última prestação para cobrir diferença de arredondamento
      let valorPrestacao = Number(processo.valorPrestacao);
      if (i === processo.numeroPrestacoes - 1) {
        const totalAnterior = valorPrestacao * i;
        valorPrestacao = Number((Number(processo.valorTotal) - totalAnterior).toFixed(4));
      }

      prestacoes.push({
        processoId,
        numero: i + 1,
        ano,
        mes: mesNormalizado,
        valor: new Prisma.Decimal(valorPrestacao),
        valorDescontado: new Prisma.Decimal(0),
        estado: 'PENDENTE',
      });
    }

    await this.prisma.rhPrestacaoDivida.createMany({ data: prestacoes });
  }

  private async atualizarSaldoProcesso(processoId: string, empresaId: string): Promise<void> {
    const empresa = this.exigirEmpresa(empresaId);

    const prestacoes = await this.prisma.rhPrestacaoDivida.findMany({
      where: { processoId, processo: { funcionario: { empresaId: empresa } } },
      select: { valor: true, valorDescontado: true, estado: true, processo: { select: { valorTotal: true } } },
    });

    const totalDescontado = prestacoes
      .filter((p) => p.estado === 'DESCONTADA' || p.estado === 'PERDOADA')
      .reduce((acc, p) => acc + Number(p.valorDescontado), 0);

    const saldo = Number(prestacoes[0]?.processo?.valorTotal ?? 0) - totalDescontado;

    await this.prisma.rhProcessoDivida.update({
      where: { id: processoId },
      data: {
        saldo: new Prisma.Decimal(Math.max(0, saldo)),
        estado: saldo <= 0 ? 'LIQUIDADA' : 'ATIVA',
      },
    });
  }

  private async validarFuncionarioEmpresa(funcionarioId: string, empresaId: string): Promise<void> {
    const f = await this.prisma.rhFuncionario.findFirst({ where: { id: funcionarioId, empresaId }, select: { id: true } });
    if (!f) throw new Error('Funcionário não pertence a esta empresa.');
  }
}

export const rhDividasService = new RhDividasService();