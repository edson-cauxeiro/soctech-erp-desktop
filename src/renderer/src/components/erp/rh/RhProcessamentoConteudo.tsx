import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle, Coins, Users } from "lucide-react";
import type { RhProcessamentoLoaderResultado } from "@/@types/electron";

const ROTULO_MOTIVO: Record<string, string> = {
  CONTRATO_INATIVO: "Contrato inactivo",
  JA_PROCESSADO: "Já processado",
  PERIODO_FECHADO: "Período fechado",
  SUSPENSO: "Suspenso",
  IBAN_EM_FALTA: "IBAN em falta",
  FIM_CONTRATO_SEM_FLAG: "Fim de contrato",
  SEM_CONTRATO_ATIVO: "Sem contrato activo",
  OUTRO: "Outro",
};

const fmtMoeda = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" });

type SortKey = "codigo" | "nome";
type Direcao = "asc" | "desc";

interface RubricaAgregada {
  chave: string;
  codigo: string;
  descricao: string;
  tipo: string;
  origem: "Fixa" | "Mensal";
  funcionarios: number;
  total: number;
}

function agregarRubricas(resultado: RhProcessamentoLoaderResultado): RubricaAgregada[] {
  const mapa = new Map<
    string,
    { codigo: string; descricao: string; tipo: string; origem: "Fixa" | "Mensal"; funcs: Set<string>; total: number }
  >();

  const adicionar = (
    tipo: string,
    origem: "Fixa" | "Mensal",
    rubricaId: string,
    codigo: string,
    descricao: string,
    funcionarioId: string,
    valor: number
  ) => {
    const chave = `${origem}:${rubricaId}`;
    const existente = mapa.get(chave);
    if (existente) {
      existente.funcs.add(funcionarioId);
      existente.total += valor;
    } else {
      mapa.set(chave, {
        codigo,
        descricao,
        tipo,
        origem,
        funcs: new Set([funcionarioId]),
        total: valor,
      });
    }
  };

  for (const dados of resultado.funcionarios) {
    const funcionarioId = dados.funcionario.id;
    for (const fixa of dados.funcionario.rubricasFixas) {
      if (!fixa.rubrica) continue;
      adicionar(
        fixa.rubrica.tipo,
        "Fixa",
        fixa.rubrica.id,
        fixa.rubrica.codigo,
        fixa.rubrica.descricao,
        funcionarioId,
        fixa.valor ?? 0
      );
    }
    for (const alt of resultado.alteracoesMensais[funcionarioId] ?? []) {
      if (!alt.rubrica) continue;
      adicionar(
        alt.rubrica.tipo,
        "Mensal",
        alt.rubrica.id,
        alt.rubrica.codigo,
        alt.rubrica.descricao,
        funcionarioId,
        alt.valor
      );
    }
  }

  return [...mapa.entries()]
    .map(([chave, v]) => ({
      chave,
      codigo: v.codigo,
      descricao: v.descricao,
      tipo: v.tipo,
      origem: v.origem,
      funcionarios: v.funcs.size,
      total: v.total,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt"));
}

interface RhProcessamentoConteudoProps {
  resultado: RhProcessamentoLoaderResultado;
  tipoLabel: string;
  tipoAbrev: string;
  selecionados: string[];
  onSelecionadosChange: (ids: string[]) => void;
}

export function RhProcessamentoConteudo({
  resultado,
  tipoLabel,
  tipoAbrev,
  selecionados,
  onSelecionadosChange,
}: RhProcessamentoConteudoProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Direcao }>({ key: "codigo", dir: "asc" });

  const elegiveis = useMemo(
    () => resultado.funcionarios.filter((f) => f.elegibilidade.podeProcessar),
    [resultado]
  );

  const ordenados = useMemo(() => {
    const copia = [...elegiveis];
    copia.sort((a, b) => {
      const va = sort.key === "codigo" ? a.funcionario.codigo : a.funcionario.nome;
      const vb = sort.key === "codigo" ? b.funcionario.codigo : b.funcionario.nome;
      const cmp = va.localeCompare(vb, "pt");
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [elegiveis, sort]);

  const todosSelecionados =
    elegiveis.length > 0 && elegiveis.every((f) => selecionados.includes(f.funcionario.id));
  const algumSelecionado = selecionados.length > 0 && !todosSelecionados;

  const alternarTodos = (estado: boolean | "indeterminate") => {
    onSelecionadosChange(estado === true ? elegiveis.map((f) => f.funcionario.id) : []);
  };

  const alternarUm = (id: string, marcado: boolean) => {
    onSelecionadosChange(marcado ? [...selecionados, id] : selecionados.filter((x) => x !== id));
  };

  const mudarOrdenacao = (key: SortKey) => {
    setSort((atual) =>
      atual.key === key ? { key, dir: atual.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const restricoes = resultado.elegibilidade.restricoes;

  const { remuneracoes, descontos } = useMemo(() => {
    const todas = agregarRubricas(resultado);
    return {
      remuneracoes: todas.filter((r) => r.tipo === "REMUNERACAO"),
      descontos: todas.filter((r) => r.tipo === "DESCONTO" || r.tipo === "ENCARGO_PATRONAL"),
    };
  }, [resultado]);

  const moedas = useMemo(() => {
    const conjunto = new Set<string>();
    for (const f of resultado.funcionarios) {
      const moeda = f.contrato?.moeda;
      if (moeda && moeda !== "AOA") conjunto.add(moeda);
    }
    return [...conjunto];
  }, [resultado.funcionarios]);

  return (
    <Tabs defaultValue="processamentos" className="w-full">
      <TabsList>
        <TabsTrigger value="processamentos">Processamentos</TabsTrigger>
        <TabsTrigger value="restricoes">Restrições ({restricoes.length})</TabsTrigger>
        <TabsTrigger value="remuneracoes">Remunerações/Descontos/Taxas Cambiais</TabsTrigger>
      </TabsList>

      <TabsContent value="processamentos" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {elegiveis.length} elegíve{elegiveis.length === 1 ? "l" : "is"} · {selecionados.length}{" "}
            selecionado{selecionados.length === 1 ? "" : "s"}
            {selecionados.length > 0 &&
              (selecionados.length === 1
                ? " · processamento individual"
                : " · processamento em lote")}
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">
                  <span className="flex items-center gap-2">
                    P
                    <Checkbox
                      checked={algumSelecionado ? "indeterminate" : todosSelecionados}
                      onCheckedChange={alternarTodos}
                      disabled={elegiveis.length === 0}
                      aria-label="Selecionar tudo"
                    />
                  </span>
                </TableHead>
                <TableHead className="w-40">
                  <CabecalhoOrdenavel
                    rotulo="Funcionário"
                    activo={sort.key === "codigo"}
                    dir={sort.dir}
                    onClick={() => mudarOrdenacao("codigo")}
                  />
                </TableHead>
                <TableHead>
                  <CabecalhoOrdenavel
                    rotulo="Nome"
                    activo={sort.key === "nome"}
                    dir={sort.dir}
                    onClick={() => mudarOrdenacao("nome")}
                  />
                </TableHead>
                <TableHead className="w-48">Tipo Processamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    Sem funcionários elegíveis para os parâmetros escolhidos.
                  </TableCell>
                </TableRow>
              ) : (
                ordenados.map((dados) => {
                  const id = dados.funcionario.id;
                  const marcado = selecionados.includes(id);
                  return (
                    <TableRow key={id} className="hover:bg-accent/40">
                      <TableCell>
                        <Checkbox
                          checked={marcado}
                          onCheckedChange={(v) => alternarUm(id, v === true)}
                          aria-label={`Processar ${dados.funcionario.nome}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{dados.funcionario.codigo}</TableCell>
                      <TableCell>{dados.funcionario.nome}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          title={tipoLabel}
                        >
                          {tipoAbrev}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="restricoes" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Funcionários excluídos ou bloqueados para os parâmetros escolhidos e o respectivo motivo.
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Funcionário</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-48">Motivo</TableHead>
                <TableHead>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restricoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Sem restrições para os parâmetros escolhidos.
                  </TableCell>
                </TableRow>
              ) : (
                restricoes.map((r, indice) => {
                  const funcionario = resultado.funcionarios.find(
                    (f) => f.funcionario.id === r.funcionarioId
                  )?.funcionario;
                  return (
                    <TableRow key={`${r.funcionarioId}-${r.motivo}-${indice}`}>
                      <TableCell className="font-mono text-sm">{funcionario?.codigo ?? "—"}</TableCell>
                      <TableCell>{funcionario?.nome ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {ROTULO_MOTIVO[r.motivo] ?? r.motivo}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.descricao}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="remuneracoes" className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <GrupoRubricas
            titulo="Remunerações"
            rubricas={remuneracoes}
            vazio="Sem remunerações aplicáveis."
          />
          <GrupoRubricas
            titulo="Descontos"
            rubricas={descontos}
            vazio="Sem descontos aplicáveis."
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Taxas Cambiais</h3>
          </div>
          {moedas.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Sem salários indexados a moeda estrangeira nos funcionários elegíveis.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Moeda</TableHead>
                    <TableHead className="w-40">Funcionários</TableHead>
                    <TableHead>Taxa (AOA)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moedas.map((moeda) => {
                    const total = resultado.funcionarios.filter(
                      (f) => f.contrato?.moeda === moeda
                    ).length;
                    return (
                      <TableRow key={moeda}>
                        <TableCell className="font-mono text-sm">{moeda}</TableCell>
                        <TableCell className="tabular-nums">{total}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          Configurada na tabela de câmbios do período.
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function GrupoRubricas({
  titulo,
  rubricas,
  vazio,
}: {
  titulo: string;
  rubricas: RubricaAgregada[];
  vazio: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-24">Origem</TableHead>
              <TableHead className="w-24 text-right">Func.</TableHead>
              <TableHead className="w-32 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rubricas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  {vazio}
                </TableCell>
              </TableRow>
            ) : (
              rubricas.map((r) => (
                <TableRow key={r.chave}>
                  <TableCell className="font-mono text-sm">{r.codigo}</TableCell>
                  <TableCell>{r.descricao}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.origem}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.funcionarios}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtMoeda.format(r.total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CabecalhoOrdenavel({
  rotulo,
  activo,
  dir,
  onClick,
}: {
  rotulo: string;
  activo: boolean;
  dir: Direcao;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 font-medium hover:text-foreground"
    >
      {rotulo}
      {activo ? (
        dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}
