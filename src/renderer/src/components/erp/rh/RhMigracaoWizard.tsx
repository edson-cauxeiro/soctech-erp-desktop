/**
 * @file RhMigracaoWizard.tsx
 * @description Assistente de migração/inicialização do módulo de RH (RH-806).
 *
 * Um assistente de 4 passos para preparar uma empresa nova:
 *   1. Verificar e criar os dados de referência (rubricas, parâmetros, IRT,
 *      períodos, departamentos e cargos);
 *   2. Importar os funcionários existentes por CSV;
 *   3. Importar os contratos desses funcionários por CSV;
 *   4. Rever o resumo da migração.
 *
 * Os passos 2 e 3 reutilizam o `RhImportacaoDialog` já existente (aberto com
 * o tipo pré-seleccionado), para que a validação e a pré-visualização sejam
 * exactamente as da importação manual.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import { useAuth } from "@/hooks/useAuth";
import { rhPermissaoConcede } from "@/config/rh-permissions";
import { RhImportacaoDialog } from "./RhImportacaoDialog";
import type { RhTipoImportacaoDto } from "@/@types/electron";

// ── Modelo ───────────────────────────────────────────────────────────────────

const PASSOS = ["Dados de referência", "Funcionários", "Contratos", "Conclusão"] as const;

type EstadoVerificacao = "carregando" | "ok" | "falta" | "erro";

interface Verificacao {
  chave: string;
  titulo: string;
  descricao: string;
  /** `null` enquanto não se sabe (a carregar ou erro). */
  contagem: number | null;
  estado: EstadoVerificacao;
}

interface RhMigracaoWizardProps {
  aberto: boolean;
  onFechar: () => void;
  /** Invocado depois de uma importação, para o chamador recarregar a sua grelha. */
  onImportado?: () => void;
}

// ── Componente ───────────────────────────────────────────────────────────────

