# DoraERP — Guia de Workflows para Agentes de Desenvolvimento

> **Versão:** 1.0.0 | **Data:** 2026-08-25 | **Stack:** Electron + React + TypeScript + Prisma + PostgreSQL

---

## 📂 Estrutura deste Diretório

```
.agents/
├── rules/
│   └── structure-pattern.md      ← Regras de código e padrões obrigatórios
└── workflows/
    ├── README.md                  ← ESTE FICHEIRO — Índice e orientação geral
    ├── 00-project-context.md      ← Contexto do projeto, arquitetura e convenções
    ├── 01-sprint-backlog.md       ← Backlog completo de tarefas com IDs e regras
    ├── 02-sprint-plan.md          ← Planeamento de sprints detalhado
    ├── 03-ipc-patterns.md         ← Padrões de comunicação IPC Electron (Main <-> Preload <-> Renderer)
    ├── 04-testing-strategy.md     ← Estratégia de testes unitários (Vitest) e E2E (Playwright)
    └── sprints/
        ├── sprint-01-foundation.md
        ├── sprint-02-master-data.md
        ├── sprint-03-vendas.md
        ├── sprint-04-compras-estoque.md
        ├── sprint-05-financas-fiscal.md
        └── sprint-06-relatorios-polish.md
```

---

## 🚀 Como os Agentes Devem Executar as Tarefas

1. **Contexto & Regras:** Ler obrigatoriamente `00-project-context.md` e `.agents/rules/structure-pattern.md`.
2. **Padrão IPC:** Consultar `03-ipc-patterns.md` antes de criar rotas, controllers, services ou bridges de comunicação.
3. **Execução de Sprint:** Abrir o ficheiro do sprint ativo em `sprints/sprint-XX-*.md` e seguir as tarefas sequencialmente.
4. **Qualidade & Testes:** Seguir `04-testing-strategy.md` para implementar testes unitários nas regras de negócio e E2E nos fluxos críticos.
5. **Checklist:** Atualizar as caixas de seleção `[x]` conforme as tarefas forem concluídas e verificadas.

---

## ⚠️ Diretrizes Inegociáveis

1. **Imutabilidade Fiscal (RNF02):** Faturas, Notas de Crédito e Recibos não sofrem DELETE. Apenas estornos/retificações.
2. **Transações Atómicas:** Toda alteração multi-tabela (venda + stock + tesouraria) DEVE usar `prisma.$transaction()`.
3. **Validação em Duas Camadas:** Zod na validação de inputs (Main/Renderer) e constraints na BD.
4. **Isolamento de Processos Electron:** O Renderer **nunca** importa Prisma ou bibliotecas de Node.js diretamente; toda a comunicação é via IPC tipado pelo Preload.
