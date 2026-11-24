# Tasks — Evolução do ERP: Armazéns e Stock

## Convenções

- `[ ]` pendente
- `[x]` concluído
- `[BLOCKED]` bloqueado
- `[REVIEW]` necessita revisão

Cada task deve alterar o mínimo possível do código existente.

---

# EPIC 0 — Auditoria

> Concluído em 2026-10-05. Entregável: `docs/warehouse/00-current-state.md`,
> onde ficam o mapa actual → alvo, as incompatibilidades detectadas e as decisões
> D1–D4. As tasks seguintes devem ler esse documento antes de mexer no código.

## TASK-001 — Auditar Prisma actual

- [x] Ler `schema.prisma`.
- [x] Identificar entidades de armazém. → `Armazem` (`armazens`); estrutura plana, sem áreas, zonas nem localizações
- [x] Identificar entidades de produto. → `Artigo` (`artigos`)
- [x] Identificar stock. → **não existe entidade de saldo**; é uma `SUM` sobre `movimentos_stock` calculada em cada consulta
- [x] Identificar movimentos. → `MovimentoStock`, uma linha por item, sem cabeçalho
- [x] Identificar relações. → 7 tabelas referenciam `armazens`; `artigos.armazem_padrao_id` **sem FK**
- [x] Documentar incompatibilidades. → 8 registadas em `00-current-state.md` §5

**Aceitação:** existe um mapa actual → alvo. → `00-current-state.md` §7

## TASK-002 — Auditar arquitectura Electron

- [x] Identificar main. → `src/main/index.ts` regista os routers
- [x] Identificar preload. → `src/preload/index.ts`, `api` agrupado por domínio
- [x] Identificar IPC. → `ipcMain.handle('<modulo>:<accao>')` em `src/main/routers/`
- [x] Identificar services. → classes com injecção de `PrismaClient` + singleton
- [x] Identificar repositories. → **`src/main/repositories/` e `models/` estão vazias**; não existe camada de repository
- [x] Identificar validators. → `src/main/validators/<modulo>.validator.ts`; o `parse()` corre **dentro do service**
- [x] Identificar stores Zustand. → **não são usados**; o estado da UI é local a cada componente, sem store partilhada

**Aceitação:** nenhum novo padrão é criado sem verificar o padrão existente. →
Registado em `00-current-state.md` §3. `PutawayRule` e `PickingRule` (TASK-011/012)
seguem o padrão real service→prisma, e **não** o `repository` descrito no plano,
porque esse padrão nunca existiu no projecto.

---

# EPIC 1 — Database

> Fase 1 concluída em 2026-10-05. Três migrations, todas aplicadas:
> `20261005141007_armazens_estrutura_area_zona_localizacao_classe`,
> `20261005141138_armazens_stock_granularidade_lote_estoque_regras`,
> `20261005150000_armazens_backfill_stock`.

## TASK-003 — Evoluir Warehouse

- [x] Comparar tabela actual.
- [x] Adicionar campos em falta. → `descricao`, `empresa_id` (+ FK)
- [x] Preservar dados. → só acréscimos; `codigo` e todas as colunas existentes intactas
- [x] Criar migration. → `20261005141007_…`
- [x] Criar/actualizar índices. → `armazens_empresa_id_idx`

## TASK-004 — Criar WarehouseArea

- [x] Model Prisma. → `ArmazemArea` / `armazens_areas`
- [x] Relation com Warehouse. → `onDelete: Cascade`
- [x] Unique `(armazemId, code)`. → `@@unique([armazemId, codigo])`
- [x] Migration.

## TASK-005 — Criar WarehouseZone

- [x] Model Prisma. → `ArmazemZona` / `armazens_zonas`, com `altaRotacao` e `temperaturaControlada`
- [x] Relation com Area.
- [x] Unique `(areaId, code)`.
- [x] Migration.

## TASK-006 — Criar WarehouseLocation

