/**
 * @file localizacao.service.ts
 * @description Regras de negócio da estrutura de armazéns (EPIC 3, TASK-018).
 *
 * A estrutura é `armazém → área → zona → localização`, e a localização aceita
 * uma auto-relação para subdivisões (A01 → R02 → N03). Este serviço valida o
 * que a base de dados não sabe decidir sozinho: que o pai pertence à mesma
 * zona, que a capacidade é coerente, que o código não colide dentro da zona.
 *
 * A unicidade de `codigo` é `(zonaId, codigo)`, e não global: o mesmo "A01"
 * pode existir em duas zonas diferentes, e o próprio código de prateleira o
 * repete entre armazéns.
 */

import {
  PrismaClient,
  Prisma,
  ArmazemLocalizacao,
  ArmazemArea,
  ArmazemZona,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import {
  LocalizacaoRepository,
  ArvoreLocalizacoes,
  FiltrosLocalizacao,
  FiltrosLocalizacaoDisponivel,
} from '../repositories/location.repository';
import { EstoqueRepository } from '../repositories/inventory.repository';
import {
  criarAreaSchema,
  criarZonaSchema,
  actualizarAreaSchema,
  actualizarZonaSchema,
  criarLocalizacaoSchema,
  actualizarLocalizacaoSchema,
  filtrosLocalizacaoSchema,
  sugestoesLocalizacaoSchema,
  CriarAreaInput,
  CriarZonaInput,
  ActualizarAreaInput,
  ActualizarZonaInput,
  CriarLocalizacaoInput,
  ActualizarLocalizacaoInput,
  SugestoesLocalizacaoInput,
} from '../validators/localizacao.validator';
import {
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ValidationError,
} from '../utils/errors';

export class LocalizacaoService {
  private prisma: PrismaClient;
  private repo: LocalizacaoRepository;
  private estoqueRepo: EstoqueRepository;

  constructor(
    prismaClient: PrismaClient = defaultPrisma,
    repo?: LocalizacaoRepository,
    estoqueRepo?: EstoqueRepository
  ) {
    this.prisma = prismaClient;
    this.repo = repo ?? new LocalizacaoRepository(prismaClient);
    this.estoqueRepo = estoqueRepo ?? new EstoqueRepository(prismaClient);
  }

  // ── Áreas ────────────────────────────────────────────────────────────────

  /**
   * Cria uma área. O código é único dentro do armazém (`armazens_areas` tem
   * `@@unique([armazemId, codigo])`), não global.
   */
  async criarArea(rawInput: unknown) {
    const data: CriarAreaInput = criarAreaSchema.parse(rawInput);

    const armazem = await this.prisma.armazem.findUnique({
      where: { id: data.armazemId },
      select: { id: true, ativo: true },
    });
    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${data.armazemId}' não encontrado.`);
    }
    if (!armazem.ativo) {
      throw new BusinessRuleError(
        'Não é possível criar áreas num armazém inactivo. Reactive-o primeiro.'
      );
    }

    const existente = await this.prisma.armazemArea.findUnique({
      where: { armazemId_codigo: { armazemId: data.armazemId, codigo: data.codigo } },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictError(
        `Já existe a área '${data.codigo}' neste armazém.`
      );
    }

    return this.repo.createArea({
      armazemId: data.armazemId,
      codigo: data.codigo,
      designacao: data.designacao,
      tipo: data.tipo ?? null,
      descricao: data.descricao ?? null,
      ativo: data.ativo ?? true,
    });
  }

  /**
   * Actualiza os dados editáveis de uma área.
   *
   * `armazemId` não muda: mover a área arrastaria zonas, localizações e stock
   * endereçado. A colisão de código é conferida só quando o código muda, para
   * não bloquear a gravação de uma edição que não lhe toca.
   */
  async actualizarArea(id: string, rawInput: unknown): Promise<ArmazemArea> {
    const data: ActualizarAreaInput = actualizarAreaSchema.parse(rawInput);

    const area = await this.repo.findAreaById(id);
    if (!area) {
      throw new NotFoundError(`Área com ID '${id}' não encontrada.`);
    }

    if (data.codigo && data.codigo !== area.codigo) {
      const existente = await this.prisma.armazemArea.findUnique({
        where: {
          armazemId_codigo: { armazemId: area.armazemId, codigo: data.codigo },
        },
        select: { id: true },
      });
      if (existente && existente.id !== id) {
        throw new ConflictError(`Já existe a área '${data.codigo}' neste armazém.`);
      }
    }

    return this.prisma.armazemArea.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.designacao !== undefined && { designacao: data.designacao }),
        ...(data.tipo !== undefined && { tipo: data.tipo }),
        ...(data.descricao !== undefined && { descricao: data.descricao }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });
  }

  /**
   * Desactiva uma área.
   *
   * Não apaga: as zonas e as localizações (e o stock que apontem para elas)
   * continuam no histórico. Uma área com zonas activas não pode ser desactivada,
   * senão ficavam zonas vivas dentro de uma área fechada.
   */
  async desactivarArea(id: string): Promise<ArmazemArea> {
    const area = await this.repo.findAreaById(id);
    if (!area) {
      throw new NotFoundError(`Área com ID '${id}' não encontrada.`);
    }

    const zonasActivas = await this.prisma.armazemZona.count({
      where: { areaId: id, ativo: true },
    });
    if (zonasActivas > 0) {
      throw new BusinessRuleError(
        `A área '${area.codigo}' tem ${zonasActivas} zona(s) activa(s). Desactive-as primeiro.`
      );
    }

    return this.prisma.armazemArea.update({
      where: { id },
      data: { ativo: false },
    });
  }

  // ── Zonas ────────────────────────────────────────────────────────────────

  /**
   * Cria uma zona dentro de uma área activa.
   *
   * A zona tem de estar activa para que as localizações seguintes sejam
   * elegíveis para putaway e picking: `getAvailableLocations` e as regras de
   * picking Assumem zonas vivas.
   */
  async criarZona(rawInput: unknown) {
    const data: CriarZonaInput = criarZonaSchema.parse(rawInput);

    const area = await this.repo.findAreaById(data.areaId);
    if (!area) {
      throw new NotFoundError(`Área com ID '${data.areaId}' não encontrada.`);
    }
    if (!area.ativo) {
      throw new BusinessRuleError(
        `A área '${area.codigo}' está inactiva. Reactive-a antes de criar zonas.`
      );
    }

    const existente = await this.prisma.armazemZona.findUnique({
      where: { areaId_codigo: { areaId: data.areaId, codigo: data.codigo } },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictError(`Já existe a zona '${data.codigo}' nesta área.`);
    }

    return this.repo.createZona({
      areaId: data.areaId,
      codigo: data.codigo,
      designacao: data.designacao,
      descricao: data.descricao ?? null,
      altaRotacao: data.altaRotacao ?? false,
      temperaturaControlada: data.temperaturaControlada ?? false,
      ativo: data.ativo ?? true,
    });
  }

  /**
   * Actualiza os dados editáveis de uma zona. `areaId` fica de fora pela mesma
   * razão que `armazemId` fica de fora da área.
   */
  async actualizarZona(id: string, rawInput: unknown): Promise<ArmazemZona> {
    const data: ActualizarZonaInput = actualizarZonaSchema.parse(rawInput);

    const zona = await this.repo.findZonaById(id);
    if (!zona) {
      throw new NotFoundError(`Zona com ID '${id}' não encontrada.`);
    }

    if (data.codigo && data.codigo !== zona.codigo) {
      const existente = await this.prisma.armazemZona.findUnique({
        where: { areaId_codigo: { areaId: zona.areaId, codigo: data.codigo } },
        select: { id: true },
      });
      if (existente && existente.id !== id) {
        throw new ConflictError(`Já existe a zona '${data.codigo}' nesta área.`);
      }
    }

    return this.prisma.armazemZona.update({
      where: { id },
      data: {
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.designacao !== undefined && { designacao: data.designacao }),
        ...(data.descricao !== undefined && { descricao: data.descricao }),
        ...(data.altaRotacao !== undefined && { altaRotacao: data.altaRotacao }),
        ...(data.temperaturaControlada !== undefined && {
          temperaturaControlada: data.temperaturaControlada,
        }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });
  }

  /**
   * Desactiva uma zona. Bloqueia se ainda tiver localizações activas: ficariam
   * posições vivas dentro de uma zona fechada, e o putaway continuaria a
   * elegê-las.
   */
  async desactivarZona(id: string): Promise<ArmazemZona> {
    const zona = await this.repo.findZonaById(id);
    if (!zona) {
      throw new NotFoundError(`Zona com ID '${id}' não encontrada.`);
    }

    const localizacoesActivas = await this.prisma.armazemLocalizacao.count({
      where: { zonaId: id, ativo: true },
    });
    if (localizacoesActivas > 0) {
      throw new BusinessRuleError(
        `A zona '${zona.codigo}' tem ${localizacoesActivas} localização(ões) activa(s). Desactive-as primeiro.`
      );
    }

    return this.prisma.armazemZona.update({
      where: { id },
      data: { ativo: false },
    });
  }

  // ── Localizações ─────────────────────────────────────────────────────────

  /**
   * Cria uma localização, validando pai, zona, código e capacidade.
   */
  async criarLocalizacao(rawInput: unknown): Promise<ArmazemLocalizacao> {
    const data: CriarLocalizacaoInput = criarLocalizacaoSchema.parse(rawInput);

    const zona = await this.repo.findZonaById(data.zonaId);
    if (!zona) {
      throw new NotFoundError(`Zona com ID '${data.zonaId}' não encontrada.`);
    }
    if (!zona.ativo) {
      throw new BusinessRuleError(
        `A zona '${zona.codigo}' está inactiva. Reactive-a antes de criar localizações.`
      );
    }

    // O pai tem de existir e de pertencer à mesma zona.
    //
    // Esta é a validação que a base de dados não faz. `parentId` é uma
    // auto-relação sem restrição de zona: o schema aceitaria um pai da zona A
    // como pai de uma localização da zona B, e a leitura da árvore por zona
    // deixaria essa localização órfã. `onDelete: Cascade` não protege deste
    // caso, porque nada é apagado.
    if (data.parentId) {
      const pai = await this.repo.findById(data.parentId);
      if (!pai) {
        throw new NotFoundError(`Localização-pai com ID '${data.parentId}' não encontrada.`);
      }
      if (pai.zonaId !== data.zonaId) {
        throw new BusinessRuleError(
          `A localização-pai '${pai.codigo}' pertence a outra zona. Uma localização só pode ter pai da sua própria zona.`
        );
      }
      if (!pai.ativo) {
        throw new BusinessRuleError(
          `A localização-pai '${pai.codigo}' está inactiva.`
        );
      }
    }

    const existente = await this.prisma.armazemLocalizacao.findUnique({
      where: { zonaId_codigo: { zonaId: data.zonaId, codigo: data.codigo } },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictError(`Já existe a localização '${data.codigo}' nesta zona.`);
    }

    return this.repo.create({
      zonaId: data.zonaId,
      parentId: data.parentId ?? null,
      codigo: data.codigo,
      designacao: data.designacao ?? null,
      tipo: data.tipo,
      corredor: data.corredor ?? null,
      estante: data.estante ?? null,
      nivel: data.nivel ?? null,
      posicao: data.posicao ?? null,
      capacidadeQuantidade:
        data.capacidadeQuantidade === null ? null : new Prisma.Decimal(data.capacidadeQuantidade),
      capacidadePeso:
        data.capacidadePeso === null ? null : new Prisma.Decimal(data.capacidadePeso),
      capacidadeVolume:
        data.capacidadeVolume === null ? null : new Prisma.Decimal(data.capacidadeVolume),
      permitirMixProdutos: data.permitirMixProdutos ?? true,
      permitirMixLotes: data.permitirMixLotes ?? true,
      isPickable: data.isPickable ?? true,
      isPutaway: data.isPutaway ?? true,
      ativo: true,
    });
  }

  /**
   * Actualiza uma localização.
   *
   * `zonaId` e `codigo` ficam de fora: mudar a zona de uma localização com
   * stockWOULD mudar a identidade da posição de stock e a chave única do
   * `estoques` deixaria de bater certo com as leituras por zona.
   */
  async actualizarLocalizacao(id: string, rawInput: unknown): Promise<ArmazemLocalizacao> {
    const data: ActualizarLocalizacaoInput = actualizarLocalizacaoSchema.parse(rawInput);

    const existente = await this.repo.findById(id);
    if (!existente) {
      throw new NotFoundError(`Localização com ID '${id}' não encontrada.`);
    }

    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) {
        throw new BusinessRuleError('Uma localização não pode ser pai de si própria.');
      }
      const pai = await this.repo.findById(data.parentId);
      if (!pai) {
        throw new NotFoundError(`Localização-pai com ID '${data.parentId}' não encontrada.`);
      }
      if (pai.zonaId !== existente.zonaId) {
        throw new BusinessRuleError(
          `A localização-pai '${pai.codigo}' pertence a outra zona.`
        );
      }

      // Mover um nó debaixo de um seu descendente cria um ciclo. O `CHECK` da
      // base só impede o auto-pai, pelo que o percurso é feito aqui.
      if (await this.eDescendenteDe(data.parentId, id)) {
        throw new BusinessRuleError(
          'Não é possível mover uma localização para dentro de si mesma.'
        );
      }
    }

    return this.repo.update(id, {
      ...(data.designacao !== undefined && { designacao: data.designacao }),
      ...(data.tipo !== undefined && { tipo: data.tipo }),
      ...(data.corredor !== undefined && { corredor: data.corredor }),
      ...(data.estante !== undefined && { estante: data.estante }),
      ...(data.nivel !== undefined && { nivel: data.nivel }),
      ...(data.posicao !== undefined && { posicao: data.posicao }),
      ...(data.capacidadeQuantidade !== undefined && {
        capacidadeQuantidade:
          data.capacidadeQuantidade === null ? null : new Prisma.Decimal(data.capacidadeQuantidade),
      }),
      ...(data.capacidadePeso !== undefined && {
        capacidadePeso:
          data.capacidadePeso === null ? null : new Prisma.Decimal(data.capacidadePeso),
      }),
      ...(data.capacidadeVolume !== undefined && {
        capacidadeVolume:
          data.capacidadeVolume === null ? null : new Prisma.Decimal(data.capacidadeVolume),
      }),
      ...(data.permitirMixProdutos !== undefined && {
        permitirMixProdutos: data.permitirMixProdutos,
      }),
      ...(data.permitirMixLotes !== undefined && { permitirMixLotes: data.permitirMixLotes }),
      ...(data.isPickable !== undefined && { isPickable: data.isPickable }),
      ...(data.isPutaway !== undefined && { isPutaway: data.isPutaway }),
      ...(data.ativo !== undefined && { ativo: data.ativo }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
    });
  }

  /**
   * Diz se `possivelPai` está na subárvore de `ancestral`.
   *
   * Percorre para cima a partir do candidato. É o inverso de percorrer para
   * baixo, e por isso não precisa de um número ilimitado de iterações: a cada passo sobe um nível
   * e um `Set` garante que um ciclo não se repete.
   */
  private async eDescendenteDe(possivelPai: string, ancestral: string): Promise<boolean> {
    const vistos = new Set<string>();
    let actual = possivelPai;

    while (actual && !vistos.has(actual)) {
      if (actual === ancestral) return true;
      vistos.add(actual);
      const no = await this.repo.findById(actual);
      if (!no) return false;
      actual = no.parentId ?? '';
    }

    return false;
  }

  /**
   * Desactiva uma localização.
   *
   * Não apaga: há `estoques` e `movimentos_stock` a apontar para a localização.
   * Uma prateleira desactivada continua no histórico e sai da operação corrente.
   */
  async desactivarLocalizacao(id: string): Promise<ArmazemLocalizacao> {
    const existente = await this.repo.findById(id);
    if (!existente) {
      throw new NotFoundError(`Localização com ID '${id}' não encontrada.`);
    }

    return this.repo.deactivate(id);
  }

  /**
   * Desactiva uma localização e toda a sua subárvore.
   *
   * Desactivar só a mãe deixaria as filhas activas e ainda a receber mercadoria,
   * o que é incoerente: uma prateleira fechada com gavetas abertas.
   */
  async desactivarSubarvore(id: string): Promise<{ total: number }> {
    const existente = await this.repo.findById(id);
    if (!existente) {
      throw new NotFoundError(`Localização com ID '${id}' não encontrada.`);
    }

    const total = await this.repo.deactivateSubtree(id);
    return { total };
  }

  /**
   * Lista as localizações de uma zona, com filtros opcionais.
   *
   * `zonaId` é obrigatório porque é a zona que dá a unicidade do código. Sem
   * ele, "A01" em três zonas diferentes colidiria na resposta, e o operador
   * não saberia qual prateleira está a ver.
   */
  async listarLocalizacoes(rawInput: unknown): Promise<ArmazemLocalizacao[]> {
    const filtros = filtrosLocalizacaoSchema.parse(rawInput ?? {});

    if (!filtros.zonaId) {
      throw new ValidationError('Indique a zona cujas localizações quer listar.');
    }

    return this.repo.findByZona(filtros.zonaId, {
      search: filtros.search,
      apenasAtivas: filtros.apenasAtivas,
      isPickable: filtros.apenasPickable,
      isPutaway: filtros.apenasPutaway,
    });
  }

  /**
   * Árvore completa do armazém: `armazém → áreas → zonas → localizações`.
   */
  async obterArvore(armazemId: string): Promise<ArvoreLocalizacoes[]> {
    const armazem = await this.prisma.armazem.findUnique({
      where: { id: armazemId },
      select: { id: true },
    });
    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${armazemId}' não encontrado.`);
    }

    return this.repo.getTree(armazemId);
  }

  /**
   * Filhos directos de uma localização, ou as raízes da zona quando não há pai.
   */
  async obterFilhos(
    parentId: string | null,
    filtros: { zonaId?: string; apenasAtivas?: boolean } = {}
  ): Promise<ArmazemLocalizacao[]> {
    const filtro: FiltrosLocalizacao = {};
    if (filtros.apenasAtivas !== undefined) filtro.apenasAtivas = filtros.apenasAtivas;
    if (filtros.zonaId !== undefined) filtro.zonaId = filtros.zonaId;

    return this.repo.getChildren(parentId ?? null, filtro);
  }

  /**
   * Localizações com capacidade livre para a quantidade pedida.
   *
   * Devolve apenas as que passam o filtro de capacidade; quem chama usa isto
   * para mostrar ao operador onde há espaço, e `LocalizacaoRepository` trata o
   * `null` como "sem limite declarado".
   */
  async obterLocalizacoesDisponiveis(rawInput: unknown): Promise<ArmazemLocalizacao[]> {
    const data: SugestoesLocalizacaoInput = sugestoesLocalizacaoSchema.parse(rawInput);

    const armazem = await this.prisma.armazem.findUnique({
      where: { id: data.armazemId },
      select: { id: true, ativo: true },
    });
    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${data.armazemId}' não encontrado.`);
    }
    if (!armazem.ativo) {
      throw new BusinessRuleError(
        'Não é possível sugerir localizações num armazém inactivo.'
      );
    }

    const filtro: FiltrosLocalizacaoDisponivel = {
      armazemId: data.armazemId,
      quantidadeAEntregar: data.quantidade,
    };

    if (data.artigoId) filtro.artigoId = data.artigoId;
    // `loteId` entra como filtro de `estoques` só se o repositório o aceitar.
    // Não entra: a capacidade é da prateleira, não do lote, e mezclar os dois
    //levels faria uma prateleira com 100 unidades parecer cheia só porque guarda
    // mercadoria de outro lote.

    return this.repo.getAvailableLocations(filtro);
  }

  /**
   * Localização pelo ID, com zona e área carregadas.
   *
   * Devolve `NotFoundError` em vez de `null`: quem chama é um handler IPC, e
   * um `null` silencioso transformar-se-ia num `success: true` sem dados.
   */
  async obterPorId(id: string): Promise<ArmazemLocalizacao> {
    const existente = await this.repo.findById(id);
    if (!existente) {
      throw new NotFoundError(`Localização com ID '${id}' não encontrada.`);
    }
    return existente;
  }

  /**
   * Áreas de um armazém.
   *
   * Alimenta o filtro em cascata da UI (armazém → área → zona → localização):
   * a hierarquia não é percorrida no renderer, cada nível é pedido por si.
   */
  async listarAreas(armazemId: string): Promise<ArmazemArea[]> {
    const armazem = await this.prisma.armazem.findUnique({
      where: { id: armazemId },
      select: { id: true },
    });
    if (!armazem) {
      throw new NotFoundError(`Armazém com ID '${armazemId}' não encontrado.`);
    }

    return this.repo.findAreasByArmazem(armazemId);
  }

  /**
   * Zonas de uma área. Segundo degrau do mesmo filtro em cascata.
   */
  async listarZonas(areaId: string): Promise<ArmazemZona[]> {
    const area = await this.repo.findAreaById(areaId);
    if (!area) {
      throw new NotFoundError(`Área com ID '${areaId}' não encontrada.`);
    }

    return this.repo.findZonasByArea(areaId);
  }

  /**
   * Capacidade declarada de uma localização contra o stock que lá está.
   *
   * `null` em qualquer capacidade continua a significar "sem limite declarado",
   * convenção de M2 — a comparação com `quantidadeActual` é feita por quem lê.
   */
  async mostrarCapacidade(id: string) {
    const localizacao = await this.obterPorId(id);
    const quantidadeActual = await this.estoqueRepo.totalByLocalizacao(id);

    return {
      id: localizacao.id,
      codigo: localizacao.codigo,
      designacao: localizacao.designacao,
      capacidadeQuantidade: localizacao.capacidadeQuantidade,
      capacidadePeso: localizacao.capacidadePeso,
      capacidadeVolume: localizacao.capacidadeVolume,
      quantidadeActual,
    };
  }

  /**
   * Estado operacional de uma localização: activa, bloqueada e as duas flags
   * que decidem se recebe putaway ou serve picking.
   */
  async mostrarEstado(id: string) {
    const localizacao = await this.obterPorId(id);

    return {
      id: localizacao.id,
      codigo: localizacao.codigo,
      ativo: localizacao.ativo,
      bloqueada: localizacao.bloqueada,
      isPickable: localizacao.isPickable,
      isPutaway: localizacao.isPutaway,
    };
  }

  /**
   * Stock actualmente numa localização.
   */
  async obterStockPorLocalizacao(localizacaoId: string) {
    const localizacao = await this.repo.findById(localizacaoId);
    if (!localizacao) {
      throw new NotFoundError(`Localização com ID '${localizacaoId}' não encontrada.`);
    }

    return this.estoqueRepo.findByLocation(localizacaoId);
  }
}

export const localizacaoService = new LocalizacaoService();
