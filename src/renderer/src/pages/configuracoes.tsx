import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Shield,
  Building2,
  CalendarDays,
  FileCode2,
  ShieldAlert,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  ScrollText,
  KeyRound,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { useAuth } from "@/hooks/useAuth";
import { empresaApi } from "@/api/empresa.api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { EmpresaConfigDto } from "../@types/electron";
import { EmpresaModal } from "../components/erp/EmpresaModal";
import { ExercicioManager } from "../components/erp/ExercicioManager";
import { SerieManager } from "../components/erp/SerieManager";
import { UtilizadorManager } from "../components/erp/UtilizadorManager";
import { PerfilManager } from "../components/erp/PerfilManager";
import { AuditoriaManager } from "../components/erp/AuditoriaManager";
import { LicenciamentoManager } from "../components/erp/LicenciamentoManager";

type Tab =
  | "empresa"
  | "exercicio"
  | "series"
  | "utilizador"
  | "perfil"
  | "auditoria"
  | "licenciamento";

export default function ConfiguracoesPage() {
  const [tab, setTab] = useState<Tab>("empresa");
  const [empresas, setEmpresas] = useState<EmpresaConfigDto[]>([]);
  const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [empresaToEdit, setEmpresaToEdit] = useState<EmpresaConfigDto | null>(null);

  const hasPermission = useAuth((s) => s.hasPermission);
  const navigate = useNavigate();

  // O mesmo critério do RBAC do Main: perfil Administrador, permissão
  // explícita `configuracoes:admin` ou wildcard. O nome do perfil deixou de
  // ser a única porta de entrada.
  const isAdmin = hasPermission("configuracoes", "admin");

  const loadEmpresas = useCallback(async () => {
    setIsLoadingEmpresas(true);
    try {
      const res = await empresaApi.list();
      if (res.success && res.data) {
        setEmpresas(res.data);
      }
    } catch (err) {
      console.error("Erro ao carregar lista de empresas:", err);
      toast.error("Erro ao carregar empresas.");
    } finally {
      setIsLoadingEmpresas(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadEmpresas();
    }
  }, [isAdmin, loadEmpresas]);

  if (!isAdmin) {
    return (
      <ErpShell
        active="inicio"
        title="Acesso Restrito"
        breadcrumb={["SOC TECHNO", "Acesso Negado"]}
        ribbon={[]}
      >
        <div className="max-w-md mx-auto my-16 text-center space-y-4 p-8 border border-destructive/30 rounded-2xl bg-card">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold">Acesso Restrito ao Administrador</h2>
          <p className="text-xs text-muted-foreground">
            Apenas utilizadores com perfil de Administrador têm permissão para configurar a empresa, utilizadores e permissões do sistema.
          </p>
          <Button onClick={() => navigate("/inicio")} className="cursor-pointer">
            Voltar ao Início
          </Button>
        </div>
      </ErpShell>
    );
  }

  const handleOpenCreateModal = () => {
    setEmpresaToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp: EmpresaConfigDto) => {
    setEmpresaToEdit(emp);
    setIsModalOpen(true);
  };

  const handleDeleteEmpresa = async (id: string, nomeEmpresa: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar a empresa "${nomeEmpresa}"? Todas as configurações e relações serão afetadas.`)) {
      return;
    }

    try {
      const res = await empresaApi.delete(id);
      if (res.success) {
        toast.success(`Empresa "${nomeEmpresa}" eliminada com sucesso.`);
        loadEmpresas();
      } else {
        toast.error("Erro ao eliminar empresa", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao eliminar empresa.");
    }
  };

  return (
    <ErpShell
      active="configuracoes"
      activeTab={tab}
      title="Configurações — Sistema & Empresa"
      breadcrumb={["Configurações", label(tab)]}
      ribbon={[
        {
          label: "Estrutura & Fiscalidade",
          actions: [
            {
              label: "Empresas",
              icon: <Building2 className="w-5 h-5" />,
              onClick: () => setTab("empresa"),
              tabKey: "empresa",
            },
            {
              label: "Exercício",
              icon: <CalendarDays className="w-5 h-5" />,
              onClick: () => setTab("exercicio"),
              tabKey: "exercicio",
            },
            {
              label: "Séries",
              icon: <FileCode2 className="w-5 h-5" />,
              onClick: () => setTab("series"),
              tabKey: "series",
            },
          ],
        },
        {
          label: "Utilizadores & Segurança",
          actions: [
            {
              label: "Utilizadores",
              icon: <Users className="w-5 h-5" />,
              onClick: () => setTab("utilizador"),
              tabKey: "utilizador",
            },
            {
              label: "Permissões",
              icon: <Shield className="w-5 h-5" />,
              onClick: () => setTab("perfil"),
              tabKey: "perfil",
            },
            {
              // A auditoria fica ao lado das permissões e não num módulo
              // próprio: quem vem ver quem fez o quê é a mesma pessoa que vem
              // ver o que está autorizado. Separar os dois obriga a saltar entre
              // ecrãs para responder à pergunta "quem podia fazer isto".
              label: "Auditoria",
              icon: <ScrollText className="w-5 h-5" />,
              onClick: () => setTab("auditoria"),
              tabKey: "auditoria",
            },
            {
              // A licença é importada aqui, dentro das configurações. Não
              // existe painel paralelo nem Entry point fora deste ecrã.
              label: "Licenciamento",
              icon: <KeyRound className="w-5 h-5" />,
              onClick: () => setTab("licenciamento"),
              tabKey: "licenciamento",
            },
          ],
        },
      ]}
    >
      {/* Modal Multi-step de Criação e Edição de Empresa */}
      <EmpresaModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        empresaToEdit={empresaToEdit}
        onSuccess={loadEmpresas}
      />

      {/* ABA: EMPRESAS */}
      {tab === "empresa" && (
        <div className="space-y-6">
          {/* Alerta de Obrigatoriedade Legal e Fiscal */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 text-xs text-foreground">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">
                Gestão Centralizada de Empresas e Entidades Fiscais
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Cada empresa possui o seu identificador próprio, moedas de operação e módulos contratados. Lembre-se que para emitir faturas ou qualquer documento na empresa é <strong>obrigatório</strong> registar a <strong>Gestão de Exercício</strong> e a <strong>Gestão de Séries</strong> nas respetivas opções do menu.
              </p>
            </div>
          </div>

          {/* Cabeçalho da Lista com Botão "Nova Empresa" */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-card)] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Empresas Criadas no Sistema
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lista de entidades registadas com parâmetros fiscais e módulos ativos.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleOpenCreateModal}
                className="text-xs font-semibold flex items-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nova Empresa
              </Button>
            </div>

            {/* Tabela de Empresas */}
            {isLoadingEmpresas ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">A carregar lista de empresas...</span>
              </div>
            ) : empresas.length === 0 ? (
              <div className="py-20 text-center space-y-3 border border-dashed border-border rounded-lg bg-muted/10">
                <Building2 className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Nenhuma empresa encontrada
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Ainda não existem empresas configuradas. Clique no botão "Nova Empresa" acima para criar a sua primeira entidade.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenCreateModal}
                  className="text-xs mt-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Criar Agora
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/60 uppercase font-semibold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Identificador</th>
                      <th className="px-4 py-3">Nome da Empresa</th>
                      <th className="px-4 py-3">NIF</th>
                      <th className="px-4 py-3">País</th>
                      <th className="px-4 py-3">Moeda Base</th>
                      <th className="px-4 py-3">Regime IVA</th>
                      <th className="px-4 py-3">Módulos Pagos</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {empresas.map((emp) => {
                      let mods: string[] = [];
                      try {
                        if (emp.modulosJson) {
                          mods = JSON.parse(emp.modulosJson);
                        }
                      } catch {
                        // ignore
                      }

                      const paisLabel =
                        emp.pais === "PT"
                          ? "🇵🇹 Portugal"
                          : emp.pais === "AO"
                          ? "🇦🇴 Angola"
                          : "🌍 Outro";

                      const regimeLabel =
                        emp.regimeIvaTipo === "normal_trimestral"
                          ? "Normal (Trimestral)"
                          : emp.regimeIvaTipo === "isento" || emp.regimeIva === "isento"
                          ? "Isento"
                          : "Normal (Mensal)";

                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-muted/30 transition-colors group"
                        >
                          <td className="px-4 py-3 font-mono font-bold text-primary">
                            {emp.identificador || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">
                              {emp.nome}
                            </div>
                            {emp.endereco && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                                {emp.endereco}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium">
                            {emp.nif}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {paisLabel}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            <span className="font-bold">{emp.moedaBase}</span>
                            {emp.moedaAlternativa && (
                              <span className="text-muted-foreground text-[10px] ml-1">
                                / {emp.moedaAlternativa}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                emp.regimeIva === "isento" || emp.regimeIvaTipo === "isento"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-primary/10 text-primary"
                              }`}
                            >
                              {regimeLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {mods.length === 0 ? (
                                <span className="text-muted-foreground text-[11px]">
                                  Padrão
                                </span>
                              ) : (
                                mods.slice(0, 3).map((m) => (
                                  <span
                                    key={m}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-muted font-medium capitalize text-muted-foreground"
                                  >
                                    {m}
                                  </span>
                                ))
                              )}
                              {mods.length > 3 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
                                  +{mods.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditModal(emp)}
                                className="h-7 px-2 text-xs flex items-center gap-1 cursor-pointer"
                                title="Editar dados da empresa"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteEmpresa(emp.id, emp.nome)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                title="Apagar empresa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA: GESTÃO DE EXERCÍCIO */}
      {tab === "exercicio" && <ExercicioManager empresas={empresas} />}

      {/* ABA: GESTÃO DE SÉRIES */}
      {tab === "series" && <SerieManager empresas={empresas} />}

      {/* ABA: UTILIZADORES */}
      {tab === "utilizador" && <UtilizadorManager />}

      {/* ABA: PERFIS */}
      {tab === "perfil" && <PerfilManager />}

      {/* ABA: AUDITORIA (AUD-02) */}
      {tab === "auditoria" && <AuditoriaManager />}

      {/* ABA: LICENCIAMENTO (7.ª aba) */}
      {tab === "licenciamento" && <LicenciamentoManager />}
    </ErpShell>
  );
}

function label(t: Tab) {
  return {
    empresa: "Gestão de Empresas",
    exercicio: "Gestão de Exercício",
    series: "Gestão de Séries",
    utilizador: "Utilizadores",
    perfil: "Permissões",
    auditoria: "Auditoria",
    licenciamento: "Licenciamento",
  }[t];
}