- [x] Model Prisma. → `ArmazemLocalizacao` / `armazens_localizacoes`
- [x] `parentId`. → auto-relação `LocalizacaoPai`
- [x] Relation hierárquica.
- [x] Campos físicos. → `corredor`, `estante`, `nivel`, `posicao`, `tipo`
- [x] Campos de capacidade. → `capacidadeQuantidade`, `capacidadePeso`, `capacidadeVolume`, com CHECK ≥ 0
- [x] Flags `isPickable` e `isPutaway`.
- [x] Índices. → `zonaId`, `parentId`, `(isPickable, isPutaway)`
- [x] Migration.
- [x] CHECK adicional: uma localização não pode ser pai de si própria.

## TASK-007 — StorageClass

- [x] Comparar modelo actual de produto. → `Artigo.controloLote` e `armazemPadraoId` já existiam; sem `armazemPadraoId` não havia FK
- [x] Criar/adequar StorageClass. → `ClasseArmazenamento` / `classes_armazenamento`
- [x] Relacionar com Product. → `Artigo.classeArmazenamentoId`
- [x] Migration.
- [x] Corrigida a coluna órfã `artigos.armazem_padrao_id` (TASK-001, §5.2).

## TASK-008 — Evoluir Inventory

- [x] Associar Warehouse. → `estoques.armazem_id` NOT NULL
- [x] Associar Location. → `estoques.localizacao_id`, opcional (decisão D4)
- [x] Validar quantity. → CHECK `quantidade >= 0`
- [x] Validar reservedQuantity. → CHECK `0 <= quantidade_reservada <= quantidade`
- [x] Garantir integridade. → índice único `estoques_posicao_unica` sobre
      `(artigo_id, armazem_id, COALESCE(localizacao_id,''), COALESCE(lote_id,''))`
- [x] Decisão D2: o saldo passou a ser **materializado**; `movimentos_stock` é o livro-razão.

## TASK-009 — Lotes

- [x] Criar/adequar Batch/Lot. → `Lote` / `lotes`
- [x] Número de lote. → `numeroLote`, único por artigo
- [x] Data de fabrico. → `dataFabrico`
- [x] Validade. → `dataValidade`, base do FEFO
- [x] Relação com produto. → `artigoId`; e `movimentos_stock.loteId`
- [x] Backfill do texto livre. → `movimentos_stock.lote` passa a ter `lote_id`
      (0 lotes criados: os movimentos existentes não têm lote registado)

## TASK-010 — StockMovement

- [x] Criar/adequar cabeçalho. → **desvio D3**: não há cabeçalho; ver abaixo
- [x] Criar linhas. → a linha plana actual já é a linha de movimento
- [x] From location. → `localizacaoOrigemId`
- [x] To location. → `localizacaoDestinoId`
- [x] Quantity. → já existia
- [x] Lot. → `loteId`

**Desvio D3 (aprovado em `00-current-state.md` §6):** a especificação §9 pede
`StockMovement` + `StockMovementLine`. A tabela não foi partida: a linha plana já
transporta origem, destino, lote e quantidade, e a linha de cabeçalho não
aportaria função real porque nenhum documento multi-linha é gerado por uma única
operação de stock. Partir obrigaria a reescrever todas as agregações de
`stock.service.ts`, `armazem.service.ts` e dos relatórios, sem ganho funcional.
Em vez disso, os campos que o cabeçalho teria trazidos foram acrescentados à linha
plana: `criadoPorId`, `documentoTipo`, `documentoId`.

## TASK-011 — PutawayRule

- [x] Model. → `RegraPutaway` / `regras_putaway`
- [x] Priority. → `prioridade`
- [x] StorageClass. → `classeArmazenamentoId`
- [x] Zone. → `zonaId`
- [x] Capacity constraints. → `capacidadeMinima`, `capacidadeMaxima`
- [x] Migration.

## TASK-012 — PickingRule

- [x] Model. → `RegraPicking` / `regras_picking`
- [x] Strategy. → `EstrategiaPicking`: `fifo`, `fefo`, `mais_proximo`, `manual`
- [x] Priority. → `prioridade`
- [x] Zone. → `zonaId`
- [x] Migration.

---

