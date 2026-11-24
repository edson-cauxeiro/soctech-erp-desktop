# Documentos Fiscais — Plano de Implementação

Implementação completa de FT (Fatura), FR (Fatura-Recibo), NC (Nota de Crédito), FP (Proforma), GR (Guia de Entrega) e RC (Recibo) no DoraERP Desktop.

**Fonte:** [`docs/superpowers/plans/2026-09-22-documentos-fiscais-implementation.md`](file:///r:/www/Projects/doraerp-desktop/docs/superpowers/plans/2026-09-22-documentos-fiscais-implementation.md)

## Estado Atual

- Schema Prisma **sem** enums fiscais, `ProformaVenda`, `GuiaEntrega`, ou campos de snapshot.
- `VendasService` usa numeração ingénua (contagem de registos) sem série atómica.
- Sem validators/services/controllers/routers para Proforma, Guia de Entrega e Recibo.
- Sem utilitário AGT QR, sem componentes de impressão, sem PDF IPC.

> [!IMPORTANT]
> Esta implementação requer execução de migração Prisma. O servidor `npm run dev` precisará ser reiniciado após a migração.

## Tarefas

| # | Tarefa | Ficheiros chave |
|---|--------|-----------------|
| 1 | Persistência fiscal no schema Prisma | `prisma/schema.prisma`, migração SQL, `electron.d.ts` |
| 2 | Numeração atómica + cálculos comerciais | `documento-numero.service.ts`, `documento-calculos.ts` |
| 3 | Upgrade FT/FR/NC com origens + anulação | `vendas.service.ts`, `vendas.validator.ts`, `vendas.controller.ts` |
| 4 | Ciclo de vida Proforma (FP) | `proforma.*.ts` |
| 5 | Guia de Entrega com stock + conversão (GR) | `guia-entrega.*.ts` |
| 6 | Recibos, adiantamentos e imputações (RC) | `recibo.*.ts` |
| 7 | AGT QR + templates de impressão + PDF IPC | `agt-qr.ts`, componentes React, `documentos-print.css` |
| 8 | APIs renderer + Managers de documentos | `ProformaManager`, `GuiaEntregaManager`, `ReciboManager`, `vendas.tsx` |
| 9 | Verificação integrada final | `npm test`, `npm run typecheck`, `npm run build` |

## Proposed Changes

---

### Task 1 — Persistência

#### [MODIFY] [schema.prisma](file:///r:/www/Projects/doraerp-desktop/prisma/schema.prisma)
- Adicionar enums `EstadoDocumentoFiscal`, `TipoSerieDocumento`, `EstadoProforma`, `EstadoGuiaEntrega`
- Estender `EmpresaConfig`, `SerieDocumento`, `FaturaVenda`, `LinhaFaturaVenda`, `ReciboVenda`
- Adicionar `ProformaVenda`, `LinhaProformaVenda`, `GuiaEntrega`, `LinhaGuiaEntrega`
- Atualizar relações em `Cliente`, `Artigo`, `Armazem`

#### [NEW] `prisma/migrations/<timestamp>_documentos_fiscais/migration.sql`
- Backfill `series_documentos.tipo_documento = 'FT'` antes de NOT NULL
- Backfill `recibos_venda.serie = 'LEGACY'`, snapshot de cliente, `estado_documento = 'emitido'`

#### [MODIFY] [electron.d.ts](file:///r:/www/Projects/doraerp-desktop/src/renderer/src/@types/electron.d.ts)
- Adicionar DTOs para todos os novos modelos

---

### Task 2 — Numeração e Cálculos

#### [NEW] `src/main/services/documento-numero.service.ts`
#### [NEW] `src/main/services/documento-numero.service.test.ts`
#### [NEW] `src/main/services/documento-calculos.ts`
#### [NEW] `src/main/services/documento-calculos.test.ts`
#### [MODIFY] [vendas.validator.ts](file:///r:/www/Projects/doraerp-desktop/src/main/validators/vendas.validator.ts)

---

### Task 3 — FT/FR/NC Upgrade

#### [MODIFY] [vendas.service.ts](file:///r:/www/Projects/doraerp-desktop/src/main/services/vendas.service.ts)
#### [MODIFY] [vendas.service.test.ts](file:///r:/www/Projects/doraerp-desktop/src/main/services/vendas.service.test.ts)
#### [MODIFY] [vendas.controller.ts](file:///r:/www/Projects/doraerp-desktop/src/main/controllers/vendas.controller.ts)
#### [MODIFY] [vendas.router.ts](file:///r:/www/Projects/doraerp-desktop/src/main/routers/vendas.router.ts)

---

### Task 4 — Proforma

#### [NEW] `src/main/validators/proforma.validator.ts`
#### [NEW] `src/main/services/proforma.service.ts`
#### [NEW] `src/main/services/proforma.service.test.ts`
#### [NEW] `src/main/controllers/proforma.controller.ts`
#### [NEW] `src/main/routers/proforma.router.ts`
#### [MODIFY] [index.ts](file:///r:/www/Projects/doraerp-desktop/src/main/index.ts)

---

### Task 5 — Guia de Entrega

#### [NEW] `src/main/validators/guia-entrega.validator.ts`
#### [NEW] `src/main/services/guia-entrega.service.ts`
#### [NEW] `src/main/services/guia-entrega.service.test.ts`
#### [NEW] `src/main/controllers/guia-entrega.controller.ts`
#### [NEW] `src/main/routers/guia-entrega.router.ts`

---

### Task 6 — Recibo

#### [NEW] `src/main/validators/recibo.validator.ts`
#### [NEW] `src/main/services/recibo.service.ts`
#### [NEW] `src/main/services/recibo.service.test.ts`
#### [NEW] `src/main/controllers/recibo.controller.ts`
#### [NEW] `src/main/routers/recibo.router.ts`

---

### Task 7 — QR, Impressão e PDF

#### [NEW] `src/main/utils/agt-qr.ts` + test
#### [NEW] `src/main/routers/documento-print.router.ts`
#### [MODIFY] [preload/index.ts](file:///r:/www/Projects/doraerp-desktop/src/preload/index.ts)
#### [NEW] `src/renderer/src/components/documentos/` (7 componentes + adapter + CSS)

---

### Task 8 — Renderer + UI

#### [NEW] `src/renderer/src/api/proformas.api.ts`
#### [NEW] `src/renderer/src/api/guias-entrega.api.ts`
#### [NEW] `src/renderer/src/api/recibos.api.ts`
#### [NEW] `src/renderer/src/components/erp/ProformaManager.tsx`
#### [NEW] `src/renderer/src/components/erp/GuiaEntregaManager.tsx`
#### [NEW] `src/renderer/src/components/erp/ReciboManager.tsx`
#### [MODIFY] `src/renderer/src/components/erp/FaturaManager.tsx`
#### [MODIFY] `src/renderer/src/pages/vendas.tsx`

## Verification Plan

### Automated Tests
```bash
npm test
npm run typecheck
npm run build
```

### Manual Verification
- Criar FP → converter para GR → confirmar GR (1 saída stock) → faturar GR (0 saídas adicionais)
- Criar FT direta → verificar 1 saída stock
- Criar NC ligada a FT → verificar sem movimento stock
- Criar RC sem imputações (adiantamento) → imputar a fatura → verificar estado `parcial`/`pago`
- Preview + PDF para cada tipo de documento
- Verificar QR AGT em FT/FR/NC de empresa AO
