/**
 * @file ipc-response.ts
 * @description Padrão de respostas IPC estruturadas entre o Main Process e o Renderer.
 */

export interface IpcSuccess<T> {
  success: true;
  data: T;
}

export interface IpcError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type IpcResponse<T> = IpcSuccess<T> | IpcError;

/**
 * Normaliza recursivamente valores do Prisma (como Prisma.Decimal e BigInt)
 * para tipos primitivos JSON seguros para tráfego via Electron IPC.
 */
export function serializeIpcData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === 'bigint') {
    return Number(data) as unknown as T;
  }
  if (typeof data === 'object') {
    // Prisma.Decimal ou Decimal.js
    if (
      typeof (data as any).toNumber === 'function' ||
      (typeof (data as any).toFixed === 'function' && 'd' in (data as any) && 'e' in (data as any) && 's' in (data as any))
    ) {
      return Number(data.toString()) as unknown as T;
    }
    if (data instanceof Date) {
      return data;
    }
    if (Array.isArray(data)) {
      return data.map((item) => serializeIpcData(item)) as unknown as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      copy[key] = serializeIpcData(value);
    }
    return copy as T;
  }
  return data;
}

/**
 * Cria uma resposta IPC de sucesso.
 * @param data - Dados a serem retornados.
 * @returns Objeto IpcSuccess formatado.
 */
export function ok<T>(data: T): IpcSuccess<T> {
  return { success: true, data: serializeIpcData(data) };
}

/**
 * Cria uma resposta IPC de erro.
 * @param code - Código do erro (ex: 'UNAUTHORIZED', 'VALIDATION_ERROR').
 * @param message - Mensagem legível do erro.
 * @param details - Detalhes adicionais (opcional).
 * @returns Objeto IpcError formatado.
 */
export function err(code: string, message: string, details?: unknown): IpcError {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details: serializeIpcData(details) } : {})
    }
  };
}
