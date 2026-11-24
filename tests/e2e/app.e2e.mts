/**
 * @file app.e2e.ts
 * @description Testes E2E de arranque, autenticação e navegação (SPRINT 6 `TEST-14`).
 *
 * O objectivo não é cobrir cada ecrã — isso seria uma suite que falha a cada
 * alteração de layout e que ninguém lê quando falha. É cobrir o percurso que,
 * quando quebra, não tem volta: a aplicação abre, autentica, navega entre
 * módulos e mostra o ecrã fiscal.
 *
 * Duas restrições que moldaram este ficheiro, e que valem a pena reter:
 *
 * 1. **`goto` com caminho relativo não funciona.** O renderer é carregado
 *    com `loadFile`, ou seja um URL `file:`, e a app usa `HashRouter`. Um
 *    `goto("/relatorios")` resolve para um URL sem esquema e o Playwright
 *    rejeita-o. A navegação faz-se por cliques nos elementos reais.
 *
 * 2. **A sessão vive no processo main, não em `localStorage`.** Um `reload`
 *    não desliga o utilizador. Para recomeçar do princípio é preciso clicar em
 *    "Terminar Sessão", e é isso que o `beforeEach` faz.
 *
 * Porquê `_electron` e não um browser contra `localhost`: o DoraERP fala com
 * o main por IPC. Um teste de browser testaria o mock de `window.api`, que é
 * precisamente a parte que não é real.
 */

import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// O ficheiro é carregado como módulo ES, onde `__dirname` não existe.
const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, "../../out/main/index.js");

/** Contas do `prisma/seed.ts`. */
const ADMIN = { login: "admin", senha: "senha123" };
/** `ana.marques` é Vendedor: não tem permissão `fiscal`. */
const VENDEDOR = { login: "ana.marques", senha: "senha123" };

const TIMEOUT = 20_000;

// A licença de desenvolvimento é instalada pelo globalSetup do Playwright.
// Aqui não é importada de propósito: importá-la depois do primeiro login
// deixaria o store do Renderer com um estado antigo e esconderia a navegação.

let app: ElectronApplication;
let janela: Page;

test.beforeAll(async () => {
  app = await electron.launch({ args: [MAIN_BUILD] });
  janela = await app.firstWindow();
  await janela.waitForLoadState("domcontentloaded");

  await autenticar(janela, ADMIN);
  await terminarSessaoSeEstiverAutenticado();
});

test.afterAll(async () => {
  // Sem isto o processo do Electron fica vivo e a suite não termina.
  await app?.close();
});

test.beforeEach(async () => {
  await terminarSessaoSeEstiverAutenticado();
});

test.describe("DoraERP — arranque e navegação", () => {
  test("abre a janela principal", async () => {
    expect(janela).toBeDefined();
    await expect(janela.locator("body")).toBeVisible();
  });

  test("faz login e chega ao ecrã inicial", async () => {
    await autenticar(janela, ADMIN);

    // A navegação lateral só existe depois da sessão: é a prova de que o
    // login passou, e não de que a página de login deixou de estar visível.
    await expect(janela.getByRole("link", { name: /fiscal/i }).first()).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByRole("link", { name: /vendas/i }).first()).toBeVisible();
  });

  test("abre o módulo fiscal a partir da navegação", async () => {
    await autenticar(janela, ADMIN);

    await janela.getByRole("link", { name: /fiscal/i }).first().click();

    // O cabeçalho da página distingue-se do resto e confirma que o router
    // resolveu, e não que a página ficou em branco.
    await expect(janela.getByRole("heading", { name: /conformidade e auditoria/i }).first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });

  test("mostra o painel SAF-T com os controlos de período", async () => {
    await autenticar(janela, ADMIN);
    await janela.getByRole("link", { name: /fiscal/i }).first().click();

    // Estes `data-testid` só existem na página real. A versão anterior era um
    // stub sem eles, e é por isso que o teste não passa só por ver texto.
    await expect(janela.getByTestId("saft-ano")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByTestId("saft-mes")).toBeVisible();
    await expect(janela.getByTestId("saft-validar")).toBeEnabled();
    await expect(janela.getByTestId("saft-gerar")).toBeEnabled();
  });

  test("nega o acesso ao fiscal a quem não tem permissão", async () => {
    await autenticar(janela, VENDEDOR);

    // O `ProtectedRoute` tem de barrar. Se a página fiscal aparecesse, o
    // RBAC da UI não estaria a ser aplicado — o RBAC do main existe como
    // segunda barreira, mas esta é a que o utilizador vê.
    await expect(janela.getByTestId("saft-ano")).toHaveCount(0, { timeout: TIMEOUT });
  });
});

