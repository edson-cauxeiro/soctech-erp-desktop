/**
 * @file PeriodoContabilManager.tsx
 * @description Períodos mensais de um exercício fiscal, com abertura, fecho e
 * bloqueio.
 *
 * O exercício é a moldura anual; o período é a unidade que se fecha todos os
 * meses. Fechar impede lançamentos; bloquear impede até a reabertura normal.
 * A UI não decide essas regras: mostra as transições que o backend aceita e
 * apresenta a mensagem de erro quando alguma é recusada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import {
  EstadoPeriodoContabil,
  ExercicioFiscalDto,
  PeriodoContabilDto,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { StatusBadge } from './Primitives';

const ROTULO_ESTADO: Record<EstadoPeriodoContabil, string> = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  bloqueado: 'Bloqueado',
};

const TOM_ESTADO: Record<EstadoPeriodoContabil, 'success' | 'warning' | 'danger'> = {
  aberto: 'success',
  fechado: 'warning',
  bloqueado: 'danger',
};

function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PeriodoContabilManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [exercicioId, setExercicioId] = useState('');
  const [periodos, setPeriodos] = useState<PeriodoContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const carregarExercicios = useCallback(async () => {
    if (!empresaId) {
      setExercicios([]);
      setIsLoading(false);
      return;
    }
    const res = await contabilidadeApi.listarExercicios(empresaId);
    if (!res.success) {
      toast.error('Não foi possível carregar os exercícios', {
        description: res.error.message,
      });
      setIsLoading(false);
      return;
    }
    setExercicios(res.data);
    setExercicioId((atual) => atual || res.data[0]?.id || '');
    setIsLoading(false);
  }, [empresaId]);

  const carregarPeriodos = useCallback(async (id: string) => {
    if (!id) {
      setPeriodos([]);
      return;
    }
    const res = await contabilidadeApi.listarPeriodos({ exercicioId: id });
    if (res.success) setPeriodos(res.data.items);
    else
      toast.error('Não foi possível carregar os períodos', {
        description: res.error.message,
      });
  }, []);

  useEffect(() => {
    void carregarExercicios();
  }, [carregarExercicios]);

  useEffect(() => {
    void carregarPeriodos(exercicioId);
  }, [exercicioId, carregarPeriodos]);

  const exercicio = useMemo(
    () => exercicios.find((e) => e.id === exercicioId) ?? null,
    [exercicios, exercicioId]
  );

  const opcoesExercicio = useMemo(
    () =>
      exercicios.map((e) => ({
        value: e.id,
        label: `${e.ano} · ${formatarData(e.dataInicio)} – ${formatarData(e.dataFim)}`,
      })),
    [exercicios]
  );

  const resumo = useMemo(() => {
    return periodos.reduce(
      (acc, p) => {
        acc[p.estado] += 1;
        return acc;
      },
      { aberto: 0, fechado: 0, bloqueado: 0 } as Record<EstadoPeriodoContabil, number>
    );
  }, [periodos]);

  const gerarPeriodos = async () => {
    if (!exercicioId) return;
    setIsWorking(true);
    const res = await contabilidadeApi.criarPeriodosDoExercicio(exercicioId);
    setIsWorking(false);
    if (!res.success) {
      toast.error('Não foi possível gerar os períodos', { description: res.error.message });
      return;
    }
    toast.success('Períodos gerados.', {
      description: `${res.data.length} períodos disponíveis neste exercício.`,
    });
    await carregarPeriodos(exercicioId);
  };

  const alterarEstado = async (
    periodo: PeriodoContabilDto,
    acao: 'fechar' | 'reabrir' | 'bloquear'
  ) => {
    const verbo = acao === 'fechar' ? 'fechar' : acao === 'reabrir' ? 'reabrir' : 'bloquear';
    if (
      !confirm(
        `Tem a certeza que quer ${verbo} o período ${periodo.numero} (${formatarData(
          periodo.dataInicio
        )} – ${formatarData(periodo.dataFim)})?`
      )
    ) {
      return;
    }

    setIsWorking(true);
    const res =
      acao === 'fechar'
        ? await contabilidadeApi.fecharPeriodo(periodo.id)
        : acao === 'reabrir'
        ? await contabilidadeApi.reabrirPeriodo(periodo.id)
        : await contabilidadeApi.bloquearPeriodo(periodo.id);
    setIsWorking(false);

    if (!res.success) {
      toast.error(`Não foi possível ${verbo} o período`, { description: res.error.message });
      return;
    }
    toast.success(`Período ${res.data.numero} ${verbo === 'fechar' ? 'fechado' : verbo === 'reabrir' ? 'reaberto' : 'bloqueado'}.`);
    await carregarPeriodos(exercicioId);
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[320px] max-w-full">
        <SearchSelect
          value={exercicioId}
          onChange={setExercicioId}
          options={opcoesExercicio}
          placeholder={exercicios.length === 0 ? 'Sem exercícios fiscais' : 'Escolher exercício'}
          disabled={exercicios.length === 0}
          allowClear={false}
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void carregarExercicios()}>
        <RefreshCw className="w-4 h-4" />
        Actualizar
      </Button>
      {exercicio && (
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> {resumo.aberto} abertos
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" /> {resumo.fechado} fechados
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> {resumo.bloqueado}{' '}
            bloqueados
          </span>
        </div>
      )}
    </div>
  );

  return (
    <WorkspaceFrame
      title="Períodos contabilísticos"
      description="Fechar um período impede novos lançamentos com data dentro dele. Bloquear é definitivo e só um administrador o pode reabrir."
      actions={
        <Button
          type="button"
          size="sm"
          onClick={() => void gerarPeriodos()}
          disabled={!exercicioId || isWorking}
        >
          {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
          Gerar períodos
        </Button>
      }
      toolbar={toolbar}
    >
      {!empresaId ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Selecione uma empresa para configurar os períodos.
        </div>
      ) : isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
          </span>
        </div>
      ) : exercicios.length === 0 ? (
        <div className="h-full grid place-items-center p-8">
          <div className="max-w-md text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary grid place-items-center">
              <CalendarDays className="w-6 h-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Ainda não há exercícios fiscais</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie primeiro um exercício em Configurações › Exercícios. Ao criá-lo, os doze períodos
              mensais são gerados automaticamente.
            </p>
          </div>
        </div>
      ) : periodos.length === 0 ? (
        <div className="h-full grid place-items-center p-8">
          <div className="max-w-md text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-warning/15 text-warning grid place-items-center">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Este exercício não tem períodos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Gere os doze períodos mensais para poder lançar e fechar cada mês. A operação é
              idempotente: não duplica períodos já existentes.
            </p>
            <Button type="button" className="mt-4" onClick={() => void gerarPeriodos()}>
              <CalendarClock className="w-4 h-4" />
              Gerar 12 períodos
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-border bg-muted/30 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              Exercício {exercicio?.ano}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatarData(exercicio?.dataInicio)} – {formatarData(exercicio?.dataFim)}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-16">Nº</th>
                <th className="text-left font-medium px-4 py-2">Início</th>
                <th className="text-left font-medium px-4 py-2">Fim</th>
                <th className="text-left font-medium px-4 py-2 w-32">Estado</th>
                <th className="text-left font-medium px-4 py-2">Fechado em</th>
                <th className="text-left font-medium px-4 py-2">Fechado por</th>
                <th className="text-right font-medium px-4 py-2 w-44">Acções</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((periodo) => (
                <tr key={periodo.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs font-semibold tabular-nums">
                    {String(periodo.numero).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatarData(periodo.dataInicio)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatarData(periodo.dataFim)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge tone={TOM_ESTADO[periodo.estado]}>
                      {ROTULO_ESTADO[periodo.estado]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatarDataHora(periodo.fechadoEm)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {periodo.fechadoPor?.nomeCompleto ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {periodo.estado === 'aberto' && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isWorking}
                            onClick={() => void alterarEstado(periodo, 'fechar')}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Fechar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={isWorking}
                            onClick={() => void alterarEstado(periodo, 'bloquear')}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Bloquear
                          </Button>
                        </>
                      )}
                      {periodo.estado === 'fechado' && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isWorking}
                            onClick={() => void alterarEstado(periodo, 'reabrir')}
                          >
                            <LockOpen className="w-3.5 h-3.5" />
                            Reabrir
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            disabled={isWorking}
                            onClick={() => void alterarEstado(periodo, 'bloquear')}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Bloquear
                          </Button>
                        </>
                      )}
                      {periodo.estado === 'bloqueado' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isWorking}
                          onClick={() => void alterarEstado(periodo, 'reabrir')}
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Reabrir
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </WorkspaceFrame>
  );
}
