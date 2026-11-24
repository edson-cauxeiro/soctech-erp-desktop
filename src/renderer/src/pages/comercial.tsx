import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Target, Briefcase, Phone, Calendar, Mail, UserCheck, FileText, Unlock } from "lucide-react";
import { ErpShell } from "../components/erp/ErpShell";
import { SessaoCaixaManager } from "../components/erp/SessaoCaixaManager";
import {
  FormShell,
  FormSection,
  FormTabs,
  FormTabPanel,
  TextField,
  NumberField,
  DateField,
  SelectField,
  TextAreaField,
} from "../components/erp/FormPrimitives";

type Tab = "lead" | "oportunidade" | "atividade" | "caixa";

export default function ComercialPage() {
  const [tab, setTab] = useState<Tab>("oportunidade");
  return (
    <ErpShell
      active="comercial"
      activeTab={tab}
      title="Comercial — CRM"
      breadcrumb={["Comercial", label(tab)]}
      ribbon={[
        {
          label: "Pipeline",
          actions: [
            { label: "Oportunidade", icon: <Target className="w-5 h-5" />, onClick: () => setTab("oportunidade"), tabKey: "oportunidade" },
            { label: "Lead", icon: <Briefcase className="w-5 h-5" />, onClick: () => setTab("lead"), tabKey: "lead" },
          ],
        },
        {
          label: "Atividades",
          actions: [
            { label: "Chamada", icon: <Phone className="w-5 h-5" />, onClick: () => setTab("atividade"), tabKey: "atividade" },
            { label: "Reunião", icon: <Calendar className="w-5 h-5" />, onClick: () => setTab("atividade"), tabKey: "atividade" },
            { label: "Email", icon: <Mail className="w-5 h-5" />, onClick: () => setTab("atividade"), tabKey: "atividade" },
          ],
        },
        {
          label: "Caixa",
          actions: [
            {
              label: "Abertura de Caixa",
              icon: <Unlock className="w-5 h-5" />,
              onClick: () => setTab("caixa"),
              tabKey: "caixa",
            },
          ],
        },
      ]}
    >
      {tab === "lead" && <LeadForm />}
      {tab === "oportunidade" && <OportunidadeForm />}
      {tab === "atividade" && <AtividadeForm />}
      {tab === "caixa" && <SessaoCaixaManager />}
    </ErpShell>
  );
}

function label(t: Tab) {
  return { lead: "Lead", oportunidade: "Oportunidade", atividade: "Atividade" }[t];
}

const leadSchema = z.object({
  nome: z.string().min(2, "Obrigatório"),
  empresa: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefone: z.string().max(30).optional(),
  fonte: z.enum(["site", "referencia", "campanha", "outbound", "outro"]),
  estado: z.enum(["novo", "contactado", "qualificado", "descartado"]),
  responsavel: z.string().optional(),
  observacoes: z.string().max(1000).optional(),
});

function LeadForm() {
  const [subTab, setSubTab] = useState("lead");
  const methods = useForm<z.infer<typeof leadSchema>>({
    resolver: zodResolver(leadSchema),
    defaultValues: { fonte: "site", estado: "novo" },
  });
  return (
    <FormShell methods={methods} onSubmit={(v) => console.log("lead", v)}>
      <FormTabs
        activeTab={subTab}
        onChange={setSubTab}
        tabs={[
          { id: "lead", label: "Dados do Lead", icon: <UserCheck className="w-4 h-4" /> },
          { id: "notas", label: "Notas & Observações", icon: <FileText className="w-4 h-4" /> },
        ]}
      />

      <FormTabPanel id="lead" activeTab={subTab}>
        <FormSection title="Qualificação de Lead">
          <TextField name="nome" label="Nome do contacto" required span="2" />
          <TextField name="empresa" label="Empresa" span="2" />
          <TextField name="email" label="Email" type="email" span="2" />
          <TextField name="telefone" label="Telefone" span="1" />
          <SelectField name="fonte" label="Fonte" required options={[
            { value: "site", label: "Website" },
            { value: "referencia", label: "Referência" },
            { value: "campanha", label: "Campanha" },
            { value: "outbound", label: "Outbound" },
            { value: "outro", label: "Outro" },
          ]} span="1" />
          <SelectField name="estado" label="Estado" required options={[
            { value: "novo", label: "Novo" },
            { value: "contactado", label: "Contactado" },
            { value: "qualificado", label: "Qualificado" },
            { value: "descartado", label: "Descartado" },
          ]} span="1" />
          <TextField name="responsavel" label="Responsável" span="1" />
        </FormSection>
      </FormTabPanel>

      <FormTabPanel id="notas" activeTab={subTab}>
        <FormSection title="Histórico e Notas">
          <TextAreaField name="observacoes" label="Observações sobre o lead" span="full" />
        </FormSection>
      </FormTabPanel>
    </FormShell>
  );
}

