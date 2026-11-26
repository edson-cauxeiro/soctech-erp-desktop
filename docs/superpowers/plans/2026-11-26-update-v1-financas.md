# Update v1 — Finanças Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Corrigir os três problemas de Finanças do `update-v1.md` §1.3 sem alterar contratos IPC, validadores de backend nem os módulos já concluídos.

**Architecture:** Correcções cirúrgicas: o controller de contabilidade passa a validar depois de injectar a empresa da sessão; o serviço de demonstrações devolve `linhas` completas e o manager semeia estruturas quando a lista está vazia; o editor de lançamento abre com zero linhas e mantém o mínimo de 2 apenas no backend. Um teste E2E protege o `SearchSelect` em portal dentro do `FormDialog`.

**Tech Stack:** React 19, TypeScript, Tailwind 4, react-hook-form, zod, Vitest, Playwright, Electron.

**Spec:** `docs/superpowers/specs/2026-11-26-update-v1-financas-design.md`

## Global Constraints

- Não alterar renderer de Relatórios, canais IPC, preload, DTOs de lançamento, validadores de lançamento, Prisma nem os módulos de Vendas/Compras/Stock/Comercial.
- A empresa da sessão é a autoridade: o renderer não passa `empresaId` nos filtros de relatório.
- O seed de estruturas é idempotente e deve ser chamado **no máximo uma vez** por montagem da página.
- Mínimo de 2 linhas continua no validador do backend; apenas a UI deixa de pré-preencher e de bloquear remoção.
- `SearchSelect` não sofre alteração de produção; clique em opção em portal já funciona em HEAD (`b6ea3ca`).
- `npm run lint` mantém a baseline de 31 erros e 799 warnings; não introduzir novos.
- Não executar `npm test` em paralelo com `npm run build` (o `prisma generate` do build troca `.prisma/client` durante o carregamento dos testes).

## Review Focus

- Filtros de relatório sem `empresaId` devem gerar o relatório, não rejeitar o IPC — ver Task 1 Step 2.
- Filtros inválidos devem devolver `VALIDATION_ERROR` legível em vez de excepção IPC — ver Task 1 Step 2.
- Lista de estruturas com `linhas` deve carregar sem `TypeError: linhas.length` — ver Task 2 Step 1.
- Base sem estruturas deve criar as 4 padrão uma única vez e auto-seleccionar exercício/período — ver Task 3 Step 5.
- Formulário com zero linhas deve desactivar guardar e permitir escolher conta numa linha adicionada — ver Task 4 Step 2 e Step 5.

---

### Task 1: Relatórios contabilísticos — validar depois de injectar a empresa

**Files:**
- Modify: `src/main/controllers/contabilidade.controller.ts:545-571`
- Test: `src/main/controllers/contabilidade.controller.relatorios.test.ts` (novo)

**Interfaces:**
- Consumes: `balanceteFiltersSchema`, `razaoFiltersSchema`, `diariosFiltersSchema`, `contaCorrenteFiltersSchema` de `../validators/relatorios.validator`; `ContabilidadeController.empresaDaSessao()` e `com(...)` já existentes.
- Produces: os quatro métodos continuam a devolver `Promise<IpcResponse<unknown>>`; o serviço `relatorios` recebe filtros com `empresaId` da sessão.

- [x] **Step 1: Escrever o teste que falha**

Criar `contabilidade.controller.relatorios.test.ts`. Reutilizar o helper `criarController` de `contabilidade.controller.lancamentos.test.ts:33-68`, com estes ajustes:
- `auth.getCurrentSession` devolve uma sessão com `empresaConfigId: 'empresa_1'` e `permissoes: { financas: ['read', 'write'] }`;
- o 11.º argumento do construtor (`relatorios`) é um objecto com `balancete`, `razao`, `diarios` e `contaCorrente` como `vi.fn(async () => ({ linhas: [] }))`;
- devolver `{ controller, relatorios }`.

Escrever dois testes:

```ts
it.each([
  ['balancete', {}, 'balancete'],
  ['razao', { contaId: 'conta-1' }, 'razao'],
  ['relatorioDiarios', {}, 'diarios'],
  ['contaCorrente', { entidadeTipo: 'cliente', entidadeId: 'cliente-1' }, 'contaCorrente'],
])('gera %s sem empresaId no filtro do renderer', async (metodo, filtros, servico) => {
  const { controller, relatorios } = criarController();
  // @ts-expect-error — índice dinâmico apenas no teste
  const res = await controller[metodo](filtros);
  expect(res.success).toBe(true);
  expect(relatorios[servico]).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'empresa_1' }));
});

it('devolve VALIDATION_ERROR para filtros inválidos', async () => {
  const { controller } = criarController();
  const res = await controller.balancete({ classe: 99 });
  expect(res.success).toBe(false);
  if (!res.success) expect(res.error.code).toBe('VALIDATION_ERROR');
});
```

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/main/controllers/contabilidade.controller.relatorios.test.ts`
Expected: FAIL — os quatro primeiro casos rejeitam com `ZodError: A empresa é obrigatório.` e o último também não devolve `VALIDATION_ERROR`.

- [x] **Step 3: Implementar a correcção no controller**

Em `src/main/controllers/contabilidade.controller.ts:545-571`, substituir os quatro métodos por este padrão (um por método, com o schema e descrição correspondentes):

```ts
async balancete(filters?: unknown): Promise<IpcResponse<unknown>> {
  return this.com('read', 'gerar balancete', async () => {
    const f = balanceteFiltersSchema.parse({
      ...(filters ?? {}),
      empresaId: this.empresaDaSessao(),
    });
    return this.relatorios.balancete(f);
  });
}
```

Aplicar o mesmo a `razao` (`razaoFiltersSchema`, `this.relatorios.razao`), `relatorioDiarios` (`diariosFiltersSchema`, `this.relatorios.diarios`) e `contaCorrente` (`contaCorrenteFiltersSchema`, `this.relatorios.contaCorrente`). Não alterar assinaturas nem chamadores.

- [x] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/main/controllers/contabilidade.controller.relatorios.test.ts`
Expected: PASS (5 testes).

- [x] **Step 5: Commit**

```bash
git add src/main/controllers/contabilidade.controller.relatorios.test.ts src/main/controllers/contabilidade.controller.ts
git commit -m "fix(financas): validate report filters after injecting session company"
```

---

### Task 2: Demonstrações — contrato `linhas` no serviço

**Files:**
- Modify: `src/main/services/demonstracoes.service.ts:147-154`
- Test: `src/main/services/demonstracoes.service.test.ts:440-460`

**Interfaces:**
- Consumes: `prisma.estruturaRelatorio.findMany`; types `TipoEstruturaRelatorio` e `EstruturaRelatorioDto` já existentes.
- Produces: `listarEstruturas(empresaId, tipo?)` passa a devolver estruturas com `linhas` ordenadas, compatíveis com o renderer.

- [x] **Step 1: Actualizar o teste primeiro**

Em `demonstracoes.service.test.ts:440-460`, trocar o item e o `include` esperado:

```ts
const itens = [{ id: 'e1', linhas: [{ id: 'l1', codigo: 'ATIVO', ordem: 1 }] }];
prismaMock.estruturaRelatorio.findMany.mockResolvedValue(itens);

const esperado = {
  orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
  include: { linhas: { orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] } },
};
```

Manter as duas asserções `toHaveBeenNthCalledWith` e o teste `exige empresa ao listar`.

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/main/services/demonstracoes.service.test.ts -t "lista estruturas"`
Expected: FAIL — o `include` esperado já não é `{ _count: ... }`.

- [x] **Step 3: Implementar o `include`**

Em `demonstracoes.service.ts:152`, trocar:

```ts
include: { _count: { select: { linhas: true } } },
```

por:

```ts
include: { linhas: { orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] } },
```

Não alterar `where`, `orderBy`, `obterEstrutura` nem outros métodos.

- [x] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/main/services/demonstracoes.service.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/main/services/demonstracoes.service.ts src/main/services/demonstracoes.service.test.ts
git commit -m "fix(financas): return full lines from listarEstruturas"
```

---

### Task 3: Demonstrações — seed, selecção automática e erro visível

**Files:**
- Modify: `src/renderer/src/components/erp/DemonstracoesManager.tsx:105-190`, `:209-229`, `:358`

**Interfaces:**
- Consumes: `contabilidadeApi.listarEstruturas`, `contabilidadeApi.semear`, `contabilidadeApi.listarExercicios`, `contabilidadeApi.listarPeriodos`, `contabilidadeApi.gerarDemonstracao`; `toast` de `sonner`.
- Produces: nenhuma interface nova; `DemonstracoesManager` continua com as mesmas props.

- [x] **Step 1: Seed idempotente quando a lista estiver vazia**

Em `DemonstracoesManager.tsx`, adicionar `const seedEstruturasRef = useRef(false);` junto de `periodoAplicadoRef` (linha 114). Em `carregarEstruturas` (125-130), depois de `setEstruturas(res.data)` e apenas se `res.data.length === 0 && !seedEstruturasRef.current`:
1. marcar `seedEstruturasRef.current = true` antes de chamar a API;
2. `const seed = await contabilidadeApi.semear()`;
3. se falhar, `toast.error('Erro ao criar estruturas padrão', { description: seed.error.message })`;
4. sucedendo, chamar `contabilidadeApi.listarEstruturas(empresaId)` novamente e `setEstruturas(novas.data)` se `novas.success`.

