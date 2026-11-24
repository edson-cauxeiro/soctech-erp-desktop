---
description: 
---

# 01 — Backlog Completo de Tarefas

> Todas as tarefas organizadas com identificadores únicos, prioridade, regras de negócio e camada.

---

## Legenda
- **Prioridade:** P0 (Bloqueante / Essencial) | P1 (Alta) | P2 (Média) | P3 (Melhoria)
- **Tipo:** `BACKEND` | `FRONTEND` | `IPC` | `TEST_UNIT` | `TEST_E2E` | `FISCAL`

---

## 📦 SPRINT 1: Fundação, Base de Dados, IPC e Autenticação
- **[INFRA-01]** Configuração do Prisma Client Singleton em `src/main/database/prisma.ts` e validação de env vars em `src/main/config/env.ts` (P0 - BACKEND)
- **[INFRA-02]** Estrutura padronizada de resposta IPC (`IpcResponse<T>`, erros tipados `AppError`) em `src/main/utils/` (P0 - IPC)
- **[INFRA-03]** Setup de contextBridge seguro em `src/preload/index.ts` e tipagem `window.api` em `src/renderer/src/@types/electron.d.ts` (P0 - IPC)
- **[AUTH-01]** Schema e validação de login com Zod em `src/main/validators/auth.validator.ts` (P0 - BACKEND)
- **[AUTH-02]** Serviço de hashing bcrypt e autenticação de sessão local em `src/main/services/auth.service.ts` (P0 - BACKEND)
- **[AUTH-03]** Handler IPC `auth:login`, `auth:logout`, `auth:me` em `src/main/routers/auth.router.ts` (P0 - IPC)
- **[AUTH-04]** Hook `useAuth` (Zustand + React Query) e integração com a página `login.tsx` (P0 - FRONTEND)
- **[AUTH-05]** Middleware RBAC para proteção de canais IPC por perfil de acesso (RNF03) (P0 - BACKEND)
- **[TEST-01]** Testes unitários do AuthService e validação de senhas com Vitest (P0 - TEST_UNIT)
- **[TEST-02]** Teste E2E do fluxo de login e redirecionamento com Playwright (P0 - TEST_E2E)

---

## 📦 SPRINT 2: Master Data 360° (Artigos, Clientes e Fornecedores)
- **[ART-01]** Schemas Zod de Artigo (`create`, `update`, `filters`) com RN01.1 e RN01.4 (P0 - BACKEND)
- **[ART-02]** Repositório e Serviço de Artigos: unicidade de SKU/EAN (RN01.1), tratamento de serviço (RN01.2) e PMP (RN01.3) (P0 - BACKEND)
- **[ART-03]** Handler IPC `artigos:*` em `src/main/routers/artigo.router.ts` e exposição no preload (P0 - IPC)
- **[ART-04]** API client `artigosApi` e hooks React Query (`useArtigos`, `useCreateArtigo`) (P0 - FRONTEND)
- **[ART-05]** Conexão do formulário `ArtigoForm.tsx` e tabela de listagem na página `comercial.tsx` (P0 - FRONTEND)
- **[CLI-01]** Schema Zod e validação de NIF Portugal / Angola (RN02.1) em `src/main/validators/cliente.validator.ts` (P0 - BACKEND)
- **[CLI-02]** Repositório, Serviço e Router IPC de Clientes com controle de limite de crédito (RN02.2) (P0 - BACKEND/IPC)
- **[CLI-03]** UI de gestão de Clientes na página `comercial.tsx` com listagem, busca e edição (P0 - FRONTEND)
- **[FOR-01]** CRUD completo de Fornecedores (Validator, Service, Router, UI em `compras.tsx`) (P1 - BACKEND/FRONTEND)
- **[TEST-03]** Testes unitários de validação de SKU, NIF e regras de serviço (Vitest) (P0 - TEST_UNIT)
- **[TEST-04]** Teste E2E de criação e listagem de artigo e cliente (Playwright) (P0 - TEST_E2E)

---

