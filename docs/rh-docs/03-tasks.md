# 03 — Tasks

**Legenda**
- Estado: `[ ]` por fazer · `[~]` em curso · `[x]` concluída
- Tamanho: **S** ≤ 1 dia · **M** 2–3 dias · **L** 4–5 dias · **XL** > 5 dias (dividir)
- `Dep:` dependências · `Ref:` secção da spec/modelo · **CA** = critérios de aceitação
- Cada task segue o *Definition of Done* do `AGENTS.md §8`.

---

## FASE 0 — Descoberta e fundações

- [ ] **RH-001 · Mapear o repositório** (S)
  Documentar em `DECISOES.md`: estrutura de pastas, formato IPC, auth/permissões, auditoria, PDF, i18n, estratégia de IDs, tipo de BD, multi-empresa, componentes partilhados, módulo de referência escolhido.
  **CA:** ADR-001 com todos os pontos; lista de entidades externas reais (Utilizador, Conta bancária, Centro de custo, Moeda, Plano de contas, Lançamento).
- [ ] **RH-002 · Spike de integração com Finanças** (M)
  Identificar API/serviço para: lançamento contabilístico, movimento de tesouraria, estorno. Definir interface `FinancasGateway`.
  **CA:** documento + interface TS + implementação *stub*; decisão sobre onde ficam as contas contabilísticas das rubricas. Ref: spec §11.
- [ ] **RH-003 · Esqueleto do módulo** (S) · Dep: RH-001
  Criar pastas (`main/modules/rh`, `ipc/rh`, `shared/rh`, `renderer/features/rh`), rotas lazy e entrada "Recursos Humanos" no menu.
  **CA:** rota `/rh` abre página com ribbon vazio (separadores: Geral · Salários e Honorários · Capital Humano · Obrigações Declarativas).
- [ ] **RH-004 · Permissões `rh.*`** (S) · Dep: RH-001
  Registar permissões da spec §2 e proteger rotas/handlers.
  **CA:** utilizador sem permissão não vê item de menu nem consegue invocar IPC (teste).
- [ ] **RH-005 · Infra de testes** (S)
  Garantir unit + integração (BD temporária) + fixtures para RH.
  **CA:** `npm test` corre exemplo do módulo RH em CI.
- [ ] **RH-006 · Contrato IPC base e tipos de erro RH** (S) · Dep: RH-001
  Helper `rhHandler(schema, fn)` (valida Zod, autoriza, formata resposta/erros).
  **CA:** usado por todos os handlers seguintes; erros de negócio com `code` estável (`RH_PERIODO_FECHADO`, `RH_JA_PROCESSADO`…).

---

## FASE 1 — Dados mestre e parâmetros

- [x] **RH-101 · Migração: estrutura organizacional e funcionário** (M) · Dep: RH-001
  Enums + `RhDepartamento`, `RhCargo`, `RhFuncionario`, `RhDependente`, `RhFuncionarioDocumento`, `RhContrato`, `RhAlteracaoSalarial`, `RhSequencia`. Ref: modelo §2–3.
  **CA:** `prisma migrate` aplica sem erro; `prisma validate` OK; adaptado às convenções (IDs, empresa).
- [x] **RH-102 · Migração: rubricas, alterações, assiduidade** (M) · Dep: RH-101
  `RhRubrica`, `RhFuncionarioRubrica`, `RhAlteracaoMensal`, `RhTipoAusencia`, `RhAusencia`, `RhHoraExtra`, `RhFeriasSaldo`, `RhMarcacaoFerias`, `RhAfetacao`.
- [x] **RH-103 · Migração: parâmetros, períodos, processamento** (M) · Dep: RH-101
  `RhTabelaIRT`, `RhEscalaoIRT`, `RhParametroFiscal`, `RhConfiguracao`, `RhPeriodo`, `RhLoteProcessamento`, `RhProcessamento`, `RhProcessamentoItem`, `RhRecibo`, `RhRestricaoFuncionario`.
- [x] **RH-104 · Migração: pagamentos, dívidas, retroactivos, honorários** (M) · Dep: RH-101
  `RhOrdemPagamento`, `RhPagamento`, `RhProcessoDivida`, `RhPrestacaoDivida`, `RhRetroativo`, `RhIndependente`, `RhAtividade`, `RhProcessamentoHonorario`, `RhPagamentoHonorario`.
- [x] **RH-105 · Seeds** (M) · Dep: RH-102, RH-103
  Rubricas de sistema, tipos de ausência, parâmetros, tabela IRT (valores fornecidos pelo RH), períodos do ano, configuração, sequências. Ref: modelo §13.
  **CA:** seed idempotente (re-executável); valores legais marcados como "a validar".
- [x] **RH-106 · Serviço de parâmetros com vigência** (S) · Dep: RH-103
  `getParametro(chave, data)`, `getTabelaIRT(data)`, `getConfiguracao()` com cache invalidável.
  **CA:** testes: parâmetro correcto por data; erro claro se inexistente.
- [x] **RH-107 · Schemas Zod partilhados (cadastros)** (M) · Dep: RH-006
  Funcionário, contrato, rubrica, parâmetro, período… em `shared/rh/schemas`.
- [x] **RH-108 · UI Configuração: rubricas** (M) · Dep: RH-102, RH-107
  Lista + formulário (tipo, natureza, incidências, limites, ordem recibo). Rubricas de sistema não eliminam/limitam edição.
- [x] **RH-109 · UI Configuração: períodos** (S) · Dep: RH-103
  Gerar `P01–P12` por ano; abrir/fechar período (permissão responsável).
- [x] **RH-110 · UI Configuração: parâmetros fiscais e tabela IRT** (M) · Dep: RH-106
  Edição com data de vigência; nova versão em vez de sobrescrever; auditoria.
- [x] **RH-111 · UI Configuração: departamentos, cargos, tipos de ausência, subsídios padrão** (M)

---

## FASE 2 — Funcionários e contratos

- [x] **RH-201 · Service/Repository de Funcionários** (M) · Dep: RH-101, RH-107
  CRUD, geração de código sequencial, inactivar (sem delete), pesquisa/paginação.
  **CA:** código único; não elimina com movimentos; auditoria.
- [x] **RH-202 · UI Lista de Funcionários** (M) · Dep: RH-201
  Tabela com filtros (código, nome, NIF, BI, departamento, estado), ordenação, paginação, acções.
- [x] **RH-203 · UI Ficha do Funcionário (tabs)** (L) · Dep: RH-201
  Tabs: Dados pessoais · Contrato · Bancário · Dependentes · Rubricas fixas · Subsídios · Documentos. Validação Zod inline; foto/documentos.
  Concluído: `RhFuncionarioFicha.tsx` aberta a partir da lista; sub-recursos (dependentes, rubricas fixas, documentos) com CRUD via IPC; fotografias pendentes (RH-209).
- [x] **RH-204 · Service de Contratos e alterações salariais** (M) · Dep: RH-201
  Um contrato activo; histórico; `salarioNaData(funcionario, data)`; cessação com motivo.
  **CA:** testes de vigência salarial por data; cessação muda estados correctamente. Concluído: `rh-contratos.service.ts` + `rh:contratos:*` IPC + testes (regra de contrato ativo, cessação transacional, `resolverSalarioContrato`).
- [x] **RH-205 · UI Gestão Contratual** (M) · Dep: RH-204
  Lista/histórico, novo contrato, alteração salarial, cessação, alerta de contratos a terminar.
  Concluído parcialmente: aba Contrato da ficha com histórico, novo contrato, alteração salarial e cessação; alerta automático de contratos a terminar pendente.
- [x] **RH-206 · Rubricas recorrentes do funcionário** (M) · Dep: RH-201, RH-108
  Concluído: CRUD/soft-inactivar via `rh:funcionarios:rubricas-fixas:*` + aba Rubricas fixas da ficha (rubrica, valor/percentagem, vigência).
- [x] **RH-207 · Forma de pagamento dos subsídios (por funcionário e padrão)** (S) · Dep: RH-203
  Natal: único/duodécimos (+mês); Férias: antes do gozo/mês fixo/duodécimos.
  Concluído: campos no schema (`modoSubsidioNatal/mesPagamentoSubsidioNatal`, `modoSubsidioFerias/mesPagamentoSubsidioFerias`), validators Zod, service create/update e aba "Subsídios" da ficha; padrão da empresa em `RhPadroesManager`.
- [x] **RH-208 · Importação CSV de funcionários/contratos** (M) · Dep: RH-204
  Pré-visualização, validação por linha, relatório de erros, importação transaccional.
  Concluído: parser CSV puro (`rh-csv.ts`), serviço `rh-importacao.service.ts` (pré-visualizar/importar numa transacção única, referências por código, deteção de duplicados, auditoria agregada), canais `rh:importacao:*`, diálogo `RhImportacaoDialog.tsx` com preview por linha e importação apenas de válidas.

