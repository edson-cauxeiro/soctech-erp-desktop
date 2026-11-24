# Obrigações Declarativas — Plano de Implementação (FASE 9 · bloco 9.1 · `RH-901`…`RH-907`)

> **Para quem executa:** implementa **uma tarefa de cada vez**. Cada passo tem um resultado verificável; não avanças sem o teste passar. Uma tarefa = um commit. Não há skill `subagent-driven-development`/`executing-plans` instalada neste repositório — a execução é directa, na sessão.
>
> Risque `- [x]` em `docs/rh-docs/03-tasks.md` (FASE 9, bloco 9.1) à medida que cada `RH-9xx` fica concluída, e acrescenta a linha correspondente nas *Notas de progresso* de `docs/rh-docs/DECISOES.md`.

**Goal:** Gerar, a partir dos processamentos já gravados, ficheiros de declaração de INSS e de IRT (mensais e anuais) com layout parametrizável e versionado, com histórico auditável e sem recalcular nada.

**Architecture:** Três serviços no processo principal — apuramento, geração e gestão — sobre quatro tabelas novas. A montagem do ficheiro é uma função **pura** (`aplicarLayoutDeclarativo`) que não conhece Prisma nem Electron, e a escrita em disco passa por uma **porta injectável** (`ArmazenamentoDeclarativas`) para os testes poderem correr sem sistema de ficheiros real. O formato oficial nunca está no código: vem de `RhLayoutDeclarativo.definicao`.

**Tech Stack:** Electron (`ipcMain`, `app.getPath`), Prisma/PostgreSQL, Zod, Vitest, React + shadcn/ui, Playwright, pdfkit.

**Spec:** `docs/rh-docs/06-plano-pos-mvp.md` §4 (Área A), §7 (RBAC) e §10 (impacto). Tarefas em `docs/rh-docs/03-tasks.md` (FASE 9, bloco 9.1).

## Global Constraints

- **Nomenclatura Prisma:** modelos e enums com prefixo `Rh`; `id String @id @default(cuid())`; `empresaId String @map("empresa_id")`; colunas em `snake_case` via `@map`; tabelas em `@@map("rh_<plural>")`; `createdAt`/`updatedAt` em tudo.
- **Dinheiro:** `Decimal @db.Decimal(18, 4)` (ADR-006). Nunca `Float` nem `number` em valores monetários fora da formatação final do ficheiro.
- **Isolamento por empresa:** toda a leitura filtra por `empresaId` (ADR-009). Sem `empresaId` de sessão → `RhBusinessRuleError('Empresa não identificada na sessão.')`.
- **Permissões:** o submódulo novo é `declarativas` com as acções `ver`, `gerir`, `emitir`. **Não** alargar `RH_ACOES_RBAC`. Os dois catálogos têm de ficar iguais: `src/main/constants/rh-permissions.constants.ts` e `src/renderer/src/config/rh-permissions.ts`.
- **Auditoria:** toda a escrita chama `audit.registarOperacao({ empresaId, utilizadorId, acao, entidade, entidadeId, modulo: 'rh', descricao, severidade, dadosNovos })`. Auditoria nunca lança — não envolver em `try` no chamador.
- **Ano/período:** `periodo` é `Int` e `0` significa **declaração anual**; `1`…`12` são as mensais. Isto é o que torna `@@unique([obrigacaoId, ano, periodo])` aplicável a ambos os casos (em Postgres vários `NULL` não colidem).
- **Portas externas, não suposições:** os valores legais de INSS/IRT e os prazos de entrega **não** são inventados. Os prazos ficam `null` até o RH os confirmar. A geração exige layout vigente mas **não** exige validação jurídica: sem ela o ficheiro sai com a marca «NÃO VALIDADA JURIDICAMENTE» no topo e a declaração **não pode ser submetida**. `submeter` exige validação registada e uma declaração gerada *depois* dessa validação.
- **Formato oficial:** nenhum layout INSS/AGT é codificado. Toda a estrutura do ficheiro vem de `RhLayoutDeclarativo.definicao`.
- **Motor puro:** `src/main/services/rh/declarativas/*.ts` não importa `@prisma/client` como valor, nem `electron`, nem React.
- **Idioma:** PT-AO na UI e nas mensagens; moeda `AOA`.
- **Comandos:** `npx vitest run <ficheiro>` · `npm run typecheck:node` · `npm run typecheck:web` · `npm run build` · `npm run db:migrate -- --name <nome>` · `npx playwright test <spec>`.
- **Sem `git push`.**

## Review Focus

As cinco coisas que a spec implica mas nenhum teste do caminho feliz cobre. Cada linha tem o teste que a fixa, na tarefa indicada.

1. **Período sem processamentos válidos** → `apurar` devolve `linhas: []` e `gerar` recusa com `RH_VALIDACAO`. Nunca se escreve um ficheiro vazio. *(Tarefa 2 e 3)*
2. **Processamento anulado depois da geração** → o snapshot (`RhDeclaracaoLinha`) não muda, e um novo apuramento desse período acusa divergência de totais em vez de passar despercebido. *(Tarefa 2)*
3. **Funcionário sem NISS/NIF** → aparece em `pendentes` e `gerar` recusa com `RH_DADOS_FISCAIS_EM_FALTA`; nunca sai uma linha com o campo em branco. *(Tarefa 2 e 7)*
4. **Parâmetros legais ainda não validados juridicamente** → a geração continua a funcionar, mas o ficheiro sai marcado no topo e `submeter` recusa, exigindo uma declaração gerada depois da validação. Sem layout vigente, `gerar` recusa e nomeia o que falta. *(Tarefa 1 e 3)*
5. **Delimitador, aspas ou nova linha dentro de um campo (CSV) e caracteres fora de `latin1`** → escaping e conversão de codificação correctos, sem corromper o ficheiro. *(Tarefa 3)*

---

## File Structure

**Criar**

| Ficheiro | Responsabilidade |
|---|---|
| `prisma/migrations/<ts>_rh_901_declarativas/migration.sql` | Migração gerada (não escrita à mão) |
| `src/main/services/rh/declarativas/tipos.ts` | Tipos e constantes do domínio (puro) |
| `src/main/services/rh/declarativas/apuracao.ts` | Agregação dos processamentos em linhas e totais (puro) |
| `src/main/services/rh/declarativas/ficheiro.ts` | `aplicarLayoutDeclarativo`, `hashConteudo` (puro) |
| `src/main/utils/rh-armazenamento-declarativas.ts` | Porta de escrita em disco + implementação Electron |
| `src/main/services/rh-declarativas.service.ts` | CRUD de obrigações/layouts, validação jurídica, consulta e transições de estado |
| `src/main/services/rh-declarativas-apuracao.service.ts` | Lê da BD e delega no puro; deteção de divergência |
| `src/main/services/rh-declarativas-geracao.service.ts` | Portões de negócio, monta o ficheiro, grava, audita |
| `src/main/services/rh-declarativas-pdf.service.ts` | Mapa de remunerações em PDF (pdfkit) |
| `src/renderer/src/components/erp/rh/RhDeclarativasManager.tsx` | Ecrã do separador |
| `src/test/rh/declarativas/apuracao.test.ts` | Testes do puro de apuramento |
| `src/test/rh/declarativas/ficheiro.test.ts` | Testes do puro de layout |
| `src/main/services/rh-declarativas.service.test.ts` | Testes do serviço de gestão |
| `src/main/services/rh-declarativas-apuracao.service.test.ts` | Testes do serviço de apuramento |
| `src/main/services/rh-declarativas-geracao.service.test.ts` | Testes dos portões e da escrita |
| `tests/e2e/rh-declarativas.e2e.ts` | Fluxo ponta-a-ponta |

