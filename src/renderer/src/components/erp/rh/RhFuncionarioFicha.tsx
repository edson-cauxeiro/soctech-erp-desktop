import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormDialog } from "@/components/erp/FormDialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FormShell,
  FormTabs,
  FormTabPanel,
  FormSection,
  TextField,
  DateField,
  SelectField,
} from "@/components/erp/FormPrimitives";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Users,
  ListChecks,
  FileText,
  Ban,
  TrendingUp,
  User,
  Briefcase,
  Banknote,
  HandCoins,
  FolderOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import type {
  RhFuncionarioDetalheDto,
  RhContratoDto,
  RhDepartamentoDto,
  RhCargoDto,
  RhRubricaDto,
  RhTipoContratoDto,
  RhMotivoCessacaoDto,
  RhEstadoContratoDto,
  RhDependenteDto,
  RhFuncionarioRubricaDto,
  RhFuncionarioDocumentoDto,
  RhFuncionarioInput,
} from "@/@types/electron";

const ESTADOS = ["ATIVO", "SUSPENSO", "INATIVO", "CESSADO"] as const;
const GENEROS = ["MASCULINO", "FEMININO", "OUTRO"] as const;
const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "DIVORCIADO", "VIUVO", "UNIAO_FACTO"] as const;
const FORMAS_PAGAMENTO = ["TRANSFERENCIA", "NUMERARIO", "CHEQUE"] as const;
const MODOS_NATAL = ["PAGAMENTO_UNICO", "DUODECIMOS"] as const;
const MODOS_FERIAS = ["ANTES_GOZO", "MES_FIXO", "DUODECIMOS"] as const;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const ROTULO: Record<string, string> = {
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  INATIVO: "Inativo",
  CESSADO: "Cessado",
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
  OUTRO: "Outro",
  SOLTEIRO: "Solteiro",
  CASADO: "Casado",
  DIVORCIADO: "Divorciado",
  VIUVO: "Viúvo",
  UNIAO_FACTO: "União de facto",
  TRANSFERENCIA: "Transferência bancária",
  NUMERARIO: "Numerário",
  CHEQUE: "Cheque",
  PAGAMENTO_UNICO: "Pagamento único",
  DUODECIMOS: "Duodécimos",
  ANTES_GOZO: "Antes do gozo",
  MES_FIXO: "Mês fixo",
  PRAZO_INDETERMINADO: "Prazo indeterminado",
  PRAZO_CERTO: "Prazo certo",
  EXPERIENCIA: "Período de experiência",
  ESTAGIO: "Estágio",
  TEMPO_PARCIAL: "Tempo parcial",
  ENCERRADO: "Encerrado",
  TERMO: "Termo de contrato",
  DEMISSAO: "Demissão",
  DESPEDIMENTO: "Despedimento",
  MUTUO_ACORDO: "Mútuo acordo",
  REFORMA: "Reforma",
  FALECIMENTO: "Falecimento",
  PERIODO_EXPERIENCIA: "Fim do período de experiência",
};

const COR_ESTADO_CONTRATO: Record<RhEstadoContratoDto, string> = {
  ATIVO: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  ENCERRADO: "bg-muted text-muted-foreground border-border",
  SUSPENSO: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

const fichaSchema = z
  .object({
    nome: z.string().trim().min(1, "O nome é obrigatório.").max(160),
    documentoNumero: z.string().max(60).optional().or(z.literal("")),
    nif: z.string().max(30).optional().or(z.literal("")),
    niss: z.string().max(30).optional().or(z.literal("")),
    dataNascimento: z.string().optional().or(z.literal("")),
    genero: z.string().optional().or(z.literal("")),
    estadoCivil: z.string().optional().or(z.literal("")),
    nacionalidade: z.string().max(60).optional().or(z.literal("")),
    morada: z.string().max(240).optional().or(z.literal("")),
    telefone: z.string().max(40).optional().or(z.literal("")),
    email: z.string().email("Endereço de email inválido.").max(160).optional().or(z.literal("")),
    departamentoId: z.string().optional().or(z.literal("")),
    cargoId: z.string().optional().or(z.literal("")),
    categoria: z.string().max(60).optional().or(z.literal("")),
    dataAdmissao: z.string().min(1, "A data de admissão é obrigatória."),
    dataCessacao: z.string().optional().or(z.literal("")),
    estado: z.enum(ESTADOS),
    formaPagamento: z.enum(FORMAS_PAGAMENTO),
    banco: z.string().max(120).optional().or(z.literal("")),
    iban: z.string().max(40).optional().or(z.literal("")),
    modoSubsidioNatal: z.string().optional().or(z.literal("")),
    mesPagamentoSubsidioNatal: z.string().optional().or(z.literal("")),
    modoSubsidioFerias: z.string().optional().or(z.literal("")),
    mesPagamentoSubsidioFerias: z.string().optional().or(z.literal("")),
  })
  .refine((d) => !d.dataCessacao || !d.dataAdmissao || d.dataCessacao >= d.dataAdmissao, {
    message: "A data de cessação não pode ser anterior à data de admissão.",
    path: ["dataCessacao"],
  });

type FichaForm = z.infer<typeof fichaSchema>;

function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT");
}

function fmtKz(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return `${Number(valor).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Kz`;
}

