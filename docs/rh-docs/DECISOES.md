# DECISOES.md — Arquitectura e Decisões (ADRs) do Módulo RH

> Registo curto de decisões (contexto · decisão · consequência) tomadas durante a
> implementação do módulo de Recursos Humanos. Sempre que a estrutura real do
> repositório divergir da proposta em `AGENTS.md §4`, **a estrutura real ganha** e
> a divergência fica registada aqui.

**Data de criação:** 2026-10-12 · **Âmbito:** Fase 0 (Descoberta e fundações)

---

## ADR-001 · Mapeamento do repositório e convenções

**Contexto.** O `AGENTS.md` propõe uma estrutura `main/modules/rh`, `ipc/rh`,
`shared/rh`, `renderer/features/rh`. O repositório real usa organização por
camadas/domínio.

**Decisão.** Seguir a estrutura **real**, não a proposta:

| Camada | Localização real (adoptada) |
|---|---|
| Constantes/RBAC | `src/main/constants/*.constants.ts` |
| Middlewares | `src/main/middlewares/` (`rbac.middleware.ts`) |
| Validators (Zod) | `src/main/validators/*.validator.ts` |
| Services (regras + transacções) | `src/main/services/*.service.ts` |
| Controllers (IPC, auth, erros) | `src/main/controllers/*.controller.ts` |
| Routers (`ipcMain.handle`) | `src/main/routers/*.router.ts` |
| Utils (erros, IPC response, handler) | `src/main/utils/` |
| Preload | `src/preload/index.ts` (+ `src/renderer/src/@types/electron.d.ts`) |
| Renderer pages | `src/renderer/src/pages/*.tsx` |
| Renderer componentes ERP | `src/renderer/src/components/erp/` |
| Renderer config | `src/renderer/src/config/` |
| Renderer API clientes | `src/renderer/src/api/*.api.ts` |
| Schema | `prisma/schema.prisma` (fonte única; prefixo `Rh*`) |

**Consequências.**
- Não existe `shared/rh/schemas`: os schemas Zod vivem em
  `src/main/validators/rh.validator.ts`; os DTOs do renderer em
  `src/renderer/src/@types/electron.d.ts`.
- Sem `features/rh`: managers em `components/erp/` e páginas em `pages/`.
- Motor de cálculo puro em `src/main/services/rh-calculo/` (sem Prisma/Electron/React).
- Prefixo de ficheiros: `rh.*` / `rh-*.ts` dentro das pastas de camada.

### Formatos e convenções confirmados

| Ponto | Convenção real |
|---|---|
| **Canal IPC** | `namespace:recurso:acao` (ex.: `rh:processamento:processar`) |
| **Resposta IPC** | `IpcResponse<T>` = `{ success:true, data } \| { success:false, error:{ code, message, details? } }` (`utils/ipc-response.ts`) |
| **Erros de negócio** | `AppError` + subclasses (`utils/errors.ts`), com `code` estável |
| **Auth** | `authService.getCurrentSession()` → `UserSession` (`services/auth.service.ts`) |
| **Autorização** | `requirePermission` / `requireAnyPermission` (`middlewares/rbac.middleware.ts`) |
| **Auditoria** | `auditService.registar()` append-only com SHA-256; nunca lança |
| **IDs** | `cuid()` |
| **BD** | PostgreSQL via `@prisma/adapter-pg` |
| **Decimais** | `Prisma.Decimal` / `@db.Decimal(18,4)`; arredondar half-up a 2 casas; IPC via `serializeIpcData` |
| **Multi-empresa** | `EmpresaConfig` central; entidades RH com `empresaId` |
| **Testes** | Vitest (`npm test`), ficheiros `*.test.ts`; E2E Playwright (`*.e2e.ts`) |
| **Módulo de referência** | `tesouraria` (contas bancárias + lançamentos + caixa) |

---

## ADR-002 · Integração com Finanças — `FinancasGateway`

**Contexto.** A spec §11 exige lançamentos contabilísticos (D/C) e movimentos de
tesouraria aos processar/pagar. O repositório **não tem** modelo de plano de
contas nem `LancamentoContabil`; tem `ContaBancaria`, `MovimentoTesouraria` e
`sessoes-caixa` (módulo Finanças/Tesouraria).

**Decisão.**
1. Definir a interface `FinancasGateway` em
   `src/main/services/rh-financas-gateway.ts`.
2. Fornecer `StubFinancasGateway` que falha com o código estável
   `RH_FINANCAS_INDISPONIVEL` (HTTP 503). Nada é escrito directamente nas
   tabelas de Finanças.
3. A ligação real faz-se **exclusivamente** através da interface (inversão de
   dependência) quando Finanças expuser o serviço; a implementação passa a ser
   injectada sem tocar nos services RH.
