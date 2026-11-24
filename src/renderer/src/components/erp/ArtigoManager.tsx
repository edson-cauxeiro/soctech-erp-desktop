/**
 * @file ArtigoManager.tsx
 * @description Gestão completa de Artigos (Master Data 360° - RF01): listagem, busca, filtros, criação e edição.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Boxes,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { ArtigoDto } from "../../@types/electron";
import { artigoApi } from "../../api/artigo.api";
import { ArtigoForm, ArtigoUnifiedValues } from "./ArtigoForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/currency";

import { SearchSelect } from "../ui/SearchSelect";

export function ArtigoManager() {
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");

  // Modal de criação / edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArtigo, setEditingArtigo] = useState<ArtigoDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchArtigos = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await artigoApi.list({
        search: search.trim() || undefined,
        tipo: tipoFilter || undefined,
        estado: estadoFilter || undefined,
        take: 100,
      });

      if (res.success) {
        setArtigos(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao carregar artigos: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, tipoFilter, estadoFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchArtigos();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchArtigos]);

  const handleCreate = () => {
    setEditingArtigo(null);
    setIsModalOpen(true);
  };

  const handleEdit = (artigo: ArtigoDto) => {
    setEditingArtigo(artigo);
    setIsModalOpen(true);
  };

  const handleDelete = async (artigo: ArtigoDto) => {
    const confirmMsg = `Tem a certeza que deseja remover ou inativar o artigo "${artigo.descricao}" (${artigo.codigo})?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await artigoApi.delete(artigo.id);
      if (res.success) {
        toast.success(res.data.message);
        fetchArtigos();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao remover o artigo.");
    }
  };

  const handleFormSubmit = async (values: ArtigoUnifiedValues) => {
    try {
      setIsSubmitting(true);
      if (editingArtigo) {
        const res = await artigoApi.update(editingArtigo.id, values as unknown as Partial<ArtigoDto>);
        if (res.success) {
          toast.success("Artigo atualizado com sucesso!");
          setIsModalOpen(false);
          fetchArtigos();
        } else {
          toast.error(res.error.message);
        }
      } else {
        const res = await artigoApi.create(values as unknown as Partial<ArtigoDto>);
        if (res.success) {
          toast.success("Artigo cadastrado com sucesso!");
          setIsModalOpen(false);
          fetchArtigos();
        } else {
          toast.error(res.error.message);
        }
      }
    } catch {
      toast.error("Erro ao gravar dados do artigo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTipoBadge = (tipo: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      produto_acabado: { label: "Produto Acabado", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
      materia_prima: { label: "Matéria-Prima", cls: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
      produto_intermedio: { label: "Intermédio", cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
      consumivel: { label: "Consumível", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
      servico: { label: "Serviço", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    };
    const item = map[tipo] || { label: tipo, cls: "bg-muted text-muted-foreground" };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.cls}`}>
        {item.label}
      </span>
    );
  };

  const getEstadoBadge = (estado: string) => {
    if (estado === "ativo") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
        </span>
      );
    }
    if (estado === "descontinuado") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
          <AlertTriangle className="w-3.5 h-3.5" /> Descontinuado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
        <XCircle className="w-3.5 h-3.5" /> Inativo
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barra de Ações & Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Pesquisar por SKU, Descrição, EAN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="w-48">
            <SearchSelect
              value={tipoFilter}
              onChange={setTipoFilter}
              placeholder="Todos os Tipos"
              options={[
                { value: "produto_acabado", label: "Produto Acabado" },
                { value: "materia_prima", label: "Matéria-Prima" },
                { value: "produto_intermedio", label: "Produto Intermédio" },
                { value: "consumivel", label: "Consumível" },
                { value: "servico", label: "Serviço" },
              ]}
            />
          </div>

          <div className="w-44">
            <SearchSelect
              value={estadoFilter}
              onChange={setEstadoFilter}
              placeholder="Todos os Estados"
              options={[
                { value: "ativo", label: "Ativos" },
                { value: "descontinuado", label: "Descontinuados" },
                { value: "inativo", label: "Inativos" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchArtigos}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="h-9 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-sm shadow-sm transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Artigo</span>
          </button>
        </div>
      </div>

      {/* Tabela de Artigos */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Código (SKU)</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-center">Unidade</th>
                <th className="px-4 py-3 text-right">Preço Venda</th>
                <th className="px-4 py-3 text-center">IVA</th>
                <th className="px-4 py-3 text-right">Custo Médio</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar catálogo de artigos...</span>
                  </td>
                </tr>
              ) : artigos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Boxes className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum artigo encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || tipoFilter || estadoFilter
                        ? "Tente ajustar os critérios de pesquisa."
                        : "Clique em 'Novo Artigo' para cadastrar o primeiro item do catálogo."}
                    </p>
                  </td>
                </tr>
              ) : (
                artigos.map((artigo) => (
                  <tr key={artigo.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      {artigo.codigo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{artigo.descricao}</div>
                      {artigo.codigoBarras && (
                        <div className="text-xs text-muted-foreground font-mono">
                          EAN: {artigo.codigoBarras}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{getTipoBadge(artigo.tipo)}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{artigo.unidade}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(Number(artigo.precoVenda))}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {Number(artigo.taxaIva)}%
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                      {formatCurrency(Number(artigo.precoCustoMedio || 0))}
                    </td>
                    <td className="px-4 py-3 text-center">{getEstadoBadge(artigo.estado)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(artigo)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar Artigo"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(artigo)}
                          className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors"
                          title="Remover ou Inativar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da tabela */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
          <span>
            Total de <strong>{total}</strong> {total === 1 ? "artigo registado" : "artigos registados"}
          </span>
          <span>Master Data 360° • SOC TECHNO</span>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <DialogTitle>
                {editingArtigo ? `Editar Artigo: ${editingArtigo.codigo}` : "Novo Artigo — Master Data 360°"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {editingArtigo
                ? "Atualize as informações comerciais, fiscais e de logística do artigo."
                : "Preencha a ficha cadastral do artigo. SKU e código de barras devem ser únicos."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <ArtigoForm
              initialValues={
                editingArtigo
                  ? {
                      codigo: editingArtigo.codigo,
                      descricao: editingArtigo.descricao,
                      tipo: editingArtigo.tipo,
                      unidade: editingArtigo.unidade as any,
                      familia: editingArtigo.familia || "",
                      codigoBarras: editingArtigo.codigoBarras || "",
                      estado: editingArtigo.estado,
                      precoVenda: Number(editingArtigo.precoVenda),
                      taxaIva: Number(editingArtigo.taxaIva),
                      fatorConversao: editingArtigo.fatorConversao ? Number(editingArtigo.fatorConversao) : 1,
                      stockMinimo: editingArtigo.stockMinimo ? Number(editingArtigo.stockMinimo) : 0,
                      stockMaximo: editingArtigo.stockMaximo ? Number(editingArtigo.stockMaximo) : 0,
                      pontoEncomenda: editingArtigo.pontoEncomenda ? Number(editingArtigo.pontoEncomenda) : 0,
                      controloLote: Boolean(editingArtigo.controloLote),
                      armazemPadraoId: editingArtigo.armazemPadraoId || "",
                      precoCustoMedio: editingArtigo.precoCustoMedio ? Number(editingArtigo.precoCustoMedio) : 0,
                      bom: editingArtigo.bom || "",
                      observacoes: editingArtigo.observacoes || "",
                    }
                  : undefined
              }
              onSubmit={handleFormSubmit}
              onCancel={() => setIsModalOpen(false)}
              isLoading={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
