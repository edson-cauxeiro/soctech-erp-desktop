import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSurface } from "@/components/erp/FormDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  FileCheck2,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import { RhProcessamentoConteudo } from "./RhProcessamentoConteudo";
import { RhProcessarDialog, type RhProcessamentoPedido } from "./RhProcessarDialog";
import { RhAnularConteudo } from "./RhAnularConteudo";
import { RhAnularDialog } from "./RhAnularDialog";
import {
  ABREV_TIPO,
  ROTULO_TIPO,
  TIPOS_PROCESSAMENTO,
  type TipoProcessamento,
} from "./rh-processamento-tipos";
import type {
  RhPeriodoDto,
  RhProcessamentoLoaderResultado,
  RhProcessamentoResumoDto,
} from "@/@types/electron";

// =============================================================================
// Constantes
// =============================================================================

type Operacao = "PROCESSAR" | "ANULAR";
type ModoProcessamento = "INDIVIDUAL" | "LOTE";

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

const ANOS_DISPONIVEIS = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });

// =============================================================================
// Simulação (RH-413) — mesmos parâmetros em modo "não grava" + exportação CSV
// =============================================================================

export type PropositoProcessamento = "PROCESSAMENTO" | "SIMULACAO";

interface SimulacaoLinha {
  funcionarioId: string;
  codigo: string;
  nome: string;
  tipo: TipoProcessamento;
  sucesso: boolean;
  erro?: string;
  remuneracoes: number;
  descontos: number;
  liquido: number;
  avisos: string[];
}

interface SimulacaoResumo {
  linhas: SimulacaoLinha[];
  totalRemuneracoes: number;
  totalDescontos: number;
  totalLiquido: number;
  sucessos: number;
  erros: number;
  avisos: string[];
}

function csvEscapar(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function num2(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

// =============================================================================
// Schema Zod (espelha `rhProcessamentoLoaderInputSchema` do main)
// =============================================================================

const processamentoSchema = z.object({
  operacao: z.enum(["PROCESSAR", "ANULAR"]),
  tipos: z
    .array(z.enum(TIPOS_PROCESSAMENTO))
    .min(1, "Indique pelo menos um tipo de processamento."),
  incluirFimContrato: z.boolean(),
  ano: z.coerce
    .number({ invalid_type_error: "Ano inválido." })
    .int("Ano inválido.")
    .min(2000, "Ano fora do intervalo (2000–2100).")
    .max(2100, "Ano fora do intervalo (2000–2100)."),
  periodoCodigo: z
    .string()
    .trim()
    .regex(/^P(0[1-9]|1[0-2])$/, "Período inválido (formato esperado: P01..P12)."),
  mes: z.coerce
    .number({ invalid_type_error: "Mês inválido." })
    .int("Mês inválido.")
    .min(1, "Mês inválido.")
    .max(12, "Mês inválido."),
  diasProcessados: z.coerce
    .number({ invalid_type_error: "Dias inválidos." })
    .int("Dias inválidos.")
    .min(0, "Os dias processados não podem ser negativos.")
    .max(31, "Os dias processados não podem exceder 31."),
  dataProcessamento: z.string().min(1, "Indique a data de processamento."),
  dataLimiteFaltasHE: z.string().min(1, "Indique a data limite de faltas/horas extra."),
});

type ProcessamentoForm = z.infer<typeof processamentoSchema>;

// =============================================================================
// Helpers
// =============================================================================

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function periodoDoMes(mes: number): string {
  return `P${pad2(mes)}`;
}

function dataHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

function flattenIssues(error: z.ZodError): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const issue of error.issues) {
    const chave = issue.path.join(".") || "_";
    if (!erros[chave]) erros[chave] = issue.message;
  }
  return erros;
}

function descricaoPeriodo(periodo: RhPeriodoDto): string {
  const partes: string[] = [];
  if (periodo.descricao) partes.push(periodo.descricao);
  if (periodo.estado !== "ABERTO") partes.push(periodo.estado.toLowerCase());
  return partes.length > 0 ? `${periodo.codigo} — ${partes.join(", ")}` : periodo.codigo;
}

// =============================================================================
// Componente
// =============================================================================

