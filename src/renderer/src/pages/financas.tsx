import { useState } from "react";
import {
  BookOpen,
  BookText,
  Calculator,
  CalendarClock,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Link2,
  LockKeyhole,
  Receipt,
  Scale,
  Settings2,
  Zap,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { ContasBancariasManager } from "../components/erp/ContasBancariasManager";
import { LancamentosManager } from "../components/erp/LancamentosManager";
import { ReconciliacaoManager } from "../components/erp/ReconciliacaoManager";
import { PlanoContasManager } from "../components/erp/PlanoContasManager";
import { DiarioContabilManager } from "../components/erp/DiarioContabilManager";
import { PeriodoContabilManager } from "../components/erp/PeriodoContabilManager";
import { ReconciliacaoContabilManager } from "../components/erp/ReconciliacaoContabilManager";
import { LancamentoContabilManager } from "../components/erp/LancamentoContabilManager";
import { RelatoriosContabilidadeManager } from "../components/erp/RelatoriosContabilidadeManager";
import { FechoPeriodoManager } from "../components/erp/FechoPeriodoManager";
import { ApuramentoIvaManager } from "../components/erp/ApuramentoIvaManager";
import { FechoAnualManager } from "../components/erp/FechoAnualManager";
import { DemonstracoesManager } from "../components/erp/DemonstracoesManager";
import { RegraContabilizacaoManager } from "../components/erp/RegraContabilizacaoManager";
import { IntegracaoContabilManager } from "../components/erp/IntegracaoContabilManager";
import { MapeamentoContaManager } from "../components/erp/MapeamentoContaManager";

type Tab =
  | "conta"
  | "movimento"
  | "reconciliacao"
  | "plano"
  | "diarios"
  | "periodos"
  | "contabilistico"
  | "reconciliacaoContabil"
  | "relatorios"
  | "fecho"
  | "iva"
  | "resultados"
  | "demonstracoes"
  | "regras"
  | "integracoes"
  | "mapeamentos";

const ROTULO: Record<Tab, string> = {
  conta: "Contas",
  movimento: "Lançamentos",
  reconciliacao: "Reconciliação",
  plano: "Plano de contas",
  diarios: "Diários",
  periodos: "Períodos",
  contabilistico: "Lançamentos contabilísticos",
  reconciliacaoContabil: "Reconciliação contabilística",
  relatorios: "Relatórios",
  fecho: "Fecho de período",
  iva: "Apuramento de IVA",
  resultados: "Resultados e fecho anual",
  demonstracoes: "Demonstrações financeiras",
  regras: "Regras de contabilização",
  integracoes: "Integração contabilística",
  mapeamentos: "Mapeamento de contas",
};

const ABAS_CONTABILIDADE: Tab[] = [
  "plano",
  "diarios",
  "periodos",
  "contabilistico",
  "reconciliacaoContabil",
  "relatorios",
  "fecho",
  "iva",
  "resultados",
  "demonstracoes",
  "regras",
  "integracoes",
  "mapeamentos",
];

export default function FinancasPage() {
  const [tab, setTab] = useState<Tab>("conta");
  const emContabilidade = ABAS_CONTABILIDADE.includes(tab);

  return (
    <ErpShell
      active="financas"
      activeTab={tab}
      title={emContabilidade ? "Finanças — Contabilidade" : "Finanças — Tesouraria"}
      breadcrumb={["Finanças", ROTULO[tab]]}
      ribbon={[
        {
          label: "Contabilidade",
          actions: [
            {
              label: "Plano de contas",
              icon: <FolderTree className="w-5 h-5" />,
              onClick: () => setTab("plano"),
              tabKey: "plano",
            },
            {
              label: "Diários",
              icon: <BookText className="w-5 h-5" />,
              onClick: () => setTab("diarios"),
              tabKey: "diarios",
            },
            {
              label: "Regras de contabilização",
              icon: <Settings2 className="w-5 h-5" />,
              onClick: () => setTab("regras"),
              tabKey: "regras",
            },
            {
              label: "Integração contabilística",
              icon: <Zap className="w-5 h-5" />,
              onClick: () => setTab("integracoes"),
              tabKey: "integracoes",
            },
            {
              label: "Mapeamento de contas",
              icon: <Link2 className="w-5 h-5" />,
              onClick: () => setTab("mapeamentos"),
              tabKey: "mapeamentos",
            },
            {
              label: "Períodos",
              icon: <CalendarClock className="w-5 h-5" />,
              onClick: () => setTab("periodos"),
              tabKey: "periodos",
            },
            {
              label: "Lançamentos contabilísticos",
              icon: <FileSpreadsheet className="w-5 h-5" />,
              onClick: () => setTab("contabilistico"),
              tabKey: "contabilistico",
            },
            {
              label: "Reconciliação contabilística",
              icon: <Link2 className="w-5 h-5" />,
              onClick: () => setTab("reconciliacaoContabil"),
              tabKey: "reconciliacaoContabil",
            },
            {
              label: "Relatórios",
              icon: <Calculator className="w-5 h-5" />,
              onClick: () => setTab("relatorios"),
              tabKey: "relatorios",
            },
            {
              label: "Fecho de período",
              icon: <LockKeyhole className="w-5 h-5" />,
              onClick: () => setTab("fecho"),
              tabKey: "fecho",
            },
            {
              label: "Apuramento de IVA",
              icon: <Receipt className="w-5 h-5" />,
              onClick: () => setTab("iva"),
              tabKey: "iva",
            },
            {
              label: "Resultados e fecho anual",
              icon: <Scale className="w-5 h-5" />,
              onClick: () => setTab("resultados"),
              tabKey: "resultados",
            },
            {
              label: "Demonstrações financeiras",
              icon: <FileSpreadsheet className="w-5 h-5" />,
              onClick: () => setTab("demonstracoes"),
              tabKey: "demonstracoes",
            },
          ],
        },
        {
          label: "Tesouraria",
          actions: [
            {
              label: "Lançamentos",
              icon: <BookOpen className="w-5 h-5" />,
              onClick: () => setTab("movimento"),
              tabKey: "movimento",
            },
          ],
        },
        {
          label: "Bancos",
          actions: [
            {
              label: "Contas",
              icon: <Landmark className="w-5 h-5" />,
              onClick: () => setTab("conta"),
              tabKey: "conta",
            },
            {
              label: "Reconciliação",
              icon: <Calculator className="w-5 h-5" />,
              onClick: () => setTab("reconciliacao"),
              tabKey: "reconciliacao",
            },
          ],
        },
      ]}
    >
      {tab === "conta" && <ContasBancariasManager />}
      {tab === "movimento" && <LancamentosManager />}
      {tab === "reconciliacao" && <ReconciliacaoManager />}
      {tab === "plano" && <PlanoContasManager />}
      {tab === "diarios" && <DiarioContabilManager />}
      {tab === "periodos" && <PeriodoContabilManager />}
      {tab === "contabilistico" && <LancamentoContabilManager />}
      {tab === "reconciliacaoContabil" && <ReconciliacaoContabilManager />}
      {tab === "relatorios" && <RelatoriosContabilidadeManager />}
      {tab === "fecho" && <FechoPeriodoManager />}
      {tab === "iva" && <ApuramentoIvaManager />}
      {tab === "resultados" && <FechoAnualManager />}
      {tab === "demonstracoes" && <DemonstracoesManager />}
      {tab === "regras" && <RegraContabilizacaoManager />}
      {tab === "integracoes" && <IntegracaoContabilManager />}
      {tab === "mapeamentos" && <MapeamentoContaManager />}
    </ErpShell>
  );
}
