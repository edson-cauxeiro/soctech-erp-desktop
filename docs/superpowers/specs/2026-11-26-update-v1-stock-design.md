# Update v1 — Stock Design Spec

**Date:** 2026-11-26
**Source:** `docs/updates/update-v1.md` §1.4
**Status:** Aguardando revisão do utilizador

## Contexto

A secção 1.4 do guia de actualização reporta dois problemas no módulo de Stock:

1. **Transferência:** ao confirmar uma transferência de artigo aparece um erro “invalid prisma query”.
2. **Estado de Stock:** os cards não apresentam a informação correcta dos produtos/artigos.

Análise estática confirmou:

- `src/main/services/stock.service.ts:371` usa `tx.$queryRaw` para `SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0));`. A função devolve `void`; o `$queryRaw` tenta desserializar a coluna e falha. O erro sobe pelo controller como `INTERNAL_ERROR` e chega ao toast do `TransferenciaManager`.
- `src/renderer/src/components/erp/AlertaStockManager.tsx:70-75` calcula os seis KPIs a partir de `linhas`, ou seja, da página já filtrada e paginada devolvida por `getEstadoStock`. Marcar “Só alertas”, escolher uma situação ou pesquisar altera os cards.
- `StockService.getEstadoStock` (`src/main/services/stock.service.ts:718-892`) deriva o saldo de `movimentos_stock` (livro-razão legado) em vez de `estoques` (saldo materializado, fonte da verdade usada por Armazéns e Stock por Localização). Além disso, a validade de lotes sobrescreve a situação de rutura/stock baixo e os lotes são contados sem exigir stock.

## Objectivo

- Confirmar transferências sem erro do Prisma.
- Fazer os cards reflectirem o estado global e correcto do stock, independentemente dos filtros da tabela.

## Decisões aprovadas

1. **Cards globais e estáveis:** os KPIs resumem sempre todos os artigos activos; pesquisa, “Só alertas”, situação e paginação da tabela não os alteram.
2. **Fonte do saldo:** `estoques`, e não `movimentos_stock`, alinhando com os outros ecrãs de stock.
3. **Verificação da transferência:** teste unitário que exige `$executeRaw` + verificação manual na aplicação. Não acrescentar E2E com escrita na base de desenvolvimento.
4. **Cards de validade:** contar **artigos afectados** por lote caducado/próximo; os títulos passam a dizê-lo explicitamente.
5. **Abordagem A:** correcção cirúrgica nas duas origens, sem refactor geral do módulo Stock.

## Arquitectura e fluxo de dados

### Transferência

```
TransferenciaManager.submeter()
  → stockApi.transferencia() → IPC stock:transferencia
  → StockController.transferencia()
  → StockService.createMovimento() → criarMovimentoTx()
      → tx.$executeRaw`SELECT pg_advisory_xact_lock(...)`   ← antes: $queryRaw (falha)
      → getStockArtigoArmazemTx() → movimentoStock.create()
  → ok(result) → toast de sucesso
```

### Estado de Stock

```
AlertaStockManager (sem mudança de filtros)
  → stockApi.getEstadoStock(payload)
  → StockController.getEstadoStock() (injecta empresaConfigId da sessão)
  → StockService.getEstadoStock(filtros, empresaId)
      → Estoque.groupBy({ by: ['artigoId'], _sum: { quantidade, ... } })
      → calcula resumo GLOBAL (antes de search/apenasAlertas/situacao/paginação)
      → calcula itens paginados/filtrados com o mesmo saldo
  → { items, total, resumo }
  → KPIs leem res.data.resumo; tabela continua a ler res.data.items
```

`resumo` não é um novo canal IPC: é um campo extra no retorno de `getEstadoStock`.

## Mudanças detalhadas

### 1. Lock de transferência — `src/main/services/stock.service.ts`

- Linha 371: trocar `tx.$queryRaw` por `tx.$executeRaw`, mantendo a mesma SQL, a mesma chave e o mesmo ciclo de locks por `(artigo, armazém)`.
- Não alterar validador, controller, renderer, tipos IPC nem outros tipos de movimento.

**Teste:** actualizar `src/main/services/stock.service.test.ts:45-57` e `:170-204` para que o mock de transacção forneça `$executeRaw`; afirmar que ele é chamado uma vez e antes da leitura do saldo. O teste de concorrência existente continua válido.

