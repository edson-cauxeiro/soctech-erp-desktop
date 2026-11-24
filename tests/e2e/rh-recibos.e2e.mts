/**
 * @file rh-recibos.e2e.ts
 * @description E2E (escrita) do fluxo de recibos (RH-805): abrir a grelha,
 * escolher um recibo emitido e imprimir — o clique em "Ver" gera o PDF e
 * regista a impressão no servidor. O teste confirma o incremento do contador
 * de impressões depois de recarregar a grelha.
 *
 * Depende de existirem recibos no dev DB; se não existirem o teste é saltado
 * (a emissão de recibos é coberta por `rh-processamento.e2e.ts`).
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

test.describe("RH-805: fluxo de recibos", () => {
  test("imprimir um recibo registra a impressão no servidor", async () => {
    await abrirSubTab("recibos");
    await expect(janela.getByTestId("rh-recibos")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText("A carregar recibos…")).toBeHidden({ timeout: TIMEOUT });

    if (await janela.getByText("Sem recibos", { exact: true }).isVisible()) {
      test.skip(true, "Não existem recibos no dev DB — emissão coberta por rh-processamento.e2e.ts.");
      return;
    }

    await expect(
      janela.getByRole("columnheader", { name: "Recibo", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(
      janela.getByRole("columnheader", { name: "Impressões", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Só recibos emitidos podem ser impressos (os anulados têm o botão inactivo).
    const linha = janela.locator("table tbody tr", { hasText: "Emitido" }).first();
    await expect(linha).toBeVisible({ timeout: TIMEOUT });

    const codigo = ((await linha.locator("td").nth(0).textContent()) ?? "").trim();
    expect(codigo).not.toBe("");
    const impressoesAntes = Number(
      ((await linha.locator("td").nth(8).textContent()) ?? "").trim() || "0"
    );

    await linha.getByRole("button", { name: "Ver", exact: true }).click();

    // `registarImpressao` é disparado em background logo após gerar o PDF.
    await janela.waitForTimeout(2_000);

    let impressoesDepois = impressoesAntes;
    for (let tentativa = 0; tentativa < 3 && impressoesDepois <= impressoesAntes; tentativa++) {
      await janela.getByRole("button", { name: "Actualizar", exact: true }).click();
      await expect(janela.getByText("A carregar recibos…")).toBeHidden({ timeout: TIMEOUT });

      const linhaDepois = janela.locator("table tbody tr", { hasText: codigo }).first();
      impressoesDepois = Number(
        ((await linhaDepois.locator("td").nth(8).textContent()) ?? "").trim() || "0"
      );
    }

    expect(impressoesDepois).toBeGreaterThan(impressoesAntes);
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
