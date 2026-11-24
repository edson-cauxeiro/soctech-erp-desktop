/**
 * @file relatorios.controller.ts
 * @description Controlador IPC dos relatórios analíticos (SPRINT 6).
 *
 * Duas regras valem para todas as rotas e por isso valem aqui uma vez só:
 *
 * 1. **A empresa vem sempre da sessão.** O `empresaId` do payload é conferido
 *    contra a sessão e nunca a substitui. Um relatório é a vista mais aberta que
 *    existe sobre o negócio — vendas, stock, tesouraria e até a dívida de cada
 *    cliente. Um relatório sem este filtro é a forma mais simples de um perfil
 *    com `relatorios: read` ler a empresa toda.
 *
 * 2. **Consultar não é exportar.** Um relatório lido fica no ecrã; um ficheiro
 *    exportado sai da aplicação e vai para o sistema de ficheiros, onde a
 *    auditoria da aplicação já não o vê. Por isso a exportação exige `write`, e
 *    é registada.
 *
 * Os relatórios são só de leitura quanto a dados de negócio, mas a exportação
 * escreve em disco, e é por isso que `write` aparece nos canais de exportação
 * em vez de `read`.
 */

import { writeFile } from 'node:fs/promises';
import { dialog, BrowserWindow } from 'electron';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { IpcResponse, ok, err } from '../utils/ipc-response';
import { AppError, ForbiddenError } from '../utils/errors';
import { requirePermission, type UserSession } from '../middlewares/rbac.middleware';
import { authService, type AuthService } from '../services/auth.service';
import { auditService, type AuditService } from '../services/audit.service';
import {
  relatoriosService,
  RelatoriosService,
  type FiltroRelatorio,
  type RelatorioCompleto,
} from '../services/relatorios.service';
// Validadores locais para relatórios analíticos (SPRINT 6)
const exportarSchema = z.object({
  relatorio: z.string(),
  formato: z.enum(['csv', 'xlsx', 'pdf']),
  limite: z.number().optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
  empresaId: z.string().optional(),
});
const relatorioPeriodoSchema = z.object({
  de: z.string().optional(),
  ate: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  empresaId: z.string().optional(),
}).refine((data) => {
  const de = data.de ?? data.dataInicio;
  const ate = data.ate ?? data.dataFim;
  if (de && ate) {
    return new Date(de) <= new Date(ate);
  }
  return true;
}, {
  message: 'A data de início não pode ser posterior à data de fim.',
  path: ['de'],
});
const validar = (schema: z.ZodSchema<any>, data: unknown) => schema.parse(data);
type ExportarParams = z.infer<typeof exportarSchema>;
import { gerarPdfRelatorio, tituloRelatorio } from '../services/relatorio-pdf.service';

/**
 * Rótulos do diálogo de gravação, por formato.
 *
 * Uma tabela em vez de um ternário dentro da chamada: o `showSaveDialog` ficava
 * com um ternário de três ramos a meio de um objecto de cinco campos, e a
 * extensão e o rótulo tinham de concordar — o que é fácil de quebrar em silêncio,
 * porque um `.xlsx` num filtro de CSV não dá erro nenhum.
 */
const FILTROS_GUARDA: Record<'csv' | 'xlsx' | 'pdf', string> = {
  csv: 'CSV (*.csv)',
  xlsx: 'Excel (*.xlsx)',
  pdf: 'PDF (*.pdf)',
};

/**
 * Linhas que uma exportação pode ter, por tipo de relatório.
 *
 * As linhas são os tipos concretos do serviço (`SerieMensal`, `LinhaTopArtigo`,
 * ...), não `Record<string, unknown>`. A index signature não é necessária: o
 * acesso por chave acontece em `paraCsv`/`paraExcel`, e esse acesso só é
 * válido porque quem construiu a tabela escolheu colunas que existem nas
 * linhas.
 */
export type Coluna = {
  chave: string;
  titulo: string;
  /** Coluna monetária ou de quantidade: alinhada à direita, com separador de
   * milhares e duas casas. */
  numerica?: boolean;
};

export type Tabela = {
  nome: string;
  colunas: Coluna[];
  linhas: readonly object[];
};

export class RelatoriosController {
  private auth: AuthService;
  private relatorios: RelatoriosService;
  private audit: AuditService;

  constructor(
    auth: AuthService = authService,
    relatorios: RelatoriosService = relatoriosService,
    audit: AuditService = auditService,
  ) {
    this.auth = auth;
    this.relatorios = relatorios;
    this.audit = audit;
  }

