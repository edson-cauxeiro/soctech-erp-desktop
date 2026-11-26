# Update v1 — Stock Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-26-update-v1-stock-design.md` (aprovada, `0caf355`).
**Baseline:** 1242 testes; lint 31 erros / 799 warnings.

## Task 1 — Transferência

- [x] Teste: trocar mock e asserções de `$queryRaw` por `$executeRaw` em `stock.service.test.ts:45-57,191-195`; verificar que falha.
- [x] Código: `stock.service.ts:371` passa a `tx.$executeRaw` com a mesma SQL e chave.
- [x] Correr `npx vitest run src/main/services/stock.service.test.ts`; commitar `fix(stock): use executeRaw for advisory transaction lock`.

## Task 2 — Contrato do resumo

- [x] Teste no controller: `getEstadoStock` recebe `(filters, empresaConfigId)` da sessão; verificar que falha.
- [x] `electron.d.ts`: acrescentar `ResumoEstadoStockDto` e devolver `resumo` em `getEstadoStock`.
- [x] `stock.controller.ts:202`: passar `session?.empresaConfigId`.
- [x] `stock.service.ts:718`: aceitar `empresaId?: string`; `obterDiasAlertaValidade` filtra por `id: empresaId`; retorno com `resumo` zerado nesta fase.
- [x] Ajustar teste `:714` para esperar `resumo` zerado; typecheck; commitar `feat(stock): add global stock summary contract and session company`.

## Task 3 — Serviço: estoques + resumo global

- [x] Testes: `estoque.findMany` substitui `movimentoStock.groupBy`; `resumo` igual com pesquisa, `apenasAlertas`, `situacao` e paginação; valor usa `custoUnitario`; lote sem stock não conta; rutura não é sobrescrita.
- [x] Helper `carregarSaldosEstoque(ids, diasAlerta)` com uma query a `estoque.findMany` (quantidade, custoUnitario, lote.dataValidade).
- [x] `getEstadoStock`: calcular `resumo` com artigos globais antes de filtros; linhas e `valorTotal` a partir do helper; remover sobrescrita por validade em `:846-852`; manter filtros/paginação actuais.
- [x] Correr testes do serviço e typecheck; commitar `fix(stock): derive stock state from estoques with global summary`.

## Task 4 — Renderer e E2E

- [x] Teste E2E em `ui-formularios.e2e.mts`: ler seis `data-testid="kpi-*"` antes e depois de "Só alertas" + pesquisa; verificar que falha.
- [x] `AlertaStockManager.tsx`: estado `resumo` com fallback zerado; KPIs passam a ler `resumo`; títulos "Artigos com lotes caducados", "Artigos com lotes a caducar" e "Valor de Inventário"; `KpiCardProps` aceita `testId`.
- [x] Correr E2E do describe de Estado de Stock e typecheck; commitar `fix(stock): make KPI cards use global summary`.

## Task 5 — Verificação final

- [x] `npm test`, `npm run typecheck`, `npm run build` e `npm run lint` (31/799).
- [x] Verificação manual: transferência confirmada sem erro; cards estáveis com filtros.
- [x] Marcar plano como concluído, acrescentar `## Resultado` e commitar `docs: close update v1 stock plan`.

## Resultado

Módulo de Stock concluído e verificado.

- Transferência: `$queryRaw` -> `$executeRaw` no lock `pg_advisory_xact_lock` (`18361be`).
- Descoberto na verificação manual: contador `MOV` vazio apesar de existirem `MOV-2026/00001..00004`, o que fazia a gravação falhar com `Unique constraint failed (numero)`. Migração de reconciliação adicionada e aplicada (`a6b57be`).
- Contrato: `getEstadoStock` devolve `resumo` global e recebe a empresa da sessão (`8a60f86`).
- Serviço: saldo/valor passam a vir de `estoque` (`quantidade`, `custoUnitario`), com resumo calculado antes de pesquisa/filtros/paginação; validade conta artigos com lotes com quantidade > 0 e não sobrescreve rutura (`8e4ae50`).
- Renderer: cards lêm o `resumo`, títulos actualizados e `data-testid` para estabilidade E2E (`98a696c`).

Verificação: `npm test` 1245 testes OK; `npm run typecheck` e `npm run build` OK; E2E do Estado de Stock 3/3; `npm run lint` 31 erros / 799 warnings (baseline). Verificação manual: transferência gravada como `MOV-2026/00005` sem erro e cards inalterados com "Só alertas" e pesquisa.