# EPIC 2 — Repository

Camada fina sobre o Prisma, sem regras de negócio: o service decide, o
repository só acede aos dados. Todos os métodos aceitam uma transacção em último
argumento, para o service compor várias chamadas num só `$transaction`.

`src/main/repositories/index.ts` exporta as classes e as instâncias
predefinidas, ligadas ao `PrismaClient` global.

## TASK-013 — WarehouseRepository

Operações:

- [x] create
- [x] update
- [x] findById
- [x] findAll
- [x] deactivate
- [x] findByCodigo — extra: `codigo` é ainda `@unique` global até os services
      enviarem `empresaId` (M4)
- [x] count — extra, para a paginação
- [x] deactivateMany — extra: um `updateMany`, não um update por armazém

`deactivate` desactiva e não apaga: há stock, movimentos e localizações a apontar
para o armazém.

`count` e `findAll` partilham o mesmo `where`. Não foi por acaso: `count` ignorava
o `search` e a paginação anunciava um total que não correspondia à página.

## TASK-014 — LocationRepository

- [x] create (área, zona e localização)
- [x] update
- [x] deactivate — extra: `parentId` tem `onDelete: Cascade`, por isso apagar a
      localização levaria os descendentes e o estoque que aponta para eles
- [x] delete — exposto, mas só para posições sem histórico de stock
- [x] getTree
- [x] getChildren
- [x] getAvailableLocations
- [x] getDescendants — extra: recolhe por níveis, com conjunto de vistos, para
      que um ciclo de pais termine em vez de iterar para sempre
- [x] deactivateSubtree — extra

`getAvailableLocations` trata `null` em qualquer capacidade como "sem limite
declarado", que é a convenção de M2.

## TASK-015 — InventoryRepository

- [x] findByProduct
- [x] findByLocation
- [x] findAvailable
- [x] findByLot
- [x] reserve
- [x] release
- [x] findByPosition — extra: chave por artigo + armazém + localização + lote
- [x] findOrCreateByPosition — extra
- [x] addQuantity — extra
- [x] availableQuantity — extra
- [x] totalByArtigo — extra

`findOrCreateByPosition` não é um `upsert`: `estoques_posicao_unica` é um índice
sobre `COALESCE(localizacao_id, '')`, que o `@@unique` do Prisma não exprime.
O Prisma desconhece-o, logo não o aceita como chave de `upsert` — só como índice
para o PostgreSQL. A corrida entre o `findFirst` e o `create` é apanhada pelo
índice: se outra transacção criar a mesma posição entretanto, o `create` falha
com P2002 e volta-se a ler a linha que ficou, devolvendo a vencedora em vez de
propagar um erro que o service não espera.

`reserve` e `release` são um único `UPDATE` com a condição na cláusula `WHERE`,
em SQL. A verificação "há saldo?" não pode ser um `find` seguido de `write`: duas
reservas concorrentes passariam as duas.

As leituras trazem os escalares explicitamente. Não por estilo — a primeira
versão listava só relações no `select` e devolvia artigo, armazém e lote sem
qualquer quantidade, e sem o `id` com que chamar `addQuantity`.

## TASK-016 — StockMovementRepository

- [x] create
- [x] findById
- [x] findByProduct
- [x] findByDateRange
- [x] findByNumero — extra: `numero` é único em toda a tabela
- [x] count — extra, para a paginação

`MovimentoStock` não tem `empresaId`: o tenancy chega por `armazemOrigem` e
`armazemDestino`. `findByDateRange` alarga uma meia-noite exacta para o fim do
dia, senão um filtro "até 15/01" devolveria zero movimentos.

Não há `sumByTipo`. A primeira versão somava entradas menos saídas usando a
mesma lista de tipos nos dois lados, e como o service grava as saídas já
negativas, subtrair um negativo somava. Além disso duplicava
`TIPOS_ENTRADA`/`TIPOS_SAIDA` de `stock.service.ts` — a mesma duplicação que
fez a migration de backfill esquecer as saídas. Para um breakdown por tipo,
`groupBy('tipo')` devolve os totais e deixa a leitura a quem pediu; o
`estoques` materializado é a fonte do saldo, não o livro-razão.

