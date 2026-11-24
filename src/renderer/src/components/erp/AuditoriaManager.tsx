/**
 * @file AuditoriaManager.tsx
 * @description Visualizador do log de auditoria (`AUD-02`).
 *
 * O log já era escrito — cada exportação de relatório, cada geração de SAF-T e
 * cada escrita de negócio passa por `AuditService.registar`, que calcula uma
 * pegada SHA-256 sobre o conteúdo da linha. O que faltava era o lado de ler:
 * uma vez registado, ninguém conseguia ver o que tinha acontecido sem abrir a
 * base de dados à mão.
 *
 * ## Decisões que moldaram este ecrã
 *
 * **Paginação por cursor, não por número de página.** O log é append-only e
 * cresce a cada acção. Com `offset`, um "ver mais" saltava uma linha sempre que
 * alguém trabalhava entretanto, e a linha que o utilizador estava a ler
 * reaparecia na página seguinte. O `proximoCursor` devolve pelo main resolve o
 * deslocamento, e é por isso que não há campo "página 3" aqui.
 *
 * **O botão de integridade é explícito.** Verificar recalcula o hash de cada
 * linha, e isso custa. Correr isso a cada mudança de filtro transformava a
 * consulta mais barata do ecrã na mais cara, e o resultado raramente muda entre
 * duas consultas feitas a segundos de distância.
 *
 * **O filtro de acção é livre, não uma lista.** As acções que aparecem dependem
 * do que a empresa usa, e uma lista fixa em código envelhece mal: cada acção
 * nova precise de ser acrescentada aqui para poder ser investigada.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Fingerprint, Info, Loader2, RefreshCw, RotateCcw, ShieldCheck, ShieldX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fiscalApi } from "@/api/fiscal.api";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, Panel, StatusBadge } from "@/components/erp/Primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  AuditoriaLogDto,
  VerificacaoIntegridadeDto,
} from "../../@types/electron";

/**
 * Severidade para o tom do selo.
 *
 * Um mapa só, e não dois encadeados. `info` fica neutro: o log é quase tudo
 * informativo, e dar-lhe uma cor feita salientaria o que não tem nada de
 * especial.
 */
const TOM_SEVERIDADE = {
  info: "neutral",
  aviso: "warning",
  critico: "danger",
} as const;

function dataHora(valor: string | Date): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * `AAAA-MM-DDTHH:mm:ss` a partir do `<input type="datetime-local">`.
 *
 * O input produz `2026-03-15T14:30` e não `2026-03-15T14:30:00`. O main
 * converte com `new Date()`, que em Node aceita o primeiro mas trata o segundo
 * como hora local — e a diferença entre UTC e local é a diferença entre o filtro
 * pegar no dia certo e no dia anterior.
 */
function paraIsoLocal(valor: string): string | undefined {
  return valor ? new Date(valor).toISOString() : undefined;
}

