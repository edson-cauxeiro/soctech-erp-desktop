# EPIC 7 — Hardening: Auditoria, Concorrência e Performance

- **Data**: 2026-10-06
- **Estado**: desenhado, aprovado, em implementação
- **Escopo**: TASK-036 (Auditoria), TASK-037 (Concorrência), TASK-038 (Performance)
- **Decisões estruturais (brainstorm, aprovadas pelo utilizador)**:
  1. **Caminho de escrita de stock canónico = o legado** (`stock.service.ts`, o que a UI usa). Hardening, não rewrite. O novo `MovimentoStockService` mantém-se como está e partilha com o legado a sequência atómica de números.
  2. **Âmbito da auditoria**: stock (RF06) + login/logout. Não se toca em vendas/compras/tesouraria para rasto.
  3. **Atomicidade do stock legado**: `pg_advisory_xact_lock` por (artigo, armazém) + validação do saldo **dentro** da transacção. Sem escrita extra em `estoques` (a UI continua a calcular saldo por SUM do livro-razão), sem triggers na BD.

---

## TASK-036 — Auditoria

### Objectivo
Que cada operação de stock e cada login/logout deixem rasto com **Utilizador / Data / Operação / Origem / Destino**, num log **append-only** de facto.

### Estado actual (factos)
- `AuditLog` (`prisma/schema.prisma:1347`) está desenhado (append-only declarado, SHA-256, índices) mas **só** é alimentado por fiscal/relatórios (`fiscal.controller.ts`, `relatorios.controller.ts`).
- `AuthService.login` apenas actualiza `ultimoAcessoEm` (`auth.service.ts:107`); nunca grava `audit_logs`.
- Os movimentos de stock gravam `criadoPorId` **nunca** no caminho da UI (`stock.service.ts:284-296`); o renderer não envia utilizador (`MovimentoStockManager.tsx:252`). O caminho novo e o `putaway` gravam o campo, mas o `putaway` envia `null` fixo.
- `AuditService.eliminar`/`limpar` fazem `deleteMany` (`audit.service.ts:258,273`) — contradiz o append-only declarado; expostos por `fiscal:auditoria:eliminar` (`fiscal.router.ts:49`).

### Desenho
1. **Append-only obrigatório**:
   - `AuditService.eliminar`/`limpar` passam a lançar `BusinessRuleError('O log de auditoria é append-only...')`; o contrato de tipos mantém-se (sem break de compilação) mas os efeitos desaparecem.
   - Remover os canais IPC `fiscal:auditoria:eliminar`/`limpar` (`fiscal.router.ts`) e os handlers correspondentes de `fiscal.controller.ts`.
   - Verificar a UI de auditoria fiscal; se existir botão de apagar/limpar, removê-lo (leitura fica intacta). **Follow-up de UI mínimo, necessário à coerência.**
2. **Login/logout auditados**: `AuthController.login` (após `service.login` com sucesso) e `AuthController.logout` chamam `auditService.registar({ acao: 'login'|'logout', entidade: 'Utilizador', entidadeId: session.id, modulo: 'auth', empresaId, utilizadorId, severidade: 'info' })`. Best-effort (o serviço nunca lança).
3. **`criadoPorId` + `documentoTipo/documentoId` no legado**: os métodos de escrita de `StockService` passam a aceitar um parâmetro de contexto `opcoes?: { criadoPorId?: string | null; documentoTipo?: string; documentoId?: string }` (ou equivalente tipado). O **controller** sintetiza `criadoPorId = session.id` e despreza qualquer valor vindo do cliente. Métodos afectados:
   - `createMovimento` (grava `criadoPorId`).
   - `transferenciaStock` (propaga para `createMovimento`).
   - `processarBaixaVenda` (propaga por linha).
   - `criarInventario` e `fecharInventario` — o autor mestra-se nos **movimentos de ajuste** gerados em `fecharInventario`; no documento `InventarioContagem` não há coluna de autor (não se adiciona — fora de escopo).
   - `putaway.service.executarPutaway` grava `criadoPorId` do contexto (via `PutawayController`/router que tem a sessão).
