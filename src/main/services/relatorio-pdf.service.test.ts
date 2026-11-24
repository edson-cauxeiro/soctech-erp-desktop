/**
 * @file relatorio-pdf.service.test.ts
 * @description Testes do gerador de PDF dos relatórios.
 *
 * O PDF não é gerado aqui — `printToPDF` é do Chromium e não corre em Vitest. O
 * que se testa é o que determina se o documento sai correcto:
 *
 * 1. **O HTML.** Um `&` num nome de cliente, ou um `<b>` numa descrição de
 *    artigo, parte a linha da tabela ou chega trocado ao papel. O escape é a
 *    diferença entre um relatório que se lê e um que se lê torto.
 *
 * 2. **A paginação.** As propriedades passadas ao `printToPDF` decidem se a
 *    segunda página repete o cabeçalho da tabela e se o rodapé tem número de
 *    página. Um relatório de 2000 linhas com "1" em todas as páginas não é
 *    utilizável, e a falha não aparece em nenhum ecrã.
 *
 * 3. **A limpeza.** A janela oculta e o ficheiro temporário saem sempre, mesmo
 *    quando a impressão falha. Deixar ambos para trás a cada exportação cancelada
 *    ou com erro enche a pasta de temporários do utilizador sem ninguém pedir.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gerarPdfRelatorio, tituloRelatorio } from './relatorio-pdf.service';
import type { UserSession } from '../middlewares/rbac.middleware';

/**
 * Os quatro mocks em `vi.hoisted`, pelo mesmo motivo do ficheiro do controlador:
 * o `vi.mock` é içado para o topo do ficheiro e um mock definido abaixo de um
 * `import` apareceria ainda por inicializar quando a fábrica o executa.
 */
const { writeFile, unlink, loadFile, printToPDF, destroy } = vi.hoisted(() => ({
  writeFile: vi.fn(async (_caminho: string, _conteudo: string): Promise<void> => undefined),
  unlink: vi.fn(async (_caminho: string): Promise<void> => undefined),
  loadFile: vi.fn(async (_ficheiro: string): Promise<void> => undefined),
  printToPDF: vi.fn(async (_opcoes: unknown): Promise<Buffer> => Buffer.from('%PDF-1.4 fake')),
  destroy: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  // `importOriginal` e não um inventário de funções: o serviço e os testes
  // usam mais do que `writeFile` e `unlink`, e um mock parcial escrito à mão
  // rebenta assim que alguém acrescenta uma importação.
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile, unlink };
});

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { printToPDF };
    loadFile = loadFile;
    destroy = destroy;
  },
}));

/**
 * O HTML escrito, com os espaços normalizados.
 *
 * `toLocaleString('pt-PT')` separa os milhares com U+202F (espaço fino não
 * separável) e não com o espaço normal. Escrever o espaço no teste à mão
 * compará-lo-ia com U+0020 e falharia por um caractere invisível.
 */
