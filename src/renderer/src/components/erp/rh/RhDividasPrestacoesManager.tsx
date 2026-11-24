import { useCallback, useEffect, useState } from 'react';
import {
  Filter,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  DollarSign,
  ArrowDown,
  ArrowUp,
  MinusCircle,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type {
  RhPrestacaoDividaDto,
  RhPrestacoesDividaListarInput,
} from '@/@types/electron';

const ESTADO_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  DESCONTADA: 'Descontada',
  ANULADA: 'Anulada',
  PERDOADA: 'Perdoada',
};

const ESTADO_BADGE: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-800',
  DESCONTADA: 'bg-green-100 text-green-800',
  ANULADA: 'bg-red-100 text-red-800',
  PERDOADA: 'bg-blue-100 text-blue-800',
};

const descontarPrestacaoSchema = z.object({
  id: z.string().uuid(),
  valorDescontado: z.coerce.number().positive('Valor deve ser positivo.'),
  processamentoItemId: z.string().uuid('Processamento inválido.'),
});

type DescontarFormData = z.infer<typeof descontarPrestacaoSchema>;

const anularPrestacaoSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

type AnularFormData = z.infer<typeof anularPrestacaoSchema>;

const perdoarPrestacaoSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().min(3, 'Motivo é obrigatório.').max(500),
});

type PerdoarFormData = z.infer<typeof perdoarPrestacaoSchema>;

const TAKE = 25;

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

interface ProcessoOption {
  id: string;
  tipo: string;
  funcionario: { codigo: string; nome: string };
}

