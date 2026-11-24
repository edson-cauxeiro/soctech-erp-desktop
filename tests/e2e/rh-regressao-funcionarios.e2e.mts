/**
 * @file rh-regressao-funcionarios.e2e.ts
 * @description E2E (read-only) de regressão do ribbon de RH — grupo
 * "Funcionários" (RH-805): todos os separadores abrem e as grelhas carregam.
 *
 * Regra da suite: nunca gravar. Só navegar (ribbon-tab-*) e verificar que o
 * componente de cada separador renderizou com a sua grelha.
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
const TIMEOUT = 30_000;

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

interface Verificacao {
  /** data-testid do contentor raiz do separador. */
  testid?: string;
  /** Cabeçalho de secção/placeholder (nome exacto). */
  cabecalho?: { nivel: 1 | 2 | 3; texto: string };
  /** Cabeçalho de coluna da grelha (nome exacto). */
  coluna?: string;
  /**
   * A grelha pode estar vazia na base de dados de desenvolvimento: nesse caso
   * não há `<thead>` e o componente mostra um estado vazio. Aceita um ou outro.
   */
  colunaOuVazio?: { coluna: string; texto: string };
  /** Botão de acção que prova que a toolbar carregou. */
  botao?: RegExp;
  /** Texto livre (placeholders, tabs, etc.). */
  texto?: RegExp;
}

const SEPARADORES: Array<{ tabKey: string; verificacoes: Verificacao[] }> = [
  {
    tabKey: "geral",
    verificacoes: [
      { cabecalho: { nivel: 2, texto: "Geral" } },
      { texto: /em construção/ },
    ],
  },
  {
    tabKey: "funcionarios",
    verificacoes: [
      { cabecalho: { nivel: 2, texto: "Funcionários" } },
      { colunaOuVazio: { coluna: "NIF / BI", texto: "Sem funcionários" } },
      { botao: /novo funcionário/i },
      { botao: /importar csv/i },
    ],
  },
  {
    tabKey: "alteracoes-mensais",
    verificacoes: [
      { cabecalho: { nivel: 1, texto: "Alterações Mensais" } },
      {
        colunaOuVazio: {
          coluna: "Rubrica",
          texto: "Nenhuma alteração mensal encontrada",
        },
      },
      { botao: /nova alteração/i },
    ],
  },
  {
    tabKey: "ausencias",
    verificacoes: [
      { testid: "rh-ausencias" },
      { coluna: "Tipo" },
      { botao: /nova ausência/i },
    ],
  },
  {
    tabKey: "horas-extra",
    verificacoes: [
      { testid: "rh-horas-extra" },
      { coluna: "Horas" },
    ],
  },
  {
    tabKey: "ferias",
    verificacoes: [
      { testid: "rh-ferias" },
      { coluna: "Direito" }, // tabela de saldos
      { coluna: "Observação" }, // tabela de marcações
      { botao: /nova marcação/i },
    ],
  },
  {
    tabKey: "ferias-calendario",
    verificacoes: [
      { testid: "rh-ferias-calendario" },
      { coluna: "Saldo" },
    ],
  },
  {
    tabKey: "afetacoes",
    verificacoes: [
      { testid: "rh-afetacoes" },
      { coluna: "Centro de Custo" },
    ],
  },
  {
    tabKey: "dividas",
    verificacoes: [
      { testid: "rh-dividas" },
      { texto: /Processos de Dívida/ },
      { coluna: "Credor / Nº Processo" },
    ],
  },
  {
    tabKey: "retroativos",
    verificacoes: [
      { testid: "rh-retroativos" },
      { coluna: "Funcionário" },
    ],
  },
  {
    tabKey: "independentes",
    verificacoes: [
      { testid: "rh-independentes" },
      { coluna: "NIF" },
    ],
  },
  {
    tabKey: "atividades",
    verificacoes: [
      { testid: "rh-atividades" },
      { coluna: "Independente" },
    ],
  },
];

test.describe("RH-805: regressão read-only do grupo Funcionários", () => {
  for (const separador of SEPARADORES) {
    test(`o separador "${separador.tabKey}" abre com a grelha carregada`, async () => {
      await abrirSubTab(separador.tabKey);

      for (const verificacao of separador.verificacoes) {
        if (verificacao.testid) {
          await expect(janela.getByTestId(verificacao.testid)).toBeVisible({ timeout: TIMEOUT });
        }
        if (verificacao.cabecalho) {
          await expect(
            janela.getByRole("heading", {
              level: verificacao.cabecalho.nivel,
              name: verificacao.cabecalho.texto,
              exact: true,
            })
          ).toBeVisible({ timeout: TIMEOUT });
        }
        if (verificacao.coluna) {
          await expect(
            janela.getByRole("columnheader", { name: verificacao.coluna, exact: true })
          ).toBeVisible({ timeout: TIMEOUT });
        }
        if (verificacao.colunaOuVazio) {
          await expect(
            janela
              .getByRole("columnheader", { name: verificacao.colunaOuVazio.coluna, exact: true })
              .or(janela.getByText(verificacao.colunaOuVazio.texto, { exact: true }))
          ).toBeVisible({ timeout: TIMEOUT });
        }
        if (verificacao.botao) {
          await expect(janela.getByRole("button", { name: verificacao.botao }).first()).toBeVisible({
            timeout: TIMEOUT,
          });
        }
        if (verificacao.texto) {
          await expect(janela.getByText(verificacao.texto).first()).toBeVisible({ timeout: TIMEOUT });
        }
      }
    });
  }
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