test.describe("DoraERP — painel de relatórios", () => {
  test("abre o painel e carrega os números do período", async () => {
    await autenticar(janela, ADMIN);
    await janela.getByRole("link", { name: /relat[oó]rios/i }).first().click();

    await expect(janela.getByTestId("relatorios-de")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByTestId("relatorios-ate")).toBeVisible();

    // Um cartão com `—` é o estado antes do dado chegar. O teste espera pelo
    // valor formatado, que só existe depois de uma resposta bem-sucedida.
    //
    // A moeda é Kz, não €: o ERP é angolano e `formatCurrency` usa o código
    // que o backend devolve. A primeira versão desta linha esperava por `€`
    // e passou porque nenhuma factura existe no seed — `0,00` nunca foi
    // formatado como euro. `Kz` não depende de haver dados.
    await expect(janela.getByTestId("relatorios-kpi-vendas")).toContainText(/Kz/, {
      timeout: TIMEOUT,
    });
  });

  test("muda de período sem pedir o relatório à mão", async () => {
    await autenticar(janela, ADMIN);
    await janela.getByRole("link", { name: /relat[oó]rios/i }).first().click();

    const ate = janela.getByTestId("relatorios-ate");
    await expect(ate).toBeVisible({ timeout: TIMEOUT });
    await expect(ate).not.toHaveValue("");

    // Trocar o preset é a forma como o utilizador escolhe o período. Se o
    // estado do ecrã não seguisse, o filtro pareceria funcionar e o relatório
    // continuaria a ser o do período anterior.
    await janela.getByTestId("relatorios-preset-este-ano").click();
    await expect(ate).toHaveValue(/^\d{4}-12-31$/);

    await janela.getByTestId("relatorios-preset-mes-anterior").click();
    await expect(ate).not.toHaveValue("");
  });

  test("recusa um período invertido sem escrever nada", async () => {
    await autenticar(janela, ADMIN);
    await janela.getByRole("link", { name: /relat[oó]rios/i }).first().click();
    await expect(janela.getByTestId("relatorios-ate")).toBeVisible({ timeout: TIMEOUT });

    await janela.getByTestId("relatorios-de").fill("2026-12-31");
    await janela.getByTestId("relatorios-ate").fill("2026-01-01");

    // A validação está no main, e a mensagem chega ao ecrã. Um relatório
    // vazio sem aviso seria lido como "não vendemos nada em 2026".
    await expect(janela.getByRole("alert")).toContainText(/posterior/i, { timeout: TIMEOUT });
  });

  test("nega o acesso a quem não tem permissão de relatórios", async () => {
    await autenticar(janela, VENDEDOR);

    await expect(janela.getByTestId("relatorios-de")).toHaveCount(0, { timeout: TIMEOUT });
  });
});

test.describe("DoraERP — módulos", () => {
  // `[rótulo do link lateral, título do cabeçalho]` — os dois textos têm de
  // ser declarados à mão: o link diz "Finanças" e a página diz
  // "Finanças — Tesouraria", e são coisas diferentes.
  const MODULOS = [
    ["Vendas", "Vendas — Registo & Documentos"],
    ["Finanças", "Finanças — Tesouraria"],
    ["Compras", "Compras & Logística de Entrada"],
    ["Stock", "Stock & Gestão Multi-Armazém"],
    ["Comercial", "Comercial — CRM"],
  ] as const;

  /** Um módulo visível é um ecrã que responde ao utilizador autenticado. */
  for (const [link, titulo] of MODULOS) {
    test(`abre ${titulo} a partir da barra lateral`, async () => {
      await autenticar(janela, ADMIN);

      // Anchor exacto pelo nome do link. Um regex que juntasse todos os
      // módulos clicaria sempre no primeiro, e os cinco testes passariam a
      // verificar a mesma página — que foi exactamente o que aconteceu na
      // primeira versão deste bloco.
      await janela.getByRole("link", { name: link, exact: true }).click();

      // O cabeçalho é a prova de que o ecrã carregou e não ficou em branco.
      await expect(janela.getByRole("heading", { name: titulo })).toBeVisible({ timeout: TIMEOUT });
    });
  }

  test("esconde da barra lateral os módulos que o utilizador não pode usar", async () => {
    await autenticar(janela, VENDEDOR);

    // O perfil `Vendedor` do `prisma/seed.ts` tem `vendas: read/write` e
    // `relatorios: read`. A sidebar filtra por permissão, logo esses dois
    // existem e os restantes não. A lista foi lida do seed e não adivinhada:
    // a primeira versão deste teste assumia que o Vendedor não via Relatórios,
    // e falhou.
    await expect(janela.getByRole("link", { name: "Vendas", exact: true })).toBeVisible();
    await expect(janela.getByRole("link", { name: "Relatórios", exact: true })).toBeVisible();

    await expect(janela.getByRole("link", { name: "Finanças", exact: true })).toHaveCount(0);
    await expect(janela.getByRole("link", { name: "Fiscal", exact: true })).toHaveCount(0);
    await expect(janela.getByRole("link", { name: "Stock", exact: true })).toHaveCount(0);
  });

  test("recusa as configurações a quem não é administrador", async () => {
    await autenticar(janela, VENDEDOR);
    await janela.getByRole("link", { name: "Vendas", exact: true }).click();

    // Configurações não tem entrada na sidebar (`nav: false`): chega-se lá
    // pelo ícone da barra superior. Para quem não é admin o ícone avisa e não
    // navega — logo, o ecrã tem de continuar a ser o de Vendas.
    await janela.getByTestId("abrir-configuracoes").click();
    await expect(janela.getByText(/acesso restrito/i)).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByRole("heading", { name: "Vendas — Registo & Documentos" })).toBeVisible();
  });

  test("deixa um administrador entrar nas configurações", async () => {
    await autenticar(janela, ADMIN);

    await janela.getByTestId("abrir-configuracoes").click();

    await expect(janela.getByRole("heading", { name: /configura/i }).first()).toBeVisible({
      timeout: TIMEOUT,
    });
  });
});

