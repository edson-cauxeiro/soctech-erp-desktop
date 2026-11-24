import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, Tags, Boxes, Warehouse } from "lucide-react";
import {
  FormShell,
  FormSection,
  FormTabs,
  FormTabPanel,
  TextField,
  NumberField,
  CurrencyField,
  SelectField,
  CheckboxField,
  TextAreaField,
  FieldWrap,
} from "./FormPrimitives";
import { SearchSelect, type SearchSelectOption } from "../ui/SearchSelect";
import { armazemApi } from "../../api/armazem.api";
import type { ArmazemDto } from "../../@types/electron";

export const artigoUnifiedSchema = z.object({
  codigo: z.string().trim().min(1, "Obrigatório").max(50),
  descricao: z.string().trim().min(2, "Obrigatório").max(255),
  tipo: z.enum([
    "produto_acabado",
    "materia_prima",
    "produto_intermedio",
    "consumivel",
    "servico",
  ]),
  unidade: z.string().min(1, "Obrigatório"),
  familia: z.string().optional().or(z.literal("")),
  codigoBarras: z.string().max(50).optional().or(z.literal("")),
  estado: z.enum(["ativo", "descontinuado", "inativo"]),

  // Vendas / Comercial & Fiscal
  precoVenda: z.coerce.number().min(0, "Deve ser ≥ 0"),
  taxaIva: z.coerce.number().min(0).max(100),

  // Stock / Logística
  fatorConversao: z.coerce.number().min(0).optional(),
  stockMinimo: z.coerce.number().min(0).optional(),
  stockMaximo: z.coerce.number().min(0).optional(),
  pontoEncomenda: z.coerce.number().min(0).optional(),
  controloLote: z.boolean().optional(),
  armazemPadrao: z.string().optional().or(z.literal("")),
  armazemPadraoId: z.string().optional().or(z.literal("")),

  // Custeio & Produção
  precoCustoMedio: z.coerce.number().min(0).optional(),
  bom: z.string().optional().or(z.literal("")),
  observacoes: z.string().max(1000).optional().or(z.literal("")),
});

export type ArtigoUnifiedValues = z.infer<typeof artigoUnifiedSchema>;

export type ArtigoFormTab = "identificacao" | "comercial" | "estoque" | "custeio";

