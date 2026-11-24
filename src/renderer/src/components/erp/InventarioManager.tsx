/**
 * @file InventarioManager.tsx
 * @description Gestão de Contagens Físicas de Inventário e Reconciliação Automática de Stock (RN06.3).
 */

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  Trash2,
  Loader2,
  Check,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { InventarioContagemDto, ArmazemDto, ArtigoDto } from "../../@types/electron";
import { stockApi } from "../../api/stock.api";
import { armazemApi } from "../../api/armazem.api";
import { artigoApi } from "../../api/artigo.api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { SearchSelect } from "../ui/SearchSelect";
import { toast } from "sonner";

export function InventarioManager() {
  const [inventarios, setInventarios] = useState<InventarioContagemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Auxiliares
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);

  // Modal de Criação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedArmazemId, setSelectedArmazemId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [linhasContagem, setLinhasContagem] = useState<
    Array<{ artigoId: string; qtdContada: number; lote?: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Detalhe / Fecho
  const [viewingInventario, setViewingInventario] = useState<InventarioContagemDto | null>(null);

  const fetchInventarios = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await stockApi.listInventarios();
      if (res.success) {
        setInventarios(res.data);
      } else {
        toast.error("Erro ao carregar inventários: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAuxData = async () => {
    try {
      const [resArm, resArt] = await Promise.all([
        armazemApi.list({ take: 100, ativo: true }),
        artigoApi.list({ take: 200 }),
      ]);
      if (resArm.success) setArmazens(resArm.data.items);
      if (resArt.success) setArtigos(resArt.data.items.filter((a) => a.tipo !== "servico"));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchInventarios();
    fetchAuxData();
  }, [fetchInventarios]);

  const handleOpenNew = () => {
    setSelectedArmazemId(armazens[0]?.id || "");
    setResponsavel("");
    setObservacoes("");
    setLinhasContagem([]);
    setIsModalOpen(true);
  };

  const handleAddLinha = () => {
    const availableArtigo = artigos.find(
      (art) => !linhasContagem.some((l) => l.artigoId === art.id)
    );
    if (!availableArtigo) {
      toast.warning("Todos os artigos já foram adicionados à lista.");
      return;
    }
    setLinhasContagem([...linhasContagem, { artigoId: availableArtigo.id, qtdContada: 0, lote: "" }]);
  };

  const handleRemoveLinha = (index: number) => {
    setLinhasContagem(linhasContagem.filter((_, i) => i !== index));
  };

  const handleUpdateLinha = (index: number, field: string, value: any) => {
    const updated = [...linhasContagem];
    updated[index] = { ...updated[index], [field]: value };
    setLinhasContagem(updated);
  };

  const handlePreencherTodosArtigos = () => {
    const all = artigos.map((art) => ({
      artigoId: art.id,
      qtdContada: 0,
      lote: "",
    }));
    setLinhasContagem(all);
  };

  const handleCreateInventario = async () => {
    if (!selectedArmazemId) {
      toast.error("Selecione um armazém.");
      return;
    }
    if (linhasContagem.length === 0) {
      toast.error("Adicione pelo menos um artigo à contagem.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await stockApi.criarInventario({
        armazemId: selectedArmazemId,
        data: new Date(),
        responsavel: responsavel.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        linhas: linhasContagem,
      });

      if (res.success) {
        toast.success(`Inventário ${res.data.numero} criado com sucesso!`);
        setIsModalOpen(false);
        fetchInventarios();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao criar inventário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFecharInventario = async (inv: InventarioContagemDto) => {
    const confirmMsg = `Tem a certeza que deseja fechar o inventário "${inv.numero}" e aplicar os ajustes automáticos de stock?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await stockApi.fecharInventario(inv.id);
      if (res.success) {
        toast.success(`Inventário ${inv.numero} fechado e reconciliado com sucesso!`);
        setViewingInventario(null);
        fetchInventarios();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao fechar inventário.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de Ações */}
      <div className="flex items-center justify-between bg-card p-4 rounded-lg border border-border shadow-sm">
        <div>
          <h3 className="font-semibold text-foreground text-sm">Contagens Físicas & Reconciliação</h3>
          <p className="text-xs text-muted-foreground">
            Apuramento de divergências e geração automática de movimentos de ajuste (RN06.3).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchInventarios}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="h-9 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-sm shadow-sm transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Contagem</span>
          </button>
        </div>
      </div>

      {/* Tabela de Inventários */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
            <tr>
              <th className="px-4 py-3">Nº Inventário</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Armazém</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3 text-center">Itens Contados</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                  <span>A carregar folhas de inventário...</span>
                </td>
              </tr>
            ) : inventarios.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-foreground">Nenhuma contagem de inventário registada</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique em &quot;Nova Contagem&quot; para iniciar uma auditoria física de estoque num armazém.
                  </p>
                </td>
              </tr>
            ) : (
              inventarios.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">{inv.numero}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {new Date(inv.data).toLocaleDateString("pt-PT")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-foreground">{inv.armazem?.codigo}</span> —{" "}
                    <span className="text-muted-foreground text-xs">{inv.armazem?.designacao}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{inv.responsavel || "—"}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs">{inv.linhas?.length || 0}</td>
                  <td className="px-4 py-3 text-center">
                    {inv.estado === "fechado" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Fechado & Reconciliado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full">
                        <Clock className="w-3.5 h-3.5" /> Em Curso
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setViewingInventario(inv)}
                      className="px-2.5 py-1 text-xs bg-muted hover:bg-muted/80 text-foreground rounded font-medium transition-colors"
                    >
                      Ver Linhas & Reconciliar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Nova Contagem */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              <DialogTitle>Nova Folha de Contagem Física</DialogTitle>
            </div>
            <DialogDescription>
              Selecione o armazém auditado e insira a contagem física das mercadorias.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Armazém *</label>
                <SearchSelect
                  value={selectedArmazemId}
                  onChange={setSelectedArmazemId}
                  options={armazens.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.designacao}`,
                  }))}
                  placeholder="Pesquisar armazém..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Responsável</label>
                <input
                  type="text"
                  placeholder="Nome do operador"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Observações</label>
                <input
                  type="text"
                  placeholder="Motivo da contagem..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            {/* Linhas de Contagem */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Artigos a Contar ({linhasContagem.length})
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePreencherTodosArtigos}
                    className="text-xs text-primary hover:underline"
                  >
                    Carregar Todo o Catálogo
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLinha}
                    className="px-2.5 py-1 text-xs bg-primary text-primary-foreground font-medium rounded flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Linha
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {linhasContagem.map((linha, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/20 p-2 rounded border border-border">
                      <SearchSelect
                        value={linha.artigoId}
                        onChange={(val) => handleUpdateLinha(idx, "artigoId", val)}
                        options={artigos.map((a) => ({
                          value: a.id,
                          label: `${a.codigo} — ${a.descricao} (${a.unidade})`,
                        }))}
                        placeholder="Pesquisar artigo..."
                        className="flex-1 min-w-0"
                        required
                      />

                      <div className="w-32">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="Qtd. Contada"
                          value={linha.qtdContada}
                          onKeyDown={(e) => {
                            if (e.key === "." || e.key === "," || e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            const num = val === "" ? 0 : parseInt(val, 10);
                            handleUpdateLinha(idx, "qtdContada", isNaN(num) ? 0 : Math.max(0, num));
                          }}
                          className="w-full h-8 rounded border border-input bg-background px-2 text-xs font-mono text-right focus:border-primary outline-none"
                        />
                      </div>

                      <div className="w-32">
                        <input
                          type="text"
                          placeholder="Lote (opcional)"
                          value={linha.lote || ""}
                          onChange={(e) => handleUpdateLinha(idx, "lote", e.target.value)}
                          className="w-full h-8 rounded border border-input bg-background px-2 text-xs font-mono"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLinha(idx)}
                        className="p-1 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950 rounded"
                        title="Remover linha"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateInventario}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar Folha de Contagem
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhe e Reconciliação do Inventário */}
      <Dialog open={!!viewingInventario} onOpenChange={(open) => !open && setViewingInventario(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <DialogTitle>
                Inventário {viewingInventario?.numero} — {viewingInventario?.armazem?.designacao}
              </DialogTitle>
            </div>
            <DialogDescription>
              Comparação detalhada entre as quantidades registadas em sistema e as contagens físicas apuradas.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Artigo</th>
                    <th className="px-4 py-2.5 text-center">Unidade</th>
                    <th className="px-4 py-2.5 text-right">Qtd. Sistema</th>
                    <th className="px-4 py-2.5 text-right">Qtd. Contada</th>
                    <th className="px-4 py-2.5 text-right">Diferença</th>
                    <th className="px-4 py-2.5 text-center">Impacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {viewingInventario?.linhas?.map((l) => {
                    const diff = Number(l.diferenca);
                    return (
                      <tr key={l.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-foreground">{l.artigo?.descricao}</div>
                          <div className="text-xs font-mono text-muted-foreground">SKU: {l.artigo?.codigo}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono text-xs">{l.artigo?.unidade}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                          {Number(l.qtdSistema)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm font-bold">
                          {Number(l.qtdContada)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                          <span
                            className={
                              diff > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : diff < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted-foreground"
                            }
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs">
                          {diff === 0 ? (
                            <span className="text-emerald-600 font-medium">Sem divergência</span>
                          ) : diff > 0 ? (
                            <span className="text-blue-600 font-medium">Sobra (Entrada Ajuste)</span>
                          ) : (
                            <span className="text-amber-600 font-medium">Falta (Saída Ajuste)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {viewingInventario?.estado === "em_curso" && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="text-xs text-amber-900 dark:text-amber-200">
                    O fecho de inventário irá gerar automaticamente movimentos de <strong>ajuste de stock</strong> para igualar os saldos do sistema às contagens físicas.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => viewingInventario && handleFecharInventario(viewingInventario)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-md shadow-sm flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Check className="w-4 h-4" /> Fechar & Reconciliar Stock
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
