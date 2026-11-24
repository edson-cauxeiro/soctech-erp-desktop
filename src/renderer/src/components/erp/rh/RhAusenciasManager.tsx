import { useCallback, useEffect, useState } from 'react';
import {
  Edit,
  Filter,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
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
import type { RhAusenciaDto, RhAusenciasListarInput, RhTipoAusenciaDto } from '@/@types/electron';

function formatDataBr(valor: string | Date): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy', { locale: pt });
}

const ESTADO_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  CANCELADO: 'Cancelado',
};

const ESTADO_BADGE: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-800',
  APROVADO: 'bg-green-100 text-green-800',
  REJEITADO: 'bg-red-100 text-red-800',
  CANCELADO: 'bg-gray-100 text-gray-800',
};

const criarAusenciaSchema = z.object({
  funcionarioId: z.string().uuid('Funcionário inválido.'),
  tipoId: z.string().uuid('Tipo de ausência inválido.'),
  dataInicio: z.string().min(1, 'Data início obrigatória.'),
  dataFim: z.string().min(1, 'Data fim obrigatória.'),
  dias: z.coerce.number().min(0.01, 'Dias deve ser maior que zero.'),
  estado: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO']).default('PENDENTE'),
});

type AusenciaFormData = z.infer<typeof criarAusenciaSchema>;

const defaultAusenciaValues: AusenciaFormData = {
  funcionarioId: '',
  tipoId: '',
  dataInicio: '',
  dataFim: '',
  dias: 1,
  estado: 'PENDENTE',
};

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

