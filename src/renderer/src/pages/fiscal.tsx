/**
 * @file fiscal.tsx
 * @description Ecrã fiscal: geração e validação SAF-T, conformidade AGT e
 * consulta da auditoria (SPRINT 5, `SAFT-01`/`SAFT-02`/`AGT-01`/`FIS-01`).
 *
 * Duas decisões que valem a pena registar porque não são óbvias:
 *
 * 1. **O âmbito da validação aparece ao lado do resultado.** O validador é
 *    estrutural, não normativa. Uma tela que só dissesse "válido" faria o
 *    utilizador acreditar que o ficheiro passou a validação da AT. Por isso
 *    o texto do `ambito` é renderizado sempre que há resultado.
 *
 * 2. **Gerar e validar são acções distintas.** Validar não escreve nada em
 *    disco e só exige `read`; gerar grava o ficheiro e exige `write`. São
 *    botões diferentes porque têm consequências diferentes.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileCode,
  FileCheck2,
  Building2,
  History,
  Info,
  CheckCircle2,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { KpiCard, Panel, DataTable, StatusBadge } from "../components/erp/Primitives";
import { fiscalApi } from "../api/fiscal.api";
import { useAuth } from "../hooks/useAuth";
import type {
  AuditoriaLogDto,
  EstadoSubmissaoAgtDto,
  FicheiroAgtDto,
  ProblemaConformidadeAgtDto,
  ProblemaFiscalDto,
  ResultadoGerarSaftDto,
  ResultadoValidarSaftDto,
  SubmissaoAgtDto,
  VerificacaoIntegridadeDto,
} from "@renderer/@types/electron";
import { Button } from "@renderer/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@renderer/components/ui/dialog";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import { toast } from "sonner";

type Tab = "saft" | "agt" | "auditoria";

const MESES = [
  { value: "", label: "Ano inteiro" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export default function FiscalPage() {
  const [tab, setTab] = useState<Tab>("saft");

  return (
    <ErpShell
      active="fiscal"
      activeTab={tab}
      title="Fiscal — Conformidade e Auditoria"
      breadcrumb={["Fiscal", rotuloTab(tab)]}
      ribbon={[
        {
          label: "SAF-T",
          actions: [
            {
              label: "Gerar / validar",
              icon: <ShieldCheck className="w-5 h-5" />,
              onClick: () => setTab("saft"),
              tabKey: "saft",
            },
          ],
        },
        {
          label: "AGT",
          actions: [
            {
              label: "Conformidade",
              icon: <Building2 className="w-5 h-5" />,
              onClick: () => setTab("agt"),
              tabKey: "agt",
            },
          ],
        },
        {
          label: "Auditoria",
          actions: [
            {
              label: "Registo",
              icon: <History className="w-5 h-5" />,
              onClick: () => setTab("auditoria"),
              tabKey: "auditoria",
            },
          ],
        },
      ]}
    >
      {tab === "saft" && <SaftPainel />}
      {tab === "agt" && <AgtPainel />}
      {tab === "auditoria" && <AuditoriaPainel />}
    </ErpShell>
  );
}

function rotuloTab(tab: Tab): string {
  return { saft: "SAF-T", agt: "Conformidade AGT", auditoria: "Auditoria" }[tab];
}

/** Ano corrente da máquina, como ponto de partida do selector. */
const ANO_CORRENTE = new Date().getFullYear();

/** Converte `""` (ano inteiro) em `null`, que é o que o main espera. */
/**
 * Período fiscal para os pedidos ao Main.
 *
 * A empresa vem da sessão e não de um estado do ecrã: o Main recusa qualquer
 * `empresaId` que não seja o da sessão, e um `""` aqui é um erro de validação
 * mostrado ao utilizador em vez de um relatório vazio.
 */
function periodoDe(ano: string, mes: string, incluirAnulados: boolean, empresaId: string) {
  return {
    empresaId,
    ano: Number(ano),
    mes: mes === "" ? null : Number(mes),
    incluirAnulados,
  };
}

// =============================================================================
// SAF-T
// =============================================================================

/**
 * Mês por omissão: o mês corrente, para o caso mais comum ser "o período
 * que acabei de fechar". Uma empresa pode querer o ano inteiro; daí o
 * selector ter "Ano inteiro" como primeira opção e não como omissão.
 */
