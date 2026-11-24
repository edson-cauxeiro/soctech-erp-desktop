/**
 * @file LancamentosManager.tsx
 * @description Lançamentos de tesouraria: listagem com filtros e totais do
 * período, lançamento manual, confirmação e estorno.
 *
 * Um estorno nunca apaga o movimento original: cria o inverso e marca o
 * original como estornado. É por isso que a coluna "Estado" existe — o número
 * continua no histórico e a lista diz o que aconteceu.
 */

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet,
} from "lucide-react";
import {
  ContaBancariaComSaldoDto,
  MovimentoTesourariaDto,
  ResumoTesourariaDto,
  TipoMovimentoTesouraria,
} from "../../@types/electron";
import { tesourariaApi } from "../../api/tesouraria.api";
import { useAuth } from "../../hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FormDialog } from "./FormDialog";
import {
  FormShell,
  FormSection,
  NumberField,
  DateField,
  SelectField,
  TextAreaField,
} from "./FormPrimitives";
import { SearchSelect } from "../ui/SearchSelect";
import { KpiCard, StatusBadge } from "./Primitives";
import { formatCurrency } from "@/utils/currency";
import { toast } from "sonner";

const TIPO_LABEL: Record<TipoMovimentoTesouraria, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
  ajuste: "Ajuste",
};

const TIPO_ICON: Record<TipoMovimentoTesouraria, typeof ArrowDownLeft> = {
  entrada: ArrowDownLeft,
  saida: ArrowUpRight,
  transferencia: ArrowLeftRight,
  ajuste: RotateCcw,
};

const ESTADO_TONE = {
  confirmado: "success",
  pendente: "warning",
  estornado: "danger",
} as const;

const MEIOS_PAGAMENTO = ["numerario", "multicaixa", "cheque", "transferencia"] as const;

function formatarData(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function LancamentosManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || "";

  const [movimentos, setMovimentos] = useState<MovimentoTesourariaDto[]>([]);
  const [resumo, setResumo] = useState<ResumoTesourariaDto | null>(null);
  const [contas, setContas] = useState<ContaBancariaComSaldoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [contaFiltro, setContaFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [conciliadoFiltro, setConciliadoFiltro] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [aEstornar, setAEstornar] = useState<MovimentoTesourariaDto | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const fetchDados = useCallback(async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      const [lista, res, listaContas] = await Promise.all([
        tesourariaApi.listarMovimentos({
          empresaId,
          search: search.trim() || undefined,
          contaId: contaFiltro || undefined,
          tipo: (tipoFiltro as TipoMovimentoTesouraria) || undefined,
          conciliado: conciliadoFiltro === "sim" ? true : conciliadoFiltro === "nao" ? false : undefined,
          take: 200,
        }),
        tesourariaApi.resumo({
          empresaId,
          contaId: contaFiltro || undefined,
          tipo: (tipoFiltro as TipoMovimentoTesouraria) || undefined,
        }),
        tesourariaApi.listarContasComSaldos({ empresaId, apenasAtivas: true }),
      ]);

      if (lista.success) setMovimentos(lista.data.items);
      else toast.error("Erro ao carregar lançamentos: " + lista.error.message);
      if (res.success) setResumo(res.data);
      if (listaContas.success) setContas(listaContas.data.items);
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, search, contaFiltro, tipoFiltro, conciliadoFiltro]);

  useEffect(() => {
    const timer = setTimeout(fetchDados, 250);
    return () => clearTimeout(timer);
  }, [fetchDados]);

  const handleConfirmar = async (m: MovimentoTesourariaDto) => {
    const res = await tesourariaApi.confirmarMovimento(m.id);
    if (res.success) {
      toast.success(`Lançamento ${m.numero} confirmado.`);
      fetchDados();
    } else {
      toast.error(res.error.message);
    }
  };

  const handleConciliar = async (m: MovimentoTesourariaDto) => {
    const res = await tesourariaApi.conciliarMovimento(m.id, !m.conciliado);
    if (res.success) {
      toast.success(
        m.conciliado
          ? `Lançamento ${m.numero} voltou a pendente.`
          : `Lançamento ${m.numero} conciliado com o extracto.`
      );
      fetchDados();
    } else {
      toast.error(res.error.message);
    }
  };

  const handleEstornar = async () => {
    if (!aEstornar) return;
    if (motivoEstorno.trim().length < 3) {
      toast.error("Indique o motivo do estorno.");
      return;
    }
    try {
      setIsBusy(true);
      const res = await tesourariaApi.estornarMovimento(aEstornar.id, motivoEstorno.trim());
      if (res.success) {
        toast.success(`Lançamento ${res.data.numero} registado como estorno.`);
        setAEstornar(null);
        setMotivoEstorno("");
        fetchDados();
      } else {
        toast.error(res.error.message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const resultado = resumo?.resultado ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Entradas"
          value={formatCurrency(resumo?.totalEntradas ?? 0, "AOA")}
          icon={<ArrowDownLeft className="w-4 h-4" />}
          hint={resumo ? `${resumo.totalMovimentos} lançamentos` : undefined}
        />
        <KpiCard
          label="Saídas"
          value={formatCurrency(resumo?.totalSaidas ?? 0, "AOA")}
          trend="down"
          icon={<ArrowUpRight className="w-4 h-4" />}
          hint={resumo ? `${resumo.movimentosPendentes} por confirmar` : undefined}
        />
        <KpiCard
          label="Resultado do período"
          value={formatCurrency(resultado, "AOA")}
          trend={resultado >= 0 ? "up" : "down"}
          icon={<Wallet className="w-4 h-4" />}
          hint={resumo ? `${resumo.movimentosNaoConciliados} por conciliar` : undefined}
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={fetchDados}
            disabled={isLoading}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
            title="Actualizar"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Novo lançamento
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Pesquisar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Número, descrição ou documento"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
        </div>
        <div className="w-56">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Conta</label>
          <SearchSelect
            value={contaFiltro}
            onChange={setContaFiltro}
            options={contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.designacao}` }))}
            placeholder="Todas as contas"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo</label>
          <SearchSelect
            value={tipoFiltro}
            onChange={setTipoFiltro}
            options={(Object.keys(TIPO_LABEL) as TipoMovimentoTesouraria[]).map((t) => ({
              value: t,
              label: TIPO_LABEL[t],
            }))}
            placeholder="Todos"
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Conciliação</label>
          <SearchSelect
            value={conciliadoFiltro}
            onChange={setConciliadoFiltro}
            options={[
              { value: "sim", label: "Conciliados" },
              { value: "nao", label: "Por conciliar" },
            ]}
            placeholder="Todos"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-md shadow-[var(--shadow-card)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Nº</th>
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Conta</th>
              <th className="px-4 py-2 font-medium">Descrição</th>
              <th className="px-4 py-2 font-medium text-right">Valor</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium text-right">Acções</th>
            </tr>
          </thead>
          <tbody>
            {movimentos.map((m) => {
              const Icone = TIPO_ICON[m.tipo];
              const credita = m.tipo === "entrada" || (m.tipo === "ajuste" && m.contaDestinoId && !m.contaOrigemId);
              return (
                <tr key={m.id} className="border-t border-border hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{m.numero}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatarData(m.data)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Icone
                        className={[
                          "w-3.5 h-3.5",
                          credita ? "text-success" : m.tipo === "saida" ? "text-destructive" : "text-muted-foreground",
                        ].join(" ")}
                      />
                      {TIPO_LABEL[m.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {m.tipo === "transferencia"
                      ? `${m.contaOrigem?.codigo ?? "—"} → ${m.contaDestino?.codigo ?? "—"}`
                      : (m.contaDestino?.codigo ?? m.contaOrigem?.codigo ?? "—")}
                  </td>
                  <td className="px-4 py-2.5 max-w-56">
                    <div className="truncate">{m.descricao ?? "—"}</div>
                    {m.documentoNumero && (
                      <div className="text-xs text-muted-foreground truncate">{m.documentoNumero}</div>
                    )}
                  </td>
                  <td
                    className={[
                      "px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap",
                      credita ? "text-success" : m.tipo === "saida" ? "text-destructive" : "",
                    ].join(" ")}
                  >
                    {formatCurrency(m.valor, "AOA")}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.estado === "estornado" ? (
                      <StatusBadge tone="danger">Estornado</StatusBadge>
                    ) : (
                      <StatusBadge tone={ESTADO_TONE[m.estado]}>{m.estado}</StatusBadge>
                    )}
                    <div className="mt-1">
                      {m.conciliado ? (
                        <StatusBadge tone="success">Conciliado</StatusBadge>
                      ) : m.estado === "confirmado" ? (
                        <StatusBadge tone="neutral">Por conciliar</StatusBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {m.estado === "pendente" && (
                        <button
                          type="button"
                          onClick={() => handleConfirmar(m)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Confirmar"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {m.estado === "confirmado" && !m.movimentoEstornoId && (
                        <button
                          type="button"
                          onClick={() => handleConciliar(m)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title={m.conciliado ? "Voltar a pendente" : "Conciliar com o extracto"}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {m.estado === "confirmado" && !m.movimentoEstornoId && (
                        <button
                          type="button"
                          onClick={() => setAEstornar(m)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                          title="Estornar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {movimentos.length === 0 && !isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum lançamento corresponde aos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={modalAberto}
        onOpenChange={setModalAberto}
        title="Novo lançamento manual"
        description="Para recibos, faturas e transferências use o documento que os originou: o lançamento é criado com o documento, não à mão."
      >
        {empresaId && (
          <MovimentoForm
            empresaId={empresaId}
            contas={contas}
            onSaved={() => {
              setModalAberto(false);
              fetchDados();
            }}
            onCancel={() => setModalAberto(false)}
          />
        )}
      </FormDialog>

      <Dialog open={Boolean(aEstornar)} onOpenChange={(o) => !o && setAEstornar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Estornar {aEstornar?.numero}</DialogTitle>
            <DialogDescription>
              O lançamento original não desaparece: fica marcado como estornado e é criado o movimento
              inverso, que devolve o dinheiro à conta de origem.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Motivo do estorno</label>
            <textarea
              value={motivoEstorno}
              onChange={(e) => setMotivoEstorno(e.target.value)}
              rows={3}
              placeholder="Ex.: valor recebido em duplicado"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAEstornar(null)}
              className="h-9 px-4 rounded-md text-sm border border-border hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEstornar}
              disabled={isBusy}
              className="h-9 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Estornar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Formulário de lançamento
// ============================================================================

const movimentoSchema = z
  .object({
    data: z.string().min(1, "Obrigatório"),
    tipo: z.enum(["entrada", "saida", "transferencia", "ajuste"]),
    contaOrigemId: z.string().optional().or(z.literal("")),
    contaDestinoId: z.string().optional().or(z.literal("")),
    valor: z.coerce.number().positive("Indique um valor superior a zero"),
    meioPagamento: z.string().optional().or(z.literal("")),
    descricao: z.string().trim().max(240, "Máximo 240 caracteres").optional().or(z.literal("")),
    observacaoExtrato: z.string().trim().max(240).optional().or(z.literal("")),
  })
  .refine((v) => v.tipo !== "entrada" || !!v.contaDestinoId, {
    message: "Uma entrada precisa da conta que recebe o dinheiro.",
    path: ["contaDestinoId"],
  })
  .refine((v) => v.tipo !== "saida" || !!v.contaOrigemId, {
    message: "Uma saída precisa da conta de onde sai o dinheiro.",
    path: ["contaOrigemId"],
  })
  .refine(
    (v) =>
      v.tipo !== "transferencia" ||
      (!!v.contaOrigemId && !!v.contaDestinoId && v.contaOrigemId !== v.contaDestinoId),
    {
      message: "A transferência precisa de duas contas diferentes.",
      path: ["contaDestinoId"],
    }
  )
  .refine((v) => v.tipo !== "ajuste" || (v.descricao ?? "").trim().length > 0, {
    message: "Um ajuste tem de ser justificado com uma descrição.",
    path: ["descricao"],
  });

type MovimentoFormValues = z.infer<typeof movimentoSchema>;

function MovimentoForm({
  empresaId,
  contas,
  onSaved,
  onCancel,
}: {
  empresaId: string;
  contas: ContaBancariaComSaldoDto[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avisoSessao, setAvisoSessao] = useState<string | null>(null);

  const methods = useForm<MovimentoFormValues>({
    resolver: zodResolver(movimentoSchema),
    defaultValues: {
      data: new Date().toISOString().split("T")[0],
      tipo: "entrada",
      contaOrigemId: "",
      contaDestinoId: "",
      valor: 0,
      meioPagamento: "",
      descricao: "",
      observacaoExtrato: "",
    },
  });

  const { watch, setValue } = methods;
  const tipo = watch("tipo");
  const origem = watch("contaOrigemId");
  const destino = watch("contaDestinoId");
  const meioPagamento = watch("meioPagamento");

  const contaAfectada =
    tipo === "entrada"
      ? contas.find((c) => c.id === destino)
      : tipo === "saida"
        ? contas.find((c) => c.id === origem)
        : undefined;

  // Numerário só entra numa caixa com a sessão aberta; avisamos antes de gravar.
  useEffect(() => {
    if (!contaAfectada || contaAfectada.tipo !== "caixa") {
      setAvisoSessao(null);
      return;
    }
    let obsoleto = false;
    tesourariaApi
      .validarMeioPagamento({
        empresaId,
        meioPagamento: meioPagamento || "numerario",
        contaBancariaId: contaAfectada.id,
      })
      .then((res) => {
        if (obsoleto || !res.success) return;
        setAvisoSessao(
          res.data.exigeSessao && !res.data.sessaoAberta
            ? `${contaAfectada.codigo} não tem sessão de caixa aberta. Abra a sessão em Finanças › Contas.`
            : null
        );
      });
    return () => {
      obsoleto = true;
    };
  }, [contaAfectada, empresaId, meioPagamento]);

  // Ao mudar de tipo, limpa o lado que deixa de se aplicar para não enviar
  // uma conta escondida que o backend rejeitaria.
  useEffect(() => {
    if (tipo === "entrada") setValue("contaOrigemId", "");
    if (tipo === "saida") setValue("contaDestinoId", "");
    // Ajustes usam o destino para acrescentar e a origem para retirar.
    if (tipo === "ajuste") setValue("contaOrigemId", "");
  }, [tipo, setValue]);

  const opcoesConta = contas.map((c) => ({
    value: c.id,
    label: `${c.codigo} — ${c.designacao} · ${formatCurrency(c.saldo, c.moeda)}`,
  }));

  const onSubmit = async (v: MovimentoFormValues) => {
    try {
      setIsSubmitting(true);
      const res = await tesourariaApi.criarMovimento({
        empresaId,
        data: new Date(v.data),
        tipo: v.tipo,
        contaOrigemId: v.tipo === "entrada" ? null : v.contaOrigemId || null,
        contaDestinoId: v.tipo === "saida" ? null : v.contaDestinoId || null,
        valor: v.valor,
        meioPagamento: v.meioPagamento || null,
        descricao: v.descricao || null,
        observacaoExtrato: v.observacaoExtrato || null,
      });

      if (res.success) {
        toast.success(`Lançamento ${res.data.numero} registado.`);
        methods.reset();
        onSaved();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const mostraOrigem = tipo === "saida" || tipo === "transferencia" || tipo === "ajuste";
  const mostraDestino = tipo === "entrada" || tipo === "transferencia" || tipo === "ajuste";

  return (
    <FormShell
      methods={methods}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitLabel="Registar lançamento"
      dialogLayout
    >
      <FormSection title="Lançamento">
        <DateField name="data" label="Data" required span="1" />
        <SelectField
          name="tipo"
          label="Tipo"
          required
          span="1"
          options={(Object.keys(TIPO_LABEL) as TipoMovimentoTesouraria[]).map((t) => ({
            value: t,
            label: TIPO_LABEL[t],
          }))}
        />
        <NumberField name="valor" label="Valor (Kz)" required step="0.01" span="2" />

        {mostraOrigem && (
          <div className="sm:col-span-2 md:col-span-2 lg:col-span-2">
            <label className="text-xs font-medium text-foreground block mb-1">
              {tipo === "ajuste" ? "Conta a corrigir (retirar dinheiro)" : "Conta de origem"}
            </label>
            <SearchSelect
              value={origem}
              onChange={(v) => setValue("contaOrigemId", v, { shouldValidate: true, shouldDirty: true })}
              options={opcoesConta}
              placeholder="De onde sai o dinheiro"
            />
          </div>
        )}

        {mostraDestino && (
          <div className="sm:col-span-2 md:col-span-2 lg:col-span-2">
            <label className="text-xs font-medium text-foreground block mb-1">
              {tipo === "ajuste" ? "Conta a corrigir (acrescentar dinheiro)" : "Conta de destino"}
              {tipo !== "ajuste" && <span className="text-destructive"> *</span>}
            </label>
            <SearchSelect
              value={destino}
              onChange={(v) => setValue("contaDestinoId", v, { shouldValidate: true, shouldDirty: true })}
              options={opcoesConta}
              placeholder="Onde entra o dinheiro"
            />
            {avisoSessao && (
              <p className="mt-1 text-[11px] font-medium text-warning">{avisoSessao}</p>
            )}
          </div>
        )}

        <div className="sm:col-span-2 md:col-span-2 lg:col-span-2">
          <label className="text-xs font-medium text-foreground block mb-1">Meio de pagamento</label>
          <SearchSelect
            value={meioPagamento}
            onChange={(v) => setValue("meioPagamento", v, { shouldDirty: true })}
            options={MEIOS_PAGAMENTO.map((m) => ({ value: m, label: m }))}
            placeholder="Só necessário para caixas"
          />
        </div>
      </FormSection>

      <FormSection title="Descrição">
        <TextAreaField
          name="descricao"
          label="Descrição"
          required={tipo === "ajuste"}
          placeholder="Ex.: recebimento de cliente sem documento; conferência de fundo"
          span="full"
        />
        <TextAreaField
          name="observacaoExtrato"
          label="Observação do extracto"
          placeholder="Texto que aparece no extracto bancário para bater a linha"
          span="full"
        />
      </FormSection>

      {isSubmitting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A registar…
        </p>
      )}
    </FormShell>
  );
}