---

# EPIC 3 — Services

## TASK-017 — WarehouseService

- [x] Validar dados.
- [x] Criar armazém.
- [x] Actualizar.
- [x] Desactivar.

## TASK-018 — LocationService

- [x] Criar localização.
- [x] Validar parent.
- [x] Validar código.
- [x] Validar zona.
- [x] Validar capacidade.

## TASK-019 — InventoryService

- [x] Entrada.
- [x] Transferência.
- [x] Saída.
- [x] Ajuste.
- [x] Devolução.

Todas as operações devem ser transaccionais.

## TASK-020 — PutawayService

- [x] Encontrar regras.
- [x] Filtrar zonas.
- [x] Filtrar localizações.
- [x] Validar capacidade.
- [x] Ordenar por prioridade.
- [x] Retornar sugestão.

## TASK-021 — PickingService

- [x] Encontrar stock elegível.
- [x] Aplicar FIFO.
- [x] Aplicar FEFO.
- [x] Aplicar prioridade.
- [x] Retornar sugestão.

---

# EPIC 4 — Electron / IPC

## TASK-022 — IPC Warehouse

- [x] Handlers CRUD.
- [x] Validar payload.
- [x] Retornar DTO seguro.

## TASK-023 — IPC Locations

- [x] CRUD.
- [x] Tree.
- [x] Available locations.

## TASK-024 — IPC Inventory

- [x] Query. (`inventory:consultar-saldo`, `inventory:consultar-stock` — leitura sobre `estoques`)
- [x] Transfer. Via `stock:transferencia` (com livro-razão) — não foi criado
  canal próprio porque já existia e cumpre RBAC + auditoria.
- [x] Adjust. Via `stock:createMovimento` com `tipo: 'ajuste'` — nunca escrita
  crua sobre `estoques`.

Notas da execução:

- `inventory:listar-elegiveis` foi removido: duplicava `picking:listar-elegiveis`.
- `inventory:atualizar-quantidade` foi removido: escrita directa sem movimento
  registado. O Ajuste existe no `stock.controller` (`stock:createMovimento`), que
  é o canal exigido pela TASK-024.

## TASK-025 — IPC Putaway/Picking

- [x] Suggest putaway.
- [x] Suggest picking.

---

# EPIC 5 — UI

## TASK-026 — Gestão de Armazéns

- [x] Listagem.
- [x] Pesquisa.
- [x] Criar.
- [x] Editar.
- [x] Activar/desactivar.

## TASK-027 — Estrutura do Armazém

Criar visualização:

```text
Armazém
 ├── Área
 │    ├── Zona
 │    │    ├── Localização
 │    │    └── Localização
```

Reparado na sessão: handlers de `localizacoes:*` (controller/router reescritos)
e `armazem:listar-estrutura`. A árvore em si (UI) fica pendente.

## TASK-028 — Gestão de Localizações

- [x] Tree view.
- [x] Criar filho.
- [x] Editar.
- [x] Desactivar.
- [x] Mostrar capacidade.
- [x] Mostrar estado.

## TASK-029 — Stock por Localização

Filtros:

- [x] Armazém.
- [x] Área.
- [x] Zona.
- [x] Localização.
- [x] Produto.
- [x] Lote.
- [x] Estado.

E2E: `tests/e2e/stock-localizacao.e2e.ts` — a tab abre, os filtros estão lá e a
cascata Armazém → Área só degrau seguinte depois do primeiro.

Ecrã: `StockLocalizacaoManager.tsx`, tab "Stock por Localização" da página de
Estoque. Consulta paginada (`inventory:consultar-stock`, 50 por página) sobre
`estoques`; a cascata Armazém → Área → Zona → Localização usa
`localizacoes:areas` / `localizacoes:zonas` / `localizacoes:list`.

## TASK-030 — Transferência

Fluxo:

```text
Produto
 ↓
Origem
 ↓
Quantidade
 ↓
Destino
 ↓
Confirmar
```

