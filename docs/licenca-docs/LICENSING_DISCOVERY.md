# LICENSING_DISCOVERY.md — Auditoria do ERP para Licenciamento (Fase 0)

**Data:** 2026-11-24
**Estado:** Fase 0 concluída. Nenhum ficheiro de código, schema, migration ou configuração foi alterado.
**Documentos guia:** `specs.md`, `plan-licenca.md` (esta pasta).
**Regra aplicada:** a estrutura real do repositório ganha sobre a estrutura proposta nos documentos; divergências registadas abaixo.

---

## 1. Arquitetura real encontrada

### 1.1 Stack (confirmada em `package.json`)

| Camada | Versão instalada |
|---|---|
| Electron | `^39.2.6` (entry `./out/main/index.js`) |
| React / React DOM | `^19.2.1` |
| TypeScript | `^5.9.3` |
| Tailwind CSS | `^4.3.3` (`@tailwindcss/vite ^4.3.3`) |
| Zod | `^3.23.8` |
| Zustand | `^5.0.15` |
| Prisma / @prisma/client / adapter-pg | `^7.9.1` |
| PostgreSQL local | `postgres:16-alpine` (`doraerp_postgres`, docker-compose) |
| Radix UI + shadcn/ui | presente (`src/renderer/src/components/ui/`), `lucide-react`, `sonner` |
| Vitest / Playwright | `^4.1.11` / `^1.63.0` |

Nota: o `SPECS.md` alertava para não assumir Prisma 7+ — confirmado que é **Prisma 7.9.1**, com `generator client { provider = "prisma-client-js" }` e datasource **sem `url` no schema** (URL vem de `prisma.config.ts` → `DATABASE_URL`).

### 1.2 Electron Main / Preload

- Entry real: `src/main/index.ts`; bundles em `out/` são gerados por electron-vite.
- `src/main/index.ts:35-75` cria o `BrowserWindow` com `webPreferences: { preload, sandbox: false }`.
  `contextIsolation` e `nodeIntegration` **não são declarados** → defaults do Electron 39 (`true` / `false`).
- CSP em `src/renderer/index.html:7-10` (`default-src 'self'`, `script-src 'self'`).
- `setWindowOpenHandler` (`src/main/index.ts:57-66`) só abre `http(s)` no browser externo.
- Registo dos 26 routers em `src/main/index.ts:101-127` — ponto onde `registerLicensingRouter()` deve entrar.
- `testDatabaseConnection()` corre de forma **não bloqueante** em `src/main/index.ts:92-99`; a revalidação da licença deve seguir o mesmo padrão.
- `src/preload/index.ts:607-622` expõe `window.api` via `contextBridge` (e `window.electron` do toolkit, que contém `ipcRenderer` genérico). A API de negócio é nomeada por domínio; não se expõe `ipcRenderer` cru em `window.api`.
- Tipagem efetiva do renderer: `src/renderer/src/@types/electron.d.ts` (~5000 linhas). `src/preload/index.d.ts` está parcial.
- Wrappers tipados com fallback `UNAVAILABLE` em `src/renderer/src/api/*.api.ts` (29 ficheiros) — padrão a seguir.

### 1.3 IPC, validação, erros

- Convenção de canais: `modulo:acao` ou `modulo:entidade:acao` (`.agents/workflows/03-ipc-patterns.md:31-40`).
- **Envelope exato** (`src/main/utils/ipc-response.ts:6-20,61-81`):
  - sucesso: `{ success: true, data: T }`
  - erro: `{ success: false, error: { code, message, details? } }`
- Erros tipados em `src/main/utils/errors.ts:6-61`: `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`.
- Validação Zod acontece em service (`compras.service.ts`), controller (`fiscal.controller.ts`) ou wrapper dedicado (`src/main/utils/rh-handler.ts:89-125`). Para licensing, o wrapper dedicado é o melhor encaixe.
- Routers finos: `ipcMain.handle(canal, (_, payload) => controller.metodo(payload))`.
- A sessão **não vem do pedido IPC**: `auth.getCurrentSession()` no Main (comentário em `fiscal.controller.ts:443-447`).

