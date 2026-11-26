# Update v1 — Compras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter os 4 diálogos de Compras para o padrão `FormDialog` de Finanças, tornar flutuantes os 10 selects desses diálogos e remover apenas da interface o campo de retenção do Fornecedor.

**Architecture:** Substituição directa dos `Dialog`/`DialogContent` por `FormDialog`, preservando handlers e estados locais. Em `FornecedorManager`, o `FormShell` existente continua a fornecer o formulário, mas com `flush` + `dialogLayout` e sem `footer` no `FormDialog`, evitando dois rodapés. Nenhuma alteração de backend, validadores, DTOs ou Prisma.

**Tech Stack:** React 19, TypeScript, Tailwind 4, react-hook-form, zod, Vitest, Electron.

**Spec:** `docs/superpowers/specs/2026-11-26-update-v1-compras-design.md`

## Global Constraints

- `FormDialog`: `max-w-6xl`, `w-[95vw]`, `h-[90dvh]`, cabeçalho e rodapé fixos, scroll apenas no corpo.
- Selects flutuantes apenas nos diálogos: 8 em `ComprasManager` e 2 em `FornecedorManager` (10 no total).
- O `SearchSelect` do filtro “Todos os Estados” em `FornecedorManager` não recebe `portal`.
- `retencaoFonte` é removido apenas do JSX; schema local, `defaultValues`, `reset(...)` e payload permanecem iguais.
- Não alterar `FormDialog.tsx`, `FormPrimitives.tsx`, `SearchSelect.tsx`, `search-select-outside.ts`, backend, DTOs, IPC nem Prisma.
- `npm run lint` mantém os erros preexistentes; não introduzir novos.

## Review Focus

- Dropdown cortado pelo `overflow-hidden` do `FormDialog`: esperado abrir por cima e acompanhar o scroll — ver Task 1 Step 5, Task 2 Step 5, Task 3 Step 5 e Task 4 Step 6 (verificação visual dos 10 selects).
- Clique com rato numa opção em portal fecha no `mousedown` antes do `click`: esperado seleccionar — ver Task 1 Step 5 (clique com rato no fornecedor/armázem/artigo da Guia).
- Dois rodapés no diálogo de Fornecedor: esperado um único rodapé fixo — ver Task 4 Step 2 (`FormDialog` sem `footer`) e Step 6 (verificação visual).
- Retenção existente perdida ao editar: esperado preservar o valor enviado — ver Task 4 Step 5 (grep das 4 ocorrências de `retencaoFonte` fora do JSX) e Step 6 (editar fornecedor com retenção).
- Conversão dos modais alterar payloads de compras: esperado criar encomenda/guia/fatura como antes — ver Task 3 Step 4 (`compras.service.test.ts`) e Step 5 (handlers inalterados).

---

### Task 1: Guia de Receção — FormDialog e 3 selects flutuantes

**Files:**
- Modify: `src/renderer/src/components/erp/ComprasManager.tsx:29-39`, `:548-718`

**Interfaces:**
- Consumes: `FormDialog` de `./FormDialog`; `SearchSelect` com `portal?: boolean` (default `false`); `PriceInput` e `QuantityInput` de `./FormPrimitives`.
- Produces: nenhuma interface nova. Os estados `rec*` e `handleCreateGuia` continuam com os mesmos nomes e payload.

- [ ] **Step 1: Importar `FormDialog` sem remover ainda os imports de `Dialog`**

Em `ComprasManager.tsx`, juntar `import { FormDialog } from "./FormDialog";` a seguir ao import de `SearchSelect`. Manter os imports de `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` e `DialogDescription`, que ainda são usados pelos outros dois modais.

- [ ] **Step 2: Substituir o modal da Guia**

Substituir o bloco `<Dialog open={isGuiaModalOpen} ...>` até `</Dialog>` (linhas 549-718) por `<FormDialog>` com:
- `open={isGuiaModalOpen}` e `onOpenChange={setIsGuiaModalOpen}`;
- `title={<><Truck className="w-5 h-5 text-primary" /> Guia de Receção de Mercadorias (Entrada Física)</>}`;
- `description="A confirmação desta guia efetuará a entrada de stock no Armazém indicado (por defeito: ARM-01 Geral) e recalculará o Preço Médio Ponderado (PMP)."`;
- `bodyClassName="space-y-4"`;
- `footer` com os botões existentes: Cancelar chama `setIsGuiaModalOpen(false)`; confirmação chama `handleCreateGuia`, com `disabled={isSubmitting}` e o `Loader2` actual.

Mover o conteúdo de `<div className="p-6 space-y-4">` para dentro do `FormDialog`, retirando apenas o `p-6` (o `FormSurface` já aplica `px-6 py-4` quando há `footer`). Não alterar tabelas, `QuantityInput`, `PriceInput` nem linhas.

- [ ] **Step 3: Activar o portal nos 3 `SearchSelect` da Guia**

