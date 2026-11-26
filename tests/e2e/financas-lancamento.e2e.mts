/**
 * @file financas-lancamento.e2e.mts
 * @description Regressão do formulário de lançamento: abre sem linhas, guarda
 * só com duas linhas e o SearchSelect em portal permite escolher conta.
 *
 * O teste é read-only: o formulário é fechado sem gravar.
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
const TIMEOUT = 20_000;

let app: ElectronApplication;
let janela: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: [MAIN_BUILD] });
  janela = await app.firstWindow();
  await janela.waitForLoadState("domcontentloaded");
  await autenticar(janela);
});

test.afterAll(async () => {
  await app?.close();
});

test("novo lançamento abre vazio e permite escolher conta em linha adicionada", async () => {
  await janela.getByRole("link", { name: "Finanças", exact: true }).click();
  await janela.getByTestId("ribbon-tab-contabilistico").click();
  await janela.getByRole("button", { name: "Novo", exact: true }).click();
  await expect(janela.getByText("Novo lançamento contabilístico")).toBeVisible({
    timeout: TIMEOUT,
  });

  await expect(janela.getByText("Adicione pelo menos duas linhas.")).toBeVisible();
  await expect(janela.getByRole("button", { name: "Guardar rascunho" })).toBeDisabled();

  const adicionar = janela.getByRole("button", { name: "Adicionar linha" });
  await adicionar.click();
  await adicionar.click();

  const dialog = janela.getByRole("dialog");
  const primeiraLinha = dialog.locator("tbody tr").first();
  const campoConta = primeiraLinha.locator("input").first();
  await campoConta.click();
  const opcao = janela.locator("[data-option-index]").first();
  const textoConta = (await opcao.textContent())?.trim() ?? "";
  await opcao.click();

  expect(textoConta.length).toBeGreaterThan(0);
  await expect(campoConta).toHaveValue(textoConta);

  await janela.getByRole("button", { name: "Fechar" }).click();
});

async function autenticar(pagina: Page): Promise<void> {
  const campoLogin = pagina.locator("#utilizador");
  await expect(campoLogin).toBeVisible({ timeout: TIMEOUT });
  await campoLogin.fill(ADMIN.login);
  await pagina.locator("#senha").fill(ADMIN.senha);
  await pagina.getByRole("button", { name: /entrar no sistema/i }).click();
  await expect(pagina.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({
    timeout: TIMEOUT,
  });
}
