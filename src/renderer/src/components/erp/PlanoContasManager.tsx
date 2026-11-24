/**
 * @file PlanoContasManager.tsx
 * @description Plano de contas PGC Angola: árvore à esquerda, formulário à
 * direita.
 *
 * O ecrã foi desenhado para não crescer para fora da janela. A árvore e o
 * formulário têm scroll próprio dentro do `WorkspaceFrame`; o cabeçalho, os
 * filtros e os botões de acção ficam sempre visíveis. Uma conta com filhas é
 * automaticamente convertida em conta de agregação pelo backend — a UI mostra
 * o estado, não tenta adivinhar a regra.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronRight,
  Database,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import {
  ContaContabilDto,
  ContaContabilCriarInput,
  ContaContabilAtualizarInput,
  NaturezaConta,
  TipoContaContabil,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { FormSurface } from './FormDialog';
import {
  CheckboxField,
  FieldWrap,
  FormShell,
  SelectField,
  TextField,
} from './FormPrimitives';
import { StatusBadge } from './Primitives';
import { cn } from '@/lib/utils';

const TIPOS: { value: TipoContaContabil; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'passivo', label: 'Passivo' },
  { value: 'capitalProprio', label: 'Capital próprio' },
  { value: 'proveito', label: 'Proveito' },
  { value: 'custo', label: 'Custo' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'memo', label: 'Memorando' },
];

const NATUREZAS: { value: NaturezaConta; label: string }[] = [
  { value: 'devedora', label: 'Devedora' },
  { value: 'credora', label: 'Credora' },
];

const CLASSES = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: `Classe ${i + 1}`,
}));

const contaFormSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(
      /^[1-8][0-9]{0,9}$/,
      'O código deve começar por 1–8 e conter apenas dígitos (máx. 10).'
    ),
  designacao: z
    .string()
    .trim()
    .min(2, 'A designação deve ter pelo menos 2 caracteres.')
    .max(120, 'A designação não pode exceder 120 caracteres.'),
  contaPaiId: z.string().optional(),
  tipo: z.enum(['activo', 'passivo', 'capitalProprio', 'proveito', 'custo', 'resultado', 'memo']),
  natureza: z.enum(['devedora', 'credora']),
  aceitaMovimento: z.boolean(),
  exigeCentroCusto: z.boolean(),
  exigeEntidade: z.boolean(),
  activa: z.boolean(),
});

type ContaFormValues = z.infer<typeof contaFormSchema>;

function filtrarArvore(
  nos: ContaContabilDto[],
  termo: string,
  classe: string
): ContaContabilDto[] {
  const t = termo.trim().toLowerCase();
  const resultado: ContaContabilDto[] = [];
  for (const no of nos) {
    const filhas = filtrarArvore(no.filhas ?? [], termo, classe);
    const combina =
      (!t ||
        no.codigo.toLowerCase().includes(t) ||
        no.designacao.toLowerCase().includes(t)) &&
      (!classe || String(no.classe) === classe);
    if (combina || filhas.length > 0) {
      resultado.push({ ...no, filhas });
    }
  }
  return resultado;
}

function achatar(nos: ContaContabilDto[]): ContaContabilDto[] {
  return nos.flatMap((no) => [no, ...achatar(no.filhas ?? [])]);
}

function ContaTreeNode({
  no,
  profundidade,
  selecionadaId,
  colapsados,
  onToggle,
  onSelect,
}: {
  no: ContaContabilDto;
  profundidade: number;
  selecionadaId?: string;
  colapsados: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (conta: ContaContabilDto) => void;
}) {
  const filhas = no.filhas ?? [];
  const temFilhas = filhas.length > 0;
  const colapsado = colapsados.has(no.id);
  const selecionada = selecionadaId === no.id;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-md pr-2 py-1 text-sm transition-colors',
          selecionada ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60'
        )}
        style={{ paddingLeft: `${8 + profundidade * 14}px` }}
      >
        <button
          type="button"
          onClick={() => temFilhas && onToggle(no.id)}
          className={cn(
            'w-4 h-4 shrink-0 grid place-items-center rounded',
            temFilhas ? 'hover:bg-muted' : 'opacity-0 pointer-events-none'
          )}
          aria-label={colapsado ? 'Expandir conta' : 'Colapsar conta'}
        >
          <ChevronRight
            className={cn('w-3.5 h-3.5 transition-transform', !colapsado && 'rotate-90')}
          />
        </button>

        <button
          type="button"
          onClick={() => onSelect(no)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
            {no.codigo}
          </span>
          <span className="truncate">{no.designacao}</span>
          {!no.activa && (
            <span className="text-[10px] uppercase tracking-wide text-destructive shrink-0">
              inactiva
            </span>
          )}
          {no.aceitaMovimento && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-success shrink-0"
              title="Conta folha: aceita lançamentos"
            />
          )}
        </button>
      </div>

      {temFilhas && !colapsado && (
        <div>
          {filhas.map((filha) => (
            <ContaTreeNode
              key={filha.id}
              no={filha}
              profundidade={profundidade + 1}
              selecionadaId={selecionadaId}
              colapsados={colapsados}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PlanoContasManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [arvore, setArvore] = useState<ContaContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [classe, setClasse] = useState('');
  const [selecionada, setSelecionada] = useState<ContaContabilDto | null>(null);
  const [modo, setModo] = useState<'vazio' | 'criar' | 'editar'>('vazio');
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const methods = useForm<ContaFormValues>({
    resolver: zodResolver(contaFormSchema),
    defaultValues: {
      codigo: '',
      designacao: '',
      contaPaiId: '',
      tipo: 'activo',
      natureza: 'devedora',
      aceitaMovimento: true,
      exigeCentroCusto: false,
      exigeEntidade: false,
      activa: true,
    },
  });

  const codigoAtual = methods.watch('codigo');
  const tipoAtual = methods.watch('tipo');

  const contasPlanificadas = useMemo(() => achatar(arvore), [arvore]);

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setArvore([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const res = await contabilidadeApi.arvoreContas(empresaId);
    if (res.success) {
      setArvore(res.data);
    } else {
      toast.error('Não foi possível carregar o plano de contas', {
        description: res.error.message,
      });
    }
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const arvoreFiltrada = useMemo(
    () => filtrarArvore(arvore, search, classe),
    [arvore, search, classe]
  );

  const opcoesPai = useMemo(() => {
    const codigo = codigoAtual?.trim() ?? '';
    return contasPlanificadas
      .filter(
        (c) =>
          c.id !== selecionada?.id &&
          c.activa &&
          codigo.startsWith(c.codigo) &&
          c.codigo !== codigo
      )
      .map((c) => ({ value: c.id, label: `${c.codigo} — ${c.designacao}` }));
  }, [contasPlanificadas, codigoAtual, selecionada?.id]);

  const abrirCriar = () => {
    setSelecionada(null);
    setModo('criar');
    methods.reset({
      codigo: '',
      designacao: '',
      contaPaiId: '',
      tipo: 'activo',
      natureza: 'devedora',
      aceitaMovimento: true,
      exigeCentroCusto: false,
      exigeEntidade: false,
      activa: true,
    });
  };

  const abrirEditar = (conta: ContaContabilDto) => {
    setSelecionada(conta);
    setModo('editar');
    methods.reset({
      codigo: conta.codigo,
      designacao: conta.designacao,
      contaPaiId: conta.contaPaiId ?? '',
      tipo: conta.tipo,
      natureza: conta.natureza,
      aceitaMovimento: conta.aceitaMovimento,
      exigeCentroCusto: conta.exigeCentroCusto,
      exigeEntidade: conta.exigeEntidade,
      activa: conta.activa,
    });
  };

  const submeter = async (values: ContaFormValues) => {
    if (!empresaId) return;
    setIsSaving(true);

    const res =
      modo === 'criar'
        ? await contabilidadeApi.criarConta({
            empresaId,
            codigo: values.codigo.trim(),
            designacao: values.designacao.trim(),
            contaPaiId: values.contaPaiId || undefined,
            tipo: values.tipo,
            natureza: values.natureza,
            aceitaMovimento: values.aceitaMovimento,
            exigeCentroCusto: values.exigeCentroCusto,
            exigeEntidade: values.exigeEntidade,
            activa: values.activa,
          } satisfies ContaContabilCriarInput)
        : await contabilidadeApi.atualizarConta(selecionada!.id, {
            designacao: values.designacao.trim(),
            contaPaiId: values.contaPaiId || undefined,
            tipo: values.tipo,
            natureza: values.natureza,
            aceitaMovimento: values.aceitaMovimento,
            exigeCentroCusto: values.exigeCentroCusto,
            exigeEntidade: values.exigeEntidade,
            activa: values.activa,
          } satisfies ContaContabilAtualizarInput);

    setIsSaving(false);

    if (!res.success) {
      toast.error('Não foi possível guardar a conta', { description: res.error.message });
      return;
    }

    toast.success(modo === 'criar' ? 'Conta criada.' : 'Conta actualizada.');
    await carregar();
    setSelecionada(res.data);
    setModo('editar');
    methods.reset({
      codigo: res.data.codigo,
      designacao: res.data.designacao,
      contaPaiId: res.data.contaPaiId ?? '',
      tipo: res.data.tipo,
      natureza: res.data.natureza,
      aceitaMovimento: res.data.aceitaMovimento,
      exigeCentroCusto: res.data.exigeCentroCusto,
      exigeEntidade: res.data.exigeEntidade,
      activa: res.data.activa,
    });
  };

  const eliminar = async () => {
    if (!selecionada) return;
    if (
      !confirm(
        `Eliminar a conta ${selecionada.codigo} — ${selecionada.designacao}? Esta acção não pode ser desfeita.`
      )
    ) {
      return;
    }
    const res = await contabilidadeApi.removerConta(selecionada.id);
    if (!res.success) {
      toast.error('Não foi possível eliminar a conta', { description: res.error.message });
      return;
    }
    toast.success('Conta eliminada.');
    setSelecionada(null);
    setModo('vazio');
    await carregar();
  };

  const semear = async () => {
    if (!empresaId) return;
    if (
      !confirm(
        'Semear o plano de contas PGC Angola, os diários padrão e os mapeamentos? Só são criadas as contas que faltam.'
      )
    ) {
      return;
    }
    setIsSaving(true);
    const res = await contabilidadeApi.semear();
    setIsSaving(false);
    if (!res.success) {
      toast.error('Não foi possível semear a contabilidade', { description: res.error.message });
      return;
    }
    toast.success('Contabilidade semeada', {
      description: `${res.data.contasCriadas} contas, ${res.data.diariosCriados} diários e ${res.data.mapeamentosCriados} mapeamentos criados.`,
    });
    await carregar();
  };

  const toggle = (id: string) => {
    setColapsados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const totalContas = contasPlanificadas.length;

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
      <div className="w-[170px]">
        <SearchSelect
          value={classe}
          onChange={setClasse}
          options={CLASSES}
          placeholder="Todas as classes"
          allowClear
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void carregar()}>
        <RefreshCw className="w-4 h-4" />
        Actualizar
      </Button>
    </div>
  );

  const sidebar = (
    <div className="p-2">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          A carregar…
        </div>
      ) : arvoreFiltrada.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          {totalContas === 0
            ? 'Ainda não existe plano de contas. Semeie o PGC Angola para começar.'
            : 'Nenhuma conta corresponde aos filtros.'}
        </div>
      ) : (
        arvoreFiltrada.map((no) => (
          <ContaTreeNode
            key={no.id}
            no={no}
            profundidade={0}
            selecionadaId={selecionada?.id}
            colapsados={colapsados}
            onToggle={toggle}
            onSelect={abrirEditar}
          />
        ))
      )}
    </div>
  );

  return (
    <WorkspaceFrame
      title="Plano de contas"
      description="Estrutura PGC Angola por classes. As contas a verde são folhas e podem receber lançamentos; as restantes agregam."
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => void semear()} disabled={isSaving || !empresaId}>
            <Database className="w-4 h-4" />
            Semear PGC
          </Button>
          <Button type="button" size="sm" onClick={abrirCriar} disabled={!empresaId}>
            <Plus className="w-4 h-4" />
            Nova conta
          </Button>
        </>
      }
      toolbar={toolbar}
      sidebar={sidebar}
    >
      {!empresaId ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Selecione uma empresa para configurar a contabilidade.
        </div>
      ) : modo === 'vazio' ? (
        <div className="h-full grid place-items-center p-8">
          <div className="max-w-md text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary grid place-items-center">
              <FolderTree className="w-6 h-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Escolha uma conta</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Clique numa conta da árvore para ver e editar os seus dados. Se o plano estiver vazio,
              semeie o PGC Angola para criar as classes 1–8 e os diários padrão.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => void semear()} disabled={isSaving}>
                <Database className="w-4 h-4" />
                Semear PGC
              </Button>
              <Button type="button" onClick={abrirCriar}>
                <Plus className="w-4 h-4" />
                Nova conta
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <FormSurface
          title={
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs text-muted-foreground">
                {modo === 'criar' ? 'NOVA CONTA' : selecionada?.codigo}
              </span>
              {modo === 'editar' && selecionada && (
                <StatusBadge tone={selecionada.activa ? 'success' : 'neutral'}>
                  {selecionada.activa ? 'Activa' : 'Inactiva'}
                </StatusBadge>
              )}
              {modo === 'editar' && selecionada && selecionada._count?.filhas ? (
                <StatusBadge tone="info">
                  {selecionada._count.filhas} filha{selecionada._count.filhas === 1 ? '' : 's'}
                </StatusBadge>
              ) : null}
            </div>
          }
          headerActions={modo === 'editar' ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={abrirCriar}>
                <Plus className="w-4 h-4" />
                Nova
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => void eliminar()}>
                <Trash2 className="w-4 h-4" />
                Eliminar
              </Button>
            </div>
          ) : undefined}
        >
          <FormShell
            methods={methods}
            onSubmit={submeter}
            submitLabel={isSaving ? 'A guardar…' : modo === 'criar' ? 'Criar conta' : 'Guardar'}
            onCancel={() => {
              if (modo === 'criar') {
                setModo('vazio');
                methods.reset();
              } else if (selecionada) {
                abrirEditar(selecionada);
              }
            }}
            flush
            compact
            dialogLayout
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modo === 'criar' ? (
                <TextField
                  name="codigo"
                  label="Código"
                  required
                  placeholder="Ex.: 3111"
                />
              ) : (
                <FieldWrap label="Código" name="codigo" required>
                  <input
                    value={selecionada?.codigo ?? ''}
                    disabled
                    className="w-full h-8 px-3 rounded-md border border-input bg-muted text-sm font-mono text-muted-foreground"
                  />
                </FieldWrap>
              )}

              <TextField
                name="designacao"
                label="Designação"
                required
                placeholder="Ex.: Clientes conta corrente"
              />

              <SelectField
                name="contaPaiId"
                label="Conta pai"
                options={[
                  { value: '', label: 'Automático (derivar do código)' },
                  ...opcoesPai,
                ]}
                placeholder="Automático pelo prefixo do código"
              />

              <SelectField name="tipo" label="Tipo" required options={TIPOS} />

              <SelectField
                name="natureza"
                label="Natureza"
                required
                options={NATUREZAS}
              />

              <div className="flex flex-col gap-1 pt-2">
                <CheckboxField
                  name="aceitaMovimento"
                  label="Aceita movimento"
                  description={
                    tipoAtual === 'resultado'
                      ? 'Contas de resultados podem receber lançamentos de fecho.'
                      : 'Só contas folha podem ser usadas em lançamentos.'
                  }
                />
              </div>

              <CheckboxField
                name="exigeCentroCusto"
                label="Exige centro de custo"
                description="Obrigatório em contas analíticas de custo e proveito."
              />

              <CheckboxField
                name="exigeEntidade"
                label="Exige entidade"
                description="Obrigatório em clientes, fornecedores e pessoal."
              />

              <CheckboxField
                name="activa"
                label="Conta activa"
                description="Contas inactivas não aparecem nos selects de lançamento."
              />

              <div className="col-span-full rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Pencil className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  O código é imutável depois de criado: mudá-lo partiria mapeamentos, extractos e
                  histórico. Para outro código, crie uma conta nova e desactive a antiga. Ao criar a
                  primeira filha, o pai deixa automaticamente de aceitar movimento.
                </span>
              </div>
            </div>
          </FormShell>
        </FormSurface>
      )}
    </WorkspaceFrame>
  );
}