**Modificar**

| Ficheiro | Alteração |
|---|---|
| `prisma/schema.prisma` | 3 enums + 4 modelos (a seguir a `RhParametroFiscal`, ~linha 2103) |
| `src/main/constants/rh-permissions.constants.ts` | `declarativas` em `RH_SUBMODULOS` |
| `src/renderer/src/config/rh-permissions.ts` | O mesmo, no espelho |
| `src/main/validators/rh.validator.ts` | Schemas de declarativas |
| `src/main/routers/rh.router.ts` | Canais `rh:declarativas:*` |
| `src/main/services/rh-referencia.service.ts` | `OBRIGACOES_REFERENCIA` + `semearObrigacoesDeclarativas` |
| `prisma/seed.ts` | §7.8 a chamar o que acima |
| `src/preload/index.ts` | Ponte `rh.declarativas` |
| `src/renderer/src/@types/electron.d.ts` | DTOs |
| `src/renderer/src/api/rh.api.ts` | Domínio `declarativas` |
| `src/renderer/src/pages/rh.tsx` | Ligar a aba `declarativas` ao componente |
| `docs/rh-docs/04-modelo-de-dados.md` | Modelos desta área |
| `docs/manual/07-rh.md` | Capítulo do utilizador |
| `docs/rh-docs/03-tasks.md` · `docs/rh-docs/DECISOES.md` | Tarefas e notas |

---

## Task 1 — `RH-901`: modelo de dados, migração, permissões e gestão de obrigações

**Files:**
- Modify: `prisma/schema.prisma` (a seguir a `RhParametroFiscal`)
- Create: `prisma/migrations/<ts>_rh_901_declarativas/migration.sql` (gerado por `npm run db:migrate -- --name rh_901_declarativas`)
- Modify: `src/main/constants/rh-permissions.constants.ts`, `src/renderer/src/config/rh-permissions.ts`
- Modify: `src/main/validators/rh.validator.ts`
- Create: `src/main/services/rh-declarativas.service.ts`, `src/main/services/rh-declarativas.service.test.ts`
- Modify: `src/main/routers/rh.router.ts`

**Interfaces:**
- Consumes: `rhHandler`, `RhBusinessRuleError`/`RhNotFoundError`/`RhConflictError`, `AuditService.registarOperacao`, `rhIdInputSchema`/`rhPaginacaoSchema`/`rhDataOpcionalSchema`.
- Produces: enums `RhTipoDeclaracao`, `RhPeriodicidadeDeclaracao`, `RhEstadoDeclaracao`; modelos `RhObrigacaoDeclarativa`, `RhLayoutDeclarativo`, `RhDeclaracao`, `RhDeclaracaoLinha`; permissões `rh.declarativas.{ver,gerir,emitir}`; schemas `rhObrigacaoCriarSchema`, `rhObrigacaoAtualizarSchema`, `rhLayoutCriarSchema`, `rhObrigacoesListarInputSchema`, `rhDeclaracoesListarInputSchema`, `rhDeclaracaoValidarJuridicamenteSchema`, `rhDeclaracaoSubmeterSchema`, `rhDeclaracaoAnularSchema`; classe `RhDeclarativasService` com `listarObrigacoes`, `criarObrigacao`, `atualizarObrigacao`, `criarLayout`, `listarLayouts`, `listarDeclaracoes`, `obterDeclaracao`, `validarJuridicamente`, `submeterDeclaracao`, `marcarDeclaracaoPaga`, `anularDeclaracao`, `semearReferencia`; DTOs `ObrigacaoDeclarativaDto`, `LayoutDeclarativoDto`, `DeclaracaoResumoDto`, `DeclaracaoDetalheDto`.

**Modelos** (colar em `prisma/schema.prisma`):

```prisma
enum RhTipoDeclaracao {
  INSS_REMUNERACOES
  INSS_GUIA
  IRT_MENSAL
  INSS_ANUAL
  IRT_ANUAL
}

enum RhPeriodicidadeDeclaracao {
  MENSAL
  ANUAL
}

enum RhEstadoDeclaracao {
  RASCUNHO
  GERADA
  SUBMETIDA
  PAGA
  REJEITADA
  ANULADA
}

/// Obrigação declarativa configurável (INSS/AGT). Os prazos são preenchidos
/// pelo RH depois de confirmar o calendário legal — não são assumidos.
model RhObrigacaoDeclarativa {
  id                          String   @id @default(cuid())
  empresaId                   String   @map("empresa_id")
  codigo                      String
  designacao                  String
  tipo                        RhTipoDeclaracao
  periodicidade               RhPeriodicidadeDeclaracao
  diaLimite                   Int?     @map("dia_limite")
  mesLimite                   Int?     @map("mes_limite")
  validadaJuridicamenteEm     DateTime? @map("validada_juridicamente_em")
  validadaJuridicamentePorId  String?  @map("validada_juridicamente_por_id")
  referenciaValidacao         String?  @map("referencia_validacao")
  ativo                       Boolean  @default(true)
  createdAt                   DateTime @default(now()) @map("created_at")
  updatedAt                   DateTime @updatedAt @map("updated_at")

  layouts     RhLayoutDeclarativo[]
  declaracoes RhDeclaracao[]

  @@unique([empresaId, codigo])
  @@index([empresaId, ativo])
  @@map("rh_obrigacoes_declarativas")
}

model RhLayoutDeclarativo {
  id           String    @id @default(cuid())
  empresaId    String    @map("empresa_id")
  obrigacaoId  String    @map("obrigacao_id")
  versao       String
  formato      String
  definicao    Json
  vigenteDesde DateTime  @map("vigente_desde") @db.Date
  vigenteAte   DateTime? @map("vigente_ate") @db.Date
  createdAt    DateTime  @default(now()) @map("created_at")

  obrigacao   RhObrigacaoDeclarativa @relation(fields: [obrigacaoId], references: [id], onDelete: Cascade)
  declaracoes RhDeclaracao[]

  @@unique([obrigacaoId, versao])
  @@index([empresaId, obrigacaoId, vigenteDesde])
  @@map("rh_layouts_declarativos")
}

/// `periodo = 0` representa a declaração anual; `1`…`12` as mensais.
model RhDeclaracao {
  id                String   @id @default(cuid())
  empresaId         String   @map("empresa_id")
  obrigacaoId       String   @map("obrigacao_id")
  layoutId          String?  @map("layout_id")
  ano               Int
  periodo           Int
  estado            RhEstadoDeclaracao @default(RASCUNHO)
  totalBase         Decimal  @map("total_base") @db.Decimal(18, 4) @default(0)
  totalDescontos    Decimal  @map("total_descontos") @db.Decimal(18, 4) @default(0)
  totalEncargos     Decimal  @map("total_encargos") @db.Decimal(18, 4) @default(0)
  totalLinhas       Int      @map("total_linhas") @default(0)
  versaoLayout      String?  @map("versao_layout")
  ficheiroCaminho   String?  @map("ficheiro_caminho")
  ficheiroHash      String?  @map("ficheiro_hash")
  geradaEm          DateTime? @map("gerada_em")
  geradaPorId       String?  @map("gerada_por_id")
  submetidaEm       DateTime? @map("submetida_em")
  referenciaExterna String?  @map("referencia_externa")
  pagaEm            DateTime? @map("paga_em")
  anuladaEm         DateTime? @map("anulada_em")
  motivoAnulacao    String?  @map("motivo_anulacao")
  observacoes       String?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  obrigacao RhObrigacaoDeclarativa @relation(fields: [obrigacaoId], references: [id])
  layout    RhLayoutDeclarativo?   @relation(fields: [layoutId], references: [id])
  linhas    RhDeclaracaoLinha[]

  @@unique([obrigacaoId, ano, periodo])
  @@index([empresaId, ano, periodo])
  @@index([empresaId, estado])
  @@map("rh_declaracoes")
}

/// Snapshot imutável: código e nome ficam copiados para o histórico não
/// depender de alterações posteriores à ficha do funcionário.
model RhDeclaracaoLinha {
  id                String  @id @default(cuid())
  declaracaoId      String  @map("declaracao_id")
  funcionarioId     String  @map("funcionario_id")
  codigoFuncionario String  @map("codigo_funcionario")
  nome              String
  niss              String?
  nif               String?
  baseINSS          Decimal @map("base_inss") @db.Decimal(18, 4) @default(0)
  inssTrabalhador   Decimal @map("inss_trabalhador") @db.Decimal(18, 4) @default(0)
  inssPatronal      Decimal @map("inss_patronal") @db.Decimal(18, 4) @default(0)
  baseIRT           Decimal @map("base_irt") @db.Decimal(18, 4) @default(0)
  irt               Decimal @db.Decimal(18, 4) @default(0)
  escalaoIRT        String? @map("escalao_irt")

  declaracao RhDeclaracao @relation(fields: [declaracaoId], references: [id], onDelete: Cascade)

  @@index([declaracaoId])
  @@map("rh_declaracao_linhas")
}
```