4. Contas contabilísticas por rubrica: os campos `RhRubrica.contaDebitoId` /
   `contaCreditoId` (previstos no modelo, `// EXT:`) ficam como **referências
   opcionais**; o mapeamento rubrica→conta é responsabilidade da implementação
   real do gateway.

**Consequências.** A Fase 5 fica desbloqueada estruturalmente; a contabilidade
real permanece um bloqueio declarado (spec §13) até existir plano de contas.

---

## ADR-003 · CentroCusto é global (partilhado)

**Contexto.** `RhAfetacao` e `RhAtividade` referenciam `centroCustoId` (`// EXT:`).
Não existe modelo `CentroCusto` no schema actual.

**Decisão.** O **Centro de Custo é uma entidade global e partilhada** (transversal
aos módulos, gerida fora do RH), **não** uma entidade por-empresa criada pelo RH.
Nesta fase:
- RH guarda apenas `centroCustoId: String?` como referência externa (`// EXT:`).
- Não se cria `CentroCusto` dentro das migrações RH.
- A resolução nome↔id é feita por um gateway/lookup partilhado quando a entidade
  existir; até lá o RH valida apenas a string do id.

**Consequências.** Sem FK real para CentroCusto nas migrações RH; a integridade é
validada ao nível do service/gateway. Evita duplicar a entidade em cada módulo.

---

## ADR-004 · Modelo de permissões `rh.*`

**Contexto.** O RBAC do ERP é coarse (`módulo × acção`: `read/write/delete/approve/admin`).
A spec §2 pede permissões finas (`rh.funcionarios.criar`, `rh.salarios.ver`, …).

**Decisão.** Modelo híbrido, compatível com o existente:

1. Adicionar `'rh'` a `MODULOS_RBAC` (Main) e ao `ModuloRbac`/`MODULOS` (renderer).
   Isto protege o item de menu, a rota (`ProtectedRoute module="rh"`) e o IPC
   (`rhHandler` com `{ modulo: 'rh', acao }`).
2. Catálogo **fino** em `src/main/constants/rh-permissions.constants.ts` (e espelho
   no renderer `config/rh-permissions.ts`), com chaves no formato
   `rh.<recurso>.<acção>`.
3. Cada permissão fina **não sensível** mapeia para uma acção coarse do módulo
   `rh` (fallback): `ver→read`, `criar/editar/gerir/emitir/processar/simular→write`,
   `anular/aprovar→approve`, `config.editar→admin`.
4. Dados **sensíveis** (`rh.salarios.ver`) **não** têm fallback coarse: só são
   concedidos pela chave exacta (`permissoes['rh.salarios']` inclui `'ver'`) ou por
   administração total do módulo (`rh: admin` / `permissoes['rh'] === true` /
   wildcard `'*'`).
5. `normalizarPermissoes` foi estendido para **preservar** as chaves
   `rh.<submódulo>` ao gravar perfis, filtrando as acções ao catálogo conhecido.

**Consequências.** Perfis antigos continuam válidos (aditivo). A grelha de
permissões da UI continua a operar ao nível coarse; a exposição das chaves finas
na matriz de perfis fica como melhoria posterior (não bloqueia Fase 0).

---

## ADR-005 · Motor de cálculo

**Decisão.** Biblioteca **pura** em `src/main/services/rh-calculo/` (a criar na
Fase 3), sem importar Prisma, Electron ou React. Assinatura determinística
`calcular(input: EntradaCalculo): ResultadoCalculo`. Parâmetros fiscais por
vigência (`RhParametroFiscal`, `RhTabelaIRT`), nunca hard-coded.

---

## ADR-006 · Decimais e precisão

**Decisão.** Cálculo sempre com `Decimal` (Prisma + `decimal.js`); nunca `number`
em aritmética monetária. Arredondamento a 2 casas half-up **por rubrica**, no
fim. Fronteira IPC serializa via `serializeIpcData` (Decimal→number). Motor
determinístico. (Reforço da regra `AGENTS.md §5.1`.)

---

## ADR-007 · Infra de testes

**Contexto.** RH-005 pede unit + integração (BD temporária) + fixtures.

**Decisão (Fase 0).** O Vitest já está configurado (`vitest.config.ts`) e apanha
`src/**/*.test.ts`. Não é necessária infra nova nesta fase: os testes unitários
seguem o padrão existente (mock de `PrismaClient` por injecção no construtor do
service, como em `contas-bancarias.service.test.ts`). Testes de integração sobre
BD de teste ficam para as fases que criam tabelas Rh*; o CI corre `npm test`.

**Consequências.** `npm test` já cobre o exemplo do módulo RH (handler, erros,
gateway, permissões, validators).