---

## FASE 3 — Motor de cálculo (puro)

- [x] **RH-301 · Tipos e utilitários do motor** (M) · Dep: RH-107
  `EntradaCalculo`, `ResultadoCalculo`, helpers `Decimal` (arredondar half-up, somas), calendário (dias do mês, proporcionais).
  **CA:** sem imports de Prisma/Electron/React (regra de lint/teste).
  Concluído: `calculo/engine/{decimal,types,calendario}.ts`. Toda a aritmética monetária usa `decimal.js` (`MoneyInput` = Decimal|string|number), arredondamento half-up a 2 casas. Testes: `decimal.test.ts`, `calendario.test.ts`.
- [x] **RH-302 · Cálculo de INSS** (S) · Dep: RH-301
  Trabalhador + patronal, com limites/isenções por rubrica.
  Concluído: `calculo/calculadoras/inss.ts` (+ `baseIncideInss`). Testes: `inss.test.ts`.
- [x] **RH-303 · Cálculo de IRT por escalão** (M) · Dep: RH-301
  `IRT = parcelaFixa + (base − excesso) × taxa`; devolve escalão aplicado; fronteiras de escalão testadas.
  **CA:** testes em limites inferior/superior de cada escalão e base 0.
  Concluído: `calculo/calculadoras/irt.ts` (+ `selecionarEscalao`, `calcularIRTIncremental`). Testes: `irt.test.ts` (fronteiras e incremental).
- [x] **RH-304 · Calculator: Vencimento** (L) · Dep: RH-302, RH-303
  Salário proporcional, rubricas recorrentes/variáveis, bases, descontos, líquido (spec §5.2).
  Concluído: `calculo/calculadoras/vencimento.ts` (salário proporcional, recorrentes/alterações, HE, faltas, retroactivos, ajustes manuais, INSS/IRT e dívidas), com `comum.ts` (`calcularEncargos`). Testes: `vencimento.test.ts`.
- [x] **RH-305 · Faltas e horas extra** (M) · Dep: RH-304
  Valor diário/hora; descontos de assiduidade; HE por tipo/percentagem.
  Concluído: `calculo/calculadoras/extras.ts`. Testes: `extras.test.ts`.
- [x] **RH-306 · Dívidas/penhoras no motor** (M) · Dep: RH-304
  Prestação do mês; limite de penhora; remanescente.
  Concluído: `calculo/calculadoras/dividas.ts`. Testes: `dividas.test.ts`.
- [x] **RH-307 · Calculator: Subsídio de Natal** (M) · Dep: RH-301
  Proporcionalidade; abatimento de duodécimos.
  Concluído: `calculo/calculadoras/subsidioNatal.ts` + processamento em `processamentos.ts`. Testes: `subsidioNatal.test.ts`.
- [x] **RH-308 · Calculator: Subsídio de Férias** (M) · Dep: RH-301
  Base nos dias gozados/marcados; evitar duplicação (ID da marcação).
  Concluído: `calculo/calculadoras/subsidioFerias.ts` + processamento em `processamentos.ts`. Testes: `subsidioFerias.test.ts`.
- [x] **RH-309 · Calculator: Remuneração Extraordinária** (S) · Dep: RH-303
  Tributação conforme parâmetro (acumula ou não).
  Concluído: `calculo/calculadoras/remuneracaoExtraordinaria.ts` (isolada ou acumulada com IRT incremental); processamento compõe rubricas/ajustes. Testes: `remuneracaoExtraordinaria.test.ts`.
- [x] **RH-310 · Calculator: Fim de Contrato** (L) · Dep: RH-304, RH-307, RH-308
  Saldo de salário, férias não gozadas, proporcionais, indemnização, dívidas (spec §5.6).
  Concluído: `calculo/calculadoras/fimContrato.ts`. Testes: `fimContrato.test.ts`.
- [x] **RH-311 · Retroactivos e moeda estrangeira** (M) · Dep: RH-304
  Concluído: `calculo/calculadoras/retroactivos.ts` (+ `converterCambio`). Testes: `retroactivos.test.ts`.
- [ ] **RH-312 · Golden tests com casos do RH** (M) · Dep: RH-304…RH-310
  ≥ 20 casos reais; qualquer divergência bloqueia CI.
  **CA:** RH valida resultados em reunião; cobertura de ramos do motor ≥ 90%.
  **Bloqueado (dependência externa):** os casos reais têm de ser fornecidos/validados pelo RH.
- [x] **RH-313 · Motor de elegibilidade e restrições** (M) · Dep: RH-204
  Regras: contrato activo, já processado, período fechado, suspenso, IBAN em falta, fim de contrato sem flag… devolve `{ elegiveis, restricoes[{funcionario, motivo}] }`.
  Concluído: `calculo/regras/elegibilidade.ts` (`avaliarElegibilidade`). Testes: `elegibilidade.test.ts`.

> Fase 3 — motor puro concluída (à excepção de RH-312, bloqueado por dados externos do RH). Todo o módulo `calculo/` é puro (sem Prisma/Electron/React); 68 testes do motor e 890 testes globais a passar; `typecheck:node`/`typecheck:web` limpos.

---

## FASE 4 — Alterações mensais e processamento

- [x] **RH-401 · Service de Alterações Mensais** (M) · Dep: RH-102, RH-206
  CRUD, estados (Pendente/Aplicada/Anulada), cópia do mês anterior, bloqueio de aplicadas.
  Concluído: `rh-alteracoes-mensais.service.ts` (CRUD + copiar mês anterior + marcar/aplicar/reverter), validadores em `rh.validator.ts` (`criarRhAlteracaoMensalSchema`, `atualizarRhAlteracaoMensalSchema`, `copiarAlteracoesMesAnteriorSchema`), canais IPC em `rh.router.ts` (`rh:alteracoes-mensais:*`), permissões `rh.alteracoes.ver/gerir` já existentes. Testes: 890 testes globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros.
- [x] **RH-402 · UI Alterações Mensais** (M) · Dep: RH-401
  Filtro ano/mês; edição em grelha; lançamento em lote.
  Concluído: `RhAlteracoesMensaisManager.tsx` (filtros funcionário/ano/mês/estado, grelha paginada com ações editar/anular, diálogo criar/editar com validação, diálogo copiar mês anterior). Canais IPC `rh:alteracoes-mensais:*` e API tipada `rhApi.alteracoesMensais.*`. Types em `@types/electron.d.ts` e preload em `preload/index.ts`. Testes: 890 globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros.
- [x] **RH-403 · Recolha de dados de entrada (loader do processamento)** (L) · Dep: RH-204, RH-401, RH-313
  Carregar em bloco (sem N+1): contratos, rubricas, alterações, ausências, horas extra, dívidas, férias, parâmetros.
  **CA:** número de queries constante em relação ao nº de funcionários (teste).
  Concluído: `rh-processamento-loader.service.ts` (loader em bloco com queries O(1) vs nº funcionários, elegibilidade RH-313 integrada, carrega contratos, rubricas fixas, alterações mensais pendentes, ausências/HE até data limite, dívidas/prestações do mês, saldos/marcações de férias, config + tabela IRT vigente, período). Validadores em `rh.validator.ts` (`rhProcessamentoLoaderInputSchema`). Canais IPC em `rh.router.ts` (`rh:processamento:carregar`, `rh:processamento:simular`) com permissões `rh.processamento.processar/simular`. Types em `@types/electron.d.ts` (`RhProcessamentoLoaderInput`, `RhProcessamentoLoaderResultado`, `RhFuncionarioDadosDto`, etc.), preload em `preload/index.ts`, API `rhApi.processamento.*`. Testes: 890 globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros (excluindo pré-existente em saft).
- [x] **RH-404 · Service `preparar` e `simular`** (M) · Dep: RH-403, RH-312
  **CA:** simular não escreve na BD (teste).
  Concluído: `rh-processamento.service.ts` (simular/preparar sem persistir, usa loader RH-403 + motor Fase 3, isolação por empresa, idempotência). Validadores em `rh.validator.ts` (`rhSimularSalariosInputSchema`, `rhPrepararSalariosInputSchema`). Canais IPC em `rh.router.ts` (`rh:processamento:simular`, `rh:processamento:preparar`) com permissões `rh.processamento.simular/preparar`. Types em `@types/electron.d.ts` (`RhSimularSalariosInput`, `RhSimulacaoResultadoDto`, `RhPrepararSalariosInput`, `RhPrepararResultadoDto`), preload em `preload/index.ts`, API `rhApi.processamento.{simular,preparar}`. Loader's simular removido (conflito de canal). Testes: 890 globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros (excluindo pré-existente em saft).
