import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Coins,
  Plus,
  Pencil,
  Ban,
  Loader2,
  Search,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { FormSurface } from "@/components/erp/FormDialog";
import { rhApi } from "@/api/rh.api";
import type {
  RhRubricaDto,
  RhRubricaInput,
  RhTipoRubricaDto,
  RhNaturezaRubricaDto,
  RhFormaCalculoRubricaDto,
} from "@/@types/electron";

const TIPO_OPTIONS = [
  { value: "REMUNERACAO", label: "Remuneração (crédito ao trabalhador)" },
  { value: "DESCONTO", label: "Desconto" },
  { value: "ENCARGO_PATRONAL", label: "Encargo patronal (entidade)" },
];

const NATUREZA_OPTIONS = [
  { value: "FIXA", label: "Fixa" },
  { value: "VARIAVEL", label: "Variável" },
  { value: "EXTRAORDINARIA", label: "Extraordinária" },
];

const FORMA_OPTIONS = [
  { value: "VALOR_FIXO", label: "Valor fixo" },
  { value: "PERCENTAGEM_SALARIO", label: "Percentagem do salário" },
  { value: "VALOR_X_QUANTIDADE", label: "Valor × quantidade" },
  { value: "SISTEMA", label: "Calculada pelo sistema" },
];

