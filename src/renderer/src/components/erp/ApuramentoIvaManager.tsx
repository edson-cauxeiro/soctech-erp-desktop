/**
 * @file ApuramentoIvaManager.tsx
 * @description Apuramento de IVA por período.
 *
 * O apuramento é sempre mostrado primeiro em pré-visualização. Só depois de o
 * utilizador confirmar é que o serviço grava o `ApuramentoImposto` e o
 * lançamento de liquidação. O histórico permite registar o pagamento do IVA
 * apurado sem sair do ecrã.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  History,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchSelect } from '@/components/ui/SearchSelect';
import {
  ApuramentoImpostoDto,
  ContaBancariaDto,
  ExercicioFiscalDto,
  PeriodoContabilDto,
  PrevisaoApuramentoIvaDto,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { tesourariaApi } from '../../api/tesouraria.api';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency } from '@/utils/currency';
import { WorkspaceFrame } from './WorkspaceFrame';
import { StatusBadge } from './Primitives';

const ROTULO_ESTADO_PERIODO: Record<string, string> = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  bloqueado: 'Bloqueado',
};

function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dinheiro(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '—';
  return formatCurrency(n, 'AOA');
}

const TOM_ESTADO_APURAMENTO: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  rascunho: 'neutral',
  validado: 'info',
  pago: 'success',
};

export function ApuramentoIvaManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [exercicioId, setExercicioId] = useState('');
  const [periodos, setPeriodos] = useState<PeriodoContabilDto[]>([]);
  const [periodoId, setPeriodoId] = useState('');

  const [previsao, setPrevisao] = useState<PrevisaoApuramentoIvaDto | null>(null);
  const [historico, setHistorico] = useState<ApuramentoImpostoDto[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancariaDto[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [apuramentoPagamento, setApuramentoPagamento] = useState<ApuramentoImpostoDto | null>(null);
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [dataPagamento, setDataPagamento] = useState(hojeIso());

  const periodoActual = useMemo(
    () => periodos.find((p) => p.id === periodoId) ?? null,
    [periodos, periodoId]
  );

  const apuramentoDoPeriodo = useMemo(
    () => (periodoId ? historico.find((h) => h.periodoId === periodoId) ?? null : null),
    [historico, periodoId]
  );

  const carregarApoio = useCallback(async () => {
    if (!empresaId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [exRes, contasRes] = await Promise.all([
      contabilidadeApi.listarExercicios(empresaId),
      tesourariaApi.listarContas({ empresaId, apenasAtivas: true }),
    ]);
    if (exRes.success) {
      setExercicios(exRes.data);
      setExercicioId((atual) => atual || exRes.data[0]?.id || '');
    } else {
      toast.error('Não foi possível carregar os exercícios', { description: exRes.error.message });
    }
    if (contasRes.success) setContasBancarias(contasRes.data.items);
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregarApoio();
  }, [carregarApoio]);

  useEffect(() => {
    if (!exercicioId) {
      setPeriodos([]);
      setPeriodoId('');
      return;
    }
    let cancelado = false;
    void (async () => {
      const res = await contabilidadeApi.listarPeriodos({ exercicioId });
      if (cancelado) return;
      if (res.success) {
        setPeriodos(res.data.items);
        setPeriodoId((atual) =>
          res.data.items.some((p) => p.id === atual) ? atual : res.data.items[0]?.id ?? ''
        );
      } else {
        toast.error('Não foi possível carregar os períodos', { description: res.error.message });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [exercicioId]);

  const carregarHistorico = useCallback(async () => {
    if (!empresaId) return;
    const res = await contabilidadeApi.listarApuramentosIva(exercicioId ? { exercicioId } : undefined);
    if (res.success) setHistorico(res.data);
  }, [empresaId, exercicioId]);

  const recalcular = useCallback(async () => {
    if (!periodoId) {
      setPrevisao(null);
      return;
    }
    if (periodoActual && periodoActual.estado !== 'aberto') {
      setPrevisao(null);
      return;
    }
    const res = await contabilidadeApi.previsaoApuramentoIva(periodoId);
    if (res.success) setPrevisao(res.data);
    else {
      setPrevisao(null);
      toast.error('Não foi possível calcular a previsão', { description: res.error.message });
    }
  }, [periodoId, periodoActual]);

  useEffect(() => {
    void recalcular();
  }, [recalcular]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const validar = async () => {
    if (!periodoId) return;
    if (!confirm('Validar o apuramento de IVA? É criado o lançamento de liquidação no período.')) return;

    setIsWorking(true);
    const res = await contabilidadeApi.executarApuramentoIva(periodoId);
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível validar o apuramento', { description: res.error.message });
      return;
    }
    toast.success('Apuramento validado.');
    await Promise.all([carregarHistorico(), recalcular()]);
  };

  const abrirPagamento = (apuramento: ApuramentoImpostoDto) => {
    setApuramentoPagamento(apuramento);
    setContaBancariaId(contasBancarias[0]?.id ?? '');
    setDataPagamento(hojeIso());
    setPagamentoAberto(true);
  };

  const confirmarPagamento = async () => {
    if (!apuramentoPagamento) return;
    if (!contaBancariaId) {
      toast.error('Escolha a conta bancária de pagamento.');
      return;
    }
    if (!confirm(`Registar o pagamento de ${dinheiro(apuramentoPagamento.saldo)}?`)) return;

    setIsWorking(true);
    const res = await contabilidadeApi.registarPagamentoIva({
      apuramentoId: apuramentoPagamento.id,
      contaBancariaId,
      dataPagamento,
    });
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível registar o pagamento', { description: res.error.message });
      return;
    }
    toast.success('Pagamento registado.');
    setPagamentoAberto(false);
    await carregarHistorico();
  };

  const opcoesExercicios = exercicios.map((e) => ({ value: e.id, label: `Exercício ${e.ano}` }));
  const opcoesPeriodos = periodos.map((p) => ({
    value: p.id,
    label: `${String(p.numero).padStart(2, '0')} · ${dataCurta(p.dataInicio)} a ${dataCurta(p.dataFim)} · ${
      ROTULO_ESTADO_PERIODO[p.estado] ?? p.estado
    }`,
  }));
  const opcoesContas = contasBancarias.map((c) => ({
    value: c.id,
    label: `${c.codigo} — ${c.designacao}`,
  }));

  const podeValidar = !!previsao && !apuramentoDoPeriodo && periodoActual?.estado === 'aberto' && !isWorking;

  const toolbar = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-48">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Exercício</label>
        <SearchSelect
          value={exercicioId}
          onChange={setExercicioId}
          options={opcoesExercicios}
          placeholder="Escolher exercício"
          allowClear
          disabled={isLoading}
        />
      </div>
      <div className="w-80">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Período</label>
        <SearchSelect
          value={periodoId}
          onChange={setPeriodoId}
          options={opcoesPeriodos}
          placeholder="Escolher período"
          disabled={!exercicioId}
        />
      </div>
      {periodoActual && (
        <StatusBadge tone={periodoActual.estado === 'aberto' ? 'success' : periodoActual.estado === 'fechado' ? 'warning' : 'danger'}>
          {ROTULO_ESTADO_PERIODO[periodoActual.estado] ?? periodoActual.estado}
        </StatusBadge>
      )}
      <div className="flex-1" />
      <Button type="button" variant="outline" size="sm" onClick={() => void recalcular()} disabled={!periodoId}>
        <RefreshCw className="w-4 h-4" />
        Recalcular
      </Button>
    </div>
  );

  return (
    <WorkspaceFrame
      title="Apuramento de IVA"
      description="Cálculo do IVA liquidado e dedutível do período, com lançamento de liquidação e registo de pagamento."
      toolbar={toolbar}
    >
      {!periodoId ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Escolha um período para calcular o apuramento.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto">
            {periodoActual && periodoActual.estado !== 'aberto' ? (
              <div className="m-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
                <div className="font-medium text-[oklch(0.45_0.12_75)]">Período {ROTULO_ESTADO_PERIODO[periodoActual.estado]?.toLowerCase()}</div>
                <p className="mt-1 text-muted-foreground">
                  O apuramento de IVA tem de ser feito antes do fecho, enquanto o período está aberto.
                  Reabra o período se precisar de o corrigir.
                </p>
              </div>
            ) : previsao ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
                  <Kpi rotulo="IVA liquidado" valor={previsao.ivaLiquidado} tom="credito" />
                  <Kpi rotulo="IVA dedutível" valor={previsao.ivaDedutivel} tom="debito" />
                  <Kpi rotulo="Crédito transitado" valor={previsao.creditoTransitado} />
                  {Number(previsao.saldo) >= 0 ? (
                    <Kpi rotulo="IVA a pagar" valor={previsao.aPagar} tom="pagar" />
                  ) : (
                    <Kpi rotulo="IVA a recuperar" valor={previsao.aRecuperar} tom="recuperar" />
                  )}
                </div>

                {/* Detalhe */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 px-4 pb-4">
                  <DetalheContas
                    titulo="IVA liquidado (contas de output)"
                    descricao="Créditos menos débitos nas contas VAT_OUTPUT."
                    linhas={previsao.detalhes.contasOutput}
                  />
                  <DetalheContas
                    titulo="IVA dedutível (contas de input)"
                    descricao="Débitos menos créditos nas contas VAT_INPUT."
                    linhas={previsao.detalhes.contasInput}
                  />
                </div>

                <div className="mx-4 mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <span className="text-muted-foreground">Saldo do período: </span>
                  <span className={Number(previsao.saldo) > 0 ? 'font-semibold text-destructive' : 'font-semibold text-success'}>
                    {dinheiro(previsao.saldo)}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    — {Number(previsao.saldo) > 0 ? 'a pagar' : Number(previsao.saldo) < 0 ? 'a recuperar (transita)' : 'sem valor'}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> A calcular…
              </div>
            )}

            {/* Histórico */}
            <div className="px-4 pb-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Histórico de apuramentos
              </h3>
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há apuramentos de IVA neste exercício.</p>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-3 py-2 w-28">Período</th>
                        <th className="text-right font-medium px-3 py-2">Liquidado</th>
                        <th className="text-right font-medium px-3 py-2">Dedutível</th>
                        <th className="text-right font-medium px-3 py-2">Crédito</th>
                        <th className="text-right font-medium px-3 py-2">Saldo</th>
                        <th className="text-left font-medium px-3 py-2 w-28">Estado</th>
                        <th className="text-left font-medium px-3 py-2 w-28">Pago em</th>
                        <th className="text-right font-medium px-3 py-2 w-24">Acção</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map((h) => (
                        <tr key={h.id} className="border-t border-border hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">
                            {String(h.periodoNumero).padStart(2, '0')}/{h.ano}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{dinheiro(h.liquidado)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{dinheiro(h.dedutivel)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{dinheiro(h.creditoTransitado)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{dinheiro(h.saldo)}</td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={TOM_ESTADO_APURAMENTO[h.estado] ?? 'neutral'}>{h.estado}</StatusBadge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{dataCurta(h.pagoEm)}</td>
                          <td className="px-3 py-2 text-right">
                            {h.estado === 'validado' && Number(h.saldo) > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => abrirPagamento(h)}
                              >
                                <Wallet className="w-3.5 h-3.5" />
                                Pagar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé fixo */}
          <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {apuramentoDoPeriodo
                ? 'Este período já tem apuramento de IVA registado.'
                : 'A pré-visualização não grava nada. Confirme para criar o lançamento de liquidação.'}
            </div>
            <Button type="button" size="sm" onClick={() => void validar()} disabled={!podeValidar}>
              {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {apuramentoDoPeriodo ? 'Já apurado' : 'Validar apuramento'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={pagamentoAberto} onOpenChange={setPagamentoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registar pagamento de IVA</DialogTitle>
            <DialogDescription>
              {apuramentoPagamento
                ? `Período ${String(apuramentoPagamento.periodoNumero).padStart(2, '0')}/${apuramentoPagamento.ano} — ${dinheiro(
                    apuramentoPagamento.saldo
                  )}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Conta bancária</label>
              <SearchSelect
                value={contaBancariaId}
                onChange={setContaBancariaId}
                options={opcoesContas}
                placeholder="Escolher conta"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Data do pagamento</label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setPagamentoAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={() => void confirmarPagamento()} disabled={isWorking}>
              {isWorking && <Loader2 className="w-4 h-4 animate-spin" />}
              Registar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}

function Kpi({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: string;
  tom?: 'credito' | 'debito' | 'pagar' | 'recuperar';
}) {
  const cor =
    tom === 'pagar'
      ? 'text-destructive'
      : tom === 'recuperar'
        ? 'text-success'
        : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {rotulo}
        {tom === 'credito' && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/60" />}
        {tom === 'debito' && <ArrowDownLeft className="w-3.5 h-3.5 text-muted-foreground/60" />}
        {tom === 'pagar' && <Calculator className="w-3.5 h-3.5 text-destructive/70" />}
        {tom === 'recuperar' && <Wallet className="w-3.5 h-3.5 text-success/70" />}
      </div>
      <div className={`mt-2 text-xl font-semibold tracking-tight tabular-nums ${cor}`}>{dinheiro(valor)}</div>
    </div>
  );
}

function DetalheContas({
  titulo,
  descricao,
  linhas,
}: {
  titulo: string;
  descricao: string;
  linhas: Array<{ codigo: string; designacao: string; debito: string; credito: string; liquido: string }>;
}) {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <header className="border-b border-border bg-muted/30 px-3 py-2">
        <h4 className="text-sm font-medium">{titulo}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>
      </header>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2 w-20">Conta</th>
            <th className="text-left font-medium px-3 py-2">Designação</th>
            <th className="text-right font-medium px-3 py-2 w-28">Débito</th>
            <th className="text-right font-medium px-3 py-2 w-28">Crédito</th>
            <th className="text-right font-medium px-3 py-2 w-28">Líquido</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                Sem movimento em contas de IVA.
              </td>
            </tr>
          ) : (
            linhas.map((l) => (
              <tr key={l.codigo} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{l.codigo}</td>
                <td className="px-3 py-2 truncate max-w-[220px]">{l.designacao}</td>
                <td className="px-3 py-2 text-right tabular-nums">{dinheiro(l.debito)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{dinheiro(l.credito)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{dinheiro(l.liquido)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
