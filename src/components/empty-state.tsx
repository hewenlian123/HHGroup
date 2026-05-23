import * as React from "react";
import { OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "No data",
  description = "Nothing to display.",
  icon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(OS.emptyState, "px-4 py-10 text-center", className)}>
      {icon ? (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-secondary)]">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-[var(--neo-text-primary)]">{title}</p>
      <p className={cn("mx-auto mt-1 max-w-md", TYPO.mutedText)}>{description}</p>
      {action ? <div className="mt-4 flex items-center justify-center">{action}</div> : null}
    </div>
  );
}
