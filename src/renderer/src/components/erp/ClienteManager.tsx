/**
 * @file ClienteManager.tsx
 * @description Gestão completa de Clientes (RF02): listagem, busca, filtros e modal com validações RN02.1 (NIF PT/AO) e RN02.2.
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
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  MapPin,
  Briefcase,
  FileText,
  Loader2,
} from "lucide-react";
import { ClienteDto } from "../../@types/electron";
import { clienteApi } from "../../api/cliente.api";
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
  NumberField,
  SelectField,
  TextAreaField,
  SearchSelect,
} from "./FormPrimitives";
import { COUNTRY_OPTIONS } from "@/config/countries";
import { CURRENCY_OPTIONS } from "@/utils/currency";
import { toast } from "sonner";

const clienteFormSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório").max(50),
  nome: z.string().trim().min(2, "Nome é obrigatório").max(150),
  nif: z.string().trim().min(3, "NIF inválido").max(30),
  tipo: z.enum(["particular", "empresa"], { message: "Selecione o tipo de entidade" }),
  endereco: z.string().trim().min(2, "Endereço é obrigatório").max(255),
  codigoPostal: z.string().trim().max(20).optional().or(z.literal("")),
  cidade: z.string().trim().max(100).optional().or(z.literal("")),
  pais: z.string().trim().min(2, "País é obrigatório"),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(150).optional().or(z.literal("")),
  condPagamento: z.string().optional().or(z.literal("")),
  metodoPagamento: z.string().optional().or(z.literal("")),
  limiteCredito: z.coerce.number().min(0, "Limite de crédito deve ser ≥ 0"),
  descontoPadrao: z.coerce.number().min(0).max(100),
  moeda: z.string(),
  vendedor: z.string().optional().or(z.literal("")),
  estado: z.enum(["ativo", "inativo", "bloqueado"]),
  regimeIva: z.enum(["geral", "isento", "misto"]),
  retencaoFonte: z.coerce.number().min(0).max(100),
  observacoes: z.string().max(1000).optional().or(z.literal("")),
});

type ClienteFormValues = z.infer<typeof clienteFormSchema>;

export function ClienteManager() {
  const [clientes, setClientes] = useState<ClienteDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");

  // Modal de criação / edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<ClienteDto | null>(null);
  const [subTab, setSubTab] = useState("identificacao");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteFormSchema),
    defaultValues: {
      tipo: "empresa",
      estado: "ativo",
      regimeIva: "geral",
      pais: "Angola",
      moeda: "AOA",
      limiteCredito: 0,
      descontoPadrao: 0,
      retencaoFonte: 0,
    },
  });

  const fetchClientes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await clienteApi.list({
        search: search.trim() || undefined,
        tipo: tipoFilter || undefined,
        estado: estadoFilter || undefined,
        take: 100,
      });

      if (res.success) {
        setClientes(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao listar clientes: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, tipoFilter, estadoFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClientes();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchClientes]);

  const handleCreate = () => {
    setEditingCliente(null);
    methods.reset({
      codigo: "",
      nome: "",
      nif: "",
      tipo: "empresa",
      endereco: "",
      codigoPostal: "",
      cidade: "",
      pais: "Angola",
      telefone: "",
      email: "",
      condPagamento: "Pronto pagamento",
      metodoPagamento: "Transferência",
      limiteCredito: 0,
      descontoPadrao: 0,
      moeda: "AOA",
      vendedor: "",
      estado: "ativo",
      regimeIva: "geral",
      retencaoFonte: 0,
      observacoes: "",
    });
    setSubTab("identificacao");
    setIsModalOpen(true);
  };

  const handleEdit = (cliente: ClienteDto) => {
    setEditingCliente(cliente);
    methods.reset({
      codigo: cliente.codigo,
      nome: cliente.nome,
      nif: cliente.nif,
      tipo: cliente.tipo,
      endereco: cliente.endereco,
      codigoPostal: cliente.codigoPostal || "",
      cidade: cliente.cidade || "",
      pais: cliente.pais,
      telefone: cliente.telefone || "",
      email: cliente.email || "",
      condPagamento: cliente.condPagamento || "",
      metodoPagamento: cliente.metodoPagamento || "",
      limiteCredito: Number(cliente.limiteCredito),
      descontoPadrao: Number(cliente.descontoPadrao),
      moeda: cliente.moeda,
      vendedor: cliente.vendedor || "",
      estado: cliente.estado,
      regimeIva: cliente.regimeIva,
      retencaoFonte: Number(cliente.retencaoFonte || 0),
      observacoes: cliente.observacoes || "",
    });
    setSubTab("identificacao");
    setIsModalOpen(true);
  };

  const handleDelete = async (cliente: ClienteDto) => {
    const confirmMsg = `Tem a certeza que deseja remover ou inativar o cliente "${cliente.nome}" (${cliente.codigo})?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await clienteApi.delete(cliente.id);
      if (res.success) {
        toast.success(res.data.message);
        fetchClientes();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao remover o cliente.");
    }
  };

  const handleFormSubmit = async (values: ClienteFormValues) => {
    try {
      setIsSubmitting(true);
      if (editingCliente) {
        const res = await clienteApi.update(editingCliente.id, values as unknown as Partial<ClienteDto>);
        if (res.success) {
          toast.success("Cliente atualizado com sucesso!");
          setIsModalOpen(false);
          fetchClientes();
        } else {
          toast.error(res.error.message);
        }
      } else {
        const res = await clienteApi.create(values as unknown as Partial<ClienteDto>);
        if (res.success) {
          toast.success("Cliente cadastrado com sucesso!");
          setIsModalOpen(false);
          fetchClientes();
        } else {
          toast.error(res.error.message);
        }
      }
    } catch {
      toast.error("Erro ao gravar dados do cliente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEstadoBadge = (estado: string) => {
    if (estado === "ativo") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
        </span>
      );
    }
    if (estado === "bloqueado") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5" /> Bloqueado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
        <XCircle className="w-3.5 h-3.5" /> Inativo
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
              placeholder="Pesquisar por Código, Nome, NIF, Email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="w-44">
            <SearchSelect
              value={tipoFilter}
              onChange={setTipoFilter}
              placeholder="Todos os Tipos"
              options={[
                { value: "particular", label: "Particular" },
                { value: "empresa", label: "Empresa" },
              ]}
            />
          </div>

          <div className="w-44">
            <SearchSelect
              value={estadoFilter}
              onChange={setEstadoFilter}
              placeholder="Todos os Estados"
              options={[
                { value: "ativo", label: "Ativos" },
                { value: "bloqueado", label: "Bloqueados" },
                { value: "inativo", label: "Inativos" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchClientes}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="h-9 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-sm shadow-sm transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nome / Razão Social</th>
                <th className="px-4 py-3">NIF</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">País</th>
                <th className="px-4 py-3">Contactos</th>
                <th className="px-4 py-3 text-right">Limite Crédito</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar cadastro de clientes...</span>
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum cliente encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || tipoFilter || estadoFilter
                        ? "Tente ajustar os critérios de pesquisa."
                        : "Clique em 'Novo Cliente' para adicionar o primeiro cliente ao sistema."}
                    </p>
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      {cliente.codigo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{cliente.nome}</div>
                      {cliente.cidade && (
                        <div className="text-xs text-muted-foreground">{cliente.cidade}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{cliente.nif}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-xs bg-muted px-2 py-0.5 rounded font-medium">
                        {cliente.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{cliente.pais}</td>
                    <td className="px-4 py-3 text-xs">
                      {cliente.telefone && <div>{cliente.telefone}</div>}
                      {cliente.email && <div className="text-muted-foreground">{cliente.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {Number(cliente.limiteCredito).toFixed(2)} {cliente.moeda}
                    </td>
                    <td className="px-4 py-3 text-center">{getEstadoBadge(cliente.estado)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(cliente)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar Cliente"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors"
                          title="Remover ou Inativar"
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

        {/* Rodapé da tabela */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
          <span>
            Total de <strong>{total}</strong> {total === 1 ? "cliente registado" : "clientes registados"}
          </span>
          <span>Fichas de Entidades • SOC TECHNO</span>
        </div>
      </div>

      {/* Modal de Criação / Edição de Cliente */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <DialogTitle>
                {editingCliente ? `Editar Cliente: ${editingCliente.nome}` : "Novo Cliente — Ficha de Entidade"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {editingCliente
                ? "Atualize os dados cadastrais, morada e condições comerciais do cliente."
                : "Cadastre um novo cliente. O NIF é validado automaticamente conforme o país selecionado."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <FormShell
              methods={methods}
              onSubmit={handleFormSubmit}
              onCancel={() => setIsModalOpen(false)}
              submitLabel={isSubmitting ? "A guardar..." : "Guardar Cliente"}
            >
              <FormTabs
                activeTab={subTab}
                onChange={setSubTab}
                tabs={[
                  { id: "identificacao", label: "Identificação", icon: <User className="w-4 h-4" /> },
                  { id: "contactos", label: "Morada & Contactos", icon: <MapPin className="w-4 h-4" /> },
                  { id: "comercial", label: "Condições Comerciais", icon: <Briefcase className="w-4 h-4" /> },
                  { id: "notas", label: "Observações", icon: <FileText className="w-4 h-4" /> },
                ]}
              />

              <FormTabPanel id="identificacao" activeTab={subTab}>
                <FormSection title="Identificação" description="Dados fiscais e cadastrais da entidade.">
                  <TextField name="codigo" label="Código" required placeholder="CL-0001" span="1" />
                  <TextField name="nome" label="Nome / Designação" required span="2" />
                  <TextField name="nif" label="NIF (Fiscal)" required placeholder="500000000" span="1" />
                  <SelectField
                    name="tipo"
                    label="Tipo de Entidade"
                    required
                    options={[
                      { value: "empresa", label: "Empresa (Pessoa Coletiva)" },
                      { value: "particular", label: "Particular (Pessoa Singular)" },
                    ]}
                    span="1"
                  />
                  <SelectField
                    name="estado"
                    label="Estado"
                    required
                    options={[
                      { value: "ativo", label: "Ativo" },
                      { value: "inativo", label: "Inativo" },
                      { value: "bloqueado", label: "Bloqueado" },
                    ]}
                    span="1"
                  />
                  <SelectField
                    name="regimeIva"
                    label="Regime de IVA"
                    required
                    options={[
                      { value: "geral", label: "Regime Geral" },
                      { value: "isento", label: "Isento" },
                      { value: "misto", label: "Misto" },
                    ]}
                    span="1"
                  />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="contactos" activeTab={subTab}>
                <FormSection title="Morada e Contactos" description="Localização e meios de contacto para faturação.">
                  <TextField name="endereco" label="Endereço Fiscal" required span="2" />
                  <TextField name="codigoPostal" label="Código Postal" placeholder="1000-100" span="1" />
                  <TextField name="cidade" label="Cidade" span="1" />
                  <SelectField
                    name="pais"
                    label="País"
                    required
                    options={COUNTRY_OPTIONS}
                    placeholder="Pesquisar país..."
                    span="1"
                  />
                  <TextField name="telefone" label="Telefone" placeholder="+244 900 000 000" span="1" />
                  <TextField name="email" label="Email" type="email" placeholder="cliente@empresa.ao" span="2" />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="comercial" activeTab={subTab}>
                <FormSection title="Condições Comerciais" description="Parâmetros de crédito e descontos (RN02.2).">
                  <SelectField
                    name="condPagamento"
                    label="Condição de Pagamento"
                    options={["Pronto pagamento", "15 dias", "30 dias", "60 dias", "90 dias"]}
                    span="1"
                  />
                  <SelectField
                    name="metodoPagamento"
                    label="Método Preferido"
                    options={["Transferência", "Numerário", "Multicaixa/TPA", "Cheque"]}
                    span="1"
                  />
                  <NumberField name="limiteCredito" label="Limite de Crédito (Kz)" placeholder="0.00" span="1" />
                  <NumberField name="descontoPadrao" label="Desconto Padrão (%)" step="0.01" span="1" />
                  <SelectField name="moeda" label="Moeda Base" options={CURRENCY_OPTIONS} span="1" />
                  <TextField name="vendedor" label="Vendedor Responsável" span="1" />
                  <NumberField name="retencaoFonte" label="Retenção na Fonte (%)" step="0.01" span="1" />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="notas" activeTab={subTab}>
                <FormSection title="Observações Internas">
                  <TextAreaField name="observacoes" label="Notas Internas" placeholder="Anotações e histórico comercial..." span="full" />
                </FormSection>
              </FormTabPanel>
            </FormShell>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
