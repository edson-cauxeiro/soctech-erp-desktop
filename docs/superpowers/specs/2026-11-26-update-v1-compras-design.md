# Update v1 — Módulo de Compras — Design

**Data:** 2026-11-26
**Guia de origem:** `docs/updates/update-v1.md` (secção 1.2)

## Objectivo

Aproximar os formulários de Compras do padrão visual dos formulários de Finanças, tornar flutuantes as listas de opções dos selects desses formulários e remover o campo de retenção na fonte do cadastro de Fornecedor.

## Decisões aprovadas

1. Os 4 diálogos de Compras (Guia de Receção, Encomenda, Fatura de Compra e Fornecedor) passam a usar `FormDialog`, o mesmo componente usado em Finanças: `max-w-6xl`, `w-[95vw]`, `h-[90dvh]`, cabeçalho e rodapé fixos, scroll apenas no corpo.
2. As listas flutuantes são activadas **apenas nos selects dentro dos diálogos**: 8 `SearchSelect` em `ComprasManager` e 2 `SelectField` em `FornecedorManager` (10 no total). O filtro “Todos os Estados” da lista de fornecedores fica inalterado.
3. `SelectField` já aceita `floating` (implementado em Vendas) e repassa `portal` ao `SearchSelect`; não é necessária nova prop nem alteração ao `SearchSelect`.
4. De `retencaoFonte` no Fornecedor remove-se **apenas a interface**. O schema local do formulário, os `defaultValues`, os `reset(...)` e o payload continuam iguais: ao editar, um valor existente é preservado; ao criar, o valor é `0`.
5. Não há alterações de backend, validadores, DTOs, IPC, Prisma nem migrações.

## Abordagem

Conversão directa dos quatro diálogos existentes para `FormDialog`, reaproveitando os handlers e estados locais. Em `ComprasManager`, o `footer` do `FormDialog` recebe os botões já existentes. Em `FornecedorManager`, o `FormShell` continua a fornecer o `FormProvider` e o formulário, mas passa a receber `flush` e `dialogLayout`; o `FormDialog` não recebe `footer`, evitando assim dois rodapés sem alterar o primitivo partilhado.

Alternativa considerada e rejeitada: aumentar apenas o `max-w-3xl` para `max-w-6xl`. Daria a largura, mas não o cabeçalho/rodapé fixos nem o confinamento do scroll ao corpo, que são o padrão de Finanças.

## Âmbito

### Alterar

- `src/renderer/src/components/erp/ComprasManager.tsx` — substituir os 3 `Dialog`/`DialogContent` por `FormDialog`; passar `portal` aos 8 `SearchSelect` dos diálogos; remover os imports de `Dialog*` que deixarem de ser usados.
- `src/renderer/src/components/erp/FornecedorManager.tsx` — substituir o `Dialog`/`DialogContent` por `FormDialog`; passar `floating` aos 2 `SelectField` do diálogo; remover o `NumberField` de `retencaoFonte`; passar `flush` e `dialogLayout` ao `FormShell`; remover os imports de `Dialog*` que deixarem de ser usados.

### Não alterar

- O `SearchSelect` do filtro de estado em `FornecedorManager` (fora do diálogo).
- `FormDialog.tsx`, `FormPrimitives.tsx`, `SearchSelect.tsx` e `search-select-outside.ts`.
- Lógica de criação, validação local, estados locais e chamadas às APIs de compras e fornecedores.
- `src/main/validators/fornecedor.validator.ts`, `src/main/services/fornecedor.service.ts`, `src/main/validators/compras.validator.ts`, `src/main/services/compras.service.ts`, DTOs, IPC e `prisma/schema.prisma`.
- Módulos de Vendas, Finanças, Stock e Comercial.

## Detalhe de implementação

- **ComprasManager:** `FormDialog` com `title` (mantendo o ícone à esquerda do texto), `description` quando existir, `bodyClassName="space-y-4"` e `footer` com Cancelar e o botão de confirmação correspondente. Os corpos actuais `p-6 space-y-4` passam a herdar o padding do `FormSurface` (`px-6 py-4`), mantendo apenas `space-y-4`.
- **FornecedorManager:** `FormDialog` com o título e a descrição actuais, `bodyClassName="p-0"` e sem `footer`; dentro dele, `<FormShell methods={methods} onSubmit={handleFormSubmit} onCancel={...} submitLabel={...} flush dialogLayout>`. As abas e secções permanecem as mesmas, menos o campo de retenção.
- **Selects flutuantes:** `portal` nos `SearchSelect` dos cabeçalhos e das linhas de artigo (Guia: 3; Encomenda: 3; Fatura: 2). `floating` nos `SelectField` de estado e condição de pagamento. O helper `shouldCloseOnOutsideClick` já evita que um clique numa opção em portal feche o dropdown no `mousedown`.
- **Retenção:** remover apenas a linha do `NumberField`. Não remover `retencaoFonte` do schema local `fornecedorFormSchema`, dos `defaultValues`, dos `reset(...)` nem do objecto enviado a `fornecedorApi.create/update`.

## Critérios de aceitação

1. Os 4 diálogos têm a mesma largura, altura, cabeçalho e rodapé fixos dos formulários de Finanças; o scroll acontece só no corpo.
2. Todos os 10 selects dos diálogos abrem a lista por cima de containers com `overflow` e acompanham o scroll; o filtro de estado continua com o comportamento actual.
3. O campo “Retenção na Fonte (%)” não aparece no formulário de Fornecedor, nem na criação nem na edição.
4. Criar um fornecedor continua a enviar `retencaoFonte: 0`; editar um fornecedor com retenção existente continua a enviar o valor original.
5. A criação de encomendas, guias e faturas de compra continua a funcionar com os mesmos payloads e mensagens de sucesso/erro.

## Verificação

- `npm run typecheck`
- `npm run lint` — manter os erros preexistentes, sem introduzir novos.
- `npm test` — incluir `src/main/services/compras.service.test.ts` e `src/main/services/fornecedor.service.test.ts` como verificação de regressão do backend.
- Verificação visual na aplicação: abrir cada um dos 4 diálogos, confirmar cabeçalho/rodapé fixos, clicar com rato nas opções dos 10 selects e confirmar que a lista acompanha o scroll; confirmar ausência do campo de retenção.

## Riscos

- `FormDialog` usa `overflow-hidden`; sem `portal` os dropdowns das linhas seriam cortados — mitigado pelos 10 `portal`/`floating`.
- `FormShell` com `dialogLayout` exige que o contentor tenha altura definida; o `FormDialog` fornece `h-[90dvh]`, e o corpo usa `p-0` para não somar padding ao formulário.
- A conversão dos modais de `ComprasManager` para `footer` do `FormDialog` retira os botões do fluxo de scroll; confirmar que os handlers continuam a ser chamados e que `isSubmitting` continua a desactivar o botão.
