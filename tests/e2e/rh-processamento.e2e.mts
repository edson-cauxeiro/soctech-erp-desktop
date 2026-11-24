/**
 * @file rh-processamento.e2e.ts
 * @description E2E do fluxo completo de processamento: criar funcionário/contrato → lote →
 * verificar totais → anular → reprocessar (RH-416).
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
const TIMEOUT = 60_000;
const FUNC_CODIGO = `E2E-${Date.now()}`; // código único para idempotência

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

// Não faz logout entre testes — a suite partilha a sessão autenticada.

test.describe("RH-416: Processamento lote → totais → anular → reprocessar", () => {
  test("fluxo completo", async () => {
    test.setTimeout(240_000); // criar funcionário/contrato + lote + anular + reprocessar

    // 1. Criar funcionário com contrato (via Funcionários)
    await criarFuncionarioComContrato();

    // 2. Navegar para Salários e Honorários
    await abrirSalarios();

    // 3. Configurar período atual, Actualizar
    await configurarPeriodoEAguardar();

    // 4. Selecionar o funcionário criado
    await selecionarFuncionario(FUNC_CODIGO);

    // 5. Processar lote
    const relatorio = await processarLote();

    // 6. Verificar totais no relatório final
    expect(relatorio.processamentos).toBeGreaterThan(0);
    expect(relatorio.sucessos).toBe(relatorio.processamentos);
    expect(relatorio.erros).toBe(0);
    expect(relatorio.totalLiquido).toBeGreaterThan(0);

    // 7. Mudar operação para Anular
    await mudarOperacao("ANULAR");

    // 8. Actualizar para carregar processamentos do período
    await actualizarEAguardar();

    // 9. Selecionar o processamento e anular
    await anularProcessamento(FUNC_CODIGO);

    // 10. Mudar de volta para Processar
    await mudarOperacao("PROCESSAR");

    // 11. Actualizar novamente (funcionário deve voltar a elegível)
    await actualizarEAguardar();

    // 12. Selecionar funcionário novamente
    await selecionarFuncionario(FUNC_CODIGO);

    // 13. Reprocessar
    const relatorio2 = await processarLote();

    // 14. Verificar reprocessamento
    expect(relatorio2.processamentos).toBeGreaterThan(0);
    expect(relatorio2.sucessos).toBe(relatorio2.processamentos);
    expect(relatorio2.totalLiquido).toBeGreaterThan(0);
  });
});

// ============================================================================
// Helpers de navegação e acções
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

async function abrirTab(pagina: Page, label: string): Promise<void> {
  // A navegação de módulos usa <Link> que aparece como texto clicável
  await pagina.getByText(label, { exact: true }).click();
  await pagina.waitForTimeout(500); // transição de aba
}

async function abrirSubTab(pagina: Page, tabKey: string): Promise<void> {
  // Sub-tabs do RH usam data-testid="ribbon-tab-{tabKey}"
  await pagina.getByTestId(`ribbon-tab-${tabKey}`).click();
  await pagina.waitForTimeout(500);
}

async function abrirSalarios(): Promise<void> {
  await abrirTab(janela, "Recursos Humanos");
  await abrirSubTab(janela, "salarios");
  await expect(janela.getByTestId("rh-processamento")).toBeVisible({ timeout: TIMEOUT });
}

async function configurarPeriodoEAguardar(): Promise<void> {
  // O ano/mês/período já vêm preenchidos com o corrente; só clicar Actualizar
  await janela.getByRole("button", { name: /actualizar/i }).click();
  // Aguarda a grelha carregar (elegíveis > 0 ou mensagem de vazio)
  await expect(janela.getByTestId("rh-processamento-conteudo")).toBeVisible({ timeout: TIMEOUT });
  // Esperar um pouco mais para o carregamento assíncrono
  await janela.waitForTimeout(2_000);
}

async function selecionarFuncionario(codigo: string): Promise<void> {
  // A grelha tem coluna "P" (checkbox) + código + nome. O checkbox é um
  // `Checkbox` Radix (role="checkbox"), não um `input[type="checkbox"]`.
  const linha = janela.locator("table tbody tr", { hasText: codigo }).first();
  await expect(linha).toBeVisible({ timeout: TIMEOUT });
  await linha.getByRole("checkbox").first().click();
  // O badge "Individual" deve aparecer na barra de contexto
  await expect(janela.getByText("Individual", { exact: false }).first()).toBeVisible({
    timeout: TIMEOUT,
  });
}

async function processarLote(): Promise<{
  processamentos: number;
  sucessos: number;
  erros: number;
  totalLiquido: number;
}> {
  // Clicar "Processar" (Alt+P)
  await janela.getByRole("button", { name: /processar/i }).click();

  // Diálogo de processamento abre na fase RESUMO
  await expect(janela.getByText("Processar salários", { exact: true })).toBeVisible({
    timeout: TIMEOUT,
  });

  // Clicar "Confirmar e processar"
  await janela.getByRole("button", { name: /confirmar e processar/i }).click();

  // Fase EXECUCAO - aguardar progresso completar
  await expect(janela.getByText("A processar", { exact: false }).first()).toBeVisible({
    timeout: TIMEOUT,
  });
  // Aguardar a fase RELATORIO (botão Fechar aparece)
  await expect(janela.getByRole("button", { name: /^fechar$/i })).toBeVisible({
    timeout: 120_000,
  });

  // Extrair totais do relatório
  const processamentos = await extrairTexto(janela, "Processamentos");
  const sucessos = await extrairTexto(janela, "Sucessos");
  const erros = await extrairTexto(janela, "Erros");
  const totalLiquido = await extrairTextoMonetario(janela, "Total líquido processado");

  // Fechar diálogo
  await janela.getByRole("button", { name: /^fechar$/i }).click();
  await expect(janela.getByText("Processar salários", { exact: true })).not.toBeVisible({
    timeout: TIMEOUT,
  });

  return {
    processamentos: Number(processamentos) || 0,
    sucessos: Number(sucessos) || 0,
    erros: Number(erros) || 0,
    totalLiquido: paraNumero(totalLiquido),
  };
}

async function mudarOperacao(operacao: "PROCESSAR" | "ANULAR"): Promise<void> {
  // `#operacao` é um Select Radix (role="combobox"), não um `<select>` nativo.
  await janela.locator("#operacao").click();
  await janela
    .getByRole("option", { name: operacao === "ANULAR" ? /anular/i : /processar/i })
    .click();
  // Aguardar UI reagir
  await janela.waitForTimeout(500);
}

async function actualizarEAguardar(): Promise<void> {
  await janela.getByRole("button", { name: /actualizar/i }).click();
  await janela.waitForTimeout(2_000);
}

async function anularProcessamento(codigoFuncionario: string): Promise<void> {
  // A grelha de anular mostra Funcionário/Nome/Tipo/Recibo/Data/Líquido/Estado
  // Selecionar a linha pelo checkbox P (Radix, role="checkbox")
  const linha = janela.locator("table tbody tr", { hasText: codigoFuncionario }).first();
  await expect(linha).toBeVisible({ timeout: TIMEOUT });
  await linha.getByRole("checkbox").first().click();

  // Clicar botão "Anular" na barra de acções (destructive). O nome acessível
  // inclui o atalho ("Anular Alt+P").
  await janela.getByRole("button", { name: /^anular/i }).click();

  // Diálogo de confirmação abre
  await expect(janela.getByText("Anular processamentos", { exact: true })).toBeVisible({
    timeout: TIMEOUT,
  });

  // Preencher motivo (≥3 chars)
  await janela.locator("#motivo-anulacao").fill("Teste E2E anulação");
  await janela.getByRole("button", { name: /confirmar anulação/i }).click();

  // Aguardar resultado
  await expect(janela.getByText("Resultado da anulação", { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  // Verificar sucesso
  await expect(janela.getByText("Anulados", { exact: false }).first()).toBeVisible();

  // Fechar
  await janela.getByRole("button", { name: /^fechar$/i }).click();
  await expect(janela.getByText("Anular processamentos", { exact: true })).not.toBeVisible({
    timeout: TIMEOUT,
  });
}

// ============================================================================
// Helpers para criar funcionário + contrato
// ============================================================================

async function criarFuncionarioComContrato(): Promise<void> {
  await abrirTab(janela, "Recursos Humanos");
  await abrirSubTab(janela, "funcionarios");
  await expect(janela.getByRole("heading", { name: "Funcionários", exact: true })).toBeVisible({ timeout: TIMEOUT });

  // Clicar "Novo Funcionário"
  await janela.getByRole("button", { name: /novo funcionário/i }).click();
  await expect(janela.getByRole("heading", { name: "Novo Funcionário", exact: true })).toBeVisible({ timeout: TIMEOUT });

  // Preencher dados pessoais obrigatórios
  await janela.getByText("Nome", { exact: false }).locator("..").locator("input").first().fill(`Funcionário Teste ${FUNC_CODIGO}`);
  await janela.getByText("Data de Admissão", { exact: false }).locator("..").locator("input").first().fill("2024-01-15");
  // Documento/NIF opcionais

  // Dados profissionais - departamento/cargo podem ser vazios se não houver seed
  // Estado = ATIVO (padrão)

  // Submeter
  await janela.getByRole("button", { name: /registar/i }).click();
  await expect(janela.getByText(/funcionário criado/i)).toBeVisible({ timeout: TIMEOUT });

  // Abrir ficha do funcionário recém-criado (pelo código)
  await janela.waitForTimeout(1_000);
  // A grelha tem os registos de execuções anteriores e está paginada: filtrar
  // pela marca única para garantir que a linha está visível.
  const pesquisa = janela.getByPlaceholder("Código, nome, NIF, BI ou email...");
  await pesquisa.fill(FUNC_CODIGO);
  await pesquisa.press("Enter");
  const btnFicha = janela.locator("table tbody tr", { hasText: FUNC_CODIGO }).first().getByRole("button", { name: /abrir ficha/i });
  await expect(btnFicha).toBeVisible({ timeout: TIMEOUT });
  await btnFicha.click();

  // Na ficha, ir à tab "Contrato" e criar contrato
  await expect(janela.getByText("Ficha do Funcionário", { exact: true })).toBeVisible({ timeout: TIMEOUT });
  await janela.getByRole("button", { name: "Contrato", exact: true }).click();
  await janela.getByRole("button", { name: /novo contrato/i }).click();
  await expect(
    janela.getByRole("heading", { name: "Novo contrato", exact: true })
  ).toBeVisible({ timeout: TIMEOUT });

  // Preencher contrato (os `Label` do diálogo não têm `htmlFor`)
  const dialogoContrato = janela.getByRole("dialog");
  await campoInput(dialogoContrato, "Tipo de contrato").click();
  await janela.getByText("Prazo indeterminado", { exact: true }).click();
  await campoInput(dialogoContrato, "Salário base").fill("150000");
  await campoInput(dialogoContrato, "Data de início").fill("2024-01-15");
  await janela.getByRole("button", { name: /criar contrato/i }).click();
  await expect(janela.getByText("Contrato criado.", { exact: true })).toBeVisible({ timeout: TIMEOUT });

  // Fechar ficha
  await janela.getByRole("button", { name: /cancelar/i }).click();
  await expect(janela.getByText("Ficha do Funcionário", { exact: true })).not.toBeVisible({ timeout: TIMEOUT });

  // IBAN obrigatório para processar - editar funcionário e adicionar IBAN
  const nossaLinha = janela.locator("table tbody tr", { hasText: FUNC_CODIGO }).first();
  await nossaLinha.getByRole("button", { name: /editar/i }).click();
  await expect(janela.getByText("Editar Funcionário", { exact: true })).toBeVisible({ timeout: TIMEOUT });
  await campoInput(janela.getByRole("dialog"), "IBAN").fill("AO06 0000 0000 0000 0000 0000 0");
  await janela.getByRole("button", { name: /guardar/i }).click();
  await expect(janela.getByText("Funcionário atualizado.", { exact: true })).toBeVisible({ timeout: TIMEOUT });

  // Voltar ao dashboard
  await janela.getByRole("link", { name: /inicio|início/i }).first().click();
  await janela.waitForTimeout(500);
}

// ============================================================================
// Helpers de extração de texto
// ============================================================================

/** Localiza um input pelo `<label>` que o antecede (os labels não têm `htmlFor`). */
function campoInput(escopo: Locator, rotulo: string): Locator {
  return escopo.locator(
    `xpath=.//label[contains(normalize-space(.), "${rotulo}")]/following::input[1]`
  );
}

/**
 * Lê o valor de um cartão de resumo do diálogo de processamento: o rótulo e o
 * valor são `<p>` irmãos (o valor vem logo a seguir).
 */
async function extrairTexto(pagina: Page, rotulo: string): Promise<string> {
  try {
    const valor = pagina
      .getByRole("dialog")
      .getByText(rotulo, { exact: true })
      .first()
      .locator("xpath=following-sibling::p[1]");
    return (await valor.textContent({ timeout: 5_000 }))?.trim() || "0";
  } catch {
    return "0";
  }
}

async function extrairTextoMonetario(pagina: Page, rotulo: string): Promise<string> {
  // O total líquido é um `<span>` irmão do rótulo.
  try {
    const valor = pagina
      .getByRole("dialog")
      .getByText(rotulo, { exact: true })
      .first()
      .locator("xpath=following-sibling::span[1]");
    return (await valor.textContent({ timeout: 5_000 }))?.trim() || "0";
  } catch {
    return "0";
  }
}

/** Converte um valor monetário pt-AO ("1.234.567,89 Kz") em número. */
function paraNumero(valor: string): number {
  const limpo = valor.replace(/[^\d.,-]/g, "");
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  return Number(normalizado) || 0;
}