export function RhProcessamentoManager({
  proposito = "PROCESSAMENTO",
}: {
  proposito?: PropositoProcessamento;
} = {}) {
  const modoSimulacao = proposito === "SIMULACAO";
  const hoje = useMemo(() => dataHoje(), []);

  const [operacao, setOperacao] = useState<Operacao>("PROCESSAR");
  const [tipos, setTipos] = useState<TipoProcessamento[]>(["VENCIMENTO"]);
  const [incluirFimContrato, setIncluirFimContrato] = useState(false);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [periodoCodigo, setPeriodoCodigo] = useState(() => periodoDoMes(new Date().getMonth() + 1));
  const [diasProcessados, setDiasProcessados] = useState(30);
  const [dataProcessamento, setDataProcessamento] = useState(hoje);
  const [dataLimiteFaltasHE, setDataLimiteFaltasHE] = useState(() =>
    ultimoDiaDoMes(new Date().getFullYear(), new Date().getMonth() + 1)
  );

  const [erros, setErros] = useState<Record<string, string>>({});

  const [periodos, setPeriodos] = useState<RhPeriodoDto[]>([]);
  const [aCarregarPeriodos, setACarregarPeriodos] = useState(false);
  const [resultado, setResultado] = useState<RhProcessamentoLoaderResultado | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [pedidoAtivo, setPedidoAtivo] = useState<RhProcessamentoPedido | null>(null);

  // Operação "Anular" (RH-412): lista de processamentos do período e selecção.
  const [processamentos, setProcessamentos] = useState<RhProcessamentoResumoDto[]>([]);
  const [procsSelecionados, setProcsSelecionados] = useState<string[]>([]);
  const [carregouAnular, setCarregouAnular] = useState(false);
  const [anularAberto, setAnularAberto] = useState(false);
  const [anularAlvo, setAnularAlvo] = useState<RhProcessamentoResumoDto[]>([]);

  // Simulação (RH-413): resultado em memória, sem persistir.
  const [aSimular, setASimular] = useState(false);
  const [resultadoSim, setResultadoSim] = useState<SimulacaoResumo | null>(null);

  // A selecção é preenchida pela grelha (separador Processamentos). Sem selecção
  // o processamento é sempre em lote; exactamente 1 seleccionado = individual
  // (ver AGENTS §6.2 / spec §5.1 — "Fim de Contrato" só individual).
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const modo: ModoProcessamento = selecionados.length === 1 ? "INDIVIDUAL" : "LOTE";
  const fimContratoDesativado = modo === "LOTE";

  // Ao sair do modo individual remove o tipo "Fim de Contrato", que não é válido
  // em lote (AGENTS §6.2).
  const aplicarSelecionados = useCallback((ids: string[]) => {
    setSelecionados(ids);
    if (ids.length !== 1) {
      setTipos((atual) => (atual.includes("FIM_CONTRATO") ? atual.filter((t) => t !== "FIM_CONTRATO") : atual));
      setIncluirFimContrato(false);
    }
  }, []);

  const carregarPeriodos = useCallback(async (anoAlvo: number) => {
    setACarregarPeriodos(true);
    try {
      const resp = await rhApi.config.periodos.listar(anoAlvo);
      if (resp.success) {
        setPeriodos(resp.data);
      } else {
        setPeriodos([]);
      }
    } catch {
      setPeriodos([]);
    } finally {
      setACarregarPeriodos(false);
    }
  }, []);

  useEffect(() => {
    void carregarPeriodos(ano);
  }, [ano, carregarPeriodos]);

  // Ao mudar de ano, mantém o período coerente com o mês escolhido.
  const periodoSelecionado = periodos.find((p) => p.codigo === periodoCodigo) ?? null;

  const handleAnoChange = (novoAno: number) => {
    setAno(novoAno);
    setResultado(null);
    setResultadoSim(null);
  };

  const handleMesChange = (novoMes: number) => {
    setMes(novoMes);
    setPeriodoCodigo(periodoDoMes(novoMes));
    setDataLimiteFaltasHE(ultimoDiaDoMes(ano, novoMes));
    setResultado(null);
    setResultadoSim(null);
  };

  const handlePeriodoChange = (codigo: string) => {
    setPeriodoCodigo(codigo);
    const p = periodos.find((item) => item.codigo === codigo);
    if (p) {
      setMes(p.mes);
      setDataLimiteFaltasHE(ultimoDiaDoMes(ano, p.mes));
    }
    setResultado(null);
    setResultadoSim(null);
  };

  const toggleTipo = (tipo: TipoProcessamento, activo: boolean) => {
    setTipos((atual) => {
      if (activo) return atual.includes(tipo) ? atual : [...atual, tipo];
      return atual.filter((t) => t !== tipo);
    });
    setResultado(null);
    setResultadoSim(null);
  };

  const validar = useCallback((): ProcessamentoForm | null => {
    const dados = {
      operacao,
      tipos,
      incluirFimContrato,
      ano,
      periodoCodigo,
      mes,
      diasProcessados,
      dataProcessamento,
      dataLimiteFaltasHE,
    };
    const parsed = processamentoSchema.safeParse(dados);
    if (!parsed.success) {
      setErros(flattenIssues(parsed.error));
      toast.error("Corrija os parâmetros antes de continuar.");
      return null;
    }
    if (modo === "LOTE" && parsed.data.tipos.includes("FIM_CONTRATO")) {
      setErros({ tipos: "Fim de Contrato só pode ser processado individualmente." });
      toast.error("Fim de Contrato não está disponível em processamento em lote.");
      return null;
    }
    if (parsed.data.tipos.includes("FIM_CONTRATO") && !parsed.data.incluirFimContrato) {
      setErros({
        incluirFimContrato:
          'Active "Processar funcionários com data de fim de contrato" para incluir cessações.',
      });
      toast.error("Active a opção de fim de contrato.");
      return null;
    }
    setErros({});
    return parsed.data;
  }, [
    operacao,
    tipos,
    incluirFimContrato,
    ano,
    periodoCodigo,
    mes,
    diasProcessados,
    dataProcessamento,
    dataLimiteFaltasHE,
    modo,
  ]);

  const actualizar = useCallback(async () => {
    const dados = validar();
    if (!dados) return;
    setACarregar(true);
    setResultadoSim(null);

    if (operacao === "ANULAR") {
      try {
        const resp = await rhApi.processamento.listar({
          ano: dados.ano,
          mes: dados.mes,
          periodoCodigo: dados.periodoCodigo,
        });
        if (resp.success) {
          setProcessamentos(resp.data);
          setProcsSelecionados([]);
          setCarregouAnular(true);
          toast.success(
            resp.data.length > 0
              ? `${resp.data.length} processamento${resp.data.length === 1 ? "" : "s"} no período.`
              : "Sem processamentos no período indicado."
          );
        } else {
          setProcessamentos([]);
          setProcsSelecionados([]);
          setCarregouAnular(true);
          toast.error(resp.error?.message || "Erro ao listar processamentos.");
        }
      } catch {
        setProcessamentos([]);
        setProcsSelecionados([]);
        setCarregouAnular(true);
        toast.error("Erro inesperado ao listar processamentos.");
      } finally {
        setACarregar(false);
      }
      return;
    }

    try {
      const resp = await rhApi.processamento.carregar({
        ano: dados.ano,
        mes: dados.mes,
        periodoCodigo: dados.periodoCodigo,
        incluirFimContrato: dados.incluirFimContrato,
        dataLimiteFaltasHE: dados.dataLimiteFaltasHE,
        dataProcessamento: dados.dataProcessamento,
        tipoProcessamento: dados.tipos[0],
      });
      if (resp.success) {
        setResultado(resp.data);
        setSelecionados([]);
        if (!resp.data.periodo) {
          toast.warning("Período não encontrado para o ano/mês indicados. Gere os períodos do ano.");
        } else {
          const elegiveis = resp.data.elegibilidade.elegiveis.length;
          const restricoes = resp.data.elegibilidade.restricoes.length;
          toast.success(
            `Lista actualizada: ${elegiveis} elegíve${elegiveis === 1 ? "l" : "is"}, ${restricoes} com restrição.`
          );
        }
      } else {
        setResultado(null);
        setSelecionados([]);
        toast.error(resp.error?.message || "Erro ao carregar funcionários elegíveis.");
      }
    } catch {
      setResultado(null);
      setSelecionados([]);
      toast.error("Erro inesperado ao carregar funcionários elegíveis.");
    } finally {
      setACarregar(false);
    }
  }, [validar, operacao]);

  const processar = useCallback(() => {
    const dados = validar();
    if (!dados) return;
    if (!resultado) {
      toast.error("Actualize a lista de funcionários antes de processar.");
      return;
    }
    if (selecionados.length === 0) {
      toast.error("Selecione pelo menos um funcionário na grelha.");
      return;
    }

    const funcionarios = selecionados.flatMap((id) => {
      const f = resultado.funcionarios.find((x) => x.funcionario.id === id)?.funcionario;
      return f ? [{ id: f.id, codigo: f.codigo, nome: f.nome }] : [];
    });
    if (funcionarios.length === 0) {
      toast.error("Os funcionários seleccionados já não estão na lista. Actualize os dados.");
      return;
    }

    const tiposEfetivos = modo === "LOTE" ? tipos.filter((t) => t !== "FIM_CONTRATO") : tipos;
    if (tiposEfetivos.length === 0) {
      toast.error("Selecione pelo menos um tipo de processamento.");
      return;
    }

    setPedidoAtivo({
      modo,
      ano,
      mes,
      periodoCodigo,
      tipos: tiposEfetivos,
      incluirFimContrato,
      diasProcessados,
      dataProcessamento,
      dataLimiteFaltasHE,
      funcionarios,
    });
    setDialogAberto(true);
  }, [
    validar,
    resultado,
    selecionados,
    modo,
    tipos,
    ano,
    mes,
    periodoCodigo,
    incluirFimContrato,
    diasProcessados,
    dataProcessamento,
    dataLimiteFaltasHE,
  ]);

  const anular = useCallback(() => {
    const dados = validar();
    if (!dados) return;
    if (procsSelecionados.length === 0) {
      toast.error("Selecione pelo menos um processamento para anular.");
      return;
    }
    const alvo = processamentos.filter((p) => procsSelecionados.includes(p.id) && !p.jaAnulado);
    if (alvo.length === 0) {
      toast.error("Os processamentos seleccionados já não estão disponíveis. Actualize os dados.");
      return;
    }
    setAnularAlvo(alvo);
    setAnularAberto(true);
  }, [validar, procsSelecionados, processamentos]);

  const executarOperacao = useCallback(() => {
    if (operacao === "ANULAR") {
      anular();
    } else {
      processar();
    }
  }, [operacao, anular, processar]);

  // Simulação (RH-413): corre o motor para os funcionários seleccionados (ou
  // todos os elegíveis) sem gravar nada na BD; agrega por funcionário/tipo.
  const executarSimulacao = useCallback(async () => {
    const dados = validar();
    if (!dados) return;
    if (!resultado) {
      toast.error("Actualize a lista de funcionários antes de simular.");
      return;
    }

    const alvoIds =
      selecionados.length > 0 ? selecionados : resultado.elegibilidade.elegiveis;
    if (alvoIds.length === 0) {
      toast.error("Não há funcionários elegíveis para simular.");
      return;
    }

    const tiposEfetivos = modo === "LOTE" ? dados.tipos.filter((t) => t !== "FIM_CONTRATO") : dados.tipos;
    if (tiposEfetivos.length === 0) {
      toast.error("Selecione pelo menos um tipo de processamento.");
      return;
    }

    setASimular(true);
    const linhas: SimulacaoLinha[] = [];
    const avisos: string[] = [];
    let totalRemuneracoes = 0;
    let totalDescontos = 0;
    let totalLiquido = 0;

    try {
      for (const tipo of tiposEfetivos) {
        const resp = await rhApi.processamento.simular({
          modo,
          tipos: [tipo],
          tipoProcessamento: tipo,
          incluirFimContrato: dados.incluirFimContrato,
          ano: dados.ano,
          mes: dados.mes,
          periodoCodigo: dados.periodoCodigo,
          diasProcessados: dados.diasProcessados,
          dataProcessamento: dados.dataProcessamento,
          dataLimiteFaltasHE: dados.dataLimiteFaltasHE,
          funcionarioIds: alvoIds,
        });

        if (!resp.success) {
          avisos.push(`${ROTULO_TIPO[tipo]}: ${resp.error?.message ?? "falha na simulação."}`);
          continue;
        }

        for (const f of resp.data.funcionarios) {
          const remuneracoes = Number(f.totais?.remuneracoes) || 0;
          const descontos = Number(f.totais?.descontos) || 0;
          const liquido = Number(f.totais?.liquido) || 0;
          totalRemuneracoes += remuneracoes;
          totalDescontos += descontos;
          totalLiquido += liquido;
          f.avisos.forEach((a) => avisos.push(`${f.codigo}: ${a}`));
          linhas.push({
            funcionarioId: f.funcionarioId,
            codigo: f.codigo,
            nome: f.nome,
            tipo,
            sucesso: f.sucesso,
            erro: f.erro,
            remuneracoes,
            descontos,
            liquido,
            avisos: f.avisos,
          });
        }
      }

      const sucessos = linhas.filter((l) => l.sucesso).length;
      setResultadoSim({
        linhas,
        totalRemuneracoes,
        totalDescontos,
        totalLiquido,
        sucessos,
        erros: linhas.length - sucessos,
        avisos,
      });
      toast.success(
        linhas.length > 0
          ? `Simulação concluída: ${linhas.length} cálculo${linhas.length === 1 ? "" : "s"} (sem gravar).`
          : "A simulação não produziu resultados."
      );
    } catch {
      toast.error("Erro inesperado ao simular.");
    } finally {
      setASimular(false);
    }
  }, [
    validar,
    resultado,
    selecionados,
    modo,
  ]);

  const exportarCsv = useCallback(() => {
    if (!resultadoSim || resultadoSim.linhas.length === 0) {
      toast.error("Não há simulação para exportar.");
      return;
    }
    const cabecalho = ["Código", "Nome", "Tipo", "Remunerações", "Descontos", "Líquido", "Estado"];
    const corpo = resultadoSim.linhas.map((l) => [
      l.codigo,
      l.nome,
      ROTULO_TIPO[l.tipo],
      num2(l.remuneracoes),
      num2(l.descontos),
      num2(l.liquido),
      l.sucesso ? "OK" : l.erro ? "Erro" : "Aviso",
    ]);
    const csv = [cabecalho, ...corpo]
      .map((linha) => linha.map((c) => csvEscapar(c)).join(";"))
      .join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `simulacao-salarios-${periodoCodigo}-${ano}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Simulação exportada para CSV.");
  }, [resultadoSim, periodoCodigo, ano]);

  const cancelar = useCallback(() => {
    setOperacao("PROCESSAR");
    setTipos(["VENCIMENTO"]);
    setIncluirFimContrato(false);
    setAno(new Date().getFullYear());
    setMes(new Date().getMonth() + 1);
    setPeriodoCodigo(periodoDoMes(new Date().getMonth() + 1));
    setDiasProcessados(30);
    setDataProcessamento(dataHoje());
    setDataLimiteFaltasHE(ultimoDiaDoMes(new Date().getFullYear(), new Date().getMonth() + 1));
    setErros({});
    setResultado(null);
    setSelecionados([]);
    setProcessamentos([]);
    setProcsSelecionados([]);
    setCarregouAnular(false);
    setResultadoSim(null);
    toast.message("Parâmetros reiniciados.");
  }, []);

  // Atalhos de teclado (AGENTS §6.2 / §5): Tab natural, Enter submete,
  // Alt+A actualiza, Alt+P processa, F1 ajuda, Esc cancela.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        setAjudaAberta(true);
        return;
      }
      if (event.altKey && (event.key === "a" || event.key === "A")) {
        event.preventDefault();
        void actualizar();
        return;
      }
      if (event.altKey && (event.key === "p" || event.key === "P")) {
        event.preventDefault();
        if (modoSimulacao) {
          void executarSimulacao();
        } else {
          executarOperacao();
        }
        return;
      }
      if (event.key === "Escape" && !ajudaAberta) {
        const alvo = event.target as HTMLElement | null;
        const tag = alvo?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        cancelar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actualizar, executarOperacao, executarSimulacao, modoSimulacao, cancelar, ajudaAberta]);

  const elegiveis = resultado?.elegibilidade.elegiveis.length ?? 0;
  const restricoes = resultado?.elegibilidade.restricoes.length ?? 0;
  const tipoPrincipal = tipos[0] ?? "VENCIMENTO";

  const totalProcessamentos = processamentos.length;
  const processamentosAnulados = processamentos.filter((p) => p.jaAnulado).length;
  const processamentosAnulaveis = totalProcessamentos - processamentosAnulados;
  const totalSelecionadoProc = processamentos
    .filter((p) => procsSelecionados.includes(p.id))
    .reduce((acc, p) => acc + (Number(p.liquido) || 0), 0);

  return (
    <div className="space-y-4" data-testid="rh-processamento">
      {/* Barra de acções */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Button onClick={() => void actualizar()} disabled={aCarregar}>
          {aCarregar ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Actualizar
          <kbd className="ml-2 rounded border border-border px-1 text-[10px] text-muted-foreground">
            Alt+A
          </kbd>
        </Button>
        {modoSimulacao ? (
          <>
            <Button onClick={() => void executarSimulacao()} disabled={aSimular || aCarregar}>
              {aSimular ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Simular
              <kbd className="ml-2 rounded border border-white/30 px-1 text-[10px] opacity-80">Alt+P</kbd>
            </Button>
            <Button
              variant="outline"
              onClick={exportarCsv}
              disabled={!resultadoSim || resultadoSim.linhas.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </>
        ) : (
          <Button
            variant={operacao === "ANULAR" ? "destructive" : "default"}
            onClick={executarOperacao}
          >
            {operacao === "ANULAR" ? (
              <Ban className="mr-2 h-4 w-4" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {operacao === "ANULAR" ? "Anular" : "Processar"}
            <kbd className="ml-2 rounded border border-white/30 px-1 text-[10px] opacity-80">Alt+P</kbd>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Contexto
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Contexto actual</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              Operação: {modoSimulacao ? "Simulação" : operacao === "ANULAR" ? "Anular" : "Processar"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Modo: {modo === "INDIVIDUAL" ? "Individual" : "Em lote"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Período: {periodoCodigo} · {MESES[mes - 1]} {ano}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Período na BD: {periodoSelecionado ? periodoSelecionado.estado : "não gerado"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Tipos: {tipos.length}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void carregarPeriodos(ano)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar períodos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" onClick={() => setAjudaAberta(true)}>
          <CircleHelp className="mr-2 h-4 w-4" />
          Ajuda
          <kbd className="ml-2 rounded border border-border px-1 text-[10px] text-muted-foreground">F1</kbd>
        </Button>

        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
            modoSimulacao
              ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
              : operacao === "ANULAR"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : modo === "INDIVIDUAL"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {modoSimulacao ? (
            <>
              <Play className="h-3.5 w-3.5" />
              Simulação
              {resultado && ` · ${selecionados.length > 0 ? selecionados.length : elegiveis} func.`}
              {resultadoSim && ` · ${resultadoSim.linhas.length} cálculo${resultadoSim.linhas.length === 1 ? "" : "s"}`}
            </>
          ) : operacao === "ANULAR" ? (
            <>
              <Ban className="h-3.5 w-3.5" />
              Anulação
              {carregouAnular && ` · ${procsSelecionados.length}/${processamentosAnulaveis}`}
            </>
          ) : (
            <>
              <Users className="h-3.5 w-3.5" />
              {modo === "INDIVIDUAL" ? "Individual" : "Em lote"}
              {resultado && ` · ${selecionados.length}/${elegiveis}`}
            </>
          )}
        </span>

        <Button variant="outline" onClick={cancelar}>
          <X className="mr-2 h-4 w-4" />
          Cancelar
        </Button>
      </div>

      {/* Parâmetros */}
      <FormSurface
        className="h-[calc(100dvh-14rem)]"
        title="Parâmetros"
        bodyClassName="p-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={cancelar}>
              Repor
            </Button>
            <Button type="submit" form="rh-processamento-parametros">
              Actualizar
            </Button>
          </div>
        }
      >
        <form
          id="rh-processamento-parametros"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void actualizar();
          }}
        >
        {/* Operação */}
        {!modoSimulacao && (
          <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
            <div>
              <Label htmlFor="operacao" className="mb-1 block">
                Operação
              </Label>
              <Select
                value={operacao}
                onValueChange={(v) => {
                  setOperacao(v as Operacao);
                  setErros({});
                  setProcsSelecionados([]);
                }}
              >
                <SelectTrigger id="operacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROCESSAR">Processar</SelectItem>
                  <SelectItem value="ANULAR">Anular processamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Tipos */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tipos de processamento
          </legend>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {TIPOS_PROCESSAMENTO.map((tipo) => {
              const desativado = tipo === "FIM_CONTRATO" && fimContratoDesativado;
              return (
                <label
                  key={tipo}
                  className={`flex items-center gap-2 text-sm ${desativado ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  title={desativado ? "Fim de Contrato só é processado individualmente." : undefined}
                >
                  <Checkbox
                    checked={tipos.includes(tipo)}
                    disabled={desativado}
                    onCheckedChange={(v) => toggleTipo(tipo, v === true)}
                    aria-label={ROTULO_TIPO[tipo]}
                  />
                  <span>{ROTULO_TIPO[tipo]}</span>
                </label>
              );
            })}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={incluirFimContrato}
                onCheckedChange={(v) => setIncluirFimContrato(v === true)}
                aria-label="Processar funcionários com data de fim de contrato"
              />
              <span>Processar funcionários com data de fim de contrato</span>
            </label>
          </div>
          {erros.tipos && <p className="text-xs font-medium text-destructive">{erros.tipos}</p>}
          {erros.incluirFimContrato && (
            <p className="text-xs font-medium text-destructive">{erros.incluirFimContrato}</p>
          )}
        </fieldset>

        {/* Parâmetros */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <Label htmlFor="ano" className="mb-1 block">
              Ano
            </Label>
            <Select value={String(ano)} onValueChange={(v) => handleAnoChange(Number(v))}>
              <SelectTrigger id="ano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANOS_DISPONIVEIS.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {erros.ano && <p className="mt-1 text-xs font-medium text-destructive">{erros.ano}</p>}
          </div>

          <div>
            <Label htmlFor="periodo" className="mb-1 block">
              Período
            </Label>
            <Select value={periodoCodigo} onValueChange={handlePeriodoChange}>
              <SelectTrigger id="periodo">
                <SelectValue placeholder={aCarregarPeriodos ? "A carregar…" : "Período"} />
              </SelectTrigger>
              <SelectContent>
                {(periodos.length > 0
                  ? periodos.map((p) => ({ value: p.codigo, label: descricaoPeriodo(p) }))
                  : MESES.map((_, i) => ({ value: periodoDoMes(i + 1), label: periodoDoMes(i + 1) }))
                ).map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {erros.periodoCodigo && (
              <p className="mt-1 text-xs font-medium text-destructive">{erros.periodoCodigo}</p>
            )}
          </div>

          <div>
            <Label htmlFor="mes" className="mb-1 block">
              Mês
            </Label>
            <Select value={String(mes)} onValueChange={(v) => handleMesChange(Number(v))}>
              <SelectTrigger id="mes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nome, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {erros.mes && <p className="mt-1 text-xs font-medium text-destructive">{erros.mes}</p>}
          </div>

          <div>
            <Label htmlFor="dias" className="mb-1 block">
              Dias proc.
            </Label>
            <Input
              id="dias"
              type="number"
              min={0}
              max={31}
              value={diasProcessados}
              onChange={(e) => {
                setDiasProcessados(Number(e.target.value));
                setResultado(null);
                setResultadoSim(null);
              }}
              className="tabular-nums"
            />
            {erros.diasProcessados && (
              <p className="mt-1 text-xs font-medium text-destructive">{erros.diasProcessados}</p>
            )}
          </div>

          <div>
            <Label htmlFor="data-processamento" className="mb-1 block">
              Data
            </Label>
            <Input
              id="data-processamento"
              type="date"
              value={dataProcessamento}
              onChange={(e) => setDataProcessamento(e.target.value)}
            />
            {erros.dataProcessamento && (
              <p className="mt-1 text-xs font-medium text-destructive">{erros.dataProcessamento}</p>
            )}
          </div>

          <div>
            <Label htmlFor="data-limite" className="mb-1 block">
              Faltas / H.Extra
            </Label>
            <Input
              id="data-limite"
              type="date"
              value={dataLimiteFaltasHE}
              onChange={(e) => setDataLimiteFaltasHE(e.target.value)}
            />
            {erros.dataLimiteFaltasHE && (
              <p className="mt-1 text-xs font-medium text-destructive">{erros.dataLimiteFaltasHE}</p>
            )}
          </div>
        </div>

        {/* Estado do período */}
        {periodoSelecionado && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>
              Período {periodoSelecionado.codigo} ({periodoSelecionado.descricao}) ·{" "}
              {new Date(periodoSelecionado.dataInicio).toLocaleDateString("pt-PT")} –{" "}
              {new Date(periodoSelecionado.dataFim).toLocaleDateString("pt-PT")}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                periodoSelecionado.estado === "ABERTO"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600"
              }`}
            >
              {periodoSelecionado.estado}
            </span>
          </div>
        )}
        </form>
      </FormSurface>

      {/* Conteúdo inferior — grelha e separadores (RH-410) / anulação (RH-412) */}
      <div
        data-testid="rh-processamento-conteudo"
        className="rounded-lg border border-border bg-card p-6"
      >
        {operacao === "ANULAR" ? (
          aCarregar ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">A carregar processamentos…</p>
            </div>
          ) : carregouAnular ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ResumoCartao
                  icone={<FileCheck2 className="h-4 w-4 text-blue-600" />}
                  rotulo="Processamentos"
                  valor={String(totalProcessamentos)}
                />
                <ResumoCartao
                  icone={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  rotulo="Anuláveis"
                  valor={String(processamentosAnulaveis)}
                />
                <ResumoCartao
                  icone={<Ban className="h-4 w-4 text-muted-foreground" />}
                  rotulo="Anulados"
                  valor={String(processamentosAnulados)}
                />
                <ResumoCartao
                  icone={<Info className="h-4 w-4 text-primary" />}
                  rotulo="Seleccionado"
                  valor={fmtMoeda.format(totalSelecionadoProc)}
                />
              </div>
              <RhAnularConteudo
                processamentos={processamentos}
                selecionados={procsSelecionados}
                onSelecionadosChange={setProcsSelecionados}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <Ban className="h-8 w-8 opacity-40" />
              <p className="text-sm font-medium text-foreground">Sem dados carregados</p>
              <p className="max-w-md text-xs">
                Defina o período e clique em <span className="font-medium">Actualizar</span> para
                listar os processamentos efectuados que podem ser anulados.
              </p>
            </div>
          )
        ) : aCarregar ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">A carregar funcionários elegíveis…</p>
          </div>
        ) : resultado ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ResumoCartao
                icone={<Users className="h-4 w-4 text-emerald-600" />}
                rotulo="Elegíveis"
                valor={String(elegiveis)}
              />
              <ResumoCartao
                icone={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                rotulo="Com restrição"
                valor={String(restricoes)}
              />
              <ResumoCartao
                icone={<Info className="h-4 w-4 text-blue-600" />}
                rotulo="Periodo"
                valor={resultado.periodo ? resultado.periodo.codigo : "—"}
              />
              <ResumoCartao
                icone={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
                rotulo="Base dias"
                valor={String(resultado.baseDiasMes)}
              />
            </div>
            <RhProcessamentoConteudo
              resultado={resultado}
              tipoLabel={ROTULO_TIPO[tipoPrincipal]}
              tipoAbrev={ABREV_TIPO[tipoPrincipal]}
              selecionados={selecionados}
              onSelecionadosChange={aplicarSelecionados}
            />
            {modoSimulacao && (
              <SimulacaoResultado
                aSimular={aSimular}
                resultado={resultadoSim}
                onExportar={exportarCsv}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium text-foreground">Sem dados carregados</p>
            <p className="max-w-md text-xs">
              Defina os parâmetros e clique em <span className="font-medium">Actualizar</span> para
              obter a lista de funcionários elegíveis para o período.
            </p>
          </div>
        )}
      </div>

      {/* Ajuda */}
      <Dialog open={ajudaAberta} onOpenChange={setAjudaAberta}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Ajuda — {modoSimulacao ? "Simulação de salários" : "Processamento de salários"}
            </DialogTitle>
            <DialogDescription>
              {modoSimulacao
                ? "Escolha os tipos e os parâmetros do período, simule e exporte o resultado. Nada é gravado na base de dados."
                : "Escolha a operação, os tipos e os parâmetros do período e actualize a lista de funcionários elegíveis."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-inside list-disc space-y-1">
              <li>
                <span className="font-medium text-foreground">Actualizar (Alt+A)</span> — recarrega
                a lista de funcionários elegíveis para os parâmetros escolhidos.
              </li>
              {modoSimulacao ? (
                <>
                  <li>
                    <span className="font-medium text-foreground">Simular (Alt+P)</span> — calcula
                    os valores dos funcionários seleccionados (ou de todos os elegíveis) sem gravar
                    (RH-413).
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Exportar CSV</span> — descarrega o
                    resultado da simulação (apenas depois de simular).
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <span className="font-medium text-foreground">Processar (Alt+P)</span> — confirma e
                    executa o processamento (RH-411).
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Anular (Alt+P, operação Anular)</span> —
                    lista os processamentos do período e anula os seleccionados, com motivo obrigatório
                    (RH-412). Requer pagamento não efectuado e período aberto.
                  </li>
                </>
              )}
              <li>
                <span className="font-medium text-foreground">F1</span> — abre esta ajuda.
              </li>
              <li>
                <span className="font-medium text-foreground">Esc</span> — cancela e reinicia os
                parâmetros.
              </li>
            </ul>
            <p>
              O tipo <span className="font-medium text-foreground">Fim de Contrato</span> só está
              disponível em processamento individual (um funcionário seleccionado).
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação, progresso e relatório (RH-411) */}
      <RhProcessarDialog
        aberto={dialogAberto}
        onOpenChange={setDialogAberto}
        pedido={pedidoAtivo}
        onConcluido={() => {
          void actualizar();
        }}
      />

      {/* Confirmação e resultado da anulação (RH-412) */}
      <RhAnularDialog
        aberto={anularAberto}
        onOpenChange={setAnularAberto}
        processamentos={anularAlvo}
        onConcluido={() => {
          void actualizar();
        }}
      />
    </div>
  );
}

function ResumoCartao({
  icone,
  rotulo,
  valor,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icone}
        <span>{rotulo}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

function SimulacaoResultado({
  aSimular,
  resultado,
  onExportar,
}: {
  aSimular: boolean;
  resultado: SimulacaoResumo | null;
  onExportar: () => void;
}) {
  if (aSimular) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-8 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm">A calcular a simulação (sem gravar)…</p>
      </div>
    );
  }

  if (!resultado) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center text-muted-foreground">
        <Play className="h-7 w-7 opacity-40" />
        <p className="text-sm font-medium text-foreground">Simulação ainda não executada</p>
        <p className="max-w-md text-xs">
          Selecione funcionários (ou nenhum para simular todos os elegíveis) e clique em
          <span className="font-medium"> Simular</span>. Nada é gravado na base de dados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Resultado da simulação (não gravado)</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportar}
          disabled={resultado.linhas.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumoCartao
          icone={<FileCheck2 className="h-4 w-4 text-blue-600" />}
          rotulo="Cálculos"
          valor={String(resultado.linhas.length)}
        />
        <ResumoCartao
          icone={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          rotulo="Sem erros"
          valor={String(resultado.sucessos)}
        />
        <ResumoCartao
          icone={<XCircle className="h-4 w-4 text-rose-600" />}
          rotulo="Com erros"
          valor={String(resultado.erros)}
        />
        <ResumoCartao
          icone={<Info className="h-4 w-4 text-primary" />}
          rotulo="Total líquido"
          valor={fmtMoeda.format(resultado.totalLiquido)}
        />
      </div>

      {resultado.linhas.length > 0 ? (
        <div className="max-h-[45vh] overflow-auto rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Funcionário</th>
                <th className="px-3 py-2 text-left font-medium">Nome</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Remunerações</th>
                <th className="px-3 py-2 text-right font-medium">Descontos</th>
                <th className="px-3 py-2 text-right font-medium">Líquido</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((l, i) => (
                <tr key={`${l.funcionarioId}-${l.tipo}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{l.codigo}</td>
                  <td className="px-3 py-2">{l.nome}</td>
                  <td className="px-3 py-2 text-xs">{ROTULO_TIPO[l.tipo]}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {fmtMoeda.format(l.remuneracoes)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {fmtMoeda.format(l.descontos)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {fmtMoeda.format(l.liquido)}
                  </td>
                  <td className="px-3 py-2">
                    {l.sucesso ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
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
            <tfoot className="bg-muted/40 font-medium">
              <tr className="border-t border-border">
                <td className="px-3 py-2 text-xs" colSpan={3}>
                  Totais ({resultado.linhas.length})
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {fmtMoeda.format(resultado.totalRemuneracoes)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {fmtMoeda.format(resultado.totalDescontos)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {fmtMoeda.format(resultado.totalLiquido)}
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          A simulação não devolveu cálculos para os funcionários indicados.
        </p>
      )}

      {resultado.avisos.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="list-inside list-disc space-y-1">
            {resultado.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
