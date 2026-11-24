# Fecho de desvios das fases 1, 3, 5, 6, 7 e 8 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os desvios das fases 1, 3, 5, 6, 7 e 8 face a `docs/financas/plan-financa.md` e marcar o estado de implementação nesse documento.

**Architecture:** Correções pontuais no renderer (altura e convenções de UI), no controlador IPC (permissão `approve` e exportação de relatórios) e nos testes de serviço; nenhuma migração ou alteração de esquema.

**Tech Stack:** Electron 39 + React 19 + TypeScript + Tailwind v4 + Zod 3 + Prisma 7 + Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-20-contabilidade-fases-1-3-5-6-7-8-design.md`

## Global Constraints

- Nenhuma alteração a `prisma/schema.prisma`, migrações ou `TipoAcaoAuditoria`.
- Fases 0, 2, 4 e 9 ficam fora do âmbito; não criar `DESCOBERTA_CONTABILIDADE.md`.
- Montantes contabilísticos continuam como `string` nos DTOs; aritmética com `Prisma.Decimal` no main.
- Toda a escrita continua protegida por `requirePermission(session, 'financas', acao)` via `ContabilidadeController.com`.
- Serviços continuam a receber `PrismaClient` no construtor para testes.
- Comandos de verificação: `npm run typecheck`, `npm test`, `npx prisma validate`.
- O repositório não é um git repository; os passos de commit do formato são substituídos por "guardar ficheiro".

## Review Focus

- Período ou exercício fechado: fecho/apuramento devem ser recusados no serviço **e** exigir `approve` no IPC — teste: `fecho-periodo.service.test.ts`, `apuramento-iva.service.test.ts`.
- Chave de mapeamento inexistente (`VAT_DEDUCTIBLE`): o cálculo de IVA deve usar apenas `VAT_INPUT` — teste: `apuramento-iva.service.test.ts`.
- Exportação cancelada pelo utilizador: não escrever ficheiro nem registar auditoria — teste manual via handler do botão; verificação por inspeção do fluxo no controller.
- Relatórios com lançamentos em rascunho: não podem entrar no balancete/razão — teste: `relatorios-contabilidade.service.test.ts`.
- Ecrãs com altura pequena: `WorkspaceFrame` e reconciliação não podem ultrapassar a área útil — verificação por `dvh` + `min-h-[420px]` no código.

---

### Task 1: Altura e filtros das fundações (Fase 1)

**Files:**
- Modify: `src/renderer/src/components/erp/WorkspaceFrame.tsx:40-45`
- Modify: `src/renderer/src/components/erp/PlanoContasManager.tsx:264-274`

**Interfaces:**
- Consumes: nada.
- Produces: `WorkspaceFrame` com altura `calc(100dvh - 15.5rem)` e mínimo `420px`; seletor de conta-pai sem contas inativas.

- [ ] **Step 1: Ajustar a moldura**

Substituir a classe da raiz em `WorkspaceFrame.tsx` por
`flex flex-col gap-4 h-[calc(100dvh-15.5rem)] min-h-[420px] bg-card border border-border rounded-md overflow-hidden`, mantendo `cn(...)` e a prop `className`.

- [ ] **Step 2: Filtrar contas inativas no seletor de conta-pai**

Em `PlanoContasManager.tsx`, acrescentar `activa === true` ao filtro das opções do seletor de conta-pai, preservando o filtro por prefixo de código.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Guardar**

Guardar os dois ficheiros.

### Task 2: Reconciliação dentro da moldura (Fase 3)

**Files:**
- Modify: `src/renderer/src/components/erp/ReconciliacaoContabilManager.tsx:195-631`

**Interfaces:**
- Consumes: `WorkspaceFrame` (Task 1), `Button` de `@/components/ui/button`.
- Produces: ecrã de reconciliação usando a moldura comum.

- [ ] **Step 1: Substituir a raiz**

Trocar `<div className="h-[calc(100vh-17rem)] min-h-[380px] flex flex-col gap-4">` por `<WorkspaceFrame title="Reconciliação contabilística" description="..." ...>`; mover o seletor de conta e a janela de dias para a prop `toolbar`, mantendo os KPIs e os dois painéis no corpo.

- [ ] **Step 2: Substituir botões crus**

Trocar todos os `<button ...>` do componente por `<Button type="button" variant="outline" size="sm" ...>`, preservando `onClick`, `disabled` e texto.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Guardar**

Guardar o ficheiro.

### Task 3: Testes dos relatórios contabilísticos (Fase 5)

**Files:**
- Create: `src/main/services/relatorios-contabilidade.service.test.ts`

**Interfaces:**
- Consumes: `RelatoriosContabilidadeService` (`balancete`, `razao`, `diarios`, `contaCorrente`), padrão de mock de Prisma de `apuramento-resultados.service.test.ts`.
- Produces: cobertura do invariante `Σ débitos = Σ créditos`.

- [ ] **Step 1: Escrever os testes**

Criar o ficheiro com `describe('RelatoriosContabilidadeService')` e casos:
1. `balancete` agrega apenas linhas de lançamentos `validado` e devolve `totais.debito === totais.credito`;
2. `balancete` ignora um lançamento `rascunho`;
3. `razao` devolve saldo transitado + linhas + saldo corrente e reconcilia com o balancete;
4. `diarios` ordena por número;
5. `contaCorrente` devolve Antiguidade (ate30/ate60/ate90/mais90) quando há datas de vencimento.

- [ ] **Step 2: Verificar que passam**

Run: `npx vitest run src/main/services/relatorios-contabilidade.service.test.ts`
Expected: todos PASS.

- [ ] **Step 3: Guardar**

Guardar o ficheiro.

### Task 4: Exportação de relatórios contabilísticos (Fase 5)

**Files:**
- Modify: `src/main/services/relatorio-pdf.service.ts:57-73`
- Modify: `src/main/controllers/relatorios.controller.ts:99-103`
- Modify: `src/main/controllers/contabilidade.controller.ts` (construtor + novo método)
- Modify: `src/main/routers/contabilidade.router.ts` (import `BrowserWindow`, novo canal)
- Modify: `src/preload/index.ts:310-316`
- Modify: `src/renderer/src/@types/electron.d.ts` (DTO `ExportarRelatorioDto`, membro `exportarRelatorio`)
- Modify: `src/renderer/src/api/contabilidade.api.ts` (método `exportarRelatorio`)
- Modify: `src/renderer/src/components/erp/RelatoriosContabilidadeManager.tsx:387-393` (botões)

**Interfaces:**
- Consumes: `RelatoriosController.paraCsv(tabela): Buffer`, `RelatoriosController.paraExcel(tabelas): Promise<Buffer>`, `gerarPdfRelatorio(cabecalho, tabela): Promise<Buffer>`, `tituloRelatorio(nome): string`, serviços de relatório (Task 3).
- Produces: `contabilidadeApi.relatorios.exportarRelatorio(payload: { relatorio: 'balancete'|'razao'|'diarios'|'contaCorrente'; formato: 'csv'|'xlsx'|'pdf'; filtros: Record<string, unknown> })` → `IpcResponse<{ cancelado?: boolean; caminho?: string; linhas?: number; formato?: string }>`.

- [ ] **Step 1: Títulos e tipos**

Acrescentar `balancete`, `razao`, `diarios`, `contaCorrente` a `TITULOS` em `relatorio-pdf.service.ts`; mudar `type Tabela` e `type Coluna` em `relatorios.controller.ts` para `export type`.

- [ ] **Step 2: Esquema de entrada**

Em `contabilidade.controller.ts`, definir
`const exportarRelatorioSchema = z.object({ relatorio: z.enum(['balancete','razao','diarios','contaCorrente']), formato: z.enum(['csv','xlsx','pdf']), filtros: z.record(z.unknown()) })`.

- [ ] **Step 3: Método do controller**

Importar `dialog` de `electron` e `auditService` de `../services/audit.service`. Implementar `async exportarRelatorio(payload: unknown, janela: BrowserWindow | null): Promise<IpcResponse<unknown>>`:
`com('write', 'exportar relatório contabilístico', ...)`; empresa = `sessao.empresaConfigId`; chamar o serviço correspondente com `{ ...filtros, empresaId }`; montar `Tabela` com colunas por relatório; `dialog.showSaveDialog` com filtro por formato; cancelado → `{ cancelado: true }`; escrever com `paraCsv`/`paraExcel`/`gerarPdfRelatorio`; registar `auditService.registar({ empresaId, utilizadorId: sessao.id, modulo: 'financas', acao: 'exportar', entidade: 'Relatorio', descricao, dadosNovos })`; devolver `{ caminho, linhas, formato }`.

- [ ] **Step 4: Canal IPC e ponte**

Adicionar `import { BrowserWindow } from 'electron'` ao router e
`ipcMain.handle('contabilidade:relatorios:exportar', (event, payload) => contabilidadeController.exportarRelatorio(payload, BrowserWindow.fromWebContents(event.sender)))`.
Expor `exportarRelatorio` em `src/preload/index.ts` dentro de `contabilidade.relatorios`.

- [ ] **Step 5: Tipos e cliente renderer**

Declarar `ExportarRelatorioDto` e o método `exportarRelatorio` em `electron.d.ts` e implementar o delegado em `contabilidade.api.ts` seguindo `semApi()`.

- [ ] **Step 6: Botões na UI**

Na barra de filtros de `RelatoriosContabilidadeManager.tsx`, acrescentar `Button` "PDF" e "Excel" que chamam `contabilidadeApi.relatorios.exportarRelatorio({ relatorio: aba, formato, filtros })` com os filtros ativos; `toast.success` com o caminho, `toast.error` em falha, silêncio em `cancelado`.

- [ ] **Step 7: Verificar**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 8: Guardar**

Guardar todos os ficheiros.

### Task 5: RBAC `approve` e testes de fecho (Fases 6 e 8)

**Files:**
- Modify: `src/main/controllers/contabilidade.controller.ts:587-607` e métodos das linhas 437-539
- Create: `src/main/services/fecho-periodo.service.test.ts`
- Modify: `src/main/services/fecho-anual.service.test.ts`

**Interfaces:**
- Consumes: `ACOES_RBAC` já contém `approve`; `requirePermission` já o suporta.
- Produces: ações de fecho/apuramento exigem `approve`; testes de idempotência e bloqueio.

- [ ] **Step 1: Wrapper**

Mudar o tipo de `acao` em `com` para `'read' | 'write' | 'approve' | 'delete'`.

- [ ] **Step 2: Ações protegidas**

Trocar `'write'` por `'approve'` em: `executarFecho`, `reabrirPeriodoFecho`, `alterarEstadoPeriodo`, `fecharPeriodo`, `reabrirPeriodo`, `bloquearPeriodo`, `executarApuramentoIva` (Task 6 cobre a chave), `executarApuramentoResultados`, `executarFechoAnual`, `abrirExercicioSeguinte`, `reabrirFechoAnual`. Manter `write` em `registarPagamentoIva` e nas operações de criação/edição.

- [ ] **Step 3: Testes de fecho de período**

Criar `fecho-periodo.service.test.ts` com Prisma mockado: previsão com checklist; `executar` cria `ExecucaoFecho` e atualiza período; segunda execução não cria outra; `reabrir` exige motivo e grava `AuditLog`; fecho recusado com período fechado.

- [ ] **Step 4: Completar testes de fecho anual**

Acrescentar a `fecho-anual.service.test.ts`: balancete N+1 a 01/01 = classes 1–5 finais de N; classes 6/7 a zero; reabertura recusada quando N+1 tem lançamentos além da abertura.

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/main/services/fecho-periodo.service.test.ts src/main/services/fecho-anual.service.test.ts`
Expected: todos PASS.