---

## ADR-008 · Contrato IPC base

**Decisão.** Helper `rhHandler(schema, permissao, fn)` em `src/main/utils/rh-handler.ts`:

1. Obtém a sessão (`authService`), falha com `UNAUTHORIZED` sem sessão.
2. Verifica permissões (`requirePermission` ou `rhPermissaoConcede` para chaves finas).
3. Valida o payload com o schema Zod (`VALIDATION_ERROR` com `details`).
4. Executa `fn(input, ctx)` com `ctx = { session, empresaId, utilizadorId, podeVerSalarios }`.
5. Normaliza a resposta (`ok`) e mapeia `AppError`/`RhError` para o `code` estável.

Códigos de erro RH em `src/main/utils/rh-errors.ts` (`RH_PERIODO_FECHADO`,
`RH_JA_PROCESSADO`, `RH_SEM_CONTRATO_ATIVO`, `RH_IBAN_EM_FALTA`,
`RH_PAGAMENTO_EFETUADO`, `RH_FINANCAS_INDISPONIVEL`, …).

Canal de diagnóstico da Fase 0: `rh:sistema:ping` (prova o contrato ponta-a-ponta).

---

## ADR-009 · Isolamento por empresa (`empresaId`) e ajustes de Fase 1

**Decisão.** Toda a Fase 1 é multi-empresa: as entidades de topo (agregados)
carregam `empresaId` **obrigatório** com relação para `EmpresaConfig`, e os
filhos herdam o âmbito pelo pai.

1. **Com `empresaId`**: `RhDepartamento`, `RhCargo`, `RhFuncionario`,
   `RhRubrica`, `RhTipoAusencia`, `RhTabelaIRT`, `RhParametroFiscal`,
   `RhConfiguracao` (único por empresa), `RhPeriodo`, `RhIndependente`,
   `RhOrdemPagamento` e o novo `CentroCusto`.
2. **Sem `empresaId` (filhos)**: `RhDependente`, `RhContrato`,
   `RhAlteracaoSalarial`, `RhAusencia`, `RhHoraExtra`, `RhAfetacao`,
   `RhProcessamento`, `RhPagamento`, prestações, retroactivos, … — o âmbito
   obtém-se pela entidade pai.
3. **Unicidade** passa a incluir `empresaId`: `@@unique([empresaId, codigo])`
   (departamentos, cargos, rubricas, tipos de ausência, centros de custo,
   independentes) e `RhPeriodo @@unique([empresaId, ano, codigo])`.
4. **`RhSequencia`** (contadores de código de funcionário/recibo) mantém
   `@@unique([chave])`, conforme o modelo §13; é distinto do `Sequencia`
   genérico já existente.
5. **`CentroCusto`** é agora um modelo **real** (antes `String?` `// EXT:`):
   `@@map("centros_custo")`, com `empresaId` + relação e `@@unique([empresaId,
   codigo])`. `RhAfetacao.centroCustoId` e `RhAtividade.centroCustoId` passam a
   FKs reais (revisto em migração própria, ADR-003). Actualiza a linha
   "Centro de custo" da tabela de entidades externas abaixo.
6. **Serviço de parâmetros (RH-106)** resolve por vigência
   (`getParametro(chave, data)`, `getTabelaIRT(data)`, `getConfiguracao()`),
   com cache em memória invalidável nas escritas. Criar uma alteração **gera
   nova versão** (nova linha com nova `vigenteDesde`) e encerra a anterior —
   nunca sobrescreve.

Estas alterações estão nas migrações `rh_101…rh_104` e no seed idempotente
(`prisma/seed.ts` §7).

---

## ADR-010 · Lançamento contabilístico *best-effort* no `processar` (RH-405)

**Contexto.** O `processar` individual (RH-405) gera o processamento, recibo e
pagamento numa transacção Prisma atómica e, no fim, deve originar o lançamento
contabilístico via `FinancasGateway` (ADR-002). O gateway real (modelo
contabilístico) **não existe ainda** e o `StubFinancasGateway` lança sempre
`FinancasIndisponivelError` (`RH_FINANCAS_INDISPONIVEL`).

**Decisão.** A chamada ao gateway financeiro é **best-effort e posterior ao
commit** da transacção:

1. A transacção atómica cria `RhProcessamento`, itens, recibo e pagamento —
   nenhum destes depende do gateway.
2. Só após o commit se invoca `FinancasGateway`. Se o gateway estiver
   indisponível (`FinancasIndisponivelError`), **não** se faz rollback: o
   processamento é válido por si e acrescenta-se um **aviso** ao resultado
   (`avisos`), persistido no snapshot.
