/**
 * @file ArmazemManager.tsx
 * @description Gestão completa de Armazéns (RF06): listagem, criação, edição, indicação de armazéns padrão (ARM-01 Geral e ARM-02 Vendas) e consulta de saldo de stock por armazém.
 */

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Warehouse,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Package,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Boxes,
} from "lucide-react";
import { ArmazemDto, ArmazemStockDetailDto } from "../../@types/electron";
import { armazemApi } from "../../api/armazem.api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  FormShell,
  FormSection,
  TextField,
  SelectField,
  CheckboxField,
} from "./FormPrimitives";
import { SearchSelect } from "../ui/SearchSelect";
import { toast } from "sonner";

const armazemFormSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório").max(50),
  designacao: z.string().trim().min(2, "Designação é obrigatória").max(150),
  tipo: z.enum(["materia_prima", "produto_acabado", "producao", "devolucoes"]).optional().nullable(),
  localizacao: z.string().trim().max(255).optional().or(z.literal("")),
  isDefaultVendas: z.boolean(),
  isDefaultCompras: z.boolean(),
  ativo: z.boolean(),
});

type ArmazemFormValues = z.infer<typeof armazemFormSchema>;

export function ArmazemManager() {
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("");
  const [ativoFilter, setAtivoFilter] = useState<string>("");

  // Modal de criação / edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArmazem, setEditingArmazem] = useState<ArmazemDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de detalhe de stock
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockDetail, setStockDetail] = useState<ArmazemStockDetailDto | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [stockSearch, setStockSearch] = useState("");

  const methods = useForm<ArmazemFormValues>({
    resolver: zodResolver(armazemFormSchema),
    defaultValues: {
      isDefaultVendas: false,
      isDefaultCompras: false,
      ativo: true,
    },
  });

  const fetchArmazens = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await armazemApi.list({
        search: search.trim() || undefined,
        tipo: tipoFilter || undefined,
        ativo: ativoFilter === "true" ? true : ativoFilter === "false" ? false : undefined,
        take: 100,
      });

      if (res.success) {
        setArmazens(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao carregar armazéns: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, tipoFilter, ativoFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchArmazens();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchArmazens]);

  const handleCreate = () => {
    setEditingArmazem(null);
    methods.reset({
      codigo: "",
      designacao: "",
      tipo: "produto_acabado",
      localizacao: "",
      isDefaultVendas: false,
      isDefaultCompras: false,
      ativo: true,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (arm: ArmazemDto) => {
    setEditingArmazem(arm);
    methods.reset({
      codigo: arm.codigo,
      designacao: arm.designacao,
      tipo: arm.tipo || undefined,
      localizacao: arm.localizacao || "",
      isDefaultVendas: arm.isDefaultVendas,
      isDefaultCompras: arm.isDefaultCompras,
      ativo: arm.ativo,
    });
    setIsModalOpen(true);
  };

  const handleViewStock = async (arm: ArmazemDto) => {
    try {
      setIsLoadingStock(true);
      setIsStockModalOpen(true);
      setStockSearch("");
      const res = await armazemApi.getStock(arm.id);
      if (res.success) {
        setStockDetail(res.data);
      } else {
        toast.error("Erro ao carregar stock do armazém: " + res.error.message);
      }
    } catch {
      toast.error("Erro ao carregar dados de stock.");
    } finally {
      setIsLoadingStock(false);
    }
  };

  const handleDelete = async (arm: ArmazemDto) => {
    if (arm.codigo === "ARM-01" || arm.codigo === "ARM-02") {
      toast.error("Os armazéns padrão ARM-01 e ARM-02 não podem ser removidos.");
      return;
    }

    const confirmMsg = `Tem a certeza que deseja remover ou inativar o armazém "${arm.designacao}" (${arm.codigo})?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await armazemApi.delete(arm.id);
      if (res.success) {
        toast.success(res.data.message);
        fetchArmazens();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao remover o armazém.");
    }
  };

  const handleFormSubmit = async (values: ArmazemFormValues) => {
    try {
      setIsSubmitting(true);
      if (editingArmazem) {
        const res = await armazemApi.update(editingArmazem.id, values as unknown as Partial<ArmazemDto>);
        if (res.success) {
          toast.success("Armazém atualizado com sucesso!");
          setIsModalOpen(false);
          fetchArmazens();
        } else {
          toast.error(res.error.message);
        }
      } else {
        const res = await armazemApi.create(values as unknown as Partial<ArmazemDto>);
        if (res.success) {
          toast.success("Armazém cadastrado com sucesso!");
          setIsModalOpen(false);
          fetchArmazens();
        } else {
          toast.error(res.error.message);
        }
      }
    } catch {
      toast.error("Erro ao gravar dados do armazém.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTipoLabel = (tipo?: string | null) => {
    switch (tipo) {
      case "materia_prima":
        return "Matéria-Prima / Entrada";
      case "produto_acabado":
        return "Produto Acabado / Loja";
      case "producao":
        return "Produção / Fabrico";
      case "devolucoes":
        return "Devoluções / Avarias";
      default:
        return "Geral";
    }
  };

  const filteredStockArticles = stockDetail?.artigos.filter((art) => {
    if (!stockSearch) return true;
    const s = stockSearch.toLowerCase();
    return art.codigo.toLowerCase().includes(s) || art.descricao.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      {/* Barra Superior com Filtros & Ações */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Pesquisar por Código, Designação, Localização..."
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
                { value: "materia_prima", label: "Matéria-prima" },
                { value: "produto_acabado", label: "Produto acabado" },
                { value: "producao", label: "Produção" },
                { value: "devolucoes", label: "Devoluções" },
              ]}
            />
          </div>

          <div className="w-40">
            <SearchSelect
              value={ativoFilter}
              onChange={setAtivoFilter}
              placeholder="Todos os Estados"
              options={[
                { value: "true", label: "Ativos" },
                { value: "false", label: "Inativos" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchArmazens}
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
            <span>Novo Armazém</span>
          </button>
        </div>
      </div>

      {/* Cards de Destaque para Armazéns Padrão */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Armazém 01 - Geral */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10 border border-blue-200/70 dark:border-blue-800/40 p-4 rounded-lg shadow-sm flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-600 text-white">
                ARM-01
              </span>
              <h3 className="font-semibold text-foreground">Armazém Geral</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded-full">
                <ArrowDownLeft className="w-3 h-3" /> Padrão de Compras & Entradas
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Armazém central destinado à receção de materiais, compras e gestão de estoque primário.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const arm = armazens.find((a) => a.codigo === "ARM-01");
              if (arm) handleViewStock(arm);
            }}
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 pt-1"
          >
            <Layers className="w-3.5 h-3.5" /> Ver Stock
          </button>
        </div>

        {/* Armazém 02 - Vendas */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10 border border-emerald-200/70 dark:border-emerald-800/40 p-4 rounded-lg shadow-sm flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-600 text-white">
                ARM-02
              </span>
              <h3 className="font-semibold text-foreground">Armazém de Vendas</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-full">
                <ArrowUpRight className="w-3 h-3" /> Padrão de Vendas & PDV (Baixas)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Armazém de loja onde são faturados os artigos e de onde ocorrem as baixas automáticas de vendas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const arm = armazens.find((a) => a.codigo === "ARM-02");
              if (arm) handleViewStock(arm);
            }}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 pt-1"
          >
            <Layers className="w-3.5 h-3.5" /> Ver Stock
          </button>
        </div>
      </div>

      {/* Tabela de Armazéns */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Designação</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Finalidade / Papel</th>
                <th className="px-4 py-3">Localização / Endereço</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar lista de armazéns...</span>
                  </td>
                </tr>
              ) : armazens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Warehouse className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum armazém encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || tipoFilter || ativoFilter
                        ? "Tente ajustar os critérios de pesquisa."
                        : "Clique em 'Novo Armazém' para registar um novo local de estoque."}
                    </p>
                  </td>
                </tr>
              ) : (
                armazens.map((arm) => (
                  <tr key={arm.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      {arm.codigo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Warehouse className="w-4 h-4 text-primary opacity-80" />
                        {arm.designacao}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {getTipoLabel(arm.tipo)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {arm.isDefaultCompras && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Padrão Compras
                          </span>
                        )}
                        {arm.isDefaultVendas && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Padrão Vendas
                          </span>
                        )}
                        {!arm.isDefaultCompras && !arm.isDefaultVendas && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-muted-foreground bg-muted">
                            Secundário
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {arm.localizacao || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {arm.ativo ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleViewStock(arm)}
                          className="p-1.5 rounded hover:bg-muted text-primary hover:text-primary transition-colors"
                          title="Ver inventário e saldo deste armazém"
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(arm)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar Armazém"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(arm)}
                          disabled={arm.codigo === "ARM-01" || arm.codigo === "ARM-02"}
                          className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            arm.codigo === "ARM-01" || arm.codigo === "ARM-02"
                              ? "Armazéns padrão do sistema não podem ser removidos"
                              : "Remover ou Inativar"
                          }
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
            Total de <strong>{total}</strong> {total === 1 ? "armazém configurado" : "armazéns configurados"}
          </span>
          <span>Logística Multi-Armazém • SOC TECHNO</span>
        </div>
      </div>

      {/* Modal de Criação / Edição de Armazém */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-primary" />
              <DialogTitle>
                {editingArmazem ? `Editar Armazém: ${editingArmazem.codigo}` : "Novo Armazém de Stock"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {editingArmazem
                ? "Atualize a designação, localização e papéis padrão do armazém."
                : "Registe um novo armazém físico ou lógico para controlo de mercadorias."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <FormShell
              methods={methods}
              onSubmit={handleFormSubmit}
              onCancel={() => setIsModalOpen(false)}
              submitLabel={isSubmitting ? "A guardar..." : "Guardar Armazém"}
            >
              <FormSection title="Dados do Armazém">
                <TextField name="codigo" label="Código do Armazém" required placeholder="ARM-03" span="1" />
                <TextField name="designacao" label="Designação" required placeholder="Armazém Norte / Produção" span="2" />
                <SelectField
                  name="tipo"
                  label="Tipo de Armazém"
                  options={[
                    { value: "produto_acabado", label: "Produto Acabado / Vendas" },
                    { value: "materia_prima", label: "Matéria-Prima / Entradas" },
                    { value: "producao", label: "Produção / Fabrico" },
                    { value: "devolucoes", label: "Devoluções / Avarias" },
                  ]}
                  span="1"
                />
                <TextField name="localizacao" label="Localização / Endereço Físico" placeholder="Ex: Pavilhão B, Piso 1" span="full" />
              </FormSection>

              <FormSection title="Papéis no Sistema" description="Defina se este armazém assume fluxos padrão.">
                <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 border border-border rounded-lg bg-muted/10 space-y-2">
                    <CheckboxField
                      name="isDefaultVendas"
                      label="Armazém Padrão de Vendas (Default PDV)"
                      description="As vendas e baixas de estoque sairão automaticamente deste armazém."
                    />
                  </div>
                  <div className="p-3 border border-border rounded-lg bg-muted/10 space-y-2">
                    <CheckboxField
                      name="isDefaultCompras"
                      label="Armazém Padrão de Compras (Receções)"
                      description="As encomendas e receções de fornecedores entrarão por defeito aqui."
                    />
                  </div>
                </div>

                <div className="col-span-full pt-2">
                  <CheckboxField name="ativo" label="Armazém Ativo para Operações" />
                </div>
              </FormSection>
            </FormShell>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Consulta de Stock do Armazém */}
      <Dialog open={isStockModalOpen} onOpenChange={setIsStockModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" />
              <DialogTitle>
                Stock em Armazém: {stockDetail?.armazem.codigo} — {stockDetail?.armazem.designacao}
              </DialogTitle>
            </div>
            <DialogDescription>
              Consulta em tempo real dos artigos físicos armazenados e respetiva valorização ao Custo Médio Ponderado.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            {/* Resumo Métricas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/30 border border-border p-3 rounded-lg">
                <div className="text-xs text-muted-foreground">Total de Linhas com Stock</div>
                <div className="text-lg font-bold text-foreground">{stockDetail?.totalItens || 0} artigos</div>
              </div>
              <div className="bg-muted/30 border border-border p-3 rounded-lg">
                <div className="text-xs text-muted-foreground">Valorização Total (PMP)</div>
                <div className="text-lg font-bold text-primary">
                  {Number(stockDetail?.valorTotalArmazem || 0).toFixed(2)} €
                </div>
              </div>
              <div className="bg-muted/30 border border-border p-3 rounded-lg">
                <div className="text-xs text-muted-foreground">Localização</div>
                <div className="text-xs font-medium text-foreground truncate mt-1">
                  {stockDetail?.armazem.localizacao || "Não especificada"}
                </div>
              </div>
            </div>

            {/* Barra de Pesquisa de Artigos */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar artigo por SKU ou Descrição..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Tabela de Artigos em Armazém */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Descrição</th>
                    <th className="px-4 py-2.5 text-center">Unidade</th>
                    <th className="px-4 py-2.5 text-right">Qtd. em Armazém</th>
                    <th className="px-4 py-2.5 text-right">PMP (€)</th>
                    <th className="px-4 py-2.5 text-right">Total (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingStock ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                        <span>A calcular inventário do armazém...</span>
                      </td>
                    </tr>
                  ) : !filteredStockArticles || filteredStockArticles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <span>Nenhum artigo encontrado no armazém com os critérios informados.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredStockArticles.map((item) => (
                      <tr key={item.artigoId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">{item.codigo}</td>
                        <td className="px-4 py-2.5 text-foreground">{item.descricao}</td>
                        <td className="px-4 py-2.5 text-center font-mono text-xs">{item.unidade}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                          <span className={item.stockAtual > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                            {item.stockAtual}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                          {item.precoCustoMedio.toFixed(2)} €
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium">
                          {item.valorTotal.toFixed(2)} €
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
