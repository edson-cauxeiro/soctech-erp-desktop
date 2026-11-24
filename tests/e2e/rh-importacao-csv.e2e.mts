/**
 * @file rh-importacao-csv.e2e.ts
 * @description E2E (escrita) da importação CSV de funcionários (RH-208/RH-805):
 * abre o diálogo, pré-visualiza um ficheiro real e importa duas linhas válidas.
 *
 * O diálogo nativo de ficheiros (`dialog.showOpenDialog`) é substituído no
 * processo principal por um stub que devolve um CSV temporário — é a única
 * forma de automatizar este fluxo sem interacção humana.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, "../../out/main/index.js");

const ADMIN = { login: "admin", senha: "senha123" };
const TIMEOUT = 30_000;

const TS = Date.now();
const NOME_A = `E2E Import A ${TS}`;
const NOME_B = `E2E Import B ${TS}`;
const CAMINHO_CSV = join(tmpdir(), `rh-importacao-e2e-${TS}.csv`);
const CONTEUDO_CSV = [
  "Nome,Data de admissão,Email",
  `${NOME_A},2026-03-02,e2e.a.${TS}@teste.local`,
  `${NOME_B},2026-03-02,e2e.b.${TS}@teste.local`,
].join("\n");

let app: ElectronApplication;
let janela: Page;

test.beforeAll(async () => {
  writeFileSync(CAMINHO_CSV, CONTEUDO_CSV, "utf8");

  app = await electron.launch({ args: [MAIN_BUILD] });
  janela = await app.firstWindow();
  await janela.waitForLoadState("domcontentloaded");
  await autenticar(janela);

  // Substitui o diálogo nativo do main pelos ficheiros do teste.
  await app.evaluate(({ dialog }, caminho) => {
    const dialogComStub = dialog as unknown as {
      showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
    };
    dialogComStub.showOpenDialog = async () => ({ canceled: false, filePaths: [caminho] });
  }, CAMINHO_CSV);

  await abrirRh();
});

test.afterAll(async () => {
  await app?.close();
});

test.describe("RH-805: importação CSV de funcionários", () => {
  test("pré-visualiza e importa um CSV com duas linhas válidas", async () => {
    await abrirSubTab("funcionarios");
    await expect(
      janela.getByRole("heading", { level: 2, name: "Funcionários", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    await janela.getByRole("button", { name: /importar csv/i }).click();

    const dialogo = janela.getByRole("dialog");
    await expect(
      dialogo.getByText("Importar CSV", { exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(
      dialogo.getByRole("button", { name: "Funcionários", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Seleccionar o CSV (o stub do main devolve o ficheiro temporário) e
    // aguardar a pré-visualização calculada no serviço de importação.
    await dialogo.getByRole("button", { name: /selecionar ficheiro csv/i }).click();
    await expect(dialogo.getByText(/2 linha\(s\)/).first()).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(dialogo.getByText(/2 válida\(s\)/).first()).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(
      dialogo.getByRole("columnheader", { name: "Registo", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    await dialogo.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(janela.getByText(/Importação concluída: 2 registo/)).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(
      dialogo.getByText(/2 registo\(s\) importado\(s\) em Funcionários/)
    ).toBeVisible({ timeout: TIMEOUT });

    await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(dialogo).toBeHidden({ timeout: TIMEOUT });

    // As duas linhas devem estar pesquisáveis na grelha de funcionários.
    const pesquisa = janela.getByPlaceholder("Código, nome, NIF, BI ou email...");
    for (const nome of [NOME_A, NOME_B]) {
      await pesquisa.fill(nome);
      await pesquisa.press("Enter");
      await expect(janela.locator("table tbody tr", { hasText: nome }).first()).toBeVisible({
        timeout: TIMEOUT,
      });
    }
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
