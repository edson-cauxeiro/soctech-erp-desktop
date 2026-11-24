import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Building2,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { MODULES } from "@/config/modules";
import { COUNTRY_OPTIONS } from "@/config/countries";
import { CURRENCY_OPTIONS } from "@/utils/currency";
import { EmpresaConfigDto } from "../../@types/electron";
import { empresaApi, CreateEmpresaPayload } from "@/api/empresa.api";
import { toast } from "sonner";
import { SearchSelect } from "@/components/ui/SearchSelect";

interface EmpresaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaToEdit?: EmpresaConfigDto | null;
  onSuccess: () => void;
}

export function EmpresaModal({
  open,
  onOpenChange,
  empresaToEdit,
  onSuccess,
}: EmpresaModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Identificador, País, Módulos
  const [identificador, setIdentificador] = useState("");
  const [pais, setPais] = useState<"PT" | "AO" | "outro">("AO");
  const [selectedModulos, setSelectedModulos] = useState<string[]>([
    "vendas",
    "financas",
    "compras",
    "estoque",
    "fiscal",
  ]);

  // Step 2: Dados da Empresa (Nome, NIF, Moeda Base, Moeda Alternativa, Contactos, Logótipo e Bancos)
  const [nome, setNome] = useState("");
  const [nif, setNif] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [logotipoUrl, setLogotipoUrl] = useState("");
  const [moedaBase, setMoedaBase] = useState("AOA");
  const [moedaAlternativa, setMoedaAlternativa] = useState("");

  // Step 3: Regime do IVA & Exercício
  const [regimeNormalMensal, setRegimeNormalMensal] = useState(true);
  const [regimeNormalTrimestral, setRegimeNormalTrimestral] = useState(false);
  const [isento, setIsento] = useState(false);
  const [motivoIsencao, setMotivoIsencao] = useState("");
  const [mesInicial, setMesInicial] = useState("2026-01-01");
  const [mesFinal, setMesFinal] = useState("2026-12-31");
  const [diasAlertaValidade, setDiasAlertaValidade] = useState("90");

  // Carregar dados para edição
  useEffect(() => {
    if (empresaToEdit) {
      setIdentificador(empresaToEdit.identificador || "");
      setPais((empresaToEdit.pais as "PT" | "AO" | "outro") || "AO");

      let modulos: string[] = [];
      try {
        if (empresaToEdit.modulosJson) {
          modulos = JSON.parse(empresaToEdit.modulosJson);
        }
      } catch {
        modulos = ["vendas", "financas", "fiscal"];
      }
      setSelectedModulos(modulos.length > 0 ? modulos : ["vendas", "financas", "fiscal"]);

      setNome(empresaToEdit.nome || "");
      setNif(empresaToEdit.nif || "");
      setEndereco(empresaToEdit.endereco || "");
      setTelefone(empresaToEdit.telefone || "");
      setEmail(empresaToEdit.email || "");
      setLogotipoUrl(empresaToEdit.logotipoUrl || "");
      setMoedaBase(empresaToEdit.moedaBase || "AOA");
      setMoedaAlternativa(empresaToEdit.moedaAlternativa || "");

      const tipo = empresaToEdit.regimeIvaTipo || "normal_mensal";
      setRegimeNormalMensal(tipo === "normal_mensal");
      setRegimeNormalTrimestral(tipo === "normal_trimestral");
      setIsento(tipo === "isento" || empresaToEdit.regimeIva === "isento");
      setMotivoIsencao(empresaToEdit.motivoIsencao || "");

      const dIni = empresaToEdit.mesInicial || empresaToEdit.anoFiscalInicio;
      const dFim = empresaToEdit.mesFinal || empresaToEdit.anoFiscalFim;
      setMesInicial(dIni ? new Date(dIni).toISOString().split("T")[0] : "2026-01-01");
      setMesFinal(dFim ? new Date(dFim).toISOString().split("T")[0] : "2026-12-31");
      setDiasAlertaValidade(String(empresaToEdit.diasAlertaValidade ?? 90));
    } else {
      // Reset para criação
      setIdentificador("");
      setPais("AO");
      setSelectedModulos(["vendas", "financas", "compras", "estoque", "fiscal"]);
      setNome("");
      setNif("");
      setEndereco("");
      setTelefone("");
      setEmail("");
      setLogotipoUrl("");
      setMoedaBase("AOA");
      setMoedaAlternativa("");
      setRegimeNormalMensal(true);
      setRegimeNormalTrimestral(false);
      setIsento(false);
      setMotivoIsencao("");
      setMesInicial("2026-01-01");
      setMesFinal("2026-12-31");
      setDiasAlertaValidade("90");
    }
    setStep(1);
  }, [empresaToEdit, open]);

  const toggleModulo = (key: string) => {
    setSelectedModulos((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    const tipoValido = ["image/jpeg", "image/png"].includes(file.type);
    const extensaoValida = /\.(jpe?g|png)$/i.test(file.name);
    if (!tipoValido || !extensaoValida) {
      toast.error("O logótipo deve ser um ficheiro JPG, JPEG ou PNG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("O logótipo não pode exceder 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogotipoUrl(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      toast.error("Não foi possível ler o ficheiro.");
    };
    reader.readAsDataURL(file);
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!identificador.trim()) {
        toast.error("Por favor, preencha o identificador da empresa.");
        return;
      }
      if (selectedModulos.length === 0) {
        toast.error("Selecione pelo menos um módulo para a empresa.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!nome.trim()) {
        toast.error("Por favor, preencha o nome da empresa.");
        return;
      }
      if (!nif.trim()) {
        toast.error("Por favor, preencha o NIF da empresa.");
        return;
      }
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  const handleSubmit = async () => {
    if (isento && !motivoIsencao.trim()) {
      toast.error("Para empresas com Regime Isento, indique a razão da isenção.");
      return;
    }

    let regimeIvaTipo = "normal_mensal";
    let regimeIva: "geral" | "simplificado" | "isento" = "geral";
    if (isento) {
      regimeIvaTipo = "isento";
      regimeIva = "isento";
    } else if (regimeNormalTrimestral) {
      regimeIvaTipo = "normal_trimestral";
    }

    const payload: CreateEmpresaPayload = {
      identificador: identificador.trim(),
      nome: nome.trim(),
      nif: nif.trim(),
      endereco: endereco.trim(),
      pais,
      telefone: telefone.trim() || null,
      email: email.trim() || null,
      logotipoUrl: logotipoUrl.trim() || null,
      moedaBase,
      moedaAlternativa: moedaAlternativa ? moedaAlternativa : null,
      modulos: selectedModulos,
      regimeIva,
      regimeIvaTipo,
      motivoIsencao: isento ? motivoIsencao.trim() : null,
      mesInicial,
      mesFinal,
      anoFiscalInicio: mesInicial,
      anoFiscalFim: mesFinal,
      diasAlertaValidade: Number(diasAlertaValidade) || 90,
    };

    setIsSubmitting(true);
    try {
      if (empresaToEdit) {
        const res = await empresaApi.update(empresaToEdit.id, payload);
        if (res.success) {
          toast.success("Empresa atualizada com sucesso!");
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error("Erro ao atualizar empresa", { description: res.error.message });
        }
      } else {
        const res = await empresaApi.create(payload);
        if (res.success) {
          toast.success("Empresa criada com sucesso!");
          onSuccess();
          onOpenChange(false);
        } else {
          toast.error("Erro ao criar empresa", { description: res.error.message });
        }
      }
    } catch {
      toast.error("Erro inesperado ao guardar dados da empresa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden shadow-2xl">
        {/* Header com Indicador de Passos */}
        <div className="bg-muted/40 p-6 border-b border-border">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
              <Building2 className="w-4 h-4" />
              <span>{empresaToEdit ? "Edição de Organização" : "Registo de Organização"}</span>
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight mt-1 text-foreground">
              {empresaToEdit ? `Editar Empresa: ${empresaToEdit.nome}` : "Nova Empresa"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure as informações essenciais, módulos contratados e parâmetros fiscais.
            </DialogDescription>
          </DialogHeader>

          {/* Stepper visual */}
          <div className="flex items-center justify-between mt-6 max-w-lg mx-auto">
            <StepItem
              num={1}
              label="Identificação & Módulos"
              active={step === 1}
              completed={step > 1}
              onClick={() => setStep(1)}
            />
            <div className={`flex-1 h-0.5 mx-2 ${step > 1 ? "bg-primary" : "bg-border"}`} />
            <StepItem
              num={2}
              label="Dados da Empresa"
              active={step === 2}
              completed={step > 2}
              onClick={() => step > 2 && setStep(2)}
            />
            <div className={`flex-1 h-0.5 mx-2 ${step > 2 ? "bg-primary" : "bg-border"}`} />
            <StepItem
              num={3}
              label="Regime IVA & Exercício"
              active={step === 3}
              completed={false}
              onClick={() => {}}
            />
          </div>
        </div>

        {/* Conteúdo dos Passos */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {/* PASSO 1: Identificador, País e Módulos */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="identificador" className="text-xs font-semibold">
                    Identificador da Empresa <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="identificador"
                    placeholder="Ex: EMP01, DORA-AO, SOCIEDADE-PT"
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value.toUpperCase())}
                    className="h-9 text-sm uppercase font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Código exclusivo e curto para identificar a empresa no sistema.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pais" className="text-xs font-semibold">
                    País de Exercício <span className="text-destructive">*</span>
                  </Label>
                  <SearchSelect
                    id="pais"
                    value={pais}
                    onChange={(val) => setPais(val as "PT" | "AO" | "outro")}
                    options={COUNTRY_OPTIONS}
                    placeholder="Pesquisar país..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Define o enquadramento fiscal e de moeda base.
                  </p>
                </div>
              </div>

              {/* Seleção de Módulos */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    Selecionar os Módulos Pagos pela Empresa <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {selectedModulos.length} selecionados
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Marque os módulos autorizados e contratados que esta empresa terá permissão de utilizar.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {MODULES.map((m) => {
                    const isChecked = selectedModulos.includes(m.key);
                    return (
                      <div
                        key={m.key}
                        onClick={() => toggleModulo(m.key)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                          isChecked
                            ? "border-primary/40 bg-primary/5 text-foreground shadow-xs"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleModulo(m.key)}
                          className="pointer-events-none"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{m.label}</span>
                          <span className="text-[10px] opacity-70">Módulo SOC TECHNO</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: Dados da Empresa */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nome" className="text-xs font-semibold">
                    Nome da Empresa / Razão Social <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nome"
                    placeholder="Ex: DoraERP Soluções Tecnológicas, Lda."
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nif" className="text-xs font-semibold">
                    NIF / NIF Fiscal <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nif"
                    placeholder="Ex: 599999990"
                    value={nif}
                    onChange={(e) => setNif(e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="endereco" className="text-xs font-semibold">
                    Endereço Principal
                  </Label>
                  <Input
                    id="endereco"
                    placeholder="Ex: Avenida da Liberdade, 100, Lisboa"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="telefone" className="text-xs font-semibold">
                    Telefone
                  </Label>
                  <Input
                    id="telefone"
                    placeholder="Ex: +244 923 000 000"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Apresentado no cabeçalho dos documentos fiscais.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Ex: geral@empresa.ao"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="logotipoUrl" className="text-xs font-semibold">
                    Logótipo (JPG/PNG)
                  </Label>
                  <div className="flex items-center gap-3">
                    {logotipoUrl ? (
                      <>
                        <img
                          src={logotipoUrl}
                          alt="Pré-visualização do logótipo"
                          className="h-16 w-16 rounded-md border border-border bg-white object-contain p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setLogotipoUrl("")}
                          className="h-9 px-3 border border-border rounded-md hover:bg-muted text-destructive text-sm transition-colors"
                        >
                          Remover
                        </button>
                      </>
                    ) : (
                      <span className="h-16 w-16 rounded-md border border-dashed border-border grid place-items-center text-[10px] text-muted-foreground">
                        Sem logótipo
                      </span>
                    )}
                    <Input
                      id="logotipoUrl"
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => {
                        handleLogoFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="h-9 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Impresso no canto superior esquerdo da folha A4. Apenas JPG e PNG até 2 MB.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Dados Bancários</Label>
                  <p className="text-[11px] text-muted-foreground border border-dashed border-border rounded-md px-3 py-2.5 leading-relaxed">
                    As contas bancárias e caixas mantêm-se em{" "}
                    <span className="font-medium text-foreground">Finanças › Contas</span>, e
                    é de lá que os documentos impressos tiram os dados de pagamento. Escrever
                    aqui não altera nada.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="moedaBase" className="text-xs font-semibold">
                    Moeda Base <span className="text-destructive">*</span>
                  </Label>
                  <SearchSelect
                    id="moedaBase"
                    value={moedaBase}
                    onChange={setMoedaBase}
                    options={CURRENCY_OPTIONS}
                    placeholder="Pesquisar moeda base..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Moeda padrão de contabilidade e emissão.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="moedaAlternativa" className="text-xs font-semibold">
                    Moeda Alternativa
                  </Label>
                  <SearchSelect
                    id="moedaAlternativa"
                    value={moedaAlternativa}
                    onChange={setMoedaAlternativa}
                    allowClear
                    options={CURRENCY_OPTIONS}
                    placeholder="(Nenhuma)"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Opcional, para operações com dupla divisa ou cotação.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: Regime do IVA & Separador Exercício */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* Regime do IVA */}
              <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/70">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                  Regime do IVA
                </Label>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="regime-mensal"
                      checked={regimeNormalMensal && !isento}
                      disabled={isento}
                      onCheckedChange={(c) => {
                        if (c) {
                          setRegimeNormalMensal(true);
                          setRegimeNormalTrimestral(false);
                          setIsento(false);
                        }
                      }}
                    />
                    <Label htmlFor="regime-mensal" className="text-xs font-medium cursor-pointer">
                      Regime Normal — mensal
                    </Label>
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="regime-trimestral"
                      checked={regimeNormalTrimestral && !isento}
                      disabled={isento}
                      onCheckedChange={(c) => {
                        if (c) {
                          setRegimeNormalTrimestral(true);
                          setRegimeNormalMensal(false);
                          setIsento(false);
                        }
                      }}
                    />
                    <Label htmlFor="regime-trimestral" className="text-xs font-medium cursor-pointer">
                      Regime Normal — trimestral
                    </Label>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-border/50">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="regime-isento"
                        checked={isento}
                        onCheckedChange={(c) => {
                          const val = Boolean(c);
                          setIsento(val);
                          if (val) {
                            setRegimeNormalMensal(false);
                            setRegimeNormalTrimestral(false);
                          } else {
                            setRegimeNormalMensal(true);
                          }
                        }}
                      />
                      <Label htmlFor="regime-isento" className="text-xs font-medium cursor-pointer">
                        Isento de IVA
                      </Label>
                    </div>

                    {isento && (
                      <div className="pl-7 space-y-1.5 animate-in fade-in-50 duration-150">
                        <Label htmlFor="motivoIsencao" className="text-xs text-muted-foreground">
                          Razão / Motivo da Isenção <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="motivoIsencao"
                          placeholder="Ex: Artigo 9.º do CIVA ou Regime de Isenção (Art. 53.º)"
                          value={motivoIsencao}
                          onChange={(e) => setMotivoIsencao(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Separador "Exercício" */}
              <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/70">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Separador: Exercício
                </Label>
                <p className="text-xs text-muted-foreground">
                  Defina o período padrão do ano fiscal para a empresa.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="mesInicial" className="text-xs font-semibold">
                      Mês Inicial <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="mesInicial"
                      type="date"
                      value={mesInicial}
                      onChange={(e) => setMesInicial(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mesFinal" className="text-xs font-semibold">
                      Mês Final <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="mesFinal"
                      type="date"
                      value={mesFinal}
                      onChange={(e) => setMesFinal(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Alertas de validade de lotes */}
              <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/70">
                <Label
                  htmlFor="diasAlertaValidade"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-primary" />
                  Alertas de Validade
                </Label>
                <div className="space-y-1.5">
                  <Label htmlFor="diasAlertaValidade" className="text-xs font-semibold">
                    Antecedência do alerta de caducidade (dias)
                  </Label>
                  <Input
                    id="diasAlertaValidade"
                    type="number"
                    min={1}
                    value={diasAlertaValidade}
                    onChange={(e) => setDiasAlertaValidade(e.target.value)}
                    className="h-9 text-xs max-w-[160px]"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Quantos dias antes da validade de um lote o Estado de Stock deve
                    começar a assinalá-lo como «a caducar». Por defeito, 90 dias.
                  </p>
                </div>
              </div>

              {/* Aviso importante da regra de negócio */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning/10 border border-warning/20 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span>
                  <strong>Importante:</strong> Para que a empresa possa emitir faturas ou qualquer documento nos módulos, é obrigatório após a criação da empresa registar a <strong>Gestão de Exercício</strong> e a <strong>Gestão de Séries</strong>.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer com botões de navegação */}
        <div className="bg-muted/30 px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Cancelar
          </Button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevStep}
                className="text-xs flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </Button>
            )}

            {step < 3 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                className="text-xs flex items-center gap-1"
              >
                Seguinte
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="text-xs font-semibold"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    A guardar...
                  </span>
                ) : empresaToEdit ? (
                  "Guardar Alterações"
                ) : (
                  "Criar Empresa"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepItem({
  num,
  label,
  active,
  completed,
  onClick,
}: {
  num: number;
  label: string;
  active: boolean;
  completed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!completed && !active}
      className="flex items-center gap-2 group text-left cursor-pointer disabled:cursor-default"
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
          active
            ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
            : completed
            ? "bg-primary/20 text-primary group-hover:bg-primary/30"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {completed ? <CheckCircle2 className="w-4 h-4" /> : num}
      </div>
      <span
        className={`text-xs font-medium hidden sm:inline transition-colors ${
          active
            ? "text-foreground font-semibold"
            : completed
            ? "text-muted-foreground group-hover:text-foreground"
            : "text-muted-foreground/60"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
