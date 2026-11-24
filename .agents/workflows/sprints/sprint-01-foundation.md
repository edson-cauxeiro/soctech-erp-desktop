# Sprint 01 — Fundação, Base de Dados, IOC e Autenticação

> **Duração:** 2 Semanas | **Estado:** Concluído | **Prioridade:** P0

## 🎯 Objetivos
1. Estabelecer o Prisma Client Singleton no Main Process.
2. Padronizar a comunicação IPC com `src/main/utils/ipc-response.ts`.
3. Configurar `contextBridge` seguro no Preload e tipagem em `renderer/src/@types`.
4. Implementar Authentication com bcrypt, sessão e perfis RBAC (RNF03).
5. Configurar suíte de testes Vitest e validar regras de negócio.

---

## 📋 Tarefas do Sprint
- [x] `[INFRA-01]` Criar `src/main/database/prisma.ts` (Singleton do PrismaClient).
- [x] `[INFRA-02]` Criar `src/main/config/env.ts` (Validação de env vars com Zod).
- [x] `[INFRA-03]` Configurar `prisma.config.ts` e testar conexão com o postgres.
- [x] `[INFRA-04]` Criar seed inicial em `prisma/seed.ts` (Perfis e Admin).
- [x] `[IPC-01]` Criar `src/main/utils/ipc-response.ts` (`ok()`, `err()`, `IpcResponse<T>`).
- [x] `[IPC-02]` Criar `src/main/utils/errors.ts` (classe `AppError`).
- [x] `[INFRA-05]` Configurar `src/preload/index.ts` e `src/renderer/src/@types/electron.d.ts`.
- [x] `[AUTH-01]` Criar `src/main/validators/auth.validator.ts`.
- [x] `[AUTH-02]` Criar `src/main/services/auth.service.ts` (bcrypt hash e login).
- [x] `[AUTH-03]` Criar `src/main/routers/auth.router.ts` (`auth:login`, `auth:logout`, `auth:me`).
- [x] `[AUTH-04]` Criar `src/main/middlewares/rbac.middleware.ts`.
- [x] `[AUTH-05]` Criar `src/renderer/src/api/auth.api.ts` e hook `useAuth.ts`.
- [x] `[AUTH-06]` Integrar a página `src/renderer/src/pages/login.tsx`.
- [x] `[AUTH-07]` Criar Guard de rota protegida em `App.tsx`.
- [x] `[TEST-01]` Testes unitários do AuthService em `auth.service.test.ts` (Vitest).
