import { useCallback, useEffect, useState } from 'react';
import {
  Filter,
  Plus,
  X,
  Edit,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  FileText,
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
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { rhApi } from '@/api/rh.api';
import type { RhRetroativoDto, RhRetroativosListarInput } from '@/@types/electron';

const ESTADO_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  APLICADO: 'Aplicado',
  ANULADO: 'Anulado',
};

const ESTADO_BADGE: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-800',
  APLICADO: 'bg-green-100 text-green-800',
  ANULADO: 'bg-red-100 text-red-800',
};

const criarRetroativoSchema = z.object({
  funcionarioId: z.string().uuid('Funcionário inválido.'),
  rubricaId: z.string().uuid('Rubrica inválida.'),
  anoOrigem: z.coerce.number().int().min(2000).max(2100),
  mesOrigem: z.coerce.number().int().min(1).max(12),
  anoAplicacao: z.coerce.number().int().min(2000).max(2100),
  mesAplicacao: z.coerce.number().int().min(1).max(12),
  valor: z.coerce.number().positive('Valor deve ser positivo.'),
  motivo: z.string().max(500).optional(),
  estado: z.enum(['PENDENTE', 'APLICADO', 'ANULADO']).default('PENDENTE'),
});

type RetroativoFormData = z.infer<typeof criarRetroativoSchema>;

const defaultRetroativoValues: RetroativoFormData = {
  funcionarioId: '',
  rubricaId: '',
  anoOrigem: new Date().getFullYear(),
  mesOrigem: new Date().getMonth() + 1,
  anoAplicacao: new Date().getFullYear(),
  mesAplicacao: new Date().getMonth() + 1,
  valor: 0,
  motivo: '',
  estado: 'PENDENTE',
};

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

interface RubricaOption {
  id: string;
  codigo: string;
  descricao: string;
}