Passar `portal` ao `SearchSelect` do fornecedor (antiga linha 565), ao do armazém de destino (581) e ao de artigo por linha (628). Não alterar `value`, `onChange`, `options`, `placeholder` nem `required`.

- [ ] **Step 4: Verificar tipos e contagem do bloco**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -c 'portal' src/renderer/src/components/erp/ComprasManager.tsx`
Expected: `3`.

- [ ] **Step 5: Verificar a Guia na aplicação**

Run: `npm run dev`
Expected: o modal usa a largura/altura de Finanças com rodapé fixo; os 3 dropdowns (fornecedor, armazém, artigo) abrem por cima do corpo com scroll e seleccionam com clique de rato.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/erp/ComprasManager.tsx
git commit -m "feat(compras): convert guia dialog to FormDialog and float selects"
```

---

### Task 2: Encomenda — FormDialog e 3 selects flutuantes

**Files:**
- Modify: `src/renderer/src/components/erp/ComprasManager.tsx:720-868`

**Interfaces:**
- Consumes: `FormDialog` já importado na Task 1; mesmos estados `enc*` e `handleCreateEncomenda`.
- Produces: nenhuma interface nova.

- [ ] **Step 1: Substituir o modal da Encomenda**

Substituir o bloco `<Dialog open={isEncomendaModalOpen} ...>` até `</Dialog>` (linhas 721-868) por `<FormDialog>` com `open`/`onOpenChange` correspondentes, `title={<><FilePlus2 className="w-5 h-5 text-primary" /> Nova Encomenda a Fornecedor</>}`, `bodyClassName="space-y-4"` e `footer` com Cancelar (`setIsEncomendaModalOpen(false)`) e `Emitir Encomenda` (`handleCreateEncomenda`, `disabled={isSubmitting}`, com `Loader2`). Não passar `description`, porque o modal actual não tem uma.

Mover o conteúdo existente como na Task 1, sem alterar linhas, `QuantityInput` ou `PriceInput`.

- [ ] **Step 2: Activar o portal nos 3 `SearchSelect` da Encomenda**

Passar `portal` ao `SearchSelect` do fornecedor (antiga linha 734), ao do armazém (748) e ao de artigo por linha (793).

- [ ] **Step 3: Verificar tipos e contagem total de portals**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -c 'portal' src/renderer/src/components/erp/ComprasManager.tsx`
Expected: `6` (3 da Guia + 3 da Encomenda).

- [ ] **Step 4: Verificar a Encomenda na aplicação**

Expected: mesmo cabeçalho/rodapé fixos da Guia; os 3 dropdowns abrem sobre o corpo e seleccionam com clique de rato.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/erp/ComprasManager.tsx
git commit -m "feat(compras): convert encomenda dialog to FormDialog and float selects"
```

---

### Task 3: Fatura de Compra — FormDialog, 2 selects flutuantes e limpeza dos imports

**Files:**
- Modify: `src/renderer/src/components/erp/ComprasManager.tsx:870-1037`, `:29-35`
- Test: `src/main/services/compras.service.test.ts` (regressão, sem alteração)

**Interfaces:**
- Consumes: `FormDialog` já importado; estados `fat*` e `handleCreateFatura` inalterados.
- Produces: nenhuma interface nova; `ComprasManager` deixa de importar `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` e `DialogDescription`.

- [ ] **Step 1: Substituir o modal da Fatura**

Substituir o bloco `<Dialog open={isFaturaModalOpen} ...>` até `</Dialog>` (linhas 871-1037) por `<FormDialog>` com `open`/`onOpenChange` correspondentes, `title={<><FileText className="w-5 h-5 text-primary" /> Registar Fatura de Fornecedor</>}`, `bodyClassName="space-y-4"` e `footer` com Cancelar (`setIsFaturaModalOpen(false)`) e `Guardar Fatura de Compra` (`handleCreateFatura`, `disabled={isSubmitting}`, com `Loader2`). Não passar `description`.

Mover o conteúdo existente como nas tasks anteriores.

- [ ] **Step 2: Activar o portal nos 2 `SearchSelect` da Fatura**

Passar `portal` ao `SearchSelect` do fornecedor (antiga linha 884) e ao de artigo por linha (962).

- [ ] **Step 3: Remover os imports de `Dialog` que ficaram sem uso**

No bloco de imports de `../ui/dialog`, remover `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` e `DialogDescription`, apagando o bloco inteiro se não restar nenhum import.

- [ ] **Step 4: Verificar tipos, portals e regressão do serviço**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -c 'portal' src/renderer/src/components/erp/ComprasManager.tsx`
Expected: `8`.

Run: `npx vitest run src/main/services/compras.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirmar que os handlers não mudaram**

