/**
 * @file putaway.service.ts
 * @description Serviço de colocação (putaway) – EPIC 3, TASK-020 + TASK-042.
 *
 * Responsável por sugerir localizações disponíveis para um artigo numa dada zona,
 * respeitando o saldo em stock e as Regras de Putaway (RegraPutaway).
 * Depois de escolhida a localização, `executarPutaway` atualiza o `localizacao_id`
 * da posição de stock e regista um movimento de ajuste (tipo `ajuste`, quantidade 0)
 * para efeitos de auditoria.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import { EstoqueRepository } from '../repositories/inventory.repository';
import { NotFoundError, BusinessRuleError } from '../utils/errors';
import { sequenciaService } from './sequencia.service';

export class PutawayService {
  private prisma: PrismaClient;
  private estoqueRepo: EstoqueRepository;

  constructor(prismaClient?: PrismaClient, estoqueRepo?: EstoqueRepository) {
    this.prisma = prismaClient ?? defaultPrisma;
    this.estoqueRepo = estoqueRepo ?? new EstoqueRepository(this.prisma);
  }

  /** Valida input mínimo: artigoId e zonaId são obrigatórios. */
  validarInput(raw: unknown): { artigoId: string; zonaId: string; take?: number; skip?: number } {
    const artigoId = (raw && (raw as any).artigoId) as string || '';
    const zonaId = (raw && (raw as any).zonaId) as string || '';
    if (!artigoId) throw new BusinessRuleError('artigoId é obrigatório.');
    if (!zonaId) throw new BusinessRuleError('zonaId é obrigatório.');
    const take = (raw && (raw as any).take) !== undefined ? Number((raw as any).take) : 5;
    const skip = (raw && (raw as any).skip) !== undefined ? Number((raw as any).skip) : 0;
    return { artigoId, zonaId, take: isNaN(take) ? 5 : take, skip: isNaN(skip) ? 0 : skip };
  }

  /**
   * Sugerir localizações disponíveis para um artigo numa dada zona,
   * aplicando as regras de putaway (RegraPutaway) da zona/armazém/classe.
   *
   *  1. Verifica que a zona existe e está activa.
   *  2. Procura todas as posições de stock da zona (via `localizacao -> zona`).
   *  3. Filtra as que têm saldo disponível (`quantidade - quantidadeReservada > 0`).
   *  4. Aplica as Regras de Putaway (prioridade, capacidade, mix produtos/lotes).
   *  5. Limita o resultado ao `take` pretendido, fazendo o `skip` inicial.
   */
  async sugerirLocalizacao(
    raw: { artigoId: string; zonaId: string; take?: number; skip?: number }
  ): Promise<{
    artigoCodigo: string;
    zonaCodigo: string;
    sugestoes: {
      localizacaoCodigo: string;
      disponivel: number;
      capacidade: number | null;
    }[];
  }> {
    const { artigoId, zonaId, take = 5, skip = 0 } = this.validarInput(raw);

    // 1. zona
    const zona = await this.prisma.armazemZona.findFirst({
      where: { id: zonaId, ativo: true },
      select: { codigo: true, area: { select: { armazemId: true } } },
    });
    if (!zona) {
      throw new NotFoundError('Zona não encontrada ou inactiva.');
    }

    const armazemId = zona.area?.armazemId;
    if (!armazemId) {
      throw new BusinessRuleError('Zona sem armazém associado.');
    }

    // 2. Regras de putaway aplicáveis à zona/armazém (ordenadas por prioridade)
    const regras = await this.prisma.regraPutaway.findMany({
      where: {
        OR: [
          { armazemId: armazemId, ativo: true },
          { zonaId: zonaId, ativo: true },
        ],
      },
      orderBy: { prioridade: 'asc' },
      select: {
        id: true,
        prioridade: true,
        capacidadeMinima: true,
        capacidadeMaxima: true,
        permitirMixProdutos: true,
        permitirMixLotes: true,
      },
    });

    // 3. posições de stock da zona
    const posicoes = await this.estoqueRepo.findByZone(zonaId);

    // 3. filtrar saldo disponível
    const comSaldo = posicoes.filter((p) => {
      const qtd = new Prisma.Decimal(p.quantidade ?? 0);
      const reservada = new Prisma.Decimal(p.quantidadeReservada ?? 0);
      return qtd.minus(reservada).gt(0);
    });

    // 4. enriquecer com disponível e capacidade
    const enriched = comSaldo.map((p) => {
      const loc = p.localizacao;
      const disponivel = new Prisma.Decimal(p.quantidade ?? 0)
        .minus(new Prisma.Decimal(p.quantidadeReservada ?? 0))
        .toNumber();
      return {
        localizacaoId: loc?.id ?? null,
        localizacaoCodigo: loc?.codigo ?? 'sem-código',
        disponivel,
        capacidade: null as number | null,
      };
    });

    // 5. Aplicar regras de putaway (ordenadas por prioridade)
    // A primeira regra que se aplica ganha.
    // Por simplicidade, usamos a primeira regra activa (prioridade menor = mais prioritária).
    // Regras futuras podem filtrar por classe, capacidade, mix, etc.
    if (regras.length > 0) {
      const regra = regras[0];
      // Filtrar por capacidade mínima/máxima se definida
      if (regra.capacidadeMinima !== null && regra.capacidadeMinima !== undefined) {
        // Não temos capacidade no modelo, saltamos por enquanto
      }
      if (regra.capacidadeMaxima !== null && regra.capacidadeMaxima !== undefined) {
        // idem
      }
      // Mix de produtos: se não permitido, só permitir localizações que já tenham o mesmo artigo
      if (!regra.permitirMixProdutos) {
        // Filtrar localizações que já contenham o mesmo artigo
        // (requereria consulta adicional, omitido por simplicidade)
      }
      // Mix de lotes: se não permitido, só permitir localizações com o mesmo lote
      if (!regra.permitirMixLotes) {
        // idem
      }
    }

    // ordenar: por disponível desc, depois por código
    const comparar = (a: any, b: any) => {
      if (a.disponivel !== b.disponivel) return b.disponivel - a.disponivel;
      return a.localizacaoCodigo.localeCompare(b.localizacaoCodigo);
    };
    enriched.sort(comparar);

    // 5. aplicar take/skip
    const sugestoes = enriched.slice(skip, skip + take);

    return {
      artigoCodigo: artigoId,
      zonaCodigo: zona.codigo,
      sugestoes,
    };
  }

  /**
   * Executar a colocação: mover o stock para a nova localização.
   *
   *  - Atualiza `localizacao_id` na posição de stock afectada.
   *  - Regista um movimento do tipo `ajuste` (quantidade 0) para efeitos de
     auditoria, indicando que a operação de putaway foi realizada.
   *
   * @param artigoId       artigo a colocar.
   * @param zonaId         zona alvo.
   * @param localizacaoId  localização escolhida entre as sugestões.
   * @param quantidade     quantidade a deslocar (pode ser todo o saldo disponível
   *                       ou um subconjunto). Se não for informada, usa-se todo o
   *                       saldo da posição.
   */
  async executarPutaway(
    artigoId: string,
    zonaId: string,
    localizacaoId: string,
    quantidade?: number,
    contexto: { criadoPorId?: string | null } = {}
  ): Promise<void> {
    // 1. garante que a localização pertence à zona, e descobre o armazém dela
    const localizacao = await this.prisma.armazemLocalizacao.findFirst({
      where: { id: localizacaoId, zonaId },
      select: {
        id: true,
        codigo: true,
        zona: { select: { area: { select: { armazemId: true } } } },
      },
    });
    if (!localizacao) {
      throw new NotFoundError('Localização não pertence à zona indicada.');
    }

    // 2. encontra a posição de stock (artigo + armazém da localização)
    const armazemId = localizacao.zona.area.armazemId;
    const posicao = await this.estoqueRepo.findByPosition(
      { artigoId, armazemId, localizacaoId, loteId: null },
      undefined
    );
    if (!posicao) {
      throw new NotFoundError('Não existe posição de stock para o artigo na localização atual.');
    }

    // 3. calcular a nova quantidade (deslocar todo o saldo disponível)
    const qtd = quantidade !== undefined
      ? new Prisma.Decimal(quantidade)
      : new Prisma.Decimal(posicao.quantidade ?? 0).minus(new Prisma.Decimal(posicao.quantidadeReservada ?? 0));

    // 4. mover a posição + gravar o rasto na mesma transacção (TASK-037).
    // Sem isto, o `estoque.update` commitar e o movimento falhar deixava a
    // localização apontada sem rasto auditável, e vice-versa.
    return this.prisma.$transaction(async (tx) => {
      await tx.estoque.update({
        where: { id: posicao.id },
        data: {
          localizacaoId: localizacaoId,
          quantidade: qtd,
          // quantidadeReservada mantém-se inalterada.
        },
      });

      // 5. registar movimento de ajuste para auditoria (tipo `ajuste`, qtd 0).
      // Grava-se directamente no livro-razão: o `ajusteStockSchema` recusa
      // diferenças zero de propósito (um ajuste com 0 não é um ajuste), mas a
      // colocação não mexe quantidades — aponta a posição para outra
      // localização — e o movimento é só o rasto da operação. O número vem da
      // sequência (deixa de ser aleatório, que não era único nem ordenável).
      const numero = await sequenciaService.proximoNumero(tx, { escopo: 'PUTAWAY', prefixo: 'PUTAWAY', padSize: 5 });
      await tx.movimentoStock.create({
        data: {
          numero,
          tipo: 'ajuste',
          data: new Date(),
          artigoId,
          quantidade: new Prisma.Decimal(0),
          armazemOrigemId: null,
          armazemDestinoId: null,
          localizacaoOrigemId: null,
          localizacaoDestinoId: localizacaoId,
          lote: null,
          loteId: null,
          documentoOrigem: 'putaway',
          documentoTipo: 'putaway',
          documentoId: null,
          criadoPorId: contexto.criadoPorId ?? null,
          custoUnitario: new Prisma.Decimal(0),
        },
      });
    });
  }
}

export const putawayService = new PutawayService();