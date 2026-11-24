/**
 * @file rh-ausencias.e2e.ts
 * @description E2E (escrita) do fluxo de ausências (RH-805): criar uma
 * ausência para um funcionário existente, confirmar o toast de sucesso e
 * encontrá-la na grelha depois de filtrar pelo funcionário escolhido.
 *
 * Os dados de teste são únicos por execução (nome/observação com timestamp)
 * para não colidir com registos de execuções anteriores.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, "../../out/main/index.js");

const ADMIN = { login: "admin", senha: "senha123" };
const TIMEOUT = 30_000;

const DIA_MS = 86_400_000;

/** Próximo dia útil (segunda a sexta) a partir de um instante. */
function proximoDiaUtil(base: number): Date {
  const dia = new Date(base);
  while (dia.getDay() === 0 || dia.getDay() === 6) dia.setDate(dia.getDate() + 1);
  return dia;
}

/** Data local no formato `yyyy-MM-dd` (o que `<input type="date">` espera). */
function iso(dia: Date): string {
  const mes = String(dia.getMonth() + 1).padStart(2, "0");
  const diaMes = String(dia.getDate()).padStart(2, "0");
  return `${dia.getFullYear()}-${mes}-${diaMes}`;
}

const INICIO = proximoDiaUtil(Date.now() + 21 * DIA_MS);
const FIM = new Date(INICIO);
FIM.setDate(FIM.getDate() + 4);
const DIAS = "5";

/** Funcionário próprio do teste — o dev DB pode não ter nenhum. */
const NOME_FUNCIONARIO = `E2E Ausência Funcionário ${Date.now()}`;

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

test.describe("RH-805: fluxo de ausências", () => {
  test("cria uma ausência e encontra-a na grelha filtrada", async () => {
    await garantirFuncionario(janela, NOME_FUNCIONARIO);
    await abrirSubTab("ausencias");
    await expect(janela.getByTestId("rh-ausencias")).toBeVisible({ timeout: TIMEOUT });

    await janela.getByRole("button", { name: /nova ausência/i }).click();
    const dialogo = janela.getByRole("dialog");
    await expect(
      dialogo.getByRole("heading", { name: "Nova Ausência", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Funcionário criado no início — guarda o rótulo (código - nome) para
    // voltar a filtrar pela mesma pessoa.
    await campoCombobox(dialogo, "Funcionário").click();
    const opcaoFuncionario = janela
      .getByRole("option")
      .filter({ hasText: NOME_FUNCIONARIO })
      .first();
    await expect(opcaoFuncionario).toBeVisible({ timeout: TIMEOUT });
    const rotuloFuncionario = ((await opcaoFuncionario.textContent()) ?? "").trim();
    expect(rotuloFuncionario).not.toBe("");
    await opcaoFuncionario.click();

    // Tipo de ausência (tipos de sistema semeados em RH-105).
    await campoCombobox(dialogo, "Tipo de Ausência").click();
    await janela.getByRole("option").first().click();

    await campoInput(dialogo, "Data Início").fill(iso(INICIO));
    await campoInput(dialogo, "Data Fim").fill(iso(FIM));
    await campoInput(dialogo, "Dias").fill(DIAS);

    await dialogo.getByRole("button", { name: "Criar", exact: true }).click();
    await expect(janela.getByText(/Ausência criada/)).toBeVisible({ timeout: TIMEOUT });
    await expect(dialogo).toBeHidden({ timeout: TIMEOUT });

    // Filtrar pelo funcionário utilizado e confirmar a linha na grelha.
    await janela.locator("#aus-funcionario").click();
    await janela.getByRole("option", { name: rotuloFuncionario, exact: true }).click();

    const linha = janela.locator("table tbody tr", { hasText: rotuloFuncionario });
    await expect(linha.first()).toBeVisible({ timeout: TIMEOUT });
    await expect(linha.first()).toContainText(DIAS.replace(".", ","));
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

/**
 * Os formulários shadcn/Radix não expõem nome acessível nos `SelectTrigger`
 * (o `FormLabel` não chega ao `button`), pelo que se localiza o controlo pelo
 * `<label>` irmão/antecedente em vez de `getByLabel`.
 */
function campoCombobox(dialogo: Locator, rotulo: string) {
  return dialogo.locator(
    `xpath=.//label[contains(normalize-space(.), "${rotulo}")]/following::*[@role="combobox"][1]`
  );
}

function campoInput(dialogo: Locator, rotulo: string) {
  return dialogo.locator(
    `xpath=.//label[contains(normalize-space(.), "${rotulo}")]/following::input[1]`
  );
}

/**
 * Cria um funcionário descartável para o teste. Os campos do diálogo de
 * funcionários não têm `htmlFor`/`id`, pelo que se usa o XPath label → input.
 */
async function garantirFuncionario(pagina: Page, nome: string): Promise<void> {
  await abrirSubTab("funcionarios");
  await expect(
    pagina.getByRole("heading", { level: 2, name: "Funcionários", exact: true })
  ).toBeVisible({ timeout: TIMEOUT });

  await pagina.getByRole("button", { name: /novo funcionário/i }).click();
  const dialogo = pagina.getByRole("dialog");
  await expect(
    dialogo.getByRole("heading", { name: "Novo Funcionário", exact: true })
  ).toBeVisible({ timeout: TIMEOUT });

  await dialogo
    .locator('xpath=.//label[contains(normalize-space(.), "Nome")]/following-sibling::input[1]')
    .fill(nome);
  await dialogo
    .locator(
      'xpath=.//label[contains(normalize-space(.), "Data de Admissão")]/following-sibling::input[1]'
    )
    .fill("2024-01-15");
  await dialogo.getByRole("button", { name: "Registar", exact: true }).click();
  await expect(pagina.getByText(/Funcionário criado:/)).toBeVisible({ timeout: TIMEOUT });
  await expect(dialogo).toBeHidden({ timeout: TIMEOUT });
}
