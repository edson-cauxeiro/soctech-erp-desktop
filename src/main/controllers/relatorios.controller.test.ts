/**
 * @file relatorios.controller.test.ts
 * @description Testes de autorização e de exportação dos relatórios.
 *
 * Duas classes de bug são o alvo:
 *
 * 1. **Empresa errada.** Um relatório é a vista mais aberta que existe sobre o
 *    negócio — vendas, stock, tesouraria e a dívida de cada cliente. Um perfil
 *    com `relatorios: read` que troque o `empresaId` no payload lê a empresa
 *    inteira. A empresa da sessão tem de ser a única autoridade.
 *
 * 2. **CSV que não abre.** O separador e o BOM não são detalhes: o Excel em
 *    português separa por `;`, e sem BOM abre os acentos como `Ã§`. Um
 *    relatório com os nomes dos clientes legíveis é o mínimo aceitável, e é
 *    o que estes testes fixam.
 *
 * 3. **Exportar sem deixar rasto.** O ficheiro sai da aplicação para o disco.
 *    Um canal de exportação sem registo na auditoria é uma forma de copiar a
 *    dívida de todos os clientes para fora sem que ninguém fique a saber.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelatoriosController } from './relatorios.controller';
import ExcelJS from 'exceljs';
import type { IpcResponse } from '../utils/ipc-response';
import type { UserSession } from '../middlewares/rbac.middleware';

/**
 * Os dois mocks, criados dentro de `vi.hoisted`.
 *
 * O `vi.mock` é içado para o topo do ficheiro, antes de qualquer `const`: um
 * mock definido acima e referenciado dentro da fábrica apareceria ainda por
 * inicializar. `vi.hoisted` é o sítio onde isso deixa de ser um problema.
 */
const { showSaveDialog, writeFile, gerarPdfRelatorio } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(
    async (
      _janela: unknown,
      _opcoes: unknown,
    ): Promise<{ canceled: boolean; filePath?: string }> => ({ canceled: true }),
  ),
  writeFile: vi.fn(async (_caminho: string, _conteudo: Buffer): Promise<void> => undefined),
  // O PDF real abre uma janela do Chromium, o que não existe em Vitest. O que o
  // controlador tem a testar é se pede o PDF e escreve o buffer devolvido — e o
  // gerador tem o seu próprio ficheiro de testes.
  gerarPdfRelatorio: vi.fn(async (): Promise<Buffer> => Buffer.from('%PDF-1.4 fake')),
}));

/**
 * O `dialog` e o `writeFile` são substituídos para que o teste não abra
 * diálogos nem toque no disco. O resto do módulo continua a ser o real: um
 * mock do controlador inteiro não diria nada sobre a autorização.
 */
vi.mock('electron', () => ({
  dialog: { showSaveDialog },
  BrowserWindow: { fromWebContents: () => ({ id: 1 }) },
  ipcMain: { handle: () => undefined },
}));

vi.mock('../services/relatorio-pdf.service', () => ({
  gerarPdfRelatorio,
  tituloRelatorio: (nome: string) => nome,
}));

vi.mock('node:fs/promises', () => ({
  writeFile,
}));

/**
 * Lê o código de erro de uma resposta que se espera ter falhado.
 *
 * A resposta é uma união `success: true | false`, e o TypeScript só estreita o
 * tipo depois de `success` ser provado falso. Um `expect(...).toBe(false)` não
 * conta para o compilador, daí a função.
 */
function codigoDe(resposta: IpcResponse<unknown>): string | undefined {
  return resposta.success ? undefined : resposta.error.code;
}

const EMPRESA_SESSAO = 'empresa_da_sessao';
const EMPRESA_OUTRA = 'empresa_outra';

function sessao(sobreposicoes: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: { relatorios: ['read', 'write'] },
    empresaConfigId: EMPRESA_SESSAO,
    ...sobreposicoes,
  };
}

/** As linhas de `vendasPorMes`, o relatório usado nos testes de exportação. */
const VENDAS = [
  { mes: '2026-01', total: 100, quantidade: 2 },
  { mes: '2026-02', total: 250, quantidade: 3 },
];

