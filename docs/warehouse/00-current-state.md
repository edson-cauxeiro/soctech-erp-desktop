# 00 — Estado Actual do Módulo de Armazéns e Stock

> Entregável da **Fase 0** de `docs/armazens-docs/02-PLANO-DE-IMPLEMENTACAO.md`.
> Auditoria realizada contra o código e a base de dados em 2026-10-05.
> Este documento existe para que as fases seguintes não voltem a levantar as mesmas
> perguntas. Decisões aqui registradas sãoVinculativas salvo revisão explícita.

## 1. Regra de evolução

Não se cria um projecto novo. Evolui-se o schema, os serviços, os canais IPC e os
componentes React já existentes, respeitando a nomenclatura portuguesa do projecto
(embora `docs/armazens-docs/05-MODELO-DE-DADOS-ALVO.md` desenhe o modelo lógico em
inglês — ver §6).

## 2. Stack confirmada

Electron 39 + electron-vite, React 19, TypeScript 5.9, Tailwind 4, Zod 3, Zustand 5,
Prisma 7 (driver `@prisma/adapter-pg`), PostgreSQL. Testes com Vitest, E2E com Playwright.

## 3. Arquitectura actual (processo Main)

Fluxo real, verificado no código:

```text
renderer → window.api.<dominio>.<accao>        src/preload/index.ts
        → ipcMain.handle('<modulo>:<accao>')   src/main/routers/<modulo>.router.ts
        → <Modulo>Controller                   src/main/controllers/<modulo>.controller.ts
        → <Modulo>Service                      src/main/services/<modulo>.service.ts
        → prisma.<model>                       src/main/database/prisma.ts
        → PostgreSQL
```

Observações que condicionam o trabalho:

| Ponto | Estado actual | Impacto |
|---|---|---|
| **Camada de repository** | `src/main/repositories/` e `src/main/models/` existem mas estão **vazias**. Nenhum serviço os usa; todos falam com o Prisma directamente. | TASK-013 a 016 (plano) partem de zero. Não introduzir repositories sem necessidade: o padrão real é service→prisma. |
| **Validação Zod** | Executada **dentro do service** (`schema.parse(rawInput)` em `stock.service.ts:232`), não no router. | Seguir o mesmo padrão; não introduzir validação no router sem justificação. |
| **Serviços** | Classes com injecção de `PrismaClient` e exportação singleton (`export const stockService = new StockService()`), `src/main/services/armazem.service.ts:416`. | Testáveis com um Prisma falso. Manter. |
| **Transacções** | `this.prisma.$transaction(async (tx) => …)`, `stock.service.ts:282`. | Atenção: nem todas as operações respeitam o limite transaccional (ver §5.4). |
| **Erros** | `AppError` e derivadas em `src/main/utils/errors.ts`: `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`. | Reutilizar; não criar hierarquia nova. |
| **RBAC** | `requirePermission(session, modulo, acao)` em `src/main/middlewares/rbac.middleware.ts:106`. Catálogo em `src/main/constants/permissions.constants.ts`, espelhado em `src/renderer/src/config/permissions.ts`. | **`stock.router.ts` e `armazem.router.ts` não usam RBAC.** Ver §5.6. |
| **Renderer** | `api/<modulo>.api.ts` → `components/erp/<X>Manager.tsx` → `pages/<modulo>.tsx` com separadores via `ErpShell` (`ribbon` + `activeTab`). | `Estoque` tem hoje 5 separadores: `artigo`, `armazem`, `movimento`, `inventario`, `alerta` (`src/renderer/src/pages/estoque.tsx:16`). |
| **Comandos** | `npm test`, `npm run typecheck` (`node` + `web`), `npm run db:migrate`, `npm run db:generate`, `npm run db:reset`. | `npm run db:reset` **destrói os dados** — não usar como atalho. |

## 4. Inventário do schema actual

### 4.1 Entidades de armazém

`Armazem` → tabela `armazens` (`prisma/schema.prisma:629`)

```text
id, codigo @unique, designacao, tipo?, localizacao?,
isDefaultVendas, isDefaultCompras, ativo, createdAt, updatedAt
```