4. **Rasto das operações de stock no `AuditLog`**: após sucesso de `createMovimento`, `transferencia`, `baixaVenda` e `fecharInventario`, o `StockController` chama `auditService.registarOperacao({ acao: 'criar', entidade: 'MovimentoStock', modulo: 'estoque', dadosNovos: { numero, tipo, artigoId, quantidade, armazemOrigemId, armazemDestinoId, documentoOrigem }, ...contexto })`. `dadosNovos` serializado canonicamente pelo serviço (sem segredos).

### Testes
- Novo `src/main/services/audit.service.test.ts`: `registar` grava com hash verificável; `verificarIntegridade` identifica adulteração; `eliminar`/`limpar` lançam (append-only).
- `auth.controller.test.ts` (novo): login/logout auditam com o utilizador da sessão.
- `stock.controller.test.ts` (novo): `criadoPorId` injectado da sessão (nunca do payload) e audit chamado com `entidade: 'MovimentoStock'`.
- Manter os 663 testes verdes.

---

## TASK-037 — Concorrência

### Objectivo
Eliminar as corridas do caminho legado: número de movimento, saldo insuficiente (double update), `putaway` não transaccionado; provar a reserva concorrente.

### Estado actual (factos)
- Número: `stock.service.ts:74` e `movimento-stock.service.ts:98` fazem `count()+1` fora de contexto seguro; o comentário de `movimento-stock.service.ts:90-97` remete esta correcção para a TASK-037; `putaway` usa número aleatório (`putaway.service.ts:178`). Os dois caminhos podem colidir (MOV-2026/… gerado por counts independentes).
- Saldo: `stock.service.createMovimento` valida saldo **antes** da transacção (`stock.service.ts:257` vs `:282`) — check-then-act com corrida; dentro da transacção `getStockTotalArtigo` usa `this.prisma` (escape de client, `stock.service.ts:306`).
- `putaway.executarPick`/`executarPutaway`: leitura → `estoque.update` absoluto → movimento em chamada separada (`putaway.service.ts:148-195`) — sem transacção.
- Reserva: `EstoqueRepository.reserve/release` já são atómicos (`inventory.repository.ts:482-556`), o único padrão correcto do código.

### Desenho
1. **Modelo `Sequencia` + `sequencia.service.ts`**:
   - `prisma/schema.prisma`: `model Sequencia { id String @id @default(cuid()); escopo String; ano Int; valor Int @default(0); @@unique([escopo, ano]) }` (nome trabalhado na migração, ex. `sequencias`).
   - `sequencia.service.proximoNumero(tx, { escopo, ano?, prefixo, padSize })`: `updateMany({ where: { escopo, ano }, data: { valor: { increment: 1 } } })` → se `count === 0` cria a linha; depois `findFirstOrThrow` e devolve `prefixo-ANAL/XXXXX`. Padrão exacto de `DocumentoNumeroService.reservarNumero` (`documento-numero.service.ts:17-38`).
   - `stock.service`, `movimento-stock.service` e `putaway.service` passam a usar a sequência (escopos `MOV`/`PUTAWAY`). As linhas são criadas dentro do `$transaction` (a sequência vive na mesma tx).
2. **Validação de saldo in-tx + advisory lock**:
   - Em `createMovimento`, quando `tipo` ∈ {saida, consumo_producao, transferencia}: abrir a `$transaction`, adquirir `pg_advisory_xact_lock` para o(s) armazém(éns) envolvidos via `tx.$queryRaw` — `SELECT pg_advisory_xact_lock(hash(artigoId+armazemId))` (ou dois argumentos int8 computados estáveis). Na transferência trancar origem e destino **por ordem lexicográfica de armazémId** para evitar deadlocks.
   - Só depois de trancado: ler saldo (variante `tx` de `getStockArtigoArmazem`) e validar; criar movimento; recalcular PMP (variante `tx` de `getStockTotalArtigo` — corrige o escape actual).
   - O lock é **escopo do artigo+armazém**, não global: movimentos de artigos/armazéns diferentes continuam concorrentes.
   - Alternativa de implementação se `$queryRaw` com lock for inviável no adapter pg: «advisory lock» via `pg_try_advisory_xact_lock`+espera, mas documenta-se e usa-se o padrão directo.
3. **`putaway` transaccionado**: `executarPutaway` envolve (actualização da posição `estoque.update` + criação do movimento) numa `$transaction`; número vindo da sequência; `criadoPorId` do contexto. Idem revisão na operação deslocada. Não se mexe no `last-writer-wins` da localização (risco residual documentado, fora de escopo).
4. **Reserva concorrente**: sem alteração de código (`reserve` já é atómico); cobre-se com testes de corrida determinísticos.

