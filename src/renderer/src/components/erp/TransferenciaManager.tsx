/**
 * @file TransferenciaManager.tsx
 * @description Transferência entre armazéns (TASK-030), em fluxo guiado de
 * cinco passos: Produto → Origem → Quantidade → Destino → Confirmar.
 *
 * A transferência é escrita única e passa por `stock:transferencia`, que exige
 * `estoque: write` e, no service, valida artigo não-serviço, lote (RN06.2) e
 * stock negativo na origem (RN06.1) dentro da mesma transacção. O formulário
 * não refaz essas regras — só as antecipa no ecrã (saldo disponível e
 * quantidade ≤ saldo) para o operador não tropeçar no erro vindo do main.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeftRight,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Warehouse,
  Package,
  MapPin,
} from "lucide-react";
import { ArmazemDto, ArtigoDto, MovimentoStockDto } from "../../@types/electron";
import { stockApi } from "../../api/stock.api";
import { artigoApi } from "../../api/artigo.api";
import { armazemApi } from "../../api/armazem.api";
import { SearchSelect } from "../ui/SearchSelect";
import { FieldWrap, NumberField, TextField } from "./FormPrimitives";
import { StatusBadge } from "./Primitives";
import { toast } from "sonner";

const transferSchema = z.object({
  artigoId: z.string().min(1, "Escolha o artigo a transferir."),
  armazemOrigemId: z.string().min(1, "Escolha o armazém de origem."),
  quantidade: z
    .string()
    .trim()
    .min(1, "Indique a quantidade.")
    .refine((v) => /^\d+$/.test(v) && Number(v) > 0, "Quantidade deve ser um número inteiro superior a zero."),
  lote: z.string().trim().max(100).optional(),
  armazemDestinoId: z.string().min(1, "Escolha o armazém de destino."),
});
type TransferFormValues = z.infer<typeof transferSchema>;

/** Campo a validar (via trigger) em cada passo do fluxo. */
const PASSOS: { rotulo: string; descricao: string; campos: (keyof TransferFormValues)[] }[] = [
  { rotulo: "Produto", descricao: "Artigo a deslocar", campos: ["artigoId"] },
  { rotulo: "Origem", descricao: "Armazém que cede stock", campos: ["armazemOrigemId"] },
  { rotulo: "Quantidade", descricao: "Quantidade a transferir", campos: ["quantidade"] },
  { rotulo: "Destino", descricao: "Armazém que recebe", campos: ["armazemDestinoId"] },
  { rotulo: "Confirmar", descricao: "Rever e transferir", campos: [] },
];

const PASSO_FINAL = PASSOS.length - 1;

