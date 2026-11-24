import { useCallback, useEffect, useState } from 'react';
import {
  Building,
  Edit,
  Filter,
  Plus,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { rhApi } from '@/api/rh.api';
import type { RhIndependenteDto, RhIndependentesListarInput, RhIndependenteCriarInput } from '@/@types/electron';

const ESTADO_LABEL: Record<string, string> = {
  true: 'Ativo',
  false: 'Inativo',
};

const ESTADO_BADGE: Record<string, string> = {
  true: 'bg-green-100 text-green-800',
  false: 'bg-gray-100 text-gray-800',
};

const defaultIndependenteValues = {
  codigo: '',
  nome: '',
  nif: '',
  email: '',
  telefone: '',
  morada: '',
  banco: '',
  iban: '',
  taxaRetencao: undefined,
  ativo: true,
};

const TAKE = 25;

export function RhIndependentesManager() {
  const [filtros, setFiltros] = useState<RhIndependentesListarInput>({
    skip: 0,
    take: 25,
  });
  const [skip, setSkip] = useState(0);
  const [pagina, setPagina] = useState<{ total: number; items: RhIndependenteDto[] }>({ total: 0, items: [] });
  const [carregando, setCarregando] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RhIndependenteDto | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);

  const form = useForm<RhIndependenteCriarInput>({
    defaultValues: {
      codigo: '',
      nome: '',
      nif: '',
      email: '',
      telefone: '',
      morada: '',
      banco: '',
      iban: '',
      taxaRetencao: undefined,
      ativo: true,
    },
  });

  const carregarIndependentes = useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await rhApi.independentes.listar(filtros);
      if (resp.success) setPagina(resp.data);
      else { setPagina({ total: 0, items: [] }); toast.error('Erro ao carregar independentes', { description: resp.error?.message }); }
    } catch {
      setPagina({ total: 0, items: [] });
      toast.error('Erro inesperado ao carregar independentes.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { void carregarIndependentes(); }, [carregarIndependentes]);

  const handleSubmit = async (data: RhIndependenteCriarInput) => {
    setASubmeter(true);
    try {
      if (editando) {
        const resp = await rhApi.independentes.atualizar({ ...data, id: editando.id });
        if (resp.success) {
          toast.success('Independente atualizado.');
          setDialogAberto(false);
          setEditando(null);
          void carregarIndependentes();
        } else toast.error('Erro ao atualizar', { description: resp.error?.message });
      } else {
        const resp = await rhApi.independentes.criar(data);
        if (resp.success) {
          toast.success('Independente criado.');
          setDialogAberto(false);
          void carregarIndependentes();
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
    form.reset(defaultIndependenteValues);
    setDialogAberto(true);
  };

  const abrirParaEditar = (i: RhIndependenteDto) => {
    setEditando(i);
    form.setValues({
      codigo: i.codigo,
      nome: i.nome,
      nif: i.nif ?? '',
      email: i.email ?? '',
      telefone: i.telefone ?? '',
      morada: i.morada ?? '',
      banco: i.banco ?? '',
      iban: i.iban ?? '',
      taxaRetencao: i.taxaRetencao ?? undefined,
      ativo: i.ativo,
    });
    setDialogAberto(true);
  };

  const inativar = async (i: RhIndependenteDto) => {
    if (!confirm('Tem certeza que deseja inativar este independente?')) return;
    try {
      const resp = await rhApi.independentes.inativar(i.id);
      if (resp.success) {
        toast.success('Independente inativado.');
        void carregarIndependentes();
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
    <div className="space-y-4" data-testid="rh-independentes">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void carregarIndependentes(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="ind-codigo" className="mb-1 block">Código</Label>
                <Input
                  id="ind-codigo"
                  value={filtros.codigo || ''}
                  onChange={(e) => setFiltros({ ...filtros, codigo: e.target.value || undefined, skip: 0 })}
                  placeholder="Filtrar por código"
                />
              </div>
              <div>
                <Label htmlFor="ind-nome" className="mb-1 block">Nome</Label>
                <Input
                  id="ind-nome"
                  value={filtros.nome || ''}
                  onChange={(e) => setFiltros({ ...filtros, nome: e.target.value || undefined, skip: 0 })}
                  placeholder="Filtrar por nome"
                />
              </div>
              <div>
                <Label htmlFor="ind-ativo" className="mb-1 block">Estado</Label>
                <Select value={filtros.ativo?.toString() || ''} onValueChange={(v) => setFiltros({ ...filtros, ativo: v === '' ? undefined : v === 'true', skip: 0 })}>
                  <SelectTrigger id="ind-ativo"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
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
            Independentes
          </CardTitle>
          <Button onClick={abrirParaCriar}><Plus className="w-4 h-4 mr-2" /> Novo Independente</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Ações</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>NIF</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Retenção</TableHead>
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
                      Nenhum independente encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirParaEditar(i)} title="Editar"><Edit className="w-4 h-4" /></Button>
                          {i.ativo && (
                            <Button variant="ghost" size="icon" onClick={() => inativar(i)} title="Inativar" className="text-gray-600"><AlertTriangle className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{i.codigo}</TableCell>
                      <TableCell>{i.nome}</TableCell>
                      <TableCell>{i.nif || '—'}</TableCell>
                      <TableCell>{i.email || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{i.taxaRetencao !== null ? `${Number(i.taxaRetencao).toFixed(2)}%` : '—'}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', ESTADO_BADGE[String(i.ativo)])}>
                          {ESTADO_LABEL[String(i.ativo)]}
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

      {/* Dialog Novo/Editar Independente */}
      <FormDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={editando ? 'Editar Independente' : 'Novo Independente'}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Código" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nome" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIF</FormLabel>
                      <FormControl>
                        <Input value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} placeholder="NIF" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} placeholder="Email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} placeholder="Telefone" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="morada"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Morada</FormLabel>
                      <FormControl>
                        <Input value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} placeholder="Morada" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="banco"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Banco</FormLabel>
                      <FormControl>
                        <Input value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} placeholder="Banco" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="iban"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IBAN</FormLabel>
                      <FormControl>
                        <Input value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} placeholder="IBAN" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxaRetencao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Taxa de Retenção (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" max="100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <FormControl>
                        <Select onValueChange={(v) => field.onChange(v === 'true')} defaultValue={field.value ? 'true' : 'false'}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Ativo</SelectItem>
                            <SelectItem value="false">Inativo</SelectItem>
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