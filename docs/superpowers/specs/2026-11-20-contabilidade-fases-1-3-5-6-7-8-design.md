# Design — Fecho de desvios das fases 1, 3, 5, 6, 7 e 8 (Contabilidade)

**Data:** 2026-11-20
**Base:** `docs/financas/plan-financa.md` + auditoria de implementação de 2026-11-20.
**Âmbito confirmado pelo utilizador:** fases 1, 3, 5, 6, 7 e 8. Fases 0, 2, 4 e 9 ficam fora deste trabalho.

## 1. Contexto e problema

A auditoria confirmou que as fases 1, 3, 5, 6, 7 e 8 têm backend e UI implementados, e que `prisma validate`, `npm run typecheck` e `npm test` (1 037 testes) passam. Persistem, porém, desvios pontuais face ao plano:

- `WorkspaceFrame` usa `vh` e `min-h-[380px]` em vez de `dvh`/`min-h-[420px]`, e o seletor de conta-pai do plano de contas não filtra contas inativas.
- A reconciliação contabilística usa altura própria em `vh` e botões HTML crus, fora das convenções do plano.
- Os relatórios contabilísticos não têm testes, títulos de PDF, canais de exportação nem handlers nos botões da UI.
- Fechos e apuramentos usam a permissão `write` onde o plano exige `approve`; faltam testes de fecho de período, apuramento de IVA e três cenários de fecho anual.
- O apuramento de IVA procura a chave não-canónica `VAT_DEDUCTIBLE` (a chave fechada é `VAT_INPUT`).

## 2. Decisão de abordagem

Correções pontuais, sem migrações, sem alteração de esquema Prisma e sem alteração de contratos de IPC já existentes. Os canais e serviços atuais são completados, não reestruturados. Alternativa considerada e rejeitada: unificar os serviços de fecho/apuramento num módulo comum — maior consistência, mas risco e volume de alteração desproporcionais neste momento.

## 3. Alterações por fase

### Fase 1 — Fundações

1. `src/renderer/src/components/erp/WorkspaceFrame.tsx`: raiz passa a
   `h-[calc(100dvh-15.5rem)] min-h-[420px] bg-card border border-border rounded-md overflow-hidden`,
   mantendo cabeçalho/barra de ferramentas `shrink-0`, área central `flex-1 min-h-0` e scroll interno.
   A prop `className` continua a poder sobrepor estilos via `cn`.
2. `src/renderer/src/components/erp/PlanoContasManager.tsx`: opções do seletor de conta-pai passam a exigir `activa === true`, além do filtro por prefixo de código já existente.

### Fase 3 — Reconciliação ligada à contabilidade

`src/renderer/src/components/erp/ReconciliacaoContabilManager.tsx` passa a usar `WorkspaceFrame` em vez da div com `h-[calc(100vh-17rem)]`; os `<button>` passam a `Button` de `@/components/ui/button`. São preservados: KPIs, seleção de conta, janela de dias, sugestões por valor/data, conciliação em lote, cabeçalho sticky e CTA "Ligar conta contabilística".

### Fase 5 — Relatórios base

