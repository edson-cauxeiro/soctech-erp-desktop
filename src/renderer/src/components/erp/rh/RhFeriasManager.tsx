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
  Sun,
  ListTodo,
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
import type {
  RhFeriasSaldoDto,
  RhFeriasSaldosListarInput,
  RhMarcacaoFeriasDto,
  RhMarcacoesFeriasListarInput,
} from '@/@types/electron';

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

export function RhFeriasManager() {
  const [filtrosSaldos, setFiltrosSaldos] = useState<RhFeriasSaldosListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skipSaldos, setSkipSaldos] = useState(0);
  const [paginaSaldos, setPaginaSaldos] = useState<{ total: number; items: RhFeriasSaldoDto[] }>({ total: 0, items: [] });

  const [filtrosMarcacoes, setFiltrosMarcacoes] = useState<RhMarcacoesFeriasListarInput>({
    skip: 0,
    take: TAKE,
  });
  const [skipMarcacoes, setSkipMarcacoes] = useState(0);
  const [paginaMarcacoes, setPaginaMarcacoes] = useState<{ total: number; items: RhMarcacaoFeriasDto[] }>({ total: 0, items: [] });

  const [carregando, setCarregando] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [dialogMarcacaoAberto, setDialogMarcacaoAberto] = useState(false);
  const [editandoMarcacao, setEditandoMarcacao] = useState<RhMarcacaoFeriasDto | null>(null);
  const [aSubmeterMarcacao, setASubmeterMarcacao] = useState(false);

  const formMarcacao = useForm<MarcacaoFeriasFormData>({
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

  const carregarSaldos = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.ferias.saldos.listar(filtrosSaldos);
      if (resp.success) setPaginaSaldos({ total: resp.data.total, items: resp.data.items });
      else { setPaginaSaldos({ total: 0, items: [] }); toast.error('Erro ao carregar saldos', { description: resp.error?.message }); }
    } catch {
      setPaginaSaldos({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar saldos.');
    } finally {
      setCarregando(false);
    }
  }, [filtrosSaldos]);

  const carregarMarcacoes = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.ferias.marcacoes.listar(filtrosMarcacoes);
      if (resp.success) setPaginaMarcacoes(resp.data);
      else { setPaginaMarcacoes({ total: 0, items: [] }); toast.error('Erro ao carregar marcações', { description: resp.error?.message }); }
    } catch {
      setPaginaMarcacoes({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar marcações.');
    } finally {
      setCarregando(false);
    }
  }, [filtrosMarcacoes]);

  useEffect(() => { void carregarSaldos(); }, [carregarSaldos]);
  useEffect(() => { void carregarMarcacoes(); }, [carregarMarcacoes]);

  const handleSubmitMarcacao = async (data: MarcacaoFeriasFormData) => {
    setASubmeterMarcacao(true);
    try {
      if (editandoMarcacao) {
        const resp = await rhApi.ferias.marcacoes.atualizar({ ...data, id: editandoMarcacao.id });
        if (resp.success) {
          toast.success('Marcação atualizada.');
          setDialogMarcacaoAberto(false);
          setEditandoMarcacao(null);
          void carregarMarcacoes();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.ferias.marcacoes.criar(data);
        if (resp.success) {
          toast.success('Marcação criada.');
          setDialogMarcacaoAberto(false);
          void carregarMarcacoes();
        } else toast.error('Erro ao criar', { description: resp.error?.message });
      }
    } catch {
      toast.error('Erro inesperado.');
    } finally {
      setASubmeterMarcacao(false);
    }
  };

  const abrirParaCriarMarcacao = () => {
    setEditandoMarcacao(null);
    formMarcacao.reset({ ...defaultMarcacaoFeriasValues, ano: new Date().getFullYear() });
    setDialogMarcacaoAberto(true);
  };

  const abrirParaEditarMarcacao = (m: RhMarcacaoFeriasDto) => {
    setEditandoMarcacao(m);
    formMarcacao.setValues({
      funcionarioId: m.funcionarioId,
      ano: m.ano,
      dataInicio: typeof m.dataInicio === 'string' ? m.dataInicio.slice(0, 10) : format(m.dataInicio, 'yyyy-MM-dd'),
      dataFim: typeof m.dataFim === 'string' ? m.dataFim.slice(0, 10) : format(m.dataFim, 'yyyy-MM-dd'),
      dias: m.dias,
      estado: m.estado,
      observacao: m.observacao || '',
    });
    setDialogMarcacaoAberto(true);
  };

  const aprovarMarcacao = async (m: RhMarcacaoFeriasDto, estado: 'APROVADA' | 'REJEITADA' | 'CANCELADA') => {
    try {
      const resp = await rhApi.ferias.marcacoes.aprovar({ id: m.id, aprovadoPorId: 'current-user', estado });
      if (resp.success) {
        toast.success(estado === 'APROVADA' ? 'Marcação aprovada.' : estado === 'REJEITADA' ? 'Marcação rejeitada.' : 'Marcação cancelada.');
        void carregarMarcacoes();
      } else toast.error('Erro ao aprovar/rejeitar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const inativarMarcacao = async (m: RhMarcacaoFeriasDto) => {
    if (!confirm('Tem certeza que deseja cancelar esta marcação?')) return;
    try {
      const resp = await rhApi.ferias.marcacoes.inativar(m.id);
      if (resp.success) {
        toast.success('Marcação cancelada.');
        void carregarMarcacoes();
      } else toast.error('Erro ao cancelar', { description: resp.error?.message });
    } catch {
      toast.error('Erro inesperado.');
    }
  };

  const totalSaldos = paginaSaldos.total;
  const inicioSaldos = totalSaldos === 0 ? 0 : skipSaldos + 1;
  const fimSaldos = skipSaldos + paginaSaldos.items.length;
  const temAntSaldos = skipSaldos > 0;
  const temProxSaldos = skipSaldos + TAKE < totalSaldos;

  const totalMarcacoes = paginaMarcacoes.total;
  const inicioMarcacoes = totalMarcacoes === 0 ? 0 : skipMarcacoes + 1;
  const fimMarcacoes = skipMarcacoes + paginaMarcacoes.items.length;
  const temAntMarcacoes = skipMarcacoes > 0;
  const temProxMarcacoes = skipMarcacoes + TAKE < totalMarcacoes;

  const getFuncionarioNome = (id: string) => {
    const f = funcionarios.find((x) => x.id === id);
    return f ? `${f.codigo} - ${f.nome}` : id;
  };

  function formatDataBr(valor: string | Date): string {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy', { locale: pt });
  }

  return (
    <div className="space-y-4" data-testid="rh-ferias">
      {/* Filtros Saldos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros Saldos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarSaldos(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="ferias-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtrosSaldos.funcionarioId || ''} onValueChange={(v) => setFiltrosSaldos({ ...filtrosSaldos, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="ferias-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ferias-ano" className="mb-1 block">Ano</Label>
                <Input
                  id="ferias-ano"
                  type="number"
                  value={filtrosSaldos.ano || ''}
                  onChange={(e) => setFiltrosSaldos({ ...filtrosSaldos, ano: e.target.value ? Number(e.target.value) : undefined, skip: 0 })}
                  placeholder="Todos"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={carregando}>
                <Loader2 className={cn('w-4 h-4 mr-2', carregando ? 'animate-spin' : '')} />
                Atualizar
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setFiltrosSaldos({ skip: 0, take: TAKE });
                setSkipSaldos(0);
              }}>
                <X className="w-4 h-4 mr-2" /> Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabela Saldos */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            Saldos de Férias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead className="w-[80px] text-center">Ano</TableHead>
                  <TableHead className="w-[100px] text-right">Direito</TableHead>
                  <TableHead className="w-[100px] text-right">Transitados</TableHead>
                  <TableHead className="w-[100px] text-right">Marcados</TableHead>
                  <TableHead className="w-[100px] text-right">Gozados</TableHead>
                  <TableHead className="w-[100px] text-right">Saldo</TableHead>
                  <TableHead className="w-[140px] text-center">Subsídio Proc.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : paginaSaldos.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum saldo de férias encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginaSaldos.items.map((s) => {
                    const saldo = Number(s.diasDireito) + Number(s.diasTransitados) - Number(s.diasGozados);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{getFuncionarioNome(s.funcionarioId)}</TableCell>
                        <TableCell className="text-center">{s.ano}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(s.diasDireito).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(s.diasTransitados).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(s.diasMarcados).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(s.diasGozados).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{saldo.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {s.subsidioFeriasProcessado ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Sim</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Não</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalSaldos > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Mostrando {inicioSaldos} a {fimSaldos} de {totalSaldos}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSkipSaldos(s => Math.max(0, s - TAKE))} disabled={!temAntSaldos}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSkipSaldos(s => s + TAKE)} disabled={!temProxSaldos}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtros Marcações */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros Marcações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarMarcacoes(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <Label htmlFor="marc-funcionario" className="mb-1 block">Funcionário</Label>
                <Select value={filtrosMarcacoes.funcionarioId || ''} onValueChange={(v) => setFiltrosMarcacoes({ ...filtrosMarcacoes, funcionarioId: v || undefined, skip: 0 })}>
                  <SelectTrigger id="marc-funcionario"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.codigo} - {f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="marc-ano" className="mb-1 block">Ano</Label>
                <Input
                  id="marc-ano"
                  type="number"
                  value={filtrosMarcacoes.ano || ''}
                  onChange={(e) => setFiltrosMarcacoes({ ...filtrosMarcacoes, ano: e.target.value ? Number(e.target.value) : undefined, skip: 0 })}
                  placeholder="Todos"
                />
              </div>
              <div>
                <Label htmlFor="marc-estado" className="mb-1 block">Estado</Label>
                <Select value={filtrosMarcacoes.estado || ''} onValueChange={(v) => setFiltrosMarcacoes({ ...filtrosMarcacoes, estado: (v as any) || undefined, skip: 0 })}>
                  <SelectTrigger id="marc-estado"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="PLANEADA">Planeada</SelectItem>
                    <SelectItem value="APROVADA">Aprovada</SelectItem>
                    <SelectItem value="GOZADA">Gozada</SelectItem>
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
                setFiltrosMarcacoes({ skip: 0, take: TAKE });
                setSkipMarcacoes(0);
              }}>
                <X className="w-4 h-4 mr-2" /> Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabela Marcações */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sun className="w-5 h-5" />
            Marcações de Férias
          </CardTitle>
          <Button onClick={abrirParaCriarMarcacao}><Plus className="w-4 h-4 mr-2" /> Nova Marcação</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead className="w-[80px] text-center">Ano</TableHead>
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
                ) : paginaMarcacoes.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma marcação de férias encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginaMarcacoes.items.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditarMarcacao(m)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          {m.estado === 'PLANEADA' && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => aprovarMarcacao(m, 'APROVADA')} title="Aprovar" className="text-green-600"><CheckCircle2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => aprovarMarcacao(m, 'REJEITADA')} title="Rejeitar" className="text-red-600"><X className="w-4 h-4" /></Button>
                            </>
                          )}
                          {m.estado !== 'CANCELADA' && (
                            <Button variant="ghost" size="icon" onClick={() => inativarMarcacao(m)} title="Cancelar" className="text-gray-600"><AlertTriangle className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getFuncionarioNome(m.funcionarioId)}</TableCell>
                      <TableCell className="text-center">{m.ano}</TableCell>
                      <TableCell>{formatDataBr(m.dataInicio)}</TableCell>
                      <TableCell>{formatDataBr(m.dataFim)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(m.dias).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', MARCACAO_ESTADO_BADGE[m.estado])}>
                          {MARCACAO_ESTADO_LABEL[m.estado]}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{m.observacao || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalMarcacoes > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Mostrando {inicioMarcacoes} a {fimMarcacoes} de {totalMarcacoes}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSkipMarcacoes(s => Math.max(0, s - TAKE))} disabled={!temAntMarcacoes}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSkipMarcacoes(s => s + TAKE)} disabled={!temProxMarcacoes}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Nova/Editar Marcação */}
      <FormDialog
        open={dialogMarcacaoAberto}
        onOpenChange={setDialogMarcacaoAberto}
        title={editandoMarcacao ? 'Editar Marcação de Férias' : 'Nova Marcação de Férias'}
      >
        <Form {...formMarcacao}>
          <form onSubmit={formMarcacao.handleSubmit(handleSubmitMarcacao)} className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={formMarcacao.control}
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
                  control={formMarcacao.control}
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
                  control={formMarcacao.control}
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
                  control={formMarcacao.control}
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
                  control={formMarcacao.control}
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
                  control={formMarcacao.control}
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
                  control={formMarcacao.control}
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
              <Button type="button" variant="outline" onClick={() => setDialogMarcacaoAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={aSubmeterMarcacao}>
                {aSubmeterMarcacao ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editandoMarcacao ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </FormDialog>
    </div>
  );
}