/**
 * @file rh-errors.ts
 * @description Erros de negócio específicos do módulo de Recursos Humanos.
 *
 * Estendem `AppError` com códigos estáveis (`RH_*`) para que o renderer possa
 * reagir a cada situação sem depender da frase da mensagem. Ver DECISOES.md (ADR-008).
 */

import { AppError } from './errors';

export const RH_ERROR_CODES = {
  NAO_ENCONTRADO: 'RH_NAO_ENCONTRADO',
  VALIDACAO: 'RH_VALIDACAO',
  CONFLITO: 'RH_CONFLITO',
  PERIODO_FECHADO: 'RH_PERIODO_FECHADO',
  JA_PROCESSADO: 'RH_JA_PROCESSADO',
  SEM_CONTRATO_ATIVO: 'RH_SEM_CONTRATO_ATIVO',
  FUNCIONARIO_INATIVO: 'RH_FUNCIONARIO_INATIVO',
  IBAN_EM_FALTA: 'RH_IBAN_EM_FALTA',
  PAGAMENTO_EFETUADO: 'RH_PAGAMENTO_EFETUADO',
  LIQUIDO_NEGATIVO: 'RH_LIQUIDO_NEGATIVO',
  DADOS_FISCAIS_EM_FALTA: 'RH_DADOS_FISCAIS_EM_FALTA',
  FINANCAS_INDISPONIVEL: 'RH_FINANCAS_INDISPONIVEL',
  LOTE_EM_EXECUCAO: 'RH_LOTE_EM_EXECUCAO',
} as const;

export type RhErrorCode = (typeof RH_ERROR_CODES)[keyof typeof RH_ERROR_CODES];

const STATUS_POR_CODIGO: Record<RhErrorCode, number> = {
  RH_NAO_ENCONTRADO: 404,
  RH_VALIDACAO: 400,
  RH_CONFLITO: 409,
  RH_PERIODO_FECHADO: 422,
  RH_JA_PROCESSADO: 409,
  RH_SEM_CONTRATO_ATIVO: 422,
  RH_FUNCIONARIO_INATIVO: 422,
  RH_IBAN_EM_FALTA: 422,
  RH_PAGAMENTO_EFETUADO: 422,
  RH_LIQUIDO_NEGATIVO: 422,
  RH_DADOS_FISCAIS_EM_FALTA: 422,
  RH_FINANCAS_INDISPONIVEL: 503,
  RH_LOTE_EM_EXECUCAO: 409,
};

/** Erro base do módulo de RH. */
export class RhError extends AppError {
  constructor(code: RhErrorCode, message: string, details?: unknown) {
    super(message, code, STATUS_POR_CODIGO[code], details);
    this.name = 'RhError';
  }
}

export class RhNotFoundError extends RhError {
  constructor(message = 'Registo de RH não encontrado.', details?: unknown) {
    super(RH_ERROR_CODES.NAO_ENCONTRADO, message, details);
    this.name = 'RhNotFoundError';
  }
}

export class RhValidationError extends RhError {
  constructor(message: string, details?: unknown) {
    super(RH_ERROR_CODES.VALIDACAO, message, details);
    this.name = 'RhValidationError';
  }
}

export class RhConflictError extends RhError {
  constructor(message: string, details?: unknown) {
    super(RH_ERROR_CODES.CONFLITO, message, details);
    this.name = 'RhConflictError';
  }
}

export class RhBusinessRuleError extends RhError {
  constructor(message: string, details?: unknown) {
    super(RH_ERROR_CODES.VALIDACAO, message, details);
    this.name = 'RhBusinessRuleError';
  }
}

/** Lançado pelo stub do gateway de Finanças enquanto a integração não existe. */
export class FinancasIndisponivelError extends RhError {
  constructor(
    message = 'A integração com o módulo de Finanças ainda não está disponível.',
    details?: unknown
  ) {
    super(RH_ERROR_CODES.FINANCAS_INDISPONIVEL, message, details);
    this.name = 'FinancasIndisponivelError';
  }
}