export function RhMigracaoWizard({ aberto, onFechar, onImportado }: RhMigracaoWizardProps) {
  const user = useAuth((s) => s.user);
  const permissoes = user?.permissoes;

  const podeFuncionarios = rhPermissaoConcede(permissoes, "rh.funcionarios.criar");
  const podeContratos = rhPermissaoConcede(permissoes, "rh.contratos.gerir");
  const podeEditarConfig = rhPermissaoConcede(permissoes, "rh.config.editar");

  const [passo, setPasso] = useState<number>(0);
  const [verificacoes, setVerificacoes] = useState<Verificacao[] | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [semeando, setSemeando] = useState(false);
  const [importacao, setImportacao] = useState<RhTipoImportacaoDto | null>(null);
  const [funcionariosImportados, setFuncionariosImportados] = useState(false);
  const [contratosImportados, setContratosImportados] = useState(false);

  const ano = new Date().getFullYear();

  const carregarVerificacoes = useCallback(async () => {
    setVerificando(true);
    try {
      const [rubricas, tiposAusencia, parametros, irt, periodos, departamentos, cargos] =
        await Promise.all([
          rhApi.config.rubricas.listar({ take: 1 }),
          rhApi.config.tiposAusencia.listar({ take: 1 }),
          rhApi.config.parametros.listar(),
          rhApi.config.irt.listar(),
          rhApi.config.periodos.listar(ano),
          rhApi.config.departamentos.listar({ take: 1 }),
          rhApi.config.cargos.listar({ take: 1 }),
        ]);

      const dePagina = (res: { success: boolean; data?: { total: number } }): number =>
        res.success && res.data ? res.data.total : 0;
      const deLista = (res: { success: boolean; data?: unknown[] }): number =>
        res.success && res.data ? res.data.length : 0;
      const falhou = (res: { success: boolean }): boolean => !res.success;

      const def = (
        chave: string,
        titulo: string,
        descricao: string,
        contagem: number,
        erro: boolean,
        minimo = 1
      ): Verificacao => ({
        chave,
        titulo,
        descricao,
        contagem: erro ? null : contagem,
        estado: erro ? "erro" : contagem >= minimo ? "ok" : "falta",
      });

      setVerificacoes([
        def(
          "rubricas",
          "Rubricas de sistema",
          "Salário base, subsídios e descontos usados nos recibos.",
          dePagina(rubricas),
          falhou(rubricas)
        ),
        def(
          "tiposAusencia",
          "Tipos de ausência",
          "Férias, faltas, licenças e outros motivos de ausência.",
          dePagina(tiposAusencia),
          falhou(tiposAusencia)
        ),
        def(
          "parametros",
          "Parâmetros fiscais",
          "Taxas de INSS e regras de retenção na fonte.",
          deLista(parametros),
          falhou(parametros)
        ),
        def(
          "irt",
          "Tabela de IRT",
          "Escalões de imposto sobre rendimentos de trabalho.",
          deLista(irt),
          falhou(irt)
        ),
        def(
          "periodos",
          `Períodos de ${ano}`,
          "P01 a P12 do ano corrente, necessários ao processamento.",
          deLista(periodos),
          falhou(periodos),
          12
        ),
        def(
          "departamentos",
          "Departamentos",
          "Códigos que a importação CSV de funcionários referencia.",
          dePagina(departamentos),
          falhou(departamentos)
        ),
        def(
          "cargos",
          "Cargos",
          "Códigos que a importação CSV de funcionários referencia.",
          dePagina(cargos),
          falhou(cargos)
        ),
      ]);
    } finally {
      setVerificando(false);
    }
  }, [ano]);

  useEffect(() => {
    if (aberto) void carregarVerificacoes();
  }, [aberto, carregarVerificacoes]);

  const semear = async (): Promise<void> => {
    setSemeando(true);
    try {
      const resposta = await rhApi.config.referencia.semear();
      if (!resposta.success) {
        toast.error(resposta.error.message);
        return;
      }
      const { departamentosCriados, cargosCriados, periodosCriados } = resposta.data;
      const total = departamentosCriados + cargosCriados + periodosCriados;
      if (total === 0) {
        toast.info("Todos os dados de referência já existem.");
      } else {
        toast.success(
          `Dados de referência criados: ${total} registo(s) ` +
            `(${departamentosCriados} departamento(s), ${cargosCriados} cargo(s), ` +
            `${periodosCriados} período(s)).`
        );
      }
      await carregarVerificacoes();
    } finally {
      setSemeando(false);
    }
  };

  const concluirImportacao = (tipo: RhTipoImportacaoDto): void => {
    if (tipo === "FUNCIONARIOS") setFuncionariosImportados(true);
    else setContratosImportados(true);
    onImportado?.();
    void carregarVerificacoes();
  };

  const emFalta = (verificacoes ?? []).filter((v) => v.estado === "falta").length;
  const verificacoesOk = (verificacoes ?? []).filter((v) => v.estado === "ok").length;

  // ── Conteúdo dos passos ───────────────────────────────────────────────────

  const conteudoPasso = (): React.ReactNode => {
    if (passo === 0) {
      return (
        <div className="space-y-3" data-testid="migracao-verificacoes">
          <div className="rounded-lg border border-border">
            {(verificacoes ?? []).map((v, indice) => (
              <div
                key={v.chave}
                className={`flex items-start gap-3 px-4 py-3 ${indice > 0 ? "border-t border-border" : ""}`}
              >
                <span className="mt-0.5">
                  {v.estado === "carregando" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : v.estado === "ok" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : v.estado === "falta" ? (
                    <CircleDashed className="w-4 h-4 text-amber-500" />
                  ) : (
                    <TriangleAlert className="w-4 h-4 text-destructive" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{v.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{v.descricao}</span>
                </span>
                <Badge
                  variant={
                    v.estado === "ok"
                      ? "default"
                      : v.estado === "falta"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {v.estado === "carregando"
                    ? "A verificar…"
                    : v.estado === "erro"
                      ? "Erro"
                      : v.estado === "falta"
                        ? "Em falta"
                        : `${v.contagem} registo(s)`}
                </Badge>
              </div>
            ))}
            {!verificacoes && (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> A verificar dados de referência…
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-2"
              onClick={() => void carregarVerificacoes()}
              disabled={verificando}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Voltar a verificar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-2"
              onClick={() => void semear()}
              disabled={semeando || !podeEditarConfig}
              title={podeEditarConfig ? undefined : "Sem permissão para alterar a configuração."}
            >
              {semeando ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Criar dados em falta
            </Button>
          </div>
        </div>
      );
    }

    if (passo === 1 || passo === 2) {
      const tipo: RhTipoImportacaoDto = passo === 1 ? "FUNCIONARIOS" : "CONTRATOS";
      const concluido = passo === 1 ? funcionariosImportados : contratosImportados;
      const pode = passo === 1 ? podeFuncionarios : podeContratos;

      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {passo === 1 ? (
              <>
                O ficheiro CSV deve conter <strong>Nome</strong> e{" "}
                <strong>Data de admissão</strong> como colunas mínimas. Colunas opcionais: NIF,
                BI, departamento (código), cargo (código), email, telefone, IBAN, entre outras.
              </>
            ) : (
              <>
                O ficheiro CSV deve conter <strong>Funcionário (código)</strong>,{" "}
                <strong>Tipo de contrato</strong> e <strong>Data de início</strong>. Importe
                primeiro os funcionários e confirme os códigos antes de migrar os contratos.
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              className="text-xs gap-2"
              onClick={() => setImportacao(tipo)}
              disabled={!pode}
              title={pode ? undefined : "Sem permissão para importar."}
            >
              <ListChecks className="w-3.5 h-3.5" />
              {concluido ? "Importar novamente" : `Importar ${passo === 1 ? "funcionários" : "contratos"} (CSV)`}
            </Button>
            {concluido && (
              <Badge className="gap-1">
                <CheckCircle2 className="w-3 h-3" /> Importação concluída
              </Badge>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-border divide-y divide-border">
          <ResumoLinha
            rotulo="Dados de referência"
            valor={
              verificacoesOk === (verificacoes ?? []).length && (verificacoes ?? []).length > 0
                ? `${verificacoesOk} de ${verificacoes?.length} verificações`
                : `${emFalta} verificação(ões) em falta`
            }
            ok={emFalta === 0 && verificacoes !== null}
          />
          <ResumoLinha
            rotulo="Funcionários"
            valor={funcionariosImportados ? "Importados nesta sessão" : "Não importados"}
            ok={funcionariosImportados}
          />
          <ResumoLinha
            rotulo="Contratos"
            valor={contratosImportados ? "Importados nesta sessão" : "Não importados"}
            ok={contratosImportados}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Pode voltar atrás para repetir qualquer passo — as verificações são idempotentes e a
          importação nunca duplica funcionários por nome/NIF conforme as regras do serviço.
        </p>
      </div>
    );
  };

  return (
    <>
      <Dialog
        open={aberto}
        onOpenChange={(o) => {
          if (!o) onFechar();
        }}
      >
        <DialogContent className="max-w-2xl" data-testid="rh-migracao">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Assistente de migração (RH)
            </DialogTitle>
            <DialogDescription>
              Prepare uma empresa nova: dados de referência, importação de funcionários e de
              contratos.
            </DialogDescription>
          </DialogHeader>

          {/* Passos */}
          <ol className="flex items-center gap-2 text-xs" data-testid="migracao-passos">
            {PASSOS.map((nome, indice) => (
              <li key={nome} className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    indice === passo
                      ? "border-primary bg-primary text-primary-foreground"
                      : indice < passo
                        ? "border-primary/40 text-primary"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {indice + 1}
                </span>
                <span className={indice === passo ? "font-semibold" : "text-muted-foreground"}>
                  {nome}
                </span>
                {indice < PASSOS.length - 1 && <span className="text-muted-foreground">→</span>}
              </li>
            ))}
          </ol>

          <div className="min-h-[260px]">
            <h3 className="mb-3 text-xs font-bold uppercase text-muted-foreground">
              Passo {passo + 1} · {PASSOS[passo]}
            </h3>
            {conteudoPasso()}
          </div>

          <DialogFooter className="flex items-center gap-2 sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-xs"
                onClick={() => setPasso((p) => Math.max(0, p - 1))}
                disabled={passo === 0}
              >
                Anterior
              </Button>
              {passo < PASSOS.length - 1 && (
                <Button
                  type="button"
                  className="text-xs"
                  onClick={() => setPasso((p) => Math.min(PASSOS.length - 1, p + 1))}
                >
                  Seguinte
                </Button>
              )}
            </div>
            <Button type="button" variant={passo === PASSOS.length - 1 ? "default" : "ghost"} onClick={onFechar}>
              {passo === PASSOS.length - 1 ? "Concluir" : "Fechar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importacao && (
        <RhImportacaoDialog
          aberto
          tipoInicial={importacao}
          onFechar={() => setImportacao(null)}
          onImportado={() => concluirImportacao(importacao)}
        />
      )}
    </>
  );
}

function ResumoLinha({
  rotulo,
  valor,
  ok,
}: {
  rotulo: string;
  valor: string;
  ok: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm font-medium">{rotulo}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <CircleDashed className="w-4 h-4 text-amber-500" />
        )}
        {valor}
      </span>
    </div>
  );
}
