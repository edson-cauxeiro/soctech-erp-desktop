import { useState } from "react";
import {
  Truck,
  Users,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { FornecedorManager } from "../components/erp/FornecedorManager";
import { ComprasManager } from "../components/erp/ComprasManager";

type Tab = "operacoes" | "fornecedor";

export default function ComprasPage() {
  const [tab, setTab] = useState<Tab>("operacoes");

  return (
    <ErpShell
      active="compras"
      activeTab={tab}
      title="Compras & Logística de Entrada"
      breadcrumb={["Compras", label(tab)]}
      ribbon={[
        {
          label: "Operações de Compra",
          actions: [
            {
              label: "Gestão de Compras & Receção",
              icon: <Truck className="w-5 h-5" />,
              onClick: () => setTab("operacoes"),
              tabKey: "operacoes",
            },
          ],
        },
        {
          label: "Registo",
          actions: [
            {
              label: "Fornecedores",
              icon: <Users className="w-5 h-5" />,
              onClick: () => setTab("fornecedor"),
              tabKey: "fornecedor",
            },
          ],
        },
      ]}
    >
      {tab === "operacoes" && <ComprasManager />}
      {tab === "fornecedor" && <FornecedorManager />}
    </ErpShell>
  );
}

function label(t: Tab) {
  return {
    operacoes: "Encomendas, Guias & Faturas",
    fornecedor: "Fornecedores",
  }[t];
}