- [ ] **Step 1: Escrever os testes que falham**

Em `src/main/services/rh-declarativas.service.test.ts`, com o padrão `criarMock()` do repositório (`rhFuncionario.service.test.ts` é a referência):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { RhDeclarativasService } from './rh-declarativas.service';
import type { AuditService } from './audit.service';
import { RhNotFoundError, RhConflictError } from '../utils/rh-errors';

function criarMock() {
  // rhObrigacaoDeclarativa: findFirst/findMany/create/update/count
  // rhLayoutDeclarativo: findMany/create/deleteMany
  // rhDeclaracao: count/findMany/findFirst
  // $transaction: chamar a função com o próprio mock
}

describe('RhDeclarativasService (RH-901)', () => {
  it('cria a obrigação com os prazos nulos quando não são indicados', async () => {});
  it('recusa códigos de obrigação duplicados na mesma empresa', async () => {});
  it('lista obrigações sempre filtradas pela empresa da sessão', async () => {});
  it('registar validação jurídica grava data, autor e referência, e audita', async () => {});
  it('recusa validar juridicamente uma obrigação de outra empresa', async () => {});
  it('não deixa alterar o tipo de uma obrigação que já tem declarações geradas', async () => {});
  it('recusa submeter sem validação jurídica registada na obrigação', async () => {});
  it('recusa submeter declaração gerada antes da validação jurídica, pedindo regeração', async () => {});
  it('recusa submeter declaração anulada e declaração já submetida', async () => {});
  it('submeter guarda a referência externa e passa o estado a SUBMETIDA', async () => {});
  it('anular exige motivo com pelo menos 3 caracteres e não permite anular uma declaração PAGA', async () => {});
  it('marcar como paga só é permitido a partir de SUBMETIDA', async () => {});
});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npx vitest run src/main/services/rh-declarativas.service.test.ts`
Expected: FAIL — `Cannot find module './rh-declarativas.service'`.

- [ ] **Step 3: Acrescentar os modelos e correr a migração**

Acrescentar os 3 enums e 4 modelos acima, e depois:

Run: `npm run db:migrate -- --name rh_901_declarativas`
Expected: migração criada em `prisma/migrations/<ts>_rh_901_declarativas/` e aplicada; `prisma generate` sem erros.

- [ ] **Step 4: Declarar as permissões nos dois catálogos**

`src/main/constants/rh-permissions.constants.ts`:

```ts
  declarativas: { label: 'Obrigações Declarativas', acoes: ['ver', 'gerir', 'emitir'] },
```

`src/renderer/src/config/rh-permissions.ts`: exactamente a mesma linha, no mesmo formato do espelho. `rbacDaPermissao` já mapeia `ver`→`read`, `emitir`/`gerir`→`write` — não mexer.

- [ ] **Step 5: Acrescentar os schemas Zod**

Em `src/main/validators/rh.validator.ts` (reutiliza `rhPaginacaoSchema`, `rhIdInputSchema`, `rhDataOpcionalSchema`):

```ts
export const rhTipoDeclaracaoSchema = z.enum([
  'INSS_REMUNERACOES', 'INSS_GUIA', 'IRT_MENSAL', 'INSS_ANUAL', 'IRT_ANUAL',
]);
export const rhPeriodicidadeDeclaracaoSchema = z.enum(['MENSAL', 'ANUAL']);
export const rhPeriodoDeclaracaoSchema = z.coerce.number().int().min(0).max(12);

