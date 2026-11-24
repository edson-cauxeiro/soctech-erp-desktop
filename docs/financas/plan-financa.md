# Plano de Implementação — Contabilidade e Finanças (SocTechno Desktop)

> **Base:** `docs/financas/plano-contabilidade-financas.md`
> **Adaptação:** nomenclatura Prisma já usada no repositório (modelos em português, `@@map` em snake_case plural, enums PascalCase com valores minúsculos).
> **Stack real:** Electron 39 + React 19 + TypeScript + Tailwind v4 + Radix + Zod 3 + Zustand 5 + Prisma 7 (adapter-pg) + PostgreSQL + Vitest.
> **Mercado:** Angola (PGC Angola, IVA, Imposto Industrial, SAF-T AO).

## Estado de implementação (2026-11-20)

| Fase | Estado | Nota |
|---|---|---|
| 0 | ⚠️ Parcial | Descoberta feita no repositório, mas `DESCOBERTA_CONTABILIDADE.md` ainda não foi gerado. |
| 1 | ✅ Concluída | Fundações, moldura com `dvh` e plano de contas com filtro de contas activas. |
| 2 | ✅ Concluída | Editor de lançamentos em partidas dobradas, rascunho, validação e estorno. |
| 3 | ✅ Concluída | Reconciliação integrada no `WorkspaceFrame`, com botões consistentes. |
| 4 | ✅ Concluída | Motor ligado a vendas, recibos, compras, tesouraria e RH; regras, erros e mapeamentos na UI. |
| 5 | ✅ Concluída | Relatórios validados, testes, títulos de PDF e exportação CSV/PDF/XLSX. |
| 6 | ✅ Concluída | Fecho mensal com `approve` no IPC, reabertura, testes e bloqueio de escrita no serviço. |
| 7 | ✅ Concluída | Apuramento de IVA com chave canónica `VAT_INPUT`, `approve` e testes. |
| 8 | ✅ Concluída | Apuramento de resultados e fecho anual com `approve` e testes completos. |
| 9 | ✅ Concluída | Demonstrações com exportação, `GeneralLedgerEntries` no SAF-T e filtro de auditoria financeira; validação estrutural (sem XSD oficial fornecido). |

---

## 0. Decisões aprovadas

| # | Decisão | Escolha |
|---|---|---|
| 1 | Abrangência | **Plano completo — 9 fases** |
| 2 | Exercício fiscal | **Estender `ExercicioFiscal`** existente (não criar `FiscalYear` paralelo) |
| 3 | Plano de contas | **Seed PGC Angola editável** (`prisma/data/pgc-angola.json`), idempotente por empresa |
| 4 | Precisão monetária | **`Decimal(18,4)`** em contabilidade, alinhado com `ContaBancaria`/`MovimentoTesouraria`; arredondamento a 2 casas só na apresentação e nos apuramentos |

### Regras herdadas do documento original (mantidas)

- Nenhuma regra contabilística no renderer: renderer → preload → IPC → main (serviço) → Prisma.
- Toda a escrita multi-tabela dentro de `prisma.$transaction`; numeração e fechos com `isolationLevel: Serializable`.
- `POSTED` (= `validado`) nunca é editado nem eliminado; correção só por estorno.
- Saldos **nunca** guardados em tabela própria na v1: calculados por `SUM` sobre linhas validadas.
- Contas, taxas e chaves de mapeamento **parametrizáveis**; nada fixo no código.
- `amountExpr` é uma **lista fechada de chaves** interpretada por código. Nunca `eval`.

---

## 1. Fase 0 — Descoberta (resultado da análise do repositório) — ⚠️ Parcial

### 1.1 Inventário

| Elemento | Caminho | Estado |
|---|---|---|
| Schema Prisma (2 633 linhas) | `prisma/schema.prisma` | estender |
| Migrações (24 pastas, convenção `<timestamp>_nome`) | `prisma/migrations/` | seguir convenção |
| Seed | `prisma/seed.ts` (PrismaClient + adapter-pg) | estender |
| Exercício fiscal | `ExercicioFiscal` + `src/main/services/exercicio.service.ts` | **estender** |
| Centro de custo | `CentroCusto` + RH (`RhAfetacao`, `RhAtividade`) | **reutilizar** |
| Contas bancárias/caixa | `ContaBancaria`, `MovimentoTesouraria`, `SessaoCaixa` | **reutilizar** e ligar |
| Reconciliação | `MovimentoTesouraria.conciliado/dataConciliacao`, `ReconciliacaoManager.tsx` | **estender** |
| Auditoria | `AuditLog` (append-only, `TipoAcaoAuditoria`) | **reutilizar** |
| Clientes/Fornecedores | `Cliente`, `Fornecedor` | **reutilizar** (contas correntes) |
| Documentos de venda/compra | `FaturaVenda`, `ReciboVenda`, `FaturaCompra`, `GuiaRecepcao` | **reutilizar** como origem |
| RH → Finanças | `src/main/services/rh-financas-gateway.ts` (stub `RH_FINANCAS_INDISPONIVEL`) | **substituir implementação** |
| Padrão IPC | `router` → `controller` → `service`, resposta `IpcResponse<T>` (`ok`/`err`) | seguir |
| Validação | Zod em `src/main/validators/*.validator.ts`, revalidado no main | seguir |
| RBAC | `requirePermission(session, 'financas', acao)` | seguir |
| Preload | `src/preload/index.ts` (objeto `api` por domínio) | estender |
| Tipos renderer | `src/renderer/src/@types/electron.d.ts` | estender |
| Página Finanças | `src/renderer/src/pages/financas.tsx` (tabs: conta/movimento/reconciliacao) | estender |
| Shell | `ErpShell` (`min-h-screen`, topbar 48px + nav 36px + ribbon ~66px + header ~60px + status 32px) | reutilizar |
| Formulários | `FormPrimitives` (`FormShell`, `FormSection`, `SelectField`→`SearchSelect`, `CurrencyField`, `QuantityInput`, `PriceInput`) | estender |
| Select pesquisável | `src/renderer/src/components/ui/SearchSelect.tsx` | reutilizar |
| Dinheiro no frontend | `decimal.js` já instalado; `src/renderer/src/utils/currency.ts` | reutilizar |
| Tabelas/PDF/Excel | `pdfkit`, `exceljs`, `xmlbuilder` já instalados | reutilizar |
| Testes | Vitest (`src/**/*.test.ts`), Playwright em `tests/e2e` | seguir |

### 1.2 Mapa de dados atual relevante

```
EmpresaConfig 1─N ExercicioFiscal (ano String, estado String "aberto"|"fechado")
EmpresaConfig 1─N ContaBancaria (saldoInicial, saldoAtual Decimal(18,4), moeda)
ContaBancaria 1─N MovimentoTesouraria (tipo, valor, estado, conciliado)
EmpresaConfig 1─N CentroCusto (codigo, designacao)
EmpresaConfig 1─N Cliente / Fornecedor
EmpresaConfig 1─N FaturaVenda / ReciboVenda / FaturaCompra
EmpresaConfig 1─N AuditLog (acao, entidade, entidadeId, dadosAnteriores/Novos)
Utilizador    1─N MovimentoTesouraria / SessaoCaixa / AuditLog
```

### 1.3 Lacunas face ao modelo alvo

1. Não existe plano de contas (`Account`), diários (`Journal`), períodos (`AccountingPeriod`) nem mapeamentos (`AccountMapping`).
2. Não existe lançamento em partidas dobradas. `MovimentoTesouraria` é um movimento de caixa/banco, não um lançamento contabilístico.
3. Não existe motor de contabilização, apuramentos, fecho nem relatórios contabilísticos.
4. `ExercicioFiscal.estado` é `String` livre, sem períodos, sem fecho e sem `updatedAt`.
5. `AuditLog` não tem ações para fechar/reabrir/estornar/apurar.
6. `ContaBancaria` não está ligada a nenhuma conta contabilística.
7. `rh-financas-gateway.ts` é um stub que falha por desenho.

### 1.4 Conflitos e como são resolvidos

