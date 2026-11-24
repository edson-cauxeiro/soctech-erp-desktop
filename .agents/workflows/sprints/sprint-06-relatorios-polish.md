# Sprint 06 — Relatórios, Auditoria, Perfis RBAC e Polimento

> **Duração:** 2 Semanas | **Estado:** Planeado | **Prioridade:** P1

---

## 📯 Objetivos do Sprint
1. Relatórios analíticos e dashboards visuais com Recharts (Vendas, Estoque, Finanças).
2. Trilha de Auditoria Automática (Audit Log - RNF04) para todas as operações sensíveis.
3. Gestão de utilizadores e matriz de permissões RBAC na UI de configurações.
4. Bateria final de testes de regressÃo e polimento da experiência do utilizador.

---

## 📋 Tarefas do Sprint

### 1. Relatórios & Dashboards
- [ ] `[REL-01]` Criar `src/main/services/relatorios.service.ts` com consultas analíticas agregadas.
- [ ] `[REL-02]` Implementar gráficos e mapas em `src/renderer/src/pages/relatorios.tsx`.
- [ ] `[REL-03]` Implementar exportação de relatórios para PDF e Excel.

### 2. Auditoria & RBAC UI
- [ ] `[AUD-01]` Implementar middleware global de captura de logs de auditoria (RNF04).
- [ ] `[AUD-02]` Criar visualizador de logs de auditoria em `configuracoes.tsx`.
- [ ] `[SEC-01]` Implementar gestão de Utilizadores e Perfis em `configuracoes.tsx`.

### 3. Testes & RegressÃo
- [ ] `[TEST-14]` Bateria completa de testes E2E cobrindo todos os módulos do DoraERP.
- [ ] `[TEST-15]` Testes de carga e performance de consultas locais (< 100ms - RNF01).