function criarController(sessaoActual: UserSession | null) {
  const servico = {
    relatorioCompleto: vi.fn(async () => {
      throw new Error('relatorioCompleto não devia ter sido chamado');
    }),
    resumoExecutivo: vi.fn(async () => {
      throw new Error('resumoExecutivo não devia ter sido chamado');
    }),
    vendasPorMes: vi.fn(async () => VENDAS),
    fluxoTesourariaPorMes: vi.fn(async () => {
      throw new Error('fluxoTesourariaPorMes não devia ter sido chamado');
    }),
    topArtigos: vi.fn(async () => {
      throw new Error('topArtigos não devia ter sido chamado');
    }),
    topClientes: vi.fn(async () => {
      throw new Error('topClientes não devia ter sido chamado');
    }),
    stockBaixo: vi.fn(async () => {
      throw new Error('stockBaixo não devia ter sido chamado');
    }),
    valorizacaoStock: vi.fn(async () => {
      throw new Error('valorizacaoStock não devia ter sido chamado');
    }),
    ivaPorTaxa: vi.fn(async () => {
      throw new Error('ivaPorTaxa não devia ter sido chamado');
    }),
  };

  const audit = {
    registar: vi.fn(
      async (_registo: {
        empresaId: string;
        utilizadorId?: string | null;
        modulo?: string;
        acao: string;
        entidade: string;
        descricao: string;
        dadosNovos?: unknown;
      }): Promise<string> => 'audit_1',
    ),
  };
  const auth = { getCurrentSession: () => sessaoActual };
  const controller = new RelatoriosController(auth as never, servico as never, audit as never);
  return { controller, servico, audit };
}

const periodo = { de: '2026-01-01', ate: '2026-12-31' };

describe('RelatoriosController — empresa da sessão', () => {
  it('recusa o relatório completo de outra empresa', async () => {
    const { controller, servico } = criarController(sessao());

    const resposta = await controller.completo({ empresaId: EMPRESA_OUTRA, ...periodo });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('FORBIDDEN');
    // O erro tem de ser antes do acesso a dados, não depois.
    expect(servico.relatorioCompleto).not.toHaveBeenCalled();
  });

  it('recusa o resumo executivo de outra empresa', async () => {
    const { controller, servico } = criarController(sessao());

    const resposta = await controller.resumoExecutivo({ empresaId: EMPRESA_OUTRA, ...periodo });

    expect(resposta.success).toBe(false);
    expect(servico.resumoExecutivo).not.toHaveBeenCalled();
  });

  it('recusa as vendas por mês de outra empresa', async () => {
    const { controller, servico } = criarController(sessao());

    const resposta = await controller.vendasPorMes({ empresaId: EMPRESA_OUTRA, ...periodo });

    expect(resposta.success).toBe(false);
    expect(servico.vendasPorMes).not.toHaveBeenCalled();
  });

  it('recusa o fluxo de tesouraria de outra empresa', async () => {
    const { controller, servico } = criarController(sessao());

    const resposta = await controller.fluxoTesourariaPorMes({ empresaId: EMPRESA_OUTRA, ...periodo });

    expect(resposta.success).toBe(false);
    expect(servico.fluxoTesourariaPorMes).not.toHaveBeenCalled();
  });

  it('recusa o IVA por taxa de outra empresa', async () => {
    const { controller, servico } = criarController(sessao());

    const resposta = await controller.ivaPorTaxa({ empresaId: EMPRESA_OUTRA, ...periodo });

    expect(resposta.success).toBe(false);
    expect(servico.ivaPorTaxa).not.toHaveBeenCalled();
  });

  it('recusa exportar o relatório de outra empresa', async () => {
    const { controller, servico } = criarController(sessao());

    const resposta = await controller.exportar(
      { empresaId: EMPRESA_OUTRA, relatorio: 'vendasPorMes', formato: 'csv', ...periodo },
      null,
    );

    expect(resposta.success).toBe(false);
    expect(servico.vendasPorMes).not.toHaveBeenCalled();
  });
});

