/**
 * @file AlertaStockManager.tsx
 * @description Painel do Estado de Stock: quantidades actuais por artigo, com destaque para
 * ruturas e stock abaixo do mínimo (RF06).
 */

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, XCircle, RefreshCw, Loader2, PackageX, Search, CircleCheck, Boxes, CalendarClock } from "lucide-react";
import { AlertaStockDto, ResumoEstadoStockDto } from "../../@types/electron";
import { stockApi, StockEstadoFiltersPayload } from "../../api/stock.api";
import { formatCurrency } from "../../utils/currency";
import { cn } from "@/lib/utils";
import { SearchSelect } from "../ui/SearchSelect";
import { toast } from "sonner";

type FiltroSituacao = "todos" | "alertas";

const RESUMO_VAZIO: ResumoEstadoStockDto = {
  ruturas: 0,
  stockBaixo: 0,
  artigosComLotesCaducados: 0,
  artigosComLotesProximosCaducar: 0,
  normais: 0,
  valorInventario: 0,
};

const SITUACAO_OPCOES: { value: string; label: string }[] = [
  { value: "rutura", label: "Rutura" },
  { value: "stock_baixo", label: "Stock baixo" },
  { value: "proximo_caducar", label: "A caducar" },
  { value: "caducado", label: "Caducado" },
];

/** Formata uma quantidade com até 4 casas, suprimindo zeros à direita (ex.: 5 em vez de 5.0000). */
function formatQuantidade(valor: number | string | null | undefined): string {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero)) return "0";
  return String(Number(numero.toFixed(4)));
}

