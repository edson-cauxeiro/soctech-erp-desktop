import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Percent,
  Plus,
  Loader2,
  History,
  Trash2,
  ListTree,
  CalendarRange,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { FormSurface } from "@/components/erp/FormDialog";
import { rhApi } from "@/api/rh.api";
import type {
  RhParametroFiscalDto,
  RhParametroInput,
  RhTabelaIrtDto,
  RhTabelaIrtInput,
  RhEscalaoIrtInput,
} from "@/@types/electron";

const TIPO_VALOR_OPTIONS = [
  { value: "DECIMAL", label: "Decimal" },
  { value: "INT", label: "Inteiro" },
  { value: "BOOLEAN", label: "Booleano" },
  { value: "JSON", label: "JSON" },
  { value: "STRING", label: "Texto" },
];

function dataHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatarData(valor: string | Date | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("pt-PT");
}

export function RhParametrosManager() {
  const [vista, setVista] = useState<"parametros" | "irt">("parametros");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setVista("parametros")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            vista === "parametros"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Parâmetros fiscais
        </button>
        <button
          type="button"
          onClick={() => setVista("irt")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            vista === "irt"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Tabela de IRT
        </button>
      </div>

      {vista === "parametros" ? <ParametrosFiscais /> : <TabelasIrt />}
    </div>
  );
}

// ── Parâmetros fiscais ────────────────────────────────────────────────────────

interface ParamsForm {
  chave: string;
  valor: string;
  tipoValor: "DECIMAL" | "INT" | "BOOLEAN" | "JSON" | "STRING";
  descricao: string;
  vigenteDesde: string;
  vigenteAte: string;
}

const PARAMS_VAZIO: ParamsForm = {
  chave: "",
  valor: "",
  tipoValor: "DECIMAL",
  descricao: "",
  vigenteDesde: dataHoje(),
  vigenteAte: "",
};