function paraForm(f: RhFuncionarioDetalheDto): FichaForm {
  return {
    nome: f.nome,
    documentoNumero: f.documentoNumero ?? "",
    nif: f.nif ?? "",
    niss: f.niss ?? "",
    dataNascimento: f.dataNascimento ? String(f.dataNascimento).slice(0, 10) : "",
    genero: f.genero ?? "",
    estadoCivil: f.estadoCivil ?? "",
    nacionalidade: f.nacionalidade ?? "",
    morada: f.morada ?? "",
    telefone: f.telefone ?? "",
    email: f.email ?? "",
    departamentoId: f.departamentoId ?? "",
    cargoId: f.cargoId ?? "",
    categoria: f.categoria ?? "",
    dataAdmissao: String(f.dataAdmissao).slice(0, 10),
    dataCessacao: f.dataCessacao ? String(f.dataCessacao).slice(0, 10) : "",
    estado: f.estado,
    formaPagamento: f.formaPagamento,
    banco: f.banco ?? "",
    iban: f.iban ?? "",
    modoSubsidioNatal: f.modoSubsidioNatal ?? "",
    mesPagamentoSubsidioNatal:
      f.mesPagamentoSubsidioNatal != null ? String(f.mesPagamentoSubsidioNatal) : "",
    modoSubsidioFerias: f.modoSubsidioFerias ?? "",
    mesPagamentoSubsidioFerias:
      f.mesPagamentoSubsidioFerias != null ? String(f.mesPagamentoSubsidioFerias) : "",
  };
}

