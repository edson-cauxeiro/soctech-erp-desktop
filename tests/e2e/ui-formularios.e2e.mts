/**
 * @file ui-formularios.e2e.ts
 * @description E2E (read-only) de estados de UI — formulários, validação e
 * carregamento (TASK-034).
 *
 * A suite inteira é read-only: os formulários são submetidos só com dados
 * inválidos, pelo que a validação é exercitada sem gravar um único registo.
 *
 * 1. Formulário (Armazém): o diálogo de "Novo Armazém" abre com os campos
 *    obrigatórios marcados (espelha o `armazemFormSchema`).
 * 2. Validação: submeter vazio mostra "Código é obrigatório" e "Designação é
 *    obrigatória", não fecha o diálogo e não acrescenta armazéns à lista.
 * 3. Validação parcial: preencher só o código deixa só a designação a falhar.
 * 4. Loading → dados (Estado de Stock): abrir o painel `ribbon-tab-alerta`
 *    passa do estado de carregamento para os dados reais do dev DB, e a
 *    pesquisa re-dispara a consulta (loading → resultado).
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

async function abrirStock(): Promise<void> {
  await janela.getByRole("link", { name: "Stock", exact: true }).click();
}

async function abrirArmazens(): Promise<void> {
  await abrirStock();
  await janela.getByTestId("ribbon-tab-armazem").click();
}

async function abrirNovoArmazem(): Promise<void> {
  await abrirArmazens();
  await janela.getByRole("button", { name: "Novo Armazém" }).click();
  await expect(janela.getByText("Novo Armazém de Stock", { exact: true })).toBeVisible({
    timeout: TIMEOUT,
  });
}

test.describe("Formulários e validação — Armazéns (TASK-034)", () => {
  test("o diálogo de novo armazém pede os campos obrigatórios do schema", async () => {
    await abrirNovoArmazem();

    // Labels com o marcador obrigatório, tal como o `armazemFormSchema` exige:
    // codigo min(1) e designacao min(2).
    await expect(janela.getByText("Código do Armazém *")).toBeVisible();
    await expect(janela.getByText("Designação *")).toBeVisible();
    await expect(janela.getByPlaceholder("ARM-03")).toBeVisible();
    await expect(janela.getByPlaceholder("Armazém Norte / Produção")).toBeVisible();

    // Cancelar não grava nada.
    await janela.getByRole("button", { name: "Cancelar" }).click();
    await expect(janela.getByPlaceholder("ARM-03")).not.toBeVisible();
  });

  test("submeter vazio mostra os erros, não fecha o diálogo e não cria armazém", async () => {
    await abrirNovoArmazem();

    await janela.getByRole("button", { name: "Guardar Armazém" }).click();

    // Erros de validação do `armazemFormSchema`.
    await expect(janela.getByText("Código é obrigatório", { exact: true })).toBeVisible();
    await expect(janela.getByText("Designação é obrigatória", { exact: true })).toBeVisible();

    // O react-hook-form falha a submissão: o diálogo continua aberto.
    await expect(janela.getByText("Novo Armazém de Stock", { exact: true })).toBeVisible();

    // Nada foi gravado — a lista continua com os dois armazéns do dev DB.
    await janela.getByRole("button", { name: "Cancelar" }).click();
    await expect(janela.getByText("Total de 2 armazéns configurados", { exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("preencher só o código deixa só a designação a falhar", async () => {
    await abrirNovoArmazem();

    await janela.getByPlaceholder("ARM-03").fill("ARM-99");
    await janela.getByRole("button", { name: "Guardar Armazém" }).click();

    await expect(janela.getByText("Designação é obrigatória", { exact: true })).toBeVisible();
    await expect(janela.getByText("Código é obrigatório", { exact: true })).not.toBeVisible();

    await janela.getByRole("button", { name: "Cancelar" }).click();
  });
});

test.describe("Loading → dados — Estado de Stock (TASK-034)", () => {
  test("abre o painel e mostra os dados reais depois do carregamento", async () => {
    await abrirStock();
    await janela.getByTestId("ribbon-tab-alerta").click();

    // O painel termina o carregamento: os KPIs e o cabeçalho da tabela estão lá.
    await expect(
      janela.getByText("Estado de Stock por Artigo", { exact: true })
    ).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText("Ruturas de Stock (Saldo Zero ou Negativo)")).toBeVisible();
    await expect(janela.getByRole("columnheader", { name: "Código (SKU)" })).toBeVisible();
    await expect(janela.getByText("Recomenda-se Reabastecer")).toBeVisible();
  });

  test("a pesquisa re-dispara a consulta e filtra os artigos", async () => {
    await abrirStock();
    await janela.getByTestId("ribbon-tab-alerta").click();

    await expect(janela.getByText("Estado de Stock por Artigo", { exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });

    // Filtrar por código: só o ART-0001 deve aparecer na tabela.
    const pesquisa = janela.getByPlaceholder("Pesquisar por código ou descrição...");
    await pesquisa.fill("ART-0001");
    await expect(janela.getByRole("cell", { name: "ART-0001", exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByRole("cell", { name: "ART-0002", exact: true })).not.toBeVisible();

    // Limpar o filtro devolve a lista completa.
    await pesquisa.fill("");
    await expect(janela.getByRole("cell", { name: "ART-0002", exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });
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