1. Novo `src/main/services/relatorios-contabilidade.service.test.ts`, com Prisma mockado no padrão dos testes existentes: balancete = soma de linhas de lançamentos validados; razão reconcilia com o balancete; diários ordenados por número; conta corrente com antiguidade; invariante global `Σ débitos = Σ créditos`.
2. `src/main/services/relatorio-pdf.service.ts`: acrescentar títulos `balancete`, `razao`, `diarios`, `contaCorrente` a `TITULOS`.
3. `src/main/controllers/relatorios.controller.ts`: exportar os tipos `Tabela`/`Coluna` para reutilização (sem mudança de comportamento).
4. `src/main/controllers/contabilidade.controller.ts`: novo método `exportarRelatorio(payload, janela)` que valida o pedido com Zod, obtém os dados dos quatro relatórios via `RelatoriosContabilidadeService`, monta uma `Tabela`, usa `dialog.showSaveDialog`, escreve CSV/PDF/XLSX com `RelatoriosController.paraCsv`, `gerarPdfRelatorio` e `RelatoriosController.paraExcel`, e regista `AuditLog` (`modulo: 'financas'`, `acao: 'exportar'`). Empresa sempre retirada da sessão.
5. `src/main/routers/contabilidade.router.ts`: canal `contabilidade:exportarRelatorio`.
6. `src/preload/index.ts`, `src/renderer/src/@types/electron.d.ts`, `src/renderer/src/api/contabilidade.api.ts`: exposição, tipagem e cliente do novo canal.
7. `src/renderer/src/components/erp/RelatoriosContabilidadeManager.tsx`: botões PDF/Excel passam a chamar a API com o relatório ativo, filtros atuais e formato, com `toast` de sucesso/erro e tratamento de cancelamento.

### Fase 6 — Fecho mensal e bloqueio de períodos

1. `src/main/controllers/contabilidade.controller.ts`: o wrapper `com` aceita `approve`; `executarFecho`, `reabrirPeriodoFecho`, `alterarEstadoPeriodo`, `fecharPeriodo`, `reabrirPeriodo` e `bloquearPeriodo` passam a exigir `approve` (os quatro últimos são canais alternativos de bloqueio de período). (`permissions.constants.ts` já define `approve` e o perfil de administrador semeado em `prisma/seed.ts` já o concede em `financas`.)
2. Novo `src/main/services/fecho-periodo.service.test.ts`: previsão com checklist, fecho idempotente, rejeição de escrita em período fechado, reabertura com motivo obrigatório e `AuditLog`.

### Fase 7 — Apuramento de IVA

1. `src/main/services/apuramento-iva.service.ts`: a pesquisa de contas de IVA dedutível usa apenas a chave canónica `VAT_INPUT`.
2. `contabilidade.controller.ts`: `executarApuramentoIva` passa a exigir `approve` (`registarPagamento` mantém `write`).
3. Novo `src/main/services/apuramento-iva.service.test.ts`: cálculo de liquidado/dedutível/saldo, transporte de crédito do período anterior, recusa de dois apuramentos para o mesmo período, geração de lançamento equilibrado.

### Fase 8 — Apuramento de resultados e fecho anual

1. `contabilidade.controller.ts`: `executarApuramentoResultados`, `executarFechoAnual`, `abrirExercicioSeguinte` e `reabrirFechoAnual` passam a exigir `approve`.
2. `src/main/services/fecho-anual.service.test.ts`: acrescentar os cenários em falta — balancete de N+1 a 01/01 igual ao balancete final de N nas classes 1–5; classes 6/7 a zero; reabertura bloqueada quando N+1 tem lançamentos além da abertura.

## 4. Marcações no plano

`docs/financas/plan-financa.md` passa a ter uma tabela "Estado de implementação" junto ao topo e um badge inline em cada título `### Fase N`. Resultado esperado após este trabalho:

| Fase | Estado |
|---|---|
| 0 | ⚠️ Parcial (Documento de Descoberta ainda em falta) |
| 1, 3, 5, 6, 7, 8 | ✅ Concluída |
| 2, 4, 9 | ❌ Pendente (fora do âmbito) |

Os boxes da §10 que passam a estar satisfeitos são marcados com `[x]`; os restantes mantêm-se `[ ]`.

## 5. Validação

`npm run typecheck`, `npm test`, `npx prisma validate`. Critérios de aceitação das fases 1, 3, 5, 6, 7 e 8 devem estar cobertos pelos testes existentes e pelos novos.

## 6. Fora de âmbito

Criação de `docs/financas/DESCOBERTA_CONTABILIDADE.md`; editor de lançamentos e store de rascunho (fase 2); substituição do gateway RH e ligação do motor aos módulos de origem (fase 4); SAF-T contabilístico e XSD (fase 9); migrações e alteração de esquema.