export function RhFuncionarioFicha({
  funcionarioId,
  aberto,
  departamentos,
  cargos,
  onFechar,
  onGuardado,
}: {
  funcionarioId: string | null;
  aberto: boolean;
  departamentos: RhDepartamentoDto[];
  cargos: RhCargoDto[];
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [detalhe, setDetalhe] = useState<RhFuncionarioDetalheDto | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [subAba, setSubAba] = useState("pessoais");
  const [rubricaOptions, setRubricaOptions] = useState<RhRubricaDto[]>([]);

  const [novoContrato, setNovoContrato] = useState(false);
  const [contratoAlvo, setContratoAlvo] = useState<RhContratoDto | null>(null);
  const [acaoContrato, setAcaoContrato] = useState<"alteracao" | "cessar" | null>(null);

  const [dependenteAlvo, setDependenteAlvo] = useState<RhDependenteDto | null>(null);
  const [novoDependente, setNovoDependente] = useState(false);

  const [rubricaAlvo, setRubricaAlvo] = useState<RhFuncionarioRubricaDto | null>(null);
  const [novaRubrica, setNovaRubrica] = useState(false);

  const [documentoAlvo, setDocumentoAlvo] = useState<RhFuncionarioDocumentoDto | null>(null);
  const [novoDocumento, setNovoDocumento] = useState(false);

  const methods = useForm<FichaForm>({
    resolver: zodResolver(fichaSchema),
    defaultValues: paraForm({
      id: "",
      empresaId: "",
      codigo: "",
      nome: "",
      documentoNumero: null,
      nif: null,
      niss: null,
      dataNascimento: null,
      genero: null,
      estadoCivil: null,
      nacionalidade: "Angolana",
      morada: null,
      telefone: null,
      email: null,
      fotoPath: null,
      departamentoId: null,
      cargoId: null,
      categoria: null,
      dataAdmissao: new Date().toISOString().slice(0, 10),
      dataCessacao: null,
      estado: "ATIVO",
      formaPagamento: "TRANSFERENCIA",
      banco: null,
      iban: null,
      modoSubsidioNatal: null,
      modoSubsidioFerias: null,
      mesPagamentoSubsidioNatal: null,
      mesPagamentoSubsidioFerias: null,
      departamento: null,
      cargo: null,
      dependentes: [],
      documentos: [],
      rubricasFixas: [],
      contratos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  });

  const carregar = useCallback(async () => {
    if (!funcionarioId) return;
    setCarregou(false);
    try {
      const res = await rhApi.funcionarios.get(funcionarioId);
      if (res.success) {
        setDetalhe(res.data);
        methods.reset(paraForm(res.data));
      } else {
        toast.error("Não foi possível carregar a ficha", { description: res.error.message });
      }
    } finally {
      setCarregou(true);
    }
  }, [funcionarioId, methods]);

  useEffect(() => {
    if (!aberto || !funcionarioId) return;
    setSubAba("pessoais");
    setNovoContrato(false);
    setContratoAlvo(null);
    setAcaoContrato(null);
    setDependenteAlvo(null);
    setNovoDependente(false);
    setRubricaAlvo(null);
    setNovaRubrica(false);
    setDocumentoAlvo(null);
    setNovoDocumento(false);
    void carregar();
  }, [aberto, funcionarioId, carregar]);

  useEffect(() => {
    let ativo = true;
    if (aberto) {
      void rhApi.config.rubricas.listar({ take: 500 }).then((res) => {
        if (ativo && res.success) setRubricaOptions(res.data.items);
      });
    }
    return () => {
      ativo = false;
    };
  }, [aberto]);

  const submeter = async (form: FichaForm) => {
    if (!funcionarioId) return;
    const payload: RhFuncionarioInput = {
      nome: form.nome.trim(),
      documentoNumero: form.documentoNumero?.trim() || null,
      nif: form.nif?.trim() || null,
      niss: form.niss?.trim() || null,
      dataNascimento: form.dataNascimento || null,
      genero: (form.genero as RhFuncionarioInput["genero"]) || null,
      estadoCivil: (form.estadoCivil as RhFuncionarioInput["estadoCivil"]) || null,
      nacionalidade: form.nacionalidade?.trim() || null,
      morada: form.morada?.trim() || null,
      telefone: form.telefone?.trim() || null,
      email: form.email?.trim() || null,
      departamentoId: form.departamentoId || null,
      cargoId: form.cargoId || null,
      categoria: form.categoria?.trim() || null,
      dataAdmissao: form.dataAdmissao,
      dataCessacao: form.dataCessacao || null,
      estado: form.estado,
      formaPagamento: form.formaPagamento,
      banco: form.banco?.trim() || null,
      iban: form.iban?.trim() || null,
      modoSubsidioNatal: (form.modoSubsidioNatal as RhFuncionarioInput["modoSubsidioNatal"]) || null,
      mesPagamentoSubsidioNatal: form.mesPagamentoSubsidioNatal
        ? Number(form.mesPagamentoSubsidioNatal)
        : null,
      modoSubsidioFerias: (form.modoSubsidioFerias as RhFuncionarioInput["modoSubsidioFerias"]) || null,
      mesPagamentoSubsidioFerias: form.mesPagamentoSubsidioFerias
        ? Number(form.mesPagamentoSubsidioFerias)
        : null,
    };

    const res = await rhApi.funcionarios.atualizar({ id: funcionarioId, ...payload });
    if (res.success) {
      toast.success("Ficha atualizada.");
      setDetalhe(res.data);
      onGuardado();
    } else {
      toast.error("Não foi possível guardar", { description: res.error.message });
    }
  };

  const erros = methods.formState.errors;
  const pessoaisComErro = ["nome", "dataAdmissao", "dataCessacao", "email", "documentoNumero", "nif", "niss", "dataNascimento", "genero", "estadoCivil", "departamentoId", "cargoId"].some(
    (k) => Boolean(erros[k as keyof FichaForm])
  );
  const bancarioComErro = ["banco", "iban"].some((k) => Boolean(erros[k as keyof FichaForm]));

  const tabs = useMemo(
    () => [
      { id: "pessoais", label: "Dados pessoais", icon: <User className="w-4 h-4" />, hasErrors: pessoaisComErro },
      { id: "contratos", label: "Contrato", icon: <Briefcase className="w-4 h-4" /> },
      { id: "bancario", label: "Bancário", icon: <Banknote className="w-4 h-4" />, hasErrors: bancarioComErro },
      { id: "dependentes", label: "Dependentes", icon: <Users className="w-4 h-4" /> },
      { id: "rubricas", label: "Rubricas fixas", icon: <ListChecks className="w-4 h-4" /> },
      { id: "subsidios", label: "Subsídios", icon: <HandCoins className="w-4 h-4" /> },
      { id: "documentos", label: "Documentos", icon: <FolderOpen className="w-4 h-4" /> },
    ],
    [pessoaisComErro, bancarioComErro]
  );

  return (
    <FormDialog
      open={aberto}
      onOpenChange={(o) => !o && onFechar()}
      title="Ficha do Funcionário"
      description={detalhe ? `${detalhe.codigo} — ${detalhe.nome}` : "A carregar…"}
    >
        {!carregou || !detalhe ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <FormShell methods={methods} onSubmit={submeter} onCancel={onFechar} flush dialogLayout>
            <FormTabs tabs={tabs} activeTab={subAba} onChange={setSubAba} />

            <div className="px-6 pb-6 pt-1">
              <FormTabPanel id="pessoais" activeTab={subAba}>
                <FormSection title="Identificação">
                  <TextField name="nome" label="Nome completo" required span="2" />
                  <TextField name="documentoNumero" label="N.º de documento" />
                  <TextField name="nif" label="NIF" />
                  <TextField name="niss" label="NISS" />
                  <DateField name="dataNascimento" label="Data de nascimento" />
                  <SelectField name="genero" label="Género" options={GENEROS.map((v) => ({ value: v, label: ROTULO[v] ?? v }))} />
                  <SelectField
                    name="estadoCivil"
                    label="Estado civil"
                    options={ESTADOS_CIVIS.map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
                  />
                  <TextField name="nacionalidade" label="Nacionalidade" />
                </FormSection>

                <FormSection title="Vínculo">
                  <SelectField
                    name="departamentoId"
                    label="Departamento"
                    options={departamentos.map((d) => ({ value: d.id, label: `${d.codigo} — ${d.nome}` }))}
                  />
                  <SelectField
                    name="cargoId"
                    label="Cargo"
                    options={cargos.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
                  />
                  <TextField name="categoria" label="Categoria profissional" />
                  <DateField name="dataAdmissao" label="Data de admissão" required />
                  <DateField name="dataCessacao" label="Data de cessação" />
                  <SelectField
                    name="estado"
                    label="Estado"
                    options={ESTADOS.map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
                  />
                  <TextField name="telefone" label="Telefone" />
                  <TextField name="email" label="Email" span="2" />
                </FormSection>

                <FormSection title="Morada">
                  <TextField name="morada" label="Morada" span="full" />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="bancario" activeTab={subAba}>
                <FormSection title="Pagamento e conta bancária">
                  <SelectField
                    name="formaPagamento"
                    label="Forma de pagamento"
                    options={FORMAS_PAGAMENTO.map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
                  />
                  <TextField name="banco" label="Banco" span="2" />
                  <TextField name="iban" label="IBAN" span="full" />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="subsidios" activeTab={subAba}>
                <FormSection title="Subsídio de Natal">
                  <SelectField
                    name="modoSubsidioNatal"
                    label="Modo de pagamento"
                    options={MODOS_NATAL.map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
                  />
                  <SelectField
                    name="mesPagamentoSubsidioNatal"
                    label="Mês de pagamento"
                    options={MESES.map((m) => ({ value: String(m), label: String(m) }))}
                  />
                </FormSection>
                <FormSection title="Subsídio de Férias">
                  <SelectField
                    name="modoSubsidioFerias"
                    label="Modo de pagamento"
                    options={MODOS_FERIAS.map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
                  />
                  <SelectField
                    name="mesPagamentoSubsidioFerias"
                    label="Mês de pagamento"
                    options={MESES.map((m) => ({ value: String(m), label: String(m) }))}
                  />
                </FormSection>
              </FormTabPanel>

              <FormTabPanel id="contratos" activeTab={subAba}>
                <ContratosTab
                  contratos={detalhe.contratos ?? []}
                  onNovo={() => setNovoContrato(true)}
                  onAlteracao={(c) => {
                    setContratoAlvo(c);
                    setAcaoContrato("alteracao");
                  }}
                  onCessar={(c) => {
                    setContratoAlvo(c);
                    setAcaoContrato("cessar");
                  }}
                />
              </FormTabPanel>

              <FormTabPanel id="dependentes" activeTab={subAba}>
                <DependentesTab
                  itens={detalhe.dependentes ?? []}
                  onAdicionar={() => setNovoDependente(true)}
                  onEditar={(d) => setDependenteAlvo(d)}
                  onRemover={async (d) => {
                    if (!confirm(`Remover dependente "${d.nome}"?`)) return;
                    const res = await rhApi.funcionarios.dependentes.remover(d.id);
                    if (res.success) {
                      toast.success("Dependente removido.");
                      void carregar();
                    } else {
                      toast.error("Não foi possível remover", { description: res.error.message });
                    }
                  }}
                />
              </FormTabPanel>

              <FormTabPanel id="rubricas" activeTab={subAba}>
                <RubricasTab
                  itens={detalhe.rubricasFixas ?? []}
                  onAdicionar={() => setNovaRubrica(true)}
                  onEditar={(r) => setRubricaAlvo(r)}
                  onInativar={async (r) => {
                    if (!confirm(`Inativar a rubrica fixa "${r.rubrica?.descricao ?? r.rubricaId}"?`)) return;
                    const res = await rhApi.funcionarios.rubricasFixas.inativar(r.id);
                    if (res.success) {
                      toast.success("Rubrica fixa inativada.");
                      void carregar();
                    } else {
                      toast.error("Não foi possível inativar", { description: res.error.message });
                    }
                  }}
                />
              </FormTabPanel>

              <FormTabPanel id="documentos" activeTab={subAba}>
                <DocumentosTab
                  itens={detalhe.documentos ?? []}
                  onAdicionar={() => setNovoDocumento(true)}
                  onEditar={(d) => setDocumentoAlvo(d)}
                  onRemover={async (d) => {
                    if (!confirm(`Remover o documento "${d.tipo}"?`)) return;
                    const res = await rhApi.funcionarios.documentos.remover(d.id);
                    if (res.success) {
                      toast.success("Documento removido.");
                      void carregar();
                    } else {
                      toast.error("Não foi possível remover", { description: res.error.message });
                    }
                  }}
                />
              </FormTabPanel>
            </div>
          </FormShell>
        )}

        {funcionarioId && (
          <>
            <DialogoNovoContrato
              aberto={novoContrato}
              funcionarioId={funcionarioId}
              onFechar={() => setNovoContrato(false)}
              onGuardado={() => void carregar()}
            />
            <DialogoAlteracaoSalarial
              aberto={acaoContrato === "alteracao" && !!contratoAlvo}
              contrato={contratoAlvo}
              onFechar={() => setAcaoContrato(null)}
              onGuardado={() => void carregar()}
            />
            <DialogoCessarContrato
              aberto={acaoContrato === "cessar" && !!contratoAlvo}
              contrato={contratoAlvo}
              onFechar={() => setAcaoContrato(null)}
              onGuardado={() => void carregar()}
            />
            <DialogoDependente
              aberto={novoDependente || !!dependenteAlvo}
              funcionarioId={funcionarioId}
              existente={dependenteAlvo}
              onFechar={() => {
                setNovoDependente(false);
                setDependenteAlvo(null);
              }}
              onGuardado={() => void carregar()}
            />
            <DialogoRubricaFixa
              aberto={novaRubrica || !!rubricaAlvo}
              funcionarioId={funcionarioId}
              existente={rubricaAlvo}
              opcoes={rubricaOptions}
              onFechar={() => {
                setNovaRubrica(false);
                setRubricaAlvo(null);
              }}
              onGuardado={() => void carregar()}
            />
            <DialogoDocumento
              aberto={novoDocumento || !!documentoAlvo}
              funcionarioId={funcionarioId}
              existente={documentoAlvo}
              onFechar={() => {
                setNovoDocumento(false);
                setDocumentoAlvo(null);
              }}
              onGuardado={() => void carregar()}
            />
          </>
        )}
    </FormDialog>
  );
}

function ContratosTab({
  contratos,
  onNovo,
  onAlteracao,
  onCessar,
}: {
  contratos: RhContratoDto[];
  onNovo: () => void;
  onAlteracao: (c: RhContratoDto) => void;
  onCessar: (c: RhContratoDto) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
          Histórico de contratos
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onNovo}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Novo contrato
        </Button>
      </div>

      {contratos.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 bg-muted/40 rounded-md border border-dashed border-border text-center">
          Ainda não existem contratos registados.
        </p>
      ) : (
        <div className="space-y-3">
          {contratos.map((c) => (
            <div key={c.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {ROTULO[c.tipo] ?? c.tipo}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COR_ESTADO_CONTRATO[c.estado]}`}
                    >
                      {(ROTULO[c.estado] ?? c.estado).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {dataCurta(c.dataInicio)} → {c.dataFim ? dataCurta(c.dataFim) : "sem termo"}
                    {c.categoria ? ` • ${c.categoria}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-primary tabular-nums">
                    {fmtKz(c.salarioBase)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.cargaHorariaSemanal}h/sem
                    {c.dataCessacao ? ` • cessado a ${dataCurta(c.dataCessacao)}` : ""}
                  </div>
                </div>
              </div>

              {c.alteracoesSalariais && c.alteracoesSalariais.length > 0 && (
                <div className="border-t border-border/60 pt-2">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1.5">
                    Alterações salariais
                  </p>
                  <ul className="space-y-1">
                    {c.alteracoesSalariais.map((a) => (
                      <li key={a.id} className="text-xs flex items-center gap-2">
                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                        <span className="text-muted-foreground">{dataCurta(a.dataEfeito)}:</span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {fmtKz(a.salarioAnterior)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono font-semibold tabular-nums text-emerald-700">
                          {fmtKz(a.salarioNovo)}
                        </span>
                        {a.motivo && <span className="text-muted-foreground/70">({ROTULO[a.motivo] ?? a.motivo})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                {c.estado === "ATIVO" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => onAlteracao(c)}>
                    <TrendingUp className="w-3.5 h-3.5 mr-1" /> Alteração salarial
                  </Button>
                )}
                {c.estado !== "ENCERRADO" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onCessar(c)}
                  >
                    <Ban className="w-3.5 h-3.5 mr-1" /> Cessar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DependentesTab({
  itens,
  onAdicionar,
  onEditar,
  onRemover,
}: {
  itens: RhDependenteDto[];
  onAdicionar: () => void;
  onEditar: (d: RhDependenteDto) => void;
  onRemover: (d: RhDependenteDto) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Dependentes</p>
        <Button type="button" size="sm" variant="outline" onClick={onAdicionar}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar dependente
        </Button>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 bg-muted/40 rounded-md border border-dashed border-border text-center">
          Sem dependentes registados.
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Nome</th>
                <th className="px-3 py-2 text-left font-semibold">Parentesco</th>
                <th className="px-3 py-2 text-left font-semibold">Nascimento</th>
                <th className="px-3 py-2 text-right font-semibold w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itens.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2.5 font-medium text-foreground">{d.nome}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.parentesco}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dataCurta(d.dataNascimento)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditar(d)} title="Editar">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemover(d)} title="Remover">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RubricasTab({
  itens,
  onAdicionar,
  onEditar,
  onInativar,
}: {
  itens: RhFuncionarioRubricaDto[];
  onAdicionar: () => void;
  onEditar: (r: RhFuncionarioRubricaDto) => void;
  onInativar: (r: RhFuncionarioRubricaDto) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
          Rubricas fixas do vencimento
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdicionar}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar rubrica
        </Button>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 bg-muted/40 rounded-md border border-dashed border-border text-center">
          Sem rubricas fixas.
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Rubrica</th>
                <th className="px-3 py-2 text-left font-semibold">Valor</th>
                <th className="px-3 py-2 text-left font-semibold">Vigência</th>
                <th className="px-3 py-2 text-left font-semibold">Estado</th>
                <th className="px-3 py-2 text-right font-semibold w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itens.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{r.rubrica?.codigo ?? r.rubricaId}</div>
                    <div className="text-xs text-muted-foreground">{r.rubrica?.descricao ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-muted-foreground">
                    {r.valor != null ? fmtKz(r.valor) : r.percentagem != null ? `${r.percentagem}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {dataCurta(r.dataInicio)} → {r.dataFim ? dataCurta(r.dataFim) : "sem termo"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        r.ativo ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {r.ativo ? "ATIVA" : "INATIVA"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditar(r)} title="Editar">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onInativar(r)}
                      disabled={!r.ativo}
                      title="Inativar"
                    >
                      <Ban className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive disabled:opacity-30" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DocumentosTab({
  itens,
  onAdicionar,
  onEditar,
  onRemover,
}: {
  itens: RhFuncionarioDocumentoDto[];
  onAdicionar: () => void;
  onEditar: (d: RhFuncionarioDocumentoDto) => void;
  onRemover: (d: RhFuncionarioDocumentoDto) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
          Cópias de documentos
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdicionar}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar documento
        </Button>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 bg-muted/40 rounded-md border border-dashed border-border text-center">
          Sem documentos anexados.
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                <th className="px-3 py-2 text-left font-semibold">Ficheiro</th>
                <th className="px-3 py-2 text-right font-semibold w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itens.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2.5 font-medium text-foreground">{ROTULO[d.tipo] ?? d.tipo}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.descricao ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {d.caminho ? (
                      <a
                        href={`file://${d.caminho}`}
                        className="text-xs text-primary underline-offset-2 hover:underline inline-flex items-center gap-1"
                        title={d.caminho}
                      >
                        <FileText className="w-3 h-3" /> {d.caminho.split(/[\\/]/).pop()}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditar(d)} title="Editar">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemover(d)} title="Remover">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children, obrigatorio }: { label: string; children: React.ReactNode; obrigatorio?: boolean }) {
  return (
    <div>
      <Label className="text-xs font-medium text-foreground block mb-1">
        {label}
        {obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function CabecalhoDialogo({
  titulo,
  descricao,
  onFechar,
}: {
  titulo: string;
  descricao?: string;
  onFechar: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
      </div>
      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onFechar} title="Fechar">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

function RodapeDialogo({
  aGuardar,
  onCancelar,
  label = "Guardar",
}: {
  aGuardar: boolean;
  onCancelar: () => void;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-4">
      <Button type="button" variant="outline" size="sm" onClick={onCancelar}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" disabled={aGuardar}>
        {aGuardar && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
        {label}
      </Button>
    </div>
  );
}

function DialogoNovoContrato({
  aberto,
  funcionarioId,
  onFechar,
  onGuardado,
}: {
  aberto: boolean;
  funcionarioId: string;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [salario, setSalario] = useState("");
  const [carga, setCarga] = useState("44");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState("");
  const [obs, setObs] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (aberto) {
      setTipo("");
      setCategoria("");
      setSalario("");
      setCarga("44");
      setDataInicio(new Date().toISOString().slice(0, 10));
      setDataFim("");
      setObs("");
    }
  }, [aberto]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo) {
      toast.error("O tipo de contrato é obrigatório.");
      return;
    }
    const salarioNum = Number(salario);
    if (!salario || Number.isNaN(salarioNum) || salarioNum <= 0) {
      toast.error("Indique o salário base (positivo).");
      return;
    }
    if (!dataInicio) {
      toast.error("A data de início é obrigatória.");
      return;
    }
    if (dataFim && dataFim < dataInicio) {
      toast.error("A data de fim não pode ser anterior ao início.");
      return;
    }
    setAGuardar(true);
    try {
      const res = await rhApi.contratos.criar({
        funcionarioId,
        tipo: tipo as RhTipoContratoDto,
        salarioBase: salarioNum,
        dataInicio,
        dataFim: dataFim || null,
        categoria: categoria.trim() || null,
        cargaHorariaSemanal: Number(carga) || 44,
        observacoes: obs.trim() || null,
      });
      if (res.success) {
        toast.success("Contrato criado.");
        onGuardado();
        onFechar();
      } else {
        toast.error("Não foi possível criar o contrato", { description: res.error.message });
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <FormDialog
      open={aberto}
      onOpenChange={(o) => !o && onFechar()}
      title="Novo contrato"
      description="Só pode existir um contrato ativo em simultâneo."
    >
      <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Tipo de contrato" obrigatorio>
              <SearchSelect
                value={tipo}
                onChange={setTipo}
                options={(
                  [
                    "PRAZO_INDETERMINADO",
                    "PRAZO_CERTO",
                    "EXPERIENCIA",
                    "ESTAGIO",
                    "TEMPO_PARCIAL",
                    "OUTRO",
                  ] as const
                ).map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
              />
            </Campo>
            <Campo label="Categoria profissional">
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="text-xs h-9" />
            </Campo>
            <Campo label="Salário base (Kz)" obrigatorio>
              <Input
                type="number"
                min={0}
                step="any"
                value={salario}
                onChange={(e) => setSalario(e.target.value)}
                className="text-xs h-9 tabular-nums"
              />
            </Campo>
            <Campo label="Carga horária semanal (h)">
              <Input
                type="number"
                min={0}
                max={168}
                value={carga}
                onChange={(e) => setCarga(e.target.value)}
                className="text-xs h-9"
              />
            </Campo>
            <Campo label="Data de início" obrigatorio>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="text-xs h-9" />
            </Campo>
            <Campo label="Data de fim">
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-xs h-9" />
            </Campo>
          </div>
          <Campo label="Observações">
            <textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full text-xs rounded-md border border-border bg-transparent px-3 py-2 resize-y"
            />
          </Campo>
        </div>
        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={aGuardar}>
            {aGuardar && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Criar contrato
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function DialogoAlteracaoSalarial({
  aberto,
  contrato,
  onFechar,
  onGuardado,
}: {
  aberto: boolean;
  contrato: RhContratoDto | null;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [dataEfeito, setDataEfeito] = useState("");
  const [salarioNovo, setSalarioNovo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (aberto) {
      setDataEfeito(new Date().toISOString().slice(0, 10));
      setSalarioNovo("");
      setMotivo("");
    }
  }, [aberto]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contrato) return;
    const novo = Number(salarioNovo);
    if (!salarioNovo || Number.isNaN(novo) || novo <= 0) {
      toast.error("Indique o novo salário (positivo).");
      return;
    }
    if (!dataEfeito) {
      toast.error("Indique a data de efeito.");
      return;
    }
    setAGuardar(true);
    try {
      const res = await rhApi.contratos.criarAlteracao({
        contratoId: contrato.id,
        dataEfeito,
        salarioNovo: novo,
        motivo: motivo || null,
      });
      if (res.success) {
        toast.success("Alteração salarial registada.");
        onGuardado();
        onFechar();
      } else {
        toast.error("Não foi possível registar a alteração", { description: res.error.message });
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <FormDialog
      open={aberto}
      onOpenChange={(o) => !o && onFechar()}
      title="Alteração salarial"
      description={contrato ? `Salário atual: ${fmtKz(contrato.salarioBase)}` : undefined}
    >
      <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Data de efeito" obrigatorio>
              <Input type="date" value={dataEfeito} onChange={(e) => setDataEfeito(e.target.value)} className="text-xs h-9" />
            </Campo>
            <Campo label="Novo salário (Kz)" obrigatorio>
              <Input
                type="number"
                min={0}
                step="any"
                value={salarioNovo}
                onChange={(e) => setSalarioNovo(e.target.value)}
                className="text-xs h-9 tabular-nums"
              />
            </Campo>
          </div>
          <Campo label="Motivo">
            <SearchSelect
              value={motivo}
              onChange={setMotivo}
              options={(
                [
                  "PROMOCAO_OU_MUDANCA_FUNCAO",
                  "ATUALIZACAO_SALARIAL",
                  "AUMENTO_MERITO",
                  "OUTRO",
                ] as const
              ).map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
            />
          </Campo>
        </div>
        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={aGuardar}>
            {aGuardar && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Registar alteração
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function DialogoCessarContrato({
  aberto,
  contrato,
  onFechar,
  onGuardado,
}: {
  aberto: boolean;
  contrato: RhContratoDto | null;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [dataCessacao, setDataCessacao] = useState("");
  const [obs, setObs] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (aberto) {
      setMotivo("");
      setDataCessacao(new Date().toISOString().slice(0, 10));
      setObs("");
    }
  }, [aberto]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contrato) return;
    if (!motivo) {
      toast.error("O motivo de cessação é obrigatório.");
      return;
    }
    if (!dataCessacao) {
      toast.error("Indique a data de cessação.");
      return;
    }
    setAGuardar(true);
    try {
      const res = await rhApi.contratos.cessar({
        id: contrato.id,
        motivo: motivo as RhMotivoCessacaoDto,
        dataCessacao,
        observacoes: obs.trim() || null,
      });
      if (res.success) {
        toast.success("Contrato cessado.");
        onGuardado();
        onFechar();
      } else {
        toast.error("Não foi possível cessar o contrato", { description: res.error.message });
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={submeter} className="space-y-4">
          <CabecalhoDialogo
            titulo="Cessar contrato"
            descricao={
              contrato
                ? `${ROTULO[contrato.tipo] ?? contrato.tipo} iniciado a ${dataCurta(contrato.dataInicio)} em ${fmtKz(contrato.salarioBase)}`
                : undefined
            }
            onFechar={onFechar}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Motivo de cessação" obrigatorio>
              <SearchSelect
                value={motivo}
                onChange={setMotivo}
                options={(
                  [
                    "TERMO",
                    "DEMISSAO",
                    "DESPEDIMENTO",
                    "MUTUO_ACORDO",
                    "REFORMA",
                    "FALECIMENTO",
                    "PERIODO_EXPERIENCIA",
                    "OUTRO",
                  ] as const
                ).map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
              />
            </Campo>
            <Campo label="Data de cessação" obrigatorio>
              <Input type="date" value={dataCessacao} onChange={(e) => setDataCessacao(e.target.value)} className="text-xs h-9" />
            </Campo>
          </div>
          <Campo label="Observações">
            <textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full text-xs rounded-md border border-border bg-transparent px-3 py-2 resize-y"
            />
          </Campo>
          <RodapeDialogo aGuardar={aGuardar} onCancelar={onFechar} label="Cessar contrato" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoDependente({
  aberto,
  funcionarioId,
  existente,
  onFechar,
  onGuardado,
}: {
  aberto: boolean;
  funcionarioId: string;
  existente: RhDependenteDto | null;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [nome, setNome] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (aberto) {
      setNome(existente?.nome ?? "");
      setParentesco(existente?.parentesco ?? "");
      setDataNascimento(existente?.dataNascimento ? String(existente.dataNascimento).slice(0, 10) : "");
    }
  }, [aberto, existente]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("O nome do dependente é obrigatório.");
      return;
    }
    if (!parentesco.trim()) {
      toast.error("O parentesco é obrigatório.");
      return;
    }
    setAGuardar(true);
    try {
      const res = existente
        ? await rhApi.funcionarios.dependentes.atualizar({
            id: existente.id,
            nome: nome.trim(),
            parentesco: parentesco.trim(),
            dataNascimento: dataNascimento || null,
          })
        : await rhApi.funcionarios.dependentes.criar({
            funcionarioId,
            nome: nome.trim(),
            parentesco: parentesco.trim(),
            dataNascimento: dataNascimento || null,
          });
      if (res.success) {
        toast.success(existente ? "Dependente atualizado." : "Dependente adicionado.");
        onGuardado();
        onFechar();
      } else {
        toast.error("Não foi possível guardar o dependente", { description: res.error.message });
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <FormDialog
      open={aberto}
      onOpenChange={(o) => !o && onFechar()}
      title={existente ? "Editar dependente" : "Adicionar dependente"}
    >
      <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-3">
            <Campo label="Nome" obrigatorio>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} className="text-xs h-9" />
            </Campo>
            <Campo label="Parentesco" obrigatorio>
              <Input value={parentesco} onChange={(e) => setParentesco(e.target.value)} placeholder="Ex.: Filho, Cônjuge" className="text-xs h-9" />
            </Campo>
            <Campo label="Data de nascimento">
              <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className="text-xs h-9" />
            </Campo>
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={aGuardar}>
            {aGuardar && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Guardar
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function DialogoRubricaFixa({
  aberto,
  funcionarioId,
  existente,
  opcoes,
  onFechar,
  onGuardado,
}: {
  aberto: boolean;
  funcionarioId: string;
  existente: RhFuncionarioRubricaDto | null;
  opcoes: RhRubricaDto[];
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [rubricaId, setRubricaId] = useState("");
  const [valor, setValor] = useState("");
  const [percentagem, setPercentagem] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (aberto) {
      setRubricaId(existente?.rubricaId ?? "");
      setValor(existente?.valor != null ? String(existente.valor) : "");
      setPercentagem(existente?.percentagem != null ? String(existente.percentagem) : "");
      setDataInicio(existente ? String(existente.dataInicio).slice(0, 10) : new Date().toISOString().slice(0, 10));
      setDataFim(existente?.dataFim ? String(existente.dataFim).slice(0, 10) : "");
    }
  }, [aberto, existente]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rubricaId) {
      toast.error("Selecione a rubrica.");
      return;
    }
    if (!dataInicio) {
      toast.error("A data de início é obrigatória.");
      return;
    }
    if (dataFim && dataFim < dataInicio) {
      toast.error("A data de fim não pode ser anterior ao início.");
      return;
    }
    const valorNum = valor ? Number(valor) : null;
    const percNum = percentagem ? Number(percentagem) : null;
    if ((valorNum != null && (Number.isNaN(valorNum) || valorNum <= 0)) || (percNum != null && (Number.isNaN(percNum) || percNum <= 0))) {
      toast.error("Valor ou percentagem devem ser positivos, se indicados.");
      return;
    }
    setAGuardar(true);
    try {
      const res = existente
        ? await rhApi.funcionarios.rubricasFixas.atualizar({
            id: existente.id,
            rubricaId,
            valor: valorNum,
            percentagem: percNum,
            dataInicio,
            dataFim: dataFim || null,
          })
        : await rhApi.funcionarios.rubricasFixas.criar({
            funcionarioId,
            rubricaId,
            valor: valorNum,
            percentagem: percNum,
            dataInicio,
            dataFim: dataFim || null,
          });
      if (res.success) {
        toast.success(existente ? "Rubrica fixa atualizada." : "Rubrica fixa adicionada.");
        onGuardado();
        onFechar();
      } else {
        toast.error("Não foi possível guardar a rubrica", { description: res.error.message });
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <FormDialog
      open={aberto}
      onOpenChange={(o) => !o && onFechar()}
      title={existente ? "Editar rubrica fixa" : "Adicionar rubrica fixa"}
    >
      <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-3">
            <Campo label="Rubrica" obrigatorio>
              <SearchSelect
                value={rubricaId}
                onChange={setRubricaId}
                options={opcoes.map((r) => ({ value: r.id, label: `${r.codigo} — ${r.descricao}` }))}
                portal
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Valor (Kz)">
                <Input type="number" min={0} step="any" value={valor} onChange={(e) => setValor(e.target.value)} className="text-xs h-9 tabular-nums" />
              </Campo>
              <Campo label="Percentagem (%)">
                <Input type="number" min={0} step="any" value={percentagem} onChange={(e) => setPercentagem(e.target.value)} className="text-xs h-9" />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Data de início" obrigatorio>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="text-xs h-9" />
              </Campo>
              <Campo label="Data de fim">
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-xs h-9" />
              </Campo>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={aGuardar}>
            {aGuardar && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Guardar
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function DialogoDocumento({
  aberto,
  funcionarioId,
  existente,
  onFechar,
  onGuardado,
}: {
  aberto: boolean;
  funcionarioId: string;
  existente: RhFuncionarioDocumentoDto | null;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [caminho, setCaminho] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (aberto) {
      setTipo(existente?.tipo ?? "");
      setDescricao(existente?.descricao ?? "");
      setCaminho(existente?.caminho ?? "");
    }
  }, [aberto, existente]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo.trim()) {
      toast.error("O tipo de documento é obrigatório.");
      return;
    }
    if (!caminho.trim()) {
      toast.error("Indique o caminho do ficheiro.");
      return;
    }
    setAGuardar(true);
    try {
      const res = existente
        ? await rhApi.funcionarios.documentos.atualizar({
            id: existente.id,
            tipo: tipo.trim(),
            descricao: descricao.trim() || null,
            caminho: caminho.trim(),
          })
        : await rhApi.funcionarios.documentos.criar({
            funcionarioId,
            tipo: tipo.trim(),
            descricao: descricao.trim() || null,
            caminho: caminho.trim(),
          });
      if (res.success) {
        toast.success(existente ? "Documento atualizado." : "Documento adicionado.");
        onGuardado();
        onFechar();
      } else {
        toast.error("Não foi possível guardar o documento", { description: res.error.message });
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <FormDialog
      open={aberto}
      onOpenChange={(o) => !o && onFechar()}
      title={existente ? "Editar documento" : "Adicionar documento"}
    >
      <form onSubmit={submeter} className="flex h-full min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-3">
            <Campo label="Tipo de documento" obrigatorio>
              <SearchSelect
                value={tipo}
                onChange={setTipo}
                options={(
                  [
                    "BI",
                    "PASSAPORTE",
                    "CERTIDAO_NASCIMENTO",
                    "CONTRATO",
                    "FORMACAO",
                    "FOTO",
                    "OUTRO",
                  ] as const
                ).map((v) => ({ value: v, label: ROTULO[v] ?? v }))}
              />
            </Campo>
            <Campo label="Descrição">
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="text-xs h-9" />
            </Campo>
            <Campo label="Caminho do ficheiro" obrigatorio>
              <Input value={caminho} onChange={(e) => setCaminho(e.target.value)} placeholder="C:/docs/bi.pdf" className="text-xs h-9" />
            </Campo>
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={aGuardar}>
            {aGuardar && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Guardar
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}