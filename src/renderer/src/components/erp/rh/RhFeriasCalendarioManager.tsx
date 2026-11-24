import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Info,
  X,
  Loader2,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isSameDay, eachDayOfInterval } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@/components/erp/FormDialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { rhApi } from '@/api/rh.api';
import type { RhMarcacaoFeriasDto, RhMarcacoesFeriasListarInput, RhFeriasSaldoDto, RhFeriasSaldosListarInput } from '@/@types/electron';

const MARCACAO_ESTADO_LABEL: Record<string, string> = {
  PLANEADA: 'Planeada',
  APROVADA: 'Aprovada',
  GOZADA: 'Gozada',
  CANCELADA: 'Cancelada',
};

const MARCACAO_ESTADO_BADGE: Record<string, string> = {
  PLANEADA: 'bg-blue-100 text-blue-800',
  APROVADA: 'bg-green-100 text-green-800',
  GOZADA: 'bg-purple-100 text-purple-800',
  CANCELADA: 'bg-gray-100 text-gray-800',
};

const criarMarcacaoFeriasSchema = z.object({
  funcionarioId: z.string().uuid('Funcionário inválido.'),
  ano: z.coerce.number().int().min(2000).max(2100),
  dataInicio: z.string().min(1, 'Data início obrigatória.'),
  dataFim: z.string().min(1, 'Data fim obrigatória.'),
  dias: z.coerce.number().min(0.01, 'Dias deve ser maior que zero.'),
  estado: z.enum(['PLANEADA', 'APROVADA', 'GOZADA', 'CANCELADA']).default('PLANEADA'),
  observacao: z.string().max(500).optional(),
}).refine((d) => new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

type MarcacaoFeriasFormData = z.infer<typeof criarMarcacaoFeriasSchema>;

const defaultMarcacaoFeriasValues: MarcacaoFeriasFormData = {
  funcionarioId: '',
  ano: new Date().getFullYear(),
  dataInicio: '',
  dataFim: '',
  dias: 1,
  estado: 'PLANEADA',
  observacao: '',
};

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

export function RhFeriasCalendarioManager() {
  const [filtros, setFiltros] = useState<RhMarcacoesFeriasListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [filtrosSaldos, setFiltrosSaldos] = useState<RhFeriasSaldosListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [mesAtual, setMesAtual] = useState(new Date());
  const [paginaMarcacoes, setPaginaMarcacoes] = useState<{ total: number; items: RhMarcacaoFeriasDto[] }>({ total: 0, items: [] });
  const [paginaSaldos, setPaginaSaldos] = useState<{ total: number; items: RhFeriasSaldoDto[] }>({ total: 0, items: [] });
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhMarcacaoFeriasDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<MarcacaoFeriasFormData>({
    defaultValues: defaultMarcacaoFeriasValues,
  });

  const carregarFuncionarios = useCallback(async () => {
    try {
      const resp = await rhApi.funcionarios.listar({ take: 500 });
      if (resp.success) {
        setFuncionarios(resp.data.items.map((f) => ({ id: f.id, codigo: f.codigo, nome: f.nome })));
      }
    } catch {
      setFuncionarios([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
  }, [carregarFuncionarios]);

  const carregarMarcacoes = useCallback(async () => {
    try {
      const resp = await rhApi.ferias.marcacoes.listar(filtros);
      if (resp.success) setPaginaMarcacoes(resp.data);
      else { setPaginaMarcacoes({ total: 0, items: [] }); toast.error('Erro ao carregar marcações', { description: resp.error?.message }); }
    } catch {
      setPaginaMarcacoes({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar marcações.');
    }
  }, [filtros]);

  const carregarSaldos = useCallback(async () => {
    try {
      const resp = await rhApi.ferias.saldos.listar(filtrosSaldos);
      if (resp.success) setPaginaSaldos({ total: resp.data.total, items: resp.data.items });
      else { setPaginaSaldos({ total: 0, items: [] }); toast.error('Erro ao carregar saldos', { description: resp.error?.message }); }
    } catch {
      setPaginaSaldos({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar saldos.');
    }
  }, [filtrosSaldos]);

  useEffect(() => { void carregarMarcacoes(); }, [carregarMarcacoes]);
  useEffect(() => { void carregarSaldos(); }, [carregarSaldos]);

  const handleSubmit = async (data: MarcacaoFeriasFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.ferias.marcacoes.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Marcação atualizada.');
          setDialogAberto(false);
          setEditando(null);
          void carregarMarcacoes();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.ferias.marcacoes.criar(data);
        if (resp.success) {
          toast.success('Marcação criada.');
          setDialogAberto(false);
          void carregarMarcacoes();
        } else toast.error('Erro ao criar', { description: resp.error?.message });
      }
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const abrirParaEditar = (m: RhMarcacaoFeriasDto) => {
    setEditando(m);
    form.setValues({
      funcionarioId: m.funcionarioId,
      ano: m.ano,
      dataInicio: typeof m.dataInicio === 'string' ? m.dataInicio.slice(0, 10) : format(m.dataInicio, 'yyyy-MM-dd'),
      dataFim: typeof m.dataFim === 'string' ? m.dataFim.slice(0, 10) : format(m.dataFim, 'yyyy-MM-dd'),
      dias: m.dias,
      estado: m.estado,
      observacao: m.observacao || '',
    });
    setDialogAberto(true);
  };

  // Prepare calendar data
  const marcacoesPorDia = useMemo(() => {
    const mapa: Map<string, RhMarcacaoFeriasDto[]> = new Map();
    for (const m of paginaMarcacoes.items) {
      const inicio = new Date(m.dataInicio);
      const fim = new Date(m.dataFim);
      const dias = eachDayOfInterval({ start: inicio, end: fim });
      for (const dia of dias) {
        const key = format(dia, 'yyyy-MM-dd');
        if (!mapa.has(key)) mapa.set(key, []);
        mapa.get(key)!.push(m);
      }
    }
    return mapa;
  }, [paginaMarcacoes.items]);

  const diasDoMes = useMemo(() => {
    const inicioMes = startOfMonth(mesAtual);
    const fimMes = endOfMonth(mesAtual);
    const inicioSemana = startOfWeek(inicioMes, { weekStartsOn: 1 });
    const fimSemana = endOfWeek(fimMes, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: inicioSemana, end: fimSemana });
  }, [mesAtual]);

  const mesAnterior = () => setMesAtual(subMonths(mesAtual, 1));
  const mesSeguinte = () => setMesAtual(addMonths(mesAtual, 1));
  const mesCorrente = () => setMesAtual(new Date());

  const getFuncionarioNome = (id: string) => {
    const f = funcionarios.find((x) => x.id === id);
    return f ? `${f.codigo} - ${f.nome}` : id;
  };

  return (
    <div className="space-y-4" data-testid="rh-ferias-calendario">
      {/* Header com navegação de mês */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5" />
              Calendário de Férias
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={mesAnterior}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" onClick={mesCorrente} className="hidden sm:inline-flex">Mês Atual</Button>
              <Button variant="outline" size="sm" onClick={mesSeguinte}><ChevronRight className="w-4 h-4" /></Button>
              <span className="text-lg font-semibold min-w-[180px] text-center">
                {format(mesAtual, 'MMMM yyyy', { locale: pt })}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros rápidos */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="cal-funcionario" className="mb-0">Funcionário:</Label>
              <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                <SelectTrigger id="cal-funcionario" className="w-[200px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="cal-ano" className="mb-0">Ano:</Label>
              <Input id="cal-ano" type="number" value={filtros.ano || ''} onChange={(e) => setFiltros({ ...filtros, ano: e.target.value ? Number(e.target.value) : undefined, skip: 0 })} placeholder="Todos" className="w-[80px]" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="cal-estado" className="mb-0">Estado:</Label>
              <Select value={filtros.estado || ''} onValueChange={(v) => setFiltros({ ...filtros, estado: (v as any) || undefined, skip: 0 })}>
                <SelectTrigger id="cal-estado" className="w-[140px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="PLANEADA">Planeada</SelectItem>
                  <SelectItem value="APROVADA">Aprovada</SelectItem>
                  <SelectItem value="GOZADA">Gozada</SelectItem>
                  <SelectItem value="CANCELADA">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => {
              setFiltros({ skip: 0, take: TAKE });
              setFiltrosSaldos({ skip: 0, take: TAKE });
            }}><X className="w-4 h-4 mr-2" /> Limpar</Button>
          </div>

          {/* Calendário */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-center text-xs font-medium text-muted-foreground border-b">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <th key={d} className="py-2">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {diasDoMes.reduce((rows: Date[][], dia, i) => {
                  if (i % 7 === 0) rows.push([]);
                  rows[rows.length - 1].push(dia);
                  return rows;
                }, []).map((semana, si) => (
                  <tr key={si} className="h-[100px]">
                    {semana.map((dia) => {
                      const isCurrentMonth = isSameMonth(dia, mesAtual);
                      const key = format(dia, 'yyyy-MM-dd');
                      const marcacoesDia = marcacoesPorDia.get(key) || [];
                      const isHoje = isSameDay(dia, new Date());
                      return (
                        <td
                          key={key}
                          className={cn(
                            'relative border p-1 text-xs vertical-align-top',
                            !isCurrentMonth && 'bg-muted/30 text-muted-foreground/50',
                            isHoje && 'bg-primary/10 ring-1 ring-primary'
                          )}
                        >
                          <div className="flex justify-between">
                            <span className={cn('font-medium', isHoje && 'text-primary')}>
                              {format(dia, 'd')}
                            </span>
                          </div>
                          <div className="mt-1 space-y-0.5 max-h-[80px] overflow-y-auto">
                            {marcacoesDia.slice(0, 3).map((m) => (
                              <div
                                key={m.id}
                                className={cn(
                                  'px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:opacity-80',
                                  MARCACAO_ESTADO_BADGE[m.estado]
                                )}
                                title={`${getFuncionarioNome(m.funcionarioId)} (${MARCACAO_ESTADO_LABEL[m.estado]})`}
                                onClick={() => abrirParaEditar(m)}
                              >
                                {getFuncionarioNome(m.funcionarioId).split(' - ')[1] || getFuncionarioNome(m.funcionarioId)}
                              </div>
                            ))}
                            {marcacoesDia.length > 3 && (
                              <div className="text-[10px] text-center text-muted-foreground">
                                +{marcacoesDia.length - 3} mais
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Planeada</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Aprovada</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Gozada</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">Cancelada</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Painel de Saldos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Saldos de Férias do Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground border-b">
                  <th className="pb-2">Funcionário</th>
                  <th className="pb-2 text-center">Ano</th>
                  <th className="pb-2 text-right">Direito</th>
                  <th className="pb-2 text-right">Transitados</th>
                  <th className="pb-2 text-right">Marcados</th>
                  <th className="pb-2 text-right">Gozados</th>
                  <th className="pb-2 text-right">Saldo</th>
                  <th className="pb-2 text-center">Subsídio</th>
                </tr>
              </thead>
              <tbody>
                {paginaSaldos.items.map((s) => {
                  const saldo = Number(s.diasDireito) + Number(s.diasTransitados) - Number(s.diasGozados);
                  return (
                    <tr key={s.id} className="border-b hover:bg-muted/30">
                      <td className="py-2">{getFuncionarioNome(s.funcionarioId)}</td>
                      <td className="py-2 text-center">{s.ano}</td>
                      <td className="py-2 text-right font-mono text-sm">{Number(s.diasDireito).toFixed(2)}</td>
                      <td className="py-2 text-right font-mono text-sm">{Number(s.diasTransitados).toFixed(2)}</td>
                      <td className="py-2 text-right font-mono text-sm">{Number(s.diasMarcados).toFixed(2)}</td>
                      <td className="py-2 text-right font-mono text-sm">{Number(s.diasGozados).toFixed(2)}</td>
                      <td className="py-2 text-right font-mono text-sm font-semibold">{saldo.toFixed(2)}</td>
                      <td className="py-2 text-center">
                        {s.subsidioFeriasProcessado ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Sim</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Não</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {paginaSaldos.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum saldo encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Nova/Editar Marcação */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Marcação de Férias' : 'Nova Marcação de Férias'}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="funcionarioId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Funcionário *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ano"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano *</FormLabel>
                      <FormControl>
                        <Input type="number" min="2000" max="2100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataInicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Início *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dataFim"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Fim *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dias"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dias *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.5" min="0.5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PLANEADA">Planeada</SelectItem>
                            <SelectItem value="APROVADA">Aprovada</SelectItem>
                            <SelectItem value="GOZADA">Gozada</SelectItem>
                            <SelectItem value="CANCELADA">Cancelada</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="observacao"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Observação</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Observação..." />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={aSubmeter}>
                {aSubmeter ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editando ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </FormDialog>
    </div>
  );
}