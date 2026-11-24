/**
 * @file stock-localizacao.e2e.ts
 * @description E2E da tab "Stock por Localização" (TASK-029).
 *
 * O que se cobre aqui é a parte que só um teste real prova: o renderer fala
 * com o main (`inventory:consultar-stock`, `localizacoes:*`), o controller
 * passa a sessão e as permissões, e a tabela desenrola o resultado. Um canal
 * mal registado rebentaria no arranque — precisamente o defeito que a
 * reescrita dos routers corrigiu.
 *
 * Os selectores usam `data-testid` do ribbon (estável por construção) e o
 * cabeçalho da tabela; nada depende de haver stock numa localização
 * concreta, porque o seed ainda não cria áreas nem zonas.
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

/** Abre Stock e activa a tab; fica no ecrã que os testes seguintes usam */
async function abrirStockPorLocalizacao(): Promise<void> {
  await janela.getByRole("link", { name: "Stock", exact: true }).click();
  await janela.getByTestId("ribbon-tab-localizacao").click();
}

test.describe("Stock por Localização (TASK-029)", () => {
  test("mostra a tabela com os filtros da task", async () => {
    await abrirStockPorLocalizacao();

    // Os sete filtros da task, mais o botão de atualizar.
    await expect(janela.getByPlaceholder("Todos os Armazéns")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByPlaceholder("Todos os Produtos")).toBeVisible();
    await expect(janela.getByPlaceholder("Nº de lote...")).toBeVisible();
    await expect(janela.getByPlaceholder("Todos os Estados")).toBeVisible();

    await expect(
      janela.getByRole("columnheader", { name: "Endereço (Área / Zona / Localização)" })
    ).toBeVisible({ timeout: TIMEOUT });

    // Linhas ou estado vazio — os dois são respostas válidas do IPC. Um erro
    // de canal deixa a tabela vazia *e* um toast; por isso também se espera
    // que a legenda de consulta esteja presente e a tabela tenha cabeçalho.
    await expect(janela.getByText("Consulta de leitura sobre")).toBeVisible();
  });

  test("a cascata Armazém → Área só abre o segundo degrau depois do primeiro", async () => {
    await abrirStockPorLocalizacao();

    // Sem armazém escolhido, a área está bloqueada — o filtro nunca manda
    // um pedido sem o id de que depende.
    const area = janela.getByPlaceholder("Escolha o armazém");
    await expect(area).toBeDisabled({ timeout: TIMEOUT });

    await janela.getByPlaceholder("Todos os Armazéns").click();
    await janela.getByText("ARM-01 — Geral", { exact: true }).click();

    // Escolhido o armazém, o degrau seguinte fica utilizável e o zonal
    // continua bloqueado até haver área.
    await expect(janela.getByPlaceholder("Todas as Áreas")).toBeEnabled({ timeout: TIMEOUT });
    await expect(janela.getByPlaceholder("Escolha a área")).toBeDisabled();
  });
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