Não tem áreas, zonas nem localizações. Não tem `empresaId`.

### 4.2 Entidades de produto

`Artigo` → `artigos` (`:249`). Campos de stock: `stockMinimo`, `stockMaximo`,
`pontoEncomenda`, `controloLote`, `armazemPadraoId`, `precoCustoMedio` (PMP).

### 4.3 Stock

**Não existe entidade de stock.** O saldo é **derivado em cada consulta**, por
agregação de `MovimentoStock`:

- `getStockArtigoArmazem` — `stock.service.ts:99`
- `getStockTotalArtigo` — `stock.service.ts:128`
- `getEstadoStock` — `stock.service.ts:535`

As regras que definem o cálculo (`:31-41`):

```text
TIPOS_ENTRADA      = ['entrada', 'ajuste', 'transferencia']
TIPOS_SAIDA        = ['saida', 'consumo_producao', 'ajuste', 'transferencia']
TIPOS_ENTRADA_TOTAL= ['entrada', 'ajuste']              (transferências são neutras)
TIPOS_SAIDA_TOTAL  = ['saida', 'consumo_producao', 'ajuste']
```

`InventarioContagem` + `LinhaInventarioContagem` (`:816`) são **contagem cíclica**, não
saldo. Não confundir os dois conceitos.

### 4.4 Movimentos

`MovimentoStock` → `movimentos_stock` (`:660`). **Uma linha por item**, sem cabeçalho:

```text
id, numero @unique, tipo, data, artigoId, quantidade,
armazemOrigemId?, armazemDestinoId?, lote?, documentoOrigem, custoUnitario
```

Tipos: `entrada`, `saida`, `transferencia`, `ajuste`, `consumo_producao`.

### 4.5 Lotes

`lote` é um `String?` livre em quatro tabelas: `movimentos_stock`, `linhas_guia_recepcao`,
`linhas_guia_entrega`, `linhas_inventario_contagem`. A única data de validade é
`validade` em `LinhaGuiaRecepcao` (`:761`), **desligada do movimento**. Não existe entidade
`Lote`, logo **FEFO é impossível**.

### 4.6 Relações com armazém

| Tabela | Campo | Comportamento |
|---|---|---|
| `utilizadores` | `armazem_default_id` | FK real → `armazens` |
| `guias_entrega` | `armazem_expedicao_id` | FK real, obrigatório |
| `guias_recepcao` | `armazem_destino_id` | FK real, obrigatório |
| `encomendas_compra` | `armazem_destino_id` | FK real, opcional |
| `inventarios_contagem` | `armazem_id` | FK real, obrigatório |
| `movimentos_stock` | `armazem_origem_id` / `armazem_destino_id` | FK real, `ON DELETE SET NULL` |
| `artigos` | `armazem_padrao_id` | **Sem FK** — ver §5.2 |

## 5. Incompatibilidades detectadas

### 5.1 `Armazem` não tem `empresaId`

Todas as restantes entidades multi-empresa o têm: `ContaBancaria` (`:871`),
`MovimentoTesouraria` (`:923`), `SessaoCaixa` (`:976`), `FaturaVenda` (`:389`).
`armazens` é a excepção, pelo que um armazém é visível a todas as empresas. É uma fuga de
isolamento, não apenas uma ausência cosmética.

### 5.2 `artigos.armazem_padrao_id` não tem FK

A coluna é criada em
`prisma/migrations/20260831211206_my_first_migration/migration.sql:116` e nunca recebe
`ALTER TABLE … ADD CONSTRAINT`. Referências órfãs são portanto possíveis e silenciosas.

### 5.3 O saldo é derivado, não materializado

É a incompatibilidade central. Enquanto o saldo for uma `SUM` sobre movimentos:

- não há onde guardar `quantidadeReservada`;
- não há onde apontar uma `localizacaoId`;
- não há onde controlar capacidade;
- putaway e picking não têm sobre que decidir.

Introduzir uma tabela de saldo **é uma alteração de comportamento**, não um acréscimo.
Os serviços passam a ler o saldo materializado em vez de o recalcular.

