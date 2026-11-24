import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Ban, Loader2, Search, Building2, Briefcase, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { FormSurface } from "@/components/erp/FormDialog";
import { rhApi } from "@/api/rh.api";
import type {
  IpcResponse,
  RhFiltroCadastroInput,
  RhPaginaDto,
  RhDepartamentoDto,
  RhCargoDto,
  RhTipoAusenciaDto,
} from "@/@types/electron";

type Sub = "departamentos" | "cargos" | "tipos-ausencia";
type Registo = RhDepartamentoDto | RhCargoDto | RhTipoAusenciaDto;

interface CampoBooleano {
  key: string;
  label: string;
  padrao: boolean;
}

interface ConfigCadastro {
  sub: Sub;
  titulo: string;
  icone: React.ReactNode;
  labelNome: string;
  keyNome: "nome" | "descricao";
  booleanos: CampoBooleano[];
  listar: (f?: RhFiltroCadastroInput) => Promise<IpcResponse<RhPaginaDto<Registo>>>;
  criar: (d: Record<string, unknown>) => Promise<IpcResponse<Registo>>;
  atualizar: (d: Record<string, unknown> & { id: string }) => Promise<IpcResponse<Registo>>;
  inativar: (id: string) => Promise<IpcResponse<Registo>>;
}

const CONFIGS: Record<Sub, ConfigCadastro> = {
  departamentos: {
    sub: "departamentos",
    titulo: "Departamentos",
    icone: <Building2 className="w-5 h-5 text-primary" />,
    labelNome: "Nome",
    keyNome: "nome",
    booleanos: [],
    listar: rhApi.config.departamentos.listar,
    criar: (d) => rhApi.config.departamentos.criar(d as never),
    atualizar: (d) => rhApi.config.departamentos.atualizar(d as never),
    inativar: rhApi.config.departamentos.inativar,
  },
  cargos: {
    sub: "cargos",
    titulo: "Cargos",
    icone: <Briefcase className="w-5 h-5 text-primary" />,
    labelNome: "Nome",
    keyNome: "nome",
    booleanos: [],
    listar: rhApi.config.cargos.listar,
    criar: (d) => rhApi.config.cargos.criar(d as never),
    atualizar: (d) => rhApi.config.cargos.atualizar(d as never),
    inativar: rhApi.config.cargos.inativar,
  },
  "tipos-ausencia": {
    sub: "tipos-ausencia",
    titulo: "Tipos de Ausência",
    icone: <CalendarOff className="w-5 h-5 text-primary" />,
    labelNome: "Descrição",
    keyNome: "descricao",
    booleanos: [
      { key: "justificada", label: "Justificada", padrao: true },
      { key: "descontaSalario", label: "Desconta salário", padrao: false },
      { key: "descontaSubsidioAlimentacao", label: "Desconta subsídio alimentação", padrao: false },
    ],
    listar: rhApi.config.tiposAusencia.listar,
    criar: (d) => rhApi.config.tiposAusencia.criar(d as never),
    atualizar: (d) => rhApi.config.tiposAusencia.atualizar(d as never),
    inativar: rhApi.config.tiposAusencia.inativar,
  },
};

const SUBS: Sub[] = ["departamentos", "cargos", "tipos-ausencia"];

function nomeDo(item: Registo): string {
  return "nome" in item ? item.nome : item.descricao;
}

