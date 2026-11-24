/**
 * @file rh-crud-funcionario.e2e.ts
 * @description E2E (escrita) do CRUD de funcionário (RH-805): criar, ler a
 * ficha e actualizar. O contrato e o processamento em lote ficam a cargo de
 * `rh-processamento.e2e.ts`; aqui o foco é o ciclo criar → pesquisar → editar
 * → abrir ficha, sempre com um nome único por execução.
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

const NOME = `E2E CRUD RH805 ${Date.now()}`;
const TELEFONE = "912345678";

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

test.describe("RH-805: CRUD de funcionário", () => {
  test("cria, pesquisa, actualiza e abre a ficha do funcionário", async () => {
    await abrirSubTab("funcionarios");
    await expect(
      janela.getByRole("heading", { level: 2, name: "Funcionários", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // ── Criar ──────────────────────────────────────────────────────────────
    await janela.getByRole("button", { name: /novo funcionário/i }).click();

    const dialogo = janela.getByRole("dialog");
    await expect(
      dialogo.getByRole("heading", { name: "Novo Funcionário", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Os campos deste formulário usam <Label> sem htmlFor — o selector por
    // XPath (label → input irmão) evita depender da ordem dos inputs.
    await dialogo
      .locator('xpath=.//label[contains(normalize-space(.), "Nome")]/following-sibling::input[1]')
      .fill(NOME);
    await dialogo
      .locator(
        'xpath=.//label[contains(normalize-space(.), "Data de Admissão")]/following-sibling::input[1]'
      )
      .fill("2024-01-15");

    await dialogo.getByRole("button", { name: "Registar", exact: true }).click();
    await expect(janela.getByText(/Funcionário criado:/)).toBeVisible({ timeout: TIMEOUT });
    await expect(dialogo).toBeHidden({ timeout: TIMEOUT });

    // ── Ler (pesquisa na grelha) ───────────────────────────────────────────
    const pesquisa = janela.getByPlaceholder("Código, nome, NIF, BI ou email...");
    await pesquisa.fill(NOME);
    await pesquisa.press("Enter");

    const linha = janela.locator("table tbody tr", { hasText: NOME });
    await expect(linha.first()).toBeVisible({ timeout: TIMEOUT });

    // ── Actualizar ─────────────────────────────────────────────────────────
    await linha.first().getByRole("button", { name: "Editar", exact: true }).click();
    await expect(
      dialogo.getByRole("heading", { name: "Editar Funcionário", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    const campoTelefone = dialogo.locator(
      'xpath=.//label[contains(normalize-space(.), "Telefone")]/following-sibling::input[1]'
    );
    await campoTelefone.fill(TELEFONE);
    await dialogo.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(janela.getByText(/Funcionário atualizado/)).toBeVisible({ timeout: TIMEOUT });
    await expect(dialogo).toBeHidden({ timeout: TIMEOUT });

    // Reabrir prova que o valor ficou gravado (e não só no estado do formulário).
    await linha.first().getByRole("button", { name: "Editar", exact: true }).click();
    await expect(
      dialogo.getByRole("heading", { name: "Editar Funcionário", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(
      dialogo.locator(
        'xpath=.//label[contains(normalize-space(.), "Telefone")]/following-sibling::input[1]'
      )
    ).toHaveValue(TELEFONE);
    await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialogo).toBeHidden({ timeout: TIMEOUT });

    // ── Ler a ficha ────────────────────────────────────────────────────────
    await linha.first().getByRole("button", { name: "Abrir ficha", exact: true }).click();
    await expect(
      janela.getByRole("heading", { name: "Ficha do Funcionário", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText(NOME, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUT,
    });

    await janela.keyboard.press("Escape");
    await expect(
      janela.getByRole("heading", { name: "Ficha do Funcionário", exact: true })
    ).toBeHidden({ timeout: TIMEOUT });
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
