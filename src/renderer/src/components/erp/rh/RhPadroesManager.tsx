import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { SlidersHorizontal, Loader2, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { FormSurface } from "@/components/erp/FormDialog";
import { rhApi } from "@/api/rh.api";
import type { RhConfiguracaoDto, RhConfiguracaoInput } from "@/@types/electron";

const MODO_NATAL_OPTIONS = [
  { value: "PAGAMENTO_UNICO", label: "Pagamento único" },
  { value: "DUODECIMOS", label: "Duodécimos (12 avos)" },
];

const MODO_FERIAS_OPTIONS = [
  { value: "ANTES_GOZO", label: "Antes do gozo das férias" },
  { value: "MES_FIXO", label: "Mês fixo" },
  { value: "DUODECIMOS", label: "Duodécimos (12 avos)" },
];

const MESES_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i, 1).toLocaleDateString("pt-PT", { month: "long" }),
}));

export function RhPadroesManager() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [modoNatal, setModoNatal] = useState("PAGAMENTO_UNICO");
  const [mesNatal, setMesNatal] = useState("12");
  const [modoFerias, setModoFerias] = useState("ANTES_GOZO");
  const [mesFerias, setMesFerias] = useState("");
  const [baseDiasMes, setBaseDiasMes] = useState("30");
  const [liquidoNegativoBloqueia, setLiquidoNegativoBloqueia] = useState(true);
  const [serieRecibo, setSerieRecibo] = useState("RV");

  const aplicar = (c: RhConfiguracaoDto) => {
    setModoNatal(c.modoSubsidioNatalPadrao);
    setMesNatal(String(c.mesSubsidioNatalPadrao));
    setModoFerias(c.modoSubsidioFeriasPadrao);
    setMesFerias(c.mesSubsidioFeriasPadrao != null ? String(c.mesSubsidioFeriasPadrao) : "");
    setBaseDiasMes(String(c.baseDiasMes));
    setLiquidoNegativoBloqueia(c.liquidoNegativoBloqueia);
    setSerieRecibo(c.serieRecibo);
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await rhApi.config.configuracao.obter();
        if (res.success) aplicar(res.data);
        else toast.error("Erro ao carregar configuração", { description: res.error.message });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: RhConfiguracaoInput = {
      modoSubsidioNatalPadrao: modoNatal as RhConfiguracaoInput["modoSubsidioNatalPadrao"],
      mesSubsidioNatalPadrao: Number(mesNatal) || 12,
      modoSubsidioFeriasPadrao: modoFerias as RhConfiguracaoInput["modoSubsidioFeriasPadrao"],
      mesSubsidioFeriasPadrao: mesFerias ? Number(mesFerias) : null,
      baseDiasMes: Number(baseDiasMes) || 30,
      liquidoNegativoBloqueia,
      serieRecibo: serieRecibo.trim() || "RV",
    };

    setIsSubmitting(true);
    try {
      const res = await rhApi.config.configuracao.atualizar(payload);
      if (res.success) {
        aplicar(res.data);
        toast.success("Configuração guardada.");
      } else {
        toast.error("Não foi possível guardar", { description: res.error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs">A carregar configuração...</span>
      </div>
    );
  }

  return (
    <FormSurface
      className="h-[calc(100dvh-14rem)] shadow-[var(--shadow-card)]"
      title="Subsídios e Padrões de Cálculo"
      headerActions={<SlidersHorizontal className="w-5 h-5 text-primary" />}
      bodyClassName="p-6"
    >
      <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Subsídio de Natal
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Modo de pagamento</Label>
            <SearchSelect value={modoNatal} onChange={setModoNatal} options={MODO_NATAL_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Mês de pagamento</Label>
            <SearchSelect value={mesNatal} onChange={setMesNatal} options={MESES_OPTIONS} />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Subsídio de Férias
          </h3>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Modo de pagamento</Label>
            <SearchSelect value={modoFerias} onChange={setModoFerias} options={MODO_FERIAS_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Mês fixo (quando aplicável)</Label>
            <SearchSelect
              value={mesFerias}
              onChange={setMesFerias}
              options={[{ value: "", label: "Não aplicável" }, ...MESES_OPTIONS]}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 border-t border-border">
        <div className="space-y-1.5 pt-4">
          <Label htmlFor="base-dias" className="text-xs font-semibold">
            Base de dias por mês
          </Label>
          <Input
            id="base-dias"
            type="number"
            min={1}
            max={31}
            value={baseDiasMes}
            onChange={(e) => setBaseDiasMes(e.target.value)}
            className="h-9 text-sm font-mono w-32"
          />
          <p className="text-[11px] text-muted-foreground">
            Usada no cálculo de faltas e descontos por dia.
          </p>
        </div>

        <div className="space-y-1.5 pt-4">
          <Label htmlFor="serie-recibo" className="text-xs font-semibold">
            Série dos recibos
          </Label>
          <Input
            id="serie-recibo"
            value={serieRecibo}
            onChange={(e) => setSerieRecibo(e.target.value.toUpperCase())}
            className="h-9 text-sm font-mono w-32"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
        <Checkbox
          checked={liquidoNegativoBloqueia}
          onCheckedChange={(v) => setLiquidoNegativoBloqueia(Boolean(v))}
        />
        Bloquear processamento quando o líquido for negativo
      </label>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Estes valores são os padrões da empresa; podem ser sobrepostos caso a caso nos contratos
          dos funcionários.
        </span>
      </div>

        </div>
        <div className="shrink-0 border-t border-border bg-muted/20 px-0 pt-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="text-xs font-semibold flex items-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar configuração
          </Button>
        </div>
      </form>
    </FormSurface>
  );
}
