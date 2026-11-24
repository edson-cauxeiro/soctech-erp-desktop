import { useCallback, useEffect, useState } from 'react';
import {
  Filter,
  Edit,
  Plus,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building,
} from 'lucide-react';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { rhApi } from '@/api/rh.api';
import type { RhAtividadeDto, RhAtividadesListarInput } from '@/@types/electron';

const ESTADO_LABEL: Record<string, string> = {
  true: 'Ativa',
  false: 'Inativa',
};

const ESTADO_BADGE: Record<string, string> = {
  true: 'bg-green-100 text-green-800',
  false: 'bg-gray-100 text-gray-800',
};

const criarAtividadeSchema = z.object({
  independenteId: z.string().uuid('Independente inválido.'),
  descricao: z.string().trim().min(1, 'A descrição é obrigatória.').max(240),
  valorFixo: z.coerce.number().positive().optional(),
  valorHora: z.coerce.number().positive().optional(),
  centroCustoId: z.string().uuid().nullable().optional(),
  dataInicio: z.string().min(1, 'Data início obrigatória.'),
  dataFim: z.string().optional(),
  ativa: z.boolean().optional(),
}).refine((d) => !d.dataFim || new Date(d.dataFim) >= new Date(d.dataInicio), {
  message: 'Data fim deve ser posterior ou igual à data início.',
  path: ['dataFim'],
});

type AtividadeFormData = z.infer<typeof criarAtividadeSchema>;

const defaultAtividadeValues = {
  independenteId: '',
  descricao: '',
  valorFixo: undefined,
  valorHora: undefined,
  centroCustoId: undefined,
  dataInicio: '',
  dataFim: '',
  ativa: true,
};

const TAKE = 25;