function ParametrosFiscais() {
  const [items, setItems] = useState<RhParametroFiscalDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<ParamsForm>(PARAMS_VAZIO);

  const alterar = <K extends keyof ParamsForm>(campo: K, valor: ParamsForm[K]) =>
    setForm((a) => ({ ...a, [campo]: valor }));

  const carregar = async () => {
    setIsLoading(true);
    try {
      const res = await rhApi.config.parametros.listar();
      if (res.success) setItems(res.data);
      else toast.error("Erro ao carregar parâmetros", { description: res.error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const chaves = useMemo(() => {
    const set = new Set(items.map((p) => p.chave));
    return Array.from(set).sort();
  }, [items]);

  const chaveOptions = chaves.map((c) => ({ value: c, label: c }));

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chave.trim() || !form.valor.trim()) {
      toast.error("Indique a chave e o valor do parâmetro.");
      return;
    }
    const payload: RhParametroInput = {
      chave: form.chave.trim().toUpperCase(),
      valor: form.valor.trim(),
      tipoValor: form.tipoValor,
      descricao: form.descricao.trim() || null,
      vigenteDesde: form.vigenteDesde,
      vigenteAte: form.vigenteAte || null,
    };
    setIsSubmitting(true);
    try {
      const res = await rhApi.config.parametros.criar(payload);
      if (res.success) {
        toast.success("Nova versão do parâmetro registada.");
        setForm((a) => ({ ...PARAMS_VAZIO, chave: a.chave, tipoValor: a.tipoValor }));
        carregar();
      } else {
        toast.error("Não foi possível guardar", { description: res.error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100dvh-14rem)]">
      <FormSurface
        className="lg:col-span-5 h-full shadow-[var(--shadow-card)]"
        title="Nova Versão de Parâmetro"
        headerActions={<Percent className="w-5 h-5 text-primary" />}
        bodyClassName="p-5"
      >
        <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Chave</Label>
          <div className="flex gap-2">
            <Input
              value={form.chave}
              onChange={(e) => alterar("chave", e.target.value.toUpperCase())}
              placeholder="INSS_TRAB"
              className="h-9 text-sm font-mono flex-1"
            />
            {chaveOptions.length > 0 && (
              <div className="w-40">
                <SearchSelect
                  value=""
                  onChange={(v) => {
                    const existente = items.find((p) => p.chave === v);
                    if (existente) {
                      setForm((a) => ({
                        ...a,
                        chave: existente.chave,
                        tipoValor: existente.tipoValor,
                        descricao: existente.descricao ?? a.descricao,
                      }));
                    }
                  }}
                  options={[{ value: "", label: "Existentes..." }, ...chaveOptions]}
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Valor <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.valor}
              onChange={(e) => alterar("valor", e.target.value)}
              placeholder="3 ou true"
              className="h-9 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Tipo</Label>
            <SearchSelect
              value={form.tipoValor}
              onChange={(v) => alterar("tipoValor", v as ParamsForm["tipoValor"])}
              options={TIPO_VALOR_OPTIONS}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Descrição</Label>
          <Input
            value={form.descricao}
            onChange={(e) => alterar("descricao", e.target.value)}
            className="h-9 text-sm"
            placeholder="Taxa INSS do trabalhador (%)"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Vigente desde <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={form.vigenteDesde}
              onChange={(e) => alterar("vigenteDesde", e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Vigente até</Label>
            <Input
              type="date"
              value={form.vigenteAte}
              onChange={(e) => alterar("vigenteAte", e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
            <span>
              Cada alteração cria uma <strong>nova versão</strong> com data de vigência; os
              processamentos usam a versão vigente à data do período.
            </span>
          </div>
          </div>
          <div className="shrink-0 border-t border-border bg-muted/20 px-0 pt-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full text-xs font-semibold flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Registar versão
        </Button>
          </div>
        </form>
      </FormSurface>

      <div className="lg:col-span-7 h-full min-h-0 overflow-y-auto bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-foreground">Histórico de Parâmetros</h2>
          <span className="ml-auto text-xs text-muted-foreground">{items.length} versões</span>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">A carregar parâmetros...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
            <Percent className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold">Sem parâmetros registados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
                <tr>
                  <th className="px-3 py-2.5">Chave</th>
                  <th className="px-3 py-2.5">Valor</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Vigência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-primary">
                      {p.chave}
                      {p.descricao && (
                        <div className="text-[10px] font-sans font-normal text-muted-foreground">
                          {p.descricao}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono">{p.valor}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.tipoValor}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      {formatarData(p.vigenteDesde)} → {p.vigenteAte ? formatarData(p.vigenteAte) : "aberto"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tabela de IRT ─────────────────────────────────────────────────────────────

interface IrTForm {
  descricao: string;
  vigenteDesde: string;
  vigenteAte: string;
  escaloes: IrLEscalaoRow[];
}

interface IrLEscalaoRow {
  ordem: string;
  rendimentoDe: string;
  rendimentoAte: string;
  parcelaFixa: string;
  taxa: string;
  excessoDe: string;
}

const ESCALAO_VAZIO: IrLEscalaoRow = {
  ordem: "",
  rendimentoDe: "",
  rendimentoAte: "",
  parcelaFixa: "0",
  taxa: "",
  excessoDe: "",
};

function TabelasIrt() {
  const [tabelas, setTabelas] = useState<RhTabelaIrtDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selecionada, setSelecionada] = useState<RhTabelaIrtDto | null>(null);
  const [form, setForm] = useState<IrTForm>({
    descricao: "",
    vigenteDesde: dataHoje(),
    vigenteAte: "",
    escaloes: [{ ...ESCALAO_VAZIO, ordem: "1" }],
  });

  const carregar = async () => {
    setIsLoading(true);
    try {
      const res = await rhApi.config.irt.listar();
      if (res.success) setTabelas(res.data);
      else toast.error("Erro ao carregar tabelas de IRT", { description: res.error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const verDetalhe = async (t: RhTabelaIrtDto) => {
    const res = await rhApi.config.irt.get(t.id);
    if (res.success) setSelecionada(res.data);
    else toast.error("Erro ao abrir tabela", { description: res.error.message });
  };

  const alterarEscalao = (idx: number, campo: keyof IrLEscalaoRow, valor: string) =>
    setForm((a) => ({
      ...a,
      escaloes: a.escaloes.map((e, i) => (i === idx ? { ...e, [campo]: valor } : e)),
    }));

  const adicionarEscalao = () =>
    setForm((a) => ({
      ...a,
      escaloes: [...a.escaloes, { ...ESCALAO_VAZIO, ordem: String(a.escaloes.length + 1) }],
    }));

  const removerEscalao = (idx: number) =>
    setForm((a) => ({ ...a, escaloes: a.escaloes.filter((_, i) => i !== idx) }));

  const numero = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao.trim()) {
      toast.error("Indique a descrição da tabela de IRT.");
      return;
    }
    const escaloes: RhEscalaoIrtInput[] = [];
    for (const [i, linha] of form.escaloes.entries()) {
      const rendimentoDe = numero(linha.rendimentoDe);
      const taxa = numero(linha.taxa);
      if (rendimentoDe === null || taxa === null) {
        toast.error(`Escalão ${i + 1}: indique o rendimento de e a taxa.`);
        return;
      }
      escaloes.push({
        ordem: Number(linha.ordem) || i + 1,
        rendimentoDe,
        rendimentoAte: numero(linha.rendimentoAte),
        parcelaFixa: numero(linha.parcelaFixa) ?? 0,
        taxa,
        excessoDe: numero(linha.excessoDe) ?? rendimentoDe,
      });
    }

    const payload: RhTabelaIrtInput = {
      descricao: form.descricao.trim(),
      vigenteDesde: form.vigenteDesde,
      vigenteAte: form.vigenteAte || null,
      escaloes,
    };

    setIsSubmitting(true);
    try {
      const res = await rhApi.config.irt.criar(payload);
      if (res.success) {
        toast.success("Tabela de IRT registada.");
        setForm({
          descricao: "",
          vigenteDesde: dataHoje(),
          vigenteAte: "",
          escaloes: [{ ...ESCALAO_VAZIO, ordem: "1" }],
        });
        carregar();
      } else {
        toast.error("Não foi possível guardar", { description: res.error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FormSurface
        className="h-[calc(100dvh-14rem)] shadow-[var(--shadow-card)]"
        title="Nova Tabela de IRT"
        headerActions={<ListTree className="w-5 h-5 text-primary" />}
        bodyClassName="p-5"
      >
        <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label className="text-xs font-semibold">
              Descrição <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm((a) => ({ ...a, descricao: e.target.value }))}
              className="h-9 text-sm"
              placeholder="Tabela IRT 2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Vigente desde <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={form.vigenteDesde}
              onChange={(e) => setForm((a) => ({ ...a, vigenteDesde: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Vigente até</Label>
            <Input
              type="date"
              value={form.vigenteAte}
              onChange={(e) => setForm((a) => ({ ...a, vigenteAte: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Escalões
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={adicionarEscalao}
              className="h-7 text-[11px] gap-1"
            >
              <Plus className="w-3 h-3" /> Adicionar escalão
            </Button>
          </div>

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2 text-center w-14">Ordem</th>
                  <th className="px-2 py-2">Rendimento de</th>
                  <th className="px-2 py-2">Rendimento até</th>
                  <th className="px-2 py-2">Parcela fixa</th>
                  <th className="px-2 py-2">Taxa (%)</th>
                  <th className="px-2 py-2">Excesso de</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.escaloes.map((linha, idx) => (
                  <tr key={idx}>
                    {(
                      [
                        "ordem",
                        "rendimentoDe",
                        "rendimentoAte",
                        "parcelaFixa",
                        "taxa",
                        "excessoDe",
                      ] as const
                    ).map((campo) => (
                      <td key={campo} className="px-1.5 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={linha[campo]}
                          onChange={(e) => alterarEscalao(idx, campo, e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </td>
                    ))}
                    <td className="px-1.5 py-1.5 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removerEscalao(idx)}
                        disabled={form.escaloes.length === 1}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

          </div>
          <div className="shrink-0 border-t border-border bg-muted/20 px-0 pt-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="text-xs font-semibold flex items-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Registar tabela
        </Button>
          </div>
        </form>
      </FormSurface>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <CalendarRange className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Tabelas Vigentes</h2>
          </div>
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : tabelas.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Sem tabelas registadas.</p>
          ) : (
            <div className="space-y-2">
              {tabelas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => verDetalhe(t)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    selecionada?.id === t.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{t.descricao}</span>
                    {!t.vigenteAte && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        VIGENTE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground mt-1">
                    {formatarData(t.vigenteDesde)} → {t.vigenteAte ? formatarData(t.vigenteAte) : "aberto"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)] space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <ListTree className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Escalões da Tabela</h2>
          </div>
          {!selecionada ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Selecione uma tabela para ver os escalões.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
                  <tr>
                    <th className="px-3 py-2 text-center">#</th>
                    <th className="px-3 py-2 text-right">De</th>
                    <th className="px-3 py-2 text-right">Até</th>
                    <th className="px-3 py-2 text-right">Parcela fixa</th>
                    <th className="px-3 py-2 text-right">Taxa</th>
                    <th className="px-3 py-2 text-right">Excesso de</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(selecionada.escaloes ?? []).map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-center font-mono">{e.ordem}</td>
                      <td className="px-3 py-2 text-right font-mono">{e.rendimentoDe.toLocaleString("pt-PT")}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {e.rendimentoAte != null ? e.rendimentoAte.toLocaleString("pt-PT") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{e.parcelaFixa.toLocaleString("pt-PT")}</td>
                      <td className="px-3 py-2 text-right font-mono">{e.taxa}%</td>
                      <td className="px-3 py-2 text-right font-mono">{e.excessoDe.toLocaleString("pt-PT")}</td>
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