## 📦 SPRINT 3: Vendas, Faturação e Recibos Fiscais
- **[FAT-01]** Utilitário de numeração sequencial sem lacunas por série/ano (RN03.1) em `src/main/utils/sequence.ts` (P0 - BACKEND)
- **[FAT-02]** Utilitário de assinatura criptográfica de faturas (RSA-SHA1/SHA256 e ATCUD - RN03.4) (P0 - FISCAL/BACKEND)
- **[FAT-03]** Serviço de Emissão de Faturas (FT, FR, NC, ND): snapshot fiscal imutável (RN03.2), motivo de isenção de IVA (RN03.3) e trava de crédito (RN02.2) (P0 - BACKEND)
- **[FAT-04]** Transação atómica de emissão: grava fatura + linhas + atualiza conta corrente (P0 - BACKEND)
- **[FAT-05]** Router IPC `faturas:*` (`emitir`, `listar`, `detalhes`, `anular`) (P0 - IPC)
- **[FAT-06]** Interface de emissão de faturas e visualização/impressão PDF na página `vendas.tsx` (P0 - FRONTEND)
- **[REC-01]** Serviço de Recibos e Imputação: validação de saldo (RN04.1) e atualização automática de estado de pagamento da fatura (RN04.2) (P0 - BACKEND)
- **[REC-02]** Router IPC e UI de Recibos com liquidação de faturas em aberto (P0 - BACKEND/FRONTEND)
- **[NC-01]** Emissão de Notas de Crédito para anulação/retificação de faturas respeitando a imutabilidade fiscal (RNF02) (P0 - FISCAL/BACKEND)
- **[TEST-05]** Testes unitários do motor de faturação, cálculo de IVA, hash e sequencial (Vitest) (P0 - TEST_UNIT)
- **[TEST-06]** Teste E2E do fluxo completo de emissão de fatura e liquidação com recibo (Playwright) (P0 - TEST_E2E)

---

## 📦 SPRINT 4: Compras, Armazéns e Movimentação de Estoque
- **[ARM-01]** CRUD de Armazéns com tipagem (`materia_prima`, `produto_acabado`, etc.) (P0 - BACKEND/FRONTEND)
- **[STK-01]** Repositório de Estoque: cálculo de saldo atual agregado por artigo/armazém (P0 - BACKEND)
- **[STK-02]** Serviço de Movimentação de Estoque: bloqueio de estoque negativo (RN06.1) e controle obrigatório de lotes (RN06.2) (P0 - BACKEND)
- **[STK-03]** Ajuste automático de estoque por fecho de inventário físico (RN06.3) (P1 - BACKEND)
- **[STK-04]** Router IPC `stock:*` e telas de movimentação e consulta de saldos em `estoque.tsx` (P0 - IPC/FRONTEND)
- **[CMP-01]** Gestão de Encomendas de Compra a Fornecedores (P1 - BACKEND/FRONTEND)
- **[CMP-02]** Guia de Receção de Mercadoria com incremento automático de estoque e recálculo do Preço de Custo Médio PMP (RN01.3 / RN05.1) (P0 - BACKEND)
- **[TEST-07]** Testes unitários de bloqueio de estoque negativo e cálculo de PMP (Vitest) (P0 - TEST_UNIT)
- **[TEST-08]** Teste E2E de entrada de mercadoria e movimentação entre armazéns (Playwright) (P0 - TEST_E2E)

---

## 📦 SPRINT 5: Finanças, Tesouraria e Motor Fiscal (SAF-T / AGT)
- **[TES-01]** Gestão de Contas Bancárias e Caixas com controle de saldo em tempo real (P0 - BACKEND/FRONTEND)
- **[TES-02]** Serviço de Movimentos de Tesouraria (pagamentos, recebimentos, transferências entre contas - RN07.1) (P0 - BACKEND)
- **[TES-03]** Reconciliação bancária e extrato financeiro na página `financas.tsx` (P1 - FRONTEND)
- **[FIS-01]** Motor de Geração do ficheiro SAF-T PT (XML padrão AT) com validação contra XSD oficial (RN08.1) (P0 - FISCAL/BACKEND)
- **[FIS-02]** Módulo de comunicação e emissão em conformidade AGT (Angola) (P1 - FISCAL/BACKEND)
- **[FIS-03]** Painel de exportação fiscal e gestão de séries na página `fiscal.tsx` (P0 - FRONTEND)
- **[TEST-09]** Testes unitários do gerador SAF-T XML e validação de schema (Vitest) (P0 - TEST_UNIT)
- **[TEST-10]** Testes unitários de conciliação bancária e saldos de tesouraria (Vitest) (P0 - TEST_UNIT)

---

## 📦 SPRINT 6: Relatórios, Auditoria, Perfis RBAC e Polimento
- **[REL-01]** Relatórios analíticos de Vendas (por período, cliente, vendedor, artigo) com gráficos Recharts (P1 - FRONTEND/BACKEND)
- **[REL-02]** Relatório de Posição de Estoque, Curva ABC e Alertas de Ponto de Encomenda (P1 - FRONTEND/BACKEND)
- **[REL-03]** Relatório de Fluxo de Caixa, Balancete de Tesouraria e Mapa de IVA (P1 - FRONTEND/BACKEND)
- **[AUD-01]** Sistema de Auditoria Automática (Audit Log) para todas as ações críticas (RNF04) (P1 - BACKEND/FRONTEND)
- **[SEC-01]** Gestão avançada de Utilizadores e matriz de Permissões RBAC em `configuracoes.tsx` (P0 - FRONTEND/BACKEND)
- **[TEST-11]** Bateria de testes de regressão E2E em todos os módulos principais (Playwright) (P0 - TEST_E2E)
