/**
 * @file GuiaEntregaManager.tsx
 * @description Gestão do ciclo de vida das Guias de Entrega (GR): criação de rascunho com
 * entrada de lotes, confirmação (única acção que baixa stock), histórico, pré-visualização
 * sem valores monetários, conversão em fatura e anulação.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { GuiaEntregaDto, DocumentoPrintDto, SerieDocumentoDto } from "../../@types/electron";
import { guiasEntregaApi } from "../../api/guias-entrega.api";
import { stockApi } from "../../api/stock.api";
import { useDocumentoBase } from "../../hooks/useDocumentoBase";
import { DocumentoPreviewDialog } from "../documentos/DocumentoPreviewDialog";
import { SearchSelect } from "../ui/SearchSelect";
import { QuantityInput } from "./FormPrimitives";
import { toast } from "sonner";

interface LinhaGuiaForm {
  artigoId: string;
  quantidade: number;
  lote: string;
  stockDisponivel: number;
  isServico: boolean;
  controloLote: boolean;
}

const hojeIso = () => new Date().toISOString().split("T")[0];

const ESTADO_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  confirmada: "Confirmada",
  faturada: "Faturada",
  anulada: "Anulada",
};

const ESTADO_CLASS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  confirmada: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  faturada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function GuiaEntregaManager() {
  const { empresaId, series, setSeries, clientes, artigos, armazens, fetchSeries } =
    useDocumentoBase();

  const [activeTab, setActiveTab] = useState<"emitir" | "historico">("emitir");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  // Formulário
  const [serie, setSerie] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [armazemId, setArmazemId] = useState("");
  const [data, setData] = useState(hojeIso);
  const [localEntrega, setLocalEntrega] = useState("");
  const [transportador, setTransportador] = useState("");
  const [encomendaOrigem, setEncomendaOrigem] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [linhas, setLinhas] = useState<LinhaGuiaForm[]>([]);

  // Conversão em fatura
  const [faturando, setFaturando] = useState<GuiaEntregaDto | null>(null);
  const [fatSerie, setFatSerie] = useState("");
  const [fatSeriesList, setFatSeriesList] = useState<SerieDocumentoDto[]>([]);

  // Anulação
  const [cancelling, setCancelling] = useState<GuiaEntregaDto | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");

  const [preview, setPreview] = useState<DocumentoPrintDto | null>(null);
  const [guias, setGuias] = useState<GuiaEntregaDto[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    let obsoleto = false;
    fetchSeries("GR").then((lista) => {
      if (!obsoleto) setSeries(lista);
    });
    return () => {
      obsoleto = true;
    };
  }, [empresaId, fetchSeries, setSeries]);

  useEffect(() => {
    if (series.length === 0) return;
    if (series.some((s) => s.codigo === serie)) return;
    setSerie(series.find((s) => s.estado === "ativo")?.codigo || series[0].codigo);
  }, [series, serie]);

  useEffect(() => {
    if (armazens.length > 0 && !armazemId) {
      setArmazemId(
        armazens.find((a) => a.isDefaultVendas || a.codigo === "ARM-02")?.id || armazens[0].id
      );
    }
  }, [armazens, armazemId]);

  const fetchGuias = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await guiasEntregaApi.list({
        empresaId,
        search: search.trim() || undefined,
        take: 100,
      });
      if (res.success) setGuias(res.data.items);
      else toast.error("Erro ao carregar guias: " + res.error.message);
    } catch {
      toast.error("Falha ao comunicar com o backend de guias.");
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, search]);

  useEffect(() => {
    if (activeTab === "historico") fetchGuias();
  }, [activeTab, fetchGuias]);

  const consultarStock = async (artigoId: string): Promise<number> => {
    if (!armazemId) return 0;
    try {
      const res = await stockApi.getArtigoArmazem(artigoId, armazemId);
      return res.success ? res.data : 0;
    } catch {
      return 0;
    }
  };

  const novaLinha = async (artigoId: string): Promise<LinhaGuiaForm | null> => {
    const art = artigos.find((a) => a.id === artigoId);
    if (!art) return null;
    const isServico = art.tipo === "servico";
    return {
      artigoId: art.id,
      quantidade: 1,
      lote: "",
      stockDisponivel: isServico ? 999999 : await consultarStock(art.id),
      isServico,
      controloLote: art.controloLote,
    };
  };

  const handleAddLinha = async () => {
    if (artigos.length === 0) {
      toast.error("Nenhum artigo cadastrado.");
      return;
    }
    const l = await novaLinha(artigos[0].id);
    if (l) setLinhas((prev) => [...prev, l]);
  };

  const handleLinhaArtigoChange = async (index: number, novoArtigoId: string) => {
    const l = await novaLinha(novoArtigoId);
    if (!l) return;
    setLinhas((prev) => {
      const copy = [...prev];
      copy[index] = l;
      return copy;
    });
  };

  const handleArmazemChange = async (novoArmazemId: string) => {
    setArmazemId(novoArmazemId);
    if (linhas.length === 0) return;
    const atualizadas = await Promise.all(
      linhas.map(async (l) => {
        if (l.isServico) return l;
        return { ...l, stockDisponivel: await consultarStock(l.artigoId) };
      })
    );
    setLinhas(atualizadas);
  };

  const handleUpdateLinha = (index: number, field: "quantidade" | "lote", value: number | string) => {
    setLinhas((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveLinha = (index: number) => setLinhas((prev) => prev.filter((_, i) => i !== index));

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaId) {
      toast.error("Não há empresa configurada para esta sessão.");
      return;
    }
    if (!clienteId) {
      toast.error("Selecione o cliente destinatário da guia.");
      return;
    }
    if (!serie) {
      toast.error("Selecione a série do documento.");
      return;
    }
    if (!armazemId) {
      toast.error("Selecione o armazém de expedição.");
      return;
    }
    if (linhas.length === 0) {
      toast.error("Adicione pelo menos um artigo à guia.");
      return;
    }

    const semLote = linhas.find((l) => l.controloLote && !l.isServico && !l.lote.trim());
    if (semLote) {
      const art = artigos.find((a) => a.id === semLote.artigoId);
      toast.error(`O artigo "${art?.codigo}" está sob controlo de lote. Indique o lote.`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await guiasEntregaApi.criar({
        empresaId,
        serie,
        data: new Date(data),
        clienteId,
        armazemExpedicaoId: armazemId,
        encomendaOrigem: encomendaOrigem.trim() || null,
        localEntrega: localEntrega.trim() || null,
        transportador: transportador.trim() || null,
        observacoes: observacoes.trim() || null,
        linhas: linhas.map((l) => ({
          artigoId: l.artigoId,
          quantidade: l.quantidade,
          lote: l.lote.trim() || null,
        })),
      });

      if (res.success) {
        toast.success(
          `Guia ${res.data.numero} criada como rascunho. Confirme-a para dar baixa de stock.`
        );
        setLinhas([]);
        setEncomendaOrigem("");
        setObservacoes("");
        setActiveTab("historico");
        fetchGuias();
      } else {
        toast.error("Erro ao criar guia de entrega: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmar = async (g: GuiaEntregaDto) => {
    try {
      const res = await guiasEntregaApi.confirmar(g.id);
      if (res.success) {
        toast.success(
          `Guia ${res.data.numero} confirmada. Uma saída de stock foi gerada por linha física.`
        );
        fetchGuias();
      } else {
        toast.error("Erro ao confirmar guia: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao confirmar a guia.");
    }
  };

  const handlePreview = async (g: GuiaEntregaDto) => {
    try {
      const res = await guiasEntregaApi.getDocumentoImprimivel(g.id);
      if (res.success) setPreview(res.data);
      else toast.error("Erro ao carregar a pré-visualização: " + res.error.message);
    } catch {
      toast.error("Falha ao carregar a pré-visualização.");
    }
  };

  const openFaturar = async (g: GuiaEntregaDto) => {
    setFaturando(g);
    const disponiveis = await fetchSeries("FT");
    setFatSeriesList(disponiveis);
    setFatSerie(disponiveis.find((s) => s.estado === "ativo")?.codigo || disponiveis[0]?.codigo || "");
  };

  const handleFaturar = async () => {
    if (!faturando) return;
    if (!fatSerie) {
      toast.error("Selecione a série da fatura.");
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await guiasEntregaApi.faturar(faturando.id, { serie: fatSerie });
      if (res.success) {
        toast.success(
          `Fatura ${res.data.numero} emitida a partir da guia. Não foi gerada nova saída de stock.`
        );
        setFaturando(null);
        fetchGuias();
      } else {
        toast.error("Erro ao faturar guia: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao faturar a guia.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnular = async () => {
    if (!cancelling) return;
    if (cancelMotivo.trim().length < 3) {
      toast.error("Indique um motivo de anulação com pelo menos 3 caracteres.");
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await guiasEntregaApi.anular(cancelling.id, cancelMotivo.trim());
      if (res.success) {
        toast.success(`Guia ${res.data.numero} anulada. O registo foi preservado.`);
        setCancelling(null);
        setCancelMotivo("");
        fetchGuias();
      } else {
        toast.error("Erro ao anular guia: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao anular a guia.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCliente = clientes.find((c) => c.id === clienteId);
  const currentArmazem = armazens.find((a) => a.id === armazemId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("emitir")}
            className={`px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
              activeTab === "emitir"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Nova Guia</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("historico")}
            className={`px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
              activeTab === "historico"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Histórico de Guias</span>
          </button>
        </div>

        {activeTab === "emitir" && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-md text-xs">
            <Truck className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span className="text-muted-foreground">
              Documento logístico — sem valores fiscais
            </span>
          </div>
        )}
      </div>

      {activeTab === "emitir" && (
        <form onSubmit={handleCriar} className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2 border-b border-border/70 pb-3">
              <Truck className="w-4 h-4 text-primary" />
              Dados da Guia e Logística
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Cliente <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={clienteId}
                  onChange={setClienteId}
                  options={clientes.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))}
                  placeholder="Pesquisar cliente..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Série GR <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={serie}
                  onChange={setSerie}
                  options={series.map((s) => ({ value: s.codigo, label: `${s.codigo} — ${s.descricao}` }))}
                  placeholder="Selecionar série..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Data</label>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Armazém de Expedição <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={armazemId}
                  onChange={handleArmazemChange}
                  options={armazens.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} - ${a.designacao}${a.isDefaultVendas ? " ★ (Vendas)" : ""}`,
                  }))}
                  placeholder="Selecionar armazém..."
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  A confirmação da guia dá baixa de stock exactamente uma vez neste armazém.
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">Local de Entrega</label>
                <input
                  type="text"
                  value={localEntrega}
                  onChange={(e) => setLocalEntrega(e.target.value)}
                  placeholder="Endereço de entrega ao cliente"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Transportador</label>
                <input
                  type="text"
                  value={transportador}
                  onChange={(e) => setTransportador(e.target.value)}
                  placeholder="Opcional"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Encomenda de Origem</label>
                <input
                  type="text"
                  value={encomendaOrigem}
                  onChange={(e) => setEncomendaOrigem(e.target.value)}
                  placeholder="Ex: ENC-2026-001"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            {selectedCliente && (
              <p className="text-[11px] text-muted-foreground">
                Entregar a <strong className="text-foreground">{selectedCliente.nome}</strong> · NIF{" "}
                <span className="font-mono">{selectedCliente.nif}</span>
                {currentArmazem && <> · Expedição: {currentArmazem.codigo}</>}
              </p>
            )}
          </div>

          {/* Linhas */}
          <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Mercadorias a Expedir
              </h3>
              <button
                type="button"
                onClick={handleAddLinha}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Artigo
              </button>
            </div>

            {linhas.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum artigo adicionado à guia.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b border-border uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Artigo</th>
                      <th className="px-2 py-2 w-20">Qtd.</th>
                      <th className="px-2 py-2 w-28">Lote</th>
                      <th className="px-2 py-2 w-28 text-right">Stock Disponível</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhas.map((l, idx) => {
                      const semStock = !l.isServico && l.stockDisponivel < l.quantidade;
                      return (
                        <tr key={idx} className={semStock ? "bg-destructive/5" : ""}>
                          <td className="px-2 py-1.5">
                            <SearchSelect
                              value={l.artigoId}
                              onChange={(v) => handleLinhaArtigoChange(idx, v)}
                              options={artigos.map((a) => ({
                                value: a.id,
                                label: `${a.codigo} - ${a.descricao} (${a.unidade})`,
                              }))}
                              placeholder="Artigo..."
                              portal
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <QuantityInput
                              value={l.quantidade}
                              integer
                              min={1}
                              onChange={(valor) => handleUpdateLinha(idx, "quantidade", valor)}
                              className="text-right focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {l.isServico ? (
                              <span className="text-muted-foreground italic">Serviço</span>
                            ) : (
                              <input
                                type="text"
                                value={l.lote}
                                onChange={(e) => handleUpdateLinha(idx, "lote", e.target.value)}
                                placeholder={l.controloLote ? "Obrigatório" : "Opcional"}
                                className={`w-full h-8 px-2 rounded border bg-background text-sm outline-none focus:border-primary ${
                                  l.controloLote ? "border-destructive" : "border-input"
                                }`}
                              />
                            )}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right font-mono ${
                              semStock ? "text-destructive font-bold" : "text-muted-foreground"
                            }`}
                          >
                            {l.isServico ? "—" : l.stockDisponivel.toFixed(3)}
                            {semStock && (
                              <AlertTriangle className="w-3 h-3 inline ml-1 align-middle" />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveLinha(idx)}
                              className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                              title="Remover linha"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Observações</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Instruções de entrega, contacto no local, etc."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Gravar Rascunho
              </button>
            </div>
          </div>
        </form>
      )}

      {activeTab === "historico" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por número ou cliente..."
                className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={fetchGuias}
              disabled={isLoading}
              className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="border border-border rounded-lg bg-card overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th className="px-4 py-3">Nº Documento</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Armazém</th>
                  <th className="px-4 py-3 text-center">Linhas</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      <span>A carregar guias...</span>
                    </td>
                  </tr>
                ) : guias.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-foreground">Nenhuma guia encontrada</p>
                    </td>
                  </tr>
                ) : (
                  guias.map((g) => (
                    <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{g.numero}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(g.data).toLocaleDateString("pt-PT")}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{g.clienteNome}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {g.armazemDesignacao}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {g.linhas?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            ESTADO_CLASS[g.estado] || ""
                          }`}
                        >
                          {ESTADO_LABEL[g.estado] || g.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {g.estado === "rascunho" && (
                            <button
                              type="button"
                              onClick={() => handleConfirmar(g)}
                              className="p-1.5 rounded hover:bg-muted text-emerald-600"
                              title="Confirmar (baixa de stock)"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {g.estado !== "rascunho" && (
                            <button
                              type="button"
                              onClick={() => handlePreview(g)}
                              className="p-1.5 rounded hover:bg-muted text-primary"
                              title="Pré-visualizar / Imprimir"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {g.estado === "confirmada" && (
                            <button
                              type="button"
                              onClick={() => openFaturar(g)}
                              className="p-1.5 rounded hover:bg-muted text-sky-600"
                              title="Faturar guia"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          {g.estado !== "faturada" && g.estado !== "anulada" && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelling(g);
                                setCancelMotivo("");
                              }}
                              className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                              title="Anular guia"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de faturamento */}
      {faturando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Faturar {faturando.numero}
            </h3>
            <p className="text-xs text-muted-foreground">
              A fatura herda as linhas da guia e fica ligada a ela. Não será gerada uma segunda
              saída de stock.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Série da Fatura <span className="text-destructive">*</span>
              </label>
              <SearchSelect
                value={fatSerie}
                onChange={setFatSerie}
                options={fatSeriesList.map((s) => ({
                  value: s.codigo,
                  label: `${s.codigo} — ${s.descricao}`,
                }))}
                placeholder="Selecionar série..."
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFaturando(null)}
                className="px-4 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFaturar}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Faturar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de anulação */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Anular {cancelling.numero}
            </h3>
            <p className="text-xs text-muted-foreground">
              {cancelling.estado === "confirmada"
                ? "Anular uma guia confirmada vai gerar as entradas de stock de reversão, auditadas e ligadas a este documento. A guia já faturada não pode ser anulada."
                : "A guia nunca chegou a ser confirmada, pelo que não há stock a reverter. O registo é preservado."}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Motivo <span className="text-destructive">*</span>
              </label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                rows={3}
                placeholder="Descreva o motivo da anulação..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelling(null)}
                className="px-4 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleAnular}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-destructive text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Anular
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentoPreviewDialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
        documento={preview}
      />
    </div>
  );
}
