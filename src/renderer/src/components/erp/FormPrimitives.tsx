import { useEffect, useState, type ReactNode } from "react";
import {
  FormProvider,
  useFormContext,
  useFieldArray,
  useWatch,
  type UseFormReturn,
  type FieldValues,
  type Path,
  type SubmitHandler,
} from "react-hook-form";
import { formatCurrencyInput, parseCurrencyInput } from "@/utils/currency";

const inputCls =
  "w-full h-9 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export function FormShell<T extends FieldValues>({
  methods,
  onSubmit,
  children,
  submitLabel = "Guardar",
  onCancel,
  flush = false,
  compact = false,
  dialogLayout = false,
}: {
  methods: UseFormReturn<T, any, any>;
  onSubmit: SubmitHandler<T>;
  children: ReactNode;
  submitLabel?: string;
  onCancel?: () => void;
  flush?: boolean;
  /** Menos altura: para formulários que vivem dentro de um diálogo já apertado. */
  compact?: boolean;
  /** Opt-in: preenche a altura disponível e coloca o rodapé fixo, com scroll só no corpo. */
  dialogLayout?: boolean;
}) {
  // O modo compacto tem de ser opt-in. Partilhar `h-8`/`text-xs` com os
  // restantes formulários encolhia os botões de todos os diálogos da
  // aplicação, e o `flush` perdia o seu espaçamento próprio.
  const bodyPadding = compact ? "p-4 space-y-3" : flush ? "p-6 space-y-5" : "p-6 space-y-6";
  const footerPadding = compact ? "px-4 py-2.5" : "px-6 py-3";
  const botaoSecundario = compact
    ? "h-8 px-3 rounded-md text-xs border border-border hover:bg-muted transition-colors font-medium text-muted-foreground"
    : "h-9 px-4 rounded-md text-sm border border-border hover:bg-muted transition-colors font-medium text-muted-foreground";
  const botaoPrimario = compact
    ? "h-8 px-4 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
    : "h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm";

  const formClassName = dialogLayout
    ? flush
      ? "flex h-full min-h-0 flex-col"
      : "bg-card border border-border shadow-[var(--shadow-card)] flex h-full min-h-0 flex-col"
    : flush
      ? "flex flex-col"
      : "bg-card border border-border rounded-md shadow-[var(--shadow-card)] flex flex-col";
  const bodyClassName = dialogLayout ? `${bodyPadding} flex-1 min-h-0 overflow-y-auto` : bodyPadding;
  const footerClassName = dialogLayout
    ? `shrink-0 ${footerPadding}`
    : `rounded-b-md mt-auto ${footerPadding}`;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className={formClassName}>
        <div className={bodyClassName}>{children}</div>
        <div
          className={`border-t border-border flex items-center justify-end gap-2 bg-muted/30 ${footerClassName}`}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={`${botaoSecundario} mr-auto`}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => methods.reset()}
            className={botaoSecundario}
          >
            Limpar
          </button>
          <button type="submit" className={botaoPrimario}>
            {submitLabel}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}

export interface FormTabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  hasErrors?: boolean;
}

export function FormTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: FormTabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
}) {
  return (
    <div className="border-b border-border mb-6">
      <nav className="flex items-center gap-1 -mb-px overflow-x-auto" aria-label="Abas do formulário">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={[
                "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors border-b-2 whitespace-nowrap",
                isActive
                  ? "border-primary text-primary bg-primary/5 rounded-t-md"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-t-md",
              ].join(" ")}
            >
              {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.hasErrors && (
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" title="Existem erros nesta aba" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function FormTabPanel({
  id,
  activeTab,
  children,
}: {
  id: string;
  activeTab: string;
  children: ReactNode;
}) {
  if (id !== activeTab) return null;
  return <div className="space-y-6 animate-in fade-in-50 duration-150">{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-muted/10 p-4 rounded-lg border border-border/50">
      <header className="mb-3.5 pb-2 border-b border-border/60">
        <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground/80 mt-0.5">{description}</p>
        )}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
        {children}
      </div>
    </section>
  );
}

