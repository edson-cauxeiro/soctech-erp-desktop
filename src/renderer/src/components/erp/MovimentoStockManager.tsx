/**
 * @file MovimentoStockManager.tsx
 * @description Gestão e histórico de Movimentação de Stock, Lotes (RF06).
 * Transferências entre armazéns têm página dedicada.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  PackagePlus,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Search,
  RefreshCw,
  Plus,
  Loader2,
  Boxes,
  Eye,
  X,
  CalendarDays,
} from "lucide-react";
import { MovimentoStockDto, ArtigoDto, ArmazemDto } from "../../@types/electron";
import { stockApi } from "../../api/stock.api";
import { artigoApi } from "../../api/artigo.api";
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
  NumberField,
  SelectField,
  SearchSelect,
} from "./FormPrimitives";
import { toast } from "sonner";

const movimentoFormSchema = z
  .object({
    tipo: z.enum(["entrada", "saida", "ajuste", "consumo_producao"]),
    artigoId: z.string().min(1, "Selecione o artigo"),
    quantidade: z.coerce.number().int("Quantidade deve ser um número inteiro").positive("Quantidade deve ser superior a zero"),
    armazemOrigemId: z.string().optional().or(z.literal("")),
    armazemDestinoId: z.string().optional().or(z.literal("")),
    lote: z.string().trim().max(100).optional().or(z.literal("")),
    documentoOrigem: z.string().trim().min(1, "Documento de origem é obrigatório"),
    custoUnitario: z.coerce.number().min(0),
  })
  .refine(
    (data) => {
      if (data.tipo === "entrada" && !data.armazemDestinoId) return false;
      return true;
    },
    { message: "Armazém de destino obrigatório para entradas", path: ["armazemDestinoId"] }
  )
  .refine(
    (data) => {
      if ((data.tipo === "saida" || data.tipo === "consumo_producao") && !data.armazemOrigemId) return false;
      return true;
    },
    { message: "Armazém de origem obrigatório para saídas", path: ["armazemOrigemId"] }
  );

type MovimentoFormValues = z.infer<typeof movimentoFormSchema>;

export function MovimentoStockManager() {
  const [movimentos, setMovimentos] = useState<MovimentoStockDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("");
  const [armazemFilter, setArmazemFilter] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [referenciaSelecionada, setReferenciaSelecionada] = useState<string | null>(null);

  // Detalhe de um movimento
  const [detalhe, setDetalhe] = useState<MovimentoStockDto | null>(null);

  // Dados auxiliares para o modal
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [selectedArtigo, setSelectedArtigo] = useState<ArtigoDto | null>(null);
  const [saldoOrigem, setSaldoOrigem] = useState<number | null>(null);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<MovimentoFormValues>({
    resolver: zodResolver(movimentoFormSchema),
    defaultValues: {
      tipo: "entrada",
      documentoOrigem: "MANUAL",
      quantidade: 1,
      custoUnitario: 0,
    },
  });

  const watchTipo = methods.watch("tipo");
  const watchArtigoId = methods.watch("artigoId");
  const watchArmazemOrigemId = methods.watch("armazemOrigemId");

  // Carregar lista de movimentos
  const fetchMovimentos = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await stockApi.listMovimentos({
        search: search.trim() || undefined,
        tipo: tipoFilter || undefined,
        armazemId: armazemFilter || undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        take: 100,
      });

      if (res.success) {
        setMovimentos(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao carregar movimentos: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, tipoFilter, armazemFilter, dataInicio, dataFim]);

  // Filtro por referência/documento de origem: define um chip removível que
  // vira pesquisa livre de volta ao input (o service faz `contains` sobre o nº,
  // documentoOrigem, lote, artigo).
  const handleFiltrarReferencia = (referencia: string) => {
    setReferenciaSelecionada(referencia);
    setSearch(referencia);
  };

  const limparReferencia = () => {
    setReferenciaSelecionada(null);
    setSearch("");
  };

  const limparDatas = () => {
    setDataInicio("");
    setDataFim("");
  };

  // Carregar artigos e armazéns para o formulário
  const fetchAuxData = async () => {
    try {
      const [resArtigos, resArmazens] = await Promise.all([
        artigoApi.list({ take: 200 }),
        armazemApi.list({ take: 100, ativo: true }),
      ]);
      if (resArtigos.success) {
        // Apenas artigos não-serviço
        setArtigos(resArtigos.data.items.filter((a) => a.tipo !== "servico"));
      }
      if (resArmazens.success) {
        setArmazens(resArmazens.data.items);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAuxData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMovimentos();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchMovimentos]);

  // Atualiza saldo disponível quando seleciona artigo e armazém de origem
  useEffect(() => {
    const art = artigos.find((a) => a.id === watchArtigoId);
    setSelectedArtigo(art || null);

    if (watchArtigoId && watchArmazemOrigemId) {
      stockApi.getArtigoArmazem(watchArtigoId, watchArmazemOrigemId).then((res) => {
        if (res.success) setSaldoOrigem(res.data);
      });
    } else {
      setSaldoOrigem(null);
    }
  }, [watchArtigoId, watchArmazemOrigemId, artigos]);

  const handleOpenNew = () => {
    const defaultGeral = armazens.find((a) => a.isDefaultCompras || a.codigo === "ARM-01")?.id || armazens[0]?.id || "";

    methods.reset({
      tipo: "entrada",
      artigoId: "",
      quantidade: 1,
      // Uma entrada não consome armazém de origem: predefinir ambos os armazéns faria a
      // quantidade entrar e sair do mesmo armazém, anulando-se a zero no apuramento do saldo.
      armazemOrigemId: "",
      armazemDestinoId: defaultGeral,
      lote: "",
      documentoOrigem: "AJUSTE-MANUAL",
      custoUnitario: 0,
    });
    setIsModalOpen(true);
  };

  // Ao mudar o tipo, limpa o armazém que deixa de ser aplicável para não enviar valores ocultos.
  useEffect(() => {
    if (watchTipo === "entrada" || watchTipo === "ajuste") {
      // Entradas e ajustes positivos/diferenciais usam o destino; a origem só é usada
      // pelo ajuste de acerto negativo, que se resolve pela existência de um dos dois.
      if (!methods.getValues("armazemDestinoId")) {
        const destinoPadrao =
          armazens.find((a) => a.isDefaultCompras || a.codigo === "ARM-01")?.id || armazens[0]?.id || "";
        methods.setValue("armazemDestinoId", destinoPadrao);
      }
    }
    if (watchTipo === "saida" || watchTipo === "consumo_producao") {
      if (!methods.getValues("armazemOrigemId")) {
        const origemPadrao =
          armazens.find((a) => a.isDefaultVendas || a.codigo === "ARM-02")?.id || armazens[0]?.id || "";
        methods.setValue("armazemOrigemId", origemPadrao);
      }
      methods.setValue("armazemDestinoId", "");
    }
  }, [watchTipo, armazens, methods]);

  const handleFormSubmit = async (values: MovimentoFormValues) => {
    try {
      setIsSubmitting(true);
      const res = await stockApi.createMovimento({
        tipo: values.tipo,
        artigoId: values.artigoId,
        quantidade: values.quantidade,
        armazemOrigemId: values.armazemOrigemId || null,
        armazemDestinoId: values.armazemDestinoId || null,
        lote: values.lote || null,
        documentoOrigem: values.documentoOrigem,
        custoUnitario: values.custoUnitario,
      });

      if (res.success) {
        toast.success(`Movimento ${res.data.numero} registado com sucesso!`);
        setIsModalOpen(false);
        fetchMovimentos();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao gravar movimento de stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "entrada":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <ArrowDownLeft className="w-3.5 h-3.5" /> Entrada
          </span>
        );
      case "saida":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <ArrowUpRight className="w-3.5 h-3.5" /> Saída
          </span>
        );
      case "ajuste":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Ajuste / Inventário
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
            {tipo}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros & Ações */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
