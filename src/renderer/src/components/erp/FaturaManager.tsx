/**
 * @file FaturaManager.tsx
 * @description Gestão e emissão de Faturas de Venda (RF03 / RF06) com baixa automática no Armazém 02 (Vendas)
 * por padrão ou no armazém selecionado, consulta de stock em tempo real e histórico de faturas.
 */

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Warehouse,
  Boxes,
  ArrowUpRight,
  ShieldCheck,
  User,
  Eye,
  Printer,
  Ban,
} from "lucide-react";
import {
  FaturaVendaDto,
  DocumentoPrintDto,
  TipoSerieDocumento,
  ContaBancariaComSaldoDto,
} from "../../@types/electron";
import { vendasApi } from "../../api/vendas.api";
import { tesourariaApi } from "../../api/tesouraria.api";
import { stockApi } from "../../api/stock.api";
import { useDocumentoBase } from "../../hooks/useDocumentoBase";
import { DocumentoPreviewDialog } from "../documentos/DocumentoPreviewDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { SearchSelect } from "../ui/SearchSelect";
import { formatCurrency } from "@/utils/currency";
import { QuantityInput } from "./FormPrimitives";
import { useAuth } from "../../hooks/useAuth";
import { toast } from "sonner";

interface LinhaItemForm {
  artigoId: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: number;
  stockDisponivel?: number;
  isServico?: boolean;
}

/**
 * Cada tipo de documento é numerado por séries independentes. O serviço aplica a mesma
 * correspondência ao reservar o número, por isso a UI tem de oferecer as séries do mesmo tipo.
 */
const TIPO_SERIE: Record<
  "fatura" | "fatura_recibo" | "nota_credito" | "nota_debito",
  TipoSerieDocumento
> = {
  fatura: "FT",
  fatura_recibo: "FR",
  nota_credito: "NC",
  nota_debito: "ND",
};

type MeioPagamento = "numerario" | "transferencia" | "cheque" | "multicaixa";

const MEIO_LABEL: Record<MeioPagamento, string> = {
  numerario: "Numerário",
  transferencia: "Transferência bancária",
  cheque: "Cheque",
  multicaixa: "Multicaixa",
};

const MEIOS_PAGAMENTO: MeioPagamento[] = ["numerario", "transferencia", "cheque", "multicaixa"];

