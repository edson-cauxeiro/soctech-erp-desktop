# Update v1 — Stock Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-26-update-v1-stock-design.md` (aprovada, `0caf355`).
**Baseline:** 1242 testes; lint 31 erros / 799 warnings.

## Task 1 — Transferência

- [ ] Teste: trocar mock e asserções de `$queryRaw` por `$executeRaw` em `stock.service.test.ts:45-57,191-195`; verificar que falha.
- [ ] Código: `stock.service.ts:371` passa a `tx.$executeRaw` com a mesma SQL e chave.
- [ ] Correr `npx vitest run src/main/services/stock.service.test.ts`; commitar `fix(stock): use executeRaw for advisory transaction lock`.

## Task 2 — Contrato do resumo

- [ ] Teste no controller: `getEstadoStock` recebe `(filters, empresaConfigId)` da sessão; verificar que falha.
- [ ] `electron.d.ts`: acrescentar `ResumoEstadoStockDto` e devolver `resumo` em `getEstadoStock`.
- [ ] `stock.controller.ts:202`: passar `session?.empresaConfigId`.
- [ ] `stock.service.ts:718`: aceitar `empresaId?: string`; `obterDiasAlertaValidade` filtra por `id: empresaId`; retorno com `resumo` zerado nesta fase.
- [ ] Ajustar teste `:714` para esperar `resumo` zerado; typecheck; commitar `feat(stock): add global stock summary contract and session company`.

## Task 3 — Serviço: estoques + resumo global

- [ ] Testes: `estoque.findMany` substitui `movimentoStock.groupBy`; `resumo` igual com pesquisa, `apenasAlertas`, `situacao` e paginação; valor usa `custoUnitario`; lote sem stock não conta; rutura não é sobrescrita.
- [ ] Helper `carregarSaldosEstoque(ids, diasAlerta)` com uma query a `estoque.findMany` (quantidade, custoUnitario, lote.dataValidade).
- [ ] `getEstadoStock`: calcular `resumo` com artigos globais antes de filtros; linhas e `valorTotal` a partir do helper; remover sobrescrita por validade em `:846-852`; manter filtros/paginação actuais.
- [ ] Correr testes do serviço e typecheck; commitar `fix(stock): derive stock state from estoques with global summary`.

## Task 4 — Renderer e E2E

- [ ] Teste E2E em `ui-formularios.e2e.mts`: ler seis `data-testid="kpi-*"` antes e depois de "Só alertas" + pesquisa; verificar que falha.
- [ ] `AlertaStockManager.tsx`: estado `resumo` com fallback zerado; KPIs passam a ler `resumo`; títulos "Artigos com lotes caducados", "Artigos com lotes a caducar" e "Valor de Inventário"; `KpiCardProps` aceita `testId`.
- [ ] Correr E2E do describe de Estado de Stock e typecheck; commitar `fix(stock): make KPI cards use global summary`.

## Task 5 — Verificação final

- [ ] `npm test`, `npm run typecheck`, `npm run build` e `npm run lint` (31/799).
- [ ] Verificação manual: transferência confirmada sem erro; cards estáveis com filtros.
- [ ] Marcar plano como concluído, acrescentar `## Resultado` e commitar `docs: close update v1 stock plan`.
