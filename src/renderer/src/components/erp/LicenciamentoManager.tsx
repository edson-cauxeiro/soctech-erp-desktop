/**
 * @file LicenciamentoManager.tsx
 * @description 7.ª aba de Configurações: estado da licença, módulos e importação.
 *
 * Toda a decisão vem do Main (`window.api.licensing`). A interface apenas
 * apresenta o estado devolvido e pede confirmação antes de substituir ou
 * remover a licença. O RBAC da página continua a ser verificado no Main:
 * esconder botões aqui é conveniência, não segurança.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  FileUp,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, KpiCard, Panel, StatusBadge } from "@/components/erp/Primitives";
import { licensingApi, type SelecaoLicencaDto } from "@/api/licensing.api";
import { useAuth } from "@/hooks/useAuth";
import { useLicensing } from "@/hooks/useLicensing";
import { toast } from "sonner";
import type {
  LicensePreviewResult,
  LicenseStatus,
  LicenseStatusResult,
} from "../../../../shared/licensing/types";

type TomBadge = "neutral" | "success" | "warning" | "danger" | "info";

const TOM_ESTADO: Record<LicenseStatus, TomBadge> = {
  MISSING: "neutral",
  VALID: "success",
  NOT_YET_VALID: "warning",
  EXPIRED: "danger",
  INVALID_SIGNATURE: "danger",
  INVALID_FORMAT: "danger",
  PRODUCT_MISMATCH: "danger",
  INSTALLATION_MISMATCH: "danger",
  UNKNOWN_KEY: "danger",
};

const TOM_SEVERIDADE: Record<string, TomBadge> = {
  info: "neutral",
  aviso: "warning",
  critico: "danger",
};

interface EventoLicenciamentoDto {
  id: string;
  dataHora: string | Date;
  acao: string;
  severidade: string;
  descricao: string;
  utilizadorLogin?: string | null;
}

interface HistoricoLicenciamentoDto {
  registos: EventoLicenciamentoDto[];
  total: number;
  proximoCursor: string | null;
}

function dataHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function apenasData(valor: string | null | undefined): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function mensagemErro(resposta: { error: { message: string } }, fallback: string) {
  toast.error(resposta.error.message || fallback);
}

/** Linhas da pré-visualização, partilhadas pela importação e pelo resumo. */
function linhasResumo(preview: LicensePreviewResult): (string | ReactNode)[][] {
  const resumo = preview.summary;
  if (!resumo) return [];
  return [
    ["Identificador", resumo.licenseId],
    ["Titular", resumo.customerName],
    ["NIF", resumo.customerTaxNumber ?? "—"],
    ["Produto", resumo.productId],
    ["Emitida em", apenasData(resumo.issuedAt)],
    ["Válida desde", apenasData(resumo.notBefore)],
    ["Validade", resumo.expiresAt ? apenasData(resumo.expiresAt) : "Sem expiração"],
    ["Chave", resumo.keyId],
    [
      "Vinculação",
      resumo.bindingMode === "installation"
        ? `Instalação ${resumo.installationId?.slice(0, 8) ?? "—"}`
        : "Sem vinculação",
    ],
    [
      "Limites",
      `Utilizadores: ${resumo.limits.maxUsers ?? "livre"} · Dispositivos: ${resumo.limits.maxDevices ?? "livre"}`,
    ],
  ];
}

