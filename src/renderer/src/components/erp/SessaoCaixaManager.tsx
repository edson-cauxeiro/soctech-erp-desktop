/**
 * @file SessaoCaixaManager.tsx
 * @description Página autónoma de gestão de sessões de caixa — abertura, apuramento
 * e fecho — disponível no menu de Finanças.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Lock,
  Loader2,
  RefreshCw,
  Unlock,
  Wallet,
  CheckCircle,
  Power,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  ApuramentoSessaoDto,
  ContaBancariaComSaldoDto,
  SessaoCaixaDto,
} from '../../@types/electron';
import { tesourariaApi } from '../../api/tesouraria.api';
import { useAuth } from '../../hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { SearchSelect } from '../ui/SearchSelect';
import { StatusBadge } from './Primitives';
import { formatCurrency } from '@/utils/currency';
import { toast } from 'sonner';

const hojeIso = () => new Date().toISOString().split('T')[0];

/** Arredonda a 2 casas, como o backend, para a diferença não nascer do float. */
function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function formatarDataHora(valor?: string | Date | null): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function caixasLivres(
  contas: ContaBancariaComSaldoDto[],
  sessoes: SessaoCaixaDto[]
): ContaBancariaComSaldoDto[] {
  return contas.filter(
    (c) => c.ativo && !sessoes.some((s) => s.contaCaixaId === c.id && s.estado === 'aberta')
  );
}