export function RhAusenciasManager() {
  const [filtros, setFiltros] = useState<RhAusenciasListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhAusenciaDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [tiposAusencia, setTiposAusencia] = useState<RhTipoAusenciaDto[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhAusenciaDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<AusenciaFormData>({
    defaultValues: defaultAusenciaValues,
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

  const carregarTiposAusencia = useCallback(async () => {
    try {
      const resp = await rhApi.config.tiposAusencia.listar({ ativo: true });
      if (resp.success) setTiposAusencia(resp.data.items);
    } catch {
      setTiposAusencia([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
    void carregarTiposAusencia();
  }, [carregarFuncionarios, carregarTiposAusencia]);

  const carregarAusencias = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.ausencias.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar ausências', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar ausências.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarAusencias(); }, [carregarAusencias]);

  const handleSubmit = async (data: AusenciaFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.ausencias.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Ausência atualizada.');
          setDialogAberto(false);
          setEditando(null);
          void carregarAusencias();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.ausencias.criar(data);
        if (resp.success) {
          toast.success('Ausência criada.');
          setDialogAberto(false);
          void carregarAusencias();
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
    form.reset({ estado: 'PENDENTE' });
    setDialogAberto(true);
  };

  const abrirParaEditar = (a: RhAusenciaDto) => {
    setEditando(a);
    form.setValues({
      funcionarioId: a.funcionarioId,
      tipoId: a.tipoId,
      dataInicio: typeof a.dataInicio === 'string' ? a.dataInicio.slice(0, 10) : format(a.dataInicio, 'yyyy-MM-dd'),
      dataFim: typeof a.dataFim === 'string' ? a.dataFim.slice(0, 10) : format(a.dataFim, 'yyyy-MM-dd'),
      dias: a.dias,
      estado: a.estado,
    });
    setDialogAberto(true);
  };

  const aprovar = async (a: RhAusenciaDto, estado: 'APROVADO' | 'REJEITADO') => {
    try {
      const resp = await rhApi.ausencias.aprovar({ id: a.id, aprovadoPorId: 'current-user', estado });
      if (resp.success) {
        toast.success(estado === 'APROVADO' ? 'Ausência aprovada.' : 'Ausência rejeitada.');
        void carregarAusencias();
      } else toast.error('Erro ao aprovar/rejeitar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const inativar = async (a: RhAusenciaDto) => {
    if (!confirm('Tem certeza que deseja cancelar esta ausência?')) return;
    try {
      const resp = await rhApi.ausencias.inativar(a.id);
      if (resp.success) {
        toast.success('Ausência cancelada.');
        void carregarAusencias();
      } else toast.error('Erro ao cancelar', { description: resp.error?.message });
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

  const getTipoDescricao = (tipoId: string) => {
    const t = tiposAusencia.find((x) => x.id === tipoId);
    return t ? `${t.codigo} - ${t.descricao}` : tipoId;
  };

  return (
    <div className="space-y-4" data-testid="rh-ausencias">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarAusencias(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="aus-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="aus-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="aus-tipo" className="mb-1 block">Tipo</Label>
                <Select value={filtros.tipoId || ''} onValueChange={(v) => setFiltros({ ...filtros, tipoId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="aus-tipo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {tiposAusencia.map((t) => <SelectItem key={t.id} value={t.id}>{t.codigo} - {t.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="aus-estado" className="mb-1 block">Estado</Label>
                <Select value={filtros.estado || ''} onValueChange={(v) => setFiltros({ ...filtros, estado: (v as 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO') || undefined, skip: 0 })}>
                  <SelectTrigger id="aus-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="APROVADO">Aprovado</SelectItem>
                    <SelectItem value="REJEITADO">Rejeitado</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="aus-data-ini" className="mb-1 block">Data Início</Label>
                <Input
                  id="aus-data-ini"
                  type="date"
                  value={filtros.dataInicio ? (typeof filtros.dataInicio === 'string' ? filtros.dataInicio.slice(0, 10) : format(filtros.dataInicio, 'yyyy-MM-dd')) : ''}
                  onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value || undefined, skip: 0 })}
                />
              </div>
              <div>
                <Label htmlFor="aus-data-fim" className="mb-1 block">Data Fim</Label>
                <Input
                  id="aus-data-fim"
                  type="date"
                  value={filtros.dataFim ? (typeof filtros.dataFim === 'string' ? filtros.dataFim.slice(0, 10) : format(filtros.dataFim, 'yyyy-MM-dd')) : ''}
                  onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value || undefined, skip: 0 })}
                />
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
            <FileText className="w-5 h-5" />
            Ausências
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Nova Ausência</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-[140px]">Início</TableHead>
                  <TableHead className="w-[140px]">Fim</TableHead>
                  <TableHead className="w-[80px] text-right">Dias</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : pagina.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma ausência encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(a)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          {a.estado === 'PENDENTE' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => aprovar(a, 'APROVADO')} title="Aprovar" className="text-green-600"><CheckCircle2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => aprovar(a, 'REJEITADO')} title="Rejeitar" className="text-red-600"><X className="w-4 h-4" /></Button>
                            </>
                          )}
                          {a.estado !== 'CANCELADO' && (
                            <Button variant="ghost" size="icon" onClick={() => inativar(a)} title="Cancelar" className="text-gray-600"><AlertTriangle className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getFuncionarioNome(a.funcionarioId)}</TableCell>
                      <TableCell>{getTipoDescricao(a.tipoId)}</TableCell>
                      <TableCell>{formatDataBr(a.dataInicio)}</TableCell>
                      <TableCell>{formatDataBr(a.dataFim)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(a.dias).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[a.estado])}>
                          {ESTADO_LABEL[a.estado]}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{a.observacao || '—'}</TableCell>
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

      {/* Dialog Nova/Editar Ausência */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Ausência' : 'Nova Ausência'}
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
                  name="tipoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Ausência *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {tiposAusencia.map((t) => <SelectItem key={t.id} value={t.id}>{t.codigo} - {t.descricao}</SelectItem>)}
                          </SelectContent>
                        </Select>
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
                            <SelectItem value="PENDENTE">Pendente</SelectItem>
                            <SelectItem value="APROVADO">Aprovado</SelectItem>
                            <SelectItem value="REJEITADO">Rejeitado</SelectItem>
                            <SelectItem value="CANCELADO">Cancelado</SelectItem>
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