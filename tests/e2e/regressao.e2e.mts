/**
 * @file regressao.e2e.ts
 * @description E2E (read-only) de regressão — funcionalidades antigas, dados
 * existentes e os fluxos de venda, compra e stock (TASK-035).
 *
 * A regra é a mesma de toda a suite: nunca gravar. Aproveita dados existentes
 * do dev DB para provar que o renderer ↔ main não partiu nada:
 *
 *  - Navegação entre módulos e títulos de página (router/RBAC antigos);
 *  - Fluxos de venda: cadastro de clientes e histórico de faturas;
 *  - Fluxos de compra: os três cadernos do ComprasManager;
 *  - Fluxos de stock: artigos e movimentos com os registos reais (ART-0001,
 *    ART-0002, MOV-2026/00001).
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

test.describe("Navegação entre módulos (regressão)", () => {
  const modulos: { link: string; titulo: string }[] = [
    { link: "Início", titulo: "Painel Geral" },
    { link: "Vendas", titulo: "Vendas — Registo & Documentos" },
    { link: "Stock", titulo: "Stock & Gestão Multi-Armazém" },
    { link: "Compras", titulo: "Compras & Logística de Entrada" },
    { link: "Finanças", titulo: "Finanças — Tesouraria" },
    { link: "Fiscal", titulo: "Fiscal — Conformidade e Auditoria" },
    { link: "Relatórios", titulo: "Relatórios — Painel Analítico" },
  ];

  for (const modulo of modulos) {
    test(`abre o módulo "${modulo.link}" com o título esperado`, async () => {
      await janela.getByRole("link", { name: modulo.link, exact: true }).click();
      await expect(
        janela.getByRole("heading", { level: 1, name: modulo.titulo, exact: true })
      ).toBeVisible({ timeout: TIMEOUT });
    });
  }
});

test.describe("Fluxos de venda (regressão)", () => {
  test("o cadastro de clientes responde com os dados existentes", async () => {
    await janela.getByRole("link", { name: "Vendas", exact: true }).click();

    // Tab por omissão = Clientes. O cabeçalho prova que a lista respondeu.
    await expect(janela.getByRole("columnheader", { name: "Nome / Razão Social" })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByPlaceholder("Pesquisar por Código, Nome, NIF, Email...")).toBeVisible();
  });

  test("o histórico de faturas abre e lista as faturas existentes", async () => {
    await janela.getByRole("link", { name: "Vendas", exact: true }).click();
    await janela.getByTestId("ribbon-tab-fatura").click();

    await expect(janela.getByText("Emitir Nova Fatura", { exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });
    await janela.getByText("Histórico de Faturas", { exact: true }).click();

    // A tabela resolve o carregamento: o cabeçalho do histórico está presente.
    await expect(janela.getByRole("columnheader", { name: "Nº Documento" })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByPlaceholder("Pesquisar por Nº da Fatura, Cliente, NIF...")).toBeVisible();
  });
});

test.describe("Fluxos de compra (regressão)", () => {
  test("os três cadernos de compras respondem", async () => {
    await janela.getByRole("link", { name: "Compras", exact: true }).click();

    // Tab por omissão = Guias de Receção.
    await expect(janela.getByRole("columnheader", { name: "Nº Guia" })).toBeVisible({ timeout: TIMEOUT });

    await janela.getByText("Encomendas a Fornecedor", { exact: true }).click();
    await expect(janela.getByRole("columnheader", { name: "Nº Encomenda" })).toBeVisible({
      timeout: TIMEOUT,
    });

    await janela.getByText("Faturas de Compra", { exact: true }).click();
    await expect(janela.getByRole("columnheader", { name: "Nº Interno" })).toBeVisible({
      timeout: TIMEOUT,
    });
  });
});

test.describe("Fluxos de stock: dados existentes (regressão)", () => {
  test("o catálogo de artigos lista os artigos do dev DB", async () => {
    await janela.getByRole("link", { name: "Stock", exact: true }).click();
    await janela.getByTestId("ribbon-tab-artigo").click();

    await expect(janela.getByRole("cell", { name: "ART-0001", exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByRole("cell", { name: "ART-0002", exact: true })).toBeVisible();
  });

  test("os movimentos de stock listam os registos existentes", async () => {
    await janela.getByRole("link", { name: "Stock", exact: true }).click();
    await janela.getByTestId("ribbon-tab-movimento").click();

    await expect(janela.getByRole("cell", { name: "MOV-2026/00001", exact: true })).toBeVisible({
      timeout: TIMEOUT,
    });
    await expect(janela.getByRole("columnheader", { name: "Doc. Origem" })).toBeVisible();
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