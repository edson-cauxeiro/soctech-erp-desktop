/**
 * @file rh-ferias.e2e.ts
 * @description E2E (escrita) do fluxo de marcações de férias (RH-805): criar
 * uma marcação para um funcionário existente, confirmar o toast de sucesso e
 * encontrá-la na grelha depois de filtrar pelo ano.
 *
 * A observação leva um marcador único por execução, o que permite localizar a
 * linha sem depender do formato das datas nem da ordenação da grelha.
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

const INICIO = proximoDiaUtil(Date.now() + 100 * DIA_MS);
const FIM = new Date(INICIO);
FIM.setDate(FIM.getDate() + 4);
const ANO = String(INICIO.getFullYear());
const DIAS = "5";
const MARCADOR = `E2E RH805 Férias ${Date.now()}`;

/** Funcionário próprio do teste — o dev DB pode não ter nenhum. */
const NOME_FUNCIONARIO = `E2E Férias Funcionário ${Date.now()}`;

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

test.describe("RH-805: fluxo de marcações de férias", () => {
  test("cria uma marcação e encontra-a na grelha filtrada pelo ano", async () => {
    await garantirFuncionario(janela, NOME_FUNCIONARIO);
    await abrirSubTab("ferias");
    await expect(janela.getByTestId("rh-ferias")).toBeVisible({ timeout: TIMEOUT });

    await janela.getByRole("button", { name: /nova marcação/i }).click();
    const dialogo = janela.getByRole("dialog");
    await expect(
      dialogo.getByRole("heading", { name: "Nova Marcação de Férias", exact: true })
    ).toBeVisible({ timeout: TIMEOUT });

    // Funcionário criado no início do teste.
    await campoCombobox(dialogo, "Funcionário").click();
    const opcaoFuncionario = janela
      .getByRole("option")
      .filter({ hasText: NOME_FUNCIONARIO })
      .first();
    await expect(opcaoFuncionario).toBeVisible({ timeout: TIMEOUT });
    await opcaoFuncionario.click();

    await campoInput(dialogo, "Ano").fill(ANO);
    await campoInput(dialogo, "Data Início").fill(iso(INICIO));
    await campoInput(dialogo, "Data Fim").fill(iso(FIM));
    await campoInput(dialogo, "Dias").fill(DIAS);
    await campoInput(dialogo, "Observação").fill(MARCADOR);

    await dialogo.getByRole("button", { name: "Criar", exact: true }).click();
    await expect(janela.getByText(/Marcação criada/)).toBeVisible({ timeout: TIMEOUT });
    await expect(dialogo).toBeHidden({ timeout: TIMEOUT });

    // Filtrar pelo ano da marcação e localizar a linha pelo marcador.
    await janela.locator("#marc-ano").fill(ANO);
    const linha = janela.locator("table tbody tr", { hasText: MARCADOR });
    await expect(linha.first()).toBeVisible({ timeout: TIMEOUT });
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
