import { useCallback, useEffect, useState } from 'react';
import {
  Edit,
  Filter,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
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
import type { RhHoraExtraDto, RhHorasExtraListarInput } from '@/@types/electron';

const TIPO_LABEL: Record<string, string> = {
  DIURNA_UTIL: 'Diurna (dia útil)',
  NOTURNA: 'Noturna',
  DESCANSO_FERIADO: 'Descanso/Feriado',
};

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

const criarHoraExtraSchema = z.object({
  funcionarioId: z.string().uuid('Funcionário inválido.'),
  data: z.string().min(1, 'Data obrigatória.'),
  horas: z.coerce.number().min(0.01, 'Horas deve ser maior que zero.'),
  tipo: z.enum(['DIURNA_UTIL', 'NOTURNA', 'DESCANSO_FERIADO']),
  percentagem: z.coerce.number().min(0, 'Percentagem inválida.'),
  estado: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO']).default('PENDENTE'),
});

type HoraExtraFormData = z.infer<typeof criarHoraExtraSchema>;

const defaultHoraExtraValues: HoraExtraFormData = {
  funcionarioId: '',
  data: '',
  horas: 1,
  tipo: 'DIURNA_UTIL',
  percentagem: 50,
  estado: 'PENDENTE',
};

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

export function RhHorasExtraManager() {
  const [filtros, setFiltros] = useState<RhHorasExtraListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhHoraExtraDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhHoraExtraDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<HoraExtraFormData>({
    defaultValues: defaultHoraExtraValues,
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

  const carregarHorasExtra = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.horasExtra.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar horas extra', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar horas extra.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarHorasExtra(); }, [carregarHorasExtra]);

  const handleSubmit = async (data: HoraExtraFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.horasExtra.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Hora extra atualizada.');
          setDialogAberto(false);
          setEditando(null);
          void carregarHorasExtra();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.horasExtra.criar(data);
        if (resp.success) {
          toast.success('Hora extra criada.');
          setDialogAberto(false);
          void carregarHorasExtra();
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
    form.reset(defaultHoraExtraValues);
    setDialogAberto(true);
  };

  const abrirParaEditar = (h: RhHoraExtraDto) => {
    setEditando(h);
    form.setValues({
      funcionarioId: h.funcionarioId,
      data: typeof h.data === 'string' ? h.data.slice(0, 10) : format(h.data, 'yyyy-MM-dd'),
      horas: h.horas,
      tipo: h.tipo,
      percentagem: h.percentagem,
      estado: h.estado,
    });
    setDialogAberto(true);
  };

  const aprovar = async (h: RhHoraExtraDto, estado: 'APROVADO' | 'REJEITADO') => {
    try {
      const resp = await rhApi.horasExtra.aprovar({ id: h.id, aprovadoPorId: 'current-user', estado });
      if (resp.success) {
        toast.success(estado === 'APROVADO' ? 'Hora extra aprovada.' : 'Hora extra rejeitada.');
        void carregarHorasExtra();
      } else toast.error('Erro ao aprovar/rejeitar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const inativar = async (h: RhHoraExtraDto) => {
    if (!confirm('Tem certeza que deseja cancelar esta hora extra?')) return;
    try {
      const resp = await rhApi.horasExtra.inativar(h.id);
      if (resp.success) {
        toast.success('Hora extra cancelada.');
        void carregarHorasExtra();
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

  function formatDataBr(valor: string | Date): string {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy', { locale: pt });
  }

  return (
    <div className="space-y-4" data-testid="rh-horas-extra">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarHorasExtra(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="he-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="he-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="he-tipo" className="mb-1 block">Tipo</Label>
                <Select value={filtros.tipo || ''} onValueChange={(v) => setFiltros({ ...filtros, tipo: v as any || undefined, skip: 0 })}>
                  <SelectTrigger id="he-tipo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="DIURNA_UTIL">Diurna (dia útil)</SelectItem>
                    <SelectItem value="NOTURNA">Noturna</SelectItem>
                    <SelectItem value="DESCANSO_FERIADO">Descanso/Feriado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="he-estado" className="mb-1 block">Estado</Label>
                <Select value={filtros.estado || ''} onValueChange={(v) => setFiltros({ ...filtros, estado: (v as any) || undefined, skip: 0 })}>
                  <SelectTrigger id="he-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
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
                <Label htmlFor="he-data-ini" className="mb-1 block">Data Início</Label>
                <Input
                  id="he-data-ini"
                  type="date"
                  value={filtros.dataInicio ? (typeof filtros.dataInicio === 'string' ? filtros.dataInicio.slice(0, 10) : format(filtros.dataInicio, 'yyyy-MM-dd')) : ''}
                  onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value || undefined, skip: 0 })}
                />
              </div>
              <div>
                <Label htmlFor="he-data-fim" className="mb-1 block">Data Fim</Label>
                <Input
                  id="he-data-fim"
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
            <Clock className="w-5 h-5" />
            Horas Extra
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Nova Hora Extra</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead className="w-[140px]">Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-[100px] text-right">Horas</TableHead>
                  <TableHead className="w-[100px] text-right">%</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : pagina.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma hora extra encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(h)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          {h.estado === 'PENDENTE' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => aprovar(h, 'APROVADO')} title="Aprovar" className="text-green-600"><CheckCircle2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => aprovar(h, 'REJEITADO')} title="Rejeitar" className="text-red-600"><X className="w-4 h-4" /></Button>
                            </>
                          )}
                          {h.estado !== 'CANCELADO' && (
                            <Button variant="ghost" size="icon" onClick={() => inativar(h)} title="Cancelar" className="text-gray-600"><AlertTriangle className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getFuncionarioNome(h.funcionarioId)}</TableCell>
                      <TableCell>{formatDataBr(h.data)}</TableCell>
                      <TableCell>{TIPO_LABEL[h.tipo] || h.tipo}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(h.horas).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(h.percentagem).toFixed(2)}%</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[h.estado])}>
                          {ESTADO_LABEL[h.estado]}
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

      {/* Dialog Nova/Editar Hora Extra */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Hora Extra' : 'Nova Hora Extra'}
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
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DIURNA_UTIL">Diurna (dia útil)</SelectItem>
                            <SelectItem value="NOTURNA">Noturna</SelectItem>
                            <SelectItem value="DESCANSO_FERIADO">Descanso/Feriado</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="data"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="horas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horas *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.25" min="0.25" {...field} />
                      </FormControl>
                      <FormMessage />
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
                        <Input type="number" step="0.01" min="0" max="200" {...field} />
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