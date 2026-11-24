/**
 * @file FechoAnualManager.tsx
 * @description Apuramento de resultados e fecho anual do exercício.
 *
 * O ecrã tem duas fases, pela ordem correcta do PGC:
 *   1. Resultados — encerra proveitos e custos nas contas 81/82/84, apura o
 *      imposto e transporta o resultado para 88.
 *   2. Fecho anual — encerra o exercício, bloqueia os períodos e abre o ano
 *      seguinte com os saldos das classes 1–5.
 *
 * Nenhuma decisão é tomada na UI: os botões só ficam activos quando o backend
 * confirma que todos os passos anteriores estão concluídos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  CircleDashed,
  Loader2,
  LockOpen,
  RefreshCw,
  Scale,
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
  DetalheResultadoDto,
  ExercicioFiscalDto,
  PassoFechoAnualDto,
  PrevisaoFechoAnualDto,
  PrevisaoResultadosDto,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency } from '@/utils/currency';
import { WorkspaceFrame } from './WorkspaceFrame';
import { StatusBadge } from './Primitives';

type Fase = 'resultados' | 'anual';

const ROTULO_CLASSE: Record<string, string> = {
  operating: 'Operacional',
  financial: 'Financeiro',
  nonOperating: 'Não corrente',
};

function dinheiro(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '—';
  return formatCurrency(n, 'AOA');
}

function tomResultado(valor: string | number | undefined): 'success' | 'danger' {
  return Number(valor ?? 0) >= 0 ? 'success' : 'danger';
}

export function FechoAnualManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [exercicioId, setExercicioId] = useState('');
  const [fase, setFase] = useState<Fase>('resultados');

  const [resultados, setResultados] = useState<PrevisaoResultadosDto | null>(null);
  const [fecho, setFecho] = useState<PrevisaoFechoAnualDto | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [motivo, setMotivo] = useState('');

  const exercicioActual = useMemo(
    () => exercicios.find((e) => e.id === exercicioId) ?? null,
    [exercicios, exercicioId]
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

  const carregarPrevisoes = useCallback(async () => {
    if (!exercicioId) {
      setResultados(null);
      setFecho(null);
      return;
    }
    const [resResultados, resFecho] = await Promise.all([
      contabilidadeApi.previsaoResultados(exercicioId),
      contabilidadeApi.previsaoFechoAnual(exercicioId),
    ]);
    if (resResultados.success) setResultados(resResultados.data);
    else toast.error('Não foi possível obter a previsão de resultados', { description: resResultados.error.message });
    if (resFecho.success) setFecho(resFecho.data);
    else toast.error('Não foi possível obter a previsão do fecho anual', { description: resFecho.error.message });
  }, [exercicioId]);

  useEffect(() => {
    void carregarPrevisoes();
  }, [carregarPrevisoes]);

  const executarResultados = async () => {
    if (!exercicioId) return;
    if (
      !confirm(
        'Executar o apuramento de resultados? As contas de proveitos e custos serão encerradas e o resultado transportado para a conta 88.'
      )
    ) {
      return;
    }
    setIsWorking(true);
    const res = await contabilidadeApi.executarApuramentoResultados(exercicioId);
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível apurar os resultados', { description: res.error.message });
      return;
    }
    toast.success('Resultados apurados.', {
      description: `Resultado líquido: ${dinheiro(res.data.resumo.resultadoLiquido)}`,
    });
    await Promise.all([carregarPrevisoes(), carregarExercicios()]);
  };

  const encerrarExercicio = async () => {
    if (!exercicioId) return;
    if (
      !confirm(
        'Encerrar o exercício? Os períodos passam a bloqueados e o exercício deixa de aceitar lançamentos até reabertura auditada.'
      )
    ) {
      return;
    }
    setIsWorking(true);
    const res = await contabilidadeApi.executarFechoAnual(exercicioId);
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível encerrar o exercício', { description: res.error.message });
      return;
    }
    toast.success('Exercício encerrado.');
    await Promise.all([carregarPrevisoes(), carregarExercicios()]);
  };

  const abrirExercicioSeguinte = async () => {
    if (!exercicioId) return;
    if (!confirm('Abrir o exercício seguinte com os saldos das classes 1–5?')) return;
    setIsWorking(true);
    const res = await contabilidadeApi.abrirExercicioSeguinte(exercicioId);
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível abrir o exercício seguinte', { description: res.error.message });
      return;
    }
    toast.success('Exercício seguinte aberto.');
    await Promise.all([carregarPrevisoes(), carregarExercicios()]);
  };

  const confirmarReabertura = async () => {
    if (!exercicioId) return;
    if (!motivo.trim()) {
      toast.error('Indique o motivo da reabertura.');
      return;
    }
    if (!confirm('Reabrir o exercício? A abertura do ano seguinte será estornada e a acção fica na auditoria.')) {
      return;
    }
    setIsWorking(true);
    const res = await contabilidadeApi.reabrirFechoAnual(exercicioId, { motivo: motivo.trim() });
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível reabrir o exercício', { description: res.error.message });
      return;
    }
    toast.success('Exercício reaberto.');
    setReabrirAberto(false);
    await Promise.all([carregarPrevisoes(), carregarExercicios()]);
  };

  const opcoesExercicios = exercicios.map((e) => ({ value: e.id, label: `Exercício ${e.ano}` }));
  const encerrado = fecho?.passos.find((p) => p.codigo === 'encerramento')?.estado === 'ok';

  const toolbar = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-52">
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
      {exercicioActual && (
        <StatusBadge tone={encerrado ? 'warning' : 'success'}>
          {encerrado ? 'Encerrado' : 'Aberto'}
        </StatusBadge>
      )}
      <div className="flex-1" />
      <Button type="button" variant="outline" size="sm" onClick={() => void carregarPrevisoes()}>
        <RefreshCw className="w-4 h-4" />
        Actualizar
      </Button>
    </div>
  );

  return (
    <WorkspaceFrame
      title="Resultados e fecho anual"
      description="Apure os resultados do exercício e prepare a abertura do ano seguinte, sem perder o rasto de cada decisão."
      toolbar={toolbar}
    >
      {!exercicioId ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Escolha um exercício para começar.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border px-4 pt-3">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setFase('resultados')}
                className={[
                  'rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
                  fase === 'resultados'
                    ? 'bg-background text-foreground border border-border border-b-transparent'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                1. Apuramento de resultados
              </button>
              <button
                type="button"
                onClick={() => setFase('anual')}
                className={[
                  'rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
                  fase === 'anual'
                    ? 'bg-background text-foreground border border-border border-b-transparent'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                2. Fecho anual e abertura
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {fase === 'resultados' ? (
              <ResultadosPanel previsao={resultados} />
            ) : (
              <FechoAnualPanel previsao={fecho} />
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4" />
              {fase === 'resultados'
                ? resultados?.podeExecutar
                  ? 'Todos os períodos estão fechados. Os resultados podem ser apurados.'
                  : 'Resolva os bloqueios antes de apurar os resultados.'
                : fecho?.podeAbrir
                  ? 'O exercício está encerrado. Pode abrir o ano seguinte.'
                  : fecho?.podeEncerrar
                    ? 'Os resultados estão apurados. O exercício pode ser encerrado.'
                    : 'Conclua os passos anteriores para avançar.'}
            </div>

            {fase === 'resultados' ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void executarResultados()}
                disabled={!resultados?.podeExecutar || isWorking}
              >
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                Executar apuramento
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMotivo('');
                    setReabrirAberto(true);
                  }}
                  disabled={!encerrado || isWorking}
                >
                  <LockOpen className="w-4 h-4" />
                  Reabrir exercício
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void abrirExercicioSeguinte()}
                  disabled={!fecho?.podeAbrir || isWorking}
                >
                  {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
                  Abrir exercício seguinte
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void encerrarExercicio()}
                  disabled={!fecho?.podeEncerrar || isWorking}
                >
                  {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Encerrar exercício
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={reabrirAberto} onOpenChange={setReabrirAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir exercício</DialogTitle>
            <DialogDescription>
              A abertura do exercício seguinte é estornada e a reabertura fica registada na auditoria. Indique o
              motivo — é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Motivo</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: regularização de fecho em falta"
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

// ─── Painel de resultados ────────────────────────────────────────────────────

function ResultadosPanel({ previsao }: { previsao: PrevisaoResultadosDto | null }) {
  if (!previsao) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> A calcular os resultados…
      </div>
    );
  }

  const resumo = previsao.resumo;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Proveitos" valor={resumo.proveitos} tom="success" />
        <Kpi label="Custos" valor={resumo.custos} tom="danger" />
        <Kpi label="Resultado operacional" valor={resumo.resultadoOperacional} tom={tomResultado(resumo.resultadoOperacional)} />
        <Kpi label="Resultado financeiro" valor={resumo.resultadoFinanceiro} tom={tomResultado(resumo.resultadoFinanceiro)} />
        <Kpi label="Resultado não corrente" valor={resumo.resultadoNaoCorrente} tom={tomResultado(resumo.resultadoNaoCorrente)} />
        <Kpi label="Resultado antes de impostos" valor={resumo.resultadoAntesImpostos} tom={tomResultado(resumo.resultadoAntesImpostos)} />
        <Kpi label="Imposto sobre lucros" valor={resumo.imposto} tom="neutral" />
        <Kpi label="Resultado líquido" valor={resumo.resultadoLiquido} tom={tomResultado(resumo.resultadoLiquido)} destaque />
      </div>

      {previsao.bloqueios.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[oklch(0.45_0.12_75)]">
            <AlertTriangle className="w-4 h-4" />
            Bloqueios ao apuramento
          </div>
          <ul className="mt-2 list-disc list-inside text-sm text-muted-foreground space-y-1">
            {previsao.bloqueios.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <DetalheTabela titulo="Proveitos (classe 6)" linhas={previsao.detalhes.proveitos} />
        <DetalheTabela titulo="Custos (classe 7)" linhas={previsao.detalhes.custos} />
      </div>

      {previsao.detalhes.imposto.length > 0 && (
        <DetalheTabela titulo="Imposto sobre lucros (classe 8)" linhas={previsao.detalhes.imposto} />
      )}
    </div>
  );
}

function Kpi({
  label,
  valor,
  tom,
  destaque,
}: {
  label: string;
  valor: string;
  tom: 'success' | 'danger' | 'neutral';
  destaque?: boolean;
}) {
  const cor =
    tom === 'success' ? 'text-success' : tom === 'danger' ? 'text-destructive' : 'text-foreground';
  return (
    <div
      className={[
        'rounded-md border p-3',
        destaque ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
      ].join(' ')}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={['mt-1 text-lg font-semibold tabular-nums', cor].join(' ')}>{dinheiro(valor)}</p>
    </div>
  );
}

function DetalheTabela({ titulo, linhas }: { titulo: string; linhas: DetalheResultadoDto[] }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      {linhas.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">Sem movimentos.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-medium px-3 py-1.5 w-24">Conta</th>
              <th className="text-left font-medium px-3 py-1.5">Designação</th>
              <th className="text-left font-medium px-3 py-1.5 w-28">Classe</th>
              <th className="text-right font-medium px-3 py-1.5 w-32">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.contaId}-${l.classe ?? 'imposto'}`} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono text-xs">{l.codigo}</td>
                <td className="px-3 py-1.5">{l.designacao}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {l.classe ? ROTULO_CLASSE[l.classe] ?? l.classe : 'Imposto'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{dinheiro(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Painel do fecho anual ───────────────────────────────────────────────────

function FechoAnualPanel({ previsao }: { previsao: PrevisaoFechoAnualDto | null }) {
  if (!previsao) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> A validar o fecho anual…
      </div>
    );
  }

  const total = previsao.passos.length;
  const ok = previsao.passos.filter((p) => p.estado === 'ok').length;
  const progresso = total === 0 ? 0 : Math.round((ok / total) * 100);

  return (
    <div>
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium">
            Sequência do fecho anual
            <span className="ml-2 font-normal text-muted-foreground">
              {ok} de {total} passos concluídos
            </span>
          </span>
          <span className="tabular-nums font-semibold">{progresso}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={['h-full transition-all duration-300', progresso === 100 ? 'bg-success' : 'bg-primary'].join(' ')}
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      <ol className="divide-y divide-border">
        {previsao.passos.map((passo, indice) => (
          <PassoAnualItem key={passo.codigo} passo={passo} indice={indice + 1} />
        ))}
      </ol>

      {previsao.proximoExercicio && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          Exercício seguinte: <span className="font-medium">{previsao.proximoExercicio.ano}</span>
        </div>
      )}

      {previsao.bloqueios.length > 0 && (
        <div className="mx-4 my-4 rounded-md border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[oklch(0.45_0.12_75)]">
            <AlertTriangle className="w-4 h-4" />
            Bloqueios ao encerramento
          </div>
          <ul className="mt-2 list-disc list-inside text-sm text-muted-foreground space-y-1">
            {previsao.bloqueios.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PassoAnualItem({ passo, indice }: { passo: PassoFechoAnualDto; indice: number }) {
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