### Testes
- `sequencia.service.test.ts` (novo): primeira linha cria; incremento atómico; formato do número.
- `stock.service.test.ts` (complementos): duas saídas concorrentes cujo total excede o saldo → exactamente uma passa; lock adquirido antes da validação (mock sequencia `$queryRaw`); número sem colisões entre chamadas.
- `movimento-stock.service.test.ts`: `gerarNumero` agora usa a sequência (mock validado).
- `putaway.service.test.ts`: chamadas dentro de `$transaction` (mock) e rollback parcial.

---

## TASK-038 — Performance

### Objectivo
Indexar os filtros usados, paginar de verdade o que carrega tudo e eliminar N+1 no caminho legado de stock sem mudar contratos IPC.

### Desenho
1. **Índices** (migração):
   - `movimentos_stock`: `@@index([criadoPorId])`, `@@index([documentoTipo, documentoId])` (filtros já suportados por `stock-movement.repository.ts:252`).
   - `estoques`: `@@index([estado])`, `@@index([artigoId, armazemId])` (composto começa a servir leituras por (artigo, armazém)).
   - `prisma validate` + `prisma migrate dev --name epic7_indices_sequencia`.
2. **Paginação**:
   - `listInventarios`: aceita `{ skip?, take? }` (schema Zod novo/reenvio), default actual (sem filtros = tudo) para não partir o `InventarioManager`.
   - `getEstadoStock`: mover `search` para o `where` do `artigo.findMany` (`codigo`/`descricao` `contains`); aplicar `skip/take` na query de artigos (os filtros `apenasAlertas`/`situacao` continuam em memória por dependerem do saldo calculado — documentado).
3. **Evitar N+1**:
   - `criarInventario`: substituir `data.linhas.map(getStockArtigoArmazem)` (2 agregados/linha) por um `movimentoStock.groupBy` único sobre os artigoIds das linhas (padrão de `getEstadoStock`, `stock.service.ts:564-583`).
   - `processarBaixaVenda`: preload `artigo.findMany({ where: { id: { in: ids } } })`; criar todos os movimentos numa **única** `$transaction` com validação de saldo in-tx por artigo (mantém semantics: serviços continuam a não dar baixa).
   - `fecharInventario`: número via `sequenciaService.proximoNumero(tx, ...)` por linha (sem `count` por linha).
   - `compras.service`/`guia-entrega.service`: onde há `artigo.findUnique` por linha, substituir por `findMany where in` (leitura só; não muda transacções).
4. **Fora de escopo (follow-up)**: N+1 no renderer (FaturaManager/GuiaEntrega/MovimentoStockManager — 1 IPC por linha) e endpooint batch `stock:saldo-artigos`; SAF-T (query pesada, mas de leitura de período); triggers na BD.

### Testes
- Testes unitários para os novos caminhos de paginação do inventário e `getEstadoStock` com `search` (via mocks).
- Confirmar `listInventarios` default e `getEstadoStock` não quebram o renderer (E2E read-only existentes continuam verdes).

---

## Verificação e gates
- `npm run typecheck` · `npm run lint` (alvo: 0 erros, sem warnings novos) · `npx vitest run` (base actual: 663) · `npm run build` · `npx playwright test` (44 actuais + nenhum novo; read-only).
- Migração aplicada no dev DB (`prisma migrate dev`), validada com `prisma validate`. Dev DB sintetiza artigos/movimentos depois de novo schema.

## Implementação (ordem)
1. TASK-036 (auditoria)
2. TASK-037 (concorrência; **migração da `Sequencia`**)
3. TASK-038 (performance; **migração dos índices** depois de validados a frio)
4. Gates finais + `03-TASKS.md`.

Cada tarefa fecha com os seus testes unitários verdes antes de passar à seguinte.

## Follow-up (fora deste EPIC)
- Batch IPC de saldos para o renderer (eliminar 1 IPC/linha nas faturas/guias/movimentos).
- Reavaliar divergência `estoques` vs livro-razão no caminho legado (decisão consciente: endurecer sem escrever `estoques`).
- `empresaId` em `MovimentoStock`/`Estoque` para auditoria/filtros por empresa (requer migração com backfill).