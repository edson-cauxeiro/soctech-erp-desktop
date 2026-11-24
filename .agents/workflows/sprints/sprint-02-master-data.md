# Sprint 02 — Master Data 360° (Artigos, Clientes, Fornecedores e Empresa)

> **Duração:** 2 Semanas | **Estado:** Concluído | **Prioridade:** P0

---

## 🎯 Objetivos do Sprint
1. Cadastro unificado de Artigos com RN01.1 (SKU/EAN únicos), RN01.2 (Serviços sem estoque), RN01.3 (PMP) e RN01.4 (Unidades).
2. Cadastro de Clientes com RN02.1 (Validação de NIF PT/AO) e RN02.2 (Trava de Limite de Crédito).
3. Gestão de Fornecedores (Fichas completas, IBAN, Retenção).
4. Configuração da Empresa e séries documentais (concluído previamente).

---

## 📋 Tarefas do Sprint

### 1. Módulo Artigos (Master Data 360°)
- [x] `[ART-01]` Criar `src/main/validators/artigo.validator.ts` com Zod (RN01.1, RN01.2, RN01.4).
- [x] `[ART-02]` Criar `src/main/services/artigo.service.ts` com consultas Prisma, RN01.1 (SKU/EAN único) e RN01.2 (serviço).
- [x] `[ART-03]` Criar `src/main/routers/artigo.router.ts` e controlador (`artigos:list`, `artigos:get`, `artigos:create`, `artigos:update`, `artigos:delete`).
- [x] `[ART-04]` Criar API client `artigo.api.ts` e expor no preload.
- [x] `[ART-05]` Integrar `ArtigoManager.tsx` e `ArtigoForm.tsx` com tabela de listagem e filtros em `vendas.tsx` e `estoque.tsx`.

### 2. Módulo Clientes
- [x] `[CLI-01]` Criar `src/main/validators/cliente.validator.ts` e utilitário `nif-validator.ts` (validação NIF PT/AO - RN02.1).
- [x] `[CLI-02]` Criar `src/main/services/cliente.service.ts` e controlador IPC (Limite de Crédito - RN02.2).
- [x] `[CLI-03]` Criar `src/main/routers/cliente.router.ts` (`clientes:list`, `clientes:get`, `clientes:create`, `clientes:update`, `clientes:delete`).
- [x] `[CLI-04]` Implementar UI de gestão de clientes em `ClienteManager.tsx` integrado em `vendas.tsx`.

### 3. Fornecedores & Empresa
- [x] `[FOR-01]` CRUD completo de Fornecedores (Validator, Service, Router e UI em `FornecedorManager.tsx` em `compras.tsx`).
- [x] `[EMP-01]` Serviço e router para EmpresaConfig e séries em `configuracoes.tsx` (concluído previamente).

### 4. Testes Automatizados
- [x] `[TEST-03]` Teste unitário de SKU/EAN duplicado e regras de serviço em `artigo.service.test.ts`.
- [x] `[TEST-04]` Teste unitário do algoritmo validador de NIF PT e AO em `nif-validator.test.ts`.
- [x] `[TEST-05]` Testes unitários de regras de negócio de clientes e fornecedores em `cliente.service.test.ts` e `fornecedor.service.test.ts`.
