import { useId, type ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface FormSurfaceProps {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  className?: string;
  children: ReactNode;
  /** Internal: liga o título ao diálogo quando o surface é usado dentro de FormDialog. */
  titleId?: string;
  /** Internal: liga a descrição ao diálogo quando o surface é usado dentro de FormDialog. */
  descriptionId?: string;
}

export interface FormDialogProps extends FormSurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SURFACE_CLASS = 'flex h-full min-h-0 flex-col overflow-hidden border bg-background';
const HEADER_CLASS = 'flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4 pr-10';
const FOOTER_CLASS = 'shrink-0 border-t border-border bg-muted/20 px-6 py-3';
const DIALOG_CONTENT_CLASS = 'max-w-6xl w-[95vw] h-[90dvh] max-h-[90dvh] p-0 gap-0 flex flex-col overflow-hidden';

export function FormSurface({
  title,
  description,
  headerActions,
  footer,
  bodyClassName,
  className,
  children,
  titleId,
  descriptionId,
}: FormSurfaceProps) {
  return (
    <div className={cn(SURFACE_CLASS, className)}>
      <div className={HEADER_CLASS}>
        <div className="min-w-0 space-y-1.5 text-left">
          <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>

      <div className={cn('flex-1 min-h-0', footer && 'overflow-y-auto px-6 py-4', bodyClassName)}>{children}</div>

      {footer && <div className={FOOTER_CLASS}>{footer}</div>}
    </div>
  );
}

export function FormDialog({ open, onOpenChange, ...surfaceProps }: FormDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={DIALOG_CONTENT_CLASS}
        aria-labelledby={titleId}
        aria-describedby={surfaceProps.description ? descriptionId : undefined}
      >
        <FormSurface
          {...surfaceProps}
          className="border-0 bg-transparent"
          titleId={titleId}
          descriptionId={descriptionId}
        />
      </DialogContent>
    </Dialog>
  );
}
