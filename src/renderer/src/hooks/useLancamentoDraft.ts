import { useMemo } from 'react';
import { useForm, useFieldArray, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const valorRe = /^\d+(\.\d{1,4})?$/;
const ESCALA = 10000;

/** Comparação em inteiros escalados: evita `0.1 + 0.2 !== 0.3` no pré-visualizador. */
function paraEscalado(valor: string | null | undefined): number {
  const numero = Number(valor || '0');
  return Number.isFinite(numero) ? Math.round(numero * ESCALA) : 0;
}

const valorMonetario = z
  .string()
  .trim()
  .min(1, 'Obrigatório')
  .refine((v) => valorRe.test(v), 'Use dígitos não negativos, até 4 casas decimais');

const linhaSchema = z
  .object({
    contaId: z.string().trim().min(1, 'Conta obrigatória'),
    debito: valorMonetario,
    credito: valorMonetario,
    descricao: z.string().optional().nullable(),
    centroCustoId: z.string().optional().nullable(),
    entidadeTipo: z.enum(['cliente', 'fornecedor', 'funcionario', 'outro']).optional().nullable(),
    entidadeId: z.string().optional().nullable(),
    codigoImposto: z.string().optional().nullable(),
    baseImposto: z.string().optional().nullable(),
    dataVencimento: z.string().optional().nullable(),
  })
  .superRefine((linha, ctx) => {
    const debito = Number(linha.debito || '0');
    const credito = Number(linha.credito || '0');
    if (debito > 0 && credito > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Débito e crédito são mutuamente exclusivos', path: ['credito'] });
    }
    if (debito === 0 && credito === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe débito ou crédito', path: ['debito'] });
    }
    if (linha.baseImposto && linha.baseImposto.trim() !== '' && !valorRe.test(linha.baseImposto.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Base inválida', path: ['baseImposto'] });
    }
  });

export const lancamentoDraftSchema = z
  .object({
    empresaId: z.string().trim().min(1, 'Empresa obrigatória'),
    diarioId: z.string().trim().min(1, 'Diário obrigatório'),
    dataContabilistica: z.string().trim().min(1, 'Data contabilística obrigatória'),
    dataDocumento: z.string().optional().nullable(),
    descricao: z.string().trim().min(1, 'Descrição obrigatória'),
    linhas: z.array(linhaSchema).min(2, 'O lançamento deve ter pelo menos duas linhas'),
  })
  .superRefine((draft, ctx) => {
    let debito = 0;
    let credito = 0;
    for (const linha of draft.linhas) {
      debito += paraEscalado(linha.debito);
      credito += paraEscalado(linha.credito);
    }
    if (debito !== credito) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O lançamento está desequilibrado: o total a débito deve ser igual ao total a crédito.',
        path: ['linhas'],
      });
    }
  });

export type LancamentoDraftValues = z.infer<typeof lancamentoDraftSchema>;
export type LinhaDraftValues = LancamentoDraftValues['linhas'][number];

export interface UseLancamentoDraftResult {
  form: UseFormReturn<LancamentoDraftValues>;
  fields: ReturnType<typeof useFieldArray<LancamentoDraftValues, 'linhas'>>['fields'];
  append: (linha?: Partial<LinhaDraftValues>) => void;
  remove: (index: number) => void;
  totais: { debito: number; credito: number; diferenca: number; equilibrado: boolean };
  toPayload: (values: LancamentoDraftValues) => {
    empresaId: string;
    diarioId: string;
    dataContabilistica: string;
    dataDocumento?: string | null;
    descricao: string;
    linhas: Array<{
      contaId: string;
      debito: string;
      credito: string;
      descricao?: string | null;
      centroCustoId?: string | null;
      entidadeTipo?: 'cliente' | 'fornecedor' | 'funcionario' | 'outro' | null;
      entidadeId?: string | null;
      codigoImposto?: string | null;
      baseImposto?: string | null;
      dataVencimento?: string | null;
    }>;
  };
}

function linhaVazia(): LinhaDraftValues {
  return {
    contaId: '',
    debito: '0',
    credito: '0',
    descricao: '',
    centroCustoId: '',
    entidadeTipo: null,
    entidadeId: '',
    codigoImposto: '',
    baseImposto: '',
    dataVencimento: '',
  };
}

function normalizarOpcional(valor?: string | null): string | null | undefined {
  if (valor === undefined || valor === null) return undefined;
  const t = String(valor).trim();
  return t === '' ? undefined : t;
}

export function useLancamentoDraft(defaults?: Partial<LancamentoDraftValues>): UseLancamentoDraftResult {
  const form = useForm<LancamentoDraftValues>({
    resolver: zodResolver(lancamentoDraftSchema),
    defaultValues: {
      empresaId: defaults?.empresaId ?? '',
      diarioId: defaults?.diarioId ?? '',
      dataContabilistica: defaults?.dataContabilistica ?? new Date().toISOString().slice(0, 10),
      dataDocumento: defaults?.dataDocumento ?? '',
      descricao: defaults?.descricao ?? '',
      linhas: defaults?.linhas ?? [],
    },
    mode: 'onBlur',
  });

  const { fields, append: appendField, remove: removeField } = useFieldArray({
    control: form.control,
    name: 'linhas',
  });

  const linhas = form.watch('linhas');
  const totais = useMemo(() => {
    let debitoEscalado = 0;
    let creditoEscalado = 0;
    for (const l of linhas ?? []) {
      debitoEscalado += paraEscalado(l.debito);
      creditoEscalado += paraEscalado(l.credito);
    }
    return {
      debito: debitoEscalado / ESCALA,
      credito: creditoEscalado / ESCALA,
      diferenca: (debitoEscalado - creditoEscalado) / ESCALA,
      equilibrado: debitoEscalado > 0 && debitoEscalado === creditoEscalado,
    };
  }, [linhas]);

  const append = (linha?: Partial<LinhaDraftValues>) => appendField({ ...linhaVazia(), ...linha });
  const remove = (index: number) => removeField(index);

  const toPayload = (values: LancamentoDraftValues) => ({
    empresaId: values.empresaId.trim(),
    diarioId: values.diarioId.trim(),
    dataContabilistica: values.dataContabilistica,
    dataDocumento: normalizarOpcional(values.dataDocumento) ?? null,
    descricao: values.descricao.trim(),
    linhas: values.linhas.map((l) => ({
      contaId: l.contaId.trim(),
      debito: (l.debito || '0').trim(),
      credito: (l.credito || '0').trim(),
      descricao: normalizarOpcional(l.descricao),
      centroCustoId: normalizarOpcional(l.centroCustoId),
      entidadeTipo: l.entidadeTipo ?? undefined,
      entidadeId: normalizarOpcional(l.entidadeId),
      codigoImposto: normalizarOpcional(l.codigoImposto),
      baseImposto: normalizarOpcional(l.baseImposto),
      dataVencimento: normalizarOpcional(l.dataVencimento),
    })),
  });

  return { form, fields, append, remove, totais, toPayload };
}