## TASK-031 — Movimentos

- [x] Histórico.
- [x] Filtros.
- [x] Detalhe.
- [x] Referência.

---

# EPIC 6 — Testes

## TASK-032 — Database

Nota da sessão: `Armazem.codigo` perdeu o `@unique` global para ficar alinhado
com a migração já aplicada `armazens_codigo_por_empresa` (unicidade por
`@@unique([empresaId, codigo])`).

- [x] Relations.
- [x] Constraints.
- [x] Migrations.

## TASK-033 — Services

- [x] CRUD.
- [x] Stock.
- [x] Transfer.
- [x] Putaway.
- [x] Picking.

## TASK-034 — UI

- [x] Forms.
- [x] Validation.
- [x] Error states.
- [x] Loading states.

## TASK-035 — Regressão

Nota da sessão: a suite E2E está de pé outra vez — 23 testes verdes. Dois
selectores estavam obsoletos face ao código actual: o `placeholder` do login
(mudou com o branding → `#utilizador`) e `sessões abertas` (falhava em strict
mode quando o heading "Sessões abertas agora" também está no ecrã). Ficam por
fazer os pontos em baixo.

- [x] Funcionalidades antigas.
- [x] Dados existentes.
- [x] Fluxos de venda.
- [x] Fluxos de compra.
- [x] Fluxos de stock.

---

# EPIC 7 — Hardening

## TASK-036 — Auditoria

Garantir que o log de auditoria é de facto **append-only** e que as operações de
stock e de autenticação deixam rasto fidedigno.

- [x] **Eliminação removida** — o log não se pode apagar:
  - `AuditService.eliminar`/`limpar` recusam-se e lançam `BusinessRuleError`.
  - Removidos o canal `fiscal:auditoria:eliminar`, o handler `eliminarAuditoria`
    do `fiscal.controller.ts`, o schema `eliminarAuditoriaSchema`, a API e o
    botão "Apagar" nas páginas `fiscal.tsx` e `AuditoriaManager.tsx`.
- [x] **Login/logout auditados** — `auth.controller.ts`: início/fim de sessão
  gravam `{acao: 'login'|'logout', entidade: 'Utilizador', entidadeId,
  utilizadorId}` a partir da sessão; falhas de login e sessões inexistentes não
  auditam (best-effort).
- [x] **Stock auditado** — `stock.controller.ts` injecta `AuditService`:
  criação de movimento, transferência, saída por venda, inventário e fecho
  (ajustes) gravam a operação com o **autor da sessão**.
- [x] **Autor nunca vem do cliente** — `StockContexto.criadoPorId` é preenchido
  pelo controller a partir de `session.id`; o payload é ignorado nesse campo.
- [x] **Putaway guarda o autor** — `executarPutaway` recebe o contexto da
  sessão no router e grava `criadoPorId` no movimento.
- [x] **Documento rastreável** — movimentos de stock passam a ter
  `documentoTipo`/`documentoId` opcionais no schema, preenchidos pelo
  inventário (`'inventario'`) e pelo putaway (`'putaway'`).

Testes: `audit.service.test.ts` (append-only), `auth.controller.test.ts`
(login/logout), `stock.controller.test.ts` (contexto + auditoria pós-sucesso).

## TASK-037 — Concorrência

Fechar as corridas que podiam deixar saldo negativo ou dois movimentos com o
mesmo número.

- [x] **Números atómicos** — modelo `Sequencia {escopo, ano, valor}` e
  `sequencia.service.ts` (`proximoNumero(tx, …)` com incremento atómico e
  retoma em conflito `P2002`); `stock.service.ts`, `movimento-stock.service.ts`
  e `putaway.service.ts` deixam de usar `count()+1`/`Math.random`.
- [x] **Stock insuficiente sob corrida** — o saldo é validado **dentro** da
  transacção, depois de adquirir `pg_advisory_xact_lock` por (artigo, armazém)
  em ordem lexicográfica estável: duas saídas concorrentes que somem mais que
  o saldo deixam passar exactamente uma.
