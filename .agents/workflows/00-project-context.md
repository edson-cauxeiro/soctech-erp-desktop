# 00 — Contexto e Arquitetura do Projeto DoraERP

## 1. Visão Geral do Sistema

O **DoraERP** é um software de Planeamento de Recursos Empresariais (ERP) desktop concebido para médias e pequenas empresas, com conformidade fiscal para **Portugal** (Autoridade Tributária - AT / SAF-T PT) e **Angola** (Administração Geral Tributária - AGT).

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|---|---|---|
| **Ambiente Desktop** | Electron 39 | Processo Main (Node.js) + Preload Seguro |
| **Frontend (Renderer)** | React 19 + TypeScript | Interface gráfica responsiva e modular |
| **Estilização** | Tailwind CSS v4 + Radix UI + Lucide Icons | Design system consistente |
| **Formulários & Validação** | React Hook Form + Zod | Schemas estritos partilhados |
| **Estado & Cache** | TanStack Query v5 + Zustand | SWR, cache assíncrono e stores leves |
| **Persistência / BD** | PostgreSQL + Prisma ORM 7 | Migrations versionadas e queries tipadas |
| **Testes Unitários** | Vitest | Testes de Services, Validators e Utils |
| **Testes E2E** | Playwright | Testes de fluxos de ponta a ponta |

---

## 3. Arquitetura de Comunicação (Electron IPC)

A arquitetura respeita estritamente o isolamento de processos do Electron com `contextIsolation: true`:

```
[ Renderer (React / Pages / Hooks) ]
                 │
                 ▼ (window.api.modulo.metodo)
[ Preload Script (src/preload/index.ts - contextBridge) ]
                 │
                 ▼ (ipcRenderer.invoke / ipcRenderer.on)
[ Main Process (src/main/) ]
   ├── routers/       -> Registo dos handlers de canais IPC
   ├── controllers/   -> Validação Zod & tratamento de payload
   ├── services/      -> Regras de Negócio (RN) puras
   ├── repositories/  -> Interação com Prisma Client
   ├── validators/    -> Schemas Zod partilhados
   └── database/      -> Instância Singleton do Prisma
```

---

## 4. Estrutura de Pastas e Mapeamento

```
r:/www/Projects/doraerp-desktop/
├── .agents/
│   ├── rules/
│   │   └── structure-pattern.md
│   └── workflows/            # Documentação de workflows e sprints
├── docs/
│   └── especificacao_tecnica_erp.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main/
│   │   ├── config/          # Variáveis de ambiente e constantes
│   │   ├── controllers/     # Camada de controle IPC
│   │   ├── database/        # Singleton do PrismaClient
│   │   ├── middlewares/     # Auth, RBAC e Audit Log
│   │   ├── models/          # Interfaces e DTOs
│   │   ├── repositories/    # Abstração de queries Prisma
│   │   ├── routers/         # Mapeamento de canais IPC
│   │   ├── services/        # Casos de uso e regras de negócio
│   │   ├── utils/           # Assinatura fiscal, crypto, cálculos
│   │   ├── validators/      # Schemas Zod
│   │   └── index.ts         # Ponto de entrada do Electron Main
│   ├── preload/
│   │   ├── index.d.ts       # Declarações de tipos expostos
│   │   └── index.ts         # contextBridge.exposeInMainWorld
│   └── renderer/
│       └── src/
│           ├── @types/      # Declarações globais (window.api)
│           ├── api/         # Clientes tipados que chamam window.api
│           ├── components/  # Componentes reutilizáveis (erp/ e ui/)
│           ├── hooks/       # Custom hooks (React Query, formulários)
│           ├── pages/       # Páginas principais (vendas, compras, etc.)
│           ├── styles.css   # Configuração de temas e Tailwind
│           └── App.tsx      # Roteador e Provedores globais
```

---

## 5. Módulos do Sistema e Rotas

1. **/login** — Autenticação de utilizadores e seleção de empresa/armazém.
2. **/comercial** — Master Data: Catálogo de Artigos (360°), Famílias, Tabela de Preços.
3. **/vendas** — Faturação (FT, FR, NC, ND), Orçamentos/Encomendas, Recibos e Imputações.
4. **/compras** — Gestão de Fornecedores, Encomendas de Compra, Guias de Receção e Faturas de Compra.
5. **/estoque** — Gestão de Armazéns, Movimentos de Entrada/Saída/Transferência, Inventário físico e Lotes.
6. **/financas** — Contas Bancárias/Caixas, Lançamentos de Tesouraria, Fluxo de Caixa e Reconciliação.
7. **/fiscal** — Exportação SAF-T PT (XML), Comunicação AGT, Séries Fiscais e Certificados de Assinatura.
8. **/relatorios** — Dashboards operacionais, mapas de IVA, análise de margem e relatórios de auditoria.
9. **/configuracoes** — Dados da Empresa, Perfis de Acesso (RBAC), Utilizadores e Licenciamento.
