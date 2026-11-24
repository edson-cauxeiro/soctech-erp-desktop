import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarDays,
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  CalendarCheck,
} from "lucide-react";
import { MODULES } from "@/config/modules";
import { EmpresaConfigDto, ExercicioFiscalDto } from "../../@types/electron";
import { exercicioApi } from "@/api/exercicio.api";
import { toast } from "sonner";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { AnoGroupSection, useGruposAno } from "./AnoGroups";
import { anoDeTexto } from "@/utils/ano";

interface ExercicioManagerProps {
  empresas: EmpresaConfigDto[];
}

export function ExercicioManager({ empresas }: ExercicioManagerProps) {
  const [exercicios, setExercicios] = useState<ExercicioFiscalDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Exercícios agrupados por ano fiscal; apenas o ano corrente inicia aberto.
  const { grupos, estaAberto, alternar, anoAtual } = useGruposAno(exercicios, (ex) =>
    anoDeTexto(ex.ano, ex.dataInicio)
  );

  // Campos do formulário
  const [empresaId, setEmpresaId] = useState("");
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [dataInicio, setDataInicio] = useState(`${new Date().getFullYear()}-01-01`);
  const [dataFim, setDataFim] = useState(`${new Date().getFullYear()}-12-31`);
  const [selectedModulos, setSelectedModulos] = useState<string[]>([
    "vendas",
    "financas",
    "compras",
    "estoque",
    "fiscal",
  ]);

  // Se houver empresas e nenhuma selecionada, seleciona a primeira
  useEffect(() => {
    if (empresas.length > 0 && !empresaId) {
      setEmpresaId(empresas[0].id);
    }
  }, [empresas, empresaId]);

  // Atualiza módulos disponíveis conforme a empresa selecionada
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

  const loadExercicios = async () => {
    setIsLoading(true);
    try {
      const res = await exercicioApi.list();
      if (res.success && res.data) {
        setExercicios(res.data);
      }
    } catch {
      toast.error("Erro ao carregar lista de exercícios fiscais.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExercicios();
  }, []);

  const handleAnoChange = (novoAno: string) => {
    setAno(novoAno);
    if (/^\d{4}$/.test(novoAno)) {
      setDataInicio(`${novoAno}-01-01`);
      setDataFim(`${novoAno}-12-31`);
    }
  };

  const toggleModulo = (key: string) => {
    setSelectedModulos((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!empresaId) {
      toast.error("Selecione a empresa para a qual criar o exercício.");
      return;
    }
    if (!ano.trim()) {
      toast.error("Indique o ano do exercício.");
      return;
    }
    if (selectedModulos.length === 0) {
      toast.error("Selecione pelo menos um módulo para utilizar este exercício.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await exercicioApi.create({
        ano: ano.trim(),
        empresaId,
        modulos: selectedModulos,
        dataInicio,
        dataFim,
        estado: "aberto",
      });

      if (res.success) {
        toast.success(`Exercício fiscal ${ano} criado com sucesso!`);
        loadExercicios();
      } else {
        toast.error("Erro ao criar exercício fiscal", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao criar exercício.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, anoExercicio: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar o exercício fiscal de ${anoExercicio}?`)) {
      return;
    }

    try {
      const res = await exercicioApi.delete(id);
      if (res.success) {
        toast.success(`Exercício ${anoExercicio} removido com sucesso.`);
        loadExercicios();
      } else {
        toast.error("Erro ao remover exercício", { description: res.error.message });
      }
    } catch {
      toast.error("Erro inesperado ao eliminar exercício.");
    }
  };

  // Módulos contratados da empresa selecionada
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
            Configuração Obrigatória do Exercício Fiscal
          </p>
          <p className="text-muted-foreground leading-relaxed">
            As informações de exercício fiscal são cruciais para a operação e emissão de documentos. Sem um ano de exercício criado e aberto associado à sua empresa e módulos, não será possível emitir faturas, recibos ou lançamentos contabilísticos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulário de Criação de Exercício */}
        <div className="lg:col-span-5 bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-card)] space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Criar Ano de Exercício</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Selecionar Empresa */}
            <div className="space-y-1.5">
              <Label htmlFor="empresa-exercicio" className="text-xs font-semibold">
                Selecionar a Empresa <span className="text-destructive">*</span>
              </Label>
              <SearchSelect
                id="empresa-exercicio"
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
                Selecione para qual entidade jurídica o ano fiscal será aberto.
              </p>
            </div>

            {/* Ano de Exercício */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="ano-exercicio" className="text-xs font-semibold">
                  Ano <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ano-exercicio"
                  type="text"
                  maxLength={4}
                  placeholder="Ex: 2026"
                  value={ano}
                  onChange={(e) => handleAnoChange(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="data-inicio-ex" className="text-xs font-semibold">
                  Data Início <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="data-inicio-ex"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="data-fim-ex" className="text-xs font-semibold">
                  Data Fim <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="data-fim-ex"
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Seleção dos Módulos */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Selecionar os Módulos do Exercício <span className="text-destructive">*</span>
                </Label>
                <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {selectedModulos.length} ativos
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Módulos autorizados para a empresa que terão permissão para operar no ano {ano}.
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
              type="submit"
              disabled={isSubmitting || empresas.length === 0}
              className="w-full text-xs font-semibold flex items-center justify-center gap-2 mt-4"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  A registar...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Criar Ano de Exercício
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Tabela de Listagem de Exercícios */}
        <div className="lg:col-span-7 bg-card border border-border rounded-xl p-6 shadow-[var(--shadow-card)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Exercícios Fiscais Registados</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Total: {exercicios.length} exercícios
              {grupos.length > 1 && ` em ${grupos.length} anos`}
            </span>
          </div>

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">A carregar exercícios fiscais...</span>
            </div>
          ) : exercicios.length === 0 ? (
            <div className="py-16 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10">
              <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-semibold text-foreground">
                Nenhum exercício fiscal registado
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Crie um exercício fiscal no formulário ao lado para liberar a emissão de faturas e movimentos nos módulos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {grupos.map(({ ano, itens }) => (
                <AnoGroupSection
                  key={ano}
                  ano={ano}
                  total={itens.length}
                  unidade={{ singular: "exercício", plural: "exercícios" }}
                  aberto={estaAberto(ano)}
                  emCurso={ano === anoAtual}
                  onToggle={() => alternar(ano)}
                >
                  <ExercicioTable items={itens} onDelete={handleDelete} />
                </AnoGroupSection>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExercicioTable({
  items,
  onDelete,
}: {
  items: ExercicioFiscalDto[];
  onDelete: (id: string, ano: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead className="bg-muted/40 uppercase font-semibold text-muted-foreground border-y border-border">
          <tr>
            <th className="px-3 py-2.5">Empresa</th>
            <th className="px-3 py-2.5">Período</th>
            <th className="px-3 py-2.5">Módulos</th>
            <th className="px-3 py-2.5">Estado</th>
            <th className="px-3 py-2.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((ex) => {
            let mods: string[] = [];
            try {
              mods = JSON.parse(ex.modulosJson);
            } catch {
              // ignore
            }

            const dtIni = new Date(ex.dataInicio).toLocaleDateString("pt-PT");
            const dtFim = new Date(ex.dataFim).toLocaleDateString("pt-PT");

            return (
              <tr key={ex.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-3">
                  <div className="font-semibold text-foreground">
                    {ex.empresa?.nome || "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    NIF: {ex.empresa?.nif}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-[11px]">
                  {dtIni} → {dtFim}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                    {mods.slice(0, 3).map((m) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-muted font-medium capitalize text-muted-foreground"
                      >
                        {m}
                      </span>
                    ))}
                    {mods.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
                        +{mods.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <EstadoBadge estado={ex.estado} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(ex.id, ex.ano)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Eliminar exercício"
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

function EstadoBadge({ estado }: { estado: string }) {
  const rotulo = estado.charAt(0).toUpperCase() + estado.slice(1);
  if (estado === "aberto") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        {rotulo}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
      {rotulo}
    </span>
  );
}
