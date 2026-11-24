# Sprint 05 — Finanças, Tesouraria e Motor Fiscal (SAF-T / AGT)

> **Duração:** 2 Semanas | **Estado:** Planeado | **Prioridade:** P0

---

## 📯 Objetivos do Sprint
1. Gestão de Contas Bancárias e Caixas com controle de saldo em tempo real (RN07.1).
2. Lançamento e reconciliação de movimentos de tesouraria.
3. Motor de geração do ficheiro XML SAF-T PT de acordo com a estrutura normativa da AT (RN08.1).
4. Suporte aos requisitos de comunicação fiscal AGT (Angola).

---

## 📉 Tarefas do Sprint

### 1. Tesouraria & Finanças
- [ ] `[FIN-01]` Criar CRUD de Contas Bancárias e Caixas (`contas_bancarias`).
- [ ] `[FIN-02]` Criar `src/main/services/tesouraria.service.ts` com atualização de saldo (RN07.1).
- [ ] `[FIN-03]` Criar `src/main/routers/tesouraria.router.ts` e UI em `financas.tsx`.
- [ ] `[FIN-04]` Implementar extrato financeiro e conciliação de movimentos.

### 2. Motor Fiscal SAF-T PT & AGTj- [ ] `[SAFT-01]` Criar `src/main/services/saft.service.ts` (gerador do XML SAF-T PT de acordo com a estrutura AT).
- [ ] `[SAFT-02]` Criar validador de integridade do XML contra XSD oficial (RN08.1).
- [ ] `[AGT-01]` Criar módulo de conformidade fiscal para faturas em moeda AOA / AGT.
- [ ] `[FIS-01]` Criar tela de exportação de ficheiros fiscais e auditoria em `fiscal.tsx`.

### 3. Testes Automatizados
- [ ] `[TEST-12]` Teste unitário de atualização de saldos de tesouraria em transferências e pagamentos.
- [ ] `[TEST-13]` Teste unitário de validação da estrutura XML do SAF-T PT contra o schema XSD.