3. Qualquer outro erro **antes** do commit provoca rollback total (CA de
   RH-405). Erros do gateway que não sejam indisponibilidade devem ser
   tratados/registados no próprio resultado, sem desfazer o processamento.

**Consequências.** O processamento de salários permanece utilizável enquanto o
módulo de contabilidade não existir; quando existir, o lançamento é reconciliado
a posteriori (o aviso identifica os processamentos sem lançamento). A
atomicidade exigida pela spec aplica-se à escrita salarial (processamento +
recibo + pagamento), não à integração contabilística, que passa a ser
eventualmente consistente.

---

## ADR-011 · Processamento em lote (RH-406): transacção por funcionário, lock lógico e canal próprio

**Contexto.** A spec (§3, canais IPC) prevê um único `rh:processamento:processar`
com `funcionarioIds[]` + `modo`. O RH-405 já ocupou esse canal com o modo
individual. O lote (RH-406) precisa de isolar falhas por funcionário, emitir
progresso e impedir dois lotes concorrentes do mesmo período/tipo.

**Decisão.**

1. **Canal dedicado.** O lote usa `rh:processamento:processar-lote` (o individual
   mantém `rh:processamento:processar`). Evita alterar o contrato já
   implementado/testado do modo individual e mantém os schemas distintos.
2. **Transacção por funcionário.** O lote carrega os dados uma só vez (loader
   RH-403) e invoca `RhProcessamentoExecucaoService.executarFuncionario` por
   funcionário — cada chamada é a sua própria `$transaction`. Uma falha é
   registada no relatório e **não** interrompe os restantes (CA de RH-406).
3. **Progresso por evento.** Após cada funcionário, o `main` emite
   `rh:processamento:progresso` (`{ total, feitos, funcionarioId, estado }`) no
   `event.sender` da janela que invocou; o `invoke` devolve o resultado final.
4. **Lock lógico por período × tipo.** Antes de criar o lote, verifica-se se há
   `RhLoteProcessamento` em `EM_EXECUCAO` para o mesmo `periodoId` e tipo
   (`tipos` Json); se sim → `RH_LOTE_EM_EXECUCAO`. É um lock *lógico* (não uma
   constraint de BD); a spec (§3) assim o designa.
5. **Reutilização do cálculo.** O `executarFuncionario` (extraído do RH-405) é o
   único ponto que persiste processamento/recibo/pagamento, garantindo que
   individual e lote produzem exactamente o mesmo resultado.

**Consequências.** A UI de processamento (RH-411) subscreve o evento de progresso
e chama o canal de lote. Um reprocessamento forçado continua a criar nova
`sequencia`. O lock é cooperativo (não protege contra dois processos externos à
app); suficiente para o caso de uso de um único utilizador por janela.

---

## ADR-012 · Anulação (RH-407): reversão por processamento e limites do modelo de dados

**Contexto.** A spec §5.7 exige que anular um processamento reverta os seus
efeitos (recibo, pagamento, alterações, prestações, ausências/HE, lançamento
contabilístico). O modelo guarda parte destas ligações de forma explícita e
outras apenas por convenção.

**Decisão.**

1. **Uma transacção por processamento.** Tal como o processamento em lote
   (ADR-011), cada processamento é revertido na sua própria transacção; o
   resultado é agregado (`total`/`sucesso`/`erros`/`detalhes`). Uma falha (ex.:
   pagamento efectuado) não impede os restantes.
2. **Ligações por chave natural.** As alterações mensais apontam para o item de
   processamento (`processamentoItemId`) e são revertidas com precisão. As
   prestações não guardam essa referência; como o loader desconta apenas as
   `PENDENTE` do (funcionário, ano, mês) do período, a reversão localiza-as por
   essa chave + estado `DESCONTADA` e repõe o saldo do processo (reactivando
   `LIQUIDADA`→`ATIVA` quando o saldo volta a ser positivo).
3. **Ausências/HE sem back-reference.** Estes registos só têm `processadaEm`
   (data), não referenciam o processamento. A reversão desmarca as ausências/HE
   do funcionário cujo `processadaEm` coincida com a `dataProcessamento` do
   registo anulado. **Limitação conhecida:** dois processamentos do mesmo
   funcionário na mesma data partilham a marca, pelo que a reversão é holística
   nesse caso. Um back-reference dedicado exigiria alteração de schema (fora do
   âmbito desta tarefa).
4. **Persistência do lançamento para estorno.** O RH não guardava o id do
   lançamento contabilístico. Passa a gravá-lo no `snapshot` do processamento
   (best-effort, ADR-010); o estorno é tentado após o commit e a sua falha vira
   aviso, não rollback.