### 1.4 RBAC e auditoria

- `src/main/middlewares/rbac.middleware.ts:57-134`: `hasPermission`, `hasAnyPermission`, `requirePermission`, `requireAnyPermission`.
- Catálogo único Main: `src/main/constants/permissions.constants.ts:11-28` (`MODULOS_RBAC`, `ACOES_RBAC`), espelhado no renderer em `src/config/permissions.ts`.
- Perfil `Administrador` tem `{"*": true}` (seed `prisma/seed.ts:50-52`). Outros perfis: Operador, Financeiro, Vendedor.
- Sessão em memória (`src/main/services/auth.service.ts:14-23`), sem persistência/token.
- Auditoria: `src/main/services/audit.service.ts` — append-only, SHA-256 canónico em `integridade`, sanitização de PII, `registar()` nunca lança. Persistida em `AuditLog` (`schema.prisma:1876-1910`, tabela `audit_logs`, `modulo` default `fiscal`).
- Ações de auditoria existentes (`TipoAcaoAuditoria`): `criar`, `actualizar`, `eliminar`, `exportar`, `validar`, `imprimir`, `login`, `logout`, `anular`, `submeter`, `estornar`, `fechar`, `reabrir`, `pagar`, `apurar`, `conciliar`, `desconciliar`. **Não há** ação específica para licenciamento.

### 1.5 Ficheiros locais / identidade

- `src/main/services/config.service.ts:26-31`: `.env` técnico em `process.cwd()` (dev) ou `app.getPath('userData')` (prod, `%APPDATA%\soctechno-desktop`).
- `src/main/controllers/fiscal.controller.ts:412-420`: exportações em `userData/fiscal`.
- Diálogo nativo de ficheiro já usado em `src/main/routers/rh.router.ts:1160-1182` (`dialog.showOpenDialog` + `readFile` no Main) — padrão para importação de licença.
- **Não existe** `installationId`, `deviceId`, `machineId` nem leitura de MAC. `EmpresaConfig.identificador` (`schema.prisma:67`, `@unique`) é o único ID estável, mas é por empresa.
- **Não existe** código de licenciamento em `src/`; apenas os docs em `docs/licenca-docs/`.
- Cripto atual é só digest (SHA-1/SHA-256) + bcrypt. **Não há** assinatura assimétrica (`crypto.sign/verify`, Ed25519).

---

## 2. Catálogo real de módulos

Fonte única de verdade hoje = `src/main/constants/permissions.constants.ts:11-21` e espelho `src/renderer/src/config/modules.ts:26-36`. **Não existe tabela/enum de módulos no banco.**

| Chave real | Label PT | Rota | Observação para licenciamento |
|---|---|---|---|
| `vendas` | Vendas | `/vendas` | módulo comercial |
| `compras` | Compras | `/compras` | módulo comercial |
| `estoque` | Stock | `/estoque` | chave é `estoque`, label é `Stock` |
| `comercial` | Comercial | `/comercial` | módulo comercial |
| `financas` | Finanças | `/financas` | módulo comercial |
| `fiscal` | Fiscal | `/fiscal` | módulo comercial (compliance) |
| `rh` | Recursos Humanos | `/rh` | módulo comercial |
| `relatorios` | Relatórios | `/relatorios` | módulo comercial/transversal |
| `configuracoes` | Configurações | `/configuracoes` | `nav: false`; acesso via engrenagem/perfil; **essencial — nunca bloquear** |
| `inicio` | Início | `/inicio` | dashboard, não está em `MODULES`; link hardcoded no shell; **essencial — nunca bloquear** |

Submódulos/abas internas **não** são módulos RBAC: Vendas (cliente, artigo, encomenda, fatura, proforma, guia, recibo), Stock (9 abas), Finanças (16 abas, incl. contabilidade/tesouraria), RH (21 abas), Fiscal (3), Configurações (6).