function htmlEscrito(): string {
  const [, conteudo] = writeFile.mock.calls.at(-1) ?? [];
  return String(conteudo ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

const SESSAO: UserSession = {
  id: 'util_1',
  login: 'ana.marques',
  nomeCompleto: 'Ana Marques',
  email: 'ana@doraerp.ao',
  perfilId: 'perfil_1',
  perfilNome: 'Contabilista',
  permissoes: {},
  empresaConfigId: 'empresa_1',
  empresaNome: 'DoraERP, Lda',
  empresaNif: '5000000001',
};

const TABELA = {
  nome: 'clientes',
  colunas: [
    { chave: 'nome', titulo: 'Cliente' },
    { chave: 'total', titulo: 'Total facturado', numerica: true },
  ],
  linhas: [
    { nome: 'Sonangol Distribuição', total: 1250000.5 },
    { nome: 'Café Ola & Chá, Lda', total: 899.99 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tituloRelatorio', () => {
  it('traduz o identificador para um título de documento', () => {
    expect(tituloRelatorio('topClientes')).toBe('Clientes principais');
    expect(tituloRelatorio('vendasPorMes')).toBe('Vendas por mês');
  });

  it('não inventa um título para um relatório que não conhece', () => {
    // Um relatório novo que chegue ao serviço sem título é um bug de outro
    // sítio; devolver o identificador deixa-o visível no PDF em vez de
    // trocar `vendasPorMes` por `undefined`.
    expect(tituloRelatorio('relatorioNovo')).toBe('relatorioNovo');
  });
});

describe('gerarPdfRelatorio', () => {
  const contexto = { sessao: SESSAO, titulo: 'Clientes principais', de: '2026-01-01', ate: '2026-12-31' };

  it('devolve o buffer do Chromium, e não o caminho do ficheiro', async () => {
    const pdf = await gerarPdfRelatorio(contexto, TABELA);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('repete o cabeçalho da tabela em cada página', async () => {
    await gerarPdfRelatorio(contexto, TABELA);
    const html = htmlEscrito();

    // `table-header-group` é o que faz o Chromium repetir o cabeçalho. É a
    // diferença entre a segunda página ter títulos ou apenas números.
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('numera as páginas no rodapé', async () => {
    await gerarPdfRelatorio(contexto, TABELA);

    const opcoes = printToPDF.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(opcoes.displayHeaderFooter).toBe(true);
    expect(String(opcoes.footerTemplate)).toContain('class="pageNumber"');
    expect(String(opcoes.footerTemplate)).toContain('class="totalPages"');
    // O `@page` do CSS define a margem. Se `preferCSSPageSize` não estivesse,
    // o Chromium usaria a margem por omissão do `printToPDF` e o `@page`
    // seria ignorado.
    expect(opcoes.preferCSSPageSize).toBe(true);
  });

  it('imprime A4 vertical com fundo', async () => {
    await gerarPdfRelatorio(contexto, TABELA);
    const opcoes = printToPDF.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(opcoes.pageSize).toBe('A4');
    expect(opcoes.landscape).toBe(false);
    // Sem `printBackground`, o cabeçalho azul da tabela saía branco.
    expect(opcoes.printBackground).toBe(true);
  });

  it('abre o HTML numa janela que não aparece', async () => {
    await gerarPdfRelatorio(contexto, TABELA);

    expect(loadFile).toHaveBeenCalledTimes(1);
    // O HTML vai para disco e não para um `data:` URL: um relatório de stock
    // com 500 artigos passa o limite de tamanho do URL.
    const [ficheiro] = loadFile.mock.calls.at(-1) ?? [];
    expect(String(ficheiro)).toMatch(/doraerp-relatorio-.*\.html$/);
  });

  it('escapa HTML que veio de dados do utilizador', async () => {
    await gerarPdfRelatorio(
      contexto,
      {
        nome: 'x',
        colunas: [{ chave: 'descricao', titulo: 'Descrição' }],
        linhas: [{ descricao: 'Café <b>Ola</b> & Chá "especial"' }],
      },
    );

    const html = htmlEscrito();
    expect(html).toContain('Café &lt;b&gt;Ola&lt;/b&gt; &amp; Chá &quot;especial&quot;');
    // O `<b>` original não pode sobreviver: um `<td>` a partir de um nome de
    // artigo trunca a coluna e deslocava todas as outras.
    expect(html).not.toContain('<b>Ola</b>');
  });

  it('formata os números à portuguesa e alinha à direita', async () => {
    await gerarPdfRelatorio(contexto, TABELA);
    const html = htmlEscrito();

    expect(html).toContain('1 250 000,50');
    expect(html).toContain('899,99');
    expect(html).toContain('class="num"');
    // A máquina pode estar em inglês; se a locale não estivesse presa, saía
    // `1,250,000.50` e o mesmo relatório mudava de aspecto entre máquinas.
    expect(html).not.toContain('1,250,000.50');
  });

  it('escreve uma linha explícita quando o relatório vem vazio', async () => {
    await gerarPdfRelatorio(contexto, { ...TABELA, linhas: [] });
    // Sem isto saía uma folha em branco com o título em cima, que se lê como
    // "não houve vendas" em vez de "o relatório não tinha linhas".
    expect(htmlEscrito()).toContain('Sem registos no período.');
  });

  it('escreve empresa, NIF, período e autor no cabeçalho', async () => {
    await gerarPdfRelatorio(contexto, TABELA);
    const html = htmlEscrito();

    expect(html).toContain('DoraERP, Lda');
    expect(html).toContain('5000000001');
    expect(html).toContain('01/01/2026 a 31/12/2026');
    expect(html).toContain('Ana Marques');
  });

  it('limpa a janela e o temporário', async () => {
    await gerarPdfRelatorio(contexto, TABELA);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledTimes(1);
    const [temporario] = unlink.mock.calls.at(-1) ?? [];
    const [carregado] = loadFile.mock.calls.at(-1) ?? [];
    expect(temporario).toBe(carregado);
  });

  it('limpa mesmo quando a impressão falha', async () => {
    printToPDF.mockRejectedValueOnce(new Error('sem memória para a página'));

    await expect(gerarPdfRelatorio(contexto, TABELA)).rejects.toThrow('sem memória');

    // O `finally` e não o fim do `try`: um erro deixaria a janela aberta e o
    // HTML temporário em disco a cada tentativa.
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledTimes(1);
  });
});