export function RhRetroativosManager() {
  const [filtros, setFiltros] = useState<RhRetroativosListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhRetroativoDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [rubricas, setRubricas] = useState<RubricaOption[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhRetroativoDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<RetroativoFormData>({
    defaultValues: defaultRetroativoValues,
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

  const carregarRubricas = useCallback(async () => {
    try {
      const resp = await rhApi.config.rubricas.listar({ ativo: true });
      if (resp.success) setRubricas(resp.data.items.map((r) => ({ id: r.id, codigo: r.codigo, descricao: r.descricao })));
    } catch {
      setRubricas([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
    void carregarRubricas();
  }, [carregarFuncionarios, carregarRubricas]);

  const carregarRetroativos = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.retroativos.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar retroactivos', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar retroactivos.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarRetroativos(); }, [carregarRetroativos]);

  const handleSubmit = async (data: RetroativoFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.retroativos.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Retroactivo atualizado.');
          setDialogAberto(false);
          setEditando(null);
          void carregarRetroativos();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.retroativos.criar(data);
        if (resp.success) {
          toast.success('Retroactivo criado.');
          setDialogAberto(false);
          void carregarRetroativos();
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
    form.reset(defaultRetroativoValues);
    setDialogAberto(true);
  };

  const abrirParaEditar = (r: RhRetroativoDto) => {
    setEditando(r);
    form.setValues({
      funcionarioId: r.funcionarioId,
      rubricaId: r.rubricaId,
      anoOrigem: r.anoOrigem,
      mesOrigem: r.mesOrigem,
      anoAplicacao: r.anoAplicacao,
      mesAplicacao: r.mesAplicacao,
      valor: r.valor,
      motivo: r.motivo || '',
      estado: r.estado,
    });
    setDialogAberto(true);
  };

  const aplicar = async (r: RhRetroativoDto) => {
    if (!confirm('Tem certeza que deseja aplicar este retroactivo?')) return;
    try {
      const resp = await rhApi.retroativos.aplicar({ id: r.id });
      if (resp.success) {
        toast.success('Retroactivo aplicado.');
        void carregarRetroativos();
      } else toast.error('Erro ao aplicar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const anular = async (r: RhRetroativoDto) => {
    if (!confirm('Tem certeza que deseja anular este retroactivo?')) return;
    try {
      const resp = await rhApi.retroativos.anular({ id: r.id, motivo: 'Anulado pelo utilizador' });
      if (resp.success) {
        toast.success('Retroactivo anulado.');
        void carregarRetroativos();
      } else toast.error('Erro ao anular', { description: resp.error?.message });
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
    <div className="space-y-4" data-testid="rh-retroativos">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarRetroativos(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="ret-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="ret-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ret-rubrica" className="mb-1 block">Rubrica</Label>
                <Select value={filtros.rubricaId || ''} onValueChange={(v) => setFiltros({ ...filtros, rubricaId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="ret-rubrica"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    {rubricas.map((r) => <SelectItem key={r.id} value={r.id}>{r.codigo} - {r.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ret-estado" className="mb-1 block">Estado</Label>
                <Select value={filtros.estado || ''} onValueChange={(v) => setFiltros({ ...filtros, estado: (v as 'PENDENTE' | 'APLICADO' | 'ANULADO') || undefined, skip: 0 })}>
                  <SelectTrigger id="ret-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="APLICADO">Aplicado</SelectItem>
                    <SelectItem value="ANULADO">Anulado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ret-ano-aplic" className="mb-1 block">Ano Aplicação</Label>
                <Input
                  id="ret-ano-aplic"
                  type="number"
                  value={filtros.anoAplicacao || ''}
                  onChange={(e) => setFiltros({ ...filtros, anoAplicacao: e.target.value ? Number(e.target.value) : undefined, skip: 0 })}
                  placeholder="Todos"
                />
              </div>
              <div>
                <Label htmlFor="ret-mes-aplic" className="mb-1 block">Mês Aplicação</Label>
                <Select value={filtros.mesAplicacao != null ? String(filtros.mesAplicacao) : ''} onValueChange={(v) => setFiltros({ ...filtros, mesAplicacao: v ? Number(v) : undefined, skip: 0 })}>
                  <SelectTrigger id="ret-mes-aplic"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>)}
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
            <FileText className="w-5 h-5" />
            Retroactivos
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Novo Retroactivo</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Rubrica</TableHead>
                  <TableHead className="w-[100px] text-center">Origem (A/M)</TableHead>
                  <TableHead className="w-[100px] text-center">Aplicação (A/M)</TableHead>
                  <TableHead className="w-[140px] text-right">Valor</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                  <TableHead>Motivo</TableHead>
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
                      Nenhum retroactivo encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(r)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          {r.estado === 'PENDENTE' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => aplicar(r)} title="Aplicar" className="text-green-600"><CheckCircle2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => anular(r)} title="Anular" className="text-red-600"><AlertTriangle className="w-4 h-4" /></Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{funcionarios.find((f) => f.id === r.funcionarioId) ? `${funcionarios.find((f) => f.id === r.funcionarioId)!.codigo} - ${funcionarios.find((f) => f.id === r.funcionarioId)!.nome}` : r.funcionarioId}</TableCell>
                      <TableCell>{rubricas.find((rb) => rb.id === r.rubricaId) ? `${rubricas.find((rb) => rb.id === r.rubricaId)!.codigo} - ${rubricas.find((rb) => rb.id === r.rubricaId)!.descricao}` : r.rubricaId}</TableCell>
                      <TableCell className="text-center">{r.anoOrigem}/{String(r.mesOrigem).padStart(2, '0')}</TableCell>
                      <TableCell className="text-center">{r.anoAplicacao}/{String(r.mesAplicacao).padStart(2, '0')}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(r.valor).toLocaleString('pt-AO', { style: 'currency', currency: 'AOA' })}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[r.estado])}>
                          {ESTADO_LABEL[r.estado]}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.motivo || '—'}</TableCell>
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

      {/* Dialog Novo/Editar Retroactivo */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Retroactivo' : 'Novo Retroactivo'}
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
                  name="rubricaId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rubrica *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {rubricas.map((r) => <SelectItem key={r.id} value={r.id}>{r.codigo} - {r.descricao}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="anoOrigem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano Origem *</FormLabel>
                      <FormControl>
                        <Input type="number" min="2000" max="2100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mesOrigem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mês Origem *</FormLabel>
                      <FormControl>
                        <Select onValueChange={(v) => field.onChange(v ? Number(v) : undefined)} defaultValue={field.value ? String(field.value) : ''}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="anoAplicacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano Aplicação *</FormLabel>
                      <FormControl>
                        <Input type="number" min="2000" max="2100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mesAplicacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mês Aplicação *</FormLabel>
                      <FormControl>
                        <Select onValueChange={(v) => field.onChange(v ? Number(v) : undefined)} defaultValue={field.value ? String(field.value) : ''}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" {...field} />
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
                            <SelectItem value="APLICADO">Aplicado</SelectItem>
                            <SelectItem value="ANULADO">Anulado</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="motivo"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Motivo</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Motivo..." />
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