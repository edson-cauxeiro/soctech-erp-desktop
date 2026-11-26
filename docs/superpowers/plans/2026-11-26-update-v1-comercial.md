# Update v1 — Comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fazer o painel de Arqueação mostrar o apuramento de qualquer sessão seleccionada e permitir o fecho das sessões abertas.

**Architecture:** Correcção cirúrgica no renderer: `handleSelecionar` passa a carregar o apuramento independentemente do estado da sessão, com estados explícitos de erro/dados/carregamento. O backend já devolve totais congelados para sessões fechadas e não muda.

**Tech Stack:** React + TypeScript (renderer), Electron IPC, Playwright E2E, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-update-v1-comercial-design.md`

## Global Constraints

- Comunicar sempre em português.
- Não alterar `D "docs/1 - Tela.png"` nem `?? docs/updates/`.
- Não alterar contrato IPC, validators, serviço de sessões, esquema Prisma nem DTOs.
- Botão "Fechar caixa" continua visível apenas quando `sessaoActiva.estado === 'aberta'`.
- E2E de regressão é só de leitura: não abrir nem fechar sessões reais.
- Baseline: 1245 testes Vitest; `npm run lint` com 31 erros e 799 warnings.

## Review Focus

- Sessão fechada com diferença: teste E2E `mostra o apuramento de uma sessão fechada do histórico` exige "Saldo em caixa" e ausência do spinner.
- Sessão fechada não pode ser fechada: o mesmo teste exige que "Fechar caixa" não apareça.
- Falha no IPC: teste E2E `mostra erro e permite repetir o apuramento` stuba o handler IPC `tesouraria:sessoes:apurar` no processo principal (o `window.api` do preload é congelado), exige a mensagem e recupera após "Tentar novamente".
- Alternância entre sessões: teste E2E `troca de apuramento ao seleccionar outra sessão` exige que o heading mude e o spinner não reapareça.
- Sessão com zero movimentos: o primeiro teste usa a primeira linha real do histórico (0 movimentos) e exige os quatro cartões numéricos.

---

### Task 1: Carregar apuramento para qualquer sessão

**Files:**
- Modify: `src/renderer/src/components/erp/SessaoCaixaManager.tsx:145-168`
- Modify: `src/renderer/src/components/erp/SessaoCaixaManager.tsx:335-388`
- Test: `tests/e2e/sessao-caixa.e2e.mts`

**Interfaces:**
- Consumes: `tesourariaApi.apurarSessao(id: string): Promise<IpcResponse<ApuramentoSessaoDto>>`, `SessaoCaixaDto`, `ApuramentoSessaoDto`.
- Produces: `carregarApuramento(sessao: SessaoCaixaDto): Promise<void>` (helper local), estado `erroApuramento: string | null`, `data-testid="erro-apuramento"` e `data-testid="tentar-apuramento"`.

- [x] **Step 1: Escrever os testes E2E de regressão (vermelhos)**

Em `tests/e2e/sessao-caixa.e2e.mts`, acrescentar um helper ao lado dos existentes e três testes:

```ts
async function abrirPaginaCaixa(): Promise<void> {
  await janela.locator("#utilizador").fill(ADMIN.login);
  await janela.getByPlaceholder("••••••••").fill(ADMIN.senha);
  await janela.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(janela.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({ timeout: TIMEOUT });
  await janela.getByRole("link", { name: /comercial/i }).first().click();
  await janela.getByRole("button", { name: /abertura de caixa/i }).click();
}

test("mostra o apuramento de uma sessão fechada do histórico", async () => {
  await abrirPaginaCaixa();
  await janela.locator("table tbody tr").first().click();
  await expect(janela.getByText(/^Arqueação:/)).toBeVisible({ timeout: TIMEOUT });
  await expect(janela.getByText("Saldo em caixa")).toBeVisible({ timeout: TIMEOUT });
  await expect(janela.getByText("A carregar apuramento…")).toBeHidden();
  await expect(janela.getByRole("button", { name: /fechar caixa/i })).toHaveCount(0);
});

test("mostra erro e permite repetir o apuramento", async () => {
  await abrirPaginaCaixa();
  await app.evaluate(async ({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("tesouraria:sessoes:apurar");
    (globalThis as any).__apurarOriginal = original;
    ipcMain.removeHandler("tesouraria:sessoes:apurar");
    ipcMain.handle("tesouraria:sessoes:apurar", async () => ({
      success: false,
      error: { code: "TESTE", message: "Falha simulada no apuramento" },
    }));
  });
  let restaurado = false;
  const restaurar = async (): Promise<void> => {
    if (restaurado) return;
    await app.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler("tesouraria:sessoes:apurar");
      ipcMain.handle("tesouraria:sessoes:apurar", (globalThis as any).__apurarOriginal);
    });
    restaurado = true;
  };
  try {
    await janela.locator("table tbody tr").first().click();
    await expect(janela.getByTestId("erro-apuramento")).toContainText(
      "Falha simulada no apuramento",
      { timeout: TIMEOUT }
    );
    await restaurar();
    await janela.getByTestId("tentar-apuramento").click();
    await expect(janela.getByText("Saldo em caixa")).toBeVisible({ timeout: TIMEOUT });
  } finally {
    await restaurar();
  }
});