Conceito pré-existente: **"Módulos Pagos"** em `EmpresaConfig.modulosJson` (`schema.prisma:78`), editado em `EmpresaModal.tsx:346-386` a partir de `MODULES` e mostrado em `configuracoes.tsx:261,267-274,333-353`. É uma seleção de UI **não assinada** — não pode ser fonte de verdade de direitos; no máximo pode ser derivada da licença.

---

## 3. Modelos Prisma: reutilização e proposta

### 3.1 Reutilizáveis

| Modelo / campo | Uso possível | Ressalva |
|---|---|---|
| `AuditLog` (`schema.prisma:1876-1910`) | eventos de licenciamento com integridade já implementada | `modulo` pode ser `'configuracoes'`; ações não dedicadas; não apagar histórico |
| `EmpresaConfig.identificador` (`:67`) | candidato a ID de instalação | é por empresa, não global à instalação |
| `EmpresaConfig.modulosJson` (`:78`) | reflexo dos módulos ativos | não assinado → nunca usar como autoridade |
| `PerfilAcesso.permissoesJson` (`:220`) | RBAC | distinto de entitlement; manter separado |
| `ExercicioFiscal.modulosJson` (`:136`), `SerieDocumento.modulosJson` (`:199`) | seleção de UI | idem |

Não reutilizar `RhParametroFiscal` / `RhConfiguracao` / `MapeamentoConta` / `Sequencia` (domínios diferentes, embora seus padrões de chave única/contador sejam úteis).

### 3.2 Convenções do schema

- 92 models, 79 enums, todos com `String @id @default(cuid())`.
- `createdAt DateTime @default(now()) @map("created_at")`, `updatedAt @updatedAt @map("updated_at")`.
- Sem `deletedAt`; usam-se flags `ativo`/`activa` e datas de anulação. `AuditLog.arquivado` é o único soft-delete explícito.
- `@@map("snake_case_plural")` em todos; `@@unique([empresaId, ...])` para escopo multi-empresa.
- Timestamps de auditoria usam `@db.Timestamptz`.
- 28 migrations, convenção `YYYYMMDDHHMMSS_nome_snake_case`; última `20261112130000_contabilidade_demonstracoes`.

### 3.3 Modelos novos propostos (a validar)

Inserir na secção de configurações, após `EmpresaConfig` (`schema.prisma:130`), sem reestruturar o schema:

- `License` — global (sem `empresaId`): `id`, `licenseId @unique`, `productId`, `customerName`, `customerTaxNumber?`, `status`, `issuedAt`, `notBefore`, `expiresAt?`, `installedAt`, `lastValidatedAt`, `payload`, `signature`, `keyId`, `installationId?`, `createdAt`, `updatedAt`, `@@map("licenses")`.
- `LicensedModule` — `licenseId` FK `onDelete: Cascade`, `moduleKey String` (catálogo vive em código), `enabled Boolean`, `@@unique([licenseId, moduleKey])`, `@@map("licensed_modules")`.
- `Installation` (ou campo equivalente) — `installationId` global persistido uma única vez, para `bindingMode = installation`.
- `LicenseEvent` — **decisão em aberto**: criar modelo dedicado (append-only, `dataHora @db.Timestamptz`, `integridade?`) **ou** reutilizar `AuditLog`. Recomendação: reutilizar `AuditLog` com `modulo: 'configuracoes'` e uma nova ação `validar`/`criar`, evitando duplicar infraestrutura de auditoria — a menos que se exija `eventType` rico e consulta isolada.
- Migration aditiva: `prisma/migrations/<timestamp>_licensing_fundacoes/migration.sql`, gerada por `npm run db:migrate -- --name licensing_fundacoes`.

---

## 4. Pontos exatos de integração

