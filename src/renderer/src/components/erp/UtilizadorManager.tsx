/**
 * @file UtilizadorManager.tsx
 * @description Gestão completa de Utilizadores (RNF03): listagem, busca, filtros,
 * criação/edição e alteração de senha, com perfil e empresa obrigatórios.
 */

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  KeyRound,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  KeySquare,
  ShieldCheck,
  Power,
} from "lucide-react";
import {
  UtilizadorDto,
  UtilizadorCriarInput,
  UtilizadorAtualizarInput,
  PerfilAcessoDto,
  EmpresaConfigDto,
  ArmazemDto,
} from "../../@types/electron";
import { utilizadorApi } from "../../api/utilizador.api";
import { perfilApi } from "../../api/perfil.api";
import { empresaApi } from "../../api/empresa.api";
import { armazemApi } from "../../api/armazem.api";
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
  FormTabs,
  FormTabPanel,
  TextField,
  SelectField,
  SearchSelect,
} from "./FormPrimitives";
import { toast } from "sonner";

const utilizadorFormSchema = z.object({
  login: z.string().trim().min(3, "Mínimo 3 caracteres").max(50),
  nomeCompleto: z.string().trim().min(3, "Mínimo 3 caracteres").max(100),
  email: z.string().trim().email("Email inválido"),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal("")),
  perfilId: z.string().min(1, "Selecione um perfil"),
  empresaConfigId: z.string().min(1, "Selecione a empresa"),
  armazemDefaultId: z.string().optional().or(z.literal("")),
  estado: z.enum(["ativo", "inativo"]),
});

type UtilizadorFormValues = z.infer<typeof utilizadorFormSchema>;

const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, "Obrigatório").optional(),
  novaSenha: z.string().min(6, "Mínimo 6 caracteres"),
});