### 5.4 A baixa de venda não é atómica

`processarBaixaVenda` (`stock.service.ts:360-382`) percorre as linhas e chama
`createMovimento` uma vez por linha — cada chamada abre a sua **própria** transacção. Uma
falha a meio deixa a factura parcialmente baixada, violando a regra de transacção de
`04-GUIA-PARA-AGENTES.md:75`.

### 5.5 A numeração de movimentos não é atómica

`generateNumeroMovimento` (`stock.service.ts:74-79`) faz `count() + 1`. Duas chamadas
concorrentes obtêm o mesmo número e colidem com o `@unique` de `numero`.

### 5.6 RBAC não aplicado ao stock nem aos armazéns

`stock.router.ts` e `armazem.router.ts` invocam os controladores directamente, sem
`requirePermission`. O catálogo RBAC já prevê o módulo `estoque`
(`permissions.constants.ts:13`), apenas não é usado nestes dois routers.

### 5.7 Colisão de nomes

`InventarioContagem` ocupa o termo "inventário". A nova tabela de saldo **não** se pode
chamar `Inventario` sem gerar confusão com a contagem cíclica.

### 5.8 Sem utilizador registado nos movimentos

`MovimentoStock` não tem `criadoPorId`. A auditoria de stock (TASK-036) não tem onde se
ligar ao actor. **Resolvido na Fase 1:** a coluna e a FK para `utilizadores` foram
acrescentadas.

### 5.9 Índice de tesouraria órfão, e uma FK reescrita

Divergência **anterior a este trabalho**: a migration
`20260929160000_tesouraria_totais_sessao` criou
`movimentos_tesouraria_meio_pagamento_idx`, mas `schema.prisma` nunca declarou o
índice correspondente. Em contrapartida, `contas_bancarias.empresa_id` está com
`ON DELETE NO ACTION` na base de dados e o schema pede `RESTRICT` — em PostgreSQL
as duas behave igual numa FK não diferível.

O `prisma migrate dev` propôs DROP + ADD para ambos. Ambas as instruções foram
**retiradas** das migrations de armazéns, por serem alheias a este trabalho e por
uma delas ser destrutiva. A correcção pertence a uma alteração própria da
tesouraria: ou o schema passa a declarar o índice, ou a migration que o criou é
revista. Enquanto tal não acontecer, o `migrate dev` voltará a assinalar esta
divergência.

### 5.10 Não há stores Zustand

O plano prevê "identificar stores Zustand" e o `package.json` inclui `zustand`, mas
não existe nenhuma store no projecto: o estado vive dentro de cada componente
`Manager.tsx`. Não há padrão a reutilizar para estado de armazém.

### 5.11 `npm run lint` nunca teve configuração

O `package.json` declara `lint: eslint --cache .` e instala todos os plugins
necessários (`@electron-toolkit/eslint-config-ts`, `eslint-plugin-react`,
`react-hooks`, `react-refresh`), mas **não existe `eslint.config.*` em nenhum
ponto do histórico do repositório**. O comando falhava antes de analisar o
primeiro ficheiro:

```text
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

Não era uma regressão: nunca funcionou. Corrigido na Fase 1 — ver §11.

### 5.12 A unicidade de `armazem.codigo` não pode ser composta já

`armazens.codigo` tem um `@unique` **global**, herdado da migration inicial. A
auditoria apontava `UNIQUE (empresaId, codigo)`, como em `ContaBancaria`. A
simples troca não é segura, e por uma razão que só aparece quando se executa
SQL contra a base:

1. `createArmazemSchema` (`src/main/validators/armazem.validator.ts`) **não aceita
   `empresaId`**, e `armazem.service.ts:212` cria o armazém sem ele. Todo o
   armazém criado pela aplicação fica portanto com `empresa_id IS NULL`.
2. Em PostgreSQL, `NULL` é distinto de `NULL` numa restrição `UNIQUE`. Uma
   restrição composta admite várias linhas com `empresa_id IS NULL` e o mesmo
   `codigo`.

Verificado na base: com apenas o índice composto, três linhas com
`codigo = 'DUP-TEST'` e `empresa_id IS NULL` são aceites. Passar só ao composto
teria **perdido** a unicidade do código justamente para os armazéns criados pela
aplicação.

Tornar `empresaId` NOT NULL resolveria, mas parte a feature de criar armazém em
runtime (inserção sem o campo) e a correcção correcta —exigir `empresaId` no
validator e no service, como `contas-bancarias.service.ts:249-254` faz— é trabalho
de Fase 2, fora do âmbito desta fase.

Resolvido com as duas restrições em simultâneo (ver §11): o `@unique` global
fica marcado como temporário e o composto é criado já, para o passo seguinte ser
um `DROP` e não uma reescrita.

## 6. Decisões tomadas

### D1 — Nomenclatura em português

Os documentos de especificação desenham o modelo em inglês (`Warehouse`,
`WarehouseLocation`, `Lot`, `StorageClass`). O projecto é integralmente português
(`armazens`, `artigos`, `movimentos_stock`, enums `TipoArmazem`, `EstadoArtigo`,
`movimentos_tesouraria` com colunas `snake_case` via `@map`). Introduzir duas línguas no
mesmo esquema tornaria cada consulta um exercício de tradução.

**Decisão:** manter português. `Warehouse` → `Armazem` (já existe);
`WarehouseArea` → `ArmazemArea`; `WarehouseZone` → `ArmazemZona`;
`WarehouseLocation` → `ArmazemLocalizacao`; `StorageClass` → `ClasseArmazenamento`;
`Lot` → `Lote`; `Inventory` → `Estoque`; `PutawayRule` → `RegraPutaway`;
`PickingRule` → `RegraPicking`.

`Putaway` e `Picking` mantêm-se em inglês: são termos técnicos amplamente reconhecidos no
sector e pesquisáveis, e não têm tradução portuguesa stabilizada.

### D2 — O saldo passa a ser materializado

`Estoque` é criada como saldo materializado e passa a ser a fonte da verdade, mantendo
`movimento_stock` como livro-razão (ledger) imutável. O saldo é mantido **na mesma
transacção** que o movimento que o justifica.

Consequência: `getStockArtigoArmazem` e `getStockTotalArtigo` passam a ler `Estoque`. As
regras de tipo (D3) continuam válidas porque o backfill as reproduz exactamente.

### D3 — Não partir `MovimentoStock` em cabeçalho + linhas

A especificação (§9) propõe `StockMovement` + `StockMovementLine`. **Desvio aprovado:** a
linha plana actual já transporta origem, destino, lote e quantidade — tudo o que uma
linha de movimento precisa — e uma linha de cabeçalho não aportaria nenhuma função real,
porque hoje nenhum documento multi-linha é gerado por uma única operação de stock.

Partir a tabela obrigaria a reescrever todas as agregações de `stock.service.ts`, de
`armazem.service.ts:368-376` e dos relatórios, sem ganho funcional, sobre um sistema com
dados em produção.

Em vez disso, os campos que o cabeçalho habría de adicionar são acrescentados à linha
plana: `criadoPorId`, `documentoTipo`, `documentoId`, `localizacaoOrigemId`,
`localizacaoDestinoId`, `loteId`. Isto desbloqueia a auditoria (TASK-036) e a rastreabilidade
por documento. A divisão em cabeçalho/linhas permanece disponível como tarefa futura se
surgir um requisito real.

### D4 — Um armazém «geral» por omissão

Uma localização pode não existir (`localizacaoId` nulo) para não partir o que já funciona.
As consultas de stock por localização passam a suportar ambos os casos. A exigência de
localização física fica como tarefa futura (EPIC 8), não é imposta agora.

## 7. Mapa actual → alvo

| Alvo lógico | Antes | Decisão | Como |
|---|---|---|---|
| `Warehouse` | `Armazem` | evoluir | + `empresaId`, + `descricao`; unicidade passa a `(empresaId, codigo)` |
| `WarehouseArea` | — | criar | `armazens_areas`, unique `(armazemId, codigo)` |
| `WarehouseZone` | — | criar | `armazens_zonas`, unique `(areaId, codigo)` |
| `WarehouseLocation` | — | criar | `armazens_localizacoes`, `parentId` auto-relação, capacidade, flags |
| `StorageClass` | — | criar | `classes_armazenamento`, ligada a `Artigo` |
| `Inventory` | derivado | **criar** | `estoques`, saldo materializado por localização e lote |
| `Lot` | `lote String?` | criar | `lotes`, único `(artigoId, numeroLote)`; `movimentos_stock.loteId` |
| `Serial` | — | adiado | EPIC 8 (preparação apenas) |
| `StockMovement` + `Line` | `MovimentoStock` | evoluir | ver D3 — sem divisão |
| `PutawayRule` | — | criar | `regras_putaway` |
| `PickingRule` | — | criar | `regras_picking` |

## 8. Estratégia de migração

Três migrações, cada uma revisto isoladamente:

| # | Conteúdo | Risco |
|---|---|---|
| **M1** | Alargamento de `Armazem`, `Artigo`; criação de `ArmazemArea`, `ArmazemZona`, `ArmazemLocalizacao`, `ClasseArmazenamento`. | Nulo — só acréscimo. |
| **M2** | Criação de `Lote`, `Estoque`, `RegraPutaway`, `RegraPicking`; alargamento de `MovimentoStock` e do enum. | Nulo — só acréscimo. |
| **M3** | Backfill: `empresaId`, criação de lotes a partir do texto, reconstrução de `estoques` a partir do livro-razão. | Escreve dados, **idempotente**. |

### 8.1 O que cada migration fez

| # | Migration | Conteúdo |
|---|---|---|
| **M1** | `20261005141007_armazens_estrutura_area_zona_localizacao_classe` | acréscimo de `descricao` e `empresa_id` em `armazens`; `classe_armazenamento_id` e a FK em falta de `armazem_padrao_id` em `artigos`; criação de `armazens_areas`, `armazens_zonas`, `armazens_localizacoes`, `classes_armazenamento` |
| **M2** | `20261005141138_armazens_stock_granularidade_lote_estoque_regras` | criação de `lotes`, `estoques`, `regras_putaway`, `regras_picking`; colunas `lote_id`, `localizacao_origem_id`, `localizacao_destino_id`, `documento_tipo`, `documento_id`, `criado_por_id` em `movimentos_stock`; três valores novos no enum `TipoMovimentoStock`; CHECK constraints e índice único de posição |
| **M3** | `20261005150000_armazens_backfill_stock` | backfill de `armazens.empresa_id`, de `lotes` a partir do texto livre, e reconstrução de `estoques` a partir do livro-razão, com verificação que aborta a migration em caso de divergência |

### 8.2 Backfill de referência

O conteúdo actual da base de dados foi usado como caso de teste da reconstrução:

```text
armazens:      ARM-01 Geral, ARM-02 Vendas
empresa_config: 1 registo
artigos:       2
movimentos:    7
```

Saldos esperados após o backfill, pela aritmética de `TIPOS_*` (D2/D3):

| Artigo | ARM-01 (Geral) | ARM-02 (Vendas) |
|---|---|---|
| `cmumz8ito…` | `+50 −5` = **45** | `+5 −1` = **4** |
| `cmumz5z9s…` | `+20 −5 +5` = **20** | `+5 −2` = **3** |

Resultado obtido, idêntico ao esperado:

| Artigo | ARM-01 | ARM-02 |
|---|---|---|
| ART-0002 | 45 | 4 |
| ART-0001 | 20 | 3 |

### 8.3 Verificação contínua

`prisma/verificar_stock.sql` Volta a confirmar, a qualquer momento, que `estoques`
coincide com o livro-razão e que as constraints de saldo se respeitam:

```bash
docker exec -i doraerp_postgres psql -U doraerp_user -d doraerp \
  -v ON_ERROR_STOP=1 < prisma/verificar_stock.sql
