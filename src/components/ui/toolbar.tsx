import * as React from "react";

import { cn } from "@/lib/utils";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "actions" | "filters" | "plain";
}

export function Toolbar({ className, variant = "plain", ...props }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      className={cn(
        "flex min-w-0 flex-col gap-hh-2 sm:flex-row sm:flex-wrap sm:items-center",
        variant === "actions" &&
          "min-h-[var(--hh-row-height-standard)] justify-between border-b border-[var(--hh-border)] py-hh-2",
        variant === "filters" &&
          "items-stretch rounded-hh-panel border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-2 shadow-none sm:items-end sm:justify-between",
        className
      )}
      {...props}
    />
  );
}

export function ActionGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-hh-2", className)} {...props} />
  );
}
