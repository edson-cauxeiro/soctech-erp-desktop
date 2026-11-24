import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Loader2, Plus, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { contabilidadeApi } from '@/api/contabilidade.api';
import { useAuth } from '@/hooks/useAuth';
import type {
  DiarioContabilDto,
  ExercicioFiscalDto,
  LancamentoContabilDto,
  PeriodoContabilDto,
} from '@/@types/electron';
import { WorkspaceFrame } from './WorkspaceFrame';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { StatusBadge } from './Primitives';
import { LancamentoContabilEditor } from './LancamentoContabilEditor';

function formatarData(valor?: string | Date | null): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT');
}

function formatarValor(valor?: string | null): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const ESTADO_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  rascunho: 'warning',
  validado: 'success',
  estornado: 'danger',
};

export function LancamentoContabilManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [items, setItems] = useState<LancamentoContabilDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [periodos, setPeriodos] = useState<PeriodoContabilDto[]>([]);
  const [diarios, setDiarios] = useState<DiarioContabilDto[]>([]);

  const [search, setSearch] = useState('');
  const [exercicioId, setExercicioId] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [diarioId, setDiarioId] = useState('');
  const [estado, setEstado] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [selecionado, setSelecionado] = useState<LancamentoContabilDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const carregarReferencias = useCallback(async () => {
    if (!empresaId) return;
    const [exRes, dRes] = await Promise.all([
      contabilidadeApi.listarExercicios(empresaId),
      contabilidadeApi.listarDiarios({ empresaId }),
    ]);
    if (exRes.success) setExercicios(exRes.data ?? []);
    if (dRes.success) setDiarios(dRes.data.items ?? []);
  }, [empresaId]);

  const carregarPeriodos = useCallback(async () => {
    if (!empresaId) {
      setPeriodos([]);
      return;
    }
    const res = await contabilidadeApi.listarPeriodos({ empresaId, exercicioId: exercicioId || undefined });
    if (res.success) setPeriodos(res.data.items ?? []);
  }, [empresaId, exercicioId]);

  const carregarLancamentos = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      const res = await contabilidadeApi.listarLancamentos({
        empresaId,
        exercicioId: exercicioId || undefined,
        periodoId: periodoId || undefined,
        diarioId: diarioId || undefined,
        estado: (estado as any) || undefined,
        search: search.trim() || undefined,
        page: 1,
        pageSize: 100,
      });
      if (!res.success) {
        toast.error(res.error.message ?? 'Falha ao carregar lançamentos.');
        return;
      }
      setItems(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, exercicioId, periodoId, diarioId, estado, search]);

  useEffect(() => { void carregarReferencias(); }, [carregarReferencias]);
  useEffect(() => { setPeriodoId(''); void carregarPeriodos(); }, [carregarPeriodos]);
  useEffect(() => { void carregarLancamentos(); }, [carregarLancamentos]);

  const totais = useMemo(() => {
    let debito = 0;
    let credito = 0;
    for (const i of items) {
      debito += Number(i.totalDebito || 0);
      credito += Number(i.totalCredito || 0);
    }
    return { debito, credito };
  }, [items]);

  const abrirNovo = () => {
    setSelecionado(null);
    setEditorOpen(true);
  };

  const abrirEditar = async (item: LancamentoContabilDto) => {
    if (item.estado !== 'rascunho') {
      toast.info('Apenas lançamentos em rascunho podem ser editados.');
      return;
    }
    setSelecionado(item);
    setEditorOpen(true);
  };

  const validar = async (item: LancamentoContabilDto) => {
    if (item.estado !== 'rascunho') return;
    setBusyId(item.id);
    try {
      const res = await contabilidadeApi.validarLancamento(item.id);
      if (!res.success) {
        toast.error(res.error.message ?? 'Falha ao validar lançamento.');
        return;
      }
      toast.success(`Lançamento validado${res.data?.numero ? ` (#${res.data.numero})` : ''}.`);
      await carregarLancamentos();
    } finally {
      setBusyId(null);
    }
  };

  const estornar = async (item: LancamentoContabilDto) => {
    if (item.estado !== 'validado') return;
    const motivo = window.prompt('Motivo/descrição do estorno (opcional):', `Estorno de ${item.descricao}`) ?? undefined;
    const data = new Date().toISOString().slice(0, 10);
    setBusyId(item.id);
    try {
      const res = await contabilidadeApi.estornarLancamento(item.id, {
        dataContabilistica: data,
        descricao: motivo || undefined,
      });
      if (!res.success) {
        toast.error(res.error.message ?? 'Falha ao estornar lançamento.');
        return;
      }
      toast.success('Lançamento estornado.');
      await carregarLancamentos();
    } finally {
      setBusyId(null);
    }
  };

  const exercicioOptions = [{ value: '', label: 'Todos os exercícios' }, ...exercicios.map((e) => ({ value: e.id, label: String(e.ano) }))];
  const periodoOptions = [{ value: '', label: 'Todos os períodos' }, ...periodos.map((p) => ({ value: p.id, label: `Período ${p.numero}` }))];
  const diarioOptions = [{ value: '', label: 'Todos os diários' }, ...diarios.map((d) => ({ value: d.id, label: `${d.codigo} — ${d.designacao}` }))];
  const estadoOptions = [
    { value: '', label: 'Todos os estados' },
    { value: 'rascunho', label: 'Rascunho' },
    { value: 'validado', label: 'Validado' },
    { value: 'estornado', label: 'Estornado' },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Pesquisa</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Descrição ou número"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="w-44">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Exercício</label>
        <SearchSelect value={exercicioId} onChange={setExercicioId} options={exercicioOptions} placeholder="Exercício" />
      </div>
      <div className="w-44">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Período</label>
        <SearchSelect value={periodoId} onChange={setPeriodoId} options={periodoOptions} placeholder="Período" />
      </div>
      <div className="w-56">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Diário</label>
        <SearchSelect value={diarioId} onChange={setDiarioId} options={diarioOptions} placeholder="Diário" />
      </div>
      <div className="w-40">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Estado</label>
        <SearchSelect value={estado} onChange={setEstado} options={estadoOptions} placeholder="Estado" />
      </div>
      <div className="flex-1" />
      <Button type="button" variant="outline" size="icon" onClick={() => void carregarLancamentos()} disabled={isLoading} title="Actualizar">
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      </Button>
      <Button type="button" onClick={abrirNovo}>
        <Plus className="w-4 h-4" /> Novo
      </Button>
    </div>
  );

  return (
    <>
      <WorkspaceFrame
        title="Lançamentos contabilísticos"
        description="Crie rascunhos, valide lançamentos em partidas dobradas e estorne movimentos validados."
        toolbar={toolbar}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2 shrink-0">
            <span>{total} lançamento(s)</span>
            <span>
              Débitos: <strong className="font-mono tabular-nums text-foreground">{formatarValor(String(totais.debito))}</strong> · Créditos:{' '}
              <strong className="font-mono tabular-nums text-foreground">{formatarValor(String(totais.credito))}</strong>
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-24">N.º</th>
                  <th className="px-3 py-2 text-left font-medium w-28">Data</th>
                  <th className="px-3 py-2 text-left font-medium w-24">Diário</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium w-32">Débito</th>
                  <th className="px-3 py-2 text-right font-medium w-32">Crédito</th>
                  <th className="px-3 py-2 text-left font-medium w-28">Estado</th>
                  <th className="px-3 py-2 text-right font-medium w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Sem lançamentos para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const aTrabalhar = busyId === item.id;
                    return (
                      <tr key={item.id} className="border-t border-border hover:bg-accent/30">
                        <td className="px-3 py-2 font-mono tabular-nums">{item.numero ?? '—'}</td>
                        <td className="px-3 py-2">{formatarData(item.dataContabilistica)}</td>
                        <td className="px-3 py-2">{item.diario?.codigo ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="truncate max-w-[420px]" title={item.descricao}>{item.descricao}</div>
                          <div className="text-xs text-muted-foreground">{item.origem}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatarValor(item.totalDebito)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatarValor(item.totalCredito)}</td>
                        <td className="px-3 py-2"><StatusBadge tone={ESTADO_TONE[item.estado] ?? 'neutral'}>{item.estado}</StatusBadge></td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="icon" title="Editar" onClick={() => void abrirEditar(item)} disabled={item.estado !== 'rascunho' || aTrabalhar}>
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" title="Validar" onClick={() => void validar(item)} disabled={item.estado !== 'rascunho' || aTrabalhar}>
                              {aTrabalhar ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            </Button>
                            <Button type="button" variant="ghost" size="icon" title="Estornar" onClick={() => void estornar(item)} disabled={item.estado !== 'validado' || aTrabalhar}>
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </WorkspaceFrame>

      {empresaId && (
        <LancamentoContabilEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          empresaId={empresaId}
          lancamento={selecionado}
          onSaved={() => void carregarLancamentos()}
        />
      )}
    </>
  );
}