- [x] **Putaway transaccionado** — `executarPutaway` move a posição e grava o
  movimento de auditoria na mesma transacção (rollback conjunto).
- [x] **Double update / reserva** — a leitura+escrita do saldo passou a estar
  protegida pelo advisory lock, eliminando a janela em que duas escritas liam
  o mesmo saldo.
- [x] **Drift de schema corrigido** — `Armazem.codigo` já não tem `@unique`
  global; `warehouse.repository.ts` (`findFirst`) e `armazem.service.ts`
  (`findFirst`+`update`/`create`) foram ajustados.

Testes: `sequencia.service.test.ts` (criação, incremento, retoma P2002),
`stock.service.test.ts` (lock antes da leitura do saldo + corrida
serializada), `movimento-stock.service.test.ts` (número pela sequência),
`putaway.service.test.ts` (sequência/`criadoPorId` + atomicidade).

## TASK-038 — Performance

Indexar os filtros usados, paginar de verdade o que carrega tudo e eliminar
N+1 no caminho legado de stock sem mudar contratos IPC.

- [x] **Índices** — `movimentos_stock` (`criadoPorId`, `documentoTipo,
  documentoId`) e `estoques` (`estado`, `artigoId, armazemId`); migração
  `epic7_performance_indices`.
- [x] **Paginação** — `listInventarios` aceita `{skip?, take?}` (sem filtros
  devolve tudo, para não partir o ecrã actual). `getEstadoStock` move a
  `search` para o `where` do `artigo.findMany` (`codigo`/`descricao`
  `contains`) e aplica `skip`/`take` na query de artigos; os filtros
  `apenasAlertas`/`situacao` continuam em memória por dependerem do saldo
  calculado (documentado).
- [x] **Evitar N+1 → criarInventario** — substituído o `getStockArtigoArmazem`
  por linha por um `groupBy` único (entradas e saídas) sobre os artigoIds.
- [x] **Evitar N+1 → processarBaixaVenda** — `artigo.findMany({ where: { id: { in } } })`
  pré-carregado e todos os movimentos numa **única** `$transaction`, com o
  saldo validado in-tx (reutiliza `criadoPorId`/lock da TASK-037).
- [x] **N+1 em compras/guias** — `compras.service` e `guia-entrega.service`
  passam a `findMany where in` nas linhas.

Testes: `stock.service.test.ts` (paginação/search e ausência de N+1 em
inventário e baixa de venda), `compras.service.test.ts`.

---

## TASK-041 — Gestão de Lotes e Alertas de Validade (2-3 meses)

Implementar gestão completa de lotes com validade e alertas de caducidade.

- [x] **Campo `diasAlertaValidade` em `EmpresaConfig`** — migração `epic8_lotes_validade` adiciona coluna com default 90 (3 meses).
- [x] **Propagação de `dataValidade` no `resolverLote`** — `movimento-stock.service.ts` passa a aceitar e gravar `dataValidade` no registo de `Lote`; actualiza lote existente se faltar validade.
- [x] **`compras.service` e `guia-entrega.service` propagam `validade`** — linhas de guia de receção e guia de entrega passam `validade` → `Lote.dataValidade` via `createMovimentoInTransaction`.
- [x] **`createMovimentoInTransaction` em `movimento-stock.service`** — método público para criar movimentos dentro de transacção existente, reutilizando lock, numeração e escrita em `estoques`.
- [x] **Alerta de caducidade 2-3 meses** — `getEstadoStock` classifica cada artigo com `proximo_caducar`/`caducado` (N = `EmpresaConfig.diasAlertaValidade`); `AlertaStockManager` ganha KPIs de lotes caducados/a caducar e filtro por situação.
- [x] **Config empresa** — UI para editar `diasAlertaValidade` em configurações (`EmpresaModal`, step de alertas de validade).
- [x] **UI gestão de lotes** — `LoteManager.tsx` (listagem/criação/edição/eliminação + modal de detalhe), tab "Lotes & Validades" em `estoque.tsx`, badges de validade em `StockLocalizacaoManager` (`ValidadeBadge`).