export function LicenciamentoManager() {
  const podeAdministrar = useAuth((s) => s.hasPermission("configuracoes", "admin"));

  const [estado, setEstado] = useState<LicenseStatusResult | null>(null);
  const [eventos, setEventos] = useState<EventoLicenciamentoDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [operando, setOperando] = useState(false);
  const [selecao, setSelecao] = useState<SelecaoLicencaDto | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [respostaEstado, respostaEventos] = await Promise.all([
        licensingApi.getStatus(),
        licensingApi.getEvents(50),
      ]);

      if (respostaEstado.success) {
        setEstado(respostaEstado.data);
      } else {
        mensagemErro(respostaEstado, "Não foi possível consultar a licença.");
      }

      if (respostaEventos.success) {
        const historico = respostaEventos.data as HistoricoLicenciamentoDto;
        setEventos(Array.isArray(historico?.registos) ? historico.registos : []);
      }
      // O histórico não é essencial: falha silenciosamente para não impedir a
      // leitura do estado nem a importação de uma licença nova.
    } catch {
      toast.error("Erro inesperado ao carregar o licenciamento.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const handleSelecionarFicheiro = useCallback(async () => {
    setOperando(true);
    try {
      const resposta = await licensingApi.selectFile();
      if (!resposta.success) {
        mensagemErro(resposta, "Não foi possível ler o ficheiro de licença.");
        return;
      }
      if (resposta.data.cancelado) return;
      if (!resposta.data.conteudo || !resposta.data.previsualizacao) {
        toast.error("O ficheiro selecionado não contém uma licença.");
        return;
      }
      setSelecao(resposta.data);
    } finally {
      setOperando(false);
    }
  }, []);

  const handleImportar = useCallback(async () => {
    if (!selecao?.conteudo) return;

    setOperando(true);
    try {
      const resposta = await licensingApi.import(selecao.conteudo);
      if (!resposta.success) {
        mensagemErro(resposta, "Não foi possível importar a licença.");
        return;
      }
      toast.success(`Licença ${resposta.data.summary?.licenseId ?? ""} instalada com sucesso.`);
      setSelecao(null);
      // A navegação lateral e as guardas de rota partilham este store: sem
      // actualizá-lo, os módulos só apareciam depois de reiniciar.
      void useLicensing.getState().carregar();
      await carregar();
    } finally {
      setOperando(false);
    }
  }, [selecao, carregar]);

  const handleRemover = useCallback(async () => {
    setOperando(true);
    try {
      const resposta = await licensingApi.remove();
      if (!resposta.success) {
        mensagemErro(resposta, "Não foi possível remover a licença.");
        return;
      }
      toast.success("Licença removida. Os dados de negócio foram preservados.");
      setConfirmarRemocao(false);
      void useLicensing.getState().carregar();
      await carregar();
    } finally {
      setOperando(false);
    }
  }, [carregar]);

  const modulos = estado?.modules ?? [];
  const licenciados = estado?.licensedModules.length ?? 0;

  const linhasModulos = useMemo(
    () =>
      modulos.map((modulo) => [
        modulo.label,
        <StatusBadge
          key={`lic-${modulo.key}`}
          tone={modulo.licensed ? "success" : modulo.alwaysAvailable ? "info" : "neutral"}
        >
          {modulo.licensed ? "Licenciado" : modulo.alwaysAvailable ? "Sempre disponível" : "Não licenciado"}
        </StatusBadge>,
        modulo.alwaysAvailable ? "Funcionalidade essencial" : "Módulo comercial",
        modulo.dependencies.length > 0 ? modulo.dependencies.join(", ") : "—",
      ]),
    [modulos]
  );

  const linhasEventos = useMemo(
    () =>
      eventos.map((evento) => [
        dataHora(evento.dataHora),
        evento.utilizadorLogin ?? "(sistema)",
        evento.acao,
        <StatusBadge key={`sev-${evento.id}`} tone={TOM_SEVERIDADE[evento.severidade] ?? "neutral"}>
          {evento.severidade}
        </StatusBadge>,
        evento.descricao,
      ]),
    [eventos]
  );

  if (carregando && !estado) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-2" data-testid="licenciamento">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs">A carregar licenciamento...</span>
      </div>
    );
  }

  const preview = selecao?.previsualizacao;
  const substituiLicenca = Boolean(estado && estado.status !== "MISSING");

  return (
    <div className="space-y-4" data-testid="licenciamento">
      <Panel
        title="Estado da licença"
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void carregar()}
              disabled={carregando || operando}
              data-testid="licenciamento-recarregar"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Recarregar
            </Button>
            {podeAdministrar && (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSelecionarFicheiro()}
                  disabled={operando}
                  data-testid="licenciamento-importar"
                  className="h-7 px-2 text-xs cursor-pointer"
                >
                  {operando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                  Importar licença
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmarRemocao(true)}
                  disabled={operando || estado?.status === "MISSING"}
                  data-testid="licenciamento-remover"
                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </Button>
              </>
            )}
          </div>
        }
      >
        <div
          className="flex items-start gap-3 p-3 rounded-md bg-muted/40 border border-border"
          data-testid="licenciamento-estado"
        >
          {estado?.status === "VALID" ? (
            <BadgeCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TOM_ESTADO[estado?.status ?? "MISSING"]}>
                {estado?.status ?? "MISSING"}
              </StatusBadge>
              <span className="text-sm font-medium">{estado?.message ?? "Licença não instalada."}</span>
            </div>
            {estado?.installationId && (
              <p className="text-[11px] text-muted-foreground font-mono break-all">
                Instalação: {estado.installationId}
              </p>
            )}
            {(estado?.status === "EXPIRED" || estado?.status === "NOT_YET_VALID") && (
              <p className="text-[11px] text-muted-foreground">
                A validade é lida do documento assinado. Para regularizar, importe uma licença atualizada.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <KpiCard
            label="Situação"
            value={estado?.status ?? "MISSING"}
            testId="licenciamento-kpi-estado"
          />
          <KpiCard
            label="Módulos licenciados"
            value={`${licenciados} / ${modulos.length}`}
            testId="licenciamento-kpi-modulos"
          />
          <KpiCard
            label="Validade"
            value={estado?.summary?.expiresAt ? apenasData(estado.summary.expiresAt) : estado?.summary ? "Sem expiração" : "—"}
            icon={<CalendarClock className="w-4 h-4" />}
            testId="licenciamento-kpi-validade"
          />
          <KpiCard
            label="Última validação"
            value={dataHora(estado?.lastValidatedAt)}
            icon={<KeyRound className="w-4 h-4" />}
            testId="licenciamento-kpi-validacao"
          />
        </div>
      </Panel>

      <Panel title="Módulos da licença">
        <div data-testid="licenciamento-modulos">
          {modulos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem módulos para apresentar. Importe uma licença para consultar os direitos concedidos.
            </p>
          ) : (
            <DataTable
              columns={["Módulo", "Direito", "Tipo", "Dependências"]}
              rows={linhasModulos}
            />
          )}
        </div>
      </Panel>

      <Panel
        title="Dados do titular"
        action={
          estado?.summary ? (
            <StatusBadge tone="info">{estado.summary.licenseId}</StatusBadge>
          ) : undefined
        }
      >
        {estado?.summary ? (
          <DataTable columns={["Campo", "Valor"]} rows={linhasResumo({ valid: true, status: estado.status, message: estado.message, summary: estado.summary })} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum documento assinado instalado. Os dados do titular só aparecem depois da importação.
          </p>
        )}
      </Panel>

      <Panel title="Histórico de licenciamento">
        <div data-testid="licenciamento-eventos">
          {linhasEventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não existem eventos de licenciamento.</p>
          ) : (
            <DataTable
              columns={["Data", "Utilizador", "Ação", "Severidade", "Descrição"]}
              rows={linhasEventos}
            />
          )}
        </div>
      </Panel>

      <Dialog open={Boolean(selecao)} onOpenChange={(aberto) => { if (!aberto) setSelecao(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar importação de licença</DialogTitle>
            <DialogDescription>
              {selecao?.nome} — a assinatura foi verificada no processo principal antes de mostrar esta pré-visualização.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusBadge tone={TOM_ESTADO[preview.status]}>{preview.status}</StatusBadge>
                <span className="text-sm">{preview.message}</span>
              </div>

              {preview.summary && (
                <DataTable columns={["Campo", "Valor"]} rows={linhasResumo(preview)} />
              )}

              {preview.summary && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.summary.modules.map((modulo) => (
                    <StatusBadge key={modulo.key} tone={modulo.enabled ? "success" : "neutral"}>
                      {modulo.label}
                    </StatusBadge>
                  ))}
                </div>
              )}

              {substituiLicenca && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md p-2">
                  Já existe uma licença instalada. Confirmar substitui a licença atual; os dados de negócio não são alterados.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSelecao(null)} disabled={operando}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleImportar()}
              disabled={!preview?.valid || operando || !selecao?.conteudo}
              data-testid="licenciamento-confirmar-importacao"
            >
              {operando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
              Confirmar importação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarRemocao} onOpenChange={setConfirmarRemocao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover licença</DialogTitle>
            <DialogDescription>
              A licença instalada será removida. Nenhum dado de negócio é apagado ou bloqueado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmarRemocao(false)} disabled={operando}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRemover()}
              disabled={operando}
              data-testid="licenciamento-confirmar-remocao"
            >
              {operando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remover licença
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