export function FaturaManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || "";
  const { series, setSeries, clientes, artigos, armazens, fetchSeries } = useDocumentoBase();
  const [activeTab, setActiveTab] = useState<"emitir" | "historico">("emitir");

  // Dados auxiliares
  const [faturas, setFaturas] = useState<FaturaVendaDto[]>([]);
  const [isLoadingFaturas, setIsLoadingFaturas] = useState(false);
  const [faturasSearch, setFaturasSearch] = useState("");

  // Estado do formulário de emissão
  const [serie, setSerie] = useState("");
  const [tipo, setTipo] = useState<"fatura" | "fatura_recibo" | "nota_credito" | "nota_debito">("fatura");
  const [selectedArmazemId, setSelectedArmazemId] = useState("");
  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().split("T")[0]);
  const [dataVencimento, setDataVencimento] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0]
  );
  const [encomendaOrigem, setEncomendaOrigem] = useState("");
  const [motivoIsencao, setMotivoIsencao] = useState("");
  const [meioPagamento, setMeioPagamento] = useState<MeioPagamento>("numerario");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [contas, setContas] = useState<ContaBancariaComSaldoDto[]>([]);
  const [avisoSessao, setAvisoSessao] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Detalhe da Fatura
  const [viewingFatura, setViewingFatura] = useState<FaturaVendaDto | null>(null);

  // Faturas do cliente, para escolher a fatura de origem de uma Nota de Crédito
  const [faturasCliente, setFaturasCliente] = useState<FaturaVendaDto[]>([]);
  const [faturaOrigemId, setFaturaOrigemId] = useState("");
  const [motivoNotaCredito, setMotivoNotaCredito] = useState("");

  // Pré-visualização
  const [preview, setPreview] = useState<DocumentoPrintDto | null>(null);

  // Anulação
  const [cancelling, setCancelling] = useState<FaturaVendaDto | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");

  // Carregar faturas emitidas
  const fetchFaturas = useCallback(async () => {
    try {
      setIsLoadingFaturas(true);
      const res = await vendasApi.listFaturas({
        search: faturasSearch.trim() || undefined,
        take: 100,
      });
      if (res.success) {
        setFaturas(res.data.items);
      } else {
        toast.error("Erro ao carregar faturas: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o backend de vendas.");
    } finally {
      setIsLoadingFaturas(false);
    }
  }, [faturasSearch]);

  useEffect(() => {
    if (activeTab === "historico") {
      fetchFaturas();
    }
  }, [activeTab, fetchFaturas]);

  // Cada tipo de documento tem séries próprias (FT/FR/NC/ND): recarregar ao mudar o tipo.
  useEffect(() => {
    if (!empresaId) return;
    // Respostas fora de ordem (troca rápida de tipo) não podem sobrepor a série do tipo actual.
    let obsoleto = false;
    setSerie("");
    fetchSeries(TIPO_SERIE[tipo]).then((lista) => {
      if (!obsoleto) setSeries(lista);
    });
    return () => {
      obsoleto = true;
    };
  }, [empresaId, tipo, fetchSeries, setSeries]);

  // Pré-selecciona a primeira série activa sempre que a seleccionada não pertence à lista carregada.
  useEffect(() => {
    if (series.length === 0) return;
    if (series.some((s) => s.codigo === serie)) return;
    setSerie(series.find((s) => s.estado === "ativo")?.codigo || series[0].codigo);
  }, [series, serie]);

  // Pré-seleccionar o armazém padrão de vendas assim que os armazéns carregarem.
  useEffect(() => {
    if (armazens.length === 0 || selectedArmazemId) return;
    const defaultVendas = armazens.find((a) => a.isDefaultVendas || a.codigo === "ARM-02");
    setSelectedArmazemId((defaultVendas || armazens[0]).id);
  }, [armazens, selectedArmazemId]);

  // Contas de tesouraria para liquidar a Fatura-Recibo.
  useEffect(() => {
    if (!empresaId) return;
    let obsoleto = false;
    tesourariaApi.listarContasComSaldos({ empresaId, apenasAtivas: true }).then((res) => {
      if (obsoleto || !res.success) return;
      setContas(res.data.items);
    });
    return () => {
      obsoleto = true;
    };
  }, [empresaId]);

  // Dinheiro que entra numa caixa só pode ser contado com a sessão aberta.
  useEffect(() => {
    if (tipo !== "fatura_recibo" || !empresaId || !contaBancariaId) {
      setAvisoSessao(null);
      return;
    }
    let obsoleto = false;
    tesourariaApi
      .validarMeioPagamento({ empresaId, meioPagamento, contaBancariaId })
      .then((res) => {
        if (obsoleto || !res.success) return;
        setAvisoSessao(
          res.data.exigeSessao && !res.data.sessaoAberta
            ? "Esta conta de caixa não tem sessão aberta. Abra a sessão em Finanças › Contas antes de emitir a fatura."
            : null
        );
      });
    return () => {
      obsoleto = true;
    };
  }, [tipo, empresaId, contaBancariaId, meioPagamento]);

  // Uma Nota de Crédito exige a fatura que está a corrigir, do mesmo cliente.
  useEffect(() => {
    if (tipo !== "nota_credito") {
      setFaturasCliente([]);
      setFaturaOrigemId("");
      setMotivoNotaCredito("");
      return;
    }
    if (!empresaId || !selectedClienteId) {
      setFaturasCliente([]);
      setFaturaOrigemId("");
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await vendasApi.listFaturas({ empresaId, clienteId: selectedClienteId, take: 200 });
        if (cancelado) return;
        if (!res.success) {
          setFaturasCliente([]);
          return;
        }
        setFaturasCliente(
          res.data.items.filter(
            (f) =>
              (f.tipo === "fatura" || f.tipo === "fatura_recibo") &&
              f.estadoDocumento !== "anulado"
          )
        );
      } catch {
        if (!cancelado) setFaturasCliente([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [empresaId, tipo, selectedClienteId]);

  // Atualizar stocks disponíveis nas linhas sempre que o armazém mudar
  const refreshLinhasStock = useCallback(async (currentLinhas: LinhaItemForm[], armazemId: string) => {
    if (!armazemId || currentLinhas.length === 0) return;

    const updated = await Promise.all(
      currentLinhas.map(async (linha) => {
        const art = artigos.find((a) => a.id === linha.artigoId);
        if (!art || art.tipo === "servico") {
          return { ...linha, isServico: true, stockDisponivel: 999999 };
        }
        try {
          const res = await stockApi.getArtigoArmazem(art.id, armazemId);
          return {
            ...linha,
            isServico: false,
            stockDisponivel: res.success ? res.data : 0,
          };
        } catch {
          return { ...linha, isServico: false, stockDisponivel: 0 };
        }
      })
    );
    setLinhas(updated);
  }, [artigos]);

  const handleArmazemChange = async (newArmazemId: string) => {
    setSelectedArmazemId(newArmazemId);
    if (linhas.length > 0) {
      await refreshLinhasStock(linhas, newArmazemId);
    }
  };

  const handleAddLinha = async () => {
    if (artigos.length === 0) {
      toast.error("Nenhum artigo cadastrado.");
      return;
    }

    // Encontra o primeiro artigo disponível que ainda não está na lista ou o primeiro
    const art = artigos[0];
    let stockDisp = 0;
    const isServico = art.tipo === "servico";

    if (!isServico && selectedArmazemId) {
      try {
        const res = await stockApi.getArtigoArmazem(art.id, selectedArmazemId);
        if (res.success) stockDisp = res.data;
      } catch {
        stockDisp = 0;
      }
    }

    setLinhas((prev) => [
      ...prev,
      {
        artigoId: art.id,
        quantidade: 1,
        precoUnitario: Number(art.precoVenda || 0),
        desconto: 0,
        taxaIva: Number(art.taxaIva || 23),
        stockDisponivel: isServico ? 999999 : stockDisp,
        isServico,
      },
    ]);
  };

  // Atualizar artigo na linha
  const handleLinhaArtigoChange = async (index: number, newArtigoId: string) => {
    const art = artigos.find((a) => a.id === newArtigoId);
    if (!art) return;

    let stockDisp = 0;
    const isServico = art.tipo === "servico";

    if (!isServico && selectedArmazemId) {
      try {
        const res = await stockApi.getArtigoArmazem(art.id, selectedArmazemId);
        if (res.success) stockDisp = res.data;
      } catch {
        stockDisp = 0;
      }
    }

    setLinhas((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        artigoId: art.id,
        precoUnitario: Number(art.precoVenda || 0),
        taxaIva: Number(art.taxaIva || 23),
        stockDisponivel: isServico ? 999999 : stockDisp,
        isServico,
      };
      return copy;
    });
  };

  const handleUpdateLinha = (index: number, field: keyof LinhaItemForm, value: number) => {
    setLinhas((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveLinha = (index: number) => {
    setLinhas((prev) => prev.filter((_, i) => i !== index));
  };

  // Cálculos de totais
  const subtotalIliquido = linhas.reduce((acc, l) => {
    const desc = l.quantidade * l.precoUnitario * (l.desconto / 100);
    return acc + (l.quantidade * l.precoUnitario - desc);
  }, 0);

  const totalIva = linhas.reduce((acc, l) => {
    const desc = l.quantidade * l.precoUnitario * (l.desconto / 100);
    const base = l.quantidade * l.precoUnitario - desc;
    return acc + base * (l.taxaIva / 100);
  }, 0);

  const totalLiquido = subtotalIliquido + totalIva;

  const temIsencaoIva = linhas.some((l) => l.taxaIva === 0);

  // Armazém atualmente selecionado
  const currentArmazem = armazens.find((a) => a.id === selectedArmazemId);
  const selectedCliente = clientes.find((c) => c.id === selectedClienteId);

  // Documentos emitidos são imutáveis: só a pré-visualização é permitida sobre eles.
  const handlePreview = async (f: FaturaVendaDto) => {
    try {
      const res = await vendasApi.getDocumentoImprimivel(f.id);
      if (res.success) setPreview(res.data);
      else toast.error("Erro ao carregar a pré-visualização: " + res.error.message);
    } catch {
      toast.error("Falha ao carregar a pré-visualização.");
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
      const res = await vendasApi.anularFatura(cancelling.id, cancelMotivo.trim());
      if (res.success) {
        toast.success(`Documento ${res.data.numero} anulado. O registo foi preservado para auditoria.`);
        setCancelling(null);
        setCancelMotivo("");
        fetchFaturas();
      } else {
        toast.error("Erro ao anular documento: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao anular o documento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submeter Emissão de Fatura
  const handleEmitirFatura = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!empresaId) {
      toast.error("Não há empresa configurada para esta sessão.");
      return;
    }
    if (!selectedClienteId) {
      toast.error("Selecione o cliente destinatário da fatura.");
      return;
    }
    if (!serie) {
      toast.error("Selecione a série fiscal do documento.");
      return;
    }
    if (linhas.length === 0) {
      toast.error("Adicione pelo menos um artigo à fatura.");
      return;
    }
    if (temIsencaoIva && !motivoIsencao.trim()) {
      toast.error("Indique o motivo de isenção de IVA para os itens isentos.");
      return;
    }
    if (tipo === "nota_credito") {
      if (!faturaOrigemId) {
        toast.error("Seleccione a fatura que a nota de crédito vai retificar.");
        return;
      }
      if (motivoNotaCredito.trim().length < 3) {
        toast.error("Indique o motivo da nota de crédito.");
        return;
      }
    }

    // A nota de crédito não repõe stock e a fatura bornada de uma guia já moveu a mercadoria
    // na confirmação da guia, por isso nestas situações não se aplica a validação de stock.
    const moveStock = tipo !== "nota_credito";
    if (moveStock) {
      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!l.isServico && (l.stockDisponivel ?? 0) < l.quantidade) {
          const art = artigos.find((a) => a.id === l.artigoId);
          toast.error(
            `Stock insuficiente no armazém ${currentArmazem?.designacao || "selecionado"} para o artigo "${art?.codigo}". Disponível: ${l.stockDisponivel ?? 0} ${art?.unidade || "UN"}, Solicitado: ${l.quantidade}.`
          );
          return;
        }
      }
    }

    if (tipo === "fatura_recibo") {
      if (!contaBancariaId) {
        toast.error("Selecione a conta onde o dinheiro da Fatura-Recibo entrou.");
        return;
      }
      if (avisoSessao) {
        toast.error(avisoSessao);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const res = await vendasApi.emitirFatura({
        empresaId,
        serie,
        tipo,
        clienteId: selectedClienteId,
        armazemExpedicaoId: selectedArmazemId,
        dataEmissao: new Date(dataEmissao),
        dataVencimento: new Date(dataVencimento),
        encomendaOrigem: encomendaOrigem.trim() || undefined,
        motivoIsencao: motivoIsencao.trim() || undefined,
        faturaOrigemId: tipo === "nota_credito" ? faturaOrigemId : undefined,
        motivoNotaCredito: tipo === "nota_credito" ? motivoNotaCredito.trim() : undefined,
        meioPagamento: tipo === "fatura_recibo" ? meioPagamento : undefined,
        contaBancariaId: tipo === "fatura_recibo" ? contaBancariaId : undefined,
        dataPagamento: tipo === "fatura_recibo" ? new Date(dataEmissao) : undefined,
        linhas: linhas.map((l) => ({
          artigoId: l.artigoId,
          quantidade: l.quantidade,
          precoUnitario: l.precoUnitario,
          desconto: l.desconto,
          taxaIva: l.taxaIva,
        })),
      });

      if (res.success) {
        toast.success(
          tipo === "nota_credito"
            ? `Nota de crédito ${res.data.numero} emitida. Não houve reposição de stock.`
            : `Fatura ${res.data.numero} emitida com sucesso! Baixa de estoque efetuada no armazém "${currentArmazem?.designacao || "Vendas"}".`
        );
        // Limpar e resetar linhas
        setLinhas([]);
        setEncomendaOrigem("");
        setMotivoIsencao("");
        setFaturaOrigemId("");
        setMotivoNotaCredito("");
        // Atualizar lista se mudar para histórico
        fetchFaturas();
      } else {
        toast.error("Erro ao emitir fatura: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de Seleção de Modo */}
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
            <span>Emitir Nova Fatura</span>
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
            <span>Histórico de Faturas</span>
          </button>
        </div>

        {activeTab === "emitir" && currentArmazem && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md text-xs">
            <Warehouse className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span className="text-muted-foreground">Armazém de Saída:</span>
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
              {currentArmazem.codigo} - {currentArmazem.designacao}
            </span>
            {currentArmazem.isDefaultVendas && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">
                Padrão de Vendas
              </span>
            )}
          </div>
        )}
      </div>

      {/* MODO 1: FORMULÁRIO DE EMISSÃO */}
      {activeTab === "emitir" && (
        <form onSubmit={handleEmitirFatura} className="space-y-6">
          {/* Secção 1: Configuração do Documento & Armazém de Expedição */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Dados do Documento & Logística de Saída
              </h3>
              <span className="text-xs text-muted-foreground">
                As vendas dão baixa automática no armazém selecionado
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Armazém de Expedição (Destacando ARM-02 Vendas) */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Warehouse className="w-3.5 h-3.5 text-primary" />
                    Armazém de Expedição (Baixa de Stock) <span className="text-destructive">*</span>
                  </span>
                  {currentArmazem?.isDefaultVendas && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Padrão de Vendas
                    </span>
                  )}
                </label>
                <SearchSelect
                  value={selectedArmazemId}
                  onChange={handleArmazemChange}
                  options={armazens.map((arm) => ({
                    value: arm.id,
                    label: `${arm.codigo} - ${arm.designacao} ${arm.isDefaultVendas ? "★ (Padrão Vendas)" : arm.isDefaultCompras ? "(Geral / Compras)" : ""}`,
                  }))}
                  placeholder="Pesquisar armazém..."
                  required
                  portal
                />
                <p className="text-[11px] text-muted-foreground">
                  Por padrão, as vendas saem do Armazém 02 (Vendas). Pode selecionar qualquer outro armazém caso necessário.
                </p>
              </div>

              {/* Tipo de Documento */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Tipo de Documento <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={tipo}
                  onChange={(val) => setTipo(val as any)}
                  options={[
                    { value: "fatura", label: "Fatura (FT)" },
                    { value: "fatura_recibo", label: "Fatura-Recibo (FR)" },
                    { value: "nota_credito", label: "Nota de Crédito (NC)" },
                    { value: "nota_debito", label: "Nota de Débito (ND)" },
                  ]}
                  placeholder="Selecionar tipo..."
                  required
                  portal
                />
              </div>

              {/* Série */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Série Fiscal <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={serie}
                  onChange={setSerie}
                  options={series.map((s) => ({
                    value: s.codigo,
                    label: `${s.codigo} — ${s.descricao}`,
                  }))}
                  placeholder="Selecionar série..."
                  required
                  portal
                />
                {series.length === 0 && (
                  <p className="text-[11px] text-destructive">
                    Não existem séries activas do tipo {TIPO_SERIE[tipo]} para esta empresa.
                  </p>
                )}
              </div>

              {/* Data Emissão */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Data de Emissão <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>

              {/* Data Vencimento */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* Liquidação: uma Fatura-Recibo afirma que o dinheiro já entrou,
                  por isso tem de dizer como e em que conta. */}
              {tipo === "fatura_recibo" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Meio de Pagamento <span className="text-destructive">*</span>
                    </label>
                    <SearchSelect
                      value={meioPagamento}
                      onChange={(val) => setMeioPagamento(val as MeioPagamento)}
                      options={MEIOS_PAGAMENTO.map((m) => ({ value: m, label: MEIO_LABEL[m] }))}
                      placeholder="Como entrou o dinheiro?"
                      required
                      allowClear={false}
                      portal
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-foreground">
                      Conta de Entrada <span className="text-destructive">*</span>
                    </label>
                    <SearchSelect
                      value={contaBancariaId}
                      onChange={setContaBancariaId}
                      options={contas.map((c) => ({
                        value: c.id,
                        label: `${c.codigo} — ${c.designacao} (${c.tipo === "caixa" ? "Caixa" : c.nomeBanco || "Banco"})`,
                      }))}
                      placeholder={contas.length === 0 ? "Nenhuma conta activa" : "Onde entrou o dinheiro?"}
                      required
                      allowClear={false}
                      portal
                    />
                    {avisoSessao && (
                      <p className="flex items-start gap-1.5 text-[11px] font-medium text-warning">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {avisoSessao}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Encomenda de Origem */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Encomenda / PO de Origem
                </label>
                <input
                  type="text"
                  value={encomendaOrigem}
                  onChange={(e) => setEncomendaOrigem(e.target.value)}
                  placeholder="Ex: ENC-2026/012"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* Origem obrigatória da Nota de Crédito */}
            {tipo === "nota_credito" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 mt-1 border-t border-border/70">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Fatura a Retificar <span className="text-destructive">*</span>
                  </label>
                  <SearchSelect
                    value={faturaOrigemId}
                    onChange={setFaturaOrigemId}
                    options={faturasCliente.map((f) => ({
                      value: f.id,
                      label: `${f.numero} · ${new Date(f.dataEmissao).toLocaleDateString(
                        "pt-PT"
                      )} · ${formatCurrency(f.totalLiquido, "AOA")}`,
                    }))}
                    placeholder="Selecione primeiro o cliente..."
                    required
                    portal
                  />
                  {selectedClienteId && faturasCliente.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Este cliente não tem faturas elegíveis para nota de crédito.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Motivo da Nota de Crédito <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={motivoNotaCredito}
                    onChange={(e) => setMotivoNotaCredito(e.target.value)}
                    placeholder="Ex: Devolução parcial de mercadoria"
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    A nota de crédito não repõe stock automaticamente.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Secção 2: Dados do Cliente */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Dados Fiscais do Cliente (Snapshot Fiscal RN03.2)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Selecionar Cliente <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={selectedClienteId}
                  onChange={setSelectedClienteId}
                  options={clientes.map((c) => ({
                    value: c.id,
                    label: `${c.codigo} — ${c.nome} (NIF: ${c.nif})`,
                  }))}
                  placeholder="Pesquisar cliente..."
                  required
                  portal
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">NIF do Cliente</label>
                <input
                  type="text"
                  value={selectedCliente?.nif || ""}
                  readOnly
                  placeholder="Selecione um cliente"
                  className="w-full h-9 px-3 rounded-md border border-input bg-muted/40 font-mono text-sm text-foreground outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Morada Fiscal</label>
                <input
                  type="text"
                  value={selectedCliente ? `${selectedCliente.endereco || ""}${selectedCliente.cidade ? `, ${selectedCliente.cidade}` : ""}` : ""}
                  readOnly
                  placeholder="Selecione um cliente"
                  className="w-full h-9 px-3 rounded-md border border-input bg-muted/40 text-sm text-foreground outline-none"
                />
              </div>
            </div>
          </div>

          {/* Secção 3: Artigos a Faturar com Consulta de Stock por Armazém */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-primary" />
                  Artigos & Serviços a Faturar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O stock exibido reflete o saldo disponível em <strong>{currentArmazem?.designacao || "Armazém de Vendas"}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddLinha}
                className="h-8 px-3 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Artigo
              </button>
            </div>

            <div className="border border-border rounded-md overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-[11px] uppercase font-bold text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 min-w-[220px]">Artigo</th>
                    <th className="px-3 py-2.5 w-36 text-center">Stock no Armazém</th>
                    <th className="px-3 py-2.5 w-24">Qtd.</th>
                    <th className="px-3 py-2.5 w-28">Preço Unit. (Kz)</th>
                    <th className="px-3 py-2.5 w-20">Desc. (%)</th>
                    <th className="px-3 py-2.5 w-20">IVA (%)</th>
                    <th className="px-3 py-2.5 w-28 text-right">Total Linha (Kz)</th>
                    <th className="px-3 py-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {linhas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                        Nenhum artigo adicionado à fatura. Clique em <strong>"+ Adicionar Artigo"</strong> para começar.
                      </td>
                    </tr>
                  ) : (
                    linhas.map((linha, idx) => {
                      const descVal = linha.quantidade * linha.precoUnitario * (linha.desconto / 100);
                      const baseVal = linha.quantidade * linha.precoUnitario - descVal;
                      const totLinha = baseVal * (1 + linha.taxaIva / 100);
                      const semStockSuficiente = !linha.isServico && (linha.stockDisponivel ?? 0) < linha.quantidade;

                      return (
                        <tr key={idx} className={`hover:bg-muted/20 ${semStockSuficiente ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}`}>
                          {/* Seletor Artigo */}
                          <td className="p-2">
                            <SearchSelect
                              value={linha.artigoId}
                              onChange={(val) => handleLinhaArtigoChange(idx, val)}
                              options={artigos.map((a) => ({
                                value: a.id,
                                label: `${a.codigo} - ${a.descricao} (${a.tipo === "servico" ? "Serviço" : `${a.unidade}`})`,
                              }))}
                              placeholder="Pesquisar artigo..."
                              required
                              portal
                            />
                          </td>

                          {/* Stock no Armazém Selecionado */}
                          <td className="p-2 text-center">
                            {linha.isServico ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                Serviço (s/ stock)
                              </span>
                            ) : semStockSuficiente ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" title="Stock insuficiente para esta venda!">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                {linha.stockDisponivel ?? 0} disp.
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {linha.stockDisponivel ?? 0} disp.
                              </span>
                            )}
                          </td>

                          {/* Quantidade */}
                          <td className="p-2">
                            <QuantityInput
                              value={linha.quantidade}
                              integer
                              min={1}
                              onChange={(valor) => handleUpdateLinha(idx, "quantidade", valor)}
                              className={
                                semStockSuficiente
                                  ? "border-rose-400 bg-rose-50/50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold"
                                  : ""
                              }
                            />
                          </td>

                          {/* Preço Unitário */}
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={linha.precoUnitario}
                              onChange={(e) => handleUpdateLinha(idx, "precoUnitario", parseFloat(e.target.value) || 0)}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono outline-none"
                              required
                            />
                          </td>

                          {/* Desconto */}
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={linha.desconto}
                              onChange={(e) => handleUpdateLinha(idx, "desconto", parseFloat(e.target.value) || 0)}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono outline-none"
                            />
                          </td>

                          {/* Taxa IVA */}
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={linha.taxaIva}
                              onChange={(e) => handleUpdateLinha(idx, "taxaIva", parseFloat(e.target.value) || 0)}
                              className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono outline-none"
                              required
                            />
                          </td>

                          {/* Total Linha */}
                          <td className="p-2 text-right font-mono text-xs font-semibold">
                            {formatCurrency(totLinha, "AOA")}
                          </td>

                          {/* Remover */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLinha(idx)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                              title="Remover artigo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Isenção de IVA (condicional se taxaIva == 0) */}
            {temIsencaoIva && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-md space-y-1.5 animate-in fade-in-50">
                <label className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Motivo de Isenção de IVA (Obrigatório devido a itens com 0% IVA)
                </label>
                <input
                  type="text"
                  value={motivoIsencao}
                  onChange={(e) => setMotivoIsencao(e.target.value)}
                  placeholder="Ex: M07 — Isenção nos termos do artigo 9.º do CIVA"
                  className="w-full h-8 px-3 rounded border border-amber-300 dark:border-amber-700 bg-background text-xs outline-none focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>
            )}

            {/* Sumário de Totais & Botão de Emissão */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground">
                Total de itens: <strong>{linhas.length}</strong>
              </div>

              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-6">
                <div className="text-right space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Subtotal Ilíquido:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {formatCurrency(subtotalIliquido, "AOA")}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total IVA:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {formatCurrency(totalIva, "AOA")}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    Total a Pagar:{" "}
                    <span className="font-mono text-primary text-base">
                      {formatCurrency(totalLiquido, "AOA")}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || linhas.length === 0}
                  className="h-10 px-6 bg-primary text-primary-foreground font-semibold rounded-md hover:opacity-90 transition-opacity flex items-center gap-2 text-sm shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>A emitir e processar baixas...</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Emitir Fatura & Dar Baixa</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* MODO 2: HISTÓRICO DE FATURAS */}
      {activeTab === "historico" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Pesquisar por Nº da Fatura, Cliente, NIF..."
                value={faturasSearch}
                onChange={(e) => setFaturasSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <button
              type="button"
              onClick={fetchFaturas}
              disabled={isLoadingFaturas}
              className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingFaturas ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="border border-border rounded-lg bg-card overflow-hidden shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th className="px-4 py-3">Nº Documento</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">NIF</th>
                  <th className="px-4 py-3 text-right">Total Líquido</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoadingFaturas ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      <span>A carregar histórico de faturas...</span>
                    </td>
                  </tr>
                ) : faturas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-foreground">Nenhuma fatura encontrada</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Utilize a aba "Emitir Nova Fatura" para realizar a primeira venda.
                      </p>
                    </td>
                  </tr>
                ) : (
                  faturas.map((fat) => (
                    <tr key={fat.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary">
                        {fat.numero}
                      </td>
                      <td className="px-4 py-3 text-xs uppercase text-muted-foreground">
                        {fat.tipo.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(fat.dataEmissao).toLocaleDateString("pt-PT")}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {fat.clienteNome}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {fat.clienteNif}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-right text-foreground">
                        {formatCurrency(fat.totalLiquido, "AOA")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              fat.estadoDocumento === "anulado"
                                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            }`}
                          >
                            {fat.estadoDocumento === "anulado" ? "ANULADO" : "EMITIDO"}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              fat.estadoPagamento === "pago"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : fat.estadoPagamento === "pendente"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {fat.estadoPagamento.toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingFatura(fat)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title="Ver linhas do documento"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {fat.estadoDocumento !== "anulado" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handlePreview(fat)}
                                className="p-1.5 rounded hover:bg-muted text-primary transition-colors"
                                title="Pré-visualizar / Imprimir / PDF"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelling(fat);
                                  setCancelMotivo("");
                                }}
                                className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                                title="Anular documento"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
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

      {/* Modal de Visualização da Fatura */}
      <Dialog open={!!viewingFatura} onOpenChange={(open) => !open && setViewingFatura(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <FileText className="w-5 h-5 text-primary" />
              {viewingFatura?.numero}
            </DialogTitle>
            <DialogDescription>
              Detalhes do documento fiscal e linhas de artigos faturados.
            </DialogDescription>
          </DialogHeader>

          {viewingFatura && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-lg border border-border">
                <div>
                  <span className="text-muted-foreground block">Cliente:</span>
                  <strong className="text-sm text-foreground">{viewingFatura.clienteNome}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">NIF:</span>
                  <span className="font-mono text-foreground font-semibold">{viewingFatura.clienteNif}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block">Morada Fiscal:</span>
                  <span className="text-foreground">{viewingFatura.clienteEndereco || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Data de Emissão:</span>
                  <span className="text-foreground">
                    {new Date(viewingFatura.dataEmissao).toLocaleDateString("pt-PT")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Estado de Pagamento:</span>
                  <span className="font-semibold uppercase text-primary">{viewingFatura.estadoPagamento}</span>
                </div>
              </div>

              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      <th className="p-2">Artigo</th>
                      <th className="p-2 text-right">Qtd.</th>
                      <th className="p-2 text-right">Preço Unit.</th>
                      <th className="p-2 text-right">IVA</th>
                      <th className="p-2 text-right">Total Linha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewingFatura.linhas?.map((l) => (
                      <tr key={l.id || l.artigoId}>
                        <td className="p-2 font-medium">
                          {l.artigoCodigo} - {l.artigoDescricao}
                        </td>
                        <td className="p-2 text-right font-mono">{Number(l.quantidade)}</td>
                        <td className="p-2 text-right font-mono">
                          {formatCurrency(l.precoUnitario, "AOA")}
                        </td>
                        <td className="p-2 text-right font-mono">{Number(l.taxaIva)}%</td>
                        <td className="p-2 text-right font-mono font-semibold">
                          {formatCurrency(l.totalLinha, "AOA")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 text-right">
                <div>
                  <p className="text-muted-foreground">
                    Total Ilíquido:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {formatCurrency(viewingFatura.totalIliquido, "AOA")}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Total IVA:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {formatCurrency(viewingFatura.totalIva, "AOA")}
                    </span>
                  </p>
                  <p className="text-sm font-bold text-foreground mt-1">
                    Total Fatura:{" "}
                    <span className="font-mono text-primary text-base">
                      {formatCurrency(viewingFatura.totalLiquido, "AOA")}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Anulação */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Anular {cancelling.numero}
            </h3>
            <p className="text-xs text-muted-foreground">
              O documento é preservado com o estado "anulado" e o motivo registado, garantindo a
              rastreabilidade exigida pela auditoria fiscal.
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
