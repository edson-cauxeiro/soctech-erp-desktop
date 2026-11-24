/**
 * @file PerfilManager.tsx
 * @description Gestão de Perfis de Acesso e Matriz de Permissões (RNF03):
 * listagem, criação/edição, duplicação e matriz 8 módulos × 5 acções.
 */

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Shield,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Copy,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { PerfilAcessoDto, PermissoesRbac } from "../../@types/electron";
import { perfilApi } from "../../api/perfil.api";
import {
  MODULOS,
  ACOES,
  ACOES_KEYS,
  type ModuloRbac,
  type AcaoRbac,
} from "@/config/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  FormShell,
  FormSection,
  TextField,
  TextAreaField,
} from "./FormPrimitives";
import { toast } from "sonner";

const perfilFormSchema = z.object({
  nome: z.string().trim().min(2, "Mínimo 2 caracteres").max(50),
  descricao: z.string().trim().max(200).optional().or(z.literal("")),
});

type PerfilFormValues = z.infer<typeof perfilFormSchema>;

function contarModulosAtivos(permissoes: PermissoesRbac): number {
  return MODULOS.filter((m) => {
    const valor = permissoes[m.key];
    return valor === true || (Array.isArray(valor) && valor.length > 0);
  }).length;
}

export function PerfilManager() {
  const [perfis, setPerfis] = useState<PerfilAcessoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal de criação / edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<PerfilAcessoDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissoes, setPermissoes] = useState<PermissoesRbac>({});

  const methods = useForm<PerfilFormValues>({
    resolver: zodResolver(perfilFormSchema),
    defaultValues: { descricao: "" },
  });

  const fetchPerfis = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await perfilApi.list();
      if (res.success) {
        setPerfis(res.data);
      } else {
        toast.error("Erro ao listar perfis: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPerfis();
  }, [fetchPerfis]);

  /** Um perfil de sistema (ex.: Administrador) tem acesso total e não é editável na matriz. */
  const perfilEhSistema = (p: PerfilAcessoDto | null) => Boolean(p?.sistema);

  const isAcaoActivada = (modulo: ModuloRbac, acao: AcaoRbac): boolean => {
    const m = permissoes[modulo];
    if (m === true) return true;
    if (Array.isArray(m)) return m.includes(acao);
    return false;
  };

  const toggleAcao = (modulo: ModuloRbac, acao: AcaoRbac) => {
    setPermissoes((prev) => {
      const current = prev[modulo];
      let acoes: string[] =
        current === true ? [...ACOES_KEYS] : Array.isArray(current) ? [...current] : [];

      if (acoes.includes(acao)) {
        acoes = acoes.filter((a) => a !== acao);
      } else {
        acoes.push(acao);
      }

      const next: PermissoesRbac = { ...prev };
      if (acoes.length === 0) {
        delete next[modulo];
      } else if (acoes.length === ACOES_KEYS.length) {
        next[modulo] = true;
      } else {
        next[modulo] = acoes as AcaoRbac[];
      }

      return next;
    });
  };

  const handleCreate = () => {
    setEditingPerfil(null);
    setPermissoes({});
    methods.reset({ nome: "", descricao: "" });
    setIsModalOpen(true);
  };

  const handleEdit = (p: PerfilAcessoDto) => {
    setEditingPerfil(p);
    setPermissoes(p.permissoes ?? {});
    methods.reset({ nome: p.nome, descricao: p.descricao ?? "" });
    setIsModalOpen(true);
  };

  const handleDelete = async (p: PerfilAcessoDto) => {
    const confirmMsg = `Tem a certeza que deseja eliminar o perfil "${p.nome}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await perfilApi.remove(p.id);
      if (res.success) {
        toast.success(`Perfil "${p.nome}" eliminado.`);
        fetchPerfis();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao eliminar o perfil.");
    }
  };

  const handleDuplicate = async (p: PerfilAcessoDto) => {
    const nomeBase = window.prompt(`Novo nome para a cópia de "${p.nome}":`, `${p.nome} (cópia)`);
    if (!nomeBase || !nomeBase.trim()) return;

    try {
      const res = await perfilApi.duplicate(p.id, nomeBase.trim());
      if (res.success) {
        toast.success(`Perfil "${res.data.nome}" criado a partir de "${p.nome}".`);
        fetchPerfis();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao duplicar o perfil.");
    }
  };

  const handleFormSubmit = async (values: PerfilFormValues) => {
    try {
      setIsSubmitting(true);

      const payload = {
        nome: values.nome,
        descricao: values.descricao || undefined,
        permissoes,
      };

      if (editingPerfil) {
        const res = await perfilApi.update(editingPerfil.id, payload);
        if (res.success) {
          toast.success("Perfil actualizado com sucesso!");
          setIsModalOpen(false);
          fetchPerfis();
        } else {
          toast.error(res.error.message);
        }
      } else {
        const res = await perfilApi.create(payload);
        if (res.success) {
          toast.success("Perfil criado com sucesso!");
          setIsModalOpen(false);
          fetchPerfis();
        } else {
          toast.error(res.error.message);
        }
      }
    } catch {
      toast.error("Erro ao gravar o perfil.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalModulos = MODULOS.length;
  const modulosActivos = contarModulosAtivos(permissoes);

  return (
    <div className="space-y-4">
      {/* Barra de Ações */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Perfis de Acesso
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Defina os grupos de permissões e a matriz de módulos × acções disponíveis para cada perfil.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPerfis}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            title="Actualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="h-9 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-sm shadow-sm transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Perfil</span>
          </button>
        </div>
      </div>

      {/* Tabela de Perfis */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-center">Módulos</th>
                <th className="px-4 py-3 text-center">Utilizadores</th>
                <th className="px-4 py-3 text-right">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar perfis...</span>
                  </td>
                </tr>
              ) : perfis.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <span>Nenhum perfil definido.</span>
                  </td>
                </tr>
              ) : (
                perfis.map((p) => {
                  const nModulos = contarModulosAtivos(p.permissoes);
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {p.sistema && <Lock className="w-3.5 h-3.5 text-amber-500" />}
                          {p.nome}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs">
                        <span className="line-clamp-1">{p.descricao ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            nModulos === totalModulos
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {nModulos}/{totalModulos}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {p.totalUtilizadores}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(p)}
                            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(p)}
                            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            title="Duplicar"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            disabled={p.sistema}
                            className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={p.sistema ? "Perfil de sistema" : "Eliminar"}
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Modal de Criação / Edição */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden max-h-[85vh] overflow-y-auto">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 text-primary grid place-items-center">
                <Shield className="w-4 h-4" />
              </div>
              <DialogTitle>{editingPerfil ? "Editar Perfil" : "Novo Perfil"}</DialogTitle>
            </div>
            <DialogDescription>
              Defina o nome, a descrição e a matriz de permissões (módulos × acções) deste perfil.
            </DialogDescription>
          </DialogHeader>

          <FormShell
            methods={methods}
            onSubmit={handleFormSubmit}
            onCancel={() => setIsModalOpen(false)}
            submitLabel={isSubmitting ? "A gravar..." : "Guardar Perfil"}
            flush
          >
            <FormSection title="Identificação">
              <TextField name="nome" label="Nome do perfil" required placeholder="Ex.: Vendas Sénior" span="2" />
              <TextAreaField name="descricao" label="Descrição (opcional)" rows={2} placeholder="Ex.: Acesso avançado ao módulo de vendas" />
            </FormSection>

            <FormSection
              title="Matriz de Permissões"
              description="Módulos do sistema × acções permitidas. Seleccionar todas as acções de um módulo concede acesso total."
            >
              <div className="col-span-full overflow-x-auto -mx-1">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                        Módulo
                      </th>
                      {ACOES.map((a) => (
                        <th
                          key={a.key}
                          className="px-3 py-2 text-center text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap min-w-[88px]"
                        >
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perfilEhSistema(editingPerfil) ? (
                      <tr>
                        <td colSpan={ACOES.length + 1} className="px-3 py-4 text-center text-xs text-amber-600">
                          <span className="inline-flex items-center gap-2 justify-center">
                            <Lock className="w-4 h-4" />
                            Perfil de sistema: acesso total a todos os módulos. A matriz não pode ser alterada.
                          </span>
                        </td>
                      </tr>
                    ) : (
                      MODULOS.map((m) => (
                        <tr key={m.key} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{m.label}</td>
                          {ACOES.map((a) => {
                            const activo = isAcaoActivada(m.key, a.key);
                            return (
                              <td key={a.key} className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={activo}
                                  onChange={() => toggleAcao(m.key, a.key)}
                                  className="h-4 w-4 accent-primary cursor-pointer"
                                  aria-label={`${m.label}: ${a.label}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!perfilEhSistema(editingPerfil) && (
                <div className="col-span-full flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>
                    {modulosActivos} de {totalModulos} módulos com permissões activas.
                  </span>
                  <button
                    type="button"
                    onClick={() => setPermissoes({})}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Limpar permissões
                  </button>
                </div>
              )}
            </FormSection>
          </FormShell>
        </DialogContent>
      </Dialog>
    </div>
  );
}
