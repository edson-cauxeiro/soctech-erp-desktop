/**
 * @file RegraContabilizacaoManager.tsx
 * @description Configuração das regras de contabilização automática.
 *
 * Uma regra liga (empresa, módulo, tipo de origem) a um diário e a uma
 * sequência de linhas declarativas: lado, chave de conta (resolvida pelo
 * mapeamento) e expressão de valor. A UI só oferece valores fechados para
 * chaves e expressões — o motor não aceita expressões dinâmicas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormDialog } from './FormDialog';
import { SearchSelect } from '@/components/ui/SearchSelect';
import type {
  DiarioContabilDto,
  LinhaRegraContabilizacaoCriarInput,
  RegraContabilizacaoAtualizarInput,
  RegraContabilizacaoCriarInput,
  RegraContabilizacaoDto,
} from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { CheckboxField, FormShell, SelectField, TextField } from './FormPrimitives';
import { StatusBadge } from './Primitives';

/**
 * Espelho local das chaves declaradas em `src/main/constants/contabilidade.constants.ts`.
 * O renderer não importa ficheiros do main: a lista é fechada e mantida aqui.
 */
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

/** Expressões aceites pelo motor. `TAX:<taxa>` usa a taxa por documento. */
const EXPRESSOES: { value: string; label: string }[] = [
  { value: 'TOTAL', label: 'TOTAL — total bruto' },
  { value: 'NET', label: 'NET — total líquido' },
  { value: 'TAX', label: 'TAX — IVA total' },
  { value: 'TAX:6', label: 'TAX:6 — IVA à taxa 6%' },
  { value: 'TAX:14', label: 'TAX:14 — IVA à taxa 14%' },
  { value: 'TAX:23', label: 'TAX:23 — IVA à taxa 23%' },
  { value: 'BASE', label: 'BASE — base tributável' },
  { value: 'DISCOUNT', label: 'DISCOUNT — descontos' },
  { value: 'PAID', label: 'PAID — valor pago' },
  { value: 'OUTSTANDING', label: 'OUTSTANDING — valor em aberto' },
];

const LADOS: { value: 'debito' | 'credito'; label: string }[] = [
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
];

const EXPRESSAO_REGEX = /^(TOTAL|NET|TAX|BASE|DISCOUNT|PAID|OUTSTANDING|TAX:\d+(\.\d+)?)$/;

const linhaSchema = z.object({
  numeroLinha: z.number().int().min(1, 'A ordem deve começar em 1.'),
  lado: z.enum(['debito', 'credito']),
  chaveConta: z.string().min(1, 'Escolha a chave da conta.'),
  expressaoValor: z.string().regex(EXPRESSAO_REGEX, 'Expressão inválida.'),
  // Campo auxiliar do editor. O motor gera a descrição no lançamento e o
  // modelo não tem coluna para esta nota, pelo que não é enviada ao backend.
  descricao: z.string().optional(),
  taxaImposto: z.string().nullable().optional(),
});

const regraSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, 'O código deve ter pelo menos 2 caracteres.')
    .max(30, 'O código não pode exceder 30 caracteres.'),
  designacao: z
    .string()
    .trim()
    .min(2, 'A designação deve ter pelo menos 2 caracteres.')
    .max(120, 'A designação não pode exceder 120 caracteres.'),
  moduloOrigem: z.string().trim().min(2, 'Indique o módulo de origem.'),
  tipoOrigem: z.string().trim().min(2, 'Indique o tipo de origem.'),
  diarioId: z.string().min(1, 'Escolha o diário.'),
  activa: z.boolean(),
  linhas: z.array(linhaSchema).min(1, 'Adicione pelo menos uma linha.'),
});

type RegraFormValues = z.infer<typeof regraSchema>;

const valoresIniciais: RegraFormValues = {
  codigo: '',
  designacao: '',
  moduloOrigem: 'vendas',
  tipoOrigem: 'fatura',
  diarioId: '',
  activa: true,
  linhas: [
    {
      numeroLinha: 1,
      lado: 'debito',
      chaveConta: 'CUSTOMER_ACCOUNT',
      expressaoValor: 'TOTAL',
      descricao: '',
      taxaImposto: null,
    },
    {
      numeroLinha: 2,
      lado: 'credito',
      chaveConta: 'SALES_ACCOUNT',
      expressaoValor: 'NET',
      descricao: '',
      taxaImposto: null,
    },
  ],
};

