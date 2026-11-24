/**
 * @file transferencia-movimentos.e2e.ts
 * @description E2E (read-only) da Transferência entre Armazéns (TASK-030) e
 * dos realces dos Movimentos (TASK-031).
 *
 * Os testes não gravam na base de dados de desenvolvimento:
 *  - O wizard de transferência é provado até ao passo final — "Confirmar
 *    Transferência" fica apto, mas nunca é carregado (gravaria um movimento
 *    sem canal para o apagar);
 *  - Nos Movimentos usa-se um movimento já existente do seed/dev para abrir o
 *    detalhe, filtrar pela referência e ver o chip de filtro.
 *
 * Notas:
 *  - A instância Electron é partilhada entre os testes; cada teste navega
 *    primeiro para a tab que precisa (a app persistente não desmonta managers).
 *  - `documentoOrigem` de "MOV-2026/00001" é "AJUSTE-MANUAL"; filtrar por esse
 *    valor esconde o movimento de fatura "FT 2026/0001" (assert de contraste).
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

async function abrirTab(tab: string): Promise<void> {
  await janela.getByRole("link", { name: "Stock", exact: true }).click();
  await janela.getByTestId(`ribbon-tab-${tab}`).click();
}

test.describe("Transferência entre Armazéns (TASK-030)", () => {
  test("fluxo guiado valida cada passo e só liberta a acção final", async () => {
    await abrirTab("transferencia");

    // Passo 1 — Produto: sem artigo, a navegação está bloqueada.
    await expect(janela.getByTestId("transferencia-passos")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByText("Passo 1 de 5")).toBeVisible();
    await expect(janela.getByTestId("transferencia-seguinte")).toBeDisabled();

    await janela.getByPlaceholder("Procurar produto...").click();
    await janela.getByText("ART-0001 — Computador HP AIO", { exact: true }).click();
    await expect(janela.getByTestId("transferencia-seguinte")).toBeEnabled();
    await janela.getByTestId("transferencia-seguinte").click();

    // Passo 2 — Origem: escolher armazém consulta o saldo disponível.
    await expect(janela.getByText("Passo 2 de 5")).toBeVisible();
    await janela.getByPlaceholder("Armazém que cede o stock...").click();
    await janela.getByText("ARM-01 — Geral", { exact: true }).click();
    await expect(janela.getByTestId("saldo-origem")).toBeVisible();
    await expect(janela.getByText("Saldo disponível:")).toBeVisible();
    await janela.getByTestId("transferencia-seguinte").click();

    // Passo 3 — Quantidade: valor inválido não avança; válido avança.
    await expect(janela.getByText("Passo 3 de 5")).toBeVisible();
    await janela.getByPlaceholder("0").fill("0");
    await janela.getByTestId("transferencia-seguinte").click();
    await expect(janela.getByText("Passo 3 de 5")).toBeVisible();
    await janela.getByPlaceholder("0").fill("5");
    await janela.getByTestId("transferencia-seguinte").click();

    // Passo 4 — Destino: nunca pode ser o mesmo que a origem (é excluída das opções).
    await expect(janela.getByText("Passo 4 de 5")).toBeVisible();
    await janela.getByPlaceholder("Armazém que recebe o stock...").click();
    await janela.getByText("ARM-02 — Vendas", { exact: true }).click();
    await janela.getByTestId("transferencia-seguinte").click();

    // Passo 5 — Confirmar: o resumo está completo e a escrita está apeada.
    await expect(janela.getByText("Passo 5 de 5")).toBeVisible();
    await expect(janela.getByTestId("resumo-transferencia")).toBeVisible();
    await expect(janela.getByText("ART-0001 — Computador HP AIO (UN)", { exact: true })).toBeVisible();
    await expect(janela.getByText("ARM-01 — Geral", { exact: true })).toBeVisible();
    await expect(janela.getByText("ARM-02 — Vendas", { exact: true })).toBeVisible();
    await expect(janela.getByTestId("transferencia-confirmar")).toBeEnabled();

    // O teste para aqui: a transferência grava um movimento sem canal para o
    // apagar, por isso não se carrega o confirmar.
    await expect(janela.getByText("Passo 5 de 5")).toBeVisible();
  });
});

test.describe("Movimentos — Detalhe, Referência e Datas (TASK-031)", () => {
  test("abre detalhe, filtra por referência e valida chips de data", async () => {
    await abrirTab("movimento");

    // A lista carrega movimentos reais do dev.
    const botaoDetalhe = janela.locator('button[title="Ver detalhe do movimento"]').first();
    await expect(botaoDetalhe).toBeVisible({ timeout: TIMEOUT });

    // Detalhe do movimento MOV-2026/00001 (documentoOrigem AJUSTE-MANUAL).
    await janela.getByTestId("detalhe-movimento-MOV-2026/00001").click();
    await expect(janela.getByText("Detalhe do Movimento MOV-2026/00001")).toBeVisible();
    await expect(janela.getByText("Referência / Documento")).toBeVisible();

    // A referência dentro do detalhe fecha o diálogo e vira chip de filtro.
    await janela.getByTestId("referencia-no-detalhe").click();
    await expect(janela.getByText("Detalhe do Movimento MOV-2026/00001")).not.toBeVisible();
    await expect(janela.getByTestId("chip-referencia")).toBeVisible();
    await expect(janela.getByText("Referência: AJUSTE-MANUAL")).toBeVisible();

    // O movimento de fatura deixa de aparecer com o filtro ativo.
    await expect(janela.getByText("FT 2026/0001")).not.toBeVisible();

    // Limpar o filtro devolve a lista completa.
    await janela.getByText("Limpar tudo").click();
    await expect(janela.getByTestId("chip-referencia")).not.toBeVisible();
    await expect(janela.getByTestId("detalhe-movimento-MOV-2026/00001")).toBeVisible();

    // Filtros de data: intervalo largo não esconde nada e mostra o chip.
    await janela.getByTestId("filtro-data-inicio").fill("2020-01-01");
    await expect(janela.getByText("Desde 01/01/2020")).toBeVisible({ timeout: TIMEOUT });
    await janela.getByText("Limpar tudo").click();
    await expect(janela.getByText("Desde 01/01/2020")).not.toBeVisible();
    await expect(janela.getByTestId("detalhe-movimento-MOV-2026/00001")).toBeVisible();
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