const MES_CORRENTE = new Date().getMonth() + 1;

function SaftPainel() {
  const user = useAuth((s) => s.user);
  const [ano, setAno] = useState(String(ANO_CORRENTE));
  const [mes, setMes] = useState(String(MES_CORRENTE));
  const [incluirAnulados, setIncluirAnulados] = useState(false);
  const [ocupado, setOcupado] = useState<"validar" | "gerar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<ResultadoValidarSaftDto | null>(null);
  const [gerado, setGerado] = useState<ResultadoGerarSaftDto | null>(null);

  const empresaId = user?.empresaConfigId ?? null;

  const validar = useCallback(async () => {
    if (!empresaId) {
      setErro("Sessão sem empresa associada: não há que ficheiro fiscal gerar.");
      return;
    }
    setOcupado("validar");
    setErro(null);
    setGerado(null);

    const resposta = await fiscalApi.validarSaft(periodoDe(ano, mes, incluirAnulados, empresaId));
    setOcupado(null);

    if (resposta.success) setValidacao(resposta.data);
    else {
      setErro(resposta.error.message);
      setValidacao(null);
    }
  }, [ano, mes, incluirAnulados, empresaId]);

  const gerar = useCallback(async () => {
    if (!empresaId) {
      setErro("Sessão sem empresa associada: não há que ficheiro fiscal gerar.");
      return;
    }
    setOcupado("gerar");
    setErro(null);

    const resposta = await fiscalApi.gerarSaft(periodoDe(ano, mes, incluirAnulados, empresaId));
    setOcupado(null);

    if (resposta.success) {
      setGerado(resposta.data);
      setValidacao(null);
    } else {
      setErro(resposta.error.message);
    }
  }, [ano, mes, incluirAnulados, empresaId]);

  const removerProblemaValidacao = (idx: number) => {
    setValidacao((prev) => {
      if (!prev) return null;
      const novos = prev.problemas.filter((_, i) => i !== idx);
      const totalErros = novos.filter((p) => p.severidade === "erro").length;
      const totalAvisos = novos.filter((p) => p.severidade === "aviso").length;
      return {
        ...prev,
        problemas: novos,
        totalErros,
        totalAvisos,
        valido: totalErros === 0,
      };
    });
  };

  const limparProblemasValidacao = () => {
    setValidacao((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        problemas: [],
        totalErros: 0,
        totalAvisos: 0,
        valido: true,
      };
    });
  };

  const removerProblemaGerado = (idx: number) => {
    setGerado((prev) => {
      if (!prev) return null;
      const novos = prev.problemas.filter((_, i) => i !== idx);
      return {
        ...prev,
        problemas: novos,
        avisos: novos.length,
      };
    });
  };

  const limparProblemasGerado = () => {
    setGerado((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        problemas: [],
        avisos: 0,
      };
    });
  };

  return (
    <div className="space-y-4">
      <Panel title="Geração de ficheiro SAF-T (PT / AO)">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Ano fiscal
            </span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              className="border border-border rounded-md bg-background px-3 py-2 text-sm"
              data-testid="saft-ano"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Período
            </span>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="border border-border rounded-md bg-background px-3 py-2 text-sm"
              data-testid="saft-mes"
            >
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Anulados
            </span>
            <span className="flex items-center gap-2 text-sm py-2">
              <input
                type="checkbox"
                checked={incluirAnulados}
                onChange={(e) => setIncluirAnulados(e.target.checked)}
                data-testid="saft-anulados"
              />
              Incluir no ficheiro
            </span>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={validar}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              data-testid="saft-validar"
            >
              <FileCheck2 className="w-4 h-4" />
              {ocupado === "validar" ? "A validar…" : "Validar"}
            </button>
            <button
              type="button"
              onClick={gerar}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              data-testid="saft-gerar"
            >
              <FileCode className="w-4 h-4" />
              {ocupado === "gerar" ? "A gerar…" : "Gerar"}
            </button>
          </div>
        </div>
      </Panel>

      {erro && <Banner tone="danger" icon={<ShieldAlert className="w-4 h-4" />}>{erro}</Banner>}

      {validacao && (
        <SaftValidacao
          resultado={validacao}
          onRemoverProblema={removerProblemaValidacao}
          onLimparProblemas={limparProblemasValidacao}
        />
      )}

      {gerado && (
        <SaftGerado
          resultado={gerado}
          onRemoverProblema={removerProblemaGerado}
          onLimparProblemas={limparProblemasGerado}
        />
      )}
    </div>
  );
}

