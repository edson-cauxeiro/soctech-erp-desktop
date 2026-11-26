# Update v1 — Vendas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar Fatura, Proforma, Recibo e Guia de Entrega ao padrão de layout de Finanças, com selects flutuantes, remoção dos campos sem sentido, moeda em Kz e o aviso de câmbio na proforma.

**Architecture:** Alterações localizadas nos managers de Vendas, uma prop opcional em `SelectField` para activar o portal do `SearchSelect`, e uma alteração no serviço de proforma com teste unitário. Sem migrações, validadores, DTOs ou alterações de backend além da proforma.

**Tech Stack:** React 19, TypeScript, Tailwind 4, react-hook-form, Vitest, Electron.

**Spec:** `docs/superpowers/specs/2026-11-26-update-v1-vendas-design.md`

## Global Constraints

- A aba Encomendas de Vendas permanece como está.
- As listas flutuantes são activadas apenas nos formulários de Vendas, através da opção `portal` do `SearchSelect`.
- A substituição de `€` por `Kz` aplica-se a toda a página de Fatura; os PDFs já usam `AOA` por omissão.
- De `estadoPagamento` remove-se apenas o select do formulário: a coluna da tabela e o detalhe continuam a mostrar o estado derivado do backend.
- De `retencaoFonte` no Recibo remove-se apenas a interface; o validador continua com `default(0)`.
- O aviso da Proforma é exactamente `Os Preços dos Artigos Poderá Sofrer Alterações Conforme o Cambio do Dia.!`
- `npm run lint` mantém os erros preexistentes; não introduzir novos.

## Review Focus

- Dropdown cortado por tabela/card com `overflow`: esperado abrir por cima e acompanhar scroll — ver Task 2 e Task 3 (passagem de `floating`/`portal` e verificação visual).
- Símbolo `€` esquecido na nota de crédito, cabeçalho ou detalhe da Fatura: esperado `Kz` em toda a página — ver Task 2, verificação por grep.
- Criação de fatura sem o select: esperado continuar a gravar com `estadoPagamento: 'pendente'` e a tabela/detalhe manterem o estado — ver Task 2, verificação com `npm test` e `vendas.service.test.ts`.
- Recibo sem campo de retenção: esperado criar com `retencaoFonte: 0` sem alterar cálculos — ver Task 3, verificação com `recibo.service.test.ts`.
- Documento de proforma sem o aviso exacto: esperado conter a frase ao lado de `Válida até: ...` — ver Task 4, teste unitário.

---

### Task 1: `SelectField` com opção de dropdown flutuante

**Files:**
- Modify: `src/renderer/src/components/erp/FormPrimitives.tsx:371-400`

**Interfaces:**
- Consumes: `SearchSelect` de `src/renderer/src/components/ui/SearchSelect.tsx`, que já aceita `portal?: boolean` (default `false`) e posiciona o dropdown com `position: fixed`, `zIndex: 9999`, reposicionando em scroll/resize.
- Produces: `SelectField({ ..., floating?: boolean })` — com `floating: true`, repassa `portal` ao `SearchSelect`; com ausência/false, comportamento actual inalterado.

- [ ] **Step 1: Adicionar a prop sem alterar o comportamento por omissão**

Em `src/renderer/src/components/erp/FormPrimitives.tsx`, na assinatura de `SelectField`, juntar `floating?: boolean` com default `false`, e passar `portal={floating}` ao `SearchSelect` existente. Não alterar mais nada neste ficheiro.

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS (sem novos erros).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/erp/FormPrimitives.tsx
git commit -m "feat(forms): add floating option to SelectField"
```

---

### Task 2: Fatura — remover estado de pagamento, moeda Kz, selects e layout

**Files:**
- Modify: `src/renderer/src/components/erp/FaturaManager.tsx:105`, `:495`, `:692-709`, `:783`, `:885-896`, `:1048-1071`, `:1174`, `:1246`, `:1280`, `:1303-1332`
- Test: `src/main/services/vendas.service.test.ts` (verificação de regressão, sem alteração)

**Interfaces:**
- Consumes: `SelectField floating` da Task 1 e `SearchSelect portal` directo.
- Produces: nenhuma interface nova; o payload de criação deixa de conter `estadoPagamento` (o validador aplica `pendente`).

- [ ] **Step 1: Remover o select de estado de pagamento e o seu estado local**

Em `FaturaManager.tsx`, remover o `useState<"pago" | "pendente" | "parcial" | "vencido">("pendente")`, o `SelectField` de "Estado de Pagamento" e a chave `estadoPagamento` do objecto enviado ao criar a fatura. Manter intactos o badge da coluna da tabela e o texto do detalhe, que leem `fat.estadoPagamento` / `viewingFatura.estadoPagamento` do backend.

- [ ] **Step 2: Trocar todas as ocorrências de EUR por AOA/Kz no ficheiro**

Substituir todos os `toLocaleString("pt-PT", { style: "currency", currency: "EUR" })` por `formatCurrency(valor, "AOA")` (importar `formatCurrency` de `@/utils/currency`) e todos os literais `€` por `Kz`, incluindo `Preço Unit. (€)`, `Total Linha (€)`, o valor na opção de nota de crédito e os totais do detalhe. Não alterar `DocumentoA4` nem serviços.

- [ ] **Step 3: Activar dropdowns flutuantes e alinhar o layout**

Passar `floating` a todos os `SelectField` e `portal` a todos os `SearchSelect` usados directamente. Aproximar os cards do padrão de Finanças: `p-6 space-y-6` nos cards de formulário e grid de cabeçalho `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, mantendo campos `h-9`/`px-3`, tabelas e fluxo de submissão inalterados.

