# 05 — Phase 0 Implementation Plan (RH)

**State:** Plan mode (no file edits) — Date: 2026-10-12
**Purpose:** Understand codebase design patterns and create comprehensive plan to implement RH module following existing conventions.

---

## Executive Summary

The RH module (Recursos Humanos) is documented in rh-docs (spec, implementation plan, tasks, data model). This plan analyzes the actual codebase patterns vs rh-docs assumptions and provides a concrete implementation roadmap aligned with DoraERP's existing architecture.

**Key finding:** The rh-docs assume a `modules/` folder structure (modules/rh/*) but the actual codebase uses domain-driven organization: `main/{services,controllers,routers,validators,repositories,middlewares,constants}/`, `renderer/src/{pages,components/erp,api,config,hooks}/`, `preload/index.ts`, and Prisma schema in `prisma/schema.prisma`. The implementation must follow **existing conventions**, not invent new structure.

---

## 1. Codebase Architecture Mapping (Reality vs rh-docs)

### 1.1 Main Process (Electron Main)

**Actual pattern (per existing modules like compras/vendas/artigo/tesouraria):**

```
src/main/
├── constants/permissions.constants.ts  (RBAC source of truth)
├── middlewares/rbac.middleware.ts      (hasPermission, requirePermission, requireAnyPermission)
├── database/prisma.ts                  (Prisma singleton, PG adapter)
├── utils/errors.ts                     (AppError hierarchy)
├── utils/ipc-response.ts               (IpcResponse<T>, ok/err, serializeIpcData)
├── validators/*.validator.ts           (Zod schemas for input validation)
├── services/*.service.ts               (Business logic, Prisma transactions)
├── controllers/*.controller.ts         (IPC handlers, auth checks, error mapping)
├── routers/*.router.ts                  (ipcMain.handle registrations)
└── index.ts                            (register all routers)
```

**VS rh-docs assumption:** `modules/rh/*/service`, `ipc/rh/*`, etc. — **Different.** We must follow actual pattern.

**IPC Pattern:** Router registers `ipcMain.handle('channel:name', ...)` calling controller method. Controllers return `IpcResponse<T>`. Preload exposes `window.api.channel.name(...)`.

**Auth/Permissions:** Controllers call `authService.getCurrentSession()` then `requirePermission`/`requireAnyPermission` from rbac.middleware. Permissions defined in constants.

**Audit:** `audit.service.ts` - append-only, integrity hashing (SHA-256 canonical JSON), never throws to block operations.

### 1.2 Preload (ContextBridge)

**Actual:** `src/preload/index.ts` exports `api` object with nested namespaces (artigos, compras, vendas, tesouraria, etc.), each exposing IPC methods via `ipcRenderer.invoke('channel', ...)`. Also TypeScript declarations in `index.d.ts`/types. RH needs `api.rh.*` namespace.

### 1.3 Renderer (React)

**Actual:**
```
src/renderer/src/
├── App.tsx                            (HashRouter, routes)
├── config/
│   ├── modules.ts                     (ModuleKey union, MODULES array, paths)
│   ├── permissions.ts                 (RBAC types/mappings for renderer)
│   └── ui.ts
├── pages/*.tsx                        (Page components using ErpShell)
├── components/erp/                    (Feature managers: ComprasManager, etc.)
├── components/ui/                     (shadcn/ui)
├── api/*.api.ts                        (API clients calling window.api)
├── hooks/useAuth.ts                   (Zustand auth store, hasPermission)
├── @types/electron/                   (Shared types)
└── utils/ (currency, etc.)
```

**UI Patterns (from analysis):**
- **ErpShell**: TopBar, ModuleNavigation, RibbonBar (with ribbon groups/actions), PageHeader, StatusBar. Active module, tabs, breadcrumbs, ribbon actions.
- **FormPrimitives**: FormShell (RHF + Zod), FormTabs, FormSection, FieldWrap, SmartSelect, PriceInput/QuantityInput, etc. Uses react-hook-form.
- **Data display**: Tables with actions, Dialog modals, SearchSelect, badges, toasts (sonner).
- **State**: Zustand for auth; component state for managers; react-query not obvious, mostly direct API calls.

### 1.4 Prisma Schema

**Actual:** PostgreSQL via @prisma/adapter-pg. Models use cuid(), have `createdAt/updatedAt`, follow naming (PascalCase models, camelCase fields mapped with @map where needed). Multi-empresa: `EmpresaConfig` has relations; many models reference `empresaId` or relate via EmpresaConfig. Decimals use `@db.Decimal(18,4)` etc.

RH schema (docs) is well-structured with `Rh*` prefix, proper enums, indexes, and notes `// EXT:` for external entities (Utilizador, ContaBancaria, CentroCusto, Moeda, LancamentoContabil). Should integrate cleanly.

### 1.5 Integration Points (Critical for RH)

From codebase analysis:
- **Finanças/Tesouraria:** `tesouraria.service.ts`, `ContaBancaria`, `MovimentoTesouraria`, `SessaoCaixa`. RH needs to generate payments → create tesouraria movements? Also "lançamento contabilístico" (contabilidade). Need to see if there's PlanoContas/LancamentoContabil models. Let us look up schema more.
- **Multi-empresa:** EmpresaConfig is central. Many entities belong to empresa. RH employees/processing should respect empresa context (empresaId).
- **Auditoria:** Mandatory audit trail exists - controllers often don't call audit explicitly except auth; but audit service is there. RH operations (processar/anular/pagar) need audit.
- **Permissions:** RBAC is strict. Need to add 'rh' module to MODULOS_RBAC (main + renderer).
- **Numeração/sequências:** DocumentoNumeroService exists (`reservarNumero`, etc.) for documents (faturas). RH has its own `RhSequencia` model and also recibos need numbering. May use either approach - follow RH model or adapt to existing service? Need to check conventions.

---

## 2. Mapping: Repo Reality vs rh-docs (RH-001)

### Differences found

| Aspect | rh-docs says | Actual codebase | Action |
|---|---|---|---|
| Main structure | `modules/rh`, `ipc/rh`, `shared/rh` | Domain folders: services/controllers/routers/validators + shared types in `@types/electron` or maybe add `shared/`? Let us check - no shared folder visible. Also preload/types. | Follow actual pattern: create validators/rh.*, services/rh.*, controllers/rh.*, routers/rh.* (or just rh.* files). No separate modules/ dir. |
| Shared schemas | `shared/rh/schemas` (Zod) | Zod schemas live in `main/validators/*.validator.ts`. Types exported/shared via TypeScript types; renderer has `@types/electron`. | Put RH Zod schemas in `src/main/validators/rh.validator.ts` (or split). Keep types consistent. |
| IPC channels | `rh:<recurso>:<acao>` | Existing use colon notation like `artigos:list`, `vendas:emitirFatura`, `tesouraria:movimentos:criar`. Yes matches `recurso:acao` or nested. RH should follow same (e.g., `rh:funcionarios:listar`, `rh:processamento:processar`). |
| Engine (motor puro) | `main/modules/rh/processamento/engine/` | Could put as `src/main/services/rh/calculo/engine/` or just `services/rh-engine/` as internal module. Or create files under services. Keep pure (no Prisma imports). | Create `src/main/services/rh/calculo/engine/` or separate files. Engine must be pure TS/Decimal. |
| Renderer features | `renderer/features/rh` | Features live as components under `components/erp/` (managers) and pages. e.g. ComprasManager.tsx. | Create RH page `pages/rh.tsx` and RH managers in `components/erp/rh/` or single `RhManager` with tabs? Or multiple like existing modules. Check how complex - RH has many areas (funcionários, processamento, recibos, etc.). Maybe `RhFuncionariosManager`, `RhProcessamentoManager`, `RhRecibosManager` etc, or a unified page with ribbon tabs like FinancasPage (tabs). |
| Routes | Lazy routes for `/rh` | Routes in App.tsx (HashRouter). No lazy() usage obvious - direct imports. | Add route `/rh` in App.tsx, import page, add ProtectedRoute with appropriate module/permission. Need to add 'rh' module. |

### Confirmations needed (from spec §13 + RH-001)
Need to confirm:
1. IDs strategy: cuid() - matches codebase ✓
2. Multi-empresa: empresaId usage pattern - matches (EmpresaConfig relations)
3. Decimal handlin
### Existing APIs/Capabilities Analysis

**Available in codebase:**
- **Tesouraria (Finanças):** Contas bancárias, movimentos (entrada/saida/transferencia), sessões de caixa, conciliação. IPC channels `tesouraria:*`. Services: tesouraria.service.ts, conta-bancaria.service.ts (inferred). 
- **Document numbering:** DocumentoNumeroService - can reserve numbers (used for TS, SC etc). RH has RhSequencia model - can use either; follow RH model as per spec for recibos (série/ano/sequência) to match exact business rules.
- **Auditoria:** auditService with integrity - must integrate for critical RH operations.
- **Permissões/RBAC:** strict - need to add 'rh' module everywhere.
- **Multi-empresa:** EmpresaConfig pattern - all RH entities that need scoping should consider empresaId (per schema notes).
- **Prisma transactions:** used extensively (see compras.service, tesouraria.service). Critical for processamento (atomic operations).

**Missing for RH needs:**
- Plano de Contas / Lançamentos Contabilísticos - no models. 
- Centros de Custo - check schema? Let us look. Also "CentroCusto" mentioned as EXT in RH schema.
- Moeda - maybe in EmpresaConfig (moedaBase). Multi-moeda support needed.

Looking up CentroCusto in schema:
**Findings from analysis:**
- No PlanoContas/LancamentosContabilisticos models exist in current schema
- No CentroCusto model visible
- Moeda handled via strings like "AOA" (EmpresaConfig.moedaBase)
- Tesouraria handles cash movements (MovimentoTesouraria) - this is the "movimento de tesouraria" integration mentioned (pagar gera movimento)
- The spec says "lançamento contabilístico" - if not implemented, we must follow RH-002: create `FinancasGateway` interface with stub implementation, document how rubricas map to accounts conceptually, and note this as dependency/blocker for Fase 5 (per tasks). This matches the plan in tasks.

**ContaBancaria exists** - can use for payment accounts.

---

## 4. RH Module Implementation Strategy

Following existing codebase patterns, NOT rh-docs' assumed `modules/` structure.

### 4.1 Main Process Structure to Create

```
src/main/
├── validators/
│   └── rh.validator.ts           # All Zod schemas (funcionários, contratos, processamento, etc.)
├── services/
│   ├── rh.service.ts             # Core service? Or split by domain
│   ├── rh-funcionarios.service.ts
│   ├── rh-contratos.service.ts
│   ├── rh-processamento.service.ts
│   ├── rh-calculo/               # Motor de cálculo (pure)
│   │   ├── engine/               # Core engine: types, utils (Decimal), helpers
│   │   ├── calculadoras/         # Vencimento, Subsídio Natal/Férias, Extraordinário, Fim Contrato
│   │   └── indices.ts
│   ├── rh-recibos.service.ts
│   ├── rh-pagamentos.service.ts
│   ├── rh-assiduidade.service.ts
│   ├── rh-dividas.service.ts
│   ├── rh-honorarios.service.ts
│   ├── rh-config.service.ts
│   └── rh-financas-gateway.ts    # Interface + stub (RH-002)
├── controllers/
│   ├── rh.controller.ts          # Or split by domain
│   └── rh-*.controller.ts       # Domain controllers
├── routers/
│   └── rh.router.ts             # IPC routes (or split)
└── (registered in main/index.ts)
```

**Recommendation:** Split by domain for maintainability (like how compras has multiple concerns). But can start with focused files.

### 4.2 Preload additions

Add to `src/preload/index.ts` in `api` object:
```ts
rh: {
  funcionarios: { list/get/create/update/delete/inativar ... },
  processamento: { preparar/simular/processar/anular/detalhe/historico ... },
  recibos: { ... },
  pagamentos: { ... },
  config: { ... },
  // etc.
}
```

Also update types in preload/index.d.ts if needed.

### 4.3 Renderer Structure to Create

```
src/renderer/src/
├── pages/
│   └── rh.tsx                   # Main RH page with tabs/ribbon
├── components/erp/rh/           # RH-specific components
│   ├── RhFuncionariosManager.tsx
│   ├── RhProcessamentoManager.tsx
│   ├── RhRecibosManager.tsx
│   ├── RhPagamentosManager.tsx
│   ├── RhConfiguracaoManager.tsx
│   └── ...
├── api/
│   └── rh.api.ts                # API client
└── config/
    ├── modules.ts               # Add 'rh' module
    └── permissions.ts           # Add 'rh' to ModuloRbac
```

Also update:
- App.tsx - add route `/rh`
- modules.ts - add ModuleKey 'rh', MODULES entry
- permissions.ts (renderer) and constants/permissions.constants.ts (main) - add 'rh' to MODULOS_RBAC

### 4.4 Prisma Schema Changes

Add all RH models from docs/04-modelo-de-dados.md to `prisma/schema.prisma`. Key points:
- Prefix `Rh*` ✓
- Enums with `Rh*` prefix ✓
- Use `cuid()` ✓
- Add `empresaId` where multi-empresa makes sense (Funcionário, Configuração etc as per EXT notes). Also consider scoping.
- Decimals with `@db.Decimal(18,4)` etc (Postgres). 
- Indexes as specified.
- Relations to external entities: Usuario, ContaBancaria, CentroCusto - add as `String? @map(...)` with comments if models don't exist? Or create minimal stubs? Better to add fields as specified (`// EXT:` in docs) - we can add relations later if those models exist; or just store IDs. Prisma allows optional relations even if target doesn't exist? Better to add fields as strings with comments per docs guidance.

Follow migration strategy: create migrations incrementally (1-4 as per tasks).

---

## 5. Phase 0 Detailed Plan (RH-001 to RH-006)

### RH-001 · Mapear o repositório (S) — ✅ Mostly done by this analysis
**CA:** ADR-001 style notes in DECISOES.md or in this plan. Document structure, IPC, auth, audit, Decimal handling, multi-empresa, shared components.

**Actions:**
- Create `docs/rh-docs/DECISOES.md` (or append to this plan) capturing decisions:
  - Structure: follow domain folders (services/controllers/routers/validators) not modules/ 
  - Engine pure in services/rh-calculo
  - RH module name: 'rh' in RBAC
  - Decimal: use Decimal.js math in engine; serialize via serializeIpcData for IPC
  - empresaId scoping where applicable
  - Use RH schema as-is from docs, adapt to Postgres conventions

### RH-002 · Spike integração Finanças (M) — Critical
**CA:** Interface TS + stub + decision on contas contabilísticas.

**Actions:**
- Create `src/main/services/rh-financas-gateway.ts`
```ts
export interface FinancasGateway {
  criarLancamentoContabil(params: {...}): Promise<{ id: string }>;
  criarMovimentoTesouraria(params: {...}): Promise<{ id: string }>;
  estornarLancamento(id: string, motivo: string): Promise<void>;
  estornarMovimento(id: string, motivo: string): Promise<void>;
}
export class StubFinancasGateway implements FinancasGateway { ... throws NotImplemented or logs ... }
```
- Decide: for MVP, can we integrate with tesouraria (MovimentoTesouraria) for payments? Yes - pagar creates pendente then confirm → creates tesouraria movement. "Lançamento contabilístico" may be deferred or stubbed with clear TODOs if no PlanoContas. Document in DECISOES.md.

### RH-003 · Esqueleto módulo RH (S)
**CA:** Module navigable, empty page with ribbon.

**Actions:**
1. Add 'rh' to permissions (main + renderer) - need to edit files? User said "Do NOT edit files yet (plan mode)". But implementation requires edits. Wait - the task says "Create comprehensive implementation plan..." and "Do NOT edit files yet (plan mode)". So plan is fine; implementation comes after approval. But we must document exact changes.
2. Add to modules.ts (renderer) - ModuleKey includes 'rh', add MODULES entry { key:'rh', label:'Recursos Humanos', path:'/rh', modulo:'rh', acao:'read' }
3. Add route in App.tsx: import RhPage, add protected route
4. Create pages/rh.tsx with ErpShell, ribbon with "Geral" tabs (Funcionários, Processamento, etc. per spec)
5. Register minimal IPC? Maybe not yet - empty shell.

But creating page files counts as editing/creating files. The user said "Do NOT edit files yet (plan mode)". So in plan mode we describe what to create; actual creation happens after. This is fine.

### RH-004 · Permissões rh.* (S)
Register rh permissions as per spec §2:
- rh.funcionarios.{ver,criar,editar,inativar}
- rh.contratos.{ver,gerir}
- rh.alteracoes.{ver,gerir}
- rh.processamento.{simular,processar,anular}
- rh.recibos.{ver,emitir}
- rh.pagamentos.{ver,gerir}
- rh.assiduidade.{ver,gerir,aprovar}
- rh.dividas.{ver,gerir}
- rh.independentes.{ver,gerir,processar}
- rh.config.{ver,editar}
- rh.salarios.ver (sensitive)

But existing RBAC uses module.action model (read/write/delete/approve/admin). The rh-docs describe fine-grained permissions like `rh.funcionarios.criar`. Need to reconcile. Looking at how existing system works - permissions stored as object with arrays of actions. The module is the key. So for RH, maybe treat 'rh' as module with actions? Or add specific permission keys.

Looking at permissions.constants.ts: module keys are top-level modules. Actions are read/write/delete/approve/admin. So to have fine-grained control, we might extend or interpret. But easier to add 'rh' as module with standard actions, and also handle sensitive data (salarios.ver) via additional checks in controllers/UI based on permission strings? Or extend the model.

But better to follow existing model first. Add 'rh' module with actions read/write/delete/approve/admin. Then map rh-docs permissions to these. For example: funcionarios.ver/criar/editar/inativar maps to read/write; inativar might be delete or write; processamento.simular/processar/anular - processar might need approve or write+special check; salarios.ver is sensitive - could require 'rh' with 'read' plus special check? Or add a separate permission like 'rh.salarios' module? That complicates things.

Alternatively, follow the spirit: protect routes by module 'rh' and action level, and add additional checks for sensitive fields (rh.salarios.ver) in controllers/UI using session.permissoes for custom keys? Because permissoes is flexible (object with string arrays/booleans). The rbac.middleware checks modulePerms includes action. So custom fine-grained can be stored in permissoes['rh.salarios'] or similar. Let us look up how permissoes is structu

---

## 6. Prisma Schema Integration Plan

Add all models from 04-modelo-de-dados.md to schema.prisma. Need to:
1. Add enums (Rh* enums) 
2. Add models (RhDepartamento, RhCargo, RhFuncionario, etc. - all 30+ models)
3. Consider relations to existing models where applicable (e.g., Utilizador for createdPorId/aprovadoPorId - can be stored as String without relation to keep schema changes minimal? Or add relations; but cross-module relations are fine as long as consistent)
4. Add empresaId fields where marked // EXT
5. Use Decimal with @db.Decimal as specified

Also need to check if there might be naming conflicts? All prefixed Rh*, so safe.

Migration: will need to generate with prisma migrate dev. But in plan mode, just document.

---

## 7. Critical Questions to Ask User

Based on analysis, these need clarification before implementing:

1. **Finanças integration (RH-002)**: Is there a PlanoContas model? Any existing accounting/contabilidade module? If not, should we implement stub for lançamentos contabilísticos now or skip for MVP and note? The spec says integrate with Finanças - but current Finanças is tesouraria. This affects Fase 5 significantly.

2. **Centros de Custo**: Do they exist? Needed for afetações (RhAfetacao.centroCustoId) and rateio. If not, how to model?

3. **Permissões model**: Follow rh-docs fine-grained (`rh.funcionarios.criar`) or map to existing module.action model (`rh` module with write)? Current UI builds permission matrix from fixed modules/actions. Fine-grained needs UI changes.

4. **Motor de cálculo location**: Put as pure TypeScript in `src/main/services/rh/calculo/` (no Prisma deps) - OK?

5. **RH module label in menu**: "Recursos Humanos" - add to top nav? Yes, like other modules.

6. **Sensitive data (salarios.ver)**: Additional permission check beyond module 'rh' read? Need to confirm approach.

7. **Multi-empresa scoping**: Should RH entities be fully scoped by empresaId? The schema has empresaId commented in places - confirm which need it.

8. **Migration strategy**: Generate all RH tables in one migration or split as per tasks (RH-101-104)? Better to follow task order for clarity, but prisma migrate creates one migration per dev command. Maybe create migrations as we go per phase.

9. **Golden tests data**: The spec says RH provides ≥20 cases - when?

10. **Recibo PDF template**: Need to see existing PDF generation. There's `documento-print.router.ts`, maybe use same approach (jsPDF or similar)? Check existing implementation.

11. **File transfer format for banks**: Unknown - stub is fine for MVP.

---

## 8. Risk Assessment (updated)

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Finanças gateway unclear (no PlanoContas) | High | High | Implement interface+stub now (RH-002). Defer full contabilística if needed, but track as blocker for Fase 5. |
| RBAC model mismatch (fine-grained vs module.action) | Medium | High | Start with 'rh' module + standard actions; add special checks for salarios.ver and other fine-grained cases. Can extend later. |
| Engine precision with Decimal/IPC | High | Medium | Keep all calc in engine with Decimal; only convert at boundaries. serializeIpcData handles Prisma.Decimal; be careful. |
| Large schema addition (30+ models) | Medium | Medium | Add incrementally per migrations 1-4 as per tasks. |
| Pattern deviation from rh-docs expectations | Low | Low | Follow existing codebase patterns strictly - this is the right call given codebase is mature. |

---

## 9. Recommended Implementation Order (Phase 0 First)

1. **RH-001** (done conceptually) - finalize DECISOES.md with confirmed answers
2. **RH-002** - Finanças gateway spike (critical blocker understanding)
3. **Add RBAC + module wiring** - edit permissions (main+renderer), modules.ts, App.tsx (but note plan mode - do after approval)
4. **RH-003** - Create empty RH page + navigation
5. **Prisma schema** - add RH models (start with core: departamentos/cargos/funcionario/contrato/rubricas/parametros/processamento)
6. **RH-006** - Base IPC contracts/types

But per user request: "Do NOT edit files yet (plan mode)". So this plan is the deliverable. After user review/approval, proceed to implement Phase 0.

---

## 10. Next Steps

- Get answers to critical questions above
- Review and approve this plan
- Start Phase 0 implementation (file edits/creations) following existing patterns
- Create DECISOES.md with final decisions