Run: `grep -n 'handleCreateEncomenda\|handleCreateGuia\|handleCreateFatura\|comprasApi.create' src/renderer/src/components/erp/ComprasManager.tsx`
Expected: os três handlers e as três chamadas `comprasApi.create*` continuam presentes, com os mesmos objectos de payload das linhas 160-167, 206-213 e 255-262.

- [ ] **Step 6: Verificar a Fatura na aplicação e commitar**

Expected: rodapé fixo, dropdowns de fornecedor e artigo flutuantes, criação de fatura com a mesma mensagem de sucesso.

```bash
git add src/renderer/src/components/erp/ComprasManager.tsx
git commit -m "feat(compras): convert fatura dialog to FormDialog and remove dialog imports"
```

---

### Task 4: Fornecedor — FormDialog, 2 selects flutuantes e remoção da retenção

**Files:**
- Modify: `src/renderer/src/components/erp/FornecedorManager.tsx:26-43`, `:352-428`
- Test: `src/main/services/fornecedor.service.test.ts` (regressão, sem alteração)

**Interfaces:**
- Consumes: `FormDialog` de `./FormDialog`; `FormShell` com `flush?: boolean` e `dialogLayout?: boolean`; `SelectField` com `floating?: boolean`.
- Produces: nenhuma interface nova. O payload de `fornecedorApi.create/update` continua a incluir `retencaoFonte`.

- [ ] **Step 1: Importar `FormDialog`**

Juntar `import { FormDialog } from "./FormDialog";` e remover o bloco de imports de `../ui/dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`). Manter os imports de `FormShell`, `FormSection`, `FormTabs`, `FormTabPanel`, `TextField`, `NumberField`, `SelectField` e `SearchSelect`.

- [ ] **Step 2: Substituir o modal por `FormDialog` + `FormShell` com layout de diálogo**

Substituir o bloco `<Dialog open={isModalOpen} ...>` até `</Dialog>` (linhas 353-428) por `<FormDialog>` com `open`/`onOpenChange`, `title` dinâmico actual (`Editar Fornecedor: ${editingFornecedor.nome}` ou `Novo Fornecedor — Ficha de Cadastro`, com o ícone `Truck`), `description` dinâmica actual e `bodyClassName="p-0"`. **Não passar `footer` ao `FormDialog`.**

Dentro dele, manter o `<FormShell methods={methods} onSubmit={handleFormSubmit} onCancel={() => setIsModalOpen(false)} submitLabel={isSubmitting ? "A guardar..." : "Guardar Fornecedor"}>` e acrescentar as props `flush` e `dialogLayout`. Retirar o `<div className="p-6">` que o envolvia.

- [ ] **Step 3: Activar `floating` nos 2 `SelectField` do diálogo**

Passar `floating` ao `SelectField` de `name="estado"` (antiga linha 391) e ao de `name="condPagamento"` (414). Não passar `portal` ao `SearchSelect` do filtro de estado (linha 213).

- [ ] **Step 4: Remover o campo de retenção do JSX**

Apagar apenas a linha `<NumberField name="retencaoFonte" label="Retenção na Fonte (%)" step="0.01" span="1" />` (422). Não alterar `fornecedorFormSchema`, `defaultValues`, `handleCreate`, `handleEdit` nem `handleFormSubmit`.

- [ ] **Step 5: Verificar tipos, ocorrências e regressão**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -n 'retencaoFonte\|floating\|portal' src/renderer/src/components/erp/FornecedorManager.tsx`
Expected: exactamente 4 ocorrências de `retencaoFonte` (schema, `defaultValues`, reset de criação e reset de edição), 2 de `floating` e nenhuma de `portal`.

Run: `npx vitest run src/main/services/fornecedor.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar na aplicação**

Expected: um único rodapé fixo com Cancelar/Limpar/Guardar; os selects de Estado e Condição de Pagamento abrem por cima e seleccionam com clique de rato; o campo de retenção não aparece nem na criação nem na edição; ao editar um fornecedor com retenção existente, o valor enviado continua o original.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/erp/FornecedorManager.tsx
git commit -m "feat(fornecedores): use FormDialog, float selects and hide retention field"
```

---

### Task 5: Verificação final

**Files:** nenhum ficheiro alterado.

- [ ] **Step 1: Suíte completa de testes**

Run: `npm test`
Expected: PASS, sem novos failures face à baseline.

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck PASS; lint mantém apenas os erros preexistentes, sem novos.

- [ ] **Step 3: Contagens finais**

Run: `grep -c 'portal' src/renderer/src/components/erp/ComprasManager.tsx && grep -c 'floating' src/renderer/src/components/erp/FornecedorManager.tsx`
Expected: `8` e `2`.

- [ ] **Step 4: Verificação visual final dos 4 diálogos**

Expected: largura/altura/cabeçalho/rodapé idênticos a Finanças nos 4 modais; 10 dropdowns flutuantes seleccionáveis com rato e com scroll; filtro de estado inalterado; retenção ausente só no formulário.
