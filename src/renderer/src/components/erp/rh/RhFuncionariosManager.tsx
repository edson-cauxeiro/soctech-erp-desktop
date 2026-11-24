import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { FormDialog } from "@/components/erp/FormDialog";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Plus,
  Pencil,
  Ban,
  Loader2,
  Search,
  Users,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FolderOpen,
  FileUp,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import { RhFuncionarioFicha } from "./RhFuncionarioFicha";
import { RhImportacaoDialog } from "./RhImportacaoDialog";
import { RhMigracaoWizard } from "./RhMigracaoWizard";
import type {
  RhFuncionarioListaDto,
  RhFuncionarioInput,
  RhDepartamentoDto,
  RhCargoDto,
  RhEstadoFuncionarioDto,
  RhGeneroDto,
  RhEstadoCivilDto,
  RhFormaPagamentoDto,
  RhModoSubsidioNatalDto,
  RhModoSubsidioFeriasDto,
} from "@/@types/electron";

const TAKE = 20;

const ESTADOS: RhEstadoFuncionarioDto[] = ["ATIVO", "SUSPENSO", "INATIVO", "CESSADO"];
const GENEROS: RhGeneroDto[] = ["MASCULINO", "FEMININO", "OUTRO"];
const ESTADOS_CIVIS: RhEstadoCivilDto[] = ["SOLTEIRO", "CASADO", "DIVORCIADO", "VIUVO", "UNIAO_FACTO"];
const FORMAS_PAGAMENTO: RhFormaPagamentoDto[] = ["TRANSFERENCIA", "NUMERARIO", "CHEQUE"];
const MODOS_NATAL: RhModoSubsidioNatalDto[] = ["PAGAMENTO_UNICO", "DUODECIMOS"];
const MODOS_FERIAS: RhModoSubsidioFeriasDto[] = ["ANTES_GOZO", "MES_FIXO", "DUODECIMOS"];

const ROTULO_ESTADO: Record<RhEstadoFuncionarioDto, string> = {
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  INATIVO: "Inativo",
  CESSADO: "Cessado",
};