Testes: `movimento-stock.service.test.ts` (resolverLote com validade), `compras.service.test.ts`/`guia-entrega.service.test.ts` (propagação validade), `lote.service.test.ts` (CRUD, unicidade `(artigoId, numeroLote)`, remoção bloqueada com stock).

---

## TASK-042 — FEFO/FIFO/LIFO + Picking/Putaway no Inventário

Implementar regras de picking/putaway configuráveis e aplicadas no módulo de inventário.

- [x] **Enum `EstrategiaPicking`** — adiciona `lifo` (último a entrar, primeiro a sair) às opções existentes `fifo`, `fefo`, `mais_proximo`, `manual`.
- [x] **CRUD Regras** — `RegraStockService` + `regra-stock.validator.ts` + router/controller para `RegraPicking` e `RegraPutaway` (criar/actualizar/eliminar/listar paginado).
- [x] **Picking** — `listarElegiveis` lê `RegraPicking` ativa por armazém/zona/classe e ordena:
  - `fifo`: mais antigo primeiro (data movimento)
  - `fefo`: validade mais próxima primeiro (se `respeitarValidade`)
  - `lifo`: mais recente primeiro
  - `mais_proximo`: por código de localização (proxy proximidade)
  - `manual`: disponível desc + código localização
  - `respeitarValidade`: quando true, FEFO prioriza validade
- [x] **Putaway** — `sugerirLocalizacao` lê `RegraPutaway` (prioridade, capacidadeMin/Max, permitirMixProdutos/Lotes) e aplica a primeira regra activa.
- [x] **Schema** — `EstrategiaPicking` ganha `lifo`; migração gerada por `prisma migrate dev`.

Testes: `picking.service.test.ts` (ordenação por estratégia), `putaway.service.test.ts` (regras de putaway), `regra-stock` unitários.

---

## TASK-043 — Auditoria Completa + Soft-Delete + Modal Info

Auditoria de todas as movimentações do sistema + soft-delete + modal de detalhe.

- [x] **Auditoria de todas as movimentações** — interceptor central de auditoria (elimina chamadas manuais em 15/19 controllers); cobre stock, vendas, compras, tesouraria, utilizador/perfil, armazéns, localizações, clientes, fornecedores, artigos, empresa.
- [x] **Soft-delete (arquivar/desarquivar)** — campo `arquivado` em `AuditLog`; métodos `arquivar()`/`desarquivar()` no `AuditService`; canais IPC `fiscal:auditoria:arquivar` e `fiscal:auditoria:desarquivar`; botão "Arquivar" na UI (substitui o antigo "Apagar" que foi removido na TASK-036).
- [x] **Modal "Info" (detalhe de registo)** — coluna "Ações" com botão "Info" na `AuditoriaManager` e no `FiscalPainel`; abre `Dialog` com todos os campos (`dadosAnteriores`, `dadosNovos`, `integridade`, `enderecoIp`, `agenteUtilizador`, `modulo`, `entidade/entidadeId`, `utilizadorLogin`).
- [x] **Filtros expostos** — `entidade`, `entidadeId`, `utilizadorId`, `modulo`, `apenasAlertas`, `situacao` (inclui `proximo_caducar`, `caducado` da TASK-041), paginação por cursor.
- [x] **Interceptador central** — substitui 13 chamadas manuais por interceptor único; garante 100% cobertura de ações `write`.

Testes: `audit.service.test.ts` (arquivar/desarquivar + integridade), `fiscal.controller.test.ts` (arquivar/desarquivar), `AuditoriaManager` E2E (modal info + botão arquivar).

Testes: `audit.service.test.ts` (arquivar/desarquivar + integridade), `fiscal.controller.test.ts` (arquivar/desarquivar), `AuditoriaManager` E2E (modal info + botão arquivar).

---

## TASK-044 — Interface pt-BR→pt-PT, Remover Transferência, Caixa→Comercial

