/**
 * @file relatorio-pdf.service.ts
 * @description Constrói o documento A4 dos relatórios analíticos em HTML, para
 * `printToPDF` converter em PDF.
 *
 * ## Porquê HTML e não uma biblioteca de PDF
 *
 * As alternativas eram `pdfkit`, `pdfmake` ou `pdf-lib`. Todas exigem descrever
 * a página em código — largura útil, altura útil, quebras de página, cabeçalho
 * repetido — e as três cobram esse trabalho com linhas de código por detalhe de
 * paginação. Um relatório com 40 clientes tem de partir a tabela a meio da
 * segunda página, repetir o cabeçalho, e manter a coluna monetária alinhada. Em
 * HTML isso é `thead { display: table-header-group }` e `text-align: right`.
 *
 * `printToPDF` é do Chromium e já sabe paginar, repetir cabeçalhos e respectar
 * quebras. Escrever a página em HTML e deixar o Chromium fazer o resto é menos
 * código e melhor resultado.
 *
 * ## Porquê uma janela oculta e não a janela principal
 *
 * `printToPDF` imprime a página *que está a correr*. Imprimir a janela principal
 * daria um PDF com o painel de relatórios inteiro — barras laterais, filtros,
 * navegação, tema escuro — que é uma captura de ecrã com o formato certo, não um
 * documento. Uma `BrowserWindow` invisível com o HTML sozinho dá o documento.
 *
 * A janela é criada fora do sandbox (`sandbox: false`) porque o HTML é gerado
 * pelo processo main e não precisa de privilégios de renderer: o que entra é
 * texto que escapa, nunca marcado como executável.
 */

import { BrowserWindow } from 'electron';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { UserSession } from '../middlewares/rbac.middleware';

type Coluna = { chave: string; titulo: string; numerica?: boolean };
type Tabela = { nome: string; colunas: Coluna[]; linhas: readonly object[] };

export type ContextoPdf = {
  sessao: UserSession;
  titulo: string;
  de: string;
  ate: string;
};

/**
 * Título humano de cada relatório.
 *
 * Vive aqui e não no `montarTabela` porque é uma coisa do PDF: o nome da tabela
 * (`vendas_por_mes`) é um identificador de ficheiro e uma folha de Excel, e
 * "Vendas por Mês" é o que vai escrito em cima de um papel. Derivar o título do
 * identificador por substituição de underscores daria "Vendas Por Mes" — com
 * maiúsculas erradas em cada palavra composta.
 */
const TITULOS: Record<string, string> = {
  vendasPorMes: 'Vendas por mês',
  topArtigos: 'Artigos mais vendidos',
  topClientes: 'Clientes principais',
  fluxoTesourariaPorMes: 'Fluxo de tesouraria por mês',
  stockBaixo: 'Stock abaixo do mínimo',
  valorizacao: 'Valorização de stock',
  ivaPorTaxa: 'IVA por taxa',
  // RH-801 novos relatórios
  folhaVencimentos: 'Folha de vencimentos',
  resumoIrt: 'Resumo IRT',
  resumoInss: 'Resumo INSS',
  mapaFerias: 'Mapa de férias',
  mapaAusencias: 'Mapa de ausências',
  dividasAbertas: 'Dívidas em aberto',
  custoDepartamento: 'Custo por departamento',
  // Contabilidade
  balancete: 'Balancete',
  razao: 'Razão',
  diarios: 'Diários contabilísticos',
  contaCorrente: 'Conta corrente',
  demonstracao: 'Demonstração financeira',
};

export function tituloRelatorio(nome: string): string {
  return TITULOS[nome] ?? nome;
}

/**
 * Formata um valor para a célula.
 *
 * Diverge da formatação do CSV e do Excel numa coisa deliberada: aqui o número
 * é escrito como se lê em Angola e em Portugal — `1 250 000,50` —, enquanto o
 * CSV leva `1250000.5` e o Excel aplica o formato `#,##0.00` à coluna.
 *
 * A locale está presa a `pt-PT` em vez de ser omitida de propósito. Sem o
 * `locale`, `toLocaleString` segue o sistema da máquina: um Windows em inglês
 * imprimia `1,250,000.50` no mesmo documento, e o utilizador não tem forma de
 * saber porque o número mudou de aspecto entre dois dias.
 */
