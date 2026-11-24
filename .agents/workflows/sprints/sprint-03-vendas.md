# Sprint 03 — Vendas, Faturação e Recibos Fiscais

> **Duração:** 3 Semanas | **Estado:** Planeado | **Prioridade:** P0

---

## 🎯 Objetivos do Sprint
1. Motor de emissão de Faturas (FT, FR, NC, ND) com numeração sequencial sem lacunas (RN03.1).
2. Imutabilidade fiscal (RNF02), Snapshot fiscal (RN03.2) e Motivo de isencão (RN03.3).
3. Assinatura digital RSA-SHA256 e geração de ATCUD (RN03.4).
4. EmissÃo de Recibos com imputação de saldos (RN04.1 / RN04.2).
5. Emissão de Notas de Crédito retificativas.

---

## 📉 Tarefas do Sprint

### 1. Motor Fiscal & Utilitários
- [ ] `[FAT-01]` Criar `src/main/utils/sequence.ts` (gerador sequencial atómico por série/ano).
- [ ] `[FAT-02]` Criar `src/main/utils/fiscal-crypto.ts` (calculo de hash RSA-SHA256 e ATCUD).
- [ ] `[FAT-03]` Criar `src/main/validators/fatura.validator.ts` e `recibo.validator.ts`.

### 2. Serviços e Repositórios de Faturação
- [ ] `[FAT-04]` Criar `src/main/repositories/fatura.repository.ts`.
- [ ] `[FAT-05]` Criar `src/main/services/fatura.service.ts` com trava de crédito (RN02.2) e snapshot (RN03.2).
- [ ] `[FAT-06]` Criar `src/main/routers/fatura.router.ts` (`faturas:emitir`, `faturas:list`, `anular`).
- [ ] `[FAT-07]` Integrar a tela de emissão e listagem em `src/renderer/src/pages/vendas.tsx`.

### 3. Recibos e Liquidações
- [ ] `[REC-01]` Criar `src/main/services/recibo.service.ts` com RN04.1 (imputação) e RN04.2 (estado).
- [ ] `[REC-02]` Criar `src/main/routers/recibo.router.ts` e tela de liquidacão em `vendas.tsx`.

### 4. Testes Automatizados
- [ ] `[TEST-06]` Teste unitário de numeração sequencial infrespotada e validacão de motivo de isenção.
- [ ] `[TEST-07]` Teste unitÁrio de imputação de saldo e transição de estado da fatura.
- [ ] `[TEST-08]` Teste E2E de emissão de fatura e liquidação com recibo em `tests/e2e/vendas.spec.ts`.
