import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, FileCheck2 } from "lucide-react";
import type { RhProcessamentoResumoDto } from "@/@types/electron";
import { ABREV_TIPO, ROTULO_TIPO } from "./rh-processamento-tipos";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });
const fmtData = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtNumero = new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 0 });

type SortKey = "codigo" | "nome";
type Direcao = "asc" | "desc";

interface RhAnularConteudoProps {
  processamentos: RhProcessamentoResumoDto[];
  selecionados: string[];
  onSelecionadosChange: (ids: string[]) => void;
}

export function RhAnularConteudo({
  processamentos,
  selecionados,
  onSelecionadosChange,
}: RhAnularConteudoProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Direcao }>({ key: "codigo", dir: "asc" });

  // Só os processamentos não anulados podem ser seleccionados para anulação.
  const anulaveis = useMemo(
    () => processamentos.filter((p) => !p.jaAnulado),
    [processamentos]
  );

  const ordenados = useMemo(() => {
    const copia = [...processamentos];
    copia.sort((a, b) => {
      const va = sort.key === "codigo" ? a.codigo ?? "" : a.nome ?? "";
      const vb = sort.key === "codigo" ? b.codigo ?? "" : b.nome ?? "";
      const cmp = va.localeCompare(vb, "pt");
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [processamentos, sort]);

  const todosSelecionados =
    anulaveis.length > 0 && anulaveis.every((p) => selecionados.includes(p.id));
  const algumSelecionado = selecionados.length > 0 && !todosSelecionados;

  const alternarTodos = (estado: boolean | "indeterminate") => {
    onSelecionadosChange(estado === true ? anulaveis.map((p) => p.id) : []);
  };

  const alternarUm = (id: string, marcado: boolean) => {
    onSelecionadosChange(marcado ? [...selecionados, id] : selecionados.filter((x) => x !== id));
  };

  const mudarOrdenacao = (key: SortKey) => {
    setSort((atual) =>
      atual.key === key ? { key, dir: atual.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const totalSelecionado = processamentos
    .filter((p) => selecionados.includes(p.id))
    .reduce((acc, p) => acc + (Number(p.liquido) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {processamentos.length} processamento{processamentos.length === 1 ? "" : "s"} no período ·{" "}
          {anulaveis.length} anulável{anulaveis.length === 1 ? "" : "eis"} · {selecionados.length}{" "}
          selecionado{selecionados.length === 1 ? "" : "s"}
          {selecionados.length > 0 && ` · ${fmtMoeda.format(totalSelecionado)}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">
                <span className="flex items-center gap-2">
                  P
                  <Checkbox
                    checked={algumSelecionado ? "indeterminate" : todosSelecionados}
                    onCheckedChange={alternarTodos}
                    disabled={anulaveis.length === 0}
                    aria-label="Selecionar tudo"
                  />
                </span>
              </TableHead>
              <TableHead className="w-32">
                <CabecalhoOrdenavel
                  rotulo="Funcionário"
                  activo={sort.key === "codigo"}
                  dir={sort.dir}
                  onClick={() => mudarOrdenacao("codigo")}
                />
              </TableHead>
              <TableHead>
                <CabecalhoOrdenavel
                  rotulo="Nome"
                  activo={sort.key === "nome"}
                  dir={sort.dir}
                  onClick={() => mudarOrdenacao("nome")}
                />
              </TableHead>
              <TableHead className="w-40">Tipo Processamento</TableHead>
              <TableHead className="w-28">Recibo</TableHead>
              <TableHead className="w-32">Data</TableHead>
              <TableHead className="w-36 text-right">Líquido</TableHead>
              <TableHead className="w-28">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <FileCheck2 className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Sem processamentos para os parâmetros escolhidos.
                </TableCell>
              </TableRow>
            ) : (
              ordenados.map((p) => {
                const marcado = selecionados.includes(p.id);
                return (
                  <TableRow key={p.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Checkbox
                        checked={marcado}
                        disabled={p.jaAnulado}
                        onCheckedChange={(v) => alternarUm(p.id, v === true)}
                        aria-label={`Anular processamento de ${p.nome ?? p.codigo ?? p.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{p.codigo ?? "—"}</TableCell>
                    <TableCell>{p.nome ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        title={ROTULO_TIPO[p.tipo]}
                      >
                        {ABREV_TIPO[p.tipo]}
                        {p.sequencia > 1 ? ` #${p.sequencia}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.reciboNumero !== null ? `Nº ${fmtNumero.format(p.reciboNumero)}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {fmtData.format(new Date(p.dataProcessamento))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtMoeda.format(Number(p.liquido) || 0)}
                    </TableCell>
                    <TableCell>
                      {p.estado === "ANULADO" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                          title={p.motivoAnulacao ?? undefined}
                        >
                          <Ban className="h-3 w-3" />
                          Anulado
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          Processado
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CabecalhoOrdenavel({
  rotulo,
  activo,
  dir,
  onClick,
}: {
  rotulo: string;
  activo: boolean;
  dir: Direcao;
  onClick: () => void;
}) {
  const Icone = activo ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-left font-medium hover:text-foreground"
    >
      {rotulo}
      <Icone className="h-3.5 w-3.5" />
    </button>
  );
}