| Conflito | Resolução |
|---|---|
| `FiscalYear` vs `ExercicioFiscal` | Estender `ExercicioFiscal`; `ano` continua `String` (usado em séries e UI) |
| `companyId` vs `empresaId` | Usar **`empresaId`** em todos os modelos novos |
| `Account` vs `ContaContabil` | `ContaContabil` |
| `CostCenter` vs `CentroCusto` | Reutilizar `CentroCusto` |
| `AuditLog` do plano vs existente | Reutilizar `AuditLog`; acrescentar ações em falta |
| `Account.isBankAccount` | Preferir FK `ContaBancaria.contaContabilId` (uma conta bancária real ↔ uma conta contabilística) |
| `bankReconciliationId` | Usar `LinhaLancamentoContabil.movimentoTesourariaId` (FK real para `MovimentoTesouraria`) |
| Dinheiro `Decimal(18,2)` | `Decimal(18,4)`; formatação a 2 casas na UI |
| `saldoAtual` em `ContaBancaria` | Mantém-se como campo derivado já existente; **não** é fonte de verdade contabilística |
| Migração dos "lançamentos" antigos | **Não converter** `MovimentoTesouraria` em lançamentos contabilísticos. A Fase 4 gera lançamentos a partir deles via motor. Evita duplicar e permite idempotência. |

### 1.5 Decisões em aberto (a confirmar durante a execução)

- Lista final de contas PGC a semear (o JSON é editável; a versão inicial cobre classes 1–8 com folhas para IVA, bancos, clientes, fornecedores, resultados).
- Contas de destino do apuramento de resultados (82/83/85/86/88) — marcadas `// TODO: confirmar com contabilista`.
- Taxa de IVA padrão e regime (já existe `EmpresaConfig.regimeIva`/`regimeIvaTipo`).
- Necessidade real de `Moeda` como tabela (v1 usa `EmpresaConfig.moedaBase` + `CURRENCIES`).

---

## 2. Nomenclatura Prisma (mapa plano → repositório)

### 2.1 Enums

| Plano original | Repositório |
|---|---|
| `AccountNature` | `NaturezaConta { devedora credora }` |
| `AccountType` | `TipoContaContabil { activo passivo capitalProprio proveito custo resultado memo }` |
| `FiscalYearStatus` | `EstadoExercicio { aberto emFecho fechado }` |
| `PeriodStatus` | `EstadoPeriodoContabil { aberto fechado bloqueado }` |
| `EntryStatus` | `EstadoLancamento { rascunho validado estornado }` |
| `EntryOrigin` | `OrigemLancamento { manual integracao abertura fecho ajustamento liquidacao estorno }` |
| `JournalType` | `TipoDiario { vendas compras caixa banco geral ajustamento abertura liquidacao salarios imobilizado }` |
| `ClosingRunType` | `TipoExecucaoFecho { fechoMensal apuramentoIva apuramentoResultados fechoAnual aberturaExercicioSeguinte }` |
| `ClosingRunStatus` | `EstadoExecucaoFecho { previsao executado revertido falhado }` |
| `TaxSettlementStatus` | `EstadoApuramentoImposto { rascunho validado pago }` |
| — | `LadoLancamento { debito credito }` (linhas de regra) |
| — | `TipoEntidadeLancamento { cliente fornecedor funcionario outro }` |
| — | `TipoRelatorioFinanceiro { balanco demonstracaoResultados fluxosCaixa capitalProprio }` |

Acrescentar a `TipoAcaoAuditoria`: `fechar`, `reabrir`, `estornar`, `apurar`.

### 2.2 Modelos

| Plano original | Repositório | Tabela (`@@map`) |
|---|---|---|
| `Account` | `ContaContabil` | `contas_contabeis` |
| `AccountingPeriod` | `PeriodoContabil` | `periodos_contabeis` |
| `Journal` | `DiarioContabil` | `diarios_contabeis` |
| `JournalSequence` | `SequenciaDiario` | `sequencias_diario` |
| `JournalEntry` | `LancamentoContabil` | `lancamentos_contabeis` |
| `JournalEntryLine` | `LinhaLancamentoContabil` | `linhas_lancamento_contabil` |
| `AccountMapping` | `MapeamentoConta` | `mapeamentos_conta` |
| `PostingRule` | `RegraContabilizacao` | `regras_contabilizacao` |
| `PostingRuleLine` | `LinhaRegraContabilizacao` | `linhas_regra_contabilizacao` |
| `ClosingRun` | `ExecucaoFecho` | `execucoes_fecho` |
| `TaxSettlement` | `ApuramentoImposto` | `apuramentos_imposto` |
| `ReportLine` + `ReportLineAccount` | `EstruturaRelatorio` + `LinhaEstruturaRelatorio` + `ContaEstruturaRelatorio` | `estruturas_relatorio`, `linhas_estrutura_relatorio`, `contas_estrutura_relatorio` |
| — | `ErroIntegracaoContabil` | `erros_integracao_contabil` |

### 2.3 Convenções de campos

- PK `id String @id @default(cuid())`.
- Tenancy sempre `empresaId String @map("empresa_id")`.
- Colunas em `snake_case` via `@map`; tabelas em plural `snake_case` via `@@map`.
- Timestamps técnicos: `createdAt @default(now()) @map("created_at")`, `updatedAt @updatedAt @map("updated_at")` (igual à Tesouraria).
- Eventos de domínio: `validadoEm`, `fechadoEm`, `revertidoEm`, `conciliadoEm`, `executadoEm`.
- Dinheiro: `Decimal @db.Decimal(18,4)`. Câmbio: `Decimal @db.Decimal(18,6)`.
- Códigos de conta/diário: `String`, únicos por empresa.
- Texto de descrição: `String` / `String?` (nunca `Json` para valores contabilísticos).

---

## 3. Modelo de dados final (Prisma adaptado)

> Snippet de referência. A ordem de migração e as constraints SQL estão na secção 7.

