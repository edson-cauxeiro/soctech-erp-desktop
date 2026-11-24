/**
 * @file localizacao.api.ts
 * @description Cliente de API tipado para a estrutura de armazéns (EPIC 3, TASK-023/029).
 *
 * `areas` e `zonas` são os degraus do filtro em cascata da tela de stock por
 * localização: cada nível é pedido por si, com o id do nível anterior, em vez
 * de trazer a árvore inteira para filtrar no cliente.
 */

import type {
  AreaArmazemDto,
  ArvoreLocalizacaoDto,
  IpcResponse,
  LocalizacaoArmazemDto,
  ZonaArmazemDto,
} from '../@types/electron';

export const localizacaoApi = {
  async list(filters?: {
    zonaId?: string;
    search?: string;
    apenasAtivas?: boolean;
    apenasPickable?: boolean;
    apenasPutaway?: boolean;
  }): Promise<IpcResponse<LocalizacaoArmazemDto[]>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.list) {
      return window.api.localizacoes.list(filters);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async get(id: string): Promise<IpcResponse<LocalizacaoArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.get) {
      return window.api.localizacoes.get(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async areas(armazemId: string): Promise<IpcResponse<AreaArmazemDto[]>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.areas) {
      return window.api.localizacoes.areas(armazemId);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async zonas(areaId: string): Promise<IpcResponse<ZonaArmazemDto[]>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.zonas) {
      return window.api.localizacoes.zonas(areaId);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async criarArea(data: {
    armazemId: string;
    codigo: string;
    designacao: string;
    tipo?: string | null;
    descricao?: string | null;
    ativo?: boolean;
  }): Promise<IpcResponse<AreaArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.criarArea) {
      return window.api.localizacoes.criarArea(data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async criarZona(data: {
    areaId: string;
    codigo: string;
    designacao: string;
    descricao?: string | null;
    altaRotacao?: boolean;
    temperaturaControlada?: boolean;
    ativo?: boolean;
  }): Promise<IpcResponse<ZonaArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.criarZona) {
      return window.api.localizacoes.criarZona(data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async actualizarArea(
    id: string,
    data: {
      codigo?: string;
      designacao?: string;
      tipo?: string | null;
      descricao?: string | null;
      ativo?: boolean;
    }
  ): Promise<IpcResponse<AreaArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.actualizarArea) {
      return window.api.localizacoes.actualizarArea(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async desactivarArea(id: string): Promise<IpcResponse<AreaArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.desactivarArea) {
      return window.api.localizacoes.desactivarArea(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async actualizarZona(
    id: string,
    data: {
      codigo?: string;
      designacao?: string;
      descricao?: string | null;
      altaRotacao?: boolean;
      temperaturaControlada?: boolean;
      ativo?: boolean;
    }
  ): Promise<IpcResponse<ZonaArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.actualizarZona) {
      return window.api.localizacoes.actualizarZona(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async desactivarZona(id: string): Promise<IpcResponse<ZonaArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.desactivarZona) {
      return window.api.localizacoes.desactivarZona(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async tree(armazemId: string): Promise<IpcResponse<ArvoreLocalizacaoDto[]>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.tree) {
      return window.api.localizacoes.tree(armazemId);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async create(data: {
    zonaId: string;
    parentId?: string | null;
    codigo: string;
    designacao?: string | null;
    tipo?: string;
    capacidadeQuantidade?: number | null;
    capacidadePeso?: number | null;
    capacidadeVolume?: number | null;
    permitirMixProdutos?: boolean;
    permitirMixLotes?: boolean;
    isPickable?: boolean;
    isPutaway?: boolean;
  }): Promise<IpcResponse<LocalizacaoArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.create) {
      return window.api.localizacoes.create(data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async update(
    id: string,
    data: {
      designacao?: string | null;
      tipo?: string;
      corredor?: string | null;
      estante?: string | null;
      nivel?: number | null;
      posicao?: number | null;
      capacidadeQuantidade?: number | null;
      capacidadePeso?: number | null;
      capacidadeVolume?: number | null;
      permitirMixProdutos?: boolean;
      permitirMixLotes?: boolean;
      isPickable?: boolean;
      isPutaway?: boolean;
      parentId?: string | null;
      ativo?: boolean;
      bloqueada?: boolean;
    }
  ): Promise<IpcResponse<LocalizacaoArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.update) {
      return window.api.localizacoes.update(id, data);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async delete(id: string): Promise<IpcResponse<LocalizacaoArmazemDto>> {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.delete) {
      return window.api.localizacoes.delete(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async mostrarCapacidade(id: string): Promise<
    IpcResponse<{
      id: string;
      codigo: string;
      designacao?: string | null;
      capacidadeQuantidade: number | null;
      capacidadePeso: number | null;
      capacidadeVolume: number | null;
      quantidadeActual: number;
    }>
  > {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.mostrarCapacidade) {
      return window.api.localizacoes.mostrarCapacidade(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },

  async mostrarEstado(id: string): Promise<
    IpcResponse<{
      id: string;
      codigo: string;
      ativo: boolean;
      bloqueada: boolean;
      isPickable: boolean;
      isPutaway: boolean;
    }>
  > {
    if (typeof window !== 'undefined' && window.api?.localizacoes?.mostrarEstado) {
      return window.api.localizacoes.mostrarEstado(id);
    }
    return { success: false, error: { code: 'UNAVAILABLE', message: 'API não disponível.' } };
  },
};