- [ ] **Step 4: Verificar tipos e ausência de EUR no ficheiro**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -nE 'EUR|€|estadoPagamento' src/renderer/src/components/erp/FaturaManager.tsx`
Expected: apenas `estadoPagamento` nas leituras da tabela/detalhe; nenhum `EUR` nem `€`.

- [ ] **Step 5: Verificar regressão dos serviços de venda**

Run: `npx vitest run src/main/services/vendas.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/erp/FaturaManager.tsx
git commit -m "feat(vendas): simplify fatura form and show amounts in kwanza"
```

---

### Task 3: Proforma, Recibo e Guia — selects flutuantes, layout e remoção da retenção

**Files:**
- Modify: `src/renderer/src/components/erp/ProformaManager.tsx:407-512`, `:418`, `:431`, `:537`, `:805`, `:823`
- Modify: `src/renderer/src/components/erp/ReciboManager.tsx:75`, `:298`, `:422`, `:450-568`, `:461`, `:474`, `:509`, `:526`, `:609`
- Modify: `src/renderer/src/components/erp/GuiaEntregaManager.tsx` (todos os `SelectField`/`SearchSelect`)
- Test: `src/main/services/recibo.service.test.ts` (verificação de regressão, sem alteração)

**Interfaces:**
- Consumes: `SelectField floating` da Task 1.
- Produces: nenhuma interface nova; o payload de recibo deixa de conter `retencaoFonte` (validador aplica `0`).

- [ ] **Step 1: Remover o campo de retenção do Recibo**

Em `ReciboManager.tsx`, remover o `useState(0)` de `retencaoFonte`, o input numérico de "Retenção na Fonte" e a chave `retencaoFonte` do payload. Não tocar em `recibo.service.ts`, validadores nem documentos.

- [ ] **Step 2: Activar dropdowns flutuantes nos três managers**

Passar `floating` a todos os `SelectField` e `portal` a todos os `SearchSelect` em `ProformaManager.tsx`, `ReciboManager.tsx` e `GuiaEntregaManager.tsx`, incluindo os usados dentro das tabelas de linhas.

- [ ] **Step 3: Alinhar o layout dos três managers**

Aplicar o mesmo padrão da Task 2 (`p-6 space-y-6`, grid de cabeçalho em 4 colunas em `lg`, campos `h-9`/`px-3`) sem alterar tabelas, botões ou submissão.

- [ ] **Step 4: Verificar tipos e regressão do serviço de recibos**

Run: `npm run typecheck`
Expected: PASS.

Run: `npx vitest run src/main/services/recibo.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/erp/ProformaManager.tsx src/renderer/src/components/erp/ReciboManager.tsx src/renderer/src/components/erp/GuiaEntregaManager.tsx
git commit -m "feat(vendas): float selects and align forms, remove recibo retention field"
```

---

### Task 4: Proforma — aviso de câmbio no documento gerado

**Files:**
- Modify: `src/main/services/proforma.service.ts:375`
- Test: `src/main/services/proforma.service.test.ts`

**Interfaces:**
- Consumes: `ProformaService.getDocumentoImprimivel(id)`, que devolve `observacoes`.
- Produces: `observacoes` com `Válida até: <data>` seguido de `Os Preços dos Artigos Poderá Sofrer Alterações Conforme o Cambio do Dia.!`

- [ ] **Step 1: Escrever o teste que falha**

Em `src/main/services/proforma.service.test.ts`, acrescentar ao `mockPrisma` `contaBancaria: { findMany: vi.fn().mockResolvedValue([]) }` e um teste `it('inclui aviso de alteração de preços no documento imprimível', ...)` que configure `proformaVenda.findUnique` com uma proforma com `id`, `numero`, `serie`, `dataEmissao`, `estado`, `empresaId`, `clienteNome`, `clienteNif`, `clienteEndereco`, `dataValidade: new Date('2026-12-31')`, `linhas: [{ artigoId: 'art-1', quantidade: 1, precoUnitario: 100, taxaIva: 14 }]`, `cliente: { pais: null }`, chame `getDocumentoImprimivel('fp-1')` e afirme:

```ts
expect(doc.observacoes).toContain('Válida até:');
expect(doc.observacoes).toContain(
  'Os Preços dos Artigos Poderá Sofrer Alterações Conforme o Cambio do Dia.!'
);
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `npx vitest run src/main/services/proforma.service.test.ts -t 'inclui aviso de alteração de preços no documento imprimível'`
Expected: FAIL no `toContain` da frase do aviso.

- [ ] **Step 3: Acrescentar a frase às observações do documento**

Em `src/main/services/proforma.service.ts:375`, manter `Válida até: ${...}` e juntar a frase exacta do guia, separada por uma quebra de linha ou ponto e vírgula. Não alterar `notice` nem qualquer outro campo.

- [ ] **Step 4: Correr o teste e confirmar que passa**

Run: `npx vitest run src/main/services/proforma.service.test.ts`
Expected: PASS (incluindo os testes existentes).

- [ ] **Step 5: Commit**

```bash
git add src/main/services/proforma.service.ts src/main/services/proforma.service.test.ts
git commit -m "feat(proforma): add exchange-rate price warning to printable document"
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

- [ ] **Step 3: Verificação visual na aplicação**

Run: `npm run dev`
Expected, em cada uma das páginas Fatura, Proforma, Recibo e Guia: dropdowns abrem sobre tabelas/cards e acompanham o scroll; campos alinhados com o padrão de Finanças; Fatura sem select de estado e com valores em `Kz` (incluindo nota de crédito e detalhe); Recibo sem campo de retenção; documento de proforma impresso com o aviso. A aba Encomendas continua disponível e inalterada.
