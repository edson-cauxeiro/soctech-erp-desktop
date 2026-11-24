import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FileText,
  FilePlus2,
  Receipt,
  Users,
  Tags,
  Send,
  CreditCard,
  Printer,
  ShoppingCart,
  PackageSearch,
  MapPin,
  Layers,
  FileSignature,
  Truck,
} from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { ArtigoManager } from "../components/erp/ArtigoManager";
import { ClienteManager } from "../components/erp/ClienteManager";
import { FaturaManager } from "../components/erp/FaturaManager";
import { ProformaManager } from "../components/erp/ProformaManager";
import { GuiaEntregaManager } from "../components/erp/GuiaEntregaManager";
import { ReciboManager } from "../components/erp/ReciboManager";
import {
  FormShell,
  FormSection,
  FormTabs,
  FormTabPanel,
  TextField,
  DateField,
  SelectField,
  TextAreaField,
  LineItemsField,
  DocumentTotalsSummary,
} from "../components/erp/FormPrimitives";

type Tab = "cliente" | "artigo" | "encomenda" | "fatura" | "proforma" | "guia" | "recibo";

export default function VendasPage() {
  const [tab, setTab] = useState<Tab>("cliente");
  return (
    <ErpShell
      active="vendas"
      activeTab={tab}
      title="Vendas — Registo & Documentos"
      breadcrumb={["Vendas", tabLabel(tab)]}
      ribbon={[
        {
          label: "Documentos",
          actions: [
            { label: "Fatura", icon: <FilePlus2 className="w-5 h-5" />, onClick: () => setTab("fatura"), tabKey: "fatura" },
            { label: "Proforma", icon: <FileSignature className="w-5 h-5" />, onClick: () => setTab("proforma"), tabKey: "proforma" },
            { label: "Guia", icon: <Truck className="w-5 h-5" />, onClick: () => setTab("guia"), tabKey: "guia" },
            { label: "Recibo", icon: <Receipt className="w-5 h-5" />, onClick: () => setTab("recibo"), tabKey: "recibo" },
            { label: "Encomenda", icon: <ShoppingCart className="w-5 h-5" />, onClick: () => setTab("encomenda"), tabKey: "encomenda" },
          ],
        },
        {
          label: "Registo",
          actions: [
            { label: "Clientes", icon: <Users className="w-5 h-5" />, onClick: () => setTab("cliente"), tabKey: "cliente" },
            { label: "Artigos", icon: <PackageSearch className="w-5 h-5" />, onClick: () => setTab("artigo"), tabKey: "artigo" },
            { label: "Tarifários", icon: <Tags className="w-5 h-5" />, hasMenu: true },
          ],
        },
        {
          label: "Operações",
          actions: [
            { label: "Cobranças", icon: <CreditCard className="w-5 h-5" /> },
            { label: "Enviar", icon: <Send className="w-5 h-5" /> },
            { label: "Imprimir", icon: <Printer className="w-5 h-5" /> },
            { label: "PDF", icon: <FileText className="w-5 h-5" /> },
          ],
        },
      ]}
    >
      {tab === "cliente" && <ClienteManager />}
      {tab === "artigo" && <ArtigoManager />}
      {tab === "encomenda" && <EncomendaForm />}
      {tab === "fatura" && <FaturaManager />}
      {tab === "proforma" && <ProformaManager />}
      {tab === "guia" && <GuiaEntregaManager />}
      {tab === "recibo" && <ReciboManager />}
    </ErpShell>
  );
}

function tabLabel(t: Tab) {
  return {
    cliente: "Cliente",
    artigo: "Artigo",
    encomenda: "Encomenda",
    fatura: "Fatura",
    proforma: "Proforma",
    guia: "Guia de Entrega",
    recibo: "Recibo",
  }[t];
}



/* ============ Encomenda de Cliente ============ */
const linhaSchema = z.object({
  artigo: z.string().min(1),
  quantidade: z.coerce.number().min(0.0001),
  precoUnitario: z.coerce.number().min(0),
  desconto: z.coerce.number().min(0).max(100).optional(),
  taxaIva: z.coerce.number().min(0).max(100),
});
const encomendaSchema = z.object({
  numero: z.string().trim().min(1, "Obrigatório"),
  serie: z.string().trim().min(1, "Obrigatório"),
  data: z.string().min(1, "Obrigatório"),
  dataEntrega: z.string().optional(),
  cliente: z.string().min(1, "Obrigatório"),
  vendedor: z.string().optional(),
  refCliente: z.string().max(60).optional(),
  localEntrega: z.string().optional(),
  estado: z.enum(["aberta", "parcial", "fechada", "cancelada"]),
  linhas: z.array(linhaSchema).min(1, "Adicione pelo menos uma linha"),
  observacoes: z.string().max(1000).optional(),
});
type EncomendaValues = z.infer<typeof encomendaSchema>;

function EncomendaForm() {
  const [subTab, setSubTab] = useState("cabecalho");
  const methods = useForm<EncomendaValues>({
    resolver: zodResolver(encomendaSchema),
    defaultValues: { serie: "EC 2026", estado: "aberta", linhas: [] },
  });
  return (
    <FormShell methods={methods} onSubmit={(v) => console.log("encomenda", v)}>
      <FormTabs
        activeTab={subTab}
        onChange={setSubTab}
        tabs={[
          { id: "cabecalho", label: "Cabeçalho & Cliente", icon: <FileText className="w-4 h-4" /> },
          { id: "linhas", label: "Linhas da Encomenda", icon: <Layers className="w-4 h-4" /> },
          { id: "entrega", label: "Entrega & Observações", icon: <MapPin className="w-4 h-4" /> },
        ]}
      />

      <FormTabPanel id="cabecalho" activeTab={subTab}>
        <FormSection title="Dados da Encomenda">
          <TextField name="numero" label="Nº da encomenda" required placeholder="EC 2026/0001" span="1" />
          <TextField name="serie" label="Série" required span="1" />
          <DateField name="data" label="Data da encomenda" required span="1" />
          <DateField name="dataEntrega" label="Data prevista de entrega" span="1" />
          <TextField name="cliente" label="Cliente" required span="2" />
          <TextField name="vendedor" label="Vendedor" span="1" />
          <SelectField
            name="estado"
            label="Estado"
            required
            options={[
              { value: "aberta", label: "Aberta" },
              { value: "parcial", label: "Parcial" },
              { value: "fechada", label: "Fechada" },
              { value: "cancelada", label: "Cancelada" },
            ]}
            span="1"
          />
        </FormSection>
      </FormTabPanel>

      <FormTabPanel id="linhas" activeTab={subTab}>
        <FormSection title="Linhas do documento">
          <LineItemsField<EncomendaValues>
            name="linhas"
            columns={[
              { key: "artigo", label: "Artigo" },
              { key: "quantidade", label: "Qtd.", type: "number", width: "90px" },
              { key: "precoUnitario", label: "Preço unit.", type: "number", width: "110px" },
              { key: "desconto", label: "Desc. (%)", type: "number", width: "90px" },
              { key: "taxaIva", label: "IVA (%)", type: "number", width: "80px" },
            ]}
          />
          <DocumentTotalsSummary />
        </FormSection>
      </FormTabPanel>

      <FormTabPanel id="entrega" activeTab={subTab}>
        <FormSection title="Logística e Referências">
          <TextField name="refCliente" label="Referência do cliente (PO externo)" span="2" />
          <TextField name="localEntrega" label="Local de entrega" span="2" />
          <TextAreaField name="observacoes" label="Observações" span="full" />
        </FormSection>
      </FormTabPanel>
    </FormShell>
  );
}

