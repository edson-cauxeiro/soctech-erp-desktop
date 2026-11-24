# Padronizar formulários de Finanças Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer todos os formulários de dados do módulo de Finanças terem o mesmo tamanho e comportamento do formulário “Novo lançamento contabilístico”.

**Architecture:** Criar `FormSurface`/`FormDialog` como única fonte de verdade das dimensões e do layout, acrescentar `dialogLayout` opt-in a `FormShell`, e migrar os nove formulários de dados identificados. Nenhuma lógica de negócio muda.

**Tech Stack:** React, TypeScript, Tailwind CSS, Radix Dialog, React Hook Form, Vitest, Electron/Vite.

**Spec:** `docs/superpowers/specs/2026-11-21-padronizar-formularios-financas-design.md`

## Global Constraints

- Dimensões obrigatórias: `max-w-6xl w-[95vw] h-[90dvh] max-h-[90dvh]`, `flex flex-col overflow-hidden`.
- Cabeçalho e rodapé fixos; scroll apenas no corpo.
- Só formulários de dados; diálogos de acção/detalhe ficam inalterados.
- Incluir os dois formulários inline: Plano de contas e Estrutura de demonstrações.
- Sem backend, validadores, DTOs, Prisma, migrações ou seeds.
- Sem alteração à lógica de submissão dos formulários.
- `npm run lint` tem 31 erros preexistentes; não introduzir novos.
- Directório não é repositório Git: não fazer commit/push.

## Review Focus

- Formulário com muitos campos: deve manter cabeçalho/rodapé visíveis e fazer scroll só no corpo — verificar no browser em 1280×800 e 1024×768 (Task 4).
- `DialogContent` tem botão de fechar absoluto: não pode sobrepor título, descrição ou acções — `pr-10` no cabeçalho (Task 1, verificação visual na Task 4).
- `FormShell` é usado fora de Finanças: o modo novo tem de ser opt-in — `npm run typecheck` + revisão do diff (Task 1).
- Formulário inline dentro de `WorkspaceFrame`: não pode criar duplo scroll — verificação visual em Plano de contas e Demonstrações (Task 4).
- Editor de referência tem rodapé com totais e botões: tem de continuar fixo e equilibrado — verificação visual na Task 4.

---

### Task 1: Criar `FormSurface`, `FormDialog` e `FormShell dialogLayout`

**Files:**
- Create: `src/renderer/src/components/erp/FormDialog.tsx`
- Modify: `src/renderer/src/components/erp/FormPrimitives.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent` de `@/components/ui/dialog`; `cn` de `@/lib/utils`. `FormSurface` usa `h2`/`p` ligados por `aria-labelledby`/`aria-describedby`, sem depender do contexto Radix (para funcionar inline).
- Produces:
  - `FormSurface({ title, description?, headerActions?, footer?, bodyClassName?, className?, children }: FormSurfaceProps): JSX.Element`
  - `FormDialog({ open, onOpenChange, ...surfaceProps }: FormDialogProps): JSX.Element`
  - `FormShell` aceita `dialogLayout?: boolean` mantendo a assinatura existente.

- [x] **Step 1: Criar `FormDialog.tsx` com as duas exportações e as classes exactas**

`FormSurface` usa `div className={cn("flex h-full min-h-0 flex-col overflow-hidden border bg-background", className)}`; cabeçalho `px-6 py-4 pr-10 border-b border-border shrink-0`; corpo `cn("flex-1 min-h-0", footer && "overflow-y-auto px-6 py-4", bodyClassName)`; rodapé `px-6 py-3 border-t border-border bg-muted/20 shrink-0`. `FormDialog` passa as props para `Dialog` e usa `DialogContent className="max-w-6xl w-[95vw] h-[90dvh] max-h-[90dvh] p-0 gap-0 flex flex-col overflow-hidden"`.

- [x] **Step 2: Acrescentar `dialogLayout?: boolean` a `FormShell`**

Quando `true`: `<form>` fica `flex h-full min-h-0 flex-col` (respeitando `flush` apenas para borda/fundo), corpo fica `flex-1 min-h-0 overflow-y-auto` com o padding já calculado, rodapé fica `shrink-0` sem `rounded-b-md mt-auto`. Quando `false`/ausente, manter o comportamento actual byte-a-byte.

