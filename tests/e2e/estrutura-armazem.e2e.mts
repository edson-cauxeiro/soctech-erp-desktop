/**
 * @file estrutura-armazem.e2e.ts
 * @description E2E (read-only) da tab "Estrutura do Armazém" (TASK-027/028).
 *
 * A estrutura viva (áreas → zonas → localizações) não existe no seed e não há
 * canal para apagar áreas — por isso os testes não gravam: criar não deixaria
 * rasto possível de limpar. O que se prova aqui:
 *
 * 1. O canal `localizacoes:tree` responde e o renderer mostra o estado vazio
 *    (um canal partido rebentaria o arranque ou deixaria a tab sem resposta);
 * 2. A acção de escrita "Nova Área" só fica disponível depois de escolher um
 *    armazém — não se pede escrita sem contexto;
 * 3. O formulário de criação exige os campos do `criarAreaSchema`.
 *
 * Os testes partilham a mesma instância da app; o segundo depende do primeiro
 * só na medida em que ambos começam sem armazém escolhido.
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

async function abrirEstrutura(): Promise<void> {
  await janela.getByRole("link", { name: "Stock", exact: true }).click();
  await janela.getByTestId("ribbon-tab-estrutura").click();
}

test.describe("Estrutura do Armazém (TASK-027/028)", () => {
  test("sem armazém escolhido mostra o convite e bloqueia a escrita", async () => {
    await abrirEstrutura();

    await expect(janela.getByTestId("estrutura-arvore")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText("Escolha um armazém")).toBeVisible();
    // Sem armazém não há onde criar uma área: o botão tem de estar bloqueado.
    await expect(janela.getByRole("button", { name: "Nova Área" })).toBeDisabled();
  });

  test("com armazém escolhido consulta a estrutura e abre o formulário de nova área", async () => {
    await abrirEstrutura();

    const seletor = janela.getByPlaceholder("Escolha o armazém...");
    await expect(seletor).toBeVisible({ timeout: TIMEOUT });
    await seletor.click();
    await janela.getByText("ARM-01 — Geral", { exact: true }).click();

    // A pedida feita ao main: ou há uma árvore, ou o estado vazio honesto —
    // nenhum dos dois é um canal falhado.
    await expect(janela.getByTestId("estrutura-vazio")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText("Comece por criar a primeira área")).toBeVisible();

    // Com armazém escolhido, criar área fica disponível.
    await expect(janela.getByRole("button", { name: "Nova Área" })).toBeEnabled();

    // O formulário pede os campos obrigatórios do `criarAreaSchema`.
    await janela.getByRole("button", { name: "Nova Área" }).click();
    await expect(janela.getByText("Código da Área *")).toBeVisible();
    await expect(janela.getByPlaceholder("Ex: REC ou EXP")).toBeVisible();
    await expect(janela.getByPlaceholder("Recepção de mercadoria")).toBeVisible();
    await expect(janela.getByRole("button", { name: "Criar Área" })).toBeVisible();

    // Cancelar não grava nada — a criação exige `estoque: write`, mas o teste
    // não deixa rasto.
    await janela.getByRole("button", { name: "Cancelar" }).click();
    await expect(janela.getByPlaceholder("Ex: REC ou EXP")).not.toBeVisible();
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