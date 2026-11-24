import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import type {
  OrdemPagamentoResumoDto,
  OrdemPagamentoDetalheDto,
  PagamentoResumoDto,
  RhOrdensPagamentoListarInput,
  RhOrdemPagamentoCriarInput,
  RhPagamentosListarInput,
  RhPagamentoConfirmarInput,
  RhPagamentoEstornarInput,
} from "@/@types/electron";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });
const fmtData = new Intl.DateTimeFormat("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric" });
const TAKE = 25;

const ESTADO_ORDEM_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  ENVIADA: "Enviada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const ESTADO_PAG_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  PARCIAL: "Parcial",
  PAGO: "Pago",
  ESTORNADO: "Estornado",
  CANCELADO: "Cancelado",
};

const FORMA_PAG_LABEL: Record<string, string> = {
  TRANSFERENCIA: "Transferência",
  NUMERARIO: "Numerário",
  CHEQUE: "Cheque",
};

function data(valor: string | Date): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : fmtData.format(d);
}

interface FiltrosOrdem {
  estado: string;
}

interface FiltrosPagamento {
  estado: string;
  formaPagamento: string;
  funcionarioId: string;
  ordemId: string;
}

const FILTROS_ORDEM_INICIAIS: FiltrosOrdem = { estado: "" };
const FILTROS_PAG_INICIAIS: FiltrosPagamento = {
  estado: "",
  formaPagamento: "",
  funcionarioId: "",
  ordemId: "",
};