describe('RelatoriosController — permissões', () => {
  it('recusa leitura sem permissão de relatórios', async () => {
    const { controller, servico } = criarController(sessao({ permissoes: { vendas: ['read'] } }));

    const resposta = await controller.completo({ empresaId: EMPRESA_SESSAO, ...periodo });

    expect(resposta.success).toBe(false);
    expect(servico.relatorioCompleto).not.toHaveBeenCalled();
  });

  it('recusa exportar com apenas leitura', async () => {
    // Ler um relatório deixa-o no ecrã; exportar escreve um ficheiro fora da
    // aplicação, onde a auditoria já não o vê. Por isso exportar é `write`.
    const soLeitura = sessao({ permissoes: { relatorios: ['read'] } });
    const { controller, servico } = criarController(soLeitura);

    const resposta = await controller.exportar(
      { empresaId: EMPRESA_SESSAO, relatorio: 'vendasPorMes', formato: 'csv', ...periodo },
      null,
    );

    expect(resposta.success).toBe(false);
    expect(servico.vendasPorMes).not.toHaveBeenCalled();
  });

  it('recusa tudo sem sessão', async () => {
    const { controller, servico } = criarController(null);

    const resposta = await controller.completo({ empresaId: EMPRESA_SESSAO, ...periodo });

    expect(resposta.success).toBe(false);
    expect(servico.relatorioCompleto).not.toHaveBeenCalled();
  });
});

describe('RelatoriosController — validação do período', () => {
  it('recusa um período invertido', async () => {
    const { controller } = criarController(sessao());

    const resposta = await controller.completo({
      empresaId: EMPRESA_SESSAO,
      de: '2026-12-31',
      ate: '2026-01-01',
    });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('VALIDATION_ERROR');
  });

  it('recusa um período de mais de três anos', async () => {
    // Uma janela de dez anos sobre a tabela de movimentos transforma um clique
    // num ecrã congelado. Melhor um erro de validação dito ao utilizador.
    const { controller } = criarController(sessao());

    const resposta = await controller.completo({
      empresaId: EMPRESA_SESSAO,
      de: '2020-01-01',
      ate: '2026-12-31',
    });

    expect(resposta.success).toBe(false);
  });

  it('recusa uma data mal formada', async () => {
    const { controller } = criarController(sessao());

    const resposta = await controller.completo({
      empresaId: EMPRESA_SESSAO,
      de: '01/01/2026',
      ate: '2026-12-31',
    });

    expect(resposta.success).toBe(false);
  });
});

describe('RelatoriosController — CSV', () => {
  const tabela = {
    nome: 'clientes',
    colunas: [
      { chave: 'nome', titulo: 'Cliente' },
      { chave: 'total', titulo: 'Total', numerica: true },
    ],
    linhas: [
      { nome: 'Construções, Lda.', total: 1234.5 },
      { nome: 'Oficinas; José & Cia', total: 99 },
      { nome: 'Com "aspas" dentro', total: 7.25 },
    ],
  };

  // O BOM no início seria lido como parte da primeira coluna. Tira-se para o
  // teste poder comparar o texto, depois de o BOM ter sido verificado à parte.
  const texto = (buffer: Buffer) => buffer.toString('utf8').replace(/^\uFEFF/, '');

  it('escreve o BOM para o Excel não destruir os acentos', () => {
    const buffer = RelatoriosController.paraCsv(tabela);
    // Sem BOM, o Excel abre "Construções" como "ConstruÃ§Ãµes".
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
  });

  it('separa colunas por ponto e vírgula', () => {
    // O Excel em português abre `;` como separador; com `,` metia todas as
    // colunas numa só.
    const primeira = texto(RelatoriosController.paraCsv(tabela)).split('\r\n')[0];
    expect(primeira).toBe('Cliente;Total');
  });

  it('põe entre aspas o valor que contém o separador', () => {
    const linhas = texto(RelatoriosController.paraCsv(tabela)).split('\r\n');
    // O nome tem `;` dentro, que é o separador: sem aspas o ficheiro
    // desdobrava-se em três colunas.
    expect(linhas[2]).toBe('"Oficinas; José & Cia";99');
  });

  it('duplica as aspas segundo o RFC 4180', () => {
    const linhas = texto(RelatoriosController.paraCsv(tabela)).split('\r\n');
    expect(linhas[3]).toBe('"Com ""aspas"" dentro";7.25');
  });

  it('escreve o total sem aspas quando não tem separador', () => {
    const linhas = texto(RelatoriosController.paraCsv(tabela)).split('\r\n');
    expect(linhas[1]).toBe('Construções, Lda.;1234.5');
  });

  it('preserva os acentos em UTF-8', () => {
    expect(texto(RelatoriosController.paraCsv(tabela))).toContain('Construções');
  });

  it('escreve apenas o cabeçalho quando não há linhas', () => {
    const buffer = RelatoriosController.paraCsv({ ...tabela, linhas: [] });
    const linhas = texto(buffer).split('\r\n').filter((l) => l.length > 0);
    expect(linhas).toEqual(['Cliente;Total']);
  });
});