export function RhCadastrosManager() {
  const [sub, setSub] = useState<Sub>("departamentos");
  const cfg = CONFIGS[sub];

  const [items, setItems] = useState<Registo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const booleanosVazios = useMemo(() => {
    const base: Record<string, boolean> = {};
    for (const b of cfg.booleanos) base[b.key] = b.padrao;
    return base;
  }, [cfg]);

  const limpar = () => {
    setCodigo("");
    setNome("");
    setAtivo(true);
    setFlags(booleanosVazios);
    setEditandoId(null);
  };

  const carregar = async () => {
    setIsLoading(true);
    try {
      const res = await cfg.listar({ take: 500 });
      if (res.success) setItems(res.data.items);
      else toast.error("Erro ao carregar registos", { description: res.error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    limpar();
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  const filtrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return items;
    return items.filter(
      (i) =>
        i.codigo.toLowerCase().includes(termo) || nomeDo(i).toLowerCase().includes(termo)
    );
  }, [items, filtro]);

  const editar = (item: Registo) => {
    setEditandoId(item.id);
    setCodigo(item.codigo);
    setNome(nomeDo(item));
    setAtivo(item.ativo);
    const novasFlags: Record<string, boolean> = {};
    for (const b of cfg.booleanos) {
      novasFlags[b.key] = Boolean((item as unknown as Record<string, unknown>)[b.key]);
    }
    setFlags(novasFlags);
  };

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !nome.trim()) {
      toast.error("Preencha o código e o nome.");
      return;
    }
    const payload: Record<string, unknown> = {
      codigo: codigo.trim().toUpperCase(),
      [cfg.keyNome]: nome.trim(),
      ativo,
      ...flags,
    };

    setIsSubmitting(true);
    try {
      const res = editandoId
        ? await cfg.atualizar({ id: editandoId, ...payload })
        : await cfg.criar(payload);
      if (res.success) {
        toast.success(editandoId ? "Registo atualizado." : "Registo criado.");
        limpar();
        carregar();
      } else {
        toast.error("Não foi possível guardar", { description: res.error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inativar = async (item: Registo) => {
    if (!confirm(`Inativar "${item.codigo} — ${nomeDo(item)}"?`)) return;
    const res = await cfg.inativar(item.id);
    if (res.success) {
      toast.success("Registo inativado.");
      if (editandoId === item.id) limpar();
      carregar();
    } else {
      toast.error("Não foi possível inativar", { description: res.error.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        {SUBS.map((s) => {
          const ativo2 = sub === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSub(s)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-md transition-colors cursor-pointer border-b-2 ${
                ativo2
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {CONFIGS[s].icone}
              {CONFIGS[s].titulo}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100dvh-14rem)]">
        <FormSurface
          className="lg:col-span-5 h-full shadow-[var(--shadow-card)]"
          title={editandoId ? `Editar ${cfg.titulo}` : "Novo registo"}
          headerActions={cfg.icone}
          bodyClassName="p-5"
        >
          <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Código <span className="text-destructive">*</span>
              </Label>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                className="h-9 text-sm font-mono font-bold"
                placeholder="COD01"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {cfg.labelNome} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="h-9 text-sm"
                placeholder={cfg.labelNome}
              />
            </div>
          </div>

          {cfg.booleanos.length > 0 && (
            <div className="space-y-2.5 pt-1">
              {cfg.booleanos.map((b) => (
                <label key={b.key} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <Checkbox
                    checked={Boolean(flags[b.key])}
                    onCheckedChange={(v) => setFlags((a) => ({ ...a, [b.key]: Boolean(v) }))}
                  />
                  {b.label}
                </label>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
            <Checkbox checked={ativo} onCheckedChange={(v) => setAtivo(Boolean(v))} />
            Ativo
          </label>

            </div>
            <div className="shrink-0 flex items-center gap-2 pt-4 border-t border-border">
            {editandoId && (
              <Button type="button" variant="outline" onClick={limpar} className="w-1/3 text-xs">
                Cancelar
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className={`${editandoId ? "w-2/3" : "w-full"} text-xs font-semibold flex items-center justify-center gap-2`}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editandoId ? "Guardar" : "Registar"}
            </Button>
          </div>
          </form>
        </FormSurface>

        <div className="lg:col-span-7 h-full min-h-0 overflow-y-auto bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              {cfg.icone}
              <h2 className="text-base font-bold text-foreground">{cfg.titulo} Registados</h2>
            </div>
            <span className="text-xs text-muted-foreground ml-auto">Total: {filtrados.length}</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-9 pl-8 text-xs"
              placeholder="Pesquisar..."
            />
          </div>

          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">A carregar...</span>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
              {cfg.icone}
              <p className="text-sm font-semibold">Sem registos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
                  <tr>
                    <th className="px-3 py-2.5">Código</th>
                    <th className="px-3 py-2.5">{cfg.labelNome}</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                    <th className="px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtrados.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/30 transition-colors ${!item.ativo ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-3 font-mono font-bold text-primary">{item.codigo}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{nomeDo(item)}</td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            item.ativo
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {item.ativo ? "ATIVO" : "INATIVO"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => editar(item)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => inativar(item)}
                          disabled={!item.ativo}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                          title="Inativar"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
