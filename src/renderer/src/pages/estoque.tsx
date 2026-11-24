import { useState } from "react";
import {
  PackagePlus,
  Boxes,
  Warehouse,
  ClipboardList,
  AlertTriangle,
  FolderTree,
  MapPin,
  ArrowLeftRight,
  CalendarClock,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { ArtigoManager } from "../components/erp/ArtigoManager";
import { ArmazemManager } from "../components/erp/ArmazemManager";
import { MovimentoStockManager } from "../components/erp/MovimentoStockManager";
import { InventarioManager } from "../components/erp/InventarioManager";
import { AlertaStockManager } from "../components/erp/AlertaStockManager";
import { StockLocalizacaoManager } from "../components/erp/StockLocalizacaoManager";
import { EstruturaArmazemManager } from "../components/erp/EstruturaArmazemManager";
import { TransferenciaManager } from "../components/erp/TransferenciaManager";
import { LoteManager } from "../components/erp/LoteManager";

type Tab =
  | "artigo"
  | "armazem"
  | "movimento"
  | "inventario"
  | "alerta"
  | "localizacao"
  | "estrutura"
  | "transferencia"
  | "lote";

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("movimento");

  return (
    <ErpShell
      active="estoque"
      activeTab={tab}
      title="Stock & Gestão Multi-Armazém"
      breadcrumb={["Stock", label(tab)]}
      ribbon={[
{
            label: "Movimentos & Inventário",
            actions: [
              {
                label: "Movimentos",
                icon: <PackagePlus className="w-5 h-5" />,
                onClick: () => setTab("movimento"),
                tabKey: "movimento",
              },
              {
                label: "Transferência",
                icon: <ArrowLeftRight className="w-5 h-5" />,
                onClick: () => setTab("transferencia"),
                tabKey: "transferencia",
              },
            {
              label: "Inventário",
              icon: <ClipboardList className="w-5 h-5" />,
              onClick: () => setTab("inventario"),
              tabKey: "inventario",
            },
            {
              label: "Stock por Localização",
              icon: <FolderTree className="w-5 h-5" />,
              onClick: () => setTab("localizacao"),
              tabKey: "localizacao",
            },
            {
              label: "Estrutura do Armazém",
              icon: <MapPin className="w-5 h-5" />,
              onClick: () => setTab("estrutura"),
              tabKey: "estrutura",
            },
          ],
        },
        {
          label: "Registo",
          actions: [
            {
              label: "Artigos",
              icon: <Boxes className="w-5 h-5" />,
              onClick: () => setTab("artigo"),
              tabKey: "artigo",
            },
            {
              label: "Armazéns",
              icon: <Warehouse className="w-5 h-5" />,
              onClick: () => setTab("armazem"),
              tabKey: "armazem",
            },
            {
              label: "Lotes & Validades",
              icon: <CalendarClock className="w-5 h-5" />,
              onClick: () => setTab("lote"),
              tabKey: "lote",
            },
          ],
        },
        {
          label: "Análise & Alertas",
          actions: [
            {
              label: "Estado de Stock",
              icon: <AlertTriangle className="w-5 h-5" />,
              onClick: () => setTab("alerta"),
              tabKey: "alerta",
            },
          ],
        },
      ]}
    >
      {tab === "artigo" && <ArtigoManager />}
      {tab === "armazem" && <ArmazemManager />}
      {tab === "movimento" && <MovimentoStockManager />}
      {tab === "inventario" && <InventarioManager />}
      {tab === "alerta" && <AlertaStockManager />}
      {tab === "localizacao" && <StockLocalizacaoManager />}
      {tab === "estrutura" && <EstruturaArmazemManager />}
      {tab === "transferencia" && <TransferenciaManager />}
      {tab === "lote" && <LoteManager />}
    </ErpShell>
  );
}

function label(t: Tab) {
  return {
    artigo: "Artigos",
    armazem: "Armazéns",
    movimento: "Movimentos de Stock",
    inventario: "Inventário Físico",
    alerta: "Estado de Stock",
    localizacao: "Stock por Localização",
    estrutura: "Estrutura do Armazém",
    transferencia: "Transferência entre Armazéns",
    lote: "Lotes & Validades",
  }[t];
}