const oportunidadeSchema = z.object({
  titulo: z.string().min(2, "Obrigatório"),
  cliente: z.string().min(1, "Obrigatório"),
  valorEstimado: z.coerce.number().min(0),
  probabilidade: z.coerce.number().min(0).max(100),
  fase: z.enum(["qualificacao", "proposta", "negociacao", "fechada_ganha", "fechada_perdida"]),
  dataFechoPrevista: z.string().optional(),
  vendedor: z.string().optional(),
  observacoes: z.string().max(1000).optional(),
});

function OportunidadeForm() {
  const [subTab, setSubTab] = useState("detalhes");
  const methods = useForm<z.infer<typeof oportunidadeSchema>>({
    resolver: zodResolver(oportunidadeSchema),
    defaultValues: { fase: "qualificacao", probabilidade: 20 },
  });
  return (
    <FormShell methods={methods} onSubmit={(v) => console.log("oportunidade", v)}>
      <FormTabs
        activeTab={subTab}
        onChange={setSubTab}
        tabs={[
          { id: "detalhes", label: "Detalhes do Negócio", icon: <Target className="w-4 h-4" /> },
          { id: "notas", label: "Observações", icon: <FileText className="w-4 h-4" /> },
        ]}
      />

      <FormTabPanel id="detalhes" activeTab={subTab}>
        <FormSection title="Oportunidade Comercial">
          <TextField name="titulo" label="Título da oportunidade" required span="2" />
          <TextField name="cliente" label="Cliente / Conta" required span="2" />
          <NumberField name="valorEstimado" label="Valor estimado (€)" required step="0.01" span="1" />
          <NumberField name="probabilidade" label="Probabilidade (%)" required span="1" />
          <SelectField name="fase" label="Fase do Pipeline" required options={[
            { value: "qualificacao", label: "Qualificação" },
            { value: "proposta", label: "Proposta" },
            { value: "negociacao", label: "Negociação" },
            { value: "fechada_ganha", label: "Fechada — Ganha" },
            { value: "fechada_perdida", label: "Fechada — Perdida" },
          ]} span="1" />
          <DateField name="dataFechoPrevista" label="Data fecho prevista" span="1" />
          <TextField name="vendedor" label="Vendedor responsável" span="2" />
        </FormSection>
      </FormTabPanel>

      <FormTabPanel id="notas" activeTab={subTab}>
        <FormSection title="Estratégia e Notas">
          <TextAreaField name="observacoes" label="Notas internas e estratégia da proposta" span="full" />
        </FormSection>
      </FormTabPanel>
    </FormShell>
  );
}

const atividadeSchema = z.object({
  tipo: z.enum(["chamada", "reuniao", "email", "tarefa"]),
  data: z.string().min(1, "Obrigatório"),
  cliente: z.string().min(1, "Obrigatório"),
  responsavel: z.string().min(1, "Obrigatório"),
  estado: z.enum(["agendada", "concluida", "cancelada"]),
  descricao: z.string().max(1000).optional(),
});

function AtividadeForm() {
  const [subTab, setSubTab] = useState("atividade");
  const methods = useForm<z.infer<typeof atividadeSchema>>({
    resolver: zodResolver(atividadeSchema),
    defaultValues: { tipo: "chamada", estado: "agendada" },
  });
  return (
    <FormShell methods={methods} onSubmit={(v) => console.log("atividade", v)}>
      <FormTabs
        activeTab={subTab}
        onChange={setSubTab}
        tabs={[
          { id: "atividade", label: "Agendamento de Atividade", icon: <Calendar className="w-4 h-4" /> },
        ]}
      />

      <FormTabPanel id="atividade" activeTab={subTab}>
        <FormSection title="Registo de Atividade">
          <SelectField name="tipo" label="Tipo" required options={[
            { value: "chamada", label: "Chamada" },
            { value: "reuniao", label: "Reunião" },
            { value: "email", label: "Email" },
            { value: "tarefa", label: "Tarefa" },
          ]} span="1" />
          <DateField name="data" label="Data / Hora" required span="1" />
          <SelectField name="estado" label="Estado" required options={[
            { value: "agendada", label: "Agendada" },
            { value: "concluida", label: "Concluída" },
            { value: "cancelada", label: "Cancelada" },
          ]} span="1" />
          <TextField name="cliente" label="Cliente" required span="2" />
          <TextField name="responsavel" label="Responsável" required span="2" />
          <TextAreaField name="descricao" label="Descrição / Resumo" span="full" />
        </FormSection>
      </FormTabPanel>
    </FormShell>
  );
}