export function RhDividasPrestacoesManager() {
  const [filtros, setFiltros] = useState<RhPrestacoesDividaListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhPrestacaoDividaDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [processos, setProcessos] = useState<ProcessoOption[]>([]);
  const [dialogDescontarAberto, setDialogDescontarAberto] = useState(false);
  const [dialogAnularAberto, setDialogAnularAberto] = useState(false);
  const [dialogPerdoarAberto, setDialogPerdoarAberto] = useState(false);
  const [prestacaoDescontar, setPrestacaoDescontar] = useState<RhPrestacaoDividaDto | null>(null);
  const [prestacaoAnular, setPrestacaoAnular] = useState<RhPrestacaoDividaDto | null>(null);
  const [prestacaoPerdoar, setPrestacaoPerdoar] = useState<RhPrestacaoDividaDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const formDescontar = useForm<DescontarFormData>({
    defaultValues: { id: '', valorDescontado: 0, processamentoItemId: '' },
  });

  const formAnular = useForm<AnularFormData>({
    defaultValues: { id: '', motivo: '' },
  });

  const formPerdoar = useForm<PerdoarFormData>({
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

  const carregarProcessos = useCallback(async () => {
    try {
      const resp = await rhApi.dividas.processos.listar({ take: 200 });
      if (resp.success) {
        setProcessos(resp.data.items.map((p) => ({
          id: p.id,
          tipo: p.tipo,
          funcionario: { codigo: p.funcionario.codigo, nome: p.funcionario.nome },
        })));
      }
    } catch {
      setProcessos([]);
    }
  }, []);

  useEffect(() => {
    void carregarFuncionarios();
    void carregarProcessos();
  }, [carregarFuncionarios, carregarProcessos]);

  const carregarPrestacoes = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.dividas.prestacoes.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar prestações', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar prestações.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarPrestacoes(); }, [carregarPrestacoes]);

  const handleDescontar = async (data: DescontarFormData) => {
    setASubmeter(true);
    try {
      const resp = await rhApi.dividas.prestacoes.descontar(data);
      if (resp.success) {
        toast.success('Prestação descontada.');
        setDialogDescontarAberto(false);
        void carregarPrestacoes();
      } else toast.error('Erro ao descontar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const handleAnular = async (data: AnularFormData) => {
    setASubmeter(true);
    try {
      const resp = await rhApi.dividas.prestacoes.anular(data);
      if (resp.success) {
        toast.success('Prestação anulada.');
        setDialogAnularAberto(false);
        void carregarPrestacoes();
      } else toast.error('Erro ao anular', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const handlePerdoar = async (data: PerdoarFormData) => {
    setASubmeter(true);
    try {
      const resp = await rhApi.dividas.prestacoes.perdoar(data);
      if (resp.success) {
        toast.success('Prestação perdoada.');
        setDialogPerdoarAberto(false);
        void carregarPrestacoes();
      } else toast.error('Erro ao perdoar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeter(false);
    }
  };

  const abrirDescontar = (p: RhPrestacaoDividaDto) => {
    setPrestacaoDescontar(p);
    formDescontar.setValues({
      id: p.id,
      valorDescontado: Number(p.valor) - Number(p.valorDescontado),
      processamentoItemId: '',
    });
    setDialogDescontarAberto(true);
  };

  const abrirAnular = (p: RhPrestacaoDividaDto) => {
    setPrestacaoAnular(p);
    formAnular.setValues({ id: p.id, motivo: '' });
    setDialogAnularAberto(true);
  };

  const abrirPerdoar = (p: RhPrestacaoDividaDto) => {
    setPrestacaoPerdoar(p);
    formPerdoar.setValues({ id: p.id, motivo: '' });
    setDialogPerdoarAberto(true);
  };

  const total = pagina.total;
  const inicio = total === 0 ? 0 : skip + 1;
  const fim = skip + pagina.items.length;
  const temAnt = skip > 0;
  const temProx = skip + TAKE < total;

  return (
    <div className="space-y-4" data-testid="rh-dividas-prestacoes">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarPrestacoes(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              <div>
                <Label htmlFor="prest-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtros.funcionarioId || ''} onValueChange={(v) => setFiltros({ ...filtros, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="prest-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="prest-processo" className="mb-1 block">Processo</Label>
                <Select value={filtros.processoId || ''} onValueChange={(v) => setFiltros({ ...filtros, processoId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="prest-processo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {processos.map((p) => <SelectItem key={p.id} value={p.id}>{TIPO_LABEL[p.tipo] || p.tipo} - {p.funcionario.codigo} - {p.funcionario.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="prest-ano" className="mb-1 block">Ano</Label>
                <Input
                  id="prest-ano"
                  type="number"
                  value={filtros.ano || ''}
                  onChange={(e) => setFiltros({ ...filtros, ano: e.target.value ? Number(e.target.value) : undefined, skip: 0 })}
                  placeholder="Todos"
                />
              </div>
              <div>
                <Label htmlFor="prest-mes" className="mb-1 block">Mês</Label>
                <Select value={filtros.mes != null ? String(filtros.mes) : ''} onValueChange={(v) => setFiltros({ ...filtros, mes: v ? Number(v) : undefined, skip: 0 })}>
                  <SelectTrigger id="prest-mes"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="prest-estado" className="mb-1 block">Estado</Label>
                <Select value={filtros.estado || ''} onValueChange={(v) => setFiltros({ ...filtros, estado: (v as any) || undefined, skip: 0 })}>
                  <SelectTrigger id="prest-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="DESCONTADA">Descontada</SelectItem>
                    <SelectItem value="ANULADA">Anulada</SelectItem>
                    <SelectItem value="PERDOADA">Perdoada</SelectItem>
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
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Prestações de Dívida
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead className="w-[100px] text-center">Ano/Mês</TableHead>
                  <TableHead className="w-[100px]">Nº</TableHead>
                  <TableHead className="w-[140px] text-right">Valor</TableHead>
                  <TableHead className="w-[140px] text-right">Descontado</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : pagina.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma prestação encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {p.estado === 'PENDENTE' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => abrirDescontar(p)} title="Descontar" className="text-green-600"><ArrowDown className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => abrirAnular(p)} title="Anular" className="text-red-600"><MinusCircle className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => abrirPerdoar(p)} title="Perdoar" className="text-blue-600"><ArrowUp className="w-4 h-4" /></Button>
                            </>
                          )}
                          {p.estado === 'DESCONTADA' && (
                            <Button variant="ghost" size="icon" title="Já descontada" disabled><CheckCircle2 className="w-4 h-4 text-green-600" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getFuncionarioNome(p.processo.funcionario.id, funcionarios)}</TableCell>
                      <TableCell>{getProcessoLabel(p.processo.id, processos)}</TableCell>
                      <TableCell className="text-center">{p.ano}/{String(p.mes).padStart(2, '0')}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{p.numero}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(p.valor).toLocaleString('pt-AO', { style: 'currency', currency: p.processo?.moeda || 'AOA' })}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(p.valorDescontado).toLocaleString('pt-AO', { style: 'currency', currency: p.processo?.moeda || 'AOA' })}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[p.estado])}>
                          {ESTADO_LABEL[p.estado]}
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

      {/* Dialog Descontar */}
      <Dialog open={dialogDescontarAberto} onOpenChange={setDialogDescontarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descontar Prestação</DialogTitle>
          </DialogHeader>
          <Form {...formDescontar}>
            <form onSubmit={formDescontar.handleSubmit(handleDescontar)} className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={formDescontar.control}
                  name="valorDescontado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor a Descontar *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0.01" max={prestacaoDescontar ? Number(prestacaoDescontar.valor) - Number(prestacaoDescontar.valorDescontado) : undefined} {...field} />
                      </FormControl>
                      <FormDescription>Valor restante: {prestacaoDescontar ? (Number(prestacaoDescontar.valor) - Number(prestacaoDescontar.valorDescontado)).toLocaleString('pt-AO', { style: 'currency', currency: prestacaoDescontar.processo?.moeda || 'AOA' }) : '—'}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formDescontar.control}
                  name="processamentoItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID do Processamento *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ID do processamento" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <input type="hidden" {...formDescontar.register('id')} value={prestacaoDescontar?.id || ''} />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogDescontarAberto(false)}>Cancelar</Button>
                <Button type="submit" disabled={aSubmeter}>
                  {aSubmeter ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Descontar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog Anular */}
      <Dialog open={dialogAnularAberto} onOpenChange={setDialogAnularAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular Prestação</DialogTitle>
          </DialogHeader>
          <Form {...formAnular}>
            <form onSubmit={formAnular.handleSubmit(handleAnular)} className="space-y-4 p-4">
              <FormField
                control={formAnular.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo da anulação *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Motivo..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <input type="hidden" {...formAnular.register('id')} value={prestacaoAnular?.id || ''} />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogAnularAberto(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={aSubmeter}>
                  {aSubmeter ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Anular
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog Perdoar */}
      <Dialog open={dialogPerdoarAberto} onOpenChange={setDialogPerdoarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Perdoar Prestação</DialogTitle>
          </DialogHeader>
          <Form {...formPerdoar}>
            <form onSubmit={formPerdoar.handleSubmit(handlePerdoar)} className="space-y-4 p-4">
              <FormField
                control={formPerdoar.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo do perdão *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Motivo..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <input type="hidden" {...formPerdoar.register('id')} value={prestacaoPerdoar?.id || ''} />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogPerdoarAberto(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={aSubmeter}>
                  {aSubmeter ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Perdoar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TIPO_LABEL: Record<string, string> = {
  ADIANTAMENTO: 'Adiantamento',
  EMPRESTIMO: 'Empréstimo',
  PENHORA: 'Penhora',
  OUTRO: 'Outro',
};

function getFuncionarioNome(id: string, funcionarios: FuncionarioOption[]) {
  const f = funcionarios.find((x) => x.id === id);
  return f ? `${f.codigo} - ${f.nome}` : id;
}

function getProcessoLabel(id: string, processos: ProcessoOption[]) {
  const p = processos.find((x) => x.id === id);
  return p ? `${TIPO_LABEL[p.tipo] || p.tipo} - ${p.funcionario.codigo} - ${p.funcionario.nome}` : id;
}

interface FuncionarioOption {
  id: string;
  codigo: string;
  nome: string;
}

interface ProcessoOption {
  id: string;
  tipo: string;
  funcionario: { codigo: string; nome: string };
}