```prisma
// ─── Enums ───────────────────────────────────────────────────────────────────
enum NaturezaConta { devedora credora }
enum TipoContaContabil { activo passivo capitalProprio proveito custo resultado memo }
enum EstadoExercicio { aberto emFecho fechado }
enum EstadoPeriodoContabil { aberto fechado bloqueado }
enum EstadoLancamento { rascunho validado estornado }
enum OrigemLancamento { manual integracao abertura fecho ajustamento liquidacao estorno }
enum TipoDiario { vendas compras caixa banco geral ajustamento abertura liquidacao salarios imobilizado }
enum TipoExecucaoFecho { fechoMensal apuramentoIva apuramentoResultados fechoAnual aberturaExercicioSeguinte }
enum EstadoExecucaoFecho { previsao executado revertido falhado }
enum EstadoApuramentoImposto { rascunho validado pago }
enum LadoLancamento { debito credito }
enum TipoEntidadeLancamento { cliente fornecedor funcionario outro }
enum TipoRelatorioFinanceiro { balanco demonstracaoResultados fluxosCaixa capitalProprio }

// ─── Exercício (estender o existente) ────────────────────────────────────────
model ExercicioFiscal {
  id          String          @id @default(cuid())
  ano         String
  empresaId   String          @map("empresa_id")
  modulosJson String          @default("[]") @map("modulos_json")
  dataInicio  DateTime        @map("data_inicio") @db.Date
  dataFim     DateTime        @map("data_fim") @db.Date
  estado      EstadoExercicio @default(aberto)
  fechadoEm   DateTime?       @map("fechado_em")
  fechadoPorId String?        @map("fechado_por_id")
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  empresa    EmpresaConfig       @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  fechadoPor Utilizador?         @relation("ExercicioFechadoPor", fields: [fechadoPorId], references: [id])
  periodos   PeriodoContabil[]
  lancamentos LancamentoContabil[]
  sequencias  SequenciaDiario[]
  execucoes   ExecucaoFecho[]

  @@unique([empresaId, ano])
  @@map("exercicios_fiscais")
}

model PeriodoContabil {
  id           String                @id @default(cuid())
  exercicioId  String                @map("exercicio_id")
  numero       Int
  dataInicio   DateTime              @map("data_inicio") @db.Date
  dataFim      DateTime              @map("data_fim") @db.Date
  estado       EstadoPeriodoContabil @default(aberto)
  fechadoEm    DateTime?             @map("fechado_em")
  fechadoPorId String?               @map("fechado_por_id")
  createdAt    DateTime              @default(now()) @map("created_at")
  updatedAt    DateTime              @updatedAt @map("updated_at")

  exercicio  ExercicioFiscal       @relation(fields: [exercicioId], references: [id], onDelete: Cascade)
  fechadoPor Utilizador?           @relation("PeriodoFechadoPor", fields: [fechadoPorId], references: [id])
  lancamentos LancamentoContabil[]
  apuramentos ApuramentoImposto[]

  @@unique([exercicioId, numero])
  @@index([exercicioId, estado])
  @@map("periodos_contabeis")
}

// ─── Plano de contas ─────────────────────────────────────────────────────────
model ContaContabil {
  id                 String             @id @default(cuid())
  empresaId          String             @map("empresa_id")
  codigo             String
  designacao         String
  contaPaiId         String?            @map("conta_pai_id")
  nivel              Int
  classe             Int
  tipo               TipoContaContabil
  natureza           NaturezaConta
  aceitaMovimento    Boolean            @default(false) @map("aceita_movimento")
  exigeCentroCusto   Boolean            @default(false) @map("exige_centro_custo")
  exigeEntidade      Boolean            @default(false) @map("exige_entidade")
  activa             Boolean            @default(true)
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")

  empresa     EmpresaConfig      @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  pai         ContaContabil?     @relation("ContaContabilArvore", fields: [contaPaiId], references: [id])
  filhas      ContaContabil[]    @relation("ContaContabilArvore")
  linhas      LinhaLancamentoContabil[]
  mapeamentos MapeamentoConta[]
  contaBancaria ContaBancaria?
  linhasRegra LinhaRegraContabilizacao[]
  linhasRelatorio ContaEstruturaRelatorio[]

  @@unique([empresaId, codigo])
  @@index([empresaId, classe])
  @@index([empresaId, aceitaMovimento])
  @@map("contas_contabeis")
}

model DiarioContabil {
  id          String     @id @default(cuid())
  empresaId   String     @map("empresa_id")
  codigo      String
  designacao  String
  tipo        TipoDiario
  activo      Boolean    @default(true)
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  empresa    EmpresaConfig        @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  lancamentos LancamentoContabil[]
  sequencias  SequenciaDiario[]
  regras      RegraContabilizacao[]

  @@unique([empresaId, codigo])
  @@map("diarios_contabeis")
}

model SequenciaDiario {
  id           String @id @default(cuid())
  diarioId     String @map("diario_id")
  exercicioId  String @map("exercicio_id")
  ultimoNumero Int    @default(0) @map("ultimo_numero")

  diario    DiarioContabil  @relation(fields: [diarioId], references: [id], onDelete: Cascade)
  exercicio ExercicioFiscal @relation(fields: [exercicioId], references: [id], onDelete: Cascade)

  @@unique([diarioId, exercicioId])
  @@map("sequencias_diario")
}

// ─── Lançamentos ─────────────────────────────────────────────────────────────
model LancamentoContabil {
  id                 String          @id @default(cuid())
  empresaId          String          @map("empresa_id")
  diarioId           String          @map("diario_id")
  exercicioId        String          @map("exercicio_id")
  periodoId          String          @map("periodo_id")
  numero             Int?
  dataContabilistica DateTime        @map("data_contabilistica") @db.Date
  dataDocumento      DateTime?       @map("data_documento") @db.Date
  descricao          String
  estado             EstadoLancamento @default(rascunho)
  origem             OrigemLancamento @default(manual)

  moduloOrigem       String?         @map("modulo_origem")
  tipoOrigem         String?         @map("tipo_origem")
  origemId           String?         @map("origem_id")

  execucaoFechoId    String?         @map("execucao_fecho_id")
  estornoDeId        String?         @unique @map("estorno_de_id")
  moeda              String          @default("AOA")
  taxaCambio         Decimal         @default(1) @map("taxa_cambio") @db.Decimal(18, 6)
  totalDebito        Decimal         @default(0) @map("total_debito") @db.Decimal(18, 4)
  totalCredito       Decimal         @default(0) @map("total_credito") @db.Decimal(18, 4)

  criadoPorId        String          @map("criado_por_id")
  validadoPorId      String?         @map("validado_por_id")
  validadoEm         DateTime?       @map("validado_em")
  createdAt          DateTime        @default(now()) @map("created_at")
  updatedAt          DateTime        @updatedAt @map("updated_at")

  empresa      EmpresaConfig       @relation(fields: [empresaId], references: [id])
  diario       DiarioContabil      @relation(fields: [diarioId], references: [id])
  exercicio    ExercicioFiscal     @relation(fields: [exercicioId], references: [id])
  periodo      PeriodoContabil     @relation(fields: [periodoId], references: [id])
  execucao     ExecucaoFecho?      @relation(fields: [execucaoFechoId], references: [id])
  estornoDe    LancamentoContabil? @relation("EstornoLancamento", fields: [estornoDeId], references: [id])
  estornadoPor LancamentoContabil? @relation("EstornoLancamento")
  criadoPor    Utilizador          @relation("LancamentoCriadoPor", fields: [criadoPorId], references: [id])
  validadoPor  Utilizador?         @relation("LancamentoValidadoPor", fields: [validadoPorId], references: [id])
  linhas       LinhaLancamentoContabil[]

  @@unique([diarioId, exercicioId, numero])
  @@unique([moduloOrigem, tipoOrigem, origemId, origem])
  @@index([empresaId, dataContabilistica])
  @@index([periodoId, estado])
  @@index([exercicioId, estado])
  @@map("lancamentos_contabeis")
}

model LinhaLancamentoContabil {
  id                   String              @id @default(cuid())
  lancamentoId         String              @map("lancamento_id")
  numeroLinha          Int                 @map("numero_linha")
  contaId              String              @map("conta_id")
  debito               Decimal             @default(0) @db.Decimal(18, 4)
  credito              Decimal             @default(0) @db.Decimal(18, 4)
  descricao            String?
  centroCustoId        String?             @map("centro_custo_id")
  entidadeTipo         TipoEntidadeLancamento? @map("entidade_tipo")
  entidadeId           String?             @map("entidade_id")
  codigoImposto        String?             @map("codigo_imposto")
  baseImposto          Decimal?            @map("base_imposto") @db.Decimal(18, 4)
  dataVencimento       DateTime?           @map("data_vencimento") @db.Date
  conciliadoEm         DateTime?           @map("conciliado_em")
  movimentoTesourariaId String?            @map("movimento_tesouraria_id")

  lancamento LancamentoContabil @relation(fields: [lancamentoId], references: [id], onDelete: Restrict)
  conta      ContaContabil      @relation(fields: [contaId], references: [id])
  centroCusto CentroCusto?      @relation(fields: [centroCustoId], references: [id])
  movimentoTesouraria MovimentoTesouraria? @relation(fields: [movimentoTesourariaId], references: [id])

  @@index([contaId])
  @@index([entidadeTipo, entidadeId])
  @@index([movimentoTesourariaId])
  @@index([lancamentoId, numeroLinha])
  @@map("linhas_lancamento_contabil")
}

// ─── Parametrização ──────────────────────────────────────────────────────────
model MapeamentoConta {
  id        String @id @default(cuid())
  empresaId String @map("empresa_id")
  chave     String
  contaId   String @map("conta_id")

  empresa EmpresaConfig @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  conta   ContaContabil @relation(fields: [contaId], references: [id])

  @@unique([empresaId, chave])
  @@map("mapeamentos_conta")
}

model RegraContabilizacao {
  id           String     @id @default(cuid())
  empresaId    String     @map("empresa_id")
  codigo       String
  designacao   String
  moduloOrigem String     @map("modulo_origem")
  tipoOrigem   String     @map("tipo_origem")
  diarioId     String     @map("diario_id")
  activa       Boolean    @default(true)
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  empresa EmpresaConfig @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  diario  DiarioContabil @relation(fields: [diarioId], references: [id])
  linhas  LinhaRegraContabilizacao[]

  @@unique([empresaId, codigo])
  @@map("regras_contabilizacao")
}

model LinhaRegraContabilizacao {
  id           String          @id @default(cuid())
  regraId      String          @map("regra_id")
  ordem        Int
  lado         LadoLancamento
  contaId      String?         @map("conta_id")
  chaveConta   String?         @map("chave_conta")
  expressaoValor String        @map("expressao_valor")

  regra LinhaRegraContabilizacao @relation("RegraLinhas", fields: [regraId], references: [id], onDelete: Cascade)
  conta ContaContabil?           @relation(fields: [contaId], references: [id])

  @@index([regraId, ordem])
  @@map("linhas_regra_contabilizacao")
}

// ─── Fecho, impostos, integração, relatórios ─────────────────────────────────
model ExecucaoFecho {
  id            String              @id @default(cuid())
  empresaId     String              @map("empresa_id")
  exercicioId   String              @map("exercicio_id")
  periodoId     String?             @map("periodo_id")
  tipo          TipoExecucaoFecho
  estado        EstadoExecucaoFecho @default(previsao)
  resumo        Json?
  executadoPorId String?            @map("executado_por_id")
  executadoEm   DateTime?           @map("executado_em")
  revertidoPorId String?            @map("revertido_por_id")
  revertidoEm   DateTime?           @map("revertido_em")
  createdAt     DateTime            @default(now()) @map("created_at")

  empresa    EmpresaConfig       @relation(fields: [empresaId], references: [id])
  exercicio  ExercicioFiscal     @relation(fields: [exercicioId], references: [id])
  periodo    PeriodoContabil?    @relation(fields: [periodoId], references: [id])
  lancamentos LancamentoContabil[]

  @@index([empresaId, tipo, estado])
  @@map("execucoes_fecho")
}

model ApuramentoImposto {
  id                String                 @id @default(cuid())
  empresaId         String                 @map("empresa_id")
  tipoImposto       String                 @map("tipo_imposto")
  periodoId         String                 @map("periodo_id")
  ivaLiquidado      Decimal                @map("iva_liquidado") @db.Decimal(18, 4)
  ivaDedutivel      Decimal                @map("iva_dedutivel") @db.Decimal(18, 4)
  creditoTransitado Decimal                @default(0) @map("credito_transitado") @db.Decimal(18, 4)
  valorAPagar       Decimal                @map("valor_a_pagar") @db.Decimal(18, 4)
  estado            EstadoApuramentoImposto @default(rascunho)
  lancamentoId      String?                @map("lancamento_id")
  lancamentoPagamentoId String?            @map("lancamento_pagamento_id")
  dataVencimento    DateTime?              @map("data_vencimento") @db.Date
  createdAt         DateTime               @default(now()) @map("created_at")
  updatedAt         DateTime               @updatedAt @map("updated_at")

  empresa EmpresaConfig    @relation(fields: [empresaId], references: [id])
  periodo PeriodoContabil  @relation(fields: [periodoId], references: [id])

  @@unique([empresaId, tipoImposto, periodoId])
  @@map("apuramentos_imposto")
}

model ErroIntegracaoContabil {
  id           String   @id @default(cuid())
  empresaId    String   @map("empresa_id")
  moduloOrigem String   @map("modulo_origem")
  tipoOrigem   String   @map("tipo_origem")
  origemId     String   @map("origem_id")
  mensagem     String
  detalhe      Json?
  resolvido    Boolean  @default(false)
  resolvidoEm  DateTime? @map("resolvido_em")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([empresaId, resolvido])
  @@index([moduloOrigem, tipoOrigem, origemId])
  @@map("erros_integracao_contabil")
}

model EstruturaRelatorio {
  id        String                 @id @default(cuid())
  empresaId String                 @map("empresa_id")
  codigo    String
  designacao String
  tipo      TipoRelatorioFinanceiro
  activa    Boolean                @default(true)

  linhas LinhaEstruturaRelatorio[]

  @@unique([empresaId, codigo])
  @@map("estruturas_relatorio")
}

model LinhaEstruturaRelatorio {
  id          String  @id @default(cuid())
  estruturaId String  @map("estrutura_id")
  ordem       Int
  codigo      String
  designacao  String
  tipoLinha   String  @map("tipo_linha") // titulo | conta | subtotal | total
  formula     String? // soma de códigos de linhas, interpretada por código
  sinal       Int     @default(1)

  estrutura EstruturaRelatorio @relation(fields: [estruturaId], references: [id], onDelete: Cascade)
  contas    ContaEstruturaRelatorio[]

  @@unique([estruturaId, codigo])
  @@map("linhas_estrutura_relatorio")
}

model ContaEstruturaRelatorio {
  id      String @id @default(cuid())
  linhaId String @map("linha_id")
  contaId String @map("conta_id")

  linha LinhaEstruturaRelatorio @relation(fields: [linhaId], references: [id], onDelete: Cascade)
  conta ContaContabil           @relation(fields: [contaId], references: [id])

  @@unique([linhaId, contaId])
  @@map("contas_estrutura_relatorio")
}
```