/**
 * Carrega um buffer no ExcelJS.
 *
 * O ExcelJS declara um `Buffer` próprio (`interface Buffer extends ArrayBuffer`)
 * em vez de importar o do Node, e o Buffer do Node não é atribuível a essa
 * interface. O valor em tempo de execução é o mesmo Buffer; só a declaração
 * não casa.
 */
function carregar(livro: ExcelJS.Workbook, buffer: Buffer): Promise<ExcelJS.Workbook> {
  return livro.xlsx.load(buffer as unknown as ArrayBuffer);
}

describe('RelatoriosController — Excel', () => {
  it('produz um buffer que o ExcelJS volta a ler', async () => {
    // Um `writeBuffer` que não volta a ler não prova nada: um ficheiro
    // pode passar a validação estrutural e falhar só quando alguém o abre no
    // Excel.
    const buffer = await RelatoriosController.paraExcel([
      {
        nome: 'clientes',
        colunas: [
          { chave: 'nome', titulo: 'Cliente' },
          { chave: 'total', titulo: 'Total', numerica: true },
        ],
        linhas: [{ nome: 'Construções, Lda.', total: 1234.5 }],
      },
    ]);

    const livro = new ExcelJS.Workbook();
    await carregar(livro, buffer);

    expect(livro.worksheets).toHaveLength(1);
    const folha = livro.worksheets[0];
    expect(folha.getRow(1).getCell(1).value).toBe('Cliente');
    expect(folha.getRow(2).getCell(1).value).toBe('Construções, Lda.');
    expect(folha.getRow(2).getCell(2).value).toBe(1234.5);
  });

it('trunca o nome da folha ao limite do Excel', async () => {
    const buffer = await RelatoriosController.paraExcel([
      {
        nome: 'relatorio_com_nome_muito_comprido_para_exceder_o_limite',
        colunas: [{ chave: 'a', titulo: 'A' }],
        linhas: [{ a: 1 }],
      },
    ]);

    const livro = new ExcelJS.Workbook();
    await carregar(livro, buffer);
    expect(livro.worksheets[0].name.length).toBeLessThanOrEqual(31);
  });
});

