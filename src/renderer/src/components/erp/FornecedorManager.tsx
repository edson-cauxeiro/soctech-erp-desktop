/**
 * @file FornecedorManager.tsx
 * @description Gestão completa de Fornecedores (RF05): listagem, busca, filtros e modal de criação e edição.
 */

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Truck,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  User,
  MapPin,
  Briefcase,
  Loader2,
} from "lucide-react";
import { FornecedorDto } from "../../@types/electron";
import { fornecedorApi } from "../../api/fornecedor.api";
import { FormDialog } from "./FormDialog";
import {
  FormShell,
  FormSection,
  FormTabs,
  FormTabPanel,
  TextField,
  NumberField,
  SelectField,
  SearchSelect,
} from "./FormPrimitives";
import { toast } from "sonner";

const fornecedorFormSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório").max(50),
  nome: z.string().trim().min(2, "Nome é obrigatório").max(150),
  nif: z.string().trim().min(3, "NIF inválido").max(30),
  endereco: z.string().trim().min(2, "Endereço é obrigatório").max(255),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(150).optional().or(z.literal("")),
  condPagamento: z.string().optional().or(z.literal("")),
  iban: z.string().trim().max(40).optional().or(z.literal("")),
  prazoEntregaDias: z.coerce.number().min(0),
  estado: z.enum(["ativo", "bloqueado"]),
  retencaoFonte: z.coerce.number().min(0).max(100),
});

type FornecedorFormValues = z.infer<typeof fornecedorFormSchema>;