interface ArtigoFormProps {
  initialTab?: ArtigoFormTab;
  initialValues?: Partial<ArtigoUnifiedValues>;
  onSubmit?: (values: ArtigoUnifiedValues) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function ArtigoForm({ initialTab = "identificacao", initialValues, onSubmit, onCancel, isLoading }: ArtigoFormProps) {
  const [subTab, setSubTab] = useState<string>(initialTab);
  // Os armazéns existentes são a opção real do campo: escrever o ID à mão
  // numa caixa de texto produzia contas sem relação e erros de validação
  // vindos do servidor, com três palavras que não dizem o que se passou.
  const [armazens, setArmazens] = useState<ArmazemDto[]>([]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const res = await armazemApi.list({ ativo: true, take: 200 });
      if (!cancelado && res.success) setArmazens(res.data.items);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const opcoesArmazem: SearchSelectOption[] = armazens.map((a) => ({
    value: a.id,
    label: `${a.codigo} — ${a.designacao}`,
  }));

  const defaultVals: Partial<ArtigoUnifiedValues> = {
    codigo: "",
    descricao: "",
    estado: "ativo",
    tipo: "produto_acabado",
    unidade: "UN",
    taxaIva: 23,
    precoVenda: 0,
    precoCustoMedio: 0,
    stockMinimo: 0,
    stockMaximo: 0,
    pontoEncomenda: 0,
    fatorConversao: 1,
    controloLote: false,
    familia: "",
    codigoBarras: "",
    armazemPadraoId: "",
    bom: "",
    observacoes: "",
    ...initialValues,
  };

  const methods = useForm<ArtigoUnifiedValues>({
    resolver: zodResolver(artigoUnifiedSchema),
    defaultValues: defaultVals,
  });

  // Atualiza valores quando initialValues mudar (ex: ao abrir modal de edição ou novo)
  useEffect(() => {
    methods.reset({
      codigo: "",
      descricao: "",
      estado: "ativo",
      tipo: "produto_acabado",
      unidade: "UN",
      taxaIva: 23,
      precoVenda: 0,
      precoCustoMedio: 0,
      stockMinimo: 0,
      stockMaximo: 0,
      pontoEncomenda: 0,
      fatorConversao: 1,
      controloLote: false,
      familia: "",
      codigoBarras: "",
      armazemPadraoId: "",
      bom: "",
      observacoes: "",
      ...initialValues,
    });
    setSubTab(initialTab);
  }, [initialValues, initialTab, methods]);

  const tipoArtigo = methods.watch("tipo");
  const isServico = tipoArtigo === "servico";

  const handleFormSubmit = (values: ArtigoUnifiedValues) => {
    if (onSubmit) {
      onSubmit(values);
    } else {
      console.log("Artigo guardado (Master Data):", values);
    }
  };

  return (
    <FormShell
      methods={methods}
      onSubmit={handleFormSubmit}
      onCancel={onCancel}
      submitLabel={isLoading ? "A guardar..." : "Guardar Artigo"}
    >
      <FormTabs
        activeTab={subTab}
        onChange={setSubTab}
        tabs={[
          { id: "identificacao", label: "Identificação Geral", icon: <Package className="w-4 h-4" /> },
          { id: "comercial", label: "Comercial & Preços", icon: <Tags className="w-4 h-4" /> },
          { id: "estoque", label: "Stock & Logística", icon: <Boxes className="w-4 h-4" /> },
          { id: "custeio", label: "Custeio & Produção", icon: <Warehouse className="w-4 h-4" /> },
        ]}
      />

      {/* ABA 1: IDENTIFICAÇÃO GERAL */}
      <FormTabPanel id="identificacao" activeTab={subTab}>
        <FormSection
          title="Ficha do Artigo — Dados Gerais"
          description="Cadastro unificado de master data do artigo."
        >
          <TextField name="codigo" label="Código (SKU)" required placeholder="ART-0001" span="1" />
          <TextField name="descricao" label="Descrição" required span="2" />
          <SelectField
            name="tipo"
            label="Tipo de Artigo"
            required
            options={[
              { value: "produto_acabado", label: "Produto acabado" },
              { value: "materia_prima", label: "Matéria-prima" },
              { value: "produto_intermedio", label: "Produto intermédio" },
              { value: "consumivel", label: "Consumível" },
              { value: "servico", label: "Serviço" },
            ]}
            span="1"
          />
          <SelectField
            name="unidade"
            label="Unidade Base"
            required
            options={["UN", "KG", "L", "CX", "M", "M²", "M³"]}
            span="1"
          />
          <TextField name="familia" label="Família / Categoria" span="1" />
          <TextField name="codigoBarras" label="Código de Barras (EAN)" span="1" />
          <SelectField
            name="estado"
            label="Estado"
            required
            options={[
              { value: "ativo", label: "Ativo" },
              { value: "descontinuado", label: "Descontinuado" },
              { value: "inativo", label: "Inativo" },
            ]}
            span="1"
          />
        </FormSection>
      </FormTabPanel>

      {/* ABA 2: COMERCIAL & PREÇOS */}
      <FormTabPanel id="comercial" activeTab={subTab}>
        <FormSection
          title="Condições Comerciais e Impostos"
          description="Parâmetros para faturamento e vendas ao cliente."
        >
          <CurrencyField name="precoVenda" label="Preço de Venda Base (Kz)" required span="1" />
          <NumberField name="taxaIva" label="Taxa de IVA (%)" required step="0.01" span="1" />
        </FormSection>
      </FormTabPanel>

      {/* ABA 3: ESTOQUE & LOGÍSTICA */}
      <FormTabPanel id="estoque" activeTab={subTab}>
        <FormSection
          title="Gestão de Stock e Reposição"
          description={
            isServico
              ? "Artigo do tipo Serviço não está sujeito a controlo de inventário."
              : "Definições de níveis de stock, reposição e controlo de armazém."
          }
        >
          <NumberField name="fatorConversao" label="Fator de Conversão" step="0.0001" span="1" />
          <FieldWrap name="armazemPadraoId" label="Armazém Padrão">
            <SearchSelect
              name="armazemPadraoId"
              value={(methods.watch("armazemPadraoId") as string) ?? ""}
              onChange={(v) =>
                methods.setValue("armazemPadraoId", v, { shouldDirty: true, shouldValidate: true })
              }
              options={opcoesArmazem}
              placeholder={armazens.length === 0 ? "Sem armazém registado" : "Escolher armazém"}
              hasError={!!methods.formState.errors.armazemPadraoId}
            />
          </FieldWrap>
          <NumberField name="stockMinimo" label="Stock Mínimo" span="1" />
          <NumberField name="stockMaximo" label="Stock Máximo" span="1" />
          <NumberField name="pontoEncomenda" label="Ponto de Encomenda" span="1" />
          <CheckboxField name="controloLote" label="Controlo por Lote / Validade" span="1" />
        </FormSection>
      </FormTabPanel>

      {/* ABA 4: CUSTEIO & PRODUÇÃO */}
      <FormTabPanel id="custeio" activeTab={subTab}>
        <FormSection
          title="Custeio e Ficha Técnica"
          description="Controlo de valorização e composição de materiais."
        >
          <CurrencyField name="precoCustoMedio" label="Preço de Custo Médio (Kz)" span="1" />
          <TextField name="bom" label="Lista de Materiais (BOM)" span="2" />
          <TextAreaField name="observacoes" label="Observações Internas" span="full" />
        </FormSection>
      </FormTabPanel>
    </FormShell>
  );
}
