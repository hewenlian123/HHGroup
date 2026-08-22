import * as React from "react";

import { cn } from "@/lib/utils";
import { OS, TYPO } from "@/lib/typography";

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  action?: React.ReactNode;
  bodyClassName?: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
}

/** Canonical operational panel composition. */
export const Panel = React.forwardRef<HTMLElement, PanelProps>(
  ({ action, bodyClassName, children, className, description, eyebrow, title, ...props }, ref) => {
    const hasHeader = eyebrow || title || description || action;
    return (
      <section
        ref={ref}
        className={cn(OS.card, TYPO.body, "min-w-0 overflow-hidden", className)}
        {...props}
      >
        {hasHeader ? (
          <div className="flex flex-col gap-hh-2 border-b border-[var(--hh-border)] px-hh-4 py-hh-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              {eyebrow ? <p className={TYPO.sectionLabel}>{eyebrow}</p> : null}
              {title ? <h2 className={TYPO.panelTitle}>{title}</h2> : null}
              {description ? (
                <p className={cn("mt-hh-1 text-[var(--hh-text-secondary)]", TYPO.body)}>
                  {description}
                </p>
              ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : null}
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  }
);
Panel.displayName = "Panel";
