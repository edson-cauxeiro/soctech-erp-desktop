import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { agruparPorAno, SEM_ANO } from "@/utils/ano";

/**
 * Agrupa registos por ano para listagens longas (séries, exercícios fiscais).
 * Por defeito apenas o ano corrente fica expandido.
 */
export function useGruposAno<T>(
  itens: T[],
  anoDe: (item: T) => string,
  anoAtual: number = new Date().getFullYear()
) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const grupos = agruparPorAno(itens, anoDe);
  const chaveAtual = String(anoAtual);
  const estaAberto = (ano: string) => abertos[ano] ?? ano === chaveAtual;
  const alternar = (ano: string) =>
    setAbertos((prev) => ({ ...prev, [ano]: !(prev[ano] ?? ano === chaveAtual) }));
  return { grupos, estaAberto, alternar, anoAtual: chaveAtual };
}

interface AnoGroupSectionProps {
  ano: string;
  total: number;
  unidade: { singular: string; plural: string };
  aberto: boolean;
  emCurso?: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function AnoGroupSection({
  ano,
  total,
  unidade,
  aberto,
  emCurso = false,
  onToggle,
  children,
}: AnoGroupSectionProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted/70 transition-colors text-left"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${
            aberto ? "rotate-90" : ""
          }`}
        />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
          {ano === SEM_ANO ? "Sem ano" : ano}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {total} {total === 1 ? unidade.singular : unidade.plural}
        </span>
        {emCurso && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-primary">
            Ano em curso
          </span>
        )}
      </button>
      {aberto && children}
    </div>
  );
}