export function RhAtividadesManager() {
  const [filtros, setFiltros] = useState<RhAtividadesListarInput>({
    skip: 0,
    take: 25,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhAtividadeDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [independentes, setIndependentes] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<{ id: string; codigo: string; designacao: string }[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhAtividadeDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<AtividadeFormData>({
    defaultValues: defaultAtividadeValues,
  });

  const carregarIndependentes = useCallback(async () => {
    try {
      const resp = await rhApi.independentes.listar({ ativo: true, take: 500 });
      if (resp.success) {
        setIndependentes(resp.data.items.map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome })));
      }
    } catch {
      setIndependentes([]);
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
    void carregarIndependentes();
    void carregarCentrosCusto();
  }, [carregarIndependentes, carregarCentrosCusto]);

  const carregarAtividades = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.atividades.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar atividades', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar atividades.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarAtividades(); }, [carregarAtividades]);

  const handleSubmit = async (data: AtividadeFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.atividades.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Atividade atualizada.');
          setDialogAberto(false);
          setEditando(null);
          void carregarAtividades();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.atividades.criar(data);
        if (resp.success) {
          toast.success('Atividade criada.');
          setDialogAberto(false);
          void carregarAtividades();
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
    form.reset(defaultAtividadeValues);
    setDialogAberto(true);
  };

  const abrirParaEditar = (a: RhAtividadeDto) => {
    setEditando(a);
    form.setValues({
      independenteId: a.independenteId,
      descricao: a.descricao,
      valorFixo: a.valorFixo ?? undefined,
      valorHora: a.valorHora ?? undefined,
      centroCustoId: a.centroCustoId ?? undefined,
      dataInicio: typeof a.dataInicio === 'string' ? a.dataInicio.slice(0, 10) : a.dataInicio.toISOString().slice(0, 10),
      dataFim: a.dataFim ? (typeof a.dataFim === 'string' ? a.dataFim.slice(0, 10) : a.dataFim.toISOString().slice(0, 10)) : '',
      ativa: a.ativa,
    });
    setDialogAberto(true);
  };

  const inativar = async (a: RhAtividadeDto) => {
    if (!confirm('Tem certeza que deseja inativar esta atividade?')) return;
    try {
      const resp = await rhApi.atividades.inativar(a.id);
      if (resp.success) {
        toast.success('Atividade inativada.');
        void carregarAtividades();
      } else toast.error('Erro ao inativar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const total = pagina.total;
  const inicio = total === 0 ? 0 : skip + 1;
  const fim = skip + pagina.items.length;
  const temAnt = skip > 0;
  const temProx = skip + TAKE < total;

return (
    <div className="space-y-4" data-testid="rh-atividades">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarAtividades(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <Label htmlFor="atv-independente" className="mb-1 block">Independente</Label>
                <Select value={filtros.independenteId || ''} onValueChange={(v) => setFiltros({ ...filtros, independenteId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="atv-independente"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {independentes.map((i) => <SelectItem key={i.id} value={i.id}>{i.codigo} - {i.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="atv-centro-custo" className="mb-1 block">Centro de Custo</Label>
                <Select value={filtros.centroCustoId || ''} onValueChange={(v) => setFiltros({ ...filtros, centroCustoId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="atv-centro-custo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {centrosCusto.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.designacao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="atv-ativa" className="mb-1 block">Estado</Label>
                <Select value={filtros.ativa?.toString() || ''} onValueChange={(v) => setFiltros({ ...filtros, ativa: v === '' ? undefined : v === 'true', skip: 0 })}>
                  <SelectTrigger id="atv-ativa"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    <SelectItem value="true">Ativa</SelectItem>
                    <SelectItem value="false">Inativa</SelectItem>
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
                setFiltros({ skip: 0, take: 25 });
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
            <Building className="w-5 h-5" />
            Atividades
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Nova Atividade</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Independente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[140px]">Início</TableHead>
                  <TableHead className="w-[140px]">Fim</TableHead>
                  <TableHead className="w-[120px]">Valor Fixo</TableHead>
                  <TableHead className="w-[120px]">Valor/Hora</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : pagina.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhuma atividade encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(a)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          {a.ativa && (
                            <Button variant="ghost" size="icon" onClick={() => inativar(a)} title="Inativar" className="text-gray-600"><AlertTriangle className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{independentes.find((i) => i.id === a.independenteId) ? `${independentes.find((i) => i.id === a.independenteId)!.codigo} - ${independentes.find((i) => i.id === a.independenteId)!.nome}` : a.independenteId}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{a.descricao}</TableCell>
                      <TableCell>{a.dataInicio ? new Date(a.dataInicio).toLocaleDateString('pt-PT') : '—'}</TableCell>
                      <TableCell>{a.dataFim ? new Date(a.dataFim).toLocaleDateString('pt-PT') : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{a.valorFixo ? Number(a.valorFixo).toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' }) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{a.valorHora ? Number(a.valorHora).toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' }) + '/h' : '—'}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{a.centroCusto ? `${a.centroCusto.codigo} - ${a.centroCusto.designacao}` : '—'}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[String(a.ativa)])}>
                          {ESTADO_LABEL[String(a.ativa)]}
                        </span>
                      </TableCell>
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
                <Button variant="outline" size="sm" onClick={() => setSkip(s => Math.max(0, s - 25))} disabled={!temAnt}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSkip(s => s + 25)} disabled={!temProx}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Nova/Editar Atividade */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Atividade' : 'Nova Atividade'}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="independenteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Independente *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {independentes.map((i) => <SelectItem key={i.id} value={i.id}>{i.codigo} - {i.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Descrição *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Descrição da atividade" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valorFixo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Fixo</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" {...field} />
                      </FormControl>
                      <FormDescription>Valor fixo da atividade (opcional).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valorHora"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor/Hora</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" {...field} />
                      </FormControl>
                      <FormDescription>Valor por hora (opcional).</FormDescription>
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
                      <FormLabel>Data Fim</FormLabel>
                      <FormControl>
                        <Input type="date" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormDescription>Opcional. Deixar vazio para atividade sem data fim.</FormDescription>
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
                          <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhum</SelectItem>
                            {centrosCusto.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.designacao}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ativa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <FormControl>
                        <Select onValueChange={(v) => field.onChange(v === 'true')} defaultValue={field.value ? 'true' : 'false'}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Ativa</SelectItem>
                            <SelectItem value="false">Inativa</SelectItem>
                          </SelectContent>
                        </Select>
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

