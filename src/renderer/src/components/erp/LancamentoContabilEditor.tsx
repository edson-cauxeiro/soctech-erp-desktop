import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { contabilidadeApi } from '@/api/contabilidade.api';
import type { ContaContabilDto, DiarioContabilDto, LancamentoContabilDto } from '@/@types/electron';
import { useLancamentoDraft, type LancamentoDraftValues } from '@/hooks/useLancamentoDraft';
import { FormDialog } from './FormDialog';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { LinhasEditor } from './LinhasEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  lancamento?: LancamentoContabilDto | null;
  onSaved?: () => void;
}

function flattenContas(contas: ContaContabilDto[]): ContaContabilDto[] {
  const out: ContaContabilDto[] = [];
  const walk = (items: ContaContabilDto[]) => {
    for (const c of items) {
      out.push(c);
      if (c.filhas?.length) walk(c.filhas);
    }
  };
  walk(contas);
  return out;
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function criarValoresVazios(empresaId: string): LancamentoDraftValues {
  return {
    empresaId,
    diarioId: '',
    dataContabilistica: new Date().toISOString().slice(0, 10),
    dataDocumento: '',
    descricao: '',
    linhas: [],
  };
}

export function LancamentoContabilEditor({ open, onOpenChange, empresaId, lancamento, onSaved }: Props) {
  const isEdit = Boolean(lancamento?.id);
  const [diarios, setDiarios] = useState<DiarioContabilDto[]>([]);
  const [contas, setContas] = useState<ContaContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [lancamentoAtual, setLancamentoAtual] = useState<LancamentoContabilDto | null>(null);
  const [detalheCarregado, setDetalheCarregado] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const { form, fields, append, remove, totais, toPayload } = useLancamentoDraft({
    empresaId,
    diarioId: lancamento?.diarioId ?? '',
    dataContabilistica: lancamento?.dataContabilistica
      ? new Date(lancamento.dataContabilistica).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    dataDocumento: lancamento?.dataDocumento ? new Date(lancamento.dataDocumento).toISOString().slice(0, 10) : '',
    descricao: lancamento?.descricao ?? '',
  });

  const { register, setValue, watch, reset, handleSubmit, formState } = form;
  const diarioId = watch('diarioId');
  const bloqueado = lancamentoAtual?.estado && lancamentoAtual.estado !== 'rascunho';

  /** Limpa por completo qualquer valor de um lançamento aberto anteriormente. */
  const limparEditor = useCallback(() => {
    setLancamentoAtual(null);
    setDetalheCarregado(false);
    reset(criarValoresVazios(empresaId));
  }, [empresaId, reset]);

  useEffect(() => {
    if (!open) {
      setDetalheCarregado(false);
      setErroCarregamento(null);
      return;
    }
    let cancelled = false;
    setErroCarregamento(null);
    limparEditor();

    (async () => {
      setIsLoading(true);
      try {
        const [dRes, cRes] = await Promise.all([
          contabilidadeApi.listarDiarios({ empresaId }),
          contabilidadeApi.arvoreContas(empresaId),
        ]);
        if (cancelled) return;
        if (dRes.success) setDiarios(dRes.data.items ?? []);
        else toast.error(dRes.error.message ?? 'Falha ao carregar diários.');
        if (cRes.success) setContas(flattenContas(cRes.data ?? []));
        else toast.error(cRes.error.message ?? 'Falha ao carregar contas.');

        if (lancamento?.id) {
          const det = await contabilidadeApi.obterLancamento(lancamento.id);
          if (cancelled) return;
          if (!det.success || !det.data) {
            const mensagem = det.success ? 'Falha ao carregar o lançamento selecionado.' : det.error.message;
            setErroCarregamento(mensagem);
            toast.error(mensagem);
            limparEditor();
            return;
          }
          setLancamentoAtual(det.data);
          reset({
            empresaId,
            diarioId: det.data.diarioId,
            dataContabilistica: det.data.dataContabilistica ? new Date(det.data.dataContabilistica).toISOString().slice(0, 10) : '',
            dataDocumento: det.data.dataDocumento ? new Date(det.data.dataDocumento).toISOString().slice(0, 10) : '',
            descricao: det.data.descricao ?? '',
            linhas:
              det.data.linhas?.map((l) => ({
                contaId: l.contaId,
                debito: l.debito ?? '0',
                credito: l.credito ?? '0',
                descricao: l.descricao ?? '',
                centroCustoId: l.centroCustoId ?? '',
                entidadeTipo: l.entidadeTipo ?? null,
                entidadeId: l.entidadeId ?? '',
                codigoImposto: l.codigoImposto ?? '',
                baseImposto: l.baseImposto ?? '',
                dataVencimento: l.dataVencimento ? new Date(l.dataVencimento).toISOString().slice(0, 10) : '',
              })) ?? [],
          });
          setDetalheCarregado(true);
        } else {
          limparEditor();
          setDetalheCarregado(true);
        }
      } catch (error) {
        if (cancelled) return;
        const mensagem = error instanceof Error ? error.message : 'Falha ao carregar o lançamento.';
        setErroCarregamento(mensagem);
        toast.error(mensagem);
        limparEditor();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, empresaId, lancamento?.id, reset, limparEditor]);

  const diarioOptions = useMemo(
    () => diarios.filter((d) => d.activo).map((d) => ({ value: d.id, label: `${d.codigo} — ${d.designacao}` })),
    [diarios]
  );

  async function guardar(values: LancamentoDraftValues, validarDepois = false) {
    // Nunca gravar com valores de um registo anterior ou com o detalhe por carregar.
    if (!detalheCarregado || (lancamento?.id && lancamentoAtual?.id !== lancamento.id)) {
      toast.error('O lançamento selecionado ainda não foi carregado. Feche e tente novamente.');
      return;
    }
    const payload = toPayload(values);
    const saving = validarDepois ? setIsValidating : setIsSaving;
    saving(true);
    try {
      let id = lancamentoAtual?.id;
      if (id) {
        const res = await contabilidadeApi.atualizarLancamento(id, {
          diarioId: payload.diarioId,
          dataContabilistica: payload.dataContabilistica,
          dataDocumento: payload.dataDocumento,
          descricao: payload.descricao,
          linhas: payload.linhas,
        });
        if (!res.success || !res.data) {
          toast.error(res.success ? 'Falha ao guardar rascunho.' : res.error.message);
          return;
        }
        setLancamentoAtual(res.data);
      } else {
        const res = await contabilidadeApi.criarLancamento(payload);
        if (!res.success || !res.data) {
          toast.error(res.success ? 'Falha ao criar rascunho.' : res.error.message);
          return;
        }
        id = res.data.id;
        setLancamentoAtual(res.data);
      }

      if (validarDepois && id) {
        const vRes = await contabilidadeApi.validarLancamento(id);
        if (!vRes.success) {
          toast.error(vRes.error.message ?? 'Rascunho guardado, mas a validação falhou.');
          onSaved?.();
          return;
        }
        toast.success(`Lançamento validado${vRes.data?.numero ? ` (#${vRes.data.numero})` : ''}.`);
        onSaved?.();
        onOpenChange(false);
        return;
      }

      toast.success('Rascunho guardado.');
      onSaved?.();
      // Um novo rascunho fica aberto para continuar a edição.
    } finally {
      saving(false);
    }
  }

  const onGuardarRascunho = handleSubmit((values) => guardar(values, false));
  const onValidar = handleSubmit((values) => guardar(values, true));

  const inputCls =
    'w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';

  const botoesBloqueados =
    Boolean(bloqueado) || isSaving || isValidating || isLoading || !detalheCarregado || fields.length < 2;

  const rodape = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Débito: <strong className="font-mono tabular-nums">{formatMoney(totais.debito)}</strong></span>
          <span>Crédito: <strong className="font-mono tabular-nums">{formatMoney(totais.credito)}</strong></span>
          <span className={totais.equilibrado ? 'text-success' : 'text-warning'}>
            Diferença: <strong className="font-mono tabular-nums">{formatMoney(totais.diferenca)}</strong>
          </span>
          {lancamentoAtual?.numero != null && <span className="text-muted-foreground">N.º {lancamentoAtual.numero}</span>}
          {lancamentoAtual?.estado && <span className="text-muted-foreground">Estado: {lancamentoAtual.estado}</span>}
        </div>
        {detalheCarregado && !totais.equilibrado && (
          <p className="text-xs text-warning">
            Total a débito e total a crédito não coincidem (diferença de {formatMoney(Math.abs(totais.diferenca))}). A validação exige um lançamento equilibrado.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        <Button type="button" variant="outline" onClick={onGuardarRascunho} disabled={botoesBloqueados}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar rascunho
        </Button>
        <Button type="button" onClick={onValidar} disabled={botoesBloqueados || !totais.equilibrado}>
          {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Validar
        </Button>
      </div>
    </div>
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Editar lançamento contabilístico' : 'Novo lançamento contabilístico'}
      description={bloqueado
        ? 'Este lançamento já não está em rascunho e não pode ser alterado.'
        : 'Guarde como rascunho ou valide para contabilizar. O total a débito tem de igualar o total a crédito.'}
      bodyClassName="space-y-4"
      footer={rodape}
    >
        <div className="space-y-4">
          {erroCarregamento && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Não foi possível carregar o lançamento selecionado: {erroCarregamento}. O formulário foi limpo — feche e tente novamente.
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> A carregar...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Diário</label>
                  <SearchSelect
                    value={diarioId}
                    onChange={(v) => setValue('diarioId', v, { shouldDirty: true, shouldValidate: true })}
                    options={diarioOptions}
                    placeholder="Escolher diário"
                    disabled={Boolean(bloqueado)}
                    hasError={Boolean(formState.errors.diarioId)}
                  />
                  {formState.errors.diarioId && <p className="text-xs text-destructive mt-1">{formState.errors.diarioId.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data contabilística</label>
                  <input type="date" className={inputCls} disabled={Boolean(bloqueado)} {...register('dataContabilistica')} />
                  {formState.errors.dataContabilistica && <p className="text-xs text-destructive mt-1">{formState.errors.dataContabilistica.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data documento</label>
                  <input type="date" className={inputCls} disabled={Boolean(bloqueado)} {...register('dataDocumento')} />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Descrição</label>
                  <input className={inputCls} placeholder="Descrição do lançamento" disabled={Boolean(bloqueado)} {...register('descricao')} />
                  {formState.errors.descricao && <p className="text-xs text-destructive mt-1">{formState.errors.descricao.message}</p>}
                </div>
              </div>

              <LinhasEditor form={form} fields={fields} append={append} remove={remove} contas={contas} disabled={Boolean(bloqueado)} />
            </>
          )}
        </div>

    </FormDialog>
  );
}
