/**
 * @file DiarioContabilManager.tsx
 * @description Diários contabilísticos (VD, CP, CX, BC, OD, AB, AP, LG).
 *
 * O diário é a dimensão que organiza o livro: vendas não se misturam com
 * compras, caixa não se mistura com banco. O código é curto, maiúsculo e
 * imutável; a designação é livre. Um diário com numeração emitida não se
 * apaga — desactiva-se.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormDialog } from './FormDialog';
import { SearchSelect } from '@/components/ui/SearchSelect';
import {
  DiarioContabilDto,
  DiarioContabilCriarInput,
  DiarioContabilAtualizarInput,
  TipoDiario,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { CheckboxField, FieldWrap, FormShell, SelectField, TextField } from './FormPrimitives';
import { StatusBadge } from './Primitives';

const TIPOS: { value: TipoDiario; label: string }[] = [
  { value: 'vendas', label: 'Vendas' },
  { value: 'compras', label: 'Compras' },
  { value: 'caixa', label: 'Caixa' },
  { value: 'banco', label: 'Banco' },
  { value: 'geral', label: 'Geral' },
  { value: 'ajustamento', label: 'Ajustamento' },
  { value: 'abertura', label: 'Abertura' },
  { value: 'liquidacao', label: 'Liquidação' },
  { value: 'salarios', label: 'Salários' },
  { value: 'imobilizado', label: 'Imobilizado' },
];

const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<
  TipoDiario,
  string
>;

const diarioFormSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, 'O código deve ter pelo menos 2 caracteres.')
    .max(6, 'O código não pode exceder 6 caracteres.')
    .regex(/^[A-Za-z0-9]+$/, 'O código só pode conter letras e números.'),
  designacao: z
    .string()
    .trim()
    .min(2, 'A designação deve ter pelo menos 2 caracteres.')
    .max(120, 'A designação não pode exceder 120 caracteres.'),
  tipo: z.enum([
    'vendas',
    'compras',
    'caixa',
    'banco',
    'geral',
    'ajustamento',
    'abertura',
    'liquidacao',
    'salarios',
    'imobilizado',
  ]),
  activo: z.boolean(),
});

type DiarioFormValues = z.infer<typeof diarioFormSchema>;

export function DiarioContabilManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [diarios, setDiarios] = useState<DiarioContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [activoFiltro, setActivoFiltro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<DiarioContabilDto | null>(null);

  const methods = useForm<DiarioFormValues>({
    resolver: zodResolver(diarioFormSchema),
    defaultValues: {
      codigo: '',
      designacao: '',
      tipo: 'geral',
      activo: true,
    },
  });

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setDiarios([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const res = await contabilidadeApi.listarDiarios({ empresaId });
    if (res.success) setDiarios(res.data.items);
    else
      toast.error('Não foi possível carregar os diários', {
        description: res.error.message,
      });
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return diarios.filter((d) => {
      if (tipoFiltro && d.tipo !== tipoFiltro) return false;
      if (activoFiltro === 'activo' && !d.activo) return false;
      if (activoFiltro === 'inactivo' && d.activo) return false;
      if (!termo) return true;
      return (
        d.codigo.toLowerCase().includes(termo) ||
        d.designacao.toLowerCase().includes(termo)
      );
    });
  }, [diarios, search, tipoFiltro, activoFiltro]);

  const abrirCriar = () => {
    setEditando(null);
    methods.reset({ codigo: '', designacao: '', tipo: 'geral', activo: true });
    setModalAberto(true);
  };

  const abrirEditar = (diario: DiarioContabilDto) => {
    setEditando(diario);
    methods.reset({
      codigo: diario.codigo,
      designacao: diario.designacao,
      tipo: diario.tipo,
      activo: diario.activo,
    });
    setModalAberto(true);
  };

  const submeter = async (values: DiarioFormValues) => {
    if (!empresaId) return;
    setIsSaving(true);

    const res = editando
      ? await contabilidadeApi.atualizarDiario(editando.id, {
          designacao: values.designacao.trim(),
          tipo: values.tipo,
          activo: values.activo,
        } satisfies DiarioContabilAtualizarInput)
      : await contabilidadeApi.criarDiario({
          empresaId,
          codigo: values.codigo.trim().toUpperCase(),
          designacao: values.designacao.trim(),
          tipo: values.tipo,
          activo: values.activo,
        } satisfies DiarioContabilCriarInput);

    setIsSaving(false);

    if (!res.success) {
      toast.error('Não foi possível guardar o diário', { description: res.error.message });
      return;
    }

    toast.success(editando ? 'Diário actualizado.' : 'Diário criado.');
    setModalAberto(false);
    await carregar();
  };

  const eliminar = async (diario: DiarioContabilDto) => {
    if (!confirm(`Eliminar o diário ${diario.codigo} — ${diario.designacao}?`)) return;
    const res = await contabilidadeApi.removerDiario(diario.id);
    if (!res.success) {
      toast.error('Não foi possível eliminar o diário', { description: res.error.message });
      return;
    }
    toast.success('Diário eliminado.');
    await carregar();
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por código ou designação…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="w-[180px]">
        <SearchSelect
          value={tipoFiltro}
          onChange={setTipoFiltro}
          options={TIPOS}
          placeholder="Todos os tipos"
          allowClear
        />
      </div>
      <div className="w-[150px]">
        <SearchSelect
          value={activoFiltro}
          onChange={setActivoFiltro}
          options={[
            { value: 'activo', label: 'Activos' },
            { value: 'inactivo', label: 'Inactivos' },
          ]}
          placeholder="Todos"
          allowClear
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void carregar()}>
        <RefreshCw className="w-4 h-4" />
        Actualizar
      </Button>
    </div>
  );

  return (
    <WorkspaceFrame
      title="Diários contabilísticos"
      description="Cada diário tem o seu próprio livro e numeração. O código aparece no SAF-T e nos extractos."
      actions={
        <Button type="button" size="sm" onClick={abrirCriar} disabled={!empresaId}>
          <Plus className="w-4 h-4" />
          Novo diário
        </Button>
      }
      toolbar={toolbar}
    >
      <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          {filtrados.length} diário{filtrados.length === 1 ? '' : 's'}
        </div>
        <span className="text-xs text-muted-foreground">Código imutável após criação</span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2 w-24">Código</th>
            <th className="text-left font-medium px-4 py-2">Designação</th>
            <th className="text-left font-medium px-4 py-2 w-40">Tipo</th>
            <th className="text-left font-medium px-4 py-2 w-28">Estado</th>
            <th className="text-right font-medium px-4 py-2 w-28">Acções</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
                </span>
              </td>
            </tr>
          ) : filtrados.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                {diarios.length === 0
                  ? 'Ainda não existem diários. Crie o primeiro ou semeie o PGC na aba do plano de contas.'
                  : 'Nenhum diário corresponde aos filtros.'}
              </td>
            </tr>
          ) : (
            filtrados.map((diario) => (
              <tr key={diario.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs font-semibold">{diario.codigo}</td>
                <td className="px-4 py-2">{diario.designacao}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {ROTULO_TIPO[diario.tipo] ?? diario.tipo}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge tone={diario.activo ? 'success' : 'neutral'}>
                    {diario.activo ? 'Activo' : 'Inactivo'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Editar"
                      onClick={() => abrirEditar(diario)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Eliminar"
                      onClick={() => void eliminar(diario)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <FormDialog
        open={modalAberto}
        onOpenChange={setModalAberto}
        title={editando ? `Editar diário ${editando.codigo}` : 'Novo diário'}
        description="O código é curto, maiúsculo e imutável. A designação pode ser alterada a qualquer momento."
      >
            <FormShell
              methods={methods}
              onSubmit={submeter}
              submitLabel={isSaving ? 'A guardar…' : editando ? 'Guardar' : 'Criar diário'}
              onCancel={() => setModalAberto(false)}
              flush
              compact
              dialogLayout
            >
              <div className="grid grid-cols-1 gap-3">
                {editando ? (
                  <FieldWrap label="Código" name="codigo" required>
                    <input
                      value={editando.codigo}
                      disabled
                      className="w-full h-8 px-3 rounded-md border border-input bg-muted text-sm font-mono text-muted-foreground"
                    />
                  </FieldWrap>
                ) : (
                  <TextField
                    name="codigo"
                    label="Código"
                    required
                    placeholder="Ex.: VD"
                  />
                )}

                <TextField
                  name="designacao"
                  label="Designação"
                  required
                  placeholder="Ex.: Diário de vendas"
                />

                <SelectField name="tipo" label="Tipo" required options={TIPOS} />

                <CheckboxField
                  name="activo"
                  label="Diário activo"
                  description="Diários inactivos não aparecem na escolha de lançamentos."
                />
              </div>
            </FormShell>
      </FormDialog>
    </WorkspaceFrame>
  );
}
