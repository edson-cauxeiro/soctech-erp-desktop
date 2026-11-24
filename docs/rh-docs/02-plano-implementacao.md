# 02 — Plano de Implementação

**Princípio:** entregar valor cedo e reduzir o risco do núcleo (cálculo salarial) antes da UI avançada.
Ordem: **fundações → cadastros → motor de cálculo → processamento → recibos/pagamentos → assiduidade/dívidas → honorários → relatórios/hardening**.

> Estimativas em **pontos-dia** para 1 desenvolvedor sénior (ajustar à equipa). Total ≈ 14–17 semanas com 1 dev; ≈ 8–10 semanas com 2 devs em paralelo (marcado em §4).

---

## 1. Fases

### Fase 0 — Descoberta e fundações (≈ 1 semana)
**Objectivo:** alinhar com o repositório real e criar o esqueleto do módulo.
- Mapear estrutura, convenções, auth/permissões, auditoria, PDF, Finanças (AGENTS §3).
- Escrever ADRs iniciais (`DECISOES.md`): IDs, multi-empresa, BD, formato IPC, gateway de Finanças.
- Criar esqueleto `modules/rh`, `shared/rh`, `features/rh`, `ipc/rh`, rotas e entrada de menu "Recursos Humanos" (ribbon vazio).
- Definir permissões `rh.*` e migrar para o sistema existente.
- Configurar testes (unit + integração com BD de teste) se ainda não existirem.

**Saída:** módulo vazio navegável, CI verde, ADRs registados.

### Fase 1 — Dados mestre e parâmetros (≈ 2 semanas)
- Migrações 1–3 parciais: departamentos, cargos, funcionário, dependentes, contrato, alteração salarial, rubricas, parâmetros fiscais, tabela IRT, períodos, configuração, sequências.
- Seeds (rubricas sistema, parâmetros, IRT, períodos, tipos de ausência).
- Ecrãs de **Configuração** (rubricas, períodos, parâmetros fiscais/IRT).
- Serviço de **parâmetros com vigência** (`getParametro(chave, data)`).

**Saída:** parâmetros fiscais geridos e consultáveis por data.

### Fase 2 — Funcionários e Contratos (≈ 2 semanas)
- CRUD de **Funcionário** (ficha completa, tabs, validações, foto/documentos).
- **Gestão Contratual** (contratos, alterações salariais, cessação).
- **Rubricas recorrentes** por funcionário; forma de pagamento de subsídios.
- Lista com pesquisa/filtros/paginação.

**Saída:** RH consegue cadastrar a base de funcionários real (importável por CSV — task opcional).

### Fase 3 — Motor de cálculo (≈ 2 semanas) 🔴 caminho crítico
- Biblioteca pura: tipos, helpers `Decimal`, cálculo de INSS, IRT por escalão, proporcionais.
- Calculators: **Vencimento**, **Subsídio de Natal**, **Subsídio de Férias**, **Extraordinário**, **Fim de Contrato**.
- Regras: faltas, horas extra, dívidas/penhoras (interface com stubs), retroactivos, moeda.
- Suite de testes com **casos reais fornecidos pelo RH** (golden tests).

**Saída:** `calcular()` validado por RH em simulação (sem UI de gravação).

### Fase 4 — Alterações mensais + Processamento (≈ 3 semanas) 🔴
- **Alterações Mensais** (UI em grelha).
- Serviços: `preparar` (elegíveis + restrições), `simular`, `processar` (individual/lote), `anular`.
- Persistência transaccional (processamento, itens, aplicação de alterações).
- **Ecrã de Processamento** fiel ao layout de referência (parâmetros, 3 tabs, grelha, progresso).
- Histórico de processamentos + visão detalhada.
- Fecho/abertura de período.

**Saída:** processar e anular Vencimento (lote) e demais tipos (individual) de ponta a ponta.

### Fase 5 — Recibos e Pagamentos (≈ 2 semanas)
- Recibo: numeração, PDF, impressão individual/lote, reimpressão.
- Pagamentos: geração automática, ordens por banco, ficheiro de transferência (formato configurável), confirmação e estorno.
- **Integração Finanças** via `FinancasGateway` (lançamentos de processamento e de pagamento; estorno).

**Saída:** ciclo completo processamento → recibo → pagamento → contabilidade.

### Fase 6 — Assiduidade, Dívidas e Retroactivos (≈ 2–3 semanas)
- Tipos de ausência, **Ausências**, **Horas extra**.
- **Marcação de Férias** + saldos + aprovação + efeito no subsídio de férias.
- **Afetações**.
- **Processos de Dívida/Penhoras** com plano de prestações e limite de penhora.
- **Retroactivos**.
- Integração destes dados no motor (substituir stubs).

**Saída:** processamento automático completo.

### Fase 7 — Honorários (≈ 1–2 semanas)
- Independentes, Actividades, Processamento de honorários (retenção), Pagamentos.

