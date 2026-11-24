/**
 * @file empresa.api.ts
 * @description Cliente de API tipado para as configurações da Empresa via window.api (Electron IPC).
 */

import { EmpresaConfigDto, IpcResponse } from '../@types/electron';

export interface CreateEmpresaPayload extends Partial<EmpresaConfigDto> {
  modulos?: string[];
}

export const empresaApi = {
  /**
   * Lista todas as empresas.
   */
  async list(): Promise<IpcResponse<EmpresaConfigDto[]>> {
    if (typeof window !== 'undefined' && window.api?.empresa?.list) {
      return window.api.empresa.list();
    }
    return {
      success: true,
      data: [
        {
          id: 'mock-empresa',
          identificador: 'EMP001',
          nome: 'DoraERP Soluções Empresariais, Lda.',
          nif: '5000012345',
          endereco: 'Rua Rainha Ginga, 29, Luanda, Angola',
          pais: 'AO',
          cae: '62010',
          regimeIva: 'geral',
          regimeIvaTipo: 'normal_mensal',
          motivoIsencao: null,
          moedaBase: 'AOA',
          moedaAlternativa: 'USD',
          modulosJson: '["vendas","financas","compras","estoque","fiscal"]',
          anoFiscalInicio: '2026-01-01',
          anoFiscalFim: '2026-12-31',
          serieDefault: '2026',
          dadosBancarios: 'IBAN: AO06 0000 0000 0000 0000 0',
        },
      ],
    };
  },

  /**
   * Obtém os dados de uma empresa por ID ou da empresa ativa.
   */
  async get(id?: string): Promise<IpcResponse<EmpresaConfigDto | null>> {
    if (typeof window !== 'undefined' && window.api?.empresa?.get) {
      return window.api.empresa.get(id);
    }
    return {
      success: true,
      data: {
        id: id || 'mock-empresa',
        identificador: 'EMP001',
        nome: 'DoraERP Soluções Empresariais, Lda.',
        nif: '5000012345',
        endereco: 'Rua Rainha Ginga, 29, Luanda, Angola',
        pais: 'AO',
        cae: '62010',
        regimeIva: 'geral',
        regimeIvaTipo: 'normal_mensal',
        motivoIsencao: null,
        moedaBase: 'AOA',
        moedaAlternativa: 'USD',
        modulosJson: '["vendas","financas","compras","estoque","fiscal"]',
        anoFiscalInicio: '2026-01-01',
        anoFiscalFim: '2026-12-31',
        serieDefault: '2026',
        dadosBancarios: 'IBAN: AO06 0000 0000 0000 0000 0',
      },
    };
  },

  /**
   * Cria uma nova empresa.
   */
  async create(data: CreateEmpresaPayload): Promise<IpcResponse<EmpresaConfigDto>> {
    if (typeof window !== 'undefined' && window.api?.empresa?.create) {
      return window.api.empresa.create(data);
    }
    return {
      success: true,
      data: {
        id: `mock-${Date.now()}`,
        identificador: data.identificador || 'EMP002',
        nome: data.nome || 'Nova Empresa, Lda.',
        nif: data.nif || '500123456',
        endereco: data.endereco || '',
        pais: data.pais || 'AO',
        cae: data.cae || '',
        regimeIva: data.regimeIva || 'geral',
        regimeIvaTipo: data.regimeIvaTipo || 'normal_mensal',
        motivoIsencao: data.motivoIsencao || null,
        moedaBase: data.moedaBase || 'AOA',
        moedaAlternativa: data.moedaAlternativa || null,
        modulosJson: JSON.stringify(data.modulos || []),
        anoFiscalInicio: data.anoFiscalInicio || '2026-01-01',
        anoFiscalFim: data.anoFiscalFim || '2026-12-31',
        serieDefault: data.serieDefault || '2026',
        dadosBancarios: data.dadosBancarios || '',
      },
    };
  },

  /**
   * Atualiza uma empresa existente.
   */
  async update(id: string, data: CreateEmpresaPayload): Promise<IpcResponse<EmpresaConfigDto>> {
    if (typeof window !== 'undefined' && window.api?.empresa?.update) {
      return window.api.empresa.update(id, data);
    }
    return {
      success: true,
      data: {
        id,
        identificador: data.identificador || 'EMP001',
        nome: data.nome || 'Empresa Atualizada',
        nif: data.nif || '599999990',
        endereco: data.endereco || '',
        pais: data.pais || 'AO',
        cae: data.cae || '',
        regimeIva: data.regimeIva || 'geral',
        regimeIvaTipo: data.regimeIvaTipo || 'normal_mensal',
        motivoIsencao: data.motivoIsencao || null,
        moedaBase: data.moedaBase || 'AOA',
        moedaAlternativa: data.moedaAlternativa || null,
        modulosJson: JSON.stringify(data.modulos || []),
        anoFiscalInicio: data.anoFiscalInicio || '2026-01-01',
        anoFiscalFim: data.anoFiscalFim || '2026-12-31',
        serieDefault: data.serieDefault || '2026',
        dadosBancarios: data.dadosBancarios || '',
      },
    };
  },

  /**
   * Elimina uma empresa.
   */
  async delete(id: string): Promise<IpcResponse<EmpresaConfigDto>> {
    if (typeof window !== 'undefined' && window.api?.empresa?.delete) {
      return window.api.empresa.delete(id);
    }
    return {
      success: true,
      data: {
        id,
        nome: 'Empresa Removida',
        nif: '',
        endereco: '',
        pais: 'AO',
        regimeIva: 'geral',
        moedaBase: 'AOA',
        anoFiscalInicio: '2026-01-01',
        anoFiscalFim: '2026-12-31',
      },
    };
  },

  /**
   * Guarda ou atualiza as configurações da empresa padrão (compatibilidade).
   */
  async save(data: Partial<EmpresaConfigDto>): Promise<IpcResponse<EmpresaConfigDto>> {
    if (typeof window !== 'undefined' && window.api?.empresa?.save) {
      return window.api.empresa.save(data);
    }
    return {
      success: true,
      data: {
        id: 'mock-empresa',
        nome: data.nome || 'DoraERP Soluções Empresariais, Lda.',
        nif: data.nif || '599999990',
        endereco: data.endereco || 'Avenida da Liberdade, 100, 1250-001 Lisboa',
        pais: data.pais || 'AO',
        cae: data.cae || '62010',
        regimeIva: data.regimeIva || 'geral',
        moedaBase: data.moedaBase || 'AOA',
        anoFiscalInicio: data.anoFiscalInicio || '2026-01-01',
        anoFiscalFim: data.anoFiscalFim || '2026-12-31',
        serieDefault: data.serieDefault || '2026',
        dadosBancarios: data.dadosBancarios || '',
      },
    };
  },
};

