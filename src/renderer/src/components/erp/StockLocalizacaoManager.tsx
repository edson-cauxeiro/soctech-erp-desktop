/**
 * @file StockLocalizacaoManager.tsx
 * @description Stock por Localização (TASK-029): consulta do saldo de `estoques`
 * com filtros em cascata Armazém → Área → Zona → Localização, mais Produto,
 * Lote e Estado do stock. É uma tela de leitura: nenhuma alteração de stock é
 * feita a partir daqui (a escrita passa sempre pelo livro-razão de movimentos).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  MapPin,
  PackageSearch,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  ArmazemDto,
  AreaArmazemDto,
  ArtigoDto,
  EstadoStockLocal,
  StockLocalizacaoDto,
  ZonaArmazemDto,
  LocalizacaoArmazemDto,
} from "../../@types/electron";
import { inventoryApi } from "../../api/inventory.api";
import { localizacaoApi } from "../../api/localizacao.api";
import { armazemApi } from "../../api/armazem.api";
import { artigoApi } from "../../api/artigo.api";
import { empresaApi } from "../../api/empresa.api";
import { DIAS_ALERTA_VALIDADE_PADRAO } from "../../utils/validade";
import { ValidadeBadge } from "./ValidadeBadge";
import { SearchSelect } from "../ui/SearchSelect";
import { StatusBadge } from "./Primitives";
import { toast } from "sonner";

const PAGE_SIZE = 50;

const ESTADO_OPCOES: { value: string; label: string }[] = [
  { value: "disponivel", label: "Disponível" },
  { value: "quarentena", label: "Quarentena" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "esgotado", label: "Esgotado" },
];

const ESTADO_TONE: Record<EstadoStockLocal, "success" | "warning" | "danger" | "neutral"> = {
  disponivel: "success",
  quarentena: "warning",
  bloqueado: "danger",
  esgotado: "neutral",
};

function formatQtd(valor: number): string {
  return Number(valor).toLocaleString("pt-PT", { maximumFractionDigits: 3 });
}

function formatEuros(valor: number): string {
  return Number(valor).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function StockLocalizacaoManager() {
  // Filtros
  const [armazemId, setArmazemId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [zonaId, setZonaId] = useState("");
  const [localizacaoId, setLocalizacaoId] = useState("");
  const [artigoId, setArtigoId] = useState("");
  const [numeroLote, setNumeroLote] = useState("");
  const [estado, setEstado] = useState("");

  // Opções dos filtros em cascata
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [areas, setAreas] = useState<AreaArmazemDto[]>([]);
  const [zonas, setZonas] = useState<ZonaArmazemDto[]>([]);
  const [localizacoes, setLocalizacoes] = useState<LocalizacaoArmazemDto[]>([]);
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);

  // Resultado
  const [linhas, setLinhas] = useState<StockLocalizacaoDto[]>([]);
  const [diasAlerta, setDiasAlerta] = useState(DIAS_ALERTA_VALIDADE_PADRAO);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [resArmazens, resArtigos, resEmpresa] = await Promise.all([
          armazemApi.list({ take: 200 }),
          artigoApi.list({ take: 200 }),
          empresaApi.get(),
        ]);
        if (resArmazens.success) setArmazens(resArmazens.data.items);
        if (resArtigos.success) setArtigos(resArtigos.data.items);
        if (resEmpresa.success && resEmpresa.data?.diasAlertaValidade) {
          setDiasAlerta(resEmpresa.data.diasAlertaValidade);
        }
      } catch {
        toast.error("Falha ao carregar as opções dos filtros.");
      }
    })();
  }, []);

  const loadAreas = useCallback(async (id: string) => {
    if (!id) {
      setAreas([]);
      return;
    }
    try {
      const res = await localizacaoApi.areas(id);
      if (res.success) setAreas(res.data);
      else toast.error(res.error.message);
    } catch {
      setAreas([]);
    }
  }, []);

  const loadZonas = useCallback(async (id: string) => {
    if (!id) {
      setZonas([]);
      return;
    }
    try {
      const res = await localizacaoApi.zonas(id);
      if (res.success) setZonas(res.data);
      else toast.error(res.error.message);
    } catch {
      setZonas([]);
    }
  }, []);

  const loadLocalizacoes = useCallback(async (id: string) => {
    if (!id) {
      setLocalizacoes([]);
      return;
    }
    try {
      const res = await localizacaoApi.list({ zonaId: id, apenasAtivas: true });
      if (res.success) setLocalizacoes(res.data);
      else toast.error(res.error.message);
    } catch {
      setLocalizacoes([]);
    }
  }, []);

  const handleArmazemChange = (id: string) => {
    setArmazemId(id);
    setAreaId("");
    setZonaId("");
    setLocalizacaoId("");
    setPage(0);
    void loadAreas(id);
  };

  const handleAreaChange = (id: string) => {
    setAreaId(id);
    setZonaId("");
    setLocalizacaoId("");
    setPage(0);
    void loadZonas(id);
  };

  const handleZonaChange = (id: string) => {
    setZonaId(id);
    setLocalizacaoId("");
    setPage(0);
    void loadLocalizacoes(id);
  };

  const filtros = useMemo(
    () => ({
      armazemId: armazemId || undefined,
      areaId: areaId || undefined,
      zonaId: zonaId || undefined,
      localizacaoId: localizacaoId || undefined,
      artigoId: artigoId || undefined,
      numeroLote: numeroLote.trim() || undefined,
      estado: (estado || undefined) as EstadoStockLocal | undefined,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    [armazemId, areaId, zonaId, localizacaoId, artigoId, numeroLote, estado, page]
  );

  const fetchLinhas = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await inventoryApi.consultarStock(filtros);
      if (res.success) {
        setLinhas(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao carregar stock: " + res.error.message);
        setLinhas([]);
        setTotal(0);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
      setLinhas([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchLinhas();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchLinhas]);

  const limparFiltros = () => {
    setArmazemId("");
    setAreaId("");
    setZonaId("");
    setLocalizacaoId("");
    setArtigoId("");
    setNumeroLote("");
    setEstado("");
    setPage(0);
    setAreas([]);
    setZonas([]);
    setLocalizacoes([]);
  };

  const temFiltro = Boolean(
    armazemId || areaId || zonaId || localizacaoId || artigoId || numeroLote.trim() || estado
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const primeiro = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const ultimo = Math.min(total, (page + 1) * PAGE_SIZE);

  const opcoesArtigos = useMemo(
    () =>
      artigos.map((a) => ({
        value: a.id,
        label: `${a.codigo} — ${a.descricao}`,
      })),
    [artigos]
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-56">
            <SearchSelect
              value={armazemId}
              onChange={handleArmazemChange}
              placeholder="Todos os Armazéns"
              options={armazens.map((a) => ({ value: a.id, label: `${a.codigo} — ${a.designacao}` }))}
            />
          </div>
          <div className="w-48">
            <SearchSelect
              value={areaId}
              onChange={handleAreaChange}
              placeholder={armazemId ? "Todas as Áreas" : "Escolha o armazém"}
              disabled={!armazemId}
              options={areas.map((a) => ({ value: a.id, label: `${a.codigo} — ${a.designacao}` }))}
            />
          </div>
          <div className="w-48">
            <SearchSelect
              value={zonaId}
              onChange={handleZonaChange}
              placeholder={areaId ? "Todas as Zonas" : "Escolha a área"}
              disabled={!areaId}
              options={zonas.map((z) => ({ value: z.id, label: `${z.codigo} — ${z.designacao}` }))}
            />
          </div>
          <div className="w-52">
            <SearchSelect
              value={localizacaoId}
              onChange={(id) => {
                setLocalizacaoId(id);
                setPage(0);
              }}
              placeholder={zonaId ? "Todas as Localizações" : "Escolha a zona"}
              disabled={!zonaId}
              options={localizacoes.map((l) => ({
                value: l.id,
                label: l.designacao ? `${l.codigo} — ${l.designacao}` : l.codigo,
              }))}
            />
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Nº de lote..."
              value={numeroLote}
              onChange={(e) => {
                setNumeroLote(e.target.value);
                setPage(0);
              }}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="w-44">
            <SearchSelect
              value={estado}
              onChange={(v) => {
                setEstado(v);
                setPage(0);
              }}
              placeholder="Todos os Estados"
              options={ESTADO_OPCOES}
            />
          </div>

          <button
            type="button"
            onClick={() => void fetchLinhas()}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          {temFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground text-sm transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Produto (largura independente para não espremer a cascata) */}
        <div className="max-w-md">
          <SearchSelect
            value={artigoId}
            onChange={(id) => {
              setArtigoId(id);
              setPage(0);
            }}
            placeholder="Todos os Produtos"
            options={opcoesArtigos}
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Armazém</th>
                <th className="px-4 py-3">Endereço (Área / Zona / Localização)</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Qtd.</th>
                <th className="px-4 py-3 text-right">Reservada</th>
                <th className="px-4 py-3 text-right">Disponível</th>
                <th className="px-4 py-3 text-right">Valor (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar stock por localização...</span>
                  </td>
                </tr>
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <PackageSearch className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum stock encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {temFiltro
                        ? "Tente ajustar os critérios de pesquisa."
                        : "Ainda não há saldo registado nas localizações."}
                    </p>
                  </td>
                </tr>
              ) : (
                linhas.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold text-foreground">
                        {l.artigo.codigo}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {l.artigo.descricao}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">
                        {l.armazem.codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l.localizacao || l.zona || l.area ? (
                        <span className="flex flex-wrap items-center gap-1 text-muted-foreground">
                          {l.area && (
                            <span className="font-medium text-foreground">{l.area.codigo}</span>
                          )}
                          {l.area && l.zona && <span>›</span>}
                          {l.zona && (
                            <span className="font-medium text-foreground">{l.zona.codigo}</span>
                          )}
                          {(l.area || l.zona) && l.localizacao && <span>›</span>}
                          {l.localizacao && (
                            <span className="font-mono font-medium text-foreground">
                              {l.localizacao.codigo}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground italic">
                          <MapPin className="w-3 h-3 opacity-60" /> Sem endereço
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l.lote ? (
                        <div className="space-y-1">
                          <div className="font-mono font-medium text-foreground">
                            {l.lote.numeroLote}
                          </div>
                          {l.lote.dataValidade && (
                            <div className="text-muted-foreground">
                              Val.{" "}
                              {new Date(l.lote.dataValidade).toLocaleDateString("pt-PT")}
                            </div>
                          )}
                          <ValidadeBadge dataValidade={l.lote.dataValidade} diasAlerta={diasAlerta} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge tone={ESTADO_TONE[l.estado]}>
                        {ESTADO_OPCOES.find((e) => e.value === l.estado)?.label ?? l.estado}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {formatQtd(l.quantidade)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatQtd(l.quantidadeReservada)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                      <span
                        className={
                          l.disponivel > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        }
                      >
                        {formatQtd(l.disponivel)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                      {formatEuros(l.valorTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé: contagem + paginação */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>
            {total > 0 ? (
              <>
                Linhas <strong>{primeiro}–{ultimo}</strong> de <strong>{total}</strong>
              </>
            ) : (
              "Sem resultados"
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isLoading}
              className="h-7 px-2 border border-border rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <span>
              Página {Math.min(page + 1, totalPages)} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || isLoading}
              className="h-7 px-2 border border-border rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              Seguinte <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Layers className="w-3.5 h-3.5 opacity-70" />
        Consulta de leitura sobre <span className="font-mono">estoques</span> — alterações de stock
        fazem-se pelos movimentos de stock.
      </div>
    </div>
  );
}