type FieldSpan = "1" | "2" | "3" | "full" | "half";

export function FieldWrap({
  label,
  name,
  required,
  children,
  span = "1",
}: {
  label: string;
  name: string;
  required?: boolean;
  children: ReactNode;
  span?: FieldSpan;
}) {
  const {
    formState: { errors },
  } = useFormContext();
  const err = name.split(".").reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
    errors,
  ) as { message?: string } | undefined;

  const spanClass =
    span === "full"
      ? "col-span-full"
      : span === "half" || span === "2"
      ? "sm:col-span-2 md:col-span-2 lg:col-span-2"
      : span === "3"
      ? "sm:col-span-2 md:col-span-3 lg:col-span-3"
      : "col-span-1";

  return (
    <div className={["block", spanClass].join(" ")}>
      <label className="text-xs font-medium text-foreground block mb-1">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <div>{children}</div>
      {err?.message && (
        <span className="text-[11px] text-destructive mt-1 inline-block font-medium">
          {err.message}
        </span>
      )}
    </div>
  );
}

type BaseFieldProps = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  span?: FieldSpan;
};

export function TextField({
  name,
  label,
  required,
  placeholder,
  span,
  type = "text",
}: BaseFieldProps & { type?: string }) {
  const { register } = useFormContext();
  return (
    <FieldWrap label={label} name={name} required={required} span={span}>
      <input
        type={type}
        {...register(name)}
        placeholder={placeholder}
        className={inputCls}
      />
    </FieldWrap>
  );
}

export function NumberField(
  props: BaseFieldProps & {
    step?: string;
    min?: number | string;
    max?: number | string;
    integer?: boolean;
  }
) {
  const { register } = useFormContext();
  return (
    <FieldWrap label={props.label} name={props.name} required={props.required} span={props.span}>
      <input
        type="number"
        step={props.integer ? "1" : (props.step ?? "any")}
        min={props.min?.toString()}
        max={props.max?.toString()}
        inputMode={props.integer ? "numeric" : "decimal"}
        {...register(props.name)}
        onKeyDown={(e) => {
          if (props.integer && ["e", "E", ".", ",", "+", "-"].includes(e.key)) {
            e.preventDefault();
          }
        }}
        placeholder={props.placeholder}
        className={inputCls}
      />
    </FieldWrap>
  );
}

export function DateField(props: BaseFieldProps) {
  return <TextField {...props} type="date" />;
}

/**
 * Campo de dinheiro em Kwanza.
 *
 * O que se vê é "1 250,00"; o que o formulário guarda é `1250`. Um
 * `type="number"` não serve: recusa o que uma pessoa escreve a sério
 * ("1 250,50") e o input do browser não tem forma de mostrar a moeda.
 *
 * A formatação só é reescrita quando não se está a escrever no meio do
 * número — reformatar a cada tecla move o cursor e a pessoa perde a
 * posição. Ao sair do campo, o número fica no formato de leitura.
 */
export function CurrencyField({
  name,
  label,
  required,
  placeholder,
  span,
  currency = "AOA",
}: BaseFieldProps & { currency?: string }) {
  const { setValue } = useFormContext();
  const valor = useWatch({ name }) as number | string | undefined;
  const [texto, setTexto] = useState("");
  const [aEscrever, setAEscrever] = useState(false);

  // Segue o valor quando muda por fora (abrir outro artigo, `reset`),
  // mas nunca durante a escrita, para não partir o cursor.
  useEffect(() => {
    if (aEscrever) return;
    const numero = typeof valor === "number" ? valor : parseCurrencyInput(String(valor ?? ""));
    setTexto(numero > 0 ? formatCurrencyInput(numero, currency) : "");
  }, [valor, aEscrever, currency]);

  const aoEscrever = (bruto: string) => {
    setAEscrever(true);
    setTexto(bruto);
    setValue(name, parseCurrencyInput(bruto), { shouldValidate: false, shouldDirty: true });
  };

  return (
    <FieldWrap label={label} name={name} required={required} span={span}>
      <input
        type="text"
        inputMode="decimal"
        value={texto}
        placeholder={placeholder ?? "0,00"}
        onChange={(e) => aoEscrever(e.target.value)}
        onFocus={() => setAEscrever(true)}
        onBlur={() => {
          setAEscrever(false);
          const numero = parseCurrencyInput(texto);
          setTexto(numero > 0 ? formatCurrencyInput(numero, currency) : "");
        }}
        className={inputCls + " tabular-nums"}
      />
    </FieldWrap>
  );
}