### Main
1. `src/main/index.ts:101-127` — registar `registerLicensingRouter()`.
2. `src/main/index.ts:90-99` — revalidação não bloqueante da licença persistida no arranque.
3. Novos `src/main/{validators,services,controllers,routers,utils}/licensing.*` seguindo o padrão fiscal/RH (validator → service → controller → router).
4. `src/main/utils/rh-handler.ts:89-125` — inspiração para wrapper `licensingHandler` (sessão → permissão → Zod → `ok()`).
5. `src/main/routers/rh.router.ts:1160-1182` — padrão de `dialog.showOpenDialog` no Main para `licensing:selectAndImport`.
6. `src/main/controllers/fiscal.controller.ts:430-440,443-447` — padrão de auditoria e de sessão que não vem do renderer.
7. `src/main/services/audit.service.ts` — registo de eventos sem segredos.

### Preload / contratos
8. `src/preload/index.ts` (antes do fecho do objeto em `:605`) — expor `window.api.licensing.*`.
9. `src/preload/index.d.ts` e `src/renderer/src/@types/electron.d.ts` — declarar tipos/DTOs.
10. Canais sugeridos (adaptados à convenção camelCase do projeto): `licensing:getStatus`, `licensing:getModules`, `licensing:checkModule`, `licensing:selectAndImport`, `licensing:remove`, `licensing:getEvents`.
11. `src/renderer/src/api/licensing.api.ts` — wrapper com fallback `UNAVAILABLE`, seguindo os 29 wrappers existentes.

### Renderer
12. `src/renderer/src/pages/configuracoes.tsx:30` — acrescentar `"licenciamento"` ao tipo `Tab`.
13. `src/renderer/src/pages/configuracoes.tsx:147-173` — ação no ribbon, grupo "Utilizadores & Segurança", com `tabKey: "licenciamento"` (o `ErpShell.tsx:306-315` gera automaticamente `data-testid="ribbon-tab-licenciamento"`).
14. `src/renderer/src/pages/configuracoes.tsx:410-419` — `label(t)` → "Licenciamento"; breadcrumb em `:122` mantém `["Configurações", label(tab)]`.
15. `src/renderer/src/pages/configuracoes.tsx:393-405` — renderizar `<LicenciamentoManager />`.
16. Novo `src/renderer/src/components/erp/LicenciamentoManager.tsx` (ou `erp/licenciamento/`), usando `ErpShell`, `WorkspaceFrame`, `Panel`, `KpiCard`, `StatusBadge`, `DataTable`, `Dialog`/`AlertDialog`, `Skeleton`, `toast`.
17. **Não** adicionar `licenciamento` a `MODULES` sem decisão explícita: isso alteraria menu, requisito RBAC de rota e a grelha "Módulos Pagos" de `EmpresaModal.tsx:346-386`.

### Catálogo e guardas
18. `src/main/constants/permissions.constants.ts:11-21` + `src/renderer/src/config/modules.ts:26-36` — catálogo central de módulos licenciáveis (recomenda-se extrair um módulo partilhado para evitar a duplicação Main/Renderer já existente).
19. `src/renderer/src/components/ProtectedRoute.tsx:43-46` e `src/renderer/src/components/erp/ErpShell.tsx:184` — guardas de navegação.
20. Controllers/services dos módulos comerciais (`compras`, `vendas`, `estoque`, `fiscal`, `rh`, `financas`, `comercial`, `relatorios`) — verificação `checkModuleAccess` no Main, além da UI.

### Documentação / testes
21. `docs/manual/01-configuracoes.md:8-12` — passa de 6 para 7 abas.
22. `tests/e2e/app.e2e.mts:233-254` — cobrir a nova aba.
23. Testes Vitest para validação Ed25519, payload adulterado, chave desconhecida, produto errado, datas, módulos, instalação; integração para importação/rollback/revalidação; UI para os estados visuais.

---

## 5. Plano de alterações proposto (por fase)