function paraNumero(valor: string): number | null {
  const limpo = valor.trim();
  if (limpo === "") return null;
  const n = Number(limpo.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

interface FormState {
  codigo: string;
  descricao: string;
  tipo: RhTipoRubricaDto;
  natureza: RhNaturezaRubricaDto;
  formaCalculo: RhFormaCalculoRubricaDto;
  valorPadrao: string;
  percentagem: string;
  incideIRT: boolean;
  incideINSS: boolean;
  limiteIsencaoIRT: string;
  limiteIsencaoINSS: string;
  ordemRecibo: string;
  ativo: boolean;
}

const FORM_VAZIO: FormState = {
  codigo: "",
  descricao: "",
  tipo: "REMUNERACAO",
  natureza: "FIXA",
  formaCalculo: "VALOR_FIXO",
  valorPadrao: "",
  percentagem: "",
  incideIRT: true,
  incideINSS: true,
  limiteIsencaoIRT: "",
  limiteIsencaoINSS: "",
  ordemRecibo: "100",
  ativo: true,
};

export function RhRubricasManager() {
  const [items, setItems] = useState<RhRubricaDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoSistema, setEditandoSistema] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [incluirInativas, setIncluirInativas] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);

  const alterar = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm((atual) => ({ ...atual, [campo]: valor }));

  const carregar = async () => {
    setIsLoading(true);
    try {
      const res = await rhApi.config.rubricas.listar({
        take: 500,
        ativo: incluirInativas ? undefined : true,
      });
      if (res.success) setItems(res.data.items);
      else toast.error("Erro ao carregar rubricas", { description: res.error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incluirInativas]);

  const filtrados = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return items;
    return items.filter(
      (r) =>
        r.codigo.toLowerCase().includes(termo) || r.descricao.toLowerCase().includes(termo)
    );
  }, [items, filtro]);

  const limpar = () => {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setEditandoSistema(false);
  };

  const editar = (r: RhRubricaDto) => {
    setEditandoId(r.id);
    setEditandoSistema(r.sistema);
    setForm({
      codigo: r.codigo,
      descricao: r.descricao,
      tipo: r.tipo,
      natureza: r.natureza,
      formaCalculo: r.formaCalculo,
      valorPadrao: r.valorPadrao != null ? String(r.valorPadrao) : "",
      percentagem: r.percentagem != null ? String(r.percentagem) : "",
      incideIRT: r.incideIRT,
      incideINSS: r.incideINSS,
      limiteIsencaoIRT: r.limiteIsencaoIRT != null ? String(r.limiteIsencaoIRT) : "",
      limiteIsencaoINSS: r.limiteIsencaoINSS != null ? String(r.limiteIsencaoINSS) : "",
      ordemRecibo: String(r.ordemRecibo),
      ativo: r.ativo,
    });
  };

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo.trim() || !form.descricao.trim()) {
      toast.error("Preencha o código e a descrição da rubrica.");
      return;
    }

    const payload: RhRubricaInput = {
      codigo: form.codigo.trim().toUpperCase(),
      descricao: form.descricao.trim(),
      tipo: form.tipo,
      natureza: form.natureza,
      formaCalculo: form.formaCalculo,
      valorPadrao: paraNumero(form.valorPadrao),
      percentagem: paraNumero(form.percentagem),
      incideIRT: form.incideIRT,
      incideINSS: form.incideINSS,
      limiteIsencaoIRT: paraNumero(form.limiteIsencaoIRT),
      limiteIsencaoINSS: paraNumero(form.limiteIsencaoINSS),
      ordemRecibo: Number(form.ordemRecibo) || 100,
      ativo: form.ativo,
    };

    setIsSubmitting(true);
    try {
      const res = editandoId
        ? await rhApi.config.rubricas.atualizar({ id: editandoId, ...payload })
        : await rhApi.config.rubricas.criar(payload);

      if (res.success) {
        toast.success(editandoId ? "Rubrica atualizada." : "Rubrica criada com sucesso.");
        limpar();
        carregar();
      } else {
        toast.error("Não foi possível guardar a rubrica", { description: res.error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inativar = async (r: RhRubricaDto) => {
    if (!confirm(`Inativar a rubrica "${r.codigo} — ${r.descricao}"?`)) return;
    const res = await rhApi.config.rubricas.inativar(r.id);
    if (res.success) {
      toast.success("Rubrica inativada.");
      if (editandoId === r.id) limpar();
      carregar();
    } else {
      toast.error("Não foi possível inativar", { description: res.error.message });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100dvh-14rem)]">
      <FormSurface
        className="lg:col-span-5 h-full shadow-[var(--shadow-card)]"
        title={editandoId ? "Editar Rubrica" : "Nova Rubrica"}
        headerActions={
          <>
            <Coins className="w-5 h-5 text-primary" />
            {editandoSistema && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" /> SISTEMA
              </span>
            )}
          </>
        }
        bodyClassName="p-5"
      >
        <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rub-codigo" className="text-xs font-semibold">
              Código <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rub-codigo"
              value={form.codigo}
              onChange={(e) => alterar("codigo", e.target.value.toUpperCase())}
              disabled={editandoSistema}
              className="h-9 text-sm font-mono font-bold"
              placeholder="SUBS_RENDA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rub-ordem" className="text-xs font-semibold">
              Ordem no recibo
            </Label>
            <Input
              id="rub-ordem"
              type="number"
              value={form.ordemRecibo}
              onChange={(e) => alterar("ordemRecibo", e.target.value)}
              className="h-9 text-sm font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rub-descricao" className="text-xs font-semibold">
            Descrição <span className="text-destructive">*</span>
          </Label>
          <Input
            id="rub-descricao"
            value={form.descricao}
            onChange={(e) => alterar("descricao", e.target.value)}
            className="h-9 text-sm"
            placeholder="Ex: Subsídio de Renda"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Tipo</Label>
            <SearchSelect
              value={form.tipo}
              onChange={(v) => alterar("tipo", v as RhTipoRubricaDto)}
              options={TIPO_OPTIONS}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Natureza</Label>
            <SearchSelect
              value={form.natureza}
              onChange={(v) => alterar("natureza", v as RhNaturezaRubricaDto)}
              options={NATUREZA_OPTIONS}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Forma de cálculo</Label>
          <SearchSelect
            value={form.formaCalculo}
            onChange={(v) => alterar("formaCalculo", v as RhFormaCalculoRubricaDto)}
            options={FORMA_OPTIONS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rub-valor" className="text-xs font-semibold">
              Valor padrão (AOA)
            </Label>
            <Input
              id="rub-valor"
              type="number"
              step="0.0001"
              value={form.valorPadrao}
              onChange={(e) => alterar("valorPadrao", e.target.value)}
              className="h-9 text-sm font-mono"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rub-pct" className="text-xs font-semibold">
              Percentagem (%)
            </Label>
            <Input
              id="rub-pct"
              type="number"
              step="0.0001"
              value={form.percentagem}
              onChange={(e) => alterar("percentagem", e.target.value)}
              className="h-9 text-sm font-mono"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rub-lim-irt" className="text-xs font-semibold">
              Limite isenção IRT
            </Label>
            <Input
              id="rub-lim-irt"
              type="number"
              step="0.0001"
              value={form.limiteIsencaoIRT}
              onChange={(e) => alterar("limiteIsencaoIRT", e.target.value)}
              className="h-9 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rub-lim-inss" className="text-xs font-semibold">
              Limite isenção INSS
            </Label>
            <Input
              id="rub-lim-inss"
              type="number"
              step="0.0001"
              value={form.limiteIsencaoINSS}
              onChange={(e) => alterar("limiteIsencaoINSS", e.target.value)}
              className="h-9 text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 pt-1">
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <Checkbox checked={form.incideIRT} onCheckedChange={(v) => alterar("incideIRT", Boolean(v))} />
            Incide IRT
          </label>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <Checkbox checked={form.incideINSS} onCheckedChange={(v) => alterar("incideINSS", Boolean(v))} />
            Incide INSS
          </label>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <Checkbox checked={form.ativo} onCheckedChange={(v) => alterar("ativo", Boolean(v))} />
            Ativa
          </label>
        </div>

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
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {editandoId ? "Guardar alterações" : "Registar rubrica"}
          </Button>
          </div>
        </form>
      </FormSurface>

      <div className="lg:col-span-7 h-full min-h-0 overflow-y-auto bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4">
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Rubricas Registadas</h2>
          </div>
          <span className="text-xs text-muted-foreground ml-auto">Total: {filtrados.length}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-9 pl-8 text-xs"
              placeholder="Pesquisar por código ou descrição..."
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <Checkbox
              checked={incluirInativas}
              onCheckedChange={(v) => setIncluirInativas(Boolean(v))}
            />
            Incluir inativas
          </label>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">A carregar rubricas...</span>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
            <Coins className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold">Nenhuma rubrica encontrada</p>
            <p className="text-xs text-muted-foreground">Crie uma rubrica no formulário ao lado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
                <tr>
                  <th className="px-3 py-2.5">Código</th>
                  <th className="px-3 py-2.5">Descrição</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Valor / %</th>
                  <th className="px-3 py-2.5 text-center">IRT</th>
                  <th className="px-3 py-2.5 text-center">INSS</th>
                  <th className="px-3 py-2.5 text-center">Ordem</th>
                  <th className="px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((r) => (
                  <tr key={r.id} className={`hover:bg-muted/30 transition-colors ${!r.ativo ? "opacity-50" : ""}`}>
                    <td className="px-3 py-3 font-mono font-bold text-primary">
                      {r.codigo}
                      {r.sistema && (
                        <ShieldCheck className="inline w-3 h-3 ml-1 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-foreground">{r.descricao}</td>
                    <td className="px-3 py-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted font-medium capitalize text-muted-foreground">
                        {r.tipo.toLowerCase().replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {r.percentagem != null
                        ? `${r.percentagem}%`
                        : r.valorPadrao != null
                          ? r.valorPadrao.toLocaleString("pt-PT")
                          : "—"}
                    </td>
                    <td className="px-3 py-3 text-center">{r.incideIRT ? "✓" : "—"}</td>
                    <td className="px-3 py-3 text-center">{r.incideINSS ? "✓" : "—"}</td>
                    <td className="px-3 py-3 text-center font-mono">{r.ordemRecibo}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editar(r)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => inativar(r)}
                        disabled={r.sistema || !r.ativo}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                        title={r.sistema ? "Rubrica de sistema não pode ser inativada" : "Inativar"}
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

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <span>
            As rubricas de sistema (marcadas com <ShieldCheck className="inline w-3 h-3" />) sustentam
            o cálculo do processamento; o código é imutável e não podem ser inativadas.
          </span>
        </div>
      </div>
    </div>
  );
}
