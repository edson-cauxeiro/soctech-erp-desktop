/**
 * @file empresa.controller.ts
 * @description Controlador IPC para consulta e configuração da Empresa, Exercícios e Séries.
 */

import { empresaService, EmpresaService, EmpresaInput } from '../services/empresa.service';
import { exercicioService, ExercicioService, ExercicioInput } from '../services/exercicio.service';
import { serieService, SerieService, SerieInput } from '../services/serie.service';
import { authService, AuthService } from '../services/auth.service';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError } from '../utils/errors';
import { requirePermission } from '../middlewares/rbac.middleware';

export class EmpresaController {
  private empresaService: EmpresaService;
  private exercicioService: ExercicioService;
  private serieService: SerieService;
  private auth: AuthService;

  constructor(
    empresaSvc: EmpresaService = empresaService,
    exercicioSvc: ExercicioService = exercicioService,
    serieSvc: SerieService = serieService,
    auth: AuthService = authService
  ) {
    this.empresaService = empresaSvc;
    this.exercicioService = exercicioSvc;
    this.serieService = serieSvc;
    this.auth = auth;
  }

  // ==========================================
  // EMPRESA
  // ==========================================

  /**
   * Lista todas as empresas.
   */
  async list(): Promise<IpcResponse<unknown>> {
    try {
      const empresas = await this.empresaService.listEmpresas();
      return ok(empresas);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar empresas.');
    }
  }

  /**
   * Obtém os dados da empresa ativa ou por ID.
   */
  async get(id?: string): Promise<IpcResponse<unknown>> {
    try {
      const empresa = await this.empresaService.getEmpresa(id);
      return ok(empresa);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao obter dados da empresa.');
    }
  }

  /**
   * Cria uma nova empresa.
   */
  async create(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!payload || typeof payload !== 'object') {
        return err('INVALID_PAYLOAD', 'Dados de criação de empresa inválidos.');
      }

      const result = await this.empresaService.createEmpresa(payload as EmpresaInput);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar empresa.');
    }
  }

  /**
   * Atualiza uma empresa existente.
   */
  async update(id: string, payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!id || !payload || typeof payload !== 'object') {
        return err('INVALID_PAYLOAD', 'Dados de atualização inválidos.');
      }

      const result = await this.empresaService.updateEmpresa(id, payload as EmpresaInput);

      // Atualiza também os dados na sessão se for a empresa atual
      if (session && session.empresaConfigId === id) {
        session.empresaNome = result.nome;
        session.empresaNif = result.nif;
        this.auth.setSession(session);
      }

      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao atualizar dados da empresa.');
    }
  }

  /**
   * Elimina uma empresa.
   */
  async delete(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!id) {
        return err('INVALID_PAYLOAD', 'ID da empresa não especificado.');
      }

      const result = await this.empresaService.deleteEmpresa(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao eliminar empresa.');
    }
  }

  /**
   * Guarda os dados da empresa padrão (compatibilidade).
   */
  async save(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!payload || typeof payload !== 'object') {
        return err('INVALID_PAYLOAD', 'Dados de configuração da empresa inválidos.');
      }

      const result = await this.empresaService.saveEmpresa(payload as EmpresaInput);

      if (session) {
        session.empresaConfigId = result.id;
        session.empresaNome = result.nome;
        session.empresaNif = result.nif;
        this.auth.setSession(session);
      }

      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao gravar dados da empresa.');
    }
  }

  // ==========================================
  // EXERCÍCIO FISCAL
  // ==========================================

  async listExercicios(empresaId?: string): Promise<IpcResponse<unknown>> {
    try {
      const exercicios = await this.exercicioService.listExercicios(empresaId);
      return ok(exercicios);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar exercícios.');
    }
  }

  async createExercicio(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!payload || typeof payload !== 'object') {
        return err('INVALID_PAYLOAD', 'Dados de criação de exercício inválidos.');
      }

      const result = await this.exercicioService.createExercicio(payload as ExercicioInput);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar exercício fiscal.');
    }
  }

  async deleteExercicio(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!id) {
        return err('INVALID_PAYLOAD', 'ID do exercício não especificado.');
      }

      const result = await this.exercicioService.deleteExercicio(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao eliminar exercício fiscal.');
    }
  }

  // ==========================================
  // SÉRIES DE DOCUMENTOS
  // ==========================================

  async listSeries(empresaId?: string, tipoDocumento?: any): Promise<IpcResponse<unknown>> {
    try {
      const series = await this.serieService.listSeries(empresaId, tipoDocumento);
      return ok(series);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao listar séries.');
    }
  }

  async createSerie(payload: unknown): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!payload || typeof payload !== 'object') {
        return err('INVALID_PAYLOAD', 'Dados de criação de série inválidos.');
      }

      const result = await this.serieService.createSerie(payload as SerieInput);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao criar série.');
    }
  }

  async deleteSerie(id: string): Promise<IpcResponse<unknown>> {
    try {
      const session = this.auth.getCurrentSession();
      requirePermission(session, 'configuracoes', 'write');

      if (!id) {
        return err('INVALID_PAYLOAD', 'ID da série não especificado.');
      }

      const result = await this.serieService.deleteSerie(id);
      return ok(result);
    } catch (error) {
      if (error instanceof AppError) {
        return err(error.code, error.message, error.details);
      }
      return err('INTERNAL_ERROR', (error as Error)?.message || 'Erro ao eliminar série.');
    }
  }
}

export const empresaController = new EmpresaController();