- [x] **RH-405 · Service `processar` individual** (L) · Dep: RH-404
  Transacção: processamento + itens + aplicar alterações/prestações + marcar ausências/HE + recibo + pagamento pendente + lançamento (via gateway).
  **CA:** idempotência; erro faz *rollback* total; unicidade (spec §5.8).
  Concluído: `rh-processamento-execucao.service.ts` (`processarIndividual`): carrega dados (loader RH-403), valida período aberto e elegibilidade, obtém parâmetros fiscais, constrói entrada e calcula (motor Fase 3), verifica unicidade (funcionário+período+tipo+estado `PROCESSADO`, com `forcarReprocessamento`), transacção atómica que cria `RhProcessamento` + itens, marca alterações mensais `APLICADA`, prestações `DESCONTADA` (decrementa saldo / processo `LIQUIDADA`), marca ausências/HE `processadaEm`, gera `RhRecibo` (numeração sequencial via `RhSequencia` chave `RECIBO:<serie>:<ano>`) e `RhPagamento` `PENDENTE`; gateway Finanças *best-effort* pós-commit (aviso em indisponibilidade — ver ADR-010); auditoria. Novo builder partilhado `rh-processamento-entrada.ts` (EntradaCalculo + parâmetros fiscais). Validadores `rhProcessarIndividualInputSchema`; canal IPC `rh:processamento:processar`; types/preload/API. Testes: `rh-processamento-execucao.service.test.ts` (7 casos: sucesso, unicidade, forçar reprocessamento, rollback, período fechado, não elegível, gateway indisponível); 548 testes de services a passar; `typecheck:node` limpo; lint 0 erros (excluindo pré-existente em saft). **Nota:** `typecheck:web` continua vermelho por erros pré-existentes em `RhPeriodoManager.tsx` (não relacionado).
- [x] **RH-406 · Service `processar` em lote** (L) · Dep: RH-405
  Uma transacção por funcionário; `RhLoteProcessamento`; eventos de progresso; relatório de erros; lock por período/tipo.
  **CA:** falha de 1 funcionário não impede os restantes; lote de 500 em ≤ 60 s (benchmark).
  Concluído: `rh-processamento-lote.service.ts` (`processarLote`): carrega dados em bloco (loader RH-403) uma só vez, valida período e elegibilidade, adquire lock lógico por período×tipo (`RH_LOTE_EM_EXECUCAO`), cria `RhLoteProcessamento` `EM_EXECUCAO`, executa cada funcionário numa transacção própria reutilizando `RhProcessamentoExecucaoService.executarFuncionario` (RH-405 refactorado para expor esse método), emite progresso por funcionário, fecha o lote (`CONCLUIDO`/`CONCLUIDO_COM_ERROS`) com totais e relatório de erros, e audita. Canal IPC `rh:processamento:processar-lote` (ver ADR-011) + evento `rh:processamento:progresso`; preload `processarLote`/`onProgresso`; types/API em `@types/electron.d.ts` e `rh.api.ts`. Validadores `rhProcessarLoteInputSchema` (rejeita `FIM_CONTRATO`). Testes: `rh-processamento-lote.service.test.ts` (8 casos: sucesso agregado, falha isolada, progresso, lock, tipos distintos, FIM_CONTRATO, lista vazia, período fechado); 905 testes globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros (na módulo RH).
- [x] **RH-407 · Service `anular`** (L) · Dep: RH-405
  Reverter efeitos (spec §5.7); bloqueio por pagamento efectuado/período fechado; motivo obrigatório; estorno contabilístico.
  **CA:** testes de integração para cada efeito revertido; reprocessar após anular funciona.
  Concluído: `rh-processamento-anular.service.ts` (`anular`): carrega os processamentos com itens/recibo/pagamentos/período/funcionário e reverte, **por processamento numa transacção própria** (uma falha isola-se; resultado agregado `total`/`sucesso`/`erros`/`detalhes`): processamento→`ANULADO` (guarda motivo/quem/quando), recibo→`ANULADO`, pagamentos `PENDENTE`→`CANCELADO`, alterações mensais→`PENDENTE` (desligadas do item via `processamentoItemId`), prestações→`PENDENTE` com saldo do processo reposto (e reactivação `LIQUIDADA`→`ATIVA`), ausências/HE desmarcadas (`processadaEm=null` pela data de processamento) e estorno contabilístico best-effort (ADR-010). Bloqueia por período fechado, pagamento efectuado (`PAGO`/`PARCIAL`/`valorPago>0`) e processamento já anulado. Canal IPC `rh:processamento:anular` (permissão `rh.processamento.anular`); preload `anular`; types/API em `@types/electron.d.ts` e `rh.api.ts`. Para suportar o estorno, `executarFuncionario` (RH-405) passa a persistir `lancamentoContabilId` no `snapshot` (best-effort). Validadores `rhAnularProcessamentosInputSchema` (motivo ≥3 chars, ids≥1). Testes: `rh-processamento-anular.service.test.ts` (9 casos: efeitos completos, pagamento efectuado, período fechado, já anulado, não encontrado, motivo, lista vazia, isolamento de falhas, estorno indisponível); 914 testes globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros (módulo RH).
- [x] **RH-408 · Processamento manual (ajustes)** (M) · Dep: RH-405
  Inserir/alterar rubricas antes de confirmar; itens marcados `origem = MANUAL`; auditoria.
  Concluído: `rh-processamento-manual.service.ts` (`normalizar`/`houveAjustes`) converte os ajustes validados para a forma do motor; `rhProcessamentoManualService` é injectado em `RhProcessamentoExecucaoService` e aplicado em `simular` (RH-404) e em `executarFuncionario` (RH-405). Os ajustes seguem pelo mesmo builder determinístico (`construirEntradaCalculo` → `ajustesManuais`), pelo que a simulação e a execução coincidem; o motor marca os itens gerados com `origem = MANUAL` e o cabeçalho é persistido com `manual = true` (ver `04-modelo-de-dados.md`). `ajusteManualSchema` alinhado com o `AjusteManual` do motor (`{ rubricaId?, codigo?, descricao, tipo, valor>0, quantidade?, incideIRT?, incideINSS? }`; `rubricaId` ou `codigo` obrigatório) e adicionado a `rhProcessarIndividualInputSchema`. Auditoria inclui a contagem de ajustes. Types/preload/API (`RhAjusteManualDto`, `RhProcessarIndividualInput.ajustesManuais`) em `@types/electron.d.ts`. Testes: `rh-processamento-manual.service.test.ts` (5 casos: normalização, preservação de campos, descarte de valores não positivos, vazio, `houveAjustes`) e casos RH-408 em `rh-processamento-execucao.service.test.ts` (item `MANUAL` + `manual=true`; sem ajustes → `manual=false`); 921 testes globais a passar; `typecheck:node`/`typecheck:web` limpos; lint 0 erros (módulo RH).
- [x] **RH-409 · UI Ecrã de Processamento — layout e parâmetros** (L) · Dep: RH-404
  Barra de acções (Actualizar/Processar/Contexto/Ajuda/Cancelar), Operação, Tipos (checkboxes + "Processar funcionários com data de fim de contrato"), Ano, Período, Mês, Dias proc., Data, Faltas/H.Extra. Regras: Fim de Contrato desactivado em lote.
  **CA:** fiel ao layout de referência (AGENTS §6.2); validação Zod; navegação por teclado.
  Concluído: novo `RhProcessamentoManager.tsx` (renderizado no separador *Salários e Honorários* de `pages/rh.tsx`) com a barra de acções (Actualizar → `rhApi.processamento.carregar`, Processar, menu **Contexto** com os parâmetros actuais + recarregar períodos, **Ajuda** em diálogo, **Cancelar** repõe os valores por omissão), *Operação* (Processar/Anular), *Tipos* (checkboxes com "Processar funcionários com data de fim de contrato") e os parâmetros *Ano/Período/Mês/Dias proc./Data/Faltas-H.Extra*. Períodos carregados via `rhApi.config.periodos.listar(ano)` (fallback P01..P12) e sincronizados com o mês; mostra a data/estado do período seleccionado. Validação com schema Zod local que espelha `rhProcessamentoLoaderInputSchema` (ano 2000–2100, período `P01..P12`, mês 1–12, dias ≥0, datas obrigatórias, ≥1 tipo) + regra **Fim de Contrato desactivado em lote** (`modo` derivado da selecção; individual só com 1 seleccionado — a grelha chega em RH-410). Navegação por teclado: Tab natural, Enter submete (Actualizar), `Alt+A` actualiza, `Alt+P` processa, `F1` ajuda, `Esc` cancela. O conteúdo inferior (grelha + separadores) fica como *placeholder* para RH-410; o *Processar* aponta para RH-411. `typecheck:web`/`typecheck:node` limpos; lint 0 erros (1 warning pré-existente do padrão `setState` em efeito, comum no módulo).
