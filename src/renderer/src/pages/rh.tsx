import { useState } from "react";
import { LayoutDashboard, Wallet, Users, UserRound, ClipboardList, Settings2, Edit3, Calculator, History, FileText, CreditCard, Calendar, Clock, Sun, Building2, CalendarDays } from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { RhAuditoriaTimeline } from "../components/erp/rh/RhAuditoriaTimeline";
import { RhConfiguracao } from "../components/erp/rh/RhConfiguracao";
import { RhFuncionariosManager } from "../components/erp/rh/RhFuncionariosManager";
import { RhAlteracoesMensaisManager } from "../components/erp/rh/RhAlteracoesMensaisManager";
import { RhProcessamentoManager } from "../components/erp/rh/RhProcessamentoManager";
import { RhProcessamentosHistorico } from "../components/erp/rh/RhProcessamentosHistorico";
import { RhRecibosManager } from "../components/erp/rh/RhRecibosManager";
import { RhPagamentosManager } from "../components/erp/rh/RhPagamentosManager";
import { RhAusenciasManager } from "../components/erp/rh/RhAusenciasManager";
import { RhHorasExtraManager } from "../components/erp/rh/RhHorasExtraManager";
import { RhFeriasManager } from "../components/erp/rh/RhFeriasManager";
import { RhFeriasCalendarioManager } from "../components/erp/rh/RhFeriasCalendarioManager";
import { RhAfetacoesManager } from "../components/erp/rh/RhAfetacoesManager";
import { RhDividasManager } from "../components/erp/rh/RhDividasManager";
import { RhRetroativosManager } from "../components/erp/rh/RhRetroativosManager";
import { RhIndependentesManager } from "../components/erp/rh/RhIndependentesManager";
import { RhAtividadesManager } from "../components/erp/rh/RhAtividadesManager";

type Tab = "geral" | "funcionarios" | "alteracoes-mensais" | "salarios" | "simulacao" | "processamentos" | "recibos" | "pagamentos" | "ausencias" | "horas-extra" | "ferias" | "ferias-calendario" | "afetacoes" | "dividas" | "retroativos" | "independentes" | "atividades" | "capital" | "declarativas" | "configuracao" | "auditoria";

const ROTULO: Record<Tab, string> = {
  geral: "Geral",
  funcionarios: "Funcionários",
  "alteracoes-mensais": "Alterações Mensais",
  salarios: "Salários e Honorários",
  simulacao: "Simulação",
  processamentos: "Processamentos",
  recibos: "Recibos",
  pagamentos: "Pagamentos",
  ausencias: "Ausências",
  "horas-extra": "Horas Extra",
  ferias: "Férias (Lista)",
  "ferias-calendario": "Férias (Calendário)",
  afetacoes: "Afetações",
  dividas: "Dívidas / Penhora",
  retroativos: "Retroactivos",
  independentes: "Independentes",
  atividades: "Atividades",
  capital: "Capital Humano",
  declarativas: "Obrigações Declarativas",
  configuracao: "Configuração",
  auditoria: "Auditoria",
};

