/**
 * @file rh-regressao-config.e2e.ts
 * @description E2E (read-only) de regressão do ribbon de RH (RH-805):
 * separadores "Capital Humano" e "Obrigações Declarativas" (placeholders de
 * fases futuras), "Configuração" (as cinco sub-abas) e "Auditoria".
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

test.describe("RH-805: regressão read-only de Capital Humano, Declarativas, Configuração e Auditoria", () => {
  test("Capital Humano mostra o placeholder de fase futura", async () => {
    await abrirSubTab("capital");

    await expect(
      janela.getByRole("heading", { level: 2, name: "Capital Humano", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText(/em construção/)).toBeVisible({ timeout: TIMEOUT });
  });

  test("Obrigações Declarativas mostra o placeholder de fase futura", async () => {
    await abrirSubTab("declarativas");

    await expect(
      janela.getByRole("heading", { level: 2, name: "Obrigações Declarativas", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText(/em construção/)).toBeVisible({ timeout: TIMEOUT });
  });

  test("Configuração percorre as cinco sub-abas", async () => {
    await abrirSubTab("configuracao");

    // Rubricas (sub-aba por omissão)
    await expect(
      janela.getByRole("columnheader", { name: "Descrição", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Períodos
    await janela.getByRole("button", { name: "Períodos", exact: true }).click();
    await expect(janela.getByRole("button", { name: "Gerar P01–P12" })).toBeVisible({
      timeout: TIMEOUT,
    });

    // Parâmetros e IRT
    await janela.getByRole("button", { name: "Parâmetros e IRT", exact: true }).click();
    await expect(
      janela.getByRole("columnheader", { name: "Chave", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Departamentos e Cargos
    await janela.getByRole("button", { name: "Departamentos e Cargos", exact: true }).click();
    await expect(janela.getByText(/Registados/).first()).toBeVisible({ timeout: TIMEOUT });

    // Padrões
    await janela.getByRole("button", { name: "Padrões", exact: true }).click();
    await expect(
      janela.getByRole("heading", { name: "Subsídios e Padrões de Cálculo", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test("Auditoria abre com as abas e os filtros carregados", async () => {
    await abrirSubTab("auditoria");

    await expect(janela.getByRole("tab", { name: "Por Funcionário" })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByRole("tab", { name: "Por Processamento" })).toBeVisible({
      timeout: TIMEOUT,
    });
    const abaGeral = janela.getByRole("tab", { name: "Geral", exact: true });
    await expect(abaGeral).toBeVisible({ timeout: TIMEOUT });

    await expect(janela.getByRole("button", { name: /^actualizar$/i })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByRole("button", { name: "Exportar CSV" })).toBeVisible({
      timeout: TIMEOUT,
    });

    // Mudar de aba prova que o componente reage ao filtro activo.
    await abaGeral.click();
    await expect(abaGeral).toHaveAttribute("aria-selected", "true");
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
