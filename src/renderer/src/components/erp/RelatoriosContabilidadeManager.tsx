/**
 * @file RelatoriosContabilidadeManager.tsx
 * @description Relatórios contabilísticos: balancete, razão, diários e conta
 * corrente.
 *
 * Todos os relatórios são derivados exclusivamente de linhas de lançamentos
 * validados. A UI não recalcula saldos: mostra o que o serviço devolve, com
 * totais de rodapé para conferência rápida.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, RefreshCw, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/SearchSelect';
import {
  BalanceteResultadoDto,
  ClienteDto,
  ContaContabilDto,
  ContaCorrenteResultadoDto,
  DiarioContabilDto,
  EntidadeContaCorrenteTipo,
  ExercicioFiscalDto,
  FornecedorDto,
  PeriodoContabilDto,
  RazaoResultadoDto,
  RelatorioDiariosResultadoDto,
} from '../../@types/electron';
import { clienteApi } from '../../api/cliente.api';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { fornecedorApi } from '../../api/fornecedor.api';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency } from '@/utils/currency';
import { WorkspaceFrame } from './WorkspaceFrame';
import { StatusBadge } from './Primitives';

type AbaRelatorio = 'balancete' | 'razao' | 'diarios' | 'contaCorrente';

const ABAS: { id: AbaRelatorio; label: string }[] = [
  { id: 'balancete', label: 'Balancete' },
  { id: 'razao', label: 'Razão' },
  { id: 'diarios', label: 'Diários' },
  { id: 'contaCorrente', label: 'Conta corrente' },
];

const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => ({
  value: String(c),
  label: `Classe ${c}`,
}));

function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function dinheiro(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '—';
  return formatCurrency(n, 'AOA');
}

export function RelatoriosContabilidadeManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [aba, setAba] = useState<AbaRelatorio>('balancete');

  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [exercicioId, setExercicioId] = useState('');
  const [periodos, setPeriodos] = useState<PeriodoContabilDto[]>([]);
  const [periodoId, setPeriodoId] = useState('');
  const [contas, setContas] = useState<ContaContabilDto[]>([]);
  const [diarios, setDiarios] = useState<DiarioContabilDto[]>([]);
  const [clientes, setClientes] = useState<ClienteDto[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorDto[]>([]);

  const [contaId, setContaId] = useState('');
  const [diarioId, setDiarioId] = useState('');
  const [classe, setClasse] = useState('');
  const [incluirSaldoZero, setIncluirSaldoZero] = useState(false);
  const [entidadeTipo, setEntidadeTipo] = useState<EntidadeContaCorrenteTipo>('cliente');
  const [entidadeId, setEntidadeId] = useState('');

  const [balancete, setBalancete] = useState<BalanceteResultadoDto | null>(null);
  const [razao, setRazao] = useState<RazaoResultadoDto | null>(null);
  const [diariosResultado, setDiariosResultado] = useState<RelatorioDiariosResultadoDto | null>(null);
  const [contaCorrente, setContaCorrente] = useState<ContaCorrenteResultadoDto | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isGerando, setIsGerando] = useState(false);
  const [isExportando, setIsExportando] = useState<'pdf' | 'xlsx' | null>(null);

  // ─── Carga de dados de apoio ────────────────────────────────────────────

  const carregarApoio = useCallback(async () => {
    if (!empresaId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [exRes, contasRes, diariosRes] = await Promise.all([
      contabilidadeApi.listarExercicios(empresaId),
      contabilidadeApi.listarContas({ empresaId }),
      contabilidadeApi.listarDiarios({ empresaId }),
    ]);

    if (exRes.success) {
      setExercicios(exRes.data);
      setExercicioId((atual) => atual || exRes.data[0]?.id || '');
    } else {
      toast.error('Não foi possível carregar os exercícios', { description: exRes.error.message });
    }
    if (contasRes.success) setContas(contasRes.data.items);
    if (diariosRes.success) setDiarios(diariosRes.data.items);
    setIsLoading(false);
  }, [empresaId]);

  useEffect(() => {
    void carregarApoio();
  }, [carregarApoio]);

  useEffect(() => {
    if (!exercicioId) {
      setPeriodos([]);
      setPeriodoId('');
      return;
    }
    let cancelado = false;
    void (async () => {
      const res = await contabilidadeApi.listarPeriodos({ exercicioId });
      if (cancelado) return;
      if (res.success) {
        setPeriodos(res.data.items);
        setPeriodoId((atual) => (res.data.items.some((p) => p.id === atual) ? atual : ''));
      } else {
        toast.error('Não foi possível carregar os períodos', { description: res.error.message });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [exercicioId]);

  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;
    void (async () => {
      if (entidadeTipo === 'cliente') {
        const res = await clienteApi.list({ pageSize: 500 } as never);
        if (!cancelado && res.success) setClientes(res.data.items);
      } else if (entidadeTipo === 'fornecedor') {
        const res = await fornecedorApi.list({ pageSize: 500 } as never);
        if (!cancelado && res.success) setFornecedores(res.data.items);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [empresaId, entidadeTipo]);

  useEffect(() => {
    setEntidadeId('');
  }, [entidadeTipo]);

  // ─── Geração do relatório activo ────────────────────────────────────────

  const gerar = useCallback(async () => {
    if (!empresaId) return;

    if (aba === 'razao' && !contaId) {
      setRazao(null);
      return;
    }
    if (aba === 'contaCorrente' && !entidadeId) {
      setContaCorrente(null);
      return;
    }

    setIsGerando(true);
    try {
      if (aba === 'balancete') {
        const res = await contabilidadeApi.balancete({
          exercicioId: exercicioId || undefined,
          periodoId: periodoId || undefined,
          diarioId: diarioId || undefined,
          classe: classe ? Number(classe) : undefined,
          incluirSaldoZero,
          apenasFolhas: true,
        });
        if (res.success) setBalancete(res.data);
        else toast.error('Não foi possível gerar o balancete', { description: res.error.message });
      } else if (aba === 'razao') {
        const res = await contabilidadeApi.razao({
          contaId,
          exercicioId: exercicioId || undefined,
          periodoId: periodoId || undefined,
        });
        if (res.success) setRazao(res.data);
        else toast.error('Não foi possível gerar a razão', { description: res.error.message });
      } else if (aba === 'diarios') {
        const res = await contabilidadeApi.relatorioDiarios({
          exercicioId: exercicioId || undefined,
          periodoId: periodoId || undefined,
          diarioId: diarioId || undefined,
        });
        if (res.success) setDiariosResultado(res.data);
        else toast.error('Não foi possível gerar os diários', { description: res.error.message });
      } else {
        const res = await contabilidadeApi.contaCorrente({
          entidadeTipo,
          entidadeId,
          exercicioId: exercicioId || undefined,
          periodoId: periodoId || undefined,
          incluirAntiguidade: true,
        });
        if (res.success) setContaCorrente(res.data);
        else toast.error('Não foi possível gerar a conta corrente', { description: res.error.message });
      }
    } catch {
      toast.error('Falha ao comunicar com o processo principal.');
    } finally {
      setIsGerando(false);
    }
  }, [aba, empresaId, exercicioId, periodoId, diarioId, classe, incluirSaldoZero, contaId, entidadeTipo, entidadeId]);

  useEffect(() => {
    void gerar();
  }, [gerar]);

  const filtrosAtuais = useMemo<Record<string, unknown>>(() => {
    const comuns = {
      exercicioId: exercicioId || undefined,
      periodoId: periodoId || undefined,
    };
    switch (aba) {
      case 'balancete':
        return {
          ...comuns,
          diarioId: diarioId || undefined,
          classe: classe ? Number(classe) : undefined,
          incluirSaldoZero,
          apenasFolhas: true,
        };
      case 'razao':
        return { ...comuns, contaId };
      case 'diarios':
        return { ...comuns, diarioId: diarioId || undefined };
      case 'contaCorrente':
        return { ...comuns, entidadeTipo, entidadeId, incluirAntiguidade: true };
    }
  }, [aba, exercicioId, periodoId, diarioId, classe, incluirSaldoZero, contaId, entidadeTipo, entidadeId]);

  const exportar = useCallback(
    async (formato: 'pdf' | 'xlsx') => {
      setIsExportando(formato);
      try {
        const res = await contabilidadeApi.exportarRelatorio({ relatorio: aba, formato, filtros: filtrosAtuais });
        if (res.success) {
          if (res.data.cancelado) return;
          toast.success('Relatório exportado com sucesso', {
            description: res.data.caminho,
          });
        } else {
          toast.error('Não foi possível exportar o relatório', { description: res.error.message });
        }
      } catch {
        toast.error('Falha ao comunicar com o processo principal.');
      } finally {
        setIsExportando(null);
      }
    },
    [aba, filtrosAtuais]
  );

  const exportacaoIndisponivel =
    isGerando ||
    isExportando !== null ||
    (aba === 'razao' && !contaId) ||
    (aba === 'contaCorrente' && !entidadeId);

  // ─── Opções ─────────────────────────────────────────────────────────────

  const opcoesExercicios = useMemo(
    () => exercicios.map((e) => ({ value: e.id, label: `Exercício ${e.ano}` })),
    [exercicios]
  );

  const opcoesPeriodos = useMemo(
    () =>
      periodos.map((p) => ({
        value: p.id,
        label: `${String(p.numero).padStart(2, '0')} · ${dataCurta(p.dataInicio)} a ${dataCurta(p.dataFim)}`,
      })),
    [periodos]
  );

  const opcoesContas = useMemo(
    () => contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.designacao}` })),
    [contas]
  );

  const opcoesDiarios = useMemo(
    () => diarios.map((d) => ({ value: d.id, label: `${d.codigo} — ${d.designacao}` })),
    [diarios]
  );

  const opcoesEntidades = useMemo(() => {
    if (entidadeTipo === 'cliente') {
      return clientes.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }));
    }
    if (entidadeTipo === 'fornecedor') {
      return fornecedores.map((f) => ({ value: f.id, label: `${f.codigo} — ${f.nome}` }));
    }
    return [];
  }, [entidadeTipo, clientes, fornecedores]);

  const filtros = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={[
              'h-8 px-3 rounded-md text-sm font-medium transition-colors',
              aba === a.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Exercício</label>
          <SearchSelect
            value={exercicioId}
            onChange={setExercicioId}
            options={opcoesExercicios}
            placeholder="Todos"
            allowClear
            disabled={isLoading}
          />
        </div>

        <div className="w-56">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Período</label>
          <SearchSelect
            value={periodoId}
            onChange={setPeriodoId}
            options={opcoesPeriodos}
            placeholder="Todo o exercício"
            allowClear
            disabled={!exercicioId}
          />
        </div>

        {(aba === 'balancete' || aba === 'diarios') && (
          <div className="w-56">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Diário</label>
            <SearchSelect
              value={diarioId}
              onChange={setDiarioId}
              options={opcoesDiarios}
              placeholder="Todos os diários"
              allowClear
            />
          </div>
        )}

        {aba === 'balancete' && (
          <div className="w-36">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Classe</label>
            <SearchSelect
              value={classe}
              onChange={setClasse}
              options={CLASSES}
              placeholder="Todas"
              allowClear
            />
          </div>
        )}

        {aba === 'balancete' && (
          <label className="h-9 inline-flex items-center gap-2 px-1 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={incluirSaldoZero}
              onChange={(e) => setIncluirSaldoZero(e.target.checked)}
              className="w-4 h-4 rounded border-input accent-[hsl(var(--primary))]"
            />
            Incluir saldo zero
          </label>
        )}

        {aba === 'razao' && (
          <div className="w-80">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Conta</label>
            <SearchSelect
              value={contaId}
              onChange={setContaId}
              options={opcoesContas}
              placeholder="Escolher conta"
            />
          </div>
        )}

        {aba === 'contaCorrente' && (
          <>
            <div className="w-40">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Entidade</label>
              <SearchSelect
                value={entidadeTipo}
                onChange={(v) => setEntidadeTipo(v as EntidadeContaCorrenteTipo)}
                options={[
                  { value: 'cliente', label: 'Cliente' },
                  { value: 'fornecedor', label: 'Fornecedor' },
                ]}
                allowClear={false}
              />
            </div>
            <div className="w-72">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Seleccionar</label>
              <SearchSelect
                value={entidadeId}
                onChange={setEntidadeId}
                options={opcoesEntidades}
                placeholder="Escolher entidade"
              />
            </div>
          </>
        )}

        <div className="flex-1" />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void exportar('pdf')}
          disabled={exportacaoIndisponivel}
          title="Exportar PDF"
        >
          {isExportando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void exportar('xlsx')}
          disabled={exportacaoIndisponivel}
          title="Exportar Excel"
        >
          {isExportando === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          Excel
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void gerar()} disabled={isGerando}>
          {isGerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Gerar
        </Button>
      </div>
    </div>
  );

  return (
    <WorkspaceFrame
      title="Relatórios contabilísticos"
      description="Balancete, razão, diários e conta corrente — todos derivados de lançamentos validados."
      toolbar={filtros}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> A carregar…
        </div>
      ) : (
        <>
          {aba === 'balancete' && <TabelaBalancete dados={balancete} />}
          {aba === 'razao' && <TabelaRazao dados={razao} temConta={!!contaId} />}
          {aba === 'diarios' && <TabelaDiarios dados={diariosResultado} />}
          {aba === 'contaCorrente' && (
            <TabelaContaCorrente dados={contaCorrente} temEntidade={!!entidadeId} />
          )}
        </>
      )}
    </WorkspaceFrame>
  );
}

function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <SearchX className="w-8 h-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground max-w-sm">{mensagem}</p>
    </div>
  );
}

function CabecalhoTabela({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
        {children}
      </div>
    </div>
  );
}

function TabelaBalancete({ dados }: { dados: BalanceteResultadoDto | null }) {
  if (!dados) return <Vazio mensagem="Sem dados para os filtros seleccionados." />;
  return (
    <>
      <CabecalhoTabela>
        {dados.items.length} conta{dados.items.length === 1 ? '' : 's'}
      </CabecalhoTabela>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            <th className="text-left font-medium px-4 py-2 w-28">Conta</th>
            <th className="text-left font-medium px-4 py-2">Designação</th>
            <th className="text-center font-medium px-4 py-2 w-20">Classe</th>
            <th className="text-right font-medium px-4 py-2 w-36">Débito</th>
            <th className="text-right font-medium px-4 py-2 w-36">Crédito</th>
            <th className="text-right font-medium px-4 py-2 w-36">Saldo</th>
            <th className="text-right font-medium px-4 py-2 w-20">Linhas</th>
          </tr>
        </thead>
        <tbody>
          {dados.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma conta com movimento validado.
              </td>
            </tr>
          ) : (
            dados.items.map((l) => (
              <tr key={l.contaId} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs font-semibold">{l.codigo}</td>
                <td className="px-4 py-2" style={{ paddingLeft: `${16 + Math.max(0, l.nivel - 1) * 14}px` }}>
                  {l.designacao}
                </td>
                <td className="px-4 py-2 text-center text-muted-foreground">{l.classe}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.debito)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.credito)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{dinheiro(l.saldo)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{l.linhas}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur">
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-4 py-2.5" colSpan={3}>
              Totais
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.totais.debito)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.totais.credito)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.totais.saldo)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function TabelaRazao({ dados, temConta }: { dados: RazaoResultadoDto | null; temConta: boolean }) {
  if (!temConta) return <Vazio mensagem="Escolha uma conta para ver a razão." />;
  if (!dados) return <Vazio mensagem="Sem movimentos para os filtros seleccionados." />;
  return (
    <>
      <CabecalhoTabela>
        <span className="font-mono">{dados.conta.codigo}</span> — {dados.conta.designacao}
        <StatusBadge tone="neutral">Saldo transitado {dinheiro(dados.conta.saldoTransitado)}</StatusBadge>
      </CabecalhoTabela>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            <th className="text-left font-medium px-4 py-2 w-28">Data</th>
            <th className="text-left font-medium px-4 py-2 w-24">Nº</th>
            <th className="text-left font-medium px-4 py-2">Descrição</th>
            <th className="text-right font-medium px-4 py-2 w-36">Débito</th>
            <th className="text-right font-medium px-4 py-2 w-36">Crédito</th>
            <th className="text-right font-medium px-4 py-2 w-36">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {dados.items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum movimento validado nesta conta.
              </td>
            </tr>
          ) : (
            dados.items.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {dataCurta(l.dataContabilistica)}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{l.numeroLancamento ?? '—'}</td>
                <td className="px-4 py-2">{l.descricaoLancamento}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.debito)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.credito)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{dinheiro(l.saldoCorrente)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur">
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-4 py-2.5" colSpan={5}>
              Saldo final
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.saldoFinal)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function TabelaDiarios({ dados }: { dados: RelatorioDiariosResultadoDto | null }) {
  if (!dados) return <Vazio mensagem="Sem lançamentos para os filtros seleccionados." />;
  return (
    <>
      <CabecalhoTabela>
        {dados.items.length} lançamento{dados.items.length === 1 ? '' : 's'}
      </CabecalhoTabela>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            <th className="text-left font-medium px-4 py-2 w-24">Diário</th>
            <th className="text-left font-medium px-4 py-2 w-20">Nº</th>
            <th className="text-left font-medium px-4 py-2 w-28">Data</th>
            <th className="text-left font-medium px-4 py-2">Descrição</th>
            <th className="text-left font-medium px-4 py-2 w-32">Origem</th>
            <th className="text-right font-medium px-4 py-2 w-36">Débito</th>
            <th className="text-right font-medium px-4 py-2 w-36">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {dados.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum lançamento validado.
              </td>
            </tr>
          ) : (
            dados.items.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs font-semibold">{l.diarioCodigo}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.numero ?? '—'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {dataCurta(l.dataContabilistica)}
                </td>
                <td className="px-4 py-2">
                  <div className="truncate max-w-[380px]">{l.descricao}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[380px]">
                    {l.diarioDesignacao} · {l.criadoPor}
                  </div>
                </td>
                <td className="px-4 py-2 text-muted-foreground capitalize">{l.origem}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.totalDebito)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.totalCredito)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur">
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-4 py-2.5" colSpan={5}>
              Totais
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.totais.debito)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.totais.credito)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function TabelaContaCorrente({
  dados,
  temEntidade,
}: {
  dados: ContaCorrenteResultadoDto | null;
  temEntidade: boolean;
}) {
  if (!temEntidade) return <Vazio mensagem="Escolha um cliente ou fornecedor para ver a conta corrente." />;
  if (!dados) return <Vazio mensagem="Sem movimentos para os filtros seleccionados." />;
  return (
    <>
      <CabecalhoTabela>
        {dados.items.length} linha{dados.items.length === 1 ? '' : 's'}
      </CabecalhoTabela>

      {dados.antiguidade && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-border">
          <Antiguidade rotulo="Até 30 dias" valor={dados.antiguidade.ate30} />
          <Antiguidade rotulo="31 a 60 dias" valor={dados.antiguidade.ate60} />
          <Antiguidade rotulo="61 a 90 dias" valor={dados.antiguidade.ate90} />
          <Antiguidade rotulo="Mais de 90 dias" valor={dados.antiguidade.mais90} />
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            <th className="text-left font-medium px-4 py-2 w-28">Data</th>
            <th className="text-left font-medium px-4 py-2 w-24">Nº</th>
            <th className="text-left font-medium px-4 py-2">Descrição</th>
            <th className="text-left font-medium px-4 py-2 w-28">Vencimento</th>
            <th className="text-right font-medium px-4 py-2 w-32">Débito</th>
            <th className="text-right font-medium px-4 py-2 w-32">Crédito</th>
            <th className="text-right font-medium px-4 py-2 w-36">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {dados.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum movimento validado para esta entidade.
              </td>
            </tr>
          ) : (
            dados.items.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {dataCurta(l.dataContabilistica)}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{l.numeroLancamento ?? '—'}</td>
                <td className="px-4 py-2 truncate max-w-[360px]">{l.descricaoLancamento}</td>
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {dataCurta(l.dataVencimento)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.debito)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{dinheiro(l.credito)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{dinheiro(l.saldoCorrente)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur">
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-4 py-2.5" colSpan={6}>
              Saldo final
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{dinheiro(dados.saldoFinal)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function Antiguidade({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{rotulo}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{dinheiro(valor)}</div>
    </div>
  );
}