Não repetir o seed em recarregamentos manuais.

- [x] **Step 2: Auto-seleccionar o primeiro exercício**

Em `carregarExercicios` (132-137), imediatamente a seguir a `setExercicios(...)`, acrescentar:

```ts
setExercicioId((atual) => atual || res.data[0]?.id || '');
```

O efeito de `carregarPeriodos` (167-169) passa então a carregar períodos; a auto-selecção do primeiro período já existe em 156.

- [x] **Step 3: Habilitar “Gerar” apenas com intervalo**

Em `DemonstracoesManager.tsx:358`, trocar `disabled={isLoading || !estruturaSelecionada}` por:

```tsx
disabled={isLoading || !estruturaSelecionada || !intervalo.inicio || !intervalo.fim}
```

- [x] **Step 4: Converter falha de IPC em toast**

Em `gerarDemonstracao` (209-229), manter o `try/finally` actual e acrescentar um `catch` entre eles:

```ts
} catch (error) {
  toast.error('Erro ao gerar demonstração', { description: (error as Error)?.message });
} finally {
```

- [x] **Step 5: Verificar na aplicação**

Run: `npm run typecheck` then `npx electron-vite dev --watch --remoteDebuggingPort 9222`.

Na base de desenvolvimento (sem estruturas), abrir Finanças → Demonstrações financeiras e confirmar:
- as 4 estruturas padrão aparecem após o seed, sem loop de recarregamento;
- exercício e período vêm seleccionados e “Gerar” está habilitado;
- gerar mostra a demonstração;
- recarregar a página não cria estruturas duplicadas.

Run: `npx vitest run src/main/services/demonstracoes.service.test.ts src/main/controllers/contabilidade.controller.demonstracoes.test.ts`

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/components/erp/DemonstracoesManager.tsx
git commit -m "fix(financas): seed structures and auto-select exercise in demonstracoes"
```

---

### Task 4: Lançamento — zero linhas e regressão do SearchSelect

**Files:**
- Modify: `src/renderer/src/hooks/useLancamentoDraft.ts:124-136`
- Modify: `src/renderer/src/components/erp/LancamentoContabilEditor.tsx:36-57`, `:231`, `:253-257`
- Modify: `src/renderer/src/components/erp/LinhasEditor.tsx:54-69`, `:148-160`
- Test: `tests/e2e/financas-lancamento.e2e.mts` (novo)

**Interfaces:**
- Consumes: `useLancamentoDraft` (`form`, `fields`, `append`, `remove`, `totais`, `toPayload`); `LinhasEditor` recebe `form`, `fields`, `append`, `remove`, `contas`, `disabled`.
- Produces: `linhas` começa em `[]`; `botoesBloqueados` inclui `fields.length < 2`; nenhuma alteração ao payload ou ao validador do backend.

- [x] **Step 1: Escrever o teste E2E que falha**

Criar `tests/e2e/financas-lancamento.e2e.mts` copiando o arranque de `tests/e2e/ui-formularios.e2e.mts:28-46` e `:151-160` (`electron.launch` com `out/main/index.js`, login `admin`/`senha123`).

Navegação:

```ts
await janela.getByRole("link", { name: "Finanças", exact: true }).click();
await janela.getByTestId("ribbon-tab-contabilistico").click();
await janela.getByRole("button", { name: "Novo", exact: true }).click();
await expect(janela.getByText("Novo lançamento contabilístico")).toBeVisible({ timeout: TIMEOUT });
```

Teste único:

1. `await expect(janela.getByText('Adicione pelo menos duas linhas.')).toBeVisible();`
2. `await expect(janela.getByRole('button', { name: 'Guardar rascunho' })).toBeDisabled();`
3. clicar em “Adicionar linha” duas vezes;
4. `const campo = janela.getByPlaceholder('Escolher conta...').first(); await campo.click();`
5. `const opcao = janela.locator('[data-option-index]').first(); const texto = (await opcao.textContent())?.trim() ?? ''; await opcao.click();`
6. `await expect(campo).toHaveValue(texto);`
7. fechar com “Fechar” — sem gravar.

- [x] **Step 2: Rodar o E2E e confirmar que falha**

Run: `npm run build && npx playwright test tests/e2e/financas-lancamento.e2e.mts`
Expected: FAIL — o texto de estado vazio não existe e/ou “Guardar rascunho” não está desactivado.

- [x] **Step 3: Inicializar `linhas` vazia**

- Em `useLancamentoDraft.ts:133`, trocar a expressão por `linhas: defaults?.linhas ?? []`.
- Em `LancamentoContabilEditor.tsx:55`, trocar `linhas: [linhaVazia(), linhaVazia()]` por `linhas: []`.

O helper `linhaVazia()` local continua existindo para o `append()`.

- [x] **Step 4: Ajustar UI de remoção, estado vazio e botões**

- Em `LinhasEditor.tsx:154`, trocar `disabled={disabled || fields.length <= 2}` por `disabled={disabled}`.
- Em `LinhasEditor.tsx`, entre `erroGeral` (67) e a tabela (69), renderizar quando `fields.length === 0`:

```tsx
<div className="border border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground">
  Adicione pelo menos duas linhas.