### 3.1 Alterações a modelos existentes

```prisma
model EmpresaConfig {
  // ... existente
  contasContabeis       ContaContabil[]
  diariosContabeis      DiarioContabil[]
  mapeamentosConta      MapeamentoConta[]
  regrasContabilizacao  RegraContabilizacao[]
  execucoesFecho        ExecucaoFecho[]
  apuramentosImposto    ApuramentoImposto[]
  estruturasRelatorio   EstruturaRelatorio[]
}

model Utilizador {
  // ... existente
  exerciciosFechados    ExercicioFiscal[]  @relation("ExercicioFechadoPor")
  periodosFechados      PeriodoContabil[]  @relation("PeriodoFechadoPor")
  lancamentosCriados    LancamentoContabil[] @relation("LancamentoCriadoPor")
  lancamentosValidados  LancamentoContabil[] @relation("LancamentoValidadoPor")
}

model ContaBancaria {
  // ... existente
  contaContabilId String? @unique @map("conta_contabil_id")
  contaContabil   ContaContabil? @relation(fields: [contaContabilId], references: [id])
}

model MovimentoTesouraria {
  // ... existente
  linhasContabeis LinhaLancamentoContabil[]
}

model CentroCusto {
  // ... existente
  linhasLancamento LinhaLancamentoContabil[]
}
```

### 3.2 Constraints SQL (na migração)

```sql
-- Uma linha tem débito OU crédito, nunca ambos, nunca negativos
ALTER TABLE "linhas_lancamento_contabil" ADD CONSTRAINT chk_linha_dc
  CHECK (debito >= 0 AND credito >= 0 AND NOT (debito > 0 AND credito > 0));

-- Linha tem de ter movimento (uma das colunas > 0)
ALTER TABLE "linhas_lancamento_contabil" ADD CONSTRAINT chk_linha_com_valor
  CHECK (debito > 0 OR credito > 0);

-- Lançamento validado tem de estar equilibrado
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT chk_lancamento_equilibrado
  CHECK (estado = 'rascunho' OR total_debito = total_credito);

-- Numeração: validado exige número
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT chk_lancamento_numero
  CHECK (estado = 'rascunho' OR numero IS NOT NULL);

-- Imutabilidade de lançamentos validados (trigger)
CREATE OR REPLACE FUNCTION fn_lancamento_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.estado = 'validado' THEN
    RAISE EXCEPTION 'Lançamento validado não pode ser alterado. Use estorno.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lancamento_imutavel
  BEFORE UPDATE OR DELETE ON "lancamentos_contabeis"
  FOR EACH ROW EXECUTE FUNCTION fn_lancamento_imutavel();
```

> O trigger de `DELETE` também bloqueia apagar linhas de lançamentos validados via cascata — por isso a FK de `LinhaLancamentoContabil` é `onDelete: Restrict`.

---

## 4. Camadas e convenções de implementação

### 4.1 Backend (main)

Ordem obrigatória por funcionalidade:

```
validators/<dominio>.validator.ts   → Zod (fonte da verdade de entrada)
services/<dominio>.service.ts       → regras + prisma.$transaction
controllers/<dominio>.controller.ts → RBAC + ok()/err()
routers/<dominio>.router.ts         → ipcMain.handle('contabilidade:*')
src/main/index.ts                   → register<Dominio>Router()
```

- Respostas sempre `IpcResponse<T>`; erros de domínio via `AppError` (`ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`).
- Toda a query filtra por `empresaId` da sessão; um id de outra empresa responde **não encontrado**.
- `requirePermission(session, 'financas', 'read'|'write'|'approve'|'delete')`.
  - Consultar → `read`
  - Criar/editar rascunho, validar lançamento → `write`
  - Fechar/reabrir período, executar apuramento → `approve`
  - Eliminar rascunho/conta sem movimento → `delete`
- Serviços recebem `PrismaClient` no construtor (padrão atual) para testes.
- `postEntry`/`reverseEntry` são métodos de um único serviço (`LancamentoContabilService`), nunca duplicados em controllers.

### 4.2 DTOs e dinheiro no IPC

- O helper `serializeIpcData` converte `Decimal` em `number`. Para contabilidade, **não** usar esse caminho para montantes: os DTOs de lançamento expõem `debito`/`credito`/`totalDebito`/`totalCredito` como **string** (ex.: `"1250.0000"`).
- No renderer, aritmética com `decimal.js` (já instalado); apresentação com `formatCurrency` (2 casas).
- Nunca comparar floats para equilíbrio. Comparação: `new Decimal(totalDebito).equals(totalCredito)`.
- Datas contabilísticas viajam como `YYYY-MM-DD` e são normalizadas com o `dataSchema` já usado em `tesouraria.validator.ts`.

### 4.3 Renderer

- Novo API client: `src/renderer/src/api/contabilidade.api.ts` (espelha `tesouraria.api.ts`).
- Novos DTOs em `src/renderer/src/@types/electron.d.ts`.
- Nova entrada em `src/preload/index.ts`: objeto `contabilidade`.
- Hook do rascunho: `src/renderer/src/hooks/useLancamentoDraft.ts` (react-hook-form + Zod; não guarda saldos, só linhas, totais derivados e validação de equilíbrio).
- Nenhum cálculo de IVA, apuramento ou saldo no renderer: só pré-visualização de totais das linhas que o utilizador está a escrever.