test("troca de apuramento ao seleccionar outra sessão", async () => {
  await abrirPaginaCaixa();
  const linhas = janela.locator("table tbody tr");
  await linhas.nth(0).click();
  const primeiro = await janela.getByText(/^Arqueação:/).innerText();
  await linhas.nth(1).click();
  await expect(janela.getByText(/^Arqueação:/)).not.toHaveText(primeiro);
  await expect(janela.getByText("A carregar apuramento…")).toBeHidden();
});
```

- [x] **Step 2: Confirmar que os testes falham**

Run: `npx playwright test tests/e2e/sessao-caixa.e2e.mts -g "apuramento" --reporter=line`
Expected: FAIL — "Saldo em caixa" não aparece; fica "A carregar apuramento…".

- [x] **Step 3: Implementar o helper e os estados no renderer**

Em `SessaoCaixaManager.tsx`:
- adicionar `const [erroApuramento, setErroApuramento] = useState<string | null>(null);`;
- definir `const carregarApuramento = async (sessao: SessaoCaixaDto): Promise<void> => { ... }` que limpa ambos os estados, chama `tesourariaApi.apurarSessao(sessao.id)` e preenche `apuramento` em sucesso ou `erroApuramento` com `res.error.message` / mensagem genérica de comunicação em falha;
- `handleSelecionar` chama o helper sem testar `estado`;
- `handleActualizar` usa o mesmo helper e mantém `fetchSessoes()`;
- no painel, renderizar por ordem: `erroApuramento` (com `data-testid="erro-apuramento"`, mensagem e botão `data-testid="tentar-apuramento"` que chama `handleActualizar`), depois `apuramento`, por fim o spinner actual.

- [x] **Step 4: Confirmar que os testes passam**

Run: `npx playwright test tests/e2e/sessao-caixa.e2e.mts --reporter=line`
Expected: PASS — todos os testes do ficheiro, incluindo os três novos.

Run: `npm run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/components/erp/SessaoCaixaManager.tsx tests/e2e/sessao-caixa.e2e.mts
git commit -m "fix(comercial): load cash session count for closed sessions"
```

### Task 2: Verificação final

**Files:**
- Modify: `docs/superpowers/plans/2026-11-26-update-v1-comercial.md`

- [ ] **Step 1: Correr a suíte completa**

Run: `npm test`
Expected: 1245 testes OK.

- [ ] **Step 2: Correr typecheck, build e lint**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Run: `npm run lint`
Expected: 31 erros e 799 warnings (baseline inalterada).

- [ ] **Step 3: Fechar o plano**

Marcar todos os checkboxes como `[x]` e acrescentar `## Resultado` com os commits, os comandos e o resultado da E2E. Commitar com `docs: close update v1 comercial plan`.