export default function RhPage() {
  const [tab, setTab] = useState<Tab>("salarios");

  return (
    <ErpShell
      active="rh"
      activeTab={tab}
      title="Recursos Humanos"
      breadcrumb={["Recursos Humanos", ROTULO[tab]]}
      ribbon={[
        {
          label: "Funcionários",
          actions: [
            {
              label: "Geral",
              icon: <LayoutDashboard className="w-5 h-5" />,
              onClick: () => setTab("geral"),
              tabKey: "geral",
            },
            {
              label: "Funcionários",
              icon: <UserRound className="w-5 h-5" />,
              onClick: () => setTab("funcionarios"),
              tabKey: "funcionarios",
            },
            {
              label: "Alterações Mensais",
              icon: <Edit3 className="w-5 h-5" />,
              onClick: () => setTab("alteracoes-mensais"),
              tabKey: "alteracoes-mensais",
            },
            {
              label: "Ausências",
              icon: <Calendar className="w-5 h-5" />,
              onClick: () => setTab("ausencias"),
              tabKey: "ausencias",
            },
            {
              label: "Horas Extra",
              icon: <Clock className="w-5 h-5" />,
              onClick: () => setTab("horas-extra"),
              tabKey: "horas-extra",
            },
            {
              label: "Férias (Lista)",
              icon: <Sun className="w-5 h-5" />,
              onClick: () => setTab("ferias"),
              tabKey: "ferias",
            },
            {
              label: "Férias (Calendário)",
              icon: <CalendarDays className="w-5 h-5" />,
              onClick: () => setTab("ferias-calendario"),
              tabKey: "ferias-calendario",
            },
            {
              label: "Afetações",
              icon: <Building2 className="w-5 h-5" />,
              onClick: () => setTab("afetacoes"),
              tabKey: "afetacoes",
            },
            {
              label: "Dívidas / Penhora",
              icon: <CreditCard className="w-5 h-5" />,
              onClick: () => setTab("dividas"),
              tabKey: "dividas",
            },
            {
              label: "Retroactivos",
              icon: <FileText className="w-5 h-5" />,
              onClick: () => setTab("retroativos"),
              tabKey: "retroativos",
            },
            {
              label: "Independentes",
              icon: <Building2 className="w-5 h-5" />,
              onClick: () => setTab("independentes"),
              tabKey: "independentes",
            },
            {
              label: "Atividades",
              icon: <Building2 className="w-5 h-5" />,
              onClick: () => setTab("atividades"),
              tabKey: "atividades",
            },
          ],
        },
        {
          label: "Processamento Salarial",
          actions: [
            {
              label: "Salários e Honorários",
              icon: <Wallet className="w-5 h-5" />,
              onClick: () => setTab("salarios"),
              tabKey: "salarios",
            },
            {
              label: "Simulação",
              icon: <Calculator className="w-5 h-5" />,
              onClick: () => setTab("simulacao"),
              tabKey: "simulacao",
            },
            {
              label: "Processamentos",
              icon: <History className="w-5 h-5" />,
              onClick: () => setTab("processamentos"),
              tabKey: "processamentos",
            },
          ],
        },
        {
          label: "Recibos e Pagamentos",
          actions: [
            {
              label: "Recibos",
              icon: <FileText className="w-5 h-5" />,
              onClick: () => setTab("recibos"),
              tabKey: "recibos",
            },
            {
              label: "Pagamentos",
              icon: <CreditCard className="w-5 h-5" />,
              onClick: () => setTab("pagamentos"),
              tabKey: "pagamentos",
            },
          ],
        },
        {
          label: "Capital Humano e Declarativas",
          actions: [
            {
              label: "Capital Humano",
              icon: <Users className="w-5 h-5" />,
              onClick: () => setTab("capital"),
              tabKey: "capital",
            },
            {
              label: "Obrigações Declarativas",
              icon: <ClipboardList className="w-5 h-5" />,
              onClick: () => setTab("declarativas"),
              tabKey: "declarativas",
            },
          ],
        },
        {
          label: "Configuração",
          actions: [
            {
              label: "Configuração",
              icon: <Settings2 className="w-5 h-5" />,
              onClick: () => setTab("configuracao"),
              tabKey: "configuracao",
            },
            {
              label: "Auditoria",
              icon: <History className="w-5 h-5" />,
              onClick: () => setTab("auditoria"),
              tabKey: "auditoria",
            },
          ],
        },
      ]}
    >
      {tab === "configuracao" ? (
        <div className="mt-4">
          <RhConfiguracao />
        </div>
      ) : tab === "alteracoes-mensais" ? (
        <div className="mt-4">
          <RhAlteracoesMensaisManager />
        </div>
      ) : tab === "funcionarios" ? (
        <div className="mt-4">
          <RhFuncionariosManager />
        </div>
      ) : tab === "salarios" ? (
        <div className="mt-4">
          <RhProcessamentoManager />
        </div>
      ) : tab === "simulacao" ? (
        <div className="mt-4">
          <RhProcessamentoManager proposito="SIMULACAO" />
        </div>
      ) : tab === "processamentos" ? (
        <div className="mt-4">
          <RhProcessamentosHistorico />
        </div>
      ) : tab === "recibos" ? (
        <div className="mt-4">
          <RhRecibosManager />
        </div>
      ) : tab === "pagamentos" ? (
        <div className="mt-4">
          <RhPagamentosManager />
        </div>
      ) : tab === "ausencias" ? (
        <div className="mt-4">
          <RhAusenciasManager />
        </div>
      ) : tab === "horas-extra" ? (
        <div className="mt-4">
          <RhHorasExtraManager />
        </div>
      ) : tab === "ferias" ? (
        <div className="mt-4">
          <RhFeriasManager />
        </div>
      ) : tab === "ferias-calendario" ? (
        <div className="mt-4">
          <RhFeriasCalendarioManager />
        </div>
      ) : tab === "afetacoes" ? (
        <div className="mt-4">
          <RhAfetacoesManager />
        </div>
      ) : tab === "dividas" ? (
        <div className="mt-4">
          <RhDividasManager />
        </div>
      ) : tab === "retroativos" ? (
        <div className="mt-4">
          <RhRetroativosManager />
        </div>
      ) : tab === "independentes" ? (
        <div className="mt-4">
          <RhIndependentesManager />
        </div>
      ) : tab === "atividades" ? (
        <div className="mt-4">
          <RhAtividadesManager />
        </div>
      ) : tab === "auditoria" ? (
        <div className="mt-4 h-[calc(100vh-200px)]">
          <RhAuditoriaTimeline />
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <h2 className="text-lg font-semibold tracking-tight">{ROTULO[tab]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Módulo de Recursos Humanos em construção. Fase 0 concluída: permissões,
            contrato IPC e integração de Finanças preparados. A configuração de RH já
            está disponível no separador Configuração.
          </p>
        </div>
      )}
    </ErpShell>
  );
}
