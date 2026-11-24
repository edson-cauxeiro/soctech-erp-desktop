/**
 * @file relatorios.tsx
 * @description Painel analítico da empresa (SPRINT 6, `REL-01`/`REL-03`).
 * Exibição de KPIs executivos, tabelas consolidadas, filtros de período e ferramentas de exportação.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  Users2,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { DataTable, KpiCard, Panel, StatusBadge } from "../components/erp/Primitives";
import { relatoriosApi } from "../api/relatorios.api";
import { useAuth } from "../hooks/useAuth";
import { formatCurrency } from "../utils/currency";
import type {
  NomeRelatorioDto,
  RelatorioCompletoDto,
} from "../@types/electron";

// =============================================================================
// Período
// =============================================================================

type Preset = { id: string; rotulo: string; de: string; ate: string };

function hoje(): string {
  return data(new Date());
}

function inicioDoMes(): string {
  return `${hoje().slice(0, 7)}-01`;
}

function data(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, "0")}`;
}

function deslocarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return data(d);
}

function primeiroDiaDoMes(meses: number): string {
  const h = new Date();
  return `${data(new Date(h.getFullYear(), h.getMonth() + meses, 1)).slice(0, 7)}-01`;
}

function ultimoDiaDoMes(meses: number): string {
  const h = new Date();
  return data(new Date(h.getFullYear(), h.getMonth() + meses + 1, 0));
}

const PRESETS: Preset[] = [
  { id: "este-mes", rotulo: "Este mês", de: inicioDoMes(), ate: hoje() },
  { id: "mes-anterior", rotulo: "Mês anterior", de: primeiroDiaDoMes(-1), ate: ultimoDiaDoMes(-1) },
  { id: "este-ano", rotulo: "Este ano", de: `${new Date().getFullYear()}-01-01`, ate: `${new Date().getFullYear()}-12-31` },
  { id: "ano-anterior", rotulo: "Ano anterior", de: `${new Date().getFullYear() - 1}-01-01`, ate: `${new Date().getFullYear() - 1}-12-31` },
  { id: "ultimos-30-dias", rotulo: "Últimos 30 dias", de: deslocarDias(hoje(), -29), ate: hoje() },
];

// =============================================================================
// Formatação
// =============================================================================

const NUMERO = new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 2 });

function dinheiro(valor: number | undefined | null): string {
  return formatCurrency(valor ?? 0, "AOA");
}

function percentagem(valor: number): string {
  return `${NUMERO.format(valor)}%`;
}

function mesCurto(chave: string): string {
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [, m] = chave.split("-");
  const indice = Number(m) - 1;
  return meses[indice] ?? chave;
}

// =============================================================================
// Exportação
// =============================================================================

const EXPORTAVEIS: { relatorio: NomeRelatorioDto; rotulo: string }[] = [
  { relatorio: "vendasPorMes", rotulo: "Vendas por mês" },
  { relatorio: "fluxoTesourariaPorMes", rotulo: "Fluxo de tesouraria" },
  { relatorio: "topArtigos", rotulo: "Artigos mais vendidos" },
  { relatorio: "topClientes", rotulo: "Clientes principais" },
  { relatorio: "stockBaixo", rotulo: "Stock baixo" },
  { relatorio: "valorizacao", rotulo: "Valorização de stock" },
  { relatorio: "ivaPorTaxa", rotulo: "IVA por taxa" },
  { relatorio: "folhaVencimentos", rotulo: "Folha de vencimentos" },
  { relatorio: "resumoIrt", rotulo: "Resumo IRT" },
  { relatorio: "resumoInss", rotulo: "Resumo INSS" },
  { relatorio: "mapaFerias", rotulo: "Mapa de férias" },
  { relatorio: "mapaAusencias", rotulo: "Mapa de ausências" },
  { relatorio: "dividasAbertas", rotulo: "Dívidas em aberto" },
  { relatorio: "custoDepartamento", rotulo: "Custo por departamento" },
];

// =============================================================================
// Componente Principal
// =============================================================================

export default function RelatoriosPage() {
  const user = useAuth((s) => s.user);
  const podeExportar = useAuth((s) => s.hasPermission("relatorios", "write"));

  const [preset, setPreset] = useState(PRESETS[0].id);
  const [periodo, setPeriodo] = useState<Preset>(PRESETS[0]);
  const [selectedClienteFilter, setSelectedClienteFilter] = useState<string>("todos");

  const [dados, setDados] = useState<RelatorioCompletoDto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);

  const empresaId = user?.empresaConfigId ?? null;

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    setErro(null);

    const resposta = await relatoriosApi.completo({
      empresaId,
      de: periodo.de,
      ate: periodo.ate,
    });
    setCarregando(false);

    if (!resposta.success) {
      setErro(resposta.error.message);
      setDados(null);
      return;
    }
    setDados(resposta.data);
  }, [empresaId, periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const exportar = useCallback(
    async (relatorio: NomeRelatorioDto, formato: "csv" | "xlsx" | "pdf") => {
      if (!empresaId) return;
      setExportando(`${relatorio}-${formato}`);
      setAviso(null);

      const resposta = await relatoriosApi.exportar({
        empresaId,
        de: periodo.de,
        ate: periodo.ate,
        relatorio,
        formato,
      });
      setExportando(null);

      if (!resposta.success) {
        setErro(resposta.error.message);
        return;
      }
      if (resposta.data.cancelado) return;
      setAviso(`Relatório exportado com sucesso para ${resposta.data.caminho} (${resposta.data.linhas} linhas).`);
    },
    [empresaId, periodo],
  );

  const semMovimento = useMemo(
    () => !!dados && dados.vendasPorMes.length === 0 && dados.resumo.numeroFaturas === 0,
    [dados],
  );

  // Filtro de clientes na tabela de clientes
  const clientesFiltrados = useMemo(() => {
    if (!dados?.topClientes) return [];
    if (selectedClienteFilter === "todos") return dados.topClientes;
    if (selectedClienteFilter === "em_divida") return dados.topClientes.filter((c) => c.emDivida > 0);
    return dados.topClientes.filter((c) => c.clienteId === selectedClienteFilter);
  }, [dados?.topClientes, selectedClienteFilter]);

  if (!empresaId) {
    return (
      <ErpShell
        active="relatorios"
        title="Relatórios — Painel Analítico"
        breadcrumb={["Relatórios"]}
        ribbon={[]}
      >
        <Panel title="Sem empresa associada">
          <p className="text-sm text-muted-foreground">
            A sessão não tem empresa associada. Não há relatório a apresentar.
          </p>
        </Panel>
      </ErpShell>
    );
  }

  return (
    <ErpShell
      active="relatorios"
      title="Relatórios — Painel Analítico"
      breadcrumb={["Relatórios", "Painel"]}
      ribbon={[
        {
          label: "Painel",
          actions: [
            {
              label: "Actualizar",
              icon: <RefreshCw className="w-5 h-5" />,
              onClick: () => void carregar(),
            },
          ],
        },
        ...(podeExportar
          ? [
              {
                label: "Exportar Rápido",
                actions: [
                  {
                    label: "CSV Vendas",
                    icon: <Download className="w-5 h-5" />,
                    onClick: () => void exportar("vendasPorMes", "csv"),
                  },
                  {
                    label: "Excel Vendas",
                    icon: <FileSpreadsheet className="w-5 h-5" />,
                    onClick: () => void exportar("vendasPorMes", "xlsx"),
                  },
                  {
                    label: "PDF Vendas",
                    icon: <FileText className="w-5 h-5" />,
                    onClick: () => void exportar("vendasPorMes", "pdf"),
                  },
                ],
              },
            ]
          : []),
      ]}
    >
      <div className="space-y-4">
        {/* ================================================================ */}
        {/* CABEÇALHO INTEGRADO: Período, Clientes Principais e Exportação   */}
        {/* ================================================================ */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Filtro de Período & Exportação
                </h3>
                <p className="text-xs text-muted-foreground">
                  Selecione o horizonte temporal e aceda às opções analíticas da empresa.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void carregar()}
                disabled={carregando}
                className="h-8 px-3 border border-border rounded-md hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
                <span>Recarregar</span>
              </button>
            </div>
          </div>

          {/* Linha de Controlos: Presets + Datas + Filtro Clientes Principais + Exportar */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
            {/* Presets Rápidos */}
            <div className="space-y-1.5 xl:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Presets de Período
              </span>
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`relatorios-preset-${p.id}`}
                    onClick={() => {
                      setPreset(p.id);
                      setPeriodo(p);
                    }}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      preset === p.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background border-input hover:bg-muted text-foreground"
                    }`}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>
            </div>

            {/* Intervalo de Datas De / Até */}
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  De
                </label>
                <input
                  type="date"
                  data-testid="relatorios-de"
                  value={periodo.de}
                  onChange={(e) => {
                    setPreset("");
                    setPeriodo((p) => ({ ...p, de: e.target.value }));
                  }}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Até
                </label>
                <input
                  type="date"
                  data-testid="relatorios-ate"
                  value={periodo.ate}
                  onChange={(e) => {
                    setPreset("");
                    setPeriodo((p) => ({ ...p, ate: e.target.value }));
                  }}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Filtro de Clientes Principais */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Clientes Principais
              </label>
              <select
                value={selectedClienteFilter}
                onChange={(e) => setSelectedClienteFilter(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
              >
                <option value="todos">Todos os Clientes ({dados?.topClientes?.length || 0})</option>
                <option value="em_divida">Apenas com Saldo Devedor</option>
                {dados?.topClientes?.map((c) => (
                  <option key={c.clienteId} value={c.clienteId}>
                    {c.nome} ({dinheiro(c.total)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bloco de Exportações Compacto no Cabeçalho */}
          {podeExportar && (
            <div className="pt-3 border-t border-border/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Download className="w-3.5 h-3.5 text-primary" />
                <span className="font-semibold text-foreground">Exportar Relatórios:</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {EXPORTAVEIS.map(({ relatorio, rotulo }) => (
                  <div key={relatorio} className="flex items-center border border-border rounded bg-muted/20 px-2 py-1 gap-1.5 text-xs">
                    <span className="font-medium text-foreground">{rotulo}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void exportar(relatorio, "csv")}
                        disabled={!!exportando}
                        className="px-1.5 py-0.5 rounded bg-background hover:bg-muted border border-border text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground disabled:opacity-50"
                        title={`Exportar ${rotulo} em CSV`}
                      >
                        {exportando === `${relatorio}-csv` ? <Loader2 className="w-3 h-3 animate-spin" /> : "CSV"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportar(relatorio, "xlsx")}
                        disabled={!!exportando}
                        className="px-1.5 py-0.5 rounded bg-background hover:bg-muted border border-border text-[10px] font-bold uppercase text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                        title={`Exportar ${rotulo} em Excel`}
                      >
                        {exportando === `${relatorio}-xlsx` ? <Loader2 className="w-3 h-3 animate-spin" /> : "XLS"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportar(relatorio, "pdf")}
                        disabled={!!exportando}
                        className="px-1.5 py-0.5 rounded bg-background hover:bg-muted border border-border text-[10px] font-bold uppercase text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        title={`Exportar ${rotulo} em PDF`}
                      >
                        {exportando === `${relatorio}-pdf` ? <Loader2 className="w-3 h-3 animate-spin" /> : "PDF"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mensagens e Alertas */}
        {erro && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {aviso && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{aviso}</span>
          </div>
        )}

        {semMovimento && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Sem documentos no período escolhido ({periodo.de} a {periodo.ate}). Os números abaixo são zero.
            </span>
          </div>
        )}

        {/* ================================================================ */}
        {/* KPI CARDS                                                        */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            testId="relatorios-kpi-vendas"
            label="Vendas do Período"
            value={dinheiro(dados?.resumo.totalVendas)}
            hint={
              dados && dados.resumo.totalNotasCredito > 0
                ? `líquido de ${dinheiro(dados.resumo.totalNotasCredito)} em NC`
                : `${dados?.resumo.numeroFaturas ?? 0} documento(s) emitidos`
            }
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <KpiCard
            testId="relatorios-kpi-resultado"
            label="Resultado Operacional"
            value={dinheiro(dados?.resumo.resultado)}
            trend={(dados?.resumo.resultado ?? 0) >= 0 ? "up" : "down"}
            hint="Vendas líquidas subtraídas das compras"
            icon={<Wallet className="w-4 h-4" />}
          />
          <KpiCard
            label="Margem Bruta"
            value={percentagem(dados?.resumo.margemBrutaPercentagem ?? 0)}
            trend={(dados?.resumo.margemBruta ?? 0) >= 0 ? "up" : "down"}
            hint={dinheiro(dados?.resumo.margemBruta)}
            icon={<BarChart3 className="w-4 h-4" />}
          />
          <KpiCard
            label="IVA Liquidado"
            value={dinheiro(dados?.resumo.totalIvaLiquidado)}
            hint={`${dados?.resumo.numeroClientes ?? 0} cliente(s) atendidos`}
            icon={<Layers className="w-4 h-4" />}
          />
        </div>

        {/* ================================================================ */}
        {/* TABELAS ANALÍTICAS: Vendas por Mês e Fluxo de Tesouraria         */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="Vendas por Mês"
            action={
              <span className="text-xs text-muted-foreground font-mono">
                {dados?.vendasPorMes.length || 0} meses registados
              </span>
            }
          >
            {dados && dados.vendasPorMes.length > 0 ? (
              <DataTable
                columns={["Mês / Ano", "Total Faturado", "Notas de Crédito", "Líquido"]}
                rows={dados.vendasPorMes.map((m) => [
                  `${mesCurto(m.mes)} (${m.mes})`,
                  dinheiro(m.total),
                  dinheiro(0),
                  <span key={m.mes} className="font-bold text-foreground">
                    {dinheiro(m.total)}
                  </span>,
                ])}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Sem registo de vendas no período selecionado.
              </p>
            )}
          </Panel>

          <Panel
            title="Fluxo de Tesouraria por Mês"
            action={
              <span className="text-xs text-muted-foreground font-mono">
                Entradas vs. Saídas
              </span>
            }
          >
            {dados && dados.fluxoTesourariaPorMes.length > 0 ? (
              <DataTable
                columns={["Mês", "Entradas", "Saídas", "Saldo Líquido"]}
                rows={dados.fluxoTesourariaPorMes.map((f) => [
                  `${mesCurto(f.mes)} (${f.mes})`,
                  <span key={`ent-${f.mes}`} className="text-emerald-600 dark:text-emerald-400 font-mono">
                    +{dinheiro(f.entradas)}
                  </span>,
                  <span key={`sai-${f.mes}`} className="text-rose-600 dark:text-rose-400 font-mono">
                    -{dinheiro(f.saidas)}
                  </span>,
                  <StatusBadge key={`liq-${f.mes}`} tone={f.liquido >= 0 ? "success" : "warning"}>
                    {dinheiro(f.liquido)}
                  </StatusBadge>,
                ])}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Sem movimentações de tesouraria no período selecionado.
              </p>
            )}
          </Panel>
        </div>

        {/* ================================================================ */}
        {/* TABELAS: Artigos Mais Vendidos & Clientes Principais              */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="Artigos Mais Vendidos"
            action={
              <span className="text-xs text-muted-foreground">
                Top {dados?.topArtigos.length || 0} produtos/serviços
              </span>
            }
          >
            {dados && dados.topArtigos.length > 0 ? (
              <DataTable
                columns={["Artigo", "Qtd. Vendida", "Total Vendas", "% do Total"]}
                rows={dados.topArtigos.map((a) => {
                  const pct = dados.resumo.totalVendas > 0 ? (a.total / dados.resumo.totalVendas) * 100 : 0;
                  return [
                    <div key={a.artigoId}>
                      <p className="font-semibold text-foreground text-xs">{a.descricao}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{a.codigo}</p>
                    </div>,
                    <span key={`qtd-${a.artigoId}`} className="font-mono text-xs">
                      {NUMERO.format(a.quantidade)}
                    </span>,
                    <span key={`tot-${a.artigoId}`} className="font-mono text-xs font-semibold">
                      {dinheiro(a.total)}
                    </span>,
                    <span key={`pct-${a.artigoId}`} className="text-xs text-muted-foreground">
                      {percentagem(pct)}
                    </span>,
                  ];
                })}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nenhum artigo vendido no período.
              </p>
            )}
          </Panel>

          <Panel
            title="Clientes Principais"
            action={
              <span className="text-xs text-muted-foreground">
                {clientesFiltrados.length} cliente(s) listados
              </span>
            }
          >
            {clientesFiltrados.length > 0 ? (
              <DataTable
                columns={["Cliente", "Faturas", "Facturado", "Em Dívida"]}
                rows={clientesFiltrados.map((c) => [
                  <div key={c.clienteId}>
                    <p className="font-semibold text-foreground text-xs">{c.nome}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{c.nif || "Consumidor Final"}</p>
                  </div>,
                  String(c.faturas),
                  dinheiro(c.total),
                  <StatusBadge key={c.clienteId} tone={c.emDivida > 0 ? "warning" : "success"}>
                    {dinheiro(c.emDivida)}
                  </StatusBadge>,
                ])}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nenhum cliente corresponde ao filtro selecionado.
              </p>
            )}
          </Panel>
        </div>

        {/* ================================================================ */}
        {/* TABELAS: IVA por Taxa & Stock Baixo                              */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="IVA Liquidado por Taxa"
            action={
              <span className="text-xs text-muted-foreground">
                Apuramento para modelo fiscal
              </span>
            }
          >
            {dados && dados.ivaPorTaxa.length > 0 ? (
              <DataTable
                columns={["Taxa IVA", "Incidência (Base)", "Montante IVA", "Total Líquido"]}
                rows={dados.ivaPorTaxa.map((l) => [
                  percentagem(l.taxa),
                  dinheiro(l.base),
                  <span key={`iva-${l.taxa}`} className="font-semibold text-primary font-mono">
                    {dinheiro(l.iva)}
                  </span>,
                  dinheiro(l.liquido),
                ])}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Sem IVA liquidado no período.
              </p>
            )}
          </Panel>

          <Panel
            title="Artigos com Stock Baixo"
            action={
              <span className="text-xs text-muted-foreground">
                Abaixo do ponto de encomenda
              </span>
            }
          >
            {dados && dados.stockBaixo.length > 0 ? (
              <DataTable
                columns={["Artigo", "Stock Atual", "Mínimo", "Sugestão Encomenda"]}
                rows={dados.stockBaixo.map((a) => [
                  <div key={a.artigoId}>
                    <p className="font-semibold text-foreground text-xs">{a.descricao}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{a.codigo}</p>
                  </div>,
                  <span key={`stk-${a.artigoId}`} className="font-mono text-xs text-rose-600 font-bold">
                    {String(a.stockAtual)}
                  </span>,
                  String(a.stockMinimo),
                  <StatusBadge key={a.artigoId} tone="info">
                    {String(a.suggestaoEncomenda)} un.
                  </StatusBadge>,
                ])}
              />
            ) : (
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-6">
                <Package className="w-4 h-4 text-emerald-500" />
                Nenhum artigo abaixo do stock mínimo.
              </p>
            )}
          </Panel>
        </div>

        {/* ================================================================ */}
        {/* SEÇÃO RH: Relatórios de Recursos Humanos (RH-801)                */}
        {/* ================================================================ */}
        <div className="space-y-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Users2 className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Recursos Humanos
            </h3>
            <p className="text-xs text-muted-foreground">
              Relatórios de processamento salarial, impostos, férias, ausências e dívidas.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Folha de Vencimentos */}
            <Panel
              title="Folha de Vencimentos"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.folhaVencimentos?.length || 0} registos
                </span>
              }
            >
              {dados && dados.folhaVencimentos && dados.folhaVencimentos.length > 0 ? (
                <DataTable
                  columns={["Funcionário", "Cargo", "Salário Base", "H. Extras", "Faltas", "INSS", "IRT", "Outras Ded.", "Total Ded.", "Líquido", "Mês/Ano"]}
                  rows={dados.folhaVencimentos.map((f) => [
                    <div key={f.funcionarioId}>
                      <p className="font-semibold text-foreground text-xs">{f.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{f.codigo}</p>
                    </div>,
                    <span key={`cargo-${f.funcionarioId}-${f.mes}-${f.ano}`} className="text-xs text-muted-foreground">{f.cargo}</span>,
                    <span key={`sb-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs">{formatCurrency(f.salarioBase, "AOA")}</span>,
                    <span key={`he-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs">{f.horasExtras}h ({formatCurrency(f.valorHorasExtras, "AOA")})</span>,
                    <span key={`fl-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs text-rose-600">{f.faltas} ({formatCurrency(f.valorFaltas, "AOA")})</span>,
                    <span key={`inss-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs">{formatCurrency(f.inss, "AOA")}</span>,
                    <span key={`irt-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs">{formatCurrency(f.irt, "AOA")}</span>,
                    <span key={`od-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs">{formatCurrency(f.outrasDeducoes, "AOA")}</span>,
                    <span key={`td-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs font-semibold">{formatCurrency(f.totalDeducoes, "AOA")}</span>,
                    <span key={`liq-${f.funcionarioId}-${f.mes}-${f.ano}`} className="font-mono text-xs font-bold text-emerald-600">{formatCurrency(f.liquido, "AOA")}</span>,
                    <span key={`my-${f.funcionarioId}-${f.mes}-${f.ano}`} className="text-xs text-muted-foreground">{f.mes}/{f.ano}</span>,
                  ])}
                />
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem processamentos de vencimento no período selecionado.
                </p>
              )}
            </Panel>

            {/* Resumo IRT */}
            <Panel
              title="Resumo IRT"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.resumoIrt ? "Dados disponíveis" : "Sem dados"}
                </span>
              }
            >
              {dados && dados.resumoIrt ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-md">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Sujeito a IRT</p>
                      <p className="font-mono text-lg font-semibold text-foreground">{formatCurrency(dados.resumoIrt.totalSujeito, "AOA")}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total IRT</p>
                      <p className="font-mono text-lg font-semibold text-rose-600">{formatCurrency(dados.resumoIrt.totalIrt, "AOA")}</p>
                    </div>
                  </div>
                  {dados.resumoIrt.porEscaloes && dados.resumoIrt.porEscaloes.length > 0 && (
                    <DataTable
                      columns={["Escalão", "De", "Até", "Taxa (%)", "Parcela Fixa", "Base", "Imposto"]}
                      rows={dados.resumoIrt.porEscaloes.map((e) => [
                        String(e.escalão),
                        formatCurrency(e.de, "AOA"),
                        e.ate ? formatCurrency(e.ate, "AOA") : "—",
                        `${e.taxa}%`,
                        formatCurrency(e.parcelaFixa, "AOA"),
                        formatCurrency(e.base, "AOA"),
                        formatCurrency(e.imposto, "AOA"),
                      ])}
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem dados de IRT no período selecionado.
                </p>
              )}
            </Panel>

            {/* Resumo INSS */}
            <Panel
              title="Resumo INSS"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.resumoInss ? "Dados disponíveis" : "Sem dados"}
                </span>
              }
            >
              {dados && dados.resumoInss ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-3 p-3 bg-muted/30 rounded-md">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Remunerações</p>
                      <p className="font-mono text-lg font-semibold text-foreground">{formatCurrency(dados.resumoInss.totalRemuneracoes, "AOA")}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">INSS Empresa</p>
                      <p className="font-mono text-lg font-semibold text-primary">{formatCurrency(dados.resumoInss.inssEmpresa, "AOA")}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">INSS Funcionário</p>
                      <p className="font-mono text-lg font-semibold text-emerald-600">{formatCurrency(dados.resumoInss.inssFuncionario, "AOA")}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total INSS</p>
                      <p className="font-mono text-lg font-semibold text-rose-600">{formatCurrency(dados.resumoInss.totalInss, "AOA")}</p>
                    </div>
                  </div>
                  {dados.resumoInss.porFaixas && dados.resumoInss.porFaixas.length > 0 && (
                    <DataTable
                      columns={["Faixa", "De", "Até", "Taxa (%)", "Base", "Contrib. Empresa", "Contrib. Funcionário"]}
                      rows={dados.resumoInss.porFaixas.map((f, i) => [
                        String(i + 1),
                        formatCurrency(f.de, "AOA"),
                        f.ate ? formatCurrency(f.ate, "AOA") : "—",
                        `${f.taxa}%`,
                        formatCurrency(f.base, "AOA"),
                        formatCurrency(f.contribEmpresa, "AOA"),
                        formatCurrency(f.contribFuncionario, "AOA"),
                      ])}
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem dados de INSS no período selecionado.
                </p>
              )}
            </Panel>

            {/* Mapa de Férias */}
            <Panel
              title="Mapa de Férias"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.mapaFerias?.length || 0} funcionários
                </span>
              }
            >
              {dados && dados.mapaFerias && dados.mapaFerias.length > 0 ? (
                <DataTable
                  columns={["Funcionário", "Departamento", "Ano", "Direito", "Marcados", "Gozados", "Saldo", "Subsídio Férias", "Pago"]}
                  rows={dados.mapaFerias.map((f) => [
                    <div key={f.funcionarioId}>
                      <p className="font-semibold text-foreground text-xs">{f.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{f.codigo}</p>
                    </div>,
                    <span key={`dept-${f.funcionarioId}`} className="text-xs text-muted-foreground">{f.departamento}</span>,
                    <span key={`ano-${f.funcionarioId}`} className="font-mono text-xs">{String(f.ano)}</span>,
                    <span key={`dir-${f.funcionarioId}`} className="font-mono text-xs">{String(f.diasDireito)}</span>,
                    <span key={`mar-${f.funcionarioId}`} className="font-mono text-xs">{String(f.diasMarcados)}</span>,
                    <span key={`goz-${f.funcionarioId}`} className="font-mono text-xs">{String(f.diasGozados)}</span>,
                    <span key={`sal-${f.funcionarioId}`} className="font-mono text-xs font-semibold">{String(f.saldo)}</span>,
                    <span key={`sub-${f.funcionarioId}`} className="font-mono text-xs">{formatCurrency(f.subsidioFerias, "AOA")}</span>,
                    <StatusBadge key={f.funcionarioId} tone={f.subsidioFeriasPago ? "success" : "warning"}>
                      {f.subsidioFeriasPago ? "Sim" : "Não"}
                    </StatusBadge>,
                  ])}
                />
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem saldos de férias no período selecionado.
                </p>
              )}
            </Panel>

            {/* Mapa de Ausências */}
            <Panel
              title="Mapa de Ausências"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.mapaAusencias?.length || 0} registos
                </span>
              }
            >
              {dados && dados.mapaAusencias && dados.mapaAusencias.length > 0 ? (
                <DataTable
                  columns={["Funcionário", "Departamento", "Tipo", "Início", "Fim", "Dias", "Horas", "Estado", "Justificativa"]}
                  rows={dados.mapaAusencias.map((a) => [
                    <div key={a.funcionarioId + a.dataInicio}>
                      <p className="font-semibold text-foreground text-xs">{a.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{a.codigo}</p>
                    </div>,
                    <span key={`dept-${a.funcionarioId}-${a.dataInicio}`} className="text-xs text-muted-foreground">{a.departamento}</span>,
                    <span key={`tipo-${a.funcionarioId}-${a.dataInicio}`} className="text-xs">{a.tipo}</span>,
                    <span key={`ini-${a.funcionarioId}-${a.dataInicio}`} className="font-mono text-xs">{a.dataInicio}</span>,
                    <span key={`fim-${a.funcionarioId}-${a.dataInicio}`} className="font-mono text-xs">{a.dataFim}</span>,
                    <span key={`dias-${a.funcionarioId}-${a.dataInicio}`} className="font-mono text-xs">{String(a.dias)}</span>,
                    <span key={`hrs-${a.funcionarioId}-${a.dataInicio}`} className="font-mono text-xs">{a.horas ? String(a.horas) : "—"}</span>,
                    <StatusBadge key={`est-${a.funcionarioId}-${a.dataInicio}`} tone={a.estado === "APROVADA" ? "success" : a.estado === "REJEITADA" ? "danger" : "warning"}>
                      {a.estado}
                    </StatusBadge>,
                    <span key={`just-${a.funcionarioId}-${a.dataInicio}`} className="text-xs text-muted-foreground">{a.justificativa || "—"}</span>,
                  ])}
                />
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem ausências no período selecionado.
                </p>
              )}
            </Panel>

            {/* Dívidas em Aberto */}
            <Panel
              title="Dívidas em Aberto"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.dividasAbertas?.length || 0} processos
                </span>
              }
            >
              {dados && dados.dividasAbertas && dados.dividasAbertas.length > 0 ? (
                <DataTable
                  columns={["Funcionário", "Tipo", "Valor Original", "Valor Pago", "Saldo", "Próxima Prestação", "Data Próx. Prestação"]}
                  rows={dados.dividasAbertas.map((d) => [
                    <div key={d.processoId}>
                      <p className="font-semibold text-foreground text-xs">{d.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{d.codigo}</p>
                    </div>,
                    <span key={`tipo-${d.processoId}`} className="text-xs">{d.tipo}</span>,
                    <span key={`vo-${d.processoId}`} className="font-mono text-xs">{formatCurrency(d.valorOriginal, "AOA")}</span>,
                    <span key={`vp-${d.processoId}`} className="font-mono text-xs text-emerald-600">{formatCurrency(d.valorPago, "AOA")}</span>,
                    <span key={`sal-${d.processoId}`} className="font-mono text-xs font-semibold text-rose-600">{formatCurrency(d.saldo, "AOA")}</span>,
                    <span key={`pp-${d.processoId}`} className="font-mono text-xs">{d.proximaPrestacao ? formatCurrency(d.proximaPrestacao, "AOA") : "—"}</span>,
                    <span key={`dpp-${d.processoId}`} className="font-mono text-xs">{d.dataProximaPrestacao || "—"}</span>,
                  ])}
                />
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem dívidas em aberto.
                </p>
              )}
            </Panel>

            {/* Custo por Departamento */}
            <Panel
              title="Custo por Departamento"
              action={
                <span className="text-xs text-muted-foreground font-mono">
                  {dados?.custoDepartamento?.length || 0} departamentos
                </span>
              }
            >
              {dados && dados.custoDepartamento && dados.custoDepartamento.length > 0 ? (
                <DataTable
                  columns={["Departamento", "Funcionários", "Salários", "INSS", "IRT", "Férias", "Subs. Natal", "Outros", "Total", "Média/Func."]}
                  rows={dados.custoDepartamento.map((c) => [
                    <span key={c.departamento} className="font-semibold text-foreground text-xs">{c.departamento}</span>,
                    <span key={`tf-${c.departamento}`} className="font-mono text-xs">{String(c.totalFuncionarios)}</span>,
                    <span key={`cs-${c.departamento}`} className="font-mono text-xs">{formatCurrency(c.custoSalarios, "AOA")}</span>,
                    <span key={`ci-${c.departamento}`} className="font-mono text-xs">{formatCurrency(c.custoInss, "AOA")}</span>,
                    <span key={`cirt-${c.departamento}`} className="font-mono text-xs">{formatCurrency(c.custoIRT, "AOA")}</span>,
                    <span key={`cf-${c.departamento}`} className="font-mono text-xs">{formatCurrency(c.custoFerias, "AOA")}</span>,
                    <span key={`csn-${c.departamento}`} className="font-mono text-xs">{formatCurrency(c.custoSubsidioNatal, "AOA")}</span>,
                    <span key={`co-${c.departamento}`} className="font-mono text-xs">{formatCurrency(c.custoOutros, "AOA")}</span>,
                    <span key={`ct-${c.departamento}`} className="font-mono text-xs font-bold">{formatCurrency(c.custoTotal, "AOA")}</span>,
                    <span key={`mf-${c.departamento}`} className="font-mono text-xs text-primary">{formatCurrency(c.mediaPorFuncionario, "AOA")}</span>,
                  ])}
                />
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem dados de custo por departamento no período selecionado.
                </p>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </ErpShell>
  );
}