</div>
```

Manter o botão “Adicionar linha” existente no cabeçalho (61-64) — não criar um segundo com o mesmo nome.

- Em `LancamentoContabilEditor.tsx:231`, acrescentar `|| fields.length < 2` a `botoesBloqueados`. Assim, “Guardar rascunho” (253) e “Validar” (257) ficam desactivados com menos de 2 linhas.

- [x] **Step 5: Rodar o E2E e confirmar que passa**

Run: `npm run build && npx playwright test tests/e2e/financas-lancamento.e2e.mts`
Expected: PASS — inclui a escolha de conta por clique numa linha adicionada.

Run: `npx vitest run src/main/validators/lancamento-contabil.validator.test.ts src/main/services/lancamento-contabil.service.test.ts`
Expected: PASS — mínimo de 2 linhas continua no backend.

- [x] **Step 6: Commit**

```bash
git add tests/e2e/financas-lancamento.e2e.mts src/renderer/src/hooks/useLancamentoDraft.ts src/renderer/src/components/erp/LancamentoContabilEditor.tsx src/renderer/src/components/erp/LinhasEditor.tsx
git commit -m "feat(financas): open lancamento with zero lines and cover portal select with e2e"
```

---

### Task 5: Verificação final

**Files:**
- Modify: `docs/superpowers/plans/2026-11-26-update-v1-financas.md` (marcar checkboxes e notas)

- [x] **Step 1: Suíte completa de testes**

Run: `npm test`
Expected: PASS, sem novos failures face à baseline. Executar depois do build, nunca em paralelo com ele.

- [x] **Step 2: Typecheck, build e lint**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Run: `npm run lint > C:/Users/HP/AppData/Local/Temp/opencode/financas-lint.txt 2>&1; grep -c ' error ' C:/Users/HP/AppData/Local/Temp/opencode/financas-lint.txt; grep -c ' warning ' C:/Users/HP/AppData/Local/Temp/opencode/financas-lint.txt`
Expected: `31` e `799` — baseline inalterada.

- [x] **Step 3: Verificação visual final**

Na aplicação, confirmar:
- Relatórios gera sem toast de falha de comunicação;
- Demonstração com estruturas, exercício/período pré-seleccionados e dados gerados;
- Novo lançamento abre sem linhas, permite adicionar/remover e escolher conta em qualquer linha.

- [x] **Step 4: Actualizar e commitar o plano**

Todos os passos ficaram marcados como concluídos e as verificações finais estão registadas abaixo.

```bash
git add docs/superpowers/plans/2026-11-26-update-v1-financas.md
git commit -m "docs: close update v1 financas plan"
```

## Resultado

**Commits**
- `4e1c41d` — `fix(financas): validate report filters after injecting session company`
- `b442bc4` — `fix(financas): return full lines from listarEstruturas`
- `d68eb55` — `fix(financas): seed structures and auto-select exercise in demonstracoes`
- `5286dbe` — `feat(financas): open lancamento with zero lines and cover portal select with e2e`

**Verificações**
- `npm test`: 121 ficheiros, 1242 testes OK (baseline 1237 + 5 novos).
- `npm run typecheck`: OK.
- `npm run build`: OK.
- `npm run lint`: 31 erros e 799 warnings — igual à baseline.
- `npx playwright test tests/e2e/financas-lancamento.e2e.mts`: 1 teste OK.

**Verificação visual (electron-vite dev + agent-browser)**
- Finanças → Relatórios: “Gerar” não mostra “Falha ao comunicar com o processo principal.”
- Finanças → Demonstrações financeiras: base vazia gerou as 4 estruturas padrão; exercício 2026 e Período 1 pré-seleccionados; “Visualizar” gerou o Balanço; recarregar manteve 4 estruturas (seed não repetido).
- Finanças → Lançamentos contabilísticos → Novo: sem linhas, “Guardar rascunho” desactivado e “Adicionar linha” disponível.

**Desvio documentado:** o helper `linhaVazia` local de `LancamentoContabilEditor` foi removido porque ficou sem uso após `linhas: []`; o `append()` continua a usar o helper de `useLancamentoDraft`. No E2E, o campo da primeira linha é localizado dentro do `role="dialog"` porque a lista de lançamentos também tem `<tbody>` na página.
