/**
 * @file FechoPeriodoManager.tsx
 * @description Fecho mensal de um período contabilístico.
 *
 * O ecrã é um wizard vertical: cada passo do checklist mostra o seu estado e,
 * quando há bloqueios, o rodapé fixo explica porque o fecho ainda não pode ser
 * executado. A decisão final é sempre do backend — a UI apenas apresenta a
 * previsão e envia a ordem de execução.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  History,
  Loader2,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  XCircle,
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
  ExecucaoFechoDto,
  ExercicioFiscalDto,
  PassoFechoDto,
  PeriodoContabilDto,
  PrevisaoFechoDto,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { StatusBadge } from './Primitives';

const ROTULO_ESTADO_PERIODO: Record<string, string> = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  bloqueado: 'Bloqueado',
};

const TOM_ESTADO_PERIODO: Record<string, 'success' | 'warning' | 'danger'> = {
  aberto: 'success',
  fechado: 'warning',
  bloqueado: 'danger',
};

const ROTULO_TIPO_EXECUCAO: Record<string, string> = {
  fechoMensal: 'Fecho mensal',
  apuramentoIva: 'Apuramento IVA',
  apuramentoResultados: 'Apuramento de resultados',
  fechoAnual: 'Fecho anual',
  aberturaExercicioSeguinte: 'Abertura do exercício seguinte',
};

const TOM_EXECUCAO: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  executado: 'success',
  previsao: 'info',
  revertido: 'warning',
  falhado: 'danger',
};

function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function dataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FechoPeriodoManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [exercicioId, setExercicioId] = useState('');
  const [periodos, setPeriodos] = useState<PeriodoContabilDto[]>([]);
  const [periodoId, setPeriodoId] = useState('');

  const [previsao, setPrevisao] = useState<PrevisaoFechoDto | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoFechoDto[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [motivo, setMotivo] = useState('');

  const periodoActual = useMemo(
    () => periodos.find((p) => p.id === periodoId) ?? null,
    [periodos, periodoId]
  );

  const carregarExercicios = useCallback(async () => {
    if (!empresaId) {
      setIsLoading(false);
      return;
    }
    const res = await contabilidadeApi.listarExercicios(empresaId);
    if (!res.success) {
      toast.error('Não foi possível carregar os exercícios', { description: res.error.message });
      setIsLoading(false);
      return;
    }
    setExercicios(res.data);
    setExercicioId((atual) => atual || res.data[0]?.id || '');
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregarExercicios();
  }, [carregarExercicios]);

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

  const carregarPrevisao = useCallback(async () => {
    if (!periodoId) {
      setPrevisao(null);
      setExecucoes([]);
      return;
    }
    const [previsaoRes, execucoesRes] = await Promise.all([
      contabilidadeApi.previsaoFecho(periodoId),
      contabilidadeApi.listarExecucoesFecho({ periodoId }),
    ]);
    if (previsaoRes.success) setPrevisao(previsaoRes.data);
    else toast.error('Não foi possível obter a previsão de fecho', { description: previsaoRes.error.message });
    if (execucoesRes.success) setExecucoes(execucoesRes.data.items);
  }, [periodoId]);

  useEffect(() => {
    void carregarPrevisao();
  }, [carregarPrevisao]);

  const executar = async () => {
    if (!periodoId) return;
    if (!confirm('Executar o fecho deste período? Deixa de aceitar lançamentos até ser reaberto.')) {
      return;
    }
    setIsWorking(true);
    const res = await contabilidadeApi.executarFecho(periodoId);
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível fechar o período', { description: res.error.message });
      return;
    }
    toast.success('Período fechado.');
    await Promise.all([carregarPrevisao(), recarregarPeriodos()]);
  };

  const recarregarPeriodos = useCallback(async () => {
    if (!exercicioId) return;
    const res = await contabilidadeApi.listarPeriodos({ exercicioId });
    if (res.success) setPeriodos(res.data.items);
  }, [exercicioId]);

  const abrirReabertura = () => {
    setMotivo('');
    setReabrirAberto(true);
  };

  const confirmarReabertura = async () => {
    if (!periodoId) return;
    if (!motivo.trim()) {
      toast.error('Indique o motivo da reabertura.');
      return;
    }
    if (!confirm('Reabrir o período? Esta acção fica registada na auditoria.')) return;

    setIsWorking(true);
    const res = await contabilidadeApi.reabrirPeriodoFecho(periodoId, { motivo: motivo.trim() });
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível reabrir o período', { description: res.error.message });
      return;
    }
    toast.success('Período reaberto.');
    setReabrirAberto(false);
    await Promise.all([carregarPrevisao(), recarregarPeriodos()]);
  };

  const opcoesExercicios = exercicios.map((e) => ({ value: e.id, label: `Exercício ${e.ano}` }));

  const opcoesPeriodos = periodos.map((p) => ({
    value: p.id,
    label: `${String(p.numero).padStart(2, '0')} · ${dataCurta(p.dataInicio)} a ${dataCurta(p.dataFim)} · ${
      ROTULO_ESTADO_PERIODO[p.estado] ?? p.estado
    }`,
  }));

  const totalPassos = previsao?.passos.length ?? 0;
  const passosOk = previsao?.passos.filter((p) => p.estado === 'ok').length ?? 0;
  const progresso = totalPassos === 0 ? 0 : Math.round((passosOk / totalPassos) * 100);

  const podeExecutar = !!previsao?.podeFechar && periodoActual?.estado === 'aberto' && !isWorking;
  const podeReabrir = periodoActual?.estado === 'fechado' && !isWorking;

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
        <StatusBadge tone={TOM_ESTADO_PERIODO[periodoActual.estado] ?? 'neutral'}>
          {ROTULO_ESTADO_PERIODO[periodoActual.estado] ?? periodoActual.estado}
        </StatusBadge>
      )}
      <div className="flex-1" />
      <Button type="button" variant="outline" size="sm" onClick={() => void carregarPrevisao()}>
        <RefreshCw className="w-4 h-4" />
        Actualizar
      </Button>
    </div>
  );

  return (
    <WorkspaceFrame
      title="Fecho de período"
      description="Valide os passos do mês antes de fechar. O fecho bloqueia novos lançamentos até reabertura auditada."
      toolbar={toolbar}
    >
      {!periodoId ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Escolha um período para começar.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* Progresso */}
            <div className="border-b border-border px-4 py-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium">
                  Checklist do fecho
                  {previsao && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {passosOk} de {totalPassos} passos concluídos
                    </span>
                  )}
                </span>
                <span className="tabular-nums font-semibold">{progresso}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={[
                    'h-full transition-all duration-300',
                    previsao?.podeFechar ? 'bg-success' : 'bg-primary',
                  ].join(' ')}
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>

            {/* Passos */}
            {previsao ? (
              <ol className="divide-y divide-border">
                {previsao.passos.map((passo, indice) => (
                  <PassoItem key={passo.codigo} passo={passo} indice={indice + 1} />
                ))}
              </ol>
            ) : (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> A validar o período…
              </div>
            )}

            {/* Bloqueios */}
            {previsao && previsao.bloqueios.length > 0 && (
              <div className="mx-4 my-4 rounded-md border border-warning/40 bg-warning/10 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[oklch(0.45_0.12_75)]">
                  <AlertTriangle className="w-4 h-4" />
                  Bloqueios ao fecho
                </div>
                <ul className="mt-2 list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {previsao.bloqueios.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Histórico */}
            <div className="px-4 pb-6 pt-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Histórico de execuções
              </h3>
              {execucoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há execuções para este período.</p>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Tipo</th>
                        <th className="text-left font-medium px-3 py-2 w-32">Estado</th>
                        <th className="text-left font-medium px-3 py-2 w-44">Concluído em</th>
                        <th className="text-left font-medium px-3 py-2">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {execucoes.map((e) => (
                        <tr key={e.id} className="border-t border-border">
                          <td className="px-3 py-2">{ROTULO_TIPO_EXECUCAO[e.tipo] ?? e.tipo}</td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={TOM_EXECUCAO[e.estado] ?? 'neutral'}>{e.estado}</StatusBadge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {dataHora(e.concluidoEm)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[320px]">
                            {resumirDetalhes(e.detalhes)}
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4" />
              {previsao?.podeFechar
                ? 'Todos os passos estão concluídos. O período pode ser fechado.'
                : 'Resolva os bloqueios antes de executar o fecho.'}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={abrirReabertura} disabled={!podeReabrir}>
                <LockOpen className="w-4 h-4" />
                Reabrir período
              </Button>
              <Button type="button" size="sm" onClick={() => void executar()} disabled={!podeExecutar}>
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Executar fecho
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={reabrirAberto} onOpenChange={setReabrirAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir período</DialogTitle>
            <DialogDescription>
              A reabertura fica registada na auditoria. Indique o motivo — é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Motivo</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: lançamento em falta na integração de compras"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setReabrirAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={() => void confirmarReabertura()} disabled={isWorking}>
              {isWorking && <Loader2 className="w-4 h-4 animate-spin" />}
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}

function PassoItem({ passo, indice }: { passo: PassoFechoDto; indice: number }) {
  const icone =
    passo.estado === 'ok' ? (
      <CheckCircle2 className="w-5 h-5 text-success" />
    ) : passo.estado === 'erro' ? (
      <XCircle className="w-5 h-5 text-destructive" />
    ) : (
      <CircleDashed className="w-5 h-5 text-warning" />
    );

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0">{icone}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{String(indice).padStart(2, '0')}</span>
          <span className="text-sm font-medium">{passo.descricao}</span>
        </div>
        {passo.detalhes && <p className="text-xs text-muted-foreground mt-0.5">{passo.detalhes}</p>}
      </div>
      <StatusBadge tone={passo.estado === 'ok' ? 'success' : passo.estado === 'erro' ? 'danger' : 'warning'}>
        {passo.estado === 'ok' ? 'Concluído' : passo.estado === 'erro' ? 'Erro' : 'Pendente'}
      </StatusBadge>
    </li>
  );
}

function resumirDetalhes(detalhes: string | null | undefined): string {
  if (!detalhes) return '—';
  try {
    const parsed = JSON.parse(detalhes) as Record<string, unknown>;
    if (typeof parsed.motivo === 'string') return `Motivo: ${parsed.motivo}`;
    if (Array.isArray(parsed.passos)) return `${parsed.passos.length} passo(s) registado(s).`;
    return detalhes;
  } catch {
    return detalhes;
  }
}