- [x] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS, sem erros.

---

### Task 2: Migrar os cinco formulários modais com `FormShell`

**Files:**
- Modify: `src/renderer/src/components/erp/ContasBancariasManager.tsx`
- Modify: `src/renderer/src/components/erp/LancamentosManager.tsx`
- Modify: `src/renderer/src/components/erp/DiarioContabilManager.tsx`
- Modify: `src/renderer/src/components/erp/RegraContabilizacaoManager.tsx`
- Modify: `src/renderer/src/components/erp/MapeamentoContaManager.tsx`

**Interfaces:**
- Consumes: `FormDialog`, `FormShell dialogLayout`.
- Produces: os mesmos handlers `onSubmit`/`onCancel` de antes, sem alteração de assinatura.

- [x] **Step 1: Substituir `Dialog`/`DialogContent`/`DialogHeader` por `FormDialog` em cada formulário de dados**

Passar `title`, `description`, `open`, `onOpenChange`; envolver o `FormShell` existente com `dialogLayout`, `flush` ou `compact` inalterados. Em `LancamentosManager`, alterar apenas o diálogo “Novo lançamento manual”; deixar o de estorno intacto. `IntegracaoContabilManager` não é alterado porque só tem diálogo de detalhe.

- [x] **Step 2: Remover classes de tamanho antigas dos cinco diálogos**

Remover `max-w-*`, `max-h-*`, `overflow-y-auto` e `p-0/gap-0` dos `DialogContent` migrados; não tocar noutros diálogos dos mesmos ficheiros.

- [x] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

---

### Task 3: Migrar referência e formulários inline

**Files:**
- Modify: `src/renderer/src/components/erp/LancamentoContabilEditor.tsx`
- Modify: `src/renderer/src/components/erp/PlanoContasManager.tsx`
- Modify: `src/renderer/src/components/erp/DemonstracoesManager.tsx`

**Interfaces:**
- Consumes: `FormDialog` (referência), `FormSurface` (inline), `FormShell dialogLayout` (Plano de contas).
- Produces: rodapé da referência com os mesmos totais e botões; rodapé do `EditorEstrutura` com Voltar/Guardar.

- [x] **Step 1: Migrar `LancamentoContabilEditor` para `FormDialog`**

Substituir `Dialog`/`DialogContent`/`DialogHeader` por `FormDialog`; mover o bloco de totais/botões existente para a prop `footer`; manter o corpo com `space-y-4` via `bodyClassName`.

- [x] **Step 2: Envolver o `FormShell` inline de `PlanoContasManager` em `FormSurface`**

Sem `footer` no `FormSurface`; activar `dialogLayout` no `FormShell`. Manter toolbar e acções existentes fora do surface se já estiverem no `WorkspaceFrame`.

- [x] **Step 3: Migrar `EditorEstrutura` para `FormSurface`**

Mover os botões Voltar/Guardar do cabeçalho para a prop `footer`; manter os campos do cabeçalho e a lista de linhas no corpo, com `bodyClassName="p-4"`.

- [x] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

---

### Task 4: Validação final

**Files:**
- Nenhum ficheiro novo; rever diff integral.

- [x] **Step 1: Type check**

Run: `npm run typecheck`
Expected: PASS.

- [x] **Step 2: Testes**

Run: `npm test`
Expected: PASS, mesma contagem base de 1158 testes.

- [x] **Step 3: Build**

Run: `npm run build`
Expected: PASS; avisos pré-existentes sobre `sequencia-diario.service.ts` são aceitáveis.

- [x] **Step 4: Verificação visual no browser**

Abrir Finanças e conferir, em 1280×800 e 1024×768:
  - “Novo lançamento contabilístico” mantém dimensões, totais e botões fixos;
  - “Nova conta bancária” e “Novo lançamento manual” com a mesma moldura;
  - “Plano de contas” e “Nova estrutura” inline sem scroll duplo;
  - botão de fechar do diálogo não sobrepõe cabeçalho.

- [x] **Step 5: Lint**

Run: `npm run lint`
Expected: exactamente os 31 erros preexistentes, nenhum em ficheiros modificados.