export const rhObrigacaoCriarSchema = z.object({
  codigo: z.string().trim().min(1).max(40),
  designacao: z.string().trim().min(1).max(160),
  tipo: rhTipoDeclaracaoSchema,
  periodicidade: rhPeriodicidadeDeclaracaoSchema,
  diaLimite: z.coerce.number().int().min(1).max(31).nullish(),
  mesLimite: z.coerce.number().int().min(1).max(12).nullish(),
});
export const rhObrigacaoAtualizarSchema = rhObrigacaoCriarSchema.partial();
export const rhLayoutCriarSchema = z.object({
  obrigacaoId: rhIdSchema,
  versao: z.string().trim().min(1).max(20),
  def: z.record(z.unknown()),           // a validação profunda entra com `validarDefinicaoLayout` (Tarefa 3)
  vigenteDesde: rhDataSchema,
  vigenteAte: rhDataOpcionalSchema,
});
export const rhObrigacoesListarInputSchema = rhPaginacaoSchema.extend({ ativo: z.coerce.boolean().optional() });
export const rhDeclaracoesListarInputSchema = rhPaginacaoSchema.extend({
  obrigacaoId: z.string().trim().min(1).optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  periodo: rhPeriodoDeclaracaoSchema.optional(),
  estado: z.enum(['RASCUNHO', 'GERADA', 'SUBMETIDA', 'PAGA', 'REJEITADA', 'ANULADA']).optional(),
});
export const rhDeclaracaoValidarJuridicamenteSchema = z.object({
  id: rhIdSchema,
  referenciaValidacao: z.string().trim().min(3).max(200),
});
export const rhDeclaracaoSubmeterSchema = z.object({
  id: rhIdSchema,
  referenciaExterna: z.string().trim().min(1).max(120),
});
export const rhDeclaracaoAnularSchema = z.object({
  id: rhIdSchema,
  motivo: z.string().trim().min(3).max(300),
});
```

Nota: `rhLayoutCriarSchema.def` chama-se `def` e não `definicao` para não colidir com o campo Prisma `definicao` na hora de espalhar o objecto; o serviço grava `definicao: input.def`.

- [ ] **Step 6: Implementar `RhDeclarativasService`**

```ts
export class RhDeclarativasService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService
  ) {}

  async listarObrigacoes(input: { empresaId: string | null; ativo?: boolean; skip?: number; take?: number }): Promise<{ total: number; items: ObrigacaoDeclarativaDto[] }>;
  async criarObrigacao(input: ObrigacaoCriarInput & { empresaId: string | null }): Promise<ObrigacaoDeclarativaDto>;
  async atualizarObrigacao(input: { empresaId: string | null; id: string } & ObrigacaoAtualizarInput): Promise<ObrigacaoDeclarativaDto>;
  async listarLayouts(input: { empresaId: string | null; obrigacaoId: string }): Promise<LayoutDeclarativoDto[]>;
  async criarLayout(input: LayoutCriarInput & { empresaId: string | null }): Promise<LayoutDeclarativoDto>;
  async validarJuridicamente(input: { empresaId: string | null; utilizadorId: string; id: string; referenciaValidacao: string }): Promise<ObrigacaoDeclarativaDto>;
  async listarDeclaracoes(input: DeclaracoesListarInput & { empresaId: string | null }): Promise<{ total: number; items: DeclaracaoResumoDto[] }>;
  async obterDeclaracao(input: { empresaId: string | null; id: string }): Promise<DeclaracaoDetalheDto>;
}
export const rhDeclarativasService = new RhDeclarativasService();
```

Regras: `criarObrigacao` recusa `codigo` repetido (`RhConflictError`, 409) — apoiado no `@@unique`; `validarJuridicamente` recusa se a obrigação não for da empresa (`RhNotFoundError`) e grava `validadaJuridicamenteEm`/`PorId`/`referenciaValidacao`, auditando com `acao: 'validar'`, `entidade: 'RhObrigacaoDeclarativa'`, `severidade: 'critico'`. `atualizarObrigacao` recusa mudar `tipo` ou `periodicidade` se existir declaração com `estado != 'RASCUNHO'`.

Transições de estado (todas carregam a obrigação e recusam outra empresa com `RhNotFoundError`):

| Método | De | Para | Portões |
|---|---|---|---|
| `submeterDeclaracao` | `GERADA` | `SUBMETIDA` | `obrigacao.validadaJuridicamenteEm` não nulo; `declaracao.geradaEm >= obrigacao.validadaJuridicamenteEm` |
| `marcarDeclaracaoPaga` | `SUBMETIDA` | `PAGA` | — |
| `anularDeclaracao` | `RASCUNHO`/`GERADA`/`SUBMETIDA` | `ANULADA` | motivo ≥ 3 caracteres; recusa a partir de `PAGA` |

`submeterDeclaracao` audita com `acao: 'submeter'` e `severidade: 'critico'`; a recusa por desfasagem usa exactamente a mensagem «A declaração foi gerada antes da validação jurídica da obrigação. Regenere-a com os parâmetros validados antes de submeter.»

- [ ] **Step 7: Registar os canais IPC**

Em `src/main/routers/rh.router.ts`, antes da secção de Auditoria:

```ts
// ── Obrigações Declarativas (RH-901) ────────────────────────────────────────
const verDeclarativas = { chave: 'rh.declarativas.ver' } as const;
const gerirDeclarativas = { chave: 'rh.declarativas.gerir' } as const;
const emitirDeclarativas = { chave: 'rh.declarativas.emitir' } as const;
```

Canais: `rh:declarativas:obrigacoes:listar` (`verDeclarativas`), `rh:declarativas:obrigacoes:criar`, `rh:declarativas:obrigacoes:atualizar`, `rh:declarativas:layouts:listar`, `rh:declarativas:layouts:criar`, `rh:declarativas:validar-juridicamente` (`gerirDeclarativas`), `rh:declarativas:listar` e `rh:declarativas:obter` (`verDeclarativas`), `rh:declarativas:submeter` (`emitirDeclarativas`), `rh:declarativas:anular` (`gerirDeclarativas`), `rh:declarativas:marcar-paga` (`gerirDeclarativas`).

- [ ] **Step 8: Correr, verificar tipos e commitar**

Run: `npx vitest run src/main/services/rh-declarativas.service.test.ts && npm run typecheck:node`
Expected: PASS; typecheck sem erros.

```bash
git add prisma/schema.prisma prisma/migrations src/main/constants/rh-permissions.constants.ts \
  src/renderer/src/config/rh-permissions.ts src/main/validators/rh.validator.ts \
  src/main/services/rh-declarativas.service.ts src/main/services/rh-declarativas.service.test.ts \
  src/main/routers/rh.router.ts
git commit -m "feat(rh): RH-901 — modelo de dados e gestão das obrigações declarativas"
```

---

## Task 2 — `RH-902`: apuramento das declarações

**Files:**
- Create: `src/main/services/rh/declarativas/tipos.ts`, `src/main/services/rh/declarativas/apuracao.ts`
- Create: `src/test/rh/declarativas/apuracao.test.ts`
- Create: `src/main/services/rh-declarativas-apuracao.service.ts`, `src/main/services/rh-declarativas-apuracao.service.test.ts`
- Modify: `src/main/validators/rh.validator.ts`, `src/main/routers/rh.router.ts`

**Interfaces:**
- Consumes: `RhTipoDeclaracao`; `RhProcessamento` (`estado`, `baseINSS`, `inssTrabalhador`, `inssPatronal`, `baseIRT`, `irt`, `irtEscalaoId`); `RhParametroFiscal` (para `nifEmpresa`/`nomeEmpresa` vir da configuração da empresa).
- Produces: `ProcessamentoApurado`, `LinhaApurada`, `TotaisDeclaracao`, `PendenciaDados`, `ResultadoApuracao`, `ApuracaoDeclaracao`; `construirLinhas`, `somarTotais`, `detetarPendencias` (puras); `RhDeclarativasApuracaoService.apurar`; schema `rhDeclaracaoApurarInputSchema`; canal `rh:declarativas:apurar`.

- [ ] **Step 1: Escrever os testes que falham (puros)**

`src/test/rh/declarativas/apuracao.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { construirLinhas, somarTotais, detetarPendencias } from '../../../main/services/rh/declarativas/apuracao';

const d = (n: number) => new Prisma.Decimal(n);

describe('apuração de declarações (RH-902)', () => {
  it('não conta processamentos ANULADOS', () => {});
  it('acumula vários processamentos do mesmo funcionário numa só linha', () => {});
  it('para obrigações de INSS soma bases de INSS; para IRT soma bases de IRT', () => {});
  it('calcula os totais a partir das linhas: base, descontos e encargos', () => {});
  it('assinala pendência quando o NISS falta numa obrigação de INSS', () => {});
  it('assinala pendência quando o NIF falta numa obrigação de IRT', () => {});
  it('devolve linhas vazias e totais a zero quando não há processamentos', () => {});
  it('preserva o escalão de IRT aplicado mais recente', () => {});
});
```

`TotaisDeclaracao` = `{ base: Decimal; descontos: Decimal; encargos: Decimal; linhas: number }`, onde para INSS `base = Σ baseINSS`, `descontos = Σ inssTrabalhador`, `encargos = Σ inssPatronal`; para IRT `base = Σ baseIRT`, `descontos = Σ irt`, `encargos = 0`.

- [ ] **Step 2: Correr e ver falhar**

Run: `npx vitest run src/test/rh/declarativas/apuracao.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o puro**

`tipos.ts` (só tipos, zero imports de valor além de `type`):