5. **Bloqueios.** Período fechado e pagamento já efectuado (`PAGO`/`PARCIAL` ou
   `valorPago > 0`) impedem a anulação; já `ANULADO` é rejeitado por
   idempotência.

**Consequências.** Reprocessar após anular funciona porque o processamento
`ANULADO` não conta para a unicidade (§5.8) e as alterações/prestações voltam a
`PENDENTE`. O número de recibo nunca é reutilizado (§RF-REC-02).

---

## ADR-013 · Ajustes manuais antes da confirmação (RH-408)

**Contexto.** A RF-PRO-03 permite introduzir/alterar rubricas manualmente no
processamento: o utilizador ajusta valores **antes de confirmar** e os itens
resultantes ficam com `origem = MANUAL`. O modelo de dados já previa o campo
`RhProcessamento.manual Boolean` ("houve ajustes manuais"), o motor (`Fase 3`) já
aceita `ajustesManuais` na `EntradaCalculo`, mas `simular` (RH-404) e `processar`
(RH-405) nunca o transportavam. Existia ainda um stub
`rh-processamento-manual.service.ts` desenhado para editar um processamento **já
gravado** (pós-confirmação), que não corresponde a esta regra.

**Decisão.**

1. **Âmbito pré-confirmação.** Os ajustes são um *input* de `simular`/`processar`,
   não uma edição posterior do registo. Escolhido por alinhar com a RF-PRO-03,
   com `RhProcessamento.manual` e com a continuidade da spec; a edição de um
   processamento confirmado fica fora do MVP (a correcção faz-se anulando e
   reprocessando).
2. **Reutilização do builder.** Os ajustes seguem por `construirEntradaCalculo`
   → `EntradaCalculo.ajustesManuais`, o mesmo caminho da simulação e da execução
   (garante idempotência simular↔processar). O motor já cria os itens com
   `origem = MANUAL` (aplicados depois das rubricas recorrentes/HE/DIVIDA, antes
   dos encargos INSS/IRT).
3. **Normalização isolada.** `RhProcessamentoManualService` (`normalizar`/
   `houveAjustes`) converte os ajustes validados (Zod) para a forma do motor e
   descarta valores não positivos (que o motor ignoraria). É injectado em
   `RhProcessamentoExecucaoService` (e por este reutilizado no lote, ainda que o
   lote não aceite ajustes). A persistência/auditoria continua no serviço de
   execução.
4. **Marca e auditoria.** O cabeçalho é gravado com `manual = ajustes.length > 0`;
   a auditoria regista a contagem de ajustes aplicados. O número de recibo e a
   sequência não mudam com os ajustes.
5. **Schema único.** `ajusteManualSchema` passa a espelhar o `AjusteManual` do
   motor (`{ rubricaId?, codigo?, descricao, tipo, valor>0, quantidade?,
   incideIRT?, incideINSS? }`, exigindo `rubricaId` **ou** `codigo`) e é
   reutilizado por `rhProcessarSalariosInputSchema` (RH-404) e
   `rhProcessarIndividualInputSchema` (RH-405).

**Consequências.** A simulação reflecte exactamente os ajustes que serão
gravados. O lote (RH-406) mantém-se sem ajustes manuais (processamento massivo
homogéneo). Reprocessamentos manuais reenviam os ajustes no pedido (não ficam
"presos" ao processamento).

---

## ADR-014 · Plano pós-MVP (FASE 9): sequência e princípios das três áreas

**Contexto.** O backlog tinha três itens sem decomposição: Capital Humano
(recrutamento, avaliação, formação), Obrigações Declarativas (mapas INSS/AGT) e
integração com relógio de ponto. Os separadores *Capital Humano* e *Obrigações
Declarativas* existem na UI como placeholder. Era preciso decidir o que entra,
por que ordem e com que fronteiras, sem pressupor formatos oficiais nem hardware.

**Decisão.** Planificado em `06-plano-pos-mvp.md` e decomposto em `03-tasks.md`
(FASE 9, `RH-9xx`), com esta sequência, por valor e risco:

1. **Obrigações Declarativas** — obrigação legal, camada de saída sobre os
   processamentos já gravados (não recalcula nada), sem hardware nem dados novos.
2. **Relógio de Ponto** — **importação por ficheiro** (não leitura direta do
   dispositivo), com perfil de mapeamento configurável; a conciliação **sugere**
   faltas/atrasos/horas extra e o RH confirma.
3. **Capital Humano** — faseado por dentro: recrutamento → avaliação → formação.

Princípios transversais: não duplicar dados existentes; reutilizar o motor de
cálculo; layouts oficiais **parametrizáveis e versionados**; RBAC e auditoria desde
a primeira tarefa de cada área; e escalas de avaliação configuráveis por ciclo,
sem qualquer efeito automático no salário.

