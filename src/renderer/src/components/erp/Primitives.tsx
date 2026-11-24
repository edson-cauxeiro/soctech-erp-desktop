import { type ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function KpiCard({
  label,
  value,
  delta,
  trend = "up",
  hint,
  icon,
  testId,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  hint?: string;
  icon?: ReactNode;
  /** Para os testes E2E: identificar um cartão pelo valor sem depender do texto. */
  testId?: string;
}) {
  const positive = trend === "up";
  return (
    <div
      data-testid={testId}
      className="bg-card border border-border rounded-md p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        {icon && <div className="text-primary opacity-70">{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta && (
          <span
            className={[
              "inline-flex items-center gap-0.5 font-medium",
              positive ? "text-success" : "text-destructive",
            ].join(" ")}
          >
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-card border border-border rounded-md shadow-[var(--shadow-card)] ${className}`}
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto -m-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
            {columns.map((c) => (
              <th key={c} className="px-4 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-accent/40 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.12_75)]",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}