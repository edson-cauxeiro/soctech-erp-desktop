# Ajuste visual na tela de login (ícones e cores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aumentar os ícones dos módulos para 20 px e clarear os fundos azuis dos dois painéis da tela de login, sem alterar o resto do ERP.

**Architecture:** Valores locais de CSS escopados às classes `.login-page` e `.login-auth.dark` em `styles.css`, consumidos pelas utilidades Tailwind existentes; ícones Lucide ajustados em `login.tsx`.

**Tech Stack:** React 19, Tailwind CSS v4 (`@theme inline`), lucide-react, Electron/Vite.

**Spec:** `docs/superpowers/specs/2026-11-23-login-icones-cores-design.md`

## Global Constraints

- Não alterar tokens globais em `:root` ou `.dark`.
- Não alterar autenticação, rotas, textos, layout responsivo ou breakpoint `lg`.
- Valores exatos: ícones `h-5 w-5`; `--primary-deep: oklch(0.34 0.13 268)`; `--background: oklch(0.19 0.05 264)`.

## Review Focus

- Tema global: nenhuma outra página pode mudar de cor.
- Contraste dos cartões e do formulário com os fundos mais claros.
- Painel esquerdo continua visível a 1266 px de largura útil.
- Ausência de overflow vertical.

---

### Task 1: Aplicar ícones de 20 px e cores locais no login

**Files:**
- Modify: `src/renderer/src/pages/login.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `@theme inline` já mapeia `--color-primary-deep: var(--primary-deep)` e `--color-background: var(--background)`.
- Produces: classes `.login-page` e `.login-auth` usadas apenas no `<main>` e no `<section>` do formulário.

- [ ] **Step 1: Adicionar o bloco CSS escopado em `styles.css`**

Definir `.login-page { --primary-deep: oklch(0.34 0.13 268); }` e `.login-auth.dark { --background: oklch(0.19 0.05 264); }` junto das regras de tema existentes.

- [ ] **Step 2: Aplicar as classes em `login.tsx`**

Adicionar `login-page` ao `<main>`, `login-auth` ao `<section>` direito e trocar `h-4 w-4` por `h-5 w-5` no ícone `Icon` dos cartões.

- [ ] **Step 3: Verificar typecheck**

Run: `npm run typecheck:web`
Expected: sem erros.

- [ ] **Step 4: Gerar e instalar o build**

Run: `npm run build:win`, desinstalar a versão anterior e instalar `dist\\soctechno-desktop-1.0.0-setup.exe`.

- [ ] **Step 5: Verificar no DOM da app em execução**

Confirmar via CDP: 7 ícones com 20 px, cores calculadas dos painéis iguais aos valores locais, painel esquerdo visível a 1266 px e `scrollHeight === clientHeight`.