export function SessaoCaixaManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [contas, setContas] = useState<ContaBancariaComSaldoDto[]>([]);
  const [sessoes, setSessoes] = useState<SessaoCaixaDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [contaParaAbrir, setContaParaAbrir] = useState('');
  const [fundoInicial, setFundoInicial] = useState(0);

  const [sessaoActiva, setSessaoActiva] = useState<SessaoCaixaDto | null>(null);
  const [apuramento, setApuramento] = useState<ApuramentoSessaoDto | null>(null);
  const [fecharAberto, setFecharAberto] = useState(false);
  const [motivoFecho, setMotivoFecho] = useState('');
  // O fecho é contado por meio de pagamento, não por um valor único: o
  // backend separa numerário, multicaixa e transferência para poder
  // confrontar cada meio com o que foi movimentado.
  const [contagem, setContagem] = useState({ numerario: 0, multicaixa: 0, transferencia: 0 });
  const [isClosing, setIsClosing] = useState(false);

  const totalContado =
    arredondar(contagem.numerario) + arredondar(contagem.multicaixa) + arredondar(contagem.transferencia);

  const fetchContas = useCallback(async () => {
    if (!empresaId) return;
    const res = await tesourariaApi.listarContasComSaldos({ empresaId, apenasAtivas: true });
    if (res.success) setContas(res.data.items.filter((c: ContaBancariaComSaldoDto) => c.tipo === 'caixa'));
  }, [empresaId]);

  const fetchSessoes = useCallback(async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      const res = await tesourariaApi.listarSessoes({ empresaId });
      if (res.success) setSessoes(res.data.items);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchContas();
    fetchSessoes();
  }, [fetchContas, fetchSessoes]);

  const livres = useMemo(() => caixasLivres(contas, sessoes), [contas, sessoes]);
  useEffect(() => {
    setContaParaAbrir((actual) => actual || livres[0]?.id || '');
  }, [livres]);

  const handleAbrir = async () => {
    if (!contaParaAbrir) {
      toast.error('Escolha a caixa que vai abrir.');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await tesourariaApi.abrirSessao({
        empresaId,
        contaCaixaId: contaParaAbrir,
        dataAbertura: new Date(hojeIso()),
        fundoInicial,
      });
      if (res.success) {
        toast.success("Sessão aberta com sucesso.");
        setFundoInicial(0);
        setSessaoActiva(res.data);
        setApuramento(null);
        fetchSessoes();
      } else {
        toast.error(res.error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelecionar = async (sessao: SessaoCaixaDto) => {
    setSessaoActiva(sessao);
    setApuramento(null);
    if (sessao.estado === 'aberta') {
      const res = await tesourariaApi.apurarSessao(sessao.id);
      if (res.success) setApuramento(res.data);
    }
  };

  const handleActualizar = async () => {
    if (!sessaoActiva) return;
    const res = await tesourariaApi.apurarSessao(sessaoActiva.id);
    if (res.success) {
      setApuramento(res.data);
      fetchSessoes();
    }
  };

  const handleFechar = async () => {
    if (!sessaoActiva) return;
    try {
      setIsClosing(true);
      const res = await tesourariaApi.fecharSessao(sessaoActiva.id, {
        totalNumerario: arredondar(contagem.numerario),
        totalMulticaixa: arredondar(contagem.multicaixa),
        totalTransferencia: arredondar(contagem.transferencia),
        observacoes: motivoFecho.trim() || undefined,
      });
      if (res.success) {
        toast.success("Sessão  fechada.");
        setFecharAberto(false);
        setSessaoActiva(null);
        setApuramento(null);
        setMotivoFecho('');
        setContagem({ numerario: 0, multicaixa: 0, transferencia: 0 });
        fetchSessoes();
        fetchContas();
      } else {
        toast.error(res.error.message);
      }
    } finally {
      setIsClosing(false);
    }
  };

  const caixasComSessaoAberta = sessoes.filter((s) => s.estado === 'aberta');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Caixas registadas</p>
            <p className="text-xl font-bold text-foreground">{contas.length}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-950 flex items-center justify-center shrink-0">
            <Unlock className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sessões abertas</p>
            <p className="text-xl font-bold text-foreground">{caixasComSessaoAberta.length}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Caixas disponíveis</p>
            <p className="text-xl font-bold text-foreground">{livres.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
            <header className="flex items-center gap-2 px-4 h-11 border-b border-border bg-muted/30">
              <Unlock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Abrir Sessão de Caixa</h2>
            </header>
            <div className="p-4 space-y-4">
              {contas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma conta do tipo caixa registada.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Caixa a abrir</label>
                    <SearchSelect
                      value={contaParaAbrir}
                      onChange={setContaParaAbrir}
                      // Objectos `{ value, label }`, não a string do template. Com
                      // a string, o `SearchSelect` recebia um array com uma
                      // entrada que não corresponde a nenhuma `contaCaixaId`, e a
                      // lista de caixas aparecia com um único item ilegível.
                      options={livres.map((c) => ({
                        value: c.id,
                        label: `${c.codigo} — ${c.designacao}`,
                      }))}
                      placeholder={livres.length === 0 ? 'Todas as caixas têm sessão aberta' : 'Escolher caixa'}
                      allowClear={false}
                      disabled={livres.length === 0}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Fundo inicial (AOA)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={fundoInicial || ''}
                      onChange={(e) => setFundoInicial(Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary text-right tabular-nums"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAbrir}
                    disabled={isSubmitting || livres.length === 0}
                    className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                    Abrir sessão
                  </button>
                </>
              )}
            </div>
          </div>

          {caixasComSessaoAberta.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                Sessões abertas agora
              </h3>
              <ul className="space-y-2">
                {caixasComSessaoAberta.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => handleSelecionar(s)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-left transition-colors border"
                    >
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {s.numero} · {s.contaCaixa?.designacao ?? '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Aberta: {formatarDataHora(s.horaAbertura ?? s.dataAbertura)}
                        </div>
                      </div>
                      <StatusBadge tone="success">Aberta</StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {sessaoActiva && (
            <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
              <header className="flex items-center justify-between px-4 h-11 border-b border-border bg-muted/30">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Power className="w-4 h-4 text-primary" />
                  Arqueação: {sessaoActiva.numero} — {sessaoActiva.contaCaixa?.designacao}
                </h2>
                <div className="flex items-center gap-2">
                  {sessaoActiva.estado === 'aberta' && (
                    <>
                      <button type="button" onClick={handleActualizar} className="h-7 px-2 text-xs border border-border rounded hover:bg-muted flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                      </button>
                      <button type="button" onClick={() => setFecharAberto(true)} className="h-7 px-3 text-xs bg-destructive text-white rounded font-semibold hover:opacity-90 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Fechar caixa
                      </button>
                    </>
                  )}
                </div>
              </header>

              {apuramento ? (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      {
                        label: 'Fundo inicial',
                        value: apuramento.fundoInicial,
                        icon: <Wallet className="w-3.5 h-3.5" />,
                      },
                      {
                        label: 'Entradas',
                        value: apuramento.totalEntradas,
                        icon: <TrendingUp className="w-3.5 h-3.5" />,
                        destaque: 'text-emerald-600',
                      },
                      {
                        label: 'Saídas',
                        value: apuramento.totalSaidas,
                        icon: <TrendingDown className="w-3.5 h-3.5" />,
                        destaque: 'text-rose-600',
                      },
                      {
                        label: 'Saldo em caixa',
                        value: apuramento.totalEsperado,
                        icon: <CheckCircle className="w-3.5 h-3.5" />,
                        destaque: 'text-primary',
                      },
                    ].map(({ label, value, icon, destaque }) => (
                      <div
                        key={label}
                        className={[
                          "rounded-md border p-3",
                          // O saldo calculado é o número que o utilizador
                          // compara com o dinheiro que contou. Distingui-lo dos
                          // outros três é o que evita que leia as entradas como
                          // se fossem o saldo.
                          label === 'Saldo em caixa' ? "border-primary/50 bg-primary/5" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          {icon}
                          <span>{label}</span>
                        </div>
                        <p className={`text-base font-bold tabular-nums ${destaque ?? ""}`}>
                          {formatCurrency(value, 'AOA')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 flex items-center justify-center h-32 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />A carregar apuramento…
                </div>
              )}
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
            <header className="flex items-center justify-between px-4 h-11 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold">Histórico de sessões</h2>
              <button type="button" onClick={fetchSessoes} disabled={isLoading} className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-50" title="Actualizar">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-4 py-3">Nº Sessão</th>
                    <th className="px-4 py-3">Caixa</th>
                    <th className="px-4 py-3">Abertura</th>
                    <th className="px-4 py-3 text-right">Fundo</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                  ) : sessoes.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-muted-foreground"><Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Ainda não há sessões registadas.</p></td></tr>
                  ) : (
                    sessoes.slice(0, 30).map((s) => (
                      <tr key={s.id} onClick={() => handleSelecionar(s)} className="hover:bg-muted/30 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5 font-mono font-bold text-primary">{s.numero}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{s.contaCaixa?.designacao ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatarDataHora(s.horaAbertura ?? s.dataAbertura)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(s.fundoInicial, 'AOA')}</td>
                        <td className="px-4 py-2.5 text-center">
                          {s.estado === 'aberta' ? (
                            <StatusBadge tone="success">Aberta</StatusBadge>
                          ) : s.diferenca != null && Math.abs(s.diferenca) > 0.005 ? (
                            <StatusBadge tone="danger">Dif. {formatCurrency(s.diferenca, 'AOA')}</StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">Fechada</StatusBadge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div >

          <Dialog open={fecharAberto} onOpenChange={setFecharAberto}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <Lock className="w-4 h-4" />
                  Fechar sessão {sessaoActiva?.numero}
                </DialogTitle>
                <DialogDescription>
                  O fecho encerra a sessão e regista o apuramento final para auditoria.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {apuramento && (
                  <div className="rounded-md bg-muted/40 border border-border p-3 text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saldo esperado em caixa</span>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(apuramento.totalEsperado, 'AOA')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total contado</span>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(totalContado, 'AOA')}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5">
                      <span className="text-muted-foreground">Diferença</span>
                      <span
                        className={[
                          "font-bold tabular-nums",
                          // O que o operador precisa de ver antes de confirmar:
                          // se a diferença é zero, é um fecho limpo; se não é,
                          // é o número que vai ficar registado como desvio.
                          Math.abs(totalContado - apuramento.totalEsperado) > 0.005
                            ? "text-rose-600"
                            : "text-emerald-600",
                        ].join(" ")}
                      >
                        {formatCurrency(arredondar(totalContado - apuramento.totalEsperado), 'AOA')}
                      </span>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Numerário contado (notas e moedas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    data-testid="fecho-numerario"
                    value={contagem.numerario || ''}
                    onChange={(e) => setContagem((c) => ({ ...c, numerario: Number(e.target.value) }))}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary text-right tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Multicaixa</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    data-testid="fecho-multicaixa"
                    value={contagem.multicaixa || ''}
                    onChange={(e) => setContagem((c) => ({ ...c, multicaixa: Number(e.target.value) }))}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary text-right tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Transferências / talões</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    data-testid="fecho-transferencia"
                    value={contagem.transferencia || ''}
                    onChange={(e) => setContagem((c) => ({ ...c, transferencia: Number(e.target.value) }))}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary text-right tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Observações (opcional)</label>
                  <textarea value={motivoFecho} onChange={(e) => setMotivoFecho(e.target.value)} rows={2} placeholder="Notas de fecho de caixa..." className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:border-primary resize-none" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setFecharAberto(false)} className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted">Cancelar</button>
                  <button
                    type="button"
                    onClick={handleFechar}
                    // O schema do backend recusa uma contagem totalmente a
                    // zero. Desactivar aqui evita um erro de validação que a
                    // pessoa só descobre depois de esperar pelo fecho.
                    disabled={isClosing || totalContado <= 0}
                    className="px-4 py-2 rounded-md bg-destructive text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isClosing && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Lock className="w-4 h-4" />
                    Fechar sessão
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div >
      </div >
    </div >
  );
}