/** Estado limpo usado quando a regra selecionada não consegue ser carregada. */
const valoresVazios: RegraFormValues = {
  codigo: '',
  designacao: '',
  moduloOrigem: '',
  tipoOrigem: '',
  diarioId: '',
  activa: true,
  linhas: [],
};

function taxaDaExpressao(expressao: string): string | null {
  const encontrada = /^TAX:([\d.]+)$/.exec(expressao);
  return encontrada ? encontrada[1] : null;
}

export function RegraContabilizacaoManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [regras, setRegras] = useState<RegraContabilizacaoDto[]>([]);
  const [diarios, setDiarios] = useState<DiarioContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRegra, setIsLoadingRegra] = useState(false);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RegraContabilizacaoDto | null>(null);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const carregamentoRef = useRef(0);

  const methods = useForm<RegraFormValues>({
    resolver: zodResolver(regraSchema),
    defaultValues: valoresIniciais,
  });
  const { fields, append, remove, move } = useFieldArray({
    control: methods.control,
    name: 'linhas',
  });
  const linhas = methods.watch('linhas');
  const errosLinhas = methods.formState.errors.linhas;

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setRegras([]);
      setDiarios([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    // O backend de `listar` não devolve as linhas: estas são carregadas por
    // `obter` quando o utilizador abre uma regra para edição.
    const [regrasRes, diariosRes] = await Promise.all([
      contabilidadeApi.listarRegras({ empresaId }),
      contabilidadeApi.listarDiarios({ empresaId }),
    ]);
    if (regrasRes.success) setRegras(regrasRes.data);
    else toast.error('Não foi possível carregar as regras', { description: regrasRes.error.message });
    if (diariosRes.success) setDiarios(diariosRes.data.items);
    else toast.error('Não foi possível carregar os diários', { description: diariosRes.error.message });
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const regrasFiltradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return regras.filter((regra) => {
      if (estadoFiltro === 'activa' && !regra.activa) return false;
      if (estadoFiltro === 'inactiva' && regra.activa) return false;
      if (!termo) return true;
      return (
        regra.codigo.toLowerCase().includes(termo) ||
        regra.designacao.toLowerCase().includes(termo) ||
        regra.moduloOrigem.toLowerCase().includes(termo) ||
        regra.tipoOrigem.toLowerCase().includes(termo)
      );
    });
  }, [regras, search, estadoFiltro]);

  const opcoesDiario = useMemo(
    () =>
      diarios.map((diario) => ({
        value: diario.id,
        label: `${diario.codigo} — ${diario.designacao}${diario.activo ? '' : ' (inactivo)'}`,
      })),
    [diarios]
  );

  const rotuloDiario = (diarioId: string) => {
    const diario = diarios.find((d) => d.id === diarioId);
    return diario ? `${diario.codigo} — ${diario.designacao}` : diarioId.slice(0, 8);
  };

  const opcoesExpressao = (index: number) => {
    const atual = String(linhas?.[index]?.expressaoValor ?? '');
    const extras =
      atual.startsWith('TAX:') && !EXPRESSOES.some((opcao) => opcao.value === atual)
        ? [{ value: atual, label: `${atual} — taxa personalizada` }]
        : [];
    return [...EXPRESSOES, ...extras];
  };

  const abrirCriar = () => {
    carregamentoRef.current += 1;
    setEditando(null);
    setErroCarregamento(null);
    setIsLoadingRegra(false);
    methods.reset({ ...valoresIniciais, linhas: valoresIniciais.linhas.map((linha) => ({ ...linha })) });
    setModalAberto(true);
  };

  const abrirEditar = async (regra: RegraContabilizacaoDto) => {
    const token = ++carregamentoRef.current;
    // Nunca deixar `editando` (nem os valores do formulário) apontar para a
    // regra anterior enquanto o detalhe da nova não é carregado com sucesso.
    setEditando(null);
    setErroCarregamento(null);
    methods.reset({ ...valoresVazios, linhas: [] });
    setModalAberto(true);
    setIsLoadingRegra(true);
    try {
      const res = await contabilidadeApi.obterRegra(regra.id);
      if (token !== carregamentoRef.current) return;
      if (!res.success) {
        const mensagem = res.error.message ?? 'Falha ao obter a regra.';
        setErroCarregamento(mensagem);
        toast.error('Não foi possível abrir a regra', { description: mensagem });
        return;
      }
      const linhasCarregadas = res.data.linhas ?? [];
      methods.reset({
        codigo: res.data.codigo,
        designacao: res.data.designacao,
        moduloOrigem: res.data.moduloOrigem,
        tipoOrigem: res.data.tipoOrigem,
        diarioId: res.data.diarioId,
        activa: res.data.activa,
        linhas: linhasCarregadas.map((linha, index) => ({
          numeroLinha: linha.numeroLinha || index + 1,
          lado: linha.lado,
          chaveConta: linha.chaveConta,
          expressaoValor: linha.expressaoValor,
          descricao: '',
          taxaImposto: linha.taxaImposto ?? taxaDaExpressao(linha.expressaoValor),
        })),
      });
      setEditando(regra);
    } catch (error) {
      if (token !== carregamentoRef.current) return;
      const mensagem = error instanceof Error ? error.message : 'Falha ao obter a regra.';
      setErroCarregamento(mensagem);
      toast.error('Não foi possível abrir a regra', { description: mensagem });
    } finally {
      if (token === carregamentoRef.current) setIsLoadingRegra(false);
    }
  };

  const renumerarLinhas = () => {
    methods.getValues('linhas').forEach((_, index) => {
      methods.setValue(`linhas.${index}.numeroLinha`, index + 1, { shouldDirty: true });
    });
  };

  const moverLinha = (de: number, para: number) => {
    move(de, para);
    renumerarLinhas();
  };

  const removerLinha = (index: number) => {
    remove(index);
    renumerarLinhas();
  };

  const definirExpressao = (index: number, valor: string) => {
    methods.setValue(`linhas.${index}.expressaoValor`, valor, {
      shouldDirty: true,
      shouldValidate: true,
    });
    methods.setValue(`linhas.${index}.taxaImposto`, taxaDaExpressao(valor), {
      shouldDirty: true,
    });
  };

  const definirTaxa = (index: number, taxa: string) => {
    const limpa = taxa.replace(/[^\d.]/g, '');
    methods.setValue(
      `linhas.${index}.expressaoValor`,
      limpa === '' ? 'TAX' : `TAX:${limpa}`,
      { shouldDirty: true, shouldValidate: true }
    );
    methods.setValue(`linhas.${index}.taxaImposto`, limpa === '' ? null : limpa, {
      shouldDirty: true,
    });
  };

  const submeter = async (values: RegraFormValues) => {
    if (!empresaId || isLoadingRegra || erroCarregamento) return;
    setIsSaving(true);

    try {
      const linhasPayload: LinhaRegraContabilizacaoCriarInput[] = values.linhas.map((linha, index) => {
        const taxa = taxaDaExpressao(linha.expressaoValor);
        return {
          numeroLinha: Number(linha.numeroLinha) || index + 1,
          lado: linha.lado,
          chaveConta: linha.chaveConta,
          expressaoValor: linha.expressaoValor,
          taxaImposto: taxa ?? linha.taxaImposto ?? null,
        };
      });

      const res = editando
        ? await contabilidadeApi.atualizarRegra(
            editando.id,
            {
              codigo: values.codigo.toUpperCase(),
              designacao: values.designacao,
              moduloOrigem: values.moduloOrigem,
              tipoOrigem: values.tipoOrigem,
              diarioId: values.diarioId,
              activa: values.activa,
              linhas: linhasPayload,
            } satisfies RegraContabilizacaoAtualizarInput
          )
        : await contabilidadeApi.criarRegra({
            empresaId,
            codigo: values.codigo.toUpperCase(),
            designacao: values.designacao,
            moduloOrigem: values.moduloOrigem,
            tipoOrigem: values.tipoOrigem,
            diarioId: values.diarioId,
            activa: values.activa,
            linhas: linhasPayload,
          } satisfies RegraContabilizacaoCriarInput);

      if (!res.success) {
        toast.error('Não foi possível guardar a regra', { description: res.error.message });
        return;
      }
      toast.success(editando ? 'Regra actualizada.' : 'Regra criada.');
      setModalAberto(false);
      await carregar();
    } finally {
      setIsSaving(false);
    }
  };

  const eliminar = async (regra: RegraContabilizacaoDto) => {
    if (!confirm(`Eliminar a regra ${regra.codigo} — ${regra.designacao}?`)) return;
    const res = await contabilidadeApi.removerRegra(regra.id);
    if (!res.success) {
      toast.error('Não foi possível eliminar a regra', { description: res.error.message });
      return;
    }
    toast.success('Regra eliminada.');
    await carregar();
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por código, designação ou origem…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="w-[170px]">
        <SearchSelect
          value={estadoFiltro}
          onChange={setEstadoFiltro}
          options={[
            { value: 'activa', label: 'Activas' },
            { value: 'inactiva', label: 'Inactivas' },
          ]}
          placeholder="Todos os estados"
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
      title="Regras de contabilização"
      description="Cada regra define o diário e as linhas do lançamento automático de um documento. As chaves de conta são resolvidas pelos mapeamentos da empresa."
      actions={
        <Button type="button" size="sm" onClick={abrirCriar} disabled={!empresaId}>
          <Plus className="w-4 h-4" />
          Nova regra
        </Button>
      }
      toolbar={toolbar}
    >
      {!empresaId ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Selecione uma empresa para configurar as regras de contabilização.
        </div>
      ) : (
        <>
          <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">{regrasFiltradas.length} regra(s)</span>
            <span className="text-xs text-muted-foreground">
              Única regra activa por par módulo/tipo de origem
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-28">Código</th>
                <th className="text-left font-medium px-4 py-2">Designação</th>
                <th className="text-left font-medium px-4 py-2 w-44">Origem</th>
                <th className="text-left font-medium px-4 py-2 w-52">Diário</th>
                <th className="text-left font-medium px-4 py-2 w-20">Linhas</th>
                <th className="text-left font-medium px-4 py-2 w-24">Estado</th>
                <th className="text-right font-medium px-4 py-2 w-24">Acções</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
                    </span>
                  </td>
                </tr>
              ) : regrasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {regras.length === 0
                      ? 'Ainda não existem regras. Crie a primeira para contabilizar documentos automaticamente.'
                      : 'Nenhuma regra corresponde aos filtros.'}
                  </td>
                </tr>
              ) : (
                regrasFiltradas.map((regra) => (
                  <tr key={regra.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs font-semibold">{regra.codigo}</td>
                    <td className="px-4 py-2">{regra.designacao}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {regra.moduloOrigem} / {regra.tipoOrigem}
                    </td>
                    <td className="px-4 py-2 text-xs">{rotuloDiario(regra.diarioId)}</td>
                    <td className="px-4 py-2 text-xs tabular-nums">{regra.linhas?.length ?? 0}</td>
                    <td className="px-4 py-2">
                      <StatusBadge tone={regra.activa ? 'success' : 'neutral'}>
                        {regra.activa ? 'Activa' : 'Inactiva'}
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
                          onClick={() => void abrirEditar(regra)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Eliminar"
                          onClick={() => void eliminar(regra)}
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
        </>
      )}

      <FormDialog
        open={modalAberto}
        onOpenChange={setModalAberto}
        title={editando ? `Editar regra ${editando.codigo}` : erroCarregamento ? 'Não foi possível abrir a regra' : 'Nova regra'}
        description="A regra é aplicada quando um documento do par módulo/tipo é contabilizado. As linhas são executadas por ordem e os valores vêm sempre de expressões fechadas."
      >
          <div className="relative h-full">
            {erroCarregamento && (
              <div role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Não foi possível carregar a regra selecionada: {erroCarregamento}. O formulário foi limpo e a submissão está desativada — feche e tente novamente.
              </div>
            )}
            {isLoadingRegra && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-background/70 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> A carregar a regra…
              </div>
            )}
            <fieldset
              disabled={isLoadingRegra || Boolean(erroCarregamento)}
              className={isLoadingRegra || erroCarregamento ? 'opacity-60' : ''}
            >
              <FormShell
                methods={methods}
                onSubmit={submeter}
                submitLabel={isSaving ? 'A guardar…' : editando ? 'Guardar' : 'Criar regra'}
                onCancel={() => setModalAberto(false)}
                flush
                compact
                dialogLayout
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <TextField name="codigo" label="Código" required placeholder="Ex.: VENDA_FATURA" />
                  <TextField name="designacao" label="Designação" required placeholder="Ex.: Fatura de venda" />
                  <TextField
                    name="moduloOrigem"
                    label="Módulo de origem"
                    required
                    placeholder="Ex.: vendas, compras, tesouraria, rh"
                  />
                  <TextField
                    name="tipoOrigem"
                    label="Tipo de origem"
                    required
                    placeholder="Ex.: fatura, recibo, movimento"
                  />
                  <SelectField name="diarioId" label="Diário" required options={opcoesDiario} />
                  <CheckboxField
                    name="activa"
                    label="Regra activa"
                    description="Apenas uma regra activa por par módulo/tipo de origem."
                  />
                </div>

                <div className="flex flex-col gap-2 min-h-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Linhas da regra</h3>
                      <p className="text-xs text-muted-foreground">
                        Uma linha por conta. A descrição é apenas uma nota do editor; o lançamento
                        gerado usa a descrição do motor.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        append({
                          numeroLinha: fields.length + 1,
                          lado: 'credito',
                          chaveConta: 'SALES_ACCOUNT',
                          expressaoValor: 'NET',
                          descricao: '',
                          taxaImposto: null,
                        })
                      }
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar linha
                    </Button>
                  </div>

                  {typeof errosLinhas === 'object' && !Array.isArray(errosLinhas) && (errosLinhas.root?.message || errosLinhas.message) && (
                    <p className="text-xs text-destructive">{String(errosLinhas.root?.message ?? errosLinhas.message)}</p>
                  )}

                  <div className="border border-border rounded-md overflow-auto min-h-0">
                    <table className="w-full text-sm min-w-[1120px]">
                      <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium w-16">Ordem</th>
                          <th className="px-2 py-2 text-left font-medium w-32">Lado</th>
                          <th className="px-2 py-2 text-left font-medium w-64">Chave da conta</th>
                          <th className="px-2 py-2 text-left font-medium w-56">Expressão</th>
                          <th className="px-2 py-2 text-left font-medium w-28">Taxa %</th>
                          <th className="px-2 py-2 text-left font-medium">Descrição</th>
                          <th className="px-2 py-2 text-center font-medium w-20">Mover</th>
                          <th className="px-2 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {fields.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">
                              Sem linhas. Adicione pelo menos uma linha para guardar a regra.
                            </td>
                          </tr>
                        ) : (
                          fields.map((field, index) => {
                            const erros = (errosLinhas?.[index] ?? {}) as Record<
                              string,
                              { message?: string } | undefined
                            >;
                            const expressaoAtual = String(linhas?.[index]?.expressaoValor ?? '');
                            const comTaxa = expressaoAtual === 'TAX' || expressaoAtual.startsWith('TAX:');
                            return (
                              <tr key={field.id} className="border-t border-border align-top">
                                <td className="px-2 py-2">
                                  <input
                                    type="number"
                                    min={1}
                                    className="w-full h-9 px-2 rounded-md border border-input bg-background text-xs tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    {...methods.register(`linhas.${index}.numeroLinha`, {
                                      valueAsNumber: true,
                                    })}
                                  />
                                  {erros.numeroLinha?.message && (
                                    <p className="text-[11px] text-destructive mt-1">
                                      {erros.numeroLinha.message}
                                    </p>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <SearchSelect
                                    portal
                                    value={String(linhas?.[index]?.lado ?? '')}
                                    onChange={(valor) =>
                                      methods.setValue(`linhas.${index}.lado`, valor as 'debito' | 'credito', {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      })
                                    }
                                    options={LADOS}
                                    placeholder="Lado"
                                    required
                                    hasError={Boolean(erros.lado)}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <SearchSelect
                                    portal
                                    value={String(linhas?.[index]?.chaveConta ?? '')}
                                    onChange={(valor) =>
                                      methods.setValue(`linhas.${index}.chaveConta`, valor, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      })
                                    }
                                    options={CHAVES_CONTA}
                                    placeholder="Escolher chave…"
                                    required
                                    hasError={Boolean(erros.chaveConta)}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <SearchSelect
                                    portal
                                    value={expressaoAtual}
                                    onChange={(valor) => definirExpressao(index, valor)}
                                    options={opcoesExpressao(index)}
                                    placeholder="Escolher expressão…"
                                    required
                                    hasError={Boolean(erros.expressaoValor)}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={taxaDaExpressao(expressaoAtual) ?? ''}
                                    onChange={(e) => definirTaxa(index, e.target.value)}
                                    placeholder="Todas"
                                    disabled={!comTaxa}
                                    className="w-full h-9 px-2 rounded-md border border-input bg-background text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground"
                                    aria-label={`Taxa da linha ${index + 1}`}
                                  />
                                  {comTaxa && (
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      TAX:&lt;taxa&gt;
                                    </p>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    type="text"
                                    placeholder="Nota da linha"
                                    className="w-full h-9 px-2 rounded-md border border-input bg-background text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    {...methods.register(`linhas.${index}.descricao`)}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Subir linha"
                                      disabled={index === 0}
                                      onClick={() => moverLinha(index, index - 1)}
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Descer linha"
                                      disabled={index === fields.length - 1}
                                      onClick={() => moverLinha(index, index + 1)}
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    title="Remover linha"
                                    onClick={() => removerLinha(index)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </FormShell>
            </fieldset>
          </div>
      </FormDialog>
    </WorkspaceFrame>
  );
}