```ts
import type { Prisma } from '@prisma/client';

export type ProcessamentoApurado = {
  funcionarioId: string;
  codigoFuncionario: string;
  nome: string;
  niss: string | null;
  nif: string | null;
  baseINSS: Prisma.Decimal;
  inssTrabalhador: Prisma.Decimal;
  inssPatronal: Prisma.Decimal;
  baseIRT: Prisma.Decimal;
  irt: Prisma.Decimal;
  escalaoIRT: string | null;
  estado: 'PROCESSADO' | 'ANULADO';
  dataProcessamento: Date;
};

export type LinhaApurada = {
  funcionarioId: string;
  codigoFuncionario: string;
  nome: string;
  niss: string | null;
  nif: string | null;
  baseINSS: Prisma.Decimal;
  inssTrabalhador: Prisma.Decimal;
  inssPatronal: Prisma.Decimal;
  baseIRT: Prisma.Decimal;
  irt: Prisma.Decimal;
  escalaoIRT: string | null;
};

export type TotaisDeclaracao = { base: Prisma.Decimal; descontos: Prisma.Decimal; encargos: Prisma.Decimal; linhas: number };
export type PendenciaDados = { funcionarioId: string; codigoFuncionario: string; nome: string; campo: 'NISS' | 'NIF'; };
export type ResultadoApuracao = { linhas: LinhaApurada[]; totais: TotaisDeclaracao; pendentes: PendenciaDados[]; avisos: string[] };
```

`apuracao.ts`:

```ts
export function construirLinhas(entradas: ProcessamentoApurado[], tipo: RhTipoDeclaracao): LinhaApurada[];
export function somarTotais(linhas: LinhaApurada[], tipo: RhTipoDeclaracao): TotaisDeclaracao;
export function detetarPendencias(entradas: ProcessamentoApurado[], tipo: RhTipoDeclaracao): PendenciaDados[];
export function agregarProcessamentos(entradas: ProcessamentoApurado[], tipo: RhTipoDeclaracao): ResultadoApuracao;
```

Regras: filtra `estado === 'PROCESSADO'`; agrupa por `funcionarioId` somando com `Decimal.plus` (nunca `+` de `number`); ordena as linhas por `codigoFuncionario` crescente para o ficheiro ser estável.

- [ ] **Step 4: Testes do serviço de apuramento**

`src/main/services/rh-declarativas-apuracao.service.test.ts`:

```ts
describe('RhDeclarativasApuracaoService (RH-902)', () => {
  it('lê os processamentos do período da empresa e devolve as linhas apuradas', async () => {});
  it('exclui processamentos ANULADOS', async () => {});          // Review Focus 2
  it('recusa obrigação de outra empresa com RH_NAO_ENCONTRADO', async () => {});
  it('acusa divergência quando a declaração gerada tem totais diferentes do apuramento actual', async () => {});
  it('devolve declaracaoExistente com estado e totais quando já existe declaração para o período', async () => {});
});
```

- [ ] **Step 5: Implementar o serviço**

```ts
export interface ApurarDeclaracaoInput { empresaId: string | null; obrigacaoId: string; ano: number; periodo: number }
export interface ApuracaoDeclaracao extends ResultadoApuracao {
  obrigacao: ObrigacaoDeclarativaDto;
  declaracaoExistente: DeclaracaoResumoDto | null;
  divergente: boolean;   // true quando declaracaoExistente != null e os totais de hoje diferem dos gravados
}
export class RhDeclarativasApuracaoService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}
  async apurar(input: ApurarDeclaracaoInput): Promise<ApuracaoDeclaracao>;
}
export const rhDeclarativasApuracaoService = new RhDeclarativasApuracaoService();
```

A consulta aos processamentos faz `include` do funcionário (`codigo`, `nome`, `niss`, `nif`) e, quando `tipo` é de IRT, resolve `escalaoIRT` pelo `irtEscalaoId` → `RhEscalaoIRT.ordem`, no mesmo `Promise.all` já usado em `rh-processamento-historico.service.ts`.

- [ ] **Step 6: Registar o canal e correr**

Schema: `rhDeclaracaoApurarInputSchema = z.object({ obrigacaoId: rhIdSchema, ano: z.coerce.number().int().min(2000).max(2100), periodo: rhPeriodoDeclaracaoSchema })`. Canal `rh:declarativas:apurar` com `verDeclarativas`.

Run: `npx vitest run src/test/rh/declarativas/apuracao.test.ts src/main/services/rh-declarativas-apuracao.service.test.ts && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 7: Commitar**

```bash
git commit -m "feat(rh): RH-902 — apuramento das declarações a partir dos processamentos"
```

---

## Task 3 — `RH-903`: motor de geração com layout parametrizável

**Files:**
- Create: `src/main/services/rh/declarativas/ficheiro.ts`
- Create: `src/test/rh/declarativas/ficheiro.test.ts`
- Create: `src/main/utils/rh-armazenamento-declarativas.ts`
- Create: `src/main/services/rh-declarativas-geracao.service.ts`, `src/main/services/rh-declarativas-geracao.service.test.ts`
- Modify: `src/main/services/rh/declarativas/tipos.ts`, `src/main/validators/rh.validator.ts`, `src/main/routers/rh.router.ts`

**Interfaces:**
- Consumes: `LinhaApurada`, `TotaisDeclaracao`, `RhDeclarativasApuracaoService.apurar`.
- Produces: `DefinicaoLayoutDeclarativo`, `CampoLayoutDeclarativo`, `OrigemCampoDeclarativo`, `ContextoDeclaracao`, `DeclaracaoParaFicheiro`; `aplicarLayoutDeclarativo`, `hashConteudo`, `validarDefinicaoLayout`; `ArmazenamentoDeclarativas`, `criarArmazenamentoDeclarativas`; `RhDeclarativasGeracaoService.gerar`; canal `rh:declarativas:gerar`.

- [ ] **Step 1: Escrever os testes que falham (puro do layout)**

`src/test/rh/declarativas/ficheiro.test.ts`:

```ts
describe('aplicarLayoutDeclarativo (RH-903)', () => {
  it('gera CSV com cabeçalho e uma linha por funcionário, na ordem das linhas apuradas', () => {});
  it('formata decimais com vírgula e as casas decimais do campo', () => {});
  it('faz escape de delimitador, aspas e nova linha dentro de um campo', () => {});         // Review Focus 5
  it('converte para latin1 substituindo caracteres não representáveis', () => {});            // Review Focus 5
  it('preenche campos em falta com string vazia quando o campo não é obrigatório', () => {});
  it('recusa definição com origem de campo desconhecida', () => {});
  it('recusa definição com campo obrigatório sem origem correspondente no apuramento', () => {});
  it('gera TXT posicional com largura, alinhamento e preenchimento', () => {});
  it('usa o fim de linha configurado ("\\n" ou "\\r\\n")', () => {});
  it('gera uma única linha de resumo quando tipoFicheiro é RESUMO, alimentada só pelos totais', () => {});
  it('escreve a linha de aviso no topo do ficheiro, antes do cabeçalho, quando existe', () => {});
  it('não escreve linha de aviso quando a declaração está validada juridicamente', () => {});
  it('devolve hash SHA-256 estável do conteúdo', () => {});
});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npx vitest run src/test/rh/declarativas/ficheiro.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar os tipos do layout e o gerador**

Em `tipos.ts`:

```ts
export type OrigemCampoDeclarativo =
  | 'niss' | 'nif' | 'nome' | 'codigoFuncionario'
  | 'baseINSS' | 'inssTrabalhador' | 'inssPatronal' | 'baseIRT' | 'irt' | 'escalaoIRT'
  | 'totalBase' | 'totalDescontos' | 'totalEncargos' | 'totalLinhas'
  | 'ano' | 'periodo' | 'nifEmpresa' | 'nomeEmpresa';

export interface CampoLayoutDeclarativo {
  chave: string;
  origem: OrigemCampoDeclarativo;
  obrigatorio?: boolean;
  largura?: number;
  alinhamento?: 'esquerda' | 'direita';
  preenchimento?: string;
  casasDecimais?: number;
}

export interface DefinicaoLayoutDeclarativo {
  tipoFicheiro: 'DETALHE' | 'RESUMO';
  formato: 'CSV' | 'TXT_POSICIONAL';
  delimitador?: string;             // CSV, por omissão ';'
  codificacao: 'utf8' | 'latin1';
  comCabecalho: boolean;
  fimDeLinha: '\n' | '\r\n';
  campos: CampoLayoutDeclarativo[];
}

export interface ContextoDeclaracao { ano: number; periodo: number; nifEmpresa: string | null; nomeEmpresa: string }
export interface DeclaracaoParaFicheiro {
  contexto: ContextoDeclaracao;
  linhas: LinhaApurada[];
  totais: TotaisDeclaracao;
  /** Linha suplementar no topo do ficheiro (ex.: aviso de ausência de validação jurídica). */
  aviso?: string | null;
}
```

Em `ficheiro.ts`:

```ts
export function validarDefinicaoLayout(definicao: unknown): DefinicaoLayoutDeclarativo;
export function aplicarLayoutDeclarativo(declaracao: DeclaracaoParaFicheiro, definicao: DefinicaoLayoutDeclarativo): string;
export function hashConteudo(conteudo: string): string;   // createHash('sha256').update(conteudo, 'utf8').digest('hex')
```

`tipoFicheiro: 'RESUMO'` escreve **uma** linha, alimentada por `totais` e `contexto` (é isto que serve a guia do INSS, sem precisar de um segundo motor). `validarDefinicaoLayout` é o único sítio que valida o JSON, e esta tarefa é que o liga a `RhDeclarativasService.criarLayout` (a Tarefa 1 aceita o objecto sem validação profunda) e volta a chamá-lo ao gerar, como defesa contra JSON editado à mão na BD.

- [ ] **Step 4: Implementar a porta de armazenamento**

`src/main/utils/rh-armazenamento-declarativas.ts`:

```ts
export interface ArmazenamentoDeclarativas {
  gravar(caminhoRelativo: string, conteudo: string): Promise<string>;
}

/** Grava em `userData/rh/declarativas`, criando as pastas necessárias. */
export function criarArmazenamentoDeclarativas(): ArmazenamentoDeclarativas;
```

Segue o `gravarFicheiro` de `src/main/controllers/fiscal.controller.ts`: `join(app.getPath('userData'), 'rh', 'declarativas')` + `mkdir(..., { recursive: true })` + `writeFile(caminho, conteudo, 'utf8')`. Escrever em `userData` e não no directório do executável — numa instalação protegida esse não é escribível. Este é o único ficheiro da área que importa `electron`.

- [ ] **Step 5: Testes do serviço de geração**

`src/main/services/rh-declarativas-geracao.service.test.ts` (armazenamento injectado com um duplo em memória):

```ts
function criarArmazenamentoFalso() {
  const escritos: Array<{ caminho: string; conteudo: string }> = [];
  return { escritos, gravar: vi.fn(async (caminho, conteudo) => { escritos.push({ caminho, conteudo }); return `fake://${caminho}`; }) };
}

