/**
 * @file LoteManager.tsx
 * @description Gestão de lotes e validades (TASK-041).
 *
 * Lista, cria, edita e elimina lotes, com destaque visual para os que estão a
 * caducar ou já caducados, segundo a antecedência configurada na empresa. É a
 * face visível do `LoteService`; a criação automática de lotes a partir de
 * movimentos de stock continua a acontecer no `movimento-stock.service`.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search,
  RefreshCw,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Info,
  PackageX,
} from "lucide-react";
import type { ArtigoDto, LoteDto } from "../../@types/electron";
import { loteApi } from "../../api/lote.api";
import { artigoApi } from "../../api/artigo.api";
import { fornecedorApi } from "../../api/fornecedor.api";
import { empresaApi } from "../../api/empresa.api";
import { DIAS_ALERTA_VALIDADE_PADRAO } from "../../utils/validade";
import { ValidadeBadge } from "./ValidadeBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SearchSelect } from "../ui/SearchSelect";
import {
  FormShell,
  FormSection,
  TextField,
  DateField,
  SelectField,
} from "./FormPrimitives";
import { toast } from "sonner";
const PAGE_SIZE = 50;

const ESTADO_VALIDADE_OPCOES: { value: string; label: string }[] = [
  { value: "proximo_caducar", label: "A caducar" },
  { value: "caducado", label: "Caducado" },
  { value: "valido", label: "Válido" },
  { value: "sem_validade", label: "Sem validade" },
];

const loteSchema = z.object({
  artigoId: z.string().min(1, "Selecione o produto."),
  numeroLote: z.string().trim().min(1, "O número de lote é obrigatório.").max(60),
  dataFabrico: z.string().optional(),
  dataValidade: z.string().optional(),
  fornecedorId: z.string().optional(),
  precoCusto: z.string().optional(),
  observacoes: z.string().max(500).optional(),
});
type LoteFormValues = z.infer<typeof loteSchema>;

function formatarData(valor?: string | Date | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-PT");
}

function formatarPreco(valor?: number | null): string {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function LoteManager() {
  const [linhas, setLinhas] = useState<LoteDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [artigoId, setArtigoId] = useState("");
  const [estadoValidade, setEstadoValidade] = useState("");

  const [artigos, setArtigos] = useState<ArtigoDto[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [diasAlerta, setDiasAlerta] = useState(DIAS_ALERTA_VALIDADE_PADRAO);

  const [dialogo, setDialogo] = useState<
    | { tipo: "criar" }
    | { tipo: "editar"; lote: LoteDto }
    | { tipo: "detalhe"; lote: LoteDto }
    | null
  >(null);

  useEffect(() => {
    void (async () => {
      try {
        const [resArtigos, resFornecedores, resEmpresa] = await Promise.all([
          artigoApi.list({ take: 200 }),
          fornecedorApi.list({ take: 200 }),
          empresaApi.get(),
        ]);
        if (resArtigos.success) setArtigos(resArtigos.data.items);
        if (resFornecedores.success) setFornecedores(resFornecedores.data.items);
        if (resEmpresa.success && resEmpresa.data?.diasAlertaValidade) {
          setDiasAlerta(resEmpresa.data.diasAlertaValidade);
        }
      } catch {
        toast.error("Falha ao carregar as opções dos filtros.");
      }
    })();
  }, []);

  const filtros = useMemo(
    () => ({
      artigoId: artigoId || undefined,
      search: search.trim() || undefined,
      estadoValidade: (estadoValidade || undefined) as
        | "valido"
        | "proximo_caducar"
        | "caducado"
        | "sem_validade"
        | undefined,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    [artigoId, search, estadoValidade, page]
  );

  const carregar = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await loteApi.list(filtros);
      if (res.success) {
        setLinhas(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao carregar lotes: " + res.error.message);
        setLinhas([]);
        setTotal(0);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    const timer = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(timer);
  }, [carregar]);

  const opcoesArtigos = useMemo(
    () => artigos.map((a) => ({ value: a.id, label: `${a.codigo} — ${a.descricao}` })),
    [artigos]
  );

  const eliminar = async (lote: LoteDto) => {
    if (
      !window.confirm(
        `Eliminar o lote "${lote.numeroLote}"${lote.artigo ? ` de ${lote.artigo.codigo}` : ""}? Esta ação não pode ser revertida.`
      )
    ) {
      return;
    }
    try {
      const res = await loteApi.delete(lote.id);
      if (res.success) {
        toast.success("Lote eliminado.");
        void carregar();
      } else {
        toast.error("Não foi possível eliminar o lote", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao eliminar o lote.");
    }
  };

  const guardar = async (valores: LoteFormValues, criar: boolean, lote?: LoteDto) => {
    const payload = {
      numeroLote: valores.numeroLote.trim(),
      dataFabrico: valores.dataFabrico || null,
      dataValidade: valores.dataValidade || null,
      fornecedorId: valores.fornecedorId || null,
      precoCusto: valores.precoCusto ? Number(valores.precoCusto) : null,
      observacoes: valores.observacoes?.trim() || null,
    };

    try {
      const res = criar
        ? await loteApi.create({ artigoId: valores.artigoId, ...payload })
        : await loteApi.update(lote!.id, payload);
      if (res.success) {
        toast.success(criar ? "Lote criado com sucesso." : "Lote actualizado.");
        setDialogo(null);
        void carregar();
      } else {
        toast.error("Erro ao guardar o lote", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao guardar o lote.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const temFiltro = Boolean(artigoId || search.trim() || estadoValidade);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm flex flex-wrap items-center gap-2">
        <div className="w-64">
          <SearchSelect
            value={artigoId}
            onChange={(id) => {
              setArtigoId(id);
              setPage(0);
            }}
            placeholder="Todos os produtos"
            options={opcoesArtigos}
            allowClear
          />
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Nº de lote, código ou descrição..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="w-44">
          <SearchSelect
            value={estadoValidade}
            onChange={(v) => {
              setEstadoValidade(v);
              setPage(0);
            }}
            placeholder="Todas as validades"
            options={ESTADO_VALIDADE_OPCOES}
            allowClear
          />
        </div>

        <button
          type="button"
          onClick={() => void carregar()}
          disabled={isLoading}
          className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>

        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setArtigoId("");
              setSearch("");
              setEstadoValidade("");
              setPage(0);
            }}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground text-sm transition-colors"
          >
            Limpar filtros
          </button>
        )}

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setDialogo({ tipo: "criar" })}
            className="h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Novo Lote
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Nº de Lote</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Fabrico</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar lotes...</span>
                  </td>
                </tr>
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <PackageX className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum lote encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {temFiltro
                        ? "Tente ajustar os critérios de pesquisa."
                        : "Ainda não há lotes registados."}
                    </p>
                  </td>
                </tr>
              ) : (
                linhas.map((lote) => {
                  return (
                    <tr key={lote.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {lote.numeroLote}
                      </td>
                      <td className="px-4 py-3">
                        {lote.artigo ? (
                          <>
                            <div className="font-mono text-xs text-muted-foreground">
                              {lote.artigo.codigo}
                            </div>
                            <div className="font-medium text-foreground">{lote.artigo.descricao}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {lote.fornecedor?.nome ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatarData(lote.dataFabrico)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatarData(lote.dataValidade)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ValidadeBadge dataValidade={lote.dataValidade} diasAlerta={diasAlerta} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {formatarPreco(lote.precoCusto)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDialogo({ tipo: "detalhe", lote })}
                            className="h-7 w-7 p-0 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                            title="Detalhe do lote"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDialogo({ tipo: "editar", lote })}
                            className="h-7 w-7 p-0 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                            title="Editar lote"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminar(lote)}
                            className="h-7 w-7 p-0 grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Eliminar lote"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total} {total === 1 ? "lote" : "lotes"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isLoading}
              className="h-7 px-2 border border-border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
            >
              Anterior
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || isLoading}
              className="h-7 px-2 border border-border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
            >
              Seguinte
            </button>
          </div>
        </div>
      </div>

      {/* Criar / Editar */}
      <Dialog
        open={dialogo?.tipo === "criar" || dialogo?.tipo === "editar"}
        onOpenChange={(o) => !o && setDialogo(null)}
      >
        <DialogContent className="max-w-3xl p-0 max-h-[85dvh] overflow-y-auto">
          <DialogHeader className="p-4 border-b border-border bg-muted/10">
            <DialogTitle className="text-base">
              {dialogo?.tipo === "editar" ? "Editar Lote" : "Novo Lote"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {dialogo?.tipo === "editar"
                ? `Lote ${dialogo.lote.numeroLote}. O produto não muda.`
                : "Escolha o produto e indique os dados do lote."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <FormLote
              lote={dialogo?.tipo === "editar" ? dialogo.lote : null}
              opcoesArtigos={opcoesArtigos}
              opcoesFornecedores={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
              aoSubmeter={(v) =>
                void guardar(v, dialogo?.tipo === "criar", dialogo?.tipo === "editar" ? dialogo.lote : undefined)
              }
              onCancelar={() => setDialogo(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhe */}
      <Dialog open={dialogo?.tipo === "detalhe"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <DialogTitle>Detalhe do Lote</DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === "detalhe" ? dialogo.lote.numeroLote : ""}
            </DialogDescription>
          </DialogHeader>
          {dialogo?.tipo === "detalhe" && (
            <dl className="p-6 grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Produto</dt>
              <dd className="font-medium text-right">
                {dialogo.lote.artigo
                  ? `${dialogo.lote.artigo.codigo} — ${dialogo.lote.artigo.descricao}`
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Fornecedor</dt>
              <dd className="font-medium text-right">{dialogo.lote.fornecedor?.nome ?? "—"}</dd>
              <dt className="text-muted-foreground">Data de fabrico</dt>
              <dd className="font-medium text-right">{formatarData(dialogo.lote.dataFabrico)}</dd>
              <dt className="text-muted-foreground">Data de validade</dt>
              <dd className="font-medium text-right">{formatarData(dialogo.lote.dataValidade)}</dd>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="text-right">
                <ValidadeBadge dataValidade={dialogo.lote.dataValidade} diasAlerta={diasAlerta} />
              </dd>
              <dt className="text-muted-foreground">Custo</dt>
              <dd className="font-mono text-right">{formatarPreco(dialogo.lote.precoCusto)}</dd>
              <dt className="text-muted-foreground">Observações</dt>
              <dd className="text-right">{dialogo.lote.observacoes || "—"}</dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormLote({
  lote,
  opcoesArtigos,
  opcoesFornecedores,
  aoSubmeter,
  onCancelar,
}: {
  lote: LoteDto | null;
  opcoesArtigos: { value: string; label: string }[];
  opcoesFornecedores: { value: string; label: string }[];
  aoSubmeter: (v: LoteFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<LoteFormValues>({
    resolver: zodResolver(loteSchema),
    defaultValues: {
      artigoId: lote?.artigoId ?? "",
      numeroLote: lote?.numeroLote ?? "",
      dataFabrico: lote?.dataFabrico ? String(lote.dataFabrico).split("T")[0] : "",
      dataValidade: lote?.dataValidade ? String(lote.dataValidade).split("T")[0] : "",
      fornecedorId: lote?.fornecedorId ?? "",
      precoCusto: lote?.precoCusto != null ? String(lote.precoCusto) : "",
      observacoes: lote?.observacoes ?? "",
    },
  });

  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Guardar">
      <FormSection title="Produto e identificação">
        {lote ? (
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="text-xs font-medium text-foreground block mb-1">Produto</label>
              <div className="h-9 px-3 flex items-center rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
                {lote.artigo
                  ? `${lote.artigo.codigo} — ${lote.artigo.descricao}`
                  : "—"}
              </div>
            </div>
            <TextField name="numeroLote" label="Nº de Lote" required placeholder="Ex: LOTE-2026-001" />
            <input type="hidden" {...methods.register("artigoId")} />
          </div>
        ) : (
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SelectField
              name="artigoId"
              label="Produto"
              required
              options={opcoesArtigos}
              placeholder="Escolha o produto"
              span="2"
            />
            <TextField name="numeroLote" label="Nº de Lote" required placeholder="Ex: LOTE-2026-001" />
          </div>
        )}
      </FormSection>

      <FormSection title="Datas, fornecedor e custo">
        <DateField name="dataFabrico" label="Data de Fabrico" />
        <DateField name="dataValidade" label="Data de Validade" />
        <TextField name="precoCusto" label="Preço de Custo" placeholder="0,00" />
        <SelectField
          name="fornecedorId"
          label="Fornecedor"
          options={opcoesFornecedores}
          placeholder="Sem fornecedor"
          span="full"
        />
      </FormSection>
    </FormShell>
  );
}