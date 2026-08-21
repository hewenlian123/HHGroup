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
        "flex flex-col gap-hh-3 sm:flex-row sm:flex-wrap sm:items-center",
        variant === "actions" && "justify-between border-b border-[var(--hh-border)] pb-hh-3",
        variant === "filters" && "items-stretch sm:items-end sm:justify-between",
        className
      )}
      {...props}
    />
  );
}

export function ActionGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center gap-hh-2", className)} {...props} />;
}