- [ ] **Step 6: Guardar**

Guardar os três ficheiros.

### Task 6: Chave canónica de IVA e testes (Fase 7)

**Files:**
- Modify: `src/main/services/apuramento-iva.service.ts:80-85`
- Create: `src/main/services/apuramento-iva.service.test.ts`

**Interfaces:**
- Consumes: `CHAVES_CONTA` (chave `VAT_INPUT`), `MapeamentoConta`, `Prisma.Decimal`.
- Produces: cálculo de IVA sem chave inválida e teste de transporte de crédito.

- [ ] **Step 1: Corrigir a chave**

Em `previsao`, trocar `['VAT_INPUT', 'VAT_DEDUCTIBLE']` por `['VAT_INPUT']`. Verificar se a mesma lista aparece noutros pontos do serviço e corrigir.

- [ ] **Step 2: Escrever os testes**

Criar `apuramento-iva.service.test.ts` com Prisma mockado: `ivaLiquidado = créditos(output) − débitos(output)`; `ivaDedutivel = débitos(input) − créditos(input)`; crédito transitado do período anterior; recusa de apuramento duplicado; `executar` cria lançamento equilibrado e `AuditLog`.

- [ ] **Step 3: Verificar**

Run: `npx vitest run src/main/services/apuramento-iva.service.test.ts`
Expected: todos PASS.

