import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Loader2, Lock, LockOpen, Sparkles, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import type { RhPeriodoDto } from "@/@types/electron";

const ESTADO_ESTILO: Record<RhPeriodoDto["estado"], string> = {
  ABERTO: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  FECHADO: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  PROCESSADO: "bg-primary/10 text-primary border-primary/30",
  ANULADO: "bg-destructive/10 text-destructive border-destructive/30",
};

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function RhPeriodosManager() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [periodos, setPeriodos] = useState<RhPeriodoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [aProcessar, setAProcessar] = useState<string | null>(null);
  const [aGerar, setAGerar] = useState(false);

  const carregar = useCallback(async (anoConsulta: number) => {
    setIsLoading(true);
    try {
      const res = await rhApi.config.periodos.listar(anoConsulta);
      if (res.success) setPeriodos(res.data);
      else toast.error("Erro ao carregar períodos", { description: res.error.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar(ano);
  }, [ano, carregar]);

  const gerar = async () => {
    setAGerar(true);
    try {
      const res = await rhApi.config.periodos.gerar(ano);
      if (res.success) {
        setPeriodos(res.data);
        toast.success(`Períodos de ${ano} gerados/verificados.`);
      } else {
        toast.error("Não foi possível gerar os períodos", { description: res.error.message });
      }
    } finally {
      setAGerar(false);
    }
  };

  const alterarEstado = async (p: RhPeriodoDto) => {
    setAProcessar(p.id);
    try {
      const res =
        p.estado === "FECHADO"
          ? await rhApi.config.periodos.reabrir(p.id)
          : await rhApi.config.periodos.fechar(p.id);
      if (res.success) {
        toast.success(p.estado === "FECHADO" ? `${p.descricao} reaberto.` : `${p.descricao} fechado.`);
        carregar(ano);
      } else {
        toast.error("Operação não permitida", { description: res.error.message });
      }
    } finally {
      setAProcessar(null);
    }
  };

  const agruparPorTrimestre = (mes: number) => Math.floor((mes - 1) / 3) + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4 bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-card)]">
        <div className="space-y-1.5">
          <Label htmlFor="ano-periodo" className="text-xs font-semibold">
            Ano
          </Label>
          <Input
            id="ano-periodo"
            type="number"
            value={ano}
            min={2000}
            max={2100}
            onChange={(e) => setAno(Number(e.target.value) || new Date().getFullYear())}
            className="h-9 w-32 text-sm font-mono"
          />
        </div>
        <Button onClick={gerar} disabled={aGerar} className="h-9 text-xs font-semibold gap-2">
          {aGerar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Gerar P01–P12
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="w-4 h-4 text-primary" />
          {periodos.length}/12 períodos criados em {ano}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs">A carregar períodos...</span>
        </div>
      ) : periodos.length === 0 ? (
        <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
          <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-semibold">Sem períodos para {ano}</p>
          <p className="text-xs text-muted-foreground">
            Use “Gerar P01–P12” para criar automaticamente os doze períodos mensais.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {periodos.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-border rounded-xl p-4 shadow-[var(--shadow-card)] space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {p.descricao || MESES[p.mes - 1]}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {p.codigo} · T{agruparPorTrimestre(p.mes)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${ESTADO_ESTILO[p.estado]}`}
                >
                  {p.estado}
                </span>
              </div>

              <div className="text-[11px] text-muted-foreground font-mono">
                {new Date(p.dataInicio).toLocaleDateString("pt-PT")} →{" "}
                {new Date(p.dataFim).toLocaleDateString("pt-PT")}
              </div>

              <Button
                type="button"
                variant={p.estado === "FECHADO" ? "outline" : "default"}
                size="sm"
                onClick={() => alterarEstado(p)}
                disabled={aProcessar === p.id || p.estado === "PROCESSADO" || p.estado === "ANULADO"}
                className="w-full h-8 text-xs font-semibold gap-2"
              >
                {aProcessar === p.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : p.estado === "FECHADO" ? (
                  <LockOpen className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                {p.estado === "FECHADO" ? "Reabrir período" : "Fechar período"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