### 2. Contrato do estado de stock

- `electron.d.ts`: acrescentar `ResumoEstadoStockDto` com:
  - `ruturas: number`
  - `stockBaixo: number`
  - `artigosComLotesCaducados: number`
  - `artigosComLotesProximosCaducar: number`
  - `normais: number`
  - `valorInventario: number`
- Passa a constar `resumo: ResumoEstadoStockDto` no retorno de `getEstadoStock`.
- `getEstadoStock` do serviço aceita um segundo parâmetro opcional `empresaId?: string`; o controller passa `session?.empresaConfigId`. O payload do renderer mantém-se inalterado.

### 3. Serviço — `src/main/services/stock.service.ts` (`getEstadoStock`)

- Saldo por artigo: `estoque.groupBy` com `_sum.quantidade`, sem depender de `movimentos_stock`.
- Valor de inventário: soma de `quantidade × custoUnitario` nas posições de `estoques`.
- `resumo` calculado sobre todos os artigos activos e não-serviço, antes de qualquer filtro/paginação:
  - `ruturas`: `stockAtual <= 0`;
  - `stockBaixo`: `stockAtual > 0 && stockAtual <= stockMinimo`;
  - `normais`: restantes;
  - `artigosComLotesCaducados` / `...ProximosCaducar`: artigos com pelo menos uma posição `estoque` com `lote`, `quantidade > 0` e `dataValidade` respectivamente vencida ou dentro de `diasAlertaValidade`;
  - `valorInventario`: soma descrita acima.
- A validade **não sobrescreve** a situação de rutura/stock baixo/normal dos itens.
- `diasAlertaValidade`: lido de `empresaConfig` filtrada por `id: empresaId` quando disponível; manter fallback actual apenas para chamadas de teste sem empresa.

### 4. Renderer — `src/renderer/src/components/erp/AlertaStockManager.tsx`

- Substituir os `linhas.filter/reduce` dos KPIs por `resumo` (com fallback seguro para zero enquanto a resposta não chega).
- Títulos: “Artigos com lotes caducados” e “Artigos com lotes a caducar”; manter sufixo “artigo(s)”.
- Título do valor: “Valor de Inventário” (sem “Custo Médio”).
- Tabela, pesquisa, “Só alertas”, situação e paginação permanecem inalterados.

**Não alterar:** estrutura dos KPIs, ícones, cores, filtros da tabela, colunas nem outro ecrã de stock.

### 5. Testes

- `src/main/services/stock.service.test.ts`:
  - `resumo` igual com e sem `search`, `apenasAlertas`, `situacao`, `skip`/`take`;
  - saldo e valor lidos de `estoques`, incluindo devoluções;
  - lote caducado sem stock não conta;
  - artigo em rutura com lote caducado continua classificado como `rutura`;
  - actualizar mocks de `$queryRaw` → `$executeRaw`.
- `tests/e2e/ui-formularios.e2e.mts` (describe existente de Estado de Stock): ler os seis valores dos cards, activar “Só alertas” e escolher uma situação, afirmar que não mudam. Continua read-only.

## Fora de âmbito

- Refactor de `ArmazemManager`, `StockLocalizacaoManager`, `MovimentoStockManager` ou `inventory.service.ts`.
- Unificação completa de todos os ecrãs de stock em `estoques` (abordagem C).
- Novos filtros de armazém/artigo na página de Estado de Stock.
- Alteração ao assistente de Transferência, ao validador `transferenciaStockSchema` ou ao tratamento de erro do toast.
- E2E que confirme transferência e grave movimento na base de desenvolvimento.

## Critérios de aceitação

1. Confirmar uma transferência real na aplicação não mostra “invalid prisma query” e cria o movimento.
2. Os seis cards mostram contagens globais estáveis, iguais antes e depois de pesquisar, activar “Só alertas” ou filtrar por situação.
3. O saldo e o valor dos cards coincidem com “Ver Stock”/“Stock por Localização” para artigos de teste.
4. Um artigo em rutura com lote caducado sem stock aparece em “Ruturas”, não em caducidade.
5. `npm test`, `npm run typecheck`, `npm run build` e `npm run lint` mantêm-se dentro da baseline (31 erros de lint preexistentes).
6. Testes unitários novos e E2E read-only passam.