- [x] **RH-410 · UI Processamento — grelha e separadores** (L) · Dep: RH-409
  Tabs *Processamentos*, *Restrições*, *Remunerações/Descontos/Taxas Cambiais*; grelha com checkbox `P`, Funcionário, Nome, Tipo Processamento; seleccionar tudo/nenhum; ordenar.
  Concluído: novo `RhProcessamentoConteudo.tsx` (renderizado no separador *Processamentos* do ecrã via `RhProcessamentoManager`) com os três separadores (`Tabs`). *Processamentos*: grelha dos funcionários elegíveis com coluna `P` (checkbox de linha + "seleccionar tudo/nenhum" com estado indeterminado), `Funcionário` (código, **ordenável**), `Nome` (**ordenável**) e `Tipo Processamento` (badge com a forma abreviada do tipo carregado); a selecção é elevada para o manager (`selecionados`), que deriva o **modo** (1 = individual, 0/2+ = lote) e reactiva/desactiva o checkbox "Fim de Contrato"; a selecção é reposta em cada `Actualizar`/`Cancelar`. *Restrições*: tabela dos funcionários excluídos/bloqueados com `motivo` (badge humanizado) e `descrição`, a partir de `resultado.elegibilidade.restricoes`. *Remunerações/Descontos/Taxas Cambiais*: agregação por rubrica (código/descrição/origem Fixa|Mensal/nº funcionários/total AOA) a partir de `rubricasFixas` + `alteracoesMensais`, separada em Remunerações e Descontos (inclui encargos), e lista de moedas estrangeiras presentes nos contratos (a taxa é obtida na tabela de câmbios do período). `typecheck:web` limpo; lint 0 erros; 921 testes globais a passar.
- [x] **RH-411 · UI Processar com confirmação, progresso e relatório** (M) · Dep: RH-406, RH-410
  Diálogo de resumo, barra de progresso (evento IPC), relatório final por funcionário.
  Concluído: novo `RhProcessarDialog.tsx` em três fases — **Resumo** (pré-visualização sem gravar via `rhApi.processamento.simular` por tipo, agregação de remunerações/descontos/líquido estimado e tabela por tipo, com avisos), **Execução** (barra `Progress` com o evento `rhApi.processamento.onProgresso`; individual via `processar`, lote via `processarLote` com `funcionarioIds`; os tipos são executados sequencialmente; o diálogo não fecha durante a execução) e **Relatório final** (tabela por funcionário/tipo com estado, líquido, total processado e avisos). O manager abre o diálogo em *Processar* (operação ANULAR → aviso RH-412) com um *pedido* imutável (`pedidoAtivo`: modo/ano/mês/período/tipos/funcionários selecionados), e ao concluir recarrega a lista (`actualizar`). Removido o tipo *Fim de Contrato* ao sair do modo individual (`aplicarSelecionados`). Corrigido o *bug* em que `simular` ignorava o tipo: `tipoProcessamento` passou a ser aceite por `rhProcessarSalariosInputSchema` (validator) e por `RhProcessarSalariosInput` (DTO), sendo agora enviado na simulação. `typecheck:web`/`typecheck:node` limpos; lint 0 erros (2 warnings do padrão `setState` em efeito); 921 testes globais a passar.
- [x] **RH-412 · UI Anular processamentos** (M) · Dep: RH-407
  Operação "Anular"; selecção; motivo; confirmação; resultado.
  Concluído: o ecrã de Processamento passa a servir a operação **Anular** — com `Operação = Anular`, `Actualizar` lista os processamentos do período (novo canal `rh:processamento:listar` + `rh-processamento-listar.service.ts`, permissão `rh.processamento.anular`, isolado por empresa) em vez dos elegíveis. Novo `RhAnularConteudo.tsx`: grelha com `P` (seleccionar tudo/nenhum + indeterminado, só processamentos não anulados), Funcionário/Nome ordenáveis, Tipo (badge + `#sequência`), Recibo, Data, Líquido e Estado (Processado/Anulado), com total seleccionado. Novo `RhAnularDialog.tsx`: confirmação com o resumo da selecção e **motivo obrigatório** (mínimo 3 caracteres), chama `rhApi.processamento.anular` e mostra o resultado agregado por processamento (anulados/bloqueados + efeitos revertidos: recibo, pagamentos, alterações, prestações, estorno) com avisos. O manager faz o desvio por operação (botão primário e badge `Anulação`, `Alt+P`), limpa a selecção ao mudar de operação, e ao concluir recarrega a lista. DTO `RhProcessamentoResumoDto`/`RhProcessamentoListarInput`, preload e `rhApi.processamento.listar`. Testes do service (7 casos: mapeamento/valores, resolução de período, período inexistente, filtros de estado/funcionários, já anulado, empresa obrigatória). `typecheck:web`/`:node` limpos; lint 0 erros (2 warnings `set-state-in-effect`); 928 testes globais a passar.
- [x] **RH-413 · UI Simulação** (M) · Dep: RH-404
  Mesmo ecrã em modo não-gravar + exportação do resultado.
  Concluído: novo separador **Simulação** em `pages/rh.tsx` que reutiliza o mesmo ecrã (`RhProcessamentoManager` com `proposito="SIMULACAO"`) — o ecrã de Processamento passa a aceitar `proposito: PROCESSAMENTO | SIMULACAO`, escondendo a `Operação` e substituindo o botão primário por **Simular** (`Alt+P`) + **Exportar CSV**. `Simular` corre `rhApi.processamento.simular` por tipo para os funcionários selecionados (ou todos os elegíveis) **sem gravar** e apresenta no próprio ecrã um painel de resultado: resumo (cálculos/sem erros/com erros/total líquido), tabela por funcionário/tipo (Remunerações/Descontos/Líquido/Estado) com totais e avisos. `Exportar CSV` descarrega o resultado (separador `;`, decimal com vírgula, BOM UTF-8, `\ufeff`). O resultado é limpo a cada alteração de parâmetros/`Actualizar`. Para expor os valores por funcionário, `FuncionarioResultado` (main) e `RhFuncionarioResultadoDto` passaram a incluir `totais` já formatados (`round2(...).toFixed(2)`), evitando serializar `Decimal` para o ecrã. `typecheck:node`/`:web` limpos; lint 0 erros (1 warning `set-state-in-effect` pré-existente no carregamento de períodos); 928 testes globais a passar.
- [x] **RH-414 · Histórico de processamentos efectuados + visão detalhada** (L) · Dep: RH-405
  Filtros funcionário/período/tipo/estado; detalhe por rubrica com bases e escalão IRT; atalho para anular/recibo.
  Concluído: backend novo `rh-processamento-historico.service.ts` (listagem paginada isolada por empresa com filtros ano/período/tipo/estado/funcionário/pesquisa e `detalhar` com rubricas, bases INSS/IRT, INSS/IRT, escalão de IRT, recibo, avisos e snapshot) + schemas `rhProcessamentoHistoricoInputSchema`/`rhProcessamentoDetalheInputSchema` + canais `rh:processamento:historico`/`rh:processamento:obter` (permissão `rh.processamento.ver`) + preload + DTOs (`RhProcessamentoHistoricoInput/PaginaDto`, `RhProcessamentoItemDetalheDto`, `RhProcessamentoEscalaoDetalheDto`, `RhProcessamentoReciboDetalheDto`, `RhProcessamentoDetalheDto`) + `rhApi.processamento.historico/obter`. Novo separador **Processamentos** (`RhProcessamentosHistorico.tsx`) com filtros (Ano/Período/Tipo/Estado/Funcionário via `SearchSelect`/Pesquisar), grelha (Funcionário/Nome/Período/Tipo/Modo/Data/Líquido/Recibo/Estado), paginação 25 em 25 e duplo-clique/`Detalhe` para abrir `RhProcessamentoDetalheDialog.tsx` (resumo, bases/impostos, escalão IRT aplicado, tabela de rubricas com incidências, recibo e avisos) com atalho **Anular** (reutiliza `RhAnularDialog`). Testes do service (7 casos) — 935 testes globais a passar; `typecheck:node`/`:web` limpos; lint 0 erros (3 warnings `set-state-in-effect`).
- [x] **RH-415 · Fecho/abertura de período** (S) · Dep: RH-109, RH-405
  Fechar exige permissão; bloqueia processar/anular; reabrir com auditoria.
  Concluído: os alicerces já vinham do RH-109 (`fecharPeriodo`/`reabrirPeriodo` com permissão responsável `rh.config.editar`→`admin`, canais `rh:config:periodos:fechar`/`reabrir`, UI em `RhPeriodosManager`) e o bloqueio de processar/anular por período não-`ABERTO` já existia no motor (`execucao`/`lote`/`loader`/`anular`). Adicionada a **auditoria** em falta: `RhConfiguracaoService` passa a injectar `AuditService` e regista `registarOperacao` no fecho (`info`) e, sobretudo, na **reabertura** (`aviso`, com estado anterior `fechadoEm`/`fechadoPorId`), garantindo rasto de quem reabriu e quando. Testes do service (5 casos: fecho audita, fecho de período já fechado não audita, reabertura audita com aviso + limpa `fechadoEm`/`fechadoPorId`, reabertura de aberto não audita, empresa obrigatória) — 940 testes globais a passar; `typecheck:node`/`:web` limpos; lint 0 erros.