```

Sai com código diferente de zero e lista as posições divergentes se algo estiver
errado. Convém corrê-lo depois de qualquer alteração futura à aritmética de stock.

A verificação é escrita de propósito de forma **diferente** da migration que
construiu `estoques`: percorre os movimentos numa só passagem, com somas
condicionais, em vez de separar entradas e saídas em dois ramos. Escrever ambas com
a mesma expressão não teria valor nenhum — apenas confirmaria que a inserção é
consistente consigo própria. Foi exactamente esse o defeito da primeira versão
desta migration, que ignorava as saídas e foi aprovada por uma verificação
escrita à sua imagem.

## 9. Riscos e como são tratados

| Risco | Tratamento |
|---|---|
| Duplicar o stock durante o backfill | `estoques` é reconstruída por agregação, não por incremento a partir de um total pré-calculado; a migração corre dentro de uma transacção e é idempotente. |
| Quebrar o cálculo actual de stock | Os testes existentes de `stock.service` têm de continuar verdes; a semântica de D3 é reproduzida linha a linha. |
| Afastar stock sem lote ou sem localização | `localizacaoId` e `loteId` são opcionais em `estoques` (D4). |
| Multi-empresa | `armazens.empresaId` com FK real;Constraint única passa a ser `(empresaId, codigo)`, preservando a unicidade actual com uma única empresa. |
| Perder dados | Nenhuma coluna existente é eliminada. Só acréscimos e backfills. |

## 10. Fora do escopo desta fase

Nada de alterações de UI, services, repositories ou canais IPC. A Fase 1 entrega apenas
schema + migrations + testes de verificação. Repositório vazio, RBAC ausente no stock,
numeração não atómica e baixa de venda não atómica (§5.4 a §5.6) ficam registados para
as fases seguintes.
## 11. Duas dependências que ficaram em aberto

Duas questões foram deixadas em aberto no fim da Fase 1 e ficaram resolvidas aqui.

### 11.1 Unicidade de `armazem.codigo` — as duas restrições

`@@unique([empresaId, codigo])` foi acrescentado sem remover o `@unique` global,
por causa do motivo exposto em §5.12. As duas coexistem; a composta é hoje
redundante, e é redundante de propósito.

| | Restrição | Estado |
|---|---|---|
| `armazens_codigo_key` | `UNIQUE (codigo)` | mantida, marcada `@deprecated` no schema |
| `armazens_empresa_codigo_key` | `UNIQUE (empresa_id, codigo)` | criada (M4) |

Descontinuar a global é uma operação de uma linha, quando os services passarem a
enviar `empresaId`:

```sql
DROP INDEX armazens_codigo_key;
```

e no schema, apagar o `@unique` de `codigo` e o `@deprecated` que o acompanha.

### 11.2 `npm run lint`

`eslint.config.mjs` foi criado. Nenhuma dependência nova: todos os plugins já
estavam instalados. Detalhes que custaram tempo e ficam registados para quem
voltar a mexer:

- O ESLint 9.39 exige `defineConfig` de `eslint/config` para usar `extends` dentro
  de um objecto de flat config. Um array simples rejeitado com
  `"extends" key ... not supported`.
- `pluginReactHooks.configs['recommended-latest']` **ainda está em formato
  eslintrc** (`plugins` como array de strings) e é rejeitado. Tem de ser
  `pluginReactHooks.configs.flat['recommended-latest']`.
- `@electron-toolkit/eslint-config-prettier` também é eslintrc e não pode ser
  espalhado. Usou-se `eslint-config-prettier/flat`, que já vinha instalado
  (v10.1.8).
- `projectService.allowDefaultProject` é obrigatório para `prisma/seed.ts`,
  `prisma.config.ts`, `vitest.config.ts`, `playwright.config.ts` e
  `tests/e2e/*.e2e.ts`, que não pertencem a nenhum dos dois projectos do TypeScript.
  `electron.vite.config.ts` **não** entra aí: já está em `tsconfig.node.json` e
  incluí-lo produz "found in the project service".

#### O ratchet

Primeira execução: **2107 problemas**, praticamente todos de código que nunca foi
lintado. `npm run lint` hoje termina com **0 erros** e 468 avisos.

Em vez de reescrever ~2000 linhas alheias a este trabalho, o gate está montado
para apanhar o que é de facto um defeito, e as regras que o projecto
historicamente não cumpre ficaram desligadas **com o motivo ao lado**, para poderem
ser reintroduzidas à medida que o código é tocado.

| Regra | N.º | Estado | Porquê |
|---|---|---|---|
| `no-unsafe-*` (member-access, call, assignment, argument, return) | ~1200 | `off` | Derivam do cliente Prisma devolver tipos que estas regras não conseguem estreitar. Não são accionáveis e afogariam o gate em ruído. |
| `no-explicit-any` | 138 | `off` | Tolerado nos services que falam com o Prisma. Vale a pena reduzir, mas não bloqueia. |
| `explicit-function-return-type` | 360 | `off` | Puramente estilístico, e a convenção real do projecto é a oposta (inferir). |
| `no-floating-promises` + `no-misused-promises` | 198 | `warn` | Smells genuínos, sobretudo as promesas não tratadas em handlers. Espalhados por 45 ficheiros e por ecrãs financeiros (Fatura, Compras, SessaoCaixa) que nada têm a ver com este trabalho. Aviso, não `off`: o objectivo é descer o passivo a cada ficheiro tocado. |
| `no-base-to-string` | 4 | `warn` | `String(unknown)` deliberado ao formatar CSV, PDF e chaves de auditoria. Assumir `String()` de propósito é o comportamento pretendido. |
| `react-hooks/purity`, `preserve-manual-memoization` | 4 | `warn` | Regras do compilador React. A correcção passa por mover lógica ou memoizar à mão, o que muda o comportamento de componentes; sem forma de correr o Electron ecrã a ecrã, fica aviso. |
| `consistent-type-imports`, `require-await`, `no-unnecessary-type-assertion`, `set-state-in-effect`, `incompatible-library`, `only-export-components` | ~250 | `warn` | Cosméticos ou subjectivos; alguns auto-corrigíveis com `--fix`. |

Corrigidos na mesma passagem, por serem mecânicos e não mudarem comportamento:

| Ficheiro | Correcção |
|---|---|
| `src/renderer/src/utils/currency.ts:37` | `let` → `const` em `EXCHANGE_RATES` (nunca reatribuído; a linha 51 só muta uma propriedade) |
| `src/renderer/src/utils/currency.ts:132` | escape `\-` desnecessário dentro de uma classe de caracteres |
| `src/main/services/documento-calculos.ts` | removido `totalIliquidoSemDesconto`, acumulado e nunca lido (confirmado que não entra em `DocumentoCalculosResultado`) |
| `src/renderer/src/components/erp/ArtigoManager.tsx:64` | `catch (error)` → `catch`, a excepção não era usada |
| `src/main/middlewares/rbac.middleware.ts` | `ModuleName \| string` colapsava para `string` e perdia a autocompleção dos módulos; substituído por `ModuleName \| (string & {})`, que é o mesmo tipo com os literais preservados |
| `src/main/utils/nif-validator.ts:80` | mesma situação em `'PT' \| 'AO' \| 'outro' \| string` |
| `src/main/services/recibo.service.ts:254` | `${decimal}` → `${decimal.toString()}` — saída idêntica, conversão explícita |
| `src/main/services/saft/saft.validador.ts:434` | `${never}` → `${String(...)}` na mensagem de erro |
| `relatorios.controller.test.ts:305` | o U+FEFF literal dentro do regex de stripping de BOM passou a `\uFEFF`. **A substituir o carácter em vez do escape tinha partido o strip** — o teste continuaria a passar mas a limpeza do BOM deixava de funcionar. |

Nota sobre a última regra: `react-hooks/preserve-manual-memoization`
avisa em `relatorios.tsx:187` que a memoização manual não é preservável, ou
seja, o `useMemo` pode não estar a fazer o que o autor pensa. Vale a pena
investigar com calma quando esse ecrã voltar a ser tocado.
