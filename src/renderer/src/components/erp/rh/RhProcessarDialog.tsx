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
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { rhApi } from "@/api/rh.api";
import { ROTULO_TIPO, type TipoProcessamento } from "./rh-processamento-tipos";

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });

export interface RhProcessamentoPedido {
  modo: "INDIVIDUAL" | "LOTE";
  ano: number;
  mes: number;
  periodoCodigo: string;
  tipos: TipoProcessamento[];
  incluirFimContrato: boolean;
  diasProcessados: number;
  dataProcessamento: string;
  dataLimiteFaltasHE: string;
  funcionarios: Array<{ id: string; codigo: string; nome: string }>;
}

export interface RhRelatorioLinha {
  funcionarioId: string;
  codigo: string | null;
  nome: string | null;
  tipo: TipoProcessamento;
  sucesso: boolean;
  erro?: string;
  liquido?: string;
}

export interface RhRelatorioFinal {
  linhas: RhRelatorioLinha[];
  processamentos: number;
  sucessos: number;
  erros: number;
  totalLiquido: number;
  avisos: string[];
}

interface RhProcessarDialogProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  pedido: RhProcessamentoPedido | null;
  onConcluido?: (relatorio: RhRelatorioFinal) => void;
}

type Fase = "RESUMO" | "EXECUCAO" | "RELATORIO";

interface SimulacaoTipo {
  tipo: TipoProcessamento;
  funcionarios: number;
  liquido: number;
  erros: number;
  falhou: boolean;
}

interface SimulacaoResumo {
  tipos: SimulacaoTipo[];
  totalRemuneracoes: number;
  totalDescontos: number;
  totalLiquido: number;
  avisos: string[];
}

interface EstadoProgresso {
  indiceTipo: number;
  totalTipos: number;
  tipo: TipoProcessamento;
  feitos: number;
  total: number;
  modo: "INDIVIDUAL" | "LOTE";
}

async function simularPedido(pedido: RhProcessamentoPedido): Promise<SimulacaoResumo> {
  const funcionarioIds = pedido.funcionarios.map((f) => f.id);
  const tipos: SimulacaoTipo[] = [];
  const avisos: string[] = [];
  let totalRemuneracoes = 0;
  let totalDescontos = 0;
  let totalLiquido = 0;

  for (const tipo of pedido.tipos) {
    const resp = await rhApi.processamento.simular({
      modo: pedido.modo,
      tipos: [tipo],
      tipoProcessamento: tipo,
      incluirFimContrato: pedido.incluirFimContrato,
      ano: pedido.ano,
      mes: pedido.mes,
      periodoCodigo: pedido.periodoCodigo,
      diasProcessados: pedido.diasProcessados,
      dataProcessamento: pedido.dataProcessamento,
      dataLimiteFaltasHE: pedido.dataLimiteFaltasHE,
      funcionarioIds,
    });

    if (!resp.success) {
      avisos.push(`${ROTULO_TIPO[tipo]}: ${resp.error?.message ?? "falha na simulação."}`);
      tipos.push({ tipo, funcionarios: 0, liquido: 0, erros: 0, falhou: true });
      continue;
    }

    const resumo = resp.data.resumo;
    totalRemuneracoes += Number(resumo.totalRemuneracoes) || 0;
    totalDescontos += Number(resumo.totalDescontos) || 0;
    totalLiquido += Number(resumo.totalLiquido) || 0;
    tipos.push({
      tipo,
      funcionarios: resumo.total,
      liquido: Number(resumo.totalLiquido) || 0,
      erros: resumo.erros,
      falhou: false,
    });
  }

  return { tipos, totalRemuneracoes, totalDescontos, totalLiquido, avisos };
}