export function UtilizadorManager() {
  const [utilizadores, setUtilizadores] = useState<UtilizadorDto[]>([]);
  const [total, setTotal] = useState(0);
  const [perfis, setPerfis] = useState<PerfilAcessoDto[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaConfigDto[]>([]);
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");

  // Modal de criação / edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUtilizador, setEditingUtilizador] = useState<UtilizadorDto | null>(null);
  const [subTab, setSubTab] = useState("dados");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de alteração de senha
  const [senhaUtilizador, setSenhaUtilizador] = useState<UtilizadorDto | null>(null);
  const [modoReposicao, setModoReposicao] = useState(false);

  const methods = useForm<UtilizadorFormValues>({
    resolver: zodResolver(utilizadorFormSchema),
    defaultValues: { estado: "ativo" },
  });

  const methodsSenha = useForm<z.infer<typeof alterarSenhaSchema>>({
    resolver: zodResolver(alterarSenhaSchema),
    defaultValues: { senhaAtual: "", novaSenha: "" },
  });

  const carregarReferencias = useCallback(async () => {
    const [resPerfis, resEmpresas, resArmazens] = await Promise.all([
      perfilApi.list(),
      empresaApi.list(),
      armazemApi.list({ take: 200 }),
    ]);
    if (resPerfis.success) setPerfis(resPerfis.data);
    if (resEmpresas.success) setEmpresas(resEmpresas.data);
    if (resArmazens.success) setArmazens(resArmazens.data.items);
  }, []);

  const fetchUtilizadores = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await utilizadorApi.list({
        search: search.trim() || undefined,
        estado: (estadoFilter || undefined) as "ativo" | "inativo" | undefined,
        take: 100,
      });

      if (res.success) {
        setUtilizadores(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao listar utilizadores: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, estadoFilter]);

  useEffect(() => {
    carregarReferencias();
  }, [carregarReferencias]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUtilizadores();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchUtilizadores]);

  const handleCreate = () => {
    setEditingUtilizador(null);
    methods.reset({
      login: "",
      nomeCompleto: "",
      email: "",
      telefone: "",
      password: "",
      perfilId: "",
      empresaConfigId: empresas[0]?.id ?? "",
      armazemDefaultId: "",
      estado: "ativo",
    });
    setSubTab("dados");
    setIsModalOpen(true);
  };

  const handleEdit = (u: UtilizadorDto) => {
    setEditingUtilizador(u);
    methods.reset({
      login: u.login,
      nomeCompleto: u.nomeCompleto,
      email: u.email,
      telefone: u.telefone || "",
      password: "",
      perfilId: u.perfilId,
      empresaConfigId: u.empresaConfigId,
      armazemDefaultId: u.armazemDefaultId || "",
      estado: u.estado,
    });
    setSubTab("dados");
    setIsModalOpen(true);
  };

  const handleDelete = async (u: UtilizadorDto) => {
    const confirmMsg = `Tem a certeza que deseja eliminar o utilizador "${u.nomeCompleto}" (${u.login})?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await utilizadorApi.remove(u.id);
      if (res.success) {
        toast.success(`Utilizador "${u.login}" eliminado.`);
        fetchUtilizadores();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao eliminar o utilizador.");
    }
  };

  const handleToggleEstado = async (u: UtilizadorDto) => {
    const novoEstado = u.estado === "ativo" ? "inativo" : "ativo";
    if (novoEstado === "inativo" && !window.confirm(`Deseja desactivar o utilizador "${u.nomeCompleto}" (${u.login})?`)) return;

    try {
      const res = await utilizadorApi.update(u.id, { estado: novoEstado });
      if (res.success) {
        toast.success(novoEstado === "ativo" ? "Utilizador activado com sucesso!" : "Utilizador desactivado com sucesso!");
        fetchUtilizadores();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao alterar o estado do utilizador.");
    }
  };

  const handleFormSubmit = async (values: UtilizadorFormValues) => {
    try {
      setIsSubmitting(true);

      if (editingUtilizador) {
        const payload: UtilizadorAtualizarInput = {
          login: values.login,
          nomeCompleto: values.nomeCompleto,
          email: values.email,
          telefone: values.telefone || undefined,
          perfilId: values.perfilId,
          empresaConfigId: values.empresaConfigId,
          armazemDefaultId: values.armazemDefaultId || null,
          estado: values.estado,
          ...(values.password ? { password: values.password } : {}),
        };
        const res = await utilizadorApi.update(editingUtilizador.id, payload);
        if (res.success) {
          toast.success("Utilizador actualizado com sucesso!");
          setIsModalOpen(false);
          fetchUtilizadores();
        } else {
          toast.error(res.error.message);
        }
      } else {
        const payload: UtilizadorCriarInput = {
          login: values.login,
          nomeCompleto: values.nomeCompleto,
          email: values.email,
          password: values.password ?? "",
          perfilId: values.perfilId,
          empresaConfigId: values.empresaConfigId,
          armazemDefaultId: values.armazemDefaultId || null,
          telefone: values.telefone || undefined,
          estado: values.estado,
        };
        const res = await utilizadorApi.create(payload);
        if (res.success) {
          toast.success("Utilizador criado com sucesso!");
          setIsModalOpen(false);
          fetchUtilizadores();
        } else {
          toast.error(res.error.message);
        }
      }
    } catch {
      toast.error("Erro ao gravar dados do utilizador.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAlterarSenha = async (values: z.infer<typeof alterarSenhaSchema>) => {
    if (!senhaUtilizador) return;
    try {
      setIsSubmitting(true);
      if (modoReposicao) {
        const res = await utilizadorApi.resetPassword(senhaUtilizador.id, { novaSenha: values.novaSenha });
        if (res.success) {
          toast.success("Senha reposta com sucesso!");
          setSenhaUtilizador(null);
          setModoReposicao(false);
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      if (!values.senhaAtual) {
        toast.error("Indique a senha actual do utilizador.");
        return;
      }
      const res = await utilizadorApi.changePassword(senhaUtilizador.id, {
        senhaAtual: values.senhaAtual,
        novaSenha: values.novaSenha,
      });
      if (res.success) {
        toast.success("Senha alterada com sucesso!");
        setSenhaUtilizador(null);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Erro ao alterar a senha.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const optionsPerfis = perfis.map((p) => ({ value: p.id, label: p.nome }));
  const optionsEmpresas = empresas.map((e) => ({ value: e.id, label: e.nome }));
  const optionsArmazens = [
    { value: "", label: "— Nenhum armazém por defeito —" },
    ...armazens.map((a) => ({ value: a.id, label: `${a.codigo} · ${a.designacao}` })),
  ];

  const getEstadoBadge = (estado: string) => {
    if (estado === "ativo") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Activo
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
        <XCircle className="w-3.5 h-3.5" /> Inactivo
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barra de Ações & Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Pesquisar por login, nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="w-44">
            <SearchSelect
              value={estadoFilter}
              onChange={setEstadoFilter}
              placeholder="Todos os Estados"
              options={[
                { value: "ativo", label: "Activos" },
                { value: "inativo", label: "Inactivos" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchUtilizadores}
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
            <span>Novo Utilizador</span>
          </button>
        </div>
      </div>

      {/* Tabela de Utilizadores */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Utilizador</th>
                <th className="px-4 py-3">Nome Completo</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Último Acesso</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar utilizadores...</span>
                  </td>
                </tr>
              ) : utilizadores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <span>Nenhum utilizador encontrado.</span>
                  </td>
                </tr>
              ) : (
                utilizadores.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{u.login}</td>
                    <td className="px-4 py-3">{u.nomeCompleto}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                        <ShieldCheck className="w-3 h-3" />
                        {u.perfil?.nome ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.empresaConfig?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.ultimoAcessoEm
                        ? new Date(u.ultimoAcessoEm).toLocaleString()
                        : "Nunca"}
                    </td>
                    <td className="px-4 py-3 text-center">{getEstadoBadge(u.estado)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(u)}
                          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSenhaUtilizador(u);
                            setModoReposicao(false);
                            methodsSenha.reset({ senhaAtual: "", novaSenha: "" });
                          }}
                          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="Alterar senha"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleEstado(u)}
                          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-amber-600 transition-colors"
                          title={u.estado === "ativo" ? "Desactivar utilizador" : "Activar utilizador"}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <span>{total} utilizador(es)</span>
          {total > 0 && <span>A mostrar {utilizadores.length} de {total}</span>}
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                <User className="w-5 h-5" />
              </div>
              <DialogTitle>
                {editingUtilizador ? "Editar Utilizador" : "Novo Utilizador"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {editingUtilizador
                ? "Actualize os dados, credenciais e perfil de acesso do utilizador."
                : "Crie um novo utilizador. A senha só é obrigatória na criação; após criada, pode ser alterada pelo ícone de chave."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <FormShell
              methods={methods}
              onSubmit={handleFormSubmit}
              onCancel={() => setIsModalOpen(false)}
              submitLabel={isSubmitting ? "A gravar..." : "Guardar Utilizador"}
            >
              <FormTabs
                activeTab={subTab}
                onChange={setSubTab}
                tabs={[
                  { id: "dados", label: "Dados & Organização", icon: <User className="w-4 h-4" /> },
                  { id: "acesso", label: "Credenciais & Perfil", icon: <KeySquare className="w-4 h-4" /> },
                ]}
              />

              <FormTabPanel id="dados" activeTab={subTab}>
                <FormSection title="Identificação" description="Dados de contacto e estado da conta.">
                  <TextField name="nomeCompleto" label="Nome completo" required span="2" />
                  <TextField name="email" label="Email" type="email" required span="1" />
                  <TextField name="telefone" label="Telefone" placeholder="+244 900 000 000" span="1" />
                  <SelectField
                    name="estado"
                    label="Estado da conta"
                    required
                    options={[
                      { value: "ativo", label: "Activo" },
                      { value: "inativo", label: "Inactivo" },
                    ]}
                    span="1"
                  />
                  <SelectField
                    name="armazemDefaultId"
                    label="Armazém por defeito"
                    options={optionsArmazens}
                    placeholder="Seleccionar armazém..."
                    span="full"
                  />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="acesso" activeTab={subTab}>
                <FormSection title="Credenciais de Acesso e Permissões" description="Login, senha, perfil e empresa de afectação.">
                  <TextField name="login" label="Nome de utilizador / login" required span="1" />
                  <TextField
                    name="password"
                    label={editingUtilizador ? "Nova senha (opcional)" : "Palavra-passe"}
                    type="password"
                    required={!editingUtilizador}
                    span="1"
                  />
                  <SelectField
                    name="perfilId"
                    label="Perfil / papel"
                    required
                    options={optionsPerfis}
                    placeholder="Seleccionar perfil..."
                    span="1"
                  />
                  <SelectField
                    name="empresaConfigId"
                    label="Empresa (obrigatória)"
                    required
                    options={optionsEmpresas}
                    placeholder="Seleccionar empresa..."
                    span="1"
                  />
                </FormSection>
              </FormTabPanel>
            </FormShell>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Alteração de Senha */}
      <Dialog open={Boolean(senhaUtilizador)} onOpenChange={(o) => { if (!o) { setSenhaUtilizador(null); setModoReposicao(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <DialogTitle>{modoReposicao ? "Repor Senha" : "Alterar Senha"}</DialogTitle>
            </div>
            <DialogDescription>
              {senhaUtilizador
                ? modoReposicao
                  ? `Reposição administradora da senha de "${senhaUtilizador.login}" sem a senha actual.`
                  : `Nova senha para "${senhaUtilizador.login}".`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <FormShell
              methods={methodsSenha}
              onSubmit={handleAlterarSenha}
              onCancel={() => setSenhaUtilizador(null)}
              submitLabel={isSubmitting ? "A gravar..." : "Actualizar Senha"}
            >
              <FormSection title="Palavras-passe">
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={modoReposicao}
                    onClick={() => {
                      setModoReposicao((v) => !v);
                      methodsSenha.setValue("senhaAtual", "");
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      modoReposicao ? "bg-primary" : "bg-input"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        modoReposicao ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Repor senha sem a senha actual (administrador)
                  </span>
                </div>
                {!modoReposicao && (
                  <TextField name="senhaAtual" label="Senha actual" type="password" required span="full" />
                )}
                <TextField name="novaSenha" label="Nova senha" type="password" required span="full" />
              </FormSection>
            </FormShell>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
