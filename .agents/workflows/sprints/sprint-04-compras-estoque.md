# Sprint 04 — Compras, Armazéns e Movimentação de Estoque

> **Duração:** 2 Semanas | **Estado:** Planeado | **Prioridade:** P0

---

## 🎯 Objetivos do Sprint
1. Gestão de múltiplos armazéns com tipagem funcional.
2. Movimentação de estoque com bloqueio estrito de saldo negativo (RN06.1) e controle de lote (RN06.2).
3. Entrada física de mercadoria com reálculo automático do Preço de Custo Médio PMP (RN01.3 / RN05.1).
4. Ajuste de inventário físico com geração de movimentos automáticos (RN06.3).

---

## 📉 Tarefas do Sprint

### 1. Armazéns & Movimentos de Estoque
- [ ] `[STK-01]` Criar CRUD de Armazéns no Main Process e UI em `estoque.tsx`.
- [ ] `[STK-02]` Criar `src/main/repositories/stock.repository.ts` (cálculo de saldo atual por armazêm).
- [ ] `[STK-03]` Criar `src/main/services/stock.service.ts` com RN26.1 (bloqueio negativo) e RN06.2 (lotes).
- [ ] `[STK-04]` Criar `src/main/routers/stock.router.ts` (`stock:mover`, `stock:saldo`, `stock:historico`).
- [ ] `[STK-05]` Integrar telas de consulta de saldo e movimentação manual em `estoque.tsx`.

### 2. Compras & Entrada de Mercadoria
- [ ] `[CMP-01]` Criar gestão de Encomendas de Compra a Fornecedores em `compras.tsx`.
- [ ] `[CMP-02]` Criar serviço de Receção de Mercadorias com incremento de stock e atualização do PMP (RN01.3).

### 3. Testes Automatizados
- [ ] `[TEST-09]` Teste unitário de bloqueio de estoque negativo e obrigatoriedade de lote.
- [ ] `[TEST-10]` Teste unitário da fórmula do Preço Médio Ponderado (PMP).
- [ ] `[TEST-11]` Teste E2E de entrada de mercadoria e transferência entre armazéns em `tests/e2e/estoque.spec.ts`.
