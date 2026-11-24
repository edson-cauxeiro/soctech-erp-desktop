import { useCallback, useEffect, useState } from 'react';
import {
  Edit,
  Filter,
  Plus,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  PauseCircle,
  PlayCircle,
  Trash2,
  CreditCard,
  CheckCircle2,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { rhApi } from '@/api/rh.api';
import { z } from 'zod';
import type {
  RhProcessoDividaDto,
  RhProcessosDividaListarInput,
} from '@/@types/electron';

const TIPO_LABEL: Record<string, string> = {
  ADIANTAMENTO: 'Adiantamento',
  EMPRESTIMO: 'Empréstimo',
  PENHORA: 'Penhora',
  OUTRO: 'Outro',
};

const ESTADO_LABEL: Record<string, string> = {
  ATIVA: 'Ativa',
  SUSPENSA: 'Suspensa',
  LIQUIDADA: 'Liquidada',
  CANCELADA: 'Cancelada',
};

const ESTADO_BADGE: Record<string, string> = {
  ATIVA: 'bg-green-100 text-green-800',
  SUSPENSA: 'bg-yellow-100 text-yellow-800',
  LIQUIDADA: 'bg-blue-100 text-blue-800',
  CANCELADA: 'bg-gray-100 text-gray-800',
};

const criarProcessoDividaSchema = z.object({
  funcionarioId: z.string().uuid('Funcionário inválido.'),
  tipo: z.enum(['ADIANTAMENTO', 'EMPRESTIMO', 'PENHORA', 'OUTRO']),
  descricao: z.string().max(500).optional(),
  credor: z.string().max(240).optional(),
  numeroProcesso: z.string().max(120).optional(),
  valorTotal: z.coerce.number().positive('Valor total deve ser positivo.'),
  numeroPrestacoes: z.coerce.number().int().min(1, 'Número de prestações deve ser pelo menos 1.'),
  valorPrestacao: z.coerce.number().positive('Valor da prestação deve ser positivo.'),
  moeda: z.string().max(10).default('AOA'),
  dataInicio: z.string().min(1, 'Data início obrigatória.'),
  respeitaLimitePenhora: z.boolean().default(false),
});

type ProcessoDividaFormData = z.infer<typeof criarProcessoDividaSchema>;

const defaultProcessoDividaValues: ProcessoDividaFormData = {
  funcionarioId: '',
  tipo: 'EMPRESTIMO',
  descricao: '',
  credor: '',
  numeroProcesso: '',
  valorTotal: 0,
  numeroPrestacoes: 1,
  valorPrestacao: 0,
  moeda: 'AOA',
  dataInicio: '',
  respeitaLimitePenhora: false,
};

const suspenderProcessoSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

type SuspenderFormData = z.infer<typeof suspenderProcessoSchema>;

const cancelarProcessoSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

type CancelarFormData = z.infer<typeof cancelarProcessoSchema>;

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

export function RhDividasProcessosManager() {
  const [filtros, setFiltros] = useState<RhProcessosDividaListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhProcessoDividaDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dialogSuspenderAberto, setDialogSuspenderAberto] = useState(false);
  const [dialogCancelarAberto, setDialogCancelarAberto] = useState(false);
  const [editando, setEditando] = useState<RhProcessoDividaDto | null>(null);
  const [processoSuspender, setProcessoSuspender] = useState<RhProcessoDividaDto | null>(null);
  const [processoCancelar, setProcessoCancelar] = useState<RhProcessoDividaDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<ProcessoDividaFormData>({
    defaultValues: defaultProcessoDividaValues,
  });

  const formSuspender = useForm<SuspenderFormData>({
    defaultValues: { id: '', motivo: '' },
  });

  const formCancelar = useForm<CancelarFormData>({
    defaultValues: { id: '', motivo: '' },
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

  const carregarProcessos = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.dividas.processos.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar processos', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar processos.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarProcessos(); }, [carregarProcessos]);

  const handleSubmit = async (data: ProcessoDividaFormData) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.dividas.processos.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Processo atualizado.');
          setDialogAberto(false);
          setEditando(null);
          void carregarProcessos();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.dividas.processos.criar(data);
        if (resp.success) {
          toast.success('Processo criado. Prestações geradas automaticamente.');
          setDialogAberto(false);
          void carregarProcessos();
        } else toast.error('Erro ao criar', { description: resp.error?.message });
      }
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const handleSuspender = async (data: SuspenderFormData) => {
    setASubmeter(true);
    try {
      const resp = await rhApi.dividas.processos.suspender(data);
      if (resp.success) {
        toast.success('Processo suspenso.');
        setDialogSuspenderAberto(false);
        void carregarProcessos();
      } else toast.error('Erro ao suspender', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const handleCancelar = async (data: CancelarFormData) => {
    setASubmeter(true);
    try {
      const resp = await rhApi.dividas.processos.cancelar(data);
      if (resp.success) {
        toast.success('Processo cancelado.');
        setDialogCancelarAberto(false);
        void carregarProcessos();
      } else toast.error('Erro ao cancelar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const gerarPlano = async (id: string) => {
    try {
      const resp = await rhApi.dividas.processos.gerarPlano(id);
      if (resp.success) {
        toast.success('Plano de prestações gerado.');
        void carregarProcessos();
      } else toast.error('Erro ao gerar plano', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const liquidar = async (id: string) => {
    if (!confirm('Tem certeza que deseja liquidar este processo? Todas as prestações devem estar pagas.')) return;
    try {
      const resp = await rhApi.dividas.processos.liquidar(id);
      if (resp.success) {
        toast.success('Processo liquidado.');
        void carregarProcessos();
      } else toast.error('Erro ao liquidar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const abrirParaCriar = () => {
    setEditando(null);
    form.reset(defaultProcessoDividaValues);
    setDialogAberto(true);
  };

  const abrirParaEditar = (p: RhProcessoDividaDto) => {
    setEditando(p);
    form.setValues({
      funcionarioId: p.funcionarioId,
      tipo: p.tipo,
      descricao: p.descricao || '',
      credor: p.credor || '',
      numeroProcesso: p.numeroProcesso || '',
      valorTotal: p.valorTotal,
      numeroPrestacoes: p.numeroPrestacoes,
      valorPrestacao: p.valorPrestacao,
      moeda: p.moeda,
      dataInicio: typeof p.dataInicio === 'string' ? p.dataInicio.slice(0, 10) : format(p.dataInicio, 'yyyy-MM-dd'),
      respeitaLimitePenhora: p.respeitaLimitePenhora,
    });
    setDialogAberto(true);
  };

  const abrirSuspender = (p: RhProcessoDividaDto) => {
    setProcessoSuspender(p);
    formSuspender.setValues({ id: p.id, motivo: '' });
    setDialogSuspenderAberto(true);
  };

  const abrirCancelar = (p: RhProcessoDividaDto) => {
    setProcessoCancelar(p);
    formCancelar.setValues({ id: p.id, motivo: '' });
    setDialogCancelarAberto(true);
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
    <div className="space-y-4" data-testid="rh-dividas-processos">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarProcessos(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="div-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="div-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="div-tipo" className="mb-1 block">Tipo</Label>
                <Select value={filtros.tipo || ''} onValueChange={(v) => setFiltros({ ...filtros, tipo: v as any || undefined, skip: 0 })}>
                  <SelectTrigger id="div-tipo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="ADIANTAMENTO">Adiantamento</SelectItem>
                    <SelectItem value="EMPRESTIMO">Empréstimo</SelectItem>
                    <SelectItem value="PENHORA">Penhora</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="div-estado" className="mb-1 block">Estado</Label>
                <Select value={filtros.estado || ''} onValueChange={(v) => setFiltros({ ...filtros, estado: (v as any) || undefined, skip: 0 })}>
                  <SelectTrigger id="div-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="ATIVA">Ativa</SelectItem>
                    <SelectItem value="SUSPENSA">Suspensa</SelectItem>
                    <SelectItem value="LIQUIDADA">Liquidada</SelectItem>
                    <SelectItem value="CANCELADA">Cancelada</SelectItem>
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
            <CreditCard className="w-5 h-5" />
            Processos de Dívida / Penhora
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Novo Processo</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Credor / Nº Processo</TableHead>
                  <TableHead className="w-[140px] text-right">Valor Total</TableHead>
                  <TableHead className="w-[100px] text-center">Prestações</TableHead>
                  <TableHead className="w-[140px]">Início</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                  <TableHead className="w-[100px] text-right">Saldo</TableHead>
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
                      Nenhum processo de dívida encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(p)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => gerarPlano(p.id)} title="Gerar Plano" disabled={p.prestacoes && p.prestacoes.length > 0}><FileText className="w-4 h-4" /></Button>
                          {p.estado === 'ATIVA' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => abrirSuspender(p)} title="Suspender" className="text-yellow-600"><PauseCircle className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => liquidar(p.id)} title="Liquidar" className="text-blue-600"><CheckCircle2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => abrirCancelar(p)} title="Cancelar" className="text-gray-600"><Trash2 className="w-4 h-4" /></Button>
                            </>
                          )}
                          {p.estado === 'SUSPENSA' && (
                            <Button variant="ghost" size="icon" onClick={() => abrirSuspender(p)} title="Reativar" className="text-green-600"><PlayCircle className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getFuncionarioNome(p.funcionarioId)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {TIPO_LABEL[p.tipo] || p.tipo}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {p.credor && <span>{p.credor}</span>}
                        {p.numeroProcesso && <span className="ml-2 font-mono text-xs">{p.numeroProcesso}</span>}
                        {!p.credor && !p.numeroProcesso && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(p.valorTotal).toLocaleString('pt-AO', { style: 'currency', currency: p.moeda || 'AOA' })}</TableCell>
                      <TableCell className="text-center">{p.numeroPrestacoes}</TableCell>
                      <TableCell>{formatDataBr(p.dataInicio)}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[p.estado])}>
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {Number(p.saldo).toLocaleString('pt-AO', { style: 'currency', currency: p.moeda || 'AOA' })}
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

      {/* Dialog Novo/Editar Processo */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Processo de Dívida' : 'Novo Processo de Dívida'}
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
                            <SelectItem value="ADIANTAMENTO">Adiantamento</SelectItem>
                            <SelectItem value="EMPRESTIMO">Empréstimo</SelectItem>
                            <SelectItem value="PENHORA">Penhora</SelectItem>
                            <SelectItem value="OUTRO">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valorTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Total *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="numeroPrestacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº Prestações *</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valorPrestacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Prestação *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" {...field} />
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
                  name="credor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credor</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nome do credor" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="numeroProcesso"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº Processo Judicial</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Número do processo" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Descrição..." />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="moeda"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moeda</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="AOA" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="respeitaLimitePenhora"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormControl>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                          <span className="text-sm">Respeita limite de penhora (30% salário líquido)</span>
                        </label>
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

      {/* Dialog Suspender */}
      <Dialog open={dialogSuspenderAberto} onOpenChange={setDialogSuspenderAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspender Processo</DialogTitle>
          </DialogHeader>
          <Form {...formSuspender}>
            <form onSubmit={formSuspender.handleSubmit(handleSuspender)} className="space-y-4 p-4">
              <FormField
                control={formSuspender.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo da suspensão *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Motivo..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <input type="hidden" {...formSuspender.register('id')} value={processoSuspender?.id || ''} />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogSuspenderAberto(false)}>Cancelar</Button>
                <Button type="submit" disabled={aSubmeter}>
                  {aSubmeter ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Suspender
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog Cancelar */}
      <Dialog open={dialogCancelarAberto} onOpenChange={setDialogCancelarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar Processo</DialogTitle>
          </DialogHeader>
          <Form {...formCancelar}>
            <form onSubmit={formCancelar.handleSubmit(handleCancelar)} className="space-y-4 p-4">
              <FormField
                control={formCancelar.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo do cancelamento *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Motivo..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <input type="hidden" {...formCancelar.register('id')} value={processoCancelar?.id || ''} />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogCancelarAberto(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={aSubmeter}>
                  {aSubmeter ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirmar Cancelamento
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}