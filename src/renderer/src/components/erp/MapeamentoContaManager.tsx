/**
 * @file MapeamentoContaManager.tsx
 * @description Liga as chaves simbólicas usadas pelas regras a contas do PGC.
 *
 * As regras nunca guardam um `contaId`: guardam uma chave (por exemplo
 * `VAT_OUTPUT`) que é resolvida aqui para a conta da empresa. Sem mapeamento,
 * o motor regista um erro de integração e deixa o documento seguir.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link2, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormDialog } from './FormDialog';
import { SearchSelect } from '@/components/ui/SearchSelect';
import type {
  ContaContabilDto,
  MapeamentoContaDto,
  MapeamentoContaGuardarInput,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { FormShell } from './FormPrimitives';
import { StatusBadge } from './Primitives';

/** Espelho local de `CHAVES_CONTA` (src/main/constants/contabilidade.constants.ts). */
const CHAVES_CONTA: { value: string; label: string }[] = [
  { value: 'VAT_OUTPUT', label: 'VAT_OUTPUT — IVA liquidado' },
  { value: 'VAT_INPUT', label: 'VAT_INPUT — IVA dedutível' },
  { value: 'VAT_PAYABLE', label: 'VAT_PAYABLE — IVA a pagar' },
  { value: 'VAT_RECOVERABLE', label: 'VAT_RECOVERABLE — IVA a recuperar' },
  { value: 'CUSTOMER_ACCOUNT', label: 'CUSTOMER_ACCOUNT — Clientes' },
  { value: 'SUPPLIER_ACCOUNT', label: 'SUPPLIER_ACCOUNT — Fornecedores' },
  { value: 'SALES_ACCOUNT', label: 'SALES_ACCOUNT — Vendas' },
  { value: 'PURCHASE_ACCOUNT', label: 'PURCHASE_ACCOUNT — Compras' },
  { value: 'BANK_ACCOUNT', label: 'BANK_ACCOUNT — Banco' },
  { value: 'CASH_ACCOUNT', label: 'CASH_ACCOUNT — Caixa' },
  { value: 'RESULT_OPERATING', label: 'RESULT_OPERATING — Resultado operacional' },
  { value: 'RESULT_FINANCIAL', label: 'RESULT_FINANCIAL — Resultado financeiro' },
  { value: 'RESULT_NON_OPERATING', label: 'RESULT_NON_OPERATING — Resultado não corrente' },
  { value: 'RESULT_TAX', label: 'RESULT_TAX — Imposto sobre o resultado' },
  { value: 'RESULT_NET', label: 'RESULT_NET — Resultado líquido' },
  { value: 'RETAINED_EARNINGS', label: 'RETAINED_EARNINGS — Resultados transitados' },
  { value: 'PAYROLL_EXPENSE', label: 'PAYROLL_EXPENSE — Custo com pessoal' },
  { value: 'PAYROLL_PAYABLE', label: 'PAYROLL_PAYABLE — Salários a pagar' },
  { value: 'SOCIAL_SECURITY_PAYABLE', label: 'SOCIAL_SECURITY_PAYABLE — Segurança social' },
  { value: 'WITHHOLDING_PAYABLE', label: 'WITHHOLDING_PAYABLE — Retenções na fonte' },
];

const mapeamentoSchema = z.object({
  chave: z.string().min(1, 'Escolha a chave da conta.'),
  contaId: z.string().min(1, 'Escolha a conta contabilística.'),
});

type MapeamentoFormValues = z.infer<typeof mapeamentoSchema>;

function achatarContas(nos: ContaContabilDto[]): ContaContabilDto[] {
  return nos.flatMap((no) => [no, ...achatarContas(no.filhas ?? [])]);
}

