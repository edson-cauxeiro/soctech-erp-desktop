import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileCode2,
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Tag,
  Sliders,
  Lock,
} from "lucide-react";
import { MODULES } from "@/config/modules";
import { EmpresaConfigDto, SerieDocumentoDto, TipoSerieDocumento } from "../../@types/electron";
import { serieApi } from "@/api/serie.api";
import { toast } from "sonner";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { AnoGroupSection, useGruposAno } from "./AnoGroups";
import { anoDeData } from "@/utils/ano";

interface SerieManagerProps {
  empresas: EmpresaConfigDto[];
}

const TIPO_DOCUMENTO_OPTIONS = [
  { value: "FT", label: "FT — Fatura" },
  { value: "FR", label: "FR — Fatura-Recibo" },
  { value: "NC", label: "NC — Nota de Crédito" },
  { value: "ND", label: "ND — Nota de Débito" },
  { value: "FP", label: "FP — Fatura Proforma" },
  { value: "GR", label: "GR — Guia de Entrega" },
  { value: "RC", label: "RC — Recibo" },
];

export function SerieManager({ empresas }: SerieManagerProps) {
  const [series, setSeries] = useState<SerieDocumentoDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"criacao" | "atributos">("criacao");

  // Séries agrupadas por ano fiscal; apenas o ano corrente inicia aberto.
  const { grupos, estaAberto, alternar, anoAtual } = useGruposAno(series, (s) =>
    anoDeData(s.dataInicio)
  );

  // Campos do formulário
  // Aba 1: Criação de Série (Empresa e Seleção de Módulos)
  const [empresaId, setEmpresaId] = useState("");
  const [selectedModulos, setSelectedModulos] = useState<string[]>([
    "vendas",
    "financas",
    "fiscal",
  ]);

  // Aba 2: Atributos da Série
  const [codigo, setCodigo] = useState(new Date().getFullYear().toString());
  const [descricao, setDescricao] = useState(
    `Série Geral ${new Date().getFullYear()}`
  );
  const [dataInicio, setDataInicio] = useState(
    `${new Date().getFullYear()}-01-01`
  );
  const [dataFim, setDataFim] = useState(
    `${new Date().getFullYear()}-12-31`
  );
  // Cada tipo de documento é numerado por séries independentes (numeração atómica por tipo).
  const [tipoDocumento, setTipoDocumento] = useState<TipoSerieDocumento>("FT");
  const lancamentoDefault = 0; // Não editável por default começa por zero

  // Se houver empresas e nenhuma selecionada, seleciona a primeira
  useEffect(() => {
    if (empresas.length > 0 && !empresaId) {
      setEmpresaId(empresas[0].id);
    }
  }, [empresas, empresaId]);

  // Atualiza módulos sugeridos da empresa selecionada
  useEffect(() => {
    if (empresaId) {
      const emp = empresas.find((e) => e.id === empresaId);
      if (emp && emp.modulosJson) {
        try {
          const modulosEmpresa = JSON.parse(emp.modulosJson);
          if (Array.isArray(modulosEmpresa) && modulosEmpresa.length > 0) {
            setSelectedModulos(modulosEmpresa);
          }
        } catch {
          // ignore
        }
      }
    }
  }, [empresaId, empresas]);

  const loadSeries = async () => {
    setIsLoading(true);
    try {
      const res = await serieApi.list();
      if (res.success && res.data) {
        setSeries(res.data);
      }
    } catch {
      toast.error("Erro ao carregar lista de séries de documentos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSeries();
  }, []);

  const toggleModulo = (key: string) => {
    setSelectedModulos((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!empresaId) {
      toast.error("Selecione a empresa para a qual associar a série.");
      setActiveTab("criacao");
      return;
    }
    if (selectedModulos.length === 0) {
      toast.error("Selecione pelo menos um módulo que usará esta série.");
      setActiveTab("criacao");
      return;
    }
    if (!codigo.trim()) {
      toast.error("Indique o código da série (ex: 2026 ou A).");
      setActiveTab("atributos");
      return;
    }
    if (!descricao.trim()) {
      toast.error("Indique a descrição da série.");
      setActiveTab("atributos");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await serieApi.create({
        codigo: codigo.trim(),
        descricao: descricao.trim(),
        empresaId,
        tipoDocumento,
        modulos: selectedModulos,
        dataInicio,
        dataFim,
        ultimoLancamento: lancamentoDefault,
        estado: "ativo",
      });

      if (res.success) {
        toast.success(`Série "${codigo}" de tipo ${tipoDocumento} criada com sucesso!`);
        // Limpa para novo registo
        setCodigo("");
        setDescricao("");
        setActiveTab("criacao");
        loadSeries();
      } else {
        toast.error("Erro ao criar série", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao registar série.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, codigoSerie: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar a série "${codigoSerie}"?`)) {
      return;
    }

    try {
      const res = await serieApi.delete(id);
      if (res.success) {
        toast.success(`Série "${codigoSerie}" removida com sucesso.`);
        loadSeries();
      } else {
        toast.error("Erro ao remover série", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao eliminar série.");
    }
  };

  // Módulos da empresa selecionada
  const empresaSelecionada = empresas.find((e) => e.id === empresaId);
  let modulosDisponiveis = MODULES;
  if (empresaSelecionada?.modulosJson) {
    try {
      const parsed = JSON.parse(empresaSelecionada.modulosJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        modulosDisponiveis = MODULES.filter((m) => parsed.includes(m.key));
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-8">
      {/* Banner Informativo */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 text-xs text-foreground">
        <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">
            Configuração Obrigatória de Séries de Documentos
          </p>
          <p className="text-muted-foreground leading-relaxed">
            As séries definem a sequência numérica legal de faturas, recibos e guias. Sem uma série ativa criada para a empresa e vinculada aos respetivos módulos, o sistema impedirá a emissão de qualquer documento fiscal ou comercial.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulário com Abas de Gestão de Séries */}
        <div className="lg:col-span-5 bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-card)] space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <FileCode2 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Configuração de Séries</h2>
          </div>

          {/* Abas do formulário */}
          <div className="flex items-center gap-2 border-b border-border -mx-2 px-2 pb-1">
            <button
              type="button"
              onClick={() => setActiveTab("criacao")}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-md transition-colors cursor-pointer border-b-2 ${
                activeTab === "criacao"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Criação de Série
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("atributos")}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-md transition-colors cursor-pointer border-b-2 ${
                activeTab === "atributos"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Atributos da Série
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ABA 1: Criação de Série (Empresa e Seleção de Módulos) */}
            {activeTab === "criacao" && (
              <div className="space-y-4 animate-in fade-in-50 duration-150">
                {/* Selecionar Empresa */}
                <div className="space-y-1.5">
                  <Label htmlFor="empresa-serie" className="text-xs font-semibold">
                    Selecionar a Empresa <span className="text-destructive">*</span>
                  </Label>
                  <SearchSelect
                    id="empresa-serie"
                    value={empresaId}
                    onChange={setEmpresaId}
                    options={
                      empresas.length === 0
                        ? [{ value: "", label: "Nenhuma empresa registada" }]
                        : empresas.map((emp) => ({
                            value: emp.id,
                            label: `${emp.nome} (${emp.identificador || emp.nif})`,
                          }))
                    }
                    placeholder="Pesquisar empresa..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Selecione a empresa proprietária desta série de numeração.
                  </p>
                </div>

                {/* Seleção dos Módulos */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      Módulos que vão usar a série criada <span className="text-destructive">*</span>
                    </Label>
                    <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {selectedModulos.length} selecionados
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Marque os módulos pagos pela empresa que terão emissão nesta série.
                  </p>

                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {modulosDisponiveis.map((m) => {
                      const isChecked = selectedModulos.includes(m.key);
                      return (
                        <div
                          key={m.key}
                          onClick={() => toggleModulo(m.key)}
                          className={`flex items-center gap-2.5 p-2 rounded-md border text-xs cursor-pointer select-none transition-colors ${
                            isChecked
                              ? "border-primary/40 bg-primary/5 text-foreground font-semibold"
                              : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleModulo(m.key)}
                            className="pointer-events-none"
                          />
                          <span>{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => setActiveTab("atributos")}
                  className="w-full text-xs font-semibold mt-2"
                >
                  Continuar para Atributos da Série →
                </Button>
              </div>
            )}

            {/* ABA 2: Atributos da Série */}
            {activeTab === "atributos" && (
              <div className="space-y-4 animate-in fade-in-50 duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="codigo-serie" className="text-xs font-semibold">
                      Série <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="codigo-serie"
                      placeholder="Ex: 2026 ou A ou FT2026"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                      className="h-9 text-sm font-mono font-bold uppercase"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Identificador alfanumérico da série.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lancamento-serie" className="text-xs font-semibold flex items-center gap-1">
                      Lançamento <Lock className="w-3 h-3 text-muted-foreground" />
                    </Label>
                    <Input
                      id="lancamento-serie"
                      type="number"
                      value={lancamentoDefault}
                      disabled
                      className="h-9 text-sm bg-muted text-muted-foreground cursor-not-allowed font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Começa por default por zero (não editável).
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="descricao-serie" className="text-xs font-semibold">
                    Descrição da Série <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="descricao-serie"
                    placeholder="Ex: Série Geral de Faturação e Vendas 2026"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="tipo-doc-serie" className="text-xs font-semibold">
                      Tipo de Documento <span className="text-destructive">*</span>
                    </Label>
                    <SearchSelect
                      value={tipoDocumento}
                      onChange={(v) => setTipoDocumento(v as TipoSerieDocumento)}
                      options={TIPO_DOCUMENTO_OPTIONS}
                      placeholder="Selecionar tipo..."
                    />
                    <p className="text-[11px] text-muted-foreground">
                      A numeração é atómica e independente por tipo. Cada documento só aceita séries
                      do seu próprio tipo.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="data-inicio-sr" className="text-xs font-semibold">
                      Data de Início <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="data-inicio-sr"
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="data-fim-sr" className="text-xs font-semibold">
                      Data Final <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="data-fim-sr"
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("criacao")}
                    className="w-1/3 text-xs"
                  >
                    ← Voltar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || empresas.length === 0}
                    className="w-2/3 text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        A criar série...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Registar Série
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Tabela de Listagem de Séries */}
        <div className="lg:col-span-7 bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Séries de Documentos Registadas</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Total: {series.length} séries
              {grupos.length > 1 && ` em ${grupos.length} anos`}
            </span>
          </div>

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">A carregar séries...</span>
            </div>
          ) : series.length === 0 ? (
            <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
              <FileCode2 className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-semibold text-foreground">
                Nenhuma série registada
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Crie uma série nas abas ao lado para permitir a emissão sequencial de documentos nos módulos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {grupos.map(({ ano, itens }) => (
                <AnoGroupSection
                  key={ano}
                  ano={ano}
                  total={itens.length}
                  unidade={{ singular: "série", plural: "séries" }}
                  aberto={estaAberto(ano)}
                  emCurso={ano === anoAtual}
                  onToggle={() => alternar(ano)}
                >
                  <SeriesTable items={itens} onDelete={handleDelete} />
                </AnoGroupSection>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeriesTable({
  items,
  onDelete,
}: {
  items: SerieDocumentoDto[];
  onDelete: (id: string, codigo: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
          <tr>
            <th className="px-3 py-2.5">Série</th>
            <th className="px-3 py-2.5">Descrição</th>
            <th className="px-3 py-2.5">Empresa</th>
            <th className="px-3 py-2.5">Período</th>
            <th className="px-3 py-2.5">Lançamento</th>
            <th className="px-3 py-2.5">Módulos</th>
            <th className="px-3 py-2.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((sr) => {
            let mods: string[] = [];
            try {
              mods = JSON.parse(sr.modulosJson);
            } catch {
              // ignore
            }

            const dtIni = new Date(sr.dataInicio).toLocaleDateString("pt-PT");
            const dtFim = new Date(sr.dataFim).toLocaleDateString("pt-PT");

            return (
              <tr key={sr.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-3 font-bold font-mono text-primary text-sm">
                  {sr.codigo}
                  <div className="text-[10px] font-sans font-semibold text-muted-foreground mt-0.5">
                    {sr.tipoDocumento || "FT"}
                  </div>
                </td>
                <td className="px-3 py-3 font-medium text-foreground">
                  {sr.descricao}
                </td>
                <td className="px-3 py-3">
                  <div className="font-semibold text-foreground">
                    {sr.empresa?.nome || "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    NIF: {sr.empresa?.nif}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-[11px]">
                  {dtIni} → {dtFim}
                </td>
                <td className="px-3 py-3 font-mono font-bold text-center">
                  {sr.ultimoLancamento}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[140px]">
                    {mods.slice(0, 2).map((m) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-muted font-medium capitalize text-muted-foreground"
                      >
                        {m}
                      </span>
                    ))}
                    {mods.length > 2 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
                        +{mods.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(sr.id, sr.codigo)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Eliminar série"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
