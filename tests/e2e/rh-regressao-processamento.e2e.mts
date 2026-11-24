/**
 * @file rh-regressao-processamento.e2e.ts
 * @description E2E (read-only) de regressão do ribbon de RH — grupo
 * "Processamento Salarial" (RH-805): Salários e Honorários, Simulação e
 * Processamentos abrem com as grelhas/controlos carregados.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, "../../out/main/index.js");

const ADMIN = { login: "admin", senha: "senha123" };
const TIMEOUT = 30_000;

let app: ElectronApplication;
let janela: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: [MAIN_BUILD] });
  janela = await app.firstWindow();
  await janela.waitForLoadState("domcontentloaded");
  await autenticar(janela);
  await abrirRh();
});

test.afterAll(async () => {
  await app?.close();
});

test.describe("RH-805: regressão read-only do Processamento Salarial", () => {
  test("Salários e Honorários abre o ecrã de processamento", async () => {
    await abrirSubTab("salarios");

    await expect(janela.getByTestId("rh-processamento")).toBeVisible({ timeout: TIMEOUT });
    // Toolbar com operação e botão de actualização — prova que o ecrã carregou.
    await expect(janela.locator("#operacao")).toBeVisible({ timeout: TIMEOUT });
    // O nome acessível inclui o atalho de teclado ("Actualizar Alt+A").
    await expect(janela.getByRole("button", { name: /^actualizar/i }).first()).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(
      janela.getByRole("button", { name: /^(processar|anular)/i }).first()
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("Simulação abre em modo não gravar", async () => {
    await abrirSubTab("simulacao");

    await expect(janela.getByTestId("rh-processamento")).toBeVisible({ timeout: TIMEOUT });
    // Em modo simulação o botão principal é "Simular" (não "Processar") e a
    // exportação CSV está disponível. O badge lateral confirma o modo.
    await expect(janela.getByRole("button", { name: /^simular/i })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByRole("button", { name: "Exportar CSV" })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByText("Simulação", { exact: true }).first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("Processamentos lista o histórico de processamentos", async () => {
    await abrirSubTab("processamentos");

    await expect(janela.getByTestId("rh-processamentos-historico")).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(
      janela
        .getByRole("columnheader", { name: "Recibo", exact: true })
        .or(janela.getByText("Sem processamentos", { exact: true }))
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(
      janela.getByRole("button", { name: /^actualizar/i }).first()
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

// ============================================================================
// Helpers de navegação
// ============================================================================

async function autenticar(pagina: Page): Promise<void> {
  await expect(pagina.locator("#utilizador")).toBeVisible({ timeout: TIMEOUT });
  await pagina.locator("#utilizador").fill(ADMIN.login);
  await pagina.locator("#senha").fill(ADMIN.senha);
  await pagina.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(pagina.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({
    timeout: TIMEOUT,
  });
}

async function abrirRh(): Promise<void> {
  await janela.getByRole("link", { name: "Recursos Humanos", exact: true }).click();
  await expect(
    janela.getByRole("heading", { level: 1, name: "Recursos Humanos", exact: true })
  ).toBeVisible({ timeout: TIMEOUT });
}

async function abrirSubTab(tabKey: string): Promise<void> {
  await janela.getByTestId(`ribbon-tab-${tabKey}`).click();
}
