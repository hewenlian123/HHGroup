"use client";

import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "success" | "warning" | "muted";

const dotColors: Record<StatusBadgeVariant, string> = {
  default: "bg-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  muted: "bg-muted-foreground",
};

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
}

/** Minimal status: dot + text. No pill background or heavy styling. */
export function StatusBadge({
  label,
  variant = "default",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-foreground",
        variant === "muted" && "text-muted-foreground",
        className
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColors[variant])}
        aria-hidden
      />
      {label}
    </span>
  );
}
