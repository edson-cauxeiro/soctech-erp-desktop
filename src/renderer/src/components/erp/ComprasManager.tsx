/**
 * @file ComprasManager.tsx
 * @description Gestão unificada de Compras: Encomendas a Fornecedores, Guias de Receção (com entrada física no Armazém 01 Geral - RN05.1) e Faturas de Compra (RF05).
 */

import { useState, useEffect, useCallback } from "react";
import {
  FilePlus2,
  Truck,
  FileText,
  RefreshCw,
  Plus,
  Loader2,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import {
  EncomendaCompraDto,
  GuiaRecepcaoDto,
  FaturaCompraDto,
  FornecedorDto,
  ArtigoDto,
  ArmazemDto,
} from "../../@types/electron";
import { comprasApi } from "../../api/compras.api";
import { fornecedorApi } from "../../api/fornecedor.api";
import { artigoApi } from "../../api/artigo.api";
import { armazemApi } from "../../api/armazem.api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { SearchSelect } from "../ui/SearchSelect";
import { getCurrencySymbol } from "../../utils/currency";
import { PriceInput, QuantityInput } from "./FormPrimitives";
import { toast } from "sonner";

type ComprasTab = "encomenda" | "recepcao" | "fatura";

export function ComprasManager() {
  const [activeTab, setActiveTab] = useState<ComprasTab>("recepcao");

  const moedaSimbolo = getCurrencySymbol();

  // Dados
  const [encomendas, setEncomendas] = useState<EncomendaCompraDto[]>([]);
  const [guias, setGuias] = useState<GuiaRecepcaoDto[]>([]);
  const [faturas, setFaturas] = useState<FaturaCompraDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Auxiliares
  const [fornecedores, setFornecedores] = useState<FornecedorDto[]>([]);
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);

  // Modais
  const [isEncomendaModalOpen, setIsEncomendaModalOpen] = useState(false);
  const [isGuiaModalOpen, setIsGuiaModalOpen] = useState(false);
  const [isFaturaModalOpen, setIsFaturaModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states - Encomenda
  const [encFornecedorId, setEncFornecedorId] = useState("");
  const [encArmazemId, setEncArmazemId] = useState("");
  const [encDataRecepcao, setEncDataRecepcao] = useState("");
  const [encObservacoes, setEncObservacoes] = useState("");
  const [encLinhas, setEncLinhas] = useState<
    Array<{ artigoId: string; quantidade: number; precoAcordado: number; taxaIva: number }>
  >([]);

  // Form states - Guia Receção
  const [recFornecedorId, setRecFornecedorId] = useState("");
  const [recEncomendaId, setRecEncomendaId] = useState("");
  const [recArmazemDestinoId, setRecArmazemDestinoId] = useState("");
  const [recObservacoes, setRecObservacoes] = useState("");
  const [recLinhas, setRecLinhas] = useState<
    Array<{ artigoId: string; quantidade: number; precoCusto: number; lote?: string; validade?: string }>
  >([]);

  // Form states - Fatura
  const [fatFornecedorId, setFatFornecedorId] = useState("");
  const [fatNumeroFornecedor, setFatNumeroFornecedor] = useState("");
  const [fatDataEmissao, setFatDataEmissao] = useState(new Date().toISOString().split("T")[0]);
  const [fatDataVencimento, setFatDataVencimento] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0]
  );
  const [fatLinhas, setFatLinhas] = useState<
    Array<{ artigoId: string; quantidade: number; precoUnitario: number; taxaIva: number }>
  >([]);

  const fetchAuxData = async () => {
    try {
      const [resForn, resArt, resArm] = await Promise.all([
        fornecedorApi.list({ take: 200, estado: "ativo" }),
        artigoApi.list({ take: 200 }),
        armazemApi.list({ take: 100, ativo: true }),
      ]);
      if (resForn.success) setFornecedores(resForn.data.items);
      if (resArt.success) setArtigos(resArt.data.items);
      if (resArm.success) setArmazens(resArm.data.items);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDados = useCallback(async () => {
    try {
      setIsLoading(true);
      if (activeTab === "encomenda") {
        const res = await comprasApi.listEncomendas();
        if (res.success) setEncomendas(res.data.items);
      } else if (activeTab === "recepcao") {
        const res = await comprasApi.listGuias();
        if (res.success) setGuias(res.data.items);
      } else {
        const res = await comprasApi.listFaturas();
        if (res.success) setFaturas(res.data.items);
      }
    } catch {
      toast.error("Erro ao carregar dados de compras.");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchAuxData();
  }, []);

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  // Handlers para Encomenda
  const handleOpenNewEncomenda = () => {
    const defaultArm = armazens.find((a) => a.isDefaultCompras || a.codigo === "ARM-01")?.id || armazens[0]?.id || "";
    setEncFornecedorId(fornecedores[0]?.id || "");
    setEncArmazemId(defaultArm);
    setEncDataRecepcao("");
    setEncObservacoes("");
    setEncLinhas(artigos.length > 0 ? [{ artigoId: artigos[0].id, quantidade: 1, precoAcordado: Number(artigos[0].precoCustoMedio || 0), taxaIva: 23 }] : []);
    setIsEncomendaModalOpen(true);
  };

  const handleCreateEncomenda = async () => {
    if (!encFornecedorId) {
      toast.error("Selecione o fornecedor.");
      return;
    }
    if (encLinhas.length === 0) {
      toast.error("Adicione artigos à encomenda.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await comprasApi.createEncomenda({
        fornecedorId: encFornecedorId,
        armazemDestinoId: encArmazemId || undefined,
        data: new Date(),
        dataRecepcao: encDataRecepcao ? new Date(encDataRecepcao) : undefined,
        observacoes: encObservacoes.trim() || undefined,
        linhas: encLinhas,
      });

      if (res.success) {
        toast.success(`Encomenda ${res.data.numero} emitida com sucesso!`);
        setIsEncomendaModalOpen(false);
        fetchDados();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao criar encomenda.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers para Guia de Receção
  const handleOpenNewGuia = () => {
    const defaultArm = armazens.find((a) => a.isDefaultCompras || a.codigo === "ARM-01")?.id || armazens[0]?.id || "";
    setRecFornecedorId(fornecedores[0]?.id || "");
    setRecEncomendaId("");
    setRecArmazemDestinoId(defaultArm);
    setRecObservacoes("");
    setRecLinhas(artigos.length > 0 ? [{ artigoId: artigos[0].id, quantidade: 10, precoCusto: Number(artigos[0].precoCustoMedio || 0), lote: "LT-2026-01" }] : []);
    setIsGuiaModalOpen(true);
  };

  const handleCreateGuia = async () => {
    if (!recArmazemDestinoId) {
      toast.error("Selecione o armazém de destino.");
      return;
    }
    if (recLinhas.length === 0) {
      toast.error("Adicione artigos rececionados.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await comprasApi.createGuia({
        fornecedorId: recFornecedorId || undefined,
        encomendaId: recEncomendaId || undefined,
        armazemDestinoId: recArmazemDestinoId,
        data: new Date(),
        observacoes: recObservacoes.trim() || undefined,
        linhas: recLinhas,
      });

      if (res.success) {
        toast.success(
          `Guia ${res.data.numero} processada! Entrada de stock efetuada no Armazém ${res.data.armazemDestino?.designacao || "Geral"}.`
        );
        setIsGuiaModalOpen(false);
        fetchDados();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao processar receção.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers para Fatura de Fornecedor
  const handleOpenNewFatura = () => {
    setFatFornecedorId(fornecedores[0]?.id || "");
    setFatNumeroFornecedor("");
    setFatLinhas(artigos.length > 0 ? [{ artigoId: artigos[0].id, quantidade: 1, precoUnitario: Number(artigos[0].precoCustoMedio || 0), taxaIva: 23 }] : []);
    setIsFaturaModalOpen(true);
  };

  const handleCreateFatura = async () => {
    if (!fatFornecedorId) {
      toast.error("Selecione o fornecedor.");
      return;
    }
    if (!fatNumeroFornecedor.trim()) {
      toast.error("Indique o número da fatura do fornecedor.");
      return;
    }
    if (fatLinhas.length === 0) {
      toast.error("Adicione linhas à fatura.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await comprasApi.createFatura({
        fornecedorId: fatFornecedorId,
        numeroFornecedor: fatNumeroFornecedor.trim(),
        dataEmissao: new Date(fatDataEmissao),
        dataVencimento: new Date(fatDataVencimento),
        linhas: fatLinhas,
      });

      if (res.success) {
        toast.success(`Fatura de compra ${res.data.numeroInterno} registada com sucesso!`);
        setIsFaturaModalOpen(false);
        fetchDados();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao criar fatura.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Abas Superiores do Módulo */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("recepcao")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "recepcao"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Guias de Receção (Entrada de Stock)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("encomenda")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "encomenda"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Encomendas a Fornecedor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("fatura")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "fatura"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Faturas de Compra</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDados}
            disabled={isLoading}
            className="h-8 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>

          {activeTab === "recepcao" && (
            <button
              type="button"
              onClick={handleOpenNewGuia}
              className="h-8 px-3 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Rececionar Mercadoria</span>
            </button>
          )}

          {activeTab === "encomenda" && (
            <button
              type="button"
              onClick={handleOpenNewEncomenda}
              className="h-8 px-3 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Encomenda</span>
            </button>
          )}

          {activeTab === "fatura" && (
            <button
              type="button"
              onClick={handleOpenNewFatura}
              className="h-8 px-3 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Registar Fatura Fornecedor</span>
            </button>
          )}
        </div>
      </div>

      {/* ABA 1: GUIAS DE RECEÇÃO */}
      {activeTab === "recepcao" && (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Nº Guia</th>
                <th className="px-4 py-3">Data Receção</th>
                <th className="px-4 py-3">Armazém Destino</th>
                <th className="px-4 py-3">Encomenda Origem</th>
                <th className="px-4 py-3 text-center">Itens Recebidos</th>
                <th className="px-4 py-3 text-center">Conformidade</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar guias de receção...</span>
                  </td>
                </tr>
              ) : guias.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhuma guia de receção registada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Clique em &quot;Rececionar Mercadoria&quot; para registar entradas de stock com destino ao Armazém 01 Geral.
                    </p>
                  </td>
                </tr>
              ) : (
                guias.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{g.numero}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(g.data).toLocaleDateString("pt-PT")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{g.armazemDestino?.codigo}</span> —{" "}
                      <span className="text-xs text-muted-foreground">{g.armazemDestino?.designacao}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {g.encomenda?.numero || "Receção Direta"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{g.linhas?.length || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {g.conformidade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Stock Entrado
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ABA 2: ENCOMENDAS */}
      {activeTab === "encomenda" && (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Nº Encomenda</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Armazém Destino</th>
                <th className="px-4 py-3 text-right">Total Líquido</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar encomendas...</span>
                  </td>
                </tr>
              ) : encomendas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <FilePlus2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhuma encomenda emitida</p>
                  </td>
                </tr>
              ) : (
                encomendas.map((enc) => (
                  <tr key={enc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{enc.numero}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(enc.data).toLocaleDateString("pt-PT")}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{enc.fornecedor?.nome}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {enc.armazemDestino?.designacao || "ARM-01 Geral"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {Number(enc.totalLiquido).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="capitalize text-xs bg-muted px-2 py-0.5 rounded font-medium">
                        {enc.estado}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ABA 3: FATURAS */}
      {activeTab === "fatura" && (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Nº Interno</th>
                <th className="px-4 py-3">Nº Fornecedor</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-right">Total (€)</th>
                <th className="px-4 py-3 text-center">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar faturas de compra...</span>
                  </td>
                </tr>
              ) : faturas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhuma fatura de compra registada</p>
                  </td>
                </tr>
              ) : (
                faturas.map((fat) => (
                  <tr key={fat.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{fat.numeroInterno}</td>
                    <td className="px-4 py-3 font-mono text-xs">{fat.numeroFornecedor}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{fat.fornecedor?.nome}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(fat.dataEmissao).toLocaleDateString("pt-PT")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(fat.dataVencimento).toLocaleDateString("pt-PT")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {Number(fat.totalLiquido).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="capitalize text-xs bg-muted px-2 py-0.5 rounded font-medium">
                        {fat.estadoPagamento}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Receção de Mercadorias (com entrada no Armazém 01 Geral) */}
      <Dialog open={isGuiaModalOpen} onOpenChange={setIsGuiaModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              <DialogTitle>Guia de Receção de Mercadorias (Entrada Física)</DialogTitle>
            </div>
            <DialogDescription>
              A confirmação desta guia efetuará a entrada de stock no Armazém indicado (por defeito: ARM-01 Geral) e recalculará o Preço Médio Ponderado (PMP).
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Fornecedor</label>
                <SearchSelect
                  value={recFornecedorId}
                  onChange={setRecFornecedorId}
                  options={fornecedores.map((f) => ({
                    value: f.id,
                    label: `${f.codigo} — ${f.nome}`,
                  }))}
                  placeholder="Pesquisar fornecedor..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Armazém de Destino (Entrada de Stock) *
                </label>
                <SearchSelect
                  value={recArmazemDestinoId}
                  onChange={setRecArmazemDestinoId}
                  options={armazens.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.designacao} ${a.isDefaultCompras ? "(Padrão Entradas/Geral)" : ""}`,
                  }))}
                  placeholder="Pesquisar armazém..."
                  required
                />
              </div>
            </div>

            {/* Linhas de Receção */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Artigos Rececionados ({recLinhas.length})
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const art = artigos[0];
                    if (art) {
                      setRecLinhas([...recLinhas, { artigoId: art.id, quantidade: 1, precoCusto: Number(art.precoCustoMedio || 0), lote: "" }]);
                    }
                  }}
                  className="px-2.5 py-1 text-xs bg-primary text-primary-foreground font-medium rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Artigo
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_8.5rem_2rem] gap-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Artigo</span>
                <span className="text-center">Quantidade</span>
                <span className="text-right">Custo Unit. ({moedaSimbolo})</span>
                <span>Lote</span>
                <span />
              </div>

              <div className="space-y-2">
                {recLinhas.map((linha, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_8.5rem_2rem] gap-2 items-center bg-muted/20 p-2 rounded border border-border"
                  >
                    <SearchSelect
                      value={linha.artigoId}
                      onChange={(val) => {
                        const updated = [...recLinhas];
                        updated[idx].artigoId = val;
                        setRecLinhas(updated);
                      }}
                      options={artigos.map((a) => ({
                        value: a.id,
                        label: `${a.codigo} — ${a.descricao} (${a.unidade})`,
                      }))}
                      placeholder="Pesquisar artigo..."
                      className="min-w-0"
                      required
                    />

                    <div className="w-full">
                      <QuantityInput
                        value={linha.quantidade}
                        integer
                        min={1}
                        onChange={(valor) => {
                          const updated = [...recLinhas];
                          updated[idx].quantidade = valor;
                          setRecLinhas(updated);
                        }}
                        placeholder="Qtd."
                      />
                    </div>

                    <div className="w-full">
                      <PriceInput
                        value={linha.precoCusto}
                        onChange={(valor) => {
                          const updated = [...recLinhas];
                          updated[idx].precoCusto = valor;
                          setRecLinhas(updated);
                        }}
                        placeholder={`Custo (${moedaSimbolo})`}
                      />
                    </div>

                    <div className="w-full">
                      <input
                        type="text"
                        placeholder="Lote"
                        title="Lote / Nº de série"
                        value={linha.lote || ""}
                        onChange={(e) => {
                          const updated = [...recLinhas];
                          updated[idx].lote = e.target.value;
                          setRecLinhas(updated);
                        }}
                        className="w-full h-8 rounded border border-input bg-background px-2 text-xs font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setRecLinhas(recLinhas.filter((_, i) => i !== idx))}
                      className="p-1 text-rose-500 hover:bg-rose-100 rounded"
                      aria-label="Remover linha"
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
                onClick={() => setIsGuiaModalOpen(false)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateGuia}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar Receção & Dar Entrada de Stock
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Nova Encomenda a Fornecedor */}
      <Dialog open={isEncomendaModalOpen} onOpenChange={setIsEncomendaModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <FilePlus2 className="w-5 h-5 text-primary" />
              <DialogTitle>Nova Encomenda a Fornecedor</DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Fornecedor *</label>
                <SearchSelect
                  value={encFornecedorId}
                  onChange={setEncFornecedorId}
                  options={fornecedores.map((f) => ({
                    value: f.id,
                    label: `${f.codigo} — ${f.nome}`,
                  }))}
                  placeholder="Pesquisar fornecedor..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Armazém Destino Previsto</label>
                <SearchSelect
                  value={encArmazemId}
                  onChange={setEncArmazemId}
                  options={armazens.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.designacao}`,
                  }))}
                  placeholder="Pesquisar armazém..."
                />
              </div>
            </div>

            {/* Linhas */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Linhas da Encomenda ({encLinhas.length})
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const art = artigos[0];
                    if (art) {
                      setEncLinhas([...encLinhas, { artigoId: art.id, quantidade: 1, precoAcordado: Number(art.precoVenda || 0), taxaIva: 23 }]);
                    }
                  }}
                  className="px-2.5 py-1 text-xs bg-primary text-primary-foreground font-medium rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Linha
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_2rem] gap-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Artigo</span>
                <span className="text-center">Quantidade</span>
                <span className="text-right">Preço Acordado ({moedaSimbolo})</span>
                <span />
              </div>

              <div className="space-y-2">
                {encLinhas.map((linha, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_2rem] gap-2 items-center bg-muted/20 p-2 rounded border border-border"
                  >
                    <SearchSelect
                      value={linha.artigoId}
                      onChange={(val) => {
                        const updated = [...encLinhas];
                        updated[idx].artigoId = val;
                        setEncLinhas(updated);
                      }}
                      options={artigos.map((a) => ({
                        value: a.id,
                        label: `${a.codigo} — ${a.descricao}`,
                      }))}
                      placeholder="Pesquisar artigo..."
                      className="min-w-0"
                      required
                    />

                    <div className="w-full">
                      <QuantityInput
                        value={linha.quantidade}
                        integer
                        min={1}
                        onChange={(valor) => {
                          const updated = [...encLinhas];
                          updated[idx].quantidade = valor;
                          setEncLinhas(updated);
                        }}
                        placeholder="Qtd."
                      />
                    </div>

                    <div className="w-full">
                      <PriceInput
                        value={linha.precoAcordado}
                        onChange={(valor) => {
                          const updated = [...encLinhas];
                          updated[idx].precoAcordado = valor;
                          setEncLinhas(updated);
                        }}
                        placeholder={`Preço (${moedaSimbolo})`}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setEncLinhas(encLinhas.filter((_, i) => i !== idx))}
                      className="p-1 text-rose-500 hover:bg-rose-100 rounded"
                      aria-label="Remover linha"
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
                onClick={() => setIsEncomendaModalOpen(false)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateEncomenda}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Emitir Encomenda
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Nova Fatura de Fornecedor */}
      <Dialog open={isFaturaModalOpen} onOpenChange={setIsFaturaModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <DialogTitle>Registar Fatura de Fornecedor</DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Fornecedor *</label>
                <SearchSelect
                  value={fatFornecedorId}
                  onChange={setFatFornecedorId}
                  options={fornecedores.map((f) => ({
                    value: f.id,
                    label: `${f.codigo} — ${f.nome}`,
                  }))}
                  placeholder="Pesquisar fornecedor..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Nº Fatura Fornecedor *</label>
                <input
                  type="text"
                  placeholder="Ex: FT 2026/9981"
                  value={fatNumeroFornecedor}
                  onChange={(e) => setFatNumeroFornecedor(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Data Emissão *</label>
                <input
                  type="date"
                  value={fatDataEmissao}
                  onChange={(e) => setFatDataEmissao(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Data Vencimento</label>
                <input
                  type="date"
                  value={fatDataVencimento}
                  onChange={(e) => setFatDataVencimento(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            {/* Linhas */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Itens da Fatura ({fatLinhas.length})
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const art = artigos[0];
                    if (art) {
                      setFatLinhas([...fatLinhas, { artigoId: art.id, quantidade: 1, precoUnitario: Number(art.precoCustoMedio || 0), taxaIva: 23 }]);
                    }
                  }}
                  className="px-2.5 py-1 text-xs bg-primary text-primary-foreground font-medium rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Item
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_2rem] gap-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Artigo</span>
                <span className="text-center">Quantidade</span>
                <span className="text-right">Preço Unit. ({moedaSimbolo})</span>
                <span />
              </div>

              <div className="space-y-2">
                {fatLinhas.map((linha, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_2rem] gap-2 items-center bg-muted/20 p-2 rounded border border-border"
                  >
                    <SearchSelect
                      value={linha.artigoId}
                      onChange={(val) => {
                        const updated = [...fatLinhas];
                        updated[idx].artigoId = val;
                        setFatLinhas(updated);
                      }}
                      options={artigos.map((a) => ({
                        value: a.id,
                        label: `${a.codigo} — ${a.descricao}`,
                      }))}
                      placeholder="Pesquisar artigo..."
                      className="min-w-0"
                      required
                    />

                    <div className="w-full">
                      <QuantityInput
                        value={linha.quantidade}
                        integer
                        min={1}
                        onChange={(valor) => {
                          const updated = [...fatLinhas];
                          updated[idx].quantidade = valor;
                          setFatLinhas(updated);
                        }}
                        placeholder="Qtd."
                      />
                    </div>

                    <div className="w-full">
                      <PriceInput
                        value={linha.precoUnitario}
                        onChange={(valor) => {
                          const updated = [...fatLinhas];
                          updated[idx].precoUnitario = valor;
                          setFatLinhas(updated);
                        }}
                        placeholder={`Preço (${moedaSimbolo})`}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setFatLinhas(fatLinhas.filter((_, i) => i !== idx))}
                      className="p-1 text-rose-500 hover:bg-rose-100 rounded"
                      aria-label="Remover linha"
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
                onClick={() => setIsFaturaModalOpen(false)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateFatura}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar Fatura de Compra
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