---

## 5. UI/UX — direção Impeccable (modo Operate)

### 5.1 Princípios

- **Modo Operate:** o utilizador completa uma tarefa. Scanabilidade, consistência e teclado acima de expressão.
- **Uma tarefa por ecrã.** O editor de lançamentos é um *workspace*, não um modal.
- **Densidade de ERP:** linhas `h-8`, `text-xs`, montantes `tabular-nums`, códigos de conta `font-mono`.
- **Estados com cor consistente:** `rascunho` → `warning`, `validado` → `success`, `estornado` → `danger`, `bloqueado` → `neutral`.
- **Sem invenção de design system:** usar tokens existentes (`bg-card`, `border-border`, `text-muted-foreground`, `shadow-[var(--shadow-card)]`, `KpiCard`, `Panel`, `StatusBadge`).
- **Zero `<select>` nativo.** Todos os selects usam `SelectField` (que embrulha `SearchSelect`) ou `SearchSelect` direto.

### 5.2 Regra de altura (obrigatória)

O `ErpShell` ocupa ~15–16 rem de chrome fixo (topbar 48 + nav 36 + ribbon ~66 + header ~60 + status 32 + paddings). Nenhum formulário pode crescer além da área útil.

Novo componente `src/renderer/src/components/erp/WorkspaceFrame.tsx`:

```tsx
// Área útil = viewport − chrome do ErpShell.
// O scroll acontece DENTRO do frame; a página nunca ganha scroll por causa do formulário.
<div className="flex flex-col h-[calc(100dvh-15.5rem)] min-h-[420px] bg-card border border-border rounded-md overflow-hidden">
  <header className="shrink-0 h-11 px-4 flex items-center justify-between border-b border-border" />
  <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
  <footer className="shrink-0 border-t border-border bg-muted/30 px-4 py-2.5" />
</div>
```

Regras derivadas:

1. **Formulário de página inteira** (lançamento, fecho, apuramento): `WorkspaceFrame` com header fixo, corpo com scroll interno e rodapé de totais/ações fixo.
2. **Diálogo**: `DialogContent` com `max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden p-0`; cabeçalho e rodapé `shrink-0`; corpo `min-h-0 overflow-y-auto`.
3. **Grelha de linhas do lançamento**: cabeçalho de tabela `sticky top-0 z-10`, rodapé de totais `sticky bottom-0`.
4. **Nunca** `overflow-y-auto` no `<main>` do `ErpShell` para compensar formulários altos.
5. **Nunca** `max-h-[90vh]` sozinho: usar `dvh` + `flex` + scroll interno (o `vh` ignora a barra de tarefas no Electron/Windows).

### 5.3 Regra de selects pesquisáveis

- `SelectField` já usa `SearchSelect` internamente → preferir sempre.
- Em células de tabela (linhas do lançamento), usar `SearchSelect portal` para o dropdown não ser cortado por `overflow`.
- Opções com `label` legível: `"11.1 — Caixa"`, `"VD — Diário de Vendas"`, `"2026/03 — Março"`.
- Filtro por código **e** designação (o `SearchSelect` já faz `includes` em `value` e `label`).
- Contas: listar apenas `activa && aceitaMovimento` no seletor de linhas; no seletor de conta-pai, apenas `activa`.
- Nenhum `SearchSelect` com mais de ~2 000 opções sem virtualização. O plano de contas típico tem < 1 000; se necessário, filtrar por classe antes.

### 5.4 Regra de valores não negativos (obrigatória)

Aplicar em três camadas:

| Camada | Regra |
|---|---|
| Input | Bloquear `-`, `+`, `e`, `E` em `onKeyDown`; sanitizar `onPaste`/`onChange` |
| Zod | `z.coerce.number().min(0, '...')` para quantidades e montantes |
| PostgreSQL | `CHECK (debito >= 0 AND credito >= 0)`; `CHECK (quantidade >= 0)` onde aplicável |

Alterações em `FormPrimitives.tsx`:

- `CurrencyField`: novo prop `permitirNegativo = false`. Quando `false`, remove `-` do texto em `onChange` e no `onBlur` (o `parseCurrencyInput` atual aceita negativos — não alterar a função global para não quebrar outros consumidores).
- `NumberField`: quando `min >= 0` (ou `nonNegative`), bloquear `-`/`+`/`e`/`E` e sanitizar colagem. O atributo `min` do HTML sozinho não impede escrita/colagem.
- `QuantityInput` e `PriceInput`: já removem `-` (`[^\d.,]`); manter e adicionar teste unitário.
- Linhas de lançamento: débito e crédito nunca negativos. O lado é escolhido por campo/segmented control, não pelo sinal.

### 5.5 Arquitetura de ecrãs de Finanças

`src/renderer/src/pages/financas.tsx` tem as seguintes abas (estado atual):

| Tab | Componente | Conteúdo |
|---|---|---|
| `conta` | `ContasBancariasManager` | contas bancárias (tesouraria) |
| `movimento` | `LancamentosManager` | movimentos de tesouraria |
| `reconciliacao` | `ReconciliacaoManager` | reconciliação bancária |
| `plano` | `PlanoContasManager` | árvore de contas + form + seed |
| `diarios` | `DiarioContabilManager` | diários + sequências |
| `periodos` | `PeriodoContabilManager` | exercícios + 12 períodos + fecho |
| `contabilistico` | `LancamentoContabilManager` | lista + editor de lançamentos |
| `reconciliacaoContabil` | `ReconciliacaoContabilManager` | reconciliação ligada à contabilidade |
| `relatorios` | `RelatoriosContabilidadeManager` | balancete, razão, diários, conta corrente |
| `fecho` | `FechoPeriodoManager` | fecho mensal |
| `iva` | `ApuramentoIvaManager` | apuramento de IVA |
| `resultados` | `FechoAnualManager` | apuramento de resultados e fecho anual |
| `demonstracoes` | `DemonstracoesManager` | estruturas + demonstrações + exportação |
| `regras` | `RegraContabilizacaoManager` | regras de contabilização automática |
| `integracoes` | `IntegracaoContabilManager` | erros de integração e reprocessamento |
| `mapeamentos` | `MapeamentoContaManager` | chaves simbólicas → contas do PGC |

Não existe aba `apuramentos` nem componente `ApuramentoManager`: as três funções estão divididas em `fecho`, `iva` e `resultados`. O visor de auditoria (`AuditoriaManager`) vive em Configurações, não em Finanças.

Ribbon atual: grupo **Contabilidade** (plano, diários, regras, integrações, mapeamentos, períodos, lançamentos, reconciliação contabilística, relatórios, fecho, IVA, resultados, demonstrações), **Tesouraria** (lançamentos) e **Bancos** (contas, reconciliação).

### 5.6 Ecrãs críticos

**Plano de contas**
- Layout duas colunas: árvore (esquerda, `w-80`, scroll próprio) + detalhe/form (direita).
- Árvore com indentação por `nivel`, código em `font-mono`, badge `aceitaMovimento`.
- Ações: nova conta, nova filha, editar, ativar/desativar, semear PGC.
- Form em `WorkspaceFrame` (não modal) para caber na altura útil.

**Lançamento contabilístico (editor)**
- Diálogo de grande largura (`LancamentoContabilEditor.tsx`) com diário, datas e descrição no topo; o detalhe do lançamento é carregado por `obterLancamento` antes de permitir Guardar/Validar.
- Grelha (`LinhasEditor.tsx`): `Conta | Descrição | Débito | Crédito | remover`, com `SearchSelect portal` apenas para contas activas que aceitam movimento.
- Rodapé fixo: `Débito`, `Crédito`, `Diferença` (comparação em inteiros escalados por 10 000) e botão Validar desativado enquanto desequilibrado; o esquema Zod também recusa o envio desequilibrado.
- Linhas em rascunho editáveis; um lançamento já validado/apurado abre em modo leitura com o estado no rodapé.
- Centro de custo, entidade, imposto e vencimento fazem parte do payload/serviço, mas ainda não são colunas editáveis nesta grelha.

**Fecho de período (wizard)**
- Passos verticais com estado (pendente/ok/aviso/erro), barra de progresso no topo.
- Rodapé fixo com `Pré-visualizar`, `Executar`, `Reverter`.
- Resumo em `Panel` com KPIs (proveitos, custos, IVA, resultado).
- Nunca ultrapassa a altura útil; o corpo do wizard tem scroll interno.