<input
              type="text"
              placeholder="Pesquisar por Nº, Artigo, Lote, Documento..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (referenciaSelecionada) setReferenciaSelecionada(null);
              }}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="w-48">
            <SearchSelect
              value={tipoFilter}
              onChange={setTipoFilter}
              placeholder="Todos os Tipos"
              options={[
                { value: "entrada", label: "Entradas" },
                { value: "saida", label: "Saídas" },
                { value: "transferencia", label: "Transferências" },
                { value: "ajuste", label: "Ajustes" },
              ]}
            />
          </div>

          <div className="w-52">
            <SearchSelect
              value={armazemFilter}
              onChange={setArmazemFilter}
              placeholder="Todos os Armazéns"
              options={armazens.map((a) => ({
                value: a.id,
                label: `${a.codigo} — ${a.designacao}`,
              }))}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              data-testid="filtro-data-inicio"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              title="Filtrar a partir da data"
              className="h-9 rounded-md border border-input bg-background px-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <input
              type="date"
              data-testid="filtro-data-fim"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              title="Filtrar até à data"
              className="h-9 rounded-md border border-input bg-background px-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchMovimentos()}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="h-9 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-sm shadow-sm transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Movimento</span>
          </button>
        </div>
      </div>

      {/* Chips de filtros ativos */}
      {(referenciaSelecionada || dataInicio || dataFim) && (
        <div className="flex flex-wrap items-center gap-2">
          {referenciaSelecionada && (
            <FiltroChip
              rotulo={`Referência: ${referenciaSelecionada}`}
              onClear={limparReferencia}
              testid="chip-referencia"
            />
          )}
          {dataInicio && (
            <FiltroChip
              rotulo={`Desde ${formatData(dataInicio)}`}
              onClear={() => setDataInicio("")}
            />
          )}
          {dataFim && (
            <FiltroChip
              rotulo={`Até ${formatData(dataFim)}`}
              onClear={() => setDataFim("")}
            />
          )}
          {(referenciaSelecionada || dataInicio || dataFim) && (
            <button
              type="button"
              onClick={() => {
                limparReferencia();
                limparDatas();
              }}
              className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
            >
              Limpar tudo
            </button>
          )}
        </div>
      )}

      {/* Tabela de Movimentos */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Nº Movimento</th>
                <th className="px-4 py-3">Data / Hora</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Artigo</th>
                <th className="px-4 py-3 text-right">Qtd.</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Doc. Origem</th>
                <th className="px-4 py-3 text-right">Custo (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar movimentos de estoque...</span>
                  </td>
                </tr>
              ) : movimentos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    <Boxes className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum movimento registado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || tipoFilter || armazemFilter || dataInicio || dataFim
                        ? "Tente ajustar os filtros de pesquisa."
                        : "Clique em 'Novo Movimento' para dar entrada ou transferir mercadorias."}
                    </p>
                  </td>
                </tr>
              ) : (
                movimentos.map((mov) => (
                  <tr key={mov.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        data-testid={`detalhe-movimento-${mov.numero}`}
                        onClick={() => setDetalhe(mov)}
                        title="Ver detalhe do movimento"
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                      {mov.numero}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(mov.data).toLocaleString("pt-PT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">{getTipoBadge(mov.tipo)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{mov.artigo?.descricao || "—"}</div>
                      <div className="text-xs font-mono text-muted-foreground">SKU: {mov.artigo?.codigo}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span
                        className={
                          mov.tipo === "entrada"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : mov.tipo === "saida"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-foreground"
                        }
                      >
                        {mov.tipo === "saida" ? `-${Number(mov.quantidade)}` : `+${Number(mov.quantidade)}`}
                      </span>{" "}
                      <span className="text-xs font-normal text-muted-foreground">{mov.artigo?.unidade}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {mov.armazemOrigem ? (
                        <span className="font-medium text-foreground">{mov.armazemOrigem.codigo}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {mov.armazemDestino ? (
                        <span className="font-medium text-foreground">{mov.armazemDestino.codigo}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {mov.lote || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      <button
                        type="button"
                        data-testid={`referencia-${mov.numero}`}
                        onClick={() => handleFiltrarReferencia(mov.documentoOrigem)}
                        title="Filtrar por esta referência"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-muted/40 font-mono text-xs hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        {mov.documentoOrigem}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {Number(mov.custoUnitario || 0) > 0 ? `${Number(mov.custoUnitario).toFixed(2)} €` : "—"}
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
            Total de <strong>{total}</strong> {total === 1 ? "movimento registado" : "movimentos registados"}
          </span>
          <span>Logística e Rastreabilidade • SOC TECHNO</span>
        </div>
      </div>

      {/* Modal de Criação de Movimento */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-primary" />
              <DialogTitle>Registar Movimento de Stock</DialogTitle>
            </div>
            <DialogDescription>
              Efetue entradas, saídas manuais ou transferências diretas entre armazéns com validação de regras fiscais e saldo.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <FormShell
              methods={methods}
              onSubmit={handleFormSubmit}
              onCancel={() => setIsModalOpen(false)}
              submitLabel={isSubmitting ? "A registar..." : "Confirmar Movimento"}
            >
              <FormSection title="Tipo de Operação & Artigo">
                <SelectField
                  name="tipo"
                  label="Tipo de Movimento"
                  required
                  options={[
                    { value: "entrada", label: "Entrada Manual (Geral / Compras)" },
                    { value: "saida", label: "Saída Manual / Baixa" },
                    { value: "ajuste", label: "Ajuste Manual de Inventário" },
                  ]}
                  span="1"
                />

                <SelectField
                  name="artigoId"
                  label="Artigo"
                  required
                  options={artigos.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.descricao}`,
                  }))}
                  span="2"
                />

                <NumberField
                  name="quantidade"
                  label={`Quantidade (${selectedArtigo?.unidade || "UN"})`}
                  required
                  integer
                  min={1}
                  span="1"
                />
              </FormSection>

              <FormSection title="Armazéns e Lote">
                {(watchTipo === "saida" || watchTipo === "ajuste") && (
                  <div className="col-span-1 sm:col-span-2 space-y-1">
                    <SelectField
                      name="armazemOrigemId"
                      label="Armazém de Origem"
                      options={armazens.map((a) => ({
                        value: a.id,
                        label: `${a.codigo} — ${a.designacao} ${a.isDefaultVendas ? "(Vendas)" : ""}`,
                      }))}
                      span="full"
                    />
                    {saldoOrigem !== null && (
                      <div className="text-xs font-mono text-muted-foreground pt-0.5">
                        Saldo disponível no armazém:{" "}
                        <strong className={saldoOrigem > 0 ? "text-emerald-600" : "text-rose-600"}>
                          {saldoOrigem} {selectedArtigo?.unidade}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {(watchTipo === "entrada" || watchTipo === "ajuste") && (
                  <SelectField
                    name="armazemDestinoId"
                    label="Armazém de Destino"
                    options={armazens.map((a) => ({
                      value: a.id,
                      label: `${a.codigo} — ${a.designacao} ${a.isDefaultCompras ? "(Geral/Entradas)" : ""}`,
                    }))}
                    span="2"
                  />
                )}

                <TextField
                  name="lote"
                  label={`Lote / Nº de Série ${selectedArtigo?.controloLote ? "(Obrigatório)" : ""}`}
                  placeholder={selectedArtigo?.controloLote ? "LT-2026-X (Obrigatório)" : "Opcional"}
                  span="1"
                />

                <TextField
                  name="documentoOrigem"
                  label="Documento de Origem"
                  required
                  placeholder="Ex: AJUSTE-MANUAL, GR-001..."
                  span="1"
                />

                {watchTipo === "entrada" && (
                  <NumberField
                    name="custoUnitario"
                    label="Custo Unitário (€) — Atualiza PMP"
                    step="0.01"
                    span="1"
                  />
                )}
              </FormSection>
            </FormShell>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhe do Movimento */}
      <Dialog open={detalhe !== null} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <DialogTitle>Detalhe do Movimento {detalhe?.numero ?? ""}</DialogTitle>
            </div>
            <DialogDescription>
              Informação completa do movimento para efeitos de auditoria e rastreabilidade.
            </DialogDescription>
          </DialogHeader>
          {detalhe && (
            <div className="p-6">
              <dl className="border border-border rounded-md divide-y divide-border text-sm">
                <ItemDetalhe rotulo="Nº do Movimento" valor={detalhe.numero} mono />
                <ItemDetalhe
                  rotulo="Data / Hora"
                  valor={new Date(detalhe.data).toLocaleString("pt-PT", {
                    dateStyle: "long",
                    timeStyle: "medium",
                  })}
                />
                <ItemDetalhe rotulo="Tipo" valor={getTipoBadge(detalhe.tipo)} />
                <ItemDetalhe
                  rotulo="Artigo"
                  valor={`${detalhe.artigo?.codigo ?? "—"} — ${detalhe.artigo?.descricao ?? ""} (${detalhe.artigo?.unidade ?? "UN"})`}
                />
                <ItemDetalhe
                  rotulo="Quantidade"
                  valor={`${detalhe.tipo === "saida" ? "-" : "+"}${Number(detalhe.quantidade)} ${detalhe.artigo?.unidade ?? "UN"}`}
                  forte
                />
                <ItemDetalhe
                  rotulo="Armazém de Origem"
                  valor={detalhe.armazemOrigem ? `${detalhe.armazemOrigem.codigo} — ${detalhe.armazemOrigem.designacao}` : "—"}
                />
                <ItemDetalhe
                  rotulo="Armazém de Destino"
                  valor={detalhe.armazemDestino ? `${detalhe.armazemDestino.codigo} — ${detalhe.armazemDestino.designacao}` : "—"}
                />
                <ItemDetalhe rotulo="Lote / Nº de Série" valor={detalhe.lote || "—"} mono />
                <div className="flex items-center justify-between px-4 py-2.5">
                  <dt className="text-xs text-muted-foreground">Referência / Documento</dt>
                  <dd className="text-xs">
                    <button
                      type="button"
                      data-testid="referencia-no-detalhe"
                      onClick={() => {
                        const ref = detalhe.documentoOrigem;
                        setDetalhe(null);
                        handleFiltrarReferencia(ref);
                      }}
                      title="Filtrar por esta referência"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border font-mono text-xs hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      {detalhe.documentoOrigem}
                    </button>
                  </dd>
                </div>
                <ItemDetalhe
                  rotulo="Custo Unitário (€)"
                  valor={Number(detalhe.custoUnitario) > 0 ? `${Number(detalhe.custoUnitario).toFixed(2)} €` : "—"}
                  mono
                />
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FiltroChip({ rotulo, onClear, testid }: { rotulo: string; onClear: () => void; testid?: string }) {
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs font-medium text-primary"
    >
      {rotulo}
      <button
        type="button"
        onClick={onClear}
        className="p-0.5 rounded-full hover:bg-primary/10 transition-colors"
        title="Remover filtro"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

function ItemDetalhe({
  rotulo,
  valor,
  mono = false,
  forte = false,
}: {
  rotulo: string;
  valor: ReactNode;
  mono?: boolean;
  forte?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd
        className={`text-xs text-right ${mono ? "font-mono" : ""} ${
          forte ? "font-semibold text-foreground" : "text-foreground"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function formatData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-PT");
}
