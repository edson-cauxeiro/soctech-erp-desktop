# Melhorias doc-2 — Utilizadores/RBAC, Moeda AOA, Empresa (Logo/Bancos) e Stock

Data: 2026-09-29
Fonte: `docs/doc-2.md`
Plano aprovado: opção "Recomendado" em todas as necessidades.

## Necessidades (5)

1. **Utilizadores a valer a pena** — criação de utilizador/perfil/permissões:
   - utilizador ligado a empresa (`empresaConfigId` obrigatório);
   - formatações/layouts conforme padrão do sistema (RNF03).
2. **Moeda por defeito AOA** (kwanza) — as restantes opcionais.
3. **Página de definições/empresa** — campo logótipo como **upload de ficheiro**
   restrito a `jpeg/jpg/png`.
4. **Logótipo e dados bancários nos documentos** da empresa (fatura, proforma,
   recibo, notas, guias, relatórios).
5. **Alerta de Stock** não mostra estado do artigo nem quantidades bem calculadas.

## Decisões aprovadas (utilizador)

- **N3**: logótipo guardado como **data URL base64** no campo `logotipoUrl`
  (mantém `JSON` sem novo canal IPC).
- **N5**: corrigir bug de cálculo de stock **e** adicionar coluna do estado do artigo.
- **N2**: `moedaBase`→AOA na `EmpresaConfig`, e `moeda`→AOA em `Cliente`,
  `ProformaVenda` e `ContaBancaria` + seed.
- **N4**: relatórios **fora de âmbito**; documentos fiscais já emitem logo+bancos —
  verificação manual apenas.
- **N1**: commit + polimento mínimo (sincronização `preload/index.d.ts`,
  reposição de senha por administrador, toggle inativar/ativar).

## Execução (T0–T6)

### T0 — Baseline ✅
- Commit do WIP RBAC + migração `20260928170000_utilizadores_perfis_rbac`
  + correções de stock. Commit `96e5ea1` (51 ficheiros).

### T1 — Polimento RBAC ✅
- `reporSenha` (admin) no backend: validator → service → controller (RBAC) →
  router IPC `utilizadores:resetPassword` → preload → `utilizador.api.ts`.
- `UtilizadorManager`: toggle inativar/ativar (botão Power) + modal de senha com
  modo "repor senha (sem senha actual)".
- Sincronização `src/preload/index.d.ts`.
- Fix de erros de tipo pré-existentes (`PerfilManager`, `password`, import não usado).
- `AuthService` passou a receber `UtilizadorService` injetável (testabilidade).
- Testes: `utilizador.service.test.ts` novo (reporSenha/criar); `auth.service.test.ts`
  atualizados (empresa/perfil obrigatórios).

### T2 — Moeda AOA ✅
- Schema: `@default("AOA")` em `EmpresaConfig.moedaBase`, `Cliente.moeda`,
  `ProformaVenda.moeda`, `ContaBancaria.moeda`.
- Seed: `moedaBase: 'AOA'`.
- Migração `20260929093000_moeda_default_aoa` aplicada (inclui reconciliação de
  drift pré-existente do WIP: enum `UnidadeArtigo` com M2/M3 e remoção de
  defaults obsoletos em `linhas_fatura_venda`/`utilizadores`). BD sincronizada
  ("No difference detected").

### T3 — Upload de logótipo ✅
- `EmpresaModal`: campo passa de URL texto para `<input type="file">
  accept="image/jpeg,image/png"`, validação de tipo/extensão e limite de 2 MB,
  conversão FileReader→data URL, pré-visualização + botão Remover.

### T4 — Verificação manual (documentos fiscais) ✅
- Confirmado em código: `guia-entrega`, `vendas`, `recibo`, `proforma` emitem
  `logotipoUrl` + `dadosBancarios` no DTO de impressão; `DocumentoA4` renderiza.
- Verificação visual do PDF fica para o utilizador. Relatórios fora de âmbito.

### T5 — Alerta de Stock ✅
- Fix `getEstadoStock`: groupBy de entradas/saídas passa a filtrar
  `armazemDestinoId/armazemOrigemId: { not: null }`, alinhado com
  `getStockTotalArtigo`.
- `EstadoArtigoStock` e `AlertaStockDto` ganham `estado`; query seleciona
  `estado`.
- UI `AlertaStockManager`: coluna Estado com badge
  (Ativo/Descontinuado/Inativo) e `formatQuantidade` com até 4 casas.

### T6 — Verificação ✅
- `npm test`: 137 passed (24 files).
- `npm run typecheck`: limpo (node + web).
- `npm run build`: OK.

## Ficheiro de plano gerado
Este ficheiro (`docs/superpowers/plans/2026-09-29-doc-2-melhorias-implementation.md`).

## Fora de âmbito
- Relatórios com logo/banco (decisão N4).
- Migração de dados existentes em moeda (defaults aplicam-se a novos registos).