describe('RhDeclarativasGeracaoService (RH-903)', () => {
  it('gera sem validação jurídica registada, marcando o ficheiro e deixando nota nas observações', async () => {}); // Review Focus 4
  it('recusa gerar sem layout vigente na data de fim do período', async () => {});                              // Review Focus 4
  it('recusa gerar quando o apuramento não tem linhas', async () => {});                                        // Review Focus 1
  it('recusa gerar com pendências de NISS/NIF e devolve RH_DADOS_FISCAIS_EM_FALTA', async () => {});             // Review Focus 3
  it('recusa gerar quando já existe declaração não anulada para o período', async () => {});
  it('grava o ficheiro, o hash, a versão do layout e passa o estado a GERADA', async () => {});
  it('não marca o ficheiro quando a obrigação já tem validação jurídica anterior', async () => {});
  it('persiste as linhas apuradas como snapshot imutável na mesma transacção', async () => {});
  it('audita a geração com acao "exportar" e o id da declaração', async () => {});
});
```

- [ ] **Step 6: Implementar o serviço**

```ts
export interface GerarDeclaracaoInput { empresaId: string | null; utilizadorId: string; obrigacaoId: string; ano: number; periodo: number }
export class RhDeclarativasGeracaoService {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly audit: AuditService = auditService,
    private readonly armazenamento: ArmazenamentoDeclarativas = criarArmazenamentoDeclarativas()
  ) {}
  async gerar(input: GerarDeclaracaoInput): Promise<DeclaracaoDetalheDto>;
}
export const rhDeclarativasGeracaoService = new RhDeclarativasGeracaoService();
```

Fluxo: apurar → aplicar os portões (layout vigente; apuramento não vazio; sem pendências; sem declaração não anulada para o período) → calcular `aviso` a partir de `obrigacao.validadaJuridicamenteEm` → `aplicarLayoutDeclarativo` → `hashConteudo` → `armazenamento.gravar('<ano>/<periodo>/<codigo>_<ano>_<periodo>_v<versao>.<ext>', conteudo)` → transacção (`create` da declaração + `createMany` das linhas, com `observacoes` a assinalar a ausência de validação quando for o caso) → auditar **após** o commit, como em ADR-010 (best-effort, não reverte a declaração).

- [ ] **Step 7: Registar o canal, correr e commitar**

Canal `rh:declarativas:gerar` com `emitirDeclarativas`.

Run: `npx vitest run src/test/rh/declarativas/ficheiro.test.ts src/main/services/rh-declarativas-geracao.service.test.ts && npm run typecheck:node`
Expected: PASS.

```bash
git commit -m "feat(rh): RH-903 — motor de geração de declarações com layout parametrizável"
```

---

## Task 4 — `RH-904`: guia de pagamento do INSS

**Files:**
- Modify: `src/main/services/rh-referencia.service.ts`, `src/main/services/rh-declarativas.service.ts`, `prisma/seed.ts`
- Extend tests: `src/main/services/rh-referencia.service.test.ts`, `src/main/services/rh-declarativas.service.test.ts`
- Modify: `src/main/routers/rh.router.ts`

**Interfaces:**
- Consumes: `RhDeclarativasService`, `validarDefinicaoLayout` (Tarefa 3).
- Produces: `OBRIGACOES_REFERENCIA`, `semearObrigacoesDeclarativas(prisma, empresaId)`; `RhDeclarativasService.semearReferencia`; canal `rh:declarativas:semear`.

A guia é uma declaração cujo layout tem `tipoFicheiro: 'RESUMO'` — o motor da Tarefa 3 já a produz, pelo que esta tarefa é de configuração e de referência, não de cálculo. `RhDeclaracaoLinha` fica vazia e `totalLinhas = 0` na guia.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('semeia as cinco obrigações de referência com os prazos nulos', async () => {});
it('semear duas vezes não duplica obrigações', async () => {});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npx vitest run src/main/services/rh-referencia.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar os dados de referência**

Em `src/main/services/rh-referencia.service.ts`, no mesmo formato de `DEPARTAMENTOS_REFERENCIA`:

```ts
export const OBRIGACOES_REFERENCIA = [
  { codigo: 'INSS_REMUNERACOES', designacao: 'Declaração mensal de remunerações (INSS)', tipo: 'INSS_REMUNERACOES', periodicidade: 'MENSAL' },
  { codigo: 'INSS_GUIA',         designacao: 'Guia de pagamento ao INSS',                tipo: 'INSS_GUIA',         periodicidade: 'MENSAL' },
  { codigo: 'IRT_MENSAL',        designacao: 'Declaração mensal de IRT (AGT)',           tipo: 'IRT_MENSAL',        periodicidade: 'MENSAL' },
  { codigo: 'INSS_ANUAL',        designacao: 'Declaração anual de remunerações (INSS)',  tipo: 'INSS_ANUAL',        periodicidade: 'ANUAL'  },
  { codigo: 'IRT_ANUAL',         designacao: 'Declaração anual de IRT (AGT)',            tipo: 'IRT_ANUAL',         periodicidade: 'ANUAL'  },
] as const;
```

**`diaLimite` e `mesLimite` ficam `null`** — os prazos legais não são inventados; são preenchidos via `rh:declarativas:obrigacoes:atualizar` depois de o RH confirmar o calendário. Idempotente via `createMany({ skipDuplicates: true })`, como §7.7.

- [ ] **Step 4: Ligar ao seed e ao canal**

`prisma/seed.ts`, novo bloco §7.8:

```ts
// 7.8 Obrigações declarativas (RH-904)
const obrigacoes = await semearObrigacoesDeclarativas(prisma, empresaId);
console.log(`✅ RH: obrigações declarativas — ${obrigacoes.criadas} criada(s).`);
```

Canal `rh:declarativas:semear` com `editarConfig` do RH (`rh.config.editar`), como o `rh:config:referencia:semear` já existente. O handler chama `rhDeclarativasService.semearReferencia(ctx.empresaId)`, que só delega em `semearObrigacoesDeclarativas` e audita a operação (`acao: 'criar'`, `entidade: 'RhObrigacaoDeclarativa'`).

- [ ] **Step 5: Correr e commitar**

Run: `npx vitest run src/main/services/rh-referencia.service.test.ts && npm run db:seed`
Expected: PASS; o seed imprime `obrigações declarativas — 5 criada(s)` e uma segunda execução imprime `0`.

```bash
git commit -m "feat(rh): RH-904 — obrigações de referência e guia de pagamento INSS"
```

---

## Task 5 — `RH-905`: apuramento anual

**Files:**
- Modify: `src/main/services/rh/declarativas/apuracao.ts`, `src/test/rh/declarativas/apuracao.test.ts`
- Modify: `src/main/services/rh-declarativas-apuracao.service.ts`, `src/main/services/rh-declarativas-apuracao.service.test.ts`

**Interfaces:**
- Consumes: `agregarProcessamentos`, `RhPeriodicidadeDeclaracao`.
- Produces: `agregarAnual` (puro) e o ramo anual de `RhDeclarativasApuracaoService.apurar`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it('soma os doze meses processados numa única linha por funcionário', () => {});
it('ignora processamentos de meses ANULADOS e conta-os no aviso', () => {});
it('avisa "Ano incompleto: N de 12 períodos processados" quando faltam meses', () => {});
it('serve obrigações anuais com periodo = 0', () => {});
it('não mistura meses de outro ano', () => {});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npx vitest run src/test/rh/declarativas/apuracao.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

```ts
export function agregarAnual(entradas: ProcessamentoApurado[], tipo: RhTipoDeclaracao): ResultadoApuracao;
```

Reutiliza `construirLinhas`/`somarTotais` e acrescenta os `avisos`. No serviço, `apurar` ramifica por `obrigacao.periodicidade === 'ANUAL'` e força `periodo = 0` (recusando `periodo != 0` com `RhBusinessRuleError`).

- [ ] **Step 4: Correr, verificar tipos e commitar**

Run: `npx vitest run src/test/rh/declarativas/apuracao.test.ts src/main/services/rh-declarativas-apuracao.service.test.ts && npm run typecheck:node`
Expected: PASS.

```bash
git commit -m "feat(rh): RH-905 — apuramento anual das obrigações"
```

---

## Task 6 — `RH-906`: separador Obrigações Declarativas

**Files:**
- Modify: `src/preload/index.ts`, `src/renderer/src/@types/electron.d.ts`, `src/renderer/src/api/rh.api.ts`
- Create: `src/renderer/src/components/erp/rh/RhDeclarativasManager.tsx`
- Modify: `src/renderer/src/pages/rh.tsx`
- Create: `tests/e2e/rh-declarativas.e2e.ts`

**Interfaces:**
- Consumes: canais `rh:declarativas:*`; `rhApi`; `useAuth` + `rhPermissaoConcede`.
- Produces: árvore `window.api.rh.declarativas.*`; DTOs `RhObrigacaoDeclarativaDto`, `RhLayoutDeclarativoDto`, `RhDeclaracaoResumoDto`, `RhDeclaracaoDetalheDto`, `RhDeclaracaoLinhaDto`, `RhApuracaoDto`, `RhDeclarativasListarInput`; `rhApi.declarativas`; componente `RhDeclarativasManager`.

- [ ] **Step 1: Expor os canais no preload**

`src/preload/index.ts`, na árvore `rh`:

```ts
// Obrigações Declarativas (RH-901…907)
declarativas: {
  obrigacoes: {
    listar: (input: unknown) => ipcRenderer.invoke('rh:declarativas:obrigacoes:listar', input),
    criar: (dados: unknown) => ipcRenderer.invoke('rh:declarativas:obrigacoes:criar', dados),
    atualizar: (dados: unknown) => ipcRenderer.invoke('rh:declarativas:obrigacoes:atualizar', dados),
  },
  layouts: {
    listar: (input: unknown) => ipcRenderer.invoke('rh:declarativas:layouts:listar', input),
    criar: (dados: unknown) => ipcRenderer.invoke('rh:declarativas:layouts:criar', dados),
  },
  semear: () => ipcRenderer.invoke('rh:declarativas:semear'),
  apurar: (input: unknown) => ipcRenderer.invoke('rh:declarativas:apurar', input),
  gerar: (input: unknown) => ipcRenderer.invoke('rh:declarativas:gerar', input),
  listar: (input: unknown) => ipcRenderer.invoke('rh:declarativas:listar', input),
  obter: (id: string) => ipcRenderer.invoke('rh:declarativas:obter', { id }),
  submeter: (dados: unknown) => ipcRenderer.invoke('rh:declarativas:submeter', dados),
  marcarPaga: (id: string) => ipcRenderer.invoke('rh:declarativas:marcar-paga', { id }),
  anular: (dados: unknown) => ipcRenderer.invoke('rh:declarativas:anular', dados),
  validarJuridicamente: (dados: unknown) => ipcRenderer.invoke('rh:declarativas:validar-juridicamente', dados),
  mapaPdf: (id: string) => ipcRenderer.invoke('rh:declarativas:mapa-pdf', { id }),
  pendencias: (input: unknown) => ipcRenderer.invoke('rh:declarativas:pendencias', input),
},
```

Acrescentar os DTOs a `electron.d.ts` (junto aos de recibos, ~linha 2320) e a assinatura correspondente na interface `Window`, no mesmo estilo de `recibos`.

- [ ] **Step 2: Acrescentar o domínio à `rh.api.ts`**

Seguir exactamente o bloco `retroativos`: cada método devolve `IpcResponse<T>` e cai em `semApi()` quando a ponte não existe.

- [ ] **Step 3: Implementar o componente**

`RhDeclarativasManager.tsx`, com `Tabs` de shadcn: **Obrigações** (lista + criar/editar + "Registar validação jurídica"; badge *sem validação jurídica* quando `validadaJuridicamenteEm` é nulo), **Declarações** (filtros ano/período/estado; botão *Apurar*; pré-visualização dos totais e da lista de pendências; botão *Gerar ficheiro* desactivado **apenas** quando há pendências ou o apuramento está vazio — a falta de validação não bloqueia a geração, só a submissão), **Histórico** (declarações com estado, totais, versão do layout, hash; *Reimprimir* abre o ficheiro; transições *Submeter* → referência externa, *Marcar como paga*, *Anular* com motivo — *Submeter* escondido/desactivado quando a obrigação não está validada ou a declaração é anterior à validação).

Padrões obrigatórios: `carregando` + `Loader2`, estado vazio inline ("Nenhuma declaração para este período."), `toast.error(resp.error?.message)`, e `rhPermissaoConcede(permissoes, 'rh.declarativas.emitir')` a esconder as acções de geração/submissão. Nada de `EmptyState` — não existe no repo.

- [ ] **Step 4: Ligar a aba**

`src/renderer/src/pages/rh.tsx`: importar `RhDeclarativasManager` e acrescentar o ramo antes do `else` final:

```tsx
) : tab === "declarativas" ? (
  <div className="mt-4">
    <RhDeclarativasManager />
  </div>
```

A aba continua a ser `declarativas` (o `data-testid` `ribbon-tab-declarativas` é gerado pelo `ErpShell` a partir do `tabKey`).

- [ ] **Step 5: Escrever o E2E**

`tests/e2e/rh-declarativas.e2e.ts`, no molde de `rh-processamento.e2e.ts` (`_electron.launch`, `autenticar`, sessão partilhada, `test.setTimeout(240_000)`):

```ts
test.describe("RH-906: Obrigações Declarativas", () => {
  test("semear, apurar período sem processamentos e ver a mensagem", async () => {
    await janela.getByTestId("ribbon-tab-declarativas").click();
    // semear, escolher INSS_REMUNERACOES + ano + período, Apurar
    // esperar o aviso de apuramento vazio e o botão Gerar desactivado
  });
});
```

- [ ] **Step 6: Correr e commitar**

Run: `npx vitest run src/main/services/rh-declarativas.service.test.ts && npm run typecheck:web && npm run build && npx playwright test tests/e2e/rh-declarativas.e2e.ts`
Expected: PASS em todos; o E2E arranca contra `out/main/index.js`.

```bash
git commit -m "feat(rh): RH-906 — separador de Obrigações Declarativas"
```

---

## Task 7 — `RH-907`: mapa de remunerações e relatório de pendências

**Files:**
- Create: `src/main/services/rh-declarativas-pdf.service.ts`
- Create: `src/main/services/rh-declarativas-pdf.service.test.ts`
- Modify: `src/main/routers/rh.router.ts`, `src/preload/index.ts`, `src/renderer/src/@types/electron.d.ts`, `src/renderer/src/api/rh.api.ts`, `src/renderer/src/components/erp/rh/RhDeclarativasManager.tsx`

**Interfaces:**
- Consumes: `RhDeclaracao` + `RhDeclaracaoLinha`; `pdfkit`; o padrão de `rh-recibos-pdf.service.ts`.
- Produces: `RhDeclarativasPdfService.gerarMapa(declaracaoId): Promise<Buffer>` (serve tanto declarações de detalhe como de resumo — é também este o PDF da guia do INSS); canais `rh:declarativas:mapa-pdf`, `rh:declarativas:pendencias`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe('RhDeclarativasPdfService (RH-907)', () => {
  it('gera um PDF com cabeçalho da empresa, período e uma linha por funcionário', async () => {});
  it('recusa declaração de outra empresa com RH_NAO_ENCONTRADO', async () => {});
  it('inclui os totais no fim do mapa', async () => {});
  it('assinala no PDF quando a declaração está anulada', async () => {});
});
```

Asserção prática: `expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')` e `expect(buffer.length).toBeGreaterThan(1000)`.

- [ ] **Step 2: Correr e ver falhar**

Run: `npx vitest run src/main/services/rh-declarativas-pdf.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o serviço de PDF**

Reutilizar o esqueleto de `rh-recibos-pdf.service.ts` (`PDFDocument`, `fmtMoeda` com `Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' })`, `fmtData`), sem pdfkit novo. `gerarPdfLote` como os recibos devolve `Buffer[]` — para o mapa basta `Buffer`.

- [ ] **Step 4: Canal do PDF e do relatório de pendências**

`rh:declarativas:mapa-pdf` (`emitirDeclarativas`) → `{ id }` → `Buffer`, tal como `rh:recibos:gerarPdf`; o renderer faz `new Blob([resp.data], { type: 'application/pdf' })` e `window.open`.
`rh:declarativas:pendencias` (`verDeclarativas`) → `{ obrigacaoId, ano, periodo }` → as `pendentes` do apuramento, para exportação CSV com `src/main/utils/rh-csv.ts` (reutilizar, não reescrever).

- [ ] **Step 5: Ligar na UI**

No separador: botão *Mapa de remunerações (PDF)* na declaração seleccionada, e secção *Pendências de dados* a listar `codigoFuncionario`, `nome` e `campo` (`NISS`/`NIF`), com um botão *Exportar CSV*.

- [ ] **Step 6: Correr, verificar tipos e commitar**

Run: `npx vitest run src/main/services/rh-declarativas-pdf.service.test.ts && npm run typecheck && npm run build`
Expected: PASS; build sem erros.

```bash
git commit -m "feat(rh): RH-907 — mapa de remunerações e relatório de pendências"
```

---

## Verificação final

```bash
npm run typecheck:node && npm run typecheck:web
npx vitest run src/test/rh/declarativas src/main/services/rh-declarativas
npm run build
npx playwright test tests/e2e/rh-declarativas.e2e.ts tests/e2e/rh-processamento.e2e.ts
npm test          # a bateria completa tem de continuar verde (957 testes de base)
```

Esperado: typecheck limpo; novos testes a passar; os 27 E2E de RH (9 specs) continuam a passar; nenhuma regressão na bateria.

**Registo final:** riscar `RH-901`…`RH-907` em `docs/rh-docs/03-tasks.md`; linha nova em `docs/rh-docs/DECISOES.md` (Notas de progresso) a registar a decisão do campo `periodo = 0` para anuais e a porta dos prazos nulos; acrescentar os modelos a `docs/rh-docs/04-modelo-de-dados.md`; escrever o capítulo do utilizador em `docs/manual/07-rh.md` com o que ficou implementado e o que continua em falta (layouts oficiais e validação jurídica).

## Fora de âmbito desta fase

- Submissão electrónica nos portais do INSS/AGT: o sistema gera o ficheiro, o operador submete-o.
- Criação de layouts oficiais reais: só entram depois de o RH entregar os documentos. Até lá, a única forma de gerar é com um layout criado manualmente na UI — e a Tarefa 3 garante que o sistema recusa gerar sem ele.
- Recalcular IRT/INSS: os valores vêm exclusivamente de `RhProcessamento`.
