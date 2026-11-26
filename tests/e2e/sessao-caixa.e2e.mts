/**
 * @file sessao-caixa.e2e.ts
 * @description Regressão E2E para a página de sessões de caixa (`TEST-14`).
 *
 * Este ecrã chegou ao renderer com JSX partido — tags fechadas com `</div >`,
 * um array solto a servir de filho de JSX, um `=` em vez de `=>` e um
 * `SearchSelect` a receber a *string* do template em vez das opções. Nada
 * disto falhava o typecheck do resto do projecto porque o ficheiro é o único
 * que ninguém abria durante o desenvolvimento.
 *
 * O teste existe para que a próxima vez que alguém reescrever este ecrã sem o
 * abrir, a suite o apanhe.
 */

import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, "../../out/main/index.js");

/** Contas do `prisma/seed.ts`. */
const ADMIN = { login: "admin", senha: "senha123" };

const TIMEOUT = 20_000;

async function abrirPaginaCaixa(): Promise<void> {
  await janela.locator("#utilizador").fill(ADMIN.login);
  await janela.getByPlaceholder("••••••••").fill(ADMIN.senha);
  await janela.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(janela.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({ timeout: TIMEOUT });
  await janela.getByRole("link", { name: /comercial/i }).first().click();
  await janela.getByRole("button", { name: /abertura de caixa/i }).click();
}

let app: ElectronApplication;
let janela: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: [MAIN_BUILD] });
  janela = await app.firstWindow();
  await janela.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
});

test.beforeEach(async () => {
  // A sessão vive no processo main: sem terminar sessão, o ecrã de login
  // nunca aparece e o `fill` expira.
  const gatilho = janela.getByTestId("perfil-menu-trigger");
  if (await gatilho.isVisible().catch(() => false)) {
    await gatilho.click();
    await janela.getByTestId("perfil-menu-sair").click();
  }
  await expect(janela.locator("#utilizador")).toBeVisible({ timeout: TIMEOUT });
});

test("a página de sessões de caixa abre em Comercial", async () => {
  await janela.locator("#utilizador").fill(ADMIN.login);
  await janela.getByPlaceholder("••••••••").fill(ADMIN.senha);
  await janela.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(janela.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({ timeout: TIMEOUT });

  await janela.getByRole("link", { name: /comercial/i }).first().click();
  await janela.getByRole("button", { name: /abertura de caixa/i }).click();

  // Os três cartões de topo e a tabela de histórico são o que o ecrã tinha
  // de pintar. Um ecrã em branco por JSX partido não os produz.
  await expect(janela.getByText(/caixas registadas/i)).toBeVisible({ timeout: TIMEOUT });
  // Exacto: o heading "Sessões abertas agora" tem o mesmo prefixo e o
  // `getByText` com regex falha em strict mode quando ambos estão no ecrã.
  await expect(janela.getByText("Sessões abertas", { exact: true })).toBeVisible();
  await expect(janela.getByText(/caixas disponíveis/i)).toBeVisible();
  await expect(janela.getByRole("heading", { name: /abrir sessão de caixa/i })).toBeVisible();
  await expect(janela.getByRole("heading", { name: /hist[oó]rico de sessões/i })).toBeVisible();

  // O histórico tem de renderizar uma linha por sessão ou o texto de vazio.
  // Sem isto, um `map()` sobre `undefined` voltaria a passar: o cabeçalho
  // desenhava-se na mesma.
  const corpoHistorico = janela.locator("table tbody");
  await expect(corpoHistorico).toBeVisible();
  const linhas = await corpoHistorico.locator("tr").count();
  const vazio = await janela.getByText(/ainda não há sessões registadas/i).isVisible().catch(() => false);
  expect(linhas > 0 || vazio).toBe(true);
});

test("a tab Contas não volta a mostrar as sessões de caixa", async () => {
  await janela.locator("#utilizador").fill(ADMIN.login);
  await janela.getByPlaceholder("••••••••").fill(ADMIN.senha);
  await janela.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(janela.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({ timeout: TIMEOUT });

  await janela.getByRole("link", { name: "Finanças", exact: true }).click();
  await janela.getByRole("button", { name: /^contas$/i }).click();

  // A lista de contas existe — a tabela é a âncora, não um heading: este
  // ecrã não tem cabeçalho próprio. O painel de sessões de caixa vive só na
  // tab "Abertura de Caixa". Tinha duas cópias, e a mesma correcção de bug ia
  // ter de ser aplicada às duas.
  await expect(janela.getByRole("button", { name: "Contas", exact: true })).toBeVisible();
  await expect(janela.getByRole("table")).toBeVisible({ timeout: TIMEOUT });
  await expect(janela.getByRole("heading", { name: /sessões de caixa/i })).toHaveCount(0);
});

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

  // O contexto do preload congela `window.api`, pelo que o stub tem de ser
  // feito no handler do processo principal. Guardamos o original para o
  // repor antes de testar o botão "Tentar novamente".
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
  await expect(janela.getByText("Saldo em caixa")).toBeVisible({ timeout: TIMEOUT });
  const primeiro = await janela.getByText(/^Arqueação:/).innerText();

  await linhas.nth(1).click();

  await expect(janela.getByText(/^Arqueação:/)).not.toHaveText(primeiro);
  await expect(janela.getByText("A carregar apuramento…")).toBeHidden();
});