**Apuramento de IVA**
- Cartão de pré-visualização: IVA liquidado, dedutível, crédito transitado, valor a pagar.
- Botões: `Recalcular` (preview), `Validar lançamento`, `Registar pagamento`.
- Tabela de histórico por período com estados.

### 5.7 Acessibilidade e detalhe

- Todos os inputs com `<label>` (via `FieldWrap`), `aria-invalid` quando erro.
- Focus ring visível (`focus:ring-2 focus:ring-primary/20`) — já é o padrão.
- Contraste: não usar `text-muted-foreground` para valores monetários principais.
- Estados vazios com ação primária ("Ainda não há contas. Semear PGC Angola").
- Loading com skeleton em vez de spinner de página inteira.
- Erros de IPC em `toast.error` + estado persistente no ecrã (não só toast).

---

## 6. Plano por fases

> Cada fase = 1 PR. Cada fase termina com: migração Prisma, testes, `npm run typecheck`, e resumo do que foi criado/alterado/reutilizado.

### Fase 1 — Fundações (contas, diários, exercícios, períodos) — ✅ Concluída

**Schema**
- Enums `NaturezaConta`, `TipoContaContabil`, `EstadoExercicio`, `EstadoPeriodoContabil`, `TipoDiario`.
- `ContaContabil`, `PeriodoContabil`, `DiarioContabil`, `SequenciaDiario`, `MapeamentoConta`.
- Estender `ExercicioFiscal` (enum + `fechadoEm`/`fechadoPorId`/`updatedAt`) e relações em `EmpresaConfig`, `Utilizador`, `CentroCusto`, `ContaBancaria`.

**Migração** `20261112090000_contabilidade_fundacoes`
- Converter `exercicios_fiscais.estado` de `text` para enum com `USING`.
- Backfill: `aberto`/`fechado` válidos; valores desconhecidos → `aberto` + log.
- Criar tabelas e índices.

**Seed**
- `prisma/data/pgc-angola.json` (classes 1–8, hierarquia por `codigo`, flags).
- `src/main/services/contabilidade-seed.service.ts`:
  - `semearPlanoContas(empresaId)` idempotente (`upsert` por `[empresaId, codigo]`).
  - `semearDiariosPadrao(empresaId)` (VD, CP, CX, BC, OD, AB, AP, LG).
  - `semearMapeamentosPadrao(empresaId)` (chaves de IVA, bancos, resultados).
- Ligar em `prisma/seed.ts` e expor ação "Semear plano de contas" na UI.

**Backend**
- `src/main/validators/contabilidade.validator.ts` — contas, diários, exercícios, períodos, mapeamentos, filtros.
- `src/main/services/conta-contabil.service.ts` — CRUD, árvore, validação de `codigo`/`classe`/`nivel`, impedir apagar conta com movimentos, impedir `aceitaMovimento` em conta com filhas.
- `src/main/services/diario-contabil.service.ts`.
- `src/main/services/periodo-contabil.service.ts` — criar 12 períodos ao criar exercício; listar; abrir/fechar/bloquear.
- `src/main/services/mapeamento-conta.service.ts`.
- `src/main/controllers/contabilidade.controller.ts` + `src/main/routers/contabilidade.router.ts`.
- `src/main/index.ts` → `registerContabilidadeRouter()`.

**IPC / tipos**
- `src/preload/index.ts` → `contabilidade.contas.*`, `.diarios.*`, `.exercicios.*`, `.periodos.*`, `.mapeamentos.*`, `.seed.*`.
- `src/renderer/src/@types/electron.d.ts` → DTOs.
- `src/renderer/src/api/contabilidade.api.ts`.

**UI**
- `WorkspaceFrame.tsx`.
- `PlanoContasManager.tsx`, `DiarioContabilManager.tsx`, `PeriodoContabilManager.tsx`.
- Tabs e ribbon em `pages/financas.tsx`.
- Todos os selects via `SelectField`/`SearchSelect`; forms dentro de `WorkspaceFrame`/`DialogContent` limitado.

**Testes**
- `conta-contabil.service.test.ts`: unicidade por empresa, hierarquia, `aceitaMovimento`, bloqueio de eliminação.
- `periodo-contabil.service.test.ts`: 12 períodos, datas corretas (inclui fevereiro bissexto), fecho.
- `contabilidade-seed.service.test.ts`: idempotência (correr 2×, contagem igual).
- `contabilidade.validator.test.ts`.

**Aceitação**
- Criar exercício gera 12 períodos.
- Navegar a árvore de contas e marcar folhas.
- Seed idempotente.
- Nenhum formulário ultrapassa a altura útil.

---

### Fase 2 — Lançamentos em partidas dobradas — ✅ Concluída

**Schema**
- `LancamentoContabil`, `LinhaLancamentoContabil`.
- Relações em `EmpresaConfig`, `ExercicioFiscal`, `PeriodoContabil`, `DiarioContabil`, `ContaContabil`, `CentroCusto`, `Utilizador`, `MovimentoTesouraria`.
- Constraints SQL + trigger de imutabilidade.

**Migração** `20261112100000_contabilidade_lancamentos`
- Tabelas, índices, `CHECK`, trigger.
- **Não** migrar `MovimentoTesouraria` (decisão 1.4).

**Backend**
- `src/main/validators/lancamento-contabil.validator.ts`:
  - `criarLancamentoSchema`: ≥ 2 linhas, cada linha com `contaId`, `debito`/`credito` não negativos e mutuamente exclusivos, datas válidas.
  - `validarLancamentoSchema`, `estornarLancamentoSchema`, `lancamentoFiltersSchema`.
- `src/main/services/lancamento-contabil.service.ts`:
  - `criar` (rascunho; calcula totais com `Decimal`).
  - `atualizar` (só `rascunho`).
  - `validar` (`postEntry`): período/exercício abertos, ≥ 2 linhas, equilibrado, contas `aceitaMovimento && activa`, `exigeCentroCusto`/`exigeEntidade`, numeração atómica, `AuditLog`, tudo em `$transaction` com `Serializable`.
  - `estornar`: novo lançamento invertido, `origem = estorno`, `estornoDeId`, original → `estornado`, `AuditLog`.
  - `listar`/`obter` com filtros (período, diário, estado, conta, entidade, texto).
- `src/main/services/sequencia-diario.service.ts`: `proximoNumero(diarioId, exercicioId)` com `UPDATE ... SET ultimo_numero = ultimo_numero + 1 RETURNING`.
- `src/main/controllers/contabilidade.controller.ts` + router.
- Reaproveitar `AuditLog` (adicionar ações `estornar`).

**UI**
- `src/renderer/src/hooks/useLancamentoDraft.ts` (react-hook-form + Zod, com validação local de equilíbrio).
- `LancamentoContabilManager.tsx` (lista com filtros, KPIs de período, ações).
- `LancamentoContabilEditor.tsx` (diálogo com grelha editável, totais fixos, validação local e bloqueio de Guardar/Validar se o detalhe não carregar).
- `src/renderer/src/components/erp/LinhasEditor.tsx` (grelha de linhas com `SearchSelect portal` para contas activas e que aceitam movimento).
- Tab `contabilistico` em `financas.tsx`.

**Testes**
- `lancamento-contabil.service.test.ts`: desequilíbrio recusado, conta não-folha recusada, período fechado recusado, estorno correto, original `estornado`, POSTED imutável.
- `sequencia-diario.service.test.ts`: concorrência (N chamadas paralelas → números 1..N sem buracos).
- `lancamento-contabil.validator.test.ts`.
- Integridade global: `Σ débitos = Σ créditos` após fixtures.

**Aceitação**
- Impossível validar lançamento desequilibrado (UI + serviço + DB).
- Numeração sem falhas sob concorrência.
- POSTED não editável (serviço e trigger).
- Estorno funcional e auditado.
- Formulário nunca ultrapassa a altura útil; débito/crédito nunca aceitam negativos.

---

### Fase 3 — Reconciliação ligada à contabilidade — ✅ Concluída

**Schema**
- `LinhaLancamentoContabil.movimentoTesourariaId` (já criado na Fase 2) + `conciliadoEm`.
- Índices para pesquisa por conta bancária e estado.

**Backend**
- `src/main/services/reconciliacao-contabil.service.ts`:
  - listar linhas de contas com `ContaBancaria.contaContabilId` não nulo.
  - listar movimentos de tesouraria não ligados.
  - sugerir pares por valor + data (± N dias).
  - conciliar/desconciliar em lote (transação).
  - gerar lançamento a partir de movimento sem correspondência (comissões, juros) via `OrigemLancamento.integracao`.
