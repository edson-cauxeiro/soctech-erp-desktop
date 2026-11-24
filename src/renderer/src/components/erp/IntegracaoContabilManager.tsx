/**
 * @file IntegracaoContabilManager.tsx
 * @description Erros pendentes da contabilização automática e reprocessamento.
 *
 * O documento de origem nunca falha por causa da contabilidade: quando o motor
 * não encontra regra, conta mapeada ou período aberto, regista aqui o erro.
 * Depois de corrigir a configuração, o utilizador reprocessa o erro a partir
 * deste ecrã.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCheck,
  Eye,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchSelect } from '@/components/ui/SearchSelect';
import type { ErroIntegracaoContabilDto } from '../../@types/electron';
import { contabilidadeApi } from '../../api/contabilidade.api';
import { useAuth } from '../../hooks/useAuth';
import { WorkspaceFrame } from './WorkspaceFrame';
import { StatusBadge } from './Primitives';

const MODULOS_SUGERIDOS = [
  'vendas',
  'compras',
  'tesouraria',
  'rh',
  'apuramento-iva',
  'apuramento-resultados',
  'fecho-anual',
  'reconciliacao',
];

const TIPOS_SUGERIDOS = [
  'fatura',
  'recibo',
  'movimento',
  'processamento',
  'pagamento',
  'apuramento',
  'exercicio',
];

function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);
  return data.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDetalhes(detalhes: string | null | undefined): string {
  if (!detalhes) return '—';
  try {
    return JSON.stringify(JSON.parse(detalhes), null, 2);
  } catch {
    return detalhes;
  }
}

export function IntegracaoContabilManager() {
  const empresaId = useAuth((s) => s.user?.empresaConfigId) || '';

  const [erros, setErros] = useState<ErroIntegracaoContabilDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reprocessando, setReprocessando] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState('pendente');
  const [moduloFiltro, setModuloFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [search, setSearch] = useState('');
  const [erroDetalhe, setErroDetalhe] = useState<ErroIntegracaoContabilDto | null>(null);

  const carregar = useCallback(async (): Promise<ErroIntegracaoContabilDto[]> => {
    if (!empresaId) {
      setErros([]);
      setIsLoading(false);
      return [];
    }
    setIsLoading(true);
    try {
      const res = await contabilidadeApi.listarErrosIntegracao({
        empresaId,
        ...(estadoFiltro === 'pendente' ? { resolvido: false } : {}),
        ...(estadoFiltro === 'resolvido' ? { resolvido: true } : {}),
        ...(moduloFiltro ? { moduloOrigem: moduloFiltro } : {}),
        ...(tipoFiltro ? { tipoOrigem: tipoFiltro } : {}),
      });
      if (res.success) {
        setErros(res.data);
        return res.data;
      }
      toast.error('Não foi possível carregar os erros de integração', { description: res.error.message });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, estadoFiltro, moduloFiltro, tipoFiltro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const errosFiltrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return erros;
    return erros.filter(
      (erro) =>
        erro.codigoErro.toLowerCase().includes(termo) ||
        erro.mensagem.toLowerCase().includes(termo) ||
        erro.origemId.toLowerCase().includes(termo) ||
        erro.moduloOrigem.toLowerCase().includes(termo) ||
        erro.tipoOrigem.toLowerCase().includes(termo)
    );
  }, [erros, search]);

  const opcoesModulo = useMemo(() => {
    const valores = new Set<string>(MODULOS_SUGERIDOS);
    erros.forEach((erro) => valores.add(erro.moduloOrigem));
    return [...valores].sort().map((valor) => ({ value: valor, label: valor }));
  }, [erros]);

  const opcoesTipo = useMemo(() => {
    const valores = new Set<string>(TIPOS_SUGERIDOS);
    erros.forEach((erro) => valores.add(erro.tipoOrigem));
    return [...valores].sort().map((valor) => ({ value: valor, label: valor }));
  }, [erros]);

  const pendentes = erros.filter((erro) => !erro.resolvido).length;

  const reprocessar = async (erro: ErroIntegracaoContabilDto) => {
    setReprocessando(erro.id);
    try {
      const res = await contabilidadeApi.reprocessarErro(erro.id);
      if (!res.success) {
        toast.error('Não foi possível reprocessar o erro', { description: res.error.message });
        return;
      }
      if (!res.data.sucesso) {
        toast.error('Reprocessamento não concluído', { description: res.data.mensagem });
      } else if (res.data.pendente) {
        toast.warning('Regra ainda pendente', { description: res.data.mensagem });
      } else {
        toast.success('Erro reprocessado.', { description: res.data.mensagem });
      }

      // O detalhe aberto guardava o estado antigo. Atualizá-lo a partir da
      // lista recém-carregada (ou fechá-lo se o erro deixou de constar no
      // filtro) evita continuar a mostrar "Pendente" com Reprocessar ativo.
      const atualizados = await carregar();
      const atual = atualizados.find((item) => item.id === erro.id);
      setErroDetalhe((detalhe) => (detalhe && detalhe.id === erro.id ? atual ?? null : detalhe));
    } finally {
      setReprocessando(null);
    }
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por código, mensagem ou origem…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="w-[160px]">
        <SearchSelect
          value={estadoFiltro}
          onChange={setEstadoFiltro}
          options={[
            { value: 'pendente', label: 'Pendentes' },
            { value: 'resolvido', label: 'Resolvidos' },
            { value: 'todos', label: 'Todos' },
          ]}
          placeholder="Estado"
          required
        />
      </div>
      <div className="w-[180px]">
        <SearchSelect
          value={moduloFiltro}
          onChange={setModuloFiltro}
          options={opcoesModulo}
          placeholder="Todos os módulos"
          allowClear
        />
      </div>
      <div className="w-[160px]">
        <SearchSelect
          value={tipoFiltro}
          onChange={setTipoFiltro}
          options={opcoesTipo}
          placeholder="Todos os tipos"
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
      title="Integração contabilística"
      description="Documentos que não puderam ser contabilizados automaticamente. Corrija a regra ou o mapeamento e reprocesse o erro."
      toolbar={toolbar}
    >
      {!empresaId ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Selecione uma empresa para ver os erros de integração.
        </div>
      ) : (
        <>
          <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              {pendentes > 0 ? (
                <AlertTriangle className="w-4 h-4 text-warning" />
              ) : (
                <CheckCheck className="w-4 h-4 text-success" />
              )}
              {pendentes} erro(s) pendente(s)
            </div>
            <span className="text-xs text-muted-foreground">
              {errosFiltrados.length} registo(s) na lista
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-44">Código</th>
                <th className="text-left font-medium px-4 py-2 w-44">Origem</th>
                <th className="text-left font-medium px-4 py-2">Mensagem</th>
                <th className="text-left font-medium px-4 py-2 w-36">Data</th>
                <th className="text-left font-medium px-4 py-2 w-24">Estado</th>
                <th className="text-right font-medium px-4 py-2 w-32">Acções</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
                    </span>
                  </td>
                </tr>
              ) : errosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {erros.length === 0
                      ? 'Sem erros de integração para os filtros seleccionados.'
                      : 'Nenhum erro corresponde à pesquisa.'}
                  </td>
                </tr>
              ) : (
                errosFiltrados.map((erro) => (
                  <tr key={erro.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs font-semibold">{erro.codigoErro}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <div>{erro.moduloOrigem} / {erro.tipoOrigem}</div>
                      <div className="truncate max-w-[160px]" title={erro.origemId}>
                        {erro.origemId.slice(0, 12)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">{erro.mensagem}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">
                      {formatarData(erro.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge tone={erro.resolvido ? 'success' : 'warning'}>
                        {erro.resolvido ? 'Resolvido' : 'Pendente'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Ver detalhes"
                          onClick={() => setErroDetalhe(erro)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={reprocessando === erro.id}
                          title="Reprocessar"
                          onClick={() => void reprocessar(erro)}
                        >
                          {reprocessando === erro.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="w-3.5 h-3.5" />
                          )}
                          Reprocessar
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

      <Dialog open={Boolean(erroDetalhe)} onOpenChange={(aberto) => !aberto && setErroDetalhe(null)}>
        <DialogContent className="max-w-2xl p-0 gap-0 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Detalhe do erro</DialogTitle>
            <DialogDescription>
              Informação registada pelo motor de contabilização no momento da falha.
            </DialogDescription>
          </DialogHeader>
          {erroDetalhe && (
            <div className="px-5 pb-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Código</div>
                  <div className="font-mono font-semibold">{erroDetalhe.codigoErro}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Estado</div>
                  <div className="mt-1">
                    <StatusBadge tone={erroDetalhe.resolvido ? 'success' : 'warning'}>
                      {erroDetalhe.resolvido ? 'Resolvido' : 'Pendente'}
                    </StatusBadge>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Módulo / tipo</div>
                  <div>{erroDetalhe.moduloOrigem} / {erroDetalhe.tipoOrigem}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Origem</div>
                  <div>{erroDetalhe.origem}</div>
                  <div className="font-mono text-xs text-muted-foreground break-all">
                    {erroDetalhe.origemId}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Registado em</div>
                  <div>{formatarData(erroDetalhe.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Resolvido em</div>
                  <div>{formatarData(erroDetalhe.resolvidoEm)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Mensagem</div>
                <p className="mt-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  {erroDetalhe.mensagem}
                </p>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Detalhes</div>
                <pre className="mt-1 max-h-52 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
                  {formatarDetalhes(erroDetalhe.detalhes)}
                </pre>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setErroDetalhe(null)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={reprocessando === erroDetalhe.id || erroDetalhe.resolvido}
                  onClick={() => void reprocessar(erroDetalhe)}
                >
                  {reprocessando === erroDetalhe.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                  Reprocessar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}