**Consequências.**
- Os três itens saem do *backlog* para a FASE 9; o *backlog* mantém Exploração e
  Recursos, portal de auto-serviço, comissões de vendas e a leitura direta do
  relógio (evolução futura, atrás de interface).
- Cinco submódulos novos de permissões (`rh.declarativas`, `rh.ponto`,
  `rh.recrutamento`, `rh.avaliacao`, `rh.formacao`), reutilizando as ações finas
  existentes — `RH_ACOES_RBAC` não é alargado.
- Portas externas registadas como critérios de aceitação: validação jurídica dos
  valores de INSS/IRT (bloqueia a submissão das declarações), layouts oficiais
  INSS/AGT, NISS/NIF completos nas fichas, ficheiro de amostra de um relógio real
  e definição dos regimes de jornada e tolerâncias.
- Modelo de dados desta fase só é acrescentado a `04-modelo-de-dados.md` na altura
  da implementação, não agora.

---

## Entidades externas reais (referência)

| Entidade externa (docs) | Real no repositório | Tratamento RH |
|---|---|---|
| Utilizador | `Utilizador` | `criadoPorId`/`aprovadoPorId` como `String?` |
| Conta bancária | `ContaBancaria` | referência `String?` / via gateway Finanças |
| Movimento de tesouraria | `MovimentoTesouraria` | via `FinancasGateway` |
| Centro de custo | `CentroCusto` (modelo global, ADR-003/ADR-009) | FK real em `RhAfetacao`/`RhAtividade` |
| Moeda | `EmpresaConfig.moedaBase` (string, ex.: `AOA`) | string `String @default("AOA")` |
| Plano de contas | **não existe** | gateway (ADR-002) |
| Lançamento contabilístico | **não existe** | gateway (ADR-002) |

---

## Perguntas em aberto (não bloqueiam Fase 0)

1. Valores legais de IRT/INSS e casos de cálculo reais (bloqueiam Fase 3).
2. Formato do ficheiro de transferência bancária (Fase 5, não bloqueia MVP).
3. Modelo exacto do recibo em PDF (bloqueia a task de PDF).
4. Exposição das chaves finas `rh.*` na matriz de perfis (melhoria de UI).

---

## Notas de progresso