export function RhProcessarDialog({
  aberto,
  onOpenChange,
  pedido,
  onConcluido,
}: RhProcessarDialogProps) {
  const [fase, setFase] = useState<Fase>("RESUMO");
  const [aSimular, setASimular] = useState(false);
  const [simulacao, setSimulacao] = useState<SimulacaoResumo | null>(null);
  const [progresso, setProgresso] = useState<EstadoProgresso | null>(null);
  const [relatorio, setRelatorio] = useState<RhRelatorioFinal | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Prepara o resumo (simulação, sem persistir) sempre que o diálogo abre com um
  // novo pedido.
  useEffect(() => {
    if (!aberto || !pedido) return;
    let cancelado = false;
    setFase("RESUMO");
    setRelatorio(null);
    setErro(null);
    setProgresso(null);
    setSimulacao(null);
    setASimular(true);

    void (async () => {
      try {
        const resumo = await simularPedido(pedido);
        if (!cancelado) setSimulacao(resumo);
      } catch {
        if (!cancelado) setErro("Não foi possível pré-visualizar os valores. Pode ainda assim confirmar.");
      } finally {
        if (!cancelado) setASimular(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [aberto, pedido]);

  // Progresso do lote (RH-406) chega pelo evento IPC enquanto o invoke decorre.
  useEffect(() => {
    if (fase !== "EXECUCAO") return;
    const off = rhApi.processamento.onProgresso((p) => {
      setProgresso((atual) =>
        atual ? { ...atual, feitos: p.feitos, total: p.total } : atual
      );
    });
    return off;
  }, [fase]);

  const executar = useCallback(async () => {
    if (!pedido || pedido.tipos.length === 0 || pedido.funcionarios.length === 0) return;

    const totalTipos = pedido.tipos.length;
    const linhas: RhRelatorioLinha[] = [];
    const avisos: string[] = [];
    let totalLiquido = 0;
    let houveFalhaFatal = false;

    setFase("EXECUCAO");
    setErro(null);
    setProgresso(null);

    for (let i = 0; i < totalTipos; i++) {
      const tipo = pedido.tipos[i];
      setProgresso({
        indiceTipo: i + 1,
        totalTipos,
        tipo,
        feitos: pedido.modo === "INDIVIDUAL" ? i : 0,
        total: pedido.modo === "INDIVIDUAL" ? totalTipos : pedido.funcionarios.length,
        modo: pedido.modo,
      });

      try {
        if (pedido.modo === "INDIVIDUAL") {
          const alvo = pedido.funcionarios[0];
          const resp = await rhApi.processamento.processar({
            ano: pedido.ano,
            mes: pedido.mes,
            periodoCodigo: pedido.periodoCodigo,
            tipoProcessamento: tipo,
            incluirFimContrato: pedido.incluirFimContrato,
            diasProcessados: pedido.diasProcessados,
            dataLimiteFaltasHE: pedido.dataLimiteFaltasHE,
            dataProcessamento: pedido.dataProcessamento,
            funcionarioId: alvo.id,
          });
          if (!resp.success) throw new Error(resp.error?.message ?? "Erro ao processar.");
          const data = resp.data;
          totalLiquido += Number(data.liquido) || 0;
          data.avisos.forEach((a) => avisos.push(`${alvo.codigo}: ${a}`));
          linhas.push({
            funcionarioId: alvo.id,
            codigo: alvo.codigo,
            nome: alvo.nome,
            tipo,
            sucesso: data.sucesso,
            liquido: data.liquido,
            erro: data.sucesso ? undefined : "Processamento concluído com avisos.",
          });
          setProgresso((atual) => (atual ? { ...atual, feitos: i + 1, total: totalTipos } : atual));
        } else {
          const resp = await rhApi.processamento.processarLote({
            ano: pedido.ano,
            mes: pedido.mes,
            periodoCodigo: pedido.periodoCodigo,
            tipoProcessamento: tipo as Exclude<TipoProcessamento, "FIM_CONTRATO">,
            incluirFimContrato: pedido.incluirFimContrato,
            dataLimiteFaltasHE: pedido.dataLimiteFaltasHE,
            dataProcessamento: pedido.dataProcessamento,
            funcionarioIds: pedido.funcionarios.map((f) => f.id),
          });
          if (!resp.success) throw new Error(resp.error?.message ?? "Erro ao processar o lote.");
          const data = resp.data;
          totalLiquido += Number(data.totalLiquido) || 0;
          for (const d of data.detalhes) {
            linhas.push({
              funcionarioId: d.funcionarioId,
              codigo: d.codigo,
              nome: d.nome,
              tipo,
              sucesso: d.sucesso,
              erro: d.erro,
              liquido: d.liquido,
            });
          }
          setProgresso((atual) => (atual ? { ...atual, feitos: atual.total } : atual));
        }
      } catch (e) {
        houveFalhaFatal = true;
        avisos.push(`${ROTULO_TIPO[tipo]}: ${e instanceof Error ? e.message : "erro inesperado."}`);
      }
    }

    const sucessos = linhas.filter((l) => l.sucesso).length;
    const rel: RhRelatorioFinal = {
      linhas,
      processamentos: linhas.length,
      sucessos,
      erros: linhas.length - sucessos,
      totalLiquido,
      avisos,
    };
    setRelatorio(rel);
    setFase("RELATORIO");
    if (houveFalhaFatal && linhas.length === 0) {
      setErro("Nenhum processamento foi concluído. Verifique as mensagens abaixo.");
    }
    onConcluido?.(rel);
  }, [pedido, onConcluido]);

  const fechar = useCallback(
    (novoEstado: boolean) => {
      if (!novoEstado && fase === "EXECUCAO") return;
      onOpenChange(novoEstado);
    },
    [fase, onOpenChange]
  );

  const percent = progresso
    ? progresso.total > 0
      ? Math.min(100, Math.round((progresso.feitos / progresso.total) * 100))
      : 0
    : 0;

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => {
          if (fase === "EXECUCAO") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (fase === "EXECUCAO") e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Processar salários</DialogTitle>
          <DialogDescription>
            {pedido
              ? `${pedido.modo === "INDIVIDUAL" ? "Processamento individual" : "Processamento em lote"} · ` +
                `${pedido.periodoCodigo} · ${String(pedido.mes).padStart(2, "0")}/${pedido.ano} · ` +
                `${pedido.tipos.map((t) => ROTULO_TIPO[t]).join(", ")}`
              : "Sem parâmetros."}
          </DialogDescription>
        </DialogHeader>

        {fase === "RESUMO" && (
          <div className="space-y-4">
            {aSimular ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm">A calcular o valor estimado…</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Resumo rotulo="Funcionários" valor={String(pedido?.funcionarios.length ?? 0)} />
                  <Resumo rotulo="Tipos" valor={String(pedido?.tipos.length ?? 0)} />
                  <Resumo
                    rotulo="Remunerações"
                    valor={fmtMoeda.format(simulacao?.totalRemuneracoes ?? 0)}
                  />
                  <Resumo rotulo="Descontos" valor={fmtMoeda.format(simulacao?.totalDescontos ?? 0)} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-4 py-3">
                  <span className="text-sm font-medium text-primary">Total líquido estimado</span>
                  <span className="text-lg font-semibold tabular-nums text-primary">
                    {fmtMoeda.format(simulacao?.totalLiquido ?? 0)}
                  </span>
                </div>

                {simulacao && simulacao.tipos.length > 0 && (
                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Tipo</th>
                          <th className="px-3 py-2 text-right font-medium">Funcionários</th>
                          <th className="px-3 py-2 text-right font-medium">Erros</th>
                          <th className="px-3 py-2 text-right font-medium">Líquido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulacao.tipos.map((t) => (
                          <tr key={t.tipo} className="border-t border-border">
                            <td className="px-3 py-2">{ROTULO_TIPO[t.tipo]}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {t.falhou ? "—" : t.funcionarios}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{t.falhou ? "—" : t.erros}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {t.falhou ? "—" : fmtMoeda.format(t.liquido)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {simulacao && simulacao.avisos.length > 0 && (
                  <Avisos avisos={simulacao.avisos} />
                )}
                {erro && <Avisos avisos={[erro]} />}
              </>
            )}
          </div>
        )}

        {fase === "EXECUCAO" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>
                A processar{" "}
                <span className="font-medium">
                  {progresso ? ROTULO_TIPO[progresso.tipo] : ""}
                </span>
                {progresso && progresso.totalTipos > 1 && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({progresso.indiceTipo} de {progresso.totalTipos})
                  </span>
                )}
              </span>
            </div>
            <Progress value={percent} />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {progresso ? `${progresso.feitos}/${progresso.total}` : "—"} · {percent}%
            </p>
            <p className="text-xs text-muted-foreground">
              Não feche o ecrã durante o processamento.
            </p>
          </div>
        )}

        {fase === "RELATORIO" && relatorio && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Resumo rotulo="Processamentos" valor={String(relatorio.processamentos)} />
              <Resumo
                rotulo="Sucessos"
                valor={String(relatorio.sucessos)}
                tom="positivo"
              />
              <Resumo
                rotulo="Erros"
                valor={String(relatorio.erros)}
                tom={relatorio.erros > 0 ? "negativo" : "neutro"}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-4 py-2.5">
              <span className="text-sm font-medium">Total líquido processado</span>
              <span className="text-lg font-semibold tabular-nums">
                {fmtMoeda.format(relatorio.totalLiquido)}
              </span>
            </div>

            {relatorio.linhas.length > 0 && (
              <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                      <th className="px-3 py-2 text-left font-medium">Nome</th>
                      <th className="px-3 py-2 text-left font-medium">Tipo</th>
                      <th className="px-3 py-2 text-right font-medium">Líquido</th>
                      <th className="px-3 py-2 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.linhas.map((l, i) => (
                      <tr key={`${l.funcionarioId}-${l.tipo}-${i}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{l.codigo ?? "—"}</td>
                        <td className="px-3 py-2">{l.nome ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{ROTULO_TIPO[l.tipo]}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {l.liquido ? fmtMoeda.format(Number(l.liquido) || 0) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.sucesso ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Sucesso
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"
                              title={l.erro}
                            >
                              <XCircle className="h-3.5 w-3.5" /> Erro
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {relatorio.avisos.length > 0 && <Avisos avisos={relatorio.avisos} />}
            {erro && <Avisos avisos={[erro]} />}
          </div>
        )}

        <DialogFooter>
          {fase === "RESUMO" && (
            <>
              <Button variant="outline" onClick={() => fechar(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void executar()} disabled={aSimular || !pedido}>
                <Play className="mr-2 h-4 w-4" />
                Confirmar e processar
              </Button>
            </>
          )}
          {fase === "EXECUCAO" && (
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              A processar…
            </Button>
          )}
          {fase === "RELATORIO" && (
            <Button onClick={() => fechar(false)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