- Validar empresa em todas as operações.

**UI**
- `ReconciliacaoManager.tsx`: duas colunas (extrato vs contabilidade), seleção múltipla, sugestões, diferença em rodapé fixo.
- Estado vazio com CTA "Ligar conta contabilística" quando a conta bancária não tem `contaContabilId`.

**Testes**
- Saldo contabilístico = saldo do extrato ± itens em trânsito listados.
- Conciliar duas vezes não duplica.
- Movimento de outra empresa recusado.

**Aceitação**
- Diferença de reconciliação = 0 ou justificada por itens em trânsito.
- Sem alterações ao saldo derivado existente.

---

### Fase 4 — Motor de contabilização — ✅ Concluída

**Schema**
- `RegraContabilizacao`, `LinhaRegraContabilizacao`, `ErroIntegracaoContabil`.
- `MapeamentoConta` já existe.

**Constantes**
- `src/main/constants/contabilidade.constants.ts`:
  - `CHAVES_CONTA` (lista fechada: `VAT_OUTPUT`, `VAT_INPUT`, `VAT_PAYABLE`, `VAT_RECOVERABLE`, `CUSTOMER_ACCOUNT`, `SUPPLIER_ACCOUNT`, `SALES_ACCOUNT`, `PURCHASE_ACCOUNT`, `BANK_ACCOUNT`, `CASH_ACCOUNT`, `RESULT_OPERATING`, `RESULT_FINANCIAL`, `RESULT_NON_OPERATING`, `RESULT_TAX`, `RESULT_NET`, `RETAINED_EARNINGS`, `PAYROLL_EXPENSE`, `PAYROLL_PAYABLE`, `SOCIAL_SECURITY_PAYABLE`, `WITHHOLDING_PAYABLE`).
  - `EXPRESSOES_VALOR` (lista fechada: `TOTAL`, `NET`, `TAX`, `TAX:<taxa>`, `BASE`, `DISCOUNT`, `PAID`, `OUTSTANDING`).
  - `RESOLVEDORES_CHAVE_CONTA` — funções puras, sem `eval`.

**Backend**
- `src/main/services/motor-contabilizacao.service.ts`:
  - `gerar({ empresaId, moduloOrigem, tipoOrigem, origemId, dados })`.
  - Procura regra ativa; resolve contas; calcula montantes; cria lançamento `origem = integracao`.
  - Idempotência por `@@unique([moduloOrigem, tipoOrigem, origemId, origem])`.
  - Sem regra/conta → grava `ErroIntegracaoContabil` e devolve `{ pendente: true }`, **sem lançar** para o módulo de origem.
- `src/main/services/integracao-contabil.service.ts` — orquestra chamadas dos módulos:
  - Vendas: `FaturaVenda` emitida → regra `VENDA_FATURA`; anulada → estorno.
  - Recibos: `ReciboVenda` → `VENDA_RECIBO`.
  - Compras: `FaturaCompra` → `COMPRA_FATURA`.
  - Tesouraria: `MovimentoTesouraria` confirmado → `TESOURARIA_MOVIMENTO`.
  - RH: substituir `StubFinancasGateway` em `rh-financas-gateway.ts` por implementação real que chama `LancamentoContabilService` e `TesourariaService`.
  - Imobilizado: não existe — **não implementar** (documentar como futuro).
- Ponto de integração: chamar o motor **depois** do commit do documento, com `try/catch` que regista erro e nunca desfaz o documento.
- `src/main/controllers/contabilidade.controller.ts`: regras CRUD, listar erros, reprocessar.
- `src/main/services/motor-contabilizacao.service.test.ts` + `integracao-contabil.service.test.ts`.

**UI**
- `RegraContabilizacaoManager.tsx` — lista + editor de linhas (lado, conta/chave, expressão).
- `IntegracaoContabilManager.tsx` — erros pendentes, detalhe, "Reprocessar".
- `MapeamentoContaManager.tsx` — chaves → contas (dentro de Configurações ou tab de Contabilidade).
- Selects de conta via `SearchSelect`; expressões via `SelectField` (lista fechada).

**Aceitação**
- A mesma fatura nunca gera dois lançamentos.
- Documento anulado gera estorno.
- Sem regra → pendente, módulo de origem continua a funcionar.
- Nenhuma expressão avaliada dinamicamente.

---

### Fase 5 — Relatórios base — ✅ Concluída

**Backend**
- `src/main/services/relatorios-contabilidade.service.ts`:
  - `balancete(filtros)`: débito, crédito, saldo por conta; agregar pais por `codigo`; opção saldo zero; por período ou acumulado.
  - `razao(contaId, filtros)`: saldo transitado + linhas + saldo corrente.
  - `diarios(filtros)`: por diário/período, ordenado por número.
  - `contaCorrente(entidadeTipo, entidadeId, filtros)` + antiguidade de saldos.
- Exportação: `relatorio-pdf.service.ts` (pdfkit) + `exceljs`.
- `src/main/validators/relatorios.validator.ts` — estender com filtros contabilísticos.

**UI**
- `RelatoriosContabilidadeManager.tsx` com sub-tabs: Balancete, Razão, Diários, Conta Corrente.
- Filtros em barra superior (período, diário, conta, entidade, "incluir saldo zero").
- Tabela com cabeçalho sticky e rodapé de totais.
- Botões PDF/Excel com as bibliotecas existentes.

**Testes**
- Total do balancete = soma dos lançamentos validados.
- Razão reconcilia com balancete.
- Fixture de exercício completo com totais conhecidos.

**Aceitação**
- Relatórios derivados exclusivamente de `LinhaLancamentoContabil` com `estado = validado`.

---

### Fase 6 — Fecho mensal e bloqueio de períodos — ✅ Concluída

**Backend**
- `src/main/services/fecho-periodo.service.ts`:
  - `previsao(periodoId)` → checklist com estados.
  - Passos: integrações pendentes; reconciliação; rascunhos; amortizações (se existir); regularizações; IVA; balancete equilibrado.
  - `executar(periodoId)` → `ExecucaoFecho` `fechoMensal`, período `fechado`, `AuditLog`.
  - `reabrir(periodoId, motivo)` → só com `approve`; `ExecucaoFecho` `revertido`; `AuditLog`.
- Bloqueio no serviço **e** validado por IPC.

**UI**
- `FechoPeriodoManager.tsx` — wizard vertical, progresso, rodapé fixo.
- `PeriodoContabilManager.tsx` mostra estado e ações.

**Testes**
- Lançar em período fechado é recusado no serviço e no IPC.
- Reabrir exige permissão `approve`.
- Fecho é idempotente (não cria duas execuções).

**Aceitação**
- Nenhuma escrita em período fechado, mesmo chamando o serviço diretamente.

---

### Fase 7 — Apuramento de IVA — ✅ Concluída

**Schema**
- `ApuramentoImposto`.

**Backend**
- `src/main/services/apuramento-iva.service.ts`:
  - `previsao(periodoId)`: `ivaLiquidado = Σ créditos − Σ débitos` nas contas `VAT_OUTPUT`; `ivaDedutivel = Σ débitos − Σ créditos` nas contas `VAT_INPUT`; `saldo = liquidado − dedutivel − creditoTransitado`.
  - `executar`: cria `ApuramentoImposto` + lançamento no diário de apuramento (D `VAT_OUTPUT`, C `VAT_INPUT`, C `VAT_PAYABLE` ou D `VAT_RECOVERABLE`).
  - `registarPagamento`: lançamento D `VAT_PAYABLE` / C banco.
  - Transporte de crédito para o período seguinte.
- Generalização futura: retenções, IRT, INSS, imposto de selo (mesmo padrão `imposto → conta liquidada → conta a pagar`).

**UI**
- `ApuramentoIvaManager.tsx` com cartão de preview e histórico.
- Ações `Recalcular`, `Validar`, `Registar pagamento`.

**Testes**
- Resultado coincide com cálculo manual de fixture.
- Crédito transita corretamente.
- Não permite dois apuramentos para o mesmo período.

**Aceitação**
- Apuramento tem PREVIEW, é reversível e auditado.

---

### Fase 8 — Apuramento de resultados e fecho anual — ✅ Concluída

**Backend**
- `src/main/services/apuramento-resultados.service.ts`:
  - Passos 82/83/85/86/88 via `MapeamentoConta`.
  - `previsao` calcula totais e mostra `resumo` (proveitos, custos, resultado antes de impostos, imposto, resultado líquido).
  - `executar` cria `ExecucaoFecho` `apuramentoResultados` + lançamentos.
