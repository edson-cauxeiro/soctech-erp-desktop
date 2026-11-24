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
  Eye,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import type {
  RhReciboResumoDto,
  RhRecibosPaginaDto,
  RhRecibosListarInput,
} from "@/@types/electron";
import { ROTULO_TIPO, ABREV_TIPO } from "./rh-processamento-tipos";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });
const fmtData = new Intl.DateTimeFormat("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric" });
const TAKE = 25;

const TODOS = "TODOS";

interface Filtros {
  ano: string;
  periodoCodigo: string;
  tipo: string;
  estado: string;
  funcionarioId: string;
  search: string;
}

const FILTROS_INICIAIS: Filtros = {
  ano: "",
  periodoCodigo: "",
  tipo: "",
  estado: "",
  funcionarioId: "",
  search: "",
};

const ANOS_DISPONIVEIS = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);
const PERIODOS = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`);

function data(valor: string | Date): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : fmtData.format(d);
}

function decodificar(value: string): string {
  return value === TODOS ? "" : value;
}

export function RhRecibosManager() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [busca, setBusca] = useState("");
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<RhRecibosPaginaDto>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<{ id: string; codigo: string; nome: string }[]>([]);

  const carregarFuncionarios = useCallback(async () => {
    try {
      const resp = await rhApi.funcionarios.listar({ take: 500 });
      if (resp.success) setFuncionarios(resp.data.items.map(f => ({ id: f.id, codigo: f.codigo, nome: f.nome })));
    } catch {
      setFuncionarios([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
  }, [carregarFuncionarios]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const input: RhRecibosListarInput = {
        ano: filtros.ano ? Number(filtros.ano) : undefined,
        periodoCodigo: filtros.periodoCodigo || undefined,
        tipo: (filtros.tipo || undefined) as
          | "VENCIMENTO"
          | "SUBSIDIO_FERIAS"
          | "SUBSIDIO_NATAL"
          | "EXTRAORDINARIO"
          | "FIM_CONTRATO"
          | undefined,
        estado: (filtros.estado || undefined) as "EMITIDO" | "ANULADO" | undefined,
        funcionarioId: filtros.funcionarioId || undefined,
        search: filtros.search || undefined,
        skip,
        take: TAKE,
      };
      const resp = await rhApi.recibos.listar(input);
      if (resp.success) {
        setPagina(resp.data);
      } else {
        setPagina({ total: 0, items: [] });
        toast.error(resp.error?.message || "Erro ao carregar recibos.");
      }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error("Erro inesperado ao carregar recibos.");
    } finally {
      setCarregando(false);
    }
  }, [filtros, skip]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizarFiltro = (chave: keyof Filtros, valor: string) => {
    setSkip(0);
    setFiltros((atual) => ({ ...atual, [chave]: valor }));
  };

  const aplicarBusca = (e: React.FormEvent) => {
    e.preventDefault();
    setSkip(0);
    setFiltros((atual) => ({ ...atual, search: busca.trim() }));
  };

  const limpar = () => {
    setBusca("");
    setSkip(0);
    setFiltros(FILTROS_INICIAIS);
  };

  const verPdf = async (recibo: RhReciboResumoDto) => {
    try {
      const resp = await rhApi.recibos.gerarPdf({ reciboIds: [recibo.id] });
      if (resp.success) {
        const blob = new Blob([resp.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        void rhApi.recibos.registarImpressao(recibo.id);
      } else {
        toast.error(resp.error?.message || "Erro ao gerar PDF.");
      }
    } catch {
      toast.error("Erro inesperado ao gerar PDF.");
    }
  };

  const verPdfLote = async () => {
    const selecionados = pagina.items.filter((r) => r.estado === "EMITIDO");
    if (selecionados.length === 0) {
      toast.error("Nenhum recibo emitido selecionado.");
      return;
    }
    try {
      const resp = await rhApi.recibos.gerarPdf({ reciboIds: selecionados.map((r) => r.id) });
      if (resp.success) {
        const blob = new Blob([resp.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        for (const r of selecionados) void rhApi.recibos.registarImpressao(r.id);
      } else {
        toast.error(resp.error?.message || "Erro ao gerar PDF em lote.");
      }
    } catch {
      toast.error("Erro inesperado ao gerar PDF em lote.");
    }
  };

  const totalPagina = pagina.total;
  const inicio = totalPagina === 0 ? 0 : skip + 1;
  const fim = skip + pagina.items.length;
  const temAnterior = skip > 0;
  const temProximo = skip + TAKE < totalPagina;

  return (
    <div className="space-y-4" data-testid="rh-recibos">
      {/* Filtros */}
      <form className="space-y-4 rounded-lg border border-border bg-card p-4" onSubmit={aplicarBusca}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="rec-ano" className="mb-1 block">
              Ano
            </Label>
            <Select value={filtros.ano || TODOS} onValueChange={(v) => atualizarFiltro("ano", decodificar(v))}>
              <SelectTrigger id="rec-ano">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os anos</SelectItem>
                {ANOS_DISPONIVEIS.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rec-periodo" className="mb-1 block">
              Período
            </Label>
            <Select
              value={filtros.periodoCodigo || TODOS}
              onValueChange={(v) => atualizarFiltro("periodoCodigo", decodificar(v))}
            >
              <SelectTrigger id="rec-periodo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os períodos</SelectItem>
                {PERIODOS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rec-tipo" className="mb-1 block">
              Tipo
            </Label>
            <Select value={filtros.tipo || TODOS} onValueChange={(v) => atualizarFiltro("tipo", decodificar(v))}>
              <SelectTrigger id="rec-tipo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                {Object.entries(ROTULO_TIPO).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rec-estado" className="mb-1 block">
              Estado
            </Label>
            <Select
              value={filtros.estado || TODOS}
              onValueChange={(v) => atualizarFiltro("estado", decodificar(v))}
            >
              <SelectTrigger id="rec-estado">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                <SelectItem value="EMITIDO">Emitido</SelectItem>
                <SelectItem value="ANULADO">Anulado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="rec-funcionario" className="mb-1 block">
              Funcionário
            </Label>
            <SearchSelect
              id="rec-funcionario"
              placeholder="Todos os funcionários…"
              options={funcionarios.map((f) => ({
                value: f.id,
                label: `${f.codigo} - ${f.nome}`,
              }))}
              value={filtros.funcionarioId || undefined}
              onChange={(v) => atualizarFiltro("funcionarioId", v || "")}
              allowClear
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="rec-search" className="mb-1 block">
              Pesquisar
            </Label>
            <div className="flex gap-2">
              <Input
                id="rec-search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Código, nome ou número recibo…"
              />
              <Button type="submit" variant="secondary">
                <Search className="mr-2 h-4 w-4" />
                Procurar
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Actualizar
          </Button>
          <Button type="button" variant="ghost" onClick={limpar}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {totalPagina === 0
              ? "Sem resultados"
              : `${inicio}–${fim} de ${totalPagina} recibo${totalPagina === 1 ? "" : "s"}`}
          </span>
        </div>
      </form>

      {/* Grelha */}
      <div className="rounded-lg border border-border bg-card">
        {carregando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">A carregar recibos…</p>
          </div>
        ) : pagina.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-muted-foreground">
            <FileText className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium text-foreground">Sem recibos</p>
            <p className="max-w-md text-xs">
              Não existem recibos para os filtros selecionados. Ajuste os filtros e volte a
              actualizar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Recibo</th>
                  <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium">Período</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Data Emissão</th>
                  <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                  <th className="px-3 py-2 text-left font-medium">Impressões</th>
                  <th className="px-3 py-2 text-right font-medium">Acções</th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.serie}/{r.ano}/{String(r.numero).padStart(4, "0")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.processamento.funcionario.codigo ?? "—"}</td>
                    <td className="px-3 py-2">{r.processamento.funcionario.nome ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.processamento.periodo.codigo}/{r.processamento.periodo.ano}
                    </td>
                    <td className="px-3 py-2 text-xs" title={ROTULO_TIPO[r.processamento.tipo]}>
                      {ABREV_TIPO[r.processamento.tipo]}
                    </td>
                    <td className="px-3 py-2 text-xs">{data(r.emitidoEm)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtMoeda.format(Number(r.processamento.liquido) || 0)}
                    </td>
                    <td className="px-3 py-2">
                      {r.estado === "ANULADO" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          Anulado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                          Emitido
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-mono">{r.impressoes}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => verPdf(r)}
                        disabled={r.estado === "ANULADO"}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Ver
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          verPdf(r);
                        }}
                        disabled={r.estado === "ANULADO"}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagina.items.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => verPdfLote()}
                disabled={!pagina.items.some((r) => r.estado === "EMITIDO")}
              >
                <FileText className="mr-2 h-4 w-4" />
                PDF Lote (Emitidos)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  pagina.items.forEach((r) => {
                    if (r.estado === "EMITIDO") verPdf(r);
                  });
                }}
                disabled={!pagina.items.some((r) => r.estado === "EMITIDO")}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Lote
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!temAnterior || carregando}
              onClick={() => setSkip((s) => Math.max(0, s - TAKE))}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {Math.floor(skip / TAKE) + 1} de {Math.max(1, Math.ceil(totalPagina / TAKE))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!temProximo || carregando}
              onClick={() => setSkip((s) => s + TAKE)}
            >
              Seguinte
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}