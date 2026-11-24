/**
 * @file putaway-picking.router.ts
 * @description Registo de canais IPC para Putaway/Picking (EPIC 3, TASK-025).
 *
 * Exposição de handlers para sugestões de colocação e listagem de picking.
 * Cada handler valida o payload com Zod antes de chamar o serviço.
 */

import { putawayService } from '../services/putaway.service';
import { pickingService } from '../services/picking.service';
import { authService } from '../services/auth.service';
import { BusinessRuleError } from '../utils/errors';

import { handleLicenciado } from '../utils/licensed-handler';

export function registerPuttawayPickingRouter(): void {
  const handle = handleLicenciado('estoque');
  /** Sugerir localizações disponíveis para um artigo numa dada zona. */
  handle('putaway:sugerir', async (_event, raw) => {
    try {
      const result = await putawayService.sugerirLocalizacao(raw);
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      if (error instanceof BusinessRuleError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          }
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Executar a colocação de stock para uma localização escolhida. */
  handle('putaway:executar', async (_event, { artigoId, zonaId, localizacaoId, quantidade }) => {
    try {
      const sessao = authService.getCurrentSession();
      await putawayService.executarPutaway(
        artigoId,
        zonaId,
        localizacaoId,
        quantidade,
        { criadoPorId: sessao?.id ?? null }
      );
      return {
        success: true,
        data: { mensagem: 'Putaway executado com sucesso.' },
      };
    } catch (error: any) {
      if (error instanceof BusinessRuleError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          }
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });

  /** Listar posições de stock elegíveis para picking. */
  handle('picking:listar-elegiveis', async (_event, raw) => {
    try {
      const result = await pickingService.listarElegiveis(raw);
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      if (error instanceof BusinessRuleError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          }
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        }
      };
    }
  });
}