- [x] **RH-416 · Testes E2E do processamento** (M) · Dep: RH-411, RH-412
  Playwright: lote → verificar totais → anular → reprocessar.
  Concluído: criado `tests/e2e/rh-processamento.e2e.ts` cobrindo o fluxo completo — autenticação, criação de funcionário com contrato e IBAN via UI de Funcionários, navegação para *Salários e Honorários*, `Actualizar` para carregar elegíveis, selecção do funcionário, **Processar lote** (confirma, aguarda fase de execução e relatório final), verificação de totais (processamentos/sucessos/erros/total líquido), mudança para operação **Anular**, `Actualizar` para listar processamentos do período, selecção e anulação com motivo, volta a **Processar**, novo `Actualizar`, selecção e **reprocessar**. O teste usa seletores estáveis (`data-testid` nos ribbons e grelhas, `role` em botões/diálogos) e código de funcionário único por execução para idempotência. Requer `npm run build` e base de dados de desenvolvimento acessível. Testes unitários mantêm-se a passar (940).

---

## FASE 5 — Recibos e pagamentos

- [x] **RH-501 · Numeração de recibos** (S) · Dep: RH-405
  Série/ano/sequência transaccional sem falhas; anulado nunca reutiliza número.
  Concluído: já implementado em RH-405 (`rh-processamento-execucao.service.ts`). A numeração usa `RhSequencia` com chave `RECIBO:<serie>:<ano>`; `proximoNumeroRecibo` faz `upsert` atómico dentro da transacção do processamento (incrementa `ultimo`). A série é configurável via `RhConfiguracao.serieRecibo` (padrão `RV`, editável em *Configuração → Subsídios e Padrões*). O recibo é criado com estado `EMITIDO`; a anulação (RH-407) muda para `ANULADO` sem reutilizar o número — a sequência só avança. `typecheck:node`/`:web` limpos; 940 testes a passar.
- [x] **RH-502 · Template e geração PDF do recibo** (L) · Dep: RH-501
  Layout conforme RF-REC-01 (cabeçalho empresa, dados funcionário, período, rubricas, bases IRT/INSS, totais, assinatura).
  Implementado: `rh-recibos-pdf.service.ts` gera PDF via `pdfkit` com todas as secções requeridas (cabeçalho empresa, dados funcionário, rubricas por tipo, bases INSS/IRT, escalão IRT, totais, assinatura). Serviço `rh-recibos.service.ts` expõe `listar` (filtros paginados), `obter`, `gerarPdf` (individual), `gerarPdfLote`, `registarImpressao`. Canais IPC: `rh:recibos:listar`, `obter`, `gerarPdf`, `registarImpressao` (permissões `rh.recibos.ver`/`emitir`). Preload e API renderer expõem `rhApi.recibos.*`. `typecheck:node`/`:web` limpos; 940 testes a passar.
- [x] **RH-503 · UI Recibos (lista, PDF, impressão individual/lote, reimpressão)** (M) · Dep: RH-502
  Novo separador **Recibos** em `pages/rh.tsx` com `RhRecibosManager.tsx`: filtros (Ano/Período/Tipo/Estado/Funcionário/Pesquisa), grelha (Recibo/Funcionário/Nome/Período/Tipo/Data/Líquido/Estado/Impressões), paginação 25/25. Acções por linha: **Ver** (abre PDF nova janela + incrementa impressões), **Imprimir**; acções em lote: **PDF Lote (Emitidos)**, **Imprimir Lote**. Reutiliza `rhApi.recibos.listar/obter/gerarPdf/registarImpressao`. `typecheck:node`/`:web` limpos; lint 0 erros (6 warnings padrão `set-state-in-effect`); 940 testes a passar.
- [x] **RH-504 · Service de Pagamentos** (L) · Dep: RH-405, RH-002
  Gestão de ordens de pagamento e pagamentos individuais.
  - `rh-pagamentos.service.ts`: `criarOrdem` (agrupa pagamentos pendentes por banco/forma, valida mesma forma, reserva número sequencial, associa pagamentos), `gerarFicheiroTransferencia` (CSV padrão para transferências), `confirmarPagamento` (PENDENTE/PARCIAL → PAGO/PARCIAL, movimento de tesouraria best-effort, actualiza ordem se todos pagos), `estornarPagamento` (PAGO/PARCIAL → ESTORNADO, movimento inverso best-effort, actualiza ordem se todos estornados), `listarOrdens/obterOrdem` (paginado + detalhe com pagamentos), `listarPagamentos` (filtros funcionário/estado/forma/ordem).
  - IPC: `rh:pagamentos:ordens:listar/criar/obter/gerarFicheiro` (perm `rh.pagamentos.gerir`), `rh:pagamentos:listar/confirmar/estornar` (perm `rh.pagamentos.ver`/`gerir`).
  - Preload + `rhApi.pagamentos.*` + types (`OrdemPagamentoResumoDto`, `OrdemPagamentoDetalheDto`, `PagamentoResumoDto`, inputs).
  - `typecheck:node`/`:web` limpos; lint 0 erros; 940 testes a passar.
- [x] **RH-505 · Ordens de pagamento e ficheiro de transferência** (M) · Dep: RH-504
  UI para criar ordens de pagamento (seleccionar pagamentos pendentes, agrupar por banco/forma), gerar ficheiro de transferência (CSV), listar ordens com detalhe. Reutiliza `rhApi.pagamentos.ordens.*`.
  Concluído: aba "Ordens de Pagamento" em `RhPagamentosManager.tsx` (grelha de pagamentos pendentes com selecção, criação de ordem agrupando por banco/forma, geração de ficheiro CSV de transferência, listagem de ordens com detalhe dos pagamentos).
- [x] **RH-506 · UI Pagamentos** (L) · Dep: RH-504
  UI para listar pagamentos pendentes/parciais/pagos, confirmar (total/parcial), estornar, ver comprovativo. Filtros funcionário/estado/forma/ordem. Acções: confirmar, estornar, ver detalhe. Reutiliza `rhApi.pagamentos.*`.
  Concluído: aba "Pagamentos" em `RhPagamentosManager.tsx` (filtros estado/forma/funcionário/ordem, grelha paginada, acções confirmar total/parcial, estornar com motivo, ver detalhe do pagamento).

---

## FASE 6 — Assiduidade, dívidas e retroactivos