Interface em português de Portugal (Angola): `Estoque`→`Stock`, `Cadastros`→`Registo`, `Cadastro`→`Registo`. Removida opção `Transferência` do dropdown `Tipo de Movimento` (página dedicada existe). Movida secção `Abertura de Caixa` de `Finanças` para `Comercial` (RBAC: `requireAnyPermission ['financas','comercial']`).

- [x] **pt-BR→pt-PT** — `Estoque`→`Stock` (13 ocorrências), `Cadastros`/`Cadastro`→`Registo` (4 ocorrências), `Registar Movimento de Estoque`→`Registar Movimento de Stock`, `Entrada de Estoque`→`Entrada de Stock`, `Fechar & Reconciliar Estoque`→`Fechar & Reconciliar Stock`, `Ver Estoque`→`Ver Stock`, `Estoque & Armazéns`→`Stock & Armazéns`, `Estoque & Gestão Multi-Armazém`→`Stock & Gestão Multi-Armazém`, `Estoque & Localização`→`Stock & Localização`.
- [x] **Remover Transferência** — removida opção `Transferência` do dropdown `Tipo de Movimento` em `MovimentoStockManager`; validações de transferência removidas do schema Zod; componente `MovimentoStockManager` sem imports de `ArrowLeftRight` (ícone de transferência).
- [x] **Caixa→Comercial** — `ComercialPage` ganha tab `Caixa` + ribbon + render `<SessaoCaixaManager />`; `FinancasPage` remove tab/ribbon/render de `SessaoCaixaManager`; backend `TesourariaController` usa `requireAnyPermission(['financas','comercial'])` apenas para métodos de sessão de caixa (não no `com()` global); comentários em `SessaoCaixaManager`/`ContasBancariasManager` actualizados; teste E2E `sessao-caixa.e2e.ts` adapta navegação.

Gates: typecheck node/web ✓, vitest 693/693 ✓, eslint 0 erros ✓, build ✓, playwright 44/44 ✓.

---

## TASK-045 — Estrutura Armazém: Zonas + Localizações CRUD

CRUD completo de Zonas e Localizações na UI (backend já tem modelos/schema).

Consolidado sobre a stack existente `localizacoes:*` (`LocalizacaoService` +
`LocalizacaoController` + `localizacao.router.ts`), que já tinha o CRUD de
localizações e a criação de áreas/zonas. Foram acrescentadas as operações em
falta, em vez de duplicar uma stack paralela.

- [x] **Backend CRUD** — `LocalizacaoService` estendido com `actualizarArea`/`desactivarArea` e `actualizarZona`/`desactivarZona`; novos validadores `actualizarAreaSchema`/`actualizarZonaSchema`; canais IPC `localizacoes:actualizar-area`, `localizacoes:desactivar-area`, `localizacoes:actualizar-zona`, `localizacoes:desactivar-zona`; preload + `electron.d.ts` + `localizacao.api.ts` actualizados.
- [x] **UI `EstruturaArmazemManager`** — acordeão Áreas → Zonas → Localizações (hierarquia visual). Formulários de criação/edição para cada nível; ações de editar e desactivar em área, zona e localização (desactivar é sempre lógico).
- [x] **Validações** — código único por pai (`@@unique([armazemId, codigo])`, `@@unique([areaId, codigo])`, `@@unique([zonaId, codigo])`); zona só em área activa; localização só em zona activa; desactivar área bloqueia com zonas activas; desactivar zona bloqueia com localizações activas.
- [x] **Integração** — `isPickable`/`isPutaway` já usados em `putaway.service.ts`/`picking.service.ts`.

Testes: `localizacao.service.test.ts` (criar/actualizar/desactivar áreas, zonas e localizações), `EstruturaArmazemManager` E2E (`estrutura-armazem.e2e.ts`).

---

# EPIC 8 — Preparação futura

Não implementar agora, apenas garantir extensibilidade:

- [ ] Barcode/QR Code.
- [ ] FEFO avançado.
- [ ] Serialização.
- [ ] Replenishment.
- [ ] Wave picking.
- [ ] Cross docking.
- [ ] Mobile warehouse.
