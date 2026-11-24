/**
 * @file WorkspaceFrame.tsx
 * @description Moldura de trabalho para ecrãs densos de contabilidade.
 *
 * A regra é simples e não negociável: o conteúdo nunca cresce para além da
 * janela. O cabeçalho e a barra de ferramentas ficam fixos; a lista e o
 * formulário têm a sua própria área com scroll. Assim um plano de contas com
 * centenas de linhas e um formulário com muitos campos não empurram o rodapé
 * para fora do ecrã nem obrigam a fazer scroll na página inteira.
 */

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface WorkspaceFrameProps {
  title: string;
  description?: string;
  /** Botões principais do ecrã (semear, criar, actualizar). */
  actions?: ReactNode;
  /** Filtros/pesquisa, imediatamente abaixo do cabeçalho. */
  toolbar?: ReactNode;
  /** Painel lateral (árvore, lista de selecção). Sem ele, o conteúdo ocupa tudo. */
  sidebar?: ReactNode;
  sidebarWidth?: string;
  children: ReactNode;
  className?: string;
}

export function WorkspaceFrame({
  title,
  description,
  actions,
  toolbar,
  sidebar,
  sidebarWidth = '320px',
  children,
  className,
}: WorkspaceFrameProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 h-[calc(100dvh-15.5rem)] min-h-[420px] bg-card border border-border rounded-md overflow-hidden',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>

      {toolbar && <div className="shrink-0">{toolbar}</div>}

      <div
        className={cn(
          'flex-1 min-h-0',
          sidebar
            ? 'grid grid-cols-1 lg:grid-cols-[var(--wf-sidebar)_minmax(0,1fr)] gap-4'
            : 'flex flex-col'
        )}
        style={sidebar ? ({ '--wf-sidebar': sidebarWidth } as CSSProperties) : undefined}
      >
        {sidebar && (
          <aside className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
            {sidebar}
          </aside>
        )}
        <section
          className={cn(
            'min-h-0 overflow-y-auto',
            sidebar && 'rounded-lg border border-border bg-card shadow-sm'
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
