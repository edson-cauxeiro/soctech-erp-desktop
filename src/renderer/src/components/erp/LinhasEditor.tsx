import { Plus, Trash2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import type { LancamentoDraftValues, LinhaDraftValues } from '@/hooks/useLancamentoDraft';

interface ContaOpcao {
  id: string;
  codigo: string;
  designacao: string;
  aceitaMovimento: boolean;
  activa: boolean;
}

interface LinhasEditorProps {
  form: UseFormReturn<LancamentoDraftValues>;
  fields: { id: string }[];
  append: (linha?: Partial<LinhaDraftValues>) => void;
  remove: (index: number) => void;
  contas: ContaOpcao[];
  disabled?: boolean;
}

const inputCls =
  'w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';

function normalizarNumero(valor: string): string {
  const v = (valor || '').replace(',', '.').replace(/[^0-9.]/g, '');
  if (v === '') return '0';
  const parts = v.split('.');
  if (parts.length <= 1) return v;
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 4)}`;
}

export function LinhasEditor({ form, fields, append, remove, contas, disabled }: LinhasEditorProps) {
  const { register, setValue, watch, formState } = form;
  const linhas = watch('linhas');

  const opcoesConta = contas
    .filter((c) => c.activa && c.aceitaMovimento)
    .map((c) => ({
      value: c.id,
      label: `${c.codigo} — ${c.designacao}`,
    }));

  // O erro de array pode chegar em `errors.linhas.message` (submit) ou em
  // `errors.linhas.root.message` (revalidação da field array). Tratar os dois.
  const erroLinhas = formState.errors.linhas;
  const erroGeral =
    erroLinhas && !Array.isArray(erroLinhas)
      ? erroLinhas.root?.message ?? erroLinhas.message
      : undefined;

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Linhas</h3>
          <p className="text-xs text-muted-foreground">Cada linha tem débito ou crédito (nunca ambos).</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => append()} disabled={disabled}>
          <Plus className="w-4 h-4" />
          Adicionar linha
        </Button>
      </div>

      {erroGeral && <p className="text-xs text-destructive">{erroGeral}</p>}

      <div className="border border-border rounded-md overflow-auto min-h-0">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-[320px]">Conta</th>
              <th className="px-3 py-2 text-left font-medium">Descrição</th>
              <th className="px-3 py-2 text-right font-medium w-[140px]">Débito</th>
              <th className="px-3 py-2 text-right font-medium w-[140px]">Crédito</th>
              <th className="px-3 py-2 w-[48px]" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const erros = (formState.errors.linhas?.[index] ?? {}) as Record<string, { message?: string } | undefined>;
              const contaId = linhas?.[index]?.contaId ?? '';
              return (
                <tr key={field.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <SearchSelect
                      portal
                      value={contaId}
                      onChange={(v) => setValue(`linhas.${index}.contaId`, v, { shouldDirty: true, shouldValidate: true })}
                      options={opcoesConta}
                      placeholder="Escolher conta..."
                      disabled={disabled}
                      hasError={Boolean(erros.contaId)}
                    />
                    {erros.contaId?.message && <p className="text-xs text-destructive mt-1">{erros.contaId.message}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      placeholder="Descrição da linha"
                      disabled={disabled}
                      {...register(`linhas.${index}.descricao`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={`${inputCls} text-right font-mono tabular-nums`}
                      inputMode="decimal"
                      disabled={disabled}
                      {...register(`linhas.${index}.debito`)}
                      onChange={(e) =>
                        setValue(`linhas.${index}.debito`, normalizarNumero(e.target.value), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      onFocus={() => {
                        if ((linhas?.[index]?.debito ?? '0') === '0') setValue(`linhas.${index}.debito`, '');
                      }}
                      onBlur={(e) => {
                        if (e.target.value.trim() === '') setValue(`linhas.${index}.debito`, '0', { shouldValidate: true });
                      }}
                    />
                    {erros.debito?.message && <p className="text-xs text-destructive mt-1 text-left">{erros.debito.message}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={`${inputCls} text-right font-mono tabular-nums`}
                      inputMode="decimal"
                      disabled={disabled}
                      {...register(`linhas.${index}.credito`)}
                      onChange={(e) =>
                        setValue(`linhas.${index}.credito`, normalizarNumero(e.target.value), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      onFocus={() => {
                        if ((linhas?.[index]?.credito ?? '0') === '0') setValue(`linhas.${index}.credito`, '');
                      }}
                      onBlur={(e) => {
                        if (e.target.value.trim() === '') setValue(`linhas.${index}.credito`, '0', { shouldValidate: true });
                      }}
                    />
                    {erros.credito?.message && <p className="text-xs text-destructive mt-1 text-left">{erros.credito.message}</p>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={disabled || fields.length <= 2}
                      title="Remover linha"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