export function TextAreaField({
  name,
  label,
  required,
  placeholder,
  rows = 3,
  span = "full",
}: BaseFieldProps & { rows?: number }) {
  const { register } = useFormContext();
  return (
    <FieldWrap label={label} name={name} required={required} span={span}>
      <textarea
        {...register(name)}
        rows={rows}
        placeholder={placeholder}
        className={inputCls + " h-auto py-2 resize-y"}
      />
    </FieldWrap>
  );
}

import { SearchSelect } from "../ui/SearchSelect";
export { SearchSelect };
import { formatCurrency, DEFAULT_CURRENCY, CURRENCIES } from "@/utils/currency";

export function SelectField({
  name,
  label,
  required,
  options,
  span,
  placeholder = "— Selecionar ou pesquisar —",
}: BaseFieldProps & {
  options: (string | { value: string; label: string })[];
  placeholder?: string;
}) {
  const { register, setValue, watch, formState } = useFormContext();
  const currentValue = watch(name) ?? "";
  const hasError = Boolean(formState.errors[name]);

  return (
    <FieldWrap label={label} name={name} required={required} span={span}>
      <input type="hidden" {...register(name)} />
      <SearchSelect
        value={String(currentValue)}
        onChange={(val) => {
          setValue(name, val, { shouldValidate: true, shouldDirty: true });
        }}
        options={options}
        placeholder={placeholder}
        required={required}
        hasError={hasError}
      />
    </FieldWrap>
  );
}

function parseDecimal(texto: string): number | null {
  const bruto = texto.trim().replace(/\s/g, "");
  if (!bruto) return null;
  const comVirgula = bruto.includes(",");
  const normal = comVirgula ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const n = parseFloat(normal);
  return Number.isFinite(n) ? n : null;
}

