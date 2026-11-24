/**
 * @file ReconciliacaoContabilManager.tsx
 * @description Conciliação contabilística: extrato (tesouraria) vs contabilidade.
 *
 * Liga linhas de `LinhaLancamentoContabil` (cuja conta tem `contaContabilId` na
 * `ContaBancaria`) a `MovimentoTesouraria` da mesma conta bancária.
 * Mostra dois painéis lado a lado com sugestões automáticas por valor+data.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCheck,
  CheckCircle,
  Loader2,
  RefreshCw,
  Search,
  Zap,
  Link2,
  X,
  Plus,
} from "lucide-react";
import {
  ContaBancariaReconciliavelDto,
  ResumoReconciliacaoDto,
  SugestaoReconciliacaoDto,
} from "../../@types/electron";
import { contabilidadeApi } from "../../api/contabilidade.api";
import { useAuth } from "../../hooks/useAuth";
import { SearchSelect } from "../ui/SearchSelect";
import { Button } from "../ui/button";
import { StatusBadge } from "./Primitives";
import { WorkspaceFrame } from "./WorkspaceFrame";
import { formatCurrency } from "@/utils/currency";
import { toast } from "sonner";

function formatarData(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ReconciliacaoContabilManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || "";

  const [contas, setContas] = useState<ContaBancariaReconciliavelDto[]>([]);
  const [resumo, setResumo] = useState<ResumoReconciliacaoDto | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestaoReconciliacaoDto[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const [contaId, setContaId] = useState("");
  const [searchExtrato, setSearchExtrato] = useState("");
  const [searchContabilidade, setSearchContabilidade] = useState("");
  const [janelaDias, setJanelaDias] = useState(5);

  const [selecionadosExtrato, setSelecionadosExtrato] = useState<Set<string>>(new Set());
  const [selecionadosContabilidade, setSelecionadosContabilidade] = useState<Set<string>>(new Set());

  const [paresParaConciliar, setParesParaConciliar] = useState<
    Array<{ linhaId: string; movimentoId: string }>
  >([]);

  const fetchContas = useCallback(async () => {
    if (!empresaId) return;
    const res = await contabilidadeApi.listarContasParaReconciliar(empresaId);
    if (res.success) setContas(res.data);
    else toast.error(res.error.message);
  }, [empresaId]);

  const fetchResumo = useCallback(async () => {
    if (!contaId || !empresaId) {
      setResumo(null);
      setSugestoes([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const [resumoRes, sugestoesRes] = await Promise.all([
        contabilidadeApi.obterResumoReconciliacao(contaId, empresaId),
        contabilidadeApi.sugerirParesReconciliacao(contaId, empresaId, { janelaDias }),
      ]);
      if (resumoRes.success) setResumo(resumoRes.data);
      else {
        setResumo(null);
        toast.error(resumoRes.error.message);
      }
      if (sugestoesRes.success) setSugestoes(sugestoesRes.data);
      else {
        setSugestoes([]);
        toast.error(sugestoesRes.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [contaId, empresaId, janelaDias]);

  useEffect(() => {
    fetchContas();
  }, [fetchContas]);

  useEffect(() => {
    fetchResumo();
    setSelecionadosExtrato(new Set());
    setSelecionadosContabilidade(new Set());
    setParesParaConciliar([]);
  }, [fetchResumo]);

  const contasProntas = contas.filter((c) => c.contaContabilId && c.contaContabil);

  const extrato = resumo?.itensEmTransito.soNoExtrato ?? [];
  const contabilidade = resumo?.itensEmTransito.soNaContabilidade ?? [];

  const visiveisExtrato = extrato.filter((m) => {
    const q = searchExtrato.trim().toLowerCase();
    if (!q) return true;
    return (
      m.numero.toLowerCase().includes(q) ||
      (m.descricao ?? "").toLowerCase().includes(q) ||
      (m.observacaoExtrato ?? "").toLowerCase().includes(q)
    );
  });

  const visiveisContabilidade = contabilidade.filter((l) => {
    const q = searchContabilidade.trim().toLowerCase();
    if (!q) return true;
    return (
      l.lancamentoNumero?.toString().includes(q) ||
      l.contaCodigo.toLowerCase().includes(q) ||
      l.contaDesignacao.toLowerCase().includes(q) ||
      (l.descricao ?? "").toLowerCase().includes(q) ||
      (l.lancamentoDescricao ?? "").toLowerCase().includes(q)
    );
  });

  const pendentesExtrato = visiveisExtrato.filter((m) => !selecionadosExtrato.has(m.id));
  const pendentesContabilidade = visiveisContabilidade.filter((l) => !selecionadosContabilidade.has(l.id));

  const valorSelecionadoExtrato = pendentesExtrato.reduce((s, m) => s + Number(m.valor), 0);
  const valorSelecionadoContabilidade = pendentesContabilidade.reduce((s, l) => s + (Number(l.debito) + Number(l.credito)), 0);

  const alternarExtrato = (id: string) =>
    setSelecionadosExtrato((a) => {
      const n = new Set(a);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const alternarContabilidade = (id: string) =>
    setSelecionadosContabilidade((a) => {
      const n = new Set(a);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handleSugerir = async () => {
    const res = await contabilidadeApi.sugerirParesReconciliacao(contaId, empresaId, { janelaDias });
    if (res.success) {
      setSugestoes(res.data);
      toast.success(`${res.data.length} sugestão(ões) encontrada(s).`);
    } else toast.error(res.error.message);
  };

  const aplicarSugestao = (s: SugestaoReconciliacaoDto) => {
    setParesParaConciliar((p) => [...p, { linhaId: s.linha.id, movimentoId: s.movimento.id }]);
    setSelecionadosExtrato((a) => new Set([...a, s.movimento.id]));
    setSelecionadosContabilidade((a) => new Set([...a, s.linha.id]));
    toast.success("Par adicionado para conciliação.");
  };

  const limparPares = () => {
    setParesParaConciliar([]);
    setSelecionadosExtrato(new Set());
    setSelecionadosContabilidade(new Set());
  };

  const handleConciliar = async () => {
    if (paresParaConciliar.length === 0) {
      toast.error("Nenhum par para conciliar. Use as sugestões ou seleccione manualmente.");
      return;
    }
    try {
      setIsBusy(true);
      const res = await contabilidadeApi.conciliar(contaId, empresaId, { pares: paresParaConciliar });
      if (res.success) {
        toast.success(`${res.data.conciliados} par(es) conciliado(s).`);
        limparPares();
        fetchResumo();
      } else toast.error(res.error.message);
    } catch {
      toast.error("Falha ao conciliar.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!empresaId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Sem empresa seleccionada.
      </div>
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Conta bancária
          </label>
          <SearchSelect
            value={contaId}
            onChange={setContaId}
            options={contas.map((c) => ({
              value: c.id,
              label: c.contaContabil
                ? `${c.codigo} — ${c.designacao} (${c.contaContabil.codigo})`
                : `${c.codigo} — ${c.designacao} (sem conta contabilística)`,
            }))}
            placeholder="Escolher conta"
            disabled={isLoading}
          />
        </div>

        <div className="w-40">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Janela de dias
          </label>
          <SearchSelect
            value={String(janelaDias)}
            onChange={(v) => setJanelaDias(Number(v))}
            options={[
              { value: "1", label: "1 dia" },
              { value: "3", label: "3 dias" },
              { value: "5", label: "5 dias" },
              { value: "7", label: "7 dias" },
              { value: "10", label: "10 dias" },
              { value: "15", label: "15 dias" },
            ]}
            placeholder="± dias"
          />
        </div>

        <div className="flex-1" />

        <div className="flex gap-2">
          <Button type="button" onClick={handleSugerir} disabled={isLoading || !contaId} size="sm">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Sugerir pares
          </Button>
          <Button type="button" onClick={() => void fetchResumo()} disabled={isLoading} variant="outline" size="icon" title="Actualizar">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
    </div>
  );

  return (
    <WorkspaceFrame
      title="Reconciliação contabilística"
      description="Concilie o extrato bancário com as linhas dos lançamentos validados da conta contabilística associada."
      toolbar={toolbar}
    >
      {/* Estado vazio */}
      {!contaId ? (
        <div className="flex h-full min-h-0 items-center justify-center p-8">
          <div className="text-center max-w-md">
            <Link2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Escolha uma conta bancária</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Seleccione uma conta com conta contabilística associada para ver os itens
              por conciliar entre o extracto e a contabilidade.
            </p>
            {contas.length === 0 && (
              <p className="text-sm text-warning mt-4">
                Nenhuma conta bancária activa encontrada. Crie uma conta em <strong>Tesouraria › Contas</strong>.
              </p>
            )}
            {contas.length > 0 && contasProntas.length === 0 && (
              <p className="text-sm text-warning mt-4">
                As contas existem, mas nenhuma tem conta contabilística ligada. Vá a <strong>Tesouraria › Contas</strong>
                e edite a conta para definir o campo <em>Conta contabilística</em>.
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex h-full min-h-0 flex-col gap-3">
          {/* Resumo + KPIs */}
          {resumo && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Indicador
                rotulo="Saldo contabilístico"
                valor={resumo.contaContabil.saldoContabilistico}
                moeda="AOA"
                detalhe={resumo.contaContabil.codigo}
              />
              <Indicador
                rotulo="Saldo extrato"
                valor={resumo.contaBancaria.saldoAtual}
                moeda="AOA"
                detalhe={resumo.contaBancaria.codigo}
              />
              <Indicador
                rotulo="Diferença"
                valor={resumo.diferenca}
                moeda="AOA"
                destaque={Math.abs(Number(resumo.diferenca)) > 0.005}
              />
              <Indicador
                rotulo="Itens em trânsito"
                valor={
                  (resumo.itensEmTransito.soNoExtrato.length +
                    resumo.itensEmTransito.soNaContabilidade.length)
                    .toString()
                }
              />
            </div>
          )}

          {/* Áreas lado a lado */}
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Extrato (Tesouraria) */}
            <PainelLado
              titulo={
                <>
                  Extrato bancário
                  {visiveisExtrato.length > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {visiveisExtrato.length} item(s)
                    </span>
                  )}
                </>
              }
              search={searchExtrato}
              onSearchChange={setSearchExtrato}
              placeholder="Pesquisar no extrato…"
              itens={visiveisExtrato}
              selecionados={selecionadosExtrato}
              valorSelecionado={valorSelecionadoExtrato}
              renderItem={(m) => {
                const dc = m.dataConciliacao != null ? formatarData(m.dataConciliacao) : undefined;
                return {
                  id: m.id,
                  data: formatarData(m.data),
                  numero: m.numero,
                  descricao: m.descricao ?? "—",
                  valor: Number(m.valor),
                  conciliado: m.conciliado,
                  dataConciliacao: dc,
                  tipo: m.tipo,
                  observacao: m.observacaoExtrato ?? undefined,
                  onClick: () => alternarExtrato(m.id),
                };
              }}
              emptyMessage="Nada por conciliar no extracto."
            />

            {/* Contabilidade */}
            <PainelLado
              titulo={
                <>
                  Contabilidade
                  {visiveisContabilidade.length > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {visiveisContabilidade.length} linha(s)
                    </span>
                  )}
                </>
              }
              search={searchContabilidade}
              onSearchChange={setSearchContabilidade}
              placeholder="Pesquisar na contabilidade…"
              itens={visiveisContabilidade}
              selecionados={selecionadosContabilidade}
              valorSelecionado={valorSelecionadoContabilidade}
              renderItem={(l) => {
                const dc = l.conciliadoEm != null ? formatarData(l.conciliadoEm) : undefined;
                return {
                  id: l.id,
                  data: formatarData(l.dataContabilistica),
                  numero: l.lancamentoNumero ? `Lanç. ${l.lancamentoNumero}` : l.lancamentoId.slice(0, 8),
                  descricao: l.descricao ?? l.lancamentoDescricao ?? "—",
                  valor: Number(l.debito) + Number(l.credito),
                  conciliado: !!l.movimentoTesourariaId,
                  dataConciliacao: dc,
                  tipo: Number(l.debito) > 0 ? "debito" : "credito",
                  observacao: l.contaCodigo,
                  onClick: () => alternarContabilidade(l.id),
                };
              }}
              emptyMessage="Nada por conciliar na contabilidade."
            />
          </div>

          {/* Rodapé: pares para conciliar + acções */}
          {(paresParaConciliar.length > 0 || sugestoes.length > 0) && (
            <div className="border-t border-border pt-4 space-y-3">
              {sugestoes.length > 0 && (
                <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium">Sugestões automáticas ({sugestoes.length})</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setSugestoes([])} aria-label="Fechar sugestões">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2 max-h-40 overflow-y-auto">
                    {sugestoes.map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="font-mono text-xs text-muted-foreground">
                            {s.valorExato ? "✓ Valor exato" : `±${s.diferencaDias}d`}
                          </div>
                          <div className="truncate">
                            <span className="font-medium">{s.linha.contaCodigo}</span>{" "}
                            —{" "}
                            <span className="text-muted-foreground">{s.movimento.numero}</span>
                          </div>
                        </div>
                        <Button type="button" size="sm" onClick={() => aplicarSugestao(s)}>
                          <Plus className="w-3 h-3 mr-1" />
                          Usar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {paresParaConciliar.length > 0 && (
                <div className="rounded-md bg-card border border-border p-3">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium">
                      Pares para conciliar ({paresParaConciliar.length})
                    </span>
                    <Button type="button" variant="ghost" size="icon" onClick={limparPares} aria-label="Limpar pares">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid gap-1 max-h-40 overflow-y-auto text-xs">
                    {paresParaConciliar.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 bg-muted/50 rounded">
                        <span>{p.linhaId.slice(0, 8)} ↔ {p.movimentoId.slice(0, 8)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setParesParaConciliar((a) => a.filter((_, j) => j !== i))}
                          aria-label="Remover par"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="button" onClick={handleConciliar} disabled={isBusy} size="sm">
                      {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                      Conciliar {paresParaConciliar.length} par(es)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </>
      )}
    </WorkspaceFrame>
  );
}

interface PainelLadoProps<T> {
  titulo: React.ReactNode;
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  itens: T[];
  selecionados: Set<string>;
  valorSelecionado: number;
  renderItem: (item: T) => {
    id: string;
    data: string;
    numero: string;
    descricao: string;
    valor: number;
    conciliado: boolean;
    dataConciliacao: string | undefined;
    tipo: string;
    observacao?: string;
    onClick: () => void;
  };
  emptyMessage: string;
}

function PainelLado<T>({
  titulo,
  search,
  onSearchChange,
  placeholder,
  itens,
  selecionados,
  valorSelecionado,
  renderItem,
  emptyMessage,
}: PainelLadoProps<T>) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-card border border-border rounded-md overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 h-11 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold flex-1 truncate">{titulo}</h2>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={placeholder}
              className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
          {selecionados.size > 0 && (
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {selecionados.size} sel. · {formatCurrency(valorSelecionado, "AOA")}
            </span>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider sticky top-0">
              <th className="px-3 py-2 font-medium w-10" />
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Nº / Lanç.</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
              <th className="px-3 py-2 font-medium w-24">Estado</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const r = renderItem(item);
              const marcado = selecionados.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={[
                    "border-t border-border transition-colors",
                    marcado ? "bg-primary/5" : "hover:bg-accent/40",
                    r.conciliado && "opacity-60",
                  ].join(" ")}
                  onClick={r.onClick}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => {
                        e.stopPropagation();
                        r.onClick();
                      }}
                      className="w-4 h-4 rounded border-input accent-[hsl(var(--primary))]"
                      aria-label={`Seleccionar ${r.numero}`}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.data}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap truncate max-w-[120px]">{r.numero}</td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <div className="truncate font-medium">{r.descricao}</div>
                    {r.observacao && <div className="text-xs text-muted-foreground truncate">{r.observacao}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatCurrency(r.valor, "AOA")}
                  </td>
                  <td className="px-3 py-2">
                    {r.conciliado ? (
                      <StatusBadge tone="success">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Conciliado
                        {r.dataConciliacao && <span className="ml-1">{r.dataConciliacao}</span>}
                      </StatusBadge>
                    ) : r.tipo === "debito" || r.tipo === "credito" ? (
                      <StatusBadge tone="warning">
                        {r.tipo === "debito" ? "Débito" : "Crédito"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone={r.tipo === "entrada" ? "success" : r.tipo === "saida" ? "danger" : "warning"}>
                        {r.tipo}
                      </StatusBadge>
                    )}
                  </td>
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  moeda,
  sufixo,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string | number;
  moeda?: string;
  sufixo?: string;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-md border p-4",
        destaque ? "bg-warning/5 border-warning/30" : "bg-card border-border shadow-[var(--shadow-card)]",
      ].join(" ")}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{rotulo}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {typeof valor === "number" && moeda ? formatCurrency(valor, moeda) : valor}
      </div>
      {(sufixo || detalhe) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {detalhe ? `${valor} ${sufixo} ${detalhe}` : `${sufixo} ${valor}`}
        </div>
      )}
    </div>
  );
}