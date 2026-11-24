import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/erp/FormDialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Plus,
  Pencil,
  Ban,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { rhApi } from "@/api/rh.api";
import type {
  RhAlteracaoMensalDto,
  RhAlteracoesMensaisListarInput,
  RhAlteracoesMensaisPaginaDto,
  RhEstadoAlteracaoDto,
  RhRubricaDto,
  RhFuncionarioListaDto,
} from "@/@types/electron";

const TAKE = 20;

const ESTADOS_ALTERACAO: RhEstadoAlteracaoDto[] = ["PENDENTE", "APLICADA", "ANULADA"];

const ROTULO_ESTADO: Record<RhEstadoAlteracaoDto, string> = {
  PENDENTE: "Pendente",
  APLICADA: "Aplicada",
  ANULADA: "Anulada",
};

const COR_ESTADO: Record<RhEstadoAlteracaoDto, string> = {
  PENDENTE: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  APLICADA: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  ANULADA: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

interface Formulario {
  funcionarioId: string;
  ano: number;
  mes: number;
  rubricaId: string;
  quantidade: string;
  valor: string;
  moeda: string;
  extraordinaria: boolean;
  observacao: string;
}

const FORM_VAZIO: Formulario = {
  funcionarioId: "",
  ano: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
  rubricaId: "",
  quantidade: "",
  valor: "",
  moeda: "AOA",
  extraordinaria: false,
  observacao: "",
};

interface CopiarForm {
  funcionarioId: string;
  anoOrigem: number;
  mesOrigem: number;
  anoDestino: number;
  mesDestino: number;
}

const COPIAR_VAZIO: CopiarForm = {
  funcionarioId: "",
  anoOrigem: new Date().getFullYear() - 1,
  mesOrigem: 1,
  anoDestino: new Date().getFullYear(),
  mesDestino: 1,
};

export function RhAlteracoesMensaisManager() {
  const [skip, setSkip] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<RhAlteracoesMensaisPaginaDto>({ total: 0, items: [] });

  const [filtros, setFiltros] = useState<RhAlteracoesMensaisListarInput>({
    funcionarioId: "",
    ano: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    estado: undefined,
    skip: 0,
    take: TAKE,
  });

  const [funcionarios, setFuncionarios] = useState<RhFuncionarioListaDto[]>([]);
  const [rubricas, setRubricas] = useState<RhRubricaDto[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isCopiarDialogOpen, setIsCopiarDialogOpen] = useState(false);
  const [copiarForm, setCopiarForm] = useState<CopiarForm>(COPIAR_VAZIO);
  const [isCopiando, setIsCopiando] = useState(false);

  const carregarFuncionarios = useCallback(async () => {
    const resp = await rhApi.funcionarios.listar({ take: 500, estado: "ATIVO" });
    if (resp.success) {
      setFuncionarios(resp.data.items);
    }
  }, []);

  const carregarRubricas = useCallback(async () => {
    const resp = await rhApi.config.rubricas.listar({ take: 500, ativo: true });
    if (resp.success) {
      setRubricas(resp.data.items.filter((r) => r.tipo === "REMUNERACAO" || r.tipo === "DESCONTO"));
    }
  }, []);

  const carregarDados = useCallback(async () => {
    if (!filtros.funcionarioId) {
      setData({ total: 0, items: [] });
      return;
    }
    setIsLoading(true);
    try {
      const resp = await rhApi.alteracoesMensais.listar(filtros);
      if (resp.success) {
        setData(resp.data);
      } else {
        toast.error(resp.error?.message || "Erro ao carregar alterações");
        setData({ total: 0, items: [] });
      }
    } catch {
      toast.error("Erro inesperado ao carregar alterações");
      setData({ total: 0, items: [] });
    } finally {
      setIsLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregarFuncionarios();
    carregarRubricas();
  }, [carregarFuncionarios, carregarRubricas]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleFiltroChange = (campo: keyof RhAlteracoesMensaisListarInput, valor: unknown) => {
    setFiltros((prev) => ({ ...prev, [campo]: valor, skip: 0 }));
    setSkip(0);
  };

  const handlePageChange = (novaPagina: number) => {
    const novoSkip = (novaPagina - 1) * TAKE;
    setSkip(novoSkip);
    setFiltros((prev) => ({ ...prev, skip: novoSkip }));
  };

  const totalPaginas = Math.ceil(data.total / TAKE) || 1;

  const abrirDialogCriar = () => {
    setForm(FORM_VAZIO);
    setIsEditing(false);
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const abrirDialogEditar = (item: RhAlteracaoMensalDto) => {
    setForm({
      funcionarioId: item.funcionarioId,
      ano: item.ano,
      mes: item.mes,
      rubricaId: item.rubricaId,
      quantidade: item.quantidade?.toString() ?? "",
      valor: item.valor.toString(),
      moeda: item.moeda,
      extraordinaria: item.extraordinaria,
      observacao: item.observacao ?? "",
    });
    setIsEditing(true);
    setEditingId(item.id);
    setIsDialogOpen(true);
  };

  const fecharDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setIsEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.funcionarioId || !form.rubricaId || !form.valor) {
      toast.error("Preencha funcionário, rubrica e valor");
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing && editingId) {
        const resp = await rhApi.alteracoesMensais.atualizar({
          id: editingId,
          valor: Number(form.valor),
          quantidade: form.quantidade ? Number(form.quantidade) : null,
          moeda: form.moeda,
          extraordinaria: form.extraordinaria,
          observacao: form.observacao || null,
        });
        if (resp.success) {
          toast.success("Alteração atualizada");
          fecharDialog();
          carregarDados();
        } else {
          toast.error(resp.error?.message || "Erro ao atualizar");
        }
      } else {
        const resp = await rhApi.alteracoesMensais.criar({
          funcionarioId: form.funcionarioId,
          ano: form.ano,
          mes: form.mes,
          rubricaId: form.rubricaId,
          valor: Number(form.valor),
          quantidade: form.quantidade ? Number(form.quantidade) : null,
          moeda: form.moeda,
          extraordinaria: form.extraordinaria,
          observacao: form.observacao || null,
        });
        if (resp.success) {
          toast.success("Alteração criada");
          fecharDialog();
          carregarDados();
        } else {
          toast.error(resp.error?.message || "Erro ao criar");
        }
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnular = async (item: RhAlteracaoMensalDto) => {
    const motivo = prompt("Motivo da anulação (opcional):");
    if (motivo === null) return;
    try {
      const resp = await rhApi.alteracoesMensais.anular(item.id, motivo || undefined);
      if (resp.success) {
        toast.success("Alteração anulada");
        carregarDados();
      } else {
        toast.error(resp.error?.message || "Erro ao anular");
      }
    } catch {
      toast.error("Erro inesperado");
    }
  };

  const abrirDialogCopiar = () => {
    setCopiarForm({
      ...COPIAR_VAZIO,
      anoDestino: filtros.ano,
      mesDestino: filtros.mes,
    });
    setIsCopiarDialogOpen(true);
  };

  const fecharDialogCopiar = () => {
    setIsCopiarDialogOpen(false);
  };

  const handleCopiar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copiarForm.funcionarioId) {
      toast.error("Selecione o funcionário");
      return;
    }
    setIsCopiando(true);
    try {
      const resp = await rhApi.alteracoesMensais.copiarMesAnterior(copiarForm);
      if (resp.success) {
        toast.success(`${resp.data.criadas} alterações copiadas, ${resp.data.ignoradas} ignoradas (já existiam)`);
        fecharDialogCopiar();
        carregarDados();
      } else {
        toast.error(resp.error?.message || "Erro ao copiar");
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setIsCopiando(false);
    }
  };

  const getRubricaLabel = (rubricaId: string) => {
    const r = rubricas.find((rb) => rb.id === rubricaId);
    return r ? `${r.codigo} - ${r.descricao}` : rubricaId;
  };

  const getFuncionarioLabel = (funcionarioId: string) => {
    const f = funcionarios.find((fn) => fn.id === funcionarioId);
    return f ? `${f.codigo} - ${f.nome}` : funcionarioId;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Alterações Mensais</h1>
          <p className="text-sm text-muted-foreground">
            Prémios, comissões, descontos pontuais por funcionário/mês
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={abrirDialogCopiar} disabled={!filtros.funcionarioId}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar do Mês Anterior
          </Button>
          <Button onClick={abrirDialogCriar}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Alteração
          </Button>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="funcionario" className="block mb-1">
              Funcionário
            </Label>
<SearchSelect
                  id="funcionario"
                  placeholder="Selecione o funcionário..."
                  options={funcionarios.map((f) => ({
                    value: f.id,
                    label: `${f.codigo} - ${f.nome}`,
                  }))}
                  value={filtros.funcionarioId}
                  onChange={(v) => handleFiltroChange("funcionarioId", v || "")}
                  allowClear
                />
          </div>
          <div>
            <Label htmlFor="ano" className="block mb-1">
              Ano
            </Label>
            <Select value={filtros.ano.toString()} onValueChange={(v) => handleFiltroChange("ano", Number(v))}>
              <SelectTrigger id="ano">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((a) => (
                  <SelectItem key={a} value={a.toString()}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="mes" className="block mb-1">
              Mês
            </Label>
            <Select value={filtros.mes.toString()} onValueChange={(v) => handleFiltroChange("mes", Number(v))}>
              <SelectTrigger id="mes">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m) => (
                  <SelectItem key={m.value} value={m.value.toString()}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="estado" className="block mb-1">
              Estado
            </Label>
            <Select value={filtros.estado || ""} onValueChange={(v) => handleFiltroChange("estado", v || undefined)}>
              <SelectTrigger id="estado">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {ESTADOS_ALTERACAO.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ROTULO_ESTADO[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && data.items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>Nenhuma alteração mensal encontrada</p>
          </div>
        )}

        {!isLoading && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Rubrica</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead className="text-center">Extraord.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="text-right w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{getFuncionarioLabel(item.funcionarioId)}</TableCell>
                    <TableCell>{getRubricaLabel(item.rubricaId)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {item.quantidade ? item.quantidade.toLocaleString("pt-AO", { minimumFractionDigits: 2 }) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.valor.toLocaleString("pt-AO", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{item.moeda}</TableCell>
                    <TableCell className="text-center">
                      {item.extraordinaria ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Sim
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${COR_ESTADO[item.estado]}`}>
                        {ROTULO_ESTADO[item.estado]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.observacao || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.estado === "PENDENTE" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirDialogEditar(item)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAnular(item)}
                              title="Anular"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && data.items.length > 0 && totalPaginas > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Página {Math.floor(skip / TAKE) + 1} de {totalPaginas} — {data.total} registos
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.floor(skip / TAKE))}
                disabled={skip === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.floor(skip / TAKE) + 2)}
                disabled={skip + TAKE >= data.total}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <FormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={isEditing ? "Editar Alteração Mensal" : "Nova Alteração Mensal"}
        description={isEditing
          ? "Atualize os dados da alteração mensal"
          : "Crie uma nova alteração mensal (prémio, comissão, desconto pontual)"}
      >
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="md:col-span-2">
                <Label htmlFor="funcionario-dialog" className="block mb-1">
                  Funcionário *
                </Label>
                <SearchSelect
                  id="funcionario-dialog"
                  placeholder="Selecione o funcionário..."
                  options={funcionarios.map((f) => ({
                    value: f.id,
                    label: `${f.codigo} - ${f.nome}`,
                  }))}
                  value={form.funcionarioId}
                  onChange={(v) => setForm((prev) => ({ ...prev, funcionarioId: v || "" }))}
                  allowClear
                  disabled={isEditing}
                />
              </div>

              <div>
                <Label htmlFor="ano-dialog" className="block mb-1">Ano *</Label>
                <Select value={form.ano.toString()} onValueChange={(v) => setForm((prev) => ({ ...prev, ano: Number(v) }))} disabled={isEditing}>
                  <SelectTrigger id="ano-dialog">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((a) => (
                      <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="mes-dialog" className="block mb-1">Mês *</Label>
                <Select value={form.mes.toString()} onValueChange={(v) => setForm((prev) => ({ ...prev, mes: Number(v) }))} disabled={isEditing}>
                  <SelectTrigger id="mes-dialog">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="rubrica-dialog" className="block mb-1">Rubrica *</Label>
                <SearchSelect
                  id="rubrica-dialog"
                  placeholder="Selecione a rubrica..."
                  options={rubricas.map((r) => ({
                    value: r.id,
                    label: `${r.codigo} - ${r.descricao} (${r.tipo})`,
                  }))}
                  value={form.rubricaId}
                  onChange={(v) => setForm((prev) => ({ ...prev, rubricaId: v || "" }))}
                  allowClear
                  disabled={isEditing}
                />
              </div>

              <div>
                <Label htmlFor="quantidade-dialog" className="block mb-1">Quantidade</Label>
                <Input
                  id="quantidade-dialog"
                  type="number"
                  step="0.01"
                  value={form.quantidade}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantidade: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <Label htmlFor="valor-dialog" className="block mb-1">Valor *</Label>
                <Input
                  id="valor-dialog"
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <Label htmlFor="moeda-dialog" className="block mb-1">Moeda</Label>
                <Input
                  id="moeda-dialog"
                  value={form.moeda}
                  onChange={(e) => setForm((prev) => ({ ...prev, moeda: e.target.value }))}
                  maxLength={10}
                />
              </div>

              <div className="flex items-end">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.extraordinaria}
                    onChange={(e) => setForm((prev) => ({ ...prev, extraordinaria: e.target.checked }))}
                  />
                  <span>Extraordinária (tributação isolada)</span>
                </Label>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="observacao-dialog" className="block mb-1">Observação</Label>
                <Input
                  id="observacao-dialog"
                  value={form.observacao}
                  onChange={(e) => setForm((prev) => ({ ...prev, observacao: e.target.value }))}
                  placeholder="Observação opcional"
                  maxLength={240}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-6 py-3">
            <Button type="button" variant="outline" onClick={fecharDialog}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </FormDialog>

      <Dialog open={isCopiarDialogOpen} onOpenChange={setIsCopiarDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar do Mês Anterior</DialogTitle>
            <DialogDescription>
              Copia alterações PENDENTES do mês de origem para o mês de destino.
              Alterações já existentes no destino são ignoradas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCopiar}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="md:col-span-2">
                <Label htmlFor="copiar-funcionario" className="block mb-1">Funcionário *</Label>
                <SearchSelect
                  id="copiar-funcionario"
                  placeholder="Selecione o funcionário..."
                  options={funcionarios.map((f) => ({
                    value: f.id,
                    label: `${f.codigo} - ${f.nome}`,
                  }))}
                  value={copiarForm.funcionarioId}
                  onChange={(v) => setCopiarForm((prev) => ({ ...prev, funcionarioId: v || "" }))}
                  allowClear
                />
              </div>

              <div>
                <Label htmlFor="ano-origem" className="block mb-1">Ano Origem</Label>
                <Select value={copiarForm.anoOrigem.toString()} onValueChange={(v) => setCopiarForm((prev) => ({ ...prev, anoOrigem: Number(v) }))}>
                  <SelectTrigger id="ano-origem">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((a) => (
                      <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="mes-origem" className="block mb-1">Mês Origem</Label>
                <Select value={copiarForm.mesOrigem.toString()} onValueChange={(v) => setCopiarForm((prev) => ({ ...prev, mesOrigem: Number(v) }))}>
                  <SelectTrigger id="mes-origem">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ano-destino" className="block mb-1">Ano Destino</Label>
                <Select value={copiarForm.anoDestino.toString()} onValueChange={(v) => setCopiarForm((prev) => ({ ...prev, anoDestino: Number(v) }))}>
                  <SelectTrigger id="ano-destino">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((a) => (
                      <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="mes-destino" className="block mb-1">Mês Destino</Label>
                <Select value={copiarForm.mesDestino.toString()} onValueChange={(v) => setCopiarForm((prev) => ({ ...prev, mesDestino: Number(v) }))}>
                  <SelectTrigger id="mes-destino">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={fecharDialogCopiar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCopiando}>
                {isCopiando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Copiar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}