| Fase | Entregável | Ficheiros principais |
|---|---|---|
| 1 — Domínio/catálogo | Tipos partilhados, catálogo real de 9 módulos, dependências, funções essenciais isentas | `src/main/constants/licensing-modules.constants.ts`, `src/renderer/src/config/licensing-modules.ts`, `src/main/@types/*` |
| 2 — Formato/crypto | Envelope `{payload, signature}`, Zod, Ed25519 no Main, chaves públicas com `keyId` | `src/main/services/licensing/crypto.service.ts`, `.../schemas.ts`, fixtures de teste |
| 3 — Persistência | 3 modelos + migration aditiva + repository transacional | `prisma/schema.prisma`, `prisma/migrations/<ts>_licensing_fundacoes/`, `src/main/repositories/licensing.repository.ts` |
| 4 — Serviço | Importar/consultar/remover/revalidar, eventos, cache em memória | `src/main/services/licensing.service.ts`, `src/main/utils/licensing-handler.ts` |
| 5 — IPC/Preload | 6 canais tipados, Zod, permissão no Main | `src/main/routers/licensing.router.ts`, `src/main/controllers/licensing.controller.ts`, `src/preload/index.ts`, `*.d.ts`, `src/renderer/src/api/licensing.api.ts` |
| 6 — UI | Aba Licenciamento em Configurações, estados visuais, importação com pré-visualização | `src/renderer/src/pages/configuracoes.tsx`, `src/renderer/src/components/erp/LicenciamentoManager.tsx`, `docs/manual/01-configuracoes.md` |
| 7 — Aplicação de regras | Guardas em rotas, menus, serviços e handlers IPC | arquivos de guarda + controllers dos módulos |
| 8 — Testes/hardening | Unitários, integração, UI, auditoria de artefactos | `*.test.ts`, `tests/e2e/*` |
| 9 — Emissão (fornecedor) | Procedimento documentado + utilitário **não distribuído** | `docs/licenca-docs/emissao.md`, Ferramenta interna separada |

**Baseline de verificação** (do ledger SDD): `npm test` 23 ficheiros / 124 testes, `npm run typecheck` e `npm run build` OK; `npm run lint` já tem 31 erros preexistentes — não introduzir novos.

---

## 6. Divergências entre `SPECS.md` / `PLAN.md` e o repositório

| # | Especificação diz | Realidade | Impacto |
|---|---|---|---|
| 1 | "Administração de Configurações" | A área chama-se **Configurações**, rota `/configuracoes`, 6 abas, acedida por engrenagem/perfil | Integrar como 7.ª aba; não criar área "Administração" |
| 2 | Chaves ilustrativas `SALES`, `INVENTORY`... | Catálogo real é lowercase: `vendas`, `estoque`, `rh`... | Usar chaves reais; nada de módulos fictícios |
| 3 | Extensão `.erplic` **ou** `.license.json` | Nenhuma convenção existente | Decisão pendente — recomendado `.erplic` |
| 4 | `installationId` pode não existir | Não existe qualquer ID de instalação | Criar ID global persistido; decidir `none` vs `installation` |
| 5 | `LicenseEvent` modelo novo | Já existe `AuditLog` com hash de integridade | Decidir reutilizar ou criar modelo dedicado |
| 6 | Catálogo central de módulos | Catálogo duplicado Main/Renderer + `modulosJson` por empresa | Extrair fonte única; não duplicar terceira cópia |
| 7 | "Reutilizar RBAC existente" | Há divergência: `ProtectedRoute` aceita `configuracoes:["admin"]`, mas `configuracoes.tsx:42` e `ErpShell.tsx:75` só aceitam `perfilNome === 'Administrador'` ou `permissoes["*"]` | Alinhar antes de expor importação/remoção |
| 8 | "Ao iniciar, revalidar assinatura" | Arranque já faz teste de DB não bloqueante | Seguir padrão não bloqueante |
| 9 | "Módulos conhecidos sem duplicados" | `modulosJson` não validado e sem assinatura | Não usar como autoridade; tratar como derivado |
| 10 | "Sem Internet" | Já offline (nenhuma chamada remota) | Manter; nenhuma chamada de rede no licensing |
| 11 | "Limites opcionais maxUsers/maxDevices" | Não existe contagem de dispositivos/sessões | Implementar só no payload/schemas; não efetivar contagem nesta versão |