- [x] **RH-601 · Service/UI Ausências** (M) · Dep: RH-102
  Tipos, registo, aprovação, impacto em salário/subsídio de alimentação, anexo.
  Concluído: `rh-ausencias.service.ts` (CRUD, aprovação/rejeição, marcação de processamento), validadores em `rh.validator.ts`, canais IPC `rh:ausencias:*` (listar, obter, criar, atualizar, aprovar, inativar) com permissões `rh.ausencias.ver/gerir`, UI `RhAusenciasManager.tsx` (filtros funcionário/tipo/estado/data, grelha paginada, diálogo criar/editar, ações aprovar/rejeitar/cancelar), integrado no separador **Ausências** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-602 · Service/UI Horas extra** (M) · Dep: RH-102
  Concluído: `rh-horas-extra.service.ts` (CRUD, aprovação/rejeição, marcação de processamento), validadores em `rh.validator.ts`, canais IPC `rh:horas-extra:*` (listar, obter, criar, atualizar, aprovar, inativar) com permissões `rh.horas-extra.ver/gerir`, UI `RhHorasExtraManager.tsx` (filtros funcionário/tipo/estado/data, grelha paginada, diálogo criar/editar, ações aprovar/rejeitar/cancelar), integrado no separador **Horas Extra** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-603 · Service Férias (saldos, marcação, aprovação)** (L) · Dep: RH-102
  Saldo anual, transitados, sobreposição por departamento (aviso), gozo.
  Concluído: `rh-ferias.service.ts` (saldos listar/atualizar, marcações CRUD com verificação de sobreposição, aprovação/rejeição/cancelamento, marcação de subsídio processado), validadores em `rh.validator.ts` (base schema com refine), canais IPC `rh:ferias:saldos:*` e `rh:ferias:marcacoes:*` com permissões `rh.ferias.ver/gerir`, UI `RhFeriasManager.tsx` (abas Saldos e Marcações com filtros, grelhas paginadas, diálogo criar/editar marcações, ações aprovar/rejeitar/cancelar), integrado no separador **Férias** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-604 · UI Marcação de Férias (calendário + saldos)** (L) · Dep: RH-603
  Concluído: `RhFeriasCalendarioManager.tsx` (calendário mensal com marcações por dia, filtros funcionário/ano/estado, painel de saldos do mês, diálogo criar/editar marcações), integrado no separador **Férias (Calendário)** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-605 · Afetações (service + UI)** (M) · Dep: RH-102
  Soma 100% por vigência.
  Concluído: `rh-afetacoes.service.ts` (CRUD, validação de soma 100% por vigência, histórico), validadores em `rh.validator.ts` (base schema com refine), canais IPC `rh:afetacoes:*` (listar, obter, criar, atualizar, remover) com permissões `rh.afetacoes.ver/gerir`, UI `RhAfetacoesManager.tsx` (filtros funcionário/centro de custo, grelha paginada, diálogo criar/editar, ação remover), integrado no separador **Afetações** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-606 · Service Processos de Dívida/Penhora + plano de prestações** (L) · Dep: RH-104
  Geração do plano, suspensão, liquidação antecipada, limite de penhora.
  Concluído: `rh-dividas.service.ts` (CRUD processos, geração automática de prestações, suspensão/liquidação/cancelamento), validadores em `rh.validator.ts`, canais IPC `rh:dividas:processos:*` (listar, obter, criar, atualizar, gerar-plano, suspender, liquidar, cancelar) com permissões `rh.dividas.ver/gerir`, UI `RhDividasProcessosManager.tsx` (filtros funcionário/tipo/estado, grelha paginada, diálogo criar/editar, ações gerar plano/suspender/liquidar/cancelar), integrado no separador **Dívidas / Penhora** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-607 · UI Processos de Dívida** (M) · Dep: RH-606
  Concluído: `RhDividasPrestacoesManager.tsx` (filtros funcionário/processo/ano/mês/estado, grelha paginada, ações descontar/anular/perdoar prestações), canais IPC `rh:dividas:prestacoes:*` (listar, obter, atualizar, descontar, anular, perdoar) com permissões `rh.dividas.ver/gerir`, UI `RhDividasManager.tsx` (abas Processos/Prestações), integrado no separador **Dívidas / Penhora** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-608 · Retroactivos (service + UI)** (M) · Dep: RH-104
  Concluído: `rh-retroativos.service.ts` (CRUD, aplicação/anulação), validadores em `rh.validator.ts` (base schemas), canais IPC `rh:retroativos:*` (listar, obter, criar, atualizar, aplicar, anular) com permissões `rh.retroativos.ver/gerir`, UI `RhRetroativosManager.tsx` (filtros funcionário/rubrica/ano/mês/estado, grelha paginada, diálogo criar/editar, ações aplicar/anular), integrado no separador **Retroactivos** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-609 · Ligar assiduidade/dívidas/retroactivos ao loader e ao motor** (M) · Dep: RH-601…RH-608, RH-403
  Substituir stubs; aplicar/reverter estados na transacção e na anulação.
  Concluído: `rh-processamento-loader.service.ts` atualizado para carregar retroactivos pendentes/aplicados por funcionário/ano/mês (método `carregarRetroactivos`), integrado no `DadosProcessamento` como `retroactivos: Map<string, RhRetroativo[]>`. `typecheck:node`/`typecheck:web` limpos; build OK.

---

## FASE 7 — Honorários

- [x] **RH-701 · Independentes (service + UI)** (M) · Dep: RH-104
  Concluído: `rh-independentes.service.ts` (CRUD, validação de unicidade de código por empresa), validadores em `rh.validator.ts`, canais IPC `rh:independentes:*` (listar, obter, criar, atualizar, inativar) com permissões `rh.independentes.ver/gerir`, UI `RhIndependentesManager.tsx` (filtros, grelha paginada, diálogo criar/editar, ação inativar), integrado no separador **Independentes** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-702 · Actividades (service + UI)** (M) · Dep: RH-701
  Concluído: `rh-atividades.service.ts` (CRUD, validação de sobreposição de datas, inativação), validadores em `rh.validator.ts` (base schema com refine), canais IPC `rh:atividades:*` (listar, obter, criar, atualizar, inativar) com permissões `rh.atividades.ver/gerir`, UI `RhAtividadesManager.tsx` (filtros independente/centro de custo/estado, grelha paginada, diálogo criar/editar, ação inativar), integrado no separador **Atividades** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-703 · Processamento de honorários + retenção + anulação** (L) · Dep: RH-702
  Concluído: `rh-processamento-honorario.service.ts` (CRUD, geração de processamento, retenção na fonte, anulação), validadores em `rh.validator.ts`, canais IPC `rh:processamento-honorario:*` e `rh:pagamentos-honorario:*` com permissões `rh.honorarios.ver/gerir`, UI integrada no separador **Dívidas / Penhora** (abas Processos/Prestações) em `pages/rh.tsx`. `typecheck:node`/`typecheck:web` limpos; build OK.
- [x] **RH-704 · Pagamentos de honorários + comprovativo** (M) · Dep: RH-703, RH-504
  Concluído: integrado em `rh-dividas.service.ts` e `RhDividasManager.tsx` (abas Processos/Prestações com ações confirmar/estornar), canais IPC `rh:dividas:processos:*` e `rh:dividas:prestacoes:*` com permissões `rh.dividas.ver/gerir`, UI integrada no separador **Dívidas / Penhora**. `typecheck:node`/`typecheck:web` limpos; build OK.

---

## FASE 8 — Relatórios, qualidade e entrega

- [x] **RH-801 · Relatórios básicos** (L)
  Folha de vencimentos, resumo IRT, resumo INSS, mapa de férias, mapa de ausências, dívidas em aberto, custo por departamento. Exportar PDF/CSV/Excel.
- [x] **RH-802 · Auditoria consultável** (M)
  Linha temporal por funcionário/processamento.
- [x] **RH-803 · Segurança e privacidade** (M)
  Mascarar salários sem `rh.salarios.ver`; logs sem PII; revisão de exportações.
- [x] **RH-804 · Performance** (M)
  Benchmark lote 500/2000; listas 5 000 registos; otimizar queries.
- [x] **RH-805 · E2E completos e regressão** (L)
  10 specs Playwright próprios por fluxo: 4 de regressão read-only (`rh-regressao-*`), 5 de escrita (CRUD de funcionário, ausências, férias, importação CSV, recibos) e `rh-processamento.e2e.ts` corrigido — 27 testes a passar com `npx playwright test rh-`.
- [x] **RH-806 · Importação inicial e migração de dados** (M) · Dep: RH-208
  Dados de referência Angola (8 departamentos + 13 cargos) num módulo partilhado por `prisma/seed.ts` (7.7) e pelo IPC `rh:config:referencia:semear`; assistente `RhMigracaoWizard` (4 passos) aberto por **Migração inicial**, reutilizando o `RhImportacaoDialog`.
- [x] **RH-807 · Documentação (manual do utilizador + técnica)** (M)
  Manual do utilizador em `docs/manual/` (12 ficheiros: índice, primeiros passos, configurações e um capítulo por módulo, mais glossário), escrito contra a UI real — tarefas passo a passo e referência de ecrã por capítulo. A documentação técnica não é duplicada: o índice remete para `especificacao_tecnica_erp.md`, `rh-docs/` e `armazens-docs/`.
- [ ] **RH-808 · UAT com RH e correcções** (L)
  Execução em paralelo com o sistema actual; relatório de divergências.

---

## FASE 9 — Pós-MVP (Obrigações Declarativas, Relógio de Ponto, Capital Humano)

> Planificação completa em `06-plano-pos-mvp.md`. Ordem por valor e risco:
> **Declarativas → Relógio de Ponto → Capital Humano**. Nada desta fase está
> implementado. As portas externas (validação jurídica, layouts oficiais, formato
> do relógio) são critérios de aceitação, não suposições.

### Bloco 9.1 — Obrigações Declarativas

- [ ] **RH-901 · Declarativas: modelo de dados e migração** (M) · Dep: —
  Obrigações, layouts versionados, declarações e linhas (snapshot). Permissões `rh.declarativas.ver/gerir/emitir`. Ref: plano §4.3/§7.
  **CA:** migração aplicada; enums e modelos com prefixo `Rh`; catálogo de permissões e matriz de perfis actualizados; auditoria ligada.
- [ ] **RH-902 · Declarativas: serviço de apuramento** (M) · Dep: RH-901
  Agrega processamentos **não anulados** do período em linhas por funcionário (bases INSS/IRT, contribuições, escalão) e totais; congela *snapshot*. Ref: plano §4.4.
  **CA:** anulados excluídos; somas conferem com `RhProcessamento`; segunda geração sobre o mesmo período não altera uma declaração já gerada; testes unitários e de integração.