  /**
   * Relatório completo do período, para o ecrã carregar com um pedido.
   *
   * `Promise.all` dentro do serviço, e não aqui: são consultas independentes e
   * o ganho de as correr em paralelo é o mesmo esteja o paralelismo numa camada
   * ou noutra. O que o serviço garante é que todas usam o mesmo filtro, o que
   * aqui não era garantido se cada rota montasse o seu.
   */
  async completo(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar relatório', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.relatorioCompleto(filtro);
    });
  }

  async resumoExecutivo(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar resumo executivo', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.resumoExecutivo(filtro);
    });
  }

  async vendasPorMes(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar vendas por mês', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.vendasPorMes(filtro);
    });
  }

  async fluxoTesourariaPorMes(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar fluxo de tesouraria', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.fluxoTesourariaPorMes(filtro);
    });
  }

  async topArtigos(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar artigos mais vendidos', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      const limite = this.limiteDe(payload);
      return this.relatorios.topArtigos(filtro, limite);
    });
  }

  async topClientes(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar clientes principais', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      const limite = this.limiteDe(payload);
      return this.relatorios.topClientes(filtro, limite);
    });
  }

  async stockBaixo(): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar stock baixo', async () => {
      // Sem filtro de período: o stock baixo é um estado actual, não uma
      // janela do passado. Pedir um período aqui só faria o utilizador pensar
      // que o número depende de uma data que não influencia.
      return this.relatorios.stockBaixo();
    });
  }

  async valorizacao(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar valorização de stock', async () => {
      return this.relatorios.valorizacaoStock(this.limiteDe(payload, 25));
    });
  }

  async ivaPorTaxa(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar IVA por taxa', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.ivaPorTaxa(filtro);
    });
  }

  // RH-801 novos relatórios
  async folhaVencimentos(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar folha de vencimentos', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.folhaVencimentos(filtro);
    });
  }

  async resumoIrt(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar resumo IRT', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.resumoIrt(filtro);
    });
  }

  async resumoInss(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar resumo INSS', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.resumoInss(filtro);
    });
  }

  async mapaFerias(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar mapa de férias', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.mapaFerias(filtro);
    });
  }

  async mapaAusencias(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar mapa de ausências', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.mapaAusencias(filtro);
    });
  }

  async dividasAbertas(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'listar dívidas em aberto', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.dividasAbertas(filtro);
    });
  }

  async custoDepartamento(payload: unknown): Promise<IpcResponse<unknown>> {
    return this.com('read', 'gerar custo por departamento', async (sessao) => {
      const filtro = this.filtroDe(sessao, payload);
      return this.relatorios.custoDepartamento(filtro);
    });
  }

  // ===========================================================================
  // Exportação (REL-03)
  // ===========================================================================

  /**
   * Exporta um relatório para CSV, Excel ou PDF, pedindo ao utilizador onde guardar.
   *
   * Os três formatos saem da mesma `Tabela`, que é montada uma vez e desenhada
   * três vezes. Montar os dados por formato era a alternativa, e obrigaria a que
   * uma correção no conjunto de colunas fosse aplicada três vezes — e a que uma
   * delas ficasse por fazer.
   *
   * O PDF é um documento A4 com cabeçalho, e não a captura do ecrã: ver
   * `relatorio-pdf.service`.
   */
  async exportar(payload: unknown, janela: BrowserWindow | null): Promise<IpcResponse<unknown>> {
    return this.com('write', 'exportar relatório', async (sessao) => {
      const params = validar(exportarSchema, payload);
      const empresaId = this.exigirEmpresa(sessao, params.empresaId);

      const filtro = this.filtroDeValidado(
        empresaId,
        { de: params.de, ate: params.ate },
        sessao.podeVerSalarios ?? false
      );
      const tabela = await this.montarTabela(params, filtro);

      if (!janela) {
        throw new AppError('Janela principal não encontrada.', 'WINDOW_NOT_FOUND', 500);
      }

      const extensao = params.formato === 'csv' ? 'csv' : params.formato === 'pdf' ? 'pdf' : 'xlsx';
      const nomeSugerido = `relatorio_${tabela.nome}_${params.de}_${params.ate}.${extensao}`;

      const escolha = await dialog.showSaveDialog(janela, {
        title: 'Guardar relatório',
        defaultPath: nomeSugerido,
        filters: [{ name: FILTROS_GUARDA[params.formato], extensions: [extensao] }],
      });

      // `canceled` com um `l` é o nome do Electron; o `cancelado` que a UI recebe
      // é português, para não vazar o inglês da API para o resto da aplicação.
      if (escolha.canceled || !escolha.filePath) {
        // Sem `success` dentro do `data`: o envelope do IPC já diz que o pedido
        // foi atendido. Um segundo `success` convida a UI a escrever
        // `if (data.success)` e a mostrar um erro ao utilizador que cancelou.
        return { cancelado: true };
      }

      const conteudo =
        params.formato === 'csv'
          ? RelatoriosController.paraCsv(tabela)
          : params.formato === 'pdf'
            ? await gerarPdfRelatorio(
                {
                  sessao,
                  titulo: tituloRelatorio(params.relatorio),
                  de: params.de,
                  ate: params.ate,
                },
                tabela,
              )
            : await RelatoriosController.paraExcel([tabela]);

      await writeFile(escolha.filePath, conteudo);

      // O ficheiro saiu da aplicação para o sistema de ficheiros, onde o log
      // já não o vê. Se ninguém souber depois quem exportou a dívida de todos
      // os clientes, o canal de exportação é uma saída sem rasto.
      await this.audit.registar({
        empresaId,
        utilizadorId: sessao.id,
        modulo: 'relatorios',
        acao: 'exportar',
        entidade: 'Relatorio',
        descricao: `Exportou ${params.formato.toUpperCase()} de "${params.relatorio}" entre ${params.de} e ${params.ate}`,
        dadosNovos: {
          relatorio: params.relatorio,
          formato: params.formato,
          periodo: { de: params.de, ate: params.ate },
          ficheiro: escolha.filePath,
          linhas: tabela.linhas.length,
        },
      });

      return {
        caminho: escolha.filePath,
        linhas: tabela.linhas.length,
        formato: params.formato,
      };
    });
  }

  /**
   * CSV com separador `;` e BOM.
   *
   * O `;` porque é o que o Excel em português abre com uma coluna por campo. Com
   * `,` metia todas as colunas numa só. O BOM porque, sem ele, o Excel abre os
   * acentos como `Ã§` — e um relatório com os nomes dos clientes legíveis é o
   * mínimo aceitável.
   *
   * O escape segue o RFC 4180 (aspas duplicadas), que é o que o Excel e o
   * LibreOffice esperam.
   */
  static paraCsv(tabela: Tabela): Buffer {
    const escapar = (valor: unknown): string => {
      if (valor === null || valor === undefined) return '';
      const texto = String(valor);
      return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const cabecalho = tabela.colunas.map((c) => escapar(c.titulo)).join(';');
    const corpo = tabela.linhas.map((linha) =>
      tabela.colunas.map((c) => escapar(linha[c.chave])).join(';'),
    );

    return Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from([cabecalho, ...corpo].join('\r\n'), 'utf8'),
    ]);
  }

  /** Livros Excel com uma folha por tipo de relatório. */
  static async paraExcel(tabelas: Tabela[]): Promise<Buffer> {
    const livro = new ExcelJS.Workbook();
    livro.creator = 'DoraERP';
    livro.created = new Date();

    for (const tabela of tabelas) {
      // O nome de uma folha é limitado a 31 caracteres e não aceita alguns
      // caracteres. Um nome de relatório dentro do limite evita ter de
      // truncar e de sanitizar em cada caminho.
      const folha = livro.addWorksheet(tabela.nome.slice(0, 31));
      folha.columns = tabela.colunas.map((c) => ({ header: c.titulo, key: c.chave }));

      for (const linha of tabela.linhas) folha.addRow(linha);

      // Linha de cabeçalho a negrito e larguras por conteúdo. Sem isto o Excel
      // põe todas as colunas com a largura por omissão e o ficheiro fica
      // ilegível para quem vai abrir.
      const cabecalho = folha.getRow(1);
      cabecalho.font = { bold: true };
      cabecalho.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8EDF5' },
      };
      cabecalho.alignment = { vertical: 'middle' };
      cabecalho.height = 20;

      // As colunas declaram se são numéricas. Deduzir por inspeção do conteúdo
      // parecia mais curto e era pior: uma coluna de quantidades só ficaria
      // formatada a partir da segunda linha, e um relatório vazio saía sem
      // formato nenhum — exactamente quando a formatação é o que se vai ver.
      tabela.colunas.forEach((coluna, indice) => {
        const destino = folha.getColumn(indice + 1);
        destino.width = coluna.chave === 'descricao' || coluna.chave === 'nome' ? 40 : 18;
        destino.numFmt = coluna.numerica ? '#,##0.00' : 'General';
        destino.alignment = { horizontal: coluna.numerica ? 'right' : 'left' };
      });
    }

    const buffer = await livro.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  /** Escolhe as linhas e o formato de cada tipo de relatório. */
  private async montarTabela(params: ExportarParams, filtro: FiltroRelatorio): Promise<Tabela> {
    switch (params.relatorio) {
      case 'vendasPorMes':
        return {
          nome: 'vendas_por_mes',
          colunas: [
            { chave: 'mes', titulo: 'Mês' },
            { chave: 'total', titulo: 'Total', numerica: true },
            { chave: 'quantidade', titulo: 'Documentos', numerica: true },
          ],
          linhas: await this.relatorios.vendasPorMes(filtro),
        };
      case 'topArtigos':
        return {
          nome: 'artigos_mais_vendidos',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'quantidade', titulo: 'Quantidade', numerica: true },
            { chave: 'total', titulo: 'Total', numerica: true },
          ],
          linhas: await this.relatorios.topArtigos(filtro, params.limite),
        };
      case 'topClientes':
        return {
          nome: 'clientes',
          colunas: [
            { chave: 'nome', titulo: 'Cliente' },
            { chave: 'faturas', titulo: 'Faturas', numerica: true },
            { chave: 'total', titulo: 'Total facturado', numerica: true },
            { chave: 'totalPago', titulo: 'Total pago', numerica: true },
            { chave: 'emDivida', titulo: 'Em dívida', numerica: true },
          ],
          linhas: await this.relatorios.topClientes(filtro, params.limite),
        };
      case 'fluxoTesourariaPorMes':
        return {
          nome: 'fluxo_tesouraria',
          colunas: [
            { chave: 'mes', titulo: 'Mês' },
            { chave: 'entradas', titulo: 'Entradas', numerica: true },
            { chave: 'saidas', titulo: 'Saídas', numerica: true },
            { chave: 'liquido', titulo: 'Líquido', numerica: true },
          ],
          linhas: await this.relatorios.fluxoTesourariaPorMes(filtro),
        };
      case 'stockBaixo':
        return {
          nome: 'stock_baixo',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'stockAtual', titulo: 'Stock atual', numerica: true },
            { chave: 'stockMinimo', titulo: 'Stock mínimo', numerica: true },
            { chave: 'suggestaoEncomenda', titulo: 'A encomendar', numerica: true },
          ],
          linhas: await this.relatorios.stockBaixo(),
        };
      case 'valorizacao':
        return {
          nome: 'valorizacao_stock',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'quantidade', titulo: 'Quantidade' },
            { chave: 'custoUnitario', titulo: 'Custo unitário', numerica: true },
            { chave: 'valor', titulo: 'Valor', numerica: true },
          ],
          linhas: await this.relatorios.valorizacaoStock(params.limite),
        };
      case 'ivaPorTaxa':
        return {
          nome: 'iva_por_taxa',
          colunas: [
            { chave: 'taxa', titulo: 'Taxa (%)', numerica: true },
            { chave: 'base', titulo: 'Base', numerica: true },
            { chave: 'iva', titulo: 'IVA', numerica: true },
            { chave: 'liquido', titulo: 'Total', numerica: true },
          ],
          linhas: await this.relatorios.ivaPorTaxa(filtro),
        };
      case 'folhaVencimentos':
        return {
          nome: 'folha_vencimentos',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'nome', titulo: 'Nome' },
            { chave: 'departamento', titulo: 'Departamento' },
            { chave: 'cargo', titulo: 'Cargo' },
            { chave: 'salarioBase', titulo: 'Salário Base', numerica: true },
            { chave: 'horasExtras', titulo: 'Horas Extras', numerica: true },
            { chave: 'valorHorasExtras', titulo: 'Valor H. Extras', numerica: true },
            { chave: 'faltas', titulo: 'Faltas', numerica: true },
            { chave: 'valorFaltas', titulo: 'Valor Faltas', numerica: true },
            { chave: 'inss', titulo: 'INSS', numerica: true },
            { chave: 'irt', titulo: 'IRT', numerica: true },
            { chave: 'outrasDeducoes', titulo: 'Outras Deduções', numerica: true },
            { chave: 'totalDeducoes', titulo: 'Total Deduções', numerica: true },
            { chave: 'liquido', titulo: 'Líquido', numerica: true },
          ],
          linhas: await this.relatorios.folhaVencimentos(filtro),
        };
      case 'resumoIrt':
        const resumoIrt = await this.relatorios.resumoIrt(filtro);
        return {
          nome: 'resumo_irt',
          colunas: [
            { chave: 'totalSujeito', titulo: 'Total Sujeito', numerica: true },
            { chave: 'totalIrt', titulo: 'Total IRT', numerica: true },
          ],
          linhas: [resumoIrt],
        };
      case 'resumoInss':
        const resumoInss = await this.relatorios.resumoInss(filtro);
        return {
          nome: 'resumo_inss',
          colunas: [
            { chave: 'totalRemuneracoes', titulo: 'Total Remunerações', numerica: true },
            { chave: 'inssEmpresa', titulo: 'INSS Empresa', numerica: true },
            { chave: 'inssFuncionario', titulo: 'INSS Funcionário', numerica: true },
            { chave: 'totalInss', titulo: 'Total INSS', numerica: true },
          ],
          linhas: [resumoInss],
        };
      case 'mapaFerias':
        return {
          nome: 'mapa_ferias',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'nome', titulo: 'Nome' },
            { chave: 'departamento', titulo: 'Departamento' },
            { chave: 'ano', titulo: 'Ano', numerica: true },
            { chave: 'diasDireito', titulo: 'Dias Direito', numerica: true },
            { chave: 'diasMarcados', titulo: 'Dias Marcados', numerica: true },
            { chave: 'diasGozados', titulo: 'Dias Gozados', numerica: true },
            { chave: 'saldo', titulo: 'Saldo', numerica: true },
            { chave: 'subsidioFerias', titulo: 'Subsídio Férias', numerica: true },
            { chave: 'subsidioFeriasPago', titulo: 'Subsídio Pago', numerica: false },
          ],
          linhas: await this.relatorios.mapaFerias(filtro),
        };
      case 'mapaAusencias':
        return {
          nome: 'mapa_ausencias',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'nome', titulo: 'Nome' },
            { chave: 'departamento', titulo: 'Departamento' },
            { chave: 'tipo', titulo: 'Tipo' },
            { chave: 'dataInicio', titulo: 'Início' },
            { chave: 'dataFim', titulo: 'Fim' },
            { chave: 'dias', titulo: 'Dias', numerica: true },
            { chave: 'horas', titulo: 'Horas', numerica: true },
            { chave: 'estado', titulo: 'Estado' },
            { chave: 'justificativa', titulo: 'Justificativa' },
          ],
          linhas: await this.relatorios.mapaAusencias(filtro),
        };
      case 'dividasAbertas':
        return {
          nome: 'dividas_abertas',
          colunas: [
            { chave: 'codigo', titulo: 'Código' },
            { chave: 'nome', titulo: 'Nome' },
            { chave: 'processoId', titulo: 'Processo' },
            { chave: 'tipo', titulo: 'Tipo' },
            { chave: 'valorOriginal', titulo: 'Valor Original', numerica: true },
            { chave: 'valorPago', titulo: 'Valor Pago', numerica: true },
            { chave: 'saldo', titulo: 'Saldo', numerica: true },
            { chave: 'proximaPrestacao', titulo: 'Próx. Prestação', numerica: true },
            { chave: 'dataProximaPrestacao', titulo: 'Data Próx. Prestação' },
          ],
          linhas: await this.relatorios.dividasAbertas(filtro),
        };
      case 'custoDepartamento':
        return {
          nome: 'custo_departamento',
          colunas: [
            { chave: 'departamento', titulo: 'Departamento' },
            { chave: 'totalFuncionarios', titulo: 'Funcionários', numerica: true },
            { chave: 'custoSalarios', titulo: 'Salários', numerica: true },
            { chave: 'custoInss', titulo: 'INSS', numerica: true },
            { chave: 'custoIRT', titulo: 'IRT', numerica: true },
            { chave: 'custoFerias', titulo: 'Férias', numerica: true },
            { chave: 'custoSubsidioNatal', titulo: 'Subsídio Natal', numerica: true },
            { chave: 'custoOutros', titulo: 'Outros', numerica: true },
            { chave: 'custoTotal', titulo: 'Total', numerica: true },
            { chave: 'mediaPorFuncionario', titulo: 'Média/Funcionário', numerica: true },
          ],
          linhas: await this.relatorios.custoDepartamento(filtro),
        };
      default:
        // inalcançável: o `enum` do esquema é a mesma lista de casos. Se um
        // relatório for acrescentado a um lado e não ao outro, a falha é aqui,
        // com o nome do relatório, em vez de um `undefined` silencioso que
        // rebentaria mais tarde ao montar as colunas.
        throw new AppError(
          `Relatório sem exportação: ${String(params.relatorio)}`,
          'VALIDATION_ERROR',
          400,
        );
    }
  }

  // ===========================================================================
  // Filtro e autorização
  // ===========================================================================

  /**
   * Valida o payload e devolve o filtro já preso à empresa da sessão.
   *
   * Usa o esquema de período, não o de tabela: cada rota sabe de que relatório
   * se trata, e pedir ao renderer que envie um `relatorio` para depois o ignorar
   * só introduz uma forma de o pedido estar errado sem motivo.
   */
  private filtroDe(sessao: UserSession, payload: unknown): FiltroRelatorio {
    const params = validar(relatorioPeriodoSchema, payload);
    const empresaId = this.exigirEmpresa(sessao, params.empresaId);
    return this.filtroDeValidado(empresaId, params, sessao.podeVerSalarios ?? false);
  }

  private filtroDeValidado(empresaId: string, periodo: { de: string; ate: string }, podeVerSalarios: boolean): FiltroRelatorio {
    // O `Date` que daqui sai é o mesmo que o serviço reconstrói para meia-noite
    // local: as componentes UTC são o dia pedido, e `filtroData` no serviço
    // volta a transformá-las em meia-noite local.
    return {
      empresaId,
      periodo: { de: new Date(`${periodo.de}T00:00:00Z`), ate: new Date(`${periodo.ate}T00:00:00Z`) },
      podeVerSalarios,
    };
  }

  /**
   * A empresa da sessão é a única autoridade sobre que empresa se reporta.
   *
   * Confirma em vez de substituir: um payload com o `empresaId` certo continua
   * a funcionar (a UI envia-o), e um payload com o de outra empresa é recusado
   * com uma mensagem clara em vez de devolver silenciosamente os dados da
   * empresa errada.
   */
  private exigirEmpresa(sessao: UserSession, pedido: string | undefined): string {
    const empresaDaSessao = sessao.empresaConfigId;
    if (!empresaDaSessao) {
      throw new AppError('Sessão sem empresa associada.', 'SEM_EMPRESA', 403);
    }
    if (pedido && pedido !== empresaDaSessao) {
      throw new ForbiddenError('A empresa pedida não corresponde à empresa da sessão.');
    }
    return empresaDaSessao;
  }

  /** Limite de linhas, com um valor por omissão conforme o relatório. */
  private limiteDe(payload: unknown, porOmissao = 10): number {
    const bruto = (payload as { limite?: unknown } | null)?.limite;
    const n = Number(bruto);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 500) : porOmissao;
  }

  /**
   * Envolve cada rota em verificação de permissão e tradução de erro.
   *
   * A sessão vem do `AuthService` e não do pedido IPC: um renderer
   * comprometido não pode escolher em que sessão corre.
   *
   * O `ok()` é aplicado aqui e só aqui. Se uma rota voltasse a embrulhar o
   * resultado, a UI receberia `{ data: { data: ... } }` e perderia o acesso ao
   * relatório — por isso as rotas devolvem o valor, não a resposta.
   */
  private async com(
    acao: 'read' | 'write' | 'delete',
    descricao: string,
    fn: (sessao: UserSession) => Promise<unknown>,
  ): Promise<IpcResponse<unknown>> {
    try {
      const sessao = this.auth.getCurrentSession();
      requirePermission(sessao, 'relatorios', acao);

      if (!sessao?.empresaConfigId) {
        throw new AppError('Sessão sem empresa associada.', 'SEM_EMPRESA', 403);
      }

      return ok(await fn(sessao));
    } catch (erro) {
      if (erro instanceof AppError) return err(erro.code, erro.message, erro.details);
      if (erro instanceof z.ZodError) {
        return err('VALIDATION_ERROR', erro.issues[0]?.message || 'Dados inválidos.', erro.issues);
      }
      return err('INTERNAL_ERROR', (erro as Error)?.message || `Erro ao ${descricao}.`);
    }
  }
}

export const relatoriosController = new RelatoriosController();

/** Reexportado para os testes não terem de importar dois módulos. */
export type { RelatorioCompleto };