export function MapeamentoContaManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [mapeamentos, setMapeamentos] = useState<MapeamentoContaDto[]>([]);
  const [contas, setContas] = useState<ContaContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<MapeamentoContaDto | null>(null);

  const methods = useForm<MapeamentoFormValues>({
    resolver: zodResolver(mapeamentoSchema),
    defaultValues: { chave: '', contaId: '' },
  });

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setMapeamentos([]);
      setContas([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [mapeamentosRes, contasRes] = await Promise.all([
      contabilidadeApi.listarMapeamentos({ empresaId }),
      contabilidadeApi.arvoreContas(empresaId),
    ]);
    if (mapeamentosRes.success) setMapeamentos(mapeamentosRes.data.items);
    else toast.error('Não foi possível carregar os mapeamentos', { description: mapeamentosRes.error.message });
    if (contasRes.success) setContas(achatarContas(contasRes.data));
    else toast.error('Não foi possível carregar o plano de contas', { description: contasRes.error.message });
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porChave = useMemo(
    () => new Map(mapeamentos.map((mapeamento) => [mapeamento.chave, mapeamento])),
    [mapeamentos]
  );

  const opcoesConta = useMemo(
    () =>
      contas
        .filter((conta) => conta.activa && conta.aceitaMovimento)
        .map((conta) => ({
          value: conta.id,
          label: `${conta.codigo} — ${conta.designacao}`,
        })),
    [contas]
  );

  // Em criação, uma chave já mapeada não pode ser escolhida: a API faz upsert
  // e um duplo clique poderia alterar silenciosamente o mapeamento existente.
  const opcoesChave = useMemo(
    () => (editando ? CHAVES_CONTA : CHAVES_CONTA.filter((chave) => !porChave.has(chave.value))),
    [editando, porChave]
  );

  const chavesFiltradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return CHAVES_CONTA.filter((chave) => {
      if (!termo) return true;
      const conta = porChave.get(chave.value)?.conta;
      return (
        chave.value.toLowerCase().includes(termo) ||
        chave.label.toLowerCase().includes(termo) ||
        (conta?.codigo ?? '').toLowerCase().includes(termo) ||
        (conta?.designacao ?? '').toLowerCase().includes(termo)
      );
    });
  }, [search, porChave]);

  const mapeadas = mapeamentos.filter((mapeamento) =>
    CHAVES_CONTA.some((chave) => chave.value === mapeamento.chave)
  ).length;

  const abrirCriar = () => {
    const primeiraLivre = CHAVES_CONTA.find((chave) => !porChave.has(chave.value)) ?? CHAVES_CONTA[0];
    setEditando(null);
    methods.reset({ chave: primeiraLivre.value, contaId: '' });
    setModalAberto(true);
  };

  const abrirEditar = (mapeamento: MapeamentoContaDto) => {
    setEditando(mapeamento);
    methods.reset({ chave: mapeamento.chave, contaId: mapeamento.contaId });
    setModalAberto(true);
  };

  const abrirMapearChave = (chave: string) => {
    const existente = porChave.get(chave);
    if (existente) {
      abrirEditar(existente);
      return;
    }
    setEditando(null);
    methods.reset({ chave, contaId: '' });
    setModalAberto(true);
  };

  const submeter = async (values: MapeamentoFormValues) => {
    if (!empresaId) return;
    const jaMapeada = !editando && porChave.has(values.chave);
    if (jaMapeada) {
      toast.error('Esta chave já está mapeada', {
        description: 'Edite o mapeamento existente em vez de criar outro.',
      });
      return;
    }
    const atualizacao = Boolean(editando) || porChave.has(values.chave);
    setIsSaving(true);
    try {
      const res = await contabilidadeApi.guardarMapeamento({
        empresaId,
        chave: values.chave,
        contaId: values.contaId,
      } satisfies MapeamentoContaGuardarInput);

      if (!res.success) {
        toast.error('Não foi possível guardar o mapeamento', { description: res.error.message });
        return;
      }
      toast.success(atualizacao ? 'Mapeamento actualizado.' : 'Mapeamento criado.');
      setModalAberto(false);
      await carregar();
    } finally {
      setIsSaving(false);
    }
  };

  const eliminar = async (mapeamento: MapeamentoContaDto) => {
    if (!confirm(`Remover o mapeamento ${mapeamento.chave}?`)) return;
    const res = await contabilidadeApi.removerMapeamento(mapeamento.id);
    if (!res.success) {
      toast.error('Não foi possível remover o mapeamento', { description: res.error.message });
      return;
    }
    toast.success('Mapeamento removido.');
    await carregar();
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por chave ou conta…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
      title="Mapeamento de contas"
      description="As chaves usadas pelas regras são resolvidas para contas do plano da empresa. Só contas folha, activas e que aceitem movimento podem ser mapeadas."
      actions={
        <Button type="button" size="sm" onClick={abrirCriar} disabled={!empresaId || contas.length === 0}>
          <Plus className="w-4 h-4" />
          Novo mapeamento
        </Button>
      }
      toolbar={toolbar}
    >
      {!empresaId ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Selecione uma empresa para configurar os mapeamentos.
        </div>
      ) : (
        <>
          <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="w-4 h-4 text-muted-foreground" />
              {mapeadas} de {CHAVES_CONTA.length} chaves mapeadas
            </div>
            <span className="text-xs text-muted-foreground">Semear o PGC cria os mapeamentos padrão</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-64">Chave</th>
                <th className="text-left font-medium px-4 py-2">Conta contabilística</th>
                <th className="text-left font-medium px-4 py-2 w-28">Estado</th>
                <th className="text-right font-medium px-4 py-2 w-36">Acções</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
                    </span>
                  </td>
                </tr>
              ) : chavesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma chave corresponde à pesquisa.
                  </td>
                </tr>
              ) : (
                chavesFiltradas.map((chave) => {
                  const mapeamento = porChave.get(chave.value);
                  const conta = mapeamento?.conta;
                  return (
                    <tr key={chave.value} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs font-semibold">{chave.value}</td>
                      <td className="px-4 py-2">
                        {conta ? (
                          <span>
                            <span className="font-mono text-xs text-muted-foreground mr-2">
                              {conta.codigo}
                            </span>
                            {conta.designacao}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Por mapear — {chave.label.split(' — ')[1] ?? chave.value}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge tone={mapeamento ? 'success' : 'warning'}>
                          {mapeamento ? 'Mapeado' : 'Pendente'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              mapeamento
                                ? abrirEditar(mapeamento)
                                : abrirMapearChave(chave.value)
                            }
                          >
                            {mapeamento ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            {mapeamento ? 'Editar' : 'Mapear'}
                          </Button>
                          {mapeamento && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Remover"
                              onClick={() => void eliminar(mapeamento)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </>
      )}

      <FormDialog
        open={modalAberto}
        onOpenChange={setModalAberto}
        title={editando ? 'Editar mapeamento' : 'Novo mapeamento'}
        description="Escolha a chave simbólica e a conta que o motor deve usar nas regras de contabilização."
      >
            <FormShell
              methods={methods}
              onSubmit={submeter}
              submitLabel={isSaving ? 'A guardar…' : editando ? 'Guardar' : 'Mapear'}
              onCancel={() => setModalAberto(false)}
              flush
              compact
              dialogLayout
            >
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Chave da conta <span className="text-destructive">*</span>
                  </label>
                  <SearchSelect
                    value={methods.watch('chave')}
                    onChange={(valor) =>
                      methods.setValue('chave', valor, { shouldDirty: true, shouldValidate: true })
                    }
                    options={opcoesChave}
                    placeholder="Escolher chave…"
                    required
                    disabled={Boolean(editando)}
                    hasError={Boolean(methods.formState.errors.chave)}
                  />
                  {methods.formState.errors.chave?.message && (
                    <p className="text-[11px] text-destructive mt-1">
                      {methods.formState.errors.chave.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Conta contabilística <span className="text-destructive">*</span>
                  </label>
                  <SearchSelect
                    portal
                    value={methods.watch('contaId')}
                    onChange={(valor) =>
                      methods.setValue('contaId', valor, { shouldDirty: true, shouldValidate: true })
                    }
                    options={opcoesConta}
                    placeholder="Escolher conta…"
                    required
                    hasError={Boolean(methods.formState.errors.contaId)}
                  />
                  {methods.formState.errors.contaId?.message && (
                    <p className="text-[11px] text-destructive mt-1">
                      {methods.formState.errors.contaId.message}
                    </p>
                  )}
                </div>
              </div>
            </FormShell>
      </FormDialog>
    </WorkspaceFrame>
  );
}