- [ ] **Step 4: Guardar**

Guardar os dois ficheiros.

### Task 7: Marcações no plano e verificação final

**Files:**
- Modify: `docs/financas/plan-financa.md`

**Interfaces:**
- Consumes: resultados das Tasks 1–6.
- Produces: estado visível das fases no plano.

- [ ] **Step 1: Tabela de estado**

Inserir logo após o cabeçalho do plano uma tabela "Estado de implementação (2026-11-20)" com as fases 0–9 e os estados: 0 ⚠️, 1 ✅, 2 ❌, 3 ✅, 4 ❌, 5 ✅, 6 ✅, 7 ✅, 8 ✅, 9 ❌, com nota de que 2/4/9 estão fora do âmbito desta iteração.

- [ ] **Step 2: Badges inline**

Acrescentar ao final de cada título `### Fase N — ...` o badge correspondente (`✅ Concluída`, `⚠️ Parcial`, `❌ Pendente`).

- [ ] **Step 3: Checklist §10**

Marcar `[x]` apenas nos itens da §10 satisfeitos por este trabalho (altura útil, aprovação de fecho/apuramentos, relatórios validados, typecheck/testes); manter `[ ]` nos restantes.

- [ ] **Step 4: Verificação final**

Run: `npm run typecheck && npm test && npx prisma validate`
Expected: sem erros; número de testes superior a 1 037.

- [ ] **Step 5: Guardar**

Guardar o plano.
