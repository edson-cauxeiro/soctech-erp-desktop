import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Search,
  HelpCircle,
  Settings as SettingsIcon,
  ChevronDown,
  LogOut,
} from "lucide-react";
import type { ModuleKey } from "@/config/modules";
import { MODULES, getModuleLabel } from "@/config/modules";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RibbonAction {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  hasMenu?: boolean;
  tabKey?: string;
}

export interface RibbonGroup {
  label: string;
  actions: RibbonAction[];
}

interface ErpShellProps {
  active: ModuleKey;
  activeTab?: string;
  title: string;
  ribbon: RibbonGroup[];
  breadcrumb?: string[];
  children: ReactNode;
}

export function ErpShell({ active, activeTab, title, ribbon, breadcrumb, children }: ErpShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <TopBar active={active} />
      {ribbon.length > 0 && <RibbonBar groups={ribbon} activeTab={activeTab} />}
      <PageHeader active={active} breadcrumb={breadcrumb} title={title} />
      <main className="flex-1 px-6 pb-10">{children}</main>
      <StatusBar />
    </div>
  );
}

function TopBar({ active }: { active: ModuleKey }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const userInitials = user?.nomeCompleto
    ? user.nomeCompleto
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
    : "U";

  const userName = user?.nomeCompleto || user?.login || "Utilizador";

  const handleOpenSettings = () => {
    if (user?.perfilNome === "Administrador" || user?.permissoes?.["*"]) {
      navigate("/configuracoes");
    } else {
      toast.error("Acesso restrito", {
        description: "Apenas administradores do sistema têm permissão para aceder às configurações.",
      });
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.info("Sessão terminada.");
    navigate("/login");
  };

  return (
    <header className="bg-topbar text-topbar-foreground">
      <div className="flex items-center h-12 px-4 gap-6">
        <Link to="/inicio" className="flex items-center gap-2 font-semibold tracking-tight hover:opacity-90 transition-opacity">
          <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-primary-glow to-primary-deep grid place-items-center text-[11px] font-bold text-white shadow-sm">
            ST
          </div>
          <span className="text-sm font-bold tracking-wider">SOC<span className="opacity-75 text-primary-glow font-normal"> TECHNO</span></span>
        </Link>

        <div className="hidden md:flex items-center gap-2 text-xs opacity-80">
          <span className="font-medium text-white">{user?.empresaNome || "Empresa não configurada"}</span>
          <span>·</span>
          <span>2026</span>
        </div>

        <div className="flex-1 max-w-md mx-auto hidden lg:flex">
          <div className="flex items-center w-full bg-white/10 rounded-md px-3 h-8 text-sm">
            <Search className="w-4 h-4 opacity-70 mr-2" />
            <input
              className="bg-transparent outline-none placeholder:text-white/50 w-full text-white"
              placeholder="Pesquisar documentos, clientes, artigos…"
            />
            <kbd className="text-[10px] opacity-60 ml-2">⌘K</kbd>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <IconButton onClick={() => toast.info("Centro de Ajuda SOC TECHNO")}>
            <HelpCircle className="w-4 h-4" />
          </IconButton>
          <IconButton onClick={() => toast.info("Nenhuma notificação recente")}>
            <Bell className="w-4 h-4" />
          </IconButton>
          {/* Entrada de Configurações. Sem este botão, `handleOpenSettings`
              ficava sem uso e as configurações só eram alcançáveis por URL —
              o que torna o RBAC dela decorativo. `handleOpenSettings` é que
              decide: admin navega, o resto recebe um aviso e fica onde está. */}
          <IconButton
            onClick={handleOpenSettings}
            title="Configurações da Empresa e Sistema (Administrador)"
            dataTestId="abrir-configuracoes"
          >
            <SettingsIcon className="w-4 h-4" />
          </IconButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="perfil-menu-trigger"
                className="flex items-center gap-2 ml-2 pl-2 pr-1 h-8 rounded-md hover:bg-white/10 transition-colors cursor-pointer outline-none"
              >
                <div className="w-6 h-6 rounded-full bg-primary-glow grid place-items-center text-[10px] font-semibold text-white">
                  {userInitials}
                </div>
                <span className="text-xs hidden sm:inline max-w-[140px] truncate">{userName}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userName}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email || user?.login}</p>
                  <p className="text-[11px] text-primary font-semibold mt-1">Perfil: {user?.perfilNome}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user?.perfilNome === "Administrador" && (
                <DropdownMenuItem onClick={() => navigate("/configuracoes")} className="cursor-pointer">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Configurações do Sistema
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                data-testid="perfil-menu-sair"
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Terminar Sessão
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ModuleNavigation active={active} />
    </header>
  );
}

