# Padronizar formulários de RH Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer os 23 formulários de dados do módulo de Recursos Humanos terem o mesmo tamanho e comportamento do formulário “Novo lançamento contabilístico”.

**Architecture:** Reutilizar `FormDialog`/`FormSurface` já existentes; activar `dialogLayout` no único `FormShell` do módulo; migrar 17 modais e 6 formulários inline sem tocar em regras de negócio.

**Tech Stack:** React, TypeScript, Tailwind CSS, Radix Dialog, React Hook Form, shadcn/ui form primitives, Vitest, Electron/Vite.

**Spec:** `docs/superpowers/specs/2026-11-21-padronizar-formularios-rh-design.md`

## Global Constraints

- Dimensões obrigatórias: `max-w-6xl w-[95vw] h-[90dvh] max-h-[90dvh]`, `flex flex-col overflow-hidden`.
- Cabeçalho e rodapé fixos; scroll apenas no corpo.
- Âmbito exacto: **17 modais de dados + 6 formulários inline = 23 formulários**.
- Incluir os 5 diálogos de dados aninhados na ficha; “Cessar contrato” fica excluído por ser acção.
- Excluir acções, detalhes, ajuda, importação/migração, filtros, `confirm()` e `prompt()` nativos.
- Reutilizar `FormDialog`/`FormSurface`; não criar novo componente.
- Sem backend, validadores, DTOs, Prisma, migrações ou seeds.
- Sem alteração à lógica de submissão, validação ou permissões.
- `npm run lint` mantém os 31 erros preexistentes; não introduzir novos.
- Directório não é repositório Git: não fazer commit/push.

## Review Focus

- Diálogo de dados aninhado na ficha: deve abrir acima do pai com scroll independente — verificação visual na Task 1.
- 8 managers com `<Dialog>` vazio só para `DialogTrigger`: trocar por `Button onClick` não pode deixar de abrir o diálogo real — verificação visual nas Tasks 2 e 3.
- Formulários nativos sem `react-hook-form`: botões Cancelar/Guardar no `footer` têm de continuar a submeter — verificação visual na Task 4.
- Formulários inline em grelha: altura `h-full` tem de resolver sem duplo scroll — verificação visual nas Tasks 4 e 5.
- Diálogos de acção/detalhe não podem mudar — revisão do diff na Task 6.

---

### Task 1: Migrar ficha do funcionário e diálogos aninhados

**Files:**
- Modify: `src/renderer/src/components/erp/rh/RhFuncionarioFicha.tsx`

**Interfaces:**
- Consumes: `FormDialog`, `FormSurface`, `FormShell dialogLayout` (já existentes).
- Produces: 6 diálogos com o mesmo `onSubmit`/`onFechar` e o mesmo `FormProvider`.

- [ ] **Step 1: Migrar a ficha principal**

Substituir `Dialog`/`DialogContent`/`DialogHeader` da ficha por `FormDialog`, com `title="Ficha do Funcionário"`, `description` com `código — nome` e `bodyClassName` vazio. Activar `dialogLayout` no `FormShell` existente (`flush` mantido). Remover `max-w-6xl max-h-[92vh] overflow-y-auto p-0 gap-0` do antigo `DialogContent`.

- [ ] **Step 2: Migrar os 5 diálogos de dados aninhados**

Aplicar `FormDialog` a: Novo contrato, Alteração salarial, Adicionar/Editar dependente, Adicionar/Editar rubrica fixa e Adicionar/Editar documento. Manter `CabecalhoDialogo`/`RodapeDialogo` apenas como conteúdo das props `headerActions`/`footer` ou movê-los para essas props; não alterar os handlers.

- [ ] **Step 3: Confirmar exclusão**

Não alterar o diálogo “Cessar contrato” (`max-w-md`), nem os `confirm()` de remoção de dependente/rubrica/documento.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificação visual da ficha**

Abrir a ficha e um diálogo aninhado; confirmar que o filho fica acima do pai, ambos com a mesma moldura e scroll independente.

---

### Task 2: Migrar CRUDs com `ui/form` — grupo A

**Files:**
- Modify: `src/renderer/src/components/erp/rh/RhAfetacoesManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhAtividadesManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhAusenciasManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhHorasExtraManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhFeriasManager.tsx`

**Interfaces:**
- Consumes: `FormDialog`.
- Produces: mesmos `form`/`onSubmit`/`onOpenChange` de cada manager.

- [ ] **Step 1: Substituir o diálogo de dados**

Em cada ficheiro, trocar o `Dialog`/`DialogContent` que contém o `<Form>` por `FormDialog`, passando o título existente (`Editar …`/`Nova …`) e a descrição quando houver. Remover `max-w-xl`/`max-w-2xl` e `overflow-y-auto` do antigo `DialogContent`. Manter `DialogFooter` dentro da prop `footer`.

- [ ] **Step 2: Limpar triggers redundantes**

Nos 5 ficheiros, remover o primeiro `<Dialog>` que só contém `DialogTrigger asChild` e substituir o botão por `<Button onClick={abrirParaCriar}>`. O segundo diálogo, que contém o formulário, passa a ser o único `FormDialog`.

- [ ] **Step 3: Não tocar noutros diálogos**

Em `RhAusenciasManager`, manter os diálogos de acção/detalhe inalterados; em `RhFeriasManager`, manter o segundo formulário de filtros de saldos inalterado.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificação visual dos triggers**

Abrir “Nova Ausência” e “Nova Hora Extra”; confirmar que o botão substituto abre o mesmo formulário com `max-w-6xl`/`90dvh` e rodapé fixo.