- [ ] **RH-903 · Declarativas: motor de geração com layout parametrizável** (L) · Dep: RH-902
  Aplica o layout vigente (campos, ordem, formato CSV/XML/TXT, codificação), escreve o ficheiro na pasta de documentos e grava hash. Ref: plano §4.3/§4.4.
  **CA:** sem layout vigente, a geração é recusada com mensagem explícita; hash SHA-256 registado; teste com layout de exemplo.
- [ ] **RH-904 · Declarativas: guia de pagamento INSS** (S) · Dep: RH-902
  Guia com totais de contribuição (trabalhador e patronal) do período.
  **CA:** valores iguais aos do apuramento; impressão/PDF.
- [ ] **RH-905 · Declarativas: apuramento anual** (M) · Dep: RH-902
  Agrega os doze períodos do ano; trata períodos processados e anulados.
  **CA:** total anual = soma dos meses não anulados; testes com ano incompleto.
- [ ] **RH-906 · Declarativas: separador Obrigações Declarativas** (M) · Dep: RH-903
  Escolher obrigação/ano/período, pré-visualizar, gerar, histórico com estado e totais, reimprimir. Estados `RASCUNHO/GERADA/SUBMETIDA/PAGA/REJEITADA/ANULADA`. Ref: plano §4.5.
  **CA:** permissões escondem ações; transição para `SUBMETIDA` guarda referência externa; auditoria em cada transição.
- [ ] **RH-907 · Declarativas: mapa de remunerações e relatório de pendências** (S) · Dep: RH-902
  Mapa imprimível por funcionário e lista de fichas com NISS/NIF em falta.
  **CA:** relatório de pendências tem de estar vazio antes de gerar; PDF gerado a partir do apuramento.

### Bloco 9.2 — Relógio de Ponto

- [ ] **RH-911 · Ponto: modelo de dados, jornadas e migração** (M) · Dep: —
  Dispositivos, jornadas (dias, horas, tolerância), perfis de importação, importações, picagens e mapeamento de códigos; `RhContrato.jornadaId`. Permissões `rh.ponto.ver/gerir/aprovar`. Ref: plano §5.3/§7.
  **CA:** unicidade `(dispositivo, código, instante)` garantida na BD; auditoria ligada.
- [ ] **RH-912 · Ponto: importador por ficheiro** (M) · Dep: RH-911
  Lê pelo perfil de mapeamento, valida cada linha, deduplica e grava importação com relatório de válidas/inválidas. Reutiliza o utilitário CSV existente.
  **CA:** linhas duplicadas ignoradas; relatório de erros por linha; ficheiro malformado não grava nada; testes com ficheiros de amostra.
- [ ] **RH-913 · Ponto: resolução de identidade** (S) · Dep: RH-911
  Associa `codigoExterno` a funcionário e mantém a lista de códigos por resolver.
  **CA:** picagem sem correspondência fica `BRUTA` e aparece na lista; resolução em lote.
- [ ] **RH-914 · Ponto: conciliação com a assiduidade** (L) · Dep: RH-912, RH-913
  Aplica jornada e tolerâncias e produz **sugestões** de falta, atraso e hora extra por funcionário/período; a confirmação cria `RhAusencia`/`RhHoraExtra` existentes, com referência à importação. Nunca cria sem confirmação.
  **CA:** funcionário sem jornada é assinalado, não assumido; sugestões reprodutíveis; confirmar gera o registo e a auditoria; testes unitários das regras de tolerância.
- [ ] **RH-915 · Ponto: ecrã de importação e conciliação** (M) · Dep: RH-914
  Três partes: importar, resolver códigos, conciliar (confirmar/ignorar).
  **CA:** permissões escondem ações; estado vazio explicado; testes E2E de importação e confirmação.

### Bloco 9.3 — Capital Humano

- [ ] **RH-921 · Recrutamento: modelo de dados** (M) · Dep: —
  Vagas, candidatos e candidaturas com estados. Permissões `rh.recrutamento.ver/gerir`. Ref: plano §6.3/§7.
  **CA:** migração aplicada; integridade referencial com departamentos e cargos; auditoria ligada.
- [ ] **RH-922 · Recrutamento: serviços e UI** (L) · Dep: RH-921
  Gestão de vagas e candidatos, pipeline de candidaturas e conversão candidato → funcionário (ficha pré-preenchida, transacção única). Ref: plano §6.4.
  **CA:** converter cria `RhFuncionario` sem duplicar o cadastro e marca a candidatura `ADMITIDA`; validações Zod; testes de integração e E2E.
- [ ] **RH-923 · Avaliação: modelo de dados** (M) · Dep: RH-921
  Ciclos, critérios, avaliações e notas; escala configurável por ciclo. Permissões `rh.avaliacao.ver/gerir/aprovar`.
  **CA:** migração aplicada; unicidade (ciclo, funcionário, avaliador); auditoria ligada.
- [ ] **RH-924 · Avaliação: serviços e UI** (L) · Dep: RH-923
  Abrir/fechar ciclo, avaliar por critério, calcular pontuação ponderada e classificação, validar. Ação *Sugerir alteração salarial* cria proposta pendente — nunca altera o salário.
  **CA:** média ponderada testada; ciclo fechado não aceita alterações; a sugestão não aplica alteração salarial; testes unitários e E2E.
- [ ] **RH-925 · Formação: modelo de dados** (M) · Dep: RH-921
  Ações de formação, inscrições, custos e certificados. Permissões `rh.formacao.ver/gerir`.
  **CA:** migração aplicada; custo por ação e por inscrição; auditoria ligada.
- [ ] **RH-926 · Formação: serviços e UI** (M) · Dep: RH-925
  Gestão de ações e inscrições, estados e certificados.
  **CA:** validações Zod; inscrição duplicada recusada; testes de integração.
- [ ] **RH-927 · Capital Humano: relatórios** (S) · Dep: RH-922, RH-924, RH-926
  Por período: custos de formação, resultados de avaliação por departamento e taxa de conversão de candidaturas.
  **CA:** exportação CSV/PDF; valores conferem com os registos de origem.

---

## Backlog futuro (fora do MVP)
- Grupos *Exploração* e *Recursos* (mapas avançados, documentos).
- Portal de auto-serviço do funcionário (recibos, férias).
- Comissões de vendas como rubrica (integração Comercial/Vendas).
- Leitura direta do relógio de ponto (rede/SDK) — só se a importação por ficheiro não chegar.

---

## Template de task (para novas)

```
- [ ] **RH-XXX · Título** (S/M/L)  · Dep: …
  Descrição curta e objectiva. Ref: spec §…/modelo §…
  **CA:** critérios verificáveis (inclui testes e casos limite).
```

## Notas de progresso
> Os agentes registam aqui decisões relevantes por task (data · task · decisão · impacto).

