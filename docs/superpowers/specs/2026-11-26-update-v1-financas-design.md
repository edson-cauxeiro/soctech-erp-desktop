# Update v1 — Finanças Design Spec

**Date:** 2026-11-26
**Source:** `docs/updates/update-v1.md` §1.3
**Status:** Aguardando revisão do utilizador

## Contexto

A secção 1.3 do guia de actualização reporta três problemas no módulo de Finanças:

1. **Relatórios contabilísticos:** ao abrir a aba, aparece repetidamente o toast “Falha ao comunicar com o processo principal.”
2. **Demonstrações financeiras:** a página não apresenta informação.
3. **Lançamento contabilístico:** ao adicionar linhas no formulário de novo lançamento, o `SearchSelect` de conta não permite escolher opção; além disso, o formulário abre com duas linhas vazias que o utilizador quer poder remover.

Foi feita confirmação em runtime no HEAD actual (`c42e4c8`):

- O erro de Relatórios reproduz-se.
- Demonstrações abre sem estruturas (estado vazio), sem exercício/período seleccionados e com “Gerar” desactivado.
- O `SearchSelect` de conta **já funciona** com clique de rato, incluindo em linhas adicionadas, após `b6ea3ca` (`pointerEvents: "auto"` na lista em portal dentro de `FormDialog`).
- O formulário de lançamento abre com exactamente duas linhas vazias e os botões de remover estão desactivados (`fields.length <= 2`).

## Objectivo

Corrigir as três causas de origem com o menor raio de acção possível, preservando contratos IPC, validadores e comportamento de backend. O utilizador deve ver:

- Relatórios gerados sem erro de comunicação;
- Demonstração com estruturas padrão e um exercício/período pré-seleccionados;
- Formulário de lançamento a abrir vazio, com remoção livre de linhas e escolha de conta funcional.

## Decisões aprovadas

1. **Relatórios:** corrigir apenas no controller — injecção da empresa da sessão antes da validação e `parse` dentro do wrapper de erro. Renderer inalterado.
2. **Demonstração:** criar estruturas padrão automaticamente quando a lista está vazia (seed idempotente), além de corrigir o contrato e a selecção de exercício/período.
3. **Contrato da lista de estruturas:** o serviço passa a devolver o array `linhas` completo e ordenado; renderer e tipos mantêm-se.
4. **Lançamento:** formulário abre com **zero linhas**; `Guardar rascunho` e `Validar` desactivados até existirem pelo menos 2 linhas; remoção sempre permitida; mínimo de 2 linhas continua no backend.
5. **SearchSelect:** sem alteração de produção; acrescentar teste E2E de regressão.

## Arquitectura e fluxo de dados

### Relatórios contabilísticos

Fluxo actual (quebrado):

```
RelatoriosContabilidadeManager (sem empresaId)
  → contabilidadeApi.balancete/razao/diarios/contaCorrente
  → contabilidade.controller: schema.parse(filtros)   ← lança ZodError aqui
  → empresaDaSessao() injetada depois                 ← nunca é alcançada
  → licensed-handler deixa o reject chegar ao renderer
  → catch do manager mostra "Falha ao comunicar..."
```

Fluxo corrigido:

```
RelatoriosContabilidadeManager (inalterado)
  → contabilidade.controller:
      filtrosComEmpresa = { ...filtros, empresaId: this.empresaDaSessao() }
      this.com('read', 'gerar ...', () => this.relatorios.balancete(filtrosComEmpresa))
        → parse dentro de com() → IpcResponse padronizado
  → manager decide com res.success / res.error
```

Isto segue o padrão já usado por `exportarRelatorio` (`contabilidade.controller.ts:732-743`) e por `relatorios.controller.ts:679-700`.

### Demonstrações financeiras

```
DemonstracoesManager (mount)
  → listarEstruturas()
      → DemonstracoesService.listarEstruturas:
          include: { linhas: { orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] } }
      → estruturas[] com `linhas` preenchidas (compatível com EstruturaRelatorioDto)
  → se lista vazia: contabilidadeApi.semear() → recarregar lista (guard contra loops)
  → auto-seleccionar primeiro exercício → carregar períodos → auto-seleccionar primeiro período
  → Gerar habilitado quando há estrutura + intervalo
  → gerarDemonstracao() com try/catch e toast de erro
```

O seed de estruturas é idempotente: `semearEstruturasPadrao` retorna `criadas: 0` se já existir qualquer estrutura da empresa. A chamada usa o endpoint `semear()` existente (`contabilidadeApi.semear()`), o mesmo botão “Semear” de `PlanoContasManager`.

### Lançamento contabilístico

```
useLancamentoDraft / criarValoresVazios → linhas: []
LinhasEditor → estado vazio + "Adicionar linha"; remover sempre habilitado
Footer → Guardar/Validar desactivados enquanto linhas.length < 2
SearchSelect por linha (portal) → inalterado; coberto por E2E
Backend → validador min 2 linhas inalterado
```

## Mudanças detalhadas

### 1. `src/main/controllers/contabilidade.controller.ts`