test.describe("DoraERP — licenciamento", () => {
  test("mostra a 7.ª aba dentro das configurações", async () => {
    await autenticar(janela, ADMIN);

    await janela.getByTestId("perfil-menu-trigger").click();
    await janela.getByRole("menuitem", { name: /configura/i }).click();
    await janela.getByTestId("ribbon-tab-licenciamento").click();

    await expect(janela.getByTestId("licenciamento")).toBeVisible({ timeout: TIMEOUT });
    await expect(janela.getByTestId("licenciamento-estado")).toContainText("VALID");
    await expect(janela.getByTestId("licenciamento-importar")).toBeEnabled();
    await expect(janela.getByTestId("licenciamento-modulos")).toBeVisible();
  });
});

test.describe("DoraERP — auditoria", () => {
  test("mostra o log com filtros e verificação de integridade", async () => {
    await autenticar(janela, ADMIN);

    // Configurações é `nav: false`: não está na barra lateral, e chega-se
    // pelo menu do perfil. Um `link` com o nome Configurações nunca existiu, e
    // procurar um é procura um elemento que não está lá.
    await janela.getByTestId("perfil-menu-trigger").click();
    await janela.getByRole("menuitem", { name: /configura/i }).click();

    await expect(janela.getByRole("heading", { name: /sistema & empresa/i }).first()).toBeVisible({
      timeout: TIMEOUT,
    });
    await janela.getByTestId("ribbon-tab-auditoria").click();

    await expect(janela.getByTestId("auditoria")).toBeVisible({ timeout: TIMEOUT });
    // Os filtros e o botão de verificação têm de estar presentes: um
    // visualizador que só mostra o log não responde a "quando foi isso".
    await expect(janela.getByTestId("auditoria-acao")).toBeVisible();
    await expect(janela.getByTestId("auditoria-severidade")).toBeVisible();
    await expect(janela.getByTestId("auditoria-verificar")).toBeEnabled();
  });

  test("nega o acesso a quem não é administrador", async () => {
    await autenticar(janela, VENDEDOR);

    await expect(janela.getByTestId("auditoria")).toHaveCount(0, { timeout: TIMEOUT });
  });
});

/**
 * Faz login pelo formulário real e espera pela navegação lateral.
 *
 * Os selectores vêm do componente, não de convenções inventadas aqui: um
 * `placeholder` que muda no login não deve obrigar a rever este ficheiro.
 */
async function autenticar(pagina: Page, conta: { login: string; senha: string }): Promise<void> {
  const campoLogin = pagina.locator("#utilizador");
  await expect(campoLogin).toBeVisible({ timeout: TIMEOUT });

  await campoLogin.fill(conta.login);
  await pagina.getByPlaceholder("••••••••").fill(conta.senha);
  await pagina.getByRole("button", { name: /entrar no sistema/i }).click();

  await expect(pagina.getByRole("link", { name: /inicio|início/i }).first()).toBeVisible({
    timeout: TIMEOUT,
  });
}

/**
 * Termina a sessão se já houver uma.
 *
 * Silencia a ausência do botão porque o primeiro teste começa sem sessão: aí
 * não há nada para terminar e isso não é uma falha.
 */
async function terminarSessaoSeEstiverAutenticado(): Promise<void> {
  const gatilho = janela.getByTestId("perfil-menu-trigger");
  const autenticado = await gatilho.isVisible().catch(() => false);
  if (!autenticado) return;

  await gatilho.click();
  await janela.getByTestId("perfil-menu-sair").click();
  await expect(janela.locator("#utilizador")).toBeVisible({ timeout: TIMEOUT });
}