export function AlertaStockManager() {
  const [linhas, setLinhas] = useState<AlertaStockDto[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoEstadoStockDto>(RESUMO_VAZIO);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroSituacao>("todos");
  const [situacao, setSituacao] = useState("");

  const fetchEstado = useCallback(async () => {
    try {
      setIsLoading(true);
      const payload: StockEstadoFiltersPayload = {
        search: search.trim() || undefined,
        apenasAlertas: filtro === "alertas" ? true : undefined,
        situacao: (situacao || undefined) as StockEstadoFiltersPayload["situacao"],
        take: 500,
      };
      const res = await stockApi.getEstadoStock(payload);
      if (res.success) {
        setLinhas(res.data.items);
        setTotal(res.data.total);
        setResumo(res.data.resumo ?? RESUMO_VAZIO);
      } else {
        setLinhas([]);
        setTotal(0);
        setResumo(RESUMO_VAZIO);
        toast.error("Erro ao carregar o estado de stock: " + res.error.message);
      }
    } catch {
      setResumo(RESUMO_VAZIO);
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, filtro, situacao]);

  useEffect(() => {
    const timer = setTimeout(fetchEstado, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchEstado, search]);

  const colunas = 9;

  return (
    <div className="space-y-4">
      {/* Resumo do estado de stock */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          titulo="Ruturas de Stock (Saldo Zero ou Negativo)"
          valor={`${resumo.ruturas}`}
          sufixo={resumo.ruturas === 1 ? "artigo" : "artigos"}
          icon={<XCircle className="w-8 h-8 text-rose-500 opacity-60" />}
          className="bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40"
          classNameValor="text-rose-700 dark:text-rose-400"
          testId="kpi-ruturas"
        />
        <KpiCard
          titulo="Abaixo do Stock Mínimo"
          valor={`${resumo.stockBaixo}`}
          sufixo={resumo.stockBaixo === 1 ? "artigo" : "artigos"}
          icon={<AlertTriangle className="w-8 h-8 text-amber-500 opacity-60" />}
          className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
          classNameValor="text-amber-700 dark:text-amber-400"
          testId="kpi-stock-baixo"
        />
        <KpiCard
          titulo="Artigos com lotes caducados"
          valor={`${resumo.artigosComLotesCaducados}`}
          sufixo={resumo.artigosComLotesCaducados === 1 ? "artigo" : "artigos"}
          icon={<CalendarClock className="w-8 h-8 text-orange-600 opacity-60" />}
          className="bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40"
          classNameValor="text-orange-700 dark:text-orange-400"
          testId="kpi-caducados"
        />
        <KpiCard
          titulo="Artigos com lotes a caducar"
          valor={`${resumo.artigosComLotesProximosCaducar}`}
          sufixo={resumo.artigosComLotesProximosCaducar === 1 ? "artigo" : "artigos"}
          icon={<CalendarClock className="w-8 h-8 text-sky-500 opacity-60" />}
          className="bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/40"
          classNameValor="text-sky-700 dark:text-sky-400"
          testId="kpi-a-caducar"
        />
        <KpiCard
          titulo="Dentro dos Parâmetros"
          valor={`${resumo.normais}`}
          sufixo={resumo.normais === 1 ? "artigo" : "artigos"}
          icon={<CircleCheck className="w-8 h-8 text-emerald-500 opacity-60" />}
          className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
          classNameValor="text-emerald-700 dark:text-emerald-400"
          testId="kpi-normais"
        />
        <KpiCard
          titulo="Valor de Inventário"
          valor={formatCurrency(resumo.valorInventario)}
          sufixo=""
          icon={<Boxes className="w-8 h-8 text-primary opacity-60" />}
          className="bg-muted/40 border-border"
          classNameValor="text-foreground"
          testId="kpi-valor-inventario"
        />
      </div>

      {/* Tabela de estado por artigo */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground text-sm">Estado de Stock por Artigo</h3>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por código ou descrição..."
                aria-label="Pesquisar artigos por código ou descrição"
                className="h-8 pl-8 pr-3 w-64 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex items-center rounded-md border border-border overflow-hidden" role="group" aria-label="Filtro de situação">
              {(["todos", "alertas"] as FiltroSituacao[]).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => setFiltro(opcao)}
                  aria-pressed={filtro === opcao}
                  className={cn(
                    "h-8 px-3 text-xs font-medium transition-colors",
                    filtro === opcao
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {opcao === "todos" ? "Todos" : "Só alertas"}
                </button>
              ))}
            </div>

            <div className="w-40">
              <SearchSelect
                value={situacao}
                onChange={setSituacao}
                placeholder="Todas as situações"
                options={SITUACAO_OPCOES}
                allowClear
              />
            </div>

            <button
              type="button"
              onClick={fetchEstado}
              disabled={isLoading}
              className="h-8 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-xs transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Código (SKU)</th>
                <th className="px-4 py-3">Descrição do Artigo</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Stock Atual</th>
                <th className="px-4 py-3 text-right">Stock Mínimo</th>
                <th className="px-4 py-3 text-right">Ponto de Encomenda</th>
                <th className="px-4 py-3 text-right">Valor (Custo)</th>
                <th className="px-4 py-3 text-center">Situação</th>
                <th className="px-4 py-3 text-right">Recomenda-se Reabastecer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={colunas} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A verificar níveis de inventário...</span>
                  </td>
                </tr>
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={colunas} className="py-12 text-center text-muted-foreground">
                    <PackageX className="w-10 h-10 mx-auto mb-3 opacity-30 text-muted-foreground" />
                    <p className="font-medium text-foreground">
                      {filtro === "alertas"
                        ? "Nenhum artigo em rutura ou abaixo do stock mínimo"
                        : "Nenhum artigo encontrado"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search
                        ? "Ajuste a pesquisa para localizar o artigo."
                        : filtro === "alertas"
                          ? "Todos os níveis de stock estão normais neste momento."
                          : "Não existem artigos físicos activos registados."}
                    </p>
                  </td>
                </tr>
              ) : (
                linhas.map((linha) => (
                  <tr key={linha.artigoId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{linha.codigo}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{linha.descricao}</td>
                    <td className="px-4 py-3 text-center">
                      <EstadoBadge estado={linha.estado} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span
                        className={cn(
                          linha.stockAtual <= 0
                            ? "text-rose-600 font-extrabold"
                            : linha.situacao === "stock_baixo"
                              ? "text-amber-600"
                              : "text-foreground"
                        )}
                      >
                        {formatQuantidade(linha.stockAtual)}
                      </span>{" "}
                      <span className="text-xs font-normal text-muted-foreground">{linha.unidade}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatQuantidade(linha.stockMinimo)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatQuantidade(linha.pontoEncomenda)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatCurrency(linha.valorTotal)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SituacaoBadge situacao={linha.situacao} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium text-foreground">
                      {formatQuantidade(
                        linha.situacao === "normal" ? 0 : Math.max(linha.pontoEncomenda - linha.stockAtual, 0)
                      )}{" "}
                      <span className="text-muted-foreground">{linha.unidade}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          {linhas.length} de {total} {total === 1 ? "artigo" : "artigos"}
        </div>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "descontinuado") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
        Descontinuado
      </span>
    );
  }
  if (estado === "inativo") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        Inativo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <CircleCheck className="w-3.5 h-3.5" /> Ativo
    </span>
  );
}

function SituacaoBadge({ situacao }: { situacao: AlertaStockDto["situacao"] }) {
  if (situacao === "rutura") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        <XCircle className="w-3.5 h-3.5" /> Rutura
      </span>
    );
  }
  if (situacao === "stock_baixo") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5" /> Stock Baixo
      </span>
    );
  }
  if (situacao === "caducado") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
        <CalendarClock className="w-3.5 h-3.5" /> Caducado
      </span>
    );
  }
  if (situacao === "proximo_caducar") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
        <CalendarClock className="w-3.5 h-3.5" /> A Caducar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <CircleCheck className="w-3.5 h-3.5" /> Normal
    </span>
  );
}

interface KpiCardProps {
  titulo: string;
  valor: string;
  sufixo: string;
  icon: React.ReactNode;
  className: string;
  classNameValor: string;
  testId?: string;
}

function KpiCard({ titulo, valor, sufixo, icon, className, classNameValor, testId }: KpiCardProps) {
  return (
    <div data-testid={testId} className={cn("border p-4 rounded-lg flex items-center justify-between", className)}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</div>
        <div className={cn("text-2xl font-bold mt-1", classNameValor)}>
          {valor} {sufixo && <span className="text-sm font-medium">{sufixo}</span>}
        </div>
      </div>
      {icon}
    </div>
  );
}