export function QuantityInput({
  value,
  onChange,
  min = 0,
  integer = false,
  placeholder = "Qtd.",
  className = "",
}: {
  value: number | null | undefined;
  onChange: (valor: number) => void;
  min?: number;
  integer?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [texto, setTexto] = useState("");

  const aoFocar = () => {
    setTexto(value != null ? String(value) : "");
    setFocused(true);
  };

  const aoSair = () => {
    setFocused(false);
    const n = parseDecimal(texto);
    if (n != null) {
      const final = integer ? Math.round(n) : n;
      if (final >= min) onChange(final);
    }
    setTexto("");
  };

  const mostra =
    focused
      ? texto
      : value != null
        ? String(value)
        : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={mostra}
      onFocus={aoFocar}
      onBlur={aoSair}
      onChange={(e) => setTexto(e.target.value.replace(integer ? /[^\d]/g : /[^\d.,]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      className={`w-full h-8 rounded border border-input bg-background px-2 text-xs font-mono text-right ${className}`}
      aria-label={placeholder}
    />
  );
}

export function PriceInput({
  value,
  onChange,
  placeholder,
  currency = DEFAULT_CURRENCY,
}: {
  value: number | null | undefined;
  onChange: (valor: number) => void;
  placeholder?: string;
  currency?: string;
}) {
  const meta = CURRENCIES[currency] ?? CURRENCIES[DEFAULT_CURRENCY];
  const [focused, setFocused] = useState(false);
  const [texto, setTexto] = useState("");

  const formata = (n: number, agrupar: boolean) =>
    new Intl.NumberFormat(meta.locale, {
      useGrouping: agrupar,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(n);

  const aoFocar = () => {
    setTexto(value != null && Number.isFinite(Number(value)) ? formata(Number(value), false) : "");
    setFocused(true);
  };

  const aoSair = () => {
    setFocused(false);
    const n = parseDecimal(texto);
    if (n != null) onChange(n);
    setTexto("");
  };

  const mostra =
    focused
      ? texto
      : value != null && Number.isFinite(Number(value))
        ? formata(Number(value), true)
        : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={mostra}
      onFocus={aoFocar}
      onBlur={aoSair}
      onChange={(e) => setTexto(e.target.value.replace(/[^\d.,\s]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      className="w-full h-8 rounded border border-input bg-background px-2 text-xs font-mono text-right"
      aria-label={placeholder}
    />
  );
}

export function CheckboxField({
  name,
  label,
  description,
  span = "1",
}: {
  name: string;
  label: string;
  description?: string;
  span?: FieldSpan;
}) {
  const { register } = useFormContext();
  const spanClass =
    span === "full"
      ? "col-span-full"
      : span === "half" || span === "2"
      ? "sm:col-span-2 md:col-span-2 lg:col-span-2"
      : "col-span-1";
  return (
    <div className={["flex items-start gap-2 pt-2", spanClass].join(" ")}>
      <input
        type="checkbox"
        {...register(name)}
        className="w-4 h-4 mt-0.5 rounded border-input text-primary focus:ring-primary"
      />
      <div>
        <label className="text-xs font-medium text-foreground cursor-pointer block">{label}</label>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

export function LineItemsField<T extends FieldValues>({
  name,
  label = "Linhas do Documento",
  columns,
}: {
  name: Path<T>;
  label?: string;
  columns: { key: string; label: string; type?: string; width?: string }[];
}) {
  const { control, register } = useFormContext<T>();
  const { fields, append, remove } = useFieldArray({ control, name: name as never });
  return (
    <div className="col-span-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground tracking-tight">
          {label} <span className="text-destructive">*</span>
        </span>
        <button
          type="button"
          onClick={() =>
            append(Object.fromEntries(columns.map((c) => [c.key, ""])) as never)
          }
          className="h-7 px-3 rounded-md text-[11px] font-medium border border-border bg-card hover:bg-muted transition-colors shadow-xs"
        >
          + Adicionar linha
        </button>
      </div>
      <div className="border border-border rounded-md overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-[11px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-3 py-2.5 font-semibold"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fields.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="text-center text-xs text-muted-foreground py-6 bg-muted/10"
                >
                  Sem linhas adicionadas. Clique em "+ Adicionar linha" para incluir artigos.
                </td>
              </tr>
            )}
            {fields.map((f, i) => (
              <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                {columns.map((c) => (
                  <td key={c.key} className="p-1.5">
                    <input
                      type={c.type ?? "text"}
                      step="any"
                      {...register(`${name}.${i}.${c.key}` as Path<T>)}
                      className="w-full h-8 px-2.5 rounded border border-input bg-background text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </td>
                ))}
                <td className="p-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-muted-foreground hover:text-destructive text-base leading-none p-1 rounded hover:bg-destructive/10 transition-colors"
                    aria-label="Remover linha"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DocumentTotalsSummary({
  subtotal = 0,
  desconto = 0,
  iva = 0,
  retencao = 0,
  total = 0,
}: {
  subtotal?: number;
  desconto?: number;
  iva?: number;
  retencao?: number;
  total?: number;
}) {
  const fmt = (v: number) => formatCurrency(v);

  return (
    <div className="flex justify-end pt-2">
      <div className="w-full sm:w-72 bg-muted/30 border border-border/80 rounded-lg p-3.5 space-y-2 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal:</span>
          <span className="font-mono">{fmt(subtotal)}</span>
        </div>
        {desconto > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Desconto:</span>
            <span className="font-mono text-destructive">-{fmt(desconto)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>Total IVA:</span>
          <span className="font-mono">{fmt(iva)}</span>
        </div>
        {retencao > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Retenção na Fonte:</span>
            <span className="font-mono text-amber-600">-{fmt(retencao)}</span>
          </div>
        )}
        <div className="border-t border-border pt-2 flex justify-between font-bold text-sm text-foreground">
          <span>Total a Pagar:</span>
          <span className="font-mono text-primary">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}