/** Estatísticas + aviso de âmbito + lista de problemas. */
function SaftValidacao({
  resultado,
  onRemoverProblema,
  onLimparProblemas,
}: {
  resultado: ResultadoValidarSaftDto;
  onRemoverProblema?: (idx: number) => void;
  onLimparProblemas?: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Documentos" value={String(resultado.documentos ?? 0)} icon={<FileCode className="w-5 h-5" />} />
        <KpiCard label="Clientes" value={String(resultado.clientes ?? 0)} />
        <KpiCard label="Artigos" value={String(resultado.artigos ?? 0)} />
        <KpiCard
          label="Total líquido"
          value={formatarMoeda(resultado.totalLiquido ?? 0)}
          hint={`${resultado.totalErros} erro(s), ${resultado.totalAvisos} aviso(s)`}
        />
      </div>

      <Banner tone={resultado.valido ? "success" : "danger"} icon={resultado.valido ? <CheckCircle2 className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}>
        {resultado.valido
          ? `${resultado.nomeFicheiro}: passou a validação estrutural.`
          : `${resultado.nomeFicheiro}: ${resultado.totalErros} erro(s) impedem a exportação.`}
      </Banner>

      <Banner tone="info" icon={<Info className="w-4 h-4" />}>
        {resultado.ambito}
      </Banner>

      {resultado.problemas.length > 0 && (
        <TabelaProblemas
          problemas={resultado.problemas}
          onRemover={onRemoverProblema}
          onLimparTudo={onLimparProblemas}
        />
      )}
    </>
  );
}

function SaftGerado({
  resultado,
  onRemoverProblema,
  onLimparProblemas,
}: {
  resultado: ResultadoGerarSaftDto;
  onRemoverProblema?: (idx: number) => void;
  onLimparProblemas?: () => void;
}) {
  return (
    <>
      <Banner tone="success" icon={<CheckCircle2 className="w-4 h-4" />}>
        <span>
          Ficheiro gravado em <code className="font-mono text-xs">{resultado.caminho}</code>.
        </span>
      </Banner>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Documentos" value={String(resultado.estatisticas.documentos)} />
        <KpiCard label="Total líquido" value={formatarMoeda(resultado.estatisticas.totalLiquido)} />
        <KpiCard label="Avisos" value={String(resultado.avisos)} hint="não impedem a exportação" />
        <KpiCard label="Hash SHA-256" value={`${resultado.hashFicheiro.slice(0, 12)}…`} hint={resultado.nomeFicheiro} />
      </div>

      {resultado.problemas.length > 0 && (
        <TabelaProblemas
          problemas={resultado.problemas}
          onRemover={onRemoverProblema}
          onLimparTudo={onLimparProblemas}
        />
      )}
    </>
  );
}

// =============================================================================
// AGT
// =============================================================================

