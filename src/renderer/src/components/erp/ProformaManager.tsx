/**
 * @file ProformaManager.tsx
 * @description Gestão do ciclo de vida das Faturas Proforma (FP): criação de rascunho, emissão
 * numerada, histórico, pré-visualização/impressão, conversão em Guia de Entrega ou Fatura e anulação.
 * Uma Proforma é um documento comercial: não é documento fiscal e não movimenta stock.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  FileSignature,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import {
  ProformaVendaDto,
  DocumentoPrintDto,
  SerieDocumentoDto,
} from "../../@types/electron";
import { proformasApi } from "../../api/proformas.api";
import { useDocumentoBase } from "../../hooks/useDocumentoBase";
import { formatCurrency } from "../../utils/currency";
import { DocumentoPreviewDialog } from "../documentos/DocumentoPreviewDialog";
import { SearchSelect } from "../ui/SearchSelect";
import { QuantityInput } from "./FormPrimitives";
import { toast } from "sonner";

interface LinhaProformaForm {
  artigoId: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: number;
  motivoIsencao: string;
}

const hojeIso = () => new Date().toISOString().split("T")[0];
const daquiA15Dias = () =>
  new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().split("T")[0];

const ESTADO_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  emitida: "Emitida",
  convertida: "Convertida",
  anulada: "Anulada",
};

const ESTADO_CLASS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  emitida: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  convertida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function ProformaManager() {
  const { empresaId, series, setSeries, clientes, artigos, armazens, fetchSeries } =
    useDocumentoBase();

  const [activeTab, setActiveTab] = useState<"emitir" | "historico">("emitir");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  // Formulário
  const [serie, setSerie] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [dataEmissao, setDataEmissao] = useState(hojeIso);
  const [dataValidade, setDataValidade] = useState(daquiA15Dias);
  const [encomendaOrigem, setEncomendaOrigem] = useState("");
  const [motivoIsencao, setMotivoIsencao] = useState("");
  const [linhas, setLinhas] = useState<LinhaProformaForm[]>([]);

  // Conversão
  const [converting, setConverting] = useState<ProformaVendaDto | null>(null);
  const [convertingTo, setConvertingTo] = useState<"guia" | "fatura">("guia");
  const [convSerie, setConvSerie] = useState("");
  const [convSeriesList, setConvSeriesList] = useState<SerieDocumentoDto[]>([]);
  const [convArmazem, setConvArmazem] = useState("");
  const [convLocalEntrega, setConvLocalEntrega] = useState("");
  const [convTransportador, setConvTransportador] = useState("");

  // Anulação
  const [cancelling, setCancelling] = useState<ProformaVendaDto | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");

  // Pré-visualização
  const [preview, setPreview] = useState<DocumentoPrintDto | null>(null);

  const [proformas, setProformas] = useState<ProformaVendaDto[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    let obsoleto = false;
    fetchSeries("FP").then((lista) => {
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

  const fetchProformas = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await proformasApi.list({ empresaId, search: search.trim() || undefined, take: 100 });
      if (res.success) setProformas(res.data.items);
      else toast.error("Erro ao carregar proformas: " + res.error.message);
    } catch {
      toast.error("Falha ao comunicar com o backend de proformas.");
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, search]);

  useEffect(() => {
    if (activeTab === "historico") fetchProformas();
  }, [activeTab, fetchProformas]);

  const resetForm = () => {
    setLinhas([]);
    setEncomendaOrigem("");
    setMotivoIsencao("");
    setDataEmissao(hojeIso());
    setDataValidade(daquiA15Dias());
  };

  const handleAddLinha = () => {
    if (artigos.length === 0) {
      toast.error("Nenhum artigo cadastrado.");
      return;
    }
    const art = artigos[0];
    setLinhas((prev) => [
      ...prev,
      {
        artigoId: art.id,
        quantidade: 1,
        precoUnitario: Number(art.precoVenda || 0),
        desconto: 0,
        taxaIva: Number(art.taxaIva || 14),
        motivoIsencao: "",
      },
    ]);
  };

  const handleLinhaArtigoChange = (index: number, novoArtigoId: string) => {
    const art = artigos.find((a) => a.id === novoArtigoId);
    if (!art) return;
    setLinhas((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        artigoId: art.id,
        precoUnitario: Number(art.precoVenda || 0),
        taxaIva: Number(art.taxaIva || 14),
      };
      return copy;
    });
  };

  const handleUpdateLinha = (index: number, field: keyof LinhaProformaForm, value: number | string) => {
    setLinhas((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveLinha = (index: number) => setLinhas((prev) => prev.filter((_, i) => i !== index));

  const temIsencaoIva = linhas.some((l) => l.taxaIva === 0);

  const { subtotalIliquido, totalIva, totalLiquido } = useMemo(() => {
    const iliq = linhas.reduce(
      (acc, l) => acc + l.quantidade * l.precoUnitario * (1 - l.desconto / 100),
      0
    );
    const iva = linhas.reduce((acc, l) => {
      const base = l.quantidade * l.precoUnitario * (1 - l.desconto / 100);
      return acc + base * (l.taxaIva / 100);
    }, 0);
    return { subtotalIliquido: iliq, totalIva: iva, totalLiquido: iliq + iva };
  }, [linhas]);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaId) {
      toast.error("Não há empresa configurada para esta sessão.");
      return;
    }
    if (!clienteId) {
      toast.error("Selecione o cliente destinatário da proforma.");
      return;
    }
    if (!serie) {
      toast.error("Selecione a série do documento.");
      return;
    }
    if (linhas.length === 0) {
      toast.error("Adicione pelo menos um artigo à proforma.");
      return;
    }
    if (temIsencaoIva && !motivoIsencao.trim()) {
      toast.error("Indique o motivo de isenção de IVA para os itens isentos.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await proformasApi.criar({
        empresaId,
        serie,
        dataEmissao: new Date(dataEmissao),
        dataValidade: new Date(dataValidade),
        clienteId,
        encomendaOrigem: encomendaOrigem.trim() || null,
        motivoIsencao: motivoIsencao.trim() || null,
        linhas: linhas.map((l) => ({
          artigoId: l.artigoId,
          quantidade: l.quantidade,
          precoUnitario: l.precoUnitario,
          desconto: l.desconto,
          taxaIva: l.taxaIva,
          motivoIsencao: l.motivoIsencao.trim() || null,
        })),
      });

      if (res.success) {
        toast.success(`Proforma ${res.data.numero} criada como rascunho. Emita-a para reservar o número.`);
        resetForm();
        setActiveTab("historico");
        fetchProformas();
      } else {
        toast.error("Erro ao criar proforma: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmitir = async (p: ProformaVendaDto) => {
    try {
      const res = await proformasApi.emitir(p.id);
      if (res.success) {
        toast.success(`Proforma ${res.data.numero} emitida. Numeração reservada à série FP.`);
        fetchProformas();
      } else {
        toast.error("Erro ao emitir proforma: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao emitir a proforma.");
    }
  };

  const handlePreview = async (p: ProformaVendaDto) => {
    try {
      const res = await proformasApi.getDocumentoImprimivel(p.id);
      if (res.success) setPreview(res.data);
      else toast.error("Erro ao carregar a pré-visualização: " + res.error.message);
    } catch {
      toast.error("Falha ao carregar a pré-visualização.");
    }
  };

  const openConverter = async (p: ProformaVendaDto, destino: "guia" | "fatura") => {
    setConverting(p);
    setConvertingTo(destino);
    const tipo = destino === "guia" ? "GR" : "FT";
    const disponiveis = await fetchSeries(tipo);
    setConvSeriesList(disponiveis);
    setConvSerie(disponiveis.find((s) => s.estado === "ativo")?.codigo || disponiveis[0]?.codigo || "");
    if (destino === "guia" && armazens.length > 0) {
      setConvArmazem(
        armazens.find((a) => a.isDefaultVendas || a.codigo === "ARM-02")?.id || armazens[0].id
      );
    }
  };

  const handleConverter = async () => {
    if (!converting) return;
    try {
      setIsSubmitting(true);
      if (convertingTo === "guia") {
        if (!convArmazem) {
          toast.error("Selecione o armazém de expedição.");
          setIsSubmitting(false);
          return;
        }
        const res = await proformasApi.converterParaGuia(converting.id, {
          serie: convSerie,
          armazemExpedicaoId: convArmazem,
          localEntrega: convLocalEntrega.trim() || null,
          transportador: convTransportador.trim() || null,
        });
        if (res.success) {
          toast.success(`Guia de Entrega ${res.data.numero} criada a partir da proforma.`);
          setConverting(null);
          fetchProformas();
        } else {
          toast.error("Erro ao converter para guia: " + res.error.message);
        }
      } else {
        const res = await proformasApi.converterParaFatura(converting.id, {
          serie: convSerie,
          armazemExpedicaoId: null,
        });
        if (res.success) {
          toast.success(`Fatura ${res.data.numero} emitida a partir da proforma.`);
          setConverting(null);
          fetchProformas();
        } else {
          toast.error("Erro ao converter para fatura: " + res.error.message);
        }
      }
    } catch {
      toast.error("Falha ao converter a proforma.");
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
      const res = await proformasApi.anular(cancelling.id, cancelMotivo.trim());
      if (res.success) {
        toast.success(`Proforma ${res.data.numero} anulada. O registo foi preservado.`);
        setCancelling(null);
        setCancelMotivo("");
        fetchProformas();
      } else {
        toast.error("Erro ao anular proforma: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao anular a proforma.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCliente = clientes.find((c) => c.id === clienteId);

  return (
    <div className="space-y-4">
      {/* Barra de modos */}
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
            <span>Nova Proforma</span>
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
            <span>Histórico de Proformas</span>
          </button>
        </div>

        {activeTab === "emitir" && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span className="text-muted-foreground">Documento não fiscal — não movimenta stock</span>
          </div>
        )}
      </div>

      {/* MODO 1: FORMULÁRIO */}
      {activeTab === "emitir" && (
        <form onSubmit={handleCriar} className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2 border-b border-border/70 pb-3">
              <FileSignature className="w-4 h-4 text-primary" />
              Dados da Proforma
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
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
                  Série FP <span className="text-destructive">*</span>
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
                <label className="text-xs font-semibold text-foreground">Data de Emissão</label>
                <input
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Válida Até</label>
                <input
                  type="date"
                  value={dataValidade}
                  onChange={(e) => setDataValidade(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">Encomenda de Origem</label>
                <input
                  type="text"
                  value={encomendaOrigem}
                  onChange={(e) => setEncomendaOrigem(e.target.value)}
                  placeholder="Ex: ENC-2026-001"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Motivo de Isenção de IVA
                  {temIsencaoIva && <span className="text-destructive"> *</span>}
                </label>
                <input
                  type="text"
                  value={motivoIsencao}
                  onChange={(e) => setMotivoIsencao(e.target.value)}
                  placeholder="Obrigatório se alguma linha tiver taxa de IVA a 0%"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {selectedCliente && (
              <p className="text-[11px] text-muted-foreground">
                Destinatário: <strong className="text-foreground">{selectedCliente.nome}</strong> · NIF{" "}
                <span className="font-mono">{selectedCliente.nif}</span> · Cond. Pagamento{" "}
                {selectedCliente.condPagamento || "—"}
              </p>
            )}
          </div>

          {/* Linhas */}
          <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                Artigos e Valores
              </h3>
              <button
                type="button"
                onClick={handleAddLinha}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Artigo
              </button>
            </div>

            {linhas.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum artigo adicionado à proforma.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b border-border uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Artigo</th>
                      <th className="px-2 py-2 w-20">Qtd.</th>
                      <th className="px-2 py-2 w-28">Preço Unit.</th>
                      <th className="px-2 py-2 w-20">Desc. %</th>
                      <th className="px-2 py-2 w-20">IVA %</th>
                      <th className="px-2 py-2 w-28 text-right">Total</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhas.map((l, idx) => {
                      const base = l.quantidade * l.precoUnitario * (1 - l.desconto / 100);
                      const total = base + base * (l.taxaIva / 100);
                      return (
                        <tr key={idx}>
                          <td className="px-2 py-1.5">
                            <SearchSelect
                              value={l.artigoId}
                              onChange={(v) => handleLinhaArtigoChange(idx, v)}
                              options={artigos.map((a) => ({
                                value: a.id,
                                label: `${a.codigo} - ${a.descricao} (${a.unidade})`,
                              }))}
                              placeholder="Artigo..."
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
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.precoUnitario}
                              onChange={(e) => handleUpdateLinha(idx, "precoUnitario", Number(e.target.value))}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-right outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={l.desconto}
                              onChange={(e) => handleUpdateLinha(idx, "desconto", Number(e.target.value))}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-right outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={l.taxaIva}
                              onChange={(e) => handleUpdateLinha(idx, "taxaIva", Number(e.target.value))}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-right outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-semibold">
                            {total.toFixed(2)}
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
                  <tfoot className="border-t-2 border-border font-semibold">
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-right text-muted-foreground">
                        Total Ilíquido
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{subtotalIliquido.toFixed(2)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-2 py-1 text-right text-muted-foreground">
                        Total IVA
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{totalIva.toFixed(2)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-2 py-1 text-right">Total a Pagar</td>
                      <td className="px-2 py-1 text-right font-mono font-bold text-primary text-sm">
                        {totalLiquido.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                Gravar Rascunho
              </button>
            </div>
          </div>
        </form>
      )}

      {/* MODO 2: HISTÓRICO */}
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
                className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={fetchProformas}
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
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Emissão</th>
                  <th className="px-4 py-3">Válida Até</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      <span>A carregar proformas...</span>
                    </td>
                  </tr>
                ) : proformas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-foreground">Nenhuma proforma encontrada</p>
                    </td>
                  </tr>
                ) : (
                  proformas.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{p.numero}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{p.clienteNome}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(p.dataEmissao).toLocaleDateString("pt-PT")}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(p.dataValidade).toLocaleDateString("pt-PT")}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-right">
                        {formatCurrency(Number(p.totalLiquido))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            ESTADO_CLASS[p.estado] || ""
                          }`}
                        >
                          {ESTADO_LABEL[p.estado] || p.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {p.estado === "rascunho" && (
                            <button
                              type="button"
                              onClick={() => handleEmitir(p)}
                              className="p-1.5 rounded hover:bg-muted text-primary"
                              title="Emitir (reservar número FP)"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {p.estado !== "rascunho" && (
                            <button
                              type="button"
                              onClick={() => handlePreview(p)}
                              className="p-1.5 rounded hover:bg-muted text-primary"
                              title="Pré-visualizar / Imprimir"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {p.estado === "emitida" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openConverter(p, "guia")}
                                className="p-1.5 rounded hover:bg-muted text-sky-600"
                                title="Converter em Guia de Entrega"
                              >
                                <Truck className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openConverter(p, "fatura")}
                                className="p-1.5 rounded hover:bg-muted text-emerald-600"
                                title="Converter em Fatura"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {(p.estado === "rascunho" || p.estado === "emitida") && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelling(p);
                                setCancelMotivo("");
                              }}
                              className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                              title="Anular proforma"
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

      {/* Modal de conversão */}
      {converting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Converter {converting.numero} em {convertingTo === "guia" ? "Guia de Entrega" : "Fatura"}
            </h3>
            <p className="text-xs text-muted-foreground">
              As linhas comerciais serão copiadas com os snapshots da proforma. A
              {convertingTo === "guia" ? " confirmação da guia" : " emissão da fatura"} é a única
              ação que movimenta stock.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Série <span className="text-destructive">*</span>
              </label>
              <SearchSelect
                value={convSerie}
                onChange={setConvSerie}
                options={convSeriesList.map((s) => ({
                  value: s.codigo,
                  label: `${s.codigo} — ${s.descricao}`,
                }))}
                placeholder="Selecionar série..."
                required
              />
            </div>

            {convertingTo === "guia" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Armazém de Expedição <span className="text-destructive">*</span>
                  </label>
                  <SearchSelect
                    value={convArmazem}
                    onChange={setConvArmazem}
                    options={armazens.map((a) => ({
                      value: a.id,
                      label: `${a.codigo} - ${a.designacao}${a.isDefaultVendas ? " ★" : ""}`,
                    }))}
                    placeholder="Selecionar armazém..."
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Local de Entrega</label>
                  <input
                    type="text"
                    value={convLocalEntrega}
                    onChange={(e) => setConvLocalEntrega(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Transportador</label>
                  <input
                    type="text"
                    value={convTransportador}
                    onChange={(e) => setConvTransportador(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConverting(null)}
                className="px-4 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConverter}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Converter
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
              A anulação preserva o registo e a rastreabilidade. Não elimina o documento.
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