function celula(valor: unknown, numerica: boolean): string {
  if (valor === null || valor === undefined) return '';
  if (!numerica) return String(valor);
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `class="num"` ou nada: um `class=""` vazio em cada célula só ocupa bytes. */
function classeDe(numerica: boolean): string {
  return numerica ? ' class="num"' : '';
}

/**
 * Escapa texto para dentro de HTML.
 *
 * Os valores das linhas vêm de campos que o utilizador escreve — descrição de
 * artigo, nome de cliente. Sem escape, um artigo chamado `<b>Café</b>` partia a
 * linha da tabela e um nome com `&` chegava ao PDF como texto trocado.
 *
 * O que escapa não é executado, porque este documento nunca corre scripts: o
 * HTML vai para um ficheiro temporário aberto por `loadFile`, e não para uma
 * página com `nodeIntegration`.
 */
function esc(valor: unknown): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `2026-01-31` → `31/01/2026`. */
function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Data e hora da geração, no formato que um Angolano leria num papel. */
function geradoEm(): string {
  return new Date().toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * HTML do documento.
 *
 * Os valores de `@page` estão no CSS porque é o único sítio onde o Chromium os
 * lê — não os passa pelo `printToPDF`. A margem de 14mm é a diferença entre uma
 * folha que uma impressora não prende e uma que fica com a primeira linha a
 * centimeters da borda.
 */
function html(contexto: ContextoPdf, tabela: Tabela): string {
  const { sessao } = contexto;

  const cabecalho = [
    `<h1>${esc(contexto.titulo)}</h1>`,
    `<p class="sub">${esc(sessao.empresaNome ?? '—')}${sessao.empresaNif ? ` · NIF ${esc(sessao.empresaNif)}` : ''}</p>`,
  ].join('\n      ');

  const meta = [
    ['Período', `${dataCurta(contexto.de)} a ${dataCurta(contexto.ate)}`],
    ['Emitido por', `${sessao.nomeCompleto} (${sessao.login})`],
    ['Emitido em', geradoEm()],
    ['Registos', String(tabela.linhas.length)],
  ]
    .map(([rotulo, valor]) => `<span><b>${esc(rotulo)}:</b> ${esc(valor)}</span>`)
    .join('\n        ');

  const colunas = tabela.colunas
    .map((c) => `<th${classeDe(c.numerica === true)}>${esc(c.titulo)}</th>`)
    .join('');

  const linhas = tabela.linhas
    .map(
      (linha) =>
        `<tr>${tabela.colunas
          .map((c) => `<td${classeDe(c.numerica === true)}>${esc(celula(linha[c.chave], c.numerica === true))}</td>`)
          .join('')}</tr>`,
    )
    .join('\n          ');

  const vazio = `<tr><td colspan="${tabela.colunas.length}" class="vazio">Sem registos no período.</td></tr>`;

  return `<!doctype html>
<html lang="pt-AO">
  <head>
    <meta charset="utf-8" />
    <title>${esc(contexto.titulo)}</title>
    <style>
      @page { size: A4 portrait; margin: 14mm 12mm 16mm; }

      /* A base do documento é impressa, não mostrada: sem cor de fundo nenhuma,
         e com texto preto. As cores do tema da aplicação imprimem como manchas
         cinzentas e gastam tinta. */
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
        font-size: 9.5pt;
        color: #111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      h1 { font-size: 15pt; margin: 0; letter-spacing: -0.2px; }
      .sub { margin: 2pt 0 0; font-size: 9pt; color: #444; }

      /* Fica no fim da primeira página e não se repete: o cabeçalho da tabela
         é que se repete, e este já diz o que o documento é. */
      .meta {
        margin-top: 8pt;
        padding-top: 6pt;
        border-top: 0.5pt solid #bbb;
        display: flex;
        flex-wrap: wrap;
        gap: 2pt 18pt;
        font-size: 8pt;
        color: #333;
      }

      table {
        width: 100%;
        margin-top: 10pt;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
      }

      /* display: table-header-group é o que faz o Chromium repetir o cabeçalho
         em cada página em que a tabela continua. Sem isto, a segunda página de
         um relatório de clientes aparece com números sem a coluna a que
         pertencem. */
      thead { display: table-header-group; }
      /* Impede que uma linha se parta entre duas páginas, o que produzia meia
         linha no fim de uma folha e meia no topo da seguinte. */
      tr { page-break-inside: avoid; }

      th {
        text-align: left;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #fff;
        background: #1f3a5f;
        padding: 4pt 5pt;
        /* Repete-se também quando a tabela não cabe: é o que o Chromium usa
           quando precisa de painted elements em cada página. */
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      td { padding: 3.5pt 5pt; border-bottom: 0.5pt solid #e3e3e3; vertical-align: top; }
      tbody tr:nth-child(even) td { background: #f6f8fb; }

      .num { text-align: right; white-space: nowrap; }
      .vazio { text-align: center; color: #666; font-style: italic; padding: 14pt 0; }

      .rodape {
        margin-top: 10pt;
        padding-top: 5pt;
        border-top: 0.5pt solid #bbb;
        font-size: 7.5pt;
        color: #666;
        display: flex;
        justify-content: space-between;
      }
    </style>
  </head>
  <body>
    <header>
      ${cabecalho}
      <div class="meta">
        ${meta}
      </div>
    </header>

    <table>
      <thead>
        <tr>${colunas}</tr>
      </thead>
      <tbody>
          ${linhas || vazio}
      </tbody>
    </table>

    <div class="rodape">
      <span>SOC TECHNO · Documento gerado automaticamente. Não tem valor fiscal.</span>
      <span>${esc(tabela.nome.replace(/_/g, ' '))}</span>
    </div>
  </body>
</html>`;
}

/**
 * Converte um relatório num PDF A4.
 *
 * Devolve o buffer e não o caminho: quem chama decide o que fazer com ele, e
 * exportá-lo não é a mesma coisa que o ter gerado. Um `save()` escondido no
 * meio disto transformaria "pede um PDF" em "escreve um ficheiro".
 *
 * O HTML vai para um ficheiro temporário e não para um `data:` URL: há um limite
 * de tamanho no URL, e um relatório de stock com 500 artigos passava-o. Um
 * ficheiro em disco não tem limite.
 */
export async function gerarPdfRelatorio(
  contexto: ContextoPdf,
  tabela: Tabela,
): Promise<Buffer> {
  const ficheiro = join(tmpdir(), `doraerp-relatorio-${randomUUID()}.html`);
  await writeFile(ficheiro, html(contexto, tabela), 'utf8');

  // `show: false` não impede a janela de existir: sem isto não há `webContents`
  // para imprimir. `webPreferences.sandbox: false` e `nodeIntegration` desligado
  // porque este HTML não é código — é o output de uma tabela.
  const janela = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: {
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false,
    },
  });

  try {
    await janela.loadFile(ficheiro);
    // `javascript: false` não impede o layout, mas sem este passo o Chromium
    // pode imprimir antes das webfonts e do tableau assentarem.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    return await janela.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      margins: { marginType: 'none' },
      // Sem isto, um relatório de 2000 linhas saía com "1" em todas as páginas.
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:7pt;color:#666;padding:0 12mm;display:flex;justify-content:space-between;">' +
        '<span>SOC TECHNO · Documento gerado automaticamente. Não tem valor fiscal.</span>' +
        '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>' +
        '</div>',
      preferCSSPageSize: true,
    });
  } finally {
    // O `finally` e não o fim do `try`: um `printToPDF` que lance deixa o
    // ficheiro temporário em disco para sempre, e a pasta de temporários do
    // utilizador não é o sítio para acumular ficheiros que ninguém pediu.
    janela.destroy();
    await unlink(ficheiro).catch(() => undefined);
  }
}