export function TransferenciaManager() {
  const [passo, setPasso] = useState(0);
  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [saldoOrigem, setSaldoOrigem] = useState<number | null>(null);
  const [ultimas, setUltimas] = useState<MovimentoStockDto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      artigoId: "",
      armazemOrigemId: "",
      quantidade: "",
      lote: "",
      armazemDestinoId: "",
    },
  });

  const artigoId = methods.watch("artigoId");
  const origemId = methods.watch("armazemOrigemId");
  const destinoId = methods.watch("armazemDestinoId");
  const quantidade = methods.watch("quantidade");
  const lote = methods.watch("lote") ?? "";

  const artigo = useMemo(
    () => artigos.find((a) => a.id === artigoId) || null,
    [artigos, artigoId]
  );
  const origem = useMemo(
    () => armazens.find((a) => a.id === origemId) || null,
    [armazens, origemId]
  );
  const destino = useMemo(
    () => armazens.find((a) => a.id === destinoId) || null,
    [armazens, destinoId]
  );

  // Opções do destino e da origem excluem-se mutuamente por defeito.
  const armazensOrigem = useMemo(
    () => armazens.filter((a) => a.id !== destinoId),
    [armazens, destinoId]
  );
  const armazensDestino = useMemo(
    () => armazens.filter((a) => a.id !== origemId),
    [armazens, origemId]
  );

  const carregarUltimas = useCallback(async () => {
    try {
      const res = await stockApi.listMovimentos({ tipo: "transferencia", take: 10 });
      if (res.success) setUltimas(res.data.items);
    } catch {
      // A lista recente é apenas conforto; a operação principal não depende dela.
      setUltimas([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [resArtigos, resArmazens] = await Promise.all([
          artigoApi.list({ take: 200 }),
          armazemApi.list({ take: 100, ativo: true }),
        ]);
        if (resArtigos.success) {
          setArtigos(resArtigos.data.items.filter((a) => a.tipo !== "servico"));
        }
        if (resArmazens.success) {
          setArmazens(resArmazens.data.items);
        }
      } catch {
        toast.error("Falha ao carregar artigos e armazéns.");
      }
    })();
    void carregarUltimas();
  }, [carregarUltimas]);

  // Saldo disponível na origem sempre que artigo e armazém de origem existem.
  useEffect(() => {
    let ativo = true;
    if (artigoId && origemId) {
      void stockApi.getArtigoArmazem(artigoId, origemId).then((res) => {
        if (ativo && res.success) setSaldoOrigem(res.data);
      });
    } else {
      setSaldoOrigem(null);
    }
    return () => {
      ativo = false;
    };
  }, [artigoId, origemId]);

  const saldoInsuficiente =
    saldoOrigem !== null &&
    quantidade.trim() !== "" &&
    /^\d+$/.test(quantidade) &&
    Number(quantidade) > saldoOrigem;

  const avancar = async () => {
    const ok = await methods.trigger(PASSOS[passo].campos);
    if (ok) setPasso((p) => Math.min(PASSO_FINAL, p + 1));
  };

  const voltar = () => setPasso((p) => Math.max(0, p - 1));

  const submeter = async (valores: TransferFormValues) => {
    if (saldoInsuficiente) {
      toast.error(
        `Stock insuficiente na origem. Disponível: ${saldoOrigem} ${artigo?.unidade ?? "UN"}.`
      );
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await stockApi.transferencia({
        artigoId: valores.artigoId,
        quantidade: Number(valores.quantidade),
        armazemOrigemId: valores.armazemOrigemId,
        armazemDestinoId: valores.armazemDestinoId,
        lote: valores.lote?.trim() || null,
      });

      if (res.success) {
        toast.success(`Transferência ${res.data.numero} registada.`);
        methods.reset({
          artigoId: "",
          armazemOrigemId: "",
          quantidade: "",
          lote: "",
          armazemDestinoId: "",
        });
        setPasso(0);
        setSaldoOrigem(null);
        await carregarUltimas();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao registar a transferência.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canAvancar =
    passo === 0 ? Boolean(artigoId) : passo === 1 ? Boolean(origemId) : passo === 2 ? quantidade.trim() !== "" : Boolean(destinoId);

  return (
    <FormProvider {...methods}>
      <div className="space-y-4">
        {/* Indicador de passos */}
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <ol className="flex items-center gap-2 overflow-x-auto">
            {PASSOS.map((p, i) => {
              const concluido = i < passo;
              const actual = i === passo;
              return (
                <li key={p.rotulo} className="flex items-center gap-2 shrink-0">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      actual
                        ? "bg-primary/10 border-primary text-primary"
                        : concluido
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {concluido ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <span
                        className={`w-3.5 h-3.5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                          actual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                    )}
                    <span>{p.rotulo}</span>
                  </div>
                  {i < PASSO_FINAL && <span className="text-muted-foreground/50">·</span>}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            Passo {passo + 1} de {PASSOS.length} — {PASSOS[passo].descricao}.
          </p>
        </div>

        {/* Corpo do passo */}
        <div data-testid="transferencia-passos" className="bg-card border border-border rounded-lg shadow-sm p-6">
          {/* 1 — Produto */}
          {passo === 0 && (
            <div className="max-w-xl space-y-4">
              <FieldWrap label="Artigo" name="artigoId" required span="full">
                <SearchSelect
                  value={artigoId}
                  onChange={(v) =>
                    methods.setValue("artigoId", v, { shouldValidate: true, shouldDirty: true })
                  }
                  placeholder="Procurar produto..."
                  options={artigos.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.descricao}`,
                  }))}
                />
              </FieldWrap>
              {artigo && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">{artigo.codigo}</span>
                  <span>{artigo.descricao}</span>
                  <StatusBadge tone="info">{artigo.unidade}</StatusBadge>
                  {artigo.controloLote && <StatusBadge tone="warning">Controlo por lote</StatusBadge>}
                </div>
              )}
            </div>
          )}

          {/* 2 — Origem */}
          {passo === 1 && (
            <div className="max-w-xl space-y-4">
              <FieldWrap label="Armazém de Origem" name="armazemOrigemId" required span="full">
                <SearchSelect
                  value={origemId}
                  onChange={(v) =>
                    methods.setValue("armazemOrigemId", v, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  placeholder="Armazém que cede o stock..."
                  options={armazensOrigem.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.designacao}`,
                  }))}
                />
              </FieldWrap>
              {origem && (
                <div
                  data-testid="saldo-origem"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Warehouse className="w-4 h-4 text-primary" />
                  {saldoOrigem === null ? (
                    <span>A calcular o saldo disponível...</span>
                  ) : (
                    <>
                      <span>Saldo disponível:</span>
                      <strong
                        className={
                          saldoOrigem > 0 ? "text-emerald-600" : "text-rose-600"
                        }
                      >
                        {saldoOrigem} {artigo?.unidade ?? "UN"}
                      </strong>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3 — Quantidade */}
          {passo === 2 && (
            <div className="max-w-xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberField
                  name="quantidade"
                  label={`Quantidade (${artigo?.unidade ?? "UN"})`}
                  required
                  integer
                  min={1}
                  placeholder="0"
                  span="1"
                />
                {artigo?.controloLote && (
                  <TextField
                    name="lote"
                    label="Lote / Nº de Série (Obrigatório)"
                    placeholder="LT-2026-X"
                    span="1"
                  />
                )}
              </div>
              {saldoOrigem !== null && quantidade.trim() !== "" && (
                <p
                  data-testid="aviso-saldo"
                  className={`text-xs font-medium ${
                    saldoInsuficiente ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {saldoInsuficiente
                    ? `Mais do que o disponível: origem tem ${saldoOrigem} ${artigo?.unidade ?? "UN"}.`
                    : `Origem com ${saldoOrigem} ${artigo?.unidade ?? "UN"} disponíveis.`}
                </p>
              )}
            </div>
          )}

          {/* 4 — Destino */}
          {passo === 3 && (
            <div className="max-w-xl space-y-4">
              <FieldWrap label="Armazém de Destino" name="armazemDestinoId" required span="full">
                <SearchSelect
                  value={destinoId}
                  onChange={(v) =>
                    methods.setValue("armazemDestinoId", v, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  placeholder="Armazém que recebe o stock..."
                  options={armazensDestino.map((a) => ({
                    value: a.id,
                    label: `${a.codigo} — ${a.designacao}`,
                  }))}
                />
              </FieldWrap>
              {destino && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">{destino.codigo}</span>
                  <span>{destino.designacao}</span>
                </div>
              )}
            </div>
          )}

          {/* 5 — Confirmar */}
          {passo === PASSOS.length - 1 && (
            <div data-testid="resumo-transferencia" className="max-w-xl">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Rever a transferência
              </h3>
              <dl className="border border-border rounded-md divide-y divide-border text-sm">
                <ItemResumo rotulo="Artigo" valor={`${artigo?.codigo ?? "—"} — ${artigo?.descricao ?? ""} (${artigo?.unidade ?? "UN"})`} forte />
                <ItemResumo rotulo="Origem" valor={origem ? `${origem.codigo} — ${origem.designacao}` : "—"} />
                <ItemResumo rotulo="Quantidade" valor={`${quantidade || "—"} ${artigo?.unidade ?? "UN"}`} forte />
                {artigo?.controloLote && <ItemResumo rotulo="Lote" valor={lote || "—"} />}
                <ItemResumo rotulo="Destino" valor={destino ? `${destino.codigo} — ${destino.designacao}` : "—"} />
              </dl>
              {saldoInsuficiente && (
                <p className="mt-3 text-xs font-medium text-destructive">
                  Stock insuficiente na origem: {saldoOrigem} {artigo?.unidade ?? "UN"} disponíveis.
                </p>
              )}
            </div>
          )}

          {/* Navegação */}
          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={voltar}
              disabled={passo === 0 || isSubmitting}
              className="h-9 px-4 rounded-md text-sm border border-border hover:bg-muted font-medium text-muted-foreground flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Anterior
            </button>
            {passo < PASSO_FINAL ? (
              <button
                type="button"
                data-testid="transferencia-seguinte"
                onClick={() => void avancar()}
                disabled={!canAvancar}
                className="h-9 px-5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 shadow-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Seguinte
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="transferencia-confirmar"
                onClick={() => void methods.handleSubmit(submeter)()}
                disabled={isSubmitting}
                className="h-9 px-5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 shadow-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    A transferir...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar Transferência
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Últimas transferências */}
        <div data-testid="ultimas-transferencias" className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              Últimas transferências
            </h3>
            <button
              type="button"
              onClick={() => void carregarUltimas()}
              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th className="px-4 py-2.5">Nº</th>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Artigo</th>
                  <th className="px-4 py-2.5 text-right">Qtd.</th>
                  <th className="px-4 py-2.5">Origem → Destino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ultimas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <span className="text-xs">
                        Ainda não há transferências registadas.
                      </span>
                    </td>
                  </tr>
                ) : (
                  ultimas.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold">{m.numero}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                        {new Date(m.data).toLocaleString("pt-PT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="font-medium text-foreground">{m.artigo?.descricao || "—"}</span>
                        <span className="text-muted-foreground font-mono"> ({m.artigo?.codigo})</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                        {Number(m.quantidade)} {m.artigo?.unidade}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{m.armazemOrigem?.codigo ?? "—"}</span>
                        {" → "}
                        <span className="font-medium text-foreground">{m.armazemDestino?.codigo ?? "—"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}

function ItemResumo({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={`text-xs text-right ${forte ? "font-semibold text-foreground" : "text-foreground"}`}>
        {valor}
      </dd>
    </div>
  );
}