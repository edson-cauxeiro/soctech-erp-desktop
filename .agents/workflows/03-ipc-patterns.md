# 03 — Padrões de Comunicação IPC Electron

> Guia mandatório para criação e consumo de canais IPC entre o Main Process e o Renderer.

## 1. Regras Fundamentais de Segurança e Arquitetura
1. **Sem Acesso Direto:** O Renderer **jamais** importa electron, node:*, fs, ou @prisma/client.
2. **Context Isolation:** Toda comunicação passa pelo contextBridge.exposeInMainWorld("api", ...) no Preload.
3. **Respostas Estruturadas:** Todos os canais IPC respondem com o tipo IpcResponse<T>.

## 2. Tipagem Padronizada de Resposta (src/main/utils/ipc-response.ts)
`	ypescript
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
export function ok<T>(data: T): IpcSuccess<T> { return { success: true, data }; }
export function err(code: string, message: string, details?: unknown): IpcError {
  return { success: false, error: { code, message, details } };
}
`

## 3. Padrão de Nomenclatura de Canais IPC
Formato: {modulo}:{acao} ou {modulo}:{entidade}:{acao}
- auth:login, auth:logout, auth:me
- artigos:list, artigos:create, artigos:update, artigos:inativar
- clientes:list, clientes:create, clientes:update
- faturas:emitir, faturas:anular, faturas:list
- stock:mover, stock:consultar-saldo
- tesouraria:lancar, tesouraria:saldo
- fiscal:saft:gerar, fiscal:saft:validar

## 4. Camadas de Implementação
1. **Router (Main):** src/main/routers/{modulo}.router.ts
2. **Controller (Main):** src/main/controllers/{modulo}.controller.ts
3. **Service (Main):** src/main/services/{modulo}.service.ts
4. **Repository (Main):** src/main/repositories/{modulo}.repository.ts
5. **Preload:** src/preload/index.ts
6. **Renderer API & Hook:** src/renderer/src/api/ e src/renderer/src/hooks/
