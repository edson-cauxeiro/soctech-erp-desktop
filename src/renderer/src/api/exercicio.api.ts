/**
 * @file exercicio.api.ts
 * @description Cliente de API tipado para Gestão de Exercício Fiscal via window.api (Electron IPC).
 */

import { ExercicioFiscalDto, IpcResponse } from '../@types/electron';

export interface CreateExercicioPayload {
  ano: string;
  empresaId: string;
  modulos?: string[];
  dataInicio: string;
  dataFim: string;
  estado?: 'aberto' | 'fechado';
}

export const exercicioApi = {
  /**
   * Lista todos os exercícios fiscais.
   */
  async list(empresaId?: string): Promise<IpcResponse<ExercicioFiscalDto[]>> {
    if (typeof window !== 'undefined' && window.api?.exercicio?.list) {
      return window.api.exercicio.list(empresaId);
    }
    return {
      success: true,
      data: [
        {
          id: 'mock-ex-1',
          ano: '2026',
          empresaId: empresaId || 'mock-empresa',
          modulosJson: '["vendas","financas","compras","estoque","fiscal"]',
          dataInicio: '2026-01-01',
          dataFim: '2026-12-31',
          estado: 'aberto',
          createdAt: new Date().toISOString(),
          empresa: {
            id: empresaId || 'mock-empresa',
            nome: 'DoraERP Soluções Empresariais, Lda.',
            nif: '599999990',
            identificador: 'EMP001',
          },
        },
      ],
    };
  },

  /**
   * Cria um novo ano de exercício fiscal.
   */
  async create(data: CreateExercicioPayload): Promise<IpcResponse<ExercicioFiscalDto>> {
    if (typeof window !== 'undefined' && window.api?.exercicio?.create) {
      return window.api.exercicio.create(data);
    }
    return {
      success: true,
      data: {
        id: `mock-ex-${Date.now()}`,
        ano: data.ano,
        empresaId: data.empresaId,
        modulosJson: JSON.stringify(data.modulos || []),
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        estado: data.estado || 'aberto',
        createdAt: new Date().toISOString(),
      },
    };
  },

  /**
   * Elimina um exercício fiscal.
   */
  async delete(id: string): Promise<IpcResponse<ExercicioFiscalDto>> {
    if (typeof window !== 'undefined' && window.api?.exercicio?.delete) {
      return window.api.exercicio.delete(id);
    }
    return {
      success: true,
      data: {
        id,
        ano: '',
        empresaId: '',
        modulosJson: '[]',
        dataInicio: '',
        dataFim: '',
        estado: 'fechado',
        createdAt: new Date().toISOString(),
      },
    };
  },
};