const COR_ESTADO: Record<RhEstadoFuncionarioDto, string> = {
  ATIVO: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  SUSPENSO: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  INATIVO: "bg-muted text-muted-foreground border-border",
  CESSADO: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

interface Formulario {
  nome: string;
  documentoNumero: string;
  nif: string;
  niss: string;
  dataNascimento: string;
  genero: string;
  estadoCivil: string;
  nacionalidade: string;
  morada: string;
  telefone: string;
  email: string;
  departamentoId: string;
  cargoId: string;
  categoria: string;
  dataAdmissao: string;
  dataCessacao: string;
  estado: RhEstadoFuncionarioDto;
  formaPagamento: RhFormaPagamentoDto;
  banco: string;
  iban: string;
  modoSubsidioNatal: string;
  mesPagamentoSubsidioNatal: string;
  modoSubsidioFerias: string;
  mesPagamentoSubsidioFerias: string;
}

const FORM_VAZIO: Formulario = {
  nome: "",
  documentoNumero: "",
  nif: "",
  niss: "",
  dataNascimento: "",
  genero: "",
  estadoCivil: "",
  nacionalidade: "Angolana",
  morada: "",
  telefone: "",
  email: "",
  departamentoId: "",
  cargoId: "",
  categoria: "",
  dataAdmissao: new Date().toISOString().slice(0, 10),
  dataCessacao: "",
  estado: "ATIVO",
  formaPagamento: "TRANSFERENCIA",
  banco: "",
  iban: "",
  modoSubsidioNatal: "",
  mesPagamentoSubsidioNatal: "",
  modoSubsidioFerias: "",
  mesPagamentoSubsidioFerias: "",
};

function dataCurta(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT");
}

export function RhFuncionariosManager() {
  const [items, setItems] = useState<RhFuncionarioListaDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [busca, setBusca] = useState("");
  const [filtroDepartamento, setFiltroDepartamento] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [aplicados, setAplicados] = useState({ search: "", departamentoId: "", estado: "" });

  const [ordem, setOrdem] = useState<{ campo: "codigo" | "nome" | "dataAdmissao"; dir: "asc" | "desc" }>(
    { campo: "codigo", dir: "asc" }
  );

  const [departamentos, setDepartamentos] = useState<RhDepartamentoDto[]>([]);
  const [cargos, setCargos] = useState<RhCargoDto[]>([]);

  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [migracaoAberta, setMigracaoAberta] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const carregar = useCallback(
    async (pagina: number) => {
      setIsLoading(true);
      try {
        const res = await rhApi.funcionarios.listar({
          skip: pagina * TAKE,
          take: TAKE,
          search: aplicados.search || undefined,
          departamentoId: aplicados.departamentoId || undefined,
          estado: (aplicados.estado as RhEstadoFuncionarioDto) || undefined,
        });
        if (res.success) {
          setItems(res.data.items);
          setTotal(res.data.total);
        } else {
          toast.error("Erro ao carregar funcionários", { description: res.error.message });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [aplicados]
  );

  useEffect(() => {
    void carregar(page);
  }, [carregar, page]);

  useEffect(() => {
    void (async () => {
      const [dep, car] = await Promise.all([
        rhApi.config.departamentos.listar({ take: 500, ativo: true }),
        rhApi.config.cargos.listar({ take: 500, ativo: true }),
      ]);
      if (dep.success) setDepartamentos(dep.data.items);
      if (car.success) setCargos(car.data.items);
    })();
  }, []);

  const opcoesDepartamento = useMemo(
    () => departamentos.map((d) => ({ value: d.id, label: `${d.codigo} — ${d.nome}` })),
    [departamentos]
  );
  const opcoesCargo = useMemo(
    () => cargos.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` })),
    [cargos]
  );

  const ordenados = useMemo(() => {
    const copia = [...items];
    copia.sort((a, b) => {
      const va = a[ordem.campo];
      const vb = b[ordem.campo];
      const cmp =
        ordem.campo === "dataAdmissao"
          ? new Date(va).getTime() - new Date(vb).getTime()
          : String(va).localeCompare(String(vb), "pt");
      return ordem.dir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [items, ordem]);

  const alternarOrdem = (campo: "codigo" | "nome" | "dataAdmissao") => {
    setOrdem((atual) =>
      atual.campo === campo ? { campo, dir: atual.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }
    );
  };

  const totalPaginas = Math.max(1, Math.ceil(total / TAKE));

  const aplicarFiltros = () => {
    setPage(0);
    setAplicados({
      search: busca.trim(),
      departamentoId: filtroDepartamento,
      estado: filtroEstado,
    });
  };

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setDialogoAberto(true);
  };

  const abrirEdicao = async (id: string) => {
    const res = await rhApi.funcionarios.get(id);
    if (!res.success) {
      toast.error("Não foi possível abrir a ficha", { description: res.error.message });
      return;
    }
    const f = res.data;
    setEditandoId(id);
    setForm({
      nome: f.nome,
      documentoNumero: f.documentoNumero ?? "",
      nif: f.nif ?? "",
      niss: f.niss ?? "",
      dataNascimento: f.dataNascimento ? String(f.dataNascimento).slice(0, 10) : "",
      genero: f.genero ?? "",
      estadoCivil: f.estadoCivil ?? "",
      nacionalidade: f.nacionalidade ?? "",
      morada: f.morada ?? "",
      telefone: f.telefone ?? "",
      email: f.email ?? "",
      departamentoId: f.departamentoId ?? "",
      cargoId: f.cargoId ?? "",
      categoria: f.categoria ?? "",
      dataAdmissao: String(f.dataAdmissao).slice(0, 10),
      dataCessacao: f.dataCessacao ? String(f.dataCessacao).slice(0, 10) : "",
      estado: f.estado,
      formaPagamento: f.formaPagamento,
      banco: f.banco ?? "",
      iban: f.iban ?? "",
      modoSubsidioNatal: f.modoSubsidioNatal ?? "",
      mesPagamentoSubsidioNatal: f.mesPagamentoSubsidioNatal ? String(f.mesPagamentoSubsidioNatal) : "",
      modoSubsidioFerias: f.modoSubsidioFerias ?? "",
      mesPagamentoSubsidioFerias: f.mesPagamentoSubsidioFerias ? String(f.mesPagamentoSubsidioFerias) : "",
    });
    setDialogoAberto(true);
  };

  const set = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("O nome é obrigatório.");
      return;
    }
    if (!form.dataAdmissao) {
      toast.error("A data de admissão é obrigatória.");
      return;
    }

    const payload: RhFuncionarioInput = {
      nome: form.nome.trim(),
      documentoNumero: form.documentoNumero.trim() || null,
      nif: form.nif.trim() || null,
      niss: form.niss.trim() || null,
      dataNascimento: form.dataNascimento || null,
      genero: (form.genero as RhGeneroDto) || null,
      estadoCivil: (form.estadoCivil as RhEstadoCivilDto) || null,
      nacionalidade: form.nacionalidade.trim() || null,
      morada: form.morada.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      departamentoId: form.departamentoId || null,
      cargoId: form.cargoId || null,
      categoria: form.categoria.trim() || null,
      dataAdmissao: form.dataAdmissao,
      dataCessacao: form.dataCessacao || null,
      estado: form.estado,
      formaPagamento: form.formaPagamento,
      banco: form.banco.trim() || null,
      iban: form.iban.trim() || null,
      modoSubsidioNatal: (form.modoSubsidioNatal as RhModoSubsidioNatalDto) || null,
      mesPagamentoSubsidioNatal: form.mesPagamentoSubsidioNatal
        ? Number(form.mesPagamentoSubsidioNatal)
        : null,
      modoSubsidioFerias: (form.modoSubsidioFerias as RhModoSubsidioFeriasDto) || null,
      mesPagamentoSubsidioFerias: form.mesPagamentoSubsidioFerias
        ? Number(form.mesPagamentoSubsidioFerias)
        : null,
    };

    setIsSubmitting(true);
    try {
      const res = editandoId
        ? await rhApi.funcionarios.atualizar({ id: editandoId, ...payload })
        : await rhApi.funcionarios.criar(payload);
      if (res.success) {
        toast.success(editandoId ? "Funcionário atualizado." : `Funcionário criado: ${res.data.codigo}`);
        setDialogoAberto(false);
        void carregar(editandoId ? page : 0);
        if (!editandoId) setPage(0);
      } else {
        toast.error("Não foi possível guardar", { description: res.error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inativar = async (item: RhFuncionarioListaDto) => {
    if (!confirm(`Inativar "${item.codigo} — ${item.nome}"?`)) return;
    const res = await rhApi.funcionarios.inativar(item.id);
    if (res.success) {
      toast.success("Funcionário inativado.");
      void carregar(page);
    } else {
      toast.error("Não foi possível inativar", { description: res.error.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-xl p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
              className="h-9 pl-8 text-xs"
              placeholder="Código, nome, NIF, BI ou email..."
            />
          </div>
          <div className="w-[240px]">
            <SearchSelect
              value={filtroDepartamento}
              onChange={setFiltroDepartamento}
              options={opcoesDepartamento}
              placeholder="Departamento"
            />
          </div>
          <div className="w-[160px]">
            <SearchSelect
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={ESTADOS.map((e) => ({ value: e, label: ROTULO_ESTADO[e] }))}
              placeholder="Estado"
            />
          </div>
          <Button type="button" variant="outline" onClick={aplicarFiltros} className="h-9 text-xs gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Aplicar
          </Button>
          <Button type="button" onClick={abrirNovo} className="h-9 text-xs font-semibold gap-2">
            <Plus className="w-4 h-4" /> Novo Funcionário
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportacaoAberta(true)}
            className="h-9 text-xs font-semibold gap-2"
          >
            <FileUp className="w-4 h-4" /> Importar CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMigracaoAberta(true)}
            className="h-9 text-xs font-semibold gap-2"
            data-testid="rh-migracao-abrir"
          >
            <ListChecks className="w-4 h-4" /> Migração inicial
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-foreground">Funcionários</h2>
          <span className="text-xs text-muted-foreground ml-auto">Total: {total}</span>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">A carregar...</span>
          </div>
        ) : ordenados.length === 0 ? (
          <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
            <Users className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-semibold">Sem funcionários</p>
            <p className="text-xs text-muted-foreground">Ajuste os filtros ou registe um novo funcionário.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
                <tr>
                  {(
                    [
                      ["codigo", "Código"],
                      ["nome", "Nome"],
                    ] as const
                  ).map(([campo, label]) => (
                    <th key={campo} className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => alternarOrdem(campo)}
                        className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                      >
                        {label}
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2.5">NIF / BI</th>
                  <th className="px-3 py-2.5">Departamento</th>
                  <th className="px-3 py-2.5">Cargo</th>
                  <th className="px-3 py-2.5 text-center">Estado</th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => alternarOrdem("dataAdmissao")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      Admissão
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordenados.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      item.estado === "INATIVO" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-3 font-mono font-bold text-primary">{item.codigo}</td>
                    <td className="px-3 py-3 font-medium text-foreground">{item.nome}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <div>{item.nif ?? "—"}</div>
                      <div className="text-[10px]">{item.documentoNumero ?? ""}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{item.departamento?.nome ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.cargo?.nome ?? "—"}</td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COR_ESTADO[item.estado]}`}
                      >
                        {ROTULO_ESTADO[item.estado].toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{dataCurta(item.dataAdmissao)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFichaId(item.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        title="Abrir ficha"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirEdicao(item.id)}
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
                        disabled={item.estado === "INATIVO"}
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

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPaginas}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-8 gap-1 text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPaginas}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 gap-1 text-xs"
            >
              Seguinte <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <FormDialog
        open={dialogoAberto}
        onOpenChange={setDialogoAberto}
        title={editandoId ? "Editar Funcionário" : "Novo Funcionário"}
        description="Os dados de contrato e alterações salariais são geridos na ficha do funcionário."
      >
          <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Dados Pessoais</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Nome <span className="text-destructive">*</span>
                  </Label>
                  <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nº Documento (BI)</Label>
                  <Input value={form.documentoNumero} onChange={(e) => set("documentoNumero", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">NIF</Label>
                  <Input value={form.nif} onChange={(e) => set("nif", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">NISS</Label>
                  <Input value={form.niss} onChange={(e) => set("niss", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Data de Nascimento</Label>
                  <Input type="date" value={form.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Género</Label>
                  <SearchSelect value={form.genero} onChange={(v) => set("genero", v)} options={GENEROS} placeholder="Género" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Estado Civil</Label>
                  <SearchSelect value={form.estadoCivil} onChange={(v) => set("estadoCivil", v)} options={ESTADOS_CIVIS} placeholder="Estado civil" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nacionalidade</Label>
                  <Input value={form.nacionalidade} onChange={(e) => set("nacionalidade", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Morada</Label>
                  <Input value={form.morada} onChange={(e) => set("morada", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Dados Profissionais</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Departamento</Label>
                  <SearchSelect value={form.departamentoId} onChange={(v) => set("departamentoId", v)} options={opcoesDepartamento} placeholder="Departamento" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Cargo</Label>
                  <SearchSelect value={form.cargoId} onChange={(v) => set("cargoId", v)} options={opcoesCargo} placeholder="Cargo" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Categoria</Label>
                  <Input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Estado</Label>
                  <SearchSelect value={form.estado} onChange={(v) => set("estado", v as RhEstadoFuncionarioDto)} options={ESTADOS.map((e) => ({ value: e, label: ROTULO_ESTADO[e] }))} placeholder="Estado" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Data de Admissão <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={form.dataAdmissao} onChange={(e) => set("dataAdmissao", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Data de Cessação</Label>
                  <Input type="date" value={form.dataCessacao} onChange={(e) => set("dataCessacao", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Pagamento e Subsídios</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Forma de Pagamento</Label>
                  <SearchSelect value={form.formaPagamento} onChange={(v) => set("formaPagamento", v as RhFormaPagamentoDto)} options={FORMAS_PAGAMENTO} placeholder="Forma de pagamento" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Banco</Label>
                  <Input value={form.banco} onChange={(e) => set("banco", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">IBAN</Label>
                  <Input value={form.iban} onChange={(e) => set("iban", e.target.value)} className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Subsídio de Natal</Label>
                  <SearchSelect value={form.modoSubsidioNatal} onChange={(v) => set("modoSubsidioNatal", v)} options={MODOS_NATAL} placeholder="Padrão da empresa" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mês (Natal, se único)</Label>
                  <Input type="number" min={1} max={12} value={form.mesPagamentoSubsidioNatal} onChange={(e) => set("mesPagamentoSubsidioNatal", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Subsídio de Férias</Label>
                  <SearchSelect value={form.modoSubsidioFerias} onChange={(v) => set("modoSubsidioFerias", v)} options={MODOS_FERIAS} placeholder="Padrão da empresa" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mês (Férias, se fixo)</Label>
                  <Input type="number" min={1} max={12} value={form.mesPagamentoSubsidioFerias} onChange={(e) => set("mesPagamentoSubsidioFerias", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
            </section>

            </div>
            <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-6 py-3">
              <Button type="button" variant="outline" onClick={() => setDialogoAberto(false)} className="text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="text-xs font-semibold gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editandoId ? "Guardar" : "Registar"}
              </Button>
            </DialogFooter>
          </form>
      </FormDialog>

      <RhFuncionarioFicha
        funcionarioId={fichaId}
        aberto={!!fichaId}
        departamentos={departamentos}
        cargos={cargos}
        onFechar={() => setFichaId(null)}
        onGuardado={() => void carregar(page)}
      />

      {importacaoAberta && (
        <RhImportacaoDialog
          aberto
          onFechar={() => setImportacaoAberta(false)}
          onImportado={() => void carregar(page)}
        />
      )}

      <RhMigracaoWizard
        aberto={migracaoAberta}
        onFechar={() => setMigracaoAberta(false)}
        onImportado={() => void carregar(page)}
      />
    </div>
  );
}
