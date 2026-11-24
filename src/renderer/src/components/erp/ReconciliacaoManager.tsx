/**
 * @file ReconciliacaoManager.tsx
 * @description Conciliação entre o extracto bancário e os lançamentos internos.
 *
 * O extracto é a fonte de verdade do que aconteceu no banco; o lançamento
 * interno é a afirmação do ERP. Um lançamento fica conciliado quando alguém o
 * reconheceu numa linha do extracto — a partir daí os dois números batem e a
 * diferença é a lista de trabalho deste ecrã.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCheck,
  CheckCircle,
  Loader2,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";
import {
  ContaBancariaComSaldoDto,
  MovimentoTesourariaDto,
  ResumoSaldoContaDto,
} from "../../@types/electron";
import { tesourariaApi } from "../../api/tesouraria.api";
import { useAuth } from "../../hooks/useAuth";
import { SearchSelect } from "../ui/SearchSelect";
import { StatusBadge } from "./Primitives";
import { formatCurrency } from "@/utils/currency";
import { toast } from "sonner";

const hojeIso = () => new Date().toISOString().split("T")[0];

function formatarData(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ReconciliacaoManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || "";

  const [contas, setContas] = useState<ContaBancariaComSaldoDto[]>([]);
  const [resumo, setResumo] = useState<ResumoSaldoContaDto[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoTesourariaDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const [contaId, setContaId] = useState("");
  const [search, setSearch] = useState("");
  const [dataConciliacao, setDataConciliacao] = useState(hojeIso());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const fetchDados = useCallback(async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      const [listaContas, listaResumo, listaMovimentos] = await Promise.all([
        tesourariaApi.listarContasComSaldos({ empresaId, apenasAtivas: true }),
        tesourariaApi.resumoSaldos({ empresaId }),
        contaId
          ? tesourariaApi.listarMovimentos({
              empresaId,
              contaId,
              conciliado: false,
              estado: "confirmado",
              take: 200,
            })
          : Promise.resolve(null),
      ]);

      if (listaContas.success) setContas(listaContas.data.items);
      if (listaResumo.success) setResumo(listaResumo.data);
      if (listaMovimentos?.success) setMovimentos(listaMovimentos.data.items);
      else setMovimentos([]);
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, contaId]);

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  // Trocar de conta invalida a selecção: os IDs marcados são de outra conta.
  useEffect(() => {
    setSelecionados(new Set());
  }, [contaId]);

  const visiveis = movimentos.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.numero.toLowerCase().includes(q) ||
      (m.descricao ?? "").toLowerCase().includes(q) ||
      (m.documentoNumero ?? "").toLowerCase().includes(q) ||
      (m.observacaoExtrato ?? "").toLowerCase().includes(q)
    );
  });

  const pendentes = visiveis.filter((m) => !selecionados.has(m.id));
  const totalSelecionado = pendentes.reduce((s, m) => s + m.valor, 0);
  const resumoConta = resumo.find((r) => r.contaId === contaId);

  const alternar = (id: string) => {
    setSelecionados((actual) => {
      const proximo = new Set(actual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const seleccionarTodos = () => setSelecionados(new Set(pendentes.map((m) => m.id)));
  const limparSelecao = () => setSelecionados(new Set());

  const handleConciliarLote = async () => {
    if (selecionados.size === 0) {
      toast.error("Escolha pelo menos um lançamento.");
      return;
    }
    try {
      setIsBusy(true);
      const res = await tesourariaApi.conciliarLote({
        empresaId,
        contaBancariaId: contaId,
        movimentosIds: [...selecionados],
        dataConciliacao: new Date(dataConciliacao),
      });
      if (res.success) {
        toast.success(`${res.data.atualizados} lançamento(s) conciliado(s) com o extracto.`);
        limparSelecao();
        fetchDados();
      } else {
        toast.error(res.error.message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDesconciliar = async (m: MovimentoTesourariaDto) => {
    const res = await tesourariaApi.conciliarMovimento(m.id, false);
    if (res.success) {
      toast.success(`Lançamento ${m.numero} voltou à lista de trabalho.`);
      fetchDados();
    } else {
      toast.error(res.error.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Conta a conciliar</label>
          <SearchSelect
            value={contaId}
            onChange={setContaId}
            options={contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.designacao}` }))}
            placeholder="Escolher conta"
          />
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data da conciliação</label>
          <input
            type="date"
            value={dataConciliacao}
            onChange={(e) => setDataConciliacao(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          />
        </div>
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
        <button
          type="button"
          onClick={fetchDados}
          disabled={isLoading}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
          title="Actualizar"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {!contaId ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-md px-4 py-12 text-center">
          Escolha a conta que quer conciliar para ver o que ficou por bater com o extracto.
        </p>
      ) : (
        <>
          {resumoConta && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Indicador
                rotulo="Saldo do ERP"
                valor={resumoConta.saldo}
                moeda={resumoConta.moeda}
              />
              <Indicador
                rotulo="Conciliados"
                valor={resumoConta.movimentosConciliados}
                sufixo="de"
                detalhe={`${resumoConta.totalMovimentos} lançamentos`}
              />
              <Indicador
                rotulo="Por conciliar"
                valor={resumoConta.movimentosNaoConciliados}
                destaque={resumoConta.movimentosNaoConciliados > 0}
              />
              <Indicador
                rotulo="Total dos por conciliar"
                valor={formatCurrency(
                  visiveis.filter((m) => !m.conciliado).reduce((s, m) => s + m.valor, 0),
                  resumoConta.moeda
                )}
              />
            </div>
          )}

          <div className="bg-card border border-border rounded-md shadow-[var(--shadow-card)] overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 px-4 h-11 border-b border-border">
              <h2 className="text-sm font-semibold">
                Por conciliar
                {selecionados.size > 0 && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {selecionados.size} seleccionado(s) · {formatCurrency(totalSelecionado, "AOA")}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {pendentes.length > 0 && (
                  <button
                    type="button"
                    onClick={seleccionarTodos}
                    className="h-8 px-3 rounded-md text-xs border border-border hover:bg-muted transition-colors"
                  >
                    Seleccionar todos
                  </button>
                )}
                {selecionados.size > 0 && (
                  <button
                    type="button"
                    onClick={limparSelecao}
                    className="h-8 px-3 rounded-md text-xs border border-border hover:bg-muted transition-colors"
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleConciliarLote}
                  disabled={isBusy || selecionados.size === 0}
                  className="h-8 px-3 inline-flex items-center gap-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                  Conciliar seleccionados
                </button>
              </div>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium w-10" />
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Nº</th>
                    <th className="px-4 py-2 font-medium">Descrição</th>
                    <th className="px-4 py-2 font-medium text-right">Valor</th>
                    <th className="px-4 py-2 font-medium text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((m) => {
                    const marcado = selecionados.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        className={[
                          "border-t border-border transition-colors",
                          marcado ? "bg-primary/5" : "hover:bg-accent/40",
                        ].join(" ")}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => alternar(m.id)}
                            className="w-4 h-4 rounded border-input accent-[hsl(var(--primary))]"
                            aria-label={`Seleccionar ${m.numero}`}
                          />
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {formatarData(m.data)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{m.numero}</td>
                        <td className="px-4 py-2.5 max-w-72">
                          <div className="truncate">{m.descricao ?? "—"}</div>
                          {(m.documentoNumero || m.observacaoExtrato) && (
                            <div className="text-xs text-muted-foreground truncate">
                              {m.documentoNumero ?? m.observacaoExtrato}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                          {formatCurrency(m.valor, "AOA")}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {m.conciliado ? (
                              <>
                                <StatusBadge tone="success">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Conciliado
                                </StatusBadge>
                                <button
                                  type="button"
                                  onClick={() => handleDesconciliar(m)}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  title="Desfazer conciliação"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <StatusBadge tone="warning">Por conciliar</StatusBadge>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {isLoading
                          ? "A carregar…"
                          : "Nada por conciliar nesta conta. O extracto bate certo com o ERP."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
  valor: number | string;
  moeda?: string;
  sufixo?: string;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-md border p-4",
        destaque
          ? "bg-warning/5 border-warning/30"
          : "bg-card border-border shadow-[var(--shadow-card)]",
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
