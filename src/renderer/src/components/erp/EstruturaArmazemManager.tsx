/**
 * @file EstruturaArmazemManager.tsx
 * @description Estrutura do armazém (TASK-027 + TASK-028): a árvore
 * Armazém → Área → Zona → Localização, com criação em cada nível, edição e
 * desactivação de localizações, e consulta de capacidade e estado.
 *
 * Trabalha sobre os canais `localizacoes:*` (reparados na sessão anterior) e
 * só escreve onde o RBAC do main já exige `estoque: write`. A desactivação é
 * sempre lógica: há stock e movimentos a apontar para cá.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Warehouse,
  Plus,
  RefreshCw,
  Loader2,
  FolderTree,
  ChevronRight,
  ChevronDown,
  MapPin,
  Edit2,
  Gauge,
  Eye,
  Power,
  Boxes,
} from "lucide-react";
import type {
  AreaArmazemDto,
  ArmazemDto,
  ArvoreLocalizacaoDto,
  NoLocalizacaoDto,
  ZonaEstruturaDto,
} from "../../@types/electron";
import { armazemApi } from "../../api/armazem.api";
import { localizacaoApi } from "../../api/localizacao.api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { SearchSelect } from "../ui/SearchSelect";
import {
  FormShell,
  FormSection,
  TextField,
  TextAreaField,
  NumberField,
  CheckboxField,
  SelectField,
} from "./FormPrimitives";
import { StatusBadge } from "./Primitives";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Schemas dos formulários (os valores de capacidade ficam em texto e  */
/* convertem-se para número/null no submit; "" significa "sem limite") */
/* ------------------------------------------------------------------ */

const numeroNaovazio = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+(\.\d+)?$/.test(v), "Tem de ser um número maior ou igual a zero.");

const areaSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório.").max(20, "Máximo 20 caracteres."),
  designacao: z.string().trim().min(1, "Designação é obrigatória.").max(100),
  tipo: z.string().trim().max(50).optional(),
  descricao: z.string().trim().max(500).optional(),
});
type AreaFormValues = z.infer<typeof areaSchema>;

const zonaSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório.").max(20),
  designacao: z.string().trim().min(1, "Designação é obrigatória.").max(100),
  descricao: z.string().trim().max(500).optional(),
  altaRotacao: z.boolean(),
  temperaturaControlada: z.boolean(),
});
type ZonaFormValues = z.infer<typeof zonaSchema>;

const editarAreaSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório.").max(20, "Máximo 20 caracteres."),
  designacao: z.string().trim().min(1, "Designação é obrigatória.").max(100),
  tipo: z.string().trim().max(50).optional(),
  descricao: z.string().trim().max(500).optional(),
  ativo: z.boolean(),
});
type EditarAreaFormValues = z.infer<typeof editarAreaSchema>;

const editarZonaSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório.").max(20),
  designacao: z.string().trim().min(1, "Designação é obrigatória.").max(100),
  descricao: z.string().trim().max(500).optional(),
  altaRotacao: z.boolean(),
  temperaturaControlada: z.boolean(),
  ativo: z.boolean(),
});
type EditarZonaFormValues = z.infer<typeof editarZonaSchema>;

const criarLocalizacaoSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório.").max(30),
  designacao: z.string().trim().max(100).optional(),
  tipo: z.string().optional(),
  capacidadeQuantidade: numeroNaovazio,
  capacidadePeso: numeroNaovazio,
  capacidadeVolume: numeroNaovazio,
  isPickable: z.boolean(),
  isPutaway: z.boolean(),
});
type CriarLocalizacaoFormValues = z.infer<typeof criarLocalizacaoSchema>;

const editarLocalizacaoSchema = z.object({
  designacao: z.string().trim().max(100).optional(),
  capacidadeQuantidade: numeroNaovazio,
  capacidadePeso: numeroNaovazio,
  capacidadeVolume: numeroNaovazio,
  permitirMixProdutos: z.boolean(),
  permitirMixLotes: z.boolean(),
  isPickable: z.boolean(),
  isPutaway: z.boolean(),
  ativo: z.boolean(),
  bloqueada: z.boolean(),
});
type EditarLocalizacaoFormValues = z.infer<typeof editarLocalizacaoSchema>;

/* ------------------------------------------------------------------ */

const TIPO_LOCALIZACAO = [
  { value: "estrutura", label: "Estrutura" },
  { value: "prateleira", label: "Prateleira" },
  { value: "nivel", label: "Nível" },
  { value: "posicao", label: "Posição" },
  { value: "palete", label: "Palete" },
  { value: "contentor", label: "Contentor" },
];

function numeroOuNull(texto?: string): number | null {
  return texto === undefined || texto === "" ? null : Number(texto);
}

