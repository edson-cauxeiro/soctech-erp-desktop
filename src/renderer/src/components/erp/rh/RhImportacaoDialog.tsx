import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import { useAuth } from "@/hooks/useAuth";
import { rhPermissaoConcede } from "@/config/rh-permissions";
import type {
  RhTipoImportacaoDto,
  RhImportacaoPreviewDto,
  RhImportacaoResultadoDto,
} from "@/@types/electron";

const ROTULO_TIPO: Record<RhTipoImportacaoDto, string> = {
  FUNCIONARIOS: "Funcionários",
  CONTRATOS: "Contratos",
};

interface RhImportacaoDialogProps {
  aberto: boolean;
  onFechar: () => void;
  /** Chamado após uma importação concluída, para o ecrã recarregar. */
  onImportado: () => void;
  /**
   * Tipo de importação pré-seleccionado (RH-806, assistente de migração).
   * Por omissão escolhe-se o tipo que a sessão tem permissão para importar.
   */
  tipoInicial?: RhTipoImportacaoDto;
}

export function RhImportacaoDialog({
  aberto,
  onFechar,
  onImportado,
  tipoInicial,
}: RhImportacaoDialogProps) {
  const user = useAuth((s) => s.user);
  const permissoes = user?.permissoes;

  const podeFuncionarios = rhPermissaoConcede(permissoes, "rh.funcionarios.criar");
  const podeContratos = rhPermissaoConcede(permissoes, "rh.contratos.gerir");

  const [tipo, setTipo] = useState<RhTipoImportacaoDto>(() => {
    if (tipoInicial) return tipoInicial;
    return podeFuncionarios ? "FUNCIONARIOS" : "CONTRATOS";
  });
  const [ficheiro, setFicheiro] = useState<{ nome: string; conteudo: string } | null>(null);
  const [preview, setPreview] = useState<RhImportacaoPreviewDto | null>(null);
  const [resultado, setResultado] = useState<RhImportacaoResultadoDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ignorarInvalidas, setIgnorarInvalidas] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [importando, setImportando] = useState(false);

  const canal = tipo === "FUNCIONARIOS" ? rhApi.importacao.funcionarios : rhApi.importacao.contratos;

  const previsualizar = async (t: RhTipoImportacaoDto, nome: string, conteudo: string) => {
    setResultado(null);
    setErro(null);
    setPreview(null);
    const res = await (t === "FUNCIONARIOS"
      ? rhApi.importacao.funcionarios.previsualizar({ nome, conteudo })
      : rhApi.importacao.contratos.previsualizar({ nome, conteudo }));
    if (res.success) {
      setPreview(res.data);
    } else {
      setErro(res.error.message);
    }
  };

  const escolherFicheiro = async () => {
    setSelecionando(true);
    setErro(null);
    try {
      const res = await rhApi.importacao.selecionar();
      if (!res.success) {
        setErro(res.error.message);
        return;
      }
      if (res.data.cancelado) return;
      setFicheiro({ nome: res.data.nome, conteudo: res.data.conteudo });
      await previsualizar(tipo, res.data.nome, res.data.conteudo);
    } finally {
      setSelecionando(false);
    }
  };

  const trocarTipo = (t: RhTipoImportacaoDto) => {
    if (t === tipo) return;
    setTipo(t);
    setFicheiro(null);
    setPreview(null);
    setResultado(null);
    setErro(null);
    setIgnorarInvalidas(false);
  };

  const importar = async () => {
    if (!ficheiro || !preview || preview.totalValidas === 0) return;
    setImportando(true);
    setErro(null);
    try {
      const res = await canal.importar({
        nome: ficheiro.nome,
        conteudo: ficheiro.conteudo,
        ignorarInvalidas,
      });
      if (res.success) {
        setResultado(res.data);
        toast.success(`Importação concluída: ${res.data.importados} registo(s).`);
        onImportado();
      } else {
        const detalhes = res.error.details as
          | { naoImportadas?: Array<{ numero: number; resumo: string }> }
          | undefined;
        const n = detalhes?.naoImportadas?.length ?? 0;
        setErro(
          n > 0
            ? `${res.error.message} (${n} registo(s) não importado(s).)`
            : res.error.message
        );
      }
    } finally {
      setImportando(false);
    }
  };

  const semPermissao = !podeFuncionarios && !podeContratos;
  const podeAtual = tipo === "FUNCIONARIOS" ? podeFuncionarios : podeContratos;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Importar CSV
          </DialogTitle>
          <DialogDescription>
            Válida cada linha antes de gravar. A importação só grava linhas válidas e é feita
            numa única transação.
          </DialogDescription>
        </DialogHeader>

        {semPermissao ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-border rounded-lg">
            <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
            <p className="text-sm font-semibold">Sem permissão para importar</p>
            <p className="text-xs text-muted-foreground">
              É preciso permissão para criar funcionários ou gerir contratos.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tipo de importação</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={tipo === "FUNCIONARIOS" ? "default" : "outline"}
                  disabled={!podeFuncionarios}
                  onClick={() => trocarTipo("FUNCIONARIOS")}
                  className="h-9 text-xs"
                >
                  Funcionários
                </Button>
                <Button
                  type="button"
                  variant={tipo === "CONTRATOS" ? "default" : "outline"}
                  disabled={!podeContratos}
                  onClick={() => trocarTipo("CONTRATOS")}
                  className="h-9 text-xs"
                >
                  Contratos
                </Button>
              </div>
            </div>

            {/* Ficheiro */}
            <div className="flex items-center gap-3 flex-wrap border border-border rounded-lg p-3 bg-muted/10">
              <Button
                type="button"
                variant="outline"
                onClick={() => void escolherFicheiro()}
                disabled={selecionando || !podeAtual}
                className="h-9 text-xs gap-2"
              >
                {selecionando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileUp className="w-3.5 h-3.5" />
                )}
                {ficheiro ? "Escolher outro ficheiro" : "Selecionar ficheiro CSV"}
              </Button>
              {ficheiro && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{ficheiro.nome}</span>
                  <span>·{ROTULO_TIPO[tipo]}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFicheiro(null);
                      setPreview(null);
                      setResultado(null);
                      setErro(null);
                    }}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                    title="Remover ficheiro"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {erro && (
              <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/30 bg-destructive/5 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{erro}</span>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {preview.totalLinhas} linha(s)
                  </Badge>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    {preview.totalValidas} válida(s)
                  </Badge>
                  {preview.totalInvalidas > 0 && (
                    <Badge variant="destructive">{preview.totalInvalidas} inválida(s)</Badge>
                  )}
                </div>

                {preview.colunasIgnoradas.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Colunas ignoradas: {preview.colunasIgnoradas.join(", ")}
                  </p>
                )}

                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-3 py-2 text-left">Linha</th>
                        <th className="px-3 py-2 text-left">Registo</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-left">Erros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.linhas.map((l) => (
                        <tr
                          key={l.numero}
                          className={l.valida ? "" : "bg-destructive/[0.03]"}
                        >
                          <td className="px-3 py-2 font-mono text-muted-foreground">
                            {l.numero}
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground">{l.resumo}</td>
                          <td className="px-3 py-2 text-center">
                            {l.valida ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Válida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive uppercase">
                                <AlertTriangle className="w-3.5 h-3.5" /> Inválida
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {l.erros.length === 0 ? (
                              "—"
                            ) : (
                              <ul className="space-y-0.5">
                                {l.erros.map((e, i) => (
                                  <li key={i}>
                                    <span className="font-mono text-destructive">{e.campo}</span>:{" "}
                                    {e.mensagem}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {preview.totalInvalidas > 0 && (
                  <label className="flex items-start gap-2 text-xs cursor-pointer text-foreground select-none">
                    <Checkbox
                      checked={ignorarInvalidas}
                      onCheckedChange={(v) => setIgnorarInvalidas(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Importar apenas as linhas válidas e ignorar as {preview.totalInvalidas} inválida(s).
                    </span>
                  </label>
                )}
              </div>
            )}

            {resultado && (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-emerald-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Importação concluída
                </p>
                <p className="text-xs text-muted-foreground">
                  {resultado.importados} registo(s) importado(s) em {ROTULO_TIPO[resultado.tipo]}.
                </p>
                {resultado.ignorados > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {resultado.ignorados} linha(s) ignorada(s) por estarem inválidas.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} className="text-xs">
            Fechar
          </Button>
          <Button
            type="button"
            onClick={() => void importar()}
            disabled={
              importando ||
              !podeAtual ||
              !ficheiro ||
              !preview ||
              preview.totalValidas === 0 ||
              (preview.totalInvalidas > 0 && !ignorarInvalidas)
            }
            className="text-xs font-semibold gap-2"
          >
            {importando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ClipboardList className="w-4 h-4" />
            )}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}