export function RhPagamentosManager() {
  const [aba, setAba] = useState<"ordens" | "pagamentos">("ordens");
  const [carregando, setCarregando] = useState(false);

  // Ordens
  const [filtrosOrdem, setFiltrosOrdem] = useState<FiltrosOrdem>(FILTROS_ORDEM_INICIAIS);
  const [skipOrdem, setSkipOrdem] = useState(0);
  const [paginaOrdens, setPaginaOrdens] = useState<{ total: number; items: OrdemPagamentoResumoDto[] }>({ total: 0, items: [] });
  const [detalheOrdemAberto, setDetalheOrdemAberto] = useState(false);
  const [detalheOrdem, setDetalheOrdem] = useState<OrdemPagamentoDetalheDto | null>(null);
  const [criarOrdemAberto, setCriarOrdemAberto] = useState(false);
  const [aCriarOrdem, setACriarOrdem] = useState(false);
  const [ficheiroConteudo, setFicheiroConteudo] = useState<string | null>(null);
  const [ficheiroAberto, setFicheiroAberto] = useState(false);

  // Pagamentos
  const [filtrosPag, setFiltrosPag] = useState<FiltrosPagamento>(FILTROS_PAG_INICIAIS);
  const [buscaPag, setBuscaPag] = useState("");
  const [skipPag, setSkipPag] = useState(0);
  const [paginaPags, setPaginaPags] = useState<{ total: number; items: PagamentoResumoDto[] }>({ total: 0, items: [] });
  const [funcionarios, setFuncionarios] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [pagamentosParaOrdem, setPagamentosParaOrdem] = useState<PagamentoResumoDto[]>([]);
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [pagamentoConfirmar, setPagamentoConfirmar] = useState<PagamentoResumoDto | null>(null);
  const [valorConfirmar, setValorConfirmar] = useState("");
  const [dataConfirmar, setDataConfirmar] = useState(() => new Date().toISOString().slice(0, 10));
  const [refConfirmar, setRefConfirmar] = useState("");
  const [aConfirmar, setAConfirmar] = useState(false);
  const [estornarAberto, setEstornarAberto] = useState(false);
  const [pagamentoEstornar, setPagamentoEstornar] = useState<PagamentoResumoDto | null>(null);
  const [motivoEstornar, setMotivoEstornar] = useState("");
  const [aEstornar, setAEstornar] = useState(false);

  // Carregar funcionários para filtros
  const carregarFuncionarios = useCallback(async () => {
    try {
      const resp = await rhApi.funcionarios.listar({ take: 500 });
      if (resp.success) setFuncionarios(resp.data.items.map((f) => ({ id: f.id, codigo: f.codigo, nome: f.nome })));
    } catch {
      setFuncionarios([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
  }, [carregarFuncionarios]);

  // Carregar ordens
  const carregarOrdens = useCallback(async () => {
    setCarregando(true);
    try {
      const input: RhOrdensPagamentoListarInput = {
        estado: (filtrosOrdem.estado || undefined) as "ABERTA" | "ENVIADA" | "CONCLUIDA" | "CANCELADA" | undefined,
        skip: skipOrdem,
        take: TAKE,
      };
      const resp = await rhApi.pagamentos.ordens.listar(input);
      if (resp.success) setPaginaOrdens(resp.data);
      else { setPaginaOrdens({ total: 0, items: [] }); toast.error("Erro ao carregar ordens", { description: resp.error?.message }); }
    } catch {
      setPaginaOrdens({ total: 0, items: [] });
      toast.error("Erro inesperado ao carregar ordens.");
    } finally {
      setCarregando(false);
    }
  }, [filtrosOrdem, skipOrdem]);

  useEffect(() => { void carregarOrdens(); }, [carregarOrdens]);

  // Carregar pagamentos
  const carregarPagamentos = useCallback(async () => {
    setCarregando(true);
    try {
      const input: RhPagamentosListarInput = {
        estado: (filtrosPag.estado || undefined) as "PENDENTE" | "PARCIAL" | "PAGO" | "ESTORNADO" | "CANCELADO" | undefined,
        formaPagamento: (filtrosPag.formaPagamento || undefined) as "TRANSFERENCIA" | "NUMERARIO" | "CHEQUE" | undefined,
        funcionarioId: filtrosPag.funcionarioId || undefined,
        ordemId: filtrosPag.ordemId || undefined,
        skip: skipPag,
        take: TAKE,
      };
      const resp = await rhApi.pagamentos.listar(input);
      if (resp.success) setPaginaPags(resp.data);
      else { setPaginaPags({ total: 0, items: [] }); toast.error("Erro ao carregar pagamentos", { description: resp.error?.message }); }
    } catch {
      setPaginaPags({ total: 0, items: [] });
      toast.error("Erro inesperado ao carregar pagamentos.");
    } finally {
      setCarregando(false);
    }
  }, [filtrosPag, skipPag]);

  useEffect(() => { void carregarPagamentos(); }, [carregarPagamentos]);

  const abrirDetalheOrdem = async (id: string) => {
    try {
      const resp = await rhApi.pagamentos.ordens.obter(id);
      if (resp.success) {
        setDetalheOrdem(resp.data);
        setDetalheOrdemAberto(true);
      } else toast.error("Erro ao carregar detalhe da ordem", { description: resp.error?.message });
    } catch { toast.error("Erro inesperado ao carregar detalhe da ordem."); }
  };

  const gerarFicheiro = async (id: string) => {
    try {
      const resp = await rhApi.pagamentos.ordens.gerarFicheiro(id);
      if (resp.success) {
        setFicheiroConteudo(resp.data);
        setFicheiroAberto(true);
      } else toast.error("Erro ao gerar ficheiro", { description: resp.error?.message });
    } catch { toast.error("Erro inesperado ao gerar ficheiro."); }
  };

  const downloadFicheiro = () => {
    if (!ficheiroConteudo) return;
    const blob = new Blob([ficheiroConteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ordem-pagamento-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCriarOrdem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pagamentosParaOrdem.length === 0) {
      toast.error("Seleccione pelo menos um pagamento.");
      return;
    }
    const formas = new Set(pagamentosParaOrdem.map((p) => p.formaPagamento));
    if (formas.size > 1) {
      toast.error("Todos os pagamentos devem ter a mesma forma de pagamento.");
      return;
    }
    if (formas.has("TRANSFERENCIA") && !ficheiroConteudo) {
      toast.error("Banco é obrigatório para transferências.");
      return;
    }

    setACriarOrdem(true);
    try {
      const input: RhOrdemPagamentoCriarInput = {
        empresaId: undefined,
        periodoId: undefined,
        banco: undefined,
        formaPagamento: pagamentosParaOrdem[0].formaPagamento as "TRANSFERENCIA" | "NUMERARIO" | "CHEQUE",
        pagamentoIds: pagamentosParaOrdem.map((p) => p.id),
      };
      const resp = await rhApi.pagamentos.ordens.criar(input);
      if (resp.success) {
        toast.success(`Ordem #${resp.data.numero} criada com ${pagamentosParaOrdem.length} pagamento(s).`);
        setCriarOrdemAberto(false);
        setPagamentosParaOrdem([]);
        void carregarOrdens();
      } else toast.error("Erro ao criar ordem", { description: resp.error?.message });
    } catch { toast.error("Erro inesperado ao criar ordem."); } finally { setACriarOrdem(false); }
  };

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagamentoConfirmar) return;
    const valor = Number(valorConfirmar);
    if (!valor || valor <= 0) { toast.error("Indique um valor válido."); return; }
    const pendente = Number(pagamentoConfirmar.valor) - Number(pagamentoConfirmar.valorPago);
    if (valor > pendente) { toast.error("Valor excede o pendente."); return; }

    setAConfirmar(true);
    try {
      const input: RhPagamentoConfirmarInput = {
        empresaId: undefined,
        pagamentoId: pagamentoConfirmar.id,
        valorPago: valor,
        dataPagamento: new Date(dataConfirmar),
        referencia: refConfirmar || undefined,
      };
      const resp = await rhApi.pagamentos.confirmar(input);
      if (resp.success) {
        toast.success("Pagamento confirmado.");
        setConfirmarAberto(false);
        void carregarPagamentos();
        if (aba === "ordens") void carregarOrdens();
      } else toast.error("Erro ao confirmar", { description: resp.error?.message });
    } catch { toast.error("Erro inesperado ao confirmar."); } finally { setAConfirmar(false); }
  };

  const handleEstornar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagamentoEstornar) return;
    if (!motivoEstornar.trim() || motivoEstornar.trim().length < 3) { toast.error("Motivo mínimo 3 caracteres."); return; }

    setAEstornar(true);
    try {
      const input: RhPagamentoEstornarInput = {
        empresaId: undefined,
        pagamentoId: pagamentoEstornar.id,
        motivo: motivoEstornar.trim(),
      };
      const resp = await rhApi.pagamentos.estornar(input);
      if (resp.success) {
        toast.success("Pagamento estornado.");
        setEstornarAberto(false);
        void carregarPagamentos();
        if (aba === "ordens") void carregarOrdens();
      } else toast.error("Erro ao estornar", { description: resp.error?.message });
    } catch { toast.error("Erro inesperado ao estornar."); } finally { setAEstornar(false); }
  };

  const pagamentosPendentes = () =>
    paginaPags.items.filter((p) => ["PENDENTE", "PARCIAL"].includes(p.estado));

  const totalOrdens = paginaOrdens.total;
  const temAntOrdens = skipOrdem > 0;
  const temProxOrdens = skipOrdem + TAKE < totalOrdens;

  const totalPags = paginaPags.total;
  const inicioPags = totalPags === 0 ? 0 : skipPag + 1;
  const fimPags = skipPag + paginaPags.items.length;
  const temAntPags = skipPag > 0;
  const temProxPags = skipPag + TAKE < totalPags;

  return (
    <div className="space-y-4" data-testid="rh-pagamentos">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            aba === "ordens"
              ? "bg-card text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setAba("ordens")}
        >
          Ordens de Pagamento
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            aba === "pagamentos"
              ? "bg-card text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setAba("pagamentos")}
        >
          Pagamentos
        </button>
      </div>

      {aba === "ordens" && (
        <div className="space-y-4">
          {/* Filtros Ordens */}
          <div className="flex flex-wrap items-end gap-4 bg-card border border-border rounded-xl p-4 shadow-[var(--shadow-card)]">
            <div>
              <Label htmlFor="ord-estado" className="mb-1 block">Estado</Label>
              <Select value={filtrosOrdem.estado || "TODOS"} onValueChange={(v) => setFiltrosOrdem({ ...filtrosOrdem, estado: v === "TODOS" ? "" : v })}>
                <SelectTrigger id="ord-estado" className="w-48"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="ABERTA">Aberta</SelectItem>
                  <SelectItem value="ENVIADA">Enviada</SelectItem>
                  <SelectItem value="CONCLUIDA">Concluída</SelectItem>
                  <SelectItem value="CANCELADA">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => void carregarOrdens()} disabled={carregando} className="h-9 gap-2">
              {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualizar
            </Button>
          </div>

          {/* Grid Ordens */}
          <div className="rounded-lg border border-border bg-card">
            {carregando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">A carregar ordens…</p>
              </div>
            ) : paginaOrdens.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-muted-foreground">
                <FileText className="h-8 w-8 opacity-40" />
                <p className="text-sm font-medium text-foreground">Sem ordens de pagamento</p>
                <p className="max-w-md text-xs">Não existem ordens para os filtros seleccionados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Nº</th>
                      <th className="px-3 py-2 text-left font-medium">Banco</th>
                      <th className="px-3 py-2 text-left font-medium">Forma</th>
                      <th className="px-3 py-2 text-left font-medium">Estado</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-center font-medium">Pagamentos</th>
                      <th className="px-3 py-2 text-left font-medium">Criada em</th>
                      <th className="px-3 py-2 text-right font-medium">Acções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginaOrdens.items.map((o) => (
                      <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">#{o.numero}</td>
                        <td className="px-3 py-2 text-xs">{o.banco ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{FORMA_PAG_LABEL[o.formaPagamento]}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            o.estado === "ABERTA" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : o.estado === "ENVIADA" ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
                            : o.estado === "CONCLUIDA" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                          }`}>
                            {ESTADO_ORDEM_LABEL[o.estado]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(o.totalValor) || 0)}</td>
                        <td className="px-3 py-2 text-center text-xs">{o.pagamentosCount}</td>
                        <td className="px-3 py-2 text-xs">{data(o.createdAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => abrirDetalheOrdem(o.id)} className="gap-1">
                            <Eye className="h-4 w-4" /> Detalhe
                          </Button>
                          {o.estado === "ABERTA" && o.formaPagamento === "TRANSFERENCIA" && (
                            <Button variant="ghost" size="sm" onClick={() => gerarFicheiro(o.id)} disabled={carregando} className="gap-1">
                              <Download className="h-4 w-4" /> Ficheiro
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {paginaOrdens.items.length > 0 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <Button variant="outline" size="sm" disabled={!temAntOrdens || carregando} onClick={() => setSkipOrdem((s) => Math.max(0, s - TAKE))}>Anterior</Button>
                <span className="text-xs text-muted-foreground">Página {Math.floor(skipOrdem / TAKE) + 1} de {Math.max(1, Math.ceil(totalOrdens / TAKE))}</span>
                <Button variant="outline" size="sm" disabled={!temProxOrdens || carregando} onClick={() => setSkipOrdem((s) => s + TAKE)}>Seguinte</Button>
              </div>
            )}
          </div>

          {/* Botão Criar Ordem */}
          <Button onClick={() => { setPagamentosParaOrdem(pagamentosPendentes()); setCriarOrdemAberto(true); }} disabled={pagamentosPendentes().length === 0} className="gap-2">
            <Plus className="w-4 h-4" /> Criar Ordem de Pagamento
          </Button>
        </div>
      )}

      {aba === "pagamentos" && (
        <div className="space-y-4">
          {/* Filtros Pagamentos */}
<form className="space-y-4 rounded-lg border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); void carregarPagamentos(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="pag-estado" className="mb-1 block">Estado</Label>
                <Select value={filtrosPag.estado || "TODOS"} onValueChange={(v) => setFiltrosPag({ ...filtrosPag, estado: v === "TODOS" ? "" : v })}>
                  <SelectTrigger id="pag-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PARCIAL">Parcial</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="ESTORNADO">Estornado</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pag-forma" className="mb-1 block">Forma</Label>
                <Select value={filtrosPag.formaPagamento || "TODOS"} onValueChange={(v) => setFiltrosPag({ ...filtrosPag, formaPagamento: v === "TODOS" ? "" : v })}>
                  <SelectTrigger id="pag-forma"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todas</SelectItem>
                    <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                    <SelectItem value="NUMERARIO">Numerário</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pag-func" className="mb-1 block">Funcionário</Label>
                <SearchSelect id="pag-func" placeholder="Todos…" options={funcionarios.map((f) => ({ value: f.id, label: `${f.codigo} - ${f.nome}` }))} value={filtrosPag.funcionarioId || undefined} onChange={(v) => setFiltrosPag({ ...filtrosPag, funcionarioId: v || "" })} allowClear />
              </div>
              <div className="lg:col-span-2">
                <Label htmlFor="pag-search" className="mb-1 block">Pesquisar</Label>
                <div className="flex gap-2">
                  <Input id="pag-search" value={buscaPag} onChange={(e) => setBuscaPag(e.target.value)} placeholder="Referência, funcionário…" />
                  <Button type="submit" variant="secondary"><Search className="mr-2 h-4 w-4" /> Procurar</Button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void carregarPagamentos()} disabled={carregando} className="gap-2">
                {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualizar
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {totalPags === 0 ? "Sem resultados" : `${inicioPags}–${fimPags} de ${totalPags} pagamento${totalPags === 1 ? "" : "s"}`}
              </span>
            </div>
          </form>

          {/* Grid Pagamentos */}
          <div className="rounded-lg border border-border bg-card">
            {carregando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">A carregar pagamentos…</p>
              </div>
            ) : paginaPags.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-muted-foreground">
                <FileText className="h-8 w-8 opacity-40" />
                <p className="text-sm font-medium text-foreground">Sem pagamentos</p>
                <p className="max-w-md text-xs">Não existem pagamentos para os filtros seleccionados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Processamento</th>
                      <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                      <th className="px-3 py-2 text-left font-medium">Nome</th>
                      <th className="px-3 py-2 text-left font-medium">Forma</th>
                      <th className="px-3 py-2 text-left font-medium">Ordem</th>
                      <th className="px-3 py-2 text-left font-medium">Data Pag.</th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                      <th className="px-3 py-2 text-right font-medium">Pago</th>
                      <th className="px-3 py-2 text-right font-medium">Pendente</th>
                      <th className="px-3 py-2 text-left font-medium">Estado</th>
                      <th className="px-3 py-2 text-right font-medium">Acções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginaPags.items.map((p) => (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{p.processamento.tipo} #{p.processamento.sequencia} · {p.processamento.periodo.codigo}/{p.processamento.periodo.ano}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.funcionario.codigo}</td>
                        <td className="px-3 py-2">{p.funcionario.nome}</td>
                        <td className="px-3 py-2 text-xs">{FORMA_PAG_LABEL[p.formaPagamento]}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.ordemId ? `#${p.ordemId.slice(0, 8)}` : "—"}</td>
                        <td className="px-3 py-2 text-xs">{p.dataPagamento ? data(p.dataPagamento) : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valor) || 0)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valorPago) || 0)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valor) - Number(p.valorPago))}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            p.estado === "PAGO" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : p.estado === "PARCIAL" ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
                            : p.estado === "PENDENTE" ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                          }`}>
                            {ESTADO_PAG_LABEL[p.estado]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {["PENDENTE", "PARCIAL"].includes(p.estado) && (
                            <Button variant="ghost" size="sm" onClick={() => { setPagamentoConfirmar(p); setValorConfirmar((Number(p.valor) - Number(p.valorPago)).toFixed(2)); setDataConfirmar(new Date().toISOString().slice(0, 10)); setRefConfirmar(""); setConfirmarAberto(true); }} className="gap-1">
                              <CheckCircle2 className="h-4 w-4" /> Confirmar
                            </Button>
                          )}
                          {["PAGO", "PARCIAL"].includes(p.estado) && (
                            <Button variant="ghost" size="sm" onClick={() => { setPagamentoEstornar(p); setMotivoEstornar(""); setEstornarAberto(true); }} className="gap-1 ml-1">
                              <XCircle className="h-4 w-4" /> Estornar
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { /* detalhe */ }} className="gap-1 ml-1">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {paginaPags.items.length > 0 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <Button variant="outline" size="sm" disabled={!temAntPags || carregando} onClick={() => setSkipPag((s) => Math.max(0, s - TAKE))}>Anterior</Button>
                <span className="text-xs text-muted-foreground">Página {Math.floor(skipPag / TAKE) + 1} de {Math.max(1, Math.ceil(totalPags / TAKE))}</span>
                <Button variant="outline" size="sm" disabled={!temProxPags || carregando} onClick={() => setSkipPag((s) => s + TAKE)}>Seguinte</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detalhe Ordem Dialog */}
      <Dialog open={detalheOrdemAberto} onOpenChange={setDetalheOrdemAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Ordem de Pagamento #{detalheOrdem?.numero}</DialogTitle>
            <DialogDescription>Detalhe da ordem e pagamentos incluídos.</DialogDescription>
          </DialogHeader>
          {detalheOrdem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Nº Ordem</p><p className="mt-1 font-mono text-lg font-semibold">#{detalheOrdem.numero}</p></div>
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Banco</p><p className="mt-1 font-mono text-lg font-semibold">{detalheOrdem.banco ?? "—"}</p></div>
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Forma</p><p className="mt-1 font-medium">{FORMA_PAG_LABEL[detalheOrdem.formaPagamento]}</p></div>
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Estado</p><p className="mt-1 font-medium">{ESTADO_ORDEM_LABEL[detalheOrdem.estado]}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-mono text-lg font-semibold">{fmtMoeda.format(Number(detalheOrdem.totalValor) || 0)}</p></div>
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Pagamentos</p><p className="mt-1 font-mono text-lg font-semibold">{detalheOrdem.pagamentosCount}</p></div>
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Criada em</p><p className="mt-1 font-mono text-sm">{data(detalheOrdem.createdAt)}</p></div>
                <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Ficheiro</p><p className="mt-1 font-mono text-sm text-xs truncate">{detalheOrdem.ficheiroPath ?? "—"}</p></div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Pagamentos incluídos</h3>
                {detalheOrdem.pagamentos.length > 0 ? (
                  <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                          <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                          <th className="px-3 py-2 text-right font-medium">Valor</th>
                          <th className="px-3 py-2 text-right font-medium">Pago</th>
                          <th className="px-3 py-2 text-left font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalheOrdem.pagamentos.map((p) => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs">{p.id.slice(0, 8)}</td>
                            <td className="px-3 py-2">{p.funcionario.nome} ({p.funcionario.codigo})</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valor) || 0)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valorPago) || 0)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${p.estado === "PAGO" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : p.estado === "PARCIAL" ? "border-blue-500/30 bg-blue-500/10 text-blue-600" : "border-amber-500/30 bg-amber-500/10 text-amber-600"}`}>
                                {ESTADO_PAG_LABEL[p.estado]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sem pagamentos.</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetalheOrdemAberto(false)}>Fechar</Button>
            {detalheOrdem?.estado === "ABERTA" && detalheOrdem.formaPagamento === "TRANSFERENCIA" && (
              <Button onClick={() => { gerarFicheiro(detalheOrdem!.id); setDetalheOrdemAberto(false); }} variant="secondary">
                <Download className="mr-2 h-4 w-4" /> Gerar Ficheiro Transferência
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Criar Ordem Dialog */}
      <Dialog open={criarOrdemAberto} onOpenChange={setCriarOrdemAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar Ordem de Pagamento</DialogTitle>
            <DialogDescription>Selecione os pagamentos pendentes a incluir na ordem.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCriarOrdem} className="space-y-4">
            {pagamentosParaOrdem.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento pendente disponível.</p>
            ) : (
              <div className="max-h-[40vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                      <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                      <th className="px-3 py-2 text-right font-medium">Pendente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentosParaOrdem.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{p.processamento.tipo} #{p.processamento.sequencia}</td>
                        <td className="px-3 py-2">{p.funcionario.nome} ({p.funcionario.codigo})</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valor) || 0)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoeda.format(Number(p.valor) - Number(p.valorPago))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Total a pagar: {fmtMoeda.format(pagamentosParaOrdem.reduce((a, p) => a + (Number(p.valor) - Number(p.valorPago)), 0))}</p>
              <p className="text-xs text-muted-foreground">Forma de pagamento: {FORMA_PAG_LABEL[pagamentosParaOrdem[0]?.formaPagamento]}</p>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriarOrdemAberto(false)}>Cancelar</Button>
            <Button type="submit" form={undefined} onClick={handleCriarOrdem} disabled={aCriarOrdem || pagamentosParaOrdem.length === 0}>
              {aCriarOrdem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar Ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ficheiro Dialog */}
      <Dialog open={ficheiroAberto} onOpenChange={setFicheiroAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ficheiro de Transferência</DialogTitle>
            <DialogDescription>Conteúdo do ficheiro CSV gerado.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/10 p-4 font-mono text-xs">
            <pre>{ficheiroConteudo}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFicheiroAberto(false)}>Fechar</Button>
            <Button onClick={downloadFicheiro}><Download className="mr-2 h-4 w-4" /> Descarregar CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar Pagamento Dialog */}
      <Dialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>Pagamento de {pagamentoConfirmar?.funcionario?.nome} ({pagamentoConfirmar?.funcionario?.codigo})</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmar} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Valor pendente</Label>
                <p className="font-mono text-lg font-semibold">{pagamentoConfirmar ? fmtMoeda.format(Number(pagamentoConfirmar!.valor) - Number(pagamentoConfirmar!.valorPago)) : "—"}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valor-conf" className="text-xs font-semibold">Valor a pagar <span className="text-destructive">*</span></Label>
                <Input id="valor-conf" type="number" step="0.01" min="0.01" value={valorConfirmar} onChange={(e) => setValorConfirmar(e.target.value)} className="h-9 text-sm font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-conf" className="text-xs font-semibold">Data <span className="text-destructive">*</span></Label>
                <Input id="data-conf" type="date" value={dataConfirmar} onChange={(e) => setDataConfirmar(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ref-conf" className="text-xs font-semibold">Referência</Label>
                <Input id="ref-conf" value={refConfirmar} onChange={(e) => setRefConfirmar(e.target.value)} className="h-9 text-sm" placeholder="Opcional" />
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarAberto(false)}>Cancelar</Button>
            <Button type="submit" form={undefined} onClick={handleConfirmar} disabled={aConfirmar}>
              {aConfirmar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estornar Pagamento Dialog */}
      <Dialog open={estornarAberto} onOpenChange={setEstornarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> Estornar Pagamento</DialogTitle>
            <DialogDescription>Pagamento de {pagamentoEstornar?.funcionario?.nome} ({pagamentoEstornar?.funcionario?.codigo})</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEstornar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-est" className="text-xs font-semibold">Motivo do estorno <span className="text-destructive">*</span></Label>
              <textarea id="motivo-est" value={motivoEstornar} onChange={(e) => setMotivoEstornar(e.target.value)} rows={3} className="w-full text-xs rounded-md border border-border bg-transparent px-3 py-2 resize-y" placeholder="Mínimo 3 caracteres." />
              <p className="text-xs text-muted-foreground">{motivoEstornar.length}/500 caracteres · obrigatório para auditoria.</p>
            </div>
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Esta operação cria um movimento inverso em tesouraria e marca o pagamento como ESTORNADO.</span>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstornarAberto(false)}>Cancelar</Button>
            <Button type="submit" form={undefined} onClick={handleEstornar} disabled={aEstornar} variant="destructive">
              {aEstornar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Estornar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}