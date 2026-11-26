/**
 * @file ReciboManager.tsx
 * @description Gestão de Recibos de Venda (RC): emissão de recibos com imputação imediata
 * ou a título de adiantamento, imputação posterior a faturas do mesmo cliente, consulta do
 * saldo por fatura, pré-visualização/impressão e anulação com reversão das imputações.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { DocumentoPrintDto, FaturaVendaDto, ReciboVendaDto, ContaBancariaComSaldoDto } from "../../@types/electron";
import { recibosApi } from "../../api/recibos.api";
import { vendasApi } from "../../api/vendas.api";
import { tesourariaApi } from "../../api/tesouraria.api";
import { useDocumentoBase } from "../../hooks/useDocumentoBase";
import { DocumentoPreviewDialog } from "../documentos/DocumentoPreviewDialog";
import { SearchSelect } from "../ui/SearchSelect";
import { formatCurrency } from "../../utils/currency";
import { toast } from "sonner";

type MeioPagamento = "numerario" | "transferencia" | "cheque" | "multicaixa";

const MEIO_LABEL: Record<MeioPagamento, string> = {
  numerario: "Numerário",
  transferencia: "Transferência bancária",
  cheque: "Cheque",
  multicaixa: "Multicaixa",
};

const hojeIso = () => new Date().toISOString().split("T")[0];

const formatMoney = (val: number | undefined | null) => formatCurrency(val ?? 0, "AOA");

/** Uma fatura candidada a imputação, com o saldo já apurado. */
interface FaturaImputavel {
  fatura: FaturaVendaDto;
  saldo: number;
}

interface ImputacaoForm {
  faturaId: string;
  valor: number;
}