export function AuditoriaManager() {
  // Via o selector, e não o hook inteiro: `useAuth()` sem selector subscreve o
  // componente a todo o estado, e uma escrita noutro campo do store redesenha
  // a tabela de auditoria sem necessidade. As outras páginas fazem o mesmo.
  const user = useAuth((s) => s.user);
  const empresaId = user?.empresaConfigId ?? null;

  const [registos, setRegistos] = useState<AuditoriaLogDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [integridade, setIntegridade] = useState<VerificacaoIntegridadeDto | null>(null);
  const [selecionado, setSelecionado] = useState<AuditoriaLogDto | null>(null);
  const [mostrarDetalhe, setMostrarDetalhe] = useState(false);

  const [severidade, setSeveridade] = useState<"" | "info" | "aviso" | "critico">("");
  const [acao, setAcao] = useState("");
  const [modulo, setModulo] = useState("");
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [incluirArquivados, setIncluirArquivados] = useState(false);

  /** Recarrega a primeira página, descartando o cursor: um filtro novo recomeça. */
  const carregar = useCallback(async () => {
    if (!empresaId) return;

    setCarregando(true);
    try {
      const resposta = await fiscalApi.listarAuditoria({
        empresaId,
        severidade: severidade || undefined,
        acao: acao.trim() || undefined,
        modulo: modulo || undefined,
        desde: paraIsoLocal(desde),
        ate: paraIsoLocal(ate),
        limite: 50,
        incluirArquivados,
      });

      if (resposta.success) {
        setRegistos(resposta.data.registos);
        setCursor(resposta.data.proximoCursor);
        setTotal(resposta.data.total);
      } else {
        toast.error("Não foi possível ler a auditoria", {
          description: resposta.error.message,
        });
      }
    } finally {
      setCarregando(false);
    }
  }, [empresaId, severidade, acao, modulo, desde, ate, incluirArquivados]);

  /** Acrescenta a página seguinte à lista, em vez de a substituir. */
  const carregarMais = useCallback(async () => {
    if (!empresaId || !cursor) return;

    setCarregando(true);
    try {
      const resposta = await fiscalApi.listarAuditoria({
        empresaId,
        severidade: severidade || undefined,
        acao: acao.trim() || undefined,
        modulo: modulo || undefined,
        desde: paraIsoLocal(desde),
        ate: paraIsoLocal(ate),
        cursor,
        limite: 50,
        incluirArquivados,
      });

      if (resposta.success) {
        // Deduplica por id: o cursor é (dataHora, id), e dois registos escritos no
        // mesmo milissegundo podem colidir no mesmo instante. Sem isto, a linha
        // duplicava no ecrã sem nenhum aviso.
        const vistos = new Set(registos.map((r) => r.id));
        setRegistos((actuais) => [
          ...actuais,
          ...resposta.data.registos.filter((r) => !vistos.has(r.id)),
        ]);
        setCursor(resposta.data.proximoCursor);
        setTotal(resposta.data.total);
      } else {
        toast.error("Não foi possível carregar mais registos", {
          description: resposta.error.message,
        });
      }
    } finally {
      setCarregando(false);
    }
  }, [empresaId, cursor, severidade, acao, modulo, desde, ate, registos, incluirArquivados]);

  const verificar = useCallback(async () => {
    if (!empresaId) return;

    setVerificando(true);
    try {
      const resposta = await fiscalApi.verificarIntegridade({
        empresaId,
        desde: paraIsoLocal(desde),
        ate: paraIsoLocal(ate),
      });

      if (resposta.success) {
        setIntegridade(resposta.data);
        if (resposta.data.integro) {
          toast.success(`${resposta.data.totalVerificados} registo(s) íntegros.`);
        } else {
          // Alerta e não só um badge: um hash adulterado é a coisa mais grave que
          // esta aplicação pode mostrar, e não deve passar por um aviso discreto.
          toast.error(`${resposta.data.adulterados.length} registo(s) adulterado(s).`);
        }
      } else {
        toast.error("Não foi possível verificar a integridade", {
          description: resposta.error.message,
        });
      }
    } finally {
      setVerificando(false);
    }
  }, [empresaId, desde, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const handleArquivar = useCallback(
    async (id: string, arquivado: boolean) => {
      if (!window.confirm(arquivado ? "Desarquivar este registo de auditoria?" : "Arquivar este registo de auditoria (soft-delete)?")) return;
      try {
        const res = arquivado ? await fiscalApi.desarquivarAuditoria(id) : await fiscalApi.arquivarAuditoria(id);
        if (res.success) {
          toast.success(arquivado ? "Registo desarquivado." : "Registo arquivado.");
          await carregar();
        } else {
          toast.error("Erro ao alterar registo.", { description: res.error.message });
        }
      } catch {
        toast.error("Erro inesperado ao alterar registo.");
      }
    },
    [carregar]
  );

  /** As acções presentes no ecrã, para sugerir em vez de obrigar a adivinhar. */
  const acoesSugeridas = useMemo(() => {
    const encontradas = new Set(registos.map((r) => r.acao));
    return [...encontradas].sort().slice(0, 12);
  }, [registos]);

  const linhas = useMemo(
    () =>
      registos.map((r) => [
        dataHora(r.dataHora),
        r.utilizadorLogin ?? "(sistema)",
        r.modulo,
        <StatusBadge key="acao" tone="info">
          {r.acao}
        </StatusBadge>,
        <StatusBadge key="sev" tone={TOM_SEVERIDADE[r.severidade] ?? "neutral"}>
          {r.severidade}
        </StatusBadge>,
        r.descricao,
        r.integridade ? (
          <span
            key="hash"
            className="font-mono text-[11px] text-muted-foreground"
            title={r.integridade}
          >
            {r.integridade.slice(0, 8)}…
          </span>
        ) : (
          <span key="hash" className="text-muted-foreground text-[11px]">
            sem pegada
          </span>
        ),
        <div key={`acoes-${r.id}`} className="flex items-center gap-1 justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { setSelecionado(r); setMostrarDetalhe(true); }}
            className="h-7 px-2 text-xs cursor-pointer"
            title="Ver detalhes do registo"
          >
            <Info className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleArquivar(r.id, r.arquivado)}
            className={`h-7 px-2 text-xs cursor-pointer ${r.arquivado ? "text-emerald-600" : "text-destructive"}`}
            title={r.arquivado ? "Desarquivar registo" : "Arquivar registo (soft-delete)"}
          >
            {r.arquivado ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
          </Button>
        </div>,
      ]),
    [registos, handleArquivar],
  );

  if (!empresaId) {
    return (
      <Panel title="Sem empresa associada">
        <p className="text-sm text-muted-foreground">
          A sessão não tem empresa. Não há auditoria para mostrar.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4" data-testid="auditoria">
      <Panel
        title="Filtros"
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={modulo === "financas" ? "default" : "outline"}
              onClick={() => setModulo((atual) => (atual === "financas" ? "" : "financas"))}
              disabled={carregando}
              data-testid="auditoria-filtro-financas"
              className="h-7 px-2 text-xs cursor-pointer"
              title="Mostrar apenas registos do módulo financeiro"
            >
              Só finanças
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void carregar()}
              disabled={carregando}
              className="h-7 px-2 text-xs cursor-pointer"
            >
              {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Recarregar
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Acção
            </span>
            <input
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              placeholder="ex.: exportar"
              data-testid="auditoria-acao"
              list="auditoria-acoes"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
            <datalist id="auditoria-acoes">
              {acoesSugeridas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Severidade
            </span>
            <select
              value={severidade}
              onChange={(e) => setSeveridade(e.target.value as typeof severidade)}
              data-testid="auditoria-severidade"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">Todas</option>
              <option value="info">Informação</option>
              <option value="aviso">Aviso</option>
              <option value="critico">Crítico</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Módulo
            </span>
            <select
              value={modulo}
              onChange={(e) => setModulo(e.target.value)}
              data-testid="auditoria-modulo"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="financas">Finanças</option>
              <option value="contabilidade">Contabilidade</option>
              <option value="fiscal">Fiscal</option>
              <option value="vendas">Vendas</option>
              <option value="compras">Compras</option>
              <option value="tesouraria">Tesouraria</option>
              <option value="stock">Stock</option>
              <option value="rh">RH</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Desde
            </span>
            <input
              type="datetime-local"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Até
            </span>
            <input
              type="datetime-local"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
          </label>

          <div className="flex flex-col justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void verificar()}
              disabled={verificando}
              data-testid="auditoria-verificar"
              className="h-8 text-xs cursor-pointer"
            >
              {verificando ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Fingerprint className="w-3.5 h-3.5" />
              )}
              Verificar integridade
            </Button>
                    <label className="flex items-center gap-2 mt-auto">
            <input
              type="checkbox"
              checked={incluirArquivados}
              onChange={(e) => setIncluirArquivados(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs">Incluir arquivados</span>
          </label>
</div>
        </div>

        {integridade && (
          <div
            data-testid="auditoria-integridade"
            className={[
              "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
              integridade.integro
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            ].join(" ")}
          >
            {integridade.integro ? (
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldX className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">
                {integridade.integro
                  ? `${integridade.totalVerificados} registo(s) verificado(s), pegada de integridade intacta.`
                  : `${integridade.adulterados.length} de ${integridade.totalVerificados} registo(s) não batem com a pegada.`}
              </p>
              {!integridade.integro && (
                <ul className="mt-1 space-y-0.5">
                  {integridade.adulterados.map((a) => (
                    <li key={a.id} className="font-mono text-[11px]">
                      {dataHora(a.dataHora)} — esperado {a.esperado.slice(0, 8)}…, obtido{" "}
                      {a.obtido.slice(0, 8)}…
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title={`Registos (${registos.length} de ${total})`}
        action={
          cursor ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void carregarMais()}
              disabled={carregando}
              data-testid="auditoria-mais"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Ver mais
            </Button>
          ) : undefined
        }
      >
        {carregando && registos.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">A ler o log…</span>
          </div>
        ) : registos.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-semibold">Sem registos para estes filtros</p>
            <p className="text-xs text-muted-foreground">
              Ajuste o período ou limpe a acção para ver mais.
            </p>
          </div>
        ) : (
          <DataTable
            columns={["Data", "Utilizador", "Módulo", "Acção", "Sev.", "Descrição", "Pegada", "Ações"]}
            rows={linhas}
          />
        )}
      </Panel>

      <Dialog open={mostrarDetalhe} onOpenChange={(o) => { if (!o) { setMostrarDetalhe(false); setSelecionado(null); }}}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-4 border-b border-border bg-muted/10">
            <DialogTitle>Detalhes do Registo de Auditoria</DialogTitle>
            <DialogDescription>{selecionado ? `ID: ${selecionado?.id}` : ''}</DialogDescription>
          </DialogHeader>
          {selecionado && (
            <div className="p-4 space-y-3 text-sm overflow-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Data:</span> <span className="font-mono">{dataHora(selecionado.dataHora)}</span></div>
                <div><span className="text-muted-foreground">Módulo:</span> {selecionado?.entidade}</div>
                <div><span className="text-muted-foreground">Acção:</span> {selecionado?.acao}</div>
                <div><span className="text-muted-foreground">Severidade:</span> {selecionado?.severidade}</div>
                <div><span className="text-muted-foreground">Entidade:</span> {selecionado?.entidade}{selecionado?.entidadeId ? `/${selecionado?.entidadeId}` : ''}</div>
                <div><span className="text-muted-foreground">Utilizador:</span> {selecionado?.utilizadorLogin ?? (selecionado?.utilizadorId ?? '-')}</div>
              </div>
              <div><span className="text-muted-foreground">Descrição:</span> <div className="mt-1 whitespace-pre-wrap">{selecionado?.descricao}</div></div>
              <div><span className="text-muted-foreground">IP:</span> {selecionado?.enderecoIp ?? '-'}</div>
              <div><span className="text-muted-foreground">Agente:</span> <span className="break-all">{selecionado?.agenteUtilizador ?? '-'}</span></div>
              <div><span className="text-muted-foreground">Hash (integridade):</span> <span className="font-mono break-all">{selecionado?.integridade ?? '-'}</span></div>
              <div><span className="text-muted-foreground">Arquivado:</span> {selecionado?.arquivado ? 'Sim' : 'Não'}</div>
              <div><span className="text-muted-foreground">Dados Anteriores:</span> <pre className="mt-1 bg-muted p-2 rounded text-[11px] overflow-auto max-h-48">{JSON.stringify(selecionado?.dadosAnteriores, null, 2)}</pre></div>
              <div><span className="text-muted-foreground">Dados Novos:</span> <pre className="mt-1 bg-muted p-2 rounded text-[11px] overflow-auto max-h-48">{JSON.stringify(selecionado?.dadosNovos, null, 2)}</pre></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}