function AgtPainel() {
  const user = useAuth((s) => s.user);
  const empresaId = user?.empresaConfigId ?? null;

  const [ano, setAno] = useState(String(ANO_CORRENTE));
  const [mes, setMes] = useState("");
  const [software, setSoftware] = useState({ nome: "SOC TECHNO", versao: "1.0.0", chaveSeguranca: "", certificado: "" });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<FicheiroAgtDto | null>(null);
  const [historico, setHistorico] = useState<SubmissaoAgtDto[]>([]);

  const carregarHistorico = useCallback(async () => {
    if (!empresaId) return;
    const resposta = await fiscalApi.listarSubmissoes({ empresaId, limite: 20 });
    if (resposta.success) setHistorico(resposta.data);
  }, [empresaId]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const gerar = useCallback(async () => {
    if (!empresaId) {
      setErro("Sessão sem empresa associada.");
      return;
    }
    setOcupado(true);
    setErro(null);
    setResultado(null);

    const resposta = await fiscalApi.gerarAgt(
      periodoDe(ano, mes, false, empresaId),
      software,
    );
    setOcupado(false);

    if (resposta.success) {
      setResultado(resposta.data);
      await carregarHistorico();
    } else {
      setErro(resposta.error.message);
    }
  }, [ano, mes, software, empresaId, carregarHistorico]);

  return (
    <div className="space-y-4">
      <Panel title="Conformidade AGT (Angola) — AOA">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Ano</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              className="border border-border rounded-md bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Período</span>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="border border-border rounded-md bg-background px-3 py-2 text-sm"
            >
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={gerar}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              data-testid="agt-gerar"
            >
              <Building2 className="w-4 h-4" />
              {ocupado ? "A verificar…" : "Verificar conformidade"}
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
            Identificação do software que assina
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Nome</span>
              <input
                value={software.nome}
                onChange={(e) => setSoftware((s) => ({ ...s, nome: e.target.value }))}
                className="border border-border rounded-md bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Versão</span>
              <input
                value={software.versao}
                onChange={(e) => setSoftware((s) => ({ ...s, versao: e.target.value }))}
                className="border border-border rounded-md bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Chave de segurança</span>
              <input
                type="password"
                value={software.chaveSeguranca}
                onChange={(e) => setSoftware((s) => ({ ...s, chaveSeguranca: e.target.value }))}
                className="border border-border rounded-md bg-background px-3 py-2 text-sm"
                placeholder="Emitida pela AGT"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Certificado</span>
              <input
                value={software.certificado}
                onChange={(e) => setSoftware((s) => ({ ...s, certificado: e.target.value }))}
                className="border border-border rounded-md bg-background px-3 py-2 text-sm"
                placeholder="Série do certificado"
              />
            </label>
          </div>
        </div>
      </Panel>

      <Banner tone="info" icon={<Info className="w-4 h-4" />}>
        Este módulo verifica a conformidade e calcula as assinaturas. Não submete nada à AGT: a
        submissão é feita pelo software certificado do operador, e o resultado é registado aqui
        depois.
      </Banner>

      {erro && <Banner tone="danger" icon={<ShieldAlert className="w-4 h-4" />}>{erro}</Banner>}

      {resultado && <AgtResultado resultado={resultado} />}

      {historico.length > 0 && (
        <Panel title="Rastreio de ficheiros">
          <DataTable
            columns={["Ficheiro", "Período", "Estado", "Conformidade", "Hash", "Gerado"]}
            rows={historico.map((s) => [
              s.nomeFicheiro,
              s.periodo,
              <EstadoSubmissaoBadge estado={s.estado} />,
              s.conformidade
                ? s.conformidade.conforme
                  ? <StatusBadge tone="success">Conforme</StatusBadge>
                  : <StatusBadge tone="danger">{s.conformidade.resumo.erros} erro(s)</StatusBadge>
                : "—",
              <code className="font-mono text-xs">{s.hashFicheiro.slice(0, 12)}…</code>,
              formatarDataHora(s.dataHora),
            ])}
          />
        </Panel>
      )}
    </div>
  );
}

function AgtResultado({ resultado }: { resultado: FicheiroAgtDto }) {
  const conformes = resultado.documentos.filter((d) => d.conforme).length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ficheiro" value={resultado.nomeFicheiro} hint={`versão ${resultado.versao}`} />
        <KpiCard label="Documentos" value={`${conformes}/${resultado.documentos.length}`} hint="conformes" />
        <KpiCard
          label="Erros"
          value={String(resultado.conformidade.resumo.erros)}
          trend={resultado.conformidade.resumo.erros > 0 ? "down" : "up"}
        />
        <KpiCard label="Avisos" value={String(resultado.conformidade.resumo.avisos)} />
      </div>

      <Banner
        tone={resultado.conformidade.conforme ? "success" : "danger"}
        icon={resultado.conformidade.conforme ? <CheckCircle2 className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
      >
        {resultado.conformidade.conforme
          ? `${resultado.nomeFicheiro} conforme. Assinaturas calculadas para ${conformes} documento(s).`
          : `${resultado.conformidade.resumo.erros} erro(s) impedem a submissão. Documentos não conformes não são assinados.`}
      </Banner>

      {resultado.conformidade.problemas.length > 0 && <TabelaProblemasAgt problemas={resultado.conformidade.problemas} />}

      {resultado.documentos.length > 0 && (
        <Panel title="Estado por documento">
          <DataTable
            columns={["Documento", "Conformidade", "Assinatura (ATC-UD)"]}
            rows={resultado.documentos.map((d) => [
              d.numero,
              d.conforme
                ? <StatusBadge tone="success">Conforme</StatusBadge>
                : <StatusBadge tone="danger">{d.problemas.length} problema(s)</StatusBadge>,
              d.assinatura
                ? <code className="font-mono text-xs">{d.assinatura.slice(0, 20)}…</code>
                : <span className="text-muted-foreground">não assinado</span>,
            ])}
          />
        </Panel>
      )}
    </>
  );
}

const ROTULOS_ESTADO: Record<EstadoSubmissaoAgtDto, string> = {
  rascunho: "Rascunho",
  assinado: "Assinado",
  submetido: "Submetido",
  aceite: "Aceite",
  rejeitado: "Rejeitado",
};

const TONS_ESTADO: Record<EstadoSubmissaoAgtDto, "neutral" | "info" | "success" | "danger"> = {
  rascunho: "neutral",
  assinado: "info",
  submetido: "info",
  aceite: "success",
  rejeitado: "danger",
};

function EstadoSubmissaoBadge({ estado }: { estado: EstadoSubmissaoAgtDto }) {
  return <StatusBadge tone={TONS_ESTADO[estado]}>{ROTULOS_ESTADO[estado]}</StatusBadge>;
}

// =============================================================================
// Auditoria
// =============================================================================

function AuditoriaPainel() {
  const user = useAuth((s) => s.user);
  const empresaId = user?.empresaConfigId ?? null;

  const [registos, setRegistos] = useState<AuditoriaLogDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [integridade, setIntegridade] = useState<VerificacaoIntegridadeDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [selecionado, setSelecionado] = useState<AuditoriaLogDto | null>(null);
  const [mostrarDetalhe, setMostrarDetalhe] = useState(false);

  const carregar = useCallback(
    async (proximo?: string) => {
      if (!empresaId) return;
      setOcupado(true);
      setErro(null);

      const resposta = await fiscalApi.listarAuditoria({
        empresaId,
        cursor: proximo,
        limite: 50,
      });
      setOcupado(false);

      if (!resposta.success) {
        setErro(resposta.error.message);
        return;
      }

      setRegistos((anteriores) => (proximo ? [...anteriores, ...resposta.data.registos] : resposta.data.registos));
      setCursor(resposta.data.proximoCursor);
      setTotal(resposta.data.total);
    },
    [empresaId],
  );

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

  const verificar = useCallback(async () => {
    if (!empresaId) return;
    setOcupado(true);
    setErro(null);
    const resposta = await fiscalApi.verificarIntegridade({ empresaId, limite: 1000 });
    setOcupado(false);
    if (resposta.success) {
      setIntegridade(resposta.data);
    } else {
      setErro(resposta.error.message);
    }
  }, [empresaId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Registos" value={String(total)} hint="no log da empresa" />
        <KpiCard label="Carregados" value={String(registos.length)} hint="nesta página" />
        <KpiCard
          label="Integridade"
          value={integridade ? (integridade.integro ? "Íntegro" : "Adulterado") : "—"}
          trend={integridade?.integro === false ? "down" : "up"}
          hint={integridade ? `${integridade.totalVerificados} verificados` : "por verificar"}
        />
        <div className="bg-card border border-border rounded-md p-4 flex flex-col justify-center gap-2">
          <button
            type="button"
            onClick={verificar}
            className="inline-flex items-center justify-center gap-1.5 border border-border rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
            data-testid="auditoria-verificar"
          >
            <ShieldCheck className="w-4 h-4" />
            Verificar integridade
          </button>
        </div>
      </div>

      {integridade && !integridade.integro && (
        <Banner tone="danger" icon={<ShieldAlert className="w-4 h-4" />}>
          {integridade.adulterados.length} registo(s) não batem com o seu hash. A linha foi alterada
          depois de gravada.
        </Banner>
      )}

      {integridade?.integro && (
        <Banner tone="success" icon={<CheckCircle2 className="w-4 h-4" />}>
          Os {integridade.totalVerificados} registos verificados batem com o hash gravado.
        </Banner>
      )}

      {erro && <Banner tone="danger" icon={<ShieldAlert className="w-4 h-4" />}>{erro}</Banner>}

      <Panel
        title="Registo de auditoria"
        action={ocupado ? <span className="text-xs text-muted-foreground">A carregar…</span> : undefined}
      >
        {registos.length === 0 && !ocupado ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Ainda não há registos de auditoria.
          </p>
        ) : (
          <DataTable
            columns={["Quando", "Utilizador", "Acção", "Entidade", "Descrição", "Severidade", "Ações"]}
            rows={registos.map((r) => [
              formatarDataHora(r.dataHora),
              r.utilizadorLogin ?? "—",
              ROTULOS_ACAO[r.acao] ?? r.acao,
              r.entidadeId ? `${r.entidade}/${r.entidadeId}` : r.entidade,
              r.descricao,
              <SeveridadeBadge key={`sev-${r.id}`} severidade={r.severidade} />,
              <div key={`acoes-${r.id}`} className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSelecionado(r);
                    setMostrarDetalhe(true);
                  }}
                  title="Ver detalhes do registo"
                  data-testid={`auditoria-detalhe-${r.id}`}
                  className="h-7 px-2 text-xs cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleArquivar(r.id, r.arquivado)}
                  className={`h-7 px-2 text-xs cursor-pointer ${r.arquivado ? "text-emerald-600" : "text-destructive"}`}
                  title={r.arquivado ? "Desarquivar registo" : "Arquivar registo (soft-delete)"}
                  data-testid={`auditoria-arquivar-${r.id}`}
                >
                  {r.arquivado ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>,
            ])}
          />
        )}

        {cursor && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => carregar(cursor)}
              disabled={ocupado}
              className="border border-border rounded-md px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              Carregar mais
            </button>
          </div>
        )}
      </Panel>

      <Dialog open={mostrarDetalhe} onOpenChange={(o) => { if (!o) { setMostrarDetalhe(false); setSelecionado(null); }}}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-4 border-b border-border bg-muted/10">
            <DialogTitle>Detalhes do Registo de Auditoria</DialogTitle>
            <DialogDescription>{selecionado ? `ID: ${selecionado?.id}` : ''}</DialogDescription>
          </DialogHeader>
          {selecionado && (
            <ScrollArea className="max-h-[70vh] p-4 space-y-4">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Identificação</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">ID</span><div className="font-mono break-all mt-1">{selecionado.id}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Data/Hora</span><div className="mt-1">{new Date(selecionado.dataHora).toLocaleString("pt-PT")}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Empresa</span><div className="mt-1">{selecionado.empresaId}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Utilizador</span><div className="mt-1">{selecionado.utilizadorId ?? "—"} {selecionado.utilizadorLogin ? `(${selecionado.utilizadorLogin})` : ""}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">IP</span><div className="mt-1">{selecionado.enderecoIp ?? "—"}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Agente</span><div className="mt-1 whitespace-normal break-words">{selecionado.agenteUtilizador ?? "—"}</div></div>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Evento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Módulo</span><div className="mt-1">{selecionado.entidade}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Entidade ID</span><div className="mt-1 font-mono">{selecionado.entidadeId ?? "—"}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Acção</span><div className="mt-1">{selecionado.acao}</div></div>
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Severidade</span><div className="mt-1"><SeveridadeBadge severidade={selecionado.severidade} /></div></div>
                  <div className="rounded-md border p-2 col-span-1 sm:col-span-2"><span className="text-muted-foreground">Descrição</span><div className="mt-1 whitespace-pre-wrap break-words">{selecionado.descricao}</div></div>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Alterações</h3>
                {selecionado.dadosAnteriores !== null && selecionado.dadosAnteriores !== undefined ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Dados anteriores</div>
                    <pre className="rounded-md border bg-muted/20 p-2 text-[11px] overflow-auto max-h-64 whitespace-pre-wrap break-words">{JSON.stringify(selecionado.dadosAnteriores, null, 2)}</pre>
                  </div>
                ) : <p className="text-xs text-muted-foreground">Sem dados anteriores.</p>}
                {selecionado.dadosNovos !== null && selecionado.dadosNovos !== undefined ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Dados novos</div>
                    <pre className="rounded-md border bg-muted/20 p-2 text-[11px] overflow-auto max-h-64 whitespace-pre-wrap break-words">{JSON.stringify(selecionado.dadosNovos, null, 2)}</pre>
                  </div>
                ) : <p className="text-xs text-muted-foreground">Sem dados novos.</p>}
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Integridade</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2 col-span-1 sm:col-span-2"><span className="text-muted-foreground">Hash (SHA-256)</span><div className="mt-1 font-mono break-all">{selecionado.integridade ?? "—"}</div></div>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Metadados</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2"><span className="text-muted-foreground">Arquivado</span><div className="mt-1">{selecionado.arquivado ? "Sim" : "Não"}</div></div>
                </div>
              </section>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ROTULOS_ACAO: Record<string, string> = {
  criar: "Criou",
  actualizar: "Actualizou",
  eliminar: "Eliminou",
  exportar: "Exportou",
  validar: "Validou",
  imprimir: "Imprimiu",
  login: "Entrou",
  logout: "Saiu",
  anular: "Anulou",
  submeter: "Submeteu",
};

function SeveridadeBadge({ severidade }: { severidade: AuditoriaLogDto["severidade"] }) {
  const tom = severidade === "critico" ? "danger" : severidade === "aviso" ? "warning" : "neutral";
  const rotulo = severidade === "critico" ? "Crítico" : severidade === "aviso" ? "Aviso" : "Info";
  return <StatusBadge tone={tom}>{rotulo}</StatusBadge>;
}

// =============================================================================
// Componentes partilhados
// =============================================================================

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "success" | "danger" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const tons = {
    success: "border-success/40 bg-success/10 text-success",
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    info: "border-info/40 bg-info/10 text-foreground",
  };

  return (
    <div className={`flex items-start gap-2 border rounded-md px-4 py-3 text-sm ${tons[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function TabelaProblemas({
  problemas,
  onRemover,
  onLimparTudo,
}: {
  problemas: ProblemaFiscalDto[];
  onRemover?: (idx: number) => void;
  onLimparTudo?: () => void;
}) {
  return (
    <Panel
      title={`Problemas encontrados (${problemas.length})`}
      action={
        onLimparTudo && problemas.length > 0 ? (
          <button
            type="button"
            onClick={onLimparTudo}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 border border-destructive/30 rounded px-2.5 py-1 bg-destructive/5 transition-colors"
            title="Limpar todos os problemas"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar todos
          </button>
        ) : undefined
      }
    >
      <DataTable
        columns={["Código", "Severidade", "Mensagem", "Onde", "Acção"]}
        rows={problemas.map((p, idx) => [
          <code key={`cod-${idx}`} className="font-mono text-xs">{p.codigo}</code>,
          p.severidade === "erro"
            ? <StatusBadge key={`sev-${idx}`} tone="danger">Erro</StatusBadge>
            : <StatusBadge key={`sev-${idx}`} tone="warning">Aviso</StatusBadge>,
          p.mensagem,
          <span key={`cam-${idx}`} className="text-xs font-mono text-muted-foreground">{p.caminho ?? "—"}</span>,
          onRemover ? (
            <button
              key={`del-${idx}`}
              type="button"
              onClick={() => onRemover(idx)}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1 border border-destructive/20 transition-colors"
              title="Apagar problema"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Apagar
            </button>
          ) : "—",
        ])}
      />
    </Panel>
  );
}

function TabelaProblemasAgt({ problemas }: { problemas: ProblemaConformidadeAgtDto[] }) {
  return (
    <Panel title={`Problemas de conformidade (${problemas.length})`}>
      <DataTable
        columns={["Código", "Severidade", "Mensagem", "Campo"]}
        rows={problemas.map((p) => [
          <code className="font-mono text-xs">{p.codigo}</code>,
          p.severidade === "erro"
            ? <StatusBadge tone="danger">Erro</StatusBadge>
            : p.severidade === "aviso"
              ? <StatusBadge tone="warning">Aviso</StatusBadge>
              : <StatusBadge tone="info">Info</StatusBadge>,
          p.mensagem,
          <span className="text-xs font-mono text-muted-foreground">{p.campo ?? "—"}</span>,
        ])}
      />
    </Panel>
  );
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor ?? 0);
}

function formatarDataHora(valor: string | Date): string {
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-PT");
}