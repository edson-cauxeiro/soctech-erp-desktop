/**
 * @file ContasBancariasManager.tsx
 * @description Contas bancárias e caixas da empresa, com o saldo derivado calculado
 * pelo backend.
 *
 * O saldo nunca se escreve: vem de `saldoInicial + Σcréditos − Σdébitos` sobre os
 * movimentos confirmados. Por isso esta lista é o sítio fiável para responder
 * "quanto dinheiro há", e por isso o formulário de conta não tem saldo para
 * editar — só o saldo inicial, no momento da criação.
 *
 * O ciclo de vida das sessões de caixa **não** vive aqui. Este ecrã listava as
 * contas; abrir, apurar e fechar uma sessão é trabalho da tab "Abertura de
 * Caixa" do menu de Finanças (`SessaoCaixaManager`), e manter as duas cópias
 * obrigava a corrigir o mesmo bug em dois sítios — o que já aconteceu.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { ContaBancariaComSaldoDto, ContaContabilDisponivelDto } from "../../@types/electron";
import { tesourariaApi } from "../../api/tesouraria.api";
import { useAuth } from "../../hooks/useAuth";
import { FormDialog } from "./FormDialog";
import {
  FormShell,
  TextField,
  NumberField,
  SelectField,
  TextAreaField,
  CheckboxField,
} from "./FormPrimitives";
import { SearchSelect } from "../ui/SearchSelect";
import { StatusBadge } from "./Primitives";
import { formatCurrency } from "@/utils/currency";
import { toast } from "sonner";

const inputCls =
  "w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const rotuloCampo = "block text-xs font-medium text-muted-foreground mb-1";

// ============================================================================
// Lista de contas
// ============================================================================

export function ContasBancariasManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || "";

  const [contas, setContas] = useState<ContaBancariaComSaldoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [apenasAtivas, setApenasAtivas] = useState(true);
  const [editando, setEditando] = useState<ContaBancariaComSaldoDto | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const fetchContas = useCallback(async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      const res = await tesourariaApi.listarContasComSaldos({
        empresaId,
        search: search.trim() || undefined,
        tipo: (tipoFiltro as "banco" | "caixa") || undefined,
        apenasAtivas: apenasAtivas ? true : undefined,
      });
      if (res.success) setContas(res.data.items);
      else toast.error("Erro ao carregar contas: " + res.error.message);
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, search, tipoFiltro, apenasAtivas]);

  useEffect(() => {
    const timer = setTimeout(fetchContas, 250);
    return () => clearTimeout(timer);
  }, [fetchContas]);

  const totais = useMemo(() => {
    const bancos = contas.filter((c) => c.tipo === "banco");
    const caixas = contas.filter((c) => c.tipo === "caixa");
    return {
      bancos: bancos.reduce((s, c) => s + c.saldo, 0),
      caixas: caixas.reduce((s, c) => s + c.saldo, 0),
      total: contas.reduce((s, c) => s + c.saldo, 0),
    };
  }, [contas]);

  const handleActivar = async (conta: ContaBancariaComSaldoDto) => {
    const res = conta.ativo
      ? await tesourariaApi.desativarConta(conta.id)
      : await tesourariaApi.reativarConta(conta.id);
    if (res.success) {
      toast.success(conta.ativo ? `Conta ${conta.codigo} desactivada.` : `Conta ${conta.codigo} reactivada.`);
      fetchContas();
    } else {
      toast.error(res.error.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <label className={rotuloCampo}>Pesquisar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código, designação ou IBAN"
                className={`${inputCls} pl-8`}
              />
            </div>
          </div>
          <div className="w-40">
            <label className={rotuloCampo}>Tipo</label>
            <SearchSelect
              value={tipoFiltro}
              onChange={setTipoFiltro}
              options={[
                { value: "banco", label: "Banco" },
                { value: "caixa", label: "Caixa" },
              ]}
              placeholder="Todos"
            />
          </div>
          <label className="flex items-center gap-2 h-9 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={apenasAtivas}
              onChange={(e) => setApenasAtivas(e.target.checked)}
              className="w-4 h-4 rounded border-input accent-[hsl(var(--primary))]"
            />
            Só activas
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchContas}
            disabled={isLoading}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
            title="Actualizar"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditando(null);
              setModalAberto(true);
            }}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nova conta
          </button>
        </div>
      </div>

      {contas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ResumoSaldo rotulo="Bancos" valor={totais.bancos} icon={<Landmark className="w-4 h-4" />} />
          <ResumoSaldo rotulo="Caixas" valor={totais.caixas} icon={<Wallet className="w-4 h-4" />} />
          <ResumoSaldo rotulo="Tesouraria total" valor={totais.total} destaque />
        </div>
      )}

      <div className="bg-card border border-border rounded-md shadow-[var(--shadow-card)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <th className="px-4 py-2 font-medium">Conta</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">IBAN / SWIFT</th>
              <th className="px-4 py-2 font-medium text-right">Saldo inicial</th>
              <th className="px-4 py-2 font-medium text-right">Saldo actual</th>
              <th className="px-4 py-2 font-medium text-right">Acções</th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-accent/40 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{c.codigo}</div>
                  <div className="text-xs text-muted-foreground">{c.designacao}</div>
                </td>
                <td className="px-4 py-2.5">
                  {c.tipo === "caixa" ? (
                    <StatusBadge tone="warning">Caixa</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">Banco</StatusBadge>
                  )}
                  {!c.ativo && (
                    <div className="mt-1">
                      <StatusBadge tone="neutral">Inactiva</StatusBadge>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {c.iban || "—"}
                  {c.swiftBic && <div className="mt-0.5">{c.swiftBic}</div>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(c.saldoInicial, c.moeda)}
                </td>
                <td
                  className={[
                    "px-4 py-2.5 text-right font-semibold tabular-nums",
                    c.saldo < 0 ? "text-destructive" : "text-foreground",
                  ].join(" ")}
                >
                  {formatCurrency(c.saldo, c.moeda)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(c);
                        setModalAberto(true);
                      }}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Editar conta"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleActivar(c)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title={c.ativo ? "Desactivar" : "Reactivar"}
                    >
                      {c.ativo ? <Power className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {contas.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {apenasAtivas ? "Nenhuma conta activa." : "Nenhuma conta corresponde aos filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={modalAberto}
        onOpenChange={setModalAberto}
        title={editando ? `Editar ${editando.codigo}` : "Nova conta bancária ou caixa"}
        description="O saldo não se escreve: nasce do saldo inicial e evolve com os movimentos confirmados."
      >
        {empresaId && (
          <ContaForm
            empresaId={empresaId}
            conta={editando}
            onSaved={() => {
              setModalAberto(false);
              fetchContas();
            }}
            onCancel={() => setModalAberto(false)}
          />
        )}
      </FormDialog>
    </div>
  );
}

function ResumoSaldo({
  rotulo,
  valor,
  icon,
  destaque,
}: {
  rotulo: string;
  valor: number;
  icon?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-md border p-4",
        destaque ? "bg-primary/5 border-primary/25" : "bg-card border-border shadow-[var(--shadow-card)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{rotulo}</span>
        {icon && <span className="text-primary opacity-70">{icon}</span>}
      </div>
      <div
        className={[
          "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
          valor < 0 ? "text-destructive" : "",
        ].join(" ")}
      >
        {formatCurrency(valor, "AOA")}
      </div>
    </div>
  );
}

// ============================================================================
// Formulário de conta
// ============================================================================

const contaSchema = z.object({
  codigo: z.string().trim().min(1, "Obrigatório").max(20),
  designacao: z.string().trim().min(2, "Obrigatório").max(80),
  tipo: z.enum(["banco", "caixa"]),
  contaContabilId: z.string().optional().or(z.literal("")),
  nomeBanco: z.string().trim().max(80).optional().or(z.literal("")),
  iban: z.string().trim().max(40).optional().or(z.literal("")),
  swiftBic: z.string().trim().max(11, "Máximo 11 caracteres").optional().or(z.literal("")),
  saldoInicial: z.coerce.number().refine((v) => !Number.isNaN(v), "Valor inválido"),
  moeda: z.string().trim().length(3, "Use o código de 3 letras"),
  observacoes: z.string().trim().max(240).optional().or(z.literal("")),
  ativo: z.boolean(),
});

type ContaFormValues = z.infer<typeof contaSchema>;

function ContaForm({
  empresaId,
  conta,
  onSaved,
  onCancel,
}: {
  empresaId: string;
  conta: ContaBancariaComSaldoDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contasContabeis, setContasContabeis] = useState<ContaContabilDisponivelDto[]>([]);
  const [aCarregarContasContabeis, setACarregarContasContabeis] = useState(true);
  const isEdicao = Boolean(conta);

  useEffect(() => {
    let ativo = true;
    setACarregarContasContabeis(true);
    tesourariaApi
      .listarContasContabeisDisponiveis(empresaId, conta?.id)
      .then((res) => {
        if (!ativo) return;
        if (res.success) setContasContabeis(res.data);
        else toast.error(res.error.message);
      })
      .catch(() => {
        if (ativo) toast.error("Falha ao comunicar com o processo principal.");
      })
      .finally(() => {
        if (ativo) setACarregarContasContabeis(false);
      });
    return () => {
      ativo = false;
    };
  }, [empresaId, conta?.id]);

  const methods = useForm<ContaFormValues>({
    resolver: zodResolver(contaSchema),
    defaultValues: {
      codigo: conta?.codigo ?? "",
      designacao: conta?.designacao ?? "",
      tipo: conta?.tipo ?? "banco",
      contaContabilId: conta?.contaContabilId ?? "",
      nomeBanco: conta?.nomeBanco ?? "",
      iban: conta?.iban ?? "",
      swiftBic: conta?.swiftBic ?? "",
      saldoInicial: conta?.saldoInicial ?? 0,
      moeda: conta?.moeda ?? "AOA",
      observacoes: conta?.observacoes ?? "",
      ativo: conta?.ativo ?? true,
    },
  });

  const { register, watch, setValue } = methods;
  const tipo = watch("tipo");
  const moeda = watch("moeda");

  const onSubmit = async (v: ContaFormValues) => {
    try {
      setIsSubmitting(true);
      const res = isEdicao
        ? await tesourariaApi.atualizarConta(conta!.id, {
            empresaId,
            designacao: v.designacao,
            tipo: v.tipo,
            contaContabilId: v.contaContabilId || null,
            nomeBanco: v.nomeBanco || null,
            iban: v.iban || null,
            swiftBic: v.swiftBic || null,
            observacoes: v.observacoes || null,
            ativo: v.ativo,
          })
        : await tesourariaApi.criarConta({
            empresaId,
            codigo: v.codigo,
            designacao: v.designacao,
            tipo: v.tipo,
            contaContabilId: v.contaContabilId || null,
            nomeBanco: v.nomeBanco || null,
            iban: v.iban || null,
            swiftBic: v.swiftBic || null,
            saldoInicial: v.saldoInicial,
            moeda: v.moeda,
            observacoes: v.observacoes || null,
            ativo: v.ativo,
          });

      if (res.success) {
        toast.success(`Conta ${res.data.codigo} ${isEdicao ? "actualizada" : "criada"}.`);
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

  return (
    <FormShell
      methods={methods}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitLabel={isEdicao ? "Guardar alterações" : "Criar conta"}
      compact
      dialogLayout
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5">
        {/* O código identifica a conta nos extractos e nos documentos já
            emitidos: em edição fica visível mas travado, para ninguém
            perguntar porquê que não muda. */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Código{isEdicao && <span className="text-muted-foreground font-normal"> (fixo)</span>}
          </label>
          <input
            {...register("codigo")}
            placeholder="BANC-01"
            readOnly={isEdicao}
            className={`${inputCls} h-8 ${isEdicao ? "opacity-60 cursor-not-allowed" : ""}`}
          />
        </div>
        <TextField name="designacao" label="Designação" required placeholder="Conta corrente principal" span="2" />
        <SelectField
          name="tipo"
          label="Tipo"
          required
          options={[
            { value: "banco", label: "Banco" },
            { value: "caixa", label: "Caixa" },
          ]}
        />
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Conta contabilística</label>
          <SearchSelect
            value={watch("contaContabilId") ?? ""}
            onChange={(v) => setValue("contaContabilId", v, { shouldDirty: true })}
            options={[
              { value: "", label: "Sem associação" },
              ...contasContabeis.map((c) => ({
                value: c.id,
                label: `${c.codigo} — ${c.designacao}`,
              })),
            ]}
            placeholder="Sem associação"
            disabled={aCarregarContasContabeis}
          />
          {contasContabeis.length === 0 && !aCarregarContasContabeis && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Configure o plano de contas para associar esta conta.
            </p>
          )}
        </div>

        {tipo === "banco" ? (
          <TextField name="nomeBanco" label="Banco" placeholder="Millennium Atlântico" span="2" />
        ) : null}
        <TextField name="iban" label="IBAN / Nº de conta" placeholder="AO06 0000 0000 0000 0000 0000 0" span={tipo === "banco" ? "1" : "2"} />
        <TextField name="swiftBic" label="SWIFT / BIC" placeholder="BOMLAOAOLX" span="1" />
        <SelectField
          name="moeda"
          label="Moeda"
          options={[
            { value: "AOA", label: "AOA — Kwanza" },
            { value: "EUR", label: "EUR — Euro" },
            { value: "USD", label: "USD — Dólar" },
          ]}
        />

        {isEdicao ? (
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Saldo inicial</label>
            <div className={`${inputCls} h-8 bg-muted/40 text-muted-foreground tabular-nums`}>
              {formatCurrency(conta!.saldoInicial, conta!.moeda)}
            </div>
          </div>
        ) : (
          <NumberField name="saldoInicial" label={`Saldo inicial (${moeda})`} step="0.01" span="1" />
        )}
        <div className="sm:col-span-2 lg:col-span-2 lg:pt-5">
          <CheckboxField
            name="ativo"
            label="Conta activa"
            description="Inactiva impede novos movimentos, sem perder o histórico."
            span="full"
          />
        </div>
      </div>

      <TextAreaField
        name="observacoes"
        label="Observações"
        placeholder="Ex.: duas assinaturas obrigatórias"
        span="full"
      />

      {isEdicao && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          O saldo inicial fica fixo. Para corrigir o valor de partida, registe um ajuste em
          Lançamentos: fica no histórico em vez de reescrever o passado.
        </p>
      )}

      {isSubmitting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A guardar…
        </p>
      )}
    </FormShell>
  );
}