describe('RelatoriosController — exportação', () => {
  const pedido = {
    empresaId: EMPRESA_SESSAO,
    relatorio: 'vendasPorMes',
    formato: 'csv',
    ...periodo,
  } as const;

  beforeEach(() => {
    showSaveDialog.mockReset();
    writeFile.mockClear();
    gerarPdfRelatorio.mockClear();
  });

  it('escreve o ficheiro no sítio escolhido', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/vendas.csv' });
    const { controller } = criarController(sessao());

    const resposta = await controller.exportar({ ...pedido }, { id: 1 } as never);

    expect(resposta.success).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toBe('C:/tmp/vendas.csv');

    const conteudo = (writeFile.mock.calls[0][1] as Buffer).toString('utf8').replace(/^\ufeff/, '');
    expect(conteudo).toContain('Mês;Total;Documentos');
    expect(conteudo).toContain('2026-01;100;2');
  });

  it('sugere um nome de ficheiro com o relatório e o período', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/vendas.csv' });
    const { controller } = criarController(sessao());

    await controller.exportar({ ...pedido }, { id: 1 } as never);

    const opcoes = showSaveDialog.mock.calls[0][1] as { defaultPath: string };
    expect(opcoes.defaultPath).toBe('relatorio_vendas_por_mes_2026-01-01_2026-12-31.csv');
  });

  it('regista a exportação na auditoria', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/vendas.csv' });
    const { controller, audit } = criarController(sessao());

    await controller.exportar({ ...pedido }, { id: 1 } as never);

    expect(audit.registar).toHaveBeenCalledTimes(1);
    const registo = audit.registar.mock.calls[0][0];
    expect(registo.acao).toBe('exportar');
    expect(registo.modulo).toBe('relatorios');
    expect(registo.empresaId).toBe(EMPRESA_SESSAO);
    expect(registo.utilizadorId).toBe('util_1');
    // O caminho do ficheiro é a informação que torna o registo útil: sem ele
    // o log só sabe que "alguma vez" foi exportado.
    expect((registo.dadosNovos as { ficheiro: string }).ficheiro).toBe('C:/tmp/vendas.csv');
  });

  it('devolve cancelado sem escrever nem auditar', async () => {
    // Fechar o diálogo não é um erro: mostrar uma mensagem vermelha por isso
    // ensina o utilizador a desconfiar das mensagens vermelhas.
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    const { controller, audit } = criarController(sessao());

    const resposta = await controller.exportar({ ...pedido }, { id: 1 } as never);

    expect(resposta.success).toBe(true);
    // Narrowing: `success` tem de ser provado falso por uma asserção que o
    // compilador veja, e `toBe(true)` não conta.
    if (!resposta.success) throw new Error('a exportação cancelada devia ser sucesso');
    expect(resposta.data).toMatchObject({ cancelado: true });
    expect(writeFile).not.toHaveBeenCalled();
    expect(audit.registar).not.toHaveBeenCalled();
  });

  it('escreve o PDF e audit-o como PDF', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/clientes.pdf' });
    const { controller, audit } = criarController(sessao());

    const resposta = await controller.exportar(
      { ...pedido, formato: 'pdf' },
      { id: 1 } as never,
    );

    expect(resposta.success).toBe(true);
    expect(gerarPdfRelatorio).toHaveBeenCalledTimes(1);

    // O título vem do nome do relatório, e não do identificador da folha: um
    // PDF com "vendasPorMes" escrito em cima não vai para o contador.
    const [contexto, tabela] = gerarPdfRelatorio.mock.calls[0] as unknown as [
      { titulo: string; de: string; ate: string },
      { colunas: unknown[] },
    ];
    expect(contexto.titulo).toBe('vendasPorMes');
    expect(contexto.de).toBe(periodo.de);
    expect(contexto.ate).toBe(periodo.ate);
    expect(tabela.colunas).toHaveLength(3);

    // O buffer do Chromium tem de ser o que vai para o disco. Se o
    // controlador convertesse para string, o ficheiro saía com dois bytes de
    // lixo no início e o Acrobat recusava-o.
    expect(writeFile.mock.calls[0][0]).toBe('C:/tmp/clientes.pdf');
    expect((writeFile.mock.calls[0][1] as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const registo = audit.registar.mock.calls[0][0];
    expect((registo.dadosNovos as { formato: string }).formato).toBe('pdf');
  });

  it('oferece ao utilizador o filtro do PDF, e não o do Excel', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/clientes.pdf' });
    const { controller } = criarController(sessao());

    await controller.exportar({ ...pedido, formato: 'pdf' }, { id: 1 } as never);

    const opcoes = showSaveDialog.mock.calls[0][1] as {
      defaultPath: string;
      filters: { name: string; extensions: string[] }[];
    };
    expect(opcoes.defaultPath.endsWith('.pdf')).toBe(true);
    // A extensão e o filtro têm de concordar: um `.pdf` num filtro de Excel
    // não dá erro, dá um ficheiro que ninguém abre.
    expect(opcoes.filters[0].extensions).toEqual(['pdf']);
  });

  it('não inventa um PDF se o diálogo for cancelado', async () => {
    // Abrir a janela oculta do Chromium antes de o utilizador escolher o sítio
    // gastaria memória e tempo para um ficheiro que ninguém pediu.
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    const { controller } = criarController(sessao());

    await controller.exportar({ ...pedido, formato: 'pdf' }, { id: 1 } as never);

    expect(gerarPdfRelatorio).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('recusa exportar sem janela principal', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/vendas.csv' });
    const { controller } = criarController(sessao());

    const resposta = await controller.exportar({ ...pedido }, null);

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('WINDOW_NOT_FOUND');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('recusa um formato desconhecido', async () => {
    const { controller } = criarController(sessao());

    const resposta = await controller.exportar(
      { ...pedido, formato: 'ods' },
      { id: 1 } as never,
    );

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('VALIDATION_ERROR');
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

  it('recusa um relatório desconhecido', async () => {
    const { controller } = criarController(sessao());

    const resposta = await controller.exportar(
      { ...pedido, relatorio: 'lucro_bruto' },
      { id: 1 } as never,
    );

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('VALIDATION_ERROR');
  });
});
