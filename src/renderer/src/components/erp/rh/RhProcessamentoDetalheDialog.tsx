import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  Receipt,
} from "lucide-react";
import { rhApi } from "@/api/rh.api";
import type { RhProcessamentoDetalheDto } from "@/@types/electron";
import { ROTULO_TIPO } from "./rh-processamento-tipos";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });
const fmtData = new Intl.DateTimeFormat("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric" });

function data(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : fmtData.format(d);
}

interface RhProcessamentoDetalheDialogProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  processamentoId: string | null;
  onAnular?: (processamento: RhProcessamentoDetalheDto) => void;
}

export function RhProcessamentoDetalheDialog({
  aberto,
  onOpenChange,
  processamentoId,
  onAnular,
}: RhProcessamentoDetalheDialogProps) {
  const [detalhe, setDetalhe] = useState<RhProcessamentoDetalheDto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || !processamentoId) return;
    let cancelado = false;
    setDetalhe(null);
    setErro(null);
    setCarregando(true);

    void (async () => {
      try {
        const resp = await rhApi.processamento.obter({ id: processamentoId });
        if (cancelado) return;
        if (resp.success) setDetalhe(resp.data);
        else setErro(resp.error?.message ?? "Erro ao carregar o processamento.");
      } catch {
        if (!cancelado) setErro("Erro inesperado ao carregar o processamento.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [aberto, processamentoId]);

  const anular = useCallback(() => {
    if (detalhe) onAnular?.(detalhe);
  }, [detalhe, onAnular]);

  const anulado = detalhe?.jaAnulado ?? false;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Detalhe do processamento
          </DialogTitle>
          <DialogDescription>
            {detalhe
              ? `${detalhe.codigo ?? "—"} · ${detalhe.nome ?? "—"} · ${ROTULO_TIPO[detalhe.tipo]} · ${detalhe.periodoCodigo} ${detalhe.ano}`
              : "Valores processados por rubrica, bases de incidência e escalão de IRT aplicado."}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm">A carregar o processamento…</p>
          </div>
        ) : erro ? (
          <Avisos avisos={[erro]} />
        ) : detalhe ? (
          <div className="space-y-4">
            {anulado && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Processamento <span className="font-medium">anulado</span>
                  {detalhe.anuladoEm ? ` em ${data(detalhe.anuladoEm)}` : ""}
                  {detalhe.motivoAnulacao ? ` — ${detalhe.motivoAnulacao}` : ""}.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Resumo rotulo="Remunerações" valor={fmtMoeda.format(Number(detalhe.totalRemuneracoes) || 0)} />
              <Resumo rotulo="Descontos" valor={fmtMoeda.format(Number(detalhe.totalDescontos) || 0)} />
              <Resumo rotulo="Encargos" valor={fmtMoeda.format(Number(detalhe.totalEncargos) || 0)} />
              <Resumo
                rotulo="Líquido"
                valor={fmtMoeda.format(Number(detalhe.liquido) || 0)}
                tom="positivo"
              />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Campo rotulo="Base INSS" valor={fmtMoeda.format(Number(detalhe.baseINSS) || 0)} />
              <Campo rotulo="Base IRT" valor={fmtMoeda.format(Number(detalhe.baseIRT) || 0)} />
              <Campo
                rotulo="INSS trabalhador"
                valor={fmtMoeda.format(Number(detalhe.inssTrabalhador) || 0)}
              />
              <Campo rotulo="INSS patronal" valor={fmtMoeda.format(Number(detalhe.inssPatronal) || 0)} />
              <Campo rotulo="IRT" valor={fmtMoeda.format(Number(detalhe.irt) || 0)} />
              <Campo rotulo="Dias proc." valor={String(detalhe.diasProcessados)} />
            </div>

            {detalhe.escalao && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium text-primary">
                  Escalão de IRT aplicado — n.º {detalhe.escalao.ordem}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Rendimento de {fmtMoeda.format(Number(detalhe.escalao.rendimentoDe) || 0)}
                  {detalhe.escalao.rendimentoAte
                    ? ` a ${fmtMoeda.format(Number(detalhe.escalao.rendimentoAte) || 0)}`
                    : " (sem limite superior)"}
                  {" · "}
                  parcela fixa {fmtMoeda.format(Number(detalhe.escalao.parcelaFixa) || 0)} +{" "}
                  {Number(detalhe.escalao.taxa) || 0}% sobre o excesso de{" "}
                  {fmtMoeda.format(Number(detalhe.escalao.excessoDe) || 0)}.
                </p>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Rubricas</h3>
              {detalhe.itens.length > 0 ? (
                <div className="max-h-[38vh] overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Código</th>
                        <th className="px-3 py-2 text-left font-medium">Descrição</th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Origem</th>
                        <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                        <th className="px-3 py-2 text-right font-medium">Valor unit.</th>
                        <th className="px-3 py-2 text-right font-medium">Valor</th>
                        <th className="px-3 py-2 text-center font-medium">IRT</th>
                        <th className="px-3 py-2 text-center font-medium">INSS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.itens.map((i) => (
                        <tr key={i.id} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-xs">{i.codigo}</td>
                          <td className="px-3 py-2">{i.descricao}</td>
                          <td className="px-3 py-2 text-xs">{ROTULO_RUBRICA[i.tipo] ?? i.tipo}</td>
                          <td className="px-3 py-2 text-xs">{ROTULO_ORIGEM[i.origem] ?? i.origem}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {i.quantidade !== null ? Number(i.quantidade).toLocaleString("pt-AO") : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {i.valorUnitario !== null
                              ? fmtMoeda.format(Number(i.valorUnitario) || 0)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {fmtMoeda.format(Number(i.valor) || 0)}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {i.incideIRT ? <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-600" /> : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {i.incideINSS ? <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-600" /> : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem rubricas registadas.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <Receipt className="h-4 w-4 text-primary" />
                Recibo
              </span>
              {detalhe.recibo ? (
                <span className="text-muted-foreground">
                  {detalhe.recibo.serie}/{detalhe.recibo.ano}/{String(detalhe.recibo.numero).padStart(4, "0")} ·{" "}
                  {detalhe.recibo.estado} · emitido em {data(detalhe.recibo.emitidoEm)}
                </span>
              ) : (
                <span className="text-muted-foreground">Sem recibo associado.</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {detalhe.modo === "INDIVIDUAL" ? "Individual" : "Em lote"}
                {detalhe.manual ? " · ajustes manuais" : ""}
                {detalhe.sequencia > 1 ? ` · sequência ${detalhe.sequencia}` : ""}
                {" · processado em "}
                {data(detalhe.dataProcessamento)}
              </span>
            </div>

            {detalhe.avisos.length > 0 && <Avisos avisos={detalhe.avisos} />}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {detalhe && !anulado && onAnular && (
            <Button variant="destructive" onClick={anular}>
              <Ban className="mr-2 h-4 w-4" />
              Anular processamento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO_RUBRICA: Record<string, string> = {
  REMUNERACAO: "Remuneração",
  DESCONTO: "Desconto",
  ENCARGO_PATRONAL: "Encargo patronal",
};

const ROTULO_ORIGEM: Record<string, string> = {
  AUTOMATICO: "Automático",
  MANUAL: "Manual",
  ALTERACAO_MENSAL: "Alteração mensal",
  AUSENCIA: "Ausência",
  HORA_EXTRA: "Hora extra",
  PRESTACAO: "Prestação",
  RETROATIVO: "Retroactivo",
  FERIAS: "Férias",
};

function Resumo({
  rotulo,
  valor,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  tom?: "neutro" | "positivo";
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tom === "positivo" ? "text-emerald-600" : "text-foreground"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="font-mono text-sm tabular-nums">{valor}</p>
    </div>
  );
}

function Avisos({ avisos }: { avisos: string[] }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <ul className="list-inside list-disc space-y-1">
        {avisos.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </div>
  );
}