const ESTADO_CLASS: Record<string, string> = {
  emitido: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  anulado: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function ReciboManager() {
  const { empresaId, series, setSeries, clientes, fetchSeries } = useDocumentoBase();

  const [activeTab, setActiveTab] = useState<"emitir" | "historico">("emitir");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  // Formulário de emissão
  const [serie, setSerie] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [data, setData] = useState(hojeIso);
  const [meioPagamento, setMeioPagamento] = useState<MeioPagamento>("numerario");
  const [valorRecebido, setValorRecebido] = useState(0);
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [contas, setContas] = useState<ContaBancariaComSaldoDto[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [imputacoes, setImputacoes] = useState<ImputacaoForm[]>([]);

  // Imputação posterior
  const [allocating, setAllocating] = useState<ReciboVendaDto | null>(null);
  const [allocImputacoes, setAllocImputacoes] = useState<ImputacaoForm[]>([]);

  // Anulação
  const [cancelling, setCancelling] = useState<ReciboVendaDto | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");

  const [preview, setPreview] = useState<DocumentoPrintDto | null>(null);
  const [recibos, setRecibos] = useState<ReciboVendaDto[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    let obsoleto = false;
    fetchSeries("RC").then((lista) => {
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

  /**
   * Contas da empresa para creditar o recebimento. O select mostra o saldo para
   * o utilizador não precisar de abrir outra aba para saber onde está o dinheiro.
   */
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

  // Numerário e multicaixa só entram numa caixa com a sessão aberta. Avisamos
  // aqui para o erro aparecer antes de o utilizador preencher imputações.
  const [avisoSessao, setAvisoSessao] = useState<string | null>(null);
  useEffect(() => {
    if (!empresaId || !contaBancariaId) {
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
            ? "Esta conta de caixa não tem sessão aberta. Abra a sessão em Finanças › Contas antes de emitir o recibo."
            : null
        );
      });
    return () => {
      obsoleto = true;
    };
  }, [empresaId, contaBancariaId, meioPagamento]);

  const fetchRecibos = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await recibosApi.list({
        empresaId,
        search: search.trim() || undefined,
        take: 100,
      });
      if (res.success) setRecibos(res.data.items);
      else toast.error("Erro ao carregar recibos: " + res.error.message);
    } catch {
      toast.error("Falha ao comunicar com o backend de recibos.");
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, search]);

  useEffect(() => {
    if (activeTab === "historico") fetchRecibos();
  }, [activeTab, fetchRecibos]);

  /**
   * Faturas do cliente com saldo por liquidar. O serviço é a autoridade final, mas a UI
   * antecipa as mesmas restrições: mesmo cliente, documento não anulado e saldo suficiente.
   */
  const faturasImputaveis = useCallback(
    async (cliente: string): Promise<FaturaImputavel[]> => {
      if (!cliente || !empresaId) return [];
      try {
        const res = await vendasApi.listFaturas({ empresaId, clienteId: cliente, take: 200 });
        if (!res.success) return [];
        return res.data.items
          .filter((f) => f.estadoDocumento !== "anulado")
          .map((f) => {
            const jaImputado = (f.imputacoesRecibo || []).reduce(
              (sum, i) => sum + Number(i.valorImputado),
              0
            );
            return { fatura: f, saldo: Number(f.totalLiquido) - jaImputado };
          })
          .filter((c) => c.saldo > 0.005)
          .sort((a, b) =>
            new Date(a.fatura.dataEmissao).getTime() - new Date(b.fatura.dataEmissao).getTime()
          );
      } catch {
        return [];
      }
    },
    [empresaId]
  );

  const [candidatas, setCandidatas] = useState<FaturaImputavel[]>([]);

  const handleClienteChange = async (novoClienteId: string) => {
    setClienteId(novoClienteId);
    setImputacoes([]);
    setCandidatas(await faturasImputaveis(novoClienteId));
  };

  const selectedCliente = clientes.find((c) => c.id === clienteId);

  const totalImputado = useMemo(
    () => imputacoes.reduce((sum, i) => sum + (i.valor || 0), 0),
    [imputacoes]
  );
  const saldoAdiantamento = useMemo(
    () => Math.max(0, valorRecebido - totalImputado),
    [valorRecebido, totalImputado]
  );

  const saldoDisponivelRecibo = useCallback(
    (r: ReciboVendaDto) => {
      const jaImputado = (r.imputacoes || []).reduce((sum, i) => sum + Number(i.valorImputado), 0);
      return Number(r.valorRecebido) - jaImputado;
    },
    []
  );

  const addImputacao = (lista: ImputacaoForm[], setLista: (v: ImputacaoForm[]) => void) => {
    const jaUsadas = new Set(lista.map((i) => i.faturaId));
    const disponivel = candidatas.find((c) => !jaUsadas.has(c.fatura.id));
    if (!disponivel) {
      toast.error("Não há mais faturas com saldo para imputar.");
      return;
    }
    setLista([...lista, { faturaId: disponivel.fatura.id, valor: disponivel.saldo }]);
  };

  const updateImputacao = (
    lista: ImputacaoForm[],
    setLista: (v: ImputacaoForm[]) => void,
    index: number,
    valor: number
  ) => {
    const cand = candidatas.find((c) => c.fatura.id === lista[index].faturaId);
    const max = cand ? cand.saldo : 0;
    setLista(lista.map((i, idx) => (idx === index ? { ...i, valor: Math.min(valor, max) } : i)));
  };

  const resetForm = () => {
    setImputacoes([]);
    setCandidatas([]);
    setValorRecebido(0);
    setContaBancariaId("");
    setObservacoes("");
    setData(hojeIso());
  };

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!empresaId) {
      toast.error("Não há empresa configurada para esta sessão.");
      return;
    }
    if (!clienteId) {
      toast.error("Selecione o cliente que efectuou o pagamento.");
      return;
    }
    if (!serie) {
      toast.error("Selecione a série do recibo.");
      return;
    }
    if (!valorRecebido || valorRecebido <= 0) {
      toast.error("Indique o valor recebido.");
      return;
    }
    if (!contaBancariaId) {
      toast.error("Selecione a conta onde o dinheiro entrou.");
      return;
    }
    if (avisoSessao) {
      toast.error(avisoSessao);
      return;
    }
    if (totalImputado > valorRecebido + 0.0001) {
      toast.error("O total imputado não pode exceder o valor recebido.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await recibosApi.criar({
        empresaId,
        serie,
        data: new Date(data),
        clienteId,
        meioPagamento,
        valorRecebido,
        contaBancariaId,
        observacoes: observacoes.trim() || null,
        imputacoes: imputacoes
          .filter((i) => i.valor > 0)
          .map((i) => ({ faturaId: i.faturaId, valorImputado: i.valor })),
      });

      if (res.success) {
        const isAdiantamento = saldoAdiantamento > 0.005;
        toast.success(
          isAdiantamento
            ? `Recibo ${res.data.numero} emitido. ${formatMoney(saldoAdiantamento)} ficam como adiantamento do cliente.`
            : `Recibo ${res.data.numero} emitido e totalmente imputado.`
        );
        resetForm();
        setActiveTab("historico");
        fetchRecibos();
      } else {
        toast.error("Erro ao emitir recibo: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreview = async (r: ReciboVendaDto) => {
    try {
      const res = await recibosApi.getDocumentoImprimivel(r.id);
      if (res.success) setPreview(res.data);
      else toast.error("Erro ao carregar a pré-visualização: " + res.error.message);
    } catch {
      toast.error("Falha ao carregar a pré-visualização.");
    }
  };

  const openAlloc = async (r: ReciboVendaDto) => {
    setAllocating(r);
    setAllocImputacoes([]);
    setCandidatas(await faturasImputaveis(r.clienteId));
  };

  const handleImputar = async () => {
    if (!allocating) return;
    const validas = allocImputacoes.filter((i) => i.valor > 0);
    if (validas.length === 0) {
      toast.error("Indique pelo menos um valor a imputar.");
      return;
    }
    const disponivel = saldoDisponivelRecibo(allocating);
    const total = validas.reduce((sum, i) => sum + i.valor, 0);
    if (total > disponivel + 0.0001) {
      toast.error(`O total imputado excede o saldo disponível do recibo (${formatMoney(disponivel)}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await recibosApi.imputarFaturas(
        allocating.id,
        validas.map((i) => ({ faturaId: i.faturaId, valorImputado: i.valor }))
      );
      if (res.success) {
        toast.success(`Imputação registada no recibo ${res.data.numero}.`);
        setAllocating(null);
        setAllocImputacoes([]);
        fetchRecibos();
      } else {
        toast.error("Erro ao imputar recibo: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao imputar o recibo.");
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
      const res = await recibosApi.anular(cancelling.id, cancelMotivo.trim());
      if (res.success) {
        toast.success(`Recibo ${res.data.numero} anulado e imputações revertidas.`);
        setCancelling(null);
        setCancelMotivo("");
        fetchRecibos();
      } else {
        toast.error("Erro ao anular recibo: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao anular o recibo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalImputadoLista = (r: ReciboVendaDto) =>
    (r.imputacoes || []).reduce((sum, i) => sum + Number(i.valorImputado), 0);

  const rotuloFatura = (f: FaturaVendaDto) =>
    `${f.numero} · ${formatMoney(Number(f.totalLiquido))} · venc. ${new Date(
      f.dataVencimento
    ).toLocaleDateString("pt-PT")}`;

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
            <span>Novo Recibo</span>
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
            <Wallet className="w-4 h-4" />
            <span>Histórico de Recibos</span>
          </button>
        </div>

        {activeTab === "emitir" && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md text-xs">
            <Banknote className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span className="text-muted-foreground">
              O que não for imputado fica como adiantamento do cliente
            </span>
          </div>
        )}
      </div>

      {activeTab === "emitir" && (
        <form onSubmit={handleCriar} className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6 shadow-xs space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2 border-b border-border/70 pb-3">
              <Banknote className="w-4 h-4 text-primary" />
              Dados do Recibo
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Cliente <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={clienteId}
                  onChange={handleClienteChange}
                  options={clientes.map((c) => ({ value: c.id, label: `${c.codigo} - ${c.nome}` }))}
                  placeholder="Pesquisar cliente..."
                  required
                  portal
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Série RC <span className="text-destructive">*</span>
                </label>
                <SearchSelect
                  value={serie}
                  onChange={setSerie}
                  options={series.map((s) => ({ value: s.codigo, label: `${s.codigo} — ${s.descricao}` }))}
                  placeholder="Selecionar série..."
                  required
                  portal
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

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Valor Recebido <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={valorRecebido || ""}
                  onChange={(e) => setValorRecebido(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Meio de Pagamento</label>
                <SearchSelect
                  value={meioPagamento}
                  onChange={(v) => setMeioPagamento(v as MeioPagamento)}
                  options={(Object.keys(MEIO_LABEL) as MeioPagamento[]).map((m) => ({
                    value: m,
                    label: MEIO_LABEL[m],
                  }))}
                  placeholder="Selecionar meio de pagamento..."
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
                    label: `${c.codigo} — ${c.designacao} (${c.tipo === "caixa" ? "Caixa" : c.nomeBanco || "Banco"}) · ${formatMoney(c.saldo)}`,
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

            </div>

            {selectedCliente && (
              <p className="text-[11px] text-muted-foreground">
                Recibo de <strong className="text-foreground">{selectedCliente.nome}</strong> · NIF{" "}
                <span className="font-mono">{selectedCliente.nif}</span>
              </p>
            )}
          </div>

          {/* Imputações */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Imputação a Faturas
              </h3>
              <button
                type="button"
                onClick={() => addImputacao(imputacoes, setImputacoes)}
                disabled={!clienteId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Fatura
              </button>
            </div>

            {!clienteId ? (
              <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Selecione um cliente para ver as faturas com saldo.
              </div>
            ) : imputacoes.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                <p className="font-medium text-foreground">
                  {candidatas.length === 0
                    ? "Este cliente não tem faturas com saldo por liquidar."
                    : "Nenhuma fatura imputada."}
                </p>
                <p className="mt-1">
                  Pode emitir o recibo na totalidade a título de adiantamento.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {imputacoes.map((imp, idx) => {
                  const cand = candidatas.find((c) => c.fatura.id === imp.faturaId);
                  return (
                    <div
                      key={imp.faturaId}
                      className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 items-center p-3 border border-border rounded-md bg-muted/20"
                    >
                      <SearchSelect
                        value={imp.faturaId}
                        onChange={(faturaId) =>
                          setImputacoes(
                            imputacoes.map((i, k) =>
                              k === idx
                                ? {
                                    ...i,
                                    faturaId,
                                    valor: candidatas.find((c) => c.fatura.id === faturaId)?.saldo || 0,
                                  }
                                : i
                            )
                          )
                        }
                        options={candidatas.map((c) => ({
                          value: c.fatura.id,
                          label: rotuloFatura(c.fatura),
                        }))}
                        placeholder="Fatura..."
                        portal
                      />
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={cand?.saldo}
                        value={imp.valor || ""}
                        onChange={(e) =>
                          updateImputacao(imputacoes, setImputacoes, idx, Number(e.target.value))
                        }
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-right outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setImputacoes(imputacoes.filter((_, k) => k !== idx))}
                        className="p-2 rounded hover:bg-destructive/10 text-destructive"
                        title="Remover imputação"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Observações</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Referência do pagamento, nº de cheque, etc."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-border">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Total recebido</span>
                  <p className="font-bold text-foreground">{formatMoney(valorRecebido || 0)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Total imputado</span>
                  <p className="font-bold text-foreground">{formatMoney(totalImputado)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Adiantamento</span>
                  <p
                    className={`font-bold ${
                      saldoAdiantamento > 0.005 ? "text-amber-600" : "text-foreground"
                    }`}
                  >
                    {formatMoney(saldoAdiantamento)}
                  </p>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Banknote className="w-4 h-4" />
                )}
                Emitir Recibo
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
              onClick={fetchRecibos}
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
                  <th className="px-4 py-3">Meio</th>
                  <th className="px-4 py-3 text-right">Recebido</th>
                  <th className="px-4 py-3 text-right">Imputado</th>
                  <th className="px-4 py-3 text-right">Adiantamento</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      <span>A carregar recibos...</span>
                    </td>
                  </tr>
                ) : recibos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-foreground">Nenhum recibo encontrado</p>
                    </td>
                  </tr>
                ) : (
                  recibos.map((r) => {
                    const imputado = totalImputadoLista(r);
                    const adiantamento = Number(r.valorRecebido) - imputado;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-primary">{r.numero}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(r.data).toLocaleDateString("pt-PT")}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{r.clienteNome}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {MEIO_LABEL[r.meioPagamento]}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {formatMoney(Number(r.valorRecebido))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {formatMoney(imputado)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono text-xs font-semibold ${
                            adiantamento > 0.005 ? "text-amber-600" : "text-muted-foreground"
                          }`}
                        >
                          {formatMoney(Math.max(0, adiantamento))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              ESTADO_CLASS[r.estadoDocumento] || ""
                            }`}
                          >
                            {r.estadoDocumento === "anulado" ? "Anulado" : "Emitido"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {r.estadoDocumento !== "anulado" && (
                              <>
                                {adiantamento > 0.005 && (
                                  <button
                                    type="button"
                                    onClick={() => openAlloc(r)}
                                    className="p-1.5 rounded hover:bg-muted text-emerald-600"
                                    title="Imputar a faturas"
                                  >
                                    <Wallet className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handlePreview(r)}
                                  className="p-1.5 rounded hover:bg-muted text-primary"
                                  title="Pré-visualizar / Imprimir"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelling(r);
                                    setCancelMotivo("");
                                  }}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                                  title="Anular recibo"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de imputação posterior */}
      {allocating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Imputar {allocating.numero}
            </h3>
            <p className="text-xs text-muted-foreground">
              Saldo disponível deste recibo:{" "}
              <strong className="text-foreground">
                {formatMoney(saldoDisponivelRecibo(allocating))}
              </strong>{" "}
              · apenas faturas de {allocating.clienteNome}.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => addImputacao(allocImputacoes, setAllocImputacoes)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Fatura
              </button>
            </div>

            {allocImputacoes.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                {candidatas.length === 0
                  ? "Este cliente não tem faturas com saldo por liquidar."
                  : "Nenhuma fatura seleccionada para imputação."}
              </div>
            ) : (
              <div className="space-y-2">
                {allocImputacoes.map((imp, idx) => {
                  const cand = candidatas.find((c) => c.fatura.id === imp.faturaId);
                  return (
                    <div
                      key={imp.faturaId}
                      className="grid grid-cols-1 md:grid-cols-[1fr_150px_auto] gap-2 items-center p-3 border border-border rounded-md bg-muted/20"
                    >
                      <SearchSelect
                        value={imp.faturaId}
                        onChange={(faturaId) =>
                          setAllocImputacoes(
                            allocImputacoes.map((i, k) =>
                              k === idx
                                ? {
                                    ...i,
                                    faturaId,
                                    valor: candidatas.find((c) => c.fatura.id === faturaId)?.saldo || 0,
                                  }
                                : i
                            )
                          )
                        }
                        options={candidatas.map((c) => ({
                          value: c.fatura.id,
                          label: rotuloFatura(c.fatura),
                        }))}
                        placeholder="Fatura..."
                        portal
                      />
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={cand?.saldo}
                        value={imp.valor || ""}
                        onChange={(e) =>
                          updateImputacao(allocImputacoes, setAllocImputacoes, idx, Number(e.target.value))
                        }
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-right outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAllocImputacoes(allocImputacoes.filter((_, k) => k !== idx))
                        }
                        className="p-2 rounded hover:bg-destructive/10 text-destructive"
                        title="Remover"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground text-xs">Total a imputar</span>
                  <span className="font-bold text-foreground">
                    {formatMoney(allocImputacoes.reduce((s, i) => s + (i.valor || 0), 0))}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAllocating(null)}
                className="px-4 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImputar}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar Imputação
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
              A anulação reverte as imputações e reabre o saldo das faturas afectadas. O
              documento é preservado para auditoria.
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