- Nos métodos `balancete`, `razao`, `relatorioDiarios` e `relatorioContaCorrente`, construir os filtros com `empresaId: this.empresaDaSessao()` **antes** de chamar o schema de validação.
- Mover o `schema.parse(...)` para dentro da callback de `this.com('read', ...)`, para que `ZodError` seja convertido em `IpcResponse` (`VALIDATION_ERROR`).
- Não alterar assinaturas IPC, canais, preload nem DTOs do renderer.

**Teste:** `src/main/controllers/contabilidade.controller.relatorios.test.ts` (novo) — invocar os quatro métodos com filtros no formato actual do renderer (sem `empresaId`), usando um controller com sessão fake, e asserts:
- `res.success === true`;
- o serviço recebeu `empresaId` da sessão;
- filtros inválidos devolvem `VALIDATION_ERROR` em vez de rejeitarem.

### 2. `src/main/services/demonstracoes.service.ts` e teste

- `listarEstruturas`: trocar `include: { _count: { select: { linhas: true } } }` por `include: { linhas: { orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] } }`.
- Actualizar `src/main/services/demonstracoes.service.test.ts:440-465` para esperar o array `linhas` e o novo `include`.
- Nenhuma alteração a `obterEstrutura`, `gerar`, validadores ou prisma.

### 3. `src/renderer/src/components/erp/DemonstracoesManager.tsx`

- Ao carregar, se `res.success && (res.data ?? []).length === 0`, chamar `contabilidadeApi.semear()` uma vez (com `useRef` de guard) e recarregar a lista; mostrar um toast de aviso se o seed falhar.
- Auto-seleccionar o primeiro exercício após carregar exercícios (`setExercicioId((atual) => atual || exRes.data[0]?.id || '')`), seguindo `RelatoriosContabilidadeManager.tsx:108-113`.
- Ao carregar períodos do exercício, auto-seleccionar o primeiro período se não houver selecção.
- Preencher as datas manualmente a partir do período seleccionado, se ainda estiverem a zero, para que `Gerar` fique habilitado.
- Envolver `gerarDemonstracao` em `try/catch`, com `toast.error` quando `res.success === false`, espelhando o catch de exportação existente.

**Não alterar:** estrutura visual, acções de Nova estrutura/Editar/Exportar, contrato dos botões.

### 4. `src/renderer/src/hooks/useLancamentoDraft.ts`, `LancamentoContabilEditor.tsx` e `LinhasEditor.tsx`

- `useLancamentoDraft`: valor por omissão de `linhas` passa a `[]` (quando não há `defaults`).
- `LancamentoContabilEditor.criarValoresVazios`: `linhas: []`.
- `LinhasEditor`:
  - remover `disabled={disabled || fields.length <= 2}` do botão de remover, deixando apenas `disabled`;
  - adicionar estado vazio com texto “Adicione pelo menos duas linhas.” e o botão “Adicionar linha”;
  - manter `append()` a criar `linhaVazia()` com `contaId: ''`, `debito/credito: '0'`.
- Footer do editor: `Guardar rascunho` e `Validar` passam a considerar também `linhas.length >= 2` na condição de desactivação.
- Nenhuma alteração ao esquema Zod local além do valor por omissão de `linhas`; validador do backend inalterado.

### 5. `tests/e2e/financas-lancamento.e2e.mts` (novo)

Usar os utilitários de login/navegação existentes em `tests/e2e/`:

1. Iniciar sessão e ir a Finanças → Lançamentos contabilísticos.
2. Clicar em “Novo”.
3. Assert: zero linhas na tabela e botão de guardar desactivado.
4. Clicar em “Adicionar linha” duas vezes.
5. Abrir o `SearchSelect` da primeira linha, escolher uma conta da lista e afirmar que o texto da conta aparece na célula.
6. Fechar o formulário sem gravar (sem efeitos na base de dados).

## Fora de âmbito

- Backend/validadores/Prisma/DTOs de lançamento, excepto o `include` do `listarEstruturas`.
- Renderer de Relatórios e canais IPC.
- Componentes de Vendas, Compras, Stock ou Comercial.
- Remoção/alteração de `retencaoFonte`, `estadoPagamento`, símbolos monetários ou avisos de Proforma.
- Refactor geral de error handling ou de formulários de Finanças.

## Critérios de aceitação

1. Abrir Finanças → Relatórios não mostra “Falha ao comunicar com o processo principal.”; gerar Balancete/Razão/Diários/Conta corrente devolve dados ou erro de validação legível.
2. Abrir Finanças → Demonstrações financeiras com base sem estruturas cria as 4 estruturas padrão, selecciona exercício/período e permite gerar sem erro.
3. Com estruturas já existentes, a lista carrega sem erro de `linhas.length` e o editor de estrutura mostra as linhas.
4. Novo lançamento abre sem linhas; é possível adicionar, remover e escolher conta em qualquer linha; guardar só é possível com 2 ou mais linhas.
5. `npm test`, `npm run typecheck`, `npm run build` e `npm run lint` mantêm-se dentro da baseline (31 erros de lint preexistentes).
6. Teste E2E novo passa.
