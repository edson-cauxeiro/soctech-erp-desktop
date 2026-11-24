/**
 * @file rh-regressao-recibos.e2e.ts
 * @description E2E (read-only) de regressão do ribbon de RH — grupo
 * "Recibos e Pagamentos" (RH-805): Recibos e Pagamentos abrem com as
 * grelhas e os filtros carregados.
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

test.describe("RH-805: regressão read-only de Recibos e Pagamentos", () => {
  test("Recibos abre com a grelha e os filtros carregados", async () => {
    await abrirSubTab("recibos");

    await expect(janela.getByTestId("rh-recibos")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByPlaceholder("Código, nome ou número recibo…")).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.locator("#rec-estado")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByRole("button", { name: /^actualizar/i }).first()).toBeVisible({
      timeout: TIMEOUT,
    });
    // Sem recibos no dev DB a grelha mostra o estado vazio (não há `<thead>`).
    await expect(
      janela
        .getByRole("columnheader", { name: "Recibo", exact: true })
        .or(janela.getByText("Sem recibos", { exact: true }))
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("Pagamentos abre com as ordens e os pagamentos carregados", async () => {
    await abrirSubTab("pagamentos");

    const painel = janela.getByTestId("rh-pagamentos");
    await expect(painel).toBeVisible({ timeout: TIMEOUT });
    await expect(
      painel.getByRole("button", { name: "Ordens de Pagamento", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    await expect(
      painel
        .getByRole("columnheader", { name: "Banco", exact: true })
        .or(painel.getByText("Sem ordens de pagamento", { exact: true }))
    ).toBeVisible({ timeout: TIMEOUT });

    // A segunda aba também carrega (grelha ou estado vazio).
    await painel.getByRole("button", { name: "Pagamentos", exact: true }).click();
    await expect(
      painel
        .getByRole("columnheader", { name: "Processamento", exact: true })
        .or(painel.getByText("Sem pagamentos", { exact: true }))
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