---

### Task 3: Migrar CRUDs com `ui/form` — grupo B

**Files:**
- Modify: `src/renderer/src/components/erp/rh/RhFeriasCalendarioManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhRetroativosManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhIndependentesManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhAlteracoesMensaisManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhDividasProcessosManager.tsx`

**Interfaces:**
- Consumes: `FormDialog`.
- Produces: mesmos `form`/`onSubmit`/`onOpenChange` de cada manager.

- [ ] **Step 1: Substituir o diálogo de dados**

Mesmo procedimento da Task 2 para os 5 ficheiros: `FormDialog`, título/descrição existentes, botões no `footer`, remoção de classes de tamanho antigas.

- [ ] **Step 2: Limpar triggers redundantes**

Aplicar a substituição apenas em `RhRetroativosManager`, `RhIndependentesManager` e `RhDividasProcessosManager`. `RhFeriasCalendarioManager` e `RhAlteracoesMensaisManager` não têm trigger redundante.

- [ ] **Step 3: Respeitar excepções**

Manter inalterados: “Copiar do Mês Anterior” (`RhAlteracoesMensaisManager`), “Suspender Processo” e “Cancelar Processo” (`RhDividasProcessosManager`), bem como os `confirm()` de anulação/eliminação.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificação visual dos triggers**

Abrir “Novo Processo de Dívida” e confirmar que o botão substituto abre o formulário normalizado.

---

### Task 4: Migrar funcionários e inline de cadastros/rubricas

**Files:**
- Modify: `src/renderer/src/components/erp/rh/RhFuncionariosManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhCadastrosManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhRubricasManager.tsx`

**Interfaces:**
- Consumes: `FormDialog`, `FormSurface`.
- Produces: mesmos estados locais e handlers `submeter`/`guardar`.

- [ ] **Step 1: Migrar “Novo/Editar Funcionário”**

Substituir o `DialogContent max-w-3xl max-h-[90vh] overflow-y-auto` por `FormDialog`, com as 3 secções existentes no corpo e os botões no `footer`. Não alterar `RhFuncionarioFicha`, `RhImportacaoDialog` nem `RhMigracaoWizard`.

- [ ] **Step 2: Envolver os formulários inline em `FormSurface`**

Em `RhCadastrosManager` e `RhRubricasManager`, trocar o `<form className="lg:col-span-5 …">` por `<FormSurface className="lg:col-span-5 h-full" title={h2 existente} footer={botões existentes} bodyClassName="p-5">` com o `<form>` dentro. O `onSubmit` e os campos não mudam.

- [ ] **Step 3: Dar altura ao contentor da grelha**

Nesses dois managers, o `<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">` passa a ter altura explícita/flexível (por exemplo `h-[calc(100dvh-14rem)]`) para que o `h-full` do surface resolva; a coluna de lista mantém-se com scroll próprio.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificação visual**

Abrir “Novo Funcionário”, Cadastros e Rubricas; confirmar que os botões de guardar continuam a submeter e que os inline não têm duplo scroll.

---

### Task 5: Migrar restantes formulários inline

**Files:**
- Modify: `src/renderer/src/components/erp/rh/RhParametrosManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhPadroesManager.tsx`
- Modify: `src/renderer/src/components/erp/rh/RhProcessamentoManager.tsx`

**Interfaces:**
- Consumes: `FormSurface`.
- Produces: mesmos estados locais, tabelas dinâmicas e handlers de gravação.

- [ ] **Step 1: Migrar os dois formulários de `RhParametrosManager`**

“Nova Versão de Parâmetro” e “Nova Tabela de IRT” passam a `FormSurface` com `h-full`, título extraído do `<h2>` actual e botões no `footer`. A tabela dinâmica de escalões mantém-se no corpo.

- [ ] **Step 2: Migrar `RhPadroesManager`**

“Subsídios e Padrões de Cálculo” passa a `FormSurface` com `h-full`, `bodyClassName="p-6"` e botão Guardar no `footer`.

- [ ] **Step 3: Migrar parâmetros de processamento**

A secção “Parâmetros” de `RhProcessamentoManager` passa a `FormSurface` com `h-full`; os botões Processar/Simular passam para a prop `footer`, mantendo os mesmos handlers.

- [ ] **Step 4: Ajustar altura dos contentores**

Cada grelha/painel que envolve estes surfaces recebe altura explícita/flexível equivalente à da Task 4, sem alterar `ErpShell`.

- [ ] **Step 5: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Verificação visual**

Abrir Parâmetros e Padrões; confirmar rodapé fixo, corpo com scroll e ausência de duplo scroll.

---

### Task 6: Validação final

**Files:**
- Nenhum ficheiro novo; rever diff integral.

- [ ] **Step 1: Type check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Testes**

Run: `npm test`
Expected: PASS, mantendo a base de 1158 testes.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS; aviso pré-existente sobre `sequencia-diario.service.ts` é aceitável.

- [ ] **Step 4: Verificação visual no browser**

Abrir RH e conferir, em 1280×800 e 1024×768:
  - Ficha do funcionário e um diálogo aninhado: mesmo tamanho, filho acima do pai, scroll independente.
  - Um CRUD modal (ex.: Ausências) com `max-w-6xl`/`90dvh` e rodapé fixo.
  - Cadastros e Parâmetros inline sem duplo scroll e com botões fixos.
  - “Cessar contrato”, pagamentos e processamento de salários continuam com o tamanho antigo.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: exactamente os 31 erros preexistentes, nenhum em ficheiros recém-modificados.
