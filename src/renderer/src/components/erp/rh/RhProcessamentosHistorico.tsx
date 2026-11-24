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
  Ban,
  Eye,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import type {
  RhFuncionarioListaDto,
  RhProcessamentoDetalheDto,
  RhProcessamentoHistoricoPaginaDto,
  RhProcessamentoResumoDto,
} from "@/@types/electron";
import { ABREV_TIPO, ROTULO_TIPO, TIPOS_PROCESSAMENTO } from "./rh-processamento-tipos";
import { RhProcessamentoDetalheDialog } from "./RhProcessamentoDetalheDialog";
import { RhAnularDialog } from "./RhAnularDialog";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });
const fmtData = new Intl.DateTimeFormat("pt-AO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TAKE = 25;

const ANOS_DISPONIVEIS = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);
const PERIODOS = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`);

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

function data(valor: string | Date): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : fmtData.format(d);
}

function decodificar(value: string): string {
  return value === TODOS ? "" : value;
}

export function RhProcessamentosHistorico() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [busca, setBusca] = useState("");
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<RhProcessamentoHistoricoPaginaDto>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);

  const [funcionarios, setFuncionarios] = useState<RhFuncionarioListaDto[]>([]);

  const [detalheAberto, setDetalheAberto] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [anularAberto, setAnularAberto] = useState(false);
  const [anularAlvo, setAnularAlvo] = useState<RhProcessamentoResumoDto[]>([]);

  const carregarFuncionarios = useCallback(async () => {
    try {
      const resp = await rhApi.funcionarios.listar({ take: 500 });
      if (resp.success) setFuncionarios(resp.data.items);
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
      const resp = await rhApi.processamento.historico({
        ano: filtros.ano ? Number(filtros.ano) : undefined,
        periodoCodigo: filtros.periodoCodigo || undefined,
        tipo: (filtros.tipo || undefined) as
          | "VENCIMENTO"
          | "SUBSIDIO_FERIAS"
          | "SUBSIDIO_NATAL"
          | "EXTRAORDINARIO"
          | "FIM_CONTRATO"
          | undefined,
        estado: (filtros.estado || undefined) as "PROCESSADO" | "ANULADO" | undefined,
        funcionarioId: filtros.funcionarioId || undefined,
        search: filtros.search || undefined,
        skip,
        take: TAKE,
      });
      if (resp.success) {
        setPagina(resp.data);
      } else {
        setPagina({ total: 0, items: [] });
        toast.error(resp.error?.message || "Erro ao carregar o histórico.");
      }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error("Erro inesperado ao carregar o histórico.");
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

  const abrirDetalhe = (id: string) => {
    setDetalheId(id);
    setDetalheAberto(true);
  };

  const anularDoDetalhe = (detalhe: RhProcessamentoDetalheDto) => {
    setDetalheAberto(false);
    setAnularAlvo([detalhe]);
    setAnularAberto(true);
  };

  const totalPagina = pagina.total;
  const inicio = totalPagina === 0 ? 0 : skip + 1;
  const fim = skip + pagina.items.length;
  const temAnterior = skip > 0;
  const temProximo = skip + TAKE < totalPagina;

  return (
    <div className="space-y-4" data-testid="rh-processamentos-historico">
      {/* Filtros */}
      <form className="space-y-4 rounded-lg border border-border bg-card p-4" onSubmit={aplicarBusca}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="hist-ano" className="mb-1 block">
              Ano
            </Label>
            <Select value={filtros.ano || TODOS} onValueChange={(v) => atualizarFiltro("ano", decodificar(v))}>
              <SelectTrigger id="hist-ano">
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
            <Label htmlFor="hist-periodo" className="mb-1 block">
              Período
            </Label>
            <Select
              value={filtros.periodoCodigo || TODOS}
              onValueChange={(v) => atualizarFiltro("periodoCodigo", decodificar(v))}
            >
              <SelectTrigger id="hist-periodo">
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
            <Label htmlFor="hist-tipo" className="mb-1 block">
              Tipo
            </Label>
            <Select value={filtros.tipo || TODOS} onValueChange={(v) => atualizarFiltro("tipo", decodificar(v))}>
              <SelectTrigger id="hist-tipo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                {TIPOS_PROCESSAMENTO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="hist-estado" className="mb-1 block">
              Estado
            </Label>
            <Select
              value={filtros.estado || TODOS}
              onValueChange={(v) => atualizarFiltro("estado", decodificar(v))}
            >
              <SelectTrigger id="hist-estado">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os estados</SelectItem>
                <SelectItem value="PROCESSADO">Processado</SelectItem>
                <SelectItem value="ANULADO">Anulado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="hist-funcionario" className="mb-1 block">
              Funcionário
            </Label>
            <SearchSelect
              id="hist-funcionario"
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
            <Label htmlFor="hist-search" className="mb-1 block">
              Pesquisar
            </Label>
            <div className="flex gap-2">
              <Input
                id="hist-search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Código ou nome do funcionário…"
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
            <FilterX className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {totalPagina === 0
              ? "Sem resultados"
              : `${inicio}–${fim} de ${totalPagina} processamento${totalPagina === 1 ? "" : "s"}`}
          </span>
        </div>
      </form>

      {/* Grelha */}
      <div className="rounded-lg border border-border bg-card">
        {carregando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">A carregar processamentos…</p>
          </div>
        ) : pagina.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-muted-foreground">
            <Users className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium text-foreground">Sem processamentos</p>
            <p className="max-w-md text-xs">
              Não existem processamentos para os filtros selecionados. Ajuste os filtros e volte a
              actualizar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-left font-medium">Período</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Modo</th>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                  <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  <th className="px-3 py-2 text-left font-medium">Recibo</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Acções</th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/30"
                    onClick={() => abrirDetalhe(p.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{p.codigo ?? "—"}</td>
                    <td className="px-3 py-2">{p.nome ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.periodoCodigo}/{p.ano}
                    </td>
                    <td className="px-3 py-2 text-xs" title={ROTULO_TIPO[p.tipo]}>
                      {ABREV_TIPO[p.tipo]}
                      {p.sequencia > 1 ? ` #${p.sequencia}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs">{p.modo === "INDIVIDUAL" ? "Individual" : "Lote"}</td>
                    <td className="px-3 py-2 text-xs">{data(p.dataProcessamento)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtMoeda.format(Number(p.liquido) || 0)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.reciboNumero !== null ? `Nº ${p.reciboNumero}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {p.jaAnulado ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                          title={p.motivoAnulacao ?? undefined}
                        >
                          <Ban className="h-3 w-3" /> Anulado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                          Processado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirDetalhe(p.id);
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Detalhe
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

      <RhProcessamentoDetalheDialog
        aberto={detalheAberto}
        onOpenChange={setDetalheAberto}
        processamentoId={detalheId}
        onAnular={anularDoDetalhe}
      />

      <RhAnularDialog
        aberto={anularAberto}
        onOpenChange={setAnularAberto}
        processamentos={anularAlvo}
        onConcluido={() => {
          void carregar();
        }}
      />
    </div>
  );
}