| Data | Task | Decisão / Nota |
|---|---|---|
| 2026-10-12 | RH-001 | ADR-001…008; adoptada a estrutura real por camadas; CentroCusto global (ADR-003). |
| 2026-10-12 | RH-002 | Interface `FinancasGateway` + stub (`RH_FINANCAS_INDISPONIVEL`). |
| 2026-10-12 | RH-003 | Módulo `rh` no RBAC/menu/rota + página com ribbon placeholder. |
| 2026-10-12 | RH-004 | `rh` coarse + catálogo fino `rh.*` + helper `rhPermissaoConcede`. |
| 2026-10-12 | RH-005 | Infra Vitest existente reutilizada; testes RH adicionados. |
| 2026-10-12 | RH-006 | `rhHandler`, erros RH, validators base, canal `rh:sistema:ping`. |
| 2026-10-12 | RH-101…104 | Migrações (enums+modelos) por empresa (ADR-009); `CentroCusto` real. |
| 2026-10-12 | RH-105 | Seed idempotente: rubricas de sistema, tipos de ausência, parâmetros, IRT, configuração, períodos. |
| 2026-10-12 | RH-106 | `RhConfiguracaoService`: vigência + cache invalidável; testes de vigência. |
| 2026-10-12 | RH-107 | Schemas Zod de cadastros/parâmetros em `rh.validator.ts`. |
| 2026-10-12 | RH-108…111 | UI de Configuração em `components/erp/rh/*` (rubricas, períodos, parâmetros/IRT, cadastros, padrões). |
| 2026-10-12 | RH-201 | `RhFuncionarioService`: código sequencial por empresa (`FUNCIONARIO:<empresaId>`), inactivação em vez de eliminação, auditoria; canais `rh:funcionarios:*`. |
| 2026-10-12 | RH-202 | UI lista de funcionários (filtros, ordenação, paginação, formulário) em `RhFuncionariosManager`. |
| 2026-10-12 | RH-207 | Forma de pagamento dos subsídios: campos no schema + aba "Subsídios" da ficha + padrões da empresa. |
| 2026-10-12 | RH-208 | Importação CSV em duas fases: `previsualizar` valida sem escrever, `importar` grava só válidas numa transação. Canais separados por tipo fixam a permissão (`rh.funcionarios.criar` / `rh.contratos.gerir`); seleção do ficheiro exige `rh` coarse `write` (OR das duas). Referências por código normalizado; códigos de funcionário da mesma sequência do formulário para nunca colidirem; auditoria agregada por importação (`acao: submeter`). |
| 2026-10-13 | RH-405 | `processarIndividual` numa transacção atómica (processamento + itens + alterações/prestações + ausências/HE + recibo sequencial + pagamento `PENDENTE`); unicidade por funcionário/período/tipo; gateway Finanças **best-effort pós-commit** (ADR-010). Builder partilhado `rh-processamento-entrada.ts`. |
| 2026-10-13 | RH-406 | `processarLote`: dados em bloco + transacção por funcionário (reutiliza `executarFuncionario` do RH-405); `RhLoteProcessamento`; lock lógico período×tipo; evento `rh:processamento:progresso`; canal `rh:processamento:processar-lote` (ADR-011). |
| 2026-10-13 | RH-407 | `anular`: reversão por processamento numa transacção própria (recibo/pagamento/alterações/prestações/ausências-HE/estorno); bloqueio por pagamento efectuado ou período fechado; motivo obrigatório; canal `rh:processamento:anular` (ADR-012). |
| 2026-10-13 | RH-408 | Ajustes manuais **antes de confirmar** (RF-PRO-03): `rh-processamento-manual.service.ts` (`normalizar`/`houveAjustes`) injectado no serviço de execução; ajustes seguem por `construirEntradaCalculo` em `simular` e `executarFuncionario`; itens `origem = MANUAL`, cabeçalho `manual = true`; `ajusteManualSchema` alinhado com o motor (ADR-013). |
| 2026-10-13 | RH-409 | UI do ecrã de Processamento (`RhProcessamentoManager.tsx`, separador *Salários e Honorários*): barra de acções + Operação/Tipos + parâmetros (Ano/Período/Mês/Dias/Data/Faltas-HE) com validação Zod local espelhando o loader; `Actualizar` chama `rhApi.processamento.carregar`; regra **Fim de Contrato desactivado em lote** (modo derivado da selecção; grelha em RH-410); atalhos Alt+A/Alt+P/F1/Esc e Enter. |
| 2026-10-13 | RH-410 | Grelha e separadores em `RhProcessamentoConteudo.tsx` (tabs *Processamentos*/*Restrições*/*Remunerações/Descontos/Taxas Cambiais*): grelha de elegíveis com `P` (seleccionar tudo/nenhum + indeterminado) e ordenação por código/nome, selecção elevada ao manager (deriva **Individual** vs **Lote**); Restrições com motivo/descrição; Remunerações/Descontos agregados por rubrica (fixas + mensais) e moedas estrangeiras dos contratos. |
| 2026-10-13 | RH-411 | UI Processar em `RhProcessarDialog.tsx` (3 fases: Resumo via `simular` por tipo sem gravar, Execução com barra de progresso do evento IPC `rh:processamento:progresso` e relatório final por funcionário/tipo); lote por `processarLote` (sem `diasProcessados`), individual por `processar`; pedido imutável `pedidoAtivo` no manager, recarregar no fim; `aplicarSelecionados` remove *Fim de Contrato* ao sair do individual. Corrigido `simular` que ignorava o tipo: `tipoProcessamento` adicionado a `rhProcessarSalariosInputSchema` + DTO. |
| 2026-10-13 | RH-412 | Operação **Anular** no ecrã de Processamento: novo canal `rh:processamento:listar` (`rh-processamento-listar.service.ts`, permissão `anular`, isolado por empresa) lista os processamentos do período; `RhAnularConteudo.tsx` (grelha seleccionável, só não anulados) + `RhAnularDialog.tsx` (motivo obrigatório ≥3, confirmação e resultado por processamento com efeitos revertidos) sobre `rhApi.processamento.anular` (RH-407); manager desvia por operação e recarrega no fim. |
| 2026-10-13 | RH-413 | UI **Simulação** (RF-PRO-04) reutilizando o mesmo ecrã: `RhProcessamentoManager` aceita `proposito`, o separador *Simulação* corre `simular` sem gravar (por tipo, funcionários seleccionados ou todos os elegíveis) e mostra resumo + tabela por funcionário/tipo com totais; exportação CSV no cliente (Blob + BOM). Adicionado `totais` formatados a `FuncionarioResultado`/DTO para não serializar `Decimal`. |
| 2026-10-13 | RH-414 | **Histórico + visão detalhada** (RF-PRO-06/07): `rh-processamento-historico.service.ts` (`listar` paginado isolado por empresa com filtros; `detalhar` com rubricas, bases, escalão IRT, recibo, avisos e snapshot) + canais `rh:processamento:historico`/`obter` (`rh.processamento.ver`); separador *Processamentos* (`RhProcessamentosHistorico.tsx`) com filtros/paginação e `RhProcessamentoDetalheDialog.tsx` (reutiliza `RhAnularDialog` para o atalho). |
| 2026-10-13 | RH-415 | **Fecho/abertura de período**: fechar/reabrir exigem `rh.config.editar` (→ `admin`); motor bloqueia processar/anular com período não-`ABERTO`. `RhConfiguracaoService` passa a injectar `AuditService` e registra auditoria no fecho (`info`) e na reabertura (`aviso`, com estado anterior), tornando a reabertura rastreável. |
| 2026-10-13 | RH-416 | **Testes E2E do processamento**: `tests/e2e/rh-processamento.e2e.ts` (Playwright) — fluxo completo: autentica → cria funcionário+contrato+IBAN via UI → navega a *Salários* → `Actualizar` → seleciona → **Processar lote** → verifica totais no relatório → muda para **Anular** → `Actualizar` → seleciona → anula com motivo → volta a **Processar** → `Actualizar` → seleciona → **reprocessar** → verifica totais. Seletores baseados em `data-testid` (ribbons, grelhas) e `role` (botões, diálogos). Código de funcionário único por execução (`E2E-${timestamp}`) para idempotência. Requer `npm run build` + DB dev. |
| 2026-10-13 | RH-501 | **Numeração de recibos**: implementada em RH-405. `RhSequencia` chave `RECIBO:<serie>:<ano>` com `upsert` atómico na transacção (`proximoNumeroRecibo`). Série configurável via `RhConfiguracao.serieRecibo` (padrão `RV`, UI em *Configuração → Padrões*). Recibo criado `EMITIDO`; anulação → `ANULADO` sem reutilizar número (sequência só incrementa). |
| 2026-10-13 | RH-502 | **Template e geração PDF do recibo**: `rh-recibos-pdf.service.ts` (pdfkit) — layout RF-REC-01 (cabeçalho empresa, funcionário, rubricas, bases IRT/INSS, escalão, totais, assinatura). `rh-recibos.service.ts` (`listar` paginado com filtros, `obter`, `gerarPdf`/`gerarPdfLote` via `pdfkit`, `registarImpressao`). IPC `rh:recibos:listar`/`obter`/`gerarPdf`/`registarImpressao` (perms `rh.recibos.ver`/`emitir`). Preload + `rhApi.recibos.*`. `typecheck`/`lint`/`test` limpos. |
| 2026-10-13 | RH-503 | **UI Recibos**: separador *Recibos* (`RhRecibosManager.tsx`) com filtros Ano/Período/Tipo/Estado/Funcionário/Pesquisa, grelha (Recibo/Funcionário/Nome/Período/Tipo/Data/Líquido/Estado/Impressões), paginação 25/25. Acções: Ver PDF (nova janela + incrementa impressões), Imprimir; PDF Lote/Imprimir Lote (emitidos). Reutiliza `rhApi.recibos.*`. |
| 2026-10-13 | RH-504 | **Service de Pagamentos**: `rh-pagamentos.service.ts` — `criarOrdem` (agrupa pagamentos pendentes por banco/forma, valida mesma forma, número sequencial, associa pagamentos), `gerarFicheiroTransferencia` (CSV padrão), `confirmarPagamento` (PENDENTE/PARCIAL → PAGO/PARCIAL, movimento tesouraria best-effort, actualiza ordem), `estornarPagamento` (PAGO/PARCIAL → ESTORNADO, movimento inverso best-effort, actualiza ordem), `listarOrdens/obterOrdem` (paginado + detalhe), `listarPagamentos` (filtros). IPC `rh:pagamentos:ordens:listar/criar/obter/gerarFicheiro` (`rh.pagamentos.gerir`), `rh:pagamentos:listar/confirmar/estornar` (`rh.pagamentos.ver`/`gerir`). Preload + `rhApi.pagamentos.*` + types. `typecheck`/`lint`/`test` limpos. |
| 2026-10-19 | Plano pós-MVP | ADR-014: as três áreas do *backlog* (Obrigações Declarativas, Relógio de Ponto, Capital Humano) foram planeadas em `06-plano-pos-mvp.md` e decompostas na **FASE 9** de `03-tasks.md` (`RH-901`…`RH-927`). Sequência por valor e risco: Declarativas (obrigação legal, camada de saída sobre processamentos existentes) → Relógio de Ponto (**importação por ficheiro**, conciliação que sugere e não cria) → Capital Humano (recrutamento → avaliação → formação). Layouts oficiais parametrizáveis e versionados; cinco submódulos de permissões novos sem alargar `RH_ACOES_RBAC`; portas externas (validação jurídica, layouts, NISS/NIF, amostra de relógio, jornadas) registadas como critérios de aceitação. |