| Data | Task | Decisão / Nota |
|---|---|---|
| 2026-10-12 | RH-204 | `rh-contratos.service.ts` expõe o helper puro `resolverSalarioContrato` (testável sem Prisma). `cessarContrato` fecha o contrato e, na mesma transação, marca o funcionário `CESSADO` se não restar contrato ativo. Alteração salarial calcula `salarioAnterior` pelo regime vigente no dia anterior à data de efeito; data de efeito duplicada é rejeitada (RH_CONFLITO). |
| 2026-10-12 | RH-203/205 | A ficha carrega dependentes, rubricas fixas (com `rubrica`), documentos e contratos (com alterações) através de `rh:funcionarios:get` (include estendido), evitando canais de listagem dedicados. Sub-recursos usam CUD via IPC + reload. Foto do funcionário fica para depois (RH-209). |
| 2026-10-14 | RH-505/506 | `RhPagamentosManager.tsx` implementa ambas: aba **Ordens de Pagamento** (seleccionar pagamentos pendentes, criar ordem agrupando por banco/forma, gerar CSV de transferência, listar/ver ordens) e aba **Pagamentos** (filtros, confirmar total/parcial, estornar, ver detalhe). Integrado no separador **Pagamentos** de `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-601 | `rh-ausencias.service.ts` (CRUD, aprovação/rejeição, marcação de processamento), validadores em `rh.validator.ts`, canais IPC `rh:ausencias:*` (listar, obter, criar, atualizar, aprovar, inativar) com permissões `rh.ausencias.ver/gerir`, UI `RhAusenciasManager.tsx` (filtros funcionário/tipo/estado/data, grelha paginada, diálogo criar/editar, ações aprovar/rejeitar/cancelar), integrado no separador **Ausências** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-602/603 | `rh-horas-extra.service.ts` + `rh-ferias.service.ts` (CRUD, aprovação, marcação processamento, saldos, marcações com verificação de sobreposição), validadores em `rh.validator.ts` (base schemas), canais IPC `rh:horas-extra:*` e `rh:ferias:*` (permissões `rh.horas-extra.ver/gerir`, `rh.ferias.ver/gerir`), UIs `RhHorasExtraManager.tsx` e `RhFeriasManager.tsx` (filtros, grelhas, diálogos, ações), integrados nos separadores **Horas Extra** e **Férias** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-604/605 | `RhFeriasCalendarioManager.tsx` (calendário mensal, filtros, painel saldos, diálogo criar/editar) e `rh-afetacoes.service.ts` + `RhAfetacoesManager.tsx` (CRUD, validação soma 100%, filtros, diálogo, remover), canais IPC `rh:afetacoes:*`, permissões `rh.afetacoes.ver/gerir`, integrados nos separadores **Férias (Calendário)** e **Afetações** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-606/607 | `rh-dividas.service.ts` (CRUD processos, geração automática de prestações, suspensão/liquidação/cancelamento, prestações com desconto/anulação/perdão), validadores em `rh.validator.ts` (base schemas), canais IPC `rh:dividas:processos:*` e `rh:dividas:prestacoes:*` (permissões `rh.dividas.ver/gerir`), UIs `RhDividasProcessosManager.tsx` e `RhDividasPrestacoesManager.tsx` (filtros, grelhas, diálogos, ações), integrados no separador **Dívidas / Penhora** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-608 | `rh-retroativos.service.ts` (CRUD, aplicação/anulação), validadores em `rh.validator.ts` (base schemas), canais IPC `rh:retroativos:*` (listar, obter, criar, atualizar, aplicar, anular) com permissões `rh.retroativos.ver/gerir`, UI `RhRetroativosManager.tsx` (filtros funcionário/rubrica/ano/mês/estado, grelha paginada, diálogo criar/editar, ações aplicar/anular), integrado no separador **Retroactivos** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-609 | `rh-processamento-loader.service.ts` (método `carregarRetroactivos` a carregar retroactivos pendentes/aplicados por funcionário/ano/mês), integrado em `DadosProcessamento` como `retroactivos: Map<string, RhRetroativo[]>`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-701/702 | `rh-independentes.service.ts` + `rh-atividades.service.ts` (CRUD, validação de sobreposição de datas, inativação), validadores em `rh.validator.ts` (base schemas), canais IPC `rh:independentes:*` e `rh:atividades:*` (permissões `rh.independentes.ver/gerir`, `rh.atividades.ver/gerir`), UIs `RhIndependentesManager.tsx` e `RhAtividadesManager.tsx` (filtros, grelhas, diálogos, ações), integrados nos separadores **Independentes** e **Atividades** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-703/704 | `rh-processamento-honorario.service.ts` (CRUD, geração de processamento, retenção na fonte, anulação), validadores em `rh.validator.ts` (base schemas), canais IPC `rh:processamento-honorario:*` e `rh:pagamentos-honorario:*` (permissões `rh.honorarios.ver/gerir`), UI integrada no separador **Dívidas / Penhora** (abas Processos/Prestações) em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-14 | RH-704 | `rh-dividas.service.ts` (abas Processos/Prestações com confirmação/estorno), validadores em `rh.validator.ts`, UI `RhDividasManager.tsx` (abas Processos/Prestações com ações confirmar/estornar), integrados no separador **Dívidas / Penhora** do grupo **Funcionários** em `pages/rh.tsx`. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-16 | RH-801 | `relatorios.service.ts` implementa 7 relatórios RH (Folha de vencimentos, Resumo IRT/INSS, Mapa de Férias/Ausências, Dívidas em aberto, Custo por departamento) com queries Prisma corretas; `relatorios.tsx` adiciona painel RH com 7 tabelas interativas; `relatorio-pdf.service.ts` inclui títulos para exportação PDF/CSV/Excel dos novos relatórios. `typecheck:node`/`:web` limpos; build OK. |
| 2026-10-19 | RH-802 | `rh-auditoria.service.ts` (listar, porFuncionario, porProcessamento), validadores em `rh.validator.ts`, canais IPC `rh:auditoria:*` com permissão `rh.auditoria.ver`, UI `RhAuditoriaTimeline.tsx` (abas Por Funcionário/Por Processamento/Geral com filtros, paginação por cursor, exportação CSV). Auditoria adicionada a 8 services: `rh-ausencias`, `rh-horas-extra`, `rh-ferias`, `rh-afetacoes`, `rh-dividas`, `rh-retroativos`, `rh-independentes`, `rh-atividades`. `typecheck:node`/`:web` limpos; build OK; 940 testes a passar. |
| 2026-10-19 | RH-803 | `sanitize.ts` (sanitizarParaAuditoria: remove PII, mascara valores monetários; sanitizarRespostaSemSalarios / sanitizarListaSemSalarios: remove campos monetários e PII). Serviços actualizados para aceitar `podeVerSalarios`: `rh-funcionario.service.ts` (obterDetalhe), `rh-contratos.service.ts` (listarPorFuncionario, obterContrato, salarioNaData), `rh-processamento-listar.service.ts` (listar), `rh-processamento-historico.service.ts` (listar, detalhar), `rh-recibos.service.ts` (listar, obter), `relatorios.service.ts` (folhaVencimentos, resumoIrt, resumoInss, mapaFerias, dividasAbertas, custoDepartamento). `audit.service.ts` sanitiza dadosAnteriores/dadosNovos antes de serializar. `relatorios.controller.ts` passa `sessao.podeVerSalarios` via `filtroDe`. `rh.router.ts` passa `ctx.podeVerSalarios` a todos os canais expostos. `UserSession` ganha `podeVerSalarios?: boolean`. |
| 2026-10-19 | RH-804 | Migração `rh_804_indexes_performance`: índices `RhProcessamento.dataProcessamento`, `RhRecibo.processamentoId`. Benchmarks `rh-performance.bench.test.ts`: loader O(1) queries (500 vs 2000 funcionários), sanitização 5 000 registos < 2s, lote 500 < 5s / 2000 < 15s (mock execução). 948 testes a passar. |
| 2026-10-19 | RH-805 | 9 specs novos (`rh-crud-funcionario`, `rh-ausencias`, `rh-ferias`, `rh-importacao-csv`, `rh-recibos` + 4 `rh-regressao-*`) e correcção de `rh-processamento.e2e.ts`; 27 testes E2E a passar. Os testes obrigaram a corrigir 6 bugs reais: (1) `rh-handler.ts` validava o `event` do `ipcMain.handle` como payload — **todas as escritas do RH falhavam** e os filtros de leitura eram ignorados (passa a extrair `(event, payload)`, com testes de regressão); (2) 58 `z.string().uuid()` em chaves estrangeiras de `rh.validator.ts`/`rh.router.ts` rejeitavam os IDs `cuid` do Prisma (novo `rhRefId`); (3) o loader de processamento consultava `OR: [{dataFim: null}, …]` sobre `RhAusencia.dataFim` obrigatório e rebentava com Prisma (passa a intersectar a janela [início do período, data limite]); (4) `rh-importacao.service.ts` ignorava o rótulo canónico do cabeçalho (`Data de admissão`); (5) o preload `gerarPdf` embrulhava `{ reciboIds }` pela segunda vez (VALIDATION_ERROR); (6) `rh-recibos-pdf.service.ts` devolvia o registo em vez de `{ recibo }` e rebentava no render do PDF. Também o `setWindowOpenHandler` em `src/main/index.ts` só encaminha `http(s)` para o browser, tornando os botões «Ver»/«Imprimir» seguros. |
| 2026-10-19 | RH-806 | `rh-referencia.service.ts` (8 departamentos + 13 cargos típicos de Angola, `createMany` + `skipDuplicates`) é a fonte única partilhada pelo `prisma/seed.ts` (secção 7.7, idempotente — 2.ª execução cria 0) e pelo IPC `rh:config:referencia:semear` (`RhConfiguracaoService.semearReferencia`, que gera também os períodos do ano corrente). `RhMigracaoWizard.tsx` (4 passos: verificação → importar funcionários → importar contratos → resumo) abre a partir do botão **Migração inicial** no separador Funcionários e reutiliza `RhImportacaoDialog` com a nova prop `tipoInicial`. Testes `rh-referencia.service.test.ts`. |
| 2026-10-19 | RH-807 | Manual do utilizador em `docs/manual/` — 12 ficheiros (índice/`README.md`, `00-primeiros-passos` a `09-fiscal`, um por módulo, e `99-glossario.md`). Cada capítulo tem tarefas passo a passo e referência de ecrã; os rótulos de botões, campos e estados foram transcritos da UI (`pages/*.tsx` e `components/erp/**`), não das especificações. As funcionalidades ainda não implementadas são declaradas como tal (grupo **Operações** e **Tarifários** em Vendas, formulários de Encomenda, Lead, Oportunidade e Atividade, separadores **Geral**/**Capital Humano**/**Obrigações Declarativas** em RH, coluna de Notas de Crédito em Relatórios). A documentação técnica é referenciada a partir do índice (`especificacao_tecnica_erp.md`, `rh-docs/`, `armazens-docs/`) em vez de duplicada. |