function ModuleNavigation({ active }: { active: ModuleKey }) {
  const { hasPermission } = useAuth();
  const modulosVisiveis = MODULES.filter((m) => m.nav !== false && hasPermission(m.modulo, m.acao));

  return (
    <nav className="px-2 flex items-end gap-0 overflow-x-auto">
      <Link
        to="/inicio"
        className={[
          "px-4 h-9 inline-flex items-center text-[12px] uppercase tracking-wider font-semibold transition-colors rounded-t-md",
          active === "inicio"
            ? "bg-ribbon text-ribbon-foreground"
            : "text-white/70 hover:text-white hover:bg-white/5",
        ].join(" ")}
      >
        Início
      </Link>
      {modulosVisiveis.map((m) => {
        const isActive = m.key === active;
        return (
          <Link
            key={m.key}
            to={m.path}
            className={[
              "px-4 h-9 inline-flex items-center text-[12px] uppercase tracking-wider font-semibold transition-colors rounded-t-md",
              isActive
                ? "bg-ribbon text-ribbon-foreground"
                : "text-white/70 hover:text-white hover:bg-white/5",
            ].join(" ")}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

function RibbonBar({ groups, activeTab }: { groups: RibbonGroup[]; activeTab?: string }) {
  return (
    <div className="bg-ribbon text-ribbon-foreground border-b border-ribbon-border shadow-[var(--shadow-ribbon)]">
      <div className="flex items-stretch gap-0 px-2 overflow-x-auto">
        {groups.map((group, gi) => (
          <div
            key={gi}
            className="flex flex-col items-center px-3 py-2 border-r border-ribbon-border last:border-r-0"
          >
            <div className="flex items-end gap-1">
              {group.actions.map((action, ai) => (
                <RibbonButton key={ai} action={action} activeTab={activeTab} />
              ))}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageHeader({ active, breadcrumb, title }: { active: ModuleKey; breadcrumb?: string[]; title: string }) {
  return (
    <div className="px-6 pt-5 pb-2 flex items-center justify-between">
      <div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {(breadcrumb ?? [getModuleLabel(active)]).map((b, i, arr) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className={i === arr.length - 1 ? "text-foreground" : ""}>{b}</span>
              {i < arr.length - 1 && <span className="opacity-50">/</span>}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{title}</h1>
      </div>
    </div>
  );
}

function StatusBar() {
  const { user } = useAuth();
  const userName = user?.nomeCompleto || user?.login || "ana.marques";

  return (
    <footer className="border-t border-border bg-card text-xs text-muted-foreground px-6 h-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
          Ligado · Base de Dados PostgreSQL
        </span>
        <span>Utilizador: {userName}</span>
      </div>
      <div className="flex items-center gap-4">
        <span>SOC TECHNO v1.0.0</span>
        <span>© 2026</span>
      </div>
    </footer>
  );
}

function IconButton({
  children,
  onClick,
  title,
  dataTestId,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  dataTestId?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      data-testid={dataTestId}
      className="w-8 h-8 grid place-items-center rounded-md hover:bg-white/10 transition-colors cursor-pointer text-white"
    >
      {children}
    </button>
  );
}

function RibbonButton({ action, activeTab }: { action: RibbonAction; activeTab?: string }) {
  const isActive = action.tabKey !== undefined && action.tabKey === activeTab;
  return (
    <button
      onClick={action.onClick}
      // O `tabKey` é o identificador estável da aba. Um teste E2E que clica por
      // texto passa a partir no dia em que a tradução muda a palavra, e passa a
      // falhar sem que nada esteja errado com a aplicação.
      data-testid={action.tabKey ? `ribbon-tab-${action.tabKey}` : undefined}
      className={[
        "flex flex-col items-center justify-start gap-1 px-2 py-1 min-w-[64px] rounded-md transition-colors group",
        isActive
          ? "bg-primary/15 ring-1 ring-primary/30"
          : "hover:bg-accent",
      ].join(" ")}
    >
      <div className={[
        "w-7 h-7 grid place-items-center",
        isActive ? "text-primary" : "text-primary group-hover:text-primary-deep",
      ].join(" ")}>
        {action.icon}
      </div>
      <div className="text-[11px] leading-tight text-center max-w-[72px] flex items-center gap-0.5">
        {action.label}
        {action.hasMenu && <ChevronDown className="w-3 h-3 opacity-60" />}
      </div>
    </button>
  );
}