/**
 * @file DemonstracoesManager.tsx
 * @description Ecrã de demonstrações financeiras configuráveis.
 *
 * O utilizador escolhe a estrutura (Balanço, DR, Fluxos, Capital Próprio),
 * o exercício/período e gera a demonstração. As linhas são agregadas
 * automaticamente a partir das contas mapeadas na estrutura.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Calculator,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import {
  DemonstracaoDto,
  EstruturaRelatorioDto,
  EstruturaRelatorioInput,
  LinhaDemonstracaoDto,
  TipoEstruturaRelatorio,
  TipoLinhaRelatorio,
  OperacaoLinhaRelatorio,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency } from '@/utils/currency';
import { WorkspaceFrame } from './WorkspaceFrame';
import { FormSurface } from './FormDialog';

type Fase = 'lista' | 'editor' | 'visualizador';

const ICONES_TIPO: Record<TipoEstruturaRelatorio, React.ComponentType<{ className?: string }>> = {
  balanco: BarChart3,
  demonstracaoResultados: Calculator,
  fluxosCaixa: FileText,
  alteracoesCapitalProprio: FolderOpen,
};

const ROTULO_TIPO: Record<TipoEstruturaRelatorio, string> = {
  balanco: 'Balanço',
  demonstracaoResultados: 'Demonstração de resultados',
  fluxosCaixa: 'Fluxos de caixa',
  alteracoesCapitalProprio: 'Alterações no capital próprio',
};

const ROTULO_TIPO_LINHA: Record<string, string> = {
  activo: 'Activo',
  passivo: 'Passivo',
  capitalProprio: 'Capital próprio',
  proveito: 'Proveito',
  custo: 'Custo',
  resultado: 'Resultado',
  subtotal: 'Subtotal',
  total: 'Total',
  fluxo: 'Fluxo',
  memo: 'Memo',
};

const OPCOES_TIPO_ESTRUTURA = Object.entries(ROTULO_TIPO).map(([value, label]) => ({ value, label }));
const OPCOES_TIPO_LINHA = Object.entries(ROTULO_TIPO_LINHA).map(([value, label]) => ({ value, label }));
const OPCOES_OPERACAO = [
  { value: 'saldo', label: 'Saldo (D-C)' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'creditoMenosDebito', label: 'Crédito - Débito' },
];
const OPCOES_SINAL = [
  { value: '1', label: '+' },
  { value: '-1', label: '−' },
];

function dinheiro(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '—';
  return formatCurrency(n, 'AOA');
}

function tomResultado(valor: string | number | undefined): 'success' | 'danger' | 'neutral' {
  const n = Number(valor ?? 0);
  if (n > 0) return 'success';
  if (n < 0) return 'danger';
  return 'neutral';
}

export function DemonstracoesManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [fase, setFase] = useState<Fase>('lista');
  const [estruturas, setEstruturas] = useState<EstruturaRelatorioDto[]>([]);
  const [estruturaSelecionada, setEstruturaSelecionada] = useState<EstruturaRelatorioDto | null>(null);
  const [demonstracao, setDemonstracao] = useState<DemonstracaoDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportando, setIsExportando] = useState<'pdf' | 'xlsx' | null>(null);
  const [exercicioId, setExercicioId] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [datasManuais, setDatasManuais] = useState(false);
  /** Intervalo exacto usado na última geração com sucesso (evita exportar outro período). */
  const [intervaloGerado, setIntervaloGerado] = useState<{ estruturaId: string; inicio: string; fim: string } | null>(null);
  const [exercicios, setExercicios] = useState<Array<{ id: string; ano: string }>>([]);
  const [periodos, setPeriodos] = useState<Array<{ id: string; numero: number; dataInicio: string; dataFim: string }>>([]);
  const periodoAplicadoRef = useRef('');
  const seedEstruturasRef = useRef(false);

  const periodoAtivo = periodos.find((p) => p.id === periodoId) ?? null;
  /** O período selecionado manda no intervalo; datas manuais só após edição explícita. */
  const intervalo = useMemo(() => {
    if (periodoAtivo && !datasManuais) {
      return { inicio: periodoAtivo.dataInicio, fim: periodoAtivo.dataFim };
    }
    return { inicio: dataInicio, fim: dataFim };
  }, [periodoAtivo, datasManuais, dataInicio, dataFim]);

  const carregarEstruturas = useCallback(async () => {
    if (!empresaId) return;
    const res = await contabilidadeApi.listarEstruturas(empresaId);
    if (!res.success) {
      toast.error('Erro ao carregar estruturas', { description: res.error.message });
      return;
    }
    setEstruturas(res.data);

    if (res.data.length > 0 || seedEstruturasRef.current) return;
    seedEstruturasRef.current = true;

    const seed = await contabilidadeApi.semear();
    if (!seed.success) {
      toast.error('Erro ao criar estruturas padrão', { description: seed.error.message });
      return;
    }
    const novas = await contabilidadeApi.listarEstruturas(empresaId);
    if (novas.success) setEstruturas(novas.data);
  }, [empresaId]);

  const carregarExercicios = useCallback(async () => {
    if (!empresaId) return;
    const res = await contabilidadeApi.listarExercicios(empresaId);
    if (res.success) {
      setExercicios(res.data.map((e) => ({ id: e.id, ano: e.ano })));
      setExercicioId((atual) => atual || res.data[0]?.id || '');
    } else toast.error('Erro ao carregar exercícios', { description: res.error.message });
  }, [empresaId]);

  const carregarPeriodos = useCallback(async () => {
    setPeriodos([]);
    setPeriodoId('');
    setDataInicio('');
    setDataFim('');
    setDatasManuais(false);
    periodoAplicadoRef.current = '';
    if (!exercicioId) return;
    const res = await contabilidadeApi.listarPeriodos({ exercicioId, empresaId });
    if (res.success) {
      const items = res.data.items.map((p) => ({
        id: p.id,
        numero: p.numero,
        dataInicio: typeof p.dataInicio === 'string' ? p.dataInicio : p.dataInicio.toISOString().slice(0, 10),
        dataFim: typeof p.dataFim === 'string' ? p.dataFim : p.dataFim.toISOString().slice(0, 10),
      }));
      setPeriodos(items);
      setPeriodoId((atual) => (items.some((p) => p.id === atual) ? atual : items[0]?.id ?? ''));
    } else {
      toast.error('Erro ao carregar períodos', { description: res.error.message });
    }
  }, [empresaId, exercicioId]);

  useEffect(() => {
    void carregarEstruturas();
    void carregarExercicios();
  }, [carregarEstruturas, carregarExercicios]);

  useEffect(() => {
    void carregarPeriodos();
  }, [carregarPeriodos]);

  // Sempre que o período muda (incluindo a seleção automática do primeiro), as
  // datas passam a ser as dele. Uma edição manual posterior é respeitada.
  useEffect(() => {
    if (!periodoAtivo) {
      if (!periodoId) periodoAplicadoRef.current = '';
      return;
    }
    const chave = `${periodoId}|${periodoAtivo.dataInicio}|${periodoAtivo.dataFim}`;
    if (periodoAplicadoRef.current === chave) return;
    periodoAplicadoRef.current = chave;
    setDatasManuais(false);
    setDataInicio(periodoAtivo.dataInicio);
    setDataFim(periodoAtivo.dataFim);
  }, [periodoId, periodoAtivo]);

  const handleSelecionarEstrutura = (estrutura: EstruturaRelatorioDto) => {
    setEstruturaSelecionada(estrutura);
    setFase('visualizador');
    void gerarDemonstracao(estrutura.id);
  };

  const handleNovaEstrutura = () => {
    setEstruturaSelecionada(null);
    setFase('editor');
  };

  const handleEditarEstrutura = (estrutura: EstruturaRelatorioDto) => {
    setEstruturaSelecionada(estrutura);
    setFase('editor');
  };

  const handleVoltarLista = () => {
    setFase('lista');
    setEstruturaSelecionada(null);
    setDemonstracao(null);
    setIntervaloGerado(null);
  };

  const gerarDemonstracao = async (id: string) => {
    const { inicio, fim } = intervalo;
    if (!inicio || !fim) {
      toast.warning('Selecione um exercício/período ou indique manualmente as datas.');
      return;
    }
    setIsLoading(true);
    setDemonstracao(null);
    setIntervaloGerado(null);
    try {
      const res = await contabilidadeApi.gerarDemonstracao(id, inicio, fim);
      if (res.success) {
        setDemonstracao(res.data);
        setIntervaloGerado({ estruturaId: id, inicio, fim });
      } else {
        toast.error('Erro ao gerar demonstração', { description: res.error.message });
      }
    } catch (error) {
      toast.error('Erro ao gerar demonstração', { description: (error as Error)?.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGerarClick = async () => {
    if (!estruturaSelecionada) return;
    await gerarDemonstracao(estruturaSelecionada.id);
  };

  const exportar = useCallback(
    async (formato: 'pdf' | 'xlsx') => {
      if (
        !estruturaSelecionada ||
        !demonstracao ||
        !intervaloGerado ||
        intervaloGerado.estruturaId !== estruturaSelecionada.id
      ) {
        return;
      }
      setIsExportando(formato);
      try {
        const res = await contabilidadeApi.exportarRelatorio({
          relatorio: 'demonstracao',
          formato,
          filtros: {
            estruturaId: intervaloGerado.estruturaId,
            dataInicio: intervaloGerado.inicio,
            dataFim: intervaloGerado.fim,
          },
        });
        if (res.success) {
          if (res.data.cancelado) return;
          toast.success('Demonstração exportada com sucesso', { description: res.data.caminho });
        } else {
          toast.error('Não foi possível exportar a demonstração', { description: res.error.message });
        }
      } catch {
        toast.error('Falha ao comunicar com o processo principal.');
      } finally {
        setIsExportando(null);
      }
    },
    [estruturaSelecionada, demonstracao, intervalo.inicio, intervalo.fim]
  );

  const handleGuardarEstrutura = async (input: EstruturaRelatorioInput) => {
    setIsLoading(true);
    try {
      const res = await contabilidadeApi.guardarEstrutura(empresaId, input);
      if (res.success) {
        toast.success('Estrutura guardada.');
        await carregarEstruturas();
        setFase('visualizador');
        setEstruturaSelecionada(res.data);
        await gerarDemonstracao(res.data.id);
      } else {
        toast.error('Erro ao guardar', { description: res.error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoverEstrutura = async (id: string) => {
    if (!confirm('Remover esta estrutura de relatório?')) return;
    const res = await contabilidadeApi.removerEstrutura(id);
    if (res.success) {
      toast.success('Estrutura removida.');
      await carregarEstruturas();
    } else {
      toast.error('Erro ao remover', { description: res.error.message });
    }
  };

  const opcoesExercicios = exercicios.map((e) => ({ value: e.id, label: `Exercício ${e.ano}` }));
  const opcoesPeriodos = periodos.map((p) => ({
    value: p.id,
    label: `Período ${p.numero} (${p.dataInicio} a ${p.dataFim})`,
  }));

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
      <div className="w-64">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Período</label>
        <SearchSelect
          value={periodoId}
          onChange={setPeriodoId}
          options={opcoesPeriodos}
          placeholder="Escolher período"
          allowClear
          disabled={isLoading || !exercicioId}
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="w-40">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => {
              setDatasManuais(true);
              setDataInicio(e.target.value);
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            disabled={isLoading}
          />
        </div>
        <div className="w-40">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => {
              setDatasManuais(true);
              setDataFim(e.target.value);
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            disabled={isLoading}
          />
        </div>
        <Button type="button" size="sm" onClick={handleGerarClick} disabled={isLoading || !estruturaSelecionada || !intervalo.inicio || !intervalo.fim}>
          <Calculator className="w-4 h-4" />
          Gerar
        </Button>
        {periodoAtivo && datasManuais && (
          <span className="text-[11px] text-warning max-w-[180px]">
            Datas manuais — Volte a selecionar o período para usar os limites oficiais.
          </span>
        )}
      </div>
      {fase === 'lista' && (
        <Button type="button" size="sm" onClick={handleNovaEstrutura} className="ml-auto">
          <Plus className="w-4 h-4" />
          Nova estrutura
        </Button>
      )}
    </div>
  );

  return (
    <WorkspaceFrame
      title="Demonstrações financeiras"
      description="Gere o Balanço, a Demonstração de resultados, os Fluxos de caixa e as Alterações no capital próprio a partir de estruturas configuráveis."
      toolbar={toolbar}
    >
      {fase === 'lista' && <ListaEstruturas estruturas={estruturas} onSelecionar={handleSelecionarEstrutura} onEditar={handleEditarEstrutura} onRemover={handleRemoverEstrutura} />}
      {fase === 'editor' && (
        <EditorEstrutura
          estrutura={estruturaSelecionada}
          onVoltar={handleVoltarLista}
          onGuardar={handleGuardarEstrutura}
        />
      )}
      {fase === 'visualizador' && estruturaSelecionada && (
        <VisualizadorDemonstracao
          estrutura={estruturaSelecionada}
          demonstracao={demonstracao}
          isLoading={isLoading}
          isExportando={isExportando}
          podeExportar={
            !!demonstracao &&
            !!intervaloGerado &&
            intervaloGerado.estruturaId === estruturaSelecionada.id &&
            intervaloGerado.inicio === intervalo.inicio &&
            intervaloGerado.fim === intervalo.fim &&
            !isLoading
          }
          onExportar={exportar}
          onVoltar={handleVoltarLista}
        />
      )}
    </WorkspaceFrame>
  );
}

// ─── Lista de estruturas ────────────────────────────────────────────────────

function ListaEstruturas({
  estruturas,
  onSelecionar,
  onEditar,
  onRemover,
}: {
  estruturas: EstruturaRelatorioDto[];
  onSelecionar: (e: EstruturaRelatorioDto) => void;
  onEditar: (e: EstruturaRelatorioDto) => void;
  onRemover: (id: string) => void;
}) {
  if (estruturas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Nenhuma estrutura configurada. Clique em “Nova estrutura” para começar.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {estruturas.map((estrutura) => (
        <div key={estrutura.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              {(() => {
                const Icon = ICONES_TIPO[estrutura.tipo];
                return <Icon className="w-5 h-5 text-primary" />;
              })()}
            </div>
            <div>
              <p className="font-medium">{estrutura.designacao}</p>
              <p className="text-xs text-muted-foreground">{estrutura.codigo} · {ROTULO_TIPO[estrutura.tipo]} · {estrutura.linhas.length} linhas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onSelecionar(estrutura)}>
              <BarChart3 className="w-4 h-4" />
              Visualizar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onEditar(estrutura)}>
              <Settings className="w-4 h-4" />
              Editar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onRemover(estrutura.id)} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Editor de estrutura ────────────────────────────────────────────────────

function EditorEstrutura({
  estrutura,
  onVoltar,
  onGuardar,
}: {
  estrutura: EstruturaRelatorioDto | null;
  onVoltar: () => void;
  onGuardar: (input: EstruturaRelatorioInput) => void;
}) {
  const [codigo, setCodigo] = useState(estrutura?.codigo ?? '');
  const [designacao, setDesignacao] = useState(estrutura?.designacao ?? '');
  const [tipo, setTipo] = useState<TipoEstruturaRelatorio>(estrutura?.tipo ?? 'balanco');
  const [activa, setActiva] = useState(estrutura?.activa ?? true);
  const [linhas, setLinhas] = useState<LinhaEditor[]>(
    estrutura?.linhas.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      designacao: l.designacao,
      parentCodigo: l.parentCodigo ?? null,
      ordem: l.ordem,
      nivel: l.nivel,
      tipo: l.tipo,
      operacao: l.operacao,
      sinal: l.sinal,
      contas: l.contas.map((c) => ({ contaId: c.contaId, sinal: c.sinal })),
    })) ?? [{ id: '1', codigo: '', designacao: '', parentCodigo: null, ordem: 1, nivel: 1, tipo: 'subtotal', operacao: 'saldo', sinal: 1, contas: [] }]
  );

  const adicionarLinha = () => {
    const nova: LinhaEditor = {
      id: Date.now().toString(),
      codigo: '',
      designacao: '',
      parentCodigo: null,
      ordem: linhas.length + 1,
      nivel: 1,
      tipo: 'subtotal',
      operacao: 'saldo',
      sinal: 1,
      contas: [],
    };
    setLinhas([...linhas, nova]);
  };

  const removerLinha = (id: string) => {
    setLinhas(linhas.filter((l) => l.id !== id));
  };

  const handleGuardar = () => {
    const input: EstruturaRelatorioInput = {
      id: estrutura?.id,
      codigo: codigo.trim(),
      designacao: designacao.trim(),
      tipo,
      activa,
      linhas: linhas.map((l) => ({
        codigo: l.codigo.trim(),
        designacao: l.designacao.trim(),
        parentCodigo: l.parentCodigo?.trim() || undefined,
        ordem: l.ordem,
        nivel: l.nivel,
        tipo: l.tipo,
        operacao: l.operacao,
        sinal: l.sinal,
        contas: l.contas.map((c) => ({ contaId: c.contaId, sinal: c.sinal })),
      })),
    };
    onGuardar(input);
  };

  return (
    <FormSurface
      title={estrutura ? 'Editar estrutura' : 'Nova estrutura'}
      bodyClassName="p-4"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onVoltar}>
            <FolderOpen className="w-4 h-4" />
            Voltar
          </Button>
          <Button type="button" onClick={handleGuardar}>
            <Save className="w-4 h-4" />
            Guardar
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Código</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Ex.: BALANCO" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Designação</label>
            <input value={designacao} onChange={(e) => setDesignacao(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Ex.: Balanço" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo</label>
            <SearchSelect
              value={tipo}
              onChange={(valor) => setTipo(valor as TipoEstruturaRelatorio)}
              options={OPCOES_TIPO_ESTRUTURA}
              placeholder="Tipo de demonstração"
              required
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="h-4 w-4" />
              Activa
            </label>
          </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Linhas da estrutura</h3>
          <Button type="button" size="sm" onClick={adicionarLinha}>
            <Plus className="w-4 h-4" />
            Adicionar linha
          </Button>
        </div>

        <div className="space-y-2">
          {linhas.map((linha, idx) => (
            <LinhaEditorForm key={linha.id} linha={linha} idx={idx} todasLinhas={linhas} onChange={setLinhas} onRemover={removerLinha} />
          ))}
        </div>
      </div>
    </FormSurface>
  );
}

interface LinhaEditor {
  id: string;
  codigo: string;
  designacao: string;
  parentCodigo: string | null;
  ordem: number;
  nivel: number;
  tipo: TipoLinhaRelatorio;
  operacao: OperacaoLinhaRelatorio;
  sinal: number;
  contas: Array<{ contaId: string; sinal: number }>;
}

function LinhaEditorForm({
  linha,
  idx,
  todasLinhas,
  onChange,
  onRemover,
}: {
  linha: LinhaEditor;
  idx: number;
  todasLinhas: LinhaEditor[];
  onChange: React.Dispatch<React.SetStateAction<LinhaEditor[]>>;
  onRemover: (id: string) => void;
}) {
  const update = (patch: Partial<LinhaEditor>) => {
    onChange((prev) => prev.map((l) => (l.id === linha.id ? { ...l, ...patch } : l)));
  };

  const opcoesPai = [
    { value: '', label: '(nenhum — linha de topo)' },
    ...todasLinhas.filter((l) => l.id !== linha.id).map((l) => ({ value: l.codigo, label: l.codigo })),
  ];

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Linha {idx + 1}</span>
        <Button type="button" variant="ghost" size="icon" onClick={() => onRemover(linha.id)} className="text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Código</label>
          <input value={linha.codigo} onChange={(e) => update({ codigo: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Designação</label>
          <input value={linha.designacao} onChange={(e) => update({ designacao: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Pai</label>
          <SearchSelect
            value={linha.parentCodigo ?? ''}
            onChange={(valor) => update({ parentCodigo: valor || null })}
            options={opcoesPai}
            placeholder="Sem pai"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Ordem</label>
          <input type="number" value={linha.ordem} onChange={(e) => update({ ordem: Number(e.target.value) })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" min="0" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Nível</label>
          <input type="number" value={linha.nivel} onChange={(e) => update({ nivel: Number(e.target.value) })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" min="1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo</label>
          <SearchSelect
            value={linha.tipo}
            onChange={(valor) => update({ tipo: valor as TipoLinhaRelatorio })}
            options={OPCOES_TIPO_LINHA}
            placeholder="Tipo de linha"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Operação</label>
          <SearchSelect
            value={linha.operacao}
            onChange={(valor) => update({ operacao: valor as OperacaoLinhaRelatorio })}
            options={OPCOES_OPERACAO}
            placeholder="Operação"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Sinal</label>
          <SearchSelect
            value={String(linha.sinal)}
            onChange={(valor) => update({ sinal: Number(valor) })}
            options={OPCOES_SINAL}
            placeholder="Sinal"
            required
          />
        </div>
      </div>

      <div className="border-t pt-2">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Contas associadas</label>
        <div className="text-xs text-muted-foreground">
          {linha.contas.length === 0
            ? 'Nenhuma conta associada (use o mapeamento de contas noutro ecrã).'
            : `${linha.contas.length} conta(s) associada(s).`}
        </div>
      </div>
    </div>
  );
}

// ─── Visualizador de demonstração ───────────────────────────────────────────

function VisualizadorDemonstracao({
  estrutura,
  demonstracao,
  isLoading,
  isExportando,
  podeExportar,
  onExportar,
  onVoltar,
}: {
  estrutura: EstruturaRelatorioDto;
  demonstracao: DemonstracaoDto | null;
  isLoading: boolean;
  isExportando: 'pdf' | 'xlsx' | null;
  podeExportar: boolean;
  onExportar: (formato: 'pdf' | 'xlsx') => void;
  onVoltar: () => void;
}) {
  if (isLoading && !demonstracao) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!demonstracao) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Selecione o exercício/período e clique em “Gerar” para ver a demonstração.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            {(() => { const Icon = ICONES_TIPO[estrutura.tipo]; return <Icon className="w-5 h-5 text-primary" />; })()}
          </div>
          <div>
            <h2 className="font-semibold">{demonstracao.designacao}</h2>
            <p className="text-xs text-muted-foreground">
              {demonstracao.dataInicio} a {demonstracao.dataFim} · {demonstracao.linhas.length} linhas principais
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onVoltar}>
            <FolderOpen className="w-4 h-4" />
            Voltar à lista
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onExportar('pdf')}
            disabled={!podeExportar || isExportando !== null}
            title={podeExportar ? 'Exportar PDF do período apresentado' : 'Gere a demonstração para o período actual antes de exportar'}
          >
            {isExportando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onExportar('xlsx')}
            disabled={!podeExportar || isExportando !== null}
            title={podeExportar ? 'Exportar Excel do período apresentado' : 'Gere a demonstração para o período actual antes de exportar'}
          >
            {isExportando === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar Excel
          </Button>
        </div>
      </div>

      {demonstracao.avisos.length > 0 && (
        <div className="shrink-0 mx-4 my-3 rounded-md border border-warning/40 bg-warning/10 p-3">
          <ul className="list-disc list-inside text-sm text-[oklch(0.45_0.12_75)] space-y-1">
            {demonstracao.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-sm">
          <thead className="sticky top-0 text-xs uppercase tracking-wide text-muted-foreground bg-muted/50">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-1.5 w-24">Código</th>
              <th className="text-left px-3 py-1.5">Designação</th>
              <th className="text-left px-3 py-1.5 w-28">Tipo</th>
              <th className="text-right px-3 py-1.5 w-32">Valor</th>
            </tr>
          </thead>
          <tbody>
            {demonstracao.linhas.map((linha) => (
              <LinhaDemonstracaoRow key={linha.linhaId} linha={linha} nivel={linha.nivel} />
            ))}
          </tbody>
        </table>

        {Object.entries(demonstracao.totais).map(([codigo, valor]) => (
          <div key={codigo} className="mt-2 flex items-center justify-between text-sm font-medium px-3 py-1.5 rounded-md bg-muted/50">
            <span>{codigo}</span>
            <span className="tabular-nums">{dinheiro(valor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinhaDemonstracaoRow({ linha, nivel }: { linha: LinhaDemonstracaoDto; nivel: number }) {
  const indent = nivel * 16;
  const isTotal = ['total', 'resultado'].includes(linha.tipo);

  return (
    <>
      <tr className={`border-t border-border ${isTotal ? 'font-semibold bg-muted/30' : ''}`} style={{ paddingLeft: indent }}>
        <td className="px-3 py-1.5 font-mono text-xs" style={{ paddingLeft: indent }}>
          {linha.codigo}
        </td>
        <td className="px-3 py-1.5">{linha.designacao}</td>
        <td className="px-3 py-1.5 text-muted-foreground">{ROTULO_TIPO_LINHA[linha.tipo] ?? linha.tipo}</td>
        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: tomResultado(linha.valorFinal ?? linha.valor) === 'success' ? 'var(--success)' : tomResultado(linha.valorFinal ?? linha.valor) === 'danger' ? 'var(--destructive)' : 'inherit' }}>
          {dinheiro(linha.valorFinal ?? linha.valor)}
        </td>
      </tr>
      {linha.filhos.map((filho) => (
        <LinhaDemonstracaoRow key={filho.linhaId} linha={filho} nivel={nivel + 1} />
      ))}
    </>
  );
}