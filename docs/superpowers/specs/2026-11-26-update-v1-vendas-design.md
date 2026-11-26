# Update v1 — Módulo de Vendas — Design

**Data:** 2026-11-26
**Guia de origem:** `docs/updates/update-v1.md` (secção 1.1)

## Objectivo

Ajustar os formulários e documentos de Vendas (Fatura, Proforma, Recibo e Guia de Entrega) ao padrão visual dos formulários de Finanças, remover campos sem sentido e corrigir a moeda e o aviso de proforma.

## Decisões aprovadas

1. A aba **Encomendas** de Vendas permanece como está (é um formulário de demonstração que apenas faz `console.log`). As encomendas persistidas de Compras não são alteradas.
2. O "mesmo design (tamanho)" significa **replicar a densidade/layout dos campos mantendo as páginas inline**. Não há conversão para `FormDialog`.
3. As listas flutuantes são activadas **apenas nos formulários de Vendas**, através da opção existente `portal` do `SearchSelect`.
4. A substituição de `€` por `Kz` aplica-se a **toda a página de Fatura** (formulário, tabela, detalhe e nota de crédito). Os PDFs já usam `formatCurrency` com `AOA` por omissão.
5. De `estadoPagamento` remove-se **apenas o select do formulário**. A coluna da tabela e o detalhe continuam a apresentar o estado derivado dos recibos; modelo, validadores, filtros e SAFT não mudam.
6. De `retencaoFonte` no Recibo remove-se **apenas a interface**; o validador continua com `default(0)` e os cálculos/SAFT permanecem intactos.
7. O aviso da Proforma entra **no documento gerado**, com o texto exacto: `Os Preços dos Artigos Poderá Sofrer Alterações Conforme o Cambio do Dia.!`

## Abordagem

Ajustes cirúrgicos directamente nos componentes existentes. Não se cria um novo componente de layout; a única extensão partilhada é uma prop opcional no `SelectField`. A abstracção de layout poderá ser considerada quando o mesmo padrão for aplicado a Compras.

## Âmbito

### Alterar

- `src/renderer/src/components/erp/FormPrimitives.tsx` — `SelectField` aceita `floating?: boolean` (default `false`) e repassa `portal` ao `SearchSelect`.
- `src/renderer/src/components/erp/FaturaManager.tsx` — remoção do select/estado/envio de `estadoPagamento`; troca de `€`/`EUR` por `Kz`/`AOA` em todos os valores da página; `floating`/`portal` nos selects; alinhamento do layout.
- `src/renderer/src/components/erp/ProformaManager.tsx` — `floating`/`portal` nos selects; alinhamento do layout.
- `src/renderer/src/components/erp/ReciboManager.tsx` — remoção do input/estado de `retencaoFonte`; `floating`/`portal` nos selects; alinhamento do layout.
- `src/renderer/src/components/erp/GuiaEntregaManager.tsx` — `floating`/`portal` nos selects; alinhamento do layout.
- `src/main/services/proforma.service.ts` — acrescentar a frase do aviso a `observacoes`, mantendo `Válida até: ...`.
- Testes unitários de proforma/vendas, se cobrirem estas saídas.

### Não alterar

- Aba Encomendas (`src/renderer/src/pages/vendas.tsx`), módulo de Compras, Finanças, Stock e Comercial.
- Modelo Prisma, migrações, validadores, DTOs, IPC e SAFT.
- Lógica de cálculo de retenção e de estados de pagamento no backend.
- `DocumentoA4` e a geração de PDF (já formatam em `AOA`).

## Detalhe de implementação

- **Layout:** manter os cards inline; aproximar do padrão de Finanças com `p-6 space-y-6` e grid de cabeçalho `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, usando a altura/padding dos primitivos (`h-9`, `px-3`). Tabelas, botões e submissão ficam como estão.
- **Selects flutuantes:** `SelectField floating` nos selects dos 4 managers; `portal` nos `SearchSelect` usados directamente. O `SearchSelect` já calcula posição `fixed`, reposiciona em scroll/resize e usa `zIndex: 9999`.
- **Fatura:** ao remover o select, o payload deixa de enviar `estadoPagamento`; o validador aplica `pendente` por omissão. Todos os `toLocaleString(..., currency: "EUR")` e `€` literais passam a `AOA`/`Kz`.
- **Recibo:** ao remover o input, o payload deixa de enviar `retencaoFonte`; o validador aplica `0` por omissão.
- **Proforma:** `observacoes` passa a conter `Válida até: <data>` seguido da frase do aviso. O `DocumentoA4` já renderiza `observacoes`.

## Critérios de aceitação

1. Fatura sem select de estado de pagamento; todos os valores da página em `Kz`; coluna/detalhe continuam a mostrar o estado vindo do backend.
2. Proforma gerada com o aviso exacto.
3. Recibo sem campo de retenção; cálculo inalterado.
4. Fatura/Proforma/Recibo/Guia: dropdowns não são cortados por containers com overflow; layout com densidade idêntica à de Finanças.
5. Aba Encomendas inalterada.

## Verificação

- `npm run typecheck`
- `npm run lint` — manter os erros preexistentes sem introduzir novos.
- `npm test`
- Verificação visual rápida dos dropdowns e do layout na aplicação.

## Riscos

- O dropdown em portal usa `position: fixed` com `zIndex: 9999`: confirmar comportamento dentro de diálogos e tabelas com scroll.
- A alteração do grid pode deslocar o botão de submissão; validar visualmente.
