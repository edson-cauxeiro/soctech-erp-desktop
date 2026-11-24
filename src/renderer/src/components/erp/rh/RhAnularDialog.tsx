import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Ban, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { rhApi } from "@/api/rh.api";
import type {
  RhAnularProcessamentoDetalheDto,
  RhAnularProcessamentosResultadoDto,
  RhProcessamentoResumoDto,
} from "@/@types/electron";
import { ABREV_TIPO, ROTULO_TIPO } from "./rh-processamento-tipos";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });

interface RhAnularDialogProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  processamentos: RhProcessamentoResumoDto[];
  onConcluido?: (resultado: RhAnularProcessamentosResultadoDto) => void;
}

export function RhAnularDialog({
  aberto,
  onOpenChange,
  processamentos,
  onConcluido,
}: RhAnularDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [aAnular, setAAnular] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RhAnularProcessamentosResultadoDto | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setErro(null);
    setResultado(null);
    setAAnular(false);
  }, [aberto, processamentos]);

  const totalSelecionado = processamentos.reduce((acc, p) => acc + (Number(p.liquido) || 0), 0);
  const motivoValido = motivo.trim().length >= 3;

  const confirmar = useCallback(async () => {
    if (!motivoValido || processamentos.length === 0) return;
    setAAnular(true);
    setErro(null);
    try {
      const resp = await rhApi.processamento.anular({
        processamentoIds: processamentos.map((p) => p.id),
        motivo: motivo.trim(),
      });
      if (!resp.success) {
        setErro(resp.error?.message ?? "Erro ao anular os processamentos.");
        return;
      }
      setResultado(resp.data);
    } catch {
      setErro("Erro inesperado ao anular os processamentos.");
    } finally {
      setAAnular(false);
    }
  }, [motivo, motivoValido, processamentos]);

  const fechar = useCallback(
    (novoEstado: boolean) => {
      if (!novoEstado && aAnular) return;
      if (!novoEstado && resultado) onConcluido?.(resultado);
      onOpenChange(novoEstado);
    },
    [aAnular, resultado, onConcluido, onOpenChange]
  );

  const fase = resultado ? "RESULTADO" : "CONFIRMACAO";

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => {
          if (aAnular) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (aAnular) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" />
            {fase === "RESULTADO" ? "Resultado da anulação" : "Anular processamentos"}
          </DialogTitle>
          <DialogDescription>
            {fase === "RESULTADO"
              ? "Efeitos revertidos por processamento."
              : `${processamentos.length} processamento${processamentos.length === 1 ? "" : "s"} selecionado${processamentos.length === 1 ? "" : "s"} · total ${fmtMoeda.format(totalSelecionado)}. A anulação reverte recibo, pagamentos pendentes, alterações e prestações.`}
          </DialogDescription>
        </DialogHeader>

        {fase === "CONFIRMACAO" ? (
          <div className="space-y-4">
            <div className="max-h-[32vh] overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {processamentos.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{p.codigo ?? "—"}</td>
                      <td className="px-3 py-2">{p.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-xs" title={ROTULO_TIPO[p.tipo]}>
                        {ABREV_TIPO[p.tipo]}
                        {p.sequencia > 1 ? ` #${p.sequencia}` : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {fmtMoeda.format(Number(p.liquido) || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo-anulacao">
                Motivo da anulação <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="motivo-anulacao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo (mínimo 3 caracteres)."
                rows={3}
                maxLength={500}
                disabled={aAnular}
              />
              <p className="text-xs text-muted-foreground">
                {motivo.trim().length}/500 caracteres · obrigatório para auditoria.
              </p>
            </div>

            {erro && <Avisos avisos={[erro]} />}

            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Esta operação é irreversível e fica registada em auditoria. Não é possível anular
                processamentos com pagamento já efectuado ou de período fechado.
              </span>
            </div>
          </div>
        ) : (
          resultado && <ResultadoAnulacao resultado={resultado} />
        )}

        <DialogFooter>
          {fase === "CONFIRMACAO" ? (
            <>
              <Button variant="outline" onClick={() => fechar(false)} disabled={aAnular}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmar()}
                disabled={!motivoValido || aAnular || processamentos.length === 0}
              >
                {aAnular ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="mr-2 h-4 w-4" />
                )}
                Confirmar anulação
              </Button>
            </>
          ) : (
            <Button onClick={() => fechar(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultadoAnulacao({ resultado }: { resultado: RhAnularProcessamentosResultadoDto }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Resumo rotulo="Total" valor={String(resultado.total)} />
        <Resumo rotulo="Anulados" valor={String(resultado.sucesso)} tom="positivo" />
        <Resumo
          rotulo="Bloqueados"
          valor={String(resultado.erros)}
          tom={resultado.erros > 0 ? "negativo" : "neutro"}
        />
      </div>

      <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Funcionário</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Efeitos revertidos</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {resultado.detalhes.map((d) => (
              <tr key={d.processamentoId} className="border-t border-border align-top">
                <td className="px-3 py-2 font-mono text-xs">{d.codigo ?? "—"}</td>
                <td className="px-3 py-2">{d.nome ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {d.sucesso ? <Efeitos detalhe={d} /> : (d.erro ?? "—")}
                </td>
                <td className="px-3 py-2">
                  {d.sucesso ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Anulado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                      <XCircle className="h-3.5 w-3.5" /> Bloqueado
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resultado.detalhes.some((d) => d.avisos && d.avisos.length > 0) && (
        <Avisos
          avisos={resultado.detalhes.flatMap((d) => d.avisos ?? [])}
        />
      )}
    </div>
  );
}

function Efeitos({ detalhe }: { detalhe: RhAnularProcessamentoDetalheDto }) {
  const partes: string[] = [];
  if (detalhe.reciboAnulado) partes.push("recibo anulado");
  if (detalhe.pagamentosCancelados) partes.push(`${detalhe.pagamentosCancelados} pagamento(s) cancelado(s)`);
  if (detalhe.alteracoesRepostas) partes.push(`${detalhe.alteracoesRepostas} alteração(ões) reposta(s)`);
  if (detalhe.prestacoesRepostas) partes.push(`${detalhe.prestacoesRepostas} prestação(ões) reposta(s)`);
  if (detalhe.lancamentoEstornado) partes.push("lançamento estornado");
  return <>{partes.length > 0 ? partes.join(" · ") : "sem efeitos secundários"}</>;
}

function Resumo({
  rotulo,
  valor,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  tom?: "neutro" | "positivo" | "negativo";
}) {
  const cor =
    tom === "positivo"
      ? "text-emerald-600"
      : tom === "negativo"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${cor}`}>{valor}</p>
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
