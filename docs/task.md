# Tasks — Documentos Fiscais DoraERP

Estado auditado contra o código e a base de dados em 2026-09-28. Todas as tarefas de
implementação estão concluídas; as notas assinalam desvios aprovados face ao plano.

## Task 1 — Persistência fiscal no schema Prisma
- [x] Step 1: Adicionar enums fiscais ao schema.prisma
- [x] Step 2: Estender FaturaVenda, LinhaFaturaVenda, ReciboVenda
- [x] Step 3: Adicionar ProformaVenda, LinhaProformaVenda, GuiaEntrega, LinhaGuiaEntrega
- [x] Step 4: Estender EmpresaConfig, SerieDocumento, relações inversas
- [x] Step 5: Gerar migração Prisma e rever SQL
- [x] Step 6: Gerar client e validar schema
- [x] Step 7: Estender electron.d.ts com DTOs

Evidência: `prisma/migrations/20260923150000_documentos_fiscais/migration.sql`; `npx prisma migrate status` → *Database schema is up to date*; tabelas `proformas_venda`, `linhas_proforma_venda`, `guias_entrega`, `linhas_guia_entrega`, `recibos_venda`, `imputacoes_recibo`, `series_documentos` presentes.

## Task 2 — Numeração atómica e cálculos comerciais
- [x] Step 1: Criar documento-numero.service.test.ts
- [x] Step 2: Criar documento-numero.service.ts
- [x] Step 3: Criar documento-calculos.test.ts
- [x] Step 4: Criar documento-calculos.ts
- [x] Step 5: Atualizar vendas.validator.ts
- [x] Step 6: Executar testes

Evidência: `vendas.validator.ts` deixou de aceitar `numero` na emissão e passou a exigir `faturaOrigemId` para NC, `motivoNotaCredito` e motivo de isenção quando há linhas a 0%.

## Task 3 — Upgrade FT/FR/NC com origens + anulação
- [x] Step 1: Adicionar testes de falha ao vendas.service.test.ts
- [x] Step 2: Refatorar VendasService com DocumentoNumeroService
- [x] Step 3: Implementar regras de origem (GR→FT, NC)
- [x] Step 4: Implementar anularFatura e getDocumentoImprimivel
- [x] Step 5: Estender controller e router com novos endpoints
- [x] Step 6: Executar testes

Evidência: `vendas:anularFatura` e `vendas:getDocumentoImprimivel` registados em `vendas.router.ts`; stock baixado apenas na GR confirmada, NC sem movimento.

## Task 4 — Proforma (FP)
- [x] Step 1: Criar proforma.validator.ts
- [x] Step 2: Criar proforma.service.ts + test
- [x] Step 3: Criar proforma.controller.ts + router
- [x] Step 4: Registar em src/main/index.ts
- [x] Step 5: Executar testes

## Task 5 — Guia de Entrega (GR)
- [x] Step 1: Criar guia-entrega.validator.ts
- [x] Step 2: Criar guia-entrega.service.ts + test
- [x] Step 3: Criar guia-entrega.controller.ts + router
- [x] Step 4: Registar em src/main/index.ts
- [x] Step 5: Executar testes

## Task 6 — Recibo (RC)
- [x] Step 1: Criar recibo.validator.ts
- [x] Step 2: Criar recibo.service.ts + test
- [x] Step 3: Criar recibo.controller.ts + router
- [x] Step 4: Registar em src/main/index.ts
- [x] Step 5: Executar testes

Evidência (Tasks 4–6): `registerProformaRouter`, `registerGuiaEntregaRouter`, `registerReciboRouter`
e `registerDocumentoPrintRouter` estão registados em `src/main/index.ts` (8, 7, 6 e 1 canais).

## Task 7 — AGT QR + Impressão + PDF IPC
- [x] Step 1: Instalar qrcode + types
- [x] Step 2: Criar agt-qr.ts + test
- [n/a] Step 3: `documento-print.types.ts` existe; **adapter + test não criados** — desvio
  aprovado: o modelo de impressão construído no processo main foi mantido, sem
  `documento-print.adapter.ts`.
- [x] Step 4: Criar componentes React (DocumentoA4, DocumentoPreviewDialog)
- [x] Step 5: Criar documentos-print.css
- [x] Step 6: Criar documento-print.router.ts
- [x] Step 7: Estender preload/index.ts (`documentoPrint.exportPdf`, sem `ipcRenderer` genérico)

## Task 8 — APIs renderer + UI Managers
- [x] Step 1: Criar proformas.api.ts, guias-entrega.api.ts, recibos.api.ts
- [x] Step 2: Criar ProformaManager.tsx
- [x] Step 3: Criar GuiaEntregaManager.tsx
- [x] Step 4: Criar ReciboManager.tsx
- [x] Step 5: Adaptar FaturaManager.tsx
- [x] Step 6: Adaptar vendas.tsx (ReciboForm/`console.log` removidos)
- [x] Step 7: Criar `documentos.api.test.ts` — teste de contrato dos wrappers (estava em falta)

## Task 9 — Verificação final
- [x] npm test (23 ficheiros / 124 testes)
- [x] npm run typecheck (node + web)
- [x] npm run build
- [x] Verificação manual Electron dos percursos fiscais, impressão A4 e limites de stock

## Correcções de stock (fora do plano, concluídas)

- [x] `getStockArtigoArmazem` passa a apurar entradas e saídas por tipo de movimento
- [x] `getStockTotalArtigo` desconta o ajuste negativo de inventário
- [x] `createMovimento` normaliza os armazéns: entrada sem origem, saída sem destino
- [x] `MovimentoStockManager` deixou de pré-preencher o armazém de origem de uma entrada
- [x] Cobertura: 9 testes novos em `stock.service.test.ts`