export function FornecedorManager() {
  const [fornecedores, setFornecedores] = useState<FornecedorDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");

  // Modal de criação / edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState<FornecedorDto | null>(null);
  const [subTab, setSubTab] = useState("identificacao");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<FornecedorFormValues>({
    resolver: zodResolver(fornecedorFormSchema),
    defaultValues: {
      estado: "ativo",
      prazoEntregaDias: 0,
      retencaoFonte: 0,
    },
  });

  const fetchFornecedores = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fornecedorApi.list({
        search: search.trim() || undefined,
        estado: estadoFilter || undefined,
        take: 100,
      });

      if (res.success) {
        setFornecedores(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error("Erro ao listar fornecedores: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, [search, estadoFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFornecedores();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchFornecedores]);

  const handleCreate = () => {
    setEditingFornecedor(null);
    methods.reset({
      codigo: "",
      nome: "",
      nif: "",
      endereco: "",
      telefone: "",
      email: "",
      condPagamento: "30 dias",
      iban: "",
      prazoEntregaDias: 7,
      estado: "ativo",
      retencaoFonte: 0,
    });
    setSubTab("identificacao");
    setIsModalOpen(true);
  };

  const handleEdit = (fornecedor: FornecedorDto) => {
    setEditingFornecedor(fornecedor);
    methods.reset({
      codigo: fornecedor.codigo,
      nome: fornecedor.nome,
      nif: fornecedor.nif,
      endereco: fornecedor.endereco,
      telefone: fornecedor.telefone || "",
      email: fornecedor.email || "",
      condPagamento: fornecedor.condPagamento || "",
      iban: fornecedor.iban || "",
      prazoEntregaDias: Number(fornecedor.prazoEntregaDias || 0),
      estado: fornecedor.estado,
      retencaoFonte: Number(fornecedor.retencaoFonte || 0),
    });
    setSubTab("identificacao");
    setIsModalOpen(true);
  };

  const handleDelete = async (fornecedor: FornecedorDto) => {
    const confirmMsg = `Tem a certeza que deseja remover o fornecedor "${fornecedor.nome}" (${fornecedor.codigo})?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fornecedorApi.delete(fornecedor.id);
      if (res.success) {
        toast.success(res.data.message);
        fetchFornecedores();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao remover o fornecedor.");
    }
  };

  const handleFormSubmit = async (values: FornecedorFormValues) => {
    try {
      setIsSubmitting(true);
      if (editingFornecedor) {
        const res = await fornecedorApi.update(editingFornecedor.id, values as unknown as Partial<FornecedorDto>);
        if (res.success) {
          toast.success("Fornecedor atualizado com sucesso!");
          setIsModalOpen(false);
          fetchFornecedores();
        } else {
          toast.error(res.error.message);
        }
      } else {
        const res = await fornecedorApi.create(values as unknown as Partial<FornecedorDto>);
        if (res.success) {
          toast.success("Fornecedor cadastrado com sucesso!");
          setIsModalOpen(false);
          fetchFornecedores();
        } else {
          toast.error(res.error.message);
        }
      }
    } catch {
      toast.error("Erro ao gravar dados do fornecedor.");
    } finally {
      setIsSubmitting(false);
    }
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
              placeholder="Pesquisar por Código, Nome, NIF, IBAN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="w-48">
            <SearchSelect
              value={estadoFilter}
              onChange={setEstadoFilter}
              placeholder="Todos os Estados"
              options={[
                { value: "ativo", label: "Ativos" },
                { value: "bloqueado", label: "Bloqueados" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchFornecedores}
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
            <span>Novo Fornecedor</span>
          </button>
        </div>
      </div>

      {/* Tabela de Fornecedores */}
      <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Razão Social / Nome</th>
                <th className="px-4 py-3">NIF</th>
                <th className="px-4 py-3">Contactos</th>
                <th className="px-4 py-3">IBAN</th>
                <th className="px-4 py-3 text-center">Prazo Entrega</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>A carregar cadastro de fornecedores...</span>
                  </td>
                </tr>
              ) : fornecedores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Nenhum fornecedor encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || estadoFilter
                        ? "Tente ajustar os critérios de pesquisa."
                        : "Clique em 'Novo Fornecedor' para adicionar o primeiro fornecedor."}
                    </p>
                  </td>
                </tr>
              ) : (
                fornecedores.map((forn) => (
                  <tr key={forn.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      {forn.codigo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{forn.nome}</div>
                      <div className="text-xs text-muted-foreground">{forn.endereco}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{forn.nif}</td>
                    <td className="px-4 py-3 text-xs">
                      {forn.telefone && <div>{forn.telefone}</div>}
                      {forn.email && <div className="text-muted-foreground">{forn.email}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {forn.iban || "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {forn.prazoEntregaDias} {forn.prazoEntregaDias === 1 ? "dia" : "dias"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {forn.estado === "ativo" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Bloqueado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(forn)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar Fornecedor"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(forn)}
                          className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors"
                          title="Remover Fornecedor"
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
            Total de <strong>{total}</strong> {total === 1 ? "fornecedor registado" : "fornecedores registados"}
          </span>
          <span>Compras & Cadeia de Abastecimento • SOC TECHNO</span>
        </div>
      </div>

      {/* Modal de Criação / Edição de Fornecedor */}
      <FormDialog
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          <span className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            {editingFornecedor ? `Editar Fornecedor: ${editingFornecedor.nome}` : "Novo Fornecedor — Ficha de Cadastro"}
          </span>
        }
        description={
          editingFornecedor
            ? "Atualize as informações de contacto e condições comerciais do fornecedor."
            : "Cadastre um novo fornecedor para ordens de compra e guias de receção."
        }
        bodyClassName="p-0"
      >
        <FormShell
          methods={methods}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsModalOpen(false)}
          submitLabel={isSubmitting ? "A guardar..." : "Guardar Fornecedor"}
          flush
          dialogLayout
        >
              <FormTabs
                activeTab={subTab}
                onChange={setSubTab}
                tabs={[
                  { id: "identificacao", label: "Identificação", icon: <User className="w-4 h-4" /> },
                  { id: "contactos", label: "Contactos & Morada", icon: <MapPin className="w-4 h-4" /> },
                  { id: "comercial", label: "Condições Comerciais", icon: <Briefcase className="w-4 h-4" /> },
                ]}
              />

              <FormTabPanel id="identificacao" activeTab={subTab}>
                <FormSection title="Identificação do Fornecedor" description="Dados fiscais e identificação da empresa.">
                  <TextField name="codigo" label="Código" required placeholder="FN-0001" span="1" />
                  <TextField name="nome" label="Razão Social / Nome" required span="2" />
                  <TextField name="nif" label="NIF" required placeholder="500000000" span="1" />
                  <SelectField
                    name="estado"
                    label="Estado"
                    required
                    options={[
                      { value: "ativo", label: "Ativo" },
                      { value: "bloqueado", label: "Bloqueado" },
                    ]}
                    span="1"
                    floating
                  />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="contactos" activeTab={subTab}>
                <FormSection title="Contactos e Morada" description="Localização e meios de contacto para compras.">
                  <TextField name="endereco" label="Endereço / Sede" required span="2" />
                  <TextField name="telefone" label="Telefone" placeholder="+351 210 000 000" span="1" />
                  <TextField name="email" label="Email" type="email" placeholder="compras@fornecedor.pt" span="1" />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="comercial" activeTab={subTab}>
                <FormSection title="Condições Comerciais" description="Prazos de entrega, pagamento e dados bancários.">
                  <SelectField
                    name="condPagamento"
                    label="Condição de Pagamento"
                    options={["Pronto pagamento", "15 dias", "30 dias", "60 dias", "90 dias"]}
                    span="1"
                    floating
                  />
                  <TextField name="iban" label="IBAN / Conta Bancária" placeholder="PT50 0000 0000 0000 0000 0" span="2" />
                  <NumberField name="prazoEntregaDias" label="Prazo Médio de Entrega (dias)" span="1" />
                </FormSection>
              </FormTabPanel>
        </FormShell>
      </FormDialog>
    </div>
  );
}