- `src/main/services/fecho-anual.service.ts`:
  - Sequência rígida: períodos 1..12 fechados → regularizações → resultados → encerramento → abertura N+1.
  - Encerramento: apenas contas de movimento (6/7/resultados); `ExercicioFiscal.estado = fechado`; períodos `bloqueado`.
  - Abertura: cria exercício N+1 + 12 períodos; lançamento `origem = abertura` com saldos das classes 1–5; mantém terceiros por entidade linha a linha.
  - `reabrir`: só se N+1 não tiver lançamentos além da abertura; `REVERTED` do `ExecucaoFecho`; estorno; reabre períodos; `AuditLog`.
- Transferência de `RESULT_NET` → `RETAINED_EARNINGS` (81) só após aprovação manual das contas (ação separada).

**UI**
- `FechoAnualManager.tsx` — wizard com passos bloqueados até o anterior concluir.
- `ApuramentoResultadosManager.tsx` — preview com KPIs + confirmar.

**Testes**
- Após abertura: balancete N+1 em 01/01 = balancete final N nas classes 1–5.
- Classes 6/7 com saldo zero.
- Resultado líquido = proveitos − custos − imposto.
- Reabertura bloqueada quando N+1 tem lançamentos.

**Aceitação**
- Nenhum passo pode saltar a ordem.
- Todas as operações em transação e auditadas.

---

### Fase 9 — Demonstrações financeiras, SAF-T e auditoria — ✅ Concluída

**Schema**
- `EstruturaRelatorio`, `LinhaEstruturaRelatorio`, `ContaEstruturaRelatorio`.

**Backend**
- `src/main/services/demonstracoes.service.ts`: Balanço, DR, Fluxos de Caixa (método direto por contas de caixa/banco + categorias), Alterações no Capital Próprio.
- `src/main/services/saft/` — `GeneralLedgerEntries` com `Journal`/`Transaction`/`Line` a partir de lançamentos `validado`/`estornado` do período; validação estrutural coerente (não foi fornecido XSD oficial).
- `AuditLog` — consulta filtrada por `modulo = 'financas'`; reutilizar `AuditoriaManager.tsx`.

**UI**
- O editor de estruturas é uma fase interna de `DemonstracoesManager.tsx`: código, designação, tipo, activa e linhas com pai/ordem/nível/tipo/operação/sinal; as contas associadas são geridas no serviço/estrutura, não num ecrã separado. **Não existe** `EstruturaRelatorioManager.tsx`.
- `DemonstracoesManager.tsx` — Balanço/DR/Fluxos/Alterações no capital próprio com selecção de Exercício/Período a definir o intervalo de geração e exportação (PDF/XLSX pelo canal `contabilidade:relatorios:exportar`); datas manuais são uma sobreposição explícita.
- `AuditoriaManager` — filtro rápido “Só finanças” e opção `financas` no seletor de módulo; o ecrã fica em Configurações, não em Finanças.

**Testes**
- Serviço de demonstrações: hierarquia, operações, sinais, abertura/período, validações e avisos.
- Exportação de demonstrações com verificação de empresa e auditoria.
- SAF-T: serialização, mapeamento, validação estrutural e exclusão de rascunhos.
- Balanço fecha: Ativo = Passivo + Capital Próprio (quando a estrutura está configurada para tal).
- DR reconcilia com classes 6/7 (quando a estrutura está configurada para tal).

**Aceitação**
- Nenhuma conta fixa no código; tudo vem da estrutura configurável.

---

## 7. Ordem de migrações

| # | Migração | Conteúdo |
|---|---|---|
| 1 | `20261112090000_contabilidade_fundacoes` | enums, `contas_contabeis`, `periodos_contabeis`, `diarios_contabeis`, `sequencias_diario`, `mapeamentos_conta`; conversão de `exercicios_fiscais.estado`; índices |
| 2 | `20261112100000_contabilidade_lancamentos` | `lancamentos_contabeis`, `linhas_lancamento_contabil`; `CHECK`; trigger |
| 3 | `20261112110000_contabilidade_regras` | `regras_contabilizacao`, `linhas_regra_contabilizacao`, `erros_integracao_contabil` |
| 4 | `20261112120000_contabilidade_fecho` | `execucoes_fecho`, `apuramentos_imposto` |
| 5 | `20261112130000_contabilidade_relatorios` | `estruturas_relatorio`, `linhas_estrutura_relatorio`, `contas_estrutura_relatorio` |

Cada migração deve ser testada em base limpa (`docker compose down -v && up`) e em base com dados (`prisma migrate dev`).

---

## 8. Testes e verificação

### 8.1 Comandos

```bash
npm run typecheck
npm test
npx prisma validate
npm run build
```

### 8.2 Obrigatórios por fase

- Unidade dos serviços (`validar`, `estornar`, motor, apuramentos, fecho).
- Concorrência da numeração (`sequencia-diario.service.test.ts`).
- Integridade global `Σ débitos = Σ créditos` em qualquer fixture.
- Fixture de um exercício completo com resultado conhecido.
- IPC: período fechado recusado na camada de serviço, não só na UI.
- Seed idempotente.
- Formulários: teste de que `CurrencyField`/`NumberField` não aceitam `-`.

### 8.3 Fixtures

- `src/test/fixtures/contabilidade/plano-contas-minimo.ts`
- `src/test/fixtures/contabilidade/exercicio-2026.ts` (vendas, compras, IVA, salários, fecho).

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Migração de `ExercicioFiscal.estado` quebra dados | Backfill com `CASE`, valores desconhecidos → `aberto`; testar em cópia |
| `Decimal` → `number` no IPC perde precisão | DTOs de contabilidade em string; `decimal.js` no renderer |
| Performance do balancete com muitos lançamentos | Índices `[contaId, lancamentoId]`, `[periodoId, estado]`; materialized view só se medido |
| Numeração com buracos | `UPDATE ... RETURNING` na mesma transação; `Serializable`; teste de concorrência |
| Trigger de imutabilidade bloquear migrações | Trigger criado no fim da migração; `DISABLE TRIGGER` apenas em migração explícita |
| Duplicação de lançamentos por integração | `@@unique([moduloOrigem, tipoOrigem, origemId, origem])` |
| Dois conceitos de "lançamento" (tesouraria vs contabilidade) | Nomes distintos: `MovimentoTesouraria` vs `LancamentoContabil`; UI separada |
| Formulários altos em ecrãs pequenos | `WorkspaceFrame` + `dvh` + scroll interno; testar a 768px de altura |
| Valores negativos | 3 camadas (input, Zod, CHECK) |

---

## 10. Definição de pronto (global)

- [ ] `docs/financas/DESCOBERTA_CONTABILIDADE.md` gerado a partir desta Fase 0 e aprovado.
- [ ] Nenhum modelo/serviço/componente duplicado face ao inventário.
- [x] `Σ débitos = Σ créditos` global em qualquer momento.
- [ ] Lançamentos validados imutáveis (serviço + trigger); correções só por estorno.
- [x] Períodos/exercícios fechados bloqueiam escrita no serviço e no IPC.
- [x] Apuramentos e fechos com PREVIEW, reversíveis e auditados.
- [x] Relatórios derivados exclusivamente de linhas validadas.
- [ ] Contas, taxas e regras parametrizáveis.
- [ ] Todos os selects são `SearchSelect`.
- [ ] Nenhum formulário ultrapassa a altura útil (`WorkspaceFrame`/`DialogContent` com `dvh`) — ✅ aplicado nas fases 1 e 3; restante por auditar.
- [ ] Quantidades e montantes não aceitam negativos (input + Zod + DB).
- [ ] `npm run typecheck`, `npm test`, `npm run build` verdes.

---

## 11. Checklist de execução

1. Aprovar este plano e as decisões em aberto da secção 1.5.
2. ❌ Pendente: criar `docs/financas/DESCOBERTA_CONTABILIDADE.md` (inventário, mapa, lacunas, conflitos) — sem alterar código.
3. ✅ Concluída: Fase 1 → migração + seed + backend + UI + testes.
4. ✅ Concluída: Fase 2 → lançamentos + numeração + estorno.
5. ✅ Concluída: Fase 3 → reconciliação.
6. ✅ Concluída: Fase 4 → motor de contabilização + integrações.
7. ✅ Concluída: Fase 5 → relatórios base.
8. ✅ Concluída: Fase 6 → fecho mensal e bloqueio de escrita no serviço.
9. ✅ Concluída: Fase 7 → IVA.
10. ✅ Concluída: Fase 8 → resultados + fecho anual.
11. ✅ Concluída: Fase 9 → demonstrações + SAF-T estrutural + auditoria financeira.