---

## 7. Decisões

### Validadas pelo utilizador (2026-11-24)

| # | Decisão | Consequência |
|---|---|---|
| D1 | **Catálogo = 9 módulos RBAC** (`vendas`, `compras`, `estoque`, `comercial`, `financas`, `fiscal`, `rh`, `relatorios`, `configuracoes`) | `inicio`, backup/exportação e consulta da licença nunca são bloqueados. `relatorios` é licenciável, mas a exportação dos próprios dados permanece disponível. |
| D2 | **`bindingMode = installation` por omissão**, com `installationId` global aleatório persistido | O formato continua a aceitar `none`; troca de computador exige reemissão administrativa. |
| D3 | **Eventos em `AuditLog`** (`modulo: 'configuracoes'`) | Não criar `LicenseEvent`; reutilizar hash de integridade e sanitização existentes. |
| D4 | **Utilitário de emissão local + chave pública constante** | Ferramenta fora de `src`/`resources`; privada em ficheiro local gitignored; pública no Main com `keyId`; nada disto no instalador. |

### Decisões restantes (recomendações a validar no desenho)

1. **Validade:** suportar simultaneamente perpétua (`expiresAt = null`) e temporária — **recomendação: suportar ambas**.
2. **Extensão do ficheiro:** **recomendação: `.erplic`**, com validação real do conteúdo (não da extensão).
3. **Dependências entre módulos:** não existem dependências formais no código — **recomendação: nenhuma dependência declarada na v1**, com campo preparado no catálogo.
4. **Relação com "Módulos Pagos":** licença passa a ser a fonte de verdade; `modulosJson` fica como visão derivada, sem escrita manual que altere direitos.
5. **Divergência RBAC de Configurações:** alinhar `configuracoes.tsx:42` / `ErpShell.tsx:75` com `hasPermission('configuracoes','admin')` antes de expor importação/remoção.

---

## 8. Próximo passo (histórico)

Aguardar validação do plano e das decisões acima. Só depois iniciar a Fase 1 (domínio/catálogo), por camadas, preservando as convenções encontradas. Nenhuma migração deve ser criada antes dessa validação.

---

## 9. Estado da implementação (2026-11-24)

As fases 0 a 9 foram executadas sobre o ERP existente:

- **Domínio/format/persistência/serviço/IPC:** catálogo partilhado de 9 módulos,
  envelope `.erplic` assinado com Ed25519 no Main, modelos `License`,
  `LicensedModule` e `Installation` com migration aditiva, repositório
  transacional e `LicensingService` com revalidação no arranque.
- **UI:** 7.ª aba **Licenciamento** em Configurações, com estados visuais,
  pré-visualização antes de importar, substituição e remoção confirmadas.
  `configuracoes.tsx` e `ErpShell.tsx` usam agora `hasPermission('configuracoes',
  'admin')`, resolvendo a divergência RBAC #7.
- **Guardas:** `handleLicenciado` aplica `requireAnyLicensedModule` a todos os
  handlers IPC dos módulos comerciais antes de chegarem ao controller. A
  navegação e as rotas filtram pelo mesmo catálogo; `inicio`, login,
  configurações, licenciamento, auditoria de configurações, backup e exportação
  não são bloqueados. O RBAC continua a ser verificado nos controllers.
- **Emissão:** `tools/emitir-licenca.ts`, excluído do instalador, e
  `docs/licenca-docs/EMISSAO-LICENCAS.md`. A chave privada fica em
  `.license-keys/`, também excluída do instalador.
- **Verificação:** `npm test` (118 ficheiros / 1229 testes), `npm run typecheck`
  e `npm run build` passam. Nenhuma chave privada aparece em `out/`, `src/` ou
  `resources/`.

Limites conhecidos: a migration ainda não foi aplicada a uma base de dados
real e os testes E2E dependem da base de dados de desenvolvimento já semeada;
o ficheiro `tests/fixtures/licenca-teste.erplic` é uma licença de desenvolvimento
sem chave privada associada no repositório.