function formatarNumero(valor: number | null): string {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("pt-PT", { maximumFractionDigits: 3 });
}

type DialogoEstado =
  | { tipo: "criar-area" }
  | { tipo: "editar-area"; area: AreaArmazemDto }
  | { tipo: "criar-zona"; area: AreaArmazemDto }
  | { tipo: "editar-zona"; zona: ZonaEstruturaDto }
  | {
      tipo: "criar-localizacao";
      zona: ZonaEstruturaDto;
      pai?: NoLocalizacaoDto | null;
    }
  | { tipo: "editar-localizacao"; no: NoLocalizacaoDto }
  | { tipo: "estado"; no: NoLocalizacaoDto }
  | { tipo: "capacidade"; no: NoLocalizacaoDto };

export function EstruturaArmazemManager() {
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);
  const [armazemId, setArmazemId] = useState("");
  const [arvore, setArvore] = useState<ArvoreLocalizacaoDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<DialogoEstado | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await armazemApi.list({ take: 200 });
        if (res.success) setArmazens(res.data.items);
        else toast.error("Erro ao carregar armazéns: " + res.error.message);
      } catch {
        toast.error("Falha ao carregar as opções de armazém.");
      }
    })();
  }, []);

  const carregarArvore = useCallback(async (id: string, expandirCom: string[] = []) => {
    if (!id) return;
    try {
      setIsLoading(true);
      const res = await localizacaoApi.tree(id);
      if (res.success) {
        setArvore(res.data);
        // Áreas começam expandidas; criação dentro de um nível expande-o.
        const base = res.data.map((a) => a.area.id);
        setExpandidas(new Set([...base, ...expandirCom]));
      } else {
        toast.error("Erro ao carregar a estrutura: " + res.error.message);
      }
    } catch {
      toast.error("Falha ao comunicar com o processo principal.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const aoTrocarArmazem = (valor: string) => {
    setArmazemId(valor);
    if (!valor) setArvore([]);
    else void carregarArvore(valor);
  };

  const toggleExpandida = (id: string) => {
    setExpandidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const mmArmazem = useMemo(
    () => armazens.find((a) => a.id === armazemId),
    [armazens, armazemId]
  );

  const aoSubmeter = async (valores: { [k: string]: unknown }, ctx: DialogoEstado) => {
    try {
      if (ctx.tipo === "criar-area") {
        const v = valores as unknown as AreaFormValues;
        const res = await localizacaoApi.criarArea({
          armazemId,
          codigo: v.codigo,
          designacao: v.designacao,
          tipo: v.tipo || undefined,
          descricao: v.descricao || undefined,
          ativo: true,
        });
        if (res.success) {
          toast.success(`Área "${res.data.codigo}" criada.`);
          setDialogo(null);
          await carregarArvore(armazemId, [res.data.id]);
        } else {
          toast.error(res.error.message);
        }
        return;
      }

      if (ctx.tipo === "criar-zona") {
        const v = valores as unknown as ZonaFormValues;
        const res = await localizacaoApi.criarZona({
          areaId: ctx.area.id,
          codigo: v.codigo,
          designacao: v.designacao,
          descricao: v.descricao || undefined,
          altaRotacao: v.altaRotacao,
          temperaturaControlada: v.temperaturaControlada,
          ativo: true,
        });
        if (res.success) {
          toast.success(`Zona "${res.data.codigo}" criada.`);
          setDialogo(null);
          await carregarArvore(armazemId, [ctx.area.id]);
        } else {
          toast.error(res.error.message);
        }
        return;
      }

      if (ctx.tipo === "editar-area") {
        const v = valores as unknown as EditarAreaFormValues;
        const res = await localizacaoApi.actualizarArea(ctx.area.id, {
          codigo: v.codigo,
          designacao: v.designacao,
          tipo: v.tipo || null,
          descricao: v.descricao || null,
          ativo: v.ativo,
        });
        if (res.success) {
          toast.success(`Área "${res.data.codigo}" atualizada.`);
          setDialogo(null);
          await carregarArvore(armazemId, [ctx.area.id]);
        } else {
          toast.error(res.error.message);
        }
        return;
      }

      if (ctx.tipo === "editar-zona") {
        const v = valores as unknown as EditarZonaFormValues;
        const res = await localizacaoApi.actualizarZona(ctx.zona.id, {
          codigo: v.codigo,
          designacao: v.designacao,
          descricao: v.descricao || null,
          altaRotacao: v.altaRotacao,
          temperaturaControlada: v.temperaturaControlada,
          ativo: v.ativo,
        });
        if (res.success) {
          toast.success(`Zona "${res.data.codigo}" atualizada.`);
          setDialogo(null);
          await carregarArvore(armazemId, [ctx.zona.areaId]);
        } else {
          toast.error(res.error.message);
        }
        return;
      }

      if (ctx.tipo === "criar-localizacao") {
        const v = valores as unknown as CriarLocalizacaoFormValues;
        const res = await localizacaoApi.create({
          zonaId: ctx.zona.id,
          parentId: ctx.pai ? ctx.pai.id : null,
          codigo: v.codigo,
          designacao: v.designacao || null,
          tipo: v.tipo || undefined,
          capacidadeQuantidade: numeroOuNull(v.capacidadeQuantidade),
          capacidadePeso: numeroOuNull(v.capacidadePeso),
          capacidadeVolume: numeroOuNull(v.capacidadeVolume),
          isPickable: v.isPickable,
          isPutaway: v.isPutaway,
        });
        if (res.success) {
          toast.success(`Localização "${res.data.codigo}" criada.`);
          setDialogo(null);
          const expandir = [ctx.zona.id];
          if (ctx.pai) expandir.push(ctx.pai.id);
          await carregarArvore(armazemId, expandir);
        } else {
          toast.error(res.error.message);
        }
        return;
      }

      if (ctx.tipo === "editar-localizacao") {
        const v = valores as unknown as EditarLocalizacaoFormValues;
        const res = await localizacaoApi.update(ctx.no.id, {
          designacao: v.designacao || null,
          capacidadeQuantidade: numeroOuNull(v.capacidadeQuantidade),
          capacidadePeso: numeroOuNull(v.capacidadePeso),
          capacidadeVolume: numeroOuNull(v.capacidadeVolume),
          permitirMixProdutos: v.permitirMixProdutos,
          permitirMixLotes: v.permitirMixLotes,
          isPickable: v.isPickable,
          isPutaway: v.isPutaway,
          ativo: v.ativo,
          bloqueada: v.bloqueada,
        });
        if (res.success) {
          toast.success("Localização atualizada.");
          setDialogo(null);
          await carregarArvore(armazemId);
        } else {
          toast.error(res.error.message);
        }
        return;
      }
    } catch {
      toast.error("Falha ao gravar os dados.");
    }
  };

  const desactivar = async (no: NoLocalizacaoDto) => {
    const confirmar = window.confirm(
      `Desactivar a localização "${no.codigo}"? Deixa de poder receber stock.`
    );
    if (!confirmar) return;
    try {
      const res = await localizacaoApi.delete(no.id);
      if (res.success) {
        toast.success(`Localização "${no.codigo}" desactivada.`);
        await carregarArvore(armazemId);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao desactivar a localização.");
    }
  };

  const desactivarArea = async (area: AreaArmazemDto) => {
    const confirmar = window.confirm(
      `Desactivar a área "${area.codigo}"? Só é possível se não tiver zonas ativas.`
    );
    if (!confirmar) return;
    try {
      const res = await localizacaoApi.desactivarArea(area.id);
      if (res.success) {
        toast.success(`Área "${area.codigo}" desactivada.`);
        await carregarArvore(armazemId);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao desactivar a área.");
    }
  };

  const desactivarZona = async (zona: ZonaEstruturaDto) => {
    const confirmar = window.confirm(
      `Desactivar a zona "${zona.codigo}"? Só é possível se não tiver localizações ativas.`
    );
    if (!confirmar) return;
    try {
      const res = await localizacaoApi.desactivarZona(zona.id);
      if (res.success) {
        toast.success(`Zona "${zona.codigo}" desactivada.`);
        await carregarArvore(armazemId, [zona.areaId]);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Falha ao desactivar a zona.");
    }
  };

  const acoesLocalizacao = (no: NoLocalizacaoDto, zona: ZonaEstruturaDto) => (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        title="Nova sub-localização"
        onClick={() => setDialogo({ tipo: "criar-localizacao", zona, pai: no })}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="Editar"
        onClick={() => setDialogo({ tipo: "editar-localizacao", no })}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <Edit2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="Ver capacidade"
        onClick={() => setDialogo({ tipo: "capacidade", no })}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <Gauge className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="Ver estado operacional"
        onClick={() => setDialogo({ tipo: "estado", no })}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <Eye className="w-4 h-4" />
      </button>
      <button
        type="button"
        title={no.ativo ? "Desactivar" : "Já inativa"}
        disabled={!no.ativo}
        onClick={() => void desactivar(no)}
        className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Power className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Barra: armazém + ações */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="w-full sm:w-72">
          <SearchSelect
            value={armazemId}
            onChange={aoTrocarArmazem}
            placeholder="Escolha o armazém..."
            options={armazens.map((a) => ({ value: a.id, label: `${a.codigo} — ${a.designacao}` }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void carregarArvore(armazemId)}
            disabled={isLoading}
            className="h-9 px-3 border border-border rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 text-sm transition-colors"
            title="Atualizar estrutura"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            type="button"
            disabled={!armazemId}
            onClick={() => setDialogo({ tipo: "criar-area" })}
            className="h-9 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 flex items-center gap-1.5 text-sm shadow-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Área</span>
          </button>
        </div>
      </div>

      {/* Árvore */}
      <div
        data-testid="estrutura-arvore"
        className="border border-border rounded-lg bg-card overflow-hidden shadow-sm"
      >
        {!armazemId ? (
          <div className="py-12 text-center text-muted-foreground">
            <FolderTree className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-foreground">Escolha um armazém</p>
            <p className="text-xs mt-1">para ver e editar a respetiva estrutura física.</p>
          </div>
        ) : isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
            <span>A carregar a estrutura...</span>
          </div>
        ) : arvore.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-foreground">
              {mmArmazem ? `${mmArmazem.codigo} ainda não tem estrutura` : "Sem estrutura"}
            </p>
            <p className="text-xs mt-1" data-testid="estrutura-vazio">
              Comece por criar a primeira área com o botão “Nova Área”.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 text-sm">
            {arvore.map((a) => (
              <div key={a.area.id}>
                {/* Área */}
                <LinhaNivel
                  indentado={0}
                  expandida={expandidas.has(a.area.id)}
                  aoAlternar={() => toggleExpandida(a.area.id)}
                  icone={<Boxes className="w-4 h-4 text-primary" />}
                  titulo={
                    <span>
                      <span className="font-mono font-semibold text-foreground">{a.area.codigo}</span>{" "}
                      <span className="text-muted-foreground">{a.area.designacao}</span>
                    </span>
                  }
                  etiquetas={
                    <>
                      {a.area.tipo && <StatusBadge tone="info">{a.area.tipo}</StatusBadge>}
                      <StatusBadge tone={a.area.ativo ? "success" : "danger"}>
                        {a.area.ativo ? "Ativa" : "Inativa"}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {a.zonas.length} {a.zonas.length === 1 ? "zona" : "zonas"}
                      </span>
                    </>
                  }
                  acao={
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        title="Editar área"
                        onClick={() => setDialogo({ tipo: "editar-area", area: a.area })}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Nova zona nesta área"
                        onClick={() => setDialogo({ tipo: "criar-zona", area: a.area })}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title={a.area.ativo ? "Desactivar área" : "Área já inativa"}
                        disabled={!a.area.ativo}
                        onClick={() => void desactivarArea(a.area)}
                        className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  }
                />
                {expandidas.has(a.area.id) &&
                  a.zonas.map((z) => (
                    <div key={z.id}>
                      {/* Zona */}
                      <LinhaNivel
                        indentado={1}
                        expandida={expandidas.has(z.id)}
                        aoAlternar={() => toggleExpandida(z.id)}
                        icone={<FolderTree className="w-4 h-4 text-primary/70" />}
                        titulo={
                          <span>
                            <span className="font-mono font-semibold text-foreground">{z.codigo}</span>{" "}
                            <span className="text-muted-foreground">{z.designacao}</span>
                          </span>
                        }
                        etiquetas={
                          <>
                            {!z.ativo && <StatusBadge tone="danger">Inativa</StatusBadge>}
                            {z.altaRotacao && <StatusBadge tone="warning">Alta rotação</StatusBadge>}
                            {z.temperaturaControlada && (
                              <StatusBadge tone="info">Temperatura controlada</StatusBadge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {z.localizacoes.length} {z.localizacoes.length === 1 ? "posição" : "posições"}
                            </span>
                          </>
                        }
                        acao={
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              title="Editar zona"
                              onClick={() => setDialogo({ tipo: "editar-zona", zona: z })}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Nova localização nesta zona"
                              onClick={() => setDialogo({ tipo: "criar-localizacao", zona: z, pai: null })}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title={z.ativo ? "Desactivar zona" : "Zona já inativa"}
                              disabled={!z.ativo}
                              onClick={() => void desactivarZona(z)}
                              className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          </div>
                        }
                      />
                      {expandidas.has(z.id) &&
                        z.localizacoes.map((no) => (
                          <No key={no.id} no={no} zona={z} profundidade={2} acoes={acoesLocalizacao} />
                        ))}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Warehouse className="w-3.5 h-3.5 opacity-70" />
        Desactivar é sempre lógico — uma localização com stock não se apaga.
      </div>

      {/* Diálogo criar área */}
      <Dialog open={dialogo?.tipo === "criar-area"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-lg p-0 max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" />
              <DialogTitle>Nova Área</DialogTitle>
            </div>
            <DialogDescription>
              {mmArmazem
                ? `Primeiro degrau da estrutura no armazém ${mmArmazem.codigo}.`
                : "Área dentro do armazém escolhido."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <FormArea
              aoSubmeter={(v) => void aoSubmeter({ ...v }, dialogo as DialogoEstado)}
              onCancelar={() => setDialogo(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo criar zona */}
      <Dialog open={dialogo?.tipo === "criar-zona"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-primary" />
              <DialogTitle>Nova Zona</DialogTitle>
            </div>
            <DialogDescription>
              {dialogo?.tipo === "criar-zona"
                ? `Segundo degrau da estrutura dentro da área ${dialogo.area.codigo}.`
                : "Zona dentro da área escolhida."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <FormZona
              aoSubmeter={(v) => void aoSubmeter({ ...v }, dialogo as DialogoEstado)}
              onCancelar={() => setDialogo(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo editar área */}
      <Dialog open={dialogo?.tipo === "editar-area"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              <DialogTitle>Editar Área</DialogTitle>
            </div>
            <DialogDescription>
              {dialogo?.tipo === "editar-area"
                ? `Área ${dialogo.area.codigo} — o armazém não muda.`
                : "Dados da área."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            {dialogo?.tipo === "editar-area" && (
              <FormEditarArea
                area={dialogo.area}
                aoSubmeter={(v) => void aoSubmeter({ ...v }, dialogo)}
                onCancelar={() => setDialogo(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo editar zona */}
      <Dialog open={dialogo?.tipo === "editar-zona"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              <DialogTitle>Editar Zona</DialogTitle>
            </div>
            <DialogDescription>
              {dialogo?.tipo === "editar-zona"
                ? `Zona ${dialogo.zona.codigo} — a área não muda.`
                : "Dados da zona."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            {dialogo?.tipo === "editar-zona" && (
              <FormEditarZona
                zona={dialogo.zona}
                aoSubmeter={(v) => void aoSubmeter({ ...v }, dialogo)}
                onCancelar={() => setDialogo(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo criar localização */}
      <Dialog
        open={dialogo?.tipo === "criar-localizacao"}
        onOpenChange={(o) => !o && setDialogo(null)}
      >
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <DialogTitle>Nova Localização</DialogTitle>
            </div>
            <DialogDescription>
              {dialogo?.tipo === "criar-localizacao"
                ? dialogo.pai
                  ? `Sub-localização de ${dialogo.pai.codigo}, zona ${dialogo.zona.codigo}.`
                  : `Endereço de raiz na zona ${dialogo.zona.codigo}.`
                : "Endereço físico endereçável."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <FormLocalizacao
              aoSubmeter={(v) => void aoSubmeter({ ...v }, dialogo as DialogoEstado)}
              onCancelar={() => setDialogo(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo editar localização */}
      <Dialog
        open={dialogo?.tipo === "editar-localizacao"}
        onOpenChange={(o) => !o && setDialogo(null)}
      >
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              <DialogTitle>
                {dialogo?.tipo === "editar-localizacao"
                  ? `Editar: ${dialogo.no.codigo}`
                  : "Editar localização"}
              </DialogTitle>
            </div>
            <DialogDescription>
              Zona e código são a identidade da posição — não se mudam depois de haver stock.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <FormEditarLocalizacao
              no={dialogo?.tipo === "editar-localizacao" ? dialogo.no : null}
              aoSubmeter={(v) => void aoSubmeter({ ...v }, dialogo as DialogoEstado)}
              onCancelar={() => setDialogo(null)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo capacidade */}
      <Dialog open={dialogo?.tipo === "capacidade"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              <DialogTitle>Capacidade da localização</DialogTitle>
            </div>
            <DialogDescription>
              Declarada vs. quantidade armazenada (não inclui reserva).
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            {dialogo?.tipo === "capacidade" && (
              <DialogoCapacidade no={dialogo.no} onFechar={() => setDialogo(null)} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo estado */}
      <Dialog open={dialogo?.tipo === "estado"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="p-6 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <DialogTitle>Estado operacional</DialogTitle>
            </div>
            <DialogDescription>Do ponto de vista do picking e do putaway.</DialogDescription>
          </DialogHeader>
          <div className="p-6">
            {dialogo?.tipo === "estado" && (
              <DialogoEstado no={dialogo.no} onFechar={() => setDialogo(null)} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Linhas da árvore                                                    */
/* ------------------------------------------------------------------ */

function LinhaNivel({
  indentado,
  expandida,
  aoAlternar,
  icone,
  titulo,
  etiquetas,
  acao,
}: {
  indentado: number;
  expandida: boolean;
  aoAlternar: () => void;
  icone: React.ReactNode;
  titulo: React.ReactNode;
  etiquetas?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 pr-3 py-2 hover:bg-muted/30 transition-colors"
      style={{ paddingLeft: `${indentado * 28 + 12}px` }}
    >
      <button
        type="button"
        onClick={aoAlternar}
        className="flex items-center gap-2 min-w-0 cursor-pointer text-left"
      >
        {expandida ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        {icone}
        <span className="truncate">{titulo}</span>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        {etiquetas}
        {acao}
      </div>
    </div>
  );
}

function No({
  no,
  zona,
  profundidade,
  acoes,
}: {
  no: NoLocalizacaoDto;
  zona: ZonaEstruturaDto;
  profundidade: number;
  acoes: (no: NoLocalizacaoDto, zona: ZonaEstruturaDto) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <div
        className="flex items-center justify-between gap-2 pr-3 py-2 hover:bg-muted/30 transition-colors"
        style={{ paddingLeft: `${profundidade * 28 + 12}px` }}
      >
        <button
          type="button"
          onClick={() => no.filhos.length > 0 && setAberto((a) => !a)}
          className={`flex items-center gap-2 min-w-0 text-left ${no.filhos.length === 0 ? "cursor-default" : "cursor-pointer"}`}
        >
          {no.filhos.length > 0 ? (
            aberto ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <MapPin
            className={`w-4 h-4 shrink-0 ${no.bloqueada ? "text-destructive" : no.ativo ? "text-primary/80" : "text-muted-foreground"}`}
          />
          <span className="font-mono text-xs font-semibold text-foreground truncate">{no.codigo}</span>
          {no.designacao && (
            <span className="text-xs text-muted-foreground truncate">{no.designacao}</span>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <EtiquetasLocalizacao no={no} />
          {acoes(no, zona)}
        </div>
      </div>
      {aberto && (
        <div>
          {no.filhos.map((filho) => (
            <No key={filho.id} no={filho} zona={zona} profundidade={profundidade + 1} acoes={acoes} />
          ))}
        </div>
      )}
    </div>
  );
}

function EtiquetasLocalizacao({ no }: { no: NoLocalizacaoDto }) {
  return (
    <>
      {no.bloqueada && <StatusBadge tone="danger">Bloqueada</StatusBadge>}
      {!no.ativo && <StatusBadge tone="danger">Inativa</StatusBadge>}
      {no.isPickable && <StatusBadge tone="success">Pick</StatusBadge>}
      {no.isPutaway && <StatusBadge tone="info">Putaway</StatusBadge>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Formulários                                                         */
/* ------------------------------------------------------------------ */

function FormArea({
  aoSubmeter,
  onCancelar,
}: {
  aoSubmeter: (v: AreaFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<AreaFormValues>({
    resolver: zodResolver(areaSchema),
    defaultValues: { codigo: "", designacao: "", tipo: "", descricao: "" },
  });
  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Criar Área">
      <FormSection title="Dados da área">
        <TextField name="codigo" label="Código da Área" required placeholder="Ex: REC ou EXP" span="1" />
        <TextField name="designacao" label="Designação" required placeholder="Recepção de mercadoria" span="2" />
        <TextField name="tipo" label="Tipo (livre)" placeholder="Recepção, Quarentena, Expedição…" span="full" />
        <TextAreaField name="descricao" label="Descrição" placeholder="Uso e condições desta área" span="full" />
      </FormSection>
    </FormShell>
  );
}

function FormZona({
  aoSubmeter,
  onCancelar,
}: {
  aoSubmeter: (v: ZonaFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<ZonaFormValues>({
    resolver: zodResolver(zonaSchema),
    defaultValues: { codigo: "", designacao: "", descricao: "", altaRotacao: false, temperaturaControlada: false },
  });
  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Criar Zona">
      <FormSection title="Dados da zona">
        <TextField name="codigo" label="Código da Zona" required placeholder="Ex: PESADOS" span="1" />
        <TextField name="designacao" label="Designação" required placeholder="Produtos pesados" span="2" />
        <TextAreaField name="descricao" label="Descrição" placeholder="Critérios desta zona" span="full" />
      </FormSection>
      <FormSection title="Características" description="Alimentam o picking e o putaway.">
        <CheckboxField name="altaRotacao" label="Zona de alta rotação" description="Prioridade na estratégia de picking." />
        <CheckboxField name="temperaturaControlada" label="Temperatura controlada" description="Ex.: refrigerados." />
      </FormSection>
    </FormShell>
  );
}

function FormEditarArea({
  area,
  aoSubmeter,
  onCancelar,
}: {
  area: AreaArmazemDto;
  aoSubmeter: (v: EditarAreaFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<EditarAreaFormValues>({
    resolver: zodResolver(editarAreaSchema),
    defaultValues: {
      codigo: area.codigo,
      designacao: area.designacao,
      tipo: area.tipo ?? "",
      descricao: area.descricao ?? "",
      ativo: area.ativo,
    },
  });
  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Guardar Alterações">
      <FormSection title="Dados da área">
        <TextField name="codigo" label="Código da Área" required placeholder="Ex: REC ou EXP" span="1" />
        <TextField name="designacao" label="Designação" required span="2" />
        <TextField name="tipo" label="Tipo (livre)" placeholder="Recepção, Quarentena, Expedição…" span="full" />
        <TextAreaField name="descricao" label="Descrição" span="full" />
      </FormSection>
      <FormSection title="Estado">
        <CheckboxField name="ativo" label="Ativa" description="Sem isto não recebe nem cede stock." />
      </FormSection>
    </FormShell>
  );
}

function FormEditarZona({
  zona,
  aoSubmeter,
  onCancelar,
}: {
  zona: ZonaEstruturaDto;
  aoSubmeter: (v: EditarZonaFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<EditarZonaFormValues>({
    resolver: zodResolver(editarZonaSchema),
    defaultValues: {
      codigo: zona.codigo,
      designacao: zona.designacao,
      descricao: zona.descricao ?? "",
      altaRotacao: zona.altaRotacao,
      temperaturaControlada: zona.temperaturaControlada,
      ativo: zona.ativo,
    },
  });
  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Guardar Alterações">
      <FormSection title="Dados da zona">
        <TextField name="codigo" label="Código da Zona" required placeholder="Ex: PESADOS" span="1" />
        <TextField name="designacao" label="Designação" required span="2" />
        <TextAreaField name="descricao" label="Descrição" span="full" />
      </FormSection>
      <FormSection title="Características" description="Alimentam o picking e o putaway.">
        <CheckboxField name="altaRotacao" label="Zona de alta rotação" description="Prioridade na estratégia de picking." />
        <CheckboxField name="temperaturaControlada" label="Temperatura controlada" description="Ex.: refrigerados." />
        <CheckboxField name="ativo" label="Ativa" description="Sem isto não recebe nem cede stock." />
      </FormSection>
    </FormShell>
  );
}

function FormLocalizacao({
  aoSubmeter,
  onCancelar,
}: {
  aoSubmeter: (v: CriarLocalizacaoFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<CriarLocalizacaoFormValues>({
    resolver: zodResolver(criarLocalizacaoSchema),
    defaultValues: {
      codigo: "",
      designacao: "",
      tipo: "estrutura",
      capacidadeQuantidade: "",
      capacidadePeso: "",
      capacidadeVolume: "",
      isPickable: true,
      isPutaway: true,
    },
  });
  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Criar Localização">
      <FormSection title="Endereço">
        <TextField name="codigo" label="Código" required placeholder="Ex: A1-R02-N03" span="1" />
        <SelectField name="tipo" label="Tipo" options={TIPO_LOCALIZACAO} span="1" />
        <TextField name="designacao" label="Designação" placeholder="Prateleira da borracha 15 mm" span="full" />
      </FormSection>
      <FormSection
        title="Capacidade"
        description="Deixar vazio significa “sem limite declarado”, nunca capacidade zero."
      >
        <NumberField name="capacidadeQuantidade" label="Qtd. (un.)" integer min={0} step="1" placeholder="sem limite" span="1" />
        <NumberField name="capacidadePeso" label="Peso (kg)" min={0} placeholder="sem limite" span="1" />
        <NumberField name="capacidadeVolume" label="Volume (m³)" min={0} placeholder="sem limite" span="1" />
      </FormSection>
      <FormSection title="Operação">
        <CheckboxField name="isPickable" label="Elegível para picking" />
        <CheckboxField name="isPutaway" label="Elegível para putaway" />
      </FormSection>
    </FormShell>
  );
}

function FormEditarLocalizacao({
  no,
  aoSubmeter,
  onCancelar,
}: {
  no: NoLocalizacaoDto | null;
  aoSubmeter: (v: EditarLocalizacaoFormValues) => void;
  onCancelar: () => void;
}) {
  const methods = useForm<EditarLocalizacaoFormValues>({
    resolver: zodResolver(editarLocalizacaoSchema),
    defaultValues: {
      designacao: no?.designacao ?? "",
      capacidadeQuantidade: no && no.capacidadeQuantidade != null ? String(no.capacidadeQuantidade) : "",
      capacidadePeso: no && no.capacidadePeso != null ? String(no.capacidadePeso) : "",
      capacidadeVolume: no && no.capacidadeVolume != null ? String(no.capacidadeVolume) : "",
      permitirMixProdutos: no?.permitirMixProdutos ?? true,
      permitirMixLotes: no?.permitirMixLotes ?? true,
      isPickable: no?.isPickable ?? true,
      isPutaway: no?.isPutaway ?? true,
      ativo: no?.ativo ?? true,
      bloqueada: no?.bloqueada ?? false,
    },
  });
  return (
    <FormShell methods={methods} onSubmit={aoSubmeter} onCancel={onCancelar} submitLabel="Guardar Alterações">
      <FormSection title="Identificação">
        <TextField name="designacao" label="Designação" placeholder="Esclareça onde fica a posição" span="full" />
      </FormSection>
      <FormSection
        title="Capacidade"
        description="Deixar vazio mantém “sem limite declarado”."
      >
        <NumberField name="capacidadeQuantidade" label="Qtd. (un.)" integer min={0} step="1" placeholder="sem limite" span="1" />
        <NumberField name="capacidadePeso" label="Peso (kg)" min={0} placeholder="sem limite" span="1" />
        <NumberField name="capacidadeVolume" label="Volume (m³)" min={0} placeholder="sem limite" span="1" />
      </FormSection>
      <FormSection title="Operação">
        <CheckboxField name="isPickable" label="Elegível para picking" />
        <CheckboxField name="isPutaway" label="Elegível para putaway" />
        <CheckboxField name="permitirMixProdutos" label="Permite mistura de produtos" />
        <CheckboxField name="permitirMixLotes" label="Permite mistura de lotes" />
        <CheckboxField name="ativo" label="Ativa" description="Sem isto não recebe nem cede stock." />
        <CheckboxField name="bloqueada" label="Bloqueada" description="Bloqueio operacional temporário." />
      </FormSection>
    </FormShell>
  );
}

/* ------------------------------------------------------------------ */
/* Diálogos de leitura                                                 */
/* ------------------------------------------------------------------ */

function DialogoCapacidade({ no, onFechar }: { no: NoLocalizacaoDto; onFechar: () => void }) {
  const [dados, setDados] = useState<{
    capacidadeQuantidade: number | null;
    capacidadePeso: number | null;
    capacidadeVolume: number | null;
    quantidadeActual: number;
  } | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const res = await localizacaoApi.mostrarCapacidade(no.id);
      if (!ativo) return;
      if (res.success) setDados(res.data);
      else setErro(res.error.message);
    })();
    return () => {
      ativo = false;
    };
  }, [no.id]);

  if (erro) {
    return <p className="text-sm text-destructive">{erro}</p>;
  }
  if (!dados) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
        <span className="text-xs">A calcular a capacidade...</span>
      </div>
    );
  }

  const linha = (rotulo: string, declara: number | null, actual?: number) => (
    <div className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className="font-mono text-sm font-medium">
        {actual !== undefined ? (
          <>
            {formatarNumero(actual)} / {formatarNumero(declara)}
          </>
        ) : (
          formatarNumero(declara)
        )}
      </span>
    </div>
  );

  return (
    <div>
      <p className="font-mono font-semibold text-foreground text-sm mb-3">{no.codigo}</p>
      {linha("Quantidade (un.)", dados.capacidadeQuantidade, dados.quantidadeActual)}
      {linha("Peso (kg)", dados.capacidadePeso)}
      {linha("Volume (m³)", dados.capacidadeVolume)}
      <button
        type="button"
        onClick={onFechar}
        className="mt-4 h-9 px-4 text-sm border border-border rounded-md hover:bg-muted text-muted-foreground transition-colors"
      >
        Fechar
      </button>
    </div>
  );
}

function DialogoEstado({ no, onFechar }: { no: NoLocalizacaoDto; onFechar: () => void }) {
  const [dados, setDados] = useState<{
    ativo: boolean;
    bloqueada: boolean;
    isPickable: boolean;
    isPutaway: boolean;
  } | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const res = await localizacaoApi.mostrarEstado(no.id);
      if (!ativo) return;
      if (res.success) setDados(res.data);
      else setErro(res.error.message);
    })();
    return () => {
      ativo = false;
    };
  }, [no.id]);

  if (erro) {
    return <p className="text-sm text-destructive">{erro}</p>;
  }
  if (!dados) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
        <span className="text-xs">A consultar o estado...</span>
      </div>
    );
  }

  const item = (rotulo: string, valor: boolean) => (
    <div className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      {valor ? <StatusBadge tone="success">Sim</StatusBadge> : <StatusBadge tone="neutral">Não</StatusBadge>}
    </div>
  );

  return (
    <div>
      <p className="font-mono font-semibold text-foreground text-sm mb-3">{no.codigo}</p>
      {item("Ativa", dados.ativo)}
      {item("Bloqueada", dados.bloqueada)}
      {item("Elegível para picking", dados.isPickable)}
      {item("Elegível para putaway", dados.isPutaway)}
      <button
        type="button"
        onClick={onFechar}
        className="mt-4 h-9 px-4 text-sm border border-border rounded-md hover:bg-muted text-muted-foreground transition-colors"
      >
        Fechar
      </button>
    </div>
  );
}