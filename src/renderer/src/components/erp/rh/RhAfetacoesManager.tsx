import { useCallback, useEffect, useState } from 'react';
import {
  Edit,
  Filter,
  Plus,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@/components/erp/FormDialog';
import {
  Form,
  FormControl,
  FormDescription,
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
import type { RhAfetacaoDto, RhAfetacoesListarInput } from '@/@types/electron';

const criarAfetacaoSchema = z.object({
  funcionarioId: z.string().uuid('Funcionário inválido.'),
  centroCustoId: z.string().uuid().nullable(),
  percentagem: z.coerce.number().min(0.01, 'Percentagem deve ser maior que zero.').max(100, 'Percentagem não pode exceder 100%.'),
  dataInicio: z.string().min(1, 'Data início obrigatória.'),
  dataFim: z.string().nullable().optional(),
}).refine((d) => !d.dataFim || new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

type AfetacaoFormData = z.infer<typeof criarAfetacaoSchema>;

const defaultAfetacaoValues: AfetacaoFormData = {
  funcionarioId: '',
  centroCustoId: null,
  percentagem: 100,
  dataInicio: '',
  dataFim: null,
};

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

interface CentroCustoOption {
  id: string;
  codigo: string;
  designacao: string;
}

export function RhAfetacoesManager() {
  const [filtros, setFiltros] = useState<RhAfetacoesListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhAfetacaoDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhAfetacaoDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<AfetacaoFormData>({
    defaultValues: defaultAfetacaoValues,
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

  const carregarCentrosCusto = useCallback(async () => {
    try {
      const resp = await rhApi.config.centrosCusto.listar({ ativo: true });
      if (resp.success) setCentrosCusto(resp.data.items.map((c) => ({ id: c.id, codigo: c.codigo, designacao: c.designacao })));
    } catch {
      setCentrosCusto([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
    void carregarCentrosCusto();
  }, [carregarFuncionarios, carregarCentrosCusto]);

  const carregarAfetacoes = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.afetacoes.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar afetações', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar afetações.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarAfetacoes(); }, [carregarAfetacoes]);

  const handleSubmit = async (data: AfetacaoFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.afetacoes.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Afectação atualizada.');
          setDialogAberto(false);
          setEditando(null);
          void carregarAfetacoes();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.afetacoes.criar(data);
        if (resp.success) {
          toast.success('Afectação criada.');
          setDialogAberto(false);
          void carregarAfetacoes();
        } else toast.error('Erro ao criar', { description: resp.error?.message });
      }
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const abrirParaCriar = () => {
    setEditando(null);
    form.reset({ ...defaultAfetacaoValues, dataInicio: format(new Date(), 'yyyy-MM-dd') });
    setDialogAberto(true);
  };

  const abrirParaEditar = (a: RhAfetacaoDto) => {
    setEditando(a);
    form.setValues({
      funcionarioId: a.funcionarioId,
      centroCustoId: a.centroCustoId,
      percentagem: a.percentagem,
      dataInicio: typeof a.dataInicio === 'string' ? a.dataInicio.slice(0, 10) : format(a.dataInicio, 'yyyy-MM-dd'),
      dataFim: a.dataFim ? (typeof a.dataFim === 'string' ? a.dataFim.slice(0, 10) : format(a.dataFim, 'yyyy-MM-dd')) : '',
    });
    setDialogAberto(true);
  };

  const remover = async (a: RhAfetacaoDto) => {
    if (!confirm('Tem certeza que deseja remover esta afetação?')) return;
    try {
      const resp = await rhApi.afetacoes.remover(a.id);
      if (resp.success) {
        toast.success('Afectação removida.');
        void carregarAfetacoes();
      } else toast.error('Erro ao remover', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const total = pagina.total;
  const inicio = total === 0 ? 0 : skip + 1;
  const fim = skip + pagina.items.length;
  const temAnt = skip > 0;
  const temProx = skip + TAKE < total;

  const getFuncionarioNome = (id: string) => {
    const f = funcionarios.find((x) => x.id === id);
    return f ? `${f.codigo} - ${f.nome}` : id;
  };

  const getCentroCustoNome = (id: string | null) => {
    if (!id) return '—';
    const c = centrosCusto.find((x) => x.id === id);
    return c ? `${c.codigo} - ${c.designacao}` : id;
  };

  function formatDataBr(valor: string | Date | null): string {
    if (!valor) return '—';
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy', { locale: pt });
  }

  return (
    <div className="space-y-4" data-testid="rh-afetacoes">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarAfetacoes(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="afet-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="afet-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="afet-centro-custo" className="mb-1 block">Centro de Custo</Label>
                <Select value={filtros.centroCustoId || ''} onValueChange={(v) => setFiltros({ ...filtros, centroCustoId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="afet-centro-custo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {centrosCusto.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.designacao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={carregando}>
                <Loader2 className={cn('w-4 h-4 mr-2', carregando ? 'animate-spin' : '')} />
                Atualizar
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setFiltros({ skip: 0, take: TAKE });
                setSkip(0);
              }}>
                <X className="w-4 h-4 mr-2" /> Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Afetações de Custo
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Nova Afectação</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead className="w-[120px] text-right">Percentagem</TableHead>
                  <TableHead className="w-[140px]">Início</TableHead>
                  <TableHead className="w-[140px]">Fim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : pagina.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma afetação encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(a)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remover(a)} title="Remover" className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                      <TableCell>{getFuncionarioNome(a.funcionarioId)}</TableCell>
                      <TableCell>{getCentroCustoNome(a.centroCustoId)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(a.percentagem).toFixed(2)}%</TableCell>
                      <TableCell>{formatDataBr(a.dataInicio)}</TableCell>
                      <TableCell>{formatDataBr(a.dataFim)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Mostrando {inicio} a {fim} de {total}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSkip(s => Math.max(0, s - TAKE))} disabled={!temAnt}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSkip(s => s + TAKE)} disabled={!temProx}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Nova/Editar Afectação */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Afectação' : 'Nova Afectação'}
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
                  name="centroCustoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Centro de Custo</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value || ''}>
                          <SelectTrigger><SelectValue placeholder="Nenhum (rateio direto)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhum (rateio direto)</SelectItem>
                            {centrosCusto.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.designacao}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="percentagem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Percentagem (%) *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" max="100" {...field} />
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
                      <FormLabel>Data Fim (opcional)</FormLabel>
                      <FormControl>
                        <Input type="date" value={field.value || ''} onChange={(e) => field.onChange(e.target.value || undefined)} />
                      </FormControl>
                      <FormDescription>Deixe em branco para afetação sem fim definido.</FormDescription>
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