import { useState } from "react";
import { Coins, CalendarClock, Percent, Building2, SlidersHorizontal } from "lucide-react";
import { RhRubricasManager } from "./RhRubricasManager";
import { RhPeriodosManager } from "./RhPeriodosManager";
import { RhParametrosManager } from "./RhParametrosManager";
import { RhCadastrosManager } from "./RhCadastrosManager";
import { RhPadroesManager } from "./RhPadroesManager";

type SubTab = "rubricas" | "periodos" | "parametros" | "cadastros" | "padroes";

interface SubTabDef {
  key: SubTab;
  label: string;
  icon: React.ReactNode;
}

const SUBTABS: SubTabDef[] = [
  { key: "rubricas", label: "Rubricas", icon: <Coins className="w-4 h-4" /> },
  { key: "periodos", label: "Períodos", icon: <CalendarClock className="w-4 h-4" /> },
  { key: "parametros", label: "Parâmetros e IRT", icon: <Percent className="w-4 h-4" /> },
  { key: "cadastros", label: "Departamentos e Cargos", icon: <Building2 className="w-4 h-4" /> },
  { key: "padroes", label: "Padrões", icon: <SlidersHorizontal className="w-4 h-4" /> },
];

export function RhConfiguracao() {
  const [sub, setSub] = useState<SubTab>("rubricas");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {SUBTABS.map((item) => {
          const ativo = sub === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSub(item.key)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-md transition-colors cursor-pointer border-b-2 ${
                ativo
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      {sub === "rubricas" && <RhRubricasManager />}
      {sub === "periodos" && <RhPeriodosManager />}
      {sub === "parametros" && <RhParametrosManager />}
      {sub === "cadastros" && <RhCadastrosManager />}
      {sub === "padroes" && <RhPadroesManager />}
    </div>
  );
}