### Fase 8 — Relatórios, qualidade e entrega (≈ 1–2 semanas)
- Relatórios básicos (folha, IRT, INSS, férias, ausências, dívidas, custo por departamento) + exportações.
- Testes E2E dos fluxos críticos, performance do lote (500 func.), auditoria, revisão de segurança, acessibilidade/teclado.
- Importação inicial de dados (CSV), manual do utilizador, **migração/UAT com RH**.

---

## 2. Marcos (milestones)

| Marco | Conteúdo | Critério |
|---|---|---|
| **M0** | Fase 0 concluída | Módulo vazio no menu, ADRs |
| **M1** | Fases 1–2 | RH cadastra funcionários/contratos/parâmetros |
| **M2** | Fase 3 | Motor validado com casos do RH |
| **M3 (MVP)** | Fases 4–5 | Processar → recibo → pagamento → Finanças |
| **M4** | Fases 6–7 | Assiduidade, dívidas, honorários |
| **M5 (GA)** | Fase 8 | UAT aprovado, performance e segurança OK |

## 3. Estratégia de testes

| Nível | O quê | Ferramenta |
|---|---|---|
| Unitário | Motor (IRT, INSS, proporcionais, penhora, fim de contrato), validadores Zod | Vitest/Jest (o que o projecto usa) |
| Integração | Services + Prisma em BD de teste (processar, anular, lote, pagamento, numeração de recibos) | idem + BD temporária |
| Contrato IPC | Handlers validam entrada/saída | idem |
| E2E | Fluxo: criar funcionário → contrato → processar lote → recibo → pagamento → anular | Playwright (Electron) |
| UAT | Cenários reais com RH; comparação com sistema actual (paralelo 1–2 meses) | manual |

**Golden tests:** o RH fornece ≥ 20 casos reais (salário, subsídios, faltas, HE, dívida, IRT esperado). Qualquer alteração ao motor tem de manter estes casos verdes.

## 4. Paralelização (2 devs)

| Dev A (backend/motor) | Dev B (frontend) |
|---|---|
| F0 → F1 (migrações, parâmetros) | F0 → UI de Configuração |
| F3 motor | F2 UI funcionários/contratos |
| F4 serviços de processamento | F4 ecrã Processamento (com mocks do IPC) |
| F5 recibos/pagamentos/Finanças | F5 UI recibos/pagamentos |
| F6 assiduidade/dívidas (serviços) | F6 UIs de assiduidade/dívidas |
| F7 serviços honorários | F7 UI honorários, F8 relatórios |

Contratos IPC e schemas Zod são definidos **primeiro** (em `shared/rh/schemas`) para permitir trabalho em paralelo.

## 5. Riscos e mitigações

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Regras fiscais/legais incorrectas ou desactualizadas | Alto | Parâmetros com vigência; golden tests do RH; validação jurídica antes do M3 |
| R2 | Estrutura real do repo difere da assumida | Médio | Fase 0 de descoberta; ADRs; estrutura real prevalece |
| R3 | Integração com Finanças subestimada | Alto | `FinancasGateway` + stub; spike na Fase 0; tarefa dedicada |
| R4 | Erros de arredondamento/precisão | Alto | `Decimal` obrigatório; regras de arredondamento documentadas; testes |
| R5 | Performance do lote | Médio | Transacção por funcionário; *prefetch* em bloco; medir cedo (Fase 4) |
| R6 | Mudança de requisitos do RH | Médio | Demos quinzenais; backlog priorizado; regras parametrizáveis |
| R7 | Dados sensíveis expostos | Alto | Permissões `rh.salarios.ver`, auditoria, logs sem PII |
| R8 | Anulações deixando estado inconsistente | Alto | Testes de integração específicos; transacção única; invariantes (modelo §11) |
| R9 | Formato de ficheiro bancário desconhecido | Baixo | Gerador configurável + CSV genérico no MVP |
| R10 | Migração de dados do sistema anterior | Médio | Importação CSV + período de execução em paralelo |

## 6. Definição de pronto por fase
Aplica-se o **Definition of Done** do `AGENTS.md §8` a cada task; cada fase só fecha com:
1. Todas as tasks da fase `[x]`;
2. Testes verdes (unit + integração da fase);
3. Demo ao RH com feedback registado;
4. Documentação (`docs/rh`) actualizada;
5. Sem dívida técnica crítica aberta.

## 7. Dependências externas
- Documento oficial de **IRT/INSS** em vigor (RH/jurídico) — **bloqueia Fase 3**.
- ≥ 20 casos de cálculo reais (RH) — **bloqueia aceitação do M2**.
- Acesso/documentação da API/serviço de **Finanças** — **bloqueia Fase 5**.
- Modelo actual de **recibo** do RH — **bloqueia Task de PDF**.
- Formato do **ficheiro de transferência** dos bancos — Fase 5 (não bloqueia MVP).
- Lista inicial de funcionários/contratos